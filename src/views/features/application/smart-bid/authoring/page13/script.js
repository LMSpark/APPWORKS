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
  if ($route.query.attemptRef === undefined && bindPackage().visible) return {visible: false}
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

function bindPackage() {
  const {packageId, packingRequestRef} = $route.query
  return {visible: [packageId, packingRequestRef].every(value => typeof value === 'string' && value && value.trim() === value)}
}

async function openPackage() {
  if (!bindPackage().visible) return
  try {
    const {packageId, packingRequestRef} = $route.query
    const result = await $page.invokeHostCommand('content.submission.reviewPackage', {packageId, packingRequestRef})
    result.assertCurrent()
    if (result.status !== 'FROZEN') {
      await $page.showAlert(result.status === 'NOT_EFFECTIVE' ? '原冻结明确未生效' : '原冻结结果未知', '实包成员核对')
      return
    }
    const labels = {UNPLANNED: '不在原清单', PACKING_RECORD_MISSING: '缺装封记录', MEMBER_MISSING: '实包缺件',
      PACKED_VERSION_MISMATCH: '装封版本不符', OBSERVED_HASH_MISMATCH: '实包摘要不符'}
    const {proof} = result
    const lines = [`包 ${proof.packageId} · ${proof.membershipMatches ? '成员一致' : '成员存在差异'}`,
      ...proof.members.map(item => `${item.position} · ${item.issues.length ? item.issues.map(issue => labels[issue]).join('、') : '一致'}`)]
    await $page.showAlert(lines.join('\n'), '实包成员核对')
  } catch {
    $page.showMessage('实包成员无法核验', 'warning')
  }
}
