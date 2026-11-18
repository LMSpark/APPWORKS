/* global $page, $route */
function bindConfigurationRelease() {
  const {configurationKind, configurationKey, releaseRequestKey, releaseRequestDigest, configurationVersionId,
    configurationVersionDigest, releaseAction} = $route.query
  const valid = [configurationKind, configurationKey, releaseRequestKey, configurationVersionId]
    .every(value => typeof value === 'string' && value && value.trim() === value)
  const digests = [releaseRequestDigest, configurationVersionDigest].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value))
  return {visible: valid && digests && (releaseAction === 'ENABLE' || releaseAction === 'DISABLE')}
}

async function openConfigurationRelease() {
  if (!bindConfigurationRelease().visible) return
  const {configurationKind: kind, configurationKey: key, releaseRequestKey: requestKey, releaseRequestDigest: requestDigest,
    configurationVersionId: versionId, configurationVersionDigest: versionDigest, releaseAction: action,
    expectedPointerVersion = null} = $route.query
  try {
    const result = await $page.invokeHostCommand('configuration.release.readOriginal', {
      kind, key, requestKey, requestDigest, versionId, versionDigest, action, expectedPointerVersion,
    })
    result.assertCurrent()
    const heading = action === 'ENABLE' ? '原启用' : '原停用'
    const message = result.status === 'APPLIED'
      ? `${heading}已生效 · 原回执 ${result.releaseRef} · 当次指针 ${result.resultPointerVersion} · 配置版本 ${result.version.versionId}`
      : result.status === 'NOT_APPLIED' ? `${heading}未生效 · 凭据 ${result.terminalRef}` : `${heading}结果未知`
    const lines = [message]
    if (result.impact) {
      const labels = {PRESERVE_HISTORY: '保留已执行记录', CHECK_ORIGINAL: '待查原操作', HOLD: '暂停执行',
        CHECK_PERMISSION: '待核当前用途', MAY_CONTINUE: '原锁可续办'}
      lines.push(result.impact.assessmentComplete ? '已核停用影响' : '停用影响尚未核全')
      for (const item of result.impact.items) lines.push(`${item.operationRef} · ${labels[item.action]} · 跟踪人 ${item.ownerId}`)
    } else if (result.impactState === 'PENDING') lines.push('停用影响待核')
    else if (result.impactState === 'UNVERIFIED') lines.push('停用影响证据无法核验')
    await $page.showAlert(lines.join('\n'), '配置启停回查')
  } catch {
    $page.showMessage('原启停结果无法核验', 'warning')
  }
}
