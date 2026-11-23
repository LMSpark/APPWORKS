import {describe, expect, it, vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {
  FLOW_DESIGN_SCENARIO_ID,
  defaultFlowDesignNodeAuthRow,
  syncFlowDesignNodeAuthView,
} from '@/platform-adapters/resources/system/workflow/manage'

type MockView = {
  destroyed: boolean
  queryContext: Record<string, string>
  loadingError: Error | null
  refresh: ReturnType<typeof vi.fn>
}

function createView(): MockView {
  return {destroyed: false, queryContext: {}, loadingError: null, refresh: vi.fn(async () => undefined)}
}

describe('defaultFlowDesignNodeAuthRow', () => {
  it('seeds page and node ids with contenttype 1', () => {
    expect(defaultFlowDesignNodeAuthRow({flowModelId: 'FM', selectedNodeId: 'N1'})).toEqual({
      contenttype: 1,
      pageID: 'FM',
      FunCodeID: 'N1',
      status: 1,
    })
  })
})

describe('syncFlowDesignNodeAuthView', () => {
  it('writes FLOWID and selectedNodeId then refreshes nodeAuth view', async () => {
    const nodeAuth = createView()
    const options = createView()
    const runtime = {
      getDataSet: (id: string) => id === FLOW_DESIGN_SCENARIO_ID ? {
        getView: (name: string, viewId: string) => {
          if (name === 'FunctionNodeAuth' && viewId === 'nodeAuth') return nodeAuth
          if (name === '_Base_FunctionNode' && viewId === 'flowDesignOptions') return options
          return undefined
        },
      } : undefined,
    } as unknown as PageRuntime
    const key = await syncFlowDesignNodeAuthView({
      runtime,
      flowModelId: 'FM-1',
      selectedNodeId: 'N-9',
    })
    expect(nodeAuth.queryContext).toMatchObject({FLOWID: 'FM-1', pageID: 'FM-1', selectedNodeId: 'N-9'})
    expect(nodeAuth.refresh).toHaveBeenCalledOnce()
    expect(key).toContain('FunctionNodeAuth')
  })
})