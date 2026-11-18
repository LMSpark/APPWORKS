/* global $page */
let catalog

async function __init__() {
  catalog = await $page.invokeHostCommand('pdf.catalog.connect')
}
async function selectRule(row) {
  await $page.invokeHostCommand('pdf.catalog.select',row?.id)
}

function bindHistory() {
  const history = catalog?.history()
  return {visible:history?.open === true,error:history?.error || ''}
}

function bindHistoryTable() { return {dataViewKey:catalog?.history().key} }

function bindResult() {
  const result = catalog?.result()
  return {visible:result?.open === true,title:result?.recovering ? '恢复原核验请求' : '原任务结果',
    status:result?.loading ? '正在读取原任务…' : '',error:result?.error || ''}
}

function bindRecover() {
  const result = catalog?.result()
  return {visible:result?.recovering === true,disabled:result?.loading === true}
}

function bindResultForm() {
  const result = catalog?.result()
  return {visible:result?.ready === true,dataViewKey:result?.key}
}

async function openHistoryResult(row) { await $page.invokeHostCommand('pdf.catalog.openResult',row?.inspectJobId) }
async function recoverOriginal() { await $page.invokeHostCommand('pdf.catalog.recover') }
