/* global $page, $route */
let directory
let directoryError
let directoryIsCurrent
let selectionGeneration = 0
let dispatch
let dispatchError
let dispatchIsCurrent
let hasAttempt = false
let reworkPending = false

async function __init__() {
  const generation = ++selectionGeneration
  directory = undefined
  directoryError = undefined
  dispatch = undefined
  dispatchError = undefined
  const {projectId, runId, attemptRef, requestKey, targetDigest, configurationLockHash} = $route.query
  const directoryRef = $route.query.directoryRef
  const isDirectoryCurrent = () => $route.query.projectId === projectId && $route.query.directoryRef === directoryRef
  directoryIsCurrent = isDirectoryCurrent
  const attempt = {runId, attemptRef, requestKey, targetDigest, configurationLockHash}
  const isCurrent = () => $route.query.projectId === projectId &&
    Object.entries(attempt).every(([key, value]) => $route.query[key] === value)
  dispatchIsCurrent = isCurrent
  hasAttempt = Object.values(attempt).some(value => value != null)
  if (hasAttempt) {
    try {
      const result = await $page.invokeHostCommand('content.operation.readDispatch',
        attempt)
      if (generation === selectionGeneration && isCurrent()) dispatch = result
    } catch {
      if (generation === selectionGeneration && isCurrent()) dispatchError = '原试次实发记录无法读取'
    }
  }
  if (generation !== selectionGeneration || !isDirectoryCurrent()) return
  if (typeof directoryRef !== 'string' || !directoryRef || directoryRef.trim() !== directoryRef) {
    if (!hasAttempt) directoryError = '请从业务目录打开本工作区'
    return
  }
  try {
    const result = await $page.invokeHostCommand('content.operation.discover', {directoryRef})
    if (generation === selectionGeneration && isDirectoryCurrent()) directory = result
  } catch {
    if (generation === selectionGeneration && isDirectoryCurrent()) directoryError = '指南目录读取失败'
  }
}

function currentDirectory() {
  if (!directoryIsCurrent?.()) return undefined
  try {
    directory?.assertCurrent()
    return directory
  } catch {
    return undefined
  }
}

function bindDirectory() {
  const current = currentDirectory()
  return current ? {dataViewKey: current.dataViewKey} : {visible: false}
}

function bindDirectoryStatus() {
  if (directoryIsCurrent && !directoryIsCurrent()) return {visible: false}
  const current = currentDirectory()
  if (current) return {status: `目录指南 ${current.count} 项，当前可达动作 ${current.reachable} 项`}
  return hasAttempt && !directory && !directoryError ? {} : {error: directoryError ?? '目录查询已失效'}
}

function bindOriginalDispatch() {
  if (!hasAttempt || !dispatchIsCurrent?.()) return {visible: false}
  try {
    dispatch?.assertCurrent()
    if (dispatch?.state === 'DISPATCH_RECORDED') {
      return {status: `实发记录 ${dispatch.dispatchRef}，输入摘要 ${dispatch.actualInputDigest}`}
    }
    if (dispatch?.state === 'UNKNOWN') return {status: '原试次实发结果未知'}
  } catch {
    return {error: '原试次实发查询已失效'}
  }
  return {error: dispatchError ?? '原试次实发记录无法读取'}
}

function bindActualInput() {
  if (!dispatchIsCurrent?.()) return {visible: false}
  try {
    dispatch?.assertCurrent()
    return {visible: typeof dispatch?.readActualInput === 'function'}
  } catch {
    return {visible: false}
  }
}

async function openActualInput() {
  const current = dispatch
  if (!bindActualInput().visible) return
  try {
    const json = await current.readActualInput()
    if (current !== dispatch || !dispatchIsCurrent?.()) return
    current.assertCurrent()
    await $page.showAlert(JSON.stringify(JSON.parse(json), null, 2), '原实发 JSON')
  } catch {
    if (current === dispatch && dispatchIsCurrent?.()) $page.showMessage('原实发明细无法核验', 'warning')
  }
}

function bindOriginalVerification() {
  if (!hasAttempt || !dispatchIsCurrent?.()) return {visible: false}
  const result = dispatch?.verification
  if (!result) return {error: dispatchError ?? '缺原冻结输入或同版核验依据，待核原返回'}
  try {
    result.assertCurrent()
    const state = {
      VERIFIED_CANDIDATE: '候选核验通过', DISPATCH_UNKNOWN: '实发未知',
      DISPATCH_EVIDENCE_REQUIRED: '待核实发证据', RETURN_UNKNOWN: '原返回未知',
      PARTIAL: '原返回不完整', FAILED: '原试次失败', UNKNOWN: '原试次状态未知',
    }[result.state] ?? '待核原返回'
    const details = [state]
    if (result.receiptRef) details.push(`回执 ${result.receiptRef}`)
    if (result.candidateDigest) details.push(`候选摘要 ${result.candidateDigest}`)
    return {status: details.join('，')}
  } catch {
    return {error: '原试次核验已失效'}
  }
}

function bindRework() {
  const {runId, attemptRef, requestKey} = $route.query
  return {disabled: ![runId, attemptRef, requestKey].every(value => typeof value === 'string' && value && value.trim() === value)}
}

async function prepareRework() {
  if (reworkPending || bindRework().disabled) return
  const {projectId, runId, attemptRef, requestKey} = $route.query
  const isCurrent = () => $route.query.projectId === projectId && $route.query.runId === runId &&
    $route.query.attemptRef === attemptRef && $route.query.requestKey === requestKey
  reworkPending = true
  try {
    const reason = await $page.showPrompt('请说明本次返工原因', '准备返工交接')
    if (!isCurrent() || typeof reason !== 'string' || !reason.trim()) return
    const prepared = await $page.invokeHostCommand('content.operation.prepareRework', {runId, attemptRef, requestKey, reason})
    if (!isCurrent()) return
    prepared.assertCurrent()
    const lines = [
      ...prepared.handoffs.map(item => `调用 ${item.callRef} → ${item.destination}`),
      ...prepared.originalOperations.map(item => `原办理 ${item.callRef} → ${item.destination}（${item.ownerRef}）`),
      ...prepared.reusable.map(item => `可沿用 ${item.resultRef}`),
    ]
    await $page.showAlert(lines.join('\n'), '返工交接预览')
  } catch {
    if (isCurrent()) $page.showMessage('返工证据无法核验', 'warning')
  } finally {
    reworkPending = false
  }
}

async function readGuide(row, _column, _event, control) {
  // 表格的 current-change 维护选择，异步读指南不重复提交行选择。
  if (control) control.cancel = true
  const current = currentDirectory()
  if (!current) return
  const generation = ++selectionGeneration
  try {
    const rowKey = $page.resolveView(current.dataViewKey)?.getPkKey(row)
    if (rowKey === undefined) return
    const guide = await current.readGuide(rowKey, row)
    if (generation !== selectionGeneration || currentDirectory() !== current) return
    guide.assertCurrent()
    await $page.showAlert(guide.guide, '动作指南')
  } catch {
    if (generation === selectionGeneration && currentDirectory() === current) {
      $page.showMessage('当前动作指南无法核验', 'warning')
    }
  }
}
