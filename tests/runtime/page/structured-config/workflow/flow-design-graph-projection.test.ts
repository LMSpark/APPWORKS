import {describe, expect, it, vi} from 'vitest'
import type {DataView} from '@spark-appworks/spark-data'
import {buildFlowDesignGraphLayout, parseFlowDesignGraphJson} from '@/lowcode/resources/system/workflow/manage'

function mockView(rows: DataView['rows']): DataView {
  return {destroyed: false, rows, refresh: vi.fn(), queryContext: {}} as unknown as DataView
}

describe('flow design graph projection', () => {
  it('parses design json nodes and edges', () => {
    const parsed = parseFlowDesignGraphJson(JSON.stringify({
      nodes: [{id: 'N1', x: 100, y: 200}],
      edges: [{id: 'E1', pointsList: [{x: 1, y: 2}, {x: 3, y: 4}]}],
    }))
    expect(parsed?.nodes?.length).toBe(1)
    expect(parsed?.edges?.length).toBe(1)
  })

  it('builds renderer graph layout with json positions and grid fallback', () => {
    const model = mockView([{DesignJson: JSON.stringify({nodes: [{id: 'N1', x: 50, y: 60}], edges: []})}])
    const nodes = mockView([{rowid: 'N1'}, {rowid: 'N2'}])
    const edges = mockView([])
    const layout = buildFlowDesignGraphLayout({modelView: model, nodeView: nodes, edgeView: edges})
    expect(layout.nodePositions['N1']).toEqual({x: 50, y: 60})
    expect(layout.nodePositions['N2']).toBeDefined()
  })
})