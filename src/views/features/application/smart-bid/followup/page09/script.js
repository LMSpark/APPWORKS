/* global $page, $route */
function bindFollowupNotices() {
  const {followupKnownAt} = $route.query
  return {visible: typeof followupKnownAt === 'string' && !!followupKnownAt && followupKnownAt.trim() === followupKnownAt}
}

async function openFollowupNotices() {
  if (!bindFollowupNotices().visible) return
  try {
    const result = await $page.invokeHostCommand('tender.followup.readNotices', {knownAt: $route.query.followupKnownAt})
    result.assertCurrent()
    const statuses = {ACTIVE: '有效来件', SUPERSEDED: '已被更正或撤销', CANCELLED: '撤销通知',
      PENDING_LINK: '前序通知待配', PENDING_CONFLICT: '通知关系冲突'}
    const kinds = {INQUIRY: '询问', CLARIFICATION: '澄清', REVIEW: '复核', REPRICE_INVITATION: '报价邀请', OTHER: '其他'}
    const lines = [`标段 ${result.lotId} · 轮次 ${result.roundId} · 证据截至 ${result.knownAt}`]
    if (!result.items.length) lines.push('截至该时点未查到后续通知')
    for (const {event, state, origins, originalPackage} of result.items) {
      lines.push(`${event.noticeId} · ${kinds[event.kind]} · ${statuses[state]} · 原件 ${event.documentVersionId}`)
      lines.push(`  ${event.replyDueAt ? `答复截止 ${event.replyDueAt}` : '答复期限待核'} · ${event.permittedScopeRef ? '允许范围待解释' : '允许范围待取证'}`)
      if (event.previousNoticeRef) lines.push(`  前序通知 ${event.previousNoticeRef}`)
      if (originalPackage) lines.push(`  原包 ${originalPackage.packageId} · 原递交批次 ${originalPackage.attemptRef}`)
      else if (event.originalObjectRef) lines.push(`  所指原包 ${event.originalObjectRef} · 待配`)
      lines.push(`  出具方 ${event.issuerRef} · 来源 ${origins.map(origin => origin.sourceRef).join('、')}`)
    }
    await $page.showAlert(lines.join('\n'), '后续通知')
  } catch {
    $page.showMessage('后续通知无法核验', 'warning')
  }
}
