import {describe, expect, it} from 'vitest'
import {
  canRevokeFlowAppendRecord,
  createFlowAppendReceiveUserList,
  validateFlowAppendSelection,
} from '@/views/features/workflow/flow-append-user/model/flow-append-user-model'

describe('flow append user model', () => {
  it('validates selection count against min and max', () => {
    expect(validateFlowAppendSelection(0, 1, 3)).toBe('请选择办理人')
    expect(validateFlowAppendSelection(2, 1, 1)).toMatch(/不能超过/)
    expect(validateFlowAppendSelection(1, 2, 3)).toMatch(/不能少于/)
    expect(validateFlowAppendSelection(2, 1, 3)).toBe('')
  })

  it('builds receive user payload and revoke rule', () => {
    expect(createFlowAppendReceiveUserList([{UserId: 'U1', UserName: 'A'}])).toEqual(['U1:A'])
    expect(canRevokeFlowAppendRecord({STATUS: '0', StepState: '1'})).toBe(true)
    expect(canRevokeFlowAppendRecord({STATUS: '1', StepState: '1'})).toBe(false)
  })
})