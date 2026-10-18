/**
 * @module lowcode-data-space-input-parameter-edit
 * 职责：复用正式 DataView/save owner 编排参数声明的暂存、提交及精确回读。
 * 边界：草稿仍归 DataView；结果未知只核验，不重放写入，不修改引用或文件。
 * AI用途：元数据会话通过同一入口处理声明编辑和恢复。
 */
import {RequestState, type DataView, type DataSet} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
/** 声明保存期间只记录流程状态，不储存独立数据草稿。 */
type ParameterEditStatus = 'idle' | 'pending' | 'unsubmitted' | 'unknown' | 'readback'

/** 单个正式空间记录的编辑编排；调用方负责每次操作的宿主生命周期。 */
export class LowcodeDataSpaceInputParameterEdit {
  #status: ParameterEditStatus = 'idle'
  readonly #dataSet: DataSet
  readonly #queryContext: string

  /** 绑定已存在的正式视图与业务目标；assertCurrent 由宿主或元数据会话核验生命周期。 */
  constructor(private readonly view: DataView, private readonly targetId: string, private readonly assertCurrent: () => void) {
    if (!view.dataSet) throw new Error('DATA_SPACE_INPUT_PARAMETERS_CONTEXT: 缺少正式数据空间')
    this.#dataSet = view.dataSet
    this.#queryContext = JSON.stringify(view.queryContext)
  }

  /** 结果未知和待回读都不能直接重新提交；pending 仅反映本地修改。 */
  getState(): {status: ParameterEditStatus; pending: boolean} {
    return {status: this.#status, pending: this.view.dirtyTracking.hasPendingChanges(this.targetId) || this.view.hasEditingChanges(this.targetId)}
  }

  private assertOwner(): void {
    this.assertCurrent()
    if (this.#dataSet.destroyed || this.view.dataSet !== this.#dataSet
      || this.#dataSet.getView(this.view.tableName, this.view.viewId) !== this.view
      || this.view.dataTable?.modelBinding?.modelName !== 'Base_DataSet'
      || JSON.stringify(this.view.queryContext) !== this.#queryContext
      || (Object.hasOwn(this.view.queryContext, 'dataSpaceId') && this.view.queryContext['dataSpaceId'] !== this.targetId)) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_CONTEXT: 参数声明查询 owner 或目标已变化')
    }
  }

  private row(writable: boolean, view = this.view) {
    this.assertOwner()
    const row = view.rows[0]
    if (!row || view.rows.length !== 1 || view.total !== 1
      || view.getPkKey(row) !== this.targetId || row['rowid'] !== this.targetId
      || view.requestState !== RequestState.Loaded || view.mutating
      || view.fieldAccess(row, 'rowid').read !== 'visible'
      || view.fieldAccess(row, 'inputParams').read !== 'visible'
      || (writable && (view.fieldAccess(row, 'inputParams').write !== 'allowed'
        || view.editActionState(row) !== 'enabled'))) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_CONTEXT: 参数声明目标或当次读写权限无效')
    }
    return row
  }

  private assertEditable(expectedValue: unknown): void {
    if (this.#status !== 'idle' || this.view.dirtyTracking.hasPendingChanges(this.targetId)) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 请先核验待提交或结果未知的声明')
    }
    const row = this.row(true)
    if (JSON.stringify(row['inputParams']) !== JSON.stringify(expectedValue)) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_STALE: 参数声明原文已变化')
    }
    if (Object.keys(this.view.getEditingPatch(this.targetId) ?? {}).some(key => key !== 'inputParams')) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_FIELDS: 声明提交不能包含其他字段修改')
    }
  }

  /** 只更新原 DataView 编辑覆盖；无语义变化时保留原始声明文本。 */
  stage(input: Readonly<{expectedValue: unknown; value: unknown}>): void {
    this.assertEditable(input.expectedValue)
    const result = DataSpaceDesignApi.prepareInputParameters({value: input.value, original: input.expectedValue})
    this.view.updateEditingValue(this.targetId, 'inputParams', result.changed ? JSON.stringify(result.items) : input.expectedValue)
  }

  /** 经原 save owner 单次提交，校验回执并精确回读；异常保留核验状态。 */
  async save(input: Readonly<{expectedValue: unknown; onReceipt?: () => void}>): Promise<Array<Record<string, unknown>>> {
    this.assertEditable(input.expectedValue)
    const result = DataSpaceDesignApi.prepareInputParameters({value: this.view.getEditingRow(this.targetId)?.['inputParams'], original: input.expectedValue})
    this.stage({expectedValue: input.expectedValue, value: result.items})
    if (!result.changed) return result.items
    const submitted = JSON.stringify(result.items)
    this.#status = 'pending'
    let confirmed = false
    let dispatched = false
    try {
      const applied = await this.view.applyEditingRows([this.targetId])
      if (!applied.success || applied.data?.failedCount !== 0 || applied.data.appliedCount !== 1) {
        throw new Error('DATA_SPACE_INPUT_PARAMETERS_APPLY: 输入参数编辑尚未应用')
      }
      const row = this.row(true)
      if (row['inputParams'] !== submitted || this.view.hasEditingChanges(this.targetId)) {
        throw new Error('DATA_SPACE_INPUT_PARAMETERS_STALE: 提交前声明已变化')
      }
      dispatched = true
      const saved = await this.#dataSet.saveChanges({applyEditingRows: false,
        views: [{tableName: this.view.tableName, viewId: this.view.viewId, ids: [this.targetId]}]})
      if (!saved.success || saved.data?.savedCount !== 1 || saved.data.failedCount !== 0 || saved.data.failedEditingRows !== 0) {
        throw new Error('DATA_SPACE_INPUT_PARAMETERS_RECEIPT: 输入参数保存回执未确认唯一目标行成功')
      }
      confirmed = true
      this.assertOwner()
      input.onReceipt?.()
      // 原视图已接纳保存回执；精确核验不能刷新它并拒绝或覆盖提交后的新编辑。
      const verification = this.view.createQueryView(`parameterCheck_${crypto.randomUUID().replaceAll('-', '')}`)
      try {
        const items = await this.readback(verification)
        if (JSON.stringify(items) !== submitted) throw new Error('DATA_SPACE_INPUT_PARAMETERS_READBACK: 输入参数保存后回读值与提交值不一致')
        this.#status = 'idle'
        return items
      } finally {verification.dataTable?.destroyView(verification.viewId)}
    } catch (error) {
      this.#status = confirmed ? 'readback' : dispatched ? 'unknown' : 'unsubmitted'
      throw error
    }
  }

  private async readback(view = this.view): Promise<Array<Record<string, unknown>>> {
    this.assertOwner()
    if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 请先明确处理本地修改')
    const result = await view.loadFromServer({
      filter: {field: 'rowid', operator: 'eq', value: this.targetId}, sort: 'rowid:asc', allPages: true, maxRows: 50000})
    this.assertOwner()
    if (!result.success || view.loadingError) throw new Error('DATA_SPACE_INPUT_PARAMETERS_READBACK: 输入参数重新读取失败')
    return DataSpaceDesignApi.readInputParameters({value: this.row(false, view)['inputParams']})
  }

  /** 只回读，不重放保存；丢弃本地变更必须由调用方明确选择。 */
  async reload(input: Readonly<{discardPending: boolean}>, refresh?: () => Promise<void>): Promise<Array<Record<string, unknown>>> {
    this.assertOwner()
    if (this.#status === 'pending' || this.view.mutating || this.view.requestState === RequestState.Loading) {
      throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 请求仍在进行')
    }
    if (this.getState().pending && !input.discardPending) throw new Error('DATA_SPACE_INPUT_PARAMETERS_PENDING: 本地修改尚未明确放弃')
    if (input.discardPending) this.view.discardPendingChanges([this.targetId])
    this.#status = 'pending'
    try {
      let items: Array<Record<string, unknown>>
      if (refresh) {
        const before = this.view.rows
        await refresh()
        this.assertOwner()
        if (this.view.rows === before || this.getState().pending) throw new Error('DATA_SPACE_INPUT_PARAMETERS_READBACK: 页面未完成新的声明查询')
        items = DataSpaceDesignApi.readInputParameters({value: this.row(false)['inputParams']})
      } else items = await this.readback()
      this.#status = 'idle'
      return items
    } catch (error) {
      this.#status = 'readback'
      throw error
    }
  }
}
