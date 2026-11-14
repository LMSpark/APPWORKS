import {describe, expect, it} from 'vitest'
import {
  filterVoidedSteps,
  stepsOnEdge,
  stepsReceivedAtNode,
  stepsSentFromNode,
} from '@/lowcode/resources/system/workflow/manage'

describe('flow run detail steps', () => {
  const steps = [
    {rowid: 'S1', description: 'a', StepState: '1', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2', STATUS: '1'},
    {rowid: 'S2', description: 'void', StepState: '9', SendNodeModelId: 'N2', ReceiveNodeModelId: 'N3', STATUS: '0'},
  ]

  it('filters voided steps unless showVoided', () => {
    expect(filterVoidedSteps(steps, false)).toHaveLength(1)
    expect(filterVoidedSteps(steps, true)).toHaveLength(2)
  })

  it('partitions node received and sent rows', () => {
    expect(stepsReceivedAtNode(steps, 'N2')).toHaveLength(1)
    expect(stepsSentFromNode(steps, 'N1')).toHaveLength(1)
  })

  it('matches edge steps by endpoints', () => {
    expect(stepsOnEdge(steps, 'N1', 'N2')).toHaveLength(1)
    expect(stepsOnEdge(steps, 'N1', 'N3')).toHaveLength(0)
  })
})