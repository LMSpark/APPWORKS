/**
 * @module app:views/features/workflow/flow-runtime/run-page/model/flow-run-business-submit
 * 职责：按业务页生命周期编排提交，区分服务提交与成功后的页面回调错误。
 */
import type {FlowRunBusinessPageExpose} from './flow-run-business-tab'

export async function submitFlowBusinessPage({page, payload, submit, assertCurrent, isUnconfirmed}: Readonly<{page: FlowRunBusinessPageExpose | null; payload: unknown; submit: () => Promise<void>; assertCurrent: () => void; isUnconfirmed: () => boolean}>): Promise<boolean> {
  assertCurrent()
  const gate = await page?.flowSubmit?.()
  assertCurrent()
  if (gate === false || gate === 'cancel') return false
  const end = await page?.flowSubmitEnd?.(payload)
  assertCurrent()
  if (end === false || end === 'cancel') return false
  try {
    await submit()
  } catch (cause) {
    assertCurrent()
    if (!isUnconfirmed()) page?.flowSubmitFailed?.(payload)
    throw cause
  }
  assertCurrent()
  try {
    await page?.flowSubmitSucceeded?.(payload)
  } catch (cause) {
    throw new Error('审批提交已确认，但业务页面成功回调失败；请核对页面结果，不重复办理', {cause})
  }
  assertCurrent()
  return true
}
