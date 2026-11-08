<!--
@module app:views/features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-editor-page
-->
<template>
  <section class="structured-editor-page">
    <header><h1>PDF 规则设计</h1><p v-if="ruleId">规则 ID：{{ ruleId }}</p></header>
    <p v-if="loading" role="status">正在读取…</p>
    <p v-if="error || queryError" role="alert">{{ error || queryError }}</p>
    <p v-if="unconfirmed" role="status">保存结果尚未确认，请核验保存结果。</p>
    <p v-if="missing" role="alert">当前规则不存在</p>
    <template v-if="ready && hasDefinition">
      <RendererForm :data-view-key="definitionKey" :auto-columns="false" :show-data-view-meta="false">
        <FieldText field="name" label="规则名称" :readonly="busy || unconfirmed" />
        <FieldText field="description" label="描述" :readonly="busy || unconfirmed" />
        <FieldJson field="rule_config" label="规则 JSON" mode="text" :readonly="busy || unconfirmed" :on-change="validateRule" :on-editing-change="editing => pendingInput = editing" />
      </RendererForm>
      <RendererButton :label="unconfirmed ? '核验保存结果' : '保存规则'" button-type="primary" :disabled="busy || pendingInput" @click="save" />
      <RendererButton label="取消修改" :disabled="busy || unconfirmed" @click="cancel" />
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute} from 'vue-router'
import {buildDataViewKey, type DataSet} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {PAGE_RUNTIME, FieldText, FieldJson, RendererForm, RendererButton, useSparkComponent} from '@spark-appworks/spark-component'
import {LowcodePdfInspect} from '@/lowcode/resources/semi-structured/pdf-inspect/resource'

const route = useRoute()
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const ruleId = computed(() => typeof route.query['ruleId'] === 'string' ? route.query['ruleId'] : '')
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'pdf-inspect-editor-page'})
const session = new NativePageRuntimeSession({
  provide: () => undefined,
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const dataSet = shallowRef<DataSet>(), loading = ref(false), ready = ref(false), busy = ref(false), error = ref(''), pendingInput = ref(false), revision = ref(0)
let unsubscribe: (() => void) | undefined, generation = 0, active = true
const definitionKey = computed(() => buildDataViewKey(LowcodePdfInspect.catalogMetaName, 'definition', scenarioId.value))
const definition = computed(() => dataSet.value?.getView(LowcodePdfInspect.catalogMetaName, 'definition'))
const hasDefinition = computed(() => {revision.value; return definition.value?.rows.length === 1})
const missing = computed(() => ready.value && !hasDefinition.value && !queryError.value)
const queryError = computed(() => {revision.value; return definition.value?.loadingError?.message ?? ''})
const unconfirmed = computed(() => {revision.value; return definition.value?.hasUnconfirmedSave === true})
const hasPending = computed(() => {revision.value; return busy.value || pendingInput.value || unconfirmed.value || !!definition.value && (definition.value.hasEditingChanges() || definition.value.dirtyTracking.hasPendingChanges())})
function validateRule(value: unknown): void {
  if (typeof value !== 'string') throw new Error('规则配置必须是JSON文本')
  parseJsonDocument(value)
}
onBeforeRouteLeave(() => !hasPending.value)
onBeforeRouteUpdate(() => !hasPending.value)
watch([scenarioId, ruleId], async ([scene, id]) => {
  const own = ++generation
  unsubscribe?.(); dataSet.value = undefined; session.dispose()
  ready.value = false; loading.value = true; error.value = ''; pendingInput.value = false
  try {
    if (!id.trim()) throw new Error('缺少 ruleId 参数')
    const loaded = await LowcodePdfInspect.loadEditor(scene)
    if (!active || own !== generation) {loaded.destroy(); return}
    const current = session.acquire({pageId: 'pdf-inspect-editor-page', scenarioIds: [scene], targetId: id,
      scenarioInputs: {[scene]: {ruleId: id}}, loadScenario: async () => loaded})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    const view = loaded.getView(LowcodePdfInspect.catalogMetaName, 'definition')
    if (!view) throw new Error('PDF正式规则视图缺失')
    dataSet.value = loaded
    const changed = () => revision.value++
    unsubscribe = loaded.onAnyViewChange({rowsChanged: changed, editingChanged: changed, requestStateChanged: changed, mutatingChanged: changed})
    if (active && own === generation && session.isCurrent(current)) sparkProvide(PAGE_RUNTIME, current)
    await view.refresh()
    if (active && own === generation && session.isCurrent(current)) ready.value = true
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
async function save(): Promise<void> {
  if (!dataSet.value || busy.value || pendingInput.value || !hasDefinition.value) return
  const own = generation; busy.value = true; error.value = ''
  try {
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

<style scoped>
.structured-editor-page { display: grid; gap: 12px; padding: 24px; }
</style>
