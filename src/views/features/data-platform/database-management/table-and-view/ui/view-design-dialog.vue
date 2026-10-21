<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/view-design-dialog
职责：视图字段设计对话框；字段列表经 Base_TblField 命名视图 autoColumns，保存走 saveChanges。
-->
<template>
  <RendererDialog :model-value="true" :title="title" :width="920" :close-disabled="busy" @update:model-value="emit('close')">
    <p v-if="objectLabel">视图：{{ objectLabel }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="hint" role="status">{{ hint }}</p>
    <RendererTable :data-view-key="fieldKey" :toolbar="toolbar" :stripe="true" :show-pagination="false" :show-data-view-meta="false" />
    <template #footer>
      <RendererButton label="关闭" :disabled="busy" @click="emit('close')" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {RendererButton, RendererDialog, RendererTable, type RToolbarProps} from '@spark-appworks/spark-component'

defineProps<{
  title: string
  objectLabel: string
  fieldKey: string
  toolbar: RToolbarProps
  busy: boolean
  error: string
  hint: string
}>()

const emit = defineEmits<{close: []}>()
</script>
