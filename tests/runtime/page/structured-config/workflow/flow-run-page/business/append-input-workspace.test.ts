import {readFileSync} from 'node:fs'
import {expect, it} from 'vitest'
import {DataSet, bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {FlowAppendInputWorkspace} from '@/platform-adapters/resources/system/workflow/manage/flow-append-user/input-workspace'
import {createApprovalOptionsBindings} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/query/runtime-bindings'
import {createApprovalCommandBindings} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/command/runtime-bindings'
import {submitApprovalCommand, verifyApprovalCommand} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/command/submit'

class AppendHttp extends HttpClientBase {
  readonly calls: RequestConfig[] = []
  mode = 'restricted'
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    if (config.method === 'POST' && this.mode === 'unknown') throw Error('lost receipt')
    const result = config.method === 'GET' ? [{nodeId: 'OTHER', maxNum: 10, userList: []}, {nodeId: 'N2', minNum: this.mode === 'zero' ? 0 : 1, maxNum: this.mode === 'zero' ? 0 : 2, allowChange: this.mode === 'expanded' || this.mode === 'zero' ? '1' : '0', userList: [{UserId: 'EXIST', UserName: '已有'}, {UserId: 'U1', UserName: '甲'}]}] : this.mode !== 'false'
    return {data: {Code: 200, Result: result}, status: 200, statusText: 'OK', headers: {}}
  }
}

it.each(['restricted', 'expanded', 'unknown', 'false', 'zero', 'stale-participants'])('keeps original selection and command proof for %s', async mode => {
  const scene = 'A5BADCEE11D2438CB9E75C2453A220A6', text = readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8'), json = JSON.parse(text)
  const ds = DataSet.fromJson({scenarioId: scene, tables: {AppendOptions: json.tables.AppendOptions, AppendCandidates: json.tables.AppendCandidates, ApprovalCommand: json.tables.ApprovalCommand}}), directorySet = DataSet.fromJson({scenarioId: 'D', tables: {}})
  const target = {rowid: 'P', WFOBJID: 'WF', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2', LastStepID: 'L', TITLE: '原节点'}
  const source = ensureDataSetResourceView({dataSet: ds, tableName: 'WFOBJ_FLOW_RELATIONLINE_STEP', resource: {resourceType: 'service-query', resourceId: 'steps'}, columns: [{name: 'rowid', primary: true}, ...['WFOBJID', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID', 'ReceiveUserId', 'ReceiveUserName', 'StepState', 'STATUS'].map(name => ({name}))]})
  const assigned = source.dataTable!.addView('appendParticipants')
  assigned.configure(json.tables.WFOBJ_FLOW_RELATIONLINE_STEP.views.appendParticipants)
  assigned.queryContext = {WFOBJID: 'WF', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2', LastStepID: 'L'}
  for (const view of [source, assigned]) {
    bindDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'service-query', resourceId: 'steps'}, guard: () => {}, loadRows: async () => [{...target, ReceiveUserId: 'EXIST', ReceiveUserName: '已有', StepState: '0', STATUS: '0'}]})
    await view.refresh()
  }
  const objects = ensureDataSetResourceView({dataSet: ds, tableName: 'WFOBJ_FLOW', resource: {resourceType: 'service-query', resourceId: 'objects'}, columns: [{name: 'rowid', primary: true}, {name: 'WFMID'}]})
  bindDataSetReadonlyCommandQuery(objects, {resource: {resourceType: 'service-query', resourceId: 'objects'}, guard: () => {}, loadRows: async () => [{rowid: 'WF', WFMID: 'M'}]}); await objects.refresh()
  const directory = ensureDataSetResourceView({dataSet: directorySet, tableName: 'Users', resource: {resourceType: 'service-query', resourceId: 'users'}, columns: [{name: 'rowid', primary: true}, {name: 'UserName'}]})
  directory.queryConfig = {allPages: true}; let directoryQueries = 0
  bindDataSetReadonlyCommandQuery(directory, {resource: {resourceType: 'service-query', resourceId: 'users'}, guard: () => {}, loadRows: async () => {directoryQueries++; return [{rowid: 'U2', UserName: '乙'}, {rowid: 'U3', UserName: '丙'}]}})
  const http = new AppendHttp(); http.mode = mode
  const config = new ScenarioViewConfig(scene, text), input = {config, http, readScope: () => ({token: 'fixture', headers: {'X-AppId': 'APP'}}), assertCurrent: () => {}}
  const optionFactory = createApprovalOptionsBindings(input).projectionBindings?.['AppendOptions'], commandFactory = createApprovalCommandBindings(input).commandBindings?.['workflow:approval']
  const options = ds.getView('AppendOptions')!, command = ds.getView('ApprovalCommand')!
  if (!optionFactory || !commandFactory) throw Error('missing factories')
  bindDataSetReadonlyCommandQuery(options, optionFactory(options)); bindDataSetCommandSubmit(command, commandFactory(command))
  const workspace = new FlowAppendInputWorkspace({dataSet: ds, stepView: () => source, listView: () => assigned, context: () => target, userDirectory: () => directory, assertCurrent: () => {}})
  try {
    if (mode === 'zero') {
      await expect(workspace.open(() => {})).rejects.toThrow(/不可追加/)
      expect(directoryQueries).toBe(0); expect(workspace.parameters.rows).toEqual([]); return
    }
    await workspace.open(() => {})
    expect(directoryQueries).toBe(mode === 'expanded' ? 1 : 0)
    expect(workspace.parameters.rows[0]?.['receiveUsers']).toEqual(['U1:甲'])
    if (mode === 'expanded') workspace.parameters.updateEditingValue('current', 'receiveUsers', ['U2:乙'])
    const captured = workspace.capture()
    if (mode === 'stale-participants') {
      await assigned.refresh()
      expect(() => captured.assertCurrent()).toThrow()
      await expect(submitApprovalCommand(ds, captured.input, captured.assertCurrent)).rejects.toThrow()
      expect(http.calls.filter(call => call.method === 'POST')).toEqual([])
      expect(command.hasUnconfirmedSave).toBe(false)
      workspace.close()
      return
    }
    if (mode === 'unknown' || mode === 'false') {
      await expect(submitApprovalCommand(ds, captured.input, captured.assertCurrent)).rejects.toThrow(/未知/)
      const ids = [...command.dirtyTracking.pendingCreateIds]
      expect(() => workspace.close()).toThrow(/核验/)
      await expect(verifyApprovalCommand(ds)).rejects.toThrow()
      expect(command.hasUnconfirmedSave).toBe(true); expect([...command.dirtyTracking.pendingCreateIds]).toEqual(ids)
    } else {
      await submitApprovalCommand(ds, captured.input, captured.assertCurrent)
      workspace.close()
      await expect(submitApprovalCommand(ds, captured.input, captured.assertCurrent)).rejects.toThrow(/已确认/)
      await workspace.open(() => {})
      expect(() => captured.assertCurrent()).toThrow()
      workspace.close()
    }
    const posts = http.calls.filter(call => call.method === 'POST')
    expect(posts).toHaveLength(1); expect(posts[0]?.url).toBe('/api/Flow/FlowAddReceiveUser')
    expect(posts[0]?.params).toEqual({stepId: 'P', wfId: 'WF'})
    expect(posts[0]?.data).toEqual(mode === 'expanded' ? ['U2:乙'] : ['U1:甲'])
  } finally {ds.destroy(); directorySet.destroy()}
})
