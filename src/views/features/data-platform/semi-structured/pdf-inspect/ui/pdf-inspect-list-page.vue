<!--
@module app:views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page
-->
<template>
  <RendererSection class="pdf-inspect-catalog" title="PDF 识别规则" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取规则目录…' : ''" :error="error">
    <template v-if="ready" #header-actions>
      <RendererButton label="新增规则" :disabled="loading || adding || !!creationId" @click="createRule" />
      <RendererButton label="打开设计" icon="Setting" :disabled="loading || !selected" @click="openEditor" />
      <RendererButton label="刷新" icon="Refresh" :disabled="loading" @click="refreshCatalog" />
    </template>
    <RendererTable v-if="ready" :data-view-key="catalogKey" :children="fields" :stripe="true" :border="true"
      :highlight-current-row="true" :on-row-click="choose" :show-data-view-meta="false" />
    <FeatureRecordDialog v-if="creationId !== undefined" :data-view-key="creationKey" :record-id="creationId"
      title="新增PDF核验规则" :created="true" :specs="creationFields" :validate="validateCreation" @close="closeCreation" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodePdfInspect} from '@/lowcode/resources/semi-structured/pdf-inspect/resource'
import {buildApplicationPath, parseApplicationPathScope} from '@/services/application-scope'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import type {FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'
import {validatePdfRuleConfig} from '@/lowcode/resources/semi-structured/pdf-inspect/rule-config'

const {PAGE_RUNTIME, RendererSection, RendererTable, RendererButton, useSparkComponent, consumeRequiredPageService} = SparkComponent
const route = useRoute()
const router = useRouter()
const creationId=ref<string|number>(),adding=ref(false)
const creationKey=computed(()=>buildDataViewKey(LowcodePdfInspect.catalogMetaName,'creation',scenarioId.value))
const creationFields:readonly FeatureFieldSpec[]=[{field:'name',label:'规则名称',required:true},{field:'description',label:'描述'},
  {field:'rule_config',label:'规则JSON',kind:'textarea',required:true},
  {field:'enabled',label:'启用',kind:'radio',required:true,options:[{value:0,label:'停用'},{value:1,label:'启用'}]}]
const pendingCreation=()=>adding.value||creationId.value!==undefined||session.runtime?.isDirty===true
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
consumeRequiredPageService(sparkConsume, 'pdf-inspect-list-page')
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
const editorPath = '/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page'
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'name', label: '规则名称', minWidth: 240, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'description', label: '描述', minWidth: 300, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'enabled', label: '启用状态', width: 120}},
])
function choose(row: DataRow): void {view.value?.setSelectedRows([row])}
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
