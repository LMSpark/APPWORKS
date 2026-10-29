<!--
@module app:views/features/integration/api-management/ui/api-interface-list-page
职责：按原接口目录/定义工作区恢复方案设计。
边界：经标准场景入口装配，providerId作为场景输入；子定义由查询级联限定，规则、当前行锁定与保存均由SPARK data承接，页面只转发事件。
AI用途：原页面结构与输入语义保留，不查询凭据、不维护调用数据、不发送HTTP。
-->
<template>
  <p v-if="loading">正在读取接口方案…</p>
  <p v-if="error && !ready" role="alert">{{ error }}</p>
  <RendererDialog v-if="ready" :data-view-key="mainKey" :model-value="true" title="接口方案设计" width="min(1400px, 96vw)" :close-disabled="busy || dirty" @update:model-value="close">
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererSection :data-view-key="mainKey" :grid-columns="1" :bordered="false" body-class="interface-workspace">
      <RendererTable :data-view-key="mainKey" :children="listFields" :toolbar="toolbar" :show-pagination="false" :show-data-view-meta="false" :on-row-click="choose" />
      <RendererSection :data-view-key="mainKey" :grid-columns="1" :bordered="false">
        <template v-if="selected">
          <RendererTabs v-model="tab" :data-view-key="mainKey">
            <RendererTabPane name="definition" label="接口定义" :index="0" :data-view-key="mainKey">
              <p>路径中的 {参数名} 由调用输入替换；查询参数与请求体定义保存后供调用使用。</p>
              <p v-if="hasLegacy" role="status">保留了历史请求配置。此处维护后端实际使用的定义，旧配置不会自动转换。</p>
              <RendererForm :data-view-key="mainKey" :children="definitionFields" grid-min-width="330px" label-width="110px" :show-data-view-meta="false" />
              <RendererForm :data-view-key="mainKey" :children="jsonFields" :grid-columns="1" label-position="top" :show-data-view-meta="false" />
              <RendererButton :data-view-key="mainKey" label="保存接口定义" button-type="primary" :disabled="locked" @click="save('Base_DataServiceInterface')" />
            </RendererTabPane>
            <RendererTabPane name="parameters" label="输入定义" :index="1" :lazy="true" :data-view-key="parameterKey">
              <p>维护参数名称、类型和标题。参数值在独立调用页面提供；已有参数名称创建后不能修改。</p>
              <RendererTable :data-view-key="parameterKey" :children="parameterList" :toolbar="parameterToolbar" :on-row-click="(row: DataRow) => point('_Base_ParamList', row)" />
              <RendererForm v-if="current('_Base_ParamList')" :data-view-key="parameterKey" :children="parameterFields" :grid-columns="1" label-width="110px" :show-data-view-meta="false" />
              <RendererButton :data-view-key="parameterKey" label="保存输入定义" :disabled="locked" @click="save('_Base_ParamList')" />
            </RendererTabPane>
            <RendererTabPane name="headers" label="接口头部" :index="2" :lazy="true" :data-view-key="headerKey">
              <RendererTable :data-view-key="headerKey" :children="headerList" :toolbar="headerToolbar" :on-row-click="(row: DataRow) => point('Base_InterfaceApi_Headers', row)" />
              <RendererForm v-if="current('Base_InterfaceApi_Headers')" :data-view-key="headerKey" :children="headerFields" :grid-columns="1" label-width="110px" :show-data-view-meta="false" />
              <RendererButton :data-view-key="headerKey" label="保存接口头部" :disabled="locked" @click="save('Base_InterfaceApi_Headers')" />
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
    <RendererButton :data-view-key="mainKey" :label="unconfirmed ? '重读核验（放弃本地修改）' : '放弃修改并重读'" :disabled="busy" @click="reload" />
    <RendererButton :data-view-key="mainKey" label="放弃修改并关闭" :disabled="locked" @click="cancel" />
  </RendererDialog>
  <RendererButton v-if="!loading && !ready" label="关闭接口方案" @click="emit('close')" />
</template>
<script setup lang="ts">
import {computed, ref, watch, onBeforeUnmount} from 'vue'
import {useRoute} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataSet, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import * as SparkComponent from '@spark-appworks/spark-component'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import type {ApiInterfaceListPageProps} from './api-interface-list-page.props'
type RToolbarProps = SparkComponent.RToolbarProps
const {PAGE_RUNTIME, useSparkComponent, RendererSection, RendererDialog, RendererTable, RendererForm, RendererButton, RendererTabs, RendererTabPane} = SparkComponent
const scenarioId = 'EC84BD89BDBDF46B1FE5132DD53836E5'
const writable = ['Base_DataServiceInterface', '_Base_ParamList', 'Base_InterfaceApi_Headers'] as const
const props = defineProps<ApiInterfaceListPageProps>()
const emit = defineEmits<{close: []}>()
const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'api-interface-list-page'})
const ready = ref(false), loading = ref(true), busy = ref(false), error = ref(''), revision = ref(0), tab = ref<string | number>('definition')
let dataSet: DataSet | undefined, runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, active = true, generation = 0
const key = (name: string, view = 'default') => buildDataViewKey(name, view, scenarioId)
const mainKey = key('Base_DataServiceInterface'), parameterKey = key('_Base_ParamList'), headerKey = key('Base_InterfaceApi_Headers'), outputKey = key('Base_TblField')
const view = (table: string): DataView | undefined => {revision.value; return dataSet?.getView(table, 'default')}
const current = (table: string) => view(table)?.currentRow ?? null
const views = computed(() => writable.flatMap(table => view(table) ?? []))
const dirty = computed(() => views.value.some(item => item.hasEditingChanges() || item.dirtyTracking.hasPendingChanges()))
const unconfirmed = computed(() => views.value.some(item => item.hasUnconfirmedSave))
const locked = computed(() => busy.value || unconfirmed.value)
const selected = computed(() => current('Base_DataServiceInterface'))
const hasLegacy = computed(() => !!selected.value?.['RequestType'] || !!selected.value?.['PathStr'])
const listFields: SparkNode[] = [{type: 'r-text', props: {field: 'Name', label: '接口名称'}}, {type: 'r-text', props: {field: 'LinkUrl', label: '路径'}}]
const parameterList: SparkNode[] = [{type: 'r-text', props: {field: 'parname', label: '参数名称'}}, {type: 'r-text', props: {field: 'pardesc', label: '参数标题'}}, {type: 'r-select', props: {field: 'parzdtype', label: '参数类型', optionDataViewKey: key('ParamType')}}]
const headerList: SparkNode[] = [{type: 'r-text', props: {field: 'ParamName', label: '头部名称'}}, {type: 'r-text', props: {field: 'ParamDesc', label: '头部说明'}}]
const outputFields: SparkNode[] = [{type: 'r-text', props: {field: 'enname', label: '输出名称', readonly: true}}, {type: 'r-text', props: {field: 'cnname', label: '输出标题', readonly: true}}, {type: 'r-text', props: {field: 'DataTypeName', label: '数据类型', readonly: true}}]
const definitionFields: SparkNode[] = [
  ...[['Name', '接口名称'], ['LinkUrl', '接口路径'], ['resultPath', '结果路径'], ['Desc', '接口说明']].map(([field, label]) => ({type: 'r-text', props: {field, label}})),
  ...[['request', '请求方法', 'request'], ['paramType', '请求体类型', '接口参数类型'], ['ContentType', '内容类型', 'ContentType']].map(([field, label, table]) => ({type: 'r-select', props: {field, label, optionDataViewKey: key(table!)}})),
  {type: 'r-select', props: {field: 'AccountName', label: '调用账号', clearable: true, optionDataViewKey: key('Base_InterfaceProvider_Account')}},
  {type: 'r-number', props: {field: 'requiresAuth', label: '使用认证头', min: 0, max: 1, step: 1, precision: 0}},
]
const jsonFields: SparkNode[] = [['GetParamStr', '查询参数方案'], ['FormDataParam', 'FormData 请求体方案'], ['BodyParamJsonStr', 'JSON 请求体方案']]
  .map(([field, label]) => ({type: 'r-json', props: {field, label, height: 210}}))
const parameterFields: SparkNode[] = [{type: 'r-text', props: {field: 'parname', label: '参数名称'}},
  {type: 'r-text', props: {field: 'pardesc', label: '参数标题'}},
  {type: 'r-select', props: {field: 'parzdtype', label: '参数类型', optionDataViewKey: key('ParamType')}}]
const headerFields: SparkNode[] = [
  ...[['ParamName', '头部名称'], ['ParamDesc', '头部说明']].map(([field, label]) => ({type: 'r-text', props: {field, label}})),
  {type: 'r-value-function', props: {field: 'ValueFun', label: '头部取值', inputParameterDataViewKey: key('_Base_ParamList', 'references'), publicParameterDataViewKey: key('Base_Interface_PublicParam'), functionContext: {capabilities: ['huoshan']}}},
]
const addButton = (table: string, label: string) => ({type: 'r-button', props: {label, permAction: 'create',
  disabled: locked.value || view(table)?.addActionState() !== 'enabled', onClick: () => add(table)}})
const toolbar = computed<RToolbarProps>(() => ({children: [addButton('Base_DataServiceInterface', '新增接口')]}))
const parameterToolbar = computed<RToolbarProps>(() => ({children: [addButton('_Base_ParamList', '新增输入定义')]}))
const headerToolbar = computed<RToolbarProps>(() => {
  const headers = view('Base_InterfaceApi_Headers'), row = current('Base_InterfaceApi_Headers')
  return {children: [addButton('Base_InterfaceApi_Headers', '新增接口头部'),
    {type: 'r-button', props: {label: '移除当前头部', disabled: locked.value || !row || !headers
      || !headers.dirtyTracking.isPendingCreate(headers.getPkKey(row)!) && headers.deleteActionState(row) !== 'enabled', onClick: removeHeader}}]}
})
useSystemPageDirtySource({get isDirty() {return loading.value || busy.value || dirty.value || unconfirmed.value}})
function changed(): void {revision.value++}
async function act(action: () => Promise<unknown> | unknown): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ''
  try {await action()} catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {busy.value = false; changed()}
}
function choose(row: DataRow): void {
  const interfaces = view('Base_DataServiceInterface')
  if (interfaces) void act(() => {interfaces.setCurrentRow(row); interfaces.setSelectedRows([row])})
}
function point(table: string, row: DataRow): void {if (!busy.value) view(table)?.setCurrentRow(row)}
async function add(table: string): Promise<void> {
  const target = view(table)
  if (target) await act(async () => {
    const row = await target.addRow({})
    target.setCurrentRow(row)
    if (table === 'Base_DataServiceInterface') target.setSelectedRows([row])
  })
}
async function removeHeader(): Promise<void> {
  const headers = view('Base_InterfaceApi_Headers'), row = current('Base_InterfaceApi_Headers')
  if (headers && row) await act(() => headers.removeRow(headers.getPkKey(row)!))
}
async function save(tableName: string): Promise<void> {
  const target = dataSet
  if (target) await act(async () => {
    const result = await target.saveChanges({views: [{tableName, viewId: 'default'}]})
    if (!result.success) throw new Error(result.message ?? '接口方案保存未完整确认')
    if (tableName === '_Base_ParamList') await target.getView(tableName, 'references')?.refresh()
  })
}
async function reload(): Promise<void> {const target = dataSet; if (target) await act(() => target.discardAndReload({views: writable.map(tableName => ({tableName, viewId: 'default'}))}))}
function close(): void {if (!busy.value && !dirty.value && !unconfirmed.value) emit('close')}
function cancel(): void {if (!locked.value) {for (const item of views.value) item.discardPendingChanges(); emit('close')}}
watch(() => props.providerId, async providerId => {
  const own = ++generation; ready.value = false; loading.value = true; busy.value = false; error.value = ''; tab.value = 'definition'
  unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; dataSet = undefined
  try {
    const projectId = parseApplicationPathScope(route.path)?.projectId ?? ''
    const next = new PageRuntime({pageId: 'api-interface-list-page', scenarioIds: [scenarioId], scenarioInputs: {[scenarioId]: {providerId}},
      loadScenario: id => loadLowcodeRuntimeScenario({projectId, scenarioId: id})})
    runtime = next; await next.load()
    if (!active || own !== generation) {next.dispose(); return}
    dataSet = next.getDataSet(scenarioId)!
    unsubscribe = dataSet.onAnyViewChange({rowsChanged: changed, currentRowChanged: changed, selectedRowsChanged: changed, editingChanged: changed, editingFieldChanged: changed, editingDiscarded: changed, requestStateChanged: changed})
    dataSet.triggerAutoLoad()
    sparkProvide(PAGE_RUNTIME, next); ready.value = true; changed()
  } catch (cause) {if (active && own === generation) error.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose()})
</script>
<style scoped>
:deep(.interface-workspace) {grid-template-columns: minmax(220px, 1fr) minmax(0, 3fr) !important; align-items: start; gap: 20px;}
@media (max-width: 850px) {:deep(.interface-workspace) {grid-template-columns: minmax(0, 1fr) !important;}}
</style>
