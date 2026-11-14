import {describe, expect, it, vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {
  addFlowDesignNode,
  removeFlowDesignGraphSelection,
} from '@/lowcode/resources/system/workflow/manage/flow-design/flow-design-graph-edit'

type MockView = {
  destroyed: boolean
  rows: Array<Record<string, unknown>>
  deleteRowById: ReturnType<typeof vi.fn>
  addRow: ReturnType<typeof vi.fn>
}

function createView(rows: MockView['rows']): MockView {
  return {
    destroyed: false,
    rows,
    deleteRowById: vi.fn(id => {
      const index = rows.findIndex(row => String(row['rowid']) === id)
      if (index >= 0) rows.splice(index, 1)
    }),
    addRow: vi.fn(async (data: Record<string, unknown>) => {
      rows.push(data)
      return data
    }),
  }
}

function createRuntime(nodeView: MockView, edgeView: MockView): PageRuntime {
  return {
    getDataSet: () => ({
      getView: (model: string) => {
        if (model === 'WFM_FLOW_NODE') return nodeView
        if (model === 'WFM_NODE_REALATION') return edgeView
        return undefined
      },
    }),
  } as unknown as PageRuntime
}

describe('flow-design-graph-edit', () => {
  it('removes node and incident edges', () => {
    const nodeView = createView([{rowid: 'N1', FLOWID: 'FM-1', TITLE: 'A'}])
    const edgeView = createView([
      {rowid: 'E1', FLOWID: 'FM-1', PARENTID: 'N1', CHILDID: 'N2'},
      {rowid: 'E2', FLOWID: 'FM-1', PARENTID: 'N2', CHILDID: 'N3'},
    ])
    const runtime = createRuntime(nodeView, edgeView)
    const result = removeFlowDesignGraphSelection({
      runtime,
      flowModelId: 'FM-1',
      selection: {kind: 'node', id: 'N1'},
      layoutOverride: {nodePositions: {N1: {x: 1, y: 2}}, edgePaths: {E1: [{x: 0, y: 0}, {x: 1, y: 1}]}},
    })
    expect(nodeView.deleteRowById).toHaveBeenCalledWith('N1')
    expect(edgeView.deleteRowById).toHaveBeenCalledWith('E1')
    expect(result.layoutOverride.nodePositions?.['N1']).toBeUndefined()
    expect(result.layoutOverride.edgePaths?.['E1']).toBeUndefined()
  })

  it('adds node row with default position override', async () => {
    const nodeView = createView([])
    const edgeView = createView([])
    const runtime = createRuntime(nodeView, edgeView)
    vi.stubGlobal('crypto', {randomUUID: () => 'NEW-NODE-ID'})
    const result = await addFlowDesignNode({
      runtime,
      flowModelId: 'FM-1',
      layoutOverride: {},
      x: 50,
      y: 60,
    })
    expect(result.nodeId).toBe('NEW-NODE-ID')
    expect(nodeView.addRow).toHaveBeenCalledWith(expect.objectContaining({rowid: 'NEW-NODE-ID', FLOWID: 'FM-1'}))
    expect(result.layoutOverride.nodePositions?.['NEW-NODE-ID']).toEqual({x: 50, y: 60})
    vi.unstubAllGlobals()
  })
})