/* global $page, h */
let recovery
async function __init__() { recovery = await $page.invokeHostCommand('recovery.connect') }
function RenderRecoveryWorkspace({panels}) {
  return recovery ? [h('div', {class: 'recovery-page__body'}, panels.map(config => h(recovery.node, {key: config.id, config})))] : null
}
function bindRecoveryColumns() {
  // 两张动态表的读取合同均不支持对这些列排序。
  return {children: (recovery?.columns() ?? []).map(({name, label}) => ({
    type: 'r-text', props: {field: name, label, readonly: true, minWidth: 140, showOverflowTooltip: true, sortable: false},
  }))}
}
function bindRecoverySelection() { return {disabled: recovery?.selectionLocked() !== false} }
function bindRestoreRecovery(context) { return {disabled: recovery?.canRestore(context.row) !== true} }
function bindUndoRecovery(context) { return {disabled: recovery?.canUndo(context.row) !== true} }
function bindRecoveryStatus() { return recovery?.status() }
function bindRecoveryTabs() { return {visible: recovery?.selected() === true, modelValue: recovery?.tab()} }
function bindRecoveryVerification() { return recovery?.verification() ?? {visible: false} }
async function selectRecoveryTab(name) { await $page.invokeHostCommand('recovery.tab', name) }
async function restoreRecoveryRow(row) { await $page.invokeHostCommand('recovery.restore', row) }
async function undoRecoveryRow(row) { await $page.invokeHostCommand('recovery.undo', row) }
async function verifyRecoverySave() { await $page.invokeHostCommand('recovery.verify') }
