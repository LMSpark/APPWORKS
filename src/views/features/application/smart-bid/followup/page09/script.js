/* global $page, $route */
function bindOutboundImpact() {
  return {visible: bindTenderAddendum().visible && bindFollowupNotices().visible}
}

async function openOutboundImpact() {
  if (!bindOutboundImpact().visible) return
  const {addendumId, followupKnownAt} = $route.query
  try {
    const result = await $page.invokeHostCommand('tender.followup.traceOutboundBatches', {addendumId, knownAt: followupKnownAt})
    result.assertCurrent()
    const lines = ['正式修改或原渠道办理批次待核']
    if (result.state === 'BATCH_EVIDENCE') {
      lines[0] = `正式修改 ${result.addendumId} · 截止 ${result.cutoffAt} · 证据截至 ${result.knownAt}`
      const kinds = {RECEIVED: '送达', WITHDRAWN: '撤回', REPLACED: '替换'}
      for (const item of result.evidence) {
        lines.push(`事项 ${item.obligationId} · ${kinds[item.kind]}批次 ${item.attemptRef} · 原回执 ${item.eventRef}`)
        if (item.priorAttemptRef) lines.push(`原被替换批次 ${item.priorAttemptRef}`)
      }
      if (!result.evidence.length) lines.push('本次对账范围内无已核渠道办理证据')
      const contentStates = {MATCHED: '一致', MISMATCHED: '有差异', PENDING: '待核'}
      for (const change of result.changes) {
        if (!change.receiptRefs.length) {
          lines.push(`变动 ${change.changeId} · 对应原办理批次待核`)
          continue
        }
        lines.push(`变动 ${change.changeId} · 事项 ${change.obligationId} · 原回执 ${change.receiptRefs.join('、')}`)
        const content = change.content
        if (!content) {
          lines.push('截止有效批次的递交内容待核')
          continue
        }
        lines.push(`截止有效批次 ${content.attemptRef} · 递交内容${contentStates[content.state]}`)
        for (const member of content.members) lines.push(`文件 ${member.position} · ${contentStates[member.state]}`)
        for (const field of content.fields) lines.push(`平台字段 ${field.assignmentId} / ${field.fieldId} · ${contentStates[field.state]}`)
      }
    }
    await $page.showAlert(lines.join('\n'), '递交批次反查')
  } catch {
    $page.showMessage('原办理批次无法核验', 'warning')
  }
}

function bindCallImpact() {
  const {addendumId, runId, attemptRef, requestKey} = $route.query
  return {visible: [addendumId, runId, attemptRef, requestKey]
    .every(value => typeof value === 'string' && !!value && value.trim() === value)}
}

async function openCallImpact() {
  if (!bindCallImpact().visible) return
  const {addendumId, runId, attemptRef, requestKey} = $route.query
  try {
    const result = await $page.invokeHostCommand('tender.followup.traceCallReferences', {addendumId, runId, attemptRef, requestKey})
    result.assertCurrent()
    const lines = ['原调用引用或正式修改登记待核']
    if (result.state === 'CALLS_TRACED') {
      lines[0] = '原试次 ' + result.attemptRef
      const decisions = {REDO: '重做', RECHECK: '复核', REUSE: '沿用'}
      for (const {source, references, results} of result.impacts) {
        lines.push(`${source.id} · 修改依据 ${source.current.documentVersionId} / ${source.current.locator}`)
        if (!references.length) lines.push('本试次未核得对应旧版引用')
        for (const item of references) {
          lines.push(`调用 ${item.callRef} · 成果 ${item.resultRef} · 字段 ${item.fieldPath} · 版本 ${item.version}`)
        }
        for (const {resultRef, disposition} of results) {
          lines.push(disposition ? `成果 ${resultRef} · ${decisions[disposition.decision]} · 责任人 ${disposition.ownerRef} · 登记 ${disposition.decisionRef} · ${disposition.reason}` :
            `成果 ${resultRef} · 原处置待核`)
        }
      }
    }
    await $page.showAlert(lines.join('\n'), '原调用条款引用')
  } catch {
    $page.showMessage('原调用条款引用无法核验', 'warning')
  }
}

function bindTenderAddendum() {
  const {addendumId} = $route.query
  return {visible: typeof addendumId === 'string' && !!addendumId && addendumId.trim() === addendumId}
}

async function openTenderAddendum() {
  if (!bindTenderAddendum().visible) return
  try {
    const result = await $page.invokeHostCommand('tender.followup.readAddendum', {addendumId: $route.query.addendumId})
    result.assertCurrent()
    const lines = ['正式修改登记待核']
    if (result.state === 'REGISTERED') {
      lines[0] = `登记 ${result.id} · 发布方 ${result.issuerRef} · 发布凭据 ${result.publicationRef}`
      lines.push(`适用范围 ${result.applicableScopeRef} · 生效 ${result.effectiveAt}`)
      const labels = {ADDED: '新增', REPLACED: '替换', CANCELLED: '取消'}
      for (const item of result.items) {
        lines.push(`${item.id} · ${labels[item.kind]} · ${item.subjectRef}`)
        if (item.previous) lines.push(`原位 ${item.previous.documentVersionId} / ${item.previous.locator}`)
        lines.push(`修改依据 ${item.current.documentVersionId} / ${item.current.locator}`)
      }
      if (!result.items.length) lines.push('登记无可核对的变动条项')
    }
    await $page.showAlert(lines.join('\n'), '正式澄清与修改')
  } catch {
    $page.showMessage('正式修改原位无法核验', 'warning')
  }
}

function bindChapterImpact() {
  const {revisionId, previousFrozenBaselineId, frozenBaselineId, addendumId} = $route.query
  return {visible: [revisionId, previousFrozenBaselineId, addendumId]
    .every(value => typeof value === 'string' && !!value && value.trim() === value) &&
    (frozenBaselineId === undefined || (typeof frozenBaselineId === 'string' && !!frozenBaselineId &&
      frozenBaselineId.trim() === frozenBaselineId)) &&
    previousFrozenBaselineId !== frozenBaselineId}
}

async function openChapterImpact() {
  if (!bindChapterImpact().visible) return
  const {revisionId, previousFrozenBaselineId, frozenBaselineId, addendumId} = $route.query
  try {
    const result = await $page.invokeHostCommand('tender.followup.traceChapterPins',
      {revisionId, previousId: previousFrozenBaselineId, currentId: frozenBaselineId ?? null, addendumId})
    result.assertCurrent()
    const lines = ['正式修改、原正文或基线证据待核']
    if (result.state === 'ADDENDUM_TRACED') {
      lines[0] = `正式修改 ${result.addendumId} · 原正文 ${result.revisionId}`
      if (result.revisionEvidence === 'UNKNOWN') lines.push('原正文或基线证据待核，以下为正式修改列明的影响范围')
      const labels = {PIN_CONFIRMED: '已核原挂接', REFERENCE_UNVERIFIED: '待查原引用', NEW_OBLIGATION: '新增义务'}
      for (const {source, matching, originalPins} of result.impacts) {
        lines.push(`${source.id} · ${source.subjectRef} · 修改依据 ${source.current.documentVersionId} / ${source.current.locator}`)
        if (source.previous) lines.push(`原位 ${source.previous.documentVersionId} / ${source.previous.locator}`)
        if (!matching) {
          if (originalPins.length) lines.push('已核旧版原挂接 · ' + originalPins.map(pin => pin.chapterId).join('、'))
          lines.push('本项的基线条款差异待核')
          continue
        }
        const {previous, current, state, actualPins} = matching
        lines.push([source.requirementLineageId, previous?.version ?? '无原版', current?.version ?? '未入新基线',
          labels[state], ...actualPins.map(pin => pin.chapterId)].join(' · '))
      }
      if (!result.impacts.length) lines.push('登记无可追查的变动条项')
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
