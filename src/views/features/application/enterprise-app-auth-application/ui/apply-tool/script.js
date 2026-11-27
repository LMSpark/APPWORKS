/* global $page */
let apply

async function __init__() { apply = await $page.invokeHostCommand('apply.connect') }
function bindApplyAction({row}) { return apply?.canApply(row) === true }

function bindListError() {
  const error = apply?.state().error
  return {visible: !!error, title: error ?? ''}
}
function bindDialog() {
  const state = apply?.state()
  return {visible: state?.id !== undefined, closeDisabled: state?.busy === true}
}
function bindAppName() { return {value: '应用：' + (apply?.state().appName ?? '')} }
function bindApplyError() {
  const error = apply?.state().applyError
  return {visible: !!error, title: error ?? ''}
}
function bindApplyForm() {
  const id = apply?.state().id
  return {visible: id !== undefined, contextRowId: id}
}
function bindCancel() { return {disabled: apply?.state().busy !== false} }
function bindSubmit() {
  const state = apply?.state()
  return {disabled: state?.id === undefined || state.busy || state.unconfirmed}
}

async function openApply(row) { await apply.open(row) }
async function cancelApply() { await apply.cancel() }
async function onDialogChange(open) { if (open === false) await cancelApply() }
async function submitApply() { await apply.submit() }
