/* global $page */
let reports
async function __init__() { reports = await $page.invokeHostCommand('reports.connect') }
function bindReportDate() { return {displayFormatter: reports?.formatDay} }
function bindReportAction() { return {disabled: reports?.locked() !== false} }
async function editReport(row) { await $page.invokeHostCommand('reports.edit', row) }
async function removeReport(row) { await $page.invokeHostCommand('reports.remove', row) }
async function versionReport(row) { await $page.invokeHostCommand('reports.version', row) }
async function modelReport(row) { await $page.invokeHostCommand('reports.model', row) }
