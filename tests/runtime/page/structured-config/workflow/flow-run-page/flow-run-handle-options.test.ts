import {describe, expect, it} from 'vitest'
import {
  parseFlowRunHandleNodeOptions,
  readFlowRunAllowForceBack,
} from '@/lowcode/resources/system/workflow/manage/flow-run-page/flow-run-handle-options'

describe('flow-run-handle-options', () => {
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