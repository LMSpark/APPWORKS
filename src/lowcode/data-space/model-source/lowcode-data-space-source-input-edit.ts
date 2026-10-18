/**
 * @module app:lowcode/data-space/model-source/lowcode-data-space-source-input-edit
 * 职责：编排正式来源入参ValueFun编辑与原生批次提交，未知结果通过显式查询核验。
 * 边界：不存数据副本，不改参数声明；原 DataSet 负责权限、delta、签名和传输，未知提交只核验。
 * AI用途：原生设计页维护接口/逻辑视图入参时使用，保留旧原文并显式选择空间参数引用。
 */
import {DataViewFilter, RequestState, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {DataSpaceDefinitionSave, type DataSpaceDefinitionSavePart} from './save/data-space-definition-save'

/** 单条来源入参的编辑流程；数据和授权始终留在正式元数据视图。 */
export class LowcodeDataSpaceSourceInputEdit {
  #status: 'idle' | 'pending' | 'unsubmitted' | 'unknown' | 'readback' = 'idle'
  readonly #view: DataView
  readonly #queryContext: string
  readonly #modelId: string
  readonly #name: string
  #baseline: unknown

  /** 捕获正式目标与查询上下文；onDispatch 使此前装配的目标定义失效，不代替数据库保存。 */
  constructor(private readonly dataSet: DataSet, private readonly targetId: string, private readonly fieldId: string,
    private readonly lifecycle: Readonly<{assertCurrent(): void; onDispatch(): void; assertEditable?(): void; refreshDirectory?(): Promise<void>}>,
    /** 正式入参字段的查询视图；目录单行入口与模型工作区保持独立查询基线。 */
    readonly viewId: 'default' | 'sourceInputFields' = 'default') {
    const view = dataSet.getView('Base_DataModel_Field', this.viewId)
    if (!view) throw new Error('DATA_SPACE_SOURCE_INPUT_CONTEXT: 缺少正式字段视图')
    this.#view = view
    this.#queryContext = JSON.stringify(view.queryContext)
    const row = view.rows.find(item => view.getPkKey(item) === fieldId)
    if (!row || ['rowid', 'dataSetId', 'dataModelId', 'Name', 'type'].some(field => view.fieldAccess(row, field).read !== 'visible')
      || typeof row['dataModelId'] !== 'string' || typeof row['Name'] !== 'string' || !row['Name'].trim()) {
      throw new Error('DATA_SPACE_SOURCE_INPUT_CONTEXT: 来源入参身份必须唯一且可读')
    }
    this.#modelId = row['dataModelId']; this.#name = row['Name']; this.#baseline = row['ValueFun']
    this.row(false)
  }

  private assertOwner(): void {
    this.lifecycle.assertCurrent()
    if (this.dataSet.destroyed || this.dataSet.getView('Base_DataModel_Field', this.viewId) !== this.#view
      || this.#view.dataTable?.modelBinding?.modelName !== 'Base_DataModel_Field'
      || JSON.stringify(this.#view.queryContext) !== this.#queryContext || this.#view.queryContext['dataSpaceId'] !== this.targetId
      || this.viewId === 'sourceInputFields' && this.#view.queryContext['modelId'] !== this.#modelId) {
      throw new Error('DATA_SPACE_SOURCE_INPUT_CONTEXT: 来源查询 owner 或目标已变化')
    }
  }

  private row(writable: boolean) {
    this.assertOwner()
    const view = this.#view
    const rows = view.rows.filter(item => view.getPkKey(item) === this.fieldId)
    const row = rows[0]
    if (!row || rows.length !== 1 || view.requestState !== RequestState.Loaded || view.mutating
      || ['rowid', 'dataSetId', 'dataModelId', 'Name', 'type', 'ValueFun'].some(field => view.fieldAccess(row, field).read !== 'visible')
      || row['rowid'] !== this.fieldId || row['dataSetId'] !== this.targetId || row['dataModelId'] !== this.#modelId
      || row['Name'] !== this.#name || row['type'] !== 'inputParams') throw new Error('DATA_SPACE_SOURCE_INPUT_CONTEXT: 来源入参身份、归属或读取状态无效')
    const modelView = this.dataSet.getView('Base_DataModel', 'default')
    const models = modelView?.rows.filter(item => modelView.getPkKey(item) === this.#modelId) ?? []
    const model = models[0]
    if (!model || !modelView || models.length !== 1
      || modelView.requestState !== RequestState.Loaded || modelView.mutating || modelView.queryContext['dataSpaceId'] !== this.targetId
      || modelView.dataTable?.modelBinding?.modelName !== 'Base_DataModel'
      || ['rowid', 'dataSetId', 'Type'].some(field => modelView.fieldAccess(model, field).read !== 'visible')
      || model['rowid'] !== this.#modelId || model['dataSetId'] !== this.targetId || !['接口', '视图'].includes(String(model['Type']))) {
      throw new Error('DATA_SPACE_SOURCE_INPUT_CONTEXT: 所属模型不是可确认的接口或逻辑视图')
    }
    if (writable && (view.fieldAccess(row, 'ValueFun').write !== 'allowed' || view.editActionState(row) !== 'enabled')) {
      throw new Error('DATA_SPACE_SOURCE_INPUT_PERMISSION: 当前来源入参不可写')
    }
    return row
  }

  /** 读取同一元数据空间中已保存的参数声明；来源替换与已有入参编辑共用。 */
  static readParameters(dataSet: DataSet, targetId: string) {
    const view = dataSet.getView('Base_DataSet', 'default')
    const row = view?.rows[0]
    if (!view || !row || view.rows.length !== 1 || view.total !== 1 || view.getPkKey(row) !== targetId
      || view.queryContext['dataSpaceId'] !== targetId || view.dataTable?.modelBinding?.modelName !== 'Base_DataSet'
      || view.fieldAccess(row, 'rowid').read !== 'visible' || row['rowid'] !== targetId
      || view.requestState !== RequestState.Loaded || view.mutating || view.fieldAccess(row, 'inputParams').read !== 'visible') {
      throw new Error('空间参数声明当前不可读，不能确认参数引用')
    }
    if (view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) throw new Error('请先保存或放弃空间参数声明修改，再选择参数引用')
    return DataSpaceDesignApi.readInputParameters({value: row['inputParams'], editable: true}).flatMap(item => {
      const name = item['Name'] ?? item['name']; const description = item['Description'] ?? item['description']
      return typeof name === 'string' && name.trim() ? [{value: name, label: typeof description === 'string' && description ? description : name}] : []
    })
  }

  /** 状态不含独立草稿；非 idle 状态必须先核验，不能重新发送保存。 */
  getState() {
    return {status: this.#status, pending: this.#view.hasEditingChanges(this.fieldId) || this.#view.dirtyTracking.hasPendingChanges(this.fieldId)}
  }

  /** 读取当前可见的编辑值与参数候选；声明异常只关闭参数引用，不阻止独立常量维护。 */
  read() {
    const row = this.row(false)
    const value = this.#view.getEditingRow(this.fieldId)?.['ValueFun']
    if (value !== undefined && value !== null && typeof value !== 'string') throw new Error('ValueFun不是文本；原始记录保留')
    let inputParams: Array<{value: string; label: string}> = []
    let parameterWarning = ''
    try {inputParams = LowcodeDataSpaceSourceInputEdit.readParameters(this.dataSet, this.targetId)} catch (cause) {parameterWarning = cause instanceof Error ? cause.message : String(cause)}
    return {name: this.#name, value, inputParams, parameterWarning,
      writable: this.#view.fieldAccess(row, 'ValueFun').write === 'allowed' && this.#view.editActionState(row) === 'enabled'}
  }

  /** 校验明确选择的来源取值；不转换已有SystemData，不执行值函数。 */
  static validateValue(dataSet: DataSet, targetId: string, name: string, value: unknown): void {
    if (typeof value !== 'string') throw new Error('ValueFun必须是值函数字符串')
    if (value === '') return
    const expression = DataSpaceDesignApi.parseValueFunction(value)
    if (expression?.Type === 'GetInputParam') {
      if (this.readParameters(dataSet, targetId).filter(item => item.value === expression['ParamName']).length !== 1) throw new Error('空间参数引用未声明或名称不唯一')
    } else if (expression?.Type !== 'GetConstValue' || expression['Value'] === undefined
      || !DataViewFilter.parse({field: name, operator: 'eq', value: expression}).ok) {
      throw new Error('来源入参仅支持显式空间参数引用或JSON常量；旧原文不会自动转换')
    }
  }

  private validate(value: unknown): void {LowcodeDataSpaceSourceInputEdit.validateValue(this.dataSet, this.targetId, this.#name, value)}

  private assertEditable(status: 'idle' | 'pending' = 'idle', writable = true): void {
    this.lifecycle.assertEditable?.()
    if (this.#status !== status || this.#view.dirtyTracking.hasPendingChanges()) throw new Error('请先核验待提交或结果未知的来源入参')
    if (this.row(writable)['ValueFun'] !== this.#baseline) throw new Error('来源入参原文已变化，请重新核验')
    if (Object.keys(this.#view.getEditingPatch(this.fieldId) ?? {}).some(field => field !== 'ValueFun')) throw new Error('来源入参只允许修改ValueFun')
  }

  /** 经显式选择更新原 ValueFun 编辑覆盖；不会转换未编辑的旧 SystemData。 */
  stage(value: string): void {
    this.assertEditable(); this.validate(value)
    this.#view.updateEditingValue(this.fieldId, 'ValueFun', value)
  }

  /** 只放弃未派发的编辑；不能取消已经提交或结果未知的请求。 */
  discard(): void {
    this.assertOwner()
    if (this.#status !== 'idle') throw new Error('请通过重新核验处理已派发的修改')
    this.#view.discardEditingRows([this.fieldId])
  }

  /** 原单行入口复用同一批次流程，不额外维护保存通道。 */
  async save(): Promise<void> {
    const part = LowcodeDataSpaceSourceInputEdit.prepareSave([this])
    if (part) await DataSpaceDefinitionSave.run([part])
  }

  /** 供模型工作区定位已有流程；不返回记录内容或权限。 */
  belongsTo(modelId: string, viewId: 'default' | 'sourceInputFields'): boolean {
    return this.#modelId === modelId && this.viewId === viewId
  }

  /** 同一模型结构命令可保留来源入参草稿；只允许已定义的空间参数/常量修改，未决结果须先核验。 */
  assertWorkspaceChanges(): void {
    if (!['idle', 'pending'].includes(this.#status)) throw new Error('请先核验结果未确认的来源入参')
    this.lifecycle.assertEditable?.()
    const row = this.row(false), value = this.#view.getEditingRow(this.fieldId)?.['ValueFun']
    if (this.#view.dirtyTracking.isPendingCreate(this.fieldId) || this.#view.dirtyTracking.isPendingDelete(this.fieldId)
      || Object.keys(this.#view.getEditingPatch(this.fieldId) ?? {}).some(key => key !== 'ValueFun')
      || Object.keys(this.#view.dirtyTracking.getDiff(this.fieldId, row)).some(key => key !== 'ValueFun')) throw new Error('来源入参只允许修改ValueFun')
    if (this.getState().pending || value !== this.#baseline) {this.row(true); this.validate(value)}
  }

  private static batch(owners: readonly LowcodeDataSpaceSourceInputEdit[]): LowcodeDataSpaceSourceInputEdit {
    const first = owners[0]
    if (!first || new Set(owners.map(owner => owner.fieldId)).size !== owners.length || owners.some(owner =>
      owner.dataSet !== first.dataSet || owner.targetId !== first.targetId || owner.#modelId !== first.#modelId || owner.#view !== first.#view)) {
      throw new Error('来源入参批次必须属于同一实例、空间、模型和视图，且身份唯一')
    }
    owners.forEach(owner => owner.assertOwner())
    return first
  }

  /** 提取原来源入参保存阶段，完整预检后与模型/字段共用一次DataSet提交。 */
  static prepareSave(owners: readonly LowcodeDataSpaceSourceInputEdit[]): DataSpaceDefinitionSavePart | undefined {
    if (!owners.length) return
    const first = this.batch(owners), view = first.#view
    owners.forEach(owner => owner.assertEditable('idle', view.hasEditingChanges(owner.fieldId)))
    const changes = owners.filter(owner => view.hasEditingChanges(owner.fieldId)).map(owner => {
      const value = view.getEditingRow(owner.fieldId)?.['ValueFun']; owner.validate(value)
      return {owner, value}
    })
    if (!changes.length) return
    const changedIds = changes.map(({owner}) => owner.fieldId)
    const assertDraft = (status: 'idle' | 'pending') => {
      owners.forEach(owner => owner.assertEditable(status, view.hasEditingChanges(owner.fieldId)))
      for (const {owner, value} of changes) {
        if (view.getEditingRow(owner.fieldId)?.['ValueFun'] !== value) throw new Error('来源入参草稿已变化')
        owner.validate(value)
      }
    }
    return {
      dataSet: first.dataSet, targetId: first.targetId, modelId: first.#modelId,
      prepare: () => {assertDraft('idle'); owners.forEach(owner => {owner.#status = 'pending'}); return Promise.resolve()},
      apply: async () => {
        assertDraft('pending')
        const applied = await view.applyEditingRows(changedIds)
        if (!applied.success || applied.data?.appliedCount !== changes.length || applied.data.failedCount !== 0) throw new Error('来源入参编辑尚未完整应用')
      },
      check: () => {
        if (changedIds.some(id => view.hasEditingChanges(id))) throw new Error('提交前来源配置草稿已变化')
        for (const {owner, value} of changes) {
          owner.lifecycle.assertEditable?.()
          if (owner.row(true)['ValueFun'] !== value) throw new Error('提交前来源入参已变化')
          owner.validate(value)
        }
      },
      targets: () => [{tableName: view.tableName, viewId: view.viewId, ids: changedIds}],
      dispatched: () => first.lifecycle.onDispatch(),
      confirm: async () => {
        await first.lifecycle.refreshDirectory?.()
        for (const {owner, value} of changes) if (owner.row(false)['ValueFun'] !== value) throw new Error('来源入参确认结果与提交值不一致')
        owners.forEach(owner => {owner.#baseline = owner.row(false)['ValueFun']; owner.#status = 'idle'})
      },
      failed: stage => {owners.forEach(owner => {owner.#status = stage === 'confirmed' ? 'readback' : stage === 'dispatched' ? 'unknown' : stage === 'applying' ? 'unsubmitted' : 'idle'})},
    }
  }

  private async readback(): Promise<void> {
    this.assertOwner()
    if (this.#view.hasEditingChanges() || this.#view.dirtyTracking.hasPendingChanges()) throw new Error('请先明确处理字段草稿，不能用回读覆盖修改')
    const result = await this.#view.loadFromServer({filter: this.#view.filterExpression ?? {field: 'dataSetId', operator: 'eq', value: this.targetId}, sort: 'rowid:asc', allPages: true, maxRows: 50000})
    this.assertOwner()
    if (!result.success || this.#view.loadingError || this.#view.rows.some(row => this.#view.fieldAccess(row, 'dataSetId').read !== 'visible' || row['dataSetId'] !== this.targetId)) {
      throw new Error('来源入参回读失败或包含其他空间记录')
    }
    if (this.viewId === 'sourceInputFields' && this.#view.rows.some(row => row['dataModelId'] !== this.#modelId || row['type'] !== 'inputParams')) throw new Error('来源入参回读包含其他模型或字段用途')
    await this.lifecycle.refreshDirectory?.()
    this.#baseline = this.row(false)['ValueFun']
  }

  /** 显式处理当前行并回读；未知提交不会重放。 */
  reload(discardPending: boolean): Promise<void> {return LowcodeDataSpaceSourceInputEdit.reloadBatch([this], discardPending)}

  /** 批次核验保留范围外草稿；只能显式放弃本批差异，不能隐式回滚正式结果。 */
  static async reloadBatch(owners: readonly LowcodeDataSpaceSourceInputEdit[], discardPending: boolean): Promise<void> {
    await this.prepareReloadBatch(owners, discardPending)()
  }

  /** 同步放弃本次来源入参差异，返回只读核验；联合操作先准备全部目标，核验不能取消准备后的新编辑。 */
  static prepareReloadBatch(owners: readonly LowcodeDataSpaceSourceInputEdit[], discardPending: boolean): () => Promise<void> {
    owners = [...owners]
    if (!owners.length) return async () => {}
    const first = this.batch(owners), view = first.#view, ids = owners.map(owner => owner.fieldId)
    if (owners.some(owner => owner.#status === 'pending') || view.mutating || view.requestState === RequestState.Loading) throw new Error('来源入参请求仍在进行')
    if (owners.some(owner => owner.getState().pending) && !discardPending) throw new Error('本地修改尚未明确放弃')
    if (view.rows.some(row => !ids.includes(String(view.getPkKey(row)))
      && (view.hasEditingChanges(view.getPkKey(row)) || view.dirtyTracking.hasPendingChanges(view.getPkKey(row))))) throw new Error('请先处理其他字段草稿，不能用回读覆盖修改')
    if (discardPending) view.discardPendingChanges(ids)
    return async () => {
      if (owners.some(owner => owner.#status === 'pending') || view.mutating || view.requestState === RequestState.Loading) throw new Error('来源入参请求仍在进行')
      owners.forEach(owner => {owner.#status = 'pending'})
      try {
        await first.readback()
        owners.forEach(owner => {owner.#baseline = owner.row(false)['ValueFun']; owner.#status = 'idle'})
      } catch (cause) {owners.forEach(owner => {owner.#status = 'readback'}); throw cause}
    }
  }
}
