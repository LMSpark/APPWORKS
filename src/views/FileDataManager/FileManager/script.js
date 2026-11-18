/* global $page */
let files

async function __init__() { files = await $page.invokeHostCommand('files.connect') }
function bindCatalog() { return {error:files?.error() || ''} }
function bindAction() { return {disabled:files?.busy() !== false} }

async function uploadFile() { await $page.invokeHostCommand('files.upload') }
async function removeFile(row) { await $page.invokeHostCommand('files.remove',row?.fileName) }
async function downloadFile(row) { await $page.invokeHostCommand('files.download',row?.fileName) }
