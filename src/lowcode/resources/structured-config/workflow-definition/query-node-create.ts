/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-node-create
 * 职责：为已存在的普通空节点首次绑定来源或操作目标，保留模型与节点分别确认的身份。
 * 边界：复用原模型owner和DataSet保存核验，不创建第二节点，不执行流程或自动删除已确认模型。
 */
import {RequestState,type DataRow,type DataView} from '@spark-appworks/spark-data'
import {openWorkflowQueryModelCreate,openWorkflowCopyModelCreate,openWorkflowOperationModelCreate,type WorkflowDataOperation} from './query-model-create'
import {buildWorkflowQueryOutput} from './query-output'
import {DataSpaceDefinitionSave,definitionTargetDraftSignature,verifyDataSpaceDefinitionCapture,verifyAndDiscardDataSpaceDefinitionCapture,type DataSpaceDefinitionCaptureBatch} from '@/lowcode/data-space/model-source/data-space-definition-save'
import {assertWorkflowOutputUnpublished} from './output-fields'
import {loadWorkflowOperationOutput,resolveWorkflowOperationOutput} from './operation-output-source'
import {workflowOperationOutputTarget} from './operation-output'
import {assertOriginalWorkflowNodeEmpty,validateWorkflowNodeTypeChanges,type WorkflowNodeOriginal} from './node-definition'
import {workflowFieldChanges} from './query-field-context'

type Input=Parameters<typeof openWorkflowQueryModelCreate>[0]&Readonly<{
 /** 原节点DataView已经生成的身份，待新增与正式空节点使用同一合同。 */
 nodeId:string
}>
type Model=Awaited<ReturnType<typeof openWorkflowQueryModelCreate>>
/** 原节点绑定的类型与首轮正式合同。 */
type BindingMode=Readonly<{
 /** 用户为该原节点选定的操作类型。 */
 operation:'query'|'copy'|WorkflowDataOperation
 /** 不随读取或恢复重置的原正式状态。 */
 original:WorkflowNodeOriginal
 /** 调用方在原节点上明确作出的类型变更。 */
 typeChanged:boolean
}>
function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`查询节点定义字段不可读: ${field}`)
 return row[field]
}
/** 在同一原节点首次绑定模型；不接受缺失nodeId，也不负责追加节点。 */
export async function openWorkflowNodeModelBinding(input:Input):Promise<WorkflowNodeModelBinding>{return WorkflowNodeModelBinding.open(input)}
const nodeFields=['workflow_id','position_type','node_type','node_config','dataOperateModId','name','description','input_mapping','output_mapping','config']

/** 一次原节点首次模型绑定；模型与节点分别确认，不假定跨表事务。 */
export class WorkflowNodeModelBinding {
 /** 捕获宿主原类型后打开首次绑定；构造过程只允许本命令完成。 */
 static async open(input:Input):Promise<WorkflowNodeModelBinding>{
 const nodes=input.dataSet.getView('Base_WorkflowNodeDefinition'),node=nodes?.rows.find(row=>nodes.getPkKey(row)===input.nodeId)
 if(!nodes||!node||nodes.queryContext['workflowId']!==input.workflowId||nodes.requestState!==RequestState.Loaded||nodes.hasUnconfirmedSave)throw Error('原节点查询身份未就绪')
 const effective=nodes.getEditingRow(input.nodeId)??node,operation=effective['node_type']
 read(nodes,node,'node_type')
 for(const field of ['workflow_id','position_type','output_mapping'])read(nodes,node,field)
 if(effective['workflow_id']!==input.workflowId||String(effective['position_type'])!=='1')throw Error('首次绑定仅接受当前工作流普通节点')
 if(operation!=='query'&&operation!=='copy'&&operation!=='add'&&operation!=='edit'&&operation!=='delete')throw Error('当前节点不需要绑定来源或目标模型')
 for(const field of ['node_config','dataOperateModId'])for(const current of [node,effective])if(read(nodes,current,field)!==undefined&&current[field]!==null&&current[field]!=='')throw Error('节点已有模型绑定，请使用原换源入口')
 const pending=nodes.dirtyTracking.isPendingCreate(input.nodeId)
 const typeChange=nodes.dirtyTracking.getDiff(input.nodeId,node)['node_type'],formalKind=typeChange?typeChange.from:read(nodes,node,'node_type')
 if(!pending&&typeof formalKind!=='string')throw Error('节点原正式类型缺失')
 const original:WorkflowNodeOriginal={pending,...!pending&&typeof formalKind==='string'?{kind:formalKind}:{}}
 const typeChanged=Object.hasOwn(workflowFieldChanges(nodes,node,input.nodeId),'node_type')
 if((pending?nodes.addActionState():nodes.editActionState(node))!=='enabled')throw Error('当前查询不允许绑定节点模型')
 assertWorkflowOutputUnpublished(read(nodes,node,'output_mapping'));assertWorkflowOutputUnpublished(effective['output_mapping'])
 const signature=()=>{
  const current=nodes.rows.find(row=>nodes.getPkKey(row)===input.nodeId);if(!current)throw Error('原节点已不属于当前查询')
  return JSON.stringify([nodes.queryContext,nodes.queryConfig,nodes.filterExpression,nodeFields.map(field=>{read(nodes,current,field);return(nodes.getEditingRow(input.nodeId)??current)[field]}),definitionTargetDraftSignature(nodes,[input.nodeId])])
 }
 const baseline=signature()
 const assertCurrent=()=>{input.assertCurrent();if(signature()!==baseline)throw Error('节点来源选择期间原草稿或查询已变化')}
 await validateWorkflowNodeTypeChanges({...input,nodeIds:[input.nodeId]});assertCurrent()
 await assertOriginalWorkflowNodeEmpty({...input,assertCurrent,original,desiredKind:operation,typeChanged})
 const model=operation==='query'?await openWorkflowQueryModelCreate(input):operation==='copy'?await openWorkflowCopyModelCreate(input):await openWorkflowOperationModelCreate(input,operation)
 if(signature()!==baseline)throw Error('节点来源选择期间原草稿或查询已变化')
 return new WorkflowNodeModelBinding(input,model,nodes,{operation,original,typeChanged})

 }

 #modelId:string|undefined
 readonly #nodeId:string
 #nodeValues:Readonly<Record<string,unknown>>|undefined
 #nodeSignature:string|undefined
 #nodeCapture:DataSpaceDefinitionCaptureBatch|undefined
 #nodeSaved=false
 #nodeNotApplied=false
 #operationTarget:string|undefined
 #complete=false
 #saving=false
 readonly #nodeContext:string
 readonly #initialNodeSignature:string
 readonly #initialNodeValues:Readonly<Record<string,unknown>>
 /** 原查询模型创建owner，保留来源预览、取消及未知批次核验。 */
 readonly model:Pick<Model,'getState'|'preview'|'setName'>
 /** 组合已打开的原模型owner与当前节点视图；只捕获上下文，不创建或提交记录。 */
 private constructor(private readonly input:Input,private readonly modelOwner:Model,private readonly nodes:DataView,private readonly mode:BindingMode){
  this.model={getState:modelOwner.getState,preview:modelOwner.preview,setName:modelOwner.setName}
  this.#nodeId=input.nodeId
  this.#nodeContext=JSON.stringify([nodes.queryContext,nodes.queryConfig,nodes.filterExpression])
  this.#initialNodeValues=this.values();this.#initialNodeSignature=JSON.stringify(this.#initialNodeValues)
 }
 private get operation(){return this.mode.operation}
 private get original(){return this.mode.original}
 private get sourceModel():boolean{return this.operation==='query'||this.operation==='copy'}
 /** 已独立确认的模型身份；失败后仍用于继续原节点创建。 */
 get modelId():string|undefined{return this.#modelId}
 /** 原生新增行的唯一节点身份，核验时不得生成新身份。 */
 get nodeId():string{return this.#nodeId}
 /** 当前节点是否已经捕获绑定提交意图；行存在不等于绑定已派发。 */
 get nodeCaptured():boolean{return this.#nodeSignature!==undefined}
 /** 原节点捕获后存在后续本地编辑，需显式选择恢复而非重发。 */
 get canDiscardNodeLocalChanges():boolean{
  if(this.#complete)return false
  if(!this.#nodeCapture)return this.#modelId!==undefined&&(this.#nodeSignature?definitionTargetDraftSignature(this.nodes,[this.#nodeId])!==this.#nodeSignature:this.targetSignature()!==this.#initialNodeSignature)
  if(this.#nodeCapture.resolution==='confirmed')return this.nodes.hasEditingChanges(this.#nodeId)||this.nodes.dirtyTracking.hasPendingChanges(this.#nodeId)
  return definitionTargetDraftSignature(this.nodes,[this.#nodeId])!==this.#nodeSignature
 }
 /** 原节点批次已独立确认未生效；核验入口不得再次派发创建。 */
 get nodeNotApplied():boolean{return this.#nodeNotApplied}
 /** 保留来源预览、原保存捕获和模型已成功但节点未确认的状态。 */
 get pending():boolean{return this.#saving||this.model.getState().pending||this.#modelId!==undefined&&!this.#complete}
 private scope():void{
  const {dataSet,workflowId}=this.input;this.input.assertCurrent()
  if(dataSet.destroyed||this.nodes.destroyed||dataSet.getView('Base_WorkflowNodeDefinition')!==this.nodes
   ||this.nodes.queryContext['workflowId']!==workflowId||JSON.stringify([this.nodes.queryContext,this.nodes.queryConfig,this.nodes.filterExpression])!==this.#nodeContext)throw Error('节点首次绑定目标已变化')
  const definition=dataSet.getView('Base_WorkflowDefinition'),row=definition?.rows[0]
  if(definition?.queryContext['workflowId']!==workflowId||definition.rows.length!==1||!row
   ||read(definition,row,'rowid')!==workflowId)throw Error('工作流定义身份已变化')
 }
 private guard(checkInitial=true):void{
  this.scope()
  const values=this.values()
  if(values['workflow_id']!==this.input.workflowId||String(values['position_type'])!=='1'||values['node_type']!==this.operation)throw Error('原节点类型或归属已变化')
  if(checkInitial&&!this.#nodeSignature&&this.targetSignature()!==this.#initialNodeSignature)throw Error('节点来源选择期间原草稿已变化')
 }
 private values():Record<string,unknown>{
  const row=this.nodes.rows.find(candidate=>this.nodes.getPkKey(candidate)===this.#nodeId)
  if(!row)throw Error('待绑定的原节点不存在')
  const effective=this.nodes.getEditingRow(this.#nodeId)??row
  return Object.fromEntries(nodeFields.map(field=>{read(this.nodes,row,field);return[field,effective[field]]}))
 }
 private targetSignature():string{return JSON.stringify(this.values())}
 private preflightNode():void{
  this.guard()
  if(this.nodes.requestState!==RequestState.Loaded||this.nodes.loadingError||this.nodes.mutating||this.nodes.hasUnconfirmedSave
  )throw Error('当前节点尚未完成原查询或提交核验')
  const row=this.nodes.rows.find(candidate=>this.nodes.getPkKey(candidate)===this.#nodeId)
  if(!row)throw Error('原节点不存在')
  const pending=this.nodes.dirtyTracking.isPendingCreate(this.#nodeId)
  if((pending?this.nodes.addActionState():this.nodes.editActionState(row))!=='enabled')throw Error('当前查询不允许绑定节点模型')
  const values=this.values()
  if(['node_config','dataOperateModId'].some(field=>values[field]!==undefined&&values[field]!==null&&values[field]!==''))throw Error('节点已有模型绑定，请使用原换源入口')
  for(const field of pending?nodeFields:this.sourceModel?['node_config','output_mapping']:['dataOperateModId','output_mapping']){
   if((pending?this.nodes.newRowFieldAccess(field):this.nodes.fieldAccess(row,field)).write!=='allowed')throw Error(`当前查询不允许写入节点字段: ${field}`)
  }
 }
 private async stageBinding():Promise<void>{
  this.preflightNode()
  const {dataSet,workflowId}=this.input,modelId=this.#modelId
  const models=dataSet.getView('Base_DataModel','modelCatalog'),model=models?.rows.find(row=>models.getPkKey(row)===modelId)
  const template=dataSet.getView('Base_DataModel_Field','modelInputFields')
  if(!modelId||!models||!model||!template||read(models,model,'dataSetId')!==workflowId||read(models,model,'requestType')!==this.operation)throw Error('查询模型尚未独立确认或归属不符')
  const modelName=read(models,model,'Name');if(typeof modelName!=='string'||modelName.length===0)throw Error('查询模型名称缺失')
  const fields=template.createQueryView(`queryNodeFields:${modelId}`)
  let output:Array<Record<string,unknown>>
  try{
   fields.queryContext={...template.queryContext,dataSpaceId:workflowId,modelIds:[modelId]}
   await fields.refresh();this.guard()
   if(fields.loadingError||fields.requestState!==RequestState.Loaded||fields.rows.length!==fields.total)throw Error('查询模型字段未完整读取')
   const formalFields=fields.rows.map(row=>Object.fromEntries(['rowid','dataSetId','dataModelId','type','IsOutput','IsPKey','AsName','Name','FieldType','description'].map(field=>[field,read(fields,row,field)])))
   const operation=this.operation
   if(operation==='query'||operation==='copy')output=buildWorkflowQueryOutput({workflowId,modelId,fields:formalFields})
   else{const formalModel=Object.fromEntries(['rowid','dataSetId','Type','requestType','DbId','DbName','MetaName'].map(key=>[key,read(models,model,key)])),target={workflowId,modelId,operation,model:formalModel};this.#operationTarget=JSON.stringify(workflowOperationOutputTarget(target));output=await resolveWorkflowOperationOutput({...target,dataSet,fields:formalFields,assertCurrent:()=>this.preflightNode()})}
  }finally{fields.dataTable?.destroyView(fields.viewId)}
  this.preflightNode()
  const patch:Record<string,unknown>=this.sourceModel?{node_config:modelId,output_mapping:JSON.stringify(output)}:{dataOperateModId:modelId,output_mapping:JSON.stringify(output)}
  for(const [field,value] of Object.entries(patch))this.nodes.updateEditingValue(this.#nodeId,field,value)
  this.#nodeValues={workflow_id:workflowId,position_type:this.values()['position_type'],node_type:this.operation,...patch}
  this.#nodeSignature=definitionTargetDraftSignature(this.nodes,[this.#nodeId])
 }
 private async readback():Promise<void>{
  const nodeId=this.#nodeId,values=this.#nodeValues
  if(!nodeId||!values)throw Error('原查询节点创建身份缺失')
  if(this.nodes.hasPendingSavedRowPermissions){await this.nodes.refreshSavedRowPermissions();this.guard()}
  const view=this.nodes.createQueryView(`queryNodeVerify:${nodeId}`)
  try{
   view.filterExpression={logic:'and',filters:[{field:'workflow_id',operator:'eq',value:this.input.workflowId},{field:'rowid',operator:'eq',value:nodeId}]}
   await view.refresh();this.guard()
   const row=view.rows[0]
   if(view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==1||view.total!==1||!row||read(view,row,'rowid')!==nodeId
    ||Object.entries(values).some(([field,value])=>!Object.is(read(view,row,field),value)))throw Error('查询节点独立回读与原创建意图不一致')
   this.#complete=true
  }finally{view.dataTable?.destroyView(view.viewId)}
 }
 private assertNodeIntent():void{
  const nodeId=this.#nodeId
  if(!nodeId||!this.#nodeSignature||definitionTargetDraftSignature(this.nodes,[nodeId])!==this.#nodeSignature)throw Error('节点后续修改与原创建意图不同，请保留修改并明确处理')
 }
 /** 保存或核验同一创建意图；已确认模型及节点不重复提交。 */
 async save():Promise<string>{
  this.scope()
  if(this.#saving)throw Error('查询节点正在保存')
  if(this.#complete&&this.#nodeId)return this.#nodeId
  if(this.#nodeNotApplied)throw Error('原查询节点创建已确认未生效；核验不会重新提交，请明确选择重新提交原节点')
  this.#saving=true
  try{
   if(!this.#modelId){
    const state=this.model.getState()
    if(state.status==='ready'){
     this.preflightNode();await validateWorkflowNodeTypeChanges({...this.input,nodeIds:[this.#nodeId]})
     await assertOriginalWorkflowNodeEmpty({...this.input,original:this.original,desiredKind:this.operation,typeChanged:this.mode.typeChanged,assertCurrent:()=>this.guard()})
     this.#modelId=await this.modelOwner.save()
    }
    else{
     const checked=await this.modelOwner.verify()
     if(!checked.confirmed||!checked.modelId)throw Error('原查询模型新增尚未确认，请核验原批次')
     this.#modelId=checked.modelId
    }
   }
   this.guard()
   if(!this.#nodeSignature)await this.stageBinding()
   const nodeId=this.#nodeId,modelId=this.#modelId
   if(!nodeId||!modelId)throw Error('原节点或已确认模型身份缺失')
   if(!this.#nodeSaved){
    this.assertNodeIntent()
    try{
     if(this.#nodeCapture){
      const outcome=await verifyDataSpaceDefinitionCapture(this.input.dataSet,this.#nodeCapture)
      if(outcome==='not-applied')throw Error('SPARK_SAVE_NOT_APPLIED：原节点绑定已确认未生效')
      this.#nodeSaved=true
     }else await DataSpaceDefinitionSave.run([{dataSet:this.input.dataSet,targetId:this.input.workflowId,modelId,
      prepare:async()=>{this.assertNodeIntent();const assertCurrent=()=>{this.guard();this.assertNodeIntent()};await assertOriginalWorkflowNodeEmpty({...this.input,original:this.original,desiredKind:this.operation,typeChanged:this.mode.typeChanged,assertCurrent});const operation=this.operation;if(operation!=='query'&&operation!=='copy'){const contract=await loadWorkflowOperationOutput({dataSet:this.input.dataSet,workflowId:this.input.workflowId,modelId,operation,assertCurrent});if(JSON.stringify(contract.output)!==this.#nodeValues?.['output_mapping']||JSON.stringify(contract.target)!==this.#operationTarget)throw Error('操作输出正式目标在绑定意图捕获后变化')}},
      apply:async()=>{const intended=JSON.stringify(this.values()),applied=await this.nodes.applyEditingRows([nodeId]);if(!applied.success)throw Error(applied.message??'原节点绑定编辑未应用');this.guard(false);if(JSON.stringify(this.values())!==intended)throw Error('节点绑定应用期间出现后续修改；保留原草稿');this.#nodeSignature=definitionTargetDraftSignature(this.nodes,[nodeId])},
      check:()=>{this.guard();this.assertNodeIntent()},targets:()=>[{tableName:this.nodes.tableName,viewId:this.nodes.viewId,ids:[nodeId]}],dispatched:capture=>{this.#nodeCapture=capture},confirm:()=>{this.#nodeSaved=true;return Promise.resolve()},failed:()=>{},
     }])
    }catch(cause){
     if(cause instanceof Error&&cause.message.includes('SPARK_SAVE_NOT_APPLIED'))this.#nodeNotApplied=true
     throw cause
    }
    this.#nodeSaved=true
   }
   await this.readback()
   return nodeId
  }finally{this.#saving=false}
 }
 /** 仅取消未提交的来源预览；部分成功保留原身份，不静默删除正式模型。 */
 cancel():void{
  this.scope()
  if(this.#saving||this.#modelId||this.#nodeSignature)throw Error('查询模型或节点已提交，请继续核验原绑定')
  this.modelOwner.discard()
 }
 /** 明确放弃已确认未生效的原模型批次；不重发创建请求。 */
 async abandonNotApplied():Promise<void>{this.scope();await this.modelOwner.abandonNotApplied()}
 /** 明确撤销原模型目标的后续本地修改并核验；确认身份仍交本命令继续创建节点。 */
 async discardModelLocalChanges():Promise<void>{this.scope();this.#modelId=await this.modelOwner.discardLocalChanges()}
 /** 用户明确放弃原节点后续修改后，沿共享捕获核验原批次，不重新注册模型或派发节点。 */
 async discardNodeLocalChanges():Promise<string>{
  this.scope();if(this.#saving)throw Error('原节点绑定正在核验')
  if(!this.#nodeCapture){
   if(!this.#modelId||this.nodes.hasUnconfirmedSave)throw Error('原节点没有可恢复的自有提交捕获')
   const current=this.values()
   for(const [field,value] of Object.entries(this.#initialNodeValues))if(!Object.is(current[field],value))this.nodes.updateEditingValue(this.#nodeId,field,value)
   this.#nodeSignature=undefined;this.#nodeValues=undefined
   this.guard();return this.save()
  }
  const outcome=await verifyAndDiscardDataSpaceDefinitionCapture(this.input.dataSet,this.#nodeCapture,{acceptCurrentOnInvalidReceipt:true,discardLocalChanges:true})
  this.scope();if(outcome==='not-applied'){this.#nodeNotApplied=true;this.#nodeSignature=definitionTargetDraftSignature(this.nodes,[this.#nodeId]);throw Error('原节点绑定已确认未生效，不会自动重发')}
  this.#nodeSaved=true;await this.readback();return this.#nodeId
 }
 /** 独立确认未生效后显式重提同一节点；原身份及创建字段必须保持不变。 */
 async resubmitNotApplied():Promise<string>{
  this.guard()
  if(!this.#nodeNotApplied||this.#saving||this.nodes.hasUnconfirmedSave)throw Error('原节点尚未确认未生效，不能重新提交')
  this.assertNodeIntent();this.#nodeNotApplied=false;this.#nodeCapture=undefined
  return this.save()
 }
}
