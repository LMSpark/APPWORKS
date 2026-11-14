<!--
@module app:views/features/integration/api-management/ui/interface-list/interface-edit-panel
职责：按原“接口编辑”页签恢复接口基础信息、请求参数（Params/Body/Json/Body/FormData/Header）和右侧输入参数。
边界：接口字段写当前接口行的编辑覆盖，由页面头部“保存”提交；请求头与输入参数各自经所属DataView的staged保存提交。
-->
<template>
  <div class="interface-edit">
    <RendererForm :data-view-key="INTERFACE_KEYS.interfaces" :children="baseFields" :grid-columns="6" label-width="92px" :show-data-view-meta="false" />
    <div class="interface-edit__request">
      <RendererSection class="interface-edit__params" title="请求参数" :description="REQUEST_TIP" :bordered="false" :grid-columns="1">
        <template #header-actions>
          <RendererForm :data-view-key="INTERFACE_KEYS.interfaces" :children="requestTypeField" :grid-columns="1" label-width="80px" :show-data-view-meta="false" />
        </template>
        <div class="interface-edit__tabs-bar">
          <RendererButton label="导入JSON" :disabled="workspace.locked" @click="openImport" />
        </div>
        <RendererTabs v-model="requestTab" :data-view-key="INTERFACE_KEYS.interfaces">
          <RendererTabPane name="params" label="Params" :index="0" :data-view-key="INTERFACE_KEYS.interfaces">
            <RendererForm :data-view-key="INTERFACE_KEYS.interfaces" :children="pathFields" :grid-columns="1" label-position="top" :show-data-view-meta="false" />
          </RendererTabPane>
          <RendererTabPane name="json" label="Body/Json" :index="1" :data-view-key="INTERFACE_KEYS.interfaces">
            <RendererForm v-if="requestType === 'Body'" :data-view-key="INTERFACE_KEYS.interfaces" :children="bodyJsonFields" :grid-columns="1" label-position="top" :show-data-view-meta="false" />
            <DisplayAlert v-else alert-type="info" :closable="false" title="参数类型选择 Body/Json 后维护 JSON 请求体" />
          </RendererTabPane>
          <RendererTabPane name="form" label="Body/FormData" :index="2" :data-view-key="INTERFACE_KEYS.interfaces">
            <RendererForm v-if="requestType === 'FormData'" :data-view-key="INTERFACE_KEYS.interfaces" :children="formDataFields" :grid-columns="1" label-position="top" :show-data-view-meta="false" />
            <DisplayAlert v-else alert-type="info" :closable="false" title="参数类型选择 Body/FormData 后维护表单字段" />
          </RendererTabPane>
          <RendererTabPane name="header" label="Header" :index="3" :lazy="true" :data-view-key="INTERFACE_KEYS.headers">
            <RendererForm :data-view-key="INTERFACE_KEYS.interfaces" :children="publicHeaderField" :grid-columns="1" label-width="0" :show-data-view-meta="false" />
            <RendererTable :data-view-key="INTERFACE_KEYS.headers" :children="headerColumns" :toolbar="headerToolbar" :show-pagination="false" :show-data-view-meta="false" :highlight-current-row="true" :max-height="320" />
          </RendererTabPane>
        </RendererTabs>
      </RendererSection>
      <RendererSection title="输入参数" :bordered="false" :grid-columns="1">
        <RendererTable :data-view-key="INTERFACE_KEYS.parameters" :children="parameterColumns" :toolbar="parameterToolbar" :show-pagination="false" :show-data-view-meta="false" :highlight-current-row="true" :max-height="420" />
      </RendererSection>
    </div>
    <InterfaceJsonImportDialog v-if="importing" :key="importing.epoch" :target="importing.target" @close="importing = undefined" />
  </div>
</template>
<script setup lang="ts">
import {computed, ref} from 'vue'
import type {SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import {featureTableToolbar, runFeatureTableAction, type FeatureTableAction} from '@/views/features/shared/table/feature-table-actions'
import {INTERFACE_KEYS, interfaceViewKey, type InterfaceWorkspace} from './interface-list-workspace'
import InterfaceJsonImportDialog from './interface-json-import-dialog.vue'
type RToolbarProps = SparkComponent.RToolbarProps
type JsonRow = Readonly<Record<string, unknown>>
const {PAGE_RUNTIME, PAGE_SERVICE, useSparkComponent, RendererForm, RendererSection, RendererButton, RendererTabs, RendererTabPane, RendererTable, DisplayAlert, consumeRequiredPageService} = SparkComponent
const props = defineProps<{workspace: InterfaceWorkspace; pendingCreate: boolean}>()
const {sparkConsume} = useSparkComponent({type: 'interface-edit-panel'})
const pageService = consumeRequiredPageService(sparkConsume, 'interface-edit-panel')
const runtime = sparkConsume(PAGE_RUNTIME)
const resolve = (key: string) => {
  const view = runtime?.resolveView(key)
  if (!view) throw new Error(`接口编辑缺少场景视图 ${key}`)
  return view
}
const REQUEST_TIP = '注：query: 查询参数（?key=value）；path: 路径参数（/user/{id}）；header: 请求头参数；body: 请求体参数；'
const valueFunction = {inputParameterDataViewKey: INTERFACE_KEYS.references, publicParameterDataViewKey: INTERFACE_KEYS.publicParameters, functionContext: {capabilities: ['huoshan']}}
const requestTab = ref<string | number>('params')
const importing = ref<{target: 'json' | 'form'; epoch: number}>()
let importEpoch = 0
const requestType = computed(() => {
  props.workspace.revision
  const interfaces = resolve(INTERFACE_KEYS.interfaces), row = interfaces.currentRow, id = row ? interfaces.getPkKey(row) : undefined
  return id === undefined ? '' : String(interfaces.getEditingRow(id)?.['RequestType'] ?? '')
})
const baseFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'Name', label: '名称:', placeholder: '请输入接口名称', colSpan: 2}},
  {type: 'r-select', props: {field: 'AccountName', label: '认证账号:', placeholder: '请选择认证账号', clearable: true, filterable: true, optionDataViewKey: interfaceViewKey('Base_InterfaceProvider_Account'), colSpan: 2}},
  {type: 'r-select', props: {field: 'ContentType', label: '输出类型:', placeholder: '请选择输出类型', optionDataViewKey: interfaceViewKey('ContentType'), colSpan: 2}},
  {type: 'r-select', props: {field: 'request', label: '请求类型:', placeholder: '请选择请求类型', optionDataViewKey: interfaceViewKey('request'), colSpan: 3}},
  {type: 'r-text', props: {field: 'LinkUrl', label: '请求地址:', placeholder: '请输入请求地址', colSpan: 3}},
  {type: 'r-textarea', props: {field: 'Desc', label: '描述说明:', placeholder: '请输入描述说明', autosize: {minRows: 2, maxRows: 4}, colSpan: 6}},
]
const requestTypeField: SparkNode[] = [{type: 'r-radio', props: {field: 'RequestType', label: '参数类型:', optionDataViewKey: interfaceViewKey('接口参数类型')}}]
const pathFields: SparkNode[] = [{type: 'r-json', props: {field: 'PathStr', label: '路径参数（随请求地址中的 {参数名} 同步）', mode: 'rows', rowEditMode: 'inline', rowOperations: ['edit'], emptyArrayAsEmptyText: true,
  rowsSource: {keyField: 'paramName', valueField: 'valueFun'},
  rowAdapter: {read: (original: JsonRow) => ({...original, paramType: 'path'}), write: (value: JsonRow) => ({paramName: value['paramName'], valueFun: value['valueFun'] ?? ''})},
  children: [
    {type: 'r-text', props: {field: 'paramName', label: '参数名称', readonly: true}},
    {type: 'r-text', props: {field: 'paramType', label: '参数类型', readonly: true}},
    {type: 'r-value-function', props: {field: 'valueFun', label: '值函数数值', ...valueFunction}},
  ]}}]
const bodyJsonFields: SparkNode[] = [{type: 'r-json', props: {field: 'BodyParamJsonStr', label: 'JSON 请求体', mode: 'tree', height: 360}}]
/** 原FormData行的默认值与值函数合并为一个可设置值函数的单元：值为值函数JSON时写valueFun，否则写defaultValue。 */
function isValueFunction(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return false
  try {const parsed: unknown = JSON.parse(value); return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed)} catch {return false}
}
const formDataFields: SparkNode[] = [{type: 'r-json', props: {field: 'BodyParamJsonStr', label: '表单字段', mode: 'rows', rowEditMode: 'row', emptyArrayAsEmptyText: true, rowDefaults: {fieldName: '', fieldType: 'string', value: ''},
  rowAdapter: {
    read: (original: JsonRow) => ({fieldName: original['fieldName'] ?? '', fieldType: original['fieldType'] ?? '', value: original['valueFun'] || original['defaultValue'] || ''}),
    write: (value: JsonRow) => isValueFunction(value['value'])
      ? {fieldName: value['fieldName'] ?? '', fieldType: value['fieldType'] ?? '', defaultValue: '', valueFun: value['value']}
      : {fieldName: value['fieldName'] ?? '', fieldType: value['fieldType'] ?? '', defaultValue: value['value'] ?? '', valueFun: ''},
  },
  children: [
    {type: 'r-text', props: {field: 'fieldName', label: '字段名称'}},
    {type: 'r-select', props: {field: 'fieldType', label: '类型', optionDataViewKey: INTERFACE_KEYS.paramTypes}},
    {type: 'r-value-function', props: {field: 'value', label: '默认值', ...valueFunction}},
  ]}}]
const publicHeaderField: SparkNode[] = [{type: 'r-checkbox', props: {field: 'requiresAuth', label: '', checkboxText: '使用公共Header', trueValue: 1, falseValue: 0}}]
const headerColumns: SparkNode[] = [
  {type: 'r-text', props: {field: 'ParamName', label: '参数名称', showCellControl: true}},
  {type: 'r-text', props: {field: 'ParamDesc', label: '描述', showCellControl: true}},
  {type: 'r-value-function', props: {field: 'ValueFun', label: '值函数', showCellControl: true, ...valueFunction}},
]
const parameterColumns: SparkNode[] = [
  {type: 'r-text', props: {field: 'parname', label: '名称', showCellControl: true}},
  {type: 'r-select', props: {field: 'parzdtype', label: '类型', optionDataViewKey: INTERFACE_KEYS.paramTypes, showCellControl: true}},
  {type: 'r-text', props: {field: 'pardesc', label: '描述', showCellControl: true}},
  {type: 'r-text', props: {field: 'testvalue', label: '参数测试值', showCellControl: true}},
]
function tableToolbar(key: string, order: readonly FeatureTableAction[]): RToolbarProps {
  props.workspace.revision
  return featureTableToolbar({view: resolve(key), order, locked: props.workspace.locked, addBlocked: props.pendingCreate, run: action => props.workspace.run(async () => {
    await runFeatureTableAction(resolve(key), action, pageService)
    if (action === 'save' && key === INTERFACE_KEYS.parameters) await resolve(INTERFACE_KEYS.references).refresh()
  })})
}
const headerToolbar = computed(() => tableToolbar(INTERFACE_KEYS.headers, ['add', 'remove', 'save', 'cancel']))
const parameterToolbar = computed(() => tableToolbar(INTERFACE_KEYS.parameters, ['add', 'remove', 'cancel', 'save']))
function openImport(): void {
  const tab = requestTab.value
  if (tab !== 'json' && tab !== 'form') {pageService.showMessage('当前页签暂不支持导入JSON', 'warning'); return}
  if (requestType.value !== (tab === 'json' ? 'Body' : 'FormData')) {pageService.showMessage(`请先将参数类型选择为 ${tab === 'json' ? 'Body/Json' : 'Body/FormData'}`, 'warning'); return}
  importing.value = {target: tab, epoch: ++importEpoch}
}
</script>
<style scoped>
.interface-edit {display: grid; gap: 12px;}
.interface-edit__request {display: grid; grid-template-columns: minmax(0, 3fr) minmax(320px, 2fr); gap: 16px; align-items: start;}
.interface-edit__tabs-bar {display: flex; justify-content: flex-end;}
.interface-edit__params :deep(.renderer-section-description) {color: var(--el-color-danger);}
@media (max-width: 1100px) {.interface-edit__request {grid-template-columns: minmax(0, 1fr);}}
</style>
