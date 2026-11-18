/* global $page, $route */
let resourceHistory
let historyError
let historyGeneration = 0
let selectionGeneration = 0

async function __init__() {
  const generation = ++historyGeneration
  selectionGeneration++
  resourceHistory = undefined
  historyError = undefined
  try {
    const history = await $page.invokeHostCommand('bid.resources.readHistory', {})
    if (generation === historyGeneration) resourceHistory = history
  } catch {
    if (generation === historyGeneration) historyError = '资料版本历史无法核验'
  }
}

function currentResourceHistory() {
  try {
    resourceHistory?.assertCurrent()
    return resourceHistory
  } catch {
    return undefined
  }
}

function bindResourceVersionHistory() {
  const history = currentResourceHistory()
  return history ? {dataViewKey: history.dataViewKey} : {visible: false}
}

function bindResourceVersionHistoryStatus() {
  const history = currentResourceHistory()
  return history ? {status: `可读版本 ${history.count} 项`}
    : {error: historyError ?? (resourceHistory ? '版本历史查询已失效' : '正在读取版本历史')}
}

function bindResourceVersion() {
  const {resourceVersion} = $route.query
  return {visible: typeof resourceVersion === 'string' && !!resourceVersion && resourceVersion.trim() === resourceVersion}
}

async function openResourceVersion() {
  if (!bindResourceVersion().visible) return
  await showResourceVersion(() => $page.invokeHostCommand('bid.resources.readVersion', {version: $route.query.resourceVersion}))
}

async function openHistoricalResourceVersion(row, _column, _event, control) {
  if (control) control.cancel = true
  const history = currentResourceHistory()
  if (!history) return
  const rowKey = $page.resolveView(history.dataViewKey)?.getPkKey(row)
  if (typeof rowKey !== 'string' || !rowKey) return
  await showResourceVersion(() => history.readVersion(rowKey))
}

async function showResourceVersion(read) {
  const generation = ++selectionGeneration
  try {
    const result = await read()
    if (generation !== selectionGeneration) return
    result.assertCurrent()
    if (result.state === 'UNAVAILABLE') {
      await $page.showAlert('未取得所选资料原版', '企业资料原版')
      return
    }
    const lines = [`资料 ${result.resourceId} · 版本 ${result.version} · 原版编号 ${result.versionId}`,
      `资料类型版本 ${result.typeVersion} · 披露类别 ${result.rights === 'EXTERNAL' ? '对外' : '内部'}`]
    if (result.validFrom) lines.push(`有效起始 ${result.validFrom}`)
    if (result.validTo) lines.push(`有效截止 ${result.validTo}`)
    const sources = result.sourceTerms == null ? '待核' : JSON.stringify(result.sourceTerms)
    lines.push(`出处 ${sources}`,
      result.attachmentCount === undefined ? '原版附件待核' : `原版附件 ${result.attachmentCount} 项`,
      '实际用途许可请核原使用决定')
    await $page.showAlert(lines.join('\n'), '企业资料原版')
  } catch {
    if (generation === selectionGeneration) $page.showMessage('所选资料原版无法核验', 'warning')
  }
}
