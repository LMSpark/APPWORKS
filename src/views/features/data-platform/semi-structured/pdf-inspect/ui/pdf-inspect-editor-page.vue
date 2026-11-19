<!--
@module app:views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page
-->
<template>
  <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" />
  <RendererSection v-else title="PDF 规则设计" :bordered="false" :status="loading ? '正在读取…' : ''" :error="error" />
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute} from 'vue-router'
import {type DataSet} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession, useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {RendererSection, SparkPageRenderer} from '@spark-appworks/spark-component'
import {LowcodePdfInspect} from '@/lowcode/resources/semi-structured/pdf-inspect/resource'
import {validatePdfRuleConfig} from '@/lowcode/resources/semi-structured/pdf-inspect/rule-config'
import {PageTool,type PageRuntime} from '@spark-appworks/spark-project-model'
import {resolveExecutionProjectId} from '@/services/application-scope'
import rule from './design-tool/rule.json?raw'
import script from './design-tool/script.js?raw'
import style from './design-tool/style.css?raw'

const route = useRoute()
const projectId = computed(() => resolveExecutionProjectId(route.path))
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const ruleId = computed(() => typeof route.query['ruleId'] === 'string' ? route.query['ruleId'] : '')
const session = new NativePageRuntimeSession()
const routeSnapshot=computed(()=>{
  const {path,fullPath,name,params,query,hash}=route
  return {path,fullPath,name:name??null,params,query,hash}
})
const runtime=shallowRef<PageRuntime>()
const host=shallowRef<ReturnType<typeof makeHost>>()
const dataSet = shallowRef<DataSet>(), loading = ref(false), ready = ref(false), busy = ref(false), error = ref(''), pendingInput = ref(false), revision = ref(0)
let unsubscribe: (() => void) | undefined, generation = 0, active = true
const definition = computed(() => dataSet.value?.getView(LowcodePdfInspect.catalogMetaName, 'definition'))
const hasDefinition = computed(() => {revision.value; return definition.value?.rows.length === 1})
const missing = computed(() => ready.value && !hasDefinition.value && !queryError.value)
const queryError = computed(() => {revision.value; return definition.value?.loadingError?.message ?? ''})
const unconfirmed = computed(() => {revision.value; return definition.value?.hasUnconfirmedSave === true})
const hasPending = computed(() => {revision.value; return busy.value || pendingInput.value || unconfirmed.value || !!definition.value && (definition.value.hasEditingChanges() || definition.value.dirtyTracking.hasPendingChanges())})
useSystemPageDirtySource({get isDirty() { return hasPending.value }})
function validateRule(value: unknown): void {
  if (typeof value !== 'string') throw new Error('规则配置必须是JSON文本')
  parseJsonDocument(value)
}
function makeHost(current:PageRuntime){
  const assertCurrent=()=>{if(!active||!session.isCurrent(current))throw new Error('PDF设计运行实例已失效')}
  return {runtime:current,assertCurrent,async invoke(command:string){
    assertCurrent()
    if(command==='pdf.design.connect')return {
      state:()=>({ruleId:ruleId.value,loading:loading.value,error:error.value||queryError.value,missing:missing.value,
        visible:ready.value&&hasDefinition.value,busy:busy.value,pending:pendingInput.value,unconfirmed:unconfirmed.value}),
      validateRule,
      trackInput:(editing:boolean)=>{if(active&&session.isCurrent(current))pendingInput.value=editing},
    }
    if(command==='pdf.design.save')await save()
    if(command==='pdf.design.cancel')cancel()
    return undefined
  }}
}
onBeforeRouteLeave(() => !hasPending.value)
onBeforeRouteUpdate(() => !hasPending.value)
watch([scenarioId, ruleId, projectId], async ([scene, id, project]) => {
  const own = ++generation
  unsubscribe?.(); runtime.value=undefined; host.value=undefined; dataSet.value = undefined; session.dispose()
  ready.value = false; loading.value = true; error.value = ''; pendingInput.value = false
  try {
    if (!id.trim()) throw new Error('缺少 ruleId 参数')
    const loaded = await LowcodePdfInspect.loadEditor(scene, project)
    if (!active || own !== generation) {loaded.destroy(); return}
    const tool=new PageTool({pageId:'pdf-inspect-editor-page'})
    tool.hydrateFileText('rule.json',rule)
    tool.hydrateFileText('script.js',script)
    tool.hydrateFileText('style.css',style)
    tool.markLoaded()
    const current = session.acquire({tool, scenarioIds: [scene], targetId: project === undefined ? id : `${project}:${id}`,
      scenarioInputs: {[scene]: {ruleId: id}}, loadScenario: async () => loaded})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    const view = loaded.getView(LowcodePdfInspect.catalogMetaName, 'definition')
    if (!view) throw new Error('PDF正式规则视图缺失')
    dataSet.value = loaded
    const changed = () => revision.value++
    unsubscribe = loaded.onAnyViewChange({rowsChanged: changed, editingChanged: changed, requestStateChanged: changed, mutatingChanged: changed})
    runtime.value=current;host.value=makeHost(current)
    await view.refresh()
    if (active && own === generation && session.isCurrent(current)) ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
async function save(): Promise<void> {
  if (!dataSet.value || busy.value || pendingInput.value || !hasDefinition.value) return
  const own = generation; busy.value = true; error.value = ''
  try {
    const view=definition.value,original=view?.currentRow,id=original&&view?.getPkKey(original)
    const edited=id===undefined||id===null?undefined:view?.getEditingRow(id)
    if(!unconfirmed.value&&original&&edited&&(edited['rule_config']!==original['rule_config']
      ||edited['enabled']===1&&original['enabled']!==1))validatePdfRuleConfig(edited['rule_config'])
    const result = await dataSet.value.saveChanges({views: [{tableName: LowcodePdfInspect.catalogMetaName, viewId: 'definition'}]})
    if (!result.success) throw new Error(result.message ?? '规则保存未完整确认')
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) {busy.value = false; revision.value++}}
}
function cancel(): void {
  if (busy.value || unconfirmed.value) return
  try {definition.value?.discardPendingChanges(); error.value = ''; revision.value++}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); session.dispose()})
</script>
