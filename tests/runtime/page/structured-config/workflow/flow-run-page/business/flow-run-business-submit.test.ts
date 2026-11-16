import {expect, it, vi} from 'vitest'
import {submitFlowBusinessPage} from '@/views/features/workflow/flow-runtime/run-page/model/flow-run-business-submit'

it('keeps confirmed submission distinct from a failed success callback', async () => {
  const submit = vi.fn(async () => undefined)
  const failed = vi.fn()
  const succeeded = vi.fn(async () => {throw Error('refresh failed')})
  const end = vi.fn(async () => true)
  await expect(submitFlowBusinessPage({page: {flowSubmitEnd: end, flowSubmitFailed: failed, flowSubmitSucceeded: succeeded}, payload: {action: {name: '提交'}}, submit, assertCurrent: () => {}, isUnconfirmed: () => false})).rejects.toThrow('已确认')
  expect(submit).toHaveBeenCalledTimes(1)
  expect(failed).not.toHaveBeenCalled()
  expect(end).toHaveBeenCalledTimes(1)
})

it('does not dispatch when the business form cancels its pre-submit work', async () => {
  const submit = vi.fn(async () => undefined)
  expect(await submitFlowBusinessPage({page: {flowSubmitEnd: () => false}, payload: {}, submit, assertCurrent: () => {}, isUnconfirmed: () => false})).toBe(false)
  expect(submit).not.toHaveBeenCalled()
})

it('does not call the business failure callback for an unconfirmed original command', async () => {
  const failed = vi.fn()
  await expect(submitFlowBusinessPage({page: {flowSubmitFailed: failed}, payload: {}, submit: async () => {throw Error('unknown receipt')}, assertCurrent: () => {}, isUnconfirmed: () => true})).rejects.toThrow('unknown receipt')
  expect(failed).not.toHaveBeenCalled()
})

it.each(['cancel', 'CANCEL', 'Cancel'])('honors cancellation token %s before dispatch', async token => {
  const submit = vi.fn(async () => undefined)
  expect(await submitFlowBusinessPage({page: {flowSubmitEnd: () => token}, payload: {}, submit, assertCurrent: () => {}, isUnconfirmed: () => false})).toBe(false)
  expect(submit).not.toHaveBeenCalled()
})
