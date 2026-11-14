import {describe, expect, it, vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'

vi.mock('@/lowcode/lowcode-runtime', () => ({
  lowcodeApi: {design: {readTextFile: vi.fn(async () => '')}},
}))

const {FLOW_DESIGN_SCENARIO_ID, prepareFlowDesignViews} = await import('@/lowcode/resources/system/workflow/manage')

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

function createRuntime(views: Record<string, MockView>): PageRuntime {
  return {
    getDataSet: (scenarioId: string) => scenarioId === FLOW_DESIGN_SCENARIO_ID
      ? {getView: (name: string) => views[name]}
      : undefined,
  } as unknown as PageRuntime
}

describe('prepareFlowDesignViews', () => {
  it('writes FLOWID query context and refreshes design tables', async () => {
    const model = createView([{TITLE: '请假流程', DesignJson: ''}])
    const node = createView([{TITLE: '开始'}])
    const edge = createView([])
    const runtime = createRuntime({
      WFM_FLOW_MODLE: model,
      WFM_FLOW_NODE: node,
      WFM_NODE_REALATION: edge,
    })
    const result = await prepareFlowDesignViews(runtime, 'flow-key-1')
    expect(result.modelTitle).toBe('请假流程')
    expect(model.queryContext).toEqual({FLOWID: 'flow-key-1', rowid: 'flow-key-1'})
    expect(node.queryContext['FLOWID']).toBe('flow-key-1')
    expect(model.refresh).toHaveBeenCalledOnce()
    expect(result.nodeViewKey).toContain('WFM_FLOW_NODE')
    expect(result.edgeViewKey).toContain('WFM_NODE_REALATION')
    expect(result.graphLayout.nodePositions).toBeDefined()
  })

  it('rejects missing design dataset', async () => {
    const runtime = {getDataSet: () => undefined} as unknown as PageRuntime
    await expect(prepareFlowDesignViews(runtime, 'x')).rejects.toThrow(/设计场景/)
  })
})