<!--
@module app:views/features/data-platform/structured-config/data-code/ui/data-code-list-page
-->
<template>
  <RendererSection class="data-code-catalog" title="数据编码" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取编码目录…' : ''" :error="error">
    <template v-if="ready" #header-actions>
      <RendererButton label="新增编码" button-type="primary" icon="Plus" :disabled="catalogLocked || !selectedApplication" @click="createCode" />
      <RendererButton label="方案设计" icon="Edit" :disabled="catalogLocked || !selected" @click="openEditor" />
      <RendererButton label="刷新" icon="Refresh" :disabled="catalogLocked" @click="refreshCatalog" />
    </template>
    <template v-if="ready">
      <DisplayAlert v-if="queryError" alert-type="error" :closable="false" :show-icon="true" :title="queryError" />
      <RendererForm :data-view-key="appsKey" :show-data-view-meta="false" :auto-columns="false" :grid-columns="3" label-width="80px">
        <FieldSelect :data-view-key="appsKey" data-member="value" :option-data-view-key="appsKey" label="应用" placeholder="请选择应用" :filterable="true"
          option-value-field="rowid" option-label-field="AppDesc" :option-label-fields="['AppDesc', 'AppName']" :disabled="catalogLocked" />
      </RendererForm>
      <div :inert="catalogLocked">
        <RendererTable :data-view-key="catalogKey" :children="fields" :filter="filter" :stripe="true" :border="true"
          :on-row-click="choose" :highlight-current-row="true" :show-data-view-meta="false" />
      </div>
      <RendererDialog v-if="designTarget" :model-value="true" :title="designTarget.create ? '新增编码' : '编码方案设计'"
        :data-view-key="catalogKey" :width="960" :destroy-on-close="true" :close-disabled="designPending"
        @update:model-value="closeDesign">
        <DataCodeEditor ref="designPage" :application-id="designTarget.applicationId" :code-design-id="designTarget.codeDesignId" :create="designTarget.create" @saved="savedDesign" />
        <template #footer>
          <RendererButton v-if="designPage?.hasPending" label="放弃修改并关闭" :disabled="designPage?.busy || designPage?.unconfirmed" @click="discardDesign" />
          <RendererButton label="关闭" :disabled="designPending" @click="closeDesign(false)" />
        </template>
      </RendererDialog>
    </template>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeDataCode} from '@/lowcode/resources/structured-config/data-code/resource'

type RFilterProps = SparkComponent.RFilterProps
const {PAGE_RUNTIME, FieldSelect, RendererSection, RendererForm, RendererTable, RendererDialog, RendererButton, DisplayAlert, useSparkComponent, consumeRequiredPageService} = SparkComponent

const route = useRoute()
const {sparkProvide, sparkRemove, sparkConsume} = useSparkComponent({type: 'data-code-list-page'})
consumeRequiredPageService(sparkConsume, 'data-code-list-page')
const DataCodeEditor = defineAsyncComponent(() => import('./data-code-editor-page.vue'))
const designTarget = shallowRef<{applicationId: string; codeDesignId: string; create: boolean}>()
const designPage = ref<{hasPending: boolean; busy: boolean; unconfirmed: boolean; discardChanges: () => boolean}>()
const designPending = computed(() => designPage.value?.hasPending === true || designPage.value?.busy === true)
const session = new NativePageRuntimeSession({
  provide: current => sparkProvide(PAGE_RUNTIME, current),
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const view = shallowRef<DataView>(), loading = ref(false), ready = ref(false), error = ref(''), revision = ref(0)
let unsubscribe: (() => void) | undefined, generation = 0, active = true
const catalogLocked = computed(() => loading.value || !!designTarget.value)
const selected = computed(() => {
  revision.value
  const values = view.value?.getSelectedValues() ?? []
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
})
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const catalogKey = computed(() => buildDataViewKey(LowcodeDataCode.catalogMetaName, 'default', scenarioId.value))
const appsKey = computed(() => buildDataViewKey('Base_AppSystemList', 'default', scenarioId.value))
const selectedApplication = computed(() => {
  revision.value
  const values = session.runtime?.getDataSet(scenarioId.value)?.getView('Base_AppSystemList')?.getSelectedValues() ?? []
  return values.length === 1 && typeof values[0] === 'string' ? values[0] : ''
})
const queryError = computed(() => {
  revision.value
  const apps = session.runtime?.getDataSet(scenarioId.value)?.getView('Base_AppSystemList')
  return view.value?.loadingError?.message ?? apps?.loadingError?.message ?? ''
})
function applicationLabel(value: unknown): string {
  revision.value
  const apps = session.runtime?.getDataSet(scenarioId.value)?.getView('Base_AppSystemList')
  if (!apps || value === null || value === undefined || value === '') return ''
  const row = apps.rows.find(item => item['rowid'] === value)
  if (!row) return String(value)
  const desc = row['AppDesc'] ?? row['AppName']
  return typeof desc === 'string' && desc ? desc : String(value)
}
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'AppID', label: '应用', readonly: true, minWidth: 180, showOverflowTooltip: true,
    displayFormatter: (value: unknown) => applicationLabel(value)}},
  {type: 'r-text', props: {field: 'Name', label: '名称', readonly: true, minWidth: 220, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'CodeDescription', label: '编码描述', readonly: true, minWidth: 320, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'CodeExample', label: '编码示例', readonly: true, minWidth: 180, showOverflowTooltip: true}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', readonly: true, width: 150,
    optionDataViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId.value)}},
  {type: 'r-text', props: {field: 'createtime', label: '创建时间', readonly: true, width: 180}},
])
const filter = computed<RFilterProps>(() => ({autoFitMinWidth: '230px', children: [
  {type: 'r-text', props: {field: 'Name', label: '名称', placeholder: '按名称筛选', clearable: true}},
]}))
function choose(row: DataRow): void {
  if (catalogLocked.value) return
  view.value?.setSelectedRows([row])
}
function createCode(): void {
  if (!selectedApplication.value) return
  const id = crypto.randomUUID().replaceAll('-', '').toUpperCase()
  openDesign(id, true)
}
function openEditor(): void {
  if (selected.value) openDesign(selected.value, false)
}
function openDesign(codeDesignId: string, create: boolean): void {
  if (!selectedApplication.value || designTarget.value) return
  designTarget.value = {applicationId: selectedApplication.value, codeDesignId, create}
}
async function refreshCatalog(): Promise<void> {
  if (catalogLocked.value || !view.value) return
  try {await view.value.refresh()}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
async function closeDesign(open: boolean, discarded = false): Promise<void> {
  if (open || designPage.value?.unconfirmed || (discarded ? designPage.value?.hasPending : designPending.value)) return
  const own = generation
  designTarget.value = undefined
  try {await view.value?.refresh()}
  catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
}
async function savedDesign(): Promise<void> {await closeDesign(false)}
async function discardDesign(): Promise<void> {
  if (designPage.value?.busy || designPage.value?.unconfirmed) return
  if (designPage.value?.discardChanges() !== true) return
  await closeDesign(false, true)
}
watch(scenarioId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''
  unsubscribe?.(); view.value = undefined
  session.dispose()
  try {
    if (!id) throw new Error('编码管理入口缺少导航绑定的数据空间ID')
    const dataSet = await LowcodeDataCode.loadCatalog(id)
    if (!active || own !== generation) {dataSet.destroy(); return}
    const current = session.acquire({pageId: 'data-code-list-page', scenarioIds: [id], targetId: id,
      loadScenario: async () => dataSet})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    view.value = dataSet.getView(LowcodeDataCode.catalogMetaName, 'default')
    unsubscribe = dataSet.onAnyViewChange({selectedRowsChanged: () => revision.value++, requestStateChanged: () => revision.value++})
    if (active && own === generation && session.isCurrent(current)) ready.value = true
    dataSet.triggerAutoLoad()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); session.dispose()})
</script>

<style scoped>
.data-code-catalog {padding: 8px}
</style>