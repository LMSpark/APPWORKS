import {describe, expect, it, vi} from 'vitest'
import type {DataView} from '@spark-appworks/spark-data'
import {syncFlowDesignTables} from '@/lowcode/resources/system/workflow/manage/flow-design/flow-design-table-sync'

type MockView = {
  rows: Array<Record<string, unknown>>
  deleteRowById: ReturnType<typeof vi.fn>
  addRow: ReturnType<typeof vi.fn>
}

function createView(rows: MockView['rows']): MockView {
  return {
    rows,
    deleteRowById: vi.fn(),
    addRow: vi.fn(async (data: Record<string, unknown>) => ({...data})),
  }
}

describe('syncFlowDesignTables', () => {
  it('does not delete nodes when design json node list is empty', async () => {
    const nodeView = createView([{rowid: 'N1', FLOWID: 'FM-1', TITLE: '开始'}])
    const edgeView = createView([])
  const designJson = JSON.stringify({nodes: [], edges: []})
    await syncFlowDesignTables({
      flowModelId: 'FM-1',
      designJson,
      nodeView: nodeView as unknown as DataView,
      edgeView: edgeView as unknown as DataView,
    })
    expect(nodeView.deleteRowById).not.toHaveBeenCalled()
  })

  it('deletes orphan node rows and adds missing node from json', async () => {
    const nodeView = createView([
      {rowid: 'N1', FLOWID: 'FM-1', TITLE: '保留'},
      {rowid: 'N-old', FLOWID: 'FM-1', TITLE: '废弃'},
    ])
    const edgeView = createView([])
    const designJson = JSON.stringify({
      nodes: [{id: 'N1', type: 'rect', x: 0, y: 0, properties: {title: '保留'}}, {id: 'N2', type: 'rect', x: 10, y: 10}],
      edges: [],
    })
    await syncFlowDesignTables({
      flowModelId: 'FM-1',
      designJson,
      nodeView: nodeView as unknown as DataView,
      edgeView: edgeView as unknown as DataView,
    })
    expect(nodeView.deleteRowById).toHaveBeenCalledWith('N-old')
    expect(nodeView.addRow).toHaveBeenCalledWith(expect.objectContaining({rowid: 'N2', FLOWID: 'FM-1'}))
  })
})