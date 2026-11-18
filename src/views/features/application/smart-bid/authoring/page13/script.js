/* global $page, $route */
let original
let lookupError

async function __init__() {
  const {attemptRef, requestKey, requestDigest} = $route.query
  if (![attemptRef, requestKey, requestDigest].every(value => typeof value === 'string' && value.trim() === value && value)) {
    lookupError = '请选择需回查的原递交请求'
    return
  }
  try {
    original = await $page.invokeHostCommand('content.submission.readOriginal', {attemptRef, requestKey, requestDigest})
  } catch {
    lookupError = '原递交记录无法核验'
  }
}

function bindOriginalSubmission() {
  if ($route.query.attemptRef === undefined && (bindPackage().visible || bindPaperPackage().visible || bindSubmissionPreparation().visible || bindFreezePreparation().visible || bindPackingPreparation().visible)) return {visible: false}
  if (!original) return {error: lookupError ?? '原递交记录无法读取'}
  try {
    original.assertCurrent()
    if (!original.registered) return {status: '原请求登记结果未知'}
    const labels = {DISPATCHED: '实发已证，待查接收回执', WITHDRAWAL_SENT: '撤回已发，待核生效',
      NOT_EXECUTED: '原请求明确未执行', COMBINED_SENT: '新件与撤回均有实发证据', PARTIAL: '部分办理待查', UNKNOWN: '原办理结果未知'}
    const status = labels[original.status]
    if (original.combinedWithdrawalTarget && ['PARTIAL', 'COMBINED_SENT', 'UNKNOWN'].includes(original.status)) {
      const delivery = original.newDelivery ? `新件 ${original.newDelivery.actualObjectRef} · 实发凭据 ${original.newDelivery.evidenceRef}` : '新件实发待查'
      const withdrawal = original.oldWithdrawal ? `撤回 ${original.combinedWithdrawalTarget} · 已发凭据 ${original.oldWithdrawal.evidenceRef} · 生效待核` : `撤回 ${original.combinedWithdrawalTarget} · 实发待查`
      return {status: [status, delivery, withdrawal].join('；')}
    }
    return {status: original.evidenceRef ? `${status}，凭据 ${original.evidenceRef}` : status}
  } catch {
    return {error: '原递交查询已失效'}
  }
}

function bindPackingPreparation() {
  const ref = $route.query.packingSelectionRef
  return {visible: typeof ref === 'string' && !!ref && ref.trim() === ref}
}

async function openPackingPreparation() {
  if (!bindPackingPreparation().visible) return
  try {
    const result = await $page.invokeHostCommand('content.submission.preparePacking', {selectionRef: $route.query.packingSelectionRef})
    result.assertCurrent()
    if (result.status === 'REGISTRATION_VERIFIED') {
      await $page.showAlert(`原包登记 ${result.verified.packageId}\n实包摘要 ${result.verified.packageHash}`, '电子包登记核验')
      return
    }
    const labels = {UNKNOWN: '原冻结结果待确认', NOT_EFFECTIVE: '原冻结未生效'}
    const details = result.status === 'PREPARED'
      ? `待核包共 ${result.candidate.packed.length} 件\n选件版本 ${result.candidate.selectionVersion}\n摘要 ${result.candidate.packageHash}`
      : labels[result.status]
    await $page.showAlert(details, '电子封装准备')
  } catch {
    $page.showMessage('无法核验原冻结或本次封装用途', 'warning')
  }
}

function bindFreezePreparation() {
  const ref = $route.query.freezeSelectionRef
  return {visible: typeof ref === 'string' && !!ref && ref.trim() === ref}
}

async function openFreezePreparation() {
  if (!bindFreezePreparation().visible) return
  try {
    const prepared = await $page.invokeHostCommand('content.submission.prepareFreeze', {selectionRef: $route.query.freezeSelectionRef})
    prepared.assertCurrent()
    const {record} = prepared
    await $page.showAlert(`待冻结选件 ${record.selectionId} · 版本 ${record.selectionVersion}\n共 ${record.members.length} 件\n摘要 ${record.selectionHash}`, '交付选件核验')
  } catch (error) {
    $page.showMessage(error?.message === 'DELIVERY_FREEZE_MEMBER_USE' ? '选件缺同版用途凭据或包含只读件' : '无法核验待冻结选件', 'warning')
  }
}

function bindSubmissionPreparation() {
  const {plannedAttemptRef, plannedRequestKey} = $route.query
  return {visible: [plannedAttemptRef, plannedRequestKey].every(value => typeof value === 'string' && value && value.trim() === value)}
}

async function openSubmissionPreparation() {
  if (!bindSubmissionPreparation().visible) return
  const {plannedAttemptRef: attemptRef, plannedRequestKey: requestKey, plannedWithdrawalTarget} = $route.query
  try {
    if (plannedWithdrawalTarget !== undefined && typeof plannedWithdrawalTarget !== 'string') throw Error('SUBMISSION_PAGE_REQUEST_REQUIRED')
    const combinedWithdrawalTarget = plannedWithdrawalTarget === undefined ? null : plannedWithdrawalTarget
    const result = await $page.invokeHostCommand('content.submission.prepareRequest', {attemptRef, requestKey, combinedWithdrawalTarget})
    result.assertCurrent()
    const labels = {ORIGINAL_PENDING: '原办理结果待查', ORIGINAL_ALREADY_RECORDED: '已有原办理记录',
      OUTSIDE_WINDOW: '当前办理时刻超出递交窗口', NOT_READY: '交付内容或代表权限未核齐'}
    const message = result.state === 'PREPARED'
      ? `待发请求已生成，待登记 · ${result.record.requestKey}${result.record.combinedWithdrawalTarget ? ` · 拟撤回 ${result.record.combinedWithdrawalTarget}` : ''} · 摘要 ${result.requestDigest}`
      : labels[result.state]
    await $page.showAlert(message, '递交前核验')
  } catch {
    $page.showMessage('待发请求无法核验', 'warning')
  }
}

function bindPaperPackage() {
  const {paperPackageId, paperPackingRequestRef} = $route.query
  return {visible: [paperPackageId, paperPackingRequestRef].every(value => typeof value === 'string' && value && value.trim() === value)}
}

async function openPaperPackage() {
  if (!bindPaperPackage().visible) return
  const {paperPackageId: packageId, paperPackingRequestRef: packingRequestRef} = $route.query
  try {
    const result = await $page.invokeHostCommand('content.submission.reviewPaperPackage', {packageId, packingRequestRef})
    result.assertCurrent()
    const labels = {UNPLANNED: '不在原清单', PACKING_RECORD_MISSING: '缺装封记录', MEMBER_MISSING: '实包缺件',
      COUNT_PENDING: '待清点', PACKING_MISMATCH: '装封与清单不符', OBSERVED_VERSION_MISMATCH: '实包纸件版本不符',
      COPY_COUNT_MISMATCH: '实见份数不符'}
    const describe = (label, member) => member
      ? `${label} ${member.paperRef} / ${member.versionRef} / ${member.copies} 份`
      : `${label} 无记录`
    const lines = [`封装 ${result.sealRef} · 见证 ${result.witnessRef}`,
      ...result.members.map(item => [item.position, describe('应装', item.expected), describe('实装', item.packed),
        describe('实见', item.observed), item.issues.length ? item.issues.map(issue => labels[issue]).join('、') : '一致'].join(' · '))]
    lines.push(...describePackageRelease(result.membershipMatches, result.release))
    await $page.showAlert(lines.join('\n'), '纸件清点')
  } catch {
    $page.showMessage('纸件清点证据无法核验', 'warning')
  }
}

function describePackageRelease(membershipMatches, release) {
  if (!membershipMatches) return ['放行条件未满足，成员有差异或待核项']
  if (!release) return ['放行条件待核']
  const requirements = {SELECTION_USE: '选件适用', APPROVAL: '批准覆盖', SIGNATURE: '签署覆盖'}
  return [release.deliverable ? '放行核对通过' : '放行条件未满足', ...release.decisions.map(item => {
    const status = item.accepted ? '通过' : item.evidenceRef ? '未通过' : '缺证据'
    return `${requirements[item.kind]} ${item.targetId} · ${status}`
  })]
}

function bindPackage() {
  const {packageId, packingRequestRef} = $route.query
  return {visible: [packageId, packingRequestRef].every(value => typeof value === 'string' && value && value.trim() === value)}
}

async function openPackage() {
  if (!bindPackage().visible) return
  try {
    const {packageId, packingRequestRef} = $route.query
    const result = await $page.invokeHostCommand('content.submission.reviewPackage', {packageId, packingRequestRef})
    result.assertCurrent()
    if (result.status !== 'FROZEN') {
      await $page.showAlert(result.status === 'NOT_EFFECTIVE' ? '原冻结明确未生效' : '原冻结结果未知', '实包成员核对')
      return
    }
    const labels = {UNPLANNED: '不在原清单', PACKING_RECORD_MISSING: '缺装封记录', MEMBER_MISSING: '实包缺件',
      PACKED_VERSION_MISMATCH: '装封版本不符', OBSERVED_HASH_MISMATCH: '实包摘要不符'}
    const {proof} = result
    const lines = [`包 ${proof.packageId} · ${proof.membershipMatches ? '成员一致' : '成员存在差异'}`,
      ...proof.members.map(item => `${item.position} · ${item.issues.length ? item.issues.map(issue => labels[issue]).join('、') : '一致'}`)]
    lines.push(...describePackageRelease(proof.membershipMatches, result.release))
    await $page.showAlert(lines.join('\n'), '实包成员核对')
  } catch {
    $page.showMessage('实包成员无法核验', 'warning')
  }
}
