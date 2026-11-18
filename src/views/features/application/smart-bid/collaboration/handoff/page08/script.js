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
