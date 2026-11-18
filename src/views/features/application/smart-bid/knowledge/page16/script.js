/* global $page, $route */
let knowledgeDirectory
let knowledgeError
let knowledgeGeneration = 0

async function __init__() {
  const generation = ++knowledgeGeneration
  knowledgeDirectory = undefined
  knowledgeError = undefined
  const {directoryRef} = $route.query
  if (typeof directoryRef !== 'string' || !directoryRef || directoryRef.trim() !== directoryRef) {
    knowledgeError = '请选择知识目录'
    return
  }
  try {
    const result = await $page.invokeHostCommand('knowledge.directory.read', {directoryRef})
    if (generation === knowledgeGeneration) knowledgeDirectory = result
  } catch {
    if (generation === knowledgeGeneration) knowledgeError = '知识目录无法核验'
  }
}

function currentKnowledgeDirectory() {
  try {
    knowledgeDirectory?.assertCurrent()
    return knowledgeDirectory
  } catch {
    return undefined
  }
}

function bindKnowledgeDirectory() {
  const current = currentKnowledgeDirectory()
  return current ? {dataViewKey: current.dataViewKey} : {visible: false}
}

function bindKnowledgeStatus() {
  const current = currentKnowledgeDirectory()
  return current ? {status: `目录指南 ${current.count} 项，当前可读动作指南 ${current.reachable} 项`}
    : {error: knowledgeError ?? (knowledgeDirectory ? '目录查询已失效' : '正在读取目录')}
}

async function openKnowledgeGuide(row, _column, _event, control) {
  if (control) control.cancel = true
  const current = currentKnowledgeDirectory()
  if (!current) return
  const generation = ++knowledgeGeneration
  try {
    const rowKey = $page.resolveView(current.dataViewKey)?.getPkKey(row)
    if (typeof rowKey !== 'string' || !rowKey) return
    const result = await current.readGuide(rowKey)
    if (generation !== knowledgeGeneration || currentKnowledgeDirectory() !== current) return
    result.assertCurrent()
    const lines = [`指南 ${result.guideRef} · 版本 ${result.versionRef}`, `目录路径 ${result.pathRefs.join(' / ')}`]
    if (result.materialRefs.length) lines.push(`原材料引用 ${result.materialRefs.join('、')}`)
    lines.push('', result.guide)
    await $page.showAlert(lines.join('\n'), `动作指南 · ${result.versionRef}`)
  } catch {
    if (generation === knowledgeGeneration && currentKnowledgeDirectory() === current) {
      $page.showMessage('原指南版本无法核验', 'warning')
    }
  }
}
