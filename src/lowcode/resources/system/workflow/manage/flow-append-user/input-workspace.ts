/**
 * @module app:lowcode/resources/system/workflow/manage/flow-append-user/input-workspace
 * 职责：同DataSet持有追加参数，按原配置和候选捕获不可变命令。
 * 边界：不复制可编辑人员数组；只释放已确定未派发的本次输入/候选视图。
 */
import {bindDataSetReadonlyCommandQuery, buildDataViewKey, ensureDataSetStaticInputTable, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {captureFlowAppendStep} from './flow-append-user-list'
import {normalizeFlowAppendUserContext, type FlowAppendUserContext} from './flow-append-user-records'
import {captureAppendConfiguration, captureAppendSelection, readFlowAppendReceivers} from './command-input'
import {createFlowRunCandidatesBinding} from '../flow-run-page/query/candidates-binding'

export class FlowAppendInputWorkspace {
  readonly parameters: DataView
  private target: FlowAppendUserContext | undefined
  private proof: (() => void) | undefined
  private candidateView: DataView | undefined
  private opening = false
  constructor(private readonly options: Readonly<{
    dataSet: DataSet; stepView: () => DataView | undefined; listView: () => DataView | undefined
    context: () => Partial<FlowAppendUserContext>; assertCurrent: () => void; userDirectory?: () => DataView
  }>) {
    if (!options.dataSet.scenarioId) throw Error('追加参数缺少数据空间身份')
    ensureDataSetStaticInputTable(options.dataSet, 'AppendInput', [{name: 'inputId', primary: true}, {name: 'receiveUsers', type: 'array'}])
    const view = options.dataSet.getView('AppendInput')
    if (!view) throw Error('追加参数未装配')
    view.commitMode = 'staged'; this.parameters = view
  }
  get active(): boolean {return this.target !== undefined}
  get loading(): boolean {return this.opening}
  get dirty(): boolean {return this.parameters.hasEditingChanges() || this.parameters.dirtyTracking.hasPendingChanges()}
  get title(): string {return this.target?.TITLE ?? ''}
  get candidateKey(): string {return this.candidateView ? buildDataViewKey('AppendCandidates', this.candidateView.viewId, this.options.dataSet.scenarioId) : ''}
  private assertCleanCommand(): void {
    const view = this.options.dataSet.getView('ApprovalCommand')
    if (view && (view.mutating || view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) throw Error('请先处理或核验原审批命令')
  }
  async open(assertInputCurrent: () => void): Promise<void> {
    this.options.assertCurrent(); this.assertCleanCommand()
    if (this.active || this.dirty || this.opening) throw Error('请先确认或取消原追加参数')
    this.opening = true
    let created: DataView | undefined
    try {
      const ds = this.options.dataSet, source = this.options.stepView(), assigned = this.options.listView()
      const target = normalizeFlowAppendUserContext(this.options.context()), configView = ds.getView('AppendOptions'), table = ds.getTable('AppendCandidates')
      if (!source || !assigned || source.dataSet !== ds || assigned.dataSet !== ds || source.viewId !== 'default' || assigned.viewId !== 'appendParticipants' || !configView || !table) throw Error('追加参数缺少原步骤/配置/候选')
      const assertParent = captureFlowAppendStep(source, target), assertAssigned = assigned.captureReadResult()
      if ((['WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID'] as const).some(field => assigned.queryContext[field] !== target[field])) throw Error('已有办理人不是原关系查询')
      const assertScope = () => {
        this.options.assertCurrent(); assertInputCurrent(); assertParent(); assertAssigned()
        if (this.options.stepView() !== source || this.options.listView() !== assigned
          || (['rowid', 'WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID'] as const).some(field => normalizeFlowAppendUserContext(this.options.context())[field] !== target[field])) throw Error('原追加参数目标已变化')
      }
      configView.queryContext = {stepId: target.rowid, flowObjectId: target.WFOBJID, upNodeId: target.SendNodeModelId, nodeId: target.ReceiveNodeModelId, lastStepId: target.LastStepID}
      await configView.refresh(); assertScope()
      if (configView.loadingError) throw configView.loadingError
      configView.setCurrentRowById('current')
      const config = captureAppendConfiguration(ds, {stepId: target.rowid, flowObjectId: target.WFOBJID})
      if (config.max < 1) throw Error('当前节点不可追加办理人')
      if (config.row['allowChange'] === true) {
        const directory = this.options.userDirectory?.()
        if (!directory) throw Error('允许扩选时缺少正式人员目录')
        await directory.refresh(); assertScope(); config.assertCurrent()
        if (directory.loadingError) throw directory.loadingError
        if (this.options.userDirectory?.() !== directory) throw Error('原人员目录实例已变化')
      }
      const view = table.addView(`selection-${crypto.randomUUID()}`); created = view
      view.queryContext = {nodeId: config.nodeId}; view.queryConfig = {pagination: 'none'}
      bindDataSetReadonlyCommandQuery(view, createFlowRunCandidatesBinding({view, source: configView, assigned, resourceId: 'workflow:append-candidates', guard: this.options.assertCurrent,
        ...(this.options.userDirectory ? {userDirectory: this.options.userDirectory} : {})}))
      await view.refresh(); assertScope(); config.assertCurrent()
      if (view.loadingError) throw view.loadingError
      if (!view.rows.length) throw Error('无可追加办理人')
      const defaults = view.rows.filter(row => row['isDefault'] === true).map(row => row['value'])
      this.parameters.replaceRows([{inputId: 'current', receiveUsers: defaults.length <= config.max ? defaults : []}])
      this.parameters.setCurrentRowById('current')
      this.target = Object.freeze(target); this.candidateView = view
      const assertCandidates = view.captureReadResult()
      this.proof = () => {assertScope(); config.assertCurrent(); assertCandidates()}
    } catch (error) {
      if (created) created.dataTable?.destroyView(created.viewId)
      throw error
    } finally {this.opening = false}
  }
  capture(): Readonly<{input: Readonly<DataRow>; assertCurrent: () => void}> {
    this.assertCleanCommand()
    return this.captureParameters()
  }
  private captureParameters(): Readonly<{input: Readonly<DataRow>; assertCurrent: () => void}> {
    this.proof?.()
    if (!this.target || !this.proof || !this.candidateView) throw Error('原追加参数尚未打开')
    const parameters = this.parameters.getEditingRow('current') ?? this.parameters.rows[0]
    const input: Readonly<DataRow> = Object.freeze({action: 'append', flowObjectId: this.target.WFOBJID, stepId: this.target.rowid, candidateViewKey: this.candidateKey, receiveUsers: readFlowAppendReceivers(parameters?.['receiveUsers'])})
    const assertSelected = captureAppendSelection(this.options.dataSet, input), signature = JSON.stringify(input), proof = this.proof
    return {input, assertCurrent: () => {
      assertSelected()
      if (this.proof !== proof || JSON.stringify(input) !== signature || JSON.stringify(this.captureParameters().input) !== signature) throw Error('原追加参数已变化')
    }}
  }
  close(): void {
    this.assertCleanCommand()
    if (this.opening) throw Error('原追加参数仍在加载')
    this.parameters.discardEditingRows(); this.parameters.discardPendingChanges(); this.parameters.replaceRows([])
    if (this.candidateView) this.candidateView.dataTable?.destroyView(this.candidateView.viewId)
    this.candidateView = undefined; this.target = undefined; this.proof = undefined
  }
}
