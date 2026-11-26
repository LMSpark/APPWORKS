/* global $page */
let catalog

async function __init__() {
  catalog = await $page.invokeHostCommand('logicView.catalog.connect')
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

function bindCatalogTable() {
  return {inert: catalog?.state().editing === true ? true : undefined}
}

async function selectLogicViewRow(row) { await $page.invokeHostCommand('logicView.catalog.select', row) }
async function createLogicView() { await $page.invokeHostCommand('logicView.catalog.create') }
async function editLogicView() { await $page.invokeHostCommand('logicView.catalog.edit') }
async function openLogicViewDesign() {
  const target = await $page.invokeHostCommand('logicView.catalog.design')
  if (target) $page.navigate(target.path, target.query)
}
async function refreshLogicViewCatalog() { await $page.invokeHostCommand('logicView.catalog.refresh') }
