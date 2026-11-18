/* global $page, $route */
let coverage
let reviewError

function hasRef(ref) {
  return typeof ref === 'string' && !!ref && ref.trim() === ref
}

function hasObservation() {
  const {platformObservationRef, fileObservationRef, paperObservationRef, productionSelectionRef, exportRegistrationRef} = $route.query
  return [platformObservationRef, fileObservationRef, paperObservationRef, productionSelectionRef, exportRegistrationRef].some(hasRef)
}

function bindExportRegistration() {
  return {visible: hasRef($route.query.exportRegistrationRef)}
}

async function openExportRegistration() {
  if (!bindExportRegistration().visible) return
  try {
    const result = await $page.invokeHostCommand('content.review.readExportRegistration',
      {selectionRef: $route.query.exportRegistrationRef})
    result.assertCurrent()
    const details = result.state === 'REGISTERED'
      ? `原登记 ${result.producedFileId} · 文件版本 ${result.resourceVersionId}`
      : '原登记结果待确认'
    await $page.showAlert(details, '导出件登记')
  } catch (error) {
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
  try {
    const result = await $page.invokeHostCommand('content.review.recoverProduction',
      {selectionRef: $route.query.productionSelectionRef})
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
    $page.showMessage('原制作结果无法核验', 'warning')
  }
}

async function __init__() {
  const selectionRef = $route.query.reviewSelectionRef
  if (!hasRef(selectionRef)) {
    if (selectionRef === undefined && hasObservation()) return
    reviewError = '请从已固定的审定范围打开'
    return
  }
  try {
    coverage = await $page.invokeHostCommand('content.review.readCoverage', {selectionRef})
  } catch {
    reviewError = '无法核对本轮审核覆盖'
  }
}

function currentCoverage() {
  try {coverage?.assertCurrent(); return coverage}
  catch {return undefined}
}

function bindCoverage() {
  if ($route.query.reviewSelectionRef === undefined && hasObservation()) return {visible: false}
  const current = currentCoverage()
  if (!current) return {error: reviewError ?? '审核覆盖已失效'}
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
    const value = result.observedValueJson === undefined ? '' : `\n原实填值 ${result.observedValueJson}${result.unit ? ` ${result.unit}` : ''}`
    await $page.showAlert(`${result.observationRef} · ${labels[result.state]}${value}`, '平台实填回读')
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
