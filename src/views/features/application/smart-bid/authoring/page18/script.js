/* global $page, $route */
let directory
let directoryError
let selectionGeneration = 0

async function __init__() {
  const directoryRef = $route.query.directoryRef
  if (typeof directoryRef !== 'string' || !directoryRef || directoryRef.trim() !== directoryRef) {
    directoryError = '请从业务目录打开本工作区'
    return
  }
  try {
    directory = await $page.invokeHostCommand('content.operation.discover', {directoryRef})
  } catch {
    directoryError = '指南目录读取失败'
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
  return {error: directoryError ?? '目录查询已失效'}
}

async function readGuide(row) {
  const generation = ++selectionGeneration
  const current = currentDirectory()
  if (!current) return
  const rowKey = $page.resolveView(current.dataViewKey)?.getPkKey(row)
  if (typeof rowKey !== 'string' || !rowKey) return
  try {
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
