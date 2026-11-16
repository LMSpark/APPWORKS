import {expect, it} from 'vitest'
import {DataSet, bindDataSetReadonlyCommandQuery, ensureDataSetResourceView} from '@spark-appworks/spark-data'
import {FlowRunApprovalInputWorkspace} from '@/lowcode/resources/system/workflow/manage/flow-run-page/input/approval-input-workspace'

it.each(['1', '0'])('loads the directory only for allowChange=%s and captures choices through the original candidate view', async allowChange => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}}), users = DataSet.fromJson({scenarioId: 'DIRECTORY', tables: {}})
  const options = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
  ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCandidates', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-candidates'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'value'}, {name: 'nodeId'}]})
  bindDataSetReadonlyCommandQuery(options, {resource: {resourceType: 'logical-view', resourceId: 'options'}, guard: () => {}, loadRows: async () => [{id: 'current', payload: {curNode: {rowid: 'CUR', TYPEID: '1'}, nextNodes: [{rowid: 'N', direction: 'forward'}], execUser: [{nodeId: 'N', minNum: 1, maxNum: 1, allowChange, userList: [{UserId: 'U1', UserName: '张三'}]}]}}]})
  options.queryContext = {modelId: 'M', stepId: 'STEP', busRowId: 'B', formid: 'F'}
  const continuation = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalContinuation', resource: {resourceType: 'logical-view', resourceId: 'continuation'}, columns: [{name: 'id', primary: true}, {name: 'enableNext', type: 'boolean'}]})
  bindDataSetReadonlyCommandQuery(continuation, {resource: {resourceType: 'logical-view', resourceId: 'continuation'}, guard: () => {}, loadRows: async () => [{id: 'current', enableNext: false}]})
  const directory = ensureDataSetResourceView({dataSet: users, tableName: 'Base_UserInfo', resource: {resourceType: 'logical-view', resourceId: 'directory'}, columns: [{name: 'rowid', primary: true}, {name: 'UserName'}]})
  directory.queryConfig = {allPages: true, fields: ['rowid', 'UserName']}
  let requests = 0
  bindDataSetReadonlyCommandQuery(directory, {resource: {resourceType: 'logical-view', resourceId: 'directory'}, guard: () => {}, loadRows: async () => {requests++; return [{rowid: 'U1', UserName: '张三'}, {rowid: 'U2', UserName: '李四'}]}})
  const workspace = new FlowRunApprovalInputWorkspace({dataSet: ds, assertCurrent: () => {}, userDirectory: () => directory})
  try {
    await options.refresh(); await workspace.open({flowObjectId: 'WF', modelId: 'M', stepId: 'STEP', busRowId: 'B', formid: 'F'}); await workspace.refreshContinuation()
    expect(requests).toBe(allowChange === '1' ? 1 : 0)
    expect(workspace.nodes.rows[0]?.['ExecUserList']).toEqual(['U1:张三'])
    workspace.nodes.updateEditingValue('N', 'ExecUserList', ['U2:李四'])
    if (allowChange === '0') {expect(() => workspace.capture('submit')).toThrow(/候选/); return}
    const capture = workspace.capture('submit')
    expect(capture.input['nextNode']).toEqual([{NodeId: 'N', ExecUserList: ['U2:李四']}]); capture.assertCurrent()
    workspace.nodes.updateEditingValue('N', 'ExecUserList', ['U2:伪名'])
    expect(() => workspace.capture('submit')).toThrow(/候选/)
    workspace.nodes.updateEditingValue('N', 'ExecUserList', ['U2:李四'])
    await directory.refresh()
    expect(() => capture.assertCurrent()).toThrow()
    expect(() => workspace.capture('submit')).toThrow()
  } finally {ds.destroy(); users.destroy()}
})
