/**
 * @module app:views/features/application/application-manager/model/application-manager-model
 * 职责：应用系统的新增、编辑、删除在 0C70 正式 DataView 上的编排：主表、默认数据库关联、负责人关系及导航根。
 * 边界：值与待提交状态只在原 DataView；新增先确认主表再写依附记录，删除先删依附记录再删主表；分阶段非事务，按阶段如实回报。
 * 负责人 RoleIdField/CategoryID 来自视图常驻范围（pagedata），只是数据值，不作任何前端权限判断。
 */
import type {DataRow, DataSet, DataView} from '@spark-appworks/spark-data'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'

export const APPLICATION_MANAGER_SCENARIO = '0C70F74793F9E858B71E0DBDEC784D57'
export const DATABASE_RELATIONS_SCENARIO = '93DF05182084B1F0E8DA7283E83BBE0C'
export const PERSON_SCENARIO = 'FB291E325272007AEED8921C28B93CFD'
/** 参考页只允许删除“停用”状态（AppType=6）的应用。 */
export const APPLICATION_DELETABLE_STATUS = '6'
const MAIN = 'Base_AppSystemList', RELATION = 'Base_AppAndSource_Relation', OWNER = 'Base_MainBody_RoleUser', NAVIGATION = 'Base_NavigationInfo'
const FLAGS = ['IsProjectRelation', 'isSass', 'isWeChat'] as const

/** 一次保存的结果；created 时 mainSaved 表示主表已确认、依附记录仍可在同一弹窗再次保存补写。 */
export type ApplicationManagerSaveOutcome = Readonly<{success: boolean; mainSaved: boolean; message: string}>

export function readText(row: Readonly<DataRow> | null | undefined, field: string): string {
  const raw = row?.[field]
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
}

function failure(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function requireView(dataSet: DataSet, table: string, viewId = 'default'): DataView {
  const found = dataSet.getView(table, viewId)
  if (!found) throw new Error(`应用管理缺少正式视图 ${table}@${viewId}`)
  return found
}

function assertIdle(views: readonly DataView[]): void {
  if (views.some(view => view.hasUnconfirmedSave)) throw new Error('上一次保存结果尚未确认，请刷新页面核验后再操作')
  for (const view of views) if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) view.discardPendingChanges()
}

async function loadFor(view: DataView, appId: string): Promise<void> {
  view.queryContext = {...view.queryContext, appId}
  await view.refresh()
  if (view.loadingError) throw view.loadingError
}

const NUMERIC_TYPES = new Set(['number', 'int', 'integer', 'tinyint', 'smallint', 'bigint', 'decimal', 'float', 'double'])
/** 开关与数值常量按正式列类型写入：数值列写数字、布尔列写布尔，其余写数字字符串。 */
function typedNumber(view: DataView, field: string, value: number): number | boolean | string {
  const type = view.getColumn(field)?.type.toLowerCase() ?? ''
  if (NUMERIC_TYPES.has(type)) return value
  if (type === 'boolean' || type === 'bool') return value !== 0
  return String(value)
}
function typedNumbers(view: DataView, values: Readonly<Record<string, number>>): Record<string, number | boolean | string> {
  return Object.fromEntries(Object.entries(values).map(([field, value]) => [field, typedNumber(view, field, value)]))
}

function rowId(view: DataView, row: DataRow): string | number {
  const id = view.getPkKey(row)
  if (id === undefined || id === '') throw new Error(`${view.tableName} 新增记录缺少正式行身份`)
  return id
}

/** 与原查询 owner 生成新主键相同的 32 位大写十六进制；先定身份，主表与依附视图共用同一 appId 查询。 */
function newApplicationId(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

function formatNow(): string {
  const now = new Date(), pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

/** 新增主表时由会话提供创建人与企业身份，缺失即失败，不猜默认值。 */
function readCreatorSession(): Readonly<{userId: string; entId: string}> {
  const session = lowcodeApi.session.get()
  const userId = session?.identity.userId.trim() ?? ''
  const entId = (session?.enterprise.id ?? session?.identity.enterpriseId ?? '').trim()
  if (!userId || !entId) throw new Error('当前会话缺少用户或企业身份，无法新增应用系统')
  return {userId, entId}
}

/** 站点运行地址只接受规范化站点路径：以单个“/”开头，无反斜线、控制字符、查询、片段或点段，各段按 URI 编码规范化。 */
export function normalizeApplicationWebPath(raw: string): string {
  const value = raw.trim()
  if (!value) throw new Error('请输入规范化站点运行路径')
  if (/[\u0000-\u001f\u007f\\?#]/.test(value) || !value.startsWith('/') || value.startsWith('//')) {
    throw new Error('站点运行地址必须是以“/”开头的站点路径，不含反斜线、查询或片段')
  }
  return value.split('/').map(segment => {
    if (!segment) return segment
    let decoded = segment
    try { decoded = decodeURIComponent(segment) } catch { decoded = segment }
    if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) throw new Error('站点运行地址不得包含点段或反斜线')
    return encodeURIComponent(decoded)
  }).join('/')
}

/** 打开应用链接只消费已获准读取的 WebUrl，限 HTTP(S) 且不允许内嵌凭据。 */
export function resolveApplicationWebUrl(row: Readonly<DataRow>, view: DataView): string {
  if (!view.getColumn('WebUrl') || !Object.hasOwn(row, 'WebUrl') || view.fieldAccess(row, 'WebUrl').read !== 'visible') {
    throw new Error('WebUrl字段当前无可读权限')
  }
  const value = row['WebUrl']
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value.trim())) throw new Error('WebUrl为空或包含无效字符')
  const url = new URL(value.trim(), window.location.origin)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('WebUrl只允许HTTP(S)地址')
  if (url.username || url.password) throw new Error('WebUrl不允许内嵌凭据')
  return url.href
}

/** 行身份可读时返回应用 ID，否则为空串。 */
export function readApplicationId(row: Readonly<DataRow> | null | undefined, view: DataView | null | undefined): string {
  if (!row || !view?.getColumn('rowid') || !Object.hasOwn(row, 'rowid') || view.fieldAccess(row, 'rowid').read !== 'visible') return ''
  return readText(row, 'rowid')
}

type ApplicationManagerRecordState = Readonly<{dataSet: DataSet; appId: string; created: boolean; ownerId?: string | number}>

/**
 * 一次新增或编辑弹窗的记录编排；值都写在原视图（主表编辑覆盖、依附视图待新增行），本对象只记行身份。
 * 新增：先定 appId，各视图以 appId 查询建立原查询身份；主表按该身份新增，依附视图新增时由常驻范围给出归属默认值。
 * 负责人视图当前行指向本记录的负责人行，表单中的负责人字段经该视图当前行读写。
 */
export class ApplicationManagerRecord {
  readonly dataSet: DataSet
  readonly appId: string
  readonly created: boolean
  readonly ownerId: string | number | undefined
  private relationId: string | number | undefined
  private rootAdded = false
  private mainConfirmed = false

  private constructor(state: ApplicationManagerRecordState) {
    this.dataSet = state.dataSet
    this.appId = state.appId
    this.created = state.created
    this.ownerId = state.ownerId
  }

  get main(): DataView { return requireView(this.dataSet, MAIN, 'form') }
  get relation(): DataView { return requireView(this.dataSet, RELATION) }
  get owner(): DataView { return requireView(this.dataSet, OWNER) }
  get root(): DataView { return requireView(this.dataSet, NAVIGATION) }

  static async openCreate(dataSet: DataSet, appType: string): Promise<ApplicationManagerRecord> {
    const main = requireView(dataSet, MAIN, 'form'), relation = requireView(dataSet, RELATION)
    const owner = requireView(dataSet, OWNER), root = requireView(dataSet, NAVIGATION)
    assertIdle([main, relation, owner, root])
    const {userId, entId} = readCreatorSession(), appId = newApplicationId()
    await Promise.all([loadFor(main, appId), loadFor(relation, appId), loadFor(owner, appId), loadFor(root, appId)])
    if (main.addActionState() !== 'enabled') throw new Error('当前无新增应用系统的权限')
    await main.addRowWithIdentity({field: 'rowid', value: appId}, {AppType: appType, CreateUser: userId, EntId: entId,
      ...typedNumbers(main, {isdel: 0, IsSys: 1, IsProjectRelation: 0, isSass: 0, isWeChat: 0})})
    try {
      if (owner.addActionState() !== 'enabled') throw new Error('当前无新增负责人关系的权限')
      const ownerId = rowId(owner, await owner.addRow({sysId: appId}))
      owner.setCurrentRowById(ownerId)
      return new ApplicationManagerRecord({dataSet, appId, created: true, ownerId})
    } catch (cause) {
      for (const view of [owner, main]) if (view.dirtyTracking.hasPendingChanges() && !view.hasUnconfirmedSave) view.discardPendingChanges()
      throw cause
    }
  }

  static async openEdit(dataSet: DataSet, appId: string): Promise<ApplicationManagerRecord> {
    const main = requireView(dataSet, MAIN, 'form'), relation = requireView(dataSet, RELATION), owner = requireView(dataSet, OWNER)
    assertIdle([main, relation, owner])
    await Promise.all([loadFor(main, appId), loadFor(relation, appId), loadFor(owner, appId)])
    const row = main.rows.find(item => String(main.getPkKey(item)) === appId)
    if (!row) throw new Error('未读取到该应用系统，请刷新列表')
    if (main.editActionState(row) !== 'enabled') throw new Error('当前无编辑该应用系统的权限')
    const existing = owner.rows[0]
    let ownerId = existing ? owner.getPkKey(existing) : undefined
    if (ownerId === undefined && owner.addActionState() === 'enabled') ownerId = rowId(owner, await owner.addRow({sysId: appId}))
    if (ownerId !== undefined) owner.setCurrentRowById(ownerId)
    return new ApplicationManagerRecord({dataSet, appId, created: false, ...(ownerId === undefined ? {} : {ownerId})})
  }

  /** 默认数据库关联的当前（编辑覆盖）行；编辑时只读展示原关联。 */
  get defaultDatabase(): Readonly<DataRow> | undefined {
    if (this.relationId !== undefined) return this.relation.getEditingRow(this.relationId) ?? undefined
    return this.created ? undefined : this.relation.rows[0]
  }

  get databaseSummary(): string {
    const row = this.defaultDatabase, name = readText(row, 'conName'), remark = readText(row, 'cnName')
    return name && remark ? `${name} / ${remark}` : name
  }

  /** 新增时把所选数据库写入同一待新增关联行（isRef=0、type、sysid 由常驻范围给出）。 */
  async chooseDatabase(database: Readonly<DataRow>): Promise<void> {
    if (!this.created) throw new Error('编辑时默认数据库不可修改')
    const values = {conid: readText(database, 'Id'), conName: readText(database, 'Name'), cnName: readText(database, 'Remark')}
    if (!values.conid) throw new Error('所选数据库缺少身份')
    const relation = this.relation
    if (this.relationId === undefined) {
      if (relation.addActionState() !== 'enabled') throw new Error('当前无新增数据库关联的权限')
      this.relationId = rowId(relation, await relation.addRow(values))
      return
    }
    for (const [field, value] of Object.entries(values)) relation.updateEditingValue(this.relationId, field, value)
  }

  private validate(): string {
    const main = this.main, row = main.getEditingRow(this.appId)
    if (!readText(row, 'AppName')) return '请输入应用系统名称'
    if (!readText(row, 'AppDesc')) return '请输入应用系统简称'
    if (this.ownerId === undefined || !readText(this.owner.getEditingRow(this.ownerId), 'UserIdField')) return '请选择负责人'
    if (!readText(row, 'AppType')) return '请选择应用系统状态'
    if (this.created && !readText(this.defaultDatabase, 'conid')) return '请选择默认数据库'
    const raw = readText(row, 'WebUrl')
    if (raw || this.created) {
      const normalized = normalizeApplicationWebPath(raw)
      if (normalized !== raw) main.updateEditingValue(this.appId, 'WebUrl', normalized)
    }
    for (const field of FLAGS) {
      const value = row?.[field]
      if (typeof value === 'boolean') main.updateEditingValue(this.appId, field, typedNumber(main, field, value ? 1 : 0))
    }
    return ''
  }

  /** 新增时按参考结构根形态写导航根（rowid 即应用 ID）；实服未输出的字段不写，登记在台账。 */
  private async stageNavigationRoot(): Promise<void> {
    const row = this.main.getEditingRow(this.appId), title = readText(row, 'AppDesc'), root = this.root
    const values = {FunName: title, caption: title, NavCsrName: title, name: readText(row, 'AppName'), memo: readText(row, 'Memo') || title}
    if (this.rootAdded) {
      for (const [field, value] of Object.entries(values)) root.updateEditingValue(this.appId, field, value)
      return
    }
    if (root.addActionState() !== 'enabled') throw new Error('当前无新增导航根的权限')
    await root.addRowWithIdentity({field: 'rowid', value: this.appId}, {...values, modid: this.appId, funCode: this.appId, FromId: this.appId,
      conid: '', conType: 'Model', NavigationUrl: '', MobileUrl: '',
      ...typedNumbers(root, {IsShowAtNav: 1, NavigationOrderValue: 0, NavigationShowType: 0, NavigationType: 0})})
    this.rootAdded = true
  }

  async save(): Promise<ApplicationManagerSaveOutcome> {
    let problem = ''
    try { problem = this.validate() } catch (cause) { problem = failure(cause) }
    if (problem) return {success: false, mainSaved: this.mainConfirmed, message: problem}
    const main = this.main, owner = this.owner
    const ownerTarget = this.ownerId === undefined ? [] : [{tableName: owner.tableName, viewId: owner.viewId, ids: [this.ownerId]}]
    const mainTarget = {tableName: main.tableName, viewId: main.viewId, ids: [this.appId]}
    try {
      if (!this.created) {
        const result = await this.dataSet.saveChangesInPhases([{views: [mainTarget, ...ownerTarget]}])
        return {success: result.success, mainSaved: result.success,
          message: result.success ? '保存成功' : `保存未确认：${result.results.at(-1)?.error?.message ?? '请刷新核验'}`}
      }
      if (!this.mainConfirmed) main.updateEditingValue(this.appId, 'CreateTime', formatNow())
      await this.stageNavigationRoot()
      const relation = this.relation, root = this.root
      const relationTarget = this.relationId === undefined ? [] : [{tableName: relation.tableName, viewId: relation.viewId, ids: [this.relationId]}]
      const result = await this.dataSet.saveChangesInPhases([{views: [mainTarget]}, {views: [
        ...relationTarget, ...ownerTarget, {tableName: root.tableName, viewId: root.viewId, ids: [this.appId]}]}])
      if (result.completedPhases >= 1) this.mainConfirmed = true
      if (result.success) return {success: true, mainSaved: true, message: '新增成功'}
      const reason = result.results.at(-1)?.error?.message ?? '结果未确认，请刷新核验'
      return this.mainConfirmed
        ? {success: false, mainSaved: true, message: `应用系统已创建，默认数据库、负责人或导航根未写入：${reason}；可再次保存补写`}
        : {success: false, mainSaved: false, message: `新增未完成：${reason}`}
    } catch (cause) {
      if (this.created && !main.hasUnconfirmedSave && !main.dirtyTracking.hasPendingChanges()) this.mainConfirmed = true
      if (!this.created || !this.mainConfirmed) return {success: false, mainSaved: this.mainConfirmed, message: failure(cause)}
      const unknown = [this.relation, owner, this.root].some(view => view.hasUnconfirmedSave)
      return {success: false, mainSaved: true, message: unknown
        ? `应用系统已创建，默认数据库、负责人或导航根保存结果未确认：${failure(cause)}；请刷新列表核验后再操作`
        : `应用系统已创建，默认数据库、负责人或导航根未写入：${failure(cause)}；可再次保存补写`}
    }
  }

  /** 放弃本窗未提交的修改；已确认的主表不回滚，未确认保存原样保留由原保存入口核验。 */
  cancel(): void {
    const views = [this.relation, this.owner, this.root, this.main]
    if (views.some(view => view.hasUnconfirmedSave || view.mutating)) return
    if (!this.created) {
      this.main.discardEditingRows([this.appId])
      if (this.ownerId !== undefined) this.owner.discardPendingChanges([this.ownerId])
      return
    }
    for (const view of views.slice(0, 3)) if (view.dirtyTracking.hasPendingChanges() || view.hasEditingChanges()) view.discardPendingChanges()
    if (!this.mainConfirmed) this.main.discardPendingChanges([this.appId])
  }
}

/**
 * 删除停用应用：项目蓝图下仍有节点则拒绝；先删负责人关系、全部数据库关联和导航根，再删主表。
 * 返回提示文本；分阶段非事务，第一阶段完成后主表失败会如实说明。
 */
export async function deleteApplication(dataSet: DataSet, row: Readonly<DataRow>): Promise<string> {
  const list = requireView(dataSet, MAIN), appId = readApplicationId(row, list)
  if (!appId) throw new Error('应用系统缺少可读的身份')
  if (readText(row, 'AppType') !== APPLICATION_DELETABLE_STATUS) throw new Error('仅“停用”状态的应用系统可删除')
  if (list.deleteActionState(row) !== 'enabled') throw new Error('当前无删除该应用系统的权限')
  const main = requireView(dataSet, MAIN, 'form'), children = requireView(dataSet, NAVIGATION, 'children')
  const cleanup = requireView(dataSet, RELATION, 'cleanup'), owner = requireView(dataSet, OWNER), root = requireView(dataSet, NAVIGATION)
  assertIdle([main, cleanup, owner, root])
  await Promise.all([loadFor(main, appId), loadFor(children, appId), loadFor(cleanup, appId), loadFor(owner, appId), loadFor(root, appId)])
  const target = main.rows.find(item => String(main.getPkKey(item)) === appId)
  if (!target || readText(target, 'AppType') !== APPLICATION_DELETABLE_STATUS || main.deleteActionState(target) !== 'enabled') {
    throw new Error('应用系统状态已变化或不可删除，请刷新列表')
  }
  if (children.rows.length > 0 || children.total > 0) throw new Error('该应用的项目蓝图下仍有节点，不能删除')
  const companions = [owner, cleanup, root].map(view => ({view, ids: view.rows.map(item => rowId(view, item))}))
  for (const {view} of companions) if (view.rows.some(item => view.deleteActionState(item) !== 'enabled')) throw new Error(`当前无删除 ${view.tableName} 关联记录的权限`)
  for (const {view, ids} of companions) for (const id of ids) await view.removeRow(id)
  await main.removeRow(appId)
  const firstPhase = companions.filter(item => item.ids.length > 0).map(({view, ids}) => ({tableName: view.tableName, viewId: view.viewId, ids}))
  const mainPhase = {views: [{tableName: main.tableName, viewId: main.viewId, ids: [appId]}]}
  const result = await dataSet.saveChangesInPhases(firstPhase.length ? [{views: firstPhase}, mainPhase] : [mainPhase])
  if (result.success) return '删除成功'
  const reason = result.results.at(-1)?.error?.message ?? '结果未确认，请刷新核验'
  for (const view of [main, ...companions.map(item => item.view)]) {
    if (!view.hasUnconfirmedSave && view.dirtyTracking.hasPendingChanges()) view.discardPendingChanges()
  }
  throw new Error(firstPhase.length && result.completedPhases >= 1 ? `关联记录已删除，应用主记录删除未完成：${reason}` : `删除未完成，应用仍保留：${reason}`)
}
