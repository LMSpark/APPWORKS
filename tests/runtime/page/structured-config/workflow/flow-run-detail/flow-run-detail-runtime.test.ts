import {describe, expect, it, vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {design: {readTextFile: vi.fn(async () => '')}},
}))

const {FLOW_DESIGN_SCENARIO_ID, prepareFlowRunDetailPage} = await import('@/lowcode/resources/system/workflow/manage')

const MONITOR_SCENARIO_ID = 'E328FBBF518141973C575D612CD75151'

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

function createRuntime(): PageRuntime {
  const design = {
    WFM_FLOW_MODLE: createView([{TITLE: '测试流程', DesignJson: ''}]),
    WFM_FLOW_NODE: createView([{rowid: 'N1', TITLE: '开始'}]),
    WFM_NODE_REALATION: createView([]),
    WFM_WORKFORM: createView([]),
    Base_NavigationInfo: createView([]),
  }
  const monitor = {
    WFOBJ_FLOW_RELATIONLINE_STEP: createView([{rowid: 'S1', WFOBJID: 'WF-1'}]),
    WFOBJ_FLOW_Waiting: createView([]),
  }
  return {
    getDataSet: (id: string) => {
      if (id === FLOW_DESIGN_SCENARIO_ID) return {getView: (name: string) => design[name as keyof typeof design]}
      if (id === MONITOR_SCENARIO_ID) return {getView: (name: string) => monitor[name as keyof typeof monitor]}
      return undefined
    },
  } as unknown as PageRuntime
}

describe('prepareFlowRunDetailPage', () => {
  it('refreshes step views and returns design graph keys', async () => {
    const runtime = createRuntime()
    const result = await prepareFlowRunDetailPage({runtime, wfid: 'WF-1', flowid: 'FM-1'})
    expect(result.stepViewKey).toContain('WFOBJ_FLOW_RELATIONLINE_STEP')
    expect(result.waitingViewKey).toContain('WFOBJ_FLOW_Waiting')
    expect(result.nodeViewKey).toContain('WFM_FLOW_NODE')
    expect(result.graphLayout.nodePositions).toBeDefined()
  })

  it('requires design peer scenario', async () => {
    const runtime = {getDataSet: (id: string) => (id === MONITOR_SCENARIO_ID ? {getView: () => createView([])} : undefined)} as unknown as PageRuntime
    await expect(prepareFlowRunDetailPage({runtime, wfid: 'WF-1', flowid: 'FM-1'})).rejects.toThrow(/设计伙伴/)
  })
})