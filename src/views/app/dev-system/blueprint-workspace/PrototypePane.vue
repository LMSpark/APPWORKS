<!--
@module app:views/app/dev-system/blueprint-workspace/PrototypePane
职责：编辑当前节点原型HTML说明。
边界：原型归prototype分组，不作为PageTool运行规则。
AI用途：编辑原型说明并提交父工作台真实保存。
-->
<template>
  <section class="stage-pane">
    <RendererForm v-bind="binding" :auto-columns="false" :show-data-view-meta="false" context-data-member="currentRow" label-width="120px">
      <FieldHtmlEditor v-if="fieldAccess.read" data-member="currentRow" data-field="htmlDesc" label="原型设计" :rows="16" :readonly="!fieldAccess.write" @update:model-value="$emit('changed')" />
      <DisplayAlert v-else title="当前查询没有返回该字段或读取权限" alert-type="warning" />
    </RendererForm>
    <div class="stage-actions"><RendererButton label="保存节点修改" button-type="primary" :loading="saving" :disabled="!fieldAccess.write" @click="$emit('save')" /></div>
  </section>
</template>

<script setup lang="ts">
import { DisplayAlert, FieldHtmlEditor, RendererButton, RendererForm } from '@spark-appworks/spark-component'
import type { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
defineProps<{ saving: boolean; fieldAccess: {read: boolean; write: boolean}; binding: BlueprintWorkspaceDataView['standardComponentBinding'] }>()
defineEmits<{ save: []; changed: [] }>()
</script>

