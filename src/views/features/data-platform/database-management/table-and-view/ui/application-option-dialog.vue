<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/application-option-dialog
职责：视图设计「应用选择」；列表绑定 Base_AppSystemList DataView。
-->
<template>
  <RendererDialog :model-value="true" title="选择应用" :width="720" :close-disabled="busy" @update:model-value="emit('close')">
    <RendererTable :data-view-key="appKey" :auto-columns="true" :stripe="true" :show-pagination="true"
      :toolbar="toolbar" :show-data-view-meta="false" :highlight-current-row="true" v-bind="rowClickBind" />
    <template #footer>
      <RendererButton label="取消" :disabled="busy" @click="emit('close')" />
      <RendererButton label="确定" :disabled="busy" @click="emit('confirm')" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import type {DataRow} from '@spark-appworks/spark-data'
import {RendererButton, RendererDialog, RendererTable, type RToolbarProps} from '@spark-appworks/spark-component'

const props = defineProps<{
  appKey: string
  busy: boolean
  toolbar: RToolbarProps
  onRowClick?: (row: DataRow) => void
}>()
const rowClickBind = computed(() => props.onRowClick ? {onRowClick: props.onRowClick} : {})

const emit = defineEmits<{close: []; confirm: []}>()
</script>
