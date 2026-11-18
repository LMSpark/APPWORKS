/* global $page, $route */
function bindBidFindingRegistration() {
  const {findingCheckRef, findingRegistrationKey} = $route.query
  return {visible: [findingCheckRef, findingRegistrationKey]
    .every(value => typeof value === 'string' && value && value.trim() === value)}
}

async function openBidFindingRegistration() {
  if (!bindBidFindingRegistration().visible) return
  const {findingCheckRef: checkRef, findingRegistrationKey: requestKey} = $route.query
  try {
    const requestDigestFromRoute = $route.query.findingRegistrationDigest
    if (requestDigestFromRoute !== undefined) {
      const original = await $page.invokeHostCommand('bid.tasks.readFindingRegistration',
        {checkRef, requestKey, requestDigest: requestDigestFromRoute})
      original.assertCurrent()
      const detail = original.state === 'REGISTERED'
        ? `原登记 ${original.registrationRef} · ${original.findingId ? `问题 ${original.findingId}` : '零问题覆盖'}`
        : '原登记结果待确认'
      await $page.showAlert(detail, '原问题登记结果')
      return
    }
    const result = await $page.invokeHostCommand('bid.tasks.prepareFindingRegistration', {checkRef, requestKey})
    result.assertCurrent()
    const {record, requestDigest} = result
    const detail = record.finding
      ? `问题 ${record.finding.findingId} · 位置 ${record.finding.positionRef} · 证据 ${record.evidenceRefs.join('、')}`
      : '已核检查覆盖，未发现问题'
    await $page.showAlert([
      `原检查 ${record.checkRef} · 目标 ${record.target.targetId} · 版本 ${record.target.versionRef}`,
      detail, `待登记 · 请求摘要 ${requestDigest}`,
    ].join('\n'), '登记问题或检查覆盖')
  } catch {
    $page.showMessage('原检查与问题证据无法核验', 'warning')
  }
}

function bindBidFindingRecheck() {
  const {findingId, expectedFindingVersion, recheckRequestKey} = $route.query
  return {visible: [findingId, expectedFindingVersion, recheckRequestKey]
    .every(value => typeof value === 'string' && value && value.trim() === value)}
}

async function openBidFindingRecheck() {
  if (!bindBidFindingRecheck().visible) return
  const {findingId, expectedFindingVersion, recheckRequestKey: requestKey} = $route.query
  try {
    const labels = {UNRESOLVED: '未解', CORRECTED: '已纠正', FALSE_POSITIVE: '误报', WAIVED: '例外处置'}
    const digest = $route.query.recheckRequestDigest
    if (digest !== undefined) {
      const original = await $page.invokeHostCommand('bid.tasks.readRecheckResult',
        {findingId, expectedFindingVersion, requestKey, requestDigest: digest})
      original.assertCurrent()
      const detail = original.state === 'REGISTERED'
        ? `原复验 ${original.recheckRef} · ${labels[original.outcome]} · 证据 ${original.evidenceRef}`
        : '原复验结果待确认'
      await $page.showAlert(detail, '原复验结果')
      return
    }
    const result = await $page.invokeHostCommand('bid.tasks.prepareRecheck', {findingId, expectedFindingVersion, requestKey})
    result.assertCurrent()
    const {record, requestDigest} = result
    const lines = [`问题 ${record.findingId} · 问题版 ${record.expectedFindingVersion}`,
      `复验目标 ${record.checkedTarget.targetId} · 版本 ${record.checkedTarget.versionRef}`,
      `拟登记结论 ${labels[record.outcome]} · 证据 ${record.evidenceRef}`, `请求摘要 ${requestDigest}`]
    await $page.showAlert(lines.join('\n'), '问题复验')
  } catch {
    $page.showMessage('复验证据无法核验', 'warning')
  }
}

async function openBidFindings() {
  try {
    const result = await $page.invokeHostCommand('bid.tasks.readFindings', {})
    result.assertCurrent()
    const statuses = {OPEN: '未决', RESOLVED: '已处理', WAIVED: '已豁免', STALE: '需复验'}
    const severity = {BLOCK: '阻断', CONFIRM: '待确认', HINT: '提示'}
    const lines = [`修订 ${result.revisionId}`]
    if (!result.completed.length) lines.push('缺已完成的检查覆盖')
    else if (!result.findings.length) lines.push('已核范围内未查到问题记录')
    for (const item of result.findings) {
      lines.push(`${item.id} · ${severity[item.severity]} · ${statuses[item.status]} · 目标 ${item.targetId} · 内容摘要 ${item.effectiveHash}`)
    }
    await $page.showAlert(lines.join('\n'), '任务问题回查')
  } catch {
    $page.showMessage('原检查问题无法核验', 'warning')
  }
}
