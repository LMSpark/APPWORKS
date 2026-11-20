/**
 * @module @spark-appworks/spark-project-model:scenario/scenario-view-data
 * 职责：用原生 DataView 保存单个场景配置文件的编辑值与变更。
 * 边界：文件 IO、冲突和未知结果核验由文件 owner 注入；不伪造后端模型或业务权限。
 * AI用途：文件配置复用 DataSet.saveChanges 的捕获、提交及回执处理。
 */
import {DataSet, type DataView} from '@spark-appworks/spark-data'

type QueryOwner = Parameters<DataView['bindQueryExecutor']>[0]
type QueryResult = Awaited<ReturnType<QueryOwner['executeQuery']>>
type SaveCommand = Parameters<NonNullable<QueryOwner['save']>>[0]
/** 实际存储适配：写入并核实提交原文；不确定结果须拒绝，不能伪造成功回执。 */
type WriteText = (text: string) => Promise<void>

/** 单文件的数据适配；唯一可编辑原文由原生视图持有。 */
export class ScenarioViewData {
  readonly #dataSet: DataSet
  readonly #view: DataView
  #context: QueryResult
  #write: WriteText | undefined
  readonly #resource = {resourceType: 'file', resourceId: 'pagedata.json'}

  /** 从文件读取基线及当前原文装配视图；baseline 为 null 表示明确缺失的新文件。 */
  constructor(private readonly scenarioId: string, baseline: string | null, text: string,
    private readonly assertValid: () => void) {
    this.#dataSet = DataSet.fromJson({scenarioId, dataSetName: 'ScenarioConfiguration', tables: {
      ScenarioConfiguration: {tableName: 'ScenarioConfiguration', ...this.#resource,
        columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'text', type: 'string', required: true}],
        views: {default: {autoLoad: false, commitMode: 'staged'}}},
    }})
    const view = this.#dataSet.getView('ScenarioConfiguration')
    if (!view) throw new Error('SCENARIO_VIEW_DATA: 缺少文件视图')
    this.#view = view
    this.#context = this.context(baseline)
    view.bindQueryExecutor({executeQuery: () => Promise.resolve(this.#context), save: command => this.write(command)},
      {resource: this.#resource, initialResult: this.#context})
    if (baseline === null) {
      view.appendRow({id: scenarioId, text})
      const row = view.rows[0]
      if (!row) throw new Error('SCENARIO_VIEW_DATA: 缺少新文件记录')
      view.dirtyTracking.trackCreate(scenarioId, row)
    } else this.text = text
  }

  /** 原生 DataView 的当前原文，包括尚未提交的编辑覆盖。 */
  get text(): string {
    const row = this.#view.getEditingRow(this.scenarioId) ?? this.#view.rows[0]
    if (typeof row?.['text'] !== 'string') throw new Error('SCENARIO_VIEW_DATA: 原文无效')
    return row['text']
  }

  set text(value: string) {this.#view.updateEditingValue(this.scenarioId, 'text', value)}

  private context(text: string | null): QueryResult {
    const rows = text === null ? [] : [{id: this.scenarioId, text}]
    return {
      rows, total: rows.length,
      assertIdentity: identity => {
        this.assertValid()
        if (identity.scenarioId !== this.scenarioId || identity.metaName !== 'ScenarioConfiguration'
          || identity.resource?.resourceType !== this.#resource.resourceType
          || identity.resource.resourceId !== this.#resource.resourceId) throw new Error('SCENARIO_VIEW_DATA_IDENTITY: 文件身份已变化')
      },
      rowKey: row => row['id'],
      prepareNewRow: row => ({...row, id: this.scenarioId}),
      fieldAccess: (_key, field) => ({read: 'visible', write: field === 'text' ? 'allowed' : 'denied',
        component: field === 'text' ? 'editable' : 'readonly', required: field === 'text', writeMode: field === 'text' ? 'required' : 'readonly'}),
      readFieldAccess: () => 'visible',
      addActionState: available => text === null && available !== false ? 'enabled' : 'disabled',
      editActionState: (key, available) => key === this.scenarioId && available !== false ? 'enabled' : 'disabled',
      deleteActionState: () => 'disabled', createChildActionState: () => 'disabled',
      viewActionState: (key, available) => key === this.scenarioId && available !== false ? 'enabled' : 'disabled',
    }
  }

  private async write(command: SaveCommand) {
    this.assertValid()
    const change = command.changes[0]
    if (!this.#write || command.changes.length !== 1 || change?.context !== this.#context) {
      throw new Error('SCENARIO_VIEW_DATA_IDENTITY: 保存上下文不一致')
    }
    change.context.assertIdentity(change.identity)
    const added = change.changes.added ?? [], changed = change.changes.changed ?? []
    const rows = [...added, ...changed], row = rows[0]
    if (rows.length !== 1 || change.changes.deleted?.length || row?.['id'] !== this.scenarioId
      || typeof row['text'] !== 'string' || (this.#context.rows.length === 0 ? added.length !== 1 : changed.length !== 1)) {
      throw new Error('SCENARIO_VIEW_DATA_CHANGE: 文件只能新增或修改当前原文')
    }
    await this.#write(row['text'])
    this.assertValid()
    const context = this.context(row['text'])
    this.#context = context
    return [{metaName: 'ScenarioConfiguration', added, changed, deleted: [],
      changedFields: changed.map(() => ['text']), context}]
  }

  /** 仅提交原生 DataSet 已追踪的变更；回执之后保留保存期间产生的新编辑。 */
  async save(write: WriteText): Promise<void> {
    if (this.#write) throw new Error('SCENARIO_VIEW_SAVE_PENDING: 文件正在提交')
    this.#write = write
    try {
      const result = await this.#dataSet.saveChanges()
      if (!result.success) throw new Error(result.message ?? 'SCENARIO_VIEW_DATA_SAVE: 文件变更提交失败')
    } finally {this.#write = undefined}
  }

  /** 释放文件运行视图及其编辑状态；不执行持久化。 */
  destroy(): void {this.#dataSet.destroy()}
}
