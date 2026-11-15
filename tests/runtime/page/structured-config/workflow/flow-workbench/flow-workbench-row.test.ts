import {describe, expect, it} from 'vitest'
import {readFlowWorkbenchRowRoute} from '@/lowcode/resources/system/workflow/manage/flow-workbench/flow-workbench-row'

describe('readFlowWorkbenchRowRoute', () => {
  it('reads wfid and FlowID from waiting row', () => {
    const route = readFlowWorkbenchRowRoute({wfid: 'WF-1', FlowID: 'FM-9', StepID: 'S1'})
    expect(route).toEqual({wfid: 'WF-1', flowid: 'FM-9', stepId: 'S1'})
  })

  it('returns null when flow id missing', () => {
    expect(readFlowWorkbenchRowRoute({wfid: 'WF-1'})).toBeNull()
  })
})