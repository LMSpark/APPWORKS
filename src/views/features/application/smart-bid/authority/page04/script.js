/* global $page, $route */
function bindOriginalGrantRegistration() {
  const {grantId, requestKey, requestDigest} = $route.query
  const valid = [grantId, requestKey].every(value => typeof value === 'string' && value && value.trim() === value)
  return {visible: valid && typeof requestDigest === 'string' && /^[a-f0-9]{64}$/u.test(requestDigest)}
}

async function openOriginalGrantRegistration() {
  if (!bindOriginalGrantRegistration().visible) return
  const {grantId, requestKey, requestDigest} = $route.query
  try {
    const result = await $page.invokeHostCommand('authority.grant.readRegistration', {grantId, requestKey, requestDigest})
    result.assertCurrent()
    if (result.status === 'UNKNOWN') {
      await $page.showAlert('原登记结果未知', '代表委托登记回查')
      return
    }
    if (result.status === 'REJECTED') {
      await $page.showAlert(`原登记已拒绝 · 决定 ${result.decisionRef}`, '代表委托登记回查')
      return
    }
    const {record, versionId} = result
    const decisions = {REGISTER: '登记', CHANGE: '变更', REVOKE: '撤销'}
    await $page.showAlert([
      `原登记已确认 · ${decisions[record.intent]} · 版本 ${versionId}`,
      `决定 ${record.decisionRef} · 代表 ${record.representativeId}`,
      `生效 ${record.effectiveAt} · 获知 ${record.knownAt}`,
    ].join('\n'), '代表委托登记回查')
  } catch {
    $page.showMessage('原委托登记无法核验', 'warning')
  }
}
