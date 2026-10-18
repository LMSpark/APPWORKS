/**
 * @module app:lowcode/data-space/model-source/lowcode-data-space-model-edit
 * 职责：维护正式模型的描述、主键、业务标志和数组数据，经原元数据视图提交并接纳数据层回执。
 * 边界：主键联动正式字段标记，不改注册名或来源；不复制真源，未知提交只核验。
 * AI用途：原生设计页的模型配置入口，复用DataSet权限、编辑覆盖及签名保存。
 */
import {RequestState, type DataColumn, type DataRow, type DataSet, type DataView, type DataViewFilterTree} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {LowcodeDataSpacePrimaryKey} from './primary-key/lowcode-data-space-primary-key'
import type {LowcodeDataSpaceFieldRemove} from './removal/lowcode-data-space-field-remove'
import {LowcodeDataSpaceFieldEdit} from './lowcode-data-space-field-edit'
import {LowcodeDataSpaceSourceInputEdit} from './lowcode-data-space-source-input-edit'
import {DataSpaceDefinitionSave, type DataSpaceDefinitionSavePart} from './save/data-space-definition-save'

/** 单个正式模型的配置编辑流程；原DataView仍是数据和授权的唯一持有者。 */
export class LowcodeDataSpaceModelEdit {
  private static readonly fields: ReadonlyArray<{name: string; label: string; kind: 'text' | 'select' | 'json'; choices?: ReadonlyArray<readonly [string, string | number]>}> = [
    {name: 'description', label: '模型说明', kind: 'text'},
    {name: 'items', label: '数组数据', kind: 'json'},
    {name: 'PrimaryKeyFields', label: '正式主键字段', kind: 'select'},
    {name: 'IsBusiness', label: '业务模型', kind: 'select', choices: [['否', 0], ['是', 1]]},
    {name: 'IsBusinessMain', label: '业务主模型', kind: 'select', choices: [['否', 0], ['是', 1]]},
  ]
  readonly #view: DataView
  readonly #context: string
  readonly #identity: string | undefined
  #baseline: string
  #status: 'idle' | 'pending' | 'unsubmitted' | 'unknown' | 'readback' = 'idle'
  #primary: LowcodeDataSpacePrimaryKey | undefined
  #primaryRows = new Map<string, string>()
  #primaryWorkspace = false
  #fields: DataView | undefined

  /** 捕获目标、正式查询和来源身份；派发写入时通知会话废弃此前目标投影。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string, private readonly modelId: string,
    private readonly lifecycle: Readonly<{assertCurrent(): void; onDispatch(): void;
      validatePrimaryKey?(model: ReturnType<typeof DataSpaceDesignApi.projectModel>): Promise<() => void>;
      primaryKeyChanged?(retainedFieldView?: string): void}>) {
    const view = dataSet.getView('Base_DataModel', 'default')
    if (!view) throw new Error('DATA_SPACE_MODEL_CONTEXT: 缺少正式模型视图')
    this.#view = view; this.#context = JSON.stringify(view.queryContext)
    const row = this.current()
    this.#identity = this.identity(row); this.#baseline = this.snapshot(row)
  }

  private assertOwner(): void {
    this.lifecycle.assertCurrent()
    if (this.dataSet.destroyed || this.dataSet.getView('Base_DataModel', 'default') !== this.#view
      || this.#view.dataTable?.modelBinding?.modelName !== 'Base_DataModel'
      || this.#view.queryContext['dataSpaceId'] !== this.targetId || JSON.stringify(this.#view.queryContext) !== this.#context) {
      throw new Error('DATA_SPACE_MODEL_CONTEXT: 模型查询或目标已变化')
    }
  }

  private identity(row: DataRow): string {
    const keys = ['rowid', 'dataSetId', 'Name', 'MetaName', 'Type', ...['DbId', 'DbName'].filter(name => this.#view.columns.some(column => column.name === name))]
    if (keys.some(key => this.#view.fieldAccess(row, key).read !== 'visible')) throw new Error('DATA_SPACE_MODEL_CONTEXT: 模型及来源身份不可读')
    return JSON.stringify(keys.map(key => row[key]))
  }

  private current(): DataRow {
    this.assertOwner()
    const rows = this.#view.rows.filter(row => this.#view.getPkKey(row) === this.modelId)
    const row = rows[0]
    if (!row || rows.length !== 1 || row['rowid'] !== this.modelId || row['dataSetId'] !== this.targetId
      || this.#view.requestState !== RequestState.Loaded || this.#view.mutating) {
      throw new Error('DATA_SPACE_MODEL_CONTEXT: 模型身份、归属或当前查询状态无效')
    }
    const identity = this.identity(row)
    if (this.#identity !== undefined && identity !== this.#identity) throw new Error('DATA_SPACE_MODEL_CONTEXT: 模型注册名或来源身份已变化，请重新打开')
    return row
  }

  private snapshot(row: DataRow): string {return JSON.stringify(LowcodeDataSpaceModelEdit.fields.map(field => row[field.name]))}

  /** 绑定工作区已读取的字段视图；候选、提交校验和预览共用该查询，不复制字段或回退目录。 */
  bindFields(view: DataView): void {
    this.assertOwner()
    if (view.dataSet !== this.dataSet || view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field'
      || view.queryContext['dataSpaceId'] !== this.targetId || view.queryContext['modelId'] !== this.modelId
      || this.dataSet.getView('Base_DataModel_Field', view.viewId) !== view) throw new Error('模型字段视图身份不匹配')
    this.#fields = view
  }

  private fieldView(): DataView | undefined {
    const view = this.#fields
    if (!view) return this.dataSet.getView('Base_DataModel_Field', 'default')
    if (view.destroyed || this.dataSet.getView('Base_DataModel_Field', view.viewId) !== view
      || view.queryContext['dataSpaceId'] !== this.targetId || view.queryContext['modelId'] !== this.modelId) throw new Error('模型字段视图已切换，请重新打开模型')
    return view
  }

  private columns(): DataColumn[] {
    const view = this.fieldView()
    const rows = view?.rows.filter(row => {
      const id = view.getPkKey(row)
      return id === undefined || !view.dirtyTracking.pendingCreateIds.has(id)
    }) ?? []
    if (!view || view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field' || view.queryContext['dataSpaceId'] !== this.targetId
      || view.requestState !== RequestState.Loaded || view.total !== rows.length || view.mutating
      || view.dirtyTracking.dirtyRowIds.size > 0 || view.dirtyTracking.pendingDeleteIds.size > 0) {
      throw new Error('字段候选尚未完整读取或有未保存修改')
    }
    // 候选只读正式查询行；编辑覆盖与待新增计算字段由工作区统一校验、提交，不锁死已有主键的选择。
    const fields = rows.flatMap(row => {
      if (['rowid', 'dataSetId', 'dataModelId', 'Name', 'type'].some(key => view.fieldAccess(row, key).read !== 'visible')
        || row['rowid'] !== view.getPkKey(row) || row['dataSetId'] !== this.targetId || row['dataModelId'] !== this.modelId
        || row['type'] === 'inputParams' || typeof row['Name'] !== 'string' || !row['Name'].trim()) return []
      const type = view.fieldAccess(row, 'FieldType').read === 'visible' && typeof row['FieldType'] === 'string' ? row['FieldType'] : 'unknown'
      return [{name: row['Name'], type}]
    })
    const counts = new Map<string, number>()
    for (const field of fields) counts.set(field.name, (counts.get(field.name) ?? 0) + 1)
    return fields.filter(field => counts.get(field.name) === 1)
  }

  /** 状态只含流程信息；编辑值及delta始终留在原模型视图。 */
  getState() {
    const primary = this.#primary
    return {status: this.#status, pending: this.#view.hasEditingChanges(this.modelId) || this.#view.dirtyTracking.hasPendingChanges(this.modelId)
      || primary?.changes.some(change => primary.fields.hasEditingChanges(change.id) || primary.fields.dirtyTracking.hasPendingChanges(change.id)) === true}
  }

  /** 按当前字段权限提供配置；未知旧值保留，不因维护其他字段被归一化。 */
  read() {
    const row = this.current()
    const editing = this.#view.getEditingRow(this.modelId) ?? row
    let columns: DataColumn[] = []; let warning = ''
    try {columns = this.columns()} catch (cause) {warning = cause instanceof Error ? cause.message : String(cause)}
    const fields = LowcodeDataSpaceModelEdit.fields.flatMap(field => {
      if (field.name === 'items' && row['Type'] !== '数组') return []
      if (!this.#view.columns.some(column => column.name === field.name)) return []
      const access = this.#view.fieldAccess(row, field.name)
      const raw = access.read === 'visible' ? editing[field.name] : undefined
      const scalar = raw === undefined || raw === null || typeof raw === 'string' || typeof raw === 'number'
      const value = scalar && raw !== undefined && raw !== null ? raw : ''
      const options = (field.choices ?? (field.name === 'PrimaryKeyFields' ? columns.map(column => [column.name, column.name] as const) : []))
        .map(([label, option]) => ({label, value: option}))
      const unknown = field.kind === 'select' && value !== '' && !options.some(option => option.value === value)
      if (unknown) options.unshift({label: `原值：${value}（未确认，保留）`, value})
      return [{...field, value, options, unknown, readable: access.read === 'visible',
        writable: scalar && access.read === 'visible' && access.write === 'allowed' && this.#view.editActionState(row) === 'enabled'
          && !(field.name === 'PrimaryKeyFields' && LowcodeDataSpacePrimaryKey.sourceControlled(row)),
        warning: field.name === 'PrimaryKeyFields' && LowcodeDataSpacePrimaryKey.sourceControlled(row) ? '数据库表的有效主键由来源目录决定；此处不修改物理主键。'
          : !scalar ? '当前值不是文本或数字，原记录保留' : ''}]
    })
    return {fields, columns, warning}
  }

  /**
   * 捕获正式模型预览的已保存初值；模型定义修改须先保存。
   * 本次请求调整由预览DataView持有，不在模型记录建立请求草稿。
   * @returns 复核原查询、字段读取权限及已存初值的检查函数；变化后旧预览失效。
   */
  capturePreview(): () => void {
    const snapshot = (): string => {
      this.assertEditable()
      const row = this.current(), patch = this.#view.getEditingPatch(this.modelId) ?? {}
      const keys = ['Filter', 'OutputType', 'parentField', 'hasChildField', 'selfType', 'topValue']
      const changed = Object.keys(patch)[0]
      if (changed !== undefined) throw new Error(`模型定义${changed}有未保存修改，当前查询接口不支持该草稿预览`)
      for (const key of keys) if (this.#view.columns.some(column => column.name === key)
        && this.#view.fieldAccess(row, key).read !== 'visible') throw new Error(`模型预览配置不可读：${key}`)
      return JSON.stringify([this.snapshot(row), keys.map(key => row[key])])
    }
    const initial = snapshot()
    const fields = this.fieldView(), rows = fields?.rows
    const fieldQuery = JSON.stringify([fields?.queryContext, fields?.filterExpression])
    return () => {
      if (snapshot() !== initial) throw new Error('模型请求设置已变化，请重新打开预览')
      if (fields !== this.fieldView() || fields && (fields.destroyed
        || fields.requestState !== RequestState.Loaded || fields.mutating || fields.rows !== rows
        || JSON.stringify([fields.queryContext, fields.filterExpression]) !== fieldQuery)) {
        throw new Error('模型字段查询已变化，请重新打开预览')
      }
    }
  }

  /**
   * 只读已保存的模型预览初值；当前元数据权限及所属模型必须成立。
   * 过滤字段按正式名称/别名映射到目标DataView，输入随后由预览DataView及公共级联持有。
   * 不保存、执行查询或将元数据权限传给业务结果；定位展开不把topValue当作目标节点。
   * 字段草稿是否可执行由会话的预览快照校验；这里仅读取已装配视图和正式字段名映射。
   */
  readPreview(view: DataView) {
    this.capturePreview()
    const row = this.current(), table = view.dataTable
    if (view.dataSet?.scenarioId !== this.targetId || table?.modelBinding?.modelId !== this.modelId
      || table.modelBinding.modelName !== row['Name']) throw new Error('模型预览视图身份不匹配')
    this.columns()
    const read = (key: string): string => {
      if (!this.#view.columns.some(column => column.name === key)) return ''
      if (this.#view.fieldAccess(row, key).read !== 'visible') throw new Error(`模型预览配置不可读：${key}`)
      const value = row[key]
      if (value === null || value === undefined) return ''
      if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`模型预览配置类型无效：${key}`)
      return String(value).trim()
    }
    const fields = this.fieldView()
    if (!fields) throw new Error('模型预览缺少正式字段视图')
    const available = new Set(table.columns.map(column => column.name))
    const canonical = (input: string, required = false): string => {
      if (!input) return input
      const candidates = new Set(available.has(input) ? [input] : [])
      for (const field of fields.rows) {
        if (field['dataModelId'] !== this.modelId || field['type'] === 'inputParams'
          || ['Name', 'dataModelId', 'type'].some(key => fields.fieldAccess(field, key).read !== 'visible')) continue
        const name = field['Name'], alias = fields.fieldAccess(field, 'AsName').read === 'visible' ? field['AsName'] : undefined
        const target = typeof alias === 'string' && alias.trim() ? alias.trim() : name
        if (typeof name === 'string' && typeof target === 'string' && available.has(target)
          && [name, target, `${String(row['Name'])}.${name}`, `${String(row['Name'])}.${target}`].includes(input)) candidates.add(target)
      }
      if (candidates.size > 1 || required && candidates.size !== 1) throw new Error(`模型预览字段不能唯一映射：${input}`)
      return candidates.values().next().value ?? input
    }
    const mapFilter = (filter: DataViewFilterTree): DataViewFilterTree => 'logic' in filter
      ? {...filter, filters: filter.filters.map(mapFilter)} : {...filter, field: canonical(filter.field, true)}
    const filter = DataSpaceDesignApi.parseFilter(read('Filter'))?.toJSON(), treeMode = read('selfType')
    return {filterExpression: filter ? mapFilter(filter) : undefined,
      outputType: read('OutputType') || 'Table', keyField: view.primaryKey,
      parentField: canonical(read('parentField')), hasChildrenField: canonical(read('hasChildField')),
      treeMode, nodeId: treeMode === 'parent' ? '' : read('topValue')}
  }

  /** 数组的表头来自正式字段定义；数据仍绑定原模型items，不从数据猜字段或覆盖异常原文。 */
  readArray() {
    const row = this.current()
    if (row['Type'] !== '数组') throw new Error('当前模型不是前端数组；来源转换需单独处理')
    const available = this.columns(), fields = this.fieldView()
    if (!fields) throw new Error('缺少正式字段视图')
    const headers = fields.rows.filter(field => field['dataModelId'] === this.modelId && field['type'] === 'dataModel'
      && fields.fieldAccess(field, 'type').read === 'visible' && available.some(column => column.name === field['Name']))
      .map(field => ({name: String(field['Name']), type: fields.fieldAccess(field, 'FieldType').read === 'visible' ? String(field['FieldType']) : 'unknown',
        label: fields.fieldAccess(field, 'description').read === 'visible' && typeof field['description'] === 'string' && field['description'] ? field['description'] : String(field['Name']),
        order: fields.fieldAccess(field, 'Order').read === 'visible' && typeof field['Order'] === 'number' ? field['Order'] : 0}))
      .sort((left, right) => left.order - right.order)
    if (!headers.length) throw new Error('数组没有可确认的正式表头，请先维护字段定义')
    const access = this.#view.fieldAccess(row, 'items')
    return {headers, readable: access.read === 'visible', writable: typeof row['items'] === 'string' && access.read === 'visible'
      && access.write === 'allowed' && this.#view.editActionState(row) === 'enabled' && this.#status === 'idle'}
  }

  private validate(field: string, value: unknown, allowUnchanged = true): void {
    const definition = LowcodeDataSpaceModelEdit.fields.find(item => item.name === field)
    const row = this.current()
    if (!definition || !this.#view.columns.some(column => column.name === field)) throw new Error('模型配置不能修改身份、来源或其他字段')
    if (this.#view.fieldAccess(row, field).read !== 'visible' || this.#view.fieldAccess(row, field).write !== 'allowed'
      || this.#view.editActionState(row) !== 'enabled') throw new Error(`模型字段当前不可写：${field}`)
    if (allowUnchanged && value === row[field]) return
    if (field === 'items') {
      if (row['Type'] !== '数组') throw new Error('只有数组模型可在此维护items')
      if (typeof value !== 'string') throw new Error('数组数据必须为JSON文本')
      const parsed = parseJsonDocument(value)
      if (!Array.isArray(parsed) || parsed.some(item => item === null || typeof item !== 'object' || Array.isArray(item))) throw new Error('数组数据必须为JSON对象数组')
      this.readArray()
    }
    if (field === 'PrimaryKeyFields' && LowcodeDataSpacePrimaryKey.sourceControlled(row)) throw new Error('数据库表主键由正式来源目录决定')
    if (field === 'IsBusiness' || field === 'IsBusinessMain') {
      if (value !== 0 && value !== 1) throw new Error(`${field}只接受0或1`)
    } else if (typeof value !== 'string') throw new Error(`${field}必须为文本`)
    if (definition.choices && value !== '' && !definition.choices.some(([, option]) => option === value)) throw new Error(`${field}不是支持的选项`)
    if (field === 'PrimaryKeyFields' && value !== '' && !(this.#primary ? this.#primary.candidate.fields.some(column => column.name === value)
      : this.columns().some(column => column.name === value && !['计算字段', '引用'].includes(column.type)))) throw new Error('主键必须是当前模型唯一的正式非计算字段Name')
  }

  private assertEditable(): void {
    if (this.#status !== 'idle' || this.#view.dirtyTracking.hasPendingChanges(this.modelId)) throw new Error('请先核验未决模型修改')
    if (this.snapshot(this.current()) !== this.#baseline) throw new Error('模型配置基线已变化，请重新核验')
    for (const [field, value] of Object.entries(this.#view.getEditingPatch(this.modelId) ?? {})) this.validate(field, value)
  }

  /** 显式修改一个配置字段；不更改其他未知配置或正式身份。 */
  stage(field: string, value: string | number): void {
    this.assertEditable(); this.validate(field, value)
    this.#view.updateEditingValue(this.modelId, field, value)
  }

  /** 仅放弃尚未派发的模型编辑。 */
  discard(): void {
    this.assertOwner()
    if (this.#status !== 'idle') throw new Error('已派发修改必须先核验')
    this.#view.discardEditingRows([this.modelId])
  }

  /** 同一批次提交当前模型及显式传入的元模型字段；不保存场景文件或其他模型。 */
  async save(fields: readonly LowcodeDataSpaceFieldEdit[] = [], inputs: readonly LowcodeDataSpaceSourceInputEdit[] = [], removals: readonly LowcodeDataSpaceFieldRemove[] = []): Promise<void> {
    this.assertEditable()
    const keyPatch = this.#view.getEditingPatch(this.modelId)
    const workspace = fields.length && keyPatch && Object.hasOwn(keyPatch, 'PrimaryKeyFields')
      ? LowcodeDataSpaceFieldEdit.stagePrimaryKey(fields, String(keyPatch['PrimaryKeyFields']), {dataSet: this.dataSet, targetId: this.targetId, modelId: this.modelId}) : undefined
    const removalParts = removals.map(owner => owner.prepareSave())
    const removedIds = removalParts.flatMap(part => part.targets().flatMap(target => target.ids))
    const fieldPart = fields.length ? LowcodeDataSpaceFieldEdit.prepareSave(fields, this.#view.getEditingPatch(this.modelId), removedIds) : undefined
    const inputPart = LowcodeDataSpaceSourceInputEdit.prepareSave(inputs)
    if ([fieldPart, inputPart, ...removalParts].some(part => part && (part.dataSet !== this.dataSet || part.targetId !== this.targetId || part.modelId !== this.modelId))) {
      throw new Error('字段批次必须属于当前数据空间实例和模型')
    }
    const modelPart = this.prepareSave(workspace)
    await DataSpaceDefinitionSave.run([...(modelPart ? [modelPart] : []), ...(fieldPart ? [fieldPart] : []), ...(inputPart ? [inputPart] : []), ...removalParts])
  }

  private prepareSave(workspace?: DataView): DataSpaceDefinitionSavePart | undefined {
    const patch = {...this.#view.getEditingPatch(this.modelId)}
    if (!Object.keys(patch).length) return
    let assertConfiguration: (() => void) | undefined
    return {
      dataSet: this.dataSet, targetId: this.targetId, modelId: this.modelId,
      prepare: async () => {
      this.assertEditable(); this.#status = 'pending'
      if (Object.hasOwn(patch, 'PrimaryKeyFields')) {
        this.#primaryWorkspace = !!workspace
        this.#primary = await LowcodeDataSpacePrimaryKey.prepare(this.dataSet, this.targetId, this.modelId, String(patch['PrimaryKeyFields']), () => this.assertOwner(), workspace)
        if (!this.lifecycle.validatePrimaryKey) throw new Error('缺少主键配置依赖校验')
        assertConfiguration = await this.lifecycle.validatePrimaryKey(this.#primary.candidate)
        this.#primary.assertCurrent()
        if (JSON.stringify(patch) !== JSON.stringify(this.#view.getEditingPatch(this.modelId))) throw new Error('预检期间模型草稿已变化')
        if (!workspace) for (const change of this.#primary.changes) for (const [field, value] of Object.entries(change.patch)) this.#primary.fields.updateEditingValue(change.id, field, value)
      }
      },
      apply: async () => {
      if (JSON.stringify(patch) !== JSON.stringify(this.#view.getEditingPatch(this.modelId))) throw new Error('预检期间模型草稿已变化')
      for (const [field, value] of Object.entries(patch)) this.validate(field, value)
      const applied = await this.#view.applyEditingRows([this.modelId])
      if (!applied.success || applied.data?.appliedCount !== 1 || applied.data.failedCount !== 0) throw new Error('模型配置尚未应用')
      if (!workspace && this.#primary?.changes.length) {
        this.#primary.assertStaged()
        const result = await this.#primary.fields.applyEditingRows(this.#primary.changes.map(change => change.id))
        for (const change of this.#primary.changes) this.#primaryRows.set(change.id, JSON.stringify(this.#primary.fields.rows.find(row => row['rowid'] === change.id)))
        if (!result.success || result.data?.appliedCount !== this.#primary.changes.length || result.data.failedCount !== 0) throw new Error('主键字段标记尚未完整应用')
      }
      },
      check: () => {
      const row = this.current()
      if (this.#view.hasEditingChanges(this.modelId) || Object.entries(patch).some(([field, value]) => row[field] !== value)) throw new Error('提交前模型草稿已变化')
      for (const [field, value] of Object.entries(patch)) this.validate(field, value, false)
      this.#primary?.assertCurrent(true); assertConfiguration?.()
      },
      targets: () => [{tableName: this.#view.tableName, viewId: this.#view.viewId, ids: [this.modelId]},
        ...!workspace && this.#primary?.changes.length ? [{tableName: this.#primary.fields.tableName, viewId: this.#primary.fields.viewId, ids: this.#primary.changes.map(change => change.id)}] : []],
      dispatched: () => this.lifecycle.onDispatch(),
      confirm: async () => {
      // Ordinary edits already have an accepted field-level DataSet receipt.
      // A primary-key migration additionally verifies its coupled field markers.
      if (this.#primary) await this.readback()
      const loaded = this.current()
      if (Object.entries(patch).some(([field, value]) => loaded[field] !== value)) throw new Error('模型保存结果与提交值不一致')
      this.#baseline = this.snapshot(loaded)
      this.#primary?.assertCurrent(true)
      if (this.#primary) this.lifecycle.primaryKeyChanged?.(workspace?.viewId)
      this.#primary = undefined
      this.#primaryWorkspace = false
      this.#primaryRows.clear()
      this.#status = 'idle'
      },
      failed: stage => {this.#status = stage === 'confirmed' ? 'readback' : stage === 'dispatched' ? 'unknown' : 'unsubmitted'},
    }
  }

  private async readback(): Promise<void> {
    this.assertOwner()
    if (this.#view.hasEditingChanges() || this.#view.dirtyTracking.hasPendingChanges()) throw new Error('模型草稿仍未处理，不能用回读覆盖')
    const result = await this.#view.loadFromServer({filter: {field: 'dataSetId', operator: 'eq', value: this.targetId}, sort: 'rowid:asc', allPages: true, maxRows: 50000})
    this.assertOwner()
    if (!result.success || this.#view.loadingError || this.#view.rows.some(row => this.#view.fieldAccess(row, 'dataSetId').read !== 'visible' || row['dataSetId'] !== this.targetId)) throw new Error('模型回读失败或包含其他目标记录')
    if (this.#primary && !this.#primaryWorkspace) {
      const fields = this.#primary.fields
      if (fields.hasEditingChanges() || fields.dirtyTracking.hasPendingChanges()) throw new Error('字段草稿仍未处理，不能用回读覆盖')
      const loaded = await fields.loadFromServer({filter: {field: 'dataSetId', operator: 'eq', value: this.targetId}, sort: 'rowid:asc', allPages: true, maxRows: 50000})
      this.assertOwner()
      if (!loaded.success || fields.loadingError || fields.rows.length !== fields.total || fields.rows.some(row => fields.fieldAccess(row, 'dataSetId').read !== 'visible' || row['dataSetId'] !== this.targetId)) throw new Error('主键字段回读未完整确认')
    }
    this.#baseline = this.snapshot(this.current())
  }

  /** 显式处理待提交或未知状态，只读取正式结果，绝不自动重放写入。 */
  async reload(discardPending: boolean): Promise<void> {
    await this.prepareReload(discardPending)()
  }

  /** 同步确认并放弃本次模型差异，返回只读核验动作；联合核验须先准备全部目标再执行，后续编辑仍由原视图保护。 */
  prepareReload(discardPending: boolean): () => Promise<void> {
    this.assertOwner()
    if (this.#status === 'pending' || this.#view.mutating || this.#view.requestState === RequestState.Loading) throw new Error('模型请求仍在进行')
    if (this.getState().pending && !discardPending) throw new Error('本地模型修改尚未明确放弃')
    if (discardPending) {
      if (this.#primary && !this.#primaryWorkspace) for (const change of this.#primary.changes) {
        const fields = this.#primary.fields, patch = fields.getEditingPatch(change.id)
        const row = fields.rows.find(item => item['rowid'] === change.id)
        if (patch && Object.entries(patch).some(([key, value]) => change.patch[key] !== value)
          || fields.dirtyTracking.hasPendingChanges(change.id) && JSON.stringify(row) !== this.#primaryRows.get(change.id)
          || row && Object.entries(fields.dirtyTracking.getDiff(change.id, row)).some(([key, diff]) => change.patch[key] !== diff.to)
          || !row) throw new Error('主键字段草稿被其他编辑改变，不能覆盖')
      }
      this.#view.discardPendingChanges([this.modelId])
      if (this.#primary && !this.#primaryWorkspace) this.#primary.fields.discardPendingChanges(this.#primary.changes.map(change => change.id))
    }
    return async () => {
      this.assertOwner()
      if (this.#status === 'pending' || this.#view.mutating || this.#view.requestState === RequestState.Loading) throw new Error('模型请求仍在进行')
      this.#status = 'pending'
      try {await this.readback(); if (this.#primary) this.lifecycle.primaryKeyChanged?.(this.#primaryWorkspace ? this.#primary.fields.viewId : undefined); this.#primary = undefined; this.#primaryWorkspace = false; this.#primaryRows.clear(); this.#status = 'idle'} catch (cause) {this.#status = 'readback'; throw cause}
    }
  }
}
