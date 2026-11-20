/* global $page */
async function openRun() { await $page.invokeHostCommand('workflow.openRun') }
async function openDetail() { await $page.invokeHostCommand('workflow.openDetail') }
