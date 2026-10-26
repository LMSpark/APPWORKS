/**
 * @module app:views/app/dev-system/blueprint-workspace/blueprint-workspace-dataview
 * 职责：让蓝图阶段字段共用正式 Base_NavigationInfo DataView 的查询、编辑覆盖、取消和 DataSet 保存。
 * 边界：不扩展模型字段/输出，不复制业务草稿；字段读写仅由正式 DataView 查询结果授权。
 */
import {DataViewFilter, RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {LOWCODE_APPLICATION_CATALOG_FORM_KEY} from '@spark-appworks/spark-lowcode-api'

export const BLUEPRINT_WORKSPACE_FIELD_NAMES = Object.freeze([
  'rowid', 'SysId', 'name', 'memo', 'htmlDesc', 'conid', 'conType', 'NavigationUrl', 'VersionId',
  'DifficultyFactor', 'Manhour', 'Number', 'Sum', 'Total', 'personCharge', 'status', 'IsShowAtNav', 'NavigationType',
  'NavigationImageWxz', 'MobileUrl', 'IsShowChildItem', 'BeginGroup', 'NavigationShowType', 'ChildItemLocation',
  'HorizontalAlignment',
] as const)

const MODEL_NAME = 'Base_NavigationInfo'
const VIEW_NAME = 'default'
const MAX_BLUEPRINT_ROWS = 50_000

/** 一个已查询目标的 DataView 编辑入口；正式元数据和查询权限均由原 DataSpace owner 提供。 */
export class BlueprintWorkspaceDataView {
  readonly view: DataView
  #projectId: string
  #nodeId = ''
  #row: DataRow | undefined
  #revision = 0
  #disposed = false
  #queryOutputFields: ReadonlySet<string>

  public constructor(
    public readonly dataSet: DataSet,
    projectId: string,
    private readonly assertCurrent: () => void,
  ) {
    this.#projectId = projectId.trim()
    if (!this.#projectId) throw new Error('蓝图 DataView 缺少项目身份')
    if (dataSet.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY) throw new Error('蓝图 DataView 场景身份不匹配')
    const table = dataSet.getTable(MODEL_NAME)
    const view = dataSet.getView(MODEL_NAME, VIEW_NAME)
    if (!table || !view || table.modelBinding?.modelName !== MODEL_NAME || !table.modelBinding.modelId.trim()) {
      throw new Error('蓝图 DataView 未绑定正式 Base_NavigationInfo 模型')
    }
    this.view = view
    this.view.commitMode = 'staged'
    const queryOutputFields = new Set(view.queryColumns.map(column => column.name))
    this.#queryOutputFields = queryOutputFields
    const queryFields = BLUEPRINT_WORKSPACE_FIELD_NAMES.filter(field => queryOutputFields.has(field))
    if (!queryOutputFields.has('rowid') || !queryOutputFields.has('SysId')) {
      throw new Error('蓝图 DataView 缺少正式可输出的 rowid 或 SysId')
    }
    this.view.autoLoad = false
    this.view.queryConfig = {...this.view.queryConfig, fields: queryFields, allPages: false, maxRows: MAX_BLUEPRINT_ROWS, autoQuery: false}
  }

  public get projectId(): string {return this.#projectId}
  public get nodeId(): string {return this.#nodeId}
  public get row(): DataRow | undefined {return this.#row}
  public get dirty(): boolean {
    if (this.hasUnconfirmedSave) return true
    const id = this.#row === undefined ? undefined : this.view.getPkKey(this.#row)
    return id !== undefined && (this.view.hasEditingChanges(id) || this.view.dirtyTracking.hasPendingChanges(id))
  }
  public get hasUnconfirmedSave(): boolean {return this.view.hasUnconfirmedSave}
  public get isBusy(): boolean {return this.view.mutating || this.view.requestState === RequestState.Loading}

  public async load(nodeId: string): Promise<void> {
    this.assertUsable()
    const targetNodeId = nodeId.trim()
    if (!targetNodeId) throw new Error('蓝图 DataView 缺少节点身份')
    if (this.isBusy) throw new Error('蓝图 DataView 正在查询或保存')
    if (this.dirty) throw new Error('蓝图 DataView 有未保存修改，请先保存或取消')
    const revision = ++this.#revision
    this.#nodeId = targetNodeId
    this.#row = undefined
    this.view.filterExpression = DataViewFilter.group({logic: 'and', filters: [
      DataViewFilter.condition({field: 'SysId', operator: 'eq', value: this.#projectId}).toJSON(),
      DataViewFilter.condition({field: 'rowid', operator: 'eq', value: targetNodeId}).toJSON(),
    ]}).toJSON()
    await this.view.refresh()
    this.assertTarget(revision, targetNodeId)
    if (this.view.loadingError) throw this.view.loadingError
    if (this.view.rows.length !== 1) throw new Error(`蓝图 DataView 应返回唯一目标，实际返回 ${this.view.rows.length} 行`)
    const row = this.view.rows[0]
    if (row?.['rowid'] !== targetNodeId || row['SysId'] !== this.#projectId
      || this.view.fieldAccess(row, 'rowid').read !== 'visible' || this.view.fieldAccess(row, 'SysId').read !== 'visible') {
      throw new Error('蓝图 DataView 返回了身份不匹配或不可读的目标行')
    }
    this.#row = row
  }

  public hasOutput(field: string): boolean {
    return this.#queryOutputFields.has(field)
  }

  public canRead(field: string): boolean {
    this.assertUsable()
    const row = this.#row
    if (!row || !this.view.rows.includes(row) || row['rowid'] !== this.#nodeId || row['SysId'] !== this.#projectId) return false
    return this.hasOutput(field) && Object.hasOwn(row, field) && this.view.fieldAccess(row, field).read === 'visible'
  }

  public canWrite(field: string): boolean {
    if (!this.canRead(field)) return false
    const row = this.#row
    if (!row) return false
    const column = this.view.dataTable?.columns.find(candidate => candidate.name === field)
    return column !== undefined && !column.isComputed && !column.computeExpression
      && this.view.editActionState(row) === 'enabled' && this.view.fieldAccess(row, field).write === 'allowed'
  }

  public value(field: string): unknown {
    const row = this.#row
    if (!row || !this.canRead(field)) return undefined
    return this.canRead(field) ? this.view.getEditingRow(this.requireRowKey(row))?.[field] : undefined
  }

  public update(field: string, value: unknown): void {
    if (this.isBusy) throw new Error('查询或保存期间不能编辑蓝图字段')
    if (this.hasUnconfirmedSave) throw new Error('蓝图 DataView 保存结果未确认，请先通过原 DataSet 保存入口核验')
    const row = this.currentRow()
    if (!this.canWrite(field)) throw new Error(`蓝图字段 ${field} 不存在于正式输出或当前查询权限不允许写入`)
    this.view.updateEditingValue(this.requireRowKey(row), field, value)
  }

  /** 丢弃 DataView 编辑覆盖或已暂存行修改；没有页面副本需要清空。 */
  public cancel(): void {
    this.assertUsable()
    if (this.isBusy) throw new Error('保存或查询期间不能取消蓝图修改')
    if (this.hasUnconfirmedSave) throw new Error('保存结果未确认，不能取消；请先沿原 DataSet 保存入口核验')
    const row = this.#row
    if (!row) return
    const id = this.requireRowKey(row)
    if (this.dirty) {
      this.view.discardPendingChanges([id])
      this.#row = this.view.rows.find(candidate => this.view.getPkKey(candidate) === id
        && candidate['rowid'] === this.#nodeId && candidate['SysId'] === this.#projectId)
      if (!this.#row) throw new Error('蓝图 DataView 取消后未恢复目标行')
    }
  }

  public async save(): Promise<void> {
    this.assertUsable()
    if (this.isBusy) throw new Error('蓝图 DataView 正在查询或保存')
    const row = this.currentRow(), id = this.requireRowKey(row), targetNodeId = this.#nodeId, revision = this.#revision
    if (this.hasUnconfirmedSave) {
      const recovered = await this.dataSet.saveChanges({views: [{tableName: this.view.tableName, viewId: this.view.viewId, ids: [id]}]})
      this.assertTarget(revision, targetNodeId)
      if (!recovered.success) throw recovered.error ?? new Error(recovered.message ?? '蓝图 DataView 未确认保存仍无法核验')
      await this.view.refresh()
      this.assertTarget(revision, targetNodeId)
      if (this.view.loadingError) throw this.view.loadingError
      const recoveredRow = this.view.rows.find(candidate => candidate['rowid'] === targetNodeId && candidate['SysId'] === this.#projectId)
      if (!recoveredRow) throw new Error('蓝图 DataView 核验后未读回目标行')
      this.#row = recoveredRow
      return
    }
    const patch = this.view.getEditingPatch(id)
    if (patch && Object.keys(patch).some(field => !this.canWrite(field))) throw new Error('蓝图编辑包含当前查询不允许写入的字段')
    if (patch && Object.keys(patch).length > 0) {
      const applied = await this.view.applyEditingRows([id])
      this.assertTarget(revision, targetNodeId)
      if (!applied.success || !applied.data || applied.data.failedCount > 0) throw new Error(applied.data?.failedErrors[String(id)] ?? '蓝图 DataView 编辑应用失败')
    }
    if (!this.view.dirtyTracking.hasPendingChanges(id)) return
    const result = await this.dataSet.saveChanges({views: [{tableName: this.view.tableName, viewId: this.view.viewId, ids: [id]}]})
    this.assertTarget(revision, targetNodeId)
    if (!result.success) throw result.error ?? new Error(result.message ?? '蓝图 DataView 保存失败')
    await this.view.refresh()
    this.assertTarget(revision, targetNodeId)
    if (this.view.loadingError) throw this.view.loadingError
    const saved = this.view.rows.find(candidate => candidate['rowid'] === targetNodeId && candidate['SysId'] === this.#projectId)
    if (!saved) throw new Error('蓝图 DataView 保存后未读回目标行')
    this.#row = saved
    if (patch) for (const [field, value] of Object.entries(patch)) {
      if (!this.canRead(field) || !Object.is(saved[field], value)) throw new Error(`蓝图字段 ${field} 保存后读回不一致`)
    }
  }

  public dispose(): void {
    this.#disposed = true
    this.#revision++
    this.#row = undefined
    this.#nodeId = ''
  }

  private currentRow(): DataRow {
    this.assertUsable()
    const row = this.#row
    if (!row || !this.view.rows.includes(row) || row['rowid'] !== this.#nodeId || row['SysId'] !== this.#projectId) {
      throw new Error('蓝图 DataView 当前目标已失效')
    }
    return row
  }

  private requireRowKey(row: DataRow): string | number {
    const id = this.view.getPkKey(row)
    if ((typeof id !== 'string' && typeof id !== 'number') || String(id) !== this.#nodeId) throw new Error('蓝图 DataView 正式主键与节点身份不匹配')
    return id
  }

  private assertTarget(revision: number, nodeId: string): void {
    this.assertUsable()
    if (revision !== this.#revision || this.#nodeId !== nodeId) throw new Error('蓝图 DataView 查询结果已过期')
  }

  private assertUsable(): void {
    if (this.#disposed) throw new Error('蓝图 DataView 已释放')
    this.assertCurrent()
    if (this.dataSet.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY || this.dataSet.getView(MODEL_NAME, VIEW_NAME) !== this.view) {
      throw new Error('蓝图 DataView 场景或视图身份已变化')
    }
  }
}
