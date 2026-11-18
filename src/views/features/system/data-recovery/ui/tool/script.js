/* global $page */
let recovery
async function __init__() { recovery = await $page.invokeHostCommand('recovery.connect') }
function bindRecoverySelection() { return {disabled: recovery?.selectionLocked() !== false} }
