/* global $page */
let interfaces

async function __init__() { interfaces = await $page.invokeHostCommand('interfaces.connect') }
function bindCreate() { return {disabled:interfaces?.actions().createDisabled !== false} }
function bindRemove() { return {disabled:interfaces?.actions().removeDisabled !== false} }
async function createInterface() { await $page.invokeHostCommand('interfaces.create') }
async function removeInterface() { await $page.invokeHostCommand('interfaces.remove') }
async function chooseInterface(row) { await $page.invokeHostCommand('interfaces.select',row?.rowid) }
