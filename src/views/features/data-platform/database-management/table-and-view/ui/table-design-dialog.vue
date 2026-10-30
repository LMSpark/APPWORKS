<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/table-design-dialog
职责：表设计对话框；表头/字段/关系均绑定同一 catalog DataSet。
-->
<template>
  <RendererDialog :model-value="true" :title="title" :width="960" :close-disabled="busy" @update:model-value="emit('close')">
    <p v-if="objectLabel">物理表：{{ objectLabel }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="hint" role="status">{{ hint }}</p>
    <RendererForm v-if="objectMetaKey" :data-view-key="objectMetaKey" context-data-member="currentRow"
      :children="objectHeaderChildren" :auto-columns="false" :grid-columns="1" :show-data-view-meta="false"
      :form-props="{disabled: busy}" />
    <RendererTabs v-model="activeTab">
      <RendererTabPane name="fields" label="字段" :index="0">
        <RendererTable :data-view-key="fieldKey" :children="fieldChildren" :toolbar="toolbar" :stripe="true"
          :show-pagination="false" :show-data-view-meta="false" :highlight-current-row="true" />
      </RendererTabPane>
      <RendererTabPane v-if="relationKey.length > 0" name="relations" label="关系" :index="1" :lazy="true">
        <p v-if="relationError" role="alert">{{ relationError }}</p>
        <RendererTable :data-view-key="relationKey" :children="relationListFields" :toolbar="relationToolbar"
          :stripe="true" :show-pagination="false" :show-data-view-meta="false" :highlight-current-row="true"
          v-bind="relationRowClickBind" />
      </RendererTabPane>
      <RendererTabPane v-if="workflowKey.length > 0" name="flow" label="数据流" :index="2" :lazy="true">
        <p v-if="workflowError" role="alert">{{ workflowError }}</p>
        <div v-if="workflowKey.length > 0" class="workflow-filter-row">
          <label class="workflow-filter-row__item">
            <span class="workflow-filter-row__label">名称</span>
            <input class="workflow-filter-row__input" type="text" :value="workflowQuery.name ?? ''" placeholder="名称"
              :disabled="busy" @input="patchWorkflowQuery({name: inputValue($event)})"
              @keyup.enter="emit('applyWorkflowFilter')" @keydown.enter.prevent />
          </label>
          <label class="workflow-filter-row__item">
            <span class="workflow-filter-row__label">工作流编码</span>
            <input class="workflow-filter-row__input" type="text" :value="workflowQuery.workflowKey ?? ''" placeholder="工作流编码"
              :disabled="busy" @input="patchWorkflowQuery({workflowKey: inputValue($event)})"
              @keyup.enter="emit('applyWorkflowFilter')" @keydown.enter.prevent />
          </label>
          <label class="workflow-filter-row__item">
            <span class="workflow-filter-row__label">描述</span>
            <input class="workflow-filter-row__input" type="text" :value="workflowQuery.description ?? ''" placeholder="描述"
              :disabled="busy" @input="patchWorkflowQuery({description: inputValue($event)})"
              @keyup.enter="emit('applyWorkflowFilter')" @keydown.enter.prevent />
          </label>
          <label class="workflow-filter-row__item">
            <span class="workflow-filter-row__label">状态</span>
            <input class="workflow-filter-row__input" type="text" :value="workflowQuery.status ?? ''" placeholder="状态"
              :disabled="busy" @input="patchWorkflowQuery({status: inputValue($event)})"
              @keyup.enter="emit('applyWorkflowFilter')" @keydown.enter.prevent />
          </label>
          <RendererButton label="查询" :disabled="busy" @click="emit('applyWorkflowFilter')" />
        </div>
        <RendererTable :data-view-key="workflowKey" :children="workflowListFields" :toolbar="workflowToolbar"
          :stripe="true" :show-pagination="false" :show-data-view-meta="false" />
      </RendererTabPane>
      <RendererTabPane v-if="previewKey.length > 0" name="data" label="数据" :index="3" :lazy="true">
        <p v-if="previewError" role="alert">{{ previewError }}</p>
        <RendererTable :data-view-key="previewKey" :auto-columns="true" :toolbar="previewToolbar" :stripe="true"
          :show-pagination="true" :show-data-view-meta="false" />
      </RendererTabPane>
    </RendererTabs>
    <template #footer>
      <RendererButton label="关闭" :disabled="busy" @click="emit('close')" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import type {SparkNode} from '@spark-appworks/spark-data'
import {
  RendererButton,
  RendererDialog,
  RendererForm,
  RendererTabPane,
  RendererTable,
  RendererTabs,
  type RToolbarProps,
} from '@spark-appworks/spark-component'
import type {DataRow} from '@spark-appworks/spark-data'
import type {DatabaseCatalogWorkflowQuery} from '@/lowcode/resources/database/catalog/workflow/view-ops'

const props = defineProps<{
  title: string
  objectLabel: string
  objectMetaKey: string
  objectHeaderChildren: SparkNode[]
  fieldKey: string
  fieldChildren: SparkNode[]
  toolbar: RToolbarProps
  relationKey: string
  relationListFields: SparkNode[]
  relationToolbar: RToolbarProps
  relationError: string
  workflowKey: string
  workflowListFields: SparkNode[]
  workflowToolbar: RToolbarProps
  workflowError: string
  workflowQuery: DatabaseCatalogWorkflowQuery
  previewKey: string
  previewToolbar: RToolbarProps
  previewError: string
  busy: boolean
  error: string
  hint: string
  onRelationRowClick?: (row: DataRow) => void
}>()

const emit = defineEmits<{close: []; openPreview: []; openWorkflow: []; applyWorkflowFilter: []; 'update:workflowQuery': [DatabaseCatalogWorkflowQuery]}>()
const relationRowClickBind = computed(() => props.onRelationRowClick ? {onRowClick: props.onRelationRowClick} : {})
const activeTab = ref<'fields' | 'relations' | 'flow' | 'data'>('fields')

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : ''
}

function patchWorkflowQuery(patch: Partial<DatabaseCatalogWorkflowQuery>): void {
  emit('update:workflowQuery', {...props.workflowQuery, ...patch})
}

watch(activeTab, tab => {
  if (tab === 'data') emit('openPreview')
  if (tab === 'flow') emit('openWorkflow')
})
</script>

<style scoped>
.workflow-filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 12px;
  margin-bottom: 8px;
}
.workflow-filter-row__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}
.workflow-filter-row__label {
  font-size: 12px;
  color: var(--el-text-color-secondary, #606266);
}
.workflow-filter-row__input {
  width: 140px;
  padding: 4px 8px;
  font-size: 13px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
}
</style>
