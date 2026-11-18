/* global $page, $route */
let original
let receipt
let originalError
let receiptError

async function __init__() {
  const {attemptRef, requestKey, requestDigest, receiptRef} = $route.query
  await Promise.all([
    attemptRef === undefined ? undefined : $page.invokeHostCommand('content.submission.readOriginal', {attemptRef, requestKey, requestDigest})
      .then(result => {original = result}, () => {originalError = '原办理记录无法核验'}),
    receiptRef === undefined ? undefined : $page.invokeHostCommand('content.submission.readReceipt', {receiptRef})
      .then(result => {receipt = result}, () => {receiptError = '接收凭据无法核验'}),
  ])
}

function bindOriginalSubmission() {
  if (!original) {
    if ($route.query.attemptRef === undefined && ($route.query.receiptRef !== undefined || bindDeadline().visible || bindOutcome().visible))
      return {visible: false}
    return {error: originalError ?? '请选择需回查的原办理'}
  }
  try {
    original.assertCurrent()
    if (!original.registered) return {status: '原请求登记结果未知'}
    const states = {DISPATCHED: '实发已证，待查接收回执', WITHDRAWAL_SENT: '撤回已发，待核生效',
      NOT_EXECUTED: '原请求明确未执行', COMBINED_SENT: '新件与撤回均有实发证据', PARTIAL: '部分办理待查', UNKNOWN: '原办理结果未知'}
    const status = states[original.status]
    if (original.combinedWithdrawalTarget && ['PARTIAL', 'COMBINED_SENT', 'UNKNOWN'].includes(original.status)) {
      const delivery = original.newDelivery ? `新件 ${original.newDelivery.actualObjectRef} · 实发凭据 ${original.newDelivery.evidenceRef}` : '新件实发待查'
      const withdrawal = original.oldWithdrawal ? `撤回 ${original.combinedWithdrawalTarget} · 已发凭据 ${original.oldWithdrawal.evidenceRef} · 生效待核` : `撤回 ${original.combinedWithdrawalTarget} · 实发待查`
      return {status: [status, delivery, withdrawal].join('；')}
    }
    return {status: original.evidenceRef ? `${status}，凭据 ${original.evidenceRef}` : status}
  } catch {
    return {error: '原办理查询已失效'}
  }
}

function bindOutcome() {
  const {lotId, roundId, stageId, subjectId, outcomeKnownAt} = $route.query
  return {visible: [lotId, roundId, stageId, subjectId, outcomeKnownAt]
    .every(value => typeof value === 'string' && value && value.trim() === value)}
}

async function openOutcome() {
  if (!bindOutcome().visible) return
  const {lotId, roundId, stageId, subjectId, outcomeKnownAt: knownAt} = $route.query
  try {
    const result = await $page.invokeHostCommand('content.submission.readOutcome', {lotId, roundId, stageId, subjectId, knownAt})
    result.assertCurrent()
    const labels = {QUALIFIED: '通过资格预审', DISQUALIFIED: '资格未通过', RECOMMENDED: '获得推荐', AWARDED: '中标或成交',
      NOT_AWARDED: '未中标或未成交', PENDING_CORRECTION: '更正待核', PENDING_CONFLICT: '结果冲突待核',
      PENDING: '缺正式结果', TERMINATED: '已终止', UNCONFIRMED: '未见终止决定', ROUND_TERMINATED: '整轮终止决定'}
    const lines = [`主体 ${result.subjectId} · ${labels[result.subjectState]}`, `轮次 ${result.roundId} · ${labels[result.roundState]}`,
      `证据截至 ${result.knownAt}`, ...result.evidence.map(item =>
        `${item.eventRef} · ${labels[item.kind]} · 原件 ${item.documentVersionId}${item.supersedesRef ? ` · 更正 ${item.supersedesRef}` : ''}`)]
    await $page.showAlert(lines.join('\n'), '阶段结果')
  } catch {
    $page.showMessage('正式阶段结果无法核验', 'warning')
  }
}

function bindDeadline() {
  const ref = $route.query.deadlineRef
  return {visible: typeof ref === 'string' && !!ref && ref.trim() === ref}
}

async function openDeadline() {
  if (!bindDeadline().visible) return
  try {
    const result = await $page.invokeHostCommand('content.submission.readDeadline', {deadlineRef: $route.query.deadlineRef})
    result.assertCurrent()
    const states = {EFFECTIVE_ATTEMPT: '有有效批次', WITHDRAWN: '已撤回', PENDING_EFFECT: '待核办理效力', PENDING_DELIVERY: '待核送达'}
    const content = {MATCHED: '内容相符', MISMATCHED: '内容有差异', PENDING: '内容待核'}
    const details = {MATCHED: '相符', MISMATCHED: '有差异', PENDING: '待核'}
    const effects = {RECEIVED: '接收', WITHDRAWN: '撤回', REPLACED: '替换'}
    const byObligation = new Map()
    for (const item of result.evidence) {
      const entries = byObligation.get(item.obligationId) ?? []
      entries.push(item)
      byObligation.set(item.obligationId, entries)
    }
    const lines = [`截止 ${result.cutoffAt} · 证据截至 ${result.knownAt}`]
    for (const item of result.items) {
      lines.push(`${item.obligationId} · ${states[item.state]}${item.attemptRef ? ` ${item.attemptRef}` : ''} · ${content[item.contentState]}`)
      for (const proof of byObligation.get(item.obligationId) ?? []) {
        const sources = proof.sources.map(source => source.sourceRef).join('、')
        lines.push(`  ${effects[proof.kind]} ${proof.attemptRef} · 事件 ${proof.eventRef} · 规则 ${proof.ruleRef} · 生效 ${proof.effectiveAt} · 获知 ${proof.knownAt} · 来源 ${sources}`)
      }
      for (const member of item.members) {
        const packageRef = member.packageId ? ` · 实包 ${member.packageId}` : ''
        lines.push(`  文件位置 ${member.position} · ${details[member.state]}${packageRef}`)
      }
      for (const field of item.fields) {
        const observation = field.observationRef ? ` · 回读 ${field.observationRef}` : ''
        const channelReceipt = field.receiptRef ? ` · 凭据 ${field.receiptRef}` : ''
        lines.push(`  平台栏 ${field.assignmentId} / ${field.fieldId} · ${details[field.state]}${observation}${channelReceipt}`)
      }
    }
    const dispositionLabels = {OPENED: '已开启', OPEN_FAILED: '开启失败', ADMITTED: '已准入', EXCLUDED: '未准入',
      PENDING: '待核', PENDING_CONFLICT: '证据冲突，待核'}
    for (const item of result.dispositions) {
      lines.push(`后续处置 · 实包 ${item.objectRef} · 批次 ${item.attemptRef} · 证据截至 ${item.knownAt}`)
      for (const [label, stage] of [['开启', item.opening], ['准入', item.admissibility]]) {
        lines.push(`  ${label} · ${dispositionLabels[stage.state]}`)
        for (const proof of stage.evidence) {
          lines.push(`    ${dispositionLabels[proof.state]} · 事件 ${proof.eventRef} · 出具方 ${proof.issuerRef} · ${proof.eventAt}`)
        }
      }
    }
    await $page.showAlert(lines.join('\n'), '截止有效组合')
  } catch {
    $page.showMessage('截止有效组合无法核验', 'warning')
  }
}

function bindOriginalReceipt() {
  if (!receipt) return receiptError ? {error: receiptError} : {visible: false}
  try {
    receipt.assertCurrent()
    if (receipt.state === 'PENDING_PAIR') return {status: `凭据 ${receipt.receiptRef}，待配对原批次`}
    if (receipt.kind === 'WITHDRAWAL_CONFIRMED') {
      return {status: `撤回确认凭据 ${receipt.receiptRef}，办理批次 ${receipt.attemptRef}，被撤回批次 ${receipt.withdrawalTargetRef}，截止效力待核`}
    }
    const labels = {RECEIVED: '接收', REJECTED: '拒收'}
    return {status: `${labels[receipt.kind]}凭据 ${receipt.receiptRef}，原批次 ${receipt.attemptRef}`}
  } catch {
    return {error: '接收凭据查询已失效'}
  }
}
