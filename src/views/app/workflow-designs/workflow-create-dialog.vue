<!--
@module app:views/app/workflow-designs/workflow-create-dialog
职责：标准组件编辑原首稿创建命令行，保存、取消和未知核验复用公共单记录生命周期。
边界：不创建数据实例，不复制输入，不查询或写文件；确认后由宿主刷新与打开。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="新建工作流" :width="520"
    :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <RendererForm :data-view-key="dataViewKey" data-member="currentRow" :context-row-id="recordId" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
      <FieldText field="workflowId" label="Workflow ID" :readonly="locked" :maxlength="128" />
      <FieldText field="title" label="名称（可选）" :readonly="locked" />
    </RendererForm>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="ownUnconfirmed" role="status">创建结果尚未确认，请核验原提交；不会重复上传。</p>
    <template #footer>
      <RendererButton label="取消创建" :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton :label="ownUnconfirmed ? '核验创建结果' : '创建首稿'" button-type="primary"
        :disabled="busy || foreignRecovery || recoveryEnded" @click="save" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import {PAGE_RUNTIME,RendererDialog,RendererForm,RendererButton,FieldText,useSparkComponent,useDataViewRecordEditing,type DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
const props = defineProps<{dataViewKey: string; recordId: string | number}>()
const emit = defineEmits<{finish: [result: DataViewRecordEditingFinish]}>()
const {sparkConsume} = useSparkComponent({type: 'workflow-create-dialog'})
const {busy,error,locked,ownUnconfirmed,foreignRecovery,recoveryEnded,save,cancel} = useDataViewRecordEditing({mode: 'edit', created: () => true,
  editableFields: ['workflowId', 'title'], runtime: () => sparkConsume(PAGE_RUNTIME), dataViewKey: () => props.dataViewKey,
  recordId: () => props.recordId, onFinish: result => emit('finish', result)})
</script>
