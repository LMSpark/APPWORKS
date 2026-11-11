<!--
@module app:views/features/system/bug-manage/ui/bug-detail-dialog
职责：固定一条BUG记录，编辑简述、系统、反馈类型、处理人、状态、表单路径及详情。
边界：读写与保存使用原DataView及公共记录编辑能力；处理人姓名由所选用户行同步，不另建草稿。
-->
<template>
  <RendererDialog :model-value="true" :data-view-key="dataViewKey" title="BUG详情" :width="960" :append-to-body="true" :close-disabled="busy || ownUnconfirmed" @update:model-value="cancel">
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="!current" role="status">原BUG记录已变化，请关闭并保留原修改。</p>
    <RendererForm :data-view-key="dataViewKey" :context-row-id="recordId" :auto-columns="false" :show-data-view-meta="false">
      <FieldText field="Title" label="BUG简述" :readonly="locked" />
      <FieldSelect field="SystemID" label="系统名称" :option-data-view-key="systemKey" :readonly="locked" />
      <FieldRadio field="FkType" label="反馈类型" :option-data-view-key="typeKey" :readonly="locked" />
      <FieldSelect field="CompleteUserID" label="处理人" :option-data-view-key="userKey" :filterable="true" :clearable="true" :readonly="locked" />
      <FieldRadio field="State" label="处理状态" :option-data-view-key="stateKey" :readonly="locked" />
      <FieldText field="FormPath" label="表单路径" :readonly="locked" />
      <FieldHtmlEditor field="Content" label="BUG详情" :readonly="locked" />
    </RendererForm>
    <template #footer>
      <RendererButton :label="foreignRecovery || recoveryEnded || hasStaged ? '关闭并保留修改' : '取消'" :disabled="busy || ownUnconfirmed" @click="cancel" />
      <RendererButton :label="ownUnconfirmed ? '核验原保存结果' : '保存'" button-type="primary" :disabled="busy || foreignRecovery || recoveryEnded || !current && !ownUnconfirmed" @click="submit" />
    </template>
  </RendererDialog>
</template>
<script setup lang="ts">
import * as Components from '@spark-appworks/spark-component'
import type {DataViewRecordEditingFinish} from '@spark-appworks/spark-component'
const {PAGE_RUNTIME,RendererDialog,RendererForm,RendererButton,FieldText,FieldSelect,FieldRadio,FieldHtmlEditor,useSparkComponent,useDataViewRecordEditing}=Components
const props=defineProps<{dataViewKey:string;recordId:string|number;systemKey:string;typeKey:string;stateKey:string;userKey:string}>()
const emit=defineEmits<{close:[result:DataViewRecordEditingFinish]}>()
const {sparkConsume}=useSparkComponent({type:'bug-detail-dialog'})
const runtime=()=>sparkConsume(PAGE_RUNTIME)
const {view,row,busy,current,locked,error,ownUnconfirmed,foreignRecovery,recoveryEnded,hasStaged,save,cancel}=useDataViewRecordEditing({mode:'edit',runtime,dataViewKey:()=>props.dataViewKey,recordId:()=>props.recordId,
  editableFields:['Title','SystemID','FkType','CompleteUserID','CompleteUserName','State','FormPath','Content'],onFinish:result=>emit('close',result)})

// 原数据把处理人姓名冗余在CompleteUserName，保存前按所选用户行同步。
async function submit():Promise<void>{
  if(!ownUnconfirmed.value&&current.value){
    const selected=row.value?.['CompleteUserID'],users=runtime()?.resolveView(props.userKey)
    const user=selected===undefined||selected===null||selected===''?undefined:users?.rows.find(item=>String(item['ID'])===String(selected))
    const name=user?user['UserName']:selected?undefined:''
    if(name!==undefined&&name!==row.value?.['CompleteUserName'])view.updateEditingValue(props.recordId,'CompleteUserName',name)
  }
  await save()
}
</script>
