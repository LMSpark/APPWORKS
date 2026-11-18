/* global $page */
let documentBinding
let openGeneration = 0
let acting = false
let inputPending = false
let editorRevision = 0
let catalogEditable = false
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
  acting = true
  try {
    documentBinding = await $page.invokeHostCommand('jsonData.createDocument')
  } catch (cause) {
    $page.showMessage(cause.message, 'error')
  } finally {
    acting = false
  }
}

async function importJsonDocument() {
  if (acting || bindCatalogCreate().disabled || !catalogEditable) return
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
    if (!String(cause?.message).startsWith('PAGE_RUNTIME_STALE')) $page.showMessage(cause.message, 'error')
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
  return {status: catalogEditable ? '' : '请进入已授权应用后维护 JSON 文件。'}
}

async function submitJsonCatalog(command) {
  if (!catalogEditable || documentBinding || acting) return
  acting = true
  try {
    await $page.invokeHostCommand(command)
  } catch (cause) {
    $page.showMessage(cause.message, 'error')
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
  if (acting || inputPending || !documentBinding) return
  acting = true
  try {
    await $page.invokeHostCommand('jsonData.closeDocument', documentBinding.contextRowId)
    documentBinding = undefined
  } catch (cause) {
    $page.showMessage(cause.message, 'error')
  } finally {
    acting = false
  }
}

function currentDocument() {
  return documentBinding && $page.resolveView(documentBinding.dataViewKey)
}

async function openJsonDocument(row) {
  if (!catalogEditable) return
  const view = currentDocument()
  const catalog = catalogView()
  if (acting || inputPending || catalog?.hasUnconfirmedSave || catalog?.hasEditingChanges() ||
    catalog?.dirtyTracking.hasPendingChanges() || view?.hasUnconfirmedSave || view?.hasEditingChanges() || view?.dirtyTracking.hasPendingChanges()) return
  const generation = ++openGeneration
  documentBinding = undefined
  try {
    const binding = await $page.invokeHostCommand('jsonData.openDocument', row.rowid)
    if (generation === openGeneration) documentBinding = binding
  } catch (cause) {
    if (generation === openGeneration) $page.showMessage(cause.message, 'error')
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
    readonly: !documentBinding?.editable || view?.mutating === true || view?.hasUnconfirmedSave === true || fileAlreadyConfirmed(view) === true,
  }
}

function bindJsonSave() {
  const unknown = currentDocument()?.hasUnconfirmedSave === true
  return {visible: documentBinding?.editable === true, disabled: currentDocument()?.mutating === true || inputPending,
    label: documentBinding?.creating && catalogView()?.hasUnconfirmedSave ? '核验目录保存结果' :
      unknown ? '核验内容保存结果' : documentBinding?.creating ? '创建JSON' : '保存内容'}
}

function bindJsonCancel() {
  const view = currentDocument()
  return {visible: documentBinding?.editable === true, disabled: view?.mutating === true || inputPending ||
    view?.hasUnconfirmedSave === true || fileAlreadyConfirmed(view) === true,
    label: documentBinding?.creating ? '取消新增' : '取消修改'}
}

async function submitJsonDocument(command) {
  if (acting || inputPending || !documentBinding?.editable) return
  acting = true
  try {
    const result = await $page.invokeHostCommand(command, documentBinding.contextRowId)
    if (result?.closed) documentBinding = undefined
    editorRevision++
  } catch (cause) {
    $page.showMessage(cause.message, 'error')
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
