import {expect, it} from 'vitest'
import {canRevokeFlowAppendRecord} from '@/lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-records'
import {readFlowAppendReceivers} from '@/lowcode/resources/system/workflow/manage/flow-append-user/command-input'

it('validates immutable receiver values and the original revoke rule', () => {
  expect(readFlowAppendReceivers(['U1:A'])).toEqual(['U1:A'])
  for (const values of [[], ['U1:'], ['U1:A:B'], ['U1:A', 'U1:B']]) expect(() => readFlowAppendReceivers(values)).toThrow()
  expect(canRevokeFlowAppendRecord({STATUS: '0', StepState: '1'})).toBe(true)
  expect(canRevokeFlowAppendRecord({STATUS: '1', StepState: '1'})).toBe(false)
})
