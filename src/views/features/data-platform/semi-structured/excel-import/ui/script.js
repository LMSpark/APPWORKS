/* global $page */
let catalog
const scenario = '36B01771C627B9BF5CD493DC75B996A1'

async function __init__() {
  catalog = await $page.invokeHostCommand('excel.catalog.connect')
}

function bindCatalogSection() {
  return {
    status: catalog?.editable ? '导入方案目录；Sheet 布局与转换规则在编辑器中维护。' : '请进入已授权应用后维护导入方案。',
    error: catalog?.editState().id === undefined ? catalog?.error() : '',
  }
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

const schemeViewKey = scenario + '@Base_Import_solution@default'

function bindSchemeDialog() {
  const state = catalog?.editState()
  const visible = catalog?.editable === true && state?.id !== undefined
  return {visible, modelValue:visible, dataViewKey:schemeViewKey,
    title:state?.creating ? '新增方案' : '编辑方案',
    closeDisabled: !!(state?.acting || state?.pending || state?.unconfirmed || state?.creationSaved || state?.templatePending)}
}

function bindSchemeForm() {
  const id = catalog?.editState().id
  return {key:id, contextRowId:id, dataViewKey:schemeViewKey}
}

function bindSchemeField() {
  const state = catalog?.editState()
  return {dataViewKey:schemeViewKey, readonly:!!(state?.acting || state?.unconfirmed || state?.creationSaved || state?.templateDispatched)}
}

function bindSchemeDataSpace() {
  return {...bindSchemeField(), optionDataViewKey:scenario + '@Base_DataSet@default'}
}

function bindSchemeStatus() {
  const state = catalog?.editState()
  const title = state?.unconfirmed ? '保存结果尚未确认，请核验原保存；不会重复提交。'
    : state?.creationSaved ? '方案已保存，请继续完成原方案的编码处理。' : ''
  return {visible:!!title,title}
}

function bindSchemeError() {
  const title = catalog?.error() || ''
  return {visible:!!title,title}
}

function bindSaveScheme() {
  const state = catalog?.editState()
  return {label:state?.unconfirmed ? '核验保存结果' : state?.creationSaved ? '继续完成新增' : '保存方案',
    disabled:!!(state?.acting || state?.templateDispatched)}
}

function bindCancelScheme() {
  const state = catalog?.editState()
  const phase = state?.template?.phase
  return {label:phase === 'complete' || phase === 'retained' ? '关闭' : '取消修改',
    disabled:!!(state?.acting || state?.unconfirmed || state?.creationSaved || state?.templateDispatched && phase !== 'upload')}
}

function bindEndScheme() {
  const state = catalog?.editState()
  return {visible:!!state?.creationSaved,disabled:!!(state?.acting || state?.unconfirmed)}
}

function bindChooseTemplate() {
  const state = catalog?.editState()
  return {disabled:!state?.canBrowse || !!(state.acting || state.unconfirmed || state.templateDispatched)}
}

function bindTemplateStatus() {
  const state = catalog?.editState()
  const file = state?.template
  if (!file) return {visible:false}
  const status = file.phase === 'retained' ? '文件已保留，尚未发布 · ' + file.retainedPath
    : file.phase === 'complete' ? '已保存'
      : state.templateDispatched ? '正在确认文件及方案路径' : '已选择，尚未上传'
  return {visible:true,title:'模板：' + file.name + '；' + status}
}

function bindCancelTemplate() {
  const state = catalog?.editState()
  return {visible:state?.template?.phase === 'selected',disabled:!!state?.acting}
}

function bindRetainTemplate() {
  const state = catalog?.editState()
  return {visible:state?.template?.phase === 'publication' && !state.template.unconfirmed,disabled:!!state?.acting}
}

function bindUploadTemplate() {
  const state = catalog?.editState()
  const file = state?.template
  return {visible:!!file && file.phase !== 'complete' && file.phase !== 'retained',
    label:file?.unconfirmed ? '核验原模板结果' : '确认上传模板',
    disabled:!!(state?.acting || state?.pending || state?.creationSaved || state?.creating || !file?.unconfirmed && state?.unconfirmed)}
}

async function closeSchemeDialog(open) { if (open === false) await runCatalogAction('closeEdit') }
async function saveScheme() { await runCatalogAction('saveEdit') }
async function cancelScheme() { await runCatalogAction('cancelEdit') }
async function endScheme() { await runCatalogAction('endCreation') }
async function chooseSchemeTemplate() { await runCatalogAction('chooseTemplate') }
async function cancelSchemeTemplate() { await runCatalogAction('cancelTemplate') }
async function retainSchemeTemplate() { await runCatalogAction('retainTemplate') }
async function uploadSchemeTemplate() { await runCatalogAction('uploadTemplate') }
