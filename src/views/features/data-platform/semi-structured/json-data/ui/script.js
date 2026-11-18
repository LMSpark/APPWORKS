/* global $page */
let documentBinding
let openGeneration = 0
let acting = false
let inputPending = false
let editorRevision = 0

function currentDocument() {
  return documentBinding && $page.resolveView(documentBinding.dataViewKey)
}

async function openJsonDocument(row) {
  const view = currentDocument()
  if (acting || inputPending || view?.hasUnconfirmedSave || view?.hasEditingChanges() || view?.dirtyTracking.hasPendingChanges()) return
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
}

function bindJsonField() {
  const view = currentDocument()
  return {
    dataViewKey: documentBinding?.dataViewKey,
    readonly: !documentBinding?.editable || view?.mutating === true || view?.hasUnconfirmedSave === true,
  }
}

function bindJsonSave() {
  const unknown = currentDocument()?.hasUnconfirmedSave === true
  return {visible: documentBinding?.editable === true, disabled: currentDocument()?.mutating === true || inputPending,
    label: unknown ? '核验内容保存结果' : '保存内容'}
}

function bindJsonCancel() {
  const view = currentDocument()
  return {visible: documentBinding?.editable === true, disabled: view?.mutating === true || inputPending || view?.hasUnconfirmedSave === true}
}

async function submitJsonDocument(command) {
  if (acting || inputPending || !documentBinding?.editable) return
  acting = true
  try {
    await $page.invokeHostCommand(command, documentBinding.contextRowId)
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
