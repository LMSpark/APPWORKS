import {describe, expect, it} from 'vitest'
import {readFlowRuntimeRouteQuery} from '@/lowcode/resources/system/workflow/manage'

describe('readFlowRuntimeRouteQuery', () => {
  it('parses wfid and flowid from route query', () => {
    expect(readFlowRuntimeRouteQuery({wfid: ' W1 ', flowid: 'F1'})).toEqual({wfid: 'W1', flowid: 'F1'})
  })
  it('rejects missing wfid', () => {
    expect(() => readFlowRuntimeRouteQuery({flowid: 'F1'})).toThrow(/wfid/)
  })
})