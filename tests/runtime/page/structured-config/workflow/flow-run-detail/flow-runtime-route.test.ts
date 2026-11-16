import {SYSTEM_PAGE_NAVIGATION_ID_QUERY} from '@spark-appworks/spark-app'
import {describe, expect, it} from 'vitest'
import {
  FLOW_MONITOR_SCENARIO_ID,
  buildFlowRunDetailRoute,
  buildFlowRunPageRoute,
  readFlowRuntimeRouteQuery,
} from '@/lowcode/resources/system/workflow/manage'

describe('readFlowRuntimeRouteQuery', () => {
  it('parses wfid and flowid from route query', () => {
    expect(readFlowRuntimeRouteQuery({wfid: ' W1 ', flowid: 'F1'})).toEqual({wfid: 'W1', flowid: 'F1'})
  })
  it('rejects missing wfid', () => {
    expect(() => readFlowRuntimeRouteQuery({flowid: 'F1'})).toThrow(/wfid/)
  })
  it('builds run-page route from query', () => {
    expect(buildFlowRunPageRoute({wfid: 'W1', flowid: 'F1'})).toEqual({
      path: '/features/workflow/flow-runtime/run-page/ui/flow-run-page',
      query: {wfid: 'W1', flowid: 'F1', [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: FLOW_MONITOR_SCENARIO_ID},
    })
  })
  it('builds run-detail route from query', () => {
    expect(buildFlowRunDetailRoute({wfid: 'W1', flowid: 'F1'})).toEqual({
      path: '/features/workflow/flow-runtime/detail/ui/flow-run-detail-page',
      query: {wfid: 'W1', flowid: 'F1', [SYSTEM_PAGE_NAVIGATION_ID_QUERY]: FLOW_MONITOR_SCENARIO_ID},
    })
  })
  it('prefixes run routes with application scope', () => {
    const scope = {projectId: 'D99A1DCE9894698799101EFD70F8FC76'}
    expect(buildFlowRunPageRoute({wfid: 'W1', flowid: 'F1'}, scope).path).toContain('/apps/D99A1DCE9894698799101EFD70F8FC76/')
    expect(buildFlowRunDetailRoute({wfid: 'W1', flowid: 'F1'}, scope).path).toContain('/apps/D99A1DCE9894698799101EFD70F8FC76/')
  })
})