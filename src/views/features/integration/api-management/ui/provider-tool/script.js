/* global $page */
let providers

async function __init__() { providers = await $page.invokeHostCommand('providers.connect') }
function bindModifierNotice() { return {visible:providers?.unresolved() === true} }
function bindAction() { return {disabled:providers?.blocked() !== false} }
function bindEdit(context) { return {...bindAction(),visible:providers?.canEdit(context.row) === true} }
function bindDelete(context) { return {...bindAction(),visible:providers?.canDelete(context.row) === true} }
function bindDate() { return {displayFormatter:value=>String(value ?? '').slice(0,10)} }

async function openAi() { await $page.invokeHostCommand('providers.ai') }
async function openCreate() { await $page.invokeHostCommand('providers.create') }
async function editProvider(row) { await $page.invokeHostCommand('providers.edit',row?.rowid) }
async function deleteProvider(row) { await $page.invokeHostCommand('providers.remove',row?.rowid) }
async function openInterfaces(row) { await $page.invokeHostCommand('providers.interfaces',row?.rowid) }
async function openConfig(row) { await $page.invokeHostCommand('providers.config',row?.rowid) }
async function openConfigInterfaces() { await $page.invokeHostCommand('providers.configInterfaces') }
async function saveProviderAuthentication() { await $page.invokeHostCommand('providers.configSave') }
async function verifyProviderConfiguration() { await $page.invokeHostCommand('providers.configVerify') }
