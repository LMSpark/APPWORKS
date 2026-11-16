import {expect, it} from 'vitest'
import {DataSet, ensureDataSetResourceView, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {createFlowRunCandidatesBinding} from '@/lowcode/resources/system/workflow/manage/flow-run-page/query/candidates-binding'

it('keeps each node candidate range in its original options query and rejects stale sources', async () => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}})
  const source = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
  bindDataSetReadonlyCommandQuery(source, {resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, guard: () => {}, loadRows: async () => [{id: 'current', payload: {execUser: [{nodeId: 'N1', maxNum: 1, userList: [{UserId: 'U1', UserName: '张三'}]}, {nodeId: 'N2', maxNum: 1, userList: []}]}}]})
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
  } finally {ds.destroy()}
})
