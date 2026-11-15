import {describe, expect, it, vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_MONITOR_SCENARIO_ID, prepareFlowRunPage} from '@/lowcode/resources/system/workflow/manage'

type MockView = {
  destroyed: boolean
  queryContext: Record<string, string>
  loadingError: Error | null
  refresh: ReturnType<typeof vi.fn>
  rows: Array<Record<string, unknown>>
}

function createView(rows: MockView['rows']): MockView {
  return {destroyed: false, queryContext: {}, loadingError: null, refresh: vi.fn(async () => undefined), rows}
}

describe('prepareFlowRunPage', () => {
  it('refreshes instance, forms, and step views then builds tabs', async () => {
    const views: Record<string, MockView> = {
      View_FlowObjList: createView([{rowid: 'WF-1', TITLE: '请假', WFMID: 'FM-1', BusTblObjID: 'BUS-9'}]),
      WFOBJ_FLOW: createView([{rowid: 'WF-1', TITLE: '请假'}]),
      WFM_WORKFORM: createView([{FORMID: 'F1', FormName: '表单1', URL: '/demo/form', FlowID: 'FM-1'}]),
      WFOBJ_FLOW_FORM: createView([]),
      WFOBJ_FLOW_RELATIONLINE_STEP: createView([{rowid: 'S1', WFOBJID: 'WF-1'}]),
    }
    const runtime = {
      getDataSet: (id: string) => id === FLOW_MONITOR_SCENARIO_ID ? {getView: (name: string) => views[name]} : undefined,
    } as unknown as PageRuntime
    const result = await prepareFlowRunPage({runtime, wfid: 'WF-1', flowid: 'FM-1'})
    expect(result.instanceTitle).toBe('请假')
    expect(result.flowObjectId).toBe('WF-1')
    expect(result.busRowId).toBe('BUS-9')
    expect(result.formTabs).toHaveLength(1)
    expect(result.formTabs[0]?.tabKey).toBe('F1')
    expect(result.stepHistoryViewKey).toContain('WFOBJ_FLOW_RELATIONLINE_STEP')
    expect(views['WFOBJ_FLOW_RELATIONLINE_STEP']?.queryContext['WFOBJID']).toBe('WF-1')
    expect(views['WFOBJ_FLOW_RELATIONLINE_STEP']?.refresh).toHaveBeenCalledOnce()
  })

  it('rejects missing wfid', async () => {
    const runtime = {getDataSet: () => ({getView: () => createView([])})} as unknown as PageRuntime
    await expect(prepareFlowRunPage({runtime, wfid: '', flowid: 'FM-1'})).rejects.toThrow(/wfid/)
  })
})