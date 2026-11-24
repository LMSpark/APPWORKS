<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/table-design-dialog
职责：表设计对话框；表头/字段/关系及数据流均绑定同一 catalog DataSet 和标准组件。
-->
<template>
  <RendererDialog :model-value="true" :title="title" :width="1600" :close-disabled="busy" @update:model-value="emit('close')">
    <p v-if="error" role="alert">{{ error }}</p>
    <div class="design-shell">
      <div class="design-shell__actions">
        <RendererButton label="取消" :disabled="busy" @click="emit('close')" />
        <RendererButton label="保存" :disabled="saveDisabled" @click="emit('save')" />
      </div>
      <RendererTabs v-model="activeTab">
      <RendererTabPane name="design" label="设计" :index="0">
        <RendererForm v-if="objectMetaKey" :data-view-key="objectMetaKey" context-data-member="currentRow"
          :children="objectHeaderChildren" :auto-columns="false" :show-data-view-meta="false"
          :form-props="{disabled: busy}" />
        <RendererTable :data-view-key="fieldKey" :children="fieldChildren" :toolbar="toolbar" :stripe="true"
          :show-pagination="false" :show-data-view-meta="false" :highlight-current-row="true" />
      </RendererTabPane>
      <RendererTabPane name="relations" label="关系" :index="1" :lazy="true">
        <p v-if="relationError" role="alert">{{ relationError }}</p>
        <RendererTable v-if="relationKey.length > 0" :data-view-key="relationKey" :children="relationListFields" :toolbar="relationToolbar"
          :stripe="true" :show-pagination="false" :show-data-view-meta="false" :highlight-current-row="true"
          v-bind="relationRowClickBind" />
      </RendererTabPane>
      <RendererTabPane name="flow" label="数据流" :index="2" :lazy="true">
        <p v-if="workflowError" role="alert">{{ workflowError }}</p>
        <RendererTable v-if="workflowKey.length > 0" :data-view-key="workflowKey" :children="workflowListFields"
          :toolbar="workflowToolbar" :filter="workflowFilter" :on-row-click="onWorkflowRowClick"
          :stripe="true" :show-pagination="false" :show-data-view-meta="false" />
        <table v-else class="design-empty-grid">
          <thead><tr><th>名称</th><th>工作流编码</th><th>描述</th><th>状态</th><th>版本号</th></tr></thead>
          <tbody></tbody>
        </table>
      </RendererTabPane>
      <RendererTabPane name="data" label="数据" :index="3" :lazy="true">
        <p v-if="previewError" role="alert">{{ previewError }}</p>
        <RendererTable v-if="previewKey.length > 0" :data-view-key="previewKey" :children="previewChildren" :auto-columns="false" :stripe="true"
          :show-pagination="true" :show-data-view-meta="false" />
      </RendererTabPane>
      </RendererTabs>
    </div>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import type {DataRow, SparkNode} from '@spark-appworks/spark-data'
import {
  RendererButton,
  RendererDialog,
  RendererForm,
  RendererTabPane,
  RendererTable,
  RendererTabs,
  type RFilterProps,
  type RToolbarProps,
} from '@spark-appworks/spark-component'

const props = defineProps<{
  title: string
  objectMetaKey: string
  objectHeaderChildren: SparkNode[]
  fieldKey: string
  fieldChildren: SparkNode[]
  toolbar: RToolbarProps
  relationKey: string
  relationListFields: SparkNode[]
  relationToolbar: RToolbarProps
  relationError: string
  onWorkflowRowClick: (row: DataRow) => void
  workflowKey: string
  workflowListFields: SparkNode[]
  workflowToolbar: RToolbarProps
  workflowFilter: RFilterProps
  workflowError: string
  previewKey: string
  previewChildren: SparkNode[]
  previewError: string
  busy: boolean
  error: string
  saveDisabled: boolean
  onRelationRowClick?: (row: DataRow) => void
}>()

const emit = defineEmits<{close: []; save: []; openPreview: []; openWorkflow: []}>()
const relationRowClickBind = computed(() => props.onRelationRowClick ? {onRowClick: props.onRelationRowClick} : {})
const activeTab = ref<'design' | 'relations' | 'flow' | 'data'>('design')

watch(activeTab, tab => {
  if (tab === 'data') emit('openPreview')
  if (tab === 'flow' && props.workflowKey.length > 0) emit('openWorkflow')
})
</script>

<style scoped>
.design-shell {
  position: relative;
}
.design-shell__actions {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 2;
  display: flex;
  gap: 8px;
}
.design-shell :deep(.el-tabs__header) {
  padding-right: 168px;
}
.design-empty-grid {
  width: 100%;
  border-collapse: collapse;
}
.design-empty-grid th {
  padding: 8px;
  border-bottom: 1px solid var(--el-border-color, #dcdfe6);
  font-weight: 600;
  text-align: center;
}
</style>
