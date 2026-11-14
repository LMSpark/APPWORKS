import {describe, expect, it, vi} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID, resolveFlowDesignFileContext} from '@/lowcode/resources/system/workflow/manage'

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

describe('resolveFlowDesignFileContext', () => {
  it('falls back to SysForm when model row has no sysid', async () => {
    const runtime = {getDataSet: () => undefined} as unknown as PageRuntime
    const ctx = await resolveFlowDesignFileContext({
      runtime,
      flowModelId: 'FM-1',
      modelRow: {TITLE: '请假'},
    })
    expect(ctx).toEqual({customPath: 'SysForm', applicationId: ''})
  })

  it('reads folderName from Base_NavigationInfo when sysid is present', async () => {
    const nav = createView([{folderName: 'AppWorksForms'}])
    const runtime = {
      getDataSet: (id: string) => id === FLOW_DESIGN_SCENARIO_ID
        ? {getView: (name: string) => (name === 'Base_NavigationInfo' ? nav : undefined)}
        : undefined,
    } as unknown as PageRuntime
    const ctx = await resolveFlowDesignFileContext({
      runtime,
      flowModelId: 'FM-2',
      modelRow: {sysid: 'APP-1'},
    })
    expect(nav.queryContext).toEqual({rowid: 'APP-1'})
    expect(nav.refresh).toHaveBeenCalledOnce()
    expect(ctx).toEqual({customPath: 'AppWorksForms', applicationId: 'APP-1'})
  })
})