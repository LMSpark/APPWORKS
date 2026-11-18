/* global $page */
let interfaces

async function __init__() { interfaces = await $page.invokeHostCommand('interfaces.connect') }
function bindCreate() { return {disabled:interfaces?.actions().createDisabled !== false} }
function bindRemove() { return {disabled:interfaces?.actions().removeDisabled !== false} }
async function createInterface() { await $page.invokeHostCommand('interfaces.create') }
async function removeInterface() { await $page.invokeHostCommand('interfaces.remove') }
async function chooseInterface(row) { await $page.invokeHostCommand('interfaces.select',row?.rowid) }

function bindInvoke() {
  const state=interfaces?.invocation()
  return {disabled:!state || state.locked || state.pending || state.unknown}
}
function bindAbandon() {
  const state=interfaces?.invocation()
  return {visible:state?.unknown === true,disabled:state?.busy === true}
}
function bindUnknown() { return {visible:interfaces?.invocation().unknown === true} }
function bindResult() { return {visible:interfaces?.invocation().hasResult === true} }
function bindEmptyResult() {
  const state=interfaces?.invocation()
  return {visible:state?.hasResult !== true,description:state?.pending ? '请先保存新建接口，再调用' : '点击调用查看接口返回结果'}
}
async function invokeInterface() { await $page.invokeHostCommand('interfaces.invoke') }
async function abandonInterface() { await $page.invokeHostCommand('interfaces.abandonCall') }

function bindOutputReset() {
  const state=interfaces?.output()
  return {disabled:!state || state.locked || state.pendingCreate || state.unknown}
}
function bindOutputSave() {
  const state=interfaces?.output()
  return {disabled:!state || state.locked || !state.pending}
}
function bindOutputBinding() {
  const state=interfaces?.output()
  return {disabled:!state || state.locked || state.pending}
}
function bindOutputUnknown() { return {visible:interfaces?.output().unknown === true} }
async function resetOutput() { await $page.invokeHostCommand('interfaces.resetOutput') }
async function saveOutput() { await $page.invokeHostCommand('interfaces.saveOutput') }
async function bindOutput(row) { await $page.invokeHostCommand('interfaces.bindOutput',row?.rowid) }
