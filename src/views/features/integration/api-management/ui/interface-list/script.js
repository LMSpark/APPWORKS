/* global $page, h */
let interfaces

async function __init__() { interfaces = await $page.invokeHostCommand('interfaces.connect') }
function RenderInterfaceLayout({regions}) {
  return interfaces ? [h('div', {class:'interface-list'}, regions.map(config => h(interfaces.node, {key:config.id, config})))] : null
}
function RenderInterfaceEdit({content}) {
  const key = interfaces?.layout().id
  return key === undefined ? null : [h(interfaces.node, {key, config:content})]
}
function RenderInterfaceImport({dialog}) {
  const input = interfaces?.importing()
  return input ? [h(interfaces.importDialog, {...input, dialogRule:dialog})] : null
}
function RenderParameterBinding({dialog}) {
  const input = interfaces?.binding()
  return input ? [h(interfaces.parameterBinding, {...input, dialogRule:dialog})] : null
}
function bindInterfaceDialog() {
  const state = interfaces?.layout()
  return {title:`${state?.provider ?? '当前提供商'} - 接口列表`,closeDisabled:state?.busy !== false}
}
function bindInterfaceWorkspace() {
  const state = interfaces?.layout()
  return {title:state?.selected ? `${state.provider} / ${state.name || '接口配置'}` : '',
    status:state?.status ?? '', error:state?.error ?? '', retryable:state?.retryable === true,
    ...(state?.selected ? {} : {header:{children:[]}})}
}
function bindInterfaceTabs() {
  const state = interfaces?.layout()
  return {visible:state?.selected === true,modelValue:state?.tab ?? 'edit'}
}
function bindInterfaceEmpty() { return {visible:interfaces?.layout().selected !== true} }
async function closeInterfaceDialog(open) { if (open === false) await interfaces?.close() }
async function selectInterfaceTab(name) { await $page.invokeHostCommand('interfaces.tab',name) }

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

function bindRequestTabs() { return {modelValue:interfaces?.edit().tab} }
function bindImport() { return {disabled:interfaces?.edit().locked !== false} }
function bindJsonBody() { return {visible:interfaces?.edit().type === 'Body'} }
function bindJsonHint() { return {visible:interfaces?.edit().type !== 'Body'} }
function bindFormBody() { return {visible:interfaces?.edit().type === 'FormData'} }
function bindFormHint() { return {visible:interfaces?.edit().type !== 'FormData'} }
function bindHeaderToolbar() { return {toolbar:interfaces?.headersToolbar()} }
function bindParameterToolbar() { return {toolbar:interfaces?.parametersToolbar()} }
function bindPathAdapter() {
  return {rowAdapter:{
    read:original=>({...original,paramType:'path'}),
    write:value=>({paramName:value.paramName,valueFun:value.valueFun ?? ''}),
  }}
}
function isValueFunction(value) {
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return false
  try {const parsed=JSON.parse(value);return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)} catch {return false}
}
function bindFormAdapter() {
  return {rowAdapter:{
    read:original=>({fieldName:original.fieldName ?? '',fieldType:original.fieldType ?? '',value:original.valueFun || original.defaultValue || ''}),
    write:value=>isValueFunction(value.value)
      ? {fieldName:value.fieldName ?? '',fieldType:value.fieldType ?? '',defaultValue:'',valueFun:value.value}
      : {fieldName:value.fieldName ?? '',fieldType:value.fieldType ?? '',defaultValue:value.value ?? '',valueFun:''},
  }}
}
async function selectRequestTab(name) { await $page.invokeHostCommand('interfaces.requestTab',name) }
async function openJsonImport() { await $page.invokeHostCommand('interfaces.importJson') }

function bindDefinitionSave() { return {disabled:interfaces?.save().disabled !== false} }
async function saveDefinition() { await $page.invokeHostCommand('interfaces.saveDefinition') }

async function verifyDefinition() { await $page.invokeHostCommand('interfaces.verifyDefinition') }
