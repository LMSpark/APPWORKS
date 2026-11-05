<!--
@module app:views/features/data-platform/semi-structured/excel-import/ui/excel-import-transform-rules-pane
职责：编排增强规则的原视图列表及单记录新增、编辑和删除确认。
边界：标准组件绑定同一DataView，原DataSet精确提交；方案开关由同一宿主slot维护其独立数据来源。
-->
<template>
  <section class="excel-transform-rules">
    <h2>增强规则</h2>
    <slot name="scheme-tools" />
    <p>关闭增强规则时仍可设计；启用后按执行方向和顺序消费已保存规则。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton label="刷新规则" :disabled="blocked || !hasNode" @click="refresh" />
    <RendererButton :data-view-key="dataViewKey" label="新增规则" perm-action="create" :disabled="blocked || !hasNode" @click="add" />
    <RendererButton v-if="unconfirmed" label="核验原未确认规则提交" :disabled="busy || !!editing || !!deleting || !!pendingRow" @click="verifyOriginal" />
    <template v-if="hasNode">
      <RendererTable :data-view-key="dataViewKey" :children="columns" :actions="actions" :highlight-current-row="true" :on-row-click="rowClick" />
    </template>
    <p v-else role="status">选择配置后维护其增强规则。</p>
    <RuleDialog v-if="editing" :key="editing.epoch" :data-view-key="dataViewKey" :record-id="editing.id" :created="editing.created" :field-options-key="fieldOptionsKey" @close="editing=undefined" />
    <RendererDialog v-if="pendingRow" :model-value="true" :data-view-key="dataViewKey" title="处理本条待提交修改" :width="520" :append-to-body="true" :close-disabled="busy || ownRecovery" @update:model-value="closePending">
      <p>原视图保留了本条待提交修改。继续保存或明确放弃，只处理当前这条记录。</p>
      <RendererForm :data-view-key="dataViewKey" :context-row-id="pendingRow.id" :auto-columns="false" :show-data-view-meta="false"><FieldText field="rule_name" label="规则名称" :readonly="true" /></RendererForm>
      <p v-if="error" role="alert">{{ error }}</p>
      <template #footer>
        <RendererButton :label="foreignRecovery ? '关闭并保留草稿' : '关闭'" :disabled="busy || ownRecovery" @click="closePending" />
        <RendererButton label="放弃本条待提交修改" :disabled="busy || unconfirmed || !!pendingRow.confirmed" @click="discardPending" />
        <RendererButton :label="pendingRow.confirmed ? '回读已保存规则权限' : ownRecovery ? '核验原保存结果' : recoveryEnded ? '原提交已结束，请重新选择' : '继续保存本条修改'" button-type="primary" :disabled="busy || foreignRecovery || recoveryEnded && !pendingRow.confirmed" @click="savePending" />
      </template>
    </RendererDialog>
    <RendererDialog v-if="deleting" :model-value="true" :data-view-key="dataViewKey" title="删除增强规则" :width="480" :append-to-body="true" :close-disabled="busy || ownRecovery" @update:model-value="cancelDelete">
      <p>确认删除这条增强规则？</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <template #footer>
        <RendererButton :label="foreignRecovery ? '关闭并保留草稿' : '取消删除规则'" :disabled="busy || ownRecovery" @click="cancelDelete" />
        <RendererButton :label="ownRecovery ? '核验原删除结果' : recoveryEnded ? '原提交已结束，请重新选择' : '确认删除规则'" button-type="danger" :disabled="busy || foreignRecovery || recoveryEnded" @click="confirmDelete" />
      </template>
    </RendererDialog>
  </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,shallowRef,toRaw,watch} from 'vue'
import {RequestState,type DataRow,type SparkNode} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import * as Components from '@spark-appworks/spark-component'
import type {RToolbarProps} from '@spark-appworks/spark-component'
import {createExcelTransformConfig} from '@/lowcode/resources/semi-structured/excel-import/transform/definition'
import RuleDialog from './excel-import-transform-rule-dialog.vue'

const {PAGE_RUNTIME,RendererButton,RendererTable,RendererDialog,RendererForm,FieldText,useSparkComponent}=Components
const props=withDefaults(defineProps<{dataViewKey:string;fieldOptionsKey:string;hasNode:boolean;disabled?:boolean}>(),{disabled:false})
const emit=defineEmits<{'session-change':[value:boolean]}>()
const {sparkConsume}=useSparkComponent({type:'excel-import-transform-rules-pane'}),runtime=sparkConsume(PAGE_RUNTIME)
const resolved=runtime?.resolveView(props.dataViewKey)
if(!resolved||!resolved.dataSet||resolved.commitMode!=='staged')throw Error('规则列表缺少原暂存DataView')
const view=resolved,dataSet=resolved.dataSet
const openedKey=props.dataViewKey
const revision=ref(0),acting=ref(false),error=ref('')
/** 本次行交互的原实例身份与原失败关联，不持有草稿或保存通道。 */
type PendingScope={
 /** 本次明确选择的原生记录ID。 */
 id:string|number
 /** 仍须属于原视图的原行对象。 */
 row:DataRow
 /** 打开时的原查询输入。 */
 queryContext:string
 /** 原保存链证明属于本次未知捕获的失败对象。 */
 failure?:Error
}
const editing=shallowRef<{id:string|number;created:boolean;epoch:number}>(),deleting=shallowRef<PendingScope&{staged:boolean;snapshot?:DataRow}>()
const pendingRow=shallowRef<PendingScope&{created:boolean;confirmed?:boolean}>()
let active=true,epoch=0
const stop=dataSet.onAnyViewChange({rowsChanged:changed,editingChanged:changed,requestStateChanged:changed,mutatingChanged:changed})
function changed():void{revision.value++}
const busy=computed(()=>{revision.value;return acting.value||view.mutating||[RequestState.Loading,RequestState.Preparing].includes(view.requestState)})
const unconfirmed=computed(()=>{revision.value;return view.hasUnconfirmedSave})
const interaction=computed(()=>deleting.value??pendingRow.value)
const ownRecovery=computed(()=>{revision.value;const target=interaction.value;return !!target?.failure&&view.hasUnconfirmedSaveFor([target.id],target.failure)})
const foreignRecovery=computed(()=>unconfirmed.value&&!ownRecovery.value)
const recoveryEnded=computed(()=>!!interaction.value?.failure&&!unconfirmed.value)
const sourceCurrent=computed(()=>props.dataViewKey===openedKey&&runtime?.resolveView(openedKey)===view&&!view.destroyed&&!dataSet.destroyed)
const blocked=computed(()=>!sourceCurrent.value||props.disabled||busy.value||unconfirmed.value||!!editing.value||!!deleting.value||!!pendingRow.value)
watch(()=>!!editing.value||!!deleting.value||!!pendingRow.value,value=>emit('session-change',value),{immediate:true,flush:'sync'})
const columns:SparkNode[]=Object.entries({sort_order:'顺序',rule_name:'规则名称',rule_type:'规则类型',source_field:'来源字段',target_field:'目标字段',config_json:'执行方向',enabled:'启用'}).map(([field,label])=>({type:'r-text',props:{field,label,readonly:true,...(field==='config_json'?{displayFormatter:scopeLabel}:{})}}))
const actions=computed<RToolbarProps>(()=>({children:[
 {type:'r-button',props:{label:'编辑',permAction:'edit',disabled:blocked.value,onClick:openEdit}},
 {type:'r-button',props:{label:'删除',permAction:'delete',disabled:blocked.value,onClick:openDelete}},
]}))
function scopeLabel(value:unknown):string{
 try{const config:unknown=typeof value==='string'?JSON.parse(value):undefined;if(isRecord(config)&&typeof config['executionScope']==='string')return config['executionScope'];return '未配置'}catch{return '配置待纠正'}
}
function message(cause:unknown):void{if(active)error.value=cause instanceof Error?cause.message:String(cause)}
function rowIdentity(value:unknown):{id:string|number;row:DataRow}{
 if(!isRecord(value))throw Error('缺少原规则记录')
 const id=view.getPkKey(value),row=view.rows.find(row=>view.getPkKey(row)===id)
 if(id===undefined||!row)throw Error('规则已变化，请刷新后重新选择')
 return {id,row}
}
function openEdit(value:unknown):void{
 if(blocked.value||!props.hasNode)return
 try{const {id,row}=rowIdentity(value);if(view.editActionState(row)!=='enabled')throw Error('当前规则不可编辑');error.value='';if(view.dirtyTracking.hasPendingChanges(id)){pendingRow.value={id,row,queryContext:JSON.stringify(view.queryContext),created:view.dirtyTracking.isPendingCreate(id)};return}editing.value={id,created:false,epoch:++epoch}}catch(cause){message(cause)}
}
function rowClick(row:DataRow,_column?:unknown,event?:Event):void{if(event instanceof MouseEvent&&event.detail===2)openEdit(row)}
async function add():Promise<void>{
 if(blocked.value||!props.hasNode)return
 acting.value=true;error.value=''
 try{
  if(view.requestState!==RequestState.Loaded)throw Error('请等待本配置规则读取完成')
  const sort=Math.max(0,...view.rows.map(row=>Number(row['sort_order']??0)))+10
  if(!Number.isSafeInteger(sort)||sort>2147483647)throw Error('规则顺序超出有效范围，请先调整现有顺序')
  const row=await view.addRow({rule_name:'',rule_type:'TRIM',source_field:'',target_field:'',sort_order:sort,enabled:1,on_error:'FAIL_ROW',condition_json:'',config_json:JSON.stringify(createExcelTransformConfig('TRIM')),phase:'',description:''})
  if(!active)return
  const id=view.getPkKey(row);if(id===undefined)throw Error('新增规则未返回正式主键')
  editing.value={id,created:true,epoch:++epoch}
 }catch(cause){message(cause)}finally{if(active){acting.value=false;changed()}}
}
async function refresh():Promise<void>{
 if(blocked.value||!props.hasNode)return
 try{if(view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('请先处理本配置未保存的规则');await view.refresh();if(view.loadingError)throw view.loadingError}catch(cause){message(cause)}
}
function openDelete(value:unknown):void{
 if(blocked.value)return
 try{const {id,row}=rowIdentity(value);if(view.hasEditingChanges(id)||view.dirtyTracking.hasPendingChanges(id))throw Error('请先处理该规则的未保存修改');if(view.deleteActionState(row)!=='enabled')throw Error('当前规则不可删除');error.value='';deleting.value={id,staged:false,row,queryContext:JSON.stringify(view.queryContext)}}catch(cause){message(cause)}
}
function cancelDelete():void{
 if(busy.value||ownRecovery.value||!deleting.value)return
 if(foreignRecovery.value){deleting.value=undefined;return}
 try{const target=deleting.value;if(target.staged&&view.dirtyTracking.getPendingDeleteSnapshot(target.id)===target.snapshot)view.discardPendingChanges([target.id]);deleting.value=undefined}catch(cause){message(cause)}
}
function assertPending():void{
 const target=pendingRow.value
 if(!target||!sourceCurrent.value||JSON.stringify(view.queryContext)!==target.queryContext||!view.rows.some(row=>toRaw(row)===toRaw(target.row)))throw Error('本次记录身份已变化，请关闭后重新选择')
}
function closePending():void{if(!busy.value&&!ownRecovery.value)pendingRow.value=undefined}
function discardPending():void{
 if(busy.value||unconfirmed.value||!pendingRow.value)return
 try{assertPending();view.discardPendingChanges([pendingRow.value.id]);pendingRow.value=undefined}catch(cause){message(cause)}
}
async function savePending():Promise<void>{
 const target=pendingRow.value;if(!target||busy.value)return
 if(foreignRecovery.value||recoveryEnded.value&&!target.confirmed){error.value='本窗口没有可继续核验的原提交，请关闭后重新选择';return}
 const recovering=ownRecovery.value
 acting.value=true;error.value=''
 try{
  if(!sourceCurrent.value)throw Error('原规则列表实例已变化')
  if(target.confirmed){await view.refreshSavedRowPermissions();if(active)pendingRow.value=undefined;return}
  if(recovering){if(!target.failure||!view.hasUnconfirmedSaveFor([target.id],target.failure)){changed();return}}else assertPending()
  const result=await dataSet.saveChanges({...(recovering?{applyEditingRows:false}:{}),views:[{tableName:view.tableName,viewId:view.viewId,ids:[target.id]}]})
  if(!active)return
  if(result.success){if(target.created&&view.hasPendingSavedRowPermissions)target.confirmed=true;else pendingRow.value=undefined}else error.value=result.error?.message??'本条保存结果尚未确认'
 }catch(cause){rememberFailure(target,cause);message(cause)}finally{if(active){acting.value=false;changed()}}
}
function rememberFailure(target:PendingScope,cause:unknown):void{if(cause instanceof Error&&view.hasUnconfirmedSaveFor([target.id],cause))target.failure=cause}
async function verifyOriginal():Promise<void>{
 if(busy.value||editing.value||deleting.value||pendingRow.value||!sourceCurrent.value||!view.hasUnconfirmedSave)return
 acting.value=true;error.value=''
 try{await dataSet.saveChanges({applyEditingRows:false,views:[{tableName:view.tableName,viewId:view.viewId}]})}catch(cause){message(cause)}finally{if(active){acting.value=false;changed()}}
}
async function confirmDelete():Promise<void>{
 const target=deleting.value;if(!target||busy.value)return
 if(foreignRecovery.value||recoveryEnded.value){error.value='本窗口没有可继续核验的原删除，请关闭后重新选择';return}
 const recovering=ownRecovery.value
 acting.value=true;error.value=''
 try{
  if(!sourceCurrent.value)throw Error('原规则列表实例已变化')
  if(recovering&&(!target.failure||!view.hasUnconfirmedSaveFor([target.id],target.failure))){changed();return}
  if(!recovering&&JSON.stringify(view.queryContext)!==target.queryContext)throw Error('原规则查询上下文已变化')
  if(!target.staged){
   if(!view.rows.some(row=>toRaw(row)===toRaw(target.row))||view.hasEditingChanges(target.id)||view.dirtyTracking.hasPendingChanges(target.id)||view.deleteActionState(target.row)!=='enabled')throw Error('原规则已变化或不可删除')
   if(await view.removeRow(target.id)!==true)throw Error('原规则未登记删除')
   const snapshot=view.dirtyTracking.getPendingDeleteSnapshot(target.id);if(!snapshot)throw Error('原规则删除未返回暂存快照')
   target.staged=true;target.snapshot=snapshot
  }else if(!recovering&&view.dirtyTracking.getPendingDeleteSnapshot(target.id)!==target.snapshot)throw Error('本次暂存删除已失效，请关闭后重新选择')
  const result=await dataSet.saveChanges({...(recovering?{applyEditingRows:false}:{}),views:[{tableName:view.tableName,viewId:view.viewId,ids:[target.id]}]})
  if(!active)return
  if(result.success)deleting.value=undefined;else error.value=result.error?.message??'删除结果尚未确认'
 }catch(cause){rememberFailure(target,cause);message(cause)}finally{if(active){acting.value=false;changed()}}
}
onBeforeUnmount(()=>{active=false;stop();emit('session-change',false)})
</script>
