<!--
@module app:views/features/application/application-manager/ui/application-relation-dialogs
职责：在应用管理页内以弹窗打开所选应用的关联数据库。
边界：复用 93DF 关联数据库内容组件；运行实例由应用管理页 PageRuntime 的同级场景提供，应用身份只作 sysid 传入。
-->
<template>
  <RendererDialog :model-value="true" :title="`关联数据库 - ${title}`" width="min(1200px, 94vw)" :append-to-body="true"
    @update:model-value="emit('close')">
    <ApplicationDatabaseRelationsContent :sysid="sysid" />
    <template #footer><RendererButton label="关闭" @click="emit('close')" /></template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {RendererButton, RendererDialog} from '@spark-appworks/spark-component'
import ApplicationDatabaseRelationsContent from '@/views/features/application/application-context/ui/application-database-relations-content.vue'

defineProps<{sysid: string; title: string}>()
const emit = defineEmits<{close: []}>()
</script>
