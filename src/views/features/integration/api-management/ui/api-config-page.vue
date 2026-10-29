<!--
@module app:views/features/integration/api-management/ui/api-config-page
职责：恢复原基础配置入口下的公共参数、公共头部与令牌前缀方案设计。
边界：经标准场景入口装配，providerId作为场景输入；规则、归属默认值、删除许可和保存均由SPARK data承接，页面只转发事件。
AI用途：三个独立提交域分别保存与取消，完整键定位正式配置空间。
-->
<template>
  <p v-if="error && !ready" role="alert">{{ error }}</p>
  <p v-if="loading">正在读取服务商请求方案…</p>
  <RendererButton v-if="!ready && !loading" label="关闭配置" @click="emit('close')" />
  <RendererDialog v-if="ready" :data-view-key="parameterKey" :model-value="true" :close-disabled="busy || dirty" title="服务商请求方案设计" width="min(980px, 94vw)" @update:model-value="close">
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererTabs v-model="tab" :data-view-key="parameterKey">
    <RendererTabPane name="parameters" label="公共参数" :index="0">
    <p>公共参数通过已配置接口取得结果字段，供请求规则引用。选择列表中的参数编辑；接口改变后需核对输出字段。</p>
    <RendererTable :data-view-key="parameterKey" :children="listFields" :toolbar="toolbar" :on-row-click="(row: DataRow) => choose('Base_Interface_PublicParam', row)" />
    <p v-if="invalidReference" role="alert">当前接口或输出字段引用失效，已保留原值，请选择有效引用后保存。</p>
    <RendererForm v-if="current('Base_Interface_PublicParam')" :data-view-key="parameterKey" :children="editorFields" grid-min-width="380px" label-width="100px" :show-data-view-meta="false" />
    <p v-else>选择一个公共参数，或新增方案定义。</p>
    <RendererButton :data-view-key="parameterKey" label="保存公共参数方案" button-type="primary" :disabled="busy || unconfirmed" @click="save('Base_Interface_PublicParam', 'default')" />
    </RendererTabPane>
    <RendererTabPane name="headers" label="公共请求头" :index="1" :lazy="true" :data-view-key="headerKey">
      <p>所有接口、认证接口等使用范围来自正式字典。值函数只定义取值规则，保存配置不会调用接口。</p>
      <RendererTable :data-view-key="headerKey" :children="headerListFields" :toolbar="headerToolbar" :on-row-click="(row: DataRow) => choose('Base_InterfaceProvider_Headers', row)" />
      <RendererForm v-if="current('Base_InterfaceProvider_Headers')" :data-view-key="headerKey" :children="headerFields" grid-min-width="380px" label-width="100px" :show-data-view-meta="false" />
      <RendererButton :data-view-key="headerKey" label="保存公共请求头" button-type="primary" :disabled="busy || unconfirmed" @click="save('Base_InterfaceProvider_Headers', 'default')" />
      <RendererForm :data-view-key="prefixKey" :children="prefixFields" :grid-columns="1" label-width="100px" :show-data-view-meta="false" />
      <p>前缀直接拼接到令牌；例如 Bearer 后的空格会原样保存。</p>
      <RendererButton :data-view-key="prefixKey" label="保存令牌前缀" :disabled="busy || unconfirmed" @click="save('Base_InterfaceProvider', 'authentication')" />
    </RendererTabPane>
    </RendererTabs>
    <RendererButton :data-view-key="parameterKey" :label="unconfirmed ? '重读核验（放弃本地修改）' : '放弃修改并重读'" :disabled="busy" @click="reload" />
    <RendererButton :data-view-key="parameterKey" label="放弃修改并关闭" :disabled="busy || unconfirmed" @click="cancel" />
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type DataSet, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import * as SparkComponent from '@spark-appworks/spark-component'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import type {ApiConfigPageProps} from './api-config-page.props'

type RToolbarProps = SparkComponent.RToolbarProps
const {PAGE_RUNTIME, RendererTable, RendererForm, RendererDialog, RendererButton, RendererTabs, RendererTabPane, useSparkComponent} = SparkComponent

const scenarioId = '446B5D94A71587E9BD4D325A4DF5F6F8'
const writable = [['Base_Interface_PublicParam', 'default'], ['Base_InterfaceProvider_Headers', 'default'], ['Base_InterfaceProvider', 'authentication']] as const
const props = defineProps<ApiConfigPageProps>()
const emit = defineEmits<{close: []}>()
const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'api-config-page'})
const ready = ref(false), loading = ref(true), busy = ref(false), error = ref(''), revision = ref(0), tab = ref<string | number>('parameters')
let dataSet: DataSet | undefined, runtime: PageRuntime | undefined, generation = 0, active = true
let unsubscribe: (() => void) | undefined, unsubscribeCascade: (() => void) | undefined
const key = (table: string, viewId = 'default') => buildDataViewKey(table, viewId, scenarioId)
const parameterKey = key('Base_Interface_PublicParam'), headerKey = key('Base_InterfaceProvider_Headers'), prefixKey = key('Base_InterfaceProvider', 'authentication')
const view = (table: string, viewId = 'default'): DataView | undefined => {revision.value; return dataSet?.getView(table, viewId)}
const current = (table: string) => view(table)?.currentRow ?? null
const views = computed(() => writable.flatMap(([table, viewId]) => view(table, viewId) ?? []))
const dirty = computed(() => views.value.some(item => item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges()))
const unconfirmed = computed(() => views.value.some(item => item.hasUnconfirmedSave))
const invalidReference = computed(() => {revision.value; return !!current('Base_Interface_PublicParam') && ['interfaceId', 'outputfield'].some(field =>
  !!current('Base_Interface_PublicParam')?.[field]
  && dataSet?.getFieldCascadeState({tableName: 'Base_Interface_PublicParam', viewId: 'default', field}).valueStatus === 'invalid')})
const listFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'paramName', label: '参数名称'}},
  {type: 'r-text', props: {field: 'desc', label: '参数描述'}},
  {type: 'r-text', props: {field: 'outputfield', label: '输出字段'}},
]
const editorFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'paramName', label: '参数名称'}},
  {type: 'r-text', props: {field: 'desc', label: '参数描述'}},
  {type: 'r-select', props: {field: 'interfaceId', label: '取值接口', filterable: true, optionDataViewKey: key('Base_DataServiceInterface')}},
  {type: 'r-select', props: {field: 'outputfield', label: '输出字段', filterable: true, optionDataViewKey: key('Base_TblField')}},
]
const headerTypeKey = key('接口公共头部信息使用类型')
const headerListFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'paramName', label: '头部名称'}},
  {type: 'r-value-function', props: {field: 'paramValue', label: '值函数'}},
  {type: 'r-select', props: {field: 'type', label: '使用范围', optionDataViewKey: headerTypeKey}},
]
const headerFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'paramName', label: '头部名称'}},
  {type: 'r-select', props: {field: 'type', label: '使用范围', optionDataViewKey: headerTypeKey}},
  {type: 'r-value-function', props: {field: 'paramValue', label: '值函数',
    publicParameterDataViewKey: key('Base_Interface_PublicParam', 'references'), functionContext: {capabilities: ['huoshan']}}},
]
const prefixFields: SparkNode[] = [{type: 'r-text', props: {field: 'TokenPrefix', label: '令牌前缀'}}]
const toolbar = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '新增公共参数', permAction: 'create', disabled: busy.value || unconfirmed.value
    || view('Base_Interface_PublicParam')?.addActionState() !== 'enabled', onClick: () => add('Base_Interface_PublicParam')}},
]}))
const headerToolbar = computed<RToolbarProps>(() => {
  const headers = view('Base_InterfaceProvider_Headers'), row = current('Base_InterfaceProvider_Headers')
  return {children: [
    {type: 'r-button', props: {label: '新增公共头部', permAction: 'create', disabled: busy.value || unconfirmed.value
      || headers?.addActionState() !== 'enabled', onClick: () => add('Base_InterfaceProvider_Headers')}},
    {type: 'r-button', props: {label: '移除当前头部', disabled: busy.value || unconfirmed.value || !row || !headers
      || !headers.dirtyTracking.isPendingCreate(headers.getPkKey(row)!) && headers.deleteActionState(row) !== 'enabled', onClick: removeHeader}},
  ]}
})
useSystemPageDirtySource({get isDirty() {return loading.value || busy.value || dirty.value || unconfirmed.value}})
function changed(): void {revision.value++}
function choose(table: string, row: DataRow): void {if (!busy.value) view(table)?.setCurrentRow(row)}
async function act(action: () => Promise<unknown>): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {await action()} catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {busy.value = false; changed()}
}
async function add(table: string): Promise<void> {const target = view(table); if (target) await act(async () => target.setCurrentRow(await target.addRow({})))}
async function removeHeader(): Promise<void> {
  const headers = view('Base_InterfaceProvider_Headers'), row = current('Base_InterfaceProvider_Headers')
  if (headers && row) await act(() => headers.removeRow(headers.getPkKey(row)!))
}
async function save(tableName: string, viewId: string): Promise<void> {
  const target = dataSet
  if (target) await act(async () => {
    const result = await target.saveChanges({views: [{tableName, viewId}]})
    if (!result.success) throw new Error(result.message ?? '方案保存未完整确认')
    if (tableName === 'Base_Interface_PublicParam') await target.getView(tableName, 'references')?.refresh()
  })
}
async function reload(): Promise<void> {const target = dataSet; if (target) await act(() => target.discardAndReload({views: writable.map(([tableName, viewId]) => ({tableName, viewId}))}))}
function close(): void {if (!busy.value && !dirty.value && !unconfirmed.value) emit('close')}
function cancel(): void {if (!busy.value && !unconfirmed.value) {for (const item of views.value) item.discardPendingChanges(); emit('close')}}
watch(() => props.providerId, async providerId => {
  const own = ++generation
  ready.value = false; loading.value = true; busy.value = false; error.value = ''; tab.value = 'parameters'
  unsubscribe?.(); unsubscribeCascade?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; dataSet = undefined
  try {
    const projectId = parseApplicationPathScope(route.path)?.projectId ?? ''
    const next = new PageRuntime({pageId: 'api-config-page', scenarioIds: [scenarioId], scenarioInputs: {[scenarioId]: {providerId}},
      loadScenario: id => loadLowcodeRuntimeScenario({projectId, scenarioId: id})})
    runtime = next; await next.load()
    if (!active || own !== generation) {next.dispose(); return}
    dataSet = next.getDataSet(scenarioId)!
    unsubscribe = dataSet.onAnyViewChange({rowsChanged: changed, currentRowChanged: changed, editingChanged: changed,
      editingFieldChanged: changed, editingDiscarded: changed, requestStateChanged: changed})
    unsubscribeCascade = dataSet.onFieldCascadeChange(changed)
    dataSet.triggerAutoLoad()
    sparkProvide(PAGE_RUNTIME, next); ready.value = true; changed()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); unsubscribeCascade?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>
