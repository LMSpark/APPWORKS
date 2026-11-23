import {describe, expect, it} from 'vitest'
import {readFlowWorkbenchRowRoute} from '@/platform-adapters/resources/system/workflow/manage/flow-workbench/flow-workbench-row'

describe('readFlowWorkbenchRowRoute', () => {
  it('reads waiting row', () => {
    const route = readFlowWorkbenchRowRoute({wfid: 'WF-1', FlowID: 'FM-9', StepID: 'S1'}, 'pending')
    expect(route).toEqual({wfid: 'WF-1', flowid: 'FM-9', stepId: 'S1'})
  })

  it('reads started row from WFOBJ_FLOW', () => {
    const route = readFlowWorkbenchRowRoute({rowid: 'WF-1', WFMID: 'FM-9'}, 'started')
    expect(route).toEqual({wfid: 'WF-1', flowid: 'FM-9', stepId: ''})
  })

  it('reads processed row from step', () => {
    const route = readFlowWorkbenchRowRoute({WFOBJID: 'WF-1', FlowID: 'FM-9', rowid: 'S1'}, 'processed')
    expect(route?.wfid).toBe('WF-1')
  })

  it('returns null when flow id missing', () => {
    expect(readFlowWorkbenchRowRoute({wfid: 'WF-1'}, 'pending')).toBeNull()
  })
})