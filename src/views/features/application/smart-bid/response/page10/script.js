/* global $page, $route */
let priceGeneration = 0
let securityGeneration = 0
let factGeneration = 0
let assignmentGeneration = 0
let fixedFact

function selectedOriginalAssignment() {
  const {assignmentId} = $route.query
  return typeof assignmentId === 'string' && assignmentId && assignmentId.trim() === assignmentId ? assignmentId : undefined
}

function bindOriginalAssignment() {
  return {disabled: !selectedOriginalAssignment()}
}

async function openOriginalAssignment() {
  const assignmentId = selectedOriginalAssignment()
  if (!assignmentId) return
  const generation = ++assignmentGeneration
  const isCurrent = () => generation === assignmentGeneration && selectedOriginalAssignment() === assignmentId
  try {
    const result = await $page.invokeHostCommand('bid.response.readAssignment', {assignmentId})
    if (!isCurrent()) return
    result.assertCurrent()
    if (result.state === 'UNAVAILABLE') {
      await $page.showAlert('未取得指定的原分工', '原答复分工')
      return
    }
    const duties = {LEAD: '主答', SEPARATE: '分答', EVIDENCE: '举证'}
    const destinations = {DOCUMENT: '册件', FORM_CELL: '原表栏', PLATFORM_FIELD: '平台字段'}
    const lines = [`要求 ${result.lineageId} · 版本 ${result.version}`,
      ...result.assignments.map(item => `${destinations[item.kind]} ${item.targetRef} · ${duties[item.duty]} ${item.assigneeRef}`)]
    await $page.showAlert(lines.join('\n'), '原答复分工')
  } catch {
    if (isCurrent()) $page.showMessage('指定原分工无法核验', 'warning')
  }
}

function selectedFixedFact() {
  const {factId} = $route.query
  return typeof factId === 'string' && factId && factId.trim() === factId ? factId : undefined
}

function bindFixedFact() {
  return {disabled: !selectedFixedFact()}
}

function bindFixedFactRecord() {
  try {
    if (!fixedFact || fixedFact.use.factId !== selectedFixedFact()) return {visible: false}
    fixedFact.assertCurrent()
    return {dataViewKey: fixedFact.factDataViewKey, contextRowId: fixedFact.factRowId}
  } catch {
    return {visible: false}
  }
}

async function openFixedFact() {
  const factId = selectedFixedFact()
  if (!factId) return
  const generation = ++factGeneration
  fixedFact = undefined
  const isCurrent = () => generation === factGeneration && selectedFixedFact() === factId
  try {
    const result = await $page.invokeHostCommand('bid.response.readFixedFact', {factId})
    if (!isCurrent()) return
    result.assertCurrent()
    fixedFact = result
    const {version, state, useCheckRef} = result.use
    const labels = {USABLE: '可用', RESTRICTED: '受限', PENDING: '待核'}
    const lines = [`原事实 ${factId} · 版本 ${version}`, `本次用途 ${labels[state]}`]
    if (useCheckRef) lines.push(`准用核验 ${useCheckRef}`)
    await $page.showAlert(lines.join('\n'), '固定事实与用途')
  } catch {
    if (isCurrent()) $page.showMessage('本次事实准用无法核验', 'warning')
  }
}

function selectedBidSecurity() {
  const {securityRequirementVersion: requirementVersion, liablePartyRef} = $route.query
  if ([requirementVersion, liablePartyRef].every(value => typeof value === 'string' && value && value.trim() === value)) {
    return {requirementVersion, liablePartyRef}
  }
  return undefined
}

function bindBidSecurity() {
  return {disabled: !selectedBidSecurity()}
}

async function openBidSecurity() {
  const selection = selectedBidSecurity()
  if (!selection) return
  const generation = ++securityGeneration
  const isCurrent = () => {
    const current = selectedBidSecurity()
    return generation === securityGeneration && current?.requirementVersion === selection.requirementVersion &&
      current.liablePartyRef === selection.liablePartyRef
  }
  try {
    const result = await $page.invokeHostCommand('bid.response.readSecurity', selection)
    if (!isCurrent()) return
    result.assertCurrent()
    const state = {VERIFIED: '办理凭据齐备', EXEMPT: '符合免交', PENDING: '待核', UNAVAILABLE: '未取得指定要求'}[result.state]
    const lines = [state]
    if (result.clauseRef) lines.push(`原条款 ${result.clauseRef}`)
    if (result.receiptsUnavailable) lines.push('财务凭据暂无法读取')
    if (result.requested && result.state === 'PENDING') lines.push('已申请')
    if (result.pending?.length) {
      const labels = {ISSUED: '出函', RECEIVED: '到账', LINKED: '平台关联', HANDED_OVER: '现场交件'}
      lines.push(`欠项 ${result.pending.map(item => labels[item] ?? item).join('、')}`)
    }
    await $page.showAlert(lines.join('\n'), '投标担保')
  } catch {
    if (isCurrent()) $page.showMessage('本次担保办理无法核验', 'warning')
  }
}

function selectedApprovedPrice() {
  const {approvalRef, approvalVersion: version} = $route.query
  if ([approvalRef, version].every(value => typeof value === 'string' && value && value.trim() === value)) {
    return {approvalRef, version}
  }
  return undefined
}

function bindApprovedPrice() {
  return {disabled: !selectedApprovedPrice()}
}

async function openApprovedPrice() {
  const selection = selectedApprovedPrice()
  if (!selection) return
  const generation = ++priceGeneration
  const isCurrent = () => {
    const current = selectedApprovedPrice()
    return generation === priceGeneration && current?.approvalRef === selection.approvalRef &&
      current.version === selection.version
  }
  try {
    const result = await $page.invokeHostCommand('bid.response.readApprovedPrice', selection)
    if (!isCurrent()) return
    result.assertCurrent()
    const lines = result.original === 'APPROVED'
      ? [`原批准 ${result.approvalRef} · 版本 ${result.version}`, `批准值 ${result.value} ${result.unit}`]
      : ['未取得指定版本的原批准']
    const use = {USABLE: '可用', RESTRICTED: '受限', PENDING: '待核'}[result.use]
    lines.push(`本次用途 ${use}`)
    if (result.detailStatus === 'PENDING') lines.push('计价明细待核')
    if (result.detailStatus === 'DIFFERENCE') lines.push('计价明细复算有差异')
    if (result.blockingFindingRefs?.length) lines.push(`阻断问题 ${result.blockingFindingRefs.join('、')}`)
    await $page.showAlert(lines.join('\n'), '原报价批准')
  } catch {
    if (isCurrent()) $page.showMessage('指定报价批准无法核验', 'warning')
  }
}

function bindPersonAppointment() {
  const {appointmentRef} = $route.query
  return {visible: typeof appointmentRef === 'string' && !!appointmentRef && appointmentRef.trim() === appointmentRef}
}

async function openPersonAppointment() {
  if (!bindPersonAppointment().visible) return
  try {
    const result = await $page.invokeHostCommand('bid.response.reviewAppointment', {appointmentRef: $route.query.appointmentRef})
    result.assertCurrent()
    const labels = {AVAILABILITY_PENDING: '用人决定或可用时段未覆盖拟任期间', ALLOCATION_PENDING: '待核本项目现行调配'}
    const detail = result.state === 'VERIFIED'
      ? [`人员 ${result.personId} · 岗位 ${result.positionRef}`, `材料版 ${result.materialVersionRef} · 用人决定 ${result.appointmentDecisionRef}`,
        ...(result.allocationDecisionRef ? [`调配决定 ${result.allocationDecisionRef}`] : [])].join('\n')
      : labels[result.state]
    await $page.showAlert(detail, '人员拟任核对')
  } catch {
    $page.showMessage('原拟任及用人证据无法核验', 'warning')
  }
}
