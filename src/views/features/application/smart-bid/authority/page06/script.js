/* global $page, $route */
function bindResourceUseRegistration() {
  const {sourceEnterpriseId, recipientEnterpriseId, applicationRef, resourceVersionId, decisionChainId, requestKey, requestDigest} = $route.query
  const valid = [sourceEnterpriseId, recipientEnterpriseId, applicationRef, resourceVersionId, decisionChainId, requestKey]
    .every(value => typeof value === 'string' && value && value.trim() === value)
  return {visible: valid && typeof requestDigest === 'string' && /^[a-f0-9]{64}$/u.test(requestDigest)}
}

async function openResourceUseRegistration() {
  if (!bindResourceUseRegistration().visible) return
  const {sourceEnterpriseId, recipientEnterpriseId, applicationRef, resourceVersionId, decisionChainId, requestKey, requestDigest} = $route.query
  try {
    const result = await $page.invokeHostCommand('authority.resourceUse.readRegistration', {
      sourceEnterpriseId, recipientEnterpriseId, applicationRef, resourceVersionId, decisionChainId, requestKey, requestDigest,
    })
    result.assertCurrent()
    if (result.status === 'UNKNOWN') {
      await $page.showAlert('原登记结果未知', '资料使用决定回查')
      return
    }
    if (result.status === 'REJECTED') {
      await $page.showAlert(`原登记请求被拒 · 凭据 ${result.receiptRef}`, '资料使用决定回查')
      return
    }
    const {record, versionId} = result
    const labels = {ALLOW: '准用', DENY: '拒绝使用', CHANGE: '变更', REVOKE: '撤销'}
    const lines = [`原登记已确认 · ${labels[record.intent]} · 版本 ${versionId}`,
      `资料版本 ${record.resourceVersionId} · 决定 ${record.decisionRef}`,
      `生效 ${record.effectiveAt} · 获知 ${record.knownAt}`]
    await $page.showAlert(lines.join('\n'), '资料使用决定回查')
  } catch {
    $page.showMessage('原资料使用决定无法核验', 'warning')
  }
}
