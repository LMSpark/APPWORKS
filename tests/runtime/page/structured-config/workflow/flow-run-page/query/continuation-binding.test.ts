import {expect, it, vi} from 'vitest'
import {DataSet, ensureDataSetResourceView, bindDataSetReadonlyCommandQuery} from '@spark-appworks/spark-data'
import {createFlowRunContinuationBinding} from '@/lowcode/resources/system/workflow/manage/flow-run-page/query/continuation-binding'

it('reads continuation through the original options identity and does not turn an unknown response into false', async () => {
  const ds = DataSet.fromJson({scenarioId: 'S', tables: {}})
  const source = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalOptions', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, columns: [{name: 'id', primary: true}, {name: 'payload', type: 'object'}]})
  bindDataSetReadonlyCommandQuery(source, {resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-options'}, guard: () => {}, loadRows: async () => [{id: 'current', payload: {}}]})
  source.queryContext = {stepId: 'STEP'}; await source.refresh()
  const view = ensureDataSetResourceView({dataSet: ds, tableName: 'ApprovalContinuation', resource: {resourceType: 'logical-view', resourceId: 'workflow:approval-continuation'}, columns: [{name: 'id', primary: true}, {name: 'enableNext', type: 'boolean'}]})
  const read = vi.fn<(stepId: string) => Promise<unknown>>(async () => true)
  bindDataSetReadonlyCommandQuery(view, createFlowRunContinuationBinding({view, source, client: {canAutoSubmitAfter: read}, guard: () => {}}))
  try {
    view.queryContext = {stepId: 'STEP'}; await view.refresh()
    expect(view.loadingError).toBeNull(); expect(view.rows[0]?.['enableNext']).toBe(true)
    expect(read).toHaveBeenCalledWith('STEP')
    read.mockResolvedValueOnce({unknown: true}); await view.refresh()
    expect(view.loadingError?.message).toContain('布尔')
    source.queryContext = {stepId: 'OTHER'}; await view.refresh()
    expect(view.loadingError).not.toBeNull()
    expect(read).toHaveBeenCalledTimes(2)
  } finally {ds.destroy()}
})
