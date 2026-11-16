import {expect, it} from 'vitest'
import {DataSet, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {FlowRunApprovalInputWorkspace} from '@/lowcode/resources/system/workflow/manage/flow-run-page/input/approval-input-workspace'

it('keeps edits in parameter DataViews, validates people and counts, and rejects an expired options query', async () => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}})
  const options = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
  ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCandidates', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-candidates'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'value'}, {name: 'nodeId'}]})
  bindDataSetReadonlyCommandQuery(options, {resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, guard: () => {}, loadRows: async () => [{id: 'current', payload: {curNode: {rowid: 'CUR', TYPEID: '1', TITLE: '当前'}, nextNodes: [{rowid: 'N1', TITLE: '下一步', direction: 'forward'}], execUser: [{nodeId: 'N1', minNum: 1, maxNum: 1, allowChange: '0', userList: [{UserId: 'U1', UserName: '张三'}, {UserId: 'U2', UserName: '李四'}]}]}}]})
  options.queryContext = {modelId: 'M', stepId: 'STEP', busRowId: 'B', formid: 'F'}
  await options.refresh()
  const continuation = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalContinuation', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-continuation'}, columns: [{name: 'id', primary: true}, {name: 'enableNext', type: 'boolean'}]})
  bindDataSetReadonlyCommandQuery(continuation, {resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-continuation'}, guard: () => {}, loadRows: async () => [{id: 'current', enableNext: true}]})
  const workspace = new FlowRunApprovalInputWorkspace({dataSet: ds, assertCurrent: () => {}})
  try {
    await workspace.open({flowObjectId: 'WF', modelId: 'M', stepId: 'STEP', busRowId: 'B', formid: 'F'})
    await workspace.refreshContinuation()
    expect(() => workspace.capture('submit')).toThrow(/少于|至少/)
    workspace.nodes.updateEditingValue('N1', 'ExecUserList', ['U1:张三'])
    workspace.inputs.updateEditingValue('current', 'idea', '同意')
    const capture = workspace.capture('submit')
    expect(capture.input).toMatchObject({nextNode: [{NodeId: 'N1', ExecUserList: ['U1:张三']}], idea: '同意', stepId: 'STEP', type: '0'})
    expect(capture.payload['enableNext']).toBe(true)
    const payload = capture.payload as {action: {nodes: Array<{selectedUsers: string[]}>}}
    payload.action.nodes[0]!.selectedUsers.push('OUT:其他')
    expect(capture.input['nextNode']).toEqual([{NodeId: 'N1', ExecUserList: ['U1:张三']}])
    capture.assertCurrent()
    workspace.nodes.updateEditingValue('N1', 'ExecUserList', ['U1:张三', 'U2:李四'])
    expect(() => capture.assertCurrent()).toThrow()
    expect(() => workspace.capture('submit')).toThrow(/超过/)
    workspace.nodes.updateEditingValue('N1', 'ExecUserList', ['OUT:其他'])
    expect(() => workspace.capture('submit')).toThrow(/候选/)
    workspace.nodes.updateEditingValue('N1', 'ExecUserList', ['U1:张三'])
    const valid = workspace.capture('submit')
    workspace.close()
    await workspace.open({flowObjectId: 'WF', modelId: 'M', stepId: 'STEP', busRowId: 'B', formid: 'F'})
    await workspace.refreshContinuation()
    workspace.nodes.updateEditingValue('N1', 'ExecUserList', ['U1:张三'])
    workspace.inputs.updateEditingValue('current', 'idea', '同意')
    expect(() => valid.assertCurrent()).toThrow()
    const reopened = workspace.capture('submit')
    reopened.assertCurrent()
    options.queryContext = {...options.queryContext, stepId: 'OTHER'}
    expect(() => reopened.assertCurrent()).toThrow()
  } finally {ds.destroy()}
})
