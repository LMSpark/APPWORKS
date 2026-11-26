/* global $page */
let entries

async function __init__() {
  entries = await $page.invokeHostCommand('dictionary.entries.connect')
}

function bindDialog() { return {closeDisabled: entries?.state().dirty === true} }
function bindClose() { return {disabled: entries?.state().dirty === true} }
function bindHeading() { return {value: entries?.heading()} }
function bindError() {
  const title = entries?.state().error
  return {visible: !!title, title}
}
function bindAiError() {
  const state = entries?.state()
  return {visible: !!state?.aiError && state.aiVisible, title: state?.aiError ? 'AI录入不可用：' + state.aiError : ''}
}
function entryFields(readonly) {
  return [
    ...(entries?.fields() ?? []).map(field => ({type: 'r-text', props: {field: field.name, label: field.label, width: 155, readonly}})),
    {type: 'r-number', props: {field: 'ordIdx', label: '排序', width: 90, readonly}},
  ]
}
function bindTable() { return {children: entryFields(false)} }
function bindForm() {
  const state = entries?.state()
  return {visible: state?.selected === true, children: entryFields(state?.busy !== false || state?.aiLocked === true)}
}
function bindAiAction() {
  const state = entries?.state()
  return {disabled: state?.busy !== false || state?.uncertain === true}
}
function bindEditAction() {
  const state = entries?.state()
  return {disabled: state?.busy !== false || state?.aiLocked === true || state?.uncertain === true}
}
function bindRemove() { return {disabled: bindEditAction().disabled || entries?.state().removable !== true} }
function bindSort() { return {disabled: bindEditAction().disabled || entries?.state().canSort !== true} }
function bindReload() {
  const state = entries?.state()
  return {disabled: state?.busy !== false || state?.aiLocked === true,
    label: state?.uncertain ? '核验原提交（保留本地修改）' : '取消数据修改并重读'}
}
function bindAi() { return {visible: entries?.state().aiVisible === true} }
function selectEntry(row) { entries?.select(row) }
function closeDialog(open) { if (!open) return closeEntries() }
function closeEntries() { entries?.close() }
function openAi() { entries?.openAi() }
function addEntry() { return entries?.add() }
function removeEntry() { return entries?.remove() }
function sortEntries() { return entries?.sort() }
function saveEntries() { return entries?.save() }
function reloadEntries() { return entries?.reload() }
