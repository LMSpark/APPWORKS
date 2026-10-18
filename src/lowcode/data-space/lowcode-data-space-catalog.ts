import {buildDataViewKey, resolveDataViewKey, RequestState, type DataSet, type DataView, type DataRow} from '@spark-appworks/spark-data'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import {loadLowcodeRuntimeScenario} from './lowcode-data-space-runtime'
import {openLowcodeDataSpaceDesignSession} from './lowcode-data-space-design'

type QueryResult = Parameters<NonNullable<DataView['validateQueryResult']>>[0]
type ReadAccess = (field: string) => string
const catalogFields = ['rowid', 'Name', 'Type', 'description', 'sysid', 'createuser', 'createtime']

function scalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value).trim()
  throw new Error('数据空间目录查询字段不是可呈现的标量值')
}

function association(row: Readonly<Record<string, unknown>>, read: ReadAccess): string {
  if (read('ROWID') !== 'visible' || read('rowid') !== 'visible') return ''
  const formal = Object.hasOwn(row, 'ROWID'), output = Object.hasOwn(row, 'rowid')
  if (formal && output && scalar(row['ROWID']) !== scalar(row['rowid'])) throw new Error('用户查询结果 ROWID 与 rowid 关联值冲突')
  return scalar(formal ? row['ROWID'] : output ? row['rowid'] : undefined)
}

function validate(result: QueryResult, keyField: string, fields: readonly string[]): void {
  if (!result.countReported) throw new Error('目录查询未返回服务端总数')
  const keys = new Set<string>()
  for (const row of result.rows) {
    const raw = row[keyField], key = result.rowKey(row)
    if (typeof raw !== 'string' || !raw.trim() || typeof key !== 'string' || key.trim() !== raw.trim() || keys.has(key.trim())) {
      throw new Error(`目录查询结果缺少唯一且匹配 ${keyField} 的正式主键`)
    }
    keys.add(key.trim())
    for (const field of fields) if (result.fieldAccess(key, field).read === 'visible') scalar(row[field])
  }
}

/** 正式目录DataSet的业务协调；查询、选择、过滤、分页和权限由原生DataView承载。 */
export class LowcodeDataSpaceCatalog {
  public readonly view: DataView
  public readonly apps: DataView
  public readonly users: DataView
  #disposed = false
  #revision = 0
  readonly #unsubscribe: () => void
  #edit: {id: string; mode: 'add' | 'edit'; status: 'editing' | 'saving' | 'unknown' | 'readback'; row: DataRow; revision: number} | undefined
  #bindings: DataView | undefined
  #ancestors: DataView | undefined
  #bindingTarget: DataRow | undefined
  #bindingRevision = 0

  private constructor(public readonly dataSet: DataSet, private readonly scopeToken: string) {
    const resolve = (model: string, name: string): DataView => {
      const view = resolveDataViewKey(buildDataViewKey(model, name, dataSet.scenarioId), dataSet)
      if (!view) throw new Error(`数据空间目录缺少正式视图 ${model}@${name}`)
      return view
    }
    this.view = resolve('Base_DataSet', 'catalog')
    this.apps = resolve('Base_AppSystemList', 'catalogApps')
    this.users = resolve('Base_UserInfo', 'catalogUsers')
    this.view.queryConfig = {...this.view.queryConfig, fields: catalogFields, allPages: false, autoQuery: false}
    this.apps.queryConfig = {...this.apps.queryConfig, fields: ['rowid', 'AppDesc', 'AppName'], allPages: true}
    this.users.queryConfig = {...this.users.queryConfig, fields: ['ID', 'ROWID', 'UserName'], allPages: true}
    this.view.autoSelectFirst = false
    this.view.autoCurrentFirst = false
    const userScope = this.users.filterExpression
    const onRequest = (state: RequestState): void => {
      if (state === RequestState.Preparing || state === RequestState.Loading) this.#revision++
    }
    this.view.events.on('requestStateChanged', onRequest)
    this.#unsubscribe = () => this.view.events.off('requestStateChanged', onRequest)
    this.apps.validateQueryResult = result => {this.assertCurrent(); validate(result, 'rowid', ['AppDesc', 'AppName'])}
    this.users.validateQueryResult = result => {
      this.assertCurrent(); validate(result, 'ID', ['UserName'])
      for (const row of result.rows) association(row, field => result.fieldAccess(result.rowKey(row), field).read)
    }
    this.view.validateQueryResult = async result => {
      this.assertCurrent(); validate(result, 'rowid', catalogFields)
      const revision = this.#revision
      const ids = [...new Set(result.rows.flatMap(row => result.fieldAccess(result.rowKey(row), 'createuser').read === 'visible'
        ? [scalar(row['createuser'])].filter(Boolean) : []))]
      if (ids.length) {
        const filter = {field: 'ROWID', operator: 'in' as const, value: ids}
        await this.users.executeFilter(userScope ? {logic: 'and', filters: [userScope, filter]} : filter)
        this.assertCurrent()
        if (revision !== this.#revision) throw new Error('数据空间目录查询已过期')
        if (this.users.loadingError) throw this.users.loadingError
      }
    }
  }

  /** 只读正式场景文件和模型装配；不以URL业务参数或打包配置代替导航的场景身份。 */
  public static async load(command: Readonly<{projectId: string; scenarioId: string}>): Promise<LowcodeDataSpaceCatalog> {
    if (!command.scenarioId.trim()) throw new Error('数据空间目录缺少正式蓝图场景')
    const scope = lowcodeApi.readRequestScope()
    if (scope.headers['X-AppId'] !== command.projectId) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 目录所属应用已失效')
    const dataSet = await loadLowcodeRuntimeScenario(command)
    try {
      if (scope.token !== lowcodeApi.readRequestScope().token) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 目录执行域已变化')
      return new LowcodeDataSpaceCatalog(dataSet, scope.token)
    } catch (error) {dataSet.destroy(); throw error}
  }

  public async initialize(): Promise<void> {await Promise.all([this.view.refresh(), this.apps.refresh()])}

  /** 弹窗只持有操作身份；全部字段草稿仍在目录DataView。 */
  public get editing() {return this.#edit ? {id: this.#edit.id, mode: this.#edit.mode, status: this.#edit.status} : undefined}
  private row(id: string): DataRow | undefined {return this.view.rows.find(row => this.view.getPkKey(row) === id)}
  /** 新增继续消费正式查询的表级授权，不能由页面身份放行。 */
  public canCreate(): boolean {return this.idle() && this.view.addActionState() === 'enabled'}
  /** 编辑只维护名称和描述，至少一个字段可写才提供入口。 */
  public canEdit(): boolean {
    const id = this.designTarget(), row = id ? this.row(id) : undefined
    return this.idle() && !!row && this.view.editActionState(row) === 'enabled'
      && ['Name', 'description'].some(field => this.view.fieldAccess(row, field).write === 'allowed')
  }
  private idle(): boolean {return this.isCurrent() && !this.#edit && !this.view.mutating && this.view.requestState === RequestState.Loaded
    && !this.view.loadingError && !this.view.hasEditingChanges() && !this.view.dirtyTracking.hasPendingChanges()}
  private editRow(): DataRow {
    this.assertCurrent()
    const edit = this.#edit
    if (edit?.revision !== this.#revision || this.view.currentRow !== edit.row || !this.view.rows.includes(edit.row)) throw new Error('目录编辑目标或查询已变化')
    return edit.row
  }
  /** 新增行由原查询准备正式主键；临时空字段只在编辑域，保存时校验。 */
  public async beginCreate(): Promise<void> {
    if (!this.canCreate()) throw new Error('当前不能新增数据空间')
    if (this.view.commitMode !== 'staged') throw new Error('目录视图必须配置暂存提交')
    const revision = this.#revision
    const row = await this.view.addRow({Name: '', description: '', Type: 'datasource', sysid: ''})
    this.assertCurrent()
    if (revision !== this.#revision || !('rowid' in row) || typeof row['rowid'] !== 'string') throw new Error('新增目录行的查询或身份已变化')
    const id = row['rowid'], current = this.row(id)
    if (!current) throw new Error('新增目录行未进入原视图')
    this.view.setCurrentRowById(id); this.view.setSelectedRows([current])
    this.#edit = {id, mode: 'add', status: 'editing', row: current, revision}
  }
  /** 在当前正式行打开编辑，不复制modelValue或另建表单数据。 */
  public beginEdit(): void {
    if (!this.canEdit()) throw new Error('当前不能编辑此数据空间')
    if (this.view.commitMode !== 'staged') throw new Error('目录视图必须配置暂存提交')
    const id = this.designTarget(), row = this.row(id)
    if (!row) throw new Error('目录编辑目标已变化')
    this.view.setCurrentRowById(id)
    this.#edit = {id, mode: 'edit', status: 'editing', row, revision: this.#revision}
  }
  /** 取消只丢弃本条未提交修改；未确认保存不能伪装成服务器回滚。 */
  public cancelEdit(): void {
    const edit = this.#edit
    if (edit?.status !== 'editing') throw new Error('请先核验未确认的保存结果')
    this.editRow(); this.view.discardPendingChanges([edit.id]); this.#edit = undefined
  }
  /** 仅保存当前空间记录；DataSet处理编辑覆盖、权限、批次及真实回执。 */
  public async saveEdit(): Promise<void> {
    const edit = this.#edit
    if (edit?.status !== 'editing') throw new Error('当前编辑不能重复提交')
    const row = this.editRow()
    const allowed = edit.mode === 'add' ? ['Name', 'description', 'sysid'] : ['Name', 'description']
    const patch = this.view.getEditingPatch(edit.id) ?? {}, value = this.view.getEditingRow(edit.id)
    if (!value) throw new Error('目录编辑记录已失效')
    if (Object.keys(patch).some(field => !allowed.includes(field))) throw new Error('目录保存包含不允许修改的字段')
    if (edit.mode === 'add' ? this.view.addActionState() !== 'enabled' : this.view.editActionState(row) !== 'enabled') throw new Error('数据空间保存权限已变化')
    for (const field of allowed) {
      if (edit.mode !== 'add' && !Object.hasOwn(patch, field)) continue
      if (this.view.fieldAccess(row, field).write !== 'allowed') throw new Error(`字段 ${field} 不允许修改`)
      const input = value[field]
      if (typeof input !== 'string') throw new Error(`字段 ${field} 必须是文本`)
      const text = input.trim()
      if ((field === 'Name' || field === 'sysid') && !text) throw new Error(field === 'Name' ? '请输入名称' : '请选择应用系统')
      if (text.length > (field === 'Name' ? 100 : field === 'description' ? 500 : 256)) throw new Error(`字段 ${field} 超过长度限制`)
      if (text !== input) this.view.updateEditingValue(edit.id, field, text)
    }
    if (edit.mode === 'add' && (this.apps.requestState !== RequestState.Loaded || !this.apps.rows.some(app =>
      this.apps.fieldAccess(app, 'rowid').read === 'visible' && app['rowid'] === this.view.getEditingRow(edit.id)?.['sysid']))) throw new Error('所属应用不在当前可读候选项中')
    if (edit.mode === 'edit' && !this.view.hasEditingChanges(edit.id)) {this.#edit = undefined; return}
    edit.status = 'saving'
    try {
      const result = await this.dataSet.saveChanges({views: [{tableName: this.view.tableName, viewId: this.view.viewId, ids: [edit.id]}]})
      this.assertCurrent()
      const receipt = result.data?.viewResults
      if (!result.success || receipt?.length !== 1 || receipt[0]?.failedCount || receipt[0]?.failedEditingRows
        || receipt[0]?.[edit.mode === 'add' ? 'createdCount' : 'savedCount'] !== 1) throw new Error('目录保存回执未确认目标成功')
      edit.status = 'readback'
      await this.view.refresh(); this.assertCurrent()
      if (this.view.loadingError) throw this.view.loadingError
      this.#edit = undefined
    } catch (cause) {if (edit.status === 'saving') edit.status = 'unknown'; throw cause}
  }
  /** 用户明确放弃本地状态后只重查，不重放未知写入，也不宣称原保存成功。 */
  public async reloadEdit(): Promise<void> {
    this.assertCurrent()
    const edit = this.#edit
    if (!edit || edit.status === 'saving') throw new Error('当前不能核验目录保存')
    this.view.discardPendingChanges([edit.id]); edit.status = 'readback'
    await this.view.refresh(); this.assertCurrent()
    if (this.view.loadingError) throw this.view.loadingError
    this.#edit = undefined
  }

  /** 绑定结果视图与祖先目录分别持有原查询结果，不构造页面数据数组。 */
  public get bindings(): DataView | undefined {return this.#bindings}
  /** 关闭或切换目标使在途绑定查询失效并释放两个派生视图。 */
  public closeBindings(): void {
    this.#bindingRevision++; this.#bindingTarget = undefined
    for (const view of [this.#bindings, this.#ancestors]) view?.dataTable?.destroyView(view.viewId)
    this.#bindings = undefined; this.#ancestors = undefined
  }
  /** 查询当前行所属应用的导航绑定和完整祖先，保留原视图范围过滤。 */
  public async queryBindings(): Promise<void> {
    const id = this.designTarget(), row = this.row(id)
    if (!this.idle() || !row || this.view.fieldAccess(row, 'sysid').read !== 'visible' || !scalar(row['sysid'])) throw new Error('绑定查询缺少当前可读的数据空间及应用身份')
    const source = this.dataSet.getView('Base_NavigationInfo')
    if (!source) throw new Error('正式目录场景未配置导航模型')
    this.closeBindings(); const revision = this.#bindingRevision; this.#bindingTarget = row
    try {
      const bound = this.#bindings = source.createQueryView('catalogBindings'), ancestors = this.#ancestors = source.createQueryView('catalogBindingAncestors')
      const current = () => {this.assertCurrent(); if (revision !== this.#bindingRevision || this.designTarget() !== id || this.row(id) !== row) throw new Error('绑定查询目标已变化')}
      const fields = ['rowid', 'SysId', 'conid', 'prowid', 'FunName', 'name', 'NavigationUrl']
      for (const view of [bound, ancestors]) {
        view.autoLoad = false; view.queryConfig = {...view.queryConfig, fields, allPages: true, maxRows: 50000, autoQuery: false}
        view.validateQueryResult = result => {
          current(); validate(result, 'rowid', fields)
          for (const node of result.rows) if (fields.some(field => result.fieldAccess(result.rowKey(node), field).read !== 'visible')
            || node['SysId'] !== row['sysid'] || !Object.hasOwn(node, 'conid') || !Object.hasOwn(node, 'prowid')) throw new Error('导航绑定身份、归属或读取权限不完整')
        }
      }
      const appFilter = {field: 'SysId', operator: 'eq' as const, value: scalar(row['sysid'])}
      const scope = source.filterExpression
      ancestors.filterExpression = scope ? {logic: 'and', filters: [scope, appFilter]} : appFilter
      bound.filterExpression = {logic: 'and', filters: [...(scope ? [scope] : []), appFilter, {field: 'conid', operator: 'eq', value: id}]}
      await bound.refresh(); current()
      if (bound.loadingError) throw bound.loadingError
      if (bound.rows.some(node => node['conid'] !== id)) throw new Error('导航结果不属于当前数据空间')
      if (bound.rows.length) {
        await ancestors.refresh(); current()
        if (ancestors.loadingError) throw ancestors.loadingError
        for (const node of bound.rows) this.bindingPath(node['rowid'])
      }
    } catch (cause) {if (revision === this.#bindingRevision) this.closeBindings(); throw cause}
  }
  /** 从原祖先视图呈现完整路径；缺节点或循环不能伪装成完整路径。 */
  public bindingPath(value: unknown): string {
    this.assertCurrent()
    if (!this.#bindingTarget || this.row(this.designTarget()) !== this.#bindingTarget || !this.#bindings?.rows.some(row => row['rowid'] === value)) throw new Error('绑定结果已失效')
    const ancestors = this.#ancestors
    if (!ancestors) throw new Error('绑定结果已失效')
    const labels: string[] = [], seen = new Set<string>(); let id = scalar(value)
    while (id && id !== '000000') {
      const row = ancestors.rows.find(node => node['rowid'] === id)
      if (!row || seen.has(id)) throw new Error('蓝图父节点缺失或父链循环')
      if (['rowid', 'SysId', 'prowid', 'FunName', 'name'].some(field => ancestors.fieldAccess(row, field).read !== 'visible')) throw new Error('蓝图路径读取权限已变化')
      seen.add(id); labels.unshift(scalar(row['FunName']) || scalar(row['name']) || id); id = scalar(row['prowid'])
    }
    return labels.join(' / ')
  }
  /** 复用设计器的正式模型资料生成链，始终释放临时设计会话。 */
  public async readApiInfo(): Promise<string> {
    const id = this.designTarget(), row = this.row(id)
    if (!this.idle() || !row) throw new Error('请先选择当前可读的数据空间')
    const session = await openLowcodeDataSpaceDesignSession(id)
    try {
      this.assertCurrent(); await session.loadMetadataViews(['Base_DataModel_Field'])
      const content = await session.readApiInfo()
      this.assertCurrent(); if (this.row(this.designTarget()) !== row) throw new Error('复制API目标已变化')
      return content
    } finally {session.dispose()}
  }

  private creator(value: unknown): {label: string; unresolved: boolean} {
    const id = scalar(value)
    if (!id) return {label: '-', unresolved: false}
    if (!this.isCurrent() || this.users.requestState !== RequestState.Loaded) return {label: '未解析用户', unresolved: true}
    const matches = this.users.rows.filter(row => association(row, field => this.users.fieldAccess(row, field).read) === id)
    const row = matches.length === 1 ? matches[0] : undefined
    if (!row) return {label: '未解析用户', unresolved: true}
    const access = this.users.fieldAccess(row, 'UserName').read
    if (access === 'masked') return {label: '••••', unresolved: false}
    if (access !== 'visible') return {label: '', unresolved: false}
    const label = scalar(row['UserName'])
    return {label: label || '未解析用户', unresolved: !label}
  }

  /** 只用于已通过源字段权限检查的显示；原创建人字段和用户目录记录不改写。 */
  public creatorLabel(value: unknown): string {return this.creator(value).label}
  public get unresolvedCreatorCount(): number {
    if (!this.isCurrent() || this.view.requestState !== RequestState.Loaded) return 0
    const ids = new Set(this.view.rows.flatMap(row => this.view.fieldAccess(row, 'createuser').read === 'visible'
      ? [scalar(row['createuser'])].filter(Boolean) : []))
    return [...ids].filter(id => this.creator(id).unresolved).length
  }

  /** 应用名称同样消费选项视图的字段权限；不可读的目录不泄露原关联标识。 */
  public applicationLabel(value: unknown): string {
    const id = scalar(value)
    if (!id) return '-'
    if (!this.isCurrent() || this.apps.requestState !== RequestState.Loaded) return ''
    const row = this.apps.rows.find(candidate => this.apps.fieldAccess(candidate, 'rowid').read === 'visible' && candidate['rowid'] === id)
    if (!row) return '未解析应用'
    for (const field of ['AppDesc', 'AppName']) {
      const access = this.apps.fieldAccess(row, field).read
      if (access === 'masked') return '••••'
      if (access === 'visible' && scalar(row[field])) return scalar(row[field])
    }
    return id
  }

  /** 导航只接受本次成功查询的可读正式行身份，不接受旧选择或外部拼造的行。 */
  public designTarget(row?: DataRow): string {
    if (!this.isCurrent() || this.view.requestState !== RequestState.Loaded || this.view.loadingError) return ''
    const selected = row ?? (this.view.selectedRows.length === 1 ? this.view.selectedRows[0] : undefined)
    if (!selected || !this.view.rows.includes(selected) || this.view.fieldAccess(selected, 'rowid').read !== 'visible') return ''
    const id = selected['rowid']
    return typeof id === 'string' && id.trim() && this.view.getPkKey(selected) === id ? id : ''
  }

  private assertCurrent(): void {if (!this.isCurrent()) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 数据空间目录执行域已变化')}
  public isCurrent(): boolean {
    try {return !this.#disposed && lowcodeApi.readRequestScope().token === this.scopeToken} catch {return false}
  }
  public dispose(): void {this.#disposed = true; this.closeBindings(); this.#unsubscribe(); this.dataSet.destroy()}
}
