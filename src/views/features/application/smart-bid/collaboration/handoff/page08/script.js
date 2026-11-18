/* global $page, $route */
function bindBidHandoff() {
  const {handoffId} = $route.query
  return {visible: typeof handoffId === 'string' && !!handoffId && handoffId.trim() === handoffId}
}

async function openBidHandoff() {
  if (!bindBidHandoff().visible) return
  const {handoffId} = $route.query
  try {
    const result = await $page.invokeHostCommand('bid.handoff.readOriginal', {handoffId})
    result.assertCurrent()
    const states = {ACCEPTED: '已签收', RETURNED: '已退回', FOLLOWUP_REQUIRED: '缺续查安排', AWAITING_ACCEPTANCE: '待签收'}
    const lines = [`移交 ${handoffId} · ${result.handoffConfirmed ? '所列事项均已签收' : '移交待确认'}`]
    if (!result.items.length) lines.push('本次清单没有可核事项')
    for (const item of result.items) {
      lines.push(`${item.id} · 版本 ${item.versionRef} · ${states[item.state]} · 跟踪人 ${item.trackingAssigneeId}`)
      if (item.taskReceiptRef) lines.push(`  原任务凭据 ${item.taskReceiptRef}`)
      if (item.openIssueRefs.length) {
        lines.push(`  未决事项 ${item.openIssueRefs.join('、')}`)
        lines.push(`  ${item.followupRef ? `续查 ${item.followupRef}` : '续查途径待补'} · ${item.nextDueAt ? `下次核查 ${item.nextDueAt}` : '下次核查时间待补'}`)
      }
    }
    await $page.showAlert(lines.join('\n'), '本轮移交核对')
  } catch {
    $page.showMessage('本轮移交无法核验', 'warning')
  }
}

function bindHandoffComparison() {
  const {handoffId, previousHandoffId} = $route.query
  return {visible: bindBidHandoff().visible && typeof previousHandoffId === 'string' &&
    !!previousHandoffId && previousHandoffId.trim() === previousHandoffId && handoffId !== previousHandoffId}
}

async function openHandoffComparison() {
  if (!bindHandoffComparison().visible) return
  const {handoffId, previousHandoffId} = $route.query
  try {
    const result = await $page.invokeHostCommand('bid.handoff.compareVersions', {handoffId, previousHandoffId})
    result.assertCurrent()
    const changes = {ADDED: '新增', CHANGED: '换版', UNCHANGED: '同版'}
    const lines = result.items.map(item => `${item.id} · ${changes[item.state]} · ${item.versionRef} · ${
      item.requiresAcceptance ? '待签收' : `签收 ${item.acceptanceReceiptRef}`}`)
    for (const item of result.removed) {
      lines.push(`${item.id} · 已移出 · 原跟踪人 ${item.trackingAssigneeId}`)
      if (item.openIssueRefs.length) lines.push(`  未决事项 ${item.openIssueRefs.join('、')} · 续查 ${item.followupRef ?? '待补'} · ${item.nextDueAt ?? '下次核查待补'}`)
    }
    await $page.showAlert(lines.join('\n') || '两份清单均无事项', '移交清单差异')
  } catch {
    $page.showMessage('移交清单差异无法核验', 'warning')
  }
}

async function openBidProjectScope() {
  try {
    const result = await $page.invokeHostCommand('bid.project.readScope', {})
    result.assertCurrent()
    const pointerStates = {VERIFIED: '已核原记录', STAGE_MISMATCH: '原阶段不符，恢复待核',
      MISSING: '缺原记录，恢复待核', UNVERIFIED: '原记录无法核验，恢复待核'}
    const pointer = (id, state) => id === null ? '尚未形成' : `${id} · ${pointerStates[state]}`
    const lines = result.state === 'REGISTERED' ? [
      `编制项目 ${result.projectId}`,
      `阶段引用 ${result.stageRefs.join('、') || '待补'}`,
      `原正文头 ${pointer(result.headRevisionId, result.headState)}`,
      ...(result.headStage ? [`正文头阶段 ${result.headStage} · 固定基线 ${pointer(result.headBaselineId, result.headBaselineState)}`] : []),
      `激活基线 ${pointer(result.activeBaselineId, result.baselineState)}`,
      ...(result.baselineStage ? [`激活基线阶段 ${result.baselineStage}`] : []),
    ] : ['当前项目范围登记待确认']
    await $page.showAlert(lines.join('\n'), '原编制项目范围')
  } catch {
    $page.showMessage('原编制项目范围无法核验', 'warning')
  }
}
