import {expect, it, vi} from 'vitest'
import {DataSet, ensureDataSetResourceView, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {createFlowRunCandidatesBinding} from '@/lowcode/resources/system/workflow/manage/flow-run-page/query/candidates-binding'

it('keeps each node candidate range in its original options query and rejects stale sources', async () => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}})
  const source = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
  let payload: Record<string, unknown> = {execUser: [{nodeId: 'N1', maxNum: 1, userList: [{UserId: 'U1', UserName: '张三'}]}, {nodeId: 'N2', maxNum: 1, userList: []}]}
  bindDataSetReadonlyCommandQuery(source, {resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, guard: () => {}, loadRows: async () => [{id: 'current', payload}]})
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCandidates', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-candidates'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'value'}, {name: 'nodeId'}]})
  bindDataSetReadonlyCommandQuery(view, createFlowRunCandidatesBinding({view, source, guard: () => {}}))
  try {
    source.queryContext = {stepId: 'S1'}
    await source.refresh()
    view.queryContext = {nodeId: 'N1'}
    await view.refresh()
    expect(view.loadingError).toBeNull()
    expect(view.rows).toMatchObject([{id: 'U1', name: '张三', value: 'U1:张三', nodeId: 'N1'}])
    const other = view.dataTable!.addView('node-N2')
    bindDataSetReadonlyCommandQuery(other, createFlowRunCandidatesBinding({view: other, source, guard: () => {}}))
    other.queryContext = {nodeId: 'N2'}
    await other.refresh()
    expect(other.loadingError).toBeNull()
    expect(other.rows).toEqual([])
    expect(view.rows).toMatchObject([{id: 'U1', nodeId: 'N1'}])
    await expect(view.addRow({id: 'U2'})).rejects.toThrow()
    view.queryContext = {nodeId: 'N2'}
    await view.refresh()
    expect(view.loadingError).toBeNull()
    expect(view.rows).toEqual([])
    source.queryContext = {stepId: 'S2'}
    await view.refresh()
    expect(view.loadingError).not.toBeNull()
    payload = {nextNodes: [{rowid: 'END'}], execUser: []}
    await source.refresh()
    view.queryContext = {nodeId: 'END'}; await view.refresh()
    expect(view.loadingError).toBeNull()
    expect(view.rows).toEqual([])
    view.queryContext = {nodeId: 'UNKNOWN'}; await view.refresh()
    expect(view.loadingError).not.toBeNull()
  } finally {ds.destroy()}
})

it('uses the original full directory only for explicit free choice and expires its projection on refresh', async () => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}}), directorySet = DataSet.fromJson({scenarioId: 'DIRECTORY', tables: {}})
  const source = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
  let allowChange = '1'
  bindDataSetReadonlyCommandQuery(source, {resource: {resourceType: 'logical-view', resourceId: 'options'}, guard: () => {}, loadRows: async () => [{id: 'current', payload: {execUser: [{nodeId: 'N', maxNum: 1, allowChange, userList: [{UserId: 'U1', UserName: '张三'}]}]}}]})
  const directory = ensureDataSetResourceView({dataSet: directorySet, tableName: 'Base_UserInfo', resource: {resourceType: 'logical-view', resourceId: 'directory'}, columns: [{name: 'rowid', primary: true}, {name: 'UserName'}]})
  directory.queryConfig = {allPages: true, fields: ['rowid', 'UserName']}
  bindDataSetReadonlyCommandQuery(directory, {resource: {resourceType: 'logical-view', resourceId: 'directory'}, guard: () => {}, loadRows: async () => [{rowid: 'U2', UserName: '李四'}]})
  const assigned = ensureDataSetResourceView({dataSet: ds, tableName: 'Assigned', resource: {resourceType: 'logical-view', resourceId: 'assigned'}, columns: [{name: 'id', primary: true}, {name: 'ReceiveUserId'}]})
  let assignedUser = false
  bindDataSetReadonlyCommandQuery(assigned, {resource: {resourceType: 'logical-view', resourceId: 'assigned'}, guard: () => {}, loadRows: async () => assignedUser ? [{id: 'A', ReceiveUserId: 'U1'}] : []})
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalCandidates', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-candidates'}, columns: [{name: 'id', primary: true}, {name: 'name'}, {name: 'value'}, {name: 'nodeId'}, {name: 'isDefault', type: 'boolean'}]})
  let reads = 0
  bindDataSetReadonlyCommandQuery(view, createFlowRunCandidatesBinding({view, source, assigned, guard: () => {}, userDirectory: () => {reads++; return directory}}))
  try {
    await source.refresh(); await directory.refresh(); await assigned.refresh(); view.queryContext = {nodeId: 'N'}; await view.refresh()
    expect(view.loadingError).toBeNull()
    expect(view.rows.map(row => row['value'])).toEqual(['U1:张三', 'U2:李四'])
    expect(view.rows.map(row => row['isDefault'])).toEqual([true, false])
    const proof = view.captureReadRow(view.rows[1]!, ['value'])
    await directory.refresh()
    expect(() => proof()).toThrow()
    assignedUser = true; await assigned.refresh(); await view.refresh()
    expect(view.rows.map(row => row['value'])).toEqual(['U2:李四'])
    const assignedProof = view.captureReadResult()
    await assigned.refresh(); expect(() => assignedProof()).toThrow()
    const originalAccess = assigned.fieldAccess.bind(assigned)
    const access = vi.spyOn(assigned, 'fieldAccess').mockImplementation((row, field) => ({...originalAccess(row, field), read: 'masked'}))
    try {
      await view.refresh()
      expect(view.loadingError?.message).toContain('已有办理人身份不可读')
      expect(() => view.captureReadResult()).toThrow()
    } finally {access.mockRestore()}
    assignedUser = false; await assigned.refresh()
    allowChange = '0'; await source.refresh(); reads = 0; await view.refresh()
    expect(view.loadingError).toBeNull(); expect(reads).toBe(0)
    expect(view.rows.map(row => row['value'])).toEqual(['U1:张三'])
  } finally {ds.destroy(); directorySet.destroy()}
})
