<!--
@module app:views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page
-->
<template>
  <RendererSection class="pdf-inspect-catalog" title="PDF 识别规则" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取规则目录…' : ''" :error="error">
    <template v-if="ready" #header-actions>
      <RendererButton label="新增规则" :disabled="loading || adding || !!creationId" @click="createRule" />
      <RendererButton label="打开设计" icon="Setting" :disabled="loading || !selected" @click="openEditor" />
      <RendererButton v-if="executionAvailable" label="核验准备" :disabled="loading || !selected || preparing || pendingExecution()" @click="prepareInspection" />
      <RendererButton label="刷新" icon="Refresh" :disabled="loading" @click="refreshCatalog" />
      <RendererButton v-if="historyAvailable" label="核验历史" :disabled="loading || historyLoading" @click="openHistory" />
    </template>
    <RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :stripe="true" :border="true"
      :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
    <FeatureRecordDialog v-if="creationId !== undefined" :data-view-key="creationKey" :record-id="creationId"
      title="新增PDF核验规则" :created="true" :specs="creationFields" :validate="validateCreation" @close="closeCreation" />
    <RendererSection v-if="preparationOpen" title="核验准备" :bordered="false"
      :status="preparing ? '正在读取正式规则和服务限制…' : ''" :error="preparationError">
      <RendererForm v-if="preparationReady" :data-view-key="limitsKey" :auto-columns="false" :show-data-view-meta="false">
        <FieldNumber field="maxFiles" label="最多文件数" readonly />
        <FieldNumber field="maxFileBytes" label="单文件字节上限" readonly />
        <FieldNumber field="maxTotalFileBytes" label="文件总字节上限" readonly />
      </RendererForm>
      <template v-if="execution">
        <RendererButton label="选择 PDF 或 ZIP" :disabled="executionBusy || execution.uploadIds.length > 0" @click="selectInspectionFiles" />
        <RendererButton v-if="execution.uploadIds.length" :label="execution.submitLabel" button-type="primary"
          :disabled="executionBusy" @click="submitInspection" />
        <RendererButton v-if="execution.uploadIds.length && !execution.dispatched" label="取消所选文件"
          :disabled="executionBusy" @click="cancelInspectionFiles" />
        <RendererButton v-if="execution.requestId" label="复制原请求恢复链接" @click="copyInspectionRecoveryLink" />
        <RendererTable v-if="execution.uploadIds.length" :data-view-key="uploadKey" :show-data-view-meta="false">
          <FieldText field="originalName" label="文件名称" readonly />
          <FieldNumber field="size" label="字节数" readonly />
        </RendererTable>
      </template>
      <p v-if="executionMessage" role="status">{{ executionMessage }}</p>
    </RendererSection>
    <RendererSection v-if="ready && historyOpen" title="核验历史" :error="historyError" :bordered="false">
      <RendererTable :data-view-key="historyKey" :show-data-view-meta="false" :on-row-click="openHistoryResult">
        <FieldText field="inspectJobId" label="任务编号" readonly />
        <FieldText field="requestId" label="请求编号" readonly />
        <FieldText field="configId" label="规则编号" readonly />
        <FieldText field="status" label="处理状态" readonly />
      </RendererTable>
    </RendererSection>
    <RendererSection v-if="resultOpen" :title="recovering ? '恢复原核验请求' : '原任务结果'" :bordered="false"
      :status="resultLoading ? '正在读取原任务…' : ''" :error="resultError">
      <RendererButton v-if="recovering" label="重新核验原请求" :disabled="resultLoading" @click="recoverOriginal" />
      <RendererForm v-if="resultReady" :data-view-key="recovering ? recoveryKey : resultKey" :auto-columns="false" :show-data-view-meta="false">
        <FieldText field="inspectJobId" label="任务编号" readonly />
        <FieldText field="requestId" label="请求编号" readonly />
        <FieldText field="status" label="处理状态" readonly />
        <FieldNumber field="finished" label="已处理文件数" readonly />
        <FieldNumber field="total" label="文件总数" readonly />
        <FieldJson field="files" label="文件与规则核验明细" mode="text" value-format="native" readonly />
      </RendererForm>
    </RendererSection>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, reactive, ref, shallowReactive, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodePdfInspect} from '@/lowcode/resources/semi-structured/pdf-inspect/resource'
import {PDF_INSPECTION_HISTORY_TABLE} from '@/lowcode/resources/semi-structured/pdf-inspect/runtime-bindings'
import {readPdfExecutionRule} from '@/lowcode/resources/semi-structured/pdf-inspect/execution-rule'
import {cancelPdfInspectionFile, PDF_INSPECTION_UPLOAD_TABLE, stagePdfInspectionFile} from '@/lowcode/resources/semi-structured/pdf-inspect/upload-command'
import {PDF_INSPECTION_INIT_TABLE, settlePdfInspectionTask, stagePdfInspectionTask} from '@/lowcode/resources/semi-structured/pdf-inspect/init-command'
import {buildApplicationPath, parseApplicationPathScope} from '@/services/application-scope'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import type {FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import {validatePdfRuleConfig} from '@/lowcode/resources/semi-structured/pdf-inspect/rule-config'

const {PAGE_RUNTIME, RendererSection, RendererTable, RendererButton, RendererForm, FieldText, FieldNumber, FieldJson,
  useSparkComponent, consumeRequiredPageService} = SparkComponent
const route = useRoute()
const router = useRouter()
const creationId=ref<string|number>(),adding=ref(false)
const creationKey=computed(()=>buildDataViewKey(LowcodePdfInspect.catalogMetaName,'creation',scenarioId.value))
const creationFields:readonly FeatureFieldSpec[]=[{field:'name',label:'规则名称',required:true},{field:'description',label:'描述'},
  {field:'rule_config',label:'规则JSON',kind:'textarea',required:true},
  {field:'enabled',label:'启用',kind:'radio',required:true,options:[{value:0,label:'停用'},{value:1,label:'启用'}]}]
const pendingCreation=()=>adding.value||creationId.value!==undefined||pendingExecution()||session.runtime?.isDirty===true
useSystemPageDirtySource({get isDirty(){return pendingCreation()}})
onBeforeRouteLeave(()=>!pendingCreation())
onBeforeRouteUpdate(()=>!pendingCreation())
function validateCreation(row:Readonly<DataRow>):string|undefined{try{validatePdfRuleConfig(row['rule_config']);return undefined}catch(cause){return cause instanceof Error?cause.message:String(cause)}}
async function createRule():Promise<void>{
  if(adding.value||creationId.value!==undefined)return
  adding.value=true
  try{
    const current=session.runtime,creation=current?.resolveView(creationKey.value)
    if(!creation)throw Error('PDF创建视图尚未装配')
    await creation.refresh()
    if(session.runtime!==current)throw Error('PDF创建实例已变化')
    if(creation.loadingError)throw creation.loadingError
    await creation.addRow({})
    const ids=[...creation.dirtyTracking.pendingCreateIds]
    const id=ids.length===1?ids[0]:undefined
    if(id===undefined)throw Error('新规则缺少唯一原生身份')
    creation.setCurrentRowById(id)
    creationId.value=id
  }catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}finally{adding.value=false}
}
async function closeCreation():Promise<void>{creationId.value=undefined;await refreshCatalog()}
const {sparkProvide, sparkRemove, sparkConsume} = useSparkComponent({type: 'pdf-inspect-list-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'pdf-inspect-list-page')
const session = new NativePageRuntimeSession({
  provide: () => undefined,
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
let unsubscribe: (() => void) | undefined, generation = 0, active = true
const selected = computed(() => {
  revision.value
  const row = view.value?.selectedRows[0]
  const id = row && view.value?.selectedRows.length === 1 ? view.value.getPkKey(row) : undefined
  return typeof id === 'string' || typeof id === 'number' ? String(id) : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodePdfInspect.catalogMetaName, 'default', scenarioId.value))
const historyKey = computed(() => buildDataViewKey(PDF_INSPECTION_HISTORY_TABLE, 'default', scenarioId.value))
const limitsKey = computed(() => buildDataViewKey('PdfInspectionLimits', 'default', scenarioId.value))
const uploadKey = computed(() => buildDataViewKey(PDF_INSPECTION_UPLOAD_TABLE, 'default', scenarioId.value))
const resultKey = computed(() => buildDataViewKey('PdfInspectionResult', 'default', scenarioId.value))
const recoveryKey = computed(() => buildDataViewKey('PdfInspectionRecovery', 'default', scenarioId.value))
const recoveryRequest = computed(() => route.query['pdfInspectionRequestId'])
const historyAvailable = ref(false), historyOpen = ref(false), historyLoading = ref(false), historyError = ref('')
const resultOpen = ref(false), resultLoading = ref(false), resultReady = ref(false), resultError = ref('')
const recovering = ref(false)
let resultGeneration = 0
const executionAvailable = ref(false), preparationOpen = ref(false), preparing = ref(false)
const preparationReady = ref(false), preparationError = ref('')
type InspectionExecution = {
  ruleId: string
  dataSet: DataSet
  assertReady: () => void
  limits: Readonly<{maxFiles: number; maxFileBytes: number; maxTotalFileBytes: number}>
  uploadIds: string[]
  requestId?: string
  dispatched: boolean
  accepted: boolean
  submitLabel: string
}
const execution = shallowRef<InspectionExecution>(), executionBusy = ref(false), executionMessage = ref('')
function pendingExecution(): boolean {
  return executionBusy.value || (execution.value?.uploadIds.length ?? 0) > 0
}
async function selectInspectionFiles(): Promise<void> {
  const run = execution.value
  if (!run || executionBusy.value || run.uploadIds.length) return
  executionBusy.value = true; preparationError.value = ''
  try {
    const selectedFiles = await pageService.browseFiles({title: '选择待核验 PDF 或 ZIP', accept: '.pdf,.zip', multiple: true})
    run.assertReady()
    if (!selectedFiles.length) return
    const files = selectedFiles.map(item => item.file), {maxFiles, maxFileBytes, maxTotalFileBytes} = run.limits
    if (files.length > maxFiles || files.some(file => !/\.(pdf|zip)$/iu.test(file.name) || file.size < 1 || file.size > maxFileBytes) ||
      files.reduce((total, file) => total + file.size, 0) > maxTotalFileBytes) throw Error('所选文件不符合当前服务限制')
    for (const file of files) run.uploadIds.push(await stagePdfInspectionFile(run.dataSet, file, run.assertReady))
  } catch (cause) {
    if (execution.value === run) {
      preparationError.value = cause instanceof Error ? cause.message : String(cause)
      try {discardInspectionFiles(run)}
      catch {preparationError.value = '文件未完整暂存，请取消所选文件后再试'}
    }
  } finally {if (execution.value === run) executionBusy.value = false}
}
function cancelInspectionFiles(): void {
  const run = execution.value
  if (!run || run.dispatched || executionBusy.value) return
  try {discardInspectionFiles(run); preparationError.value = ''}
  catch (cause) {preparationError.value = cause instanceof Error ? cause.message : String(cause)}
}
function discardInspectionFiles(run: InspectionExecution): void {
  while (run.uploadIds.length) {
    const id = run.uploadIds[run.uploadIds.length - 1]
    if (id === undefined) break
    cancelPdfInspectionFile(run.dataSet, id)
    run.uploadIds.pop()
  }
}
function resolveInspectionRecoveryUrl(requestId: string): string {
  return router.resolve({path: route.path, query: {pdfInspectionRequestId: requestId}}).href
}
async function copyInspectionRecoveryLink(): Promise<void> {
  const requestId = execution.value?.requestId
  if (!requestId) return
  try {await pageService.copyText(resolveInspectionRecoveryUrl(requestId))}
  catch (cause) {preparationError.value = cause instanceof Error ? cause.message : String(cause)}
}
async function submitInspection(): Promise<void> {
  const run = execution.value
  if (!run || executionBusy.value || !run.uploadIds.length) return
  executionBusy.value = true; preparationError.value = ''
  try {
    const upload = run.dataSet.getView(PDF_INSPECTION_UPLOAD_TABLE)
    if (!upload) throw Error('原上传命令未绑定')
    run.dispatched = true
    const uploadIds = run.uploadIds.filter(id => upload.dirtyTracking.isPendingCreate(id))
    if (uploadIds.length) {
      const saved = await run.dataSet.saveChanges({views: [{tableName: PDF_INSPECTION_UPLOAD_TABLE, viewId: 'default', ids: uploadIds}]})
      if (!saved.success) throw Error(saved.message ?? '原文件上传尚未核定')
    }
    run.requestId ??= await stagePdfInspectionTask(run.dataSet, {configId: run.ruleId, uploadIds: run.uploadIds,
      assertRule: run.assertReady, resolveRecoveryUrl: resolveInspectionRecoveryUrl})
    if (!run.accepted) {
      const saved = await run.dataSet.saveChanges({views: [{tableName: PDF_INSPECTION_INIT_TABLE, viewId: 'default', ids: [run.requestId]}]})
      if (!saved.success) throw Error(saved.message ?? '原请求尚未核定')
      run.accepted = true
    }
    settlePdfInspectionTask(run.dataSet, run.requestId)
    executionMessage.value = `任务已接纳，原请求编号 ${run.requestId}`
    executionBusy.value = false
    execution.value = undefined
  } catch (cause) {
    if (execution.value === run) {
      const upload = run.dataSet.getView(PDF_INSPECTION_UPLOAD_TABLE)
      if (!run.requestId && upload && !upload.hasUnconfirmedSave && run.uploadIds.every(id => upload.dirtyTracking.isPendingCreate(id))) {
        run.dispatched = false
      }
      run.submitLabel = run.accepted ? '重试清理恢复定位' : run.dispatched ? '继续核验原操作' : '开始核验'
      preparationError.value = cause instanceof Error ? cause.message : String(cause)
    }
  } finally {if (execution.value === run) executionBusy.value = false}
}
async function prepareInspection(): Promise<void> {
  const current = session.runtime, ruleId = selected.value, limits = current?.resolveView(limitsKey.value)
  const dataSet = current?.getDataSet(scenarioId.value)
  if (!current || !dataSet || !limits || !ruleId || preparing.value || pendingExecution()) return
  const own = generation
  const assertCurrent = () => {
    if (!active || own !== generation || !session.isCurrent(current) || selected.value !== ruleId) {
      throw Error('核验准备的原规则已变化，请重新选择')
    }
  }
  preparationOpen.value = true; preparing.value = true; preparationReady.value = false; preparationError.value = ''; executionMessage.value = ''
  execution.value = undefined
  try {
    const assertRule = await readPdfExecutionRule(dataSet, ruleId, assertCurrent)
    await limits.refresh()
    assertRule()
    const row = limits.rows[0]
    if (limits.loadingError || limits.rows.length !== 1 || !row) throw Error('未读取到服务限制')
    const assertLimits = limits.captureReadRow(row, ['id', 'maxFiles', 'maxFileBytes', 'maxTotalFileBytes'])
    const {maxFiles, maxFileBytes, maxTotalFileBytes} = row
    if (typeof maxFiles !== 'number' || typeof maxFileBytes !== 'number' || typeof maxTotalFileBytes !== 'number') throw Error('服务限制不可读')
    limits.setCurrentRowById('limits')
    const upload = dataSet.getView(PDF_INSPECTION_UPLOAD_TABLE), init = dataSet.getView(PDF_INSPECTION_INIT_TABLE)
    if (upload && init) {
      await upload.refresh(); await init.refresh()
      assertRule(); assertLimits()
      if (upload.loadingError || init.loadingError) throw Error('核验命令尚未就绪')
      execution.value = shallowReactive({ruleId, dataSet, limits: {maxFiles, maxFileBytes, maxTotalFileBytes},
        assertReady: () => {assertRule(); assertLimits()}, uploadIds: reactive<string[]>([]),
        dispatched: false, accepted: false, submitLabel: '开始核验'})
    }
    preparationReady.value = true
  } catch (cause) {
    if (active && own === generation) preparationError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (active && own === generation) preparing.value = false
  }
}
watch(selected, () => {
  if (pendingExecution()) return
  execution.value = undefined; preparationReady.value = false; preparationOpen.value = false
})
function openHistoryResult(row: DataRow): void {
  if (!resultLoading.value) void readHistoryResult(row)
}
async function readHistoryResult(row: DataRow): Promise<void> {
  const current = session.runtime, history = current?.resolveView(historyKey.value), result = current?.resolveView(resultKey.value)
  if (!history || !result) return
  const own = ++resultGeneration
  recovering.value = false
  resultOpen.value = true; resultLoading.value = true; resultReady.value = false; resultError.value = ''
  try {
    const assertOriginal = history.captureReadRow(row, ['inspectJobId', 'requestId'])
    const {inspectJobId, requestId} = row
    if (typeof inspectJobId !== 'string' || typeof requestId !== 'string') throw Error('历史记录缺少原任务或请求编号')
    result.queryContext = {inspectJobId}
    await result.refresh()
    if (!active || own !== resultGeneration) return
    assertOriginal()
    if (result.loadingError) throw result.loadingError
    const original = result.rows[0]
    if (!original || result.rows.length !== 1 || original['requestId'] !== requestId || original['inspectJobId'] !== inspectJobId) {
      throw Error('服务返回的原任务与历史记录不一致')
    }
    result.setCurrentRowById(inspectJobId)
    resultReady.value = true
  } catch (cause) {
    if (active && own === resultGeneration) resultError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (active && own === resultGeneration) resultLoading.value = false
  }
}
async function recoverOriginal(): Promise<void> {
  const own = ++resultGeneration, requestId = recoveryRequest.value
  recovering.value = true; resultOpen.value = true; resultReady.value = false; resultLoading.value = false; resultError.value = ''
  if (typeof requestId !== 'string' || !/^[-A-Za-z0-9_]{1,128}$/u.test(requestId)) {
    resultError.value = '恢复链接缺少唯一有效的原请求编号'
    return
  }
  const recovery = session.runtime?.resolveView(recoveryKey.value)
  if (!recovery) {
    resultError.value = '当前场景缺少原请求恢复视图'
    return
  }
  resultLoading.value = true
  try {
    recovery.queryContext = {requestId}
    await recovery.refresh()
    if (!active || own !== resultGeneration) return
    const original = recovery.rows[0], jobId = original?.['inspectJobId']
    if (recovery.loadingError || recovery.rows.length !== 1 || original?.['requestId'] !== requestId || typeof jobId !== 'string') {
      throw Error('原请求结果尚未核定，可重新核验同一请求')
    }
    recovery.captureReadRow(original, ['requestId', 'inspectJobId'])()
    recovery.setCurrentRowById(jobId)
    resultReady.value = true
  } catch {
    if (active && own === resultGeneration) resultError.value = '原请求结果尚未核定，可重新核验同一请求'
  } finally {
    if (active && own === resultGeneration) resultLoading.value = false
  }
}
watch([ready, recoveryRequest], ([loaded, requestId]) => {
  if (loaded && requestId !== undefined) void recoverOriginal()
  else if (recovering.value) {
    resultGeneration++
    recovering.value = false; resultOpen.value = false; resultLoading.value = false; resultReady.value = false; resultError.value = ''
  }
})
async function openHistory(): Promise<void> {
  const current = session.runtime, history = current?.resolveView(historyKey.value)
  if (!history || historyLoading.value) return
  const own = generation
  historyOpen.value = true; historyLoading.value = true; historyError.value = ''
  try {
    await history.refresh()
    if (history.loadingError) throw history.loadingError
  } catch (cause) {
    if (active && own === generation) historyError.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (active && own === generation) historyLoading.value = false
  }
}
const editorPath = '/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page'
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'name', label: '规则名称', minWidth: 240, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'description', label: '描述', minWidth: 300, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'enabled', label: '启用状态', width: 120}},
])
function choose(row: DataRow): void {if (!pendingExecution()) view.value?.setSelectedRows([row])}
async function refreshCatalog(): Promise<void> {
  if (loading.value || !view.value) return
  try {await view.value.refresh()}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
async function openEditor(): Promise<void> {
  if (!selected.value) return
  const scope = parseApplicationPathScope(route.path)
  const path = scope ? buildApplicationPath(scope, editorPath) : editorPath
  await router.push({path, query: {ruleId: selected.value}})
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  historyAvailable.value = false; historyOpen.value = false; historyLoading.value = false; historyError.value = ''
  executionAvailable.value = false; preparationOpen.value = false; preparing.value = false; preparationReady.value = false; preparationError.value = ''
  execution.value = undefined; executionBusy.value = false; executionMessage.value = ''
  resultGeneration++
  recovering.value = false; resultOpen.value = false; resultLoading.value = false; resultReady.value = false; resultError.value = ''
  unsubscribe?.(); view.value = undefined
  session.dispose()
  try {
    if (!id) throw new Error('PDF 识别入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodePdfInspect.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    const current = session.acquire({pageId: 'pdf-inspect-list-page', scenarioIds: [id], targetId: id,
      loadScenario: async () => dataSet})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    view.value = dataSet.getView(LowcodePdfInspect.catalogMetaName, 'default')
    historyAvailable.value = current.resolveView(historyKey.value) !== undefined
    executionAvailable.value = dataSet.getView(LowcodePdfInspect.catalogMetaName, 'executionRule') !== undefined &&
      current.resolveView(limitsKey.value) !== undefined
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++})
    if (active && own === generation && session.isCurrent(current)) {sparkProvide(PAGE_RUNTIME, current); ready.value = true}
    dataSet.triggerAutoLoad()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); session.dispose()})
</script>

<style scoped>
.pdf-inspect-catalog {padding: 8px}
</style>
