import {describe, expect, it, vi} from 'vitest'
import type {DataView} from '@spark-appworks/spark-data'
import {applyFlowRunGraphNodeBadges, buildFlowRunGraphNodeBadges, FLOW_RUN_GRAPH_NODE_BADGE_FIELD} from '@/platform-adapters/resources/system/workflow/manage'

describe('flow run detail graph projection', () => {
  it('marks waiting nodes ahead of completed', () => {
    const badges = buildFlowRunGraphNodeBadges(
      [{STATUS: '1', SendNodeModelId: 'N1', ReceiveNodeModelId: 'N2'}],
      [{NodeID: 'N2'}],
    )
    expect(badges['N1']).toBe('completed')
    expect(badges['N2']).toBe('waiting')
  })

  it('applies badge field to node rows in memory', () => {
    const view = {
      rows: [{rowid: 'N1'}, {rowid: 'N2'}],
    } as unknown as DataView
    applyFlowRunGraphNodeBadges(view, {N1: 'completed'})
    expect(view.rows[0]?.[FLOW_RUN_GRAPH_NODE_BADGE_FIELD]).toBe('completed')
    expect(view.rows[1]?.[FLOW_RUN_GRAPH_NODE_BADGE_FIELD]).toBeUndefined()
  })
})