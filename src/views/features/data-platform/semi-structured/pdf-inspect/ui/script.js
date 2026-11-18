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

function bindPreparation() {
  const state = catalog?.preparation()
  return {visible:state?.open === true,status:state?.loading ? '正在读取正式规则和服务限制…' : '',error:state?.error || ''}
}
function bindLimits() {
  const state = catalog?.preparation()
  return {visible:state?.ready === true,dataViewKey:state?.limitsKey}
}
function bindSelectFiles() {
  const state = catalog?.preparation()
  return {visible:state?.running === true,disabled:state?.busy || state?.hasFiles}
}
function bindSubmitInspection() {
  const state = catalog?.preparation()
  return {visible:state?.hasFiles === true,disabled:state?.busy,label:state?.submitLabel}
}
function bindCancelFiles() {
  const state = catalog?.preparation()
  return {visible:state?.hasFiles === true && !state.dispatched,disabled:state?.busy}
}
function bindCopyRecovery() { return {visible:catalog?.preparation().hasRequest === true} }
function bindInspectionUploads() {
  const state = catalog?.preparation()
  return {visible:state?.hasFiles === true,dataViewKey:state?.uploadKey}
}
function bindExecutionMessage() {
  const status = catalog?.preparation().message
  return {visible:!!status,status}
}

async function selectInspectionFiles() { await $page.invokeHostCommand('pdf.catalog.selectFiles') }
async function submitInspection() { await $page.invokeHostCommand('pdf.catalog.submitInspection') }
async function cancelInspectionFiles() { await $page.invokeHostCommand('pdf.catalog.cancelFiles') }
async function copyInspectionRecoveryLink() { await $page.invokeHostCommand('pdf.catalog.copyRecovery') }
