import {describe, expect, it} from 'vitest'
import {filterFlowAppendUserList} from '@/lowcode/resources/system/workflow/manage'

describe('flow append user records', () => {
  const context = {
    rowid: 'CTX',
    WFOBJID: 'WF-1',
    SendNodeModelId: 'N1',
    ReceiveNodeModelId: 'N2',
    LastStepID: 'L1',
    TITLE: '节点 A',
  }

  const rows = [
    {
      rowid: 'A1',
      WFOBJID: 'WF-1',
      SendNodeModelId: 'N1',
      ReceiveNodeModelId: 'N2',
      LastStepID: 'L1',
      StepState: '0',
      STATUS: '0',
      ReceiveUserName: '张三',
    },
    {
      rowid: 'A2',
      WFOBJID: 'WF-1',
      SendNodeModelId: 'N1',
      ReceiveNodeModelId: 'N2',
      LastStepID: 'L1',
      StepState: '9',
      STATUS: '0',
      ReceiveUserName: '作废',
    },
    {
      rowid: 'A3',
      WFOBJID: 'WF-1',
      SendNodeModelId: 'N1',
      ReceiveNodeModelId: 'N9',
      LastStepID: 'L1',
      StepState: '0',
      STATUS: '0',
      ReceiveUserName: '其他节点',
    },
  ]

  it('filters active append records for the relation group', () => {
    const list = filterFlowAppendUserList(rows, context)
    expect(list).toHaveLength(1)
    expect(list[0]?.rowid).toBe('A1')
    expect(list[0]?.ReceiveUserName).toBe('张三')
  })

  it('returns empty when context is incomplete', () => {
    expect(filterFlowAppendUserList(rows, {WFOBJID: 'WF-1'})).toEqual([])
  })
})