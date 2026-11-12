<!--
@module app:views/features/application/application-function-management/ui/blueprint-navigation/blueprint-nav-host-dialog
职责：导航配置页签的“导航宿主”列表、新增/编辑导航宿主对话框（数据来源→字段映射→参数处理方式）、删除确认与数据空间设计入口。
边界：列表、表单与候选均绑定蓝图 PageRuntime 中 7AB 场景的正式视图；上游变化清空下游由编辑器级联执行；
  只有显式“确定”才删除；结果未知时对话框不能关闭或放弃。
AI用途：调整宿主列表列或表单分组时只改本组件；业务动作在 use-blueprint-nav-host。
-->
<template>
  <section class="blueprint-nav-host">
    <div class="blueprint-nav-host__toolbar">
      <h3>导航宿主</h3>
      <RendererButton label="新增" button-type="primary" :disabled="!editor || host.busy.value || host.loading.value || !canCreate" @click="host.openCreate" />
    </div>
    <DisplayAlert v-if="host.error.value" :description="host.error.value" alert-type="error" />
    <RendererTable v-if="editor && listKey" :data-view-key="listKey" :children="columns" :actions="actions" :stripe="true" :show-row-index="true"
      :show-data-view-meta="false" :pagination="{pageSizes: [10, 20, 50], showJumper: true}" />

    <RendererDialog v-if="editor && editingId !== undefined" :model-value="true" :title="host.created.value ? '新增导航宿主' : '编辑导航宿主'" width="680px"
      :append-to-body="true" :close-disabled="host.busy.value || host.unknown.value" @update:model-value="host.cancelEdit">
      <DisplayAlert v-if="host.dialogError.value" :description="host.dialogError.value" alert-type="error" />
      <RendererForm :data-view-key="listKey" :context-row-id="editingId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2" label-width="110px">
        <FieldText v-if="has('pName')" :field="col('pName')" label="导航名称" :readonly="true" />
        <FieldText :field="col('title')" label="标题" placeholder="请输入标题" />
        <RendererDivider class="blueprint-nav-host__divider" content-position="left" content="① 数据来源：选择数据空间及其中要关联的资源" />
        <FieldSelect :field="col('dataSetId')" label="数据空间" :option-data-view-key="optionKey('dataSets')" :option-label-fields="['Name', 'description']"
          :filterable="true" />
        <FieldSelect :field="col('DataName')" label="资源选择" :option-data-view-key="optionKey('resources')" :option-label-fields="['Name', 'Type']" option-label-joiner=" · "
          :filterable="true" :readonly="!upstream('dataSetId')" />
        <FieldText v-if="has('dataType')" :field="col('dataType')" label="资源类型" placeholder="选择资源后自动填充" :readonly="true" />
        <RendererDivider class="blueprint-nav-host__divider" content-position="left" content="② 字段映射：将资源字段映射到导航参数，用于下拉选项的显示和传值" />
        <FieldSelect :field="col('selectTextParam')" label="文本字段" :option-data-view-key="optionKey('fieldOptions')" :option-label-fields="['description', 'Name']"
          :filterable="true" :readonly="!upstream('DataName')" />
        <FieldText :field="col('TextParamName')" label="文本参数名称" placeholder="如：textParam" />
        <FieldSelect :field="col('selectValParam')" label="值字段" :option-data-view-key="optionKey('fieldOptions')" :option-label-fields="['description', 'Name']"
          :filterable="true" :readonly="!upstream('DataName')" />
        <FieldText :field="col('ValParamName')" label="值参数名称" placeholder="如：valueParam" />
        <FieldSelect v-if="has('selectPid')" :field="col('selectPid')" label="父级字段" :option-data-view-key="optionKey('fieldOptions')"
          :option-label-fields="['description', 'Name']" :filterable="true" :clearable="true" :readonly="!upstream('DataName')" />
      </RendererForm>
      <RendererForm :data-view-key="paramKey" context-row-id="param" :auto-columns="false" :show-data-view-meta="false" :grid-columns="2" label-width="110px">
        <RendererDivider class="blueprint-nav-host__divider" content-position="left" content="③ 参数处理方式：设置参数的处理方式和属性名称" />
        <FieldText field="type" label="处理方式" />
        <FieldText field="name" label="属性名称" placeholder="请输入属性名称，如：myParam" />
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
import {computed, defineAsyncComponent, onBeforeUnmount, ref, watch} from 'vue'
import type {DataRow, SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import type {RToolbarProps} from '@spark-appworks/spark-component'
import type {useBlueprintNavHost} from './use-blueprint-nav-host'

const {DisplayAlert, FieldSelect, FieldText, RendererButton, RendererDialog, RendererDivider, RendererForm, RendererTable} = SparkComponent
const DataSetDesign = defineAsyncComponent(() => import('@/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue'))
const props = defineProps<{host: ReturnType<typeof useBlueprintNavHost>}>()
const designPage = ref<{hasPending: boolean} | null>(null)
/** 设计页有未保存修改或在途操作时禁止关闭，避免卸载时静默丢弃草稿。 */
const designPending = computed(() => designPage.value?.hasPending === true)
const editRevision = ref(0)

const editor = computed(() => props.host.editor.value)
const listKey = computed(() => props.host.listKey.value)
const editingId = computed(() => props.host.editingId.value)
const fields = computed<Readonly<Record<string, string>>>(() => editor.value?.fields ?? {})
const paramKey = computed(() => editor.value ? editor.value.viewKey(editor.value.paramInput) : '')
const canCreate = computed(() => {void props.host.revision.value; return editor.value?.view.addActionState() === 'enabled'})
const has = (field: string): boolean => !!fields.value[field]
const col = (field: string): string => fields.value[field] ?? field
function optionKey(name: 'dataSets' | 'resources' | 'fieldOptions'): string {
  const target = editor.value
  return target ? target.viewKey(target[name]) : ''
}
function upstream(field: string): boolean {
  void editRevision.value
  const id = editingId.value
  return id !== undefined && !!editor.value?.value(id, field)
}

let stop: (() => void) | undefined
watch(editor, target => {
  stop?.()
  stop = target?.view.dataSet?.onAnyViewChange({editingFieldChanged: () => { editRevision.value++ }})
}, {immediate: true})
onBeforeUnmount(() => stop?.())

const column = (field: string | undefined, label: string): SparkNode[] => field
  ? [{type: 'r-text', props: {field, label, readonly: true, minWidth: 130, sortable: false, showOverflowTooltip: true}}]
  : []
const columns = computed<SparkNode[]>(() => [
  ...column(fields.value['pName'], '导航宿主'), ...column(fields.value['DataName'], '数据名称'), ...column(fields.value['dataType'], '资源类型'),
  ...column(fields.value['ValParamName'], '值参数名称'), ...column(fields.value['TextParamName'], '文本参数名称'),
])
const actions = computed<RToolbarProps>(() => {
  void props.host.revision.value
  const target = editor.value, busy = props.host.busy.value
  return {children: [
    {type: 'r-button', props: {label: '编辑', link: true, buttonType: 'primary', disabled: busy || !target,
      onClick: (row: DataRow) => { void props.host.openEdit(row) }}},
    {type: 'r-button', props: {label: '删除', link: true, buttonType: 'danger', disabled: busy || !target,
      onClick: (row: DataRow) => props.host.askRemove(row)}},
    {type: 'r-button', props: {label: '数据空间设计', link: true, buttonType: 'primary', disabled: busy || !target,
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
