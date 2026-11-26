/* global $page */
let catalog

async function __init__() {
  catalog = await $page.invokeHostCommand('dictionary.catalog.connect')
}

function bindCatalogStatus() {
  return {error: catalog?.state().error ?? ''}
}

function bindCatalogAction() {
  return {disabled: catalog?.state().locked !== false}
}

function bindSelectedAction() {
  const state = catalog?.state()
  return {disabled: !state?.selected || state.locked}
}

function bindCreatorWarning() {
  return {visible: catalog?.state().unresolvedCreator === true}
}

function bindCatalogTable() {
  return {inert: catalog?.state().locked === false ? undefined : true}
}

async function selectDictionaryRow(row) { await $page.invokeHostCommand('dictionary.catalog.select', row) }
async function createDictionary() { await $page.invokeHostCommand('dictionary.catalog.create') }
async function openDictionaryDesign() { await $page.invokeHostCommand('dictionary.catalog.design') }
async function openDictionaryEntries() { await $page.invokeHostCommand('dictionary.catalog.entries') }
async function refreshDictionaryCatalog() { await $page.invokeHostCommand('dictionary.catalog.refresh') }
