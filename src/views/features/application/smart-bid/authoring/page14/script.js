/* global $page, $route */
let original
let receipt
let originalError
let receiptError

async function __init__() {
  const {attemptRef, requestKey, requestDigest, receiptRef} = $route.query
  await Promise.all([
    attemptRef === undefined ? undefined : $page.invokeHostCommand('content.submission.readOriginal', {attemptRef, requestKey, requestDigest})
      .then(result => {original = result}, () => {originalError = '原办理记录无法核验'}),
    receiptRef === undefined ? undefined : $page.invokeHostCommand('content.submission.readReceipt', {receiptRef})
      .then(result => {receipt = result}, () => {receiptError = '接收凭据无法核验'}),
  ])
}

function bindOriginalSubmission() {
  if (!original) {
    if ($route.query.attemptRef === undefined && $route.query.receiptRef !== undefined) return {visible: false}
    return {error: originalError ?? '请选择需回查的原办理'}
  }
  try {
    original.assertCurrent()
    if (!original.registered) return {status: '原请求登记结果未知'}
    const states = {DISPATCHED: '实发已证，待查接收回执', WITHDRAWAL_SENT: '撤回已发，待核生效',
      NOT_EXECUTED: '原请求明确未执行', COMBINED_SENT: '新件与撤回均有实发证据', PARTIAL: '部分办理待查', UNKNOWN: '原办理结果未知'}
    return {status: original.evidenceRef ? `${states[original.status]}，凭据 ${original.evidenceRef}` : states[original.status]}
  } catch {
    return {error: '原办理查询已失效'}
  }
}

function bindOriginalReceipt() {
  if (!receipt) return receiptError ? {error: receiptError} : {visible: false}
  try {
    receipt.assertCurrent()
    if (receipt.state === 'PENDING_PAIR') return {status: `凭据 ${receipt.receiptRef}，待配对原批次`}
    const labels = {RECEIVED: '接收', REJECTED: '拒收', WITHDRAWAL_CONFIRMED: '撤回确认'}
    return {status: `${labels[receipt.kind]}凭据 ${receipt.receiptRef}，原批次 ${receipt.attemptRef}`}
  } catch {
    return {error: '接收凭据查询已失效'}
  }
}
