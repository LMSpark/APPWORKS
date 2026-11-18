/* global $page, $route */
let original
let lookupError

async function __init__() {
  const {attemptRef, requestKey, requestDigest} = $route.query
  if (![attemptRef, requestKey, requestDigest].every(value => typeof value === 'string' && value.trim() === value && value)) {
    lookupError = '请选择需回查的原递交请求'
    return
  }
  try {
    original = await $page.invokeHostCommand('content.submission.readOriginal', {attemptRef, requestKey, requestDigest})
  } catch {
    lookupError = '原递交记录无法核验'
  }
}

function bindOriginalSubmission() {
  if (!original) return {error: lookupError ?? '原递交记录无法读取'}
  try {
    original.assertCurrent()
    if (!original.registered) return {status: '原请求登记结果未知'}
    const labels = {DISPATCHED: '实发已证，待查接收回执', WITHDRAWAL_SENT: '撤回已发，待核生效',
      NOT_EXECUTED: '原请求明确未执行', COMBINED_SENT: '新件与撤回均有实发证据', PARTIAL: '部分办理待查', UNKNOWN: '原办理结果未知'}
    const status = labels[original.status]
    return {status: original.evidenceRef ? `${status}，凭据 ${original.evidenceRef}` : status}
  } catch {
    return {error: '原递交查询已失效'}
  }
}
