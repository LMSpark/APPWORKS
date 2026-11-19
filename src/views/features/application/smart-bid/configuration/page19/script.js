/* global $page, $route */
function bindConfigurationChannel() {
  const {configurationKind, configurationKey} = $route.query
  return {visible: [configurationKind, configurationKey]
    .every(value => typeof value === 'string' && !!value && value.trim() === value)}
}

async function openConfigurationChannel() {
  if (!bindConfigurationChannel().visible) return
  const {configurationKind: kind, configurationKey: key} = $route.query
  const isCurrent = () => $route.query.configurationKind === kind && $route.query.configurationKey === key
  try {
    const current = await $page.invokeHostCommand('configuration.release.readCurrentChannel', {kind, key})
    if (!isCurrent()) return
    current.assertCurrent()
    const text = current.state === 'ACTIVE' ? `已启用 · 当前指针 ${current.pointerVersion} · 配置摘要 ${current.versionDigest}` :
      current.state === 'DISABLED' ? `已停用 · 当前指针 ${current.pointerVersion}` : '当前作用域无配置指针'
    await $page.showAlert(text, '当前配置指针')
  } catch {
    if (isCurrent()) $page.showMessage('当前配置指针无法核验', 'warning')
  }
}

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
      try {
        result.impact.assertCurrent()
        const labels = {PRESERVE_HISTORY: '保留已执行记录', CHECK_ORIGINAL: '待查原操作', HOLD: '暂停执行',
          CHECK_PERMISSION: '待核当前用途', MAY_CONTINUE: '原锁可续办'}
        lines.push(result.impact.assessmentComplete ? '已核停用影响' : '停用影响尚未核全')
        for (const item of result.impact.items) lines.push(`${item.operationRef} · ${labels[item.action]} · 跟踪人 ${item.ownerId}`)
      } catch {
        lines.push('停用影响证据无法核验')
      }
    } else if (result.impactState === 'PENDING') lines.push('停用影响待核')
    else if (result.impactState === 'UNVERIFIED') lines.push('停用影响证据无法核验')
    result.assertCurrent()
    await $page.showAlert(lines.join('\n'), '配置启停回查')
  } catch {
    $page.showMessage('原启停结果无法核验', 'warning')
  }
}

function bindConfigurationCandidate() {
  const {configurationKind, configurationKey, configurationVersionId, candidateRequestKey} = $route.query
  return {visible: [configurationKind, configurationKey, configurationVersionId, candidateRequestKey]
    .every(value => typeof value === 'string' && !!value && value.trim() === value)}
}

async function openConfigurationCandidate() {
  if (!bindConfigurationCandidate().visible) return
  const {configurationKind: kind, configurationKey: key, configurationVersionId: versionId,
    candidateRequestKey: requestKey} = $route.query
  try {
    const result = await $page.invokeHostCommand('configuration.release.prepareEnable', {kind, key, versionId, requestKey})
    result.assertCurrent()
    const {record, currentVersion, requestDigest} = result
    const previous = currentVersion ? `当前启用版 ${currentVersion.versionId} · 摘要 ${currentVersion.digest}` : '本作用域没有启用版本'
    await $page.showAlert([previous,`候选 ${record.version.versionId} · 摘要 ${record.version.digest}`,
      `预期指针 ${record.expectedPointerVersion ?? '未设置'}`,
      `类型检查 ${record.typeCheckRef} · 闭包检查 ${record.closureCheckRef} · 业务审阅 ${record.reviewRef}`,
      `待提交 · 请求摘要 ${requestDigest}`].join('\n'), '配置候选核验')
  } catch {
    $page.showMessage('配置候选或审阅证据无法核验', 'warning')
  }
}

function configurationDisableSelection() {
  const {configurationKind: kind, configurationKey: key, configurationVersionId: versionId,
    disableRequestKey: requestKey, disableDecisionRef: decisionRef} = $route.query
  return {kind, key, versionId, requestKey, decisionRef}
}

function bindConfigurationDisable() {
  return {visible: Object.values(configurationDisableSelection())
    .every(value => typeof value === 'string' && !!value && value.trim() === value)}
}

async function openConfigurationDisable() {
  if (!bindConfigurationDisable().visible) return
  const selection = configurationDisableSelection()
  const signature = JSON.stringify(selection)
  const isCurrent = () => JSON.stringify(configurationDisableSelection()) === signature
  try {
    const result = await $page.invokeHostCommand('configuration.release.prepareDisable', selection)
    if (!isCurrent()) return
    result.assertCurrent()
    const {record, requestDigest} = result
    const range = record.stopScope === 'NEW_SELECTION' ? '阻止新选用' : '暂停尚未执行的事项'
    await $page.showAlert([
      `停用版本 ${record.version.versionId} · 预期指针 ${record.expectedPointerVersion}`,
      `原停用决定 ${record.decisionRef} · 生效时间 ${record.effectiveAt}`,
      range,
      `待提交 · 请求摘要 ${requestDigest}`,
    ].join('\n'), '配置停用核验')
  } catch {
    if (isCurrent()) $page.showMessage('原停用决定或当前版本无法核验', 'warning')
  }
}
