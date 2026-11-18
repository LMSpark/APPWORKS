/* global $page */
let cache
async function __init__() { cache = await $page.invokeHostCommand('cache.connect') }
function bindDelete() { return {disabled: cache?.deleteDisabled() !== false} }
async function deleteCache(row) { await $page.invokeHostCommand('cache.delete', row) }
