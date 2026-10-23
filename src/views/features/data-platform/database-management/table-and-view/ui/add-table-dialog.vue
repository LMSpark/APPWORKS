<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/add-table-dialog
职责：注册物理表对话框；表单 autoColumns，未登记表名经 DataSet 命令视图提示。
-->
<template>
  <RendererDialog :model-value="true" title="新增数据表" :width="560" :close-disabled="busy" @update:model-value="emit('cancel')">
    <p v-if="databaseLabel">数据库：{{ databaseLabel }}</p>
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <p v-if="unregisteredHint" role="status">{{ unregisteredHint }}</p>
    <p v-if="editing.unconfirmed" role="status">保存结果尚未确认。核验只确认原提交结果，不会再次写入。</p>
    <p v-else-if="editing.readbackFailed" role="status">已保存，但目录尚未重新读取成功，请重新读取。</p>
    <RendererForm :data-view-key="tableKey" :auto-columns="true" context-data-member="currentRow"
      :show-data-view-meta="false" :grid-columns="1"
      :form-props="{disabled: busy || editing.unconfirmed || editing.readbackFailed}" />
    <template #footer>
      <RendererButton v-if="!editing.unconfirmed" label="刷新未登记表名" :disabled="busy || !canLoadUnregistered" @click="emit('load-unregistered')" />
      <RendererButton v-if="!editing.unconfirmed" label="取消" :disabled="busy" @click="emit('cancel')" />
      <RendererButton v-if="!editing.unconfirmed && !editing.readbackFailed" label="确定" :disabled="busy" @click="emit('save')" />
      <RendererButton v-if="editing.unconfirmed" label="核验保存结果" :disabled="busy" @click="emit('save')" />
      <RendererButton v-if="editing.readbackFailed" label="重新读取" :disabled="busy" @click="emit('save')" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {RendererButton, RendererDialog, RendererForm} from '@spark-appworks/spark-component'
import type {DatabaseCatalogTableEditingUi} from '@/lowcode/resources/database/database-catalog-table-view-ops'

defineProps<{
  tableKey: string
  databaseLabel: string
  editing: DatabaseCatalogTableEditingUi
  busy: boolean
  actionError: string
  unregisteredHint: string
  canLoadUnregistered: boolean
}>()

const emit = defineEmits<{
  cancel: []
  save: []
  'load-unregistered': []
}>()
</script>
