<!--
@module app:views/features/integration/api-management/ui/api-output-edit-dialog
职责：固定原输出记录的标准字段编辑。
边界：读写及保存使用原DataView，生命周期由公共记录编辑能力承接；不持有草稿或存储owner。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" :title="created ? '新增输出定义' : '编辑输出定义'" :width="640" :append-to-body="true" :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!current" role="status">原输出身份已变化，请关闭并保留原修改。</p>
    <RendererForm :data-view-key="dataViewKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false">
      <FieldText field="enname" label="输出名称" :readonly="locked" />
      <FieldText field="cnname" label="输出标题" :readonly="locked" />
      <FieldSelect field="DataType" label="数据类型" :option-data-view-key="typeOptionsKey" :readonly="locked" />
      <FieldCheckbox field="IsPKey" label="主键" :true-value="1" :false-value="0" :readonly="locked" />
      <FieldText field="tblname" label="所属名称" :readonly="true" />
      <FieldText field="Memo" label="备注" :readonly="locked" />
    </RendererForm>
    <template #footer>
      <RendererButton :label="foreignRecovery || recoveryEnded || hasStaged && !created ? '关闭并保留输出修改' : confirmedCreation ? '关闭输出编辑' : '取消输出编辑'" :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton :label="permissionsPending ? '回读已保存输出权限' : ownUnconfirmed ? '核验原输出保存' : '保存输出定义'" button-type="primary" :disabled="busy || foreignRecovery || !permissionsPending && (recoveryEnded || !current && !ownUnconfirmed)" @click="save" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import * as Components from '@spark-appworks/spark-component'
const {PAGE_RUNTIME,RendererDialog,RendererForm,RendererButton,FieldText,FieldSelect,FieldCheckbox,useSparkComponent,useDataViewRecordEditing}=Components
const props=withDefaults(defineProps<{dataViewKey:string;recordId:string|number;typeOptionsKey:string;created?:boolean}>(),{created:false})
const emit=defineEmits<{close:[]}>()
const {sparkConsume}=useSparkComponent({type:'api-output-edit-dialog'})
const {busy,current,locked,error,ownUnconfirmed,foreignRecovery,recoveryEnded,hasStaged,permissionsPending,confirmedCreation,save,cancel}=useDataViewRecordEditing({mode:'edit',runtime:()=>sparkConsume(PAGE_RUNTIME),dataViewKey:()=>props.dataViewKey,recordId:()=>props.recordId,created:()=>props.created,editableFields:['enname','cnname','DataType','IsPKey','Memo'],onFinish:()=>emit('close')})
</script>
