/* global $page */
let documentBinding
let openGeneration = 0
let acting = false
let inputPending = false
let editorRevision = 0
let catalogEditable = false
let error = ''
const catalogKey = 'FFDEF2AED3E19A38C0FCDDC748CF939B@Base_JsonData@default'

async function __init__() {
  catalogEditable = await $page.invokeHostCommand('jsonData.canEditCatalog') === true
}

function catalogView() {
  return $page.resolveView(catalogKey)
}

function bindCatalogCreate() {
  const catalog = catalogView()
  return {visible: catalogEditable, disabled: !!documentBinding || catalog?.addActionState() !== 'enabled' ||
    catalog.hasUnconfirmedSave || catalog.hasEditingChanges() || catalog.dirtyTracking.hasPendingChanges()}
}

async function createJsonDocument() {
  if (acting || bindCatalogCreate().disabled || !catalogEditable) return
  error = ''
  acting = true
  try {
    documentBinding = await $page.invokeHostCommand('jsonData.createDocument')
  } catch (cause) {
    error = String(cause?.message || cause)
  } finally {
    acting = false
  }
}

async function importJsonDocument() {
  if (acting || bindCatalogCreate().disabled || !catalogEditable) return
  error = ''
  acting = true
  try {
    await $page.invokeHostCommand('jsonData.setPickingFile', true)
    const files = await $page.browseFiles({title:'导入JSON',accept:'.json,application/json',multiple:false})
    if (files.length === 0) return
    if (files.length !== 1) throw new Error('每次只能导入一个JSON文件')
    const file = files[0].file
    const content = await file.text()
    documentBinding = await $page.invokeHostCommand('jsonData.importDocument', {name:file.name,content})
    const result = await $page.invokeHostCommand('jsonData.saveDocument', documentBinding.contextRowId)
    if (result?.closed) documentBinding = undefined
  } catch (cause) {
    if (!String(cause?.message).startsWith('PAGE_RUNTIME_STALE')) error = String(cause?.message || cause)
  } finally {
    acting = false
    await $page.invokeHostCommand('jsonData.setPickingFile', false).catch(() => {})
  }
}

function bindCreationMetadata() {
  if (!documentBinding?.creating) return {visible:false}
  return {visible:true, dataViewKey:catalogKey, contextRowId:documentBinding.contextRowId}
}

function bindCreationField() {
  const catalog = catalogView()
  return {dataViewKey:catalogKey, readonly: catalog?.mutating === true || catalog?.hasUnconfirmedSave === true}
}

function fileAlreadyConfirmed(view) {
  return documentBinding?.creating && view?.rows.length === 1 &&
    !view.dirtyTracking.isPendingCreate(documentBinding.contextRowId)
}

function bindCatalogField() {
  const view = catalogView()
  return {showCellControl: catalogEditable, readonly: !catalogEditable || !!documentBinding || view?.mutating || view?.hasUnconfirmedSave}
}

function bindCatalogCreator() {
  return catalogEditable
    ? {visible: true, optionDataViewKey: 'FFDEF2AED3E19A38C0FCDDC748CF939B@Base_UserInfo@default'}
    : {visible: false}
}

function bindCatalogSave() {
  const view = catalogView()
  return {visible: catalogEditable, disabled: !!documentBinding || view?.mutating,
    label: view?.hasUnconfirmedSave ? '核验目录保存结果' : '保存目录'}
}

function bindCatalogCancel() {
  const view = catalogView()
  return {visible: catalogEditable, disabled: !!documentBinding || view?.mutating || view?.hasUnconfirmedSave}
}

function bindCatalogSection() {
  return {status: catalogEditable ? '' : '请进入已授权应用后维护 JSON 文件。',
    error: documentBinding ? '' : error}
}

function documentCloseBlocked() {
  const view = currentDocument()
  return inputPending || documentBinding?.creating === true || view?.mutating === true ||
    view?.hasUnconfirmedSave === true || view?.hasEditingChanges() === true ||
    view?.dirtyTracking.hasPendingChanges() === true
}

function bindDocumentDialog() {
  return {visible: !!documentBinding, modelValue: !!documentBinding, closeDisabled: documentCloseBlocked()}
}

function bindDocumentClose() {
  return {disabled: documentCloseBlocked()}
}

function bindDiscardAndClose() {
  const view = currentDocument()
  return {visible: documentBinding?.editable === true && !documentBinding.creating && documentCloseBlocked(),
    disabled: view?.mutating === true || view?.hasUnconfirmedSave === true}
}

async function discardAndCloseJsonDocument() {
  const action = bindDiscardAndClose()
  if (acting || !action.visible || action.disabled) return
  error = ''
  acting = true
  try {
    await $page.invokeHostCommand('jsonData.discardAndCloseDocument', documentBinding.contextRowId)
    inputPending = false
    documentBinding = undefined
  } catch (cause) {
    error = String(cause?.message || cause)
  } finally {
    acting = false
  }
}

function bindDocumentError() {
  const title = error || documentBinding?.loadError || ''
  return {title, visible: !!title}
}

function bindDocumentSaveStatus() {
  const view = currentDocument()
  if (view?.hasUnconfirmedSave) {
    return {visible:true, title:'正文保存结果尚未确认，请核验原保存结果。'}
  }
  if (fileAlreadyConfirmed(view)) {
    const title = catalogView()?.hasUnconfirmedSave
      ? '正文已保存，目录保存结果尚未确认，请核验目录保存结果。'
      : '正文已保存，目录尚未确认，请继续保存目录。'
    return {visible:true, title}
  }
  return {visible:false}
}

async function changeDocumentDialog(value) {
  if (value === false) await closeJsonDocument()
}

async function submitJsonCatalog(command) {
  if (!catalogEditable || documentBinding || acting) return
  error = ''
  acting = true
  try {
    await $page.invokeHostCommand(command)
  } catch (cause) {
    error = String(cause?.message || cause)
  } finally {
    acting = false
  }
}

async function saveJsonCatalog() {
  await submitJsonCatalog('jsonData.saveCatalog')
}

async function cancelJsonCatalog() {
  await submitJsonCatalog('jsonData.cancelCatalog')
}

async function closeJsonDocument() {
  if (acting || documentCloseBlocked() || !documentBinding) return
  error = ''
  acting = true
  try {
    await $page.invokeHostCommand('jsonData.closeDocument', documentBinding.contextRowId)
    documentBinding = undefined
  } catch (cause) {
    error = String(cause?.message || cause)
  } finally {
    acting = false
  }
}

function currentDocument() {
  return documentBinding && $page.resolveView(documentBinding.dataViewKey)
}

function bindCatalogRowAction() {
  const catalog = catalogView()
  const document = currentDocument()
  return {visible: catalogEditable, disabled: catalog?.mutating === true ||
    catalog?.hasUnconfirmedSave === true || catalog?.hasEditingChanges() === true ||
    catalog?.dirtyTracking.hasPendingChanges() === true || document?.hasUnconfirmedSave === true ||
    document?.hasEditingChanges() === true || document?.dirtyTracking.hasPendingChanges() === true}
}

function selectCatalogRow(row) {
  const catalog = catalogView()
  if (catalogEditable && catalog?.rows.includes(row)) catalog.setSelectedRows([row])
}

async function openJsonDocument(row) {
  if (!catalogEditable) return
  const view = currentDocument()
  const catalog = catalogView()
  if (acting || inputPending || catalog?.hasUnconfirmedSave || catalog?.hasEditingChanges() ||
    catalog?.dirtyTracking.hasPendingChanges() || view?.hasUnconfirmedSave || view?.hasEditingChanges() || view?.dirtyTracking.hasPendingChanges()) return
  error = ''
  const generation = ++openGeneration
  documentBinding = undefined
  try {
    const binding = await $page.invokeHostCommand('jsonData.openDocument', row.rowid)
    if (generation === openGeneration) documentBinding = binding
  } catch (cause) {
    if (generation === openGeneration) error = String(cause?.message || cause)
  }
}

function bindJsonDocument() {
  if (!documentBinding) return {visible: false}
  const {visible, dataViewKey, contextRowId} = documentBinding
  return {visible, dataViewKey, contextRowId, key: dataViewKey + ':' + editorRevision}
}

function trackJsonInput(value) {
  inputPending = value
  if (catalogEditable) return $page.invokeHostCommand('jsonData.setInputPending', value).catch(() => {})
}

function bindJsonField() {
  const view = currentDocument()
  return {
    dataViewKey: documentBinding?.dataViewKey,
    onEditingChange: trackJsonInput,
    visible: !documentBinding?.loadError,
    readonly: !documentBinding?.editable || view?.mutating === true || view?.hasUnconfirmedSave === true || fileAlreadyConfirmed(view) === true,
  }
}

function bindJsonSave() {
  const unknown = currentDocument()?.hasUnconfirmedSave === true
  return {visible: documentBinding?.editable === true, disabled: !!documentBinding?.loadError || currentDocument()?.mutating === true,
    label: documentBinding?.creating && catalogView()?.hasUnconfirmedSave ? '核验目录保存结果' :
      unknown ? '核验内容保存结果' : documentBinding?.creating ? '创建JSON' : '保存内容'}
}

function bindJsonCancel() {
  const view = currentDocument()
  return {visible: documentBinding?.editable === true, disabled: view?.mutating === true ||
    view?.hasUnconfirmedSave === true || fileAlreadyConfirmed(view) === true,
    label: documentBinding?.creating ? '取消新增' : '取消修改'}
}

async function submitJsonDocument(command) {
  if (acting || inputPending || !documentBinding?.editable) return
  error = ''
  acting = true
  try {
    const result = await $page.invokeHostCommand(command, documentBinding.contextRowId)
    if (result?.closed) documentBinding = undefined
    if (result?.readError) error = result.readError
    if (result?.binding) documentBinding = result.binding
    editorRevision++
  } catch (cause) {
    error = String(cause?.message || cause)
  } finally {
    acting = false
  }
}

async function saveJsonDocument() {
  await submitJsonDocument('jsonData.saveDocument')
}

async function cancelJsonDocument() {
  await submitJsonDocument('jsonData.cancelDocument')
}
