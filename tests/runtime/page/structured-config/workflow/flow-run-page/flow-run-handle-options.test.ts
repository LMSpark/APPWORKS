import {describe, expect, it} from 'vitest'
import {
  parseFlowRunHandleNodeOptions,
  readFlowRunAllowForceBack,
} from '@/platform-adapters/resources/system/workflow/manage/flow-run-page/flow-run-handle-options'

describe('flow-run-handle-options', () => {
  it('reads raw service ROWID and the original display memo without losing node identity', () => {
    expect(parseFlowRunHandleNodeOptions({nextNodes: [{ROWID: 'RAW', TITLE: '标题', MEMO: '说明', direction: 'forward'}]}, ['nextNodes']))
      .toEqual([{id: 'RAW', title: '说明', direction: 'forward'}])
  })
  it('preserves declared direction and return semantics from the formal nextNodes payload', () => {
    expect(parseFlowRunHandleNodeOptions({nextNodes: [{rowid: 'N1', title: '退回审核', Direction: 'backward', IsTurnBack: true}]}, ['nextNodes']))
      .toEqual([{id: 'N1', title: '退回审核', direction: 'backward', isTurnBack: true}])
  })
  it('parses next and force back node lists with alias keys', () => {
    const source = {
      NextNodeList: [{NodeId: 'N2', TITLE: '审批'}],
      ForceBackNodeList: [{nodeId: 'N0', Title: '发起'}],
      AllowToForceBack: true,
    }
    expect(parseFlowRunHandleNodeOptions(source, ['NextNodeList'])).toEqual([{id: 'N2', title: '审批'}])
    expect(parseFlowRunHandleNodeOptions(source, ['ForceBackNodeList'])).toEqual([{id: 'N0', title: '发起'}])
    expect(readFlowRunAllowForceBack(source)).toBe(true)
  })
})
