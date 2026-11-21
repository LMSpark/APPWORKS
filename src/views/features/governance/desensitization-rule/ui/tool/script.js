/* global $page */
let rules
async function __init__() { rules = await $page.invokeHostCommand('rules.connect') }
function bindAction() { return {disabled: rules?.locked() !== false} }
function bindEdit(context) { return {...bindAction(), visible: rules?.canEdit(context.row) === true} }
function bindDelete(context) { return {...bindAction(), visible: rules?.canDelete(context.row) === true} }
function bindVerification() { return rules?.verification() ?? {visible: false} }
async function createRule() { await $page.invokeHostCommand('rules.create') }
async function editRule(row) { await $page.invokeHostCommand('rules.edit', row) }
async function removeRule(row) { await $page.invokeHostCommand('rules.remove', row) }
async function verifySave() { await $page.invokeHostCommand('rules.verify') }
