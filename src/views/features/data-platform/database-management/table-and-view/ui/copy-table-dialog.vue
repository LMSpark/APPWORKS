<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/copy-table-dialog
职责：复制表对话框；输入完全绑定目录命令 DataView，不在组件维护第二份草稿。
-->
<template>
  <RendererDialog :model-value="true" title="复制表" :width="520" :close-disabled="busy" @update:model-value="emit('cancel')">
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <RendererForm :data-view-key="dataViewKey" context-data-member="currentRow" :children="fields"
      :auto-columns="false" :grid-columns="1" :show-data-view-meta="false"
      :form-props="{disabled: busy}" />
    <template #footer>
      <RendererButton label="取消" :disabled="busy" @click="emit('cancel')" />
      <RendererButton label="保存" :disabled="busy" @click="emit('save')" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import type {SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererDialog, RendererForm} from '@spark-appworks/spark-component'

defineProps<{
  dataViewKey: string
  busy: boolean
  actionError: string
}>()

const emit = defineEmits<{cancel: []; save: []}>()
const fields: SparkNode[] = [
  {type: 'r-text', props: {field: 'copySourceLabel', label: '源表', readonly: true}},
  {type: 'r-text', props: {field: 'copyTableName', label: '新表名', placeholder: '请输入新表名'}},
  {type: 'r-textarea', props: {field: 'copyTableDesc', label: '描述', placeholder: '请输入描述', rows: 3}},
]
</script>
