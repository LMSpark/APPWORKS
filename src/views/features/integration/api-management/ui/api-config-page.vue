<!--
@module app:views/features/integration/api-management/ui/api-config-page
职责：恢复原基础配置入口下的公共参数、公共头部与令牌前缀方案设计。
边界：列表/表单直接绑定同一DataView，选项由值级联提供，不含账号值或接口调用。
AI用途：独立方案保存与取消，完整键定位正式配置空间。
-->
<template>
  <p v-if="error && !ready" role="alert">{{ error }}</p>
  <p v-if="loading">正在读取服务商请求方案…</p>
  <RendererButton v-if="!ready && !loading" label="关闭配置" @click="emit('close')" />
  <RendererDialog v-if="ready && owner && headerOwner" :data-view-key="parameterKey" :model-value="true" :close-disabled="busy || pending" title="服务商请求方案设计" width="min(980px, 94vw)" @update:model-value="close">
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererTabs v-model="tab" :data-view-key="parameterKey">
    <RendererTabPane name="parameters" label="公共参数" :index="0">
    <p>公共参数通过已配置接口取得结果字段，供请求规则引用。选择列表中的参数编辑；接口改变后需核对输出字段。</p>
    <RendererTable :data-view-key="parameterKey" :children="listFields" :toolbar="toolbar" :on-row-click="choose" />
    <p v-if="invalidReference" role="alert">当前接口或输出字段引用失效，已保留原值，请选择有效引用后保存。</p>
    <RendererForm v-if="selected" :data-view-key="parameterKey" :children="editorFields" grid-min-width="380px" label-width="100px" :show-data-view-meta="false" />
    <p v-else>选择一个公共参数，或新增方案定义。</p>
    <RendererButton :data-view-key="parameterKey" label="保存公共参数方案" button-type="primary" :disabled="busy || uncertain" @click="save" />
    </RendererTabPane>
    <RendererTabPane name="headers" label="公共请求头" :index="1" :lazy="true" :data-view-key="headerKey">
      <p>所有接口、认证接口等使用范围来自正式字典。值函数只定义取值规则，保存配置不会调用接口。</p>
      <RendererTable :data-view-key="headerKey" :children="headerListFields" :toolbar="headerToolbar" :on-row-click="chooseHeader" />
      <RendererForm v-if="selectedHeader" :data-view-key="headerKey" :children="headerFields" grid-min-width="380px" label-width="100px" :show-data-view-meta="false" />
      <RendererButton :data-view-key="headerKey" label="保存公共请求头" button-type="primary" :disabled="busy || uncertain" @click="saveHeaders" />
      <RendererForm :data-view-key="prefixKey" :children="prefixFields" :grid-columns="1" label-width="100px" :show-data-view-meta="false" />
      <p>前缀直接拼接到令牌；例如 Bearer 后的空格会原样保存。</p>
      <RendererButton :data-view-key="prefixKey" label="保存令牌前缀" :disabled="busy || uncertain" @click="savePrefix" />
    </RendererTabPane>
    </RendererTabs>
    <RendererButton :data-view-key="parameterKey" :label="uncertain ? '重读核验（放弃本地修改）' : '放弃修改并重读'" :disabled="busy" @click="reload" />
    <RendererButton :data-view-key="parameterKey" label="放弃修改并关闭" :disabled="busy || uncertain" @click="cancel" />
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataRow, type DataSet, type SparkNode} from '@spark-appworks/spark-data'
import {ApiPublicParameterDesign, ApiRequestHeaderDesign} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererForm, RendererDialog, RendererButton, RendererTabs, RendererTabPane, useSparkComponent, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeApiProvider} from '@/lowcode/resources/external-api/lowcode-api-provider'
import {LowcodeDictionary} from '@/lowcode/resources/dictionary/lowcode-dictionary'
import type {ApiConfigPageProps} from './api-config-page.props'

const props = defineProps<ApiConfigPageProps>()
const emit = defineEmits<{close: []}>()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'api-config-page'})
const ready = ref(false), loading = ref(true), busy = ref(false), error = ref(''), revision = ref(0)
const owner = shallowRef<ApiPublicParameterDesign>()
const headerOwner = shallowRef<ApiRequestHeaderDesign>(), tab = ref<string | number>('parameters')
let dataSet: DataSet | undefined, runtime: PageRuntime | undefined, generation = 0, active = true
let unsubscribe: (() => void) | undefined, unsubscribeCascade: (() => void) | undefined
const scenarioId = LowcodeApiProvider.configurationScenarioId
const parameterKey = buildDataViewKey('Base_Interface_PublicParam', 'default', scenarioId)
const headerKey = buildDataViewKey('Base_InterfaceProvider_Headers', 'default', scenarioId)
const prefixKey = buildDataViewKey('Base_InterfaceProvider', 'authentication', scenarioId)
const pending = computed(() => {revision.value; return owner.value?.pending === true || headerOwner.value?.pending === true})
const uncertain = computed(() => {revision.value; return owner.value?.requiresVerification === true || headerOwner.value?.requiresVerification === true})
const selected = computed(() => {revision.value; const view = owner.value?.parameters; return view?.currentRow ? view.getPkKey(view.currentRow) : undefined})
const invalidReference = computed(() => {revision.value; const id = selected.value; return id !== undefined && ['interfaceId', 'outputfield'].some(field =>
  !!owner.value?.parameters.getEditingRow(id)?.[field]
  && dataSet?.getFieldCascadeState({tableName: 'Base_Interface_PublicParam', viewId: 'default', field}).valueStatus === 'invalid')})
const listFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'paramName', label: '参数名称'}},
  {type: 'r-text', props: {field: 'desc', label: '参数描述'}},
  {type: 'r-text', props: {field: 'outputfield', label: '输出字段'}},
]
const editorFields = computed<SparkNode[]>(() => {
  const locked = busy.value || uncertain.value
  const created = selected.value !== undefined && owner.value?.parameters.dirtyTracking.pendingCreateIds.has(selected.value)
  return [
    {type: 'r-text', props: {field: 'paramName', label: '参数名称', readonly: locked || !created}},
    {type: 'r-text', props: {field: 'desc', label: '参数描述', readonly: locked}},
    {type: 'r-select', props: {field: 'interfaceId', label: '取值接口', readonly: locked, filterable: true,
      optionDataViewKey: buildDataViewKey('Base_DataServiceInterface', 'default', scenarioId)}},
    {type: 'r-select', props: {field: 'outputfield', label: '输出字段', readonly: locked, filterable: true,
      optionDataViewKey: buildDataViewKey('Base_TblField', 'default', scenarioId)}},
  ]
})
const toolbar = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '新增公共参数', permAction: 'create', disabled: busy.value || uncertain.value, onClick: add}},
]}))
const selectedHeader = computed(() => {revision.value; return headerOwner.value?.headers.currentRow})
const headerListFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'paramName', label: '头部名称'}},
  {type: 'r-value-function', props: {field: 'paramValue', label: '值函数'}},
  {type: 'r-select', props: {field: 'type', label: '使用范围', optionDataViewKey: buildDataViewKey('_Base_DictData', 'default', LowcodeDictionary.editorScenarioId)}},
]
const headerFields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {field: 'paramName', label: '头部名称', readonly: busy.value || uncertain.value}},
  {type: 'r-select', props: {field: 'type', label: '使用范围', readonly: busy.value || uncertain.value,
    optionDataViewKey: buildDataViewKey('_Base_DictData', 'default', LowcodeDictionary.editorScenarioId)}},
  {type: 'r-value-function', props: {field: 'paramValue', label: '值函数', readonly: busy.value || uncertain.value,
    publicParameterDataViewKey: buildDataViewKey('Base_Interface_PublicParam', 'references', scenarioId), functionContext: {capabilities: ['huoshan']}}},
])
const prefixFields = computed<SparkNode[]>(() => [{type: 'r-text', props: {field: 'TokenPrefix', label: '令牌前缀', readonly: busy.value || uncertain.value}}])
const headerToolbar = computed<RToolbarProps>(() => {
  revision.value
  const view = headerOwner.value?.headers, row = selectedHeader.value, id = row && view?.getPkKey(row)
  const canRemove = row && view && id !== undefined && id !== null && (view.dirtyTracking.pendingCreateIds.has(id) || view.deleteActionState(row) === 'enabled')
  return {children: [
    {type: 'r-button', props: {label: '新增公共头部', permAction: 'create', disabled: busy.value || uncertain.value, onClick: addHeader}},
    {type: 'r-button', props: {label: '移除当前头部', disabled: busy.value || uncertain.value || !canRemove, onClick: removeHeader}},
  ]}
})
useSystemPageDirtySource({get isDirty() {return loading.value || busy.value || pending.value}})
function changed(): void {revision.value++}
function choose(row: DataRow): void {if (!busy.value) {owner.value?.parameters.setCurrentRow(row); owner.value?.parameters.setSelectedRows([row])}}
function chooseHeader(row: DataRow): void {if (!busy.value) {headerOwner.value?.headers.setCurrentRow(row); headerOwner.value?.headers.setSelectedRows([row])}}
async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value || !active) return
  const own = generation
  busy.value = true; error.value = ''; changed()
  try {await action()} catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) {busy.value = false; changed()}}
}
async function add(): Promise<void> {const current = owner.value; if (current) await run(() => current.add())}
async function save(): Promise<void> {const current = owner.value, headers = headerOwner.value; if (current) await run(async () => {await current.save(); if (headers) {await headers.references.refresh(); if (headers.references.loadingError) throw headers.references.loadingError}})}
async function reload(): Promise<void> {const current = owner.value, headers = headerOwner.value; if (current && headers) await run(async () => {await current.load(true); await headers.load(true)})}
async function addHeader(): Promise<void> {const current = headerOwner.value; if (current) await run(() => current.addHeader())}
async function removeHeader(): Promise<void> {const current = headerOwner.value; if (current) await run(() => current.removeHeader())}
async function saveHeaders(): Promise<void> {const current = headerOwner.value; if (current) await run(() => current.saveHeaders())}
async function savePrefix(): Promise<void> {const current = headerOwner.value; if (current) await run(() => current.savePrefix())}
function close(): void {if (!busy.value && !pending.value) emit('close')}
function cancel(): void {if (!busy.value && !uncertain.value) {owner.value?.discard(); headerOwner.value?.discard(); emit('close')}}
watch(() => props.providerId, async id => {
  const own = ++generation
  ready.value = false; loading.value = true; busy.value = false; error.value = ''; owner.value = undefined; headerOwner.value = undefined; tab.value = 'parameters'
  unsubscribe?.(); unsubscribeCascade?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; dataSet = undefined
  try {
    const loaded = await LowcodeApiProvider.loadConfiguration()
    if (!active || own !== generation) {loaded.destroy(); return}
    let dictionary: DataSet
    try {dictionary = await LowcodeApiProvider.loadHeaderTypes()} catch (cause) {loaded.destroy(); throw cause}
    if (!active || own !== generation) {loaded.destroy(); dictionary.destroy(); return}
    dataSet = loaded
    const current = new PageRuntime({pageId: 'api-config-page', scenarioIds: [scenarioId, LowcodeDictionary.editorScenarioId], loadScenario: async key => {
      if (key === scenarioId) return loaded
      if (key === LowcodeDictionary.editorScenarioId) return dictionary
      throw new Error('请求方案数据空间身份不匹配')
    }})
    runtime = current; await current.load()
    if (!active || own !== generation) {current.dispose(); return}
    const design = new ApiPublicParameterDesign({dataSet: loaded, providerId: id})
    const headers = new ApiRequestHeaderDesign({dataSet: loaded, providerId: id, headerTypes: dictionary.getView('_Base_DictData')!})
    owner.value = design
    headerOwner.value = headers
    unsubscribe = loaded.onAnyViewChange({rowsChanged: changed, currentRowChanged: changed, editingChanged: changed,
      editingFieldChanged: changed, editingDiscarded: changed, requestStateChanged: changed})
    unsubscribeCascade = loaded.onFieldCascadeChange(changed)
    await design.load()
    await headers.load()
    if (!active || own !== generation) return
    sparkProvide(PAGE_RUNTIME, current); ready.value = true; changed()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); unsubscribeCascade?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>
