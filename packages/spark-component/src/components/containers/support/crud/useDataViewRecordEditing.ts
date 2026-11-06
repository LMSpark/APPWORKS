/**
 * @module @spark-appworks/spark-component:components/containers/support/crud/useDataViewRecordEditing
 * 职责：为标准组件交互编排固定记录的编辑检查点、单ID保存和原捕获核验。
 * 边界：值与待提交状态始终归原DataView；不查询、不复制草稿、不创建保存owner。
 */
import {computed,onBeforeUnmount,ref,shallowRef,toRaw,type ComputedRef} from 'vue'
import type {DataSet,DataView,DataRow} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {recordValueProof} from './record-value-proof.js'
/** 明确区分本窗保存、取消与关闭保留原修改。 */
export type DataViewRecordEditingFinish='saved'|'cancelled'|'preserved'
/** 原组件实例的固定记录编辑输入。 */
export type DataViewRecordEditingInput=Readonly<{
 /** 本次原PageRuntime；改变时失效，不跟随新实例。 */
 runtime:()=>PageRuntime|null|undefined
 /** 完整视图键；输入改变不自动重绑。 */
 dataViewKey:()=>string
 /** 该视图原生记录身份；改变时失效。 */
 recordId:()=>string|number
 /** 控件还有未提交输入时禁止保存，不接管控件内部输入。 */
 pendingInputs?:()=>boolean
 /** 已结束后的通知；卸载和迟到响应不会触发。 */
 onFinish?:(result:DataViewRecordEditingFinish)=>void
}&({
 /** 编辑原行，创建可恢复的字段检查点。 */
 mode:'edit'
 /** 仅为checkpoint恢复范围，不是保存白名单；save提交本ID全部变更。 */
 editableFields:readonly string[]
 /** 是否为原视图待新增行，默认false；须与原生状态一致。 */
 created?:()=>boolean
}|{
 /** 明确处理原生待提交修改，或确认删除原正式行；均不创建编辑checkpoint。 */
 mode:'pending'|'delete'
})>
/** 原DataView的只读交互状态与窄操作；不是新的记录状态真源。 */
export type DataViewRecordEditing=Readonly<{
 /** 原视图句柄，业务交互仍使用其正式API。 */
 view:DataView
 /** 原DataSet句柄，未决状态不会由本能力销毁。 */
 dataSet:DataSet
 /** 打开时捕获的完整视图键。 */
 dataViewKey:string
 /** 打开时捕获的原生记录ID。 */
 recordId:string|number
 /** 原查询行，只供读取身份与权限，不能手工写入。 */
 originalRow:Readonly<DataRow>
 /** 原绑定、原行及输入身份仍有效。 */
 current:ComputedRef<boolean>
 /** 通用编辑锁；不替代字段数据权限。 */
 locked:ComputedRef<boolean>
 /** 当前保存或权限回读在途。 */
 busy:ComputedRef<boolean>
 /** 当前交互错误，保留原数据层错误文本。 */
 error:ComputedRef<string>
 /** 由本次原异常与完整目标ID证明属于本窗的未知保存。 */
 ownUnconfirmed:ComputedRef<boolean>
 /** 同视图存在不属于本窗的未知捕获。 */
 foreignRecovery:ComputedRef<boolean>
 /** 原未知已结束；不自动开启新的提交意图。 */
 recoveryEnded:ComputedRef<boolean>
 /** 已确认新增正在等待原权限回读，不重做新增。 */
 permissionsPending:ComputedRef<boolean>
 /** 本窗新增已由原保存回执确认；不从本地行消失推断成功。 */
 confirmedCreation:ComputedRef<boolean>
 /** 本ID已有原生待提交状态。 */
 hasStaged:ComputedRef<boolean>
 /** 当前原行的编辑覆盖；失效时不跟随替换记录。 */
 row:ComputedRef<Readonly<DataRow>|undefined>
 /** 首次单ID保存或只核本窗原捕获。 */
 save():Promise<void>
 /** 未apply时恢复本范围；已apply/失效/foreign时关闭保留，不伪造回滚。 */
 cancel():void
 /** 用户明确放弃原pending；不取消未知提交或已确认新增。 */
 discard():void
}>
/** 固定记录公共交互；销毁只释放监听/checkpoint，不取消原DataSet提交。 */
export function useDataViewRecordEditing(input:DataViewRecordEditingInput):DataViewRecordEditing{
 const runtime=input.runtime(),key=input.dataViewKey(),id=input.recordId(),mode=input.mode
 const resolved=runtime?.resolveView(key),owner=resolved?.dataSet
 if(!runtime||!resolved||!owner)throw Error('RECORD_EDIT_BINDING: 缺少原页面DataView')
 const view:DataView=resolved,dataSet:DataSet=owner
 const resolvedRow=view.rows.find(row=>view.getPkKey(row)===id)??view.dirtyTracking.getPendingDeleteSnapshot(id)
 const created=mode==='edit'?(input.created?.()??false):view.dirtyTracking.isPendingCreate(id)
 if(!resolvedRow||view.hasUnconfirmedSave||mode==='edit'&&(created!==view.dirtyTracking.isPendingCreate(id)||!created&&view.dirtyTracking.hasPendingChanges(id)))throw Error('RECORD_EDIT_PENDING: 请先由原宿主处理该记录的待提交修改')
 const original:DataRow=resolvedRow
 if(mode==='pending'&&(!view.dirtyTracking.hasPendingChanges(id)||view.hasEditingChanges(id)))throw Error('RECORD_EDIT_PENDING: 缺少可明确处理的原生待提交记录')
 if(mode==='delete'&&(view.hasEditingChanges(id)||view.dirtyTracking.hasPendingChanges(id)||view.deleteActionState(original)!=='enabled'))throw Error('RECORD_EDIT_DELETE: 原记录存在草稿或不可删除')
 const checkpoint=mode==='edit'?view.createEditingCheckpoint(id,input.editableFields):undefined,context=JSON.stringify(view.queryContext)
 let deleteSnapshot=mode==='pending'?view.dirtyTracking.getPendingDeleteSnapshot(id):undefined
 const persistentNames=()=>view.columns.filter(column=>!column.computeExpression&&!column.isComputed&&column.name!=='_pk').map(column=>column.name).sort()
 const pendingNames=mode==='pending'?persistentNames():[]
 const pendingFields=pendingNames.map(name=>({name,present:Object.prototype.hasOwnProperty.call(original,name),equals:recordValueProof(original[name])}))
 const pendingFlags=[view.dirtyTracking.isPendingCreate(id),view.dirtyTracking.isDirty(id),view.dirtyTracking.isPendingDelete(id)]
 const samePending=()=>{
  const names=persistentNames()
  return names.length===pendingNames.length&&names.every((name,index)=>name===pendingNames[index])&&pendingFlags[0]===view.dirtyTracking.isPendingCreate(id)&&pendingFlags[1]===view.dirtyTracking.isDirty(id)&&pendingFlags[2]===view.dirtyTracking.isPendingDelete(id)&&pendingFields.every(field=>Object.prototype.hasOwnProperty.call(original,field.name)===field.present&&field.equals(original[field.name]))
 }
 const pendingOriginal=mode==='pending'?view.dirtyTracking.getOriginal(id):undefined
 const busy=ref(false),error=ref(''),revision=ref(0),closed=ref(false),confirmedCreation=ref(false),failure=shallowRef<Error>()
 let active=true
 const isActive=()=>active
 const changed=()=>{revision.value++}
 const stop=dataSet.onAnyViewChange({rowsChanged:changed,currentRowChanged:changed,editingChanged:changed,editingFieldChanged:changed,editingDiscarded:changed,mutatingChanged:changed,requestStateChanged:changed})
 const sameInput=()=>active&&!closed.value&&input.runtime()===runtime&&input.dataViewKey()===key&&input.recordId()===id&&input.mode===mode&&(input.mode!=='edit'||(input.created?.()??false)===created)
 const sameOwner=()=>{try{return !view.destroyed&&!dataSet.destroyed&&runtime.resolveView(key)===view}catch{return false}}
 const sameContext=()=>sameInput()&&sameOwner()&&JSON.stringify(view.queryContext)===context
 const originalIdentity=()=>deleteSnapshot?view.dirtyTracking.getPendingDeleteSnapshot(id)===deleteSnapshot:view.rows.some(row=>toRaw(row)===toRaw(original))
 const isCurrent=()=>sameContext()&&originalIdentity()&&(mode!=='pending'||!view.hasEditingChanges(id)&&samePending()&&view.dirtyTracking.getOriginal(id)===pendingOriginal)
 const current=computed(()=>{revision.value;return isCurrent()})
 const ownUnconfirmed=computed(()=>{revision.value;return failure.value!==undefined&&view.hasUnconfirmedSaveFor([id],failure.value)})
 const foreignRecovery=computed(()=>{revision.value;return view.hasUnconfirmedSave&&!ownUnconfirmed.value})
 const recoveryEnded=computed(()=>failure.value!==undefined&&!ownUnconfirmed.value&&!foreignRecovery.value)
 const permissionsPending=computed(()=>{revision.value;return confirmedCreation.value&&view.hasPendingSavedRowPermissions})
 const hasStaged=computed(()=>{revision.value;return view.dirtyTracking.hasPendingChanges(id)})
 const locked=computed(()=>mode!=='edit'||busy.value||ownUnconfirmed.value||foreignRecovery.value||recoveryEnded.value||permissionsPending.value||!created&&hasStaged.value||!current.value)
 const row=computed(()=>{revision.value;return isCurrent()?view.getEditingRow(id)??original:undefined})
 function finish(result:DataViewRecordEditingFinish):void{if(!active||closed.value)return;closed.value=true;checkpoint?.release();input.onFinish?.(result)}
 function message(cause:unknown):void{error.value=cause instanceof Error?cause.message:String(cause)}
 function cancel():void{
  if(!active||closed.value||busy.value||ownUnconfirmed.value)return
  try{
   if(mode==='pending'){finish('preserved');return}
   if(mode==='delete'){
    const restore=isCurrent()&&!view.hasUnconfirmedSave
    if(deleteSnapshot&&restore)view.discardPendingChanges([id])
    finish(restore?'cancelled':'preserved');return
   }
   if(foreignRecovery.value||recoveryEnded.value||!isCurrent()||!created&&hasStaged.value){finish('preserved');return}
   if(created)view.discardPendingChanges([id]);else checkpoint?.restore()
   finish('cancelled')
  }catch(cause){message(cause)}
 }
 function discard():void{
  if(mode!=='pending'||busy.value||view.hasUnconfirmedSave||confirmedCreation.value)return
  try{if(!isCurrent())throw Error('RECORD_EDIT_STALE: 原待提交记录已变化');view.discardPendingChanges([id]);finish('cancelled')}catch(cause){message(cause)}
 }
 async function save():Promise<void>{
  if(!active||closed.value||busy.value||input.pendingInputs?.())return
  if(foreignRecovery.value||recoveryEnded.value&&!permissionsPending.value){error.value='RECORD_EDIT_RECOVERY: 本窗不能接管其它提交或重发已结束意图';return}
  const recovering=ownUnconfirmed.value;busy.value=true;error.value=''
  try{
   if(!sameContext())throw Error('RECORD_EDIT_STALE: 原保存实例或查询身份已变化')
   if(permissionsPending.value){await view.refreshSavedRowPermissions();if(sameContext())finish('saved');return}
   if(recovering){if(!failure.value||!view.hasUnconfirmedSaveFor([id],failure.value))return}
   else if(!isCurrent())throw Error('RECORD_EDIT_STALE: 原记录编辑身份已失效，请重新打开')
   if(!recovering&&mode==='delete'&&!deleteSnapshot){
    if(view.hasEditingChanges(id)||view.dirtyTracking.hasPendingChanges(id)||view.deleteActionState(original)!=='enabled')throw Error('RECORD_EDIT_DELETE: 原记录已变化或不可删除')
    if(await view.removeRow(id)!==true)throw Error('RECORD_EDIT_DELETE: 删除未登记')
    deleteSnapshot=view.dirtyTracking.getPendingDeleteSnapshot(id)
    if(!deleteSnapshot)throw Error('RECORD_EDIT_DELETE: 缺少原删除快照')
    if(!sameContext()||!originalIdentity())throw Error('RECORD_EDIT_STALE: 原删除身份已变化')
   }
   const result=await dataSet.saveChanges({...(recovering||mode!=='edit'?{applyEditingRows:false}:{}),views:[{tableName:view.tableName,viewId:view.viewId,ids:[id]}]})
   if(!sameContext())return
   if(result.success){confirmedCreation.value=created;if(!(confirmedCreation.value&&view.hasPendingSavedRowPermissions))finish('saved')}
   else error.value=result.error?.message??'保存未确认，请核验原保存结果'
  }catch(cause){if(sameInput()){if(cause instanceof Error&&view.hasUnconfirmedSaveFor([id],cause))failure.value=cause;message(cause)}}
  finally{if(isActive()){busy.value=false;changed()}}
 }
 onBeforeUnmount(()=>{active=false;stop();checkpoint?.release()})
 return{view,dataSet,dataViewKey:key,recordId:id,originalRow:original,current,locked,busy:computed(()=>busy.value),error:computed(()=>error.value),ownUnconfirmed,foreignRecovery,recoveryEnded,permissionsPending,confirmedCreation:computed(()=>confirmedCreation.value),hasStaged,row,save,cancel,discard}
}
