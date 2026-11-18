/* global $page, $route */
function bindChapterImpact() {
  const {revisionId, previousFrozenBaselineId, frozenBaselineId} = $route.query
  return {visible: [revisionId, previousFrozenBaselineId, frozenBaselineId]
    .every(value => typeof value === 'string' && !!value && value.trim() === value) &&
    previousFrozenBaselineId !== frozenBaselineId}
}

async function openChapterImpact() {
  if (!bindChapterImpact().visible) return
  const {revisionId, previousFrozenBaselineId, frozenBaselineId} = $route.query
  try {
    const result = await $page.invokeHostCommand('tender.followup.traceChapterPins',
      {revisionId, previousId: previousFrozenBaselineId, currentId: frozenBaselineId})
    result.assertCurrent()
    const lines = ['原正文或基线证据待核']
    if (result.state === 'TRACED') {
      lines[0] = '原正文 ' + result.revisionId
      const labels = {PIN_CONFIRMED: '已核原挂接', REFERENCE_UNVERIFIED: '待查原引用', NEW_OBLIGATION: '新增义务'}
      for (const {previous, current, state, actualPins} of result.items) {
        lines.push([previous?.lineageId ?? current.lineageId, previous?.version ?? '无原版', current?.version ?? '未入新基线',
          labels[state], ...actualPins.map(pin => pin.chapterId)].join(' · '))
      }
      if (!result.items.length) lines.push('两版基线要求引用一致')
    }
    await $page.showAlert(lines.join('\n'), '正文条款引用追查')
  } catch {
    $page.showMessage('正文条款引用无法核验', 'warning')
  }
}

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
    if (result.packageEvidence === 'UNVERIFIED') lines.push('原包关联证据无法核验')
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
