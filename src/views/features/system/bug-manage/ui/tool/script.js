/* global $page */
let bugs
async function __init__() { bugs = await $page.invokeHostCommand('bugs.connect') }
function bindDetail() { return {disabled: bugs?.detailDisabled() !== false} }
async function openDetail(row) { await $page.invokeHostCommand('bugs.detail', row?.rowid) }
