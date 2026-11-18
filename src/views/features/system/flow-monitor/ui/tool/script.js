/* global $page */
function formatMonitorMinute(value) {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
  if (!text) return '-'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text.slice(0, 16)
  const pad = part => String(part).padStart(2, '0')
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-') + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
}
function bindMonitorTime() { return {displayFormatter: formatMonitorMinute} }
async function openFlowMonitorRun(row) { await $page.invokeHostCommand('flowMonitor.run', row) }
async function openFlowMonitorDetail(row) { await $page.invokeHostCommand('flowMonitor.detail', row) }
