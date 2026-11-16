import {readFileSync} from 'node:fs'
import {describe, expect, it} from 'vitest'
import {DataSet, bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {createApprovalCommandBindings} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/runtime-bindings'
import {submitApprovalCommand} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/submit'
import {createApprovalOptionsBindings} from '@/lowcode/resources/system/workflow/manage/flow-run-page/query/runtime-bindings'

class Http extends HttpClientBase {
  result = true
  calls: RequestConfig[] = []
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    if (config.url === '/api/Flow/GetOptionButtonHandleUserOptionData') return {data: {Code: 200, Result: {nextNodes: [{rowid: 'N1'}], execUser: [{nodeId: 'N1', userList: []}]}}, status: 200, statusText: 'OK', headers: {}}
    return {data: {Code: 200, Result: this.result}, status: 200, statusText: 'OK', headers: {}}
  }
}
it('submits the captured instance and step through the original command view', async () => {
  const scene = 'A5BADCEE11D2438CB9E75C2453A220A6'
  const text = readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8')
  const config = new ScenarioViewConfig(scene, text)
  const ds = DataSet.fromJson({scenarioId: scene, tables: {}}), http = new Http()
  for (const name of ['ApprovalCommand', 'WFOBJ_FLOW_RELATIONLINE_STEP', 'WFOBJ_FLOW']) {
    ensureDataSetResourceView({dataSet: ds, tableName: name, resource: {resourceType: name === 'ApprovalCommand' ? 'command' : 'service-query', resourceId: name === 'ApprovalCommand' ? 'workflow:approval' : name}, columns: [{name: 'rowid', primary: true}, ...['action','flowObjectId','stepId','flowId','idea','WFOBJID','WFMID'].map(name => ({name})), {name: 'nextNode', type: 'array'}]})
  }
  const bindings = createApprovalCommandBindings({config, http, readScope: () => ({token: 't', headers: {}}), assertCurrent: () => {}})
  const command = ds.getView('ApprovalCommand'), steps = ds.getView('WFOBJ_FLOW_RELATIONLINE_STEP'), objects = ds.getView('WFOBJ_FLOW')
  if (!command || !steps || !objects) throw Error('fixture views missing')
  for (const [view, rows] of [[steps, [{rowid: 'S1', WFOBJID: 'WF1'}]], [objects, [{rowid: 'WF1', WFMID: 'FM1'}]]] as const) {
    bindDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'service-query', resourceId: view.tableName}, guard: () => {}, loadRows: async () => rows})
    await view.refresh()
  }
  const factory = bindings.commandBindings?.['ApprovalCommand']
  if (!factory) throw Error('binding missing')
  bindDataSetCommandSubmit(command, factory(command))
  try {
    await expect(submitApprovalCommand(ds, {action: 'submit', flowObjectId: 'WF1', stepId: 'S1', flowId: 'wrong', nextNode: []})).rejects.toThrow(/模型/)
    expect(http.calls).toHaveLength(0)
    await submitApprovalCommand(ds, {action: 'submit', flowObjectId: 'WF1', stepId: 'S1', flowId: 'FM1', idea: '同意', nextNode: [{NodeId: 'N1', ExecUserList: ['U1']}]})
    expect(http.calls[0]?.url).toBe('/api/Flow/FlowSubmitOrStart')
    expect(http.calls[0]?.data).toMatchObject({flowObjId: 'WF1', curStepId: 'S1', nextNode: [{NodeId: 'N1', ExecUserList: ['U1']}]})
    for (const [action, endpoint] of [['back', 'FlowBack'], ['forceBack', 'FlowForceBack'], ['toCreator', 'FlowToCreator'], ['revoke', 'FlowRevoke']]) {
      await submitApprovalCommand(ds, {action, flowObjectId: 'WF1', stepId: 'S1', nodeId: 'N1', idea: '退回'})
      expect(http.calls.at(-1)?.url).toBe(`/api/Flow/${endpoint}`)
    }
    const optionsView = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
    const optionFactory = createApprovalOptionsBindings({config, http, readScope: () => ({token: 't', headers: {}}), assertCurrent: () => {}}).projectionBindings?.['ApprovalOptions']
    if (!optionFactory) throw Error('option factory missing')
    bindDataSetReadonlyCommandQuery(optionsView, optionFactory(optionsView))
    optionsView.queryContext = {modelId: 'FM1', stepId: 'S1', busRowId: '', formid: ''}
    await optionsView.refresh()
    expect(optionsView.loadingError).toBeNull()
    expect(optionsView.rows[0]?.['payload']).toMatchObject({execUser: [{userList: []}]})
    const candidates = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCandidates', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-candidates'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'value'}, {name: 'nodeId'}]})
    const candidateFactory = createApprovalOptionsBindings({config, http, readScope: () => ({token: 't', headers: {}}), assertCurrent: () => {}}).projectionBindings?.['ApprovalCandidates']
    if (!candidateFactory) throw Error('candidate factory missing')
    bindDataSetReadonlyCommandQuery(candidates, candidateFactory(candidates))
    candidates.queryContext = {nodeId: 'N1'}
    await candidates.refresh()
    expect(candidates.loadingError).toBeNull()
    expect(candidates.rows).toEqual([])
    http.result = false
    await expect(submitApprovalCommand(ds, {action: 'revoke', flowObjectId: 'WF1', stepId: 'S1'})).rejects.toThrow()
    expect(command.hasUnconfirmedSave).toBe(true)
  } finally {ds.destroy()}
})
