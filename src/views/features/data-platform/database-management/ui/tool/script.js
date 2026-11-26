/* global $page */
let servers
async function __init__() { servers = await $page.invokeHostCommand('servers.connect') }

function bindDirectory() {
  const state = servers?.state()
  return {error: state?.listError || (!state?.editing && !state?.deleteOpen ? state?.actionError : '') || ''}
}
function bindCreate() { return {disabled: servers?.canCreate() !== true} }
function bindDirectoryBody() {
  const state = servers?.state()
  return {inert: state?.busy || !!state?.editing || !!state?.deleteOpen}
}
function bindCatalog({props}) {
  if (!servers) return {visible: false}
  const filter = props.filter
  const children = filter.children.map(child => child.props.field === 'Type'
    ? {...child, props: {...child.props, options: servers.filterTypes}}
    : child)
  return {dataViewKey: servers.catalogKey, children: servers.listFields, filter: {...filter, children}}
}
function bindRowAction() { return {disabled: servers?.state().directoryLocked !== false} }
function bindBusy() { return {disabled: servers?.state().busy !== false} }
function editState() { return servers?.state().editing }
function bindEditor() {
  const state = servers?.state()
  return {visible: !!state?.editing, closeDisabled: !!state?.busy,
    title: state?.editing?.mode === 'add' ? '注册服务器' : '编辑服务器'}
}
function bindActionError() {
  const title = servers?.state().actionError
  return {visible: !!title, title: title ?? ''}
}
function bindUnknown() { return {visible: editState()?.unconfirmed === true} }
function bindReadback() { return {...bindBusy(), visible: editState()?.readbackFailed === true} }
function bindForm() {
  const editing = editState()
  if (!servers || !editing) return {visible: false}
  const registering = editing.mode === 'add'
  return {dataViewKey: registering ? servers.registerKey : servers.catalogKey,
    children: registering ? servers.registerFields : servers.editFields,
    formProps: {disabled: bindBusy().disabled || editing.unconfirmed || editing.readbackFailed}}
}
function bindTestConnection() {
  const editing = editState()
  return {...bindBusy(), visible: editing?.mode === 'add' && !editing.unconfirmed}
}
function bindCancelEdit() { return {...bindBusy(), visible: editState()?.unconfirmed === false} }
function bindSaveEdit() {
  const editing = editState()
  return {...bindBusy(), visible: editing?.unconfirmed === false && !editing.readbackFailed}
}
function bindVerifyEdit() { return {...bindBusy(), ...bindUnknown()} }
function bindDelete() {
  const state = servers?.state()
  return {visible: !!state?.deleteOpen, closeDisabled: !!state?.busy}
}
function bindDeleteName() { return {title: `确定要删除服务器“${servers?.state().deleteName ?? ''}”吗？`} }

async function selectServer(row) { await $page.invokeHostCommand('servers.select', row) }
async function createServer() { await $page.invokeHostCommand('servers.create') }
async function editServer(row) { await $page.invokeHostCommand('servers.edit', row) }
async function saveEdit() { await $page.invokeHostCommand('servers.save') }
async function cancelEdit() { await $page.invokeHostCommand('servers.cancelEdit') }
async function closeEditor(open) { if (open === false) await cancelEdit() }
async function testConnection() { await $page.invokeHostCommand('servers.testConnection') }
async function openDeleteServer(row) { await $page.invokeHostCommand('servers.openDelete', row) }
async function cancelDelete() { await $page.invokeHostCommand('servers.cancelDelete') }
async function closeDelete(open) { if (open === false) await cancelDelete() }
async function deleteServer() { await $page.invokeHostCommand('servers.delete') }
