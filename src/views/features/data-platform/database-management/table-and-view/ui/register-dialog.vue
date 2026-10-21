<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/register-dialog
职责：注册物理库对话框；表单 autoColumns，未登记库名经数据层加载后提示，不直调 HTTP。
-->
<template>
  <RendererDialog :model-value="true" title="注册数据库" :width="560" :close-disabled="busy" @update:model-value="emit('cancel')">
    <p v-if="serverLabel">服务器：{{ serverLabel }}</p>
    <p v-if="actionError" role="alert">{{ actionError }}</p>
    <p v-if="unregisteredHint" role="status">{{ unregisteredHint }}</p>
    <p v-if="editing.unconfirmed" role="status">保存结果尚未确认。核验只确认原提交结果，不会再次写入。</p>
    <p v-else-if="editing.readbackFailed" role="status">已保存，但目录尚未重新读取成功，请重新读取。</p>
    <RendererForm :data-view-key="catalogKey" context-data-member="currentRow"
      :show-data-view-meta="false" :grid-columns="1"
      :form-props="{disabled: busy || editing.unconfirmed || editing.readbackFailed}" />
    <template #footer>
      <RendererButton v-if="!editing.unconfirmed" label="刷新未登记库名" :disabled="busy || !canLoadUnregistered" @click="emit('load-unregistered')" />
      <RendererButton v-if="!editing.unconfirmed" label="取消" :disabled="busy" @click="emit('cancel')" />
      <RendererButton v-if="!editing.unconfirmed && !editing.readbackFailed" label="注册" :disabled="busy" @click="emit('save')" />
      <RendererButton v-if="editing.unconfirmed" label="核验保存结果" :disabled="busy" @click="emit('save')" />
      <RendererButton v-if="editing.readbackFailed" label="重新读取" :disabled="busy" @click="emit('save')" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {RendererButton, RendererDialog, RendererForm} from '@spark-appworks/spark-component'
import type {DatabaseCatalogDbEditingUi} from '@/lowcode/resources/database/database-catalog-db-view-ops'

defineProps<{
  catalogKey: string
  serverLabel: string
  editing: DatabaseCatalogDbEditingUi
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
