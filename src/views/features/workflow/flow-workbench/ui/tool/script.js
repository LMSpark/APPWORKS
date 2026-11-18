/* global $page */
async function openWorkbenchRun(row) { await $page.invokeHostCommand('workbench.run', row) }
async function openWorkbenchDetail(row) { await $page.invokeHostCommand('workbench.detail', row) }
