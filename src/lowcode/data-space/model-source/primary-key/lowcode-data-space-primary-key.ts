/**
 * @module app:lowcode/data-space/model-source/primary-key/lowcode-data-space-primary-key
 * 职责：核定一次模型主键变更涉及的正式字段标记和提交前基线。
 * 边界：复用原DataView查询/编辑/权限，不修改物理主键，不保存场景文件。
 * AI用途：模型配置保存时共同提交PrimaryKeyFields、IsPKey和必要IsOutput。
 */
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {RequestState, type DataRow, type DataSet, type DataView, type DataViewFilterTree} from '@spark-appworks/spark-data'

/** 复用正式元数据投影的输出定义，不携带查询授权。 */
type FormalModel = ReturnType<typeof DataSpaceDesignApi.projectModel>
/** 一条正式字段记录的主键标记差异。 */
type KeyChange = {
  /** 原Base_DataModel_Field记录的rowid。 */
  id: string
  /** 仅含本次必要的IsPKey和IsOutput数值标记。 */
  patch: Record<string, number>
}

export type PrimaryKeyScopeInput = Readonly<{
  dataSet: DataSet
  targetId: string
  modelId: string
  name: string
  models: DataView
  assertLive: () => void
  workspace?: DataView | undefined
}>

export type PrimaryKeyPrepareInput = Readonly<{
  dataSet: DataSet
  targetId: string
  modelId: string
  name: string
  assertLive: () => void
  workspace?: DataView | undefined
}>

/** 一次显式主键变更；正式记录及授权始终由原视图持有。 */
export class LowcodeDataSpacePrimaryKey {
  private static readonly modelFields = ['rowid', 'dataSetId', 'Name', 'MetaName', 'Type', 'DbId', 'DbName', 'PrimaryKeyFields']
  private static readonly fieldFields = ['rowid', 'dataSetId', 'dataModelId', 'type', 'Name', 'AsName', 'FieldType', 'IsPKey', 'IsOutput', 'ValueFun', 'Expression']
  private readonly dataSet: DataSet
  private readonly targetId: string
  private readonly modelId: string
  private readonly name: string
  private readonly models: DataView
  private readonly assertLive: () => void
  private readonly workspace: DataView | undefined
  /** 原元数据字段视图，持有正式行、权限及编辑状态。 */
  readonly fields: DataView
  /** 拟提交的字段标记，不包含其他消费者的编辑。 */
  readonly changes: KeyChange[]
  /** 采用拟定主键后的正式定义投影，供场景配置依赖校验。 */
  readonly candidate: FormalModel
  private readonly modelBefore: unknown[]
  private readonly before: Array<{id: string; values: unknown[]}>
  private readonly contexts: string[]
  private readonly workspaceRows: Array<{id: string; values: unknown[]; patch: Record<string, unknown>; creating: boolean}> = []
  private readonly watchedFields: string[]

  /** 数据库表主键来自来源目录；定义配置不执行DDL。 */
  static sourceControlled(row: DataRow): boolean {return ['数据库表', '表', 'table'].includes(String(row['Type']))}

  /** 从原元数据视图捕获一次计划；调用方须经prepare核最新记录和权限。 */
  private constructor(scope: PrimaryKeyScopeInput) {
    const {dataSet, targetId, modelId, name, models, assertLive, workspace} = scope
    this.dataSet = dataSet
    this.targetId = targetId
    this.modelId = modelId
    this.name = name
    this.models = models
    this.assertLive = assertLive
    this.workspace = workspace
    const fields = workspace ?? dataSet.getView('Base_DataModel_Field')
    if (!fields) throw new Error('缺少正式字段视图')
    this.fields = fields
    if (workspace && (workspace.viewId !== 'modelFields' || workspace.queryContext['modelId'] !== modelId)) throw new Error('主键字段工作区身份不一致')
    this.contexts = [models, fields].map(view => JSON.stringify([view.queryContext, view.filterExpression]))
    const model = this.model()
    if (LowcodeDataSpacePrimaryKey.sourceControlled(model)) throw new Error('数据库表主键由正式来源目录决定，不能在模型配置中修改')
    const rows = this.rows()
    this.watchedFields = [...new Set([...LowcodeDataSpacePrimaryKey.fieldFields,
      ...workspace ? rows.flatMap(row => Object.keys(fields.getEditingPatch(String(row['rowid'])) ?? {})) : []])]
    if (workspace) this.workspaceRows = rows.map(row => ({id: String(row['rowid']), values: this.values(fields, row, this.watchedFields),
      patch: {...fields.getEditingPatch(String(row['rowid']))}, creating: fields.dirtyTracking.isPendingCreate(String(row['rowid']))}))
    if (name && !rows.some(row => row['Name'] === name)) throw new Error('主键必须是当前模型唯一的正式字段Name')
    const selected = rows.filter(row => row['Name'] === name)
    if (name && (selected.length !== 1 || ['计算字段', '引用'].includes(String(selected[0]?.['FieldType'])))) throw new Error('主键不能是重复、计算或引用字段')
    this.changes = rows.flatMap(row => {
      const flag = row['IsPKey']
      if (flag !== undefined && flag !== null && flag !== 0 && flag !== 1 && flag !== '0' && flag !== '1') throw new Error('旧主键标记无法确认，请先核查原定义')
      const patch: Record<string, number> = {}
      const key = name !== '' && row['Name'] === name ? 1 : 0
      if (Number(row['IsPKey'] ?? 0) !== key) patch['IsPKey'] = key
      if (key && Number(row['IsOutput']) !== 1) patch['IsOutput'] = 1
      return Object.keys(patch).length ? [{id: String(row['rowid']), patch}] : []
    })
    this.modelBefore = this.values(models, model, LowcodeDataSpacePrimaryKey.modelFields)
    this.before = rows.filter(row => !fields.dirtyTracking.isPendingCreate(String(row['rowid']))).map(row => ({id: String(row['rowid']), values: this.values(fields, row, LowcodeDataSpacePrimaryKey.fieldFields)}))
    this.candidate = DataSpaceDesignApi.projectModel({...model, PrimaryKeyFields: name}, rows.map(row => ({...row,
      ...workspace ? fields.getEditingPatch(String(row['rowid'])) : {},
      ...this.changes.find(change => change.id === row['rowid'])?.patch})), '')
    if (this.candidate.primaryKey === '_pk') throw new Error('主键输出不能使用原生保留字段_pk')
    this.assertCurrent()
  }

  private model(): DataRow {
    this.assertLive()
    if (this.dataSet.destroyed || this.dataSet.getView('Base_DataModel') !== this.models || this.dataSet.getView('Base_DataModel_Field', this.fields.viewId) !== this.fields) throw new Error('主键查询视图已变化')
    for (const [index, view] of [this.models, this.fields].entries()) if (view.queryContext['dataSpaceId'] !== this.targetId || JSON.stringify([view.queryContext, view.filterExpression]) !== this.contexts[index] || view.dataTable?.modelBinding?.modelName !== view.tableName
      || view.requestState !== RequestState.Loaded || view.total !== view.rows.length - view.dirtyTracking.pendingCreateIds.size || view.mutating) throw new Error('主键定义未完整读取或查询已变化')
    const rows = this.models.rows.filter(row => row['rowid'] === this.modelId)
    const row = rows[0]
    if (!row || rows.length !== 1 || row['dataSetId'] !== this.targetId || this.models.getPkKey(row) !== this.modelId) throw new Error('主键所属模型身份不可确认')
    return row
  }

  private rows(): DataRow[] {
    const rows = this.fields.rows.filter(row => row['dataModelId'] === this.modelId && row['type'] === 'dataModel')
    const ids = new Set<string>()
    for (const row of this.fields.rows) {
      if (['rowid', 'dataSetId', 'dataModelId', 'type'].some(key => this.fields.fieldAccess(row, key).read !== 'visible')
        || row['dataSetId'] !== this.targetId || typeof row['rowid'] !== 'string' || !row['rowid'] || ids.has(row['rowid'])
        || this.fields.getPkKey(row) !== row['rowid']) throw new Error('字段身份或归属不可确认')
      ids.add(row['rowid'])
    }
    return rows
  }

  private values(view: DataView, row: DataRow, keys: readonly string[]): unknown[] {
    return keys.map(key => {
      if (view.columns.some(column => column.name === key) && view.fieldAccess(row, key).read !== 'visible') throw new Error(`主键定义不可读：${key}`)
      return row[key]
    })
  }

  private permissions(view: DataView, row: DataRow, keys: readonly string[]): void {
    if (view.editActionState(row) !== 'enabled' || keys.some(key => view.fieldAccess(row, key).read !== 'visible' || view.fieldAccess(row, key).write !== 'allowed')) throw new Error('主键变更字段当前不可写')
  }

  /** 独立读取最新正式元记录和权限，旧记录不因投影失败而无法修复。 */
  static async prepare(input: PrimaryKeyPrepareInput): Promise<LowcodeDataSpacePrimaryKey> {
    const {dataSet, targetId, modelId, name, assertLive, workspace} = input
    const models = dataSet.getView('Base_DataModel')
    if (!models) throw new Error('缺少正式模型视图')
    const plan = new LowcodeDataSpacePrimaryKey({dataSet, targetId, modelId, name, models, assertLive, ...(workspace ? {workspace} : {})})
    for (const source of [models, plan.fields]) {
      const fresh = source.createQueryView(`keyCheck_${crypto.randomUUID().replaceAll('-', '')}`)
      try {
        const filters: DataViewFilterTree[] = [
          ...fresh.filterExpression ? [fresh.filterExpression] : [],
          {field: 'dataSetId', operator: 'eq', value: targetId},
          {field: source === models ? 'rowid' : 'dataModelId', operator: 'eq', value: modelId},
        ]
        if (source !== models) filters.push({field: 'type', operator: 'eq', value: 'dataModel'})
        const result = await fresh.loadFromServer({filter: {logic: 'and', filters}, allPages: true, maxRows: 50000})
        plan.assertCurrent()
        if (!result.success || fresh.total !== fresh.rows.length) throw new Error('主键定义预检未完整读取')
        const identities = source === models ? ['rowid', 'dataSetId'] : ['rowid', 'dataSetId', 'dataModelId', 'type']
        const ids = new Set<string>()
        for (const row of fresh.rows) {
          const id = row['rowid']
          if (identities.some(key => fresh.fieldAccess(row, key).read !== 'visible') || row['dataSetId'] !== targetId
            || typeof id !== 'string' || !id || ids.has(id) || fresh.getPkKey(row) !== id) throw new Error('最新主键定义身份或归属不可确认')
          if (source === models ? id !== modelId : row['dataModelId'] !== modelId || row['type'] !== 'dataModel') throw new Error('最新主键定义超出本模型字段范围')
          ids.add(id)
        }
        const expected = source === models ? [{id: modelId, values: plan.modelBefore}] : plan.before
        const rows = fresh.rows
        const keys = source === models ? this.modelFields : this.fieldFields
        if (rows.length !== expected.length || expected.some(entry => {
          const matches = rows.filter(row => row['rowid'] === entry.id), row = matches[0]
          return !row || matches.length !== 1 || JSON.stringify(plan.values(fresh, row, keys)) !== JSON.stringify(entry.values)
        })) throw new Error('主键正式定义已变化，请重新核验')
        for (const row of rows) {
          const properties = source === models ? ['PrimaryKeyFields'] : Object.keys(plan.changes.find(change => change.id === row['rowid'])?.patch ?? {})
          if (properties.length) plan.permissions(fresh, row, properties)
        }
      } finally {source.dataTable?.destroyView(fresh.viewId)}
    }
    return plan
  }

  /** 应用字段草稿前，仅接受本次计划的字段和值，不卷入其他编辑器的草稿。 */
  assertStaged(): void {
    this.model()
    if (this.fields.dirtyTracking.hasPendingChanges()) throw new Error('字段已有其他待提交修改')
    for (const row of this.fields.rows) {
      const id = this.fields.getPkKey(row)
      if (id === undefined) throw new Error('主键字段身份不可确认')
      const patch = this.fields.getEditingPatch(id)
      const expected = this.changes.find(change => change.id === id)?.patch
      if (patch && Object.entries(patch).some(([key, value]) => expected?.[key] !== value)) throw new Error('主键字段存在其他编辑草稿')
    }
  }

  /** 提交前核对定义和当次权限；applied只允许已计划的字段标记变化。 */
  assertCurrent(applied = false): void {
    const model = this.model(), rows = this.rows()
    if (this.workspace) {this.assertWorkspaceCurrent(model, rows, applied); return}
    const dirty = this.fields.dirtyTracking
    if (this.fields.hasEditingChanges() || !applied && dirty.hasPendingChanges()
      || dirty.pendingCreateIds.size || dirty.pendingDeleteIds.size) throw new Error('请先处理其他字段草稿或待提交修改')
    if (applied) for (const id of dirty.dirtyRowIds) {
      const change = this.changes.find(item => item.id === id), row = this.fields.rows.find(item => item['rowid'] === id)
      if (!change || !row || Object.entries(dirty.getDiff(id, row)).some(([key, diff]) => change.patch[key] !== diff.to)) throw new Error('主键字段被其他修改改变')
    }
    const values = this.values(this.models, model, LowcodeDataSpacePrimaryKey.modelFields)
    const expected = [...this.modelBefore]
    if (applied) expected[LowcodeDataSpacePrimaryKey.modelFields.indexOf('PrimaryKeyFields')] = this.name
    if (JSON.stringify(values) !== JSON.stringify(expected) || rows.length !== this.before.length) throw new Error('主键定义基线已变化')
    this.permissions(this.models, model, ['PrimaryKeyFields'])
    for (const before of this.before) {
      const row = rows.find(item => item['rowid'] === before.id), change = this.changes.find(item => item.id === before.id)
      const expectedValues = before.values.map((value, index) => {
        const field = LowcodeDataSpacePrimaryKey.fieldFields[index]
        return applied && change && field !== undefined && Object.hasOwn(change.patch, field) ? change.patch[field] : value
      })
      if (!row || JSON.stringify(this.values(this.fields, row, LowcodeDataSpacePrimaryKey.fieldFields)) !== JSON.stringify(expectedValues)) throw new Error('主键字段基线已变化')
      if (change) this.permissions(this.fields, row, Object.keys(change.patch))
    }
  }

  private assertWorkspaceCurrent(model: DataRow, rows: DataRow[], applied: boolean): void {
    const dirty = this.fields.dirtyTracking
    if (dirty.pendingDeleteIds.size || !applied && dirty.dirtyRowIds.size || rows.length !== this.workspaceRows.length) throw new Error('主键字段工作区基线已变化')
    const expectedModel = [...this.modelBefore]
    if (applied) expectedModel[LowcodeDataSpacePrimaryKey.modelFields.indexOf('PrimaryKeyFields')] = this.name
    if (JSON.stringify(this.values(this.models, model, LowcodeDataSpacePrimaryKey.modelFields)) !== JSON.stringify(expectedModel)) throw new Error('主键模型基线已变化')
    this.permissions(this.models, model, ['PrimaryKeyFields'])
    for (const before of this.workspaceRows) {
      const row = rows.find(item => item['rowid'] === before.id), change = this.changes.find(item => item.id === before.id)
      if (!row) throw new Error('主键字段工作区缺少原记录')
      const expected = before.values.map((value, index) => {
        const field = this.watchedFields[index]
        return applied && field !== undefined && Object.hasOwn(before.patch, field) ? before.patch[field] : value
      })
      if (JSON.stringify(this.values(this.fields, row, this.watchedFields)) !== JSON.stringify(expected)
        || JSON.stringify(this.fields.getEditingPatch(before.id) ?? {}) !== JSON.stringify(applied ? {} : before.patch)
        || !applied && dirty.isPendingCreate(before.id) !== before.creating
        || Object.entries(dirty.getDiff(before.id, row)).some(([key, diff]) => !Object.hasOwn(before.patch, key) || before.patch[key] !== diff.to)) throw new Error('主键字段工作区草稿已变化')
      const final = {...row, ...applied ? {} : before.patch}
      if (Number(final['IsPKey'] ?? 0) !== (this.name && final['Name'] === this.name ? 1 : 0)
        || Number(final['IsPKey']) === 1 && Number(final['IsOutput']) !== 1) throw new Error('主键标记与模型声明不一致，请通过模型工作区统一保存')
      if (change) this.permissions(this.fields, row, Object.keys(change.patch))
    }
  }
}
