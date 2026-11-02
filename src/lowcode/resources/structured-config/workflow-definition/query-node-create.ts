/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-node-create
 * 职责：先确认查询模型及字段，再将对应节点提交到同一工作流DataSet，保留部分成功身份。
 * 边界：复用原模型owner和DataSet保存核验，不执行流程，不重建权限，不自动删除已确认模型。
 */
import {RequestState,type DataRow,type DataView} from '@spark-appworks/spark-data'
import {openWorkflowQueryModelCreate} from './query-model-create'
import {definitionTargetDraftSignature} from '@/lowcode/data-space/model-source/data-space-definition-save'

type Input=Parameters<typeof openWorkflowQueryModelCreate>[0]
type Model=Awaited<ReturnType<typeof openWorkflowQueryModelCreate>>
function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`查询节点定义字段不可读: ${field}`)
 return row[field]
}
function text(value:unknown):string{return typeof value==='string'?value:''}
function id():string{return crypto.randomUUID().replaceAll('-','').toUpperCase()}

/** 一次来源选择的节点创建命令；模型与节点分别确认，不假定跨表事务。 */
export class WorkflowQueryNodeCreate {
 #modelId:string|undefined
 #nodeId:string|undefined
 #nodeValues:Readonly<Record<string,unknown>>|undefined
 #nodeSignature:string|undefined
 #nodeSaved=false
 #nodeNotApplied=false
 #complete=false
 #saving=false
 readonly #nodeContext:string
 /** 原查询模型创建owner，保留来源预览、取消及未知批次核验。 */
 readonly model:Pick<Model,'getState'|'preview'|'setName'>
 constructor(private readonly input:Input,private readonly modelOwner:Model,private readonly nodes:DataView){
  this.model={getState:modelOwner.getState,preview:modelOwner.preview,setName:modelOwner.setName}
  this.#nodeContext=JSON.stringify(nodes.queryContext)
 }
 /** 已独立确认的模型身份；失败后仍用于继续原节点创建。 */
 get modelId():string|undefined{return this.#modelId}
 /** 原生新增行的唯一节点身份，核验时不得生成新身份。 */
 get nodeId():string|undefined{return this.#nodeId}
 /** 原节点批次已独立确认未生效；核验入口不得再次派发创建。 */
 get nodeNotApplied():boolean{return this.#nodeNotApplied}
 /** 保留来源预览、原保存捕获和模型已成功但节点未确认的状态。 */
 get pending():boolean{return this.#saving||this.model.getState().pending||this.#modelId!==undefined&&!this.#complete}
 private guard():void{
  const {dataSet,workflowId}=this.input;this.input.assertCurrent()
  if(dataSet.destroyed||this.nodes.destroyed||dataSet.getView('Base_WorkflowNodeDefinition')!==this.nodes
   ||this.nodes.queryContext['workflowId']!==workflowId||JSON.stringify(this.nodes.queryContext)!==this.#nodeContext)throw Error('查询节点创建目标已变化')
  const definition=dataSet.getView('Base_WorkflowDefinition'),row=definition?.rows[0]
  if(definition?.queryContext['workflowId']!==workflowId||definition.rows.length!==1||!row
   ||read(definition,row,'rowid')!==workflowId)throw Error('工作流定义身份已变化')
 }
 private preflightNode():void{
  this.guard()
  if(this.nodes.requestState!==RequestState.Loaded||this.nodes.loadingError||this.nodes.mutating||this.nodes.hasUnconfirmedSave
   ||this.nodes.addActionState()!=='enabled')throw Error('当前查询不允许新增查询节点')
  for(const field of ['workflow_id','position_type','node_type','node_config','name','description','input_mapping','output_mapping','config']){
   if(this.nodes.newRowFieldAccess(field).write!=='allowed')throw Error(`当前查询不允许新增节点字段: ${field}`)
  }
 }
 private async stageNode():Promise<void>{
  this.preflightNode()
  const {dataSet,workflowId}=this.input,modelId=this.#modelId
  const models=dataSet.getView('Base_DataModel','modelCatalog'),model=models?.rows.find(row=>models.getPkKey(row)===modelId)
  const template=dataSet.getView('Base_DataModel_Field','modelInputFields')
  if(!modelId||!models||!model||!template||read(models,model,'dataSetId')!==workflowId||read(models,model,'requestType')!=='query')throw Error('查询模型尚未独立确认或归属不符')
  const name=text(read(models,model,'Name')),description=text(read(models,model,'description'))
  if(!name)throw Error('查询模型名称缺失')
  const fields=template.createQueryView(`queryNodeFields:${modelId}`)
  let output:Array<Record<string,unknown>>
  try{
   fields.queryContext={...template.queryContext,dataSpaceId:workflowId,modelIds:[modelId]}
   await fields.refresh();this.guard()
   if(fields.loadingError||fields.requestState!==RequestState.Loaded||fields.rows.length!==fields.total)throw Error('查询模型字段未完整读取')
   const items=id(),names=new Set<string>(),identities=new Set<string>()
   output=[{rowid:items,pid:null,Name:'items',Description:'数据项',FieldType:'Array',isParent:true},
    {rowid:id(),pid:null,Name:'Count',Description:'数据总数',FieldType:'int',isParent:false}]
   for(const row of fields.rows){
    if(read(fields,row,'dataSetId')!==workflowId||read(fields,row,'dataModelId')!==modelId)throw Error('查询字段不属于当前模型')
    const fieldId=read(fields,row,'rowid'),type=read(fields,row,'type'),flag=read(fields,row,'IsOutput')
    if(typeof fieldId!=='string'||!fieldId||identities.has(fieldId)||!['dataModel','inputParams'].includes(text(type))||![0,1,'0','1'].includes(flag as string|number))throw Error('查询字段身份、用途或输出标志无效')
    identities.add(fieldId)
    if(type!=='dataModel'||Number(flag)!==1)continue
    const fieldName=text(read(fields,row,'AsName'))||text(read(fields,row,'Name')),fieldType=text(read(fields,row,'FieldType'))
    if(!fieldName||!fieldType||names.has(fieldName))throw Error('查询输出名称或类型缺失或重复')
    names.add(fieldName)
    output.push({rowid:fieldId,pid:items,Name:fieldName,Description:text(read(fields,row,'description')),FieldType:fieldType,isParent:false})
   }
  }finally{fields.dataTable?.destroyView(fields.viewId)}
  this.preflightNode()
  const values={workflow_id:workflowId,position_type:1,node_type:'query',node_config:modelId,name,description,input_mapping:'[]',output_mapping:JSON.stringify(output),config:''}
  const row=await this.nodes.addRow(values),nodeId=this.nodes.getPkKey(row)
  if(typeof nodeId!=='string'||!nodeId)throw Error('查询节点未取得原生新增身份')
  this.#nodeId=nodeId;this.#nodeValues=values
  this.#nodeSignature=definitionTargetDraftSignature(this.nodes,[nodeId])
 }
 private async readback():Promise<void>{
  const nodeId=this.#nodeId,values=this.#nodeValues
  if(!nodeId||!values)throw Error('原查询节点创建身份缺失')
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
  this.guard()
  if(this.#saving)throw Error('查询节点正在保存')
  if(this.#complete&&this.#nodeId)return this.#nodeId
  if(this.#nodeNotApplied)throw Error('原查询节点创建已确认未生效；核验不会重新提交，请明确选择重新提交原节点')
  this.#saving=true
  try{
   if(!this.#modelId){
    this.preflightNode()
    const state=this.model.getState()
    if(state.status==='ready')this.#modelId=await this.modelOwner.save()
    else{
     const checked=await this.modelOwner.verify()
     if(!checked.confirmed||!checked.modelId)throw Error('原查询模型新增尚未确认，请核验原批次')
     this.#modelId=checked.modelId
    }
   }
   this.guard()
   if(!this.#nodeId)await this.stageNode()
   const nodeId=this.#nodeId
   if(!nodeId)throw Error('原查询节点创建身份缺失')
   if(!this.#nodeSaved){
    this.assertNodeIntent()
    try{
     const result=await this.input.dataSet.saveChanges({views:[{tableName:this.nodes.tableName,viewId:this.nodes.viewId,ids:[nodeId]}]})
     if(!result.success)throw Error(result.message??'原查询节点保存尚未确认')
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
  this.guard()
  if(this.#saving||this.#modelId||this.#nodeId)throw Error('查询模型或节点已提交，请继续核验原创建')
  this.modelOwner.discard()
 }
 /** 明确放弃已确认未生效的原模型批次；不重发创建请求。 */
 async abandonNotApplied():Promise<void>{this.guard();await this.modelOwner.abandonNotApplied()}
 /** 明确撤销原模型目标的后续本地修改并核验；确认身份仍交本命令继续创建节点。 */
 async discardModelLocalChanges():Promise<void>{this.guard();this.#modelId=await this.modelOwner.discardLocalChanges()}
 /** 独立确认未生效后显式重提同一节点；原身份及创建字段必须保持不变。 */
 async resubmitNotApplied():Promise<string>{
  this.guard()
  if(!this.#nodeNotApplied||this.#saving||this.nodes.hasUnconfirmedSave)throw Error('原节点尚未确认未生效，不能重新提交')
  this.assertNodeIntent();this.#nodeNotApplied=false
  return this.save()
 }
}
/** 在当前节点新增权限成立后，按需打开原查询模型新增owner。 */
export async function openWorkflowQueryNodeCreate(input:Input):Promise<WorkflowQueryNodeCreate>{
 const nodes=input.dataSet.getView('Base_WorkflowNodeDefinition')
 if(nodes?.queryContext['workflowId']!==input.workflowId||nodes.requestState!==RequestState.Loaded||nodes.hasUnconfirmedSave||nodes.addActionState()!=='enabled')throw Error('当前查询不允许新增查询节点')
 const model=await openWorkflowQueryModelCreate(input)
 return new WorkflowQueryNodeCreate(input,model,nodes)
}
