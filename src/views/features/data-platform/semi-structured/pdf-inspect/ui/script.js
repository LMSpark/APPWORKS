/* global $page */
let catalog

async function __init__() {
  catalog = await $page.invokeHostCommand('pdf.catalog.connect')
}
function bindCatalogStatus() {
  const state = catalog?.status()
  return {status:state?.loading ? '正在读取规则目录…' : '',error:state?.error || ''}
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

function bindCreateRule() {
  const state = catalog?.actions()
  return {visible:state?.catalogScope === false,disabled:state?.loading || state?.adding || state?.preparing || state?.pending}
}
function bindOpenDesign() {
  const state = catalog?.actions()
  return {visible:state?.catalogScope === false,disabled:state?.loading || !state?.selected}
}
function bindPrepareInspection() {
  const state = catalog?.actions()
  return {visible:state?.executionAvailable === true,disabled:state?.loading || !state?.selected || state?.preparing || state?.pending || state?.adding}
}
function bindRefreshCatalog() {
  const state = catalog?.actions()
  return {disabled:state?.loading || state?.preparing || state?.pending}
}
function bindOpenHistory() {
  const state = catalog?.actions()
  return {visible:state?.historyAvailable === true,disabled:state?.loading || state?.historyLoading}
}
function bindCatalogScope() { return {visible:catalog?.actions().catalogScope === true} }
function bindPendingRequests() {
  const state = catalog?.actions()
  const requests = state?.requests || []
  return {visible:requests.length > 0,children:requests.map(id=>({id,type:'r-button',props:{
    label:'核验原请求 ' + id,disabled:state.resultLoading || state.pending,onClick:()=>openPendingRequest(id)
  }}))}
}

async function createRule() { await $page.invokeHostCommand('pdf.catalog.create') }
async function openDesign() { await navigateCatalog('pdf.catalog.design') }
async function prepareInspection() { await $page.invokeHostCommand('pdf.catalog.prepare') }
async function refreshCatalog() { await $page.invokeHostCommand('pdf.catalog.refresh') }
async function openHistory() { await $page.invokeHostCommand('pdf.catalog.history') }
async function openPendingRequest(id) { await navigateCatalog('pdf.catalog.openRequest',id) }

async function navigateCatalog(command,id) {
  try {
    await $page.invokeHostCommand(command,id)
  } catch (cause) {
    if (!String(cause?.message).startsWith('PAGE_RUNTIME_STALE')) throw cause
  }
}

function bindCreationDialog() {
  const state = catalog?.creation()
  const open = state?.id !== undefined && !!state.session
  return {visible:open,modelValue:open,dataViewKey:state?.key,closeDisabled:!!(state?.session?.busy || state?.session?.ownUnconfirmed)}
}
function bindCreationStatus() {
  const state = catalog?.creation().session
  return {error:state?.error || '',status:state && !state.current ? '原记录已变化，请关闭并保留原修改。' : ''}
}
function bindCreationForm() {
  const state = catalog?.creation()
  return {dataViewKey:state?.key,contextRowId:state?.id}
}
function bindCreationField() { return {readonly:catalog?.creation().session?.locked !== false} }
function bindCreationCancel() {
  const state = catalog?.creation().session
  return {label:state?.foreignRecovery || state?.recoveryEnded ? '关闭并保留修改' : state?.confirmedCreation ? '关闭' : '取消',
    disabled:!state || state.busy || state.ownUnconfirmed}
}
function bindCreationSubmit() {
  const state = catalog?.creation().session
  return {label:state?.permissionsPending ? '回读已保存权限' : state?.ownUnconfirmed ? '核验原保存结果' : '确定',
    disabled:!state || state.busy || state.foreignRecovery || !state.permissionsPending && (state.recoveryEnded || !state.current && !state.ownUnconfirmed)}
}
async function cancelCreation() { await $page.invokeHostCommand('pdf.catalog.cancelCreation') }
async function closeCreation(open) { if (open === false) await cancelCreation() }
async function submitCreation() { await $page.invokeHostCommand('pdf.catalog.submitCreation') }
