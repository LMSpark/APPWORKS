/* global $page, $route */
let priceGeneration = 0
let securityGeneration = 0

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
