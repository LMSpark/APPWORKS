import {describe, expect, it, vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {
  addFlowDesignEdge,
  addFlowDesignNode,
  removeFlowDesignGraphSelection,
} from '@/lowcode/resources/system/workflow/manage/flow-design/flow-design-graph-edit'

type MockView = {
  destroyed: boolean
  rows: Array<Record<string, unknown>>
  removeRow: ReturnType<typeof vi.fn>
  deleteActionState:()=>string
  getPkKey:(row:Record<string,unknown>)=>unknown
  addRowWithIdentity: ReturnType<typeof vi.fn>
}

function createView(rows: MockView['rows']): MockView {
  return {
    destroyed: false,
    rows,
    deleteActionState:()=> 'enabled',getPkKey:row=>row['rowid'],
    removeRow: vi.fn(id => {
      const index = rows.findIndex(row => String(row['rowid']) === id)
      if (index >= 0) rows.splice(index, 1)
    }),
    addRowWithIdentity: vi.fn(async (identity:{value:string},data: Record<string, unknown>) => {
      data={...data,rowid:identity.value}
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
  it('removes node and incident edges', async () => {
    const nodeView = createView([{rowid: 'N1', FLOWID: 'FM-1', TITLE: 'A'}])
    const edgeView = createView([
      {rowid: 'E1', FLOWID: 'FM-1', UpNodeID: 'N1', NextNodeID: 'N2'},
      {rowid: 'E2', FLOWID: 'FM-1', UpNodeID: 'N2', NextNodeID: 'N3'},
    ])
    const runtime = createRuntime(nodeView, edgeView)
    const result = await removeFlowDesignGraphSelection({
      runtime,
      flowModelId: 'FM-1',
      selection: {kind: 'node', id: 'N1'},
      layoutOverride: {nodePositions: {N1: {x: 1, y: 2}}, edgePaths: {E1: [{x: 0, y: 0}, {x: 1, y: 1}]}},
    })
    expect(nodeView.removeRow).toHaveBeenCalledWith('N1')
    expect(edgeView.removeRow).toHaveBeenCalledWith('E1')
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
    expect(nodeView.addRowWithIdentity).toHaveBeenCalledWith({field:'rowid',value:'NEW-NODE-ID'},expect.objectContaining({FLOWID:'FM-1'}))
    expect(result.layoutOverride.nodePositions?.['NEW-NODE-ID']).toEqual({x: 50, y: 60})
    vi.unstubAllGlobals()
  })

  it('adds edge between existing nodes', async () => {
    const nodeView = createView([
      {rowid: 'N1', FLOWID: 'FM-1'},
      {rowid: 'N2', FLOWID: 'FM-1'},
    ])
    const edgeView = createView([])
    const runtime = createRuntime(nodeView, edgeView)
    vi.stubGlobal('crypto', {randomUUID: () => 'EDGE-1'})
    const result = await addFlowDesignEdge({
      runtime,
      flowModelId: 'FM-1',
      parentId: 'N1',
      childId: 'N2',
      layoutOverride: {},
    })
    expect(result.edgeId).toBe('EDGE-1')
    expect(edgeView.addRowWithIdentity).toHaveBeenCalledWith({field:'rowid',value:'EDGE-1'},expect.objectContaining({
      UpNodeID: 'N1',
      NextNodeID: 'N2',
    }))
    vi.unstubAllGlobals()
  })
})