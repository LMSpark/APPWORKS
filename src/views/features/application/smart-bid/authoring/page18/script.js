/* global $page, $route */
let directory
let directoryError
let selectionGeneration = 0
let dispatch
let dispatchError
let hasAttempt = false

async function __init__() {
  const generation = ++selectionGeneration
  directory = undefined
  directoryError = undefined
  dispatch = undefined
  dispatchError = undefined
  const {runId, attemptRef, requestKey, targetDigest, configurationLockHash} = $route.query
  hasAttempt = [runId, attemptRef, requestKey, targetDigest, configurationLockHash].some(value => value != null)
  if (hasAttempt) {
    try {
      const result = await $page.invokeHostCommand('content.operation.readDispatch',
        {runId, attemptRef, requestKey, targetDigest, configurationLockHash})
      if (generation === selectionGeneration) dispatch = result
    } catch {
      if (generation === selectionGeneration) dispatchError = '原试次实发记录无法读取'
    }
  }
  if (generation !== selectionGeneration) return
  const directoryRef = $route.query.directoryRef
  if (typeof directoryRef !== 'string' || !directoryRef || directoryRef.trim() !== directoryRef) {
    if (!hasAttempt) directoryError = '请从业务目录打开本工作区'
    return
  }
  try {
    const result = await $page.invokeHostCommand('content.operation.discover', {directoryRef})
    if (generation === selectionGeneration) directory = result
  } catch {
    if (generation === selectionGeneration) directoryError = '指南目录读取失败'
  }
}

function currentDirectory() {
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
  const current = currentDirectory()
  if (current) return {status: `目录指南 ${current.count} 项，当前可达动作 ${current.reachable} 项`}
  return hasAttempt && !directory && !directoryError ? {} : {error: directoryError ?? '目录查询已失效'}
}

function bindOriginalDispatch() {
  if (!hasAttempt) return {visible: false}
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

async function readGuide(row) {
  const current = currentDirectory()
  if (!current) return
  const generation = ++selectionGeneration
  try {
    const rowKey = $page.resolveView(current.dataViewKey)?.getPkKey(row)
    if (typeof rowKey !== 'string' || !rowKey) return
    const guide = await current.readGuide(rowKey)
    if (generation !== selectionGeneration || currentDirectory() !== current) return
    guide.assertCurrent()
    await $page.showAlert(guide.guide, '动作指南')
  } catch {
    if (generation === selectionGeneration && currentDirectory() === current) {
      $page.showMessage('当前动作指南无法核验', 'warning')
    }
  }
}
