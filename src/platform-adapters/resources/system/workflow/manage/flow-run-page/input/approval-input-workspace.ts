/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/input/approval-input-workspace
 * 职责：同一DataSet持有办理参数，确认时从原选项核验后捕获不可变命令。
 * 边界：参数视图不保存业务数据；仅明确允许扩选时消费正式人员目录，不缓存另一份可编辑候选。
 */
import {bindDataSetReadonlyCommandQuery, buildDataViewKey, ensureDataSetResourceView, ensureDataSetStaticInputTable, type DataSet, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {parseFlowRunHandleNodeOptions} from '../flow-run-handle-options'
import {parseFlowRunExecUsers} from '../flow-run-exec-users'
import {createFlowRunCandidatesBinding} from '../query/candidates-binding'

type Target = Readonly<{flowObjectId: string; modelId: string; stepId: string; busRowId: string; formid: string}>
export type ApprovalInputCapture = Readonly<{input: Readonly<DataRow>; payload: Readonly<DataRow>; assertCurrent: () => void}>
const nextKeys = ['nextNodes', 'NextNodeList', 'nextNodeList', 'nodes']
const backKeys = ['allowToBackSteps', 'BackNodeList', 'backNodeList', 'historyNodes', 'BackNodes']
const forceKeys = ['forceBackNodes', 'ForceBackNodeList', 'forceBackNodeList', 'ForceBackNodes']

const forceTargetResource = {resourceType: 'logical-view', resourceId: 'workflow:ApprovalForceTargets'}

/** Register empty, instance-owned views without reading approval options. */
export function ensureFlowRunApprovalViews(ds: DataSet) {
  if (!ds.scenarioId) throw Error('办理参数缺少明确数据空间身份')
  ensureDataSetStaticInputTable(ds, 'ApprovalInput', [{name: 'inputId', primary: true}, ...['idea', 'forceNodeId'].map(name => ({name})), ...['notifySms', 'notifyQywx', 'notifyDingTalk', 'notifyWechat'].map(name => ({name, type: 'boolean'}))])
  ensureDataSetStaticInputTable(ds, 'ApprovalNodeInput', [{name: 'NodeId', primary: true}, {name: 'title'}, {name: 'directionLabel'}, {name: 'selected', type: 'boolean'}, {name: 'ExecUserList', type: 'array'}, {name: 'checkedReturn', type: 'boolean'}, {name: 'candidateViewKey'}, {name: 'peopleReadonly', type: 'boolean'}, {name: 'returnReadonly', type: 'boolean'}])
  const inputs = ds.getView('ApprovalInput'), nodes = ds.getView('ApprovalNodeInput')
  if (!inputs || !nodes) throw Error('办理参数视图未装配')
  const forceTargets = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalForceTargets', resource: forceTargetResource, columns: [{name: 'id', primary: true}, {name: 'title'}]})
  return {inputs, nodes, forceTargets}
}

export class FlowRunApprovalInputWorkspace {
  readonly inputs: DataView
  readonly nodes: DataView
  private target: Target | undefined
  private source: DataRow | undefined
  private sourceGuard: (() => void) | undefined
  private readonly forceTargets: DataView
  private readonly bound = new Set<DataView>()
  constructor(private readonly options: Readonly<{dataSet: DataSet; assertCurrent: () => void; userDirectory?: () => DataView}>) {
    const ds = options.dataSet
    const {inputs, nodes, forceTargets} = ensureFlowRunApprovalViews(ds)
    this.forceTargets = forceTargets
    this.inputs = inputs; this.nodes = nodes
    for (const view of [inputs, nodes]) view.configure({commitMode: 'staged'})
  }
  get active(): boolean {return this.target !== undefined}
  get dirty(): boolean {return [this.inputs, this.nodes].some(view => view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())}
  private assertCommandClean(): void {
    const view = this.options.dataSet.getView('ApprovalCommand')
    if (view && (view.mutating || view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges())) throw Error('请先核验或处理原审批命令')
  }
  private payload(): Record<string, unknown> {
    this.options.assertCurrent(); this.sourceGuard?.()
    if (!this.target || !this.sourceGuard || !isRecord(this.source?.['payload'])) throw Error('办理参数尚未打开或原选项已失效')
    return this.source['payload']
  }
  async open(target: Target, assertInputCurrent: () => void = () => {}): Promise<void> {
    this.options.assertCurrent(); this.assertCommandClean()
    if (this.active || this.dirty) throw Error('请先确认或取消原办理参数')
    const ds = this.options.dataSet, source = ds.getView('ApprovalOptions'), table = ds.getTable('ApprovalCandidates')
    const row = source?.rows[0]
    if (source?.rows.length !== 1 || !row || !table) throw Error('办理参数缺少原选项或候选视图')
    if (Object.entries(target).some(([key, value]) => key !== 'flowObjectId' && source.queryContext[key] !== value)) throw Error('办理参数与原选项目标不符')
    const assertSource = source.captureReadRow(row, ['payload'])
    assertSource()
    if (!isRecord(row['payload'])) throw Error('办理选项结构无效')
    const data = row['payload'], next = parseFlowRunHandleNodeOptions(data, nextKeys), configs = parseFlowRunExecUsers(data)
    if (new Set(next.map(node => node.id)).size !== next.length) throw Error('办理下一节点身份重复')
    if (next.some(node => configs.some(config => config.nodeId === node.id && config.allowChange === true && (config.maxNum ?? 0) > 0))) {
      const directory = this.options.userDirectory?.()
      if (!directory) throw Error('允许扩选的节点缺少正式人员目录')
      await directory.refresh(); this.options.assertCurrent(); assertInputCurrent(); assertSource()
      if (this.options.userDirectory?.() !== directory) throw Error('原人员目录实例已变化')
      if (directory.loadingError) throw directory.loadingError
    }
    const rows: DataRow[] = []
    for (const [index, node] of next.entries()) {
      const viewId = `node-${index}`, view = table.getView(viewId) ?? table.addView(viewId)
      if (!this.bound.has(view)) {
        bindDataSetReadonlyCommandQuery(view, createFlowRunCandidatesBinding({view, source, guard: this.options.assertCurrent,
          ...(this.options.userDirectory ? {userDirectory: this.options.userDirectory} : {})}))
        this.bound.add(view)
      }
      view.queryContext = {nodeId: node.id}; view.queryConfig = {pagination: 'none'}
      await view.refresh(); this.options.assertCurrent(); assertInputCurrent(); assertSource()
      if (view.loadingError) throw view.loadingError
      const config = configs.find(item => item.nodeId === node.id), max = config?.maxNum ?? 0
      const users = config?.users.map(user => `${user.id}:${user.name || user.id}`) ?? []
      const directionLabel = node.direction === 'forward' ? '向前' : node.direction === 'backward' ? '回退' : '未确认'
      rows.push({NodeId: node.id, title: node.title, directionLabel, selected: next.length === 1 || node.id === String(data['DefaultNodeId'] ?? data['defaultNodeId'] ?? ''),
        ExecUserList: max > 0 && users.length <= max ? users : [], checkedReturn: false, candidateViewKey: buildDataViewKey('ApprovalCandidates', viewId, ds.scenarioId),
        peopleReadonly: max < 1, returnReadonly: node.direction !== 'backward' || node.isTurnBack !== true})
    }
    {
      const view = this.forceTargets
      if (!this.bound.has(view)) {
        bindDataSetReadonlyCommandQuery(view, {resource: forceTargetResource, guard: this.options.assertCurrent,
          captureQueryInputs: () => {const original = source.rows[0]; if (!original || source.rows.length !== 1) throw Error('退回目标缺少原选项'); return source.captureReadRow(original, ['payload'])},
          loadRows: () => {const current = source.rows[0]?.['payload']; if (!isRecord(current)) throw Error('退回目标来源失效'); return Promise.resolve(parseFlowRunHandleNodeOptions(current, forceKeys).map(node => ({id: node.id, title: node.title})))}})
        this.bound.add(view)
      }
      await view.refresh(); assertInputCurrent(); assertSource()
      if (view.loadingError) throw view.loadingError
    }
    this.nodes.replaceRows(rows)
    this.inputs.replaceRows([{inputId: 'current', idea: '', forceNodeId: parseFlowRunHandleNodeOptions(data, forceKeys)[0]?.id ?? '', notifySms: false, notifyQywx: false, notifyDingTalk: false, notifyWechat: false}])
    this.inputs.setCurrentRowById('current')
    this.source = row; this.sourceGuard = () => {assertInputCurrent(); assertSource()}; this.target = Object.freeze({...target})
  }
  async refreshContinuation(): Promise<void> {
    this.payload()
    const view = this.options.dataSet.getView('ApprovalContinuation')
    if (!view || !this.target) throw Error('自动后继判断视图未装配')
    view.queryContext = {stepId: this.target.stepId}
    await view.refresh(); this.payload()
    if (view.loadingError) throw view.loadingError
    this.continuation()
  }
  private continuation(): Readonly<{enableNext: boolean; assertCurrent: () => void}> {
    const view = this.options.dataSet.getView('ApprovalContinuation'), row = view?.rows[0]
    if (!view || !row || view.rows.length !== 1 || view.queryContext['stepId'] !== this.target?.stepId || typeof row['enableNext'] !== 'boolean') throw Error('自动后继判断尚未确认')
    const assertCurrent = view.captureReadRow(row, ['enableNext'])
    return {enableNext: row['enableNext'], assertCurrent}
  }
  capture(action: 'submit' | 'back' | 'forceBack' | 'toCreator'): ApprovalInputCapture {
    this.assertCommandClean()
    return this.captureParameters(action)
  }
  private captureParameters(action: 'submit' | 'back' | 'forceBack' | 'toCreator'): ApprovalInputCapture {
    const data = this.payload(), target = this.target
    const parameters = this.inputs.getEditingRow('current') ?? this.inputs.rows[0]
    if (!target || !parameters || typeof parameters['idea'] !== 'string') throw Error('办理参数缺失')
    const current = isRecord(data['curNode']) ? data['curNode'] : {}
    let nodes: ReadonlyArray<Readonly<{NodeId: string; ExecUserList: string[]}>> = []
    const returnState = {value: false}
    const candidateProofs: Array<() => void> = []
    let selected: Array<Readonly<{nodeId: string; title: string; direction: string; selectedUsers: string[]}>> = []
    let nodeId = ''
    if (action === 'submit') {
      const definitions = parseFlowRunHandleNodeOptions(data, nextKeys), configs = parseFlowRunExecUsers(data)
      if (this.nodes.rows.length !== definitions.length) throw Error('办理节点参数与原选项不符')
      selected = this.nodes.rows.flatMap(row => {
        const id = this.nodes.getPkKey(row), value = id === undefined ? undefined : this.nodes.getEditingRow(id) ?? row
        const node = definitions.find(item => item.id === id)
        if (!node || !value) throw Error('办理节点身份不符')
        if (value['selected'] !== true) return []
        if (node.direction !== 'forward' && node.direction !== 'backward') throw Error('办理节点方向尚未确认')
        const users = value['ExecUserList'], config = configs.find(item => item.nodeId === id), max = config?.maxNum ?? 0, min = config?.minNum ?? 0
        if (!Array.isArray(users) || users.some((user: unknown) => typeof user !== 'string') || new Set(users).size !== users.length) throw Error('办理人员选择无效或重复')
        if (users.length > max) throw Error(`${node.title}办理人数超过${max}`)
        if (users.length < min) throw Error(`${node.title}办理人数少于${min}`)
        const allowed = config?.users.map(user => `${user.id}:${user.name || user.id}`) ?? []
        if (config?.allowChange === true && max > 0) {
          const candidates = this.options.dataSet.getView('ApprovalCandidates', `node-${definitions.indexOf(node)}`)
          if (!candidates || candidates.queryContext['nodeId'] !== id) throw Error('办理人员缺少原节点候选视图')
          candidateProofs.push(candidates.captureReadResult())
          for (const user of users) {
            const matches = candidates.rows.filter(candidate => candidate['value'] === user)
            const match = matches[0]
            if (matches.length !== 1 || !match) throw Error('办理人员不在原候选范围')
            candidateProofs.push(candidates.captureReadRow(match, ['id', 'name', 'value', 'nodeId']))
          }
        } else if (users.some((user: unknown) => !allowed.includes(String(user)))) throw Error('办理人员不在原候选范围')
        if (value['checkedReturn'] === true) {
          if (node.direction !== 'backward' || node.isTurnBack !== true) throw Error('该节点不允许返回原办理人')
          returnState.value = true
        }
        return [{nodeId: node.id, title: node.title, direction: node.direction, selectedUsers: users.map(String)}]
      })
      if (!selected.length) throw Error('请至少选择一个提交节点')
      if (selected.length > 1 && String(current['TYPEID'] ?? '') !== '20') throw Error('当前节点一次只能提交一个节点')
      if (new Set(selected.map(node => node.direction)).size > 1) throw Error('不允许同时提交向前和向后节点')
      nodes = selected.map(node => ({NodeId: node.nodeId, ExecUserList: node.selectedUsers}))
    } else if (action === 'forceBack') {
      nodeId = String(parameters['forceNodeId'] ?? '')
      if (!parseFlowRunHandleNodeOptions(data, forceKeys).some(node => node.id === nodeId)) throw Error('强制退回目标不在原选项中')
    } else if (action === 'back' && !parseFlowRunHandleNodeOptions(data, backKeys).length) throw Error('原选项未开放普通退回')
    const flags = ['notifySms', 'notifyQywx', 'notifyDingTalk', 'notifyWechat']
    const input: Readonly<DataRow> = Object.freeze({action, flowObjectId: target.flowObjectId, stepId: target.stepId, flowId: target.modelId, busRowid: target.busRowId, formKey: target.formid,
      idea: parameters['idea'], nodeId, nextNode: nodes, isReturn: returnState.value, type: returnState.value ? '10' : '0', notifyType: flags.flatMap((field, index) => parameters[field] === true ? [String(index)] : []).join(',')})
    const continuation = action === 'submit' ? this.continuation() : undefined
    const payload = structuredClone({action: action === 'submit' ? {name: '提交', nodes: selected} : action === 'forceBack' ? {name: '强退', targetNode: {rowid: nodeId, TITLE: parseFlowRunHandleNodeOptions(data, forceKeys).find(node => node.id === nodeId)?.title ?? ''}} : {name: action === 'back' ? '返回' : '驳回'}, currentNode: {rowid: String(current['rowid'] ?? current['ROWID'] ?? ''), TITLE: String(current['TITLE'] ?? ''), MEMO: String(current['MEMO'] ?? ''), TYPEID: String(current['TYPEID'] ?? '')}, opinionText: input['idea'], isStart: false, ...(continuation ? {enableNext: continuation.enableNext} : {})})
    const signature = JSON.stringify(input)
    const sourceGuard = this.sourceGuard
    return {input, payload, assertCurrent: () => {
      candidateProofs.forEach(proof => proof())
      continuation?.assertCurrent()
      if (this.sourceGuard !== sourceGuard || this.target !== target || JSON.stringify(input) !== signature || JSON.stringify(this.captureParameters(action).input) !== signature) throw Error('办理参数已变化')
    }}
  }
  close(): void {
    this.assertCommandClean()
    for (const view of [this.inputs, this.nodes]) {view.discardEditingRows(); view.discardPendingChanges(); view.replaceRows([])}
    this.target = undefined; this.source = undefined; this.sourceGuard = undefined
  }
}
