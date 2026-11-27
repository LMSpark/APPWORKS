import {readFileSync} from 'node:fs'
import {expect, it, vi} from 'vitest'
import {DataSpaceRuntimeApi, bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import type {HttpResponse, RequestConfig} from '@spark-appworks/spark-utils'
import {createApprovalCommandBindings} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/command/runtime-bindings'
import {submitApprovalCommand} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/command/submit'
import {createApprovalOptionsBindings} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/query/runtime-bindings'
import {LowcodeDataSpaceAssembler} from '@/platform-adapters/data-space/lowcode-data-space-assembler'
import {ApiBackend} from '../../../../api-provider/api-provider.fixture'
import {buildFormalModels} from '../../../catalog/structured-config-catalog.fixture'

class Http extends ApiBackend {
  result = true
  calls: RequestConfig[] = []
  beforeOptions?: () => Promise<void>
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    if (config.url === '/api/DataOperation/GetData') return super.executeRequest(config)
    this.calls.push(config)
    if (config.url === '/api/Flow/GetOptionButtonHandleUserOptionData') {
      await this.beforeOptions?.()
      return {data: {Code: 200, Result: {nextNodes: [{rowid: 'N1'}], execUser: [{nodeId: 'N1', userList: []}]}}, status: 200, statusText: 'OK', headers: {}}
    }
    return {data: {Code: 200, Result: this.result}, status: 200, statusText: 'OK', headers: {}}
  }
}
it('submits the captured instance and step through the original command view', async () => {
  const scene = 'A5BADCEE11D2438CB9E75C2453A220A6'
  const text = readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8')
  const config = new ScenarioViewConfig(scene, text)
  const http = new Http(), modelId = '3c0d6640-9c84-4894-9996-cf1418bd4106'
  const target = {rowid: 'WF1', WFMID: 'FM1', BusTblObjID: 'BUS1'}
  http.records = {WFOBJ_FLOW: [{rowid: 'OTHER', WFMID: 'FM1', BusTblObjID: 'BUS-OTHER'}, target]}
  const readScope = () => ({token: 't', headers: {'X-AppId': 'APP'}})
  const api = new DataSpaceRuntimeApi({http, readScope})
  const models = buildFormalModels({WFOBJ_FLOW: ['rowid', 'WFMID', 'TITLE', 'AppDesc', 'status', 'createuser', 'CrtUserID', 'CrtTime', 'BusTblObjID']})
    .map(model => ({...model, id: modelId, fields: model.fields.map(field => ({...field, modelId}))}))
  const ds = new LowcodeDataSpaceAssembler(api, http).assemble({config: config.selectModelScope('WFOBJ_FLOW', []),
    space: {dataSpaceId: scene, name: '工作台'}, models, relations: []}).dataSet
  for (const name of ['ApprovalCommand', 'WFOBJ_FLOW_RELATIONLINE_STEP']) {
    ensureDataSetResourceView({dataSet: ds, tableName: name, resource: {resourceType: name === 'ApprovalCommand' ? 'command' : 'service-query', resourceId: name === 'ApprovalCommand' ? 'workflow:approval' : name}, columns: [{name: 'rowid', primary: true}, ...['action','flowObjectId','stepId','flowId','idea','WFOBJID','WFMID','busRowid'].map(name => ({name})), {name: 'nextNode', type: 'array'}, {name: 'isReturn', type: 'boolean'}]})
  }
  const bindings = createApprovalCommandBindings({config, http, readScope: () => ({token: 't', headers: {}}), assertCurrent: () => {}})
  const command = ds.getView('ApprovalCommand'), steps = ds.getView('WFOBJ_FLOW_RELATIONLINE_STEP'), objects = ds.getView('WFOBJ_FLOW')
  if (!command || !steps || !objects) throw Error('fixture views missing')
  bindDataSetReadonlyCommandQuery(steps, {resource: {resourceType: 'service-query', resourceId: steps.tableName}, guard: () => {}, loadRows: async () => [{rowid: 'S1', WFOBJID: 'WF1'}]})
  objects.queryContext = {...objects.queryContext, rowid: 'WF1'}
  await Promise.all([steps.refresh(), objects.refresh()])
  const factory = bindings.commandBindings?.['workflow:approval']
  if (!factory) throw Error('binding missing')
  bindDataSetCommandSubmit(command, factory(command))
  try {
    expect(objects.loadingError).toBeNull()
    expect(objects.rows.map(row => row['rowid'])).toEqual(['WF1'])
    expect(http.reads[0]?.data).toMatchObject({Table: [{Name: 'WFOBJ_FLOW', Filter: expect.anything()}]})
    await expect(submitApprovalCommand(ds, {action: 'submit', flowObjectId: 'WF1', stepId: 'S1', flowId: 'FM1', busRowid: 'BUS-OTHER', nextNode: []})).rejects.toThrow(/业务行/)
    await expect(submitApprovalCommand(ds, {action: 'submit', flowObjectId: 'WF1', stepId: 'S1', flowId: 'wrong', nextNode: []})).rejects.toThrow(/模型/)
    expect(http.calls).toHaveLength(0)
    await submitApprovalCommand(ds, {action: 'submit', flowObjectId: 'WF1', stepId: 'S1', flowId: 'FM1', busRowid: 'BUS1', idea: '同意', isReturn: true, nextNode: [{NodeId: 'N1', ExecUserList: ['U1']}]})
    expect(http.calls[0]?.url).toBe('/api/Flow/FlowSubmitOrStart')
    expect(http.calls[0]?.data).toMatchObject({flowObjId: 'WF1', curStepId: 'S1', busRowid: 'BUS1', isReturn: true, nextNode: [{NodeId: 'N1', ExecUserList: ['U1']}]})
    for (const [action, endpoint] of [['back', 'FlowBack'], ['forceBack', 'FlowForceBack'], ['toCreator', 'FlowToCreator'], ['revoke', 'FlowRevoke']]) {
      await submitApprovalCommand(ds, {action, flowObjectId: 'WF1', stepId: 'S1', nodeId: 'N1', idea: '退回'})
      expect(http.calls.at(-1)?.url).toBe(`/api/Flow/${endpoint}`)
    }
    const optionsView = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
    const optionFactory = createApprovalOptionsBindings({config, http, readScope: () => ({token: 't', headers: {}}), assertCurrent: () => {}}).projectionBindings?.['ApprovalOptions']
    if (!optionFactory) throw Error('option factory missing')
    bindDataSetReadonlyCommandQuery(optionsView, optionFactory(optionsView))
    optionsView.queryContext = {modelId: 'FM1', stepId: 'S1', busRowId: 'BUS-OTHER', formid: ''}
    const beforeOptions = http.calls.length
    await optionsView.refresh()
    expect(optionsView.loadingError?.message).toMatch(/业务行/)
    expect(http.calls).toHaveLength(beforeOptions)
    optionsView.queryContext = {...optionsView.queryContext, busRowId: 'BUS1'}
    let resume: (() => void) | undefined
    http.beforeOptions = () => new Promise(resolve => {resume = resolve})
    const reading = optionsView.refresh()
    await vi.waitFor(() => expect(resume).toBeDefined())
    await objects.refresh()
    resume?.()
    await reading
    expect(optionsView.loadingError).toBeTruthy()
    delete http.beforeOptions
    await optionsView.refresh()
    expect(optionsView.loadingError).toBeNull()
    expect(http.calls.at(-1)?.params).toMatchObject({modelId: 'FM1', stepId: 'S1', busRowId: 'BUS1'})
    expect(optionsView.rows[0]?.['payload']).toMatchObject({execUser: [{userList: []}]})
    const candidates = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCandidates', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-candidates'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'value'}, {name: 'nodeId'}]})
    const candidateFactory = createApprovalOptionsBindings({config, http, readScope: () => ({token: 't', headers: {}}), assertCurrent: () => {}}).projectionBindings?.['ApprovalCandidates']
    if (!candidateFactory) throw Error('candidate factory missing')
    bindDataSetReadonlyCommandQuery(candidates, candidateFactory(candidates))
    candidates.queryContext = {nodeId: 'N1'}
    await candidates.refresh()
    expect(candidates.loadingError).toBeNull()
    expect(candidates.rows).toEqual([])
    const beforeInvalidObject = http.calls.length
    for (const rows of [[{...target, rowid: 'OTHER'}], [target, {...target}]]) {
      http.records['WFOBJ_FLOW'] = rows
      await objects.refresh()
      await optionsView.refresh()
      expect(optionsView.loadingError).toBeTruthy()
      await expect(submitApprovalCommand(ds, {action: 'revoke', flowObjectId: 'WF1', stepId: 'S1'})).rejects.toThrow(/正式/)
    }
    expect(http.calls).toHaveLength(beforeInvalidObject)
    http.records['WFOBJ_FLOW'] = [target]
    http.hiddenFields['WFOBJ_FLOW'] = ['BusTblObjID']
    await objects.refresh()
    await optionsView.refresh()
    expect(optionsView.loadingError?.message).toMatch(/字段不可读/)
    await expect(submitApprovalCommand(ds, {action: 'submit', flowObjectId: 'WF1', stepId: 'S1', flowId: 'FM1', busRowid: 'BUS1'})).rejects.toThrow(/字段不可读/)
    expect(http.calls).toHaveLength(beforeInvalidObject)
    delete http.hiddenFields['WFOBJ_FLOW']
    // A new formal read can represent a legitimately restored step with the same ID.
    await steps.refresh()
    await objects.refresh()
    http.result = false
    await expect(submitApprovalCommand(ds, {action: 'revoke', flowObjectId: 'WF1', stepId: 'S1'})).rejects.toThrow()
    expect(command.hasUnconfirmedSave).toBe(true)
  } finally {ds.destroy()}
})
