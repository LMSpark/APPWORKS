/* global $page, h */
let providers

async function __init__() { providers = await $page.invokeHostCommand('providers.connect') }
function bindModifierNotice() { return {visible:providers?.unresolved() === true} }
function bindAction() { return {disabled:providers?.blocked() !== false} }
function bindEdit(context) { return {...bindAction(),visible:providers?.canEdit(context.row) === true} }
function bindDelete(context) { return {...bindAction(),visible:providers?.canDelete(context.row) === true} }
function bindDate() { return {displayFormatter:value=>String(value ?? '').slice(0,10)} }

function RenderProviderConfiguration({dialog}) {
  const input = providers?.configurationProps()
  return input ? h(providers.configuration, {...input, ref: providers.bindConfiguration},
    {default: () => h(providers.node, {config: dialog})}) : null
}

function configuration() { return providers?.configurationBindings() }
function configurationStatus() { return configuration()?.status() }
function bindConfigurationDialog() {
  const state = configurationStatus()
  return {closeDisabled: !state || state.busy || state.dirty || state.unconfirmed || state.pending}
}
function bindConfigurationSection() {
  const state = configurationStatus()
  return {status: state?.selectedLoading ? '正在读取服务提供商配置…' : '',
    error: state?.selectedError || state?.error || '', retryable: !!state?.selectedError && !state.selectedLoading}
}
function bindConfigurationTabs() {
  const state = configurationStatus()
  return {visible: state?.ready === true, modelValue: state?.tab ?? 'jwt'}
}
function bindConfigurationAction() { return {disabled: configurationStatus()?.busy !== false} }
function bindConfigurationSave() {
  const state = configurationStatus()
  return {disabled: !state?.ready || state.busy || state.unconfirmed}
}
function bindConfigurationClose() {
  const state = configurationStatus()
  return {disabled: !state || state.busy || state.unconfirmed || state.pending}
}
function bindConfigurationVerify() {
  const state = configurationStatus()
  return {visible: state?.unconfirmed === true, disabled: state?.busy !== false}
}
function bindJwtSettings() { return {visible: configuration()?.tabLoaded('jwt') === true} }
function bindInvalidAuthentication() {
  const binding = configuration()
  return {visible: binding?.tabLoaded('jwt') === true && binding.invalidAuthentication()}
}
function bindInvalidParameter() {
  const binding = configuration()
  return {visible: binding?.tabLoaded('publicParams') === true && binding.invalidParameter()}
}
function bindOutputField() { return {cellReadonly: configuration()?.notCurrent} }
function configTable(name) {
  const binding = configuration()
  return binding?.tabLoaded(name) ? {visible: true, toolbar: binding.toolbar(name)} : {visible: false}
}
function bindHeaderTable() { return configTable('headers') }
function bindParameterTable() { return configTable('publicParams') }
function bindAccountTable() { return configTable('accounts') }

async function openAi() { await $page.invokeHostCommand('providers.ai') }
async function openCreate() { await $page.invokeHostCommand('providers.create') }
async function editProvider(row) { await $page.invokeHostCommand('providers.edit',row?.rowid) }
async function deleteProvider(row) { await $page.invokeHostCommand('providers.remove',row?.rowid) }
async function openInterfaces(row) { await $page.invokeHostCommand('providers.interfaces',row?.rowid) }
async function openConfig(row) { await $page.invokeHostCommand('providers.config',row?.rowid) }
async function openConfigInterfaces() { await $page.invokeHostCommand('providers.configInterfaces') }
async function saveProviderAuthentication() { await $page.invokeHostCommand('providers.configSave') }
async function verifyProviderConfiguration() { await $page.invokeHostCommand('providers.configVerify') }
async function selectProviderConfigTab(name) { await $page.invokeHostCommand('providers.configTab',name) }
async function retryProviderConfigTab() { await $page.invokeHostCommand('providers.configRetry') }
async function requestProviderConfigClose() { await $page.invokeHostCommand('providers.configClose') }
async function closeProviderConfiguration(open) {
  if (open === false) await requestProviderConfigClose()
}
