/**
 * @module app:lowcode/data-space/model-source/lowcode-data-space-model-dependencies
 * 职责：为模型/字段结构命令读取明确的依赖，保留C的正式查询、权限及提交责任方。
 * 边界：不预载字段default，不复制行；只读取显式依赖，具体命令负责引用改写与变更清单。
 * AI用途：结构命令的预览、派发前检查和回读共用同一组DataView。
 */
import {RequestState, type DataRow, type DataSet, type DataView, type DataViewFilterTree} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {isRecord} from '@spark-appworks/spark-utils'

/** 当前空间模型结构命令的按需依赖；生命周期归元数据DataSet。 */
export class LowcodeDataSpaceModelDependencies {
  /** 模型目录、所属字段及旧关系；均为正式数据视图。 */
  readonly views: [DataView, DataView, DataView]
  readonly #expressions: DataView
  readonly #contexts = new Map<DataView, string>()
  readonly #filters = new Map<DataView, string | undefined>()
  readonly #modelIds = new Set<string>()
  readonly #names = new Set<string>()

  /** 从C派生命令视图；editing指定须保留的本模型编辑行，依赖使用独立模型查询。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string, private readonly modelId: string,
    operation: 'rename' | 'remove' | 'sourceRemoval' | `fieldRemove:${string}` | `fieldOutput:${string}` | `array:${string}`, private readonly assertCurrent: () => void,
    private readonly editing?: Readonly<{view: DataView; id: string}>,
    private readonly fieldEditing?: Readonly<{view: DataView; ids: readonly string[]; allowPending?: boolean}>,
    private readonly fieldWorkspaces?: () => ReadonlyArray<Readonly<{view: DataView; ids: readonly string[]; allowPending?: boolean}>>) {
    const models = dataSet.getView('Base_DataModel', 'default'), fields = dataSet.getView('Base_DataModel_Field', 'modelInputFields')
    const relations = dataSet.getView('Base_DataModel_Relation', 'default'), allFields = dataSet.getView('Base_DataModel_Field', 'default')
    if (!models || !fields || !relations || !allFields) throw new Error('缺少模型结构命令的正式查询配置modelInputFields')
    const key = `model${operation}:${modelId}`
    if (editing && (editing.view !== models || editing.id !== modelId)) throw new Error('依赖查询的编辑身份必须是本次模型')
    if (fieldEditing && (fieldEditing.view.dataTable !== fields.dataTable || fieldEditing.ids.some(id => {
      const row = fieldEditing.view.rows.find(item => fieldEditing.view.getPkKey(item) === id) ?? fieldEditing.view.dirtyTracking.getPendingDeleteSnapshot(id)
      return row?.['dataSetId'] !== targetId || row['dataModelId'] !== modelId
    }))) throw new Error('依赖查询的字段编辑身份必须属于本次模型')
    this.views = [editing ? models.createQueryView(key) : models, fields.createQueryView(key), relations.createQueryView(key)]
    this.#expressions = allFields.createQueryView(`${key}:expressions`)
    this.views[1].queryContext = {...fields.queryContext, dataSpaceId: targetId, modelIds: [modelId]}
    this.views[2].queryContext = {...relations.queryContext, dataSpaceId: targetId}
    this.#expressions.queryContext = {...allFields.queryContext, dataSpaceId: targetId}
    this.#expressions.configure({filterExpression: {logic: 'and', filters: [
      ...allFields.filterExpression ? [allFields.filterExpression] : [],
      {field: 'ValueFun', operator: 'is-not-null'}, {field: 'ValueFun', operator: 'ne', value: ''},
    ]}})
    for (const view of [...this.views, this.#expressions]) {
      this.#contexts.set(view, JSON.stringify(view.queryContext))
      this.#filters.set(view, JSON.stringify(view.filterExpression))
    }
    this.assertOwner()
  }

  /** 检查原实例与输入身份，不从其他同名表或空间兜底。 */
  assertOwner(): void {
    this.assertCurrent()
    if (this.dataSet.destroyed || [...this.#contexts].some(([view, context]) => view.destroyed
      || this.dataSet.getView(view.tableName, view.viewId) !== view || view.dataTable?.modelBinding?.modelName !== view.tableName
      || view.queryContext['dataSpaceId'] !== this.targetId || JSON.stringify(view.queryContext) !== context
      || JSON.stringify(view.filterExpression) !== this.#filters.get(view))) throw new Error('模型命令查询或目标已变化')
  }

  /** 兄弟视图不能持有未决编辑或请求；命令不覆盖其他消费者的工作。 */
  assertSiblingsClean(): void {
    this.assertOwner()
    const additional = this.fieldWorkspaces?.() ?? []
    const workspaces = [...this.fieldEditing ? [this.fieldEditing] : [], ...additional]
    if (new Set(workspaces.map(item => item.view)).size !== workspaces.length) throw new Error('模型命令的字段工作区重复')
    for (const workspace of additional) {
      const {view, ids} = workspace
      if (view.destroyed || view.dataTable !== this.views[1].dataTable || this.dataSet.getView(view.tableName, view.viewId) !== view
        || view.queryContext['dataSpaceId'] !== this.targetId || new Set(ids).size !== ids.length || ids.some(id => {
          const row = view.rows.find(item => view.getPkKey(item) === id) ?? view.dirtyTracking.getPendingDeleteSnapshot(id)
          return row?.['dataSetId'] !== this.targetId || row['dataModelId'] !== this.modelId
            || ['rowid', 'dataSetId', 'dataModelId'].some(key => view.fieldAccess(row, key).read !== 'visible')
        })) throw new Error('依赖查询的字段编辑身份必须属于本次模型')
    }
    for (const view of this.views) {
      const other = Object.values(view.dataTable?.views ?? {}).find(candidate => {
        if (this.views.includes(candidate)) return false
        if (candidate.mutating || candidate.requestState === RequestState.Loading) return true
        const workspace = workspaces.find(item => item.view === candidate)
        const ids = workspace ? workspace.ids
          : candidate === this.editing?.view ? [this.editing.id] : []
        const tracking = candidate.dirtyTracking
        if (workspace?.allowPending
          && [...tracking.pendingDeleteIds, ...tracking.pendingCreateIds, ...tracking.dirtyRowIds].every(id => ids.includes(String(id)))) {
          return candidate.rows.some(row => !ids.includes(String(candidate.getPkKey(row))) && candidate.hasEditingChanges(candidate.getPkKey(row)))
        }
        if (tracking.hasPendingChanges() && (!workspace || tracking.pendingDeleteIds.size > 0
          || [...tracking.dirtyRowIds].some(id => !tracking.isPendingCreate(id))
          || [...tracking.pendingCreateIds].some(id => !ids.includes(String(id))))) return true
        return candidate.rows.some(row => !ids.includes(String(candidate.getPkKey(row))) && candidate.hasEditingChanges(candidate.getPkKey(row)))
      })
      if (other) throw new Error(`请先处理其他元数据草稿或查询，不能覆盖：${other.tableName}@${other.viewId}`)
    }
  }

  private read(view: DataView, row: DataRow, key: string): unknown {
    if (!view.columns.some(column => column.name === key)) return undefined
    if (view.fieldAccess(row, key).read !== 'visible') throw new Error(`${view.tableName}.${key}不可读，无法检查模型依赖或归属`)
    return row[key]
  }

  private async query(view: DataView): Promise<void> {
    const result = await view.loadFromServer({allPages: true, maxRows: 50000})
    this.assertOwner()
    if (!result.success || view.loadingError || view.requestState !== RequestState.Loaded || view.total !== view.rows.length) throw new Error('模型命令依赖未完整读取')
    const ids = new Set<string>()
    for (const row of view.rows) {
      const id = this.read(view, row, 'rowid')
      if (typeof id !== 'string' || !id || ids.has(id) || view.getPkKey(row) !== id || this.read(view, row, 'dataSetId') !== this.targetId) throw new Error('模型命令依赖身份或空间归属不可核验')
      ids.add(id)
    }
  }

  /** 首次读命令范围；重核与回读刷新模型目录，并保留原范围以核验已删除/改写的引用。 */
  async load(refresh = false): Promise<void> {
    this.assertSiblingsClean()
    for (const view of [...this.views, this.#expressions]) {
      if (view.mutating || view.requestState === RequestState.Loading || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw new Error('模型命令仍有草稿或请求，不能重读')
    }
    if (!refresh) {this.#modelIds.clear(); this.#names.clear()}
    const [models, fields, relations] = this.views
    if (refresh || this.editing) await this.query(models)
    if (models.requestState !== RequestState.Loaded || models.total !== models.rows.length) throw new Error('模型目录未完整读取')
    this.#modelIds.add(this.modelId)
    const target = models.rows.find(row => row['rowid'] === this.modelId)
    if (target) {const name = this.read(models, target, 'Name'); if (typeof name === 'string' && name) this.#names.add(name)}
    await this.query(relations)
    await this.query(this.#expressions)
    const configured = (value: unknown) => value !== undefined && value !== null && value !== ''
    const include = (value: unknown): void => {
      if (typeof value !== 'string' || !value) throw new Error('依赖模型归属不可核验')
      this.#modelIds.add(value)
    }
    const includeNamed = (name: string): void => {
      for (const row of models.rows) if (this.read(models, row, 'Name') === name) include(this.read(models, row, 'rowid'))
    }
    const includeQualified = (value: unknown): void => {
      if (typeof value !== 'string') return
      for (const row of models.rows) {
        const name = this.read(models, row, 'Name')
        if (typeof name === 'string' && value.startsWith(`${name}.`)) include(this.read(models, row, 'rowid'))
      }
    }
    const includeFunction = (value: Record<string, unknown>): void => {
      const name = value['Type'] === 'GetRefData' ? value['RefTableName'] : value['Type'] === 'GetGroupData' ? value['GroupTableName']
        : value['Type'] === 'GetExpData' ? value['refTableName'] : undefined
      if (typeof name === 'string') includeNamed(name)
      const keys = value['Type'] === 'GetTableField' ? ['Field'] : value['Type'] === 'GetRefData' ? ['RefFieldName', 'FkFieldName']
        : value['Type'] === 'GetGroupData' ? ['GroupField', 'Field'] : []
      for (const key of keys) includeQualified(value[key])
    }
    const includeTree = (tree: DataViewFilterTree): void => {
      if ('logic' in tree) {tree.filters.forEach(includeTree); return}
      includeQualified(tree.field)
      if (isRecord(tree.value) && typeof tree.value['Type'] === 'string') includeFunction(tree.value)
    }
    const includeFilter = (raw: unknown): boolean => {
      if (!configured(raw)) return false
      if (typeof raw !== 'string') throw new Error('模型依赖过滤原文无效')
      const tree = DataSpaceDesignApi.parseFilter(raw)?.toJSON()
      if (tree) includeTree(tree)
      return true
    }
    for (const row of models.rows) {
      const name = this.read(models, row, 'Name')
      const filters = ['Filter', 'JoinFilter'].map(key => includeFilter(this.read(models, row, key)))
      if (filters.some(Boolean)
        || typeof name === 'string' && [...this.#names].some(targetName => targetName.startsWith(`${name}.`) || name.startsWith(`${targetName}.`))) include(this.read(models, row, 'rowid'))
      const parent = this.read(models, row, 'PId')
      if (filters[1] && configured(parent)) include(parent)
    }
    for (const row of this.#expressions.rows) {
      const raw = this.read(this.#expressions, row, 'ValueFun')
      if (typeof raw !== 'string') throw new Error('模型依赖ValueFun原文无效')
      const fn = DataSpaceDesignApi.parseValueFunction(raw)
      include(this.read(this.#expressions, row, 'dataModelId'))
      if (fn?.Type === 'GetRefData' && this.read(this.#expressions, row, 'type') === 'dataModel') continue
      if (fn) includeFunction(fn)
    }
    for (const row of relations.rows) if (includeFilter(this.read(relations, row, 'filter'))) {
      include(this.read(relations, row, 'childModId')); include(this.read(relations, row, 'parentModId'))
    }
    fields.queryContext = {...fields.queryContext, modelIds: [...this.#modelIds].sort()}
    this.#contexts.set(fields, JSON.stringify(fields.queryContext))
    await this.query(fields)
    this.assertFieldScope()
  }

  /** 字段只来自这次显式读取的所属模型。 */
  assertFieldScope(): void {
    const fields = this.views[1]
    if (fields.rows.some(row => !this.#modelIds.has(String(this.read(fields, row, 'dataModelId'))))) throw new Error('模型命令字段不属于本次查询范围')
  }

  /** 变更使受影响的已加载消费者失效；retained仅包含调用方已经正式回读的视图，不回填数组。 */
  invalidate(changes: ReadonlyArray<{table: string; id: string}>, retained: readonly DataView[] = []): void {
    this.assertSiblingsClean()
    for (const source of this.views) {
      const ids = new Set(changes.filter(change => change.table === source.tableName).map(change => change.id))
      if (!ids.size) continue
      source.dataTable?.forEachView(view => {
        if (view === source || retained.includes(view) || view.requestState === RequestState.Idle) return
        if (view.rows.some(row => ids.has(String(view.getPkKey(row))))) view.clearAll()
      })
    }
  }

  /** 释放已无草稿的命令查询；不影响C原有命名视图。 */
  release(): void {
    this.assertOwner()
    for (const view of [...this.editing ? [this.views[0]] : [], this.views[1], this.views[2], this.#expressions]) {
      if (view.mutating || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw new Error('模型命令尚未结束，不能释放')
      view.dataTable?.destroyView(view.viewId)
    }
  }
}
