/* global $page */
let reports
async function __init__() { reports = await $page.invokeHostCommand('reports.connect') }
function bindReportDate() { return {displayFormatter: reports?.formatDay} }
function bindReportAction() { return {disabled: reports?.locked() !== false} }
async function editReport(row) { await $page.invokeHostCommand('reports.edit', row) }
async function removeReport(row) { await $page.invokeHostCommand('reports.remove', row) }
async function versionReport(row) { await $page.invokeHostCommand('reports.version', row) }
async function modelReport(row) { await $page.invokeHostCommand('reports.model', row) }
function bindReportVerification() { return reports?.verification() ?? {visible: false} }
async function verifyReport() { await $page.invokeHostCommand('reports.verify') }
async function createReport() { await $page.invokeHostCommand('reports.create') }
async function editReportVersion(row) { await $page.invokeHostCommand('reports.version.edit', row) }
async function removeReportVersion(row) { await $page.invokeHostCommand('reports.version.remove', row) }
async function activateReportVersion(row) { await $page.invokeHostCommand('reports.version.activate', row) }
async function chooseReportModel(row) { await $page.invokeHostCommand('reports.model.choose', row) }
async function addReportVersion() { await $page.invokeHostCommand('reports.version.add') }
async function cancelReportModel() { await $page.invokeHostCommand('reports.model.cancel') }
async function submitReportModel() { await $page.invokeHostCommand('reports.model.submit') }
async function cancelCreateReport() { await $page.invokeHostCommand('reports.create.cancel') }
async function abandonCreateReport() { await $page.invokeHostCommand('reports.create.abandon') }
async function submitCreateReport() { await $page.invokeHostCommand('reports.create.submit') }
