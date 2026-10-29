<!--
@module app:views/app/dev-system/blueprint-workspace/EstimatePane
职责：编辑当前节点估算与交付责任字段。
边界：仅发出保存动作，真实写入及节点身份校验由父工作台执行。
AI用途：维护节点工作量并按当前节点ID关联项目经理任务。
-->
<template>
  <section class="stage-pane">
    <DisplayAlert v-if="!hasAnyReadableField" title="当前查询未返回估算字段或读取权限" alert-type="warning" />
    <RendererForm v-bind="binding" :auto-columns="false" :show-data-view-meta="false" context-data-member="currentRow" label-width="100px" class="estimate-grid">
      <FieldNumber v-if="fieldAccess.DifficultyFactor.read" data-member="currentRow" data-field="DifficultyFactor" label="难度系数" :min="0" :readonly="!fieldAccess.DifficultyFactor.write" @update:model-value="$emit('changed')" />
      <FieldNumber v-if="fieldAccess.Manhour.read" data-member="currentRow" data-field="Manhour" label="工时" :min="0" :readonly="!fieldAccess.Manhour.write" @update:model-value="$emit('changed')" />
      <FieldNumber v-if="fieldAccess.Number.read" data-member="currentRow" data-field="Number" label="数量" :min="0" :readonly="!fieldAccess.Number.write" @update:model-value="$emit('changed')" />
      <FieldNumber v-if="fieldAccess.Sum.read" data-member="currentRow" data-field="Sum" label="小计" :min="0" :readonly="!fieldAccess.Sum.write" @update:model-value="$emit('changed')" />
      <FieldNumber v-if="fieldAccess.Total.read" data-member="currentRow" data-field="Total" label="合计" :min="0" :readonly="!fieldAccess.Total.write" @update:model-value="$emit('changed')" />
      <FieldText v-if="fieldAccess.personCharge.read" data-member="currentRow" data-field="personCharge" label="负责人" :readonly="!fieldAccess.personCharge.write" @update:model-value="$emit('changed')" />
      <FieldText v-if="fieldAccess.status.read" data-member="currentRow" data-field="status" label="状态" :readonly="!fieldAccess.status.write" @update:model-value="$emit('changed')" />
    </RendererForm>
    <DisplayAlert alert-type="info" title="任务由项目经理侧管理，并以当前节点 ID 关联。" />
    <div class="stage-actions"><RendererButton label="保存节点修改" button-type="primary" :loading="saving" :disabled="!hasAnyWritableField" @click="$emit('save')" /></div>
  </section>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {DisplayAlert,FieldNumber,FieldText,RendererButton,RendererForm} from '@spark-appworks/spark-component'
import type {BlueprintWorkspaceDataView} from '@/services/project/blueprint-workspace-dataview'
type Access = {read: boolean; write: boolean}
type EstimateAccess = {DifficultyFactor: Access; Manhour: Access; Number: Access; Sum: Access; Total: Access; personCharge: Access; status: Access}
const props=defineProps<{binding:BlueprintWorkspaceDataView['standardComponentBinding'];saving:boolean;fieldAccess:EstimateAccess}>()
defineEmits<{save:[];changed:[]}>()
const hasAnyReadableField = computed(() => Object.values(props.fieldAccess).some(access => access.read))
const hasAnyWritableField = computed(() => Object.values(props.fieldAccess).some(access => access.write))
</script>
