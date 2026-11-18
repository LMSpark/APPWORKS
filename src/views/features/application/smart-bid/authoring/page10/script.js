/* global $page, $route */
let priceGeneration = 0

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
    if (result.blockingFindingRefs?.length) lines.push(`阻断问题 ${result.blockingFindingRefs.join('、')}`)
    await $page.showAlert(lines.join('\n'), '原报价批准')
  } catch {
    if (isCurrent()) $page.showMessage('指定报价批准无法核验', 'warning')
  }
}
