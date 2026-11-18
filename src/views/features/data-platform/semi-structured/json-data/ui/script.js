/* global $page */
let documentBinding
let openGeneration = 0

async function openJsonDocument(row) {
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
  return documentBinding ?? {visible: false}
}
