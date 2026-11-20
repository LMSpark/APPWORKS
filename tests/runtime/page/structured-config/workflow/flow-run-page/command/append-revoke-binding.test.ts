import {readFileSync} from 'node:fs'
import {expect, it} from 'vitest'
import {DataSet, bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {createApprovalCommandBindings} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/runtime-bindings'
import {submitApprovalCommand, verifyApprovalCommand} from '@/lowcode/resources/system/workflow/manage/flow-run-page/command/submit'

class RevokeHttp extends HttpClientBase {
  readonly calls: RequestConfig[] = []
  unknown = false
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.calls.push(config)
    if (this.unknown) throw Error('lost receipt')
    return {data: {Code: 200, Result: true}, status: 200, statusText: 'OK', headers: {}}
  }
}
it.each([false, true])('uses only the explicit original append view and preserves unknown=%s', async unknown => {
  const scene = 'A5BADCEE11D2438CB9E75C2453A220A6', model = 'WFOBJ_FLOW_RELATIONLINE_STEP'
  const config = new ScenarioViewConfig(scene, readFileSync('config/pages/workflow/flow-workbench/pagedata.json', 'utf8'))
  const ds = DataSet.fromJson({scenarioId: scene, tables: {}}), http = new RevokeHttp()
  const command = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCommand', resource: {resourceType: 'command', resourceId: 'workflow:approval'}, columns: [{name: 'rowid', primary: true}, ...['action', 'flowObjectId', 'stepId', 'targetStepViewKey'].map(name => ({name})), {name: 'nextNode', type: 'array'}]})
  const source = ensureDataSetResourceView({dataSet: ds, tableName: model, resource: {resourceType: 'service-query', resourceId: 'steps'}, columns: [{name: 'rowid', primary: true}, ...['WFOBJID', 'STATUS', 'StepState', 'SendNodeModelId', 'ReceiveNodeModelId', 'LastStepID'].map(name => ({name}))]})
  const list = source.dataTable!.addView('appendParticipants')
  const objects = ensureDataSetResourceView({dataSet: ds, tableName: 'WFOBJ_FLOW', resource: {resourceType: 'service-query', resourceId: 'objects'}, columns: [{name: 'rowid', primary: true}, {name: 'WFMID'}]})
  let childStatus = '0'
  for (const [view, rows] of [[source, [{rowid: 'PARENT', WFOBJID: 'WF'}]], [list, [{rowid: 'CHILD', WFOBJID: 'WF', STATUS: '0', StepState: '1', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2', LastStepID: 'L'}]], [objects, [{rowid: 'WF', WFMID: 'M'}]]] as const) {
    bindDataSetReadonlyCommandQuery(view, {resource: {resourceType: 'service-query', resourceId: view === objects ? 'objects' : 'steps'}, guard: () => {}, loadRows: async () => view === list ? rows.map(item => ({...item, STATUS: childStatus})) : rows})
    await view.refresh()
  }
  const factory = createApprovalCommandBindings({config, http, readScope: () => ({token: 'fixture', headers: {'X-AppId': 'APP'}}), assertCurrent: () => {}}).commandBindings?.['ApprovalCommand']
  if (!factory) throw Error('missing command owner')
  bindDataSetCommandSubmit(command, factory(command))
  try {
    await expect(submitApprovalCommand(ds, {action: 'revoke', flowObjectId: 'WF', stepId: 'PARENT', targetStepViewKey: `OTHER@${model}@appendParticipants`})).rejects.toThrow()
    expect(http.calls).toHaveLength(0)
    const input = {action: 'revoke', flowObjectId: 'WF', stepId: 'CHILD', targetStepViewKey: `${scene}@${model}@appendParticipants`}
    childStatus = '1'; await list.refresh()
    await expect(submitApprovalCommand(ds, input)).rejects.toThrow(/不可撤回/)
    expect(http.calls).toHaveLength(0)
    childStatus = '0'; await list.refresh(); http.unknown = unknown
    if (unknown) {
      await expect(submitApprovalCommand(ds, input)).rejects.toThrow(/未知/)
      const ids = [...command.dirtyTracking.pendingCreateIds]
      await expect(verifyApprovalCommand(ds)).rejects.toThrow()
      await expect(submitApprovalCommand(ds, input)).rejects.toThrow()
      expect(command.hasUnconfirmedSave).toBe(true); expect([...command.dirtyTracking.pendingCreateIds]).toEqual(ids)
    } else {
      await submitApprovalCommand(ds, input)
      await expect(submitApprovalCommand(ds, input)).rejects.toThrow(/已确认/)
    }
    expect(http.calls).toHaveLength(1)
    expect(http.calls[0]?.url).toBe('/api/Flow/FlowRevoke')
    expect(http.calls[0]?.params).toEqual({curStepID: 'CHILD', wfid: 'WF'})
  } finally {ds.destroy()}
})
