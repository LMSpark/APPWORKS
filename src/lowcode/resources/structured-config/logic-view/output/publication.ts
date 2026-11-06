/**
 * @module app:lowcode/resources/structured-config/logic-view/output/publication
 * 职责：按设计文件、正式输出两个独立提交边界编排一次逻辑视图发布。
 * 边界：仅持原运行实例、原捕获及只读证明；草稿、查询、提交与未知核验仍归SPARK data。
 */
import {RequestState,type DataRow,type DataSet,type DataView,type DataViewEditingFieldChangeEvent} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataSpaceDefinitionSave,definitionTargetDraftSignature,verifyDataSpaceDefinitionCapture,verifyAndDiscardDataSpaceDefinitionCapture,type DataSpaceDefinitionCapture,type DataSpaceDefinitionCaptureBatch,type DataSpaceDefinitionSavePart} from '../../../../data-space/model-source/data-space-definition-save'
import {readStructuredConfigScope} from '../../catalog'
import {LOGIC_VIEW_DESIGN_VIEW} from '../design-ops'
import {LowcodeLogicView} from '../resource'
import type {LogicViewOutputEdit} from './publication-edit'

type Input=Readonly<{page:PageRuntime;viewId:string;assertCurrent:()=>void}>
type Phase='new'|'prepared'|'file-confirmed'|'done'|'cancelled'
type RecoveryValues=ReadonlyArray<Readonly<{present:boolean;value:unknown}>>
type RecoveryProof=Readonly<{target:DataSpaceDefinitionCapture;query:string;draft:string;rows:ReadonlyArray<Readonly<{id:string;row:DataRow|undefined;values:RecoveryValues}>>}>
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical)
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,next])=>[key,canonical(next)]))
 return value
}
function designProof(value:unknown):string{
 if(typeof value!=='string')throw Error('逻辑视图设计文本缺失')
 return JSON.stringify(canonical(JSON.parse(value)))
}

/** 原发布意图；核验动作只恢复原捕获，不在同次动作继续下一次提交。 */
export class LogicViewPublication{
 readonly #dataSet:DataSet
 readonly #file:DataView
 readonly #query:string
 readonly #proof:string
 readonly #assertScope:()=>void
 #phase:Phase='new'
 #busy=false
 #disposed=false
 #fileEdited=false
 #outputEdited=false
 #fileConfirmed=false
 #output:LogicViewOutputEdit|undefined
 #metadata:DataSet|undefined
 #outputView:DataView|undefined
 #fileCapture:DataSpaceDefinitionCaptureBatch|undefined
 #outputCapture:DataSpaceDefinitionCaptureBatch|undefined
 readonly #recoveryProofs=new Map<DataSpaceDefinitionCaptureBatch,readonly RecoveryProof[]>()
 readonly #onFileInput=(event:DataViewEditingFieldChangeEvent):void=>{if(event.rowId===this.input.viewId&&event.field==='designJson')this.#fileEdited=true}
 readonly #onOutputInput=(event:DataViewEditingFieldChangeEvent):void=>{if(this.#output?.ids.includes(String(event.rowId)))this.#outputEdited=true}
 constructor(private readonly input:Input){
  this.#assertScope=readStructuredConfigScope('逻辑视图发布').assertCurrent
  const dataSet=input.page.getDataSet(LowcodeLogicView.navigationScenarioId),file=dataSet?.getView(LOGIC_VIEW_DESIGN_VIEW)
  if(!dataSet||file?.requestState!==RequestState.Loaded||file.hasUnconfirmedSave
   ||input.page.call.scenarioInputs?.[LowcodeLogicView.navigationScenarioId]?.['viewId']!==input.viewId
   ||input.page.call.scenarioInputs[LowcodeLogicView.parameterScenarioId]?.['viewId']!==input.viewId)throw Error('逻辑视图发布缺少原正式工作区')
  this.#dataSet=dataSet;this.#file=file;this.#query=this.fileQuery()
  this.#proof=designProof(file.getEditingRow(input.viewId)?.['designJson'])
  this.scope();file.events.on('editingFieldChanged',this.#onFileInput)
 }
 /** 原发布尚有待处理阶段；即便文件已干净也参与关闭保护。 */
 get pending():boolean{return !this.finished&&(this.#busy||!!this.#output||!!this.#fileCapture||this.#phase==='file-confirmed')}
 /** 原意图已经确认或明确取消。 */
 get finished():boolean{return this.#phase==='done'||this.#phase==='cancelled'}
 /** 仅正式回执证明原文件和输出均确认；采用当前结果或退休不算成功。 */
 get published():boolean{return this.#phase==='done'}
 /** 至少文件阶段已确认，不表示输出也已提交。 */
 get fileConfirmed():boolean{return this.#fileConfirmed}
 /** 只能通过核验入口处理的原捕获，不用capture消失猜成功。 */
 get needsVerification():boolean{return [this.#fileCapture,this.#outputCapture].some(batch=>!!batch&&(!batch.verified||batch.receiptInvalid===true))}
 /** 原捕获尚未结束时不再派发；文件确认后允许下一次明确提交输出。 */
 get canSave():boolean{return !this.#busy&&!this.finished&&!this.needsVerification&&!this.#outputCapture
  &&(!this.#fileCapture||this.#fileCapture.resolution==='confirmed')&&!(this.#phase==='new'&&this.#output)}
 /** 明确采用当前结果入口；实际调用仍核原目标和后续修改证明。 */
 get canAcceptCurrent():boolean{return !this.#busy&&!this.finished&&(this.#outputCapture??this.#fileCapture)?.receiptInvalid===true}
 /** 原输出已经核验未生效，可明确结束其原草稿。 */
 get canRetireNotAppliedOutputs():boolean{return !this.#busy&&!this.finished&&this.#outputCapture?.verified===true&&this.#outputCapture.resolution==='not-applied'&&!this.#outputCapture.receiptInvalid}
 /** 仅表示没有未处理的派发；取消时仍核输出归属，不扩大清理范围。 */
 get canCancelBeforeDispatch():boolean{
  const file=this.#fileCapture
  return !this.#busy&&!this.finished&&!this.#outputCapture&&(!file||file.verified&&!file.receiptInvalid&&['not-applied','confirmed','accepted-current'].includes(file.resolution??''))
 }
 private fileQuery():string{return JSON.stringify([this.#file.queryContext,this.#file.filterExpression,this.#file.queryConfig])}
 private scope():void{
  this.input.assertCurrent();this.#assertScope()
  if(this.#disposed||this.#dataSet.destroyed||this.#file.destroyed||this.input.page.getDataSet(LowcodeLogicView.navigationScenarioId)!==this.#dataSet
   ||this.#dataSet.getView(LOGIC_VIEW_DESIGN_VIEW)!==this.#file||this.fileQuery()!==this.#query
   ||this.#metadata&&this.input.page.getDataSet(LowcodeLogicView.parameterScenarioId)!==this.#metadata)throw Error('原逻辑视图发布身份已变化')
 }
 private checkDesign(clean=false):void{
  this.scope();const id=this.input.viewId,row=this.#file.getEditingRow(id)
  if(!row||this.#file.getPkKey(row)!==id||row['viewId']!==id||this.#fileEdited||designProof(row['designJson'])!==this.#proof
   ||clean&&(this.#file.hasEditingChanges(id)||this.#file.dirtyTracking.hasPendingChanges(id)))throw Error('原设计已变化；新修改已保留，不能继续原输出发布')
 }
 private checkOutputs():void{
  if(this.#outputEdited)throw Error('原输出发布期间出现新修改，不能继续旧意图')
 }
 private recoveryQuery(view:DataView):string{return JSON.stringify([view.queryContext,view.filterExpression,view.queryConfig,view.fieldProjection])}
 private recoveryValues(view:DataView,id:string):RecoveryValues{
  const row=view.dirtyTracking.getPendingDeleteSnapshot(id)??view.getEditingRow(id)
  const keys=view===this.#file?['rowid','viewId','designJson']:['rowid','tblid','enname','cnname','description','DataType','IsPKey']
  return keys.map(key=>({present:!!row&&Object.hasOwn(row,key),value:row?.[key]}))
 }
 private captureRecoveryProof(batch:DataSpaceDefinitionCaptureBatch):void{
  if(this.#recoveryProofs.has(batch)||!batch.receiptInvalid)return
  this.#recoveryProofs.set(batch,batch.targets.map(target=>({target,query:this.recoveryQuery(target.view),draft:definitionTargetDraftSignature(target.view,target.ids),
   rows:target.ids.map(id=>({id,row:target.view.rows.find(row=>String(target.view.getPkKey(row))===id),values:structuredClone(this.recoveryValues(target.view,id))}))})))
 }
 private assertRecoveryProof(dataSet:DataSet,batch:DataSpaceDefinitionCaptureBatch):void{
  const proofs=this.#recoveryProofs.get(batch)
  if(!proofs?.length)throw Error('缺少原无效回执的恢复证明，不能采用当前结果')
  for(const {target,query,draft,rows} of proofs){
   const view=target.view
   if(view.destroyed||dataSet.getView(target.tableName,target.viewId)!==view||this.recoveryQuery(view)!==query
    ||definitionTargetDraftSignature(view,target.ids)!==draft
    ||rows.some(({id,row,values})=>view.rows.find(item=>String(view.getPkKey(item))===id)!==row
     ||this.recoveryValues(view,id).some((current,index)=>current.present!==values[index]?.present||!Object.is(current.value,values[index].value))))throw Error('原无效回执目标已变化，修改保留且不能采用当前结果')
  }
 }
 private part(input:Readonly<{dataSet:DataSet;tableName:string;viewId:string;ids:readonly string[];file:boolean}>):DataSpaceDefinitionSavePart{
  const targetId=input.dataSet.scenarioId
  const model=input.file?input.dataSet.getView(LowcodeLogicView.catalogMetaName,'editorTarget'):input.dataSet.getView(input.tableName,input.viewId)
  const modelId=model?.dataTable?.modelBinding?.modelId
  if(!targetId?.trim()||!modelId?.trim())throw Error('原发布缺少所属空间或正式根模型身份')
  return{dataSet:input.dataSet,targetId,modelId,
   prepare:()=>{this.checkDesign(!input.file);this.checkOutputs();return Promise.resolve()},
   apply:async()=>{
    if(!input.file)return
    const result=await this.#file.applyEditingRows([...input.ids])
    if(!result.success)throw Error(result.message??'设计原生编辑应用失败')
    this.checkDesign();if(this.#file.hasEditingChanges(this.input.viewId))throw Error('设计仍有未应用输入')
   },
   check:async()=>{this.checkDesign(!input.file);this.checkOutputs();if(!input.file){await this.#output?.verify();this.checkDesign(true);this.checkOutputs()}},
   targets:()=>[{tableName:input.tableName,viewId:input.viewId,ids:[...input.ids]}],
   dispatched:capture=>{if(input.file)this.#fileCapture=capture;else this.#outputCapture=capture},
   confirm:()=>{
    if(input.file){this.#fileConfirmed=true;this.#phase='file-confirmed';this.checkDesign(true)}
    else{this.finish();if(this.#fileEdited||this.#outputEdited)throw Error('原发布已确认，新修改已保留')}
    return Promise.resolve()
   },failed:stage=>{if(stage==='dispatched'){const capture=input.file?this.#fileCapture:this.#outputCapture;if(capture)this.captureRecoveryProof(capture)}},
  }
 }
 /** 预检、原生应用、文件确认、输出确认；任何失败保留实际阶段，不伪造跨来源回滚。 */
 async save():Promise<void>{
  this.scope();if(this.#busy||this.finished)throw Error('原发布意图已结束或正在处理')
  if(this.needsVerification)throw Error('原发布结果尚未确认，请先核验原捕获')
  if(this.#outputCapture)throw Error('原输出已派发，请明确结束原意图，不能重新提交')
  if(this.#fileCapture&&this.#fileCapture.resolution!=='confirmed')throw Error('原设计派发意图尚未结束，不能重新提交')
  this.#busy=true
  try{
   if(this.#phase==='new'){
    if(this.#output)throw Error('原输出暂存未完成，请先明确取消原意图')
    this.checkDesign()
    this.#output=await LowcodeLogicView.prepareOutputPublication({page:this.input.page,
     design:JSON.parse(String(this.#file.getEditingRow(this.input.viewId)?.['designJson'])),assertCurrent:()=>this.scope()})
    this.#metadata=this.input.page.getDataSet(LowcodeLogicView.parameterScenarioId)
    this.#outputView=this.#metadata?.getView('Base_TblField',LowcodeLogicView.outputFieldViewId)
    if(!this.#metadata||!this.#outputView)throw Error('原输出发布视图未装配')
    this.checkDesign()
    await this.#output.stage()
    this.checkDesign()
    this.#outputView.events.on('editingFieldChanged',this.#onOutputInput)
    await this.#output.apply();this.checkDesign();this.checkOutputs()
    await this.#output.verify();this.checkDesign();this.checkOutputs();this.#phase='prepared'
   }
   if(this.#phase==='prepared'){
    this.checkDesign();this.checkOutputs()
    if(this.#file.hasEditingChanges(this.input.viewId)||this.#file.dirtyTracking.hasPendingChanges(this.input.viewId)){
     await DataSpaceDefinitionSave.run([this.part({dataSet:this.#dataSet,tableName:LOGIC_VIEW_DESIGN_VIEW,viewId:this.#file.viewId,ids:[this.input.viewId],file:true})])
    }else{this.#fileConfirmed=true;this.#phase='file-confirmed'}
   }
   if(this.#phase==='file-confirmed'){
    this.checkDesign(true);this.checkOutputs()
    const metadata=this.#metadata,output=this.#output
    if(!metadata||!output)throw Error('原输出发布意图缺失')
    if(!output.ids.length){this.finish();return}
    await DataSpaceDefinitionSave.run([this.part({dataSet:metadata,tableName:'Base_TblField',viewId:LowcodeLogicView.outputFieldViewId,ids:output.ids,file:false})])
   }
  }finally{this.#busy=false}
 }
 /** 仅核原文件或输出捕获；确认后等待下一次显式保存，不自动派发下一阶段。 */
 async verify():Promise<void>{
  this.scope();if(this.#busy)throw Error('原发布正在处理')
  const output=this.#outputCapture,capture=output??this.#fileCapture,dataSet=output?this.#metadata:this.#dataSet
  if(!capture||!dataSet)throw Error('缺少原发布捕获，不能推测提交结果')
  this.#busy=true
  try{
   const result=await verifyDataSpaceDefinitionCapture(dataSet,capture)
   if(result==='accepted-current')throw Error('采用当前结果不能证明原输出发布成功')
   if(result==='not-applied')return
   if(output)this.finish()
   else{this.#fileConfirmed=true;this.#phase='file-confirmed';this.checkDesign(true);this.checkOutputs()}
  }catch(cause){this.captureRecoveryProof(capture);throw cause}finally{this.#busy=false}
 }
 /** 仅撤销尚未派发的本次输出暂存；已确认文件和文件新输入均保留。 */
 cancelBeforeDispatch():void{
  this.scope()
  if(!this.canCancelBeforeDispatch)throw Error('已有派发结果，不能撤回原发布意图')
  this.#output?.cancel();this.#phase='cancelled';this.removeListeners()
 }
 /** 原输出已核验未生效后，显式退休其原草稿；不重提或处理文件和参数。 */
 async retireNotAppliedOutputs():Promise<void>{
  this.scope()
  const capture=this.#outputCapture,metadata=this.#metadata,output=this.#output
  if(this.#busy||this.finished||!capture?.verified||capture.resolution!=='not-applied'||capture.receiptInvalid||!metadata||!output)throw Error('尚未确认原输出未生效，不能退休')
  this.checkOutputs();output.assertUnchanged();this.#busy=true
  try{
   const outcome=await verifyAndDiscardDataSpaceDefinitionCapture(metadata,capture,{acceptCurrentOnInvalidReceipt:false,discardLocalChanges:false})
   this.scope();this.checkOutputs()
   if(outcome!=='not-applied')throw Error('原输出未生效证明已变化，不能退休')
   this.#phase='cancelled';this.removeListeners()
  }finally{this.#busy=false}
 }
 /** 用户明确采用当前正式结果并退休；不证明原发布成功，不派发后续阶段。 */
 async acceptCurrentAndRetire():Promise<void>{
  this.scope()
  const output=this.#outputCapture,capture=output??this.#fileCapture,dataSet=output?this.#metadata:this.#dataSet
  if(this.#busy||this.finished||!capture?.receiptInvalid||!dataSet)throw Error('原发布没有待明确采用的无效回执')
  this.checkOutputs()
  if(!output){if(this.#fileEdited)throw Error('原文件出现新修改，不能采用当前结果');this.#output?.assertUnchanged()}
  this.assertRecoveryProof(dataSet,capture);this.#busy=true
  try{
   const outcome=await verifyAndDiscardDataSpaceDefinitionCapture(dataSet,capture,{acceptCurrentOnInvalidReceipt:true,discardLocalChanges:false})
   this.scope();this.checkOutputs()
   if(outcome!=='accepted-current')throw Error('采用当前结果未确认，原发布仍保留')
   if(!output)this.#output?.cancel()
   this.#phase='cancelled';this.removeListeners()
  }finally{this.#busy=false}
 }
 private finish():void{this.#phase='done';this.removeListeners()}
 private removeListeners():void{this.#file.events.off('editingFieldChanged',this.#onFileInput);this.#outputView?.events.off('editingFieldChanged',this.#onOutputInput)}
 /** 宿主释放时移除监听；不取消原数据层捕获或静默丢弃草稿。 */
 dispose():void{this.removeListeners();this.#disposed=true}
}
