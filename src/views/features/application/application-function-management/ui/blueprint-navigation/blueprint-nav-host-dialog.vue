<!--
@module app:views/features/application/application-function-management/ui/blueprint-navigation/blueprint-nav-host-dialog
职责：导航配置页签的“导航宿主”列表、新增/编辑导航宿主对话框（数据来源→字段映射→参数处理方式）、删除确认与数据空间设计入口。
边界：列表与表单绑定 7AB 场景 byNode 视图；数据空间候选来自列 optionsView 所指视图，资源与三个字段映射由场景字段级联提供候选，
  资源类型由列 fill 回填；参数处理方式按 JSON 文本列的 type/name 子键编辑；只有显式“确定”才删除；结果未知时对话框不能关闭或放弃。
AI用途：调整宿主列表列或表单分组时只改本组件；业务动作在 use-blueprint-nav-host。
-->
<template>
  <section class="blueprint-nav-host">
    <div class="blueprint-nav-host__toolbar">
      <h3>导航宿主</h3>
      <RendererButton label="新增" button-type="primary" :disabled="!host.view.value || host.busy.value || host.loading.value || !host.canCreate.value" @click="host.openCreate" />
    </div>
    <DisplayAlert v-if="host.error.value" :description="host.error.value" alert-type="error" />
    <RendererTable v-if="host.listKey.value" :data-view-key="host.listKey.value" :children="columns" :actions="actions" :stripe="true" :show-row-index="true"
      :show-data-view-meta="false" :pagination="{pageSizes: [10, 20, 50], showJumper: true}" />

    <RendererDialog v-if="host.listKey.value && host.editingId.value !== undefined" :model-value="true" :title="host.created.value ? '新增导航宿主' : '编辑导航宿主'" width="680px"
      :append-to-body="true" :close-disabled="host.busy.value || host.unknown.value" @update:model-value="host.cancelEdit">
      <DisplayAlert v-if="host.dialogError.value" :description="host.dialogError.value" alert-type="error" />
      <RendererForm :data-view-key="host.listKey.value" :context-row-id="host.editingId.value" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2" label-width="110px">
        <FieldText field="pName" label="导航名称" :readonly="true" />
        <FieldText field="title" label="标题" placeholder="请输入标题" />
        <RendererDivider class="blueprint-nav-host__divider" content-position="left" content="① 数据来源：选择数据空间及其中要关联的资源" />
        <FieldSelect field="dataSetId" label="数据空间" :option-data-view-key="host.dataSetOptionKey.value" :filterable="true" />
        <FieldSelect field="dataName" label="资源选择" :option-label-fields="['Name', 'Type']" option-label-joiner=" · " :filterable="true" />
        <FieldText field="dataType" label="资源类型" placeholder="选择资源后自动填充" :readonly="true" />
        <RendererDivider class="blueprint-nav-host__divider" content-position="left" content="② 字段映射：将资源字段映射到导航参数，用于下拉选项的显示和传值" />
        <FieldSelect field="selectTextParam" label="文本字段" :option-label-fields="['description', 'Name']" :filterable="true" />
        <FieldText field="TextParamName" label="文本参数名称" placeholder="如：textParam" />
        <FieldSelect field="selectValParam" label="值字段" :option-label-fields="['description', 'Name']" :filterable="true" />
        <FieldText field="ValParamName" label="值参数名称" placeholder="如：valueParam" />
        <FieldSelect field="selectPid" label="父级字段" :option-label-fields="['description', 'Name']" :filterable="true" :clearable="true" />
        <RendererDivider class="blueprint-nav-host__divider" content-position="left" content="③ 参数处理方式：设置参数的处理方式和属性名称" />
        <FieldJson class="blueprint-nav-host__divider" field="paramType" label="参数处理方式" mode="form" :empty-value="{}" :schema="paramSchema" />
      </RendererForm>
      <template #footer>
        <RendererButton label="取消" :disabled="host.busy.value || host.unknown.value" @click="host.cancelEdit()" />
        <RendererButton :label="host.unknown.value ? '核验保存结果' : '保存'" button-type="primary" :loading="host.busy.value" @click="host.save" />
      </template>
    </RendererDialog>

    <RendererDialog v-if="host.deleteId.value !== undefined" :model-value="true" title="删除导航宿主" width="420px" :append-to-body="true"
      :close-disabled="host.busy.value || host.unknown.value" @update:model-value="host.cancelRemove">
      <DisplayAlert description="确定要删除该导航宿主数据吗？" alert-type="warning" />
      <DisplayAlert v-if="host.dialogError.value" :description="host.dialogError.value" alert-type="error" />
      <template #footer>
        <RendererButton label="取消" :disabled="host.busy.value || host.unknown.value" @click="host.cancelRemove()" />
        <RendererButton :label="host.unknown.value ? '核验删除结果' : '确定'" button-type="danger" :loading="host.busy.value" @click="host.confirmRemove" />
      </template>
    </RendererDialog>

    <RendererDialog v-if="host.designId.value" :model-value="true" title="数据集设计" width="92vw" top="4vh" :append-to-body="true"
      :destroy-on-close="true" :close-disabled="designPending" @update:model-value="host.designId.value = ''">
      <DataSetDesign ref="designPage" :target-id="host.designId.value" />
    </RendererDialog>
  </section>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, ref} from 'vue'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import type {RToolbarProps} from '@spark-appworks/spark-component'
import type {JsonSchemaObject} from '@spark-appworks/spark-json-document'
import {LowcodeDictionary} from '@/lowcode/resources/structured-config/dictionary/resource'
import type {useBlueprintNavHost} from './use-blueprint-nav-host'

const {DisplayAlert, FieldJson, FieldSelect, FieldText, RendererButton, RendererDialog, RendererDivider, RendererForm, RendererTable} = SparkComponent
const DataSetDesign = defineAsyncComponent(() => import('@/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue'))
const props = defineProps<{host: ReturnType<typeof useBlueprintNavHost>}>()
const designPage = ref<{hasPending: boolean} | null>(null)
/** 设计页有未保存修改或在途操作时禁止关闭，避免卸载时静默丢弃草稿。 */
const designPending = computed(() => designPage.value?.hasPending === true)

const paramSchema: JsonSchemaObject = {type: 'object', properties: {
  type: {title: '处理方式', type: 'string', 'x-optionDataViewKey': buildDataViewKey('_Base_DictData', 'DataCatalogParamType', LowcodeDictionary.editorScenarioId)},
  name: {title: '属性名称', type: 'string'},
}}

const column = (field: string, label: string): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth: 130, sortable: false, showOverflowTooltip: true}})
const columns: SparkNode[] = [
  column('pName', '导航宿主'), column('dataName', '数据名称'), column('dataType', '资源类型'),
  column('ValParamName', '值参数名称'), column('TextParamName', '文本参数名称'),
]
const actions = computed<RToolbarProps>(() => {
  void props.host.revision.value
  const disabled = props.host.busy.value || !props.host.view.value
  return {children: [
    {type: 'r-button', props: {label: '编辑', link: true, buttonType: 'primary', disabled,
      onClick: (row: DataRow) => { void props.host.openEdit(row) }}},
    {type: 'r-button', props: {label: '删除', link: true, buttonType: 'danger', disabled,
      onClick: (row: DataRow) => props.host.askRemove(row)}},
    {type: 'r-button', props: {label: '数据空间设计', link: true, buttonType: 'primary', disabled,
      onClick: (row: DataRow) => props.host.openDesign(row)}},
  ]}
})
</script>

<style scoped>
.blueprint-nav-host {display: grid; gap: 12px; margin-top: 16px}
.blueprint-nav-host__toolbar {display: flex; align-items: center; justify-content: space-between}
.blueprint-nav-host__toolbar h3 {margin: 0; font-size: 15px}
.blueprint-nav-host__divider {grid-column: 1 / -1}
</style>
