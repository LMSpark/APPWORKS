/* global $page, $route */
function bindAllocation() {
  const {resourceVersionId, allocationRequestRef} = $route.query
  return {visible: [resourceVersionId, allocationRequestRef].every(value =>
    typeof value === 'string' && !!value && value.trim() === value)}
}

async function openAllocation() {
  if (!bindAllocation().visible) return
  const {resourceVersionId, allocationRequestRef: requestRef} = $route.query
  try {
    const result = await $page.invokeHostCommand('bid.resources.checkAllocation', {resourceVersionId, requestRef})
    result.assertCurrent()
    if (result.state === 'PENDING') {
      await $page.showAlert('占用记录尚未核全', '跨项目占用核对')
      return
    }
    const {start, end, units} = result.requested
    const lines = [`资源版本 ${result.resourceVersionId} · 限额 ${result.limit} · 申请 ${units}`,
      `申请时段 ${new Date(start).toISOString()} 至 ${new Date(end).toISOString()}`]
    if (result.state === 'CLEAR') lines.push('本时段未发现占用冲突')
    else {
      if (result.exclusive) lines.push('存在排他占用冲突')
      if (result.overLimit) lines.push('申请与已有占用合计超出限额')
      if (result.allocationRefs.length) lines.push(`涉及占用 ${result.allocationRefs.join('、')}`)
    }
    await $page.showAlert(lines.join('\n'), '跨项目占用核对')
  } catch {
    $page.showMessage('原申请或占用证据无法核验', 'warning')
  }
}

function bindAllocationRelease() {
  const {allocationRef} = $route.query
  return {visible: typeof allocationRef === 'string' && !!allocationRef && allocationRef.trim() === allocationRef}
}

async function openAllocationRelease() {
  if (!bindAllocationRelease().visible) return
  try {
    const {allocationRef} = $route.query
    const result = await $page.invokeHostCommand('bid.resources.checkRelease', {allocationRef})
    result.assertCurrent()
    const detail = result.state === 'READY_FOR_RELEASE_DECISION'
      ? `原调配 ${result.allocationRef} · 可交释放决定 · 终止证据 ${result.evidenceRefs.join('、') || '无适用义务'}`
      : result.state === 'KEEP_OCCUPIED' ? `继续占用 · 待核义务 ${result.pending.join('、')}` : '原义务清单尚未核全，继续占用'
    await $page.showAlert(detail, '资源释放前核对')
  } catch {
    $page.showMessage('原调配或义务终止证据无法核验', 'warning')
  }
}
