/* global $page, $route */
let coverage
let reviewError

function hasRef(ref) {
  return typeof ref === 'string' && !!ref && ref.trim() === ref
}

function hasObservation() {
  const {platformObservationRef, fileObservationRef, paperObservationRef, productionSelectionRef, exportRegistrationRef, signedRegistrationRef, paperRegistrationRef} = $route.query
  return [platformObservationRef, fileObservationRef, paperObservationRef, productionSelectionRef, exportRegistrationRef, signedRegistrationRef, paperRegistrationRef].some(hasRef)
}

function bindPaperRegistration() {
  return {visible: hasRef($route.query.paperRegistrationRef)}
}

async function openPaperRegistration() {
  if (!bindPaperRegistration().visible) return
  try {
    const result = await $page.invokeHostCommand('content.review.preparePaperRegistration',
      {selectionRef: $route.query.paperRegistrationRef})
    result.assertCurrent()
    const {record} = result
    const copies = record.copies.map(copy => `份次 ${copy.copyRef} · ${copy.pageRefs.length} 页`)
    const status = result.registrationRef ? `原登记 ${result.registrationRef}` : '待登记'
    await $page.showAlert([`纸件 ${record.paperRef} · 清点凭据 ${record.witnessRef}`, ...copies, status].join('\n'), '纸件登记前核验')
  } catch {
    $page.showMessage('纸件份数、页序或原印制凭据无法核验', 'warning')
  }
}

function bindSignedRegistration() {
  return {visible: hasRef($route.query.signedRegistrationRef)}
}

async function openSignedRegistration() {
  if (!bindSignedRegistration().visible) return
  const selectionRef = $route.query.signedRegistrationRef
  try {
    const result = await $page.invokeHostCommand('content.review.prepareSignedRegistration',
      {selectionRef})
    if ($route.query.signedRegistrationRef !== selectionRef) return
    result.assertCurrent()
    if (result.state === 'SIGNED_REGISTERED') {
      await $page.showAlert(`原登记 ${result.producedFileId} · 文件版本 ${result.resourceVersionId}`, '签后件登记核验')
      return
    }
    const labels = {UNKNOWN: '原签署结果待确认', IN_PROGRESS: '原签署正在办理', NOT_EFFECTIVE: '原签署未生效'}
    const details = result.state === 'PREPARED'
      ? `签后对象 ${result.record.signedObjectRef} · 原签署操作 ${result.record.signatureOperationRef}\n实件 SHA-256 ${result.record.fileHash}`
      : labels[result.state]
    await $page.showAlert(details, '签后件登记前核验')
  } catch {
    if ($route.query.signedRegistrationRef === selectionRef) $page.showMessage('签后件与原签署结果无法核验', 'warning')
  }
}

function bindExportRegistration() {
  return {visible: hasRef($route.query.exportRegistrationRef)}
}

async function openExportRegistration() {
  if (!bindExportRegistration().visible) return
  const selectionRef = $route.query.exportRegistrationRef
  try {
    const result = await $page.invokeHostCommand('content.review.readExportRegistration',
      {selectionRef})
    if ($route.query.exportRegistrationRef !== selectionRef) return
    result.assertCurrent()
    const details = result.state === 'REGISTERED'
      ? `原登记 ${result.producedFileId} · 文件版本 ${result.resourceVersionId}`
      : '原登记结果待确认'
    await $page.showAlert(details, '导出件登记')
  } catch (error) {
    if ($route.query.exportRegistrationRef !== selectionRef) return
    const message = error?.message === 'BID_EXPORT_REGISTRATION_HASH_CONFLICT'
      ? '同一输出的文件摘要与原登记不同，请交制作人核查'
      : '原登记结果无法核验'
    $page.showMessage(message, 'warning')
  }
}

function bindProductionRecovery() {
  return {visible: hasRef($route.query.productionSelectionRef)}
}

async function openProductionRecovery() {
  if (!bindProductionRecovery().visible) return
  const selectionRef = $route.query.productionSelectionRef
  try {
    const result = await $page.invokeHostCommand('content.review.recoverProduction',
      {selectionRef})
    if ($route.query.productionSelectionRef !== selectionRef) return
    result.assertCurrent()
    const labels = {UNKNOWN: '原制作请求的结果待确认', IN_PROGRESS: '原制作请求正在处理',
      NOT_EFFECTIVE: '原制作请求未生效'}
    const details = result.state === 'COMPLETED' || result.state === 'PARTIAL'
      ? result.verifiedFiles.map(file =>
        `已核验文件 ${file.producedFileId} · 修订 ${file.revisionId}\n范围 ${file.completedScopeRefs.join('、')}\nSHA-256 ${file.versionHash}`).join('\n\n')
      : labels[result.state]
    const missing = result.state === 'PARTIAL' ? `\n部分完成，待出件范围 ${result.missingScopeRefs.join('、')}` : ''
    await $page.showAlert(details + missing, '原制作结果')
  } catch {
    if ($route.query.productionSelectionRef === selectionRef) $page.showMessage('原制作结果无法核验', 'warning')
  }
}

let coverageSelection
let coverageLoad = 0

async function __init__() {
  const load = ++coverageLoad
  const selectionRef = $route.query.reviewSelectionRef
  coverageSelection = selectionRef
  coverage = undefined
  reviewError = undefined
  if (!hasRef(selectionRef)) {
    if (selectionRef === undefined && hasObservation()) return
    reviewError = '请从已固定的审定范围打开'
    return
  }
  try {
    const result = await $page.invokeHostCommand('content.review.readCoverage', {selectionRef})
    if (load === coverageLoad && selectionRef === $route.query.reviewSelectionRef) coverage = result
  } catch {
    if (load === coverageLoad && selectionRef === $route.query.reviewSelectionRef) reviewError = '无法核对本轮审核覆盖'
  }
}

function currentCoverage() {
  if (coverageSelection !== $route.query.reviewSelectionRef) return undefined
  try {coverage?.assertCurrent(); return coverage}
  catch {return undefined}
}

function bindCoverage() {
  if ($route.query.reviewSelectionRef === undefined && hasObservation()) return {visible: false}
  const current = currentCoverage()
  if (!current) return {error: (coverageSelection === $route.query.reviewSelectionRef ? reviewError : undefined) ?? '审核覆盖已失效'}
  const covered = current.items.filter(item => item.state === 'COVERED').length
  return {status: `已覆盖 ${covered} 项，共 ${current.items.length} 项`}
}

function bindObservations() {
  return {visible: hasObservation()}
}

function bindDetails() {
  return {visible: (currentCoverage()?.items.length ?? 0) > 0}
}

async function openDetails() {
  const current = currentCoverage()
  if (!current) return
  const labels = {COVERED: '已覆盖', NO_APPROVAL: '缺批准', CHANGED: '版本已变更',
    CHECK_REQUIRED: '待同版检查', BLOCKED: '有阻断项', USE_CHECK_REQUIRED: '待核用途许可'}
  await $page.showAlert(current.items.map(item =>
    `${item.kind === 'FILE' ? '文件' : '平台栏'} ${item.targetId} · ${labels[item.state]}`).join('\n'), '审核覆盖明细')
}

function bindObservation() {
  return {visible: hasRef($route.query.platformObservationRef)}
}

async function openObservation() {
  if (!bindObservation().visible) return
  try {
    const result = await $page.invokeHostCommand('content.review.readPlatformObservation',
      {selectionRef: $route.query.platformObservationRef})
    result.assertCurrent()
    const labels = {MATCHED: '与本版批准值一致', MISMATCHED: '与本版批准值不一致',
      STAGE_REQUIRED: '本次记录缺所需平台状态', RECEIPT_REQUIRED: '缺同次提交回执'}
    const stages = {DRAFT: '草稿', SAVED: '已保存', SUBMITTED: '提交观察'}
    const lines = [
      `观察 ${result.observationRef} · 办理 ${result.attemptRef} · 栏位 ${result.fieldId}`,
      `原记录状态 ${stages[result.observedStage]} · ${labels[result.state]}`,
      `原观察值 ${result.observedValueJson}${result.unit ? ` ${result.unit}` : ''}`,
    ]
    if (result.approvalRef) lines.push(`批准依据 ${result.approvalRef}`)
    if (result.receiptRef) lines.push(`同次提交回执 ${result.receiptRef}`)
    await $page.showAlert(lines.join('\n'), '平台实填回读')
  } catch {
    $page.showMessage('平台实填证据无法核验', 'warning')
  }
}

function bindFileObservation() {
  return {visible: hasRef($route.query.fileObservationRef)}
}

async function openFileObservation() {
  if (!bindFileObservation().visible) return
  try {
    const result = await $page.invokeHostCommand('content.review.readFileObservation',
      {selectionRef: $route.query.fileObservationRef})
    result.assertCurrent()
    const lines = [`文件 ${result.file.producedFileId} · 位置 ${result.locationRef}`,
      `原实填值 ${result.observedValueJson}${result.unit ? ` ${result.unit}` : ''}`]
    if (result.form) {
      const {formVersion, cellRef, expectedUnit, unitMatched} = result.form
      lines.push(`原表版本 ${formVersion} · 栏位 ${cellRef}`)
      if (!unitMatched) lines.push(`实填单位与原表不同，应为 ${expectedUnit ?? '无单位'}`)
    }
    if (result.comparison) {
      result.comparison.assertCurrent()
      const {approvalRef, valueJson, unit, state} = result.comparison
      lines.push(`批准 ${approvalRef} · ${valueJson}${unit ? ` ${unit}` : ''}`,
        state === 'MATCHED' ? '实填与批准一致' : '实填与批准不同')
    }
    await $page.showAlert(lines.join('\n'), '文件实填回读')
  } catch {
    $page.showMessage('文件实填证据无法核验', 'warning')
  }
}

function bindPaperObservation() {
  return {visible: hasRef($route.query.paperObservationRef)}
}

async function openPaperObservation() {
  if (!bindPaperObservation().visible) return
  try {
    const result = await $page.invokeHostCommand('content.review.readPaperObservation',
      {selectionRef: $route.query.paperObservationRef})
    result.assertCurrent()
    const lines = [`纸件 ${result.paperRef} · 份次 ${result.copyRef}`,
      `页 ${result.pageRef} · 位置 ${result.locationRef}`,
      `原实填值 ${result.observedValueJson}${result.unit ? ` ${result.unit}` : ''}`,
      `原登记 ${result.registrationRef} · 观察凭据 ${result.evidenceRef}`]
    await $page.showAlert(lines.join('\n'), '纸件实填回读')
  } catch {
    $page.showMessage('纸件实填证据无法核验', 'warning')
  }
}
