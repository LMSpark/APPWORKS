<!--
@module app:views/app/workflow-designs/workflow-delete-dialog
职责：标准组件编辑整工作流删除命令行，保存、取消和未知核验复用公共单记录生命周期。
边界：不直接删除文件；确认后由宿主刷新目录并释放设计视图。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="删除工作流" :width="520"
    :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <RendererForm :data-view-key="dataViewKey" data-member="currentRow" :context-row-id="recordId" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
      <FieldText field="workflowId" label="Workflow ID" readonly />
    </RendererForm>
    <p role="alert">将删除该工作流的 definition.json 与 design.json，并在目录中移除对应项；失败时停止，不会自动重试。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="ownUnconfirmed" role="status">删除结果尚未确认，请核验原提交；不会重复删除。</p>
    <template #footer>
      <RendererButton label="取消" :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton :label="ownUnconfirmed ? '核验删除结果' : '确认删除'" button-type="danger"
        :disabled="busy || foreignRecovery || recoveryEnded" @click="save" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {PAGE_RUNTIME, RendererDialog, RendererForm, RendererButton, FieldText, useSparkComponent, useDataViewRecordEditing, type DataViewRecordEditingFinish} from '@spark-appworks/spark-component'

const props = defineProps<{dataViewKey: string; recordId: string | number}>()
const emit = defineEmits<{finish: [result: DataViewRecordEditingFinish]}>()
const {sparkConsume} = useSparkComponent({type: 'workflow-delete-dialog'})
const {busy, error, locked, ownUnconfirmed, foreignRecovery, recoveryEnded, save, cancel} = useDataViewRecordEditing({
  mode: 'edit',
  created: () => true,
  editableFields: [],
  runtime: () => sparkConsume(PAGE_RUNTIME),
  dataViewKey: () => props.dataViewKey,
  recordId: () => props.recordId,
  onFinish: result => emit('finish', result),
})
void locked
</script>