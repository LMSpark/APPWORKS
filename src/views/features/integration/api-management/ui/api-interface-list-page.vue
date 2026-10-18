<!--
@module app:views/features/integration/api-management/ui/api-interface-list-page
职责：按原接口目录/定义工作区恢复方案设计。
边界：标准组件直接绑定正式DataView；不查询凭据、不维护调用数据、不发送HTTP。
AI用途：原页面结构与输入语义保留，数据约束交由ApiInterfaceDesign。
-->
<template>
  <p v-if="loading">正在读取接口方案…</p>
  <p v-if="error" role="alert">{{ error }}</p>
  <RendererDialog v-if="ready" :data-view-key="mainKey" :model-value="true" title="接口方案设计" width="min(1400px, 96vw)" :close-disabled="busy || pending" @update:model-value="close">
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererSection :data-view-key="mainKey" :grid-columns="1" :bordered="false" body-class="interface-workspace">
      <RendererTable :data-view-key="mainKey" :children="listFields" :toolbar="toolbar" :show-pagination="false" :show-data-view-meta="false"
        :on-row-click="choose" :on-current-change="keepPointer" :on-selection-change="keepSelection" />
      <RendererSection :data-view-key="mainKey" :grid-columns="1" :bordered="false">
        <template v-if="selected">
          <RendererTabs v-model="tab" :data-view-key="mainKey">
            <RendererTabPane name="definition" label="接口定义" :index="0" :data-view-key="mainKey">
              <p>路径中的 {参数名} 由调用输入替换；查询参数与请求体定义保存后供调用使用。</p>
              <p v-if="hasLegacy" role="status">保留了历史请求配置。此处维护后端实际使用的定义，旧配置不会自动转换。</p>
              <RendererForm :data-view-key="mainKey" :children="definitionFields" grid-min-width="330px" label-width="110px" :show-data-view-meta="false" />
              <RendererForm :data-view-key="mainKey" :children="jsonFields" :grid-columns="1" label-position="top" :show-data-view-meta="false" />
              <RendererButton :data-view-key="mainKey" label="保存接口定义" button-type="primary" :disabled="locked" @click="save('definition')" />
            </RendererTabPane>
            <RendererTabPane name="parameters" label="输入定义" :index="1" :lazy="true" :data-view-key="parameterKey">
              <p>维护参数名称、类型和标题。参数值在独立调用页面提供；已有参数重命名须先核完整引用。</p>
              <RendererTable :data-view-key="parameterKey" :children="parameterList" :toolbar="parameterToolbar" :on-row-click="chooseParameter" />
              <RendererForm v-if="parameterSelected" :data-view-key="parameterKey" :children="parameterFields" :grid-columns="1" label-width="110px" :show-data-view-meta="false" />
              <RendererButton :data-view-key="parameterKey" label="保存输入定义" :disabled="locked" @click="save('parameters')" />
            </RendererTabPane>
            <RendererTabPane name="headers" label="接口头部" :index="2" :lazy="true" :data-view-key="headerKey">
              <RendererTable :data-view-key="headerKey" :children="headerList" :toolbar="headerToolbar" :on-row-click="chooseHeader" />
              <RendererForm v-if="headerSelected" :data-view-key="headerKey" :children="headerFields" :grid-columns="1" label-width="110px" :show-data-view-meta="false" />
              <RendererButton :data-view-key="headerKey" label="保存接口头部" :disabled="locked" @click="save('headers')" />
            </RendererTabPane>
            <RendererTabPane name="outputs" label="输出定义" :index="3" :lazy="true" :data-view-key="outputKey">
              <p>当前正式输出定义。字段类型和主键的完整元数据写入合同尚待补齐，此区暂只读。</p>
              <RendererTable :data-view-key="outputKey" :children="outputFields" />
            </RendererTabPane>
          </RendererTabs>
        </template>
        <p v-else>从左侧选择接口，或新增接口定义。</p>
      </RendererSection>
    </RendererSection>
    <RendererButton :data-view-key="mainKey" :label="uncertain ? '重读核验（放弃本地修改）' : '放弃修改并重读'" :disabled="busy" @click="reload" />
    <RendererButton :data-view-key="mainKey" label="放弃修改并关闭" :disabled="locked" @click="cancel" />
  </RendererDialog>
  <RendererButton v-if="!loading && !ready" label="关闭接口方案" @click="emit('close')" />
</template>
<script setup lang="ts">
import {computed, ref, shallowRef, watch, onBeforeUnmount} from 'vue'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataSet, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {ApiInterfaceDesign} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, useSparkComponent, RendererSection, RendererDialog, RendererTable, RendererForm, RendererButton, RendererTabs, RendererTabPane, type RToolbarProps, type RTableProps} from '@spark-appworks/spark-component'
import {LowcodeApiProvider} from '@/lowcode/resources/external-api/lowcode-api-provider'
import type {ApiInterfaceListPageProps} from './api-interface-list-page.props'
const props = defineProps<ApiInterfaceListPageProps>()
const emit = defineEmits<{close: []}>()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'api-interface-list-page'})
const ready = ref(false), loading = ref(true), busy = ref(false), error = ref(''), revision = ref(0), tab = ref<string | number>('definition')
const owner = shallowRef<ApiInterfaceDesign>()
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, active = true, generation = 0
const key = (name: string, view = 'default') => buildDataViewKey(name, view, LowcodeApiProvider.interfaceScenarioId)
const mainKey = key('Base_DataServiceInterface'), parameterKey = key('_Base_ParamList'), headerKey = key('Base_InterfaceApi_Headers'), outputKey = key('Base_TblField')
const pending = computed(() => {revision.value; return owner.value?.pending === true})
const uncertain = computed(() => {revision.value; return owner.value?.requiresVerification === true})
const locked = computed(() => busy.value || uncertain.value)
const selected = computed(() => {revision.value; return owner.value?.interfaces.currentRow})
const parameterSelected = computed(() => {revision.value; return owner.value?.parameters.currentRow})
const headerSelected = computed(() => {revision.value; return owner.value?.headers.currentRow})
const hasLegacy = computed(() => !!selected.value?.['RequestType'] || !!selected.value?.['PathStr'])
const listFields: SparkNode[] = [{type: 'r-text', props: {field: 'Name', label: '接口名称'}}, {type: 'r-text', props: {field: 'LinkUrl', label: '路径'}}]
const parameterList: SparkNode[] = [{type: 'r-text', props: {field: 'parname', label: '参数名称'}}, {type: 'r-text', props: {field: 'pardesc', label: '参数标题'}}, {type: 'r-select', props: {field: 'parzdtype', label: '参数类型', optionDataViewKey: key('ParamType')}}]
const headerList: SparkNode[] = [{type: 'r-text', props: {field: 'ParamName', label: '头部名称'}}, {type: 'r-text', props: {field: 'ParamDesc', label: '头部说明'}}]
const outputFields: SparkNode[] = [{type: 'r-text', props: {field: 'enname', label: '输出名称', readonly: true}}, {type: 'r-text', props: {field: 'cnname', label: '输出标题', readonly: true}}, {type: 'r-text', props: {field: 'DataTypeName', label: '数据类型', readonly: true}}]
const definitionFields = computed<SparkNode[]>(() => [
  ...[['Name', '接口名称'], ['LinkUrl', '接口路径'], ['resultPath', '结果路径'], ['Desc', '接口说明']].map(([field, label]) => ({type: 'r-text', props: {field, label, readonly: locked.value}})),
  ...[['request', '请求方法', 'request'], ['paramType', '请求体类型', '接口参数类型'], ['ContentType', '内容类型', 'ContentType']].map(([field, label, table]) => ({type: 'r-select', props: {field, label, readonly: locked.value, optionDataViewKey: table ? key(table) : undefined}})),
  {type: 'r-select', props: {field: 'AccountName', label: '调用账号', readonly: locked.value, clearable: true, optionDataViewKey: buildDataViewKey('Base_InterfaceProvider_Account', 'default', LowcodeApiProvider.configurationScenarioId)}},
  {type: 'r-number', props: {field: 'requiresAuth', label: '使用认证头', min: 0, max: 1, step: 1, precision: 0, readonly: locked.value}},
])
const jsonFields = computed<SparkNode[]>(() => [
  ['GetParamStr', '查询参数方案'], ['FormDataParam', 'FormData 请求体方案'], ['BodyParamJsonStr', 'JSON 请求体方案'],
].map(([field, label]) => ({type: 'r-json', props: {field, label, readonly: locked.value, height: 210}})))
const parameterFields = computed<SparkNode[]>(() => {
  const view = owner.value?.parameters, row = parameterSelected.value, id = row && view?.getPkKey(row)
  const created = id !== undefined && id !== null && view?.dirtyTracking.pendingCreateIds.has(id)
  return [{type: 'r-text', props: {field: 'parname', label: '参数名称', readonly: locked.value || !created}},
    {type: 'r-text', props: {field: 'pardesc', label: '参数标题', readonly: locked.value}},
    {type: 'r-select', props: {field: 'parzdtype', label: '参数类型', readonly: locked.value, optionDataViewKey: key('ParamType')}}]
})
const headerFields = computed<SparkNode[]>(() => [
  ...[['ParamName', '头部名称'], ['ParamDesc', '头部说明']].map(([field, label]) => ({type: 'r-text', props: {field, label, readonly: locked.value}})),
  {type: 'r-value-function', props: {field: 'ValueFun', label: '头部取值', readonly: locked.value, inputParameterDataViewKey: key('_Base_ParamList', 'references'), publicParameterDataViewKey: key('Base_Interface_PublicParam'), functionContext: {capabilities: ['huoshan']}}},
])
const toolbar = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {label: '新增接口', permAction: 'create', disabled: locked.value || pending.value, onClick: addInterface}}]}))
const parameterToolbar = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {label: '新增输入定义', permAction: 'create', disabled: locked.value, onClick: () => add('parameters')}}]}))
const headerToolbar = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '新增接口头部', permAction: 'create', disabled: locked.value, onClick: () => add('headers')}},
  {type: 'r-button', props: {label: '移除当前头部', disabled: locked.value || !headerSelected.value, onClick: removeHeader}},
]}))
useSystemPageDirtySource({get isDirty() {return loading.value || busy.value || pending.value}})
function changed(): void {revision.value++}
async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value || !active) return
  const own = generation; busy.value = true; error.value = ''; changed()
  try {await action()} catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) {busy.value = false; changed()}}
}
const keepPointer: NonNullable<RTableProps['onCurrentChange']> = (_row, _old, control) => {control.cancel = true}
const keepSelection: NonNullable<RTableProps['onSelectionChange']> = (_rows, control) => {control.cancel = true}
const choose: NonNullable<RTableProps['onRowClick']> = async (row, _column, _event, control) => {
  control.cancel = true
  const design = owner.value, id = design?.interfaces.getPkKey(row)
  if (design && typeof id === 'string') await run(() => design.select(id))
}
function chooseParameter(row: DataRow): void {if (!locked.value) owner.value?.parameters.setCurrentRow(row)}
function chooseHeader(row: DataRow): void {if (!locked.value) owner.value?.headers.setCurrentRow(row)}
async function addInterface(): Promise<void> {const design = owner.value; if (design) await run(() => design.addInterface())}
async function add(section: 'parameters' | 'headers'): Promise<void> {const design = owner.value; if (design) await run(() => design.add(section))}
async function save(section: 'definition' | 'parameters' | 'headers'): Promise<void> {const design = owner.value; if (design) await run(() => design.save(section))}
async function removeHeader(): Promise<void> {const design = owner.value; if (design) await run(() => design.removeHeader())}
async function reload(): Promise<void> {const design = owner.value; if (design) await run(() => design.load(true))}
function close(): void {if (!busy.value && !pending.value) emit('close')}
function cancel(): void {if (!locked.value) {owner.value?.discard(); emit('close')}}
watch(() => props.providerId, async id => {
  const own = ++generation; ready.value = false; loading.value = true; busy.value = false; error.value = ''; owner.value = undefined; tab.value = 'definition'
  unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  let loaded: DataSet | undefined, context: DataSet | undefined
  try {
    loaded = await LowcodeApiProvider.loadInterfaces()
    if (!active || own !== generation) {loaded.destroy(); return}
    context = await LowcodeApiProvider.loadInterfaceContext()
    if (!active || own !== generation) {loaded.destroy(); context.destroy(); return}
    const dataSet = loaded, references = context
    if (!dataSet.scenarioId || !references.scenarioId) throw new Error('接口方案数据空间身份缺失')
    const current = new PageRuntime({pageId: 'api-interface-list-page', scenarioIds: [dataSet.scenarioId, references.scenarioId], loadScenario: async key => {
      if (key === dataSet.scenarioId) return dataSet
      if (key === references.scenarioId) return references
      throw new Error('接口方案数据空间身份不匹配')
    }})
    runtime = current; await current.load()
    if (!active || own !== generation) {current.dispose(); return}
    const design = new ApiInterfaceDesign({dataSet, context: references, providerId: id}); owner.value = design
    unsubscribe = dataSet.onAnyViewChange({rowsChanged: changed, currentRowChanged: changed, selectedRowsChanged: changed, editingChanged: changed, editingFieldChanged: changed, editingDiscarded: changed, requestStateChanged: changed})
    await design.load()
    if (!active || own !== generation) return
    sparkProvide(PAGE_RUNTIME, current); ready.value = true; changed()
  } catch (cause) {loaded?.destroy(); context?.destroy(); if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>
<style scoped>
:deep(.interface-workspace) {grid-template-columns: minmax(220px, 1fr) minmax(0, 3fr) !important; align-items: start; gap: 20px;}
@media (max-width: 850px) {:deep(.interface-workspace) {grid-template-columns: minmax(0, 1fr) !important;}}
</style>
