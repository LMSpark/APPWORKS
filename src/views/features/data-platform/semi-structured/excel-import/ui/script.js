/* global $page */
let catalog
const scenario = '36B01771C627B9BF5CD493DC75B996A1'

async function __init__() {
  catalog = await $page.invokeHostCommand('excel.catalog.connect')
}

function bindCatalogSection() {
  return {status: catalog?.editable ? '导入方案目录；Sheet 布局与转换规则在编辑器中维护。' : '请进入已授权应用后维护导入方案。'}
}

function bindMaintenanceAction() {
  return {visible: catalog?.editable === true, disabled: catalog?.locked() !== false}
}

function bindSelectedAction() {
  return {...bindMaintenanceAction(), disabled: catalog?.locked() !== false || !catalog?.selected()}
}

function bindCopyAction() {
  return {...bindMaintenanceAction(), disabled: catalog?.locked() !== false || !catalog?.canCopy()}
}

function bindCatalogId() {
  return {visible: !catalog?.editable}
}

function bindDataSpace() {
  return catalog?.editable ? {visible:true, optionDataViewKey:`${scenario}@Base_DataSet@default`} : {visible:false}
}

function bindCreator() {
  return catalog?.editable ? {visible:true, optionDataViewKey:`${scenario}@Base_UserInfo@default`} : {visible:false}
}

async function runCatalogAction(action, row) {
  if (catalog?.editable) await $page.invokeHostCommand('excel.catalog.' + action, row?.rowid)
}

async function selectScheme(row) { await runCatalogAction('select', row) }
async function createScheme() { await runCatalogAction('create') }
async function openSelectedScheme() { await runCatalogAction('openSelected') }
async function copySchemeKey(row) { await runCatalogAction('copy', row) }
async function designScheme(row) { await runCatalogAction('design', row) }
async function editScheme(row) { await runCatalogAction('edit', row) }
