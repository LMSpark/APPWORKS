import {describe, expect, it} from 'vitest'
import {buildFlowRunPageRoute, readFlowRuntimeRouteQuery} from '@/lowcode/resources/system/workflow/manage'

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
      query: {wfid: 'W1', flowid: 'F1'},
    })
  })
})