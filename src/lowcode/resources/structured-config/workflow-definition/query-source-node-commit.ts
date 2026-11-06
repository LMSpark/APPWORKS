/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-source-node-commit
 * 职责：来源正式确认后，沿原节点DataView收口改绑与输出身份，保留原批次核验。
 * 边界：不保存模型或字段、不重做fork；新输出只取独立正式字段，未知结果不自动重放。
 */
import {RequestState,type DataSet,type DataView,type DataRow,type DataViewEditingFieldChangeEvent} from '@spark-appworks/spark-data'
import {DataSpaceDefinitionSave,definitionTargetDraftSignature,verifyDataSpaceDefinitionCapture,verifyAndDiscardDataSpaceDefinitionCapture,type DataSpaceDefinitionCaptureBatch} from '@/lowcode/data-space/model-source/data-space-definition-save'
import {buildWorkflowQueryOutput} from './query-output'
import {assertWorkflowOperationOutputIdentity,workflowOperationOutputText} from './operation-output'
import {resolveWorkflowOperationOutput} from './operation-output-source'
/** 来源阶段经正式回读确认的只读合同证明；不作草稿，恢复时不替换为后来出现的目标。 */
export type WorkflowConfirmedSource=Readonly<{
 /** 已确认的完整模型业务字段投影，包含来源身份及操作类型。 */
 model:Readonly<DataRow>
 /** 同阶段确认的所属字段投影；比较按字段身份与内容，不依赖服务端返回顺序。 */
 fields:ReadonlyArray<Readonly<DataRow>>
}>
type Input=Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;fromModelId:string;modelId:string;expectedSource:WorkflowConfirmedSource;operation?:'add'|'edit'|'delete'|'copy';nodeBefore:Readonly<DataRow>;fieldsBefore:ReadonlyArray<Readonly<DataRow>>;fieldIds:ReadonlyArray<Readonly<{from:string;to:string}>>;removedIds:readonly string[];assertCurrent():void}>
function read(view:DataView,row:DataRow,key:string):unknown{if(view.fieldAccess(row,key).read!=='visible')throw Error(`来源节点收口定义不可读: ${view.tableName}.${key}`);return row[key]}
function proof(row:Readonly<DataRow>,keys:readonly string[]):string{return JSON.stringify(keys.map(key=>[key,row[key]===undefined?['absent']:['value',row[key]]]))}
/** 一个已确认来源对应的原节点批次；记录值只用于不可编辑的原意图/回读证据。 */
export class WorkflowModelSourceNodeCommit{
 readonly #operation:NonNullable<Input['operation']>|'query'
 readonly #nodes:DataView
 readonly #models:DataView
 readonly #fields:DataView
 readonly #context:string
 readonly #columns:readonly string[]
 readonly #before:Readonly<DataRow>
 readonly #beforeFields:ReadonlyArray<Readonly<DataRow>>
 readonly #fieldIds:Input['fieldIds']
 readonly #removedIds:readonly string[]
 readonly #confirmedSource:WorkflowConfirmedSource
 #capture:DataSpaceDefinitionCaptureBatch|undefined
 #expected:Readonly<DataRow>|undefined
 #draft:string|undefined
 #staged=false
 #notApplied=false
 #notAppliedDraft:string|undefined
 #done=false
 #busy=false
 #lateEdit=false
 #stopWatching:(()=>void)|undefined
 /** 锁定已确认来源合同与原节点意图，建立私有回读视图；不暂存或派发写入。 */
 private constructor(private readonly input:Input){
  this.#confirmedSource=structuredClone(input.expectedSource)
  this.#operation=input.operation??'query'
  const nodes=input.dataSet.getView('Base_WorkflowNodeDefinition'),models=input.dataSet.getView('Base_DataModel','modelCatalog'),fields=input.dataSet.getView('Base_DataModel_Field','modelInputFields')
  if(!nodes||!models||!fields)throw Error('来源节点收口缺少正式视图')
  this.#nodes=nodes;this.#context=JSON.stringify([nodes.queryContext,nodes.filterExpression,nodes.queryConfig]);this.#columns=(nodes.queryConfig.fields??nodes.columns.map(column=>column.name)).filter(key=>key!=='_pk'&&!key.startsWith('lingma_sys_'))
  this.#before=structuredClone(input.nodeBefore);this.#beforeFields=structuredClone(input.fieldsBefore);this.#fieldIds=structuredClone(input.fieldIds);this.#removedIds=[...input.removedIds]
  if(this.#before['rowid']!==input.nodeId||this.#before['workflow_id']!==input.workflowId||this.#before[(this.#operation==='query'||this.#operation==='copy')?'node_config':'dataOperateModId']!==input.fromModelId||this.#before['node_type']!==this.#operation||String(this.#before['position_type'])!=='1'||this.#columns.some(key=>!Object.hasOwn(this.#before,key)))throw Error('来源节点原意图身份或投影不完整')
  if((this.#operation!=='query'&&this.#operation!=='copy'))assertWorkflowOperationOutputIdentity({workflowId:input.workflowId,modelId:input.fromModelId,fields:this.#beforeFields,original:this.#before['output_mapping']})
  const suffix=`workflowSourceCommit_${crypto.randomUUID().replaceAll('-','')}`
  this.#models=models.createQueryView(suffix);this.#models.queryContext={dataSpaceId:input.workflowId};this.#models.filterExpression={logic:'and',filters:[{field:'dataSetId',operator:'eq',value:input.workflowId},{field:'rowid',operator:'eq',value:input.modelId}]}
  this.#fields=fields.createQueryView(suffix);this.#fields.queryContext={dataSpaceId:input.workflowId,modelIds:[input.modelId]}
 }
 private guard():void{
  const {dataSet,workflowId,nodeId}=this.input;this.input.assertCurrent()
  const root=dataSet.getView('Base_WorkflowDefinition'),definition=root?.rows[0]
  if(dataSet.destroyed||this.#nodes.destroyed||dataSet.getView(this.#nodes.tableName,this.#nodes.viewId)!==this.#nodes||this.#nodes.queryContext['workflowId']!==workflowId||JSON.stringify([this.#nodes.queryContext,this.#nodes.filterExpression,this.#nodes.queryConfig])!==this.#context
   ||this.#nodes.requestState!==RequestState.Loaded||this.#nodes.loadingError||root?.queryContext['workflowId']!==workflowId||root.rows.length!==1||!definition||read(root,definition,'rowid')!==workflowId||!nodeId.trim())throw Error('来源节点收口实例或目标已变化')
 }
 private row():DataRow{this.guard();const rows=this.#nodes.rows.filter(row=>this.#nodes.getPkKey(row)===this.input.nodeId),row=rows[0];if(rows.length!==1||!row||read(this.#nodes,row,'workflow_id')!==this.input.workflowId)throw Error('来源节点不再唯一属于原流程');return row}
 private nodeProof(row:DataRow):string{for(const key of this.#columns)read(this.#nodes,row,key);return proof(row,this.#columns)}
 private original():void{const row=this.row();if(this.#nodes.hasEditingChanges(this.input.nodeId)||this.#nodes.dirtyTracking.hasPendingChanges(this.input.nodeId)||this.nodeProof(row)!==proof(this.#before,this.#columns))throw Error('来源节点出现独立修改，保留修改且不派发旧意图')}
 private async source():Promise<ReadonlyArray<Readonly<DataRow>>>{
  for(const view of [this.#models,this.#fields]){if(view.destroyed||this.input.dataSet.getView(view.tableName,view.viewId)!==view)throw Error('来源收口正式视图已失效');await view.refresh();this.guard();if(view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==view.total)throw Error('来源正式定义尚未完整回读')}
  const model=this.#models.rows[0];if(this.#models.rows.length!==1||!model||read(this.#models,model,'rowid')!==this.input.modelId||read(this.#models,model,'dataSetId')!==this.input.workflowId||read(this.#models,model,'requestType')!==this.#operation)throw Error('来源模型尚未正式确认或归属不符')
  if((this.#operation!=='query'&&this.#operation!=='copy')&&(read(this.#models,model,'Type')!=='数据库表'||this.#fields.rows.some(row=>read(this.#fields,row,'type')!=='inputParams')))throw Error('操作目标来源类型或输入字段用途不符')
  for(const row of this.#fields.rows){if(read(this.#fields,row,'dataSetId')!==this.input.workflowId||read(this.#fields,row,'dataModelId')!==this.input.modelId)throw Error('来源字段不属于已确认模型');for(const key of ['rowid','type','Name','AsName','FieldType','description','IsOutput','IsPKey'])read(this.#fields,row,key)}
  const keys=(view:DataView)=>(view.queryConfig.fields??view.columns.map(column=>column.name)).filter(key=>key!=='_pk'&&!key.startsWith('lingma_sys_')).sort()
  const fieldKeys=keys(this.#fields),modelKeys=keys(this.#models)
  for(const key of modelKeys)read(this.#models,model,key)
  for(const row of this.#fields.rows)for(const key of fieldKeys)read(this.#fields,row,key)
  const fieldProof=(rows:ReadonlyArray<Readonly<DataRow>>)=>rows.map(row=>proof(row,fieldKeys)).sort()
  if(proof(model,modelKeys)!==proof(this.#confirmedSource.model,modelKeys)||JSON.stringify(fieldProof(this.#fields.readSnapshot().rows))!==JSON.stringify(fieldProof(this.#confirmedSource.fields)))throw Error('已确认目标合同已变化，保留原节点意图')
  const result=this.#fields.readSnapshot().rows
  if(this.#expected&&this.#operation!=='query'&&this.#operation!=='copy'&&workflowOperationOutputText({output:await this.operationOutput(result),original:this.#before['output_mapping']})!==this.#expected['output_mapping'])throw Error('操作输出正式来源在原节点意图捕获后变化')
  return result
 }
 private operationOutput(fields:ReadonlyArray<Readonly<DataRow>>):Promise<Array<Record<string,unknown>>>{
  const operation=this.#operation;if(operation==='query'||operation==='copy')throw Error('查询输出不能使用操作合同')
  return resolveWorkflowOperationOutput({dataSet:this.input.dataSet,workflowId:this.input.workflowId,modelId:this.input.modelId,operation,model:this.#confirmedSource.model,fields,original:this.#before['output_mapping'],transition:{fromModelId:this.input.fromModelId,fields:this.#beforeFields,fieldIds:this.#fieldIds,removedIds:this.#removedIds},assertCurrent:()=>this.guard()})
 }
 private staged():void{
  this.guard();const row=this.row(),expected=this.#expected;if(!expected||this.#nodes.hasUnconfirmedSave||definitionTargetDraftSignature(this.#nodes,[this.input.nodeId])!==this.#draft||this.nodeProof(this.#nodes.getEditingRow(this.input.nodeId)??row)!==proof(expected,this.#columns))throw Error('原节点暂存后出现新修改，未重放旧意图')
  const patch=this.#nodes.getEditingPatch(this.input.nodeId)??{},diff=this.#nodes.dirtyTracking.getDiff(this.input.nodeId,row),keys=new Set([...Object.keys(patch),...Object.keys(diff)])
  if([...keys].some(key=>!((this.#operation==='query'||this.#operation==='copy')?['node_config','output_mapping']:['dataOperateModId','output_mapping']).includes(key))||this.#nodes.editActionState(row)!=='enabled'||[...keys].some(key=>this.#nodes.fieldAccess(row,key).write!=='allowed'))throw Error('当前查询不允许原节点切换字段或出现范围外修改')
 }
 private async readback():Promise<void>{
  this.guard();this.assertNoLaterEdit();if(!this.#expected)throw Error('缺少原节点切换意图');await this.source();this.assertNoLaterEdit()
  const view=this.#nodes.createQueryView(`sourceNodeRead_${crypto.randomUUID().replaceAll('-','')}`);view.filterExpression={logic:'and',filters:[{field:'workflow_id',operator:'eq',value:this.input.workflowId},{field:'rowid',operator:'eq',value:this.input.nodeId}]}
  try{await view.refresh();this.guard();const row=view.rows[0];if(view.loadingError||view.rows.length!==1||view.total!==1||!row)throw Error('原节点独立回读未完成');for(const key of this.#columns)read(view,row,key)
   this.assertNoLaterEdit();const current=proof(row,this.#columns)
   if(current===proof(this.#expected,this.#columns)){this.#done=true;this.release();return}
   if(this.#capture?.resolution==='accepted-current'&&current===proof(this.#before,this.#columns)){this.#notApplied=true;this.#notAppliedDraft=definitionTargetDraftSignature(this.#nodes,[this.input.nodeId]);throw Error('原节点切换已确认未生效，不会自动重放')}
   throw Error('原节点独立回读与精确意图不同，保留原目标')
  }finally{view.dataTable?.destroyView(view.viewId)}
 }
 private assertNoLaterEdit():void{
  if(this.#capture?.resolution==='confirmed'&&(this.#nodes.hasEditingChanges(this.input.nodeId)||this.#nodes.dirtyTracking.hasPendingChanges(this.input.nodeId)))this.#lateEdit=true
  if(!this.#lateEdit)return
  if(this.#nodes.hasEditingChanges(this.input.nodeId)||this.#nodes.dirtyTracking.hasPendingChanges(this.input.nodeId))throw Error('原节点提交后出现后续修改；保留修改，请明确选择放弃后再核验')
  this.#lateEdit=false
 }
 private watchLaterEdits():void{
  if(this.#stopWatching)return
  const listener=(event:DataViewEditingFieldChangeEvent)=>{if(String(event.rowId)===this.input.nodeId)this.#lateEdit=true}
  this.#nodes.events.on('editingFieldChanged',listener);this.#stopWatching=()=>this.#nodes.events.off('editingFieldChanged',listener)
 }
 private async submit():Promise<void>{
  await DataSpaceDefinitionSave.run([{dataSet:this.input.dataSet,targetId:this.input.workflowId,modelId:this.input.modelId,
   prepare:async()=>{await this.source();this.staged()},apply:async()=>{const result=await this.#nodes.applyEditingRows([this.input.nodeId]);if(!result.success)throw Error('原节点切换编辑未应用');this.#draft=definitionTargetDraftSignature(this.#nodes,[this.input.nodeId])},check:()=>this.staged(),targets:()=>[{tableName:this.#nodes.tableName,viewId:this.#nodes.viewId,ids:[this.input.nodeId]}],
   dispatched:capture=>{this.#capture=capture;this.watchLaterEdits()},confirm:()=>this.readback(),failed:()=>{}}])
 }
 /** 来源owner与无delta外层共用同一个幂等收口动作。 */
 async complete():Promise<void>{
  this.guard();if(this.#done)return;if(this.#capture)return this.verify();if(this.#busy)throw Error('原节点收口正在操作')
  this.#busy=true
  try{if(!this.#staged){this.original();const fields=await this.source();this.original()
    this.#expected=(this.#operation==='query'||this.#operation==='copy')?{...this.#before,node_config:this.input.modelId,output_mapping:JSON.stringify(buildWorkflowQueryOutput({workflowId:this.input.workflowId,modelId:this.input.modelId,fields,original:this.#before['output_mapping'],transition:{fromModelId:this.input.fromModelId,fields:this.#beforeFields,fieldIds:this.#fieldIds,removedIds:this.#removedIds}}))}:{...this.#before,dataOperateModId:this.input.modelId,output_mapping:workflowOperationOutputText({output:await this.operationOutput(fields),original:this.#before['output_mapping']})}
    this.original()
    const changed=((this.#operation==='query'||this.#operation==='copy')?['node_config','output_mapping']:['dataOperateModId','output_mapping']).filter(key=>this.#expected?.[key]!==this.#before[key]);if(!changed.length){await this.readback();return}
    const row=this.row();if(this.#nodes.editActionState(row)!=='enabled'||changed.some(key=>this.#nodes.fieldAccess(row,key).write!=='allowed'))throw Error('当前查询不允许节点来源切换')
    for(const key of changed)this.#nodes.updateEditingValue(this.input.nodeId,key,this.#expected[key]);this.#staged=true;this.#draft=definitionTargetDraftSignature(this.#nodes,[this.input.nodeId])
   }
   await this.submit()
  }finally{this.#busy=false}
 }
 /** 只核验原节点捕获；无效回执必须显式选择原范围读回。 */
 async verify(acceptCurrent=false):Promise<void>{
  this.guard();if(this.#done)return;if(this.#busy)throw Error('原节点收口正在核验');if(!this.#capture)throw Error('原节点尚未取得提交捕获')
  if(acceptCurrent&&this.#capture.receiptInvalid&&!this.#nodes.hasUnconfirmedSave){this.assertNoLaterEdit();if(definitionTargetDraftSignature(this.#nodes,[this.input.nodeId])!==this.#draft)throw Error('原节点存在后续修改，保留修改且不采用当前结果')}
  this.#busy=true
  try{const outcome=await verifyDataSpaceDefinitionCapture(this.input.dataSet,this.#capture,acceptCurrent);this.guard();if(outcome==='not-applied'){this.#notApplied=true;this.#notAppliedDraft=definitionTargetDraftSignature(this.#nodes,[this.input.nodeId]);throw Error('原节点切换已确认未生效，不会自动重放')}await this.readback()}finally{this.#busy=false}
 }
 /** 显式重提已独立确认未生效的同一节点；不保存来源或重新fork。 */
 async resubmitNotApplied():Promise<void>{
  this.guard();if(!this.#notApplied||this.#busy)throw Error('原节点未取得可重提证明');this.#busy=true
  try{if(definitionTargetDraftSignature(this.#nodes,[this.input.nodeId])!==this.#notAppliedDraft)throw Error('原节点核验后出现新修改，保留修改且不重提');this.#nodes.discardPendingChanges([this.input.nodeId]);await this.#nodes.refresh();this.original();await this.source();this.#capture=undefined;this.#staged=false;this.#notApplied=false;this.#notAppliedDraft=undefined}finally{this.#busy=false}
  await this.complete()
 }
 /** 用户明确放弃原节点后续本地修改后，只核验原捕获，不重放提交。 */
 async discardLocalChangesAndVerify():Promise<void>{
  this.guard();if(!this.#capture||!this.#lateEdit||this.#busy)throw Error('原节点没有待明确放弃的后续修改');this.#busy=true
  try{const outcome=await verifyAndDiscardDataSpaceDefinitionCapture(this.input.dataSet,this.#capture,{acceptCurrentOnInvalidReceipt:true,discardLocalChanges:true});this.guard();this.#lateEdit=false
   if(outcome==='not-applied'){this.#notApplied=true;this.#notAppliedDraft=definitionTargetDraftSignature(this.#nodes,[this.input.nodeId]);throw Error('原节点切换已确认未生效，不会自动重放')}await this.readback()
  }finally{this.#busy=false}
 }
 getState(){return{complete:this.#done,notApplied:this.#notApplied,dispatched:!!this.#capture,canAcceptCurrent:this.#capture?.receiptInvalid===true,canDiscardLocalChanges:this.#lateEdit,nodeId:this.input.nodeId,modelId:this.input.modelId}}
 private release():void{this.#stopWatching?.();this.#stopWatching=undefined;for(const view of [this.#models,this.#fields])if(!view.hasUnconfirmedSave&&!view.hasEditingChanges()&&!view.dirtyTracking.hasPendingChanges())view.dataTable?.destroyView(view.viewId)}
 /** 捕获正式原节点身份，尚不暂存或提交。 */
 static open(input:Input):WorkflowModelSourceNodeCommit{const owner=new WorkflowModelSourceNodeCommit(input);try{owner.original();return owner}catch(cause){owner.release();throw cause}}
}
export function openWorkflowQuerySourceNodeCommit(input:Input):WorkflowModelSourceNodeCommit{return WorkflowModelSourceNodeCommit.open(input)}
