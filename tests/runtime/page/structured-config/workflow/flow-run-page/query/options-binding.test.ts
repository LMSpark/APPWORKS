import {expect, it, vi} from 'vitest'
import {DataSet, RequestState, ensureDataSetResourceView, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {createFlowRunOptionsBinding} from '@/lowcode/resources/system/workflow/manage/flow-run-page/query/options-binding'
it('queries options through a readonly view without widening an empty candidate list', async () => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}})
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
  const read = vi.fn(async () => ({nextNodes: [{rowid: 'N1'}], execUser: [{nodeId: 'N1', userList: []}]}))
  bindDataSetReadonlyCommandQuery(view, createFlowRunOptionsBinding({view, client: {getHandleOptionData: read}, guard: () => {}, captureTarget: () => () => {}}))
  try {
    view.queryContext = {modelId: 'FM1', stepId: 'S1', busRowId: 'B1', formid: 'F1'}
    await view.refresh()
    expect(view.loadingError).toBeNull()
    expect(read).toHaveBeenCalledWith({modelId: 'FM1', stepId: 'S1', busRowId: 'B1', formid: 'F1'})
    expect(view.rows[0]?.['payload']).toMatchObject({execUser: [{userList: []}]})
    await expect(view.addRow({})).rejects.toThrow()
    let release: (() => void) | undefined
    read.mockImplementationOnce(() => new Promise(resolve => {release = () => resolve({nextNodes: [{rowid: 'OLD'}], execUser: []})}))
    const pending = view.refresh()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    view.queryContext = {...view.queryContext, stepId: 'S2'}
    release?.()
    await pending
    expect(view.requestState).toBe(RequestState.Idle)
    expect(view.loadingError).toBeNull()
    expect(view.rows[0]?.['payload']).not.toMatchObject({nextNodes: [{rowid: 'OLD'}]})
    await view.refresh()
    expect(view.requestState).toBe(RequestState.Loaded)
    expect(read).toHaveBeenLastCalledWith({modelId: 'FM1', stepId: 'S2', busRowId: 'B1', formid: 'F1'})
    expect(view.rows[0]?.['payload']).toMatchObject({execUser: [{userList: []}]})
  } finally {ds.destroy()}
})
