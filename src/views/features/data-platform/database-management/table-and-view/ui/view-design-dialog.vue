<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/view-design-dialog
职责：视图设计三页签（设计 / 输出模型 / 数据）；绑定同一 catalog DataSet。
-->
<template>
  <RendererDialog :model-value="true" :title="title" :width="920" :close-disabled="busy" @update:model-value="emit('close')">
    <p v-if="objectLabel">视图：{{ objectLabel }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="hint" role="status">{{ hint }}</p>
    <RendererTabs v-model="activeTab">
      <RendererTabPane name="design" label="设计" :index="0">
        <div class="view-design-app-row">
          <span class="view-design-app-row__label">应用选择</span>
          <input class="view-design-app-row__input" type="text" :value="applicationLabel" readonly placeholder="请选择应用" />
          <RendererButton label="..." :disabled="busy" @click="emit('pickApplication')" />
        </div>
        <RendererForm v-if="objectMetaKey" :data-view-key="objectMetaKey" context-data-member="currentRow"
          :children="designFormChildren" :auto-columns="false" :grid-columns="1" :show-data-view-meta="false"
          :form-props="{disabled: busy}" />
      </RendererTabPane>
      <RendererTabPane name="output" label="输出模型" :index="1">
        <RendererTable :data-view-key="fieldKey" :children="fieldChildren" :toolbar="toolbar" :stripe="true"
          :show-pagination="false" :show-data-view-meta="false" :highlight-current-row="true" />
      </RendererTabPane>
      <RendererTabPane v-if="previewKey.length > 0" name="data" label="数据" :index="2" :lazy="true">
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
import {ref, watch} from 'vue'
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

defineProps<{
  title: string
  objectLabel: string
  objectMetaKey: string
  designFormChildren: SparkNode[]
  applicationLabel: string
  fieldKey: string
  fieldChildren: SparkNode[]
  toolbar: RToolbarProps
  previewKey: string
  previewToolbar: RToolbarProps
  previewError: string
  busy: boolean
  error: string
  hint: string
}>()

const emit = defineEmits<{close: []; openPreview: []; pickApplication: []}>()
const activeTab = ref<'design' | 'output' | 'data'>('design')

watch(activeTab, tab => {
  if (tab === 'data') emit('openPreview')
})
</script>

<style scoped>
.view-design-app-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.view-design-app-row__label {
  width: 92px;
  flex-shrink: 0;
  font-size: 14px;
  color: var(--el-text-color-regular, #606266);
}
.view-design-app-row__input {
  flex: 1;
  max-width: 360px;
  padding: 4px 8px;
  font-size: 13px;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 4px;
}
</style>
