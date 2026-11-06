/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-source-edit
 * 职责：组合原模型fork、来源替换与节点收口owner，逐阶段确认当前查询节点来源。
 * 边界：正式草稿与捕获仍归各原DataView；不伪造来源、权限、事务或失败回滚。
 */
import {RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import type {PageDataSpaceModelSourceReader} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'
import {createModelCreateHandle,createModelCreateHost,type ModelCreateHandle} from '@/lowcode/data-space/model-source/model/lowcode-data-space-model-create-session'
import {LowcodeDataSpaceModelForkGraph} from '@/lowcode/data-space/model-source/model/lowcode-data-space-model-fork-graph'
import {LowcodeDataSpaceModelComponentFork} from '@/lowcode/data-space/model-source/model/lowcode-data-space-model-component-fork'
import {createModelSourceEditHost,createModelSourceEditHandle,modelSourceEditCurrentContract,modelSourceEditCurrentInputTargetContract,type ModelSourceEditHandle,type ModelSourceEditHost,type SourceContractChange,type SourceContractPlan,type SourceInputTargetChange} from '@/lowcode/data-space/model-source/source/lowcode-data-space-model-source-edit-session'
import {LowcodeDataSpaceFieldRemoveReferences} from '@/lowcode/data-space/model-source/removal/lowcode-data-space-field-remove-references'
import {workflowQueryFieldScope,workflowOperationSourceScope,workflowQueryDraftSignature} from './query-field-context'
import {workflowQuerySharedInputPresentation,validateWorkflowQueryInputChanges,validateWorkflowOperationInputTarget} from './query-inputs'
import {assertWorkflowFieldStructureChanges} from './query-field-references'
import {openWorkflowQuerySourceNodeCommit,type WorkflowModelSourceNodeCommit,type WorkflowConfirmedSource} from './query-source-node-commit'
import {buildWorkflowQueryOutput,assertWorkflowQueryOutputIdentity} from './query-output'
import {assertWorkflowOperationOutputIdentity,workflowOperationOutputFields} from './operation-output'
import {assertWorkflowNodeOutputChanges} from './node-output-references'
import type {WorkflowDataOperation} from './query-model-create'

type Input=Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;operation?:boolean;sources:PageDataSpaceModelSourceReader;assertCurrent():void}>
function read(view:DataView,row:DataRow,key:string):unknown{if(view.fieldAccess(row,key).read!=='visible')throw Error(`来源定义不可读: ${view.tableName}.${key}`);return row[key]}
function text(view:DataView,row:DataRow,key:string):string{const value=read(view,row,key);if(typeof value!=='string'||!value)throw Error(`来源定义身份缺失: ${view.tableName}.${key}`);return value}
function clean(view:DataView):void{if(view.destroyed||view.mutating||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('来源编辑存在未处理修改或原始捕获')}
function full(view:DataView):void{if(view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==view.total)throw Error('来源定义未完整读取')}
function sourceProof(model:Readonly<DataRow>,fields:ReadonlyArray<Readonly<DataRow>>):string{
 const row=(value:Readonly<DataRow>)=>JSON.stringify(Object.keys(value).filter(key=>key!=='_pk'&&!key.startsWith('lingma_sys_')).sort().map(key=>[key,value[key]]))
 return JSON.stringify([row(model),fields.map(row).sort()])
}
/** 原模型创建是明确的持久操作；来源及节点分别确认，未知阶段只核验原owner。 */
export class WorkflowModelSourceEdit{
 readonly #operation:WorkflowDataOperation|'query'|'copy'
 readonly #owned:DataView[]=[]
 readonly #models:DataView
 readonly #fields:DataView
 readonly #template:DataView
 readonly #relations:DataView
 readonly #nodes:DataView
 readonly #edges:DataView
 readonly #fromModelId:string
 readonly #before:Readonly<DataRow>
 readonly #beforeFields:ReadonlyArray<Readonly<DataRow>>
 readonly #initialSource:string
 readonly #graph:string
 readonly #contexts:string
 readonly shared:boolean
 #fork:ModelCreateHandle|LowcodeDataSpaceModelComponentFork|undefined
 #host:ModelSourceEditHost|undefined
 #source:ModelSourceEditHandle|undefined
 #public:ModelSourceEditHandle|undefined
 #node:WorkflowModelSourceNodeCommit|undefined
 #sourceConfirmed=false
 #sourceUnchanged=false
 #confirmedSource:WorkflowConfirmedSource|undefined
 #closed=false
 #busy=false
 /** 捕获当前流程、目标及私有元数据视图的只读基线；持久化由后续显式命令负责。 */
 private constructor(private readonly input:Input,scope:ReturnType<typeof workflowQueryFieldScope>,views:Readonly<{models:DataView;fields:DataView;template:DataView;relations:DataView}>){
  const {models,fields,template,relations}=views
  this.#models=models;this.#fields=fields;this.#template=template;this.#relations=relations;this.#owned.push(models,fields,template,relations)
  this.#nodes=scope.nodes;this.#edges=scope.edges;this.#fromModelId=scope.modelId
  const before=scope.nodes.readSnapshot().rows.find(row=>row['rowid']===input.nodeId);if(!before)throw Error('原节点正式投影缺失');this.#before=before
  if(input.operation){const type=read(scope.nodes,scope.node,'node_type');if(type!=='add'&&type!=='edit'&&type!=='delete')throw Error('当前不是可换目标的操作节点');this.#operation=type;assertWorkflowOperationOutputIdentity({workflowId:input.workflowId,modelId:scope.modelId,fields:fields.readSnapshot().rows,original:this.#before['output_mapping']})}else this.#operation=read(scope.nodes,scope.node,'node_type')==='copy'?'copy':'query'
  this.#beforeFields=fields.readSnapshot().rows
  const originalModel=models.readSnapshot().rows.find(row=>row['rowid']===scope.modelId);if(!originalModel)throw Error('原来源模型缺失');this.#initialSource=sourceProof(originalModel,this.#beforeFields)
  const columns=scope.nodes.queryConfig.fields??scope.nodes.columns.map(column=>column.name)
  for(const key of columns.filter(column=>column!=='_pk'&&!column.startsWith('lingma_sys_')))if(scope.nodes.fieldAccess(scope.node,key).read!=='visible'||!Object.hasOwn(this.#before,key))throw Error(`原节点定义投影不完整或不可读: ${key}`)
  this.#contexts=JSON.stringify([scope.nodes.queryContext,scope.nodes.filterExpression,scope.nodes.queryConfig,scope.edges.queryContext,scope.edges.filterExpression,scope.edges.queryConfig])
  this.#graph=this.graph()
  this.shared=scope.nodes.rows.some(row=>row['rowid']!==input.nodeId&&(read(scope.nodes,row,'node_config')===scope.modelId||read(scope.nodes,row,'dataOperateModId')===scope.modelId))
 }
 private graph():string{return JSON.stringify([this.#nodes.readSnapshot().rows.filter(row=>row['rowid']!==this.input.nodeId),this.#edges.readSnapshot()])}
 private guard():void{
  this.input.assertCurrent();const ds=this.input.dataSet,root=ds.getView('Base_WorkflowDefinition'),row=root?.rows[0]
  if(this.#closed||ds.destroyed||ds.getView(this.#nodes.tableName,this.#nodes.viewId)!==this.#nodes||ds.getView(this.#edges.tableName,this.#edges.viewId)!==this.#edges
   ||JSON.stringify([this.#nodes.queryContext,this.#nodes.filterExpression,this.#nodes.queryConfig,this.#edges.queryContext,this.#edges.filterExpression,this.#edges.queryConfig])!==this.#contexts||this.#graph!==this.graph()||root?.queryContext['workflowId']!==this.input.workflowId||root.rows.length!==1||!row||text(root,row,'rowid')!==this.input.workflowId)throw Error('来源编辑实例、工作流或依赖图已变化')
 }
 private beforeNode():void{
  this.guard();full(this.#nodes);full(this.#edges)
  if(this.#nodes.hasEditingChanges()||this.#nodes.dirtyTracking.hasPendingChanges()||this.#edges.hasEditingChanges()||this.#edges.dirtyTracking.hasPendingChanges())throw Error('请先处理节点或连线修改')
  const row=this.#nodes.readSnapshot().rows.find(item=>item['rowid']===this.input.nodeId)
  if(JSON.stringify(row)!==JSON.stringify(this.#before))throw Error('来源编辑期间原节点已变化')
 }
 private assertBindingWritable():void{
  this.beforeNode()
  const node=this.#nodes.rows.find(row=>row['rowid']===this.input.nodeId)
  const keys=(this.#operation==='query'||this.#operation==='copy')?['node_config','output_mapping']:['dataOperateModId','output_mapping']
  if(!node||this.#nodes.editActionState(node)!=='enabled'||keys.some(key=>this.#nodes.fieldAccess(node,key).write!=='allowed'))throw Error('当前查询不允许节点来源切换')
 }
 private async assertFormalConsumers():Promise<void>{
  this.beforeNode()
  const target=this.modelId,view=this.#nodes.createQueryView(`sourceConsumers_${crypto.randomUUID().replaceAll('-','')}`)
  view.filterExpression={logic:'and',filters:[{field:'workflow_id',operator:'eq',value:this.input.workflowId},{logic:'or',filters:[{field:'rowid',operator:'eq',value:this.input.nodeId},{field:'node_config',operator:'eq',value:target},{field:'dataOperateModId',operator:'eq',value:target}]}]}
  try{
   await view.refresh();this.beforeNode();full(view)
   const columns=(this.#nodes.queryConfig.fields??this.#nodes.columns.map(column=>column.name)).filter(key=>key!=='_pk'&&!key.startsWith('lingma_sys_'))
   const own=view.rows.find(row=>read(view,row,'rowid')===this.input.nodeId)
   if(!own||columns.some(key=>JSON.stringify(read(view,own,key))!==JSON.stringify(this.#before[key])))throw Error('来源编辑期间正式节点已变化')
   const consumers=(rows:ReadonlyArray<Readonly<DataRow>>)=>rows.filter(row=>row['rowid']!==this.input.nodeId&&(row['node_config']===target||row['dataOperateModId']===target)).map(row=>String(row['rowid'])).sort()
   for(const row of view.rows)for(const key of ['rowid','workflow_id','node_config','dataOperateModId'])read(view,row,key)
   if(JSON.stringify(consumers(view.readSnapshot().rows))!==JSON.stringify(consumers(this.#nodes.readSnapshot().rows)))throw Error('正式来源消费者已变化，请重新打开并确认隔离范围')
  }finally{view.dataTable?.destroyView(view.viewId)}
 }
 private get modelId():string{const fork=this.#fork?.getState().fork;if(!fork?.confirmed)return this.#fromModelId;if(!fork.modelId)throw Error('隔离确认缺少正式模型身份');return fork.modelId}
 private get map(){return this.#fork?.getState().fork?.fieldIds??[]}
 /** 只有独立模型可进入原来源owner；共享模型须先明确创建隔离定义。 */
 get source():ModelSourceEditHandle{if(!this.#public)throw Error('共享模型须先明确创建当前节点的隔离模型');return this.#public}
 private async readTargetFields():Promise<void>{
  clean(this.#fields);this.#fields.queryContext={dataSpaceId:this.input.workflowId,modelIds:[this.modelId]};await this.#fields.refresh();this.guard();full(this.#fields)
  if(this.#fields.rows.some(row=>text(this.#fields,row,'dataSetId')!==this.input.workflowId||text(this.#fields,row,'dataModelId')!==this.modelId))throw Error('来源字段归属不符')
 }
 private async outputCheck(change:SourceContractChange):Promise<void>{
  this.beforeNode();const ids=new Map(this.map.map(item=>[item.from,item.to]))
  assertWorkflowQueryOutputIdentity({workflowId:this.input.workflowId,modelId:this.#fromModelId,fields:this.#beforeFields,original:this.#before['output_mapping']})
  const oldFields=this.#beforeFields.filter(row=>row['type']==='dataModel'),newFields=change.after.fields.map(field=>field.raw),newIds=new Set(change.after.fields.map(field=>field.id)),oldIds=new Set(oldFields.map(row=>String(row['rowid'])))
  const transition={fromModelId:this.#fromModelId,fields:oldFields,fieldIds:this.map.filter(item=>oldIds.has(item.from)&&newIds.has(item.to)),removedIds:oldFields.filter(row=>!newIds.has(ids.get(String(row['rowid']))??String(row['rowid']))).map(row=>String(row['rowid']))}
  const outputChanged=newFields.some(row=>String(row['rowid']).startsWith('new:'))||JSON.stringify(buildWorkflowQueryOutput({workflowId:this.input.workflowId,modelId:this.modelId,fields:newFields,original:this.#before['output_mapping'],transition}))!==this.#before['output_mapping']
  const node=this.#nodes.rows.find(row=>row['rowid']===this.input.nodeId);if(!node)throw Error('来源节点不存在')
  const changed=[...outputChanged?['output_mapping']:[],...this.modelId!==this.#fromModelId?['node_config']:[]]
  if(changed.length&&(this.#nodes.editActionState(node)!=='enabled'||changed.some(key=>this.#nodes.fieldAccess(node,key).write!=='allowed')))throw Error('当前查询不允许来源切换所需的节点字段')
  const changes=oldFields.flatMap(before=>{
   const after=change.after.fields.find(field=>field.id===(ids.get(String(before['rowid']))??before['rowid']))?.raw
   const name=(row:Readonly<DataRow>)=>typeof row['AsName']==='string'&&row['AsName'].length>0?row['AsName']:row['Name']
   return !after||Number(before['IsOutput'])===1&&(Number(after['IsOutput'])!==1||name(before)!==name(after)||before['FieldType']!==after['FieldType'])?[{before:{...before},...after?{after:{...after}}:{}}]:[]
  })
  await assertWorkflowFieldStructureChanges(this.input.dataSet,this.input.workflowId,this.input.nodeId,changes,{scope:'node-output'});this.beforeNode()
 }
 private async contract(change:SourceContractChange):Promise<SourceContractPlan>{
  await this.outputCheck(change)
  let choice=''
  return{viewChanges:[],check:()=>{this.beforeNode();if(choice!==JSON.stringify(this.#host?.flow.preview))throw Error('来源候选在依赖核验后变化')},
   assertCurrent:async()=>{await this.assertFormalConsumers();if(!this.#host)throw Error('来源owner已失效');const current=modelSourceEditCurrentContract(this.#host);await this.outputCheck(current);choice=JSON.stringify(this.#host.flow.preview)},
   complete:async()=>{this.confirmSource();await this.completeNode()}}
 }
 private async inputContract(change:SourceInputTargetChange):Promise<SourceContractPlan>{
  await this.assertFormalConsumers()
  if(this.modelId!==this.#fromModelId)this.assertBindingWritable()
  if(change.modelId!==this.modelId)throw Error('操作来源候选目标已变化')
  validateWorkflowOperationInputTarget({dataSet:this.input.dataSet,workflowId:this.input.workflowId,nodeId:this.input.nodeId,target:change})
  await this.operationOutputCheck(change)
  let choice='',captured:SourceInputTargetChange|undefined
  return {viewChanges:[],check:()=>{this.beforeNode();if(this.modelId!==this.#fromModelId)this.assertBindingWritable();if(choice!==JSON.stringify(this.#host?.flow.preview))throw Error('操作目标候选在核验后变化')},
   assertCurrent:async()=>{await this.assertFormalConsumers();if(this.modelId!==this.#fromModelId)this.assertBindingWritable();if(!this.#host)throw Error('操作来源已失效');if(!captured){captured=structuredClone(modelSourceEditCurrentInputTargetContract(this.#host));choice=JSON.stringify(this.#host.flow.preview)}else if(choice!==JSON.stringify(this.#host.flow.preview))throw Error('操作目标选择已变化');validateWorkflowOperationInputTarget({dataSet:this.input.dataSet,workflowId:this.input.workflowId,nodeId:this.input.nodeId,target:captured});await this.operationOutputCheck(captured)},
   complete:async()=>{this.confirmSource();await this.completeNode()}}
 }
 private async operationOutputCheck(change:SourceInputTargetChange):Promise<void>{
  this.beforeNode();const before=workflowOperationOutputFields(this.#before['output_mapping']),ids=new Map(this.map.map(pair=>[pair.from,pair.to]))
  if(this.modelId===this.#fromModelId&&sourceProof(change.before.model,change.before.fields)===sourceProof(change.after.model,change.after.fields.map(field=>field.values)))return
  const after=before.flatMap(row=>{
   const candidate=change.after.fields.find(field=>field.id===(ids.get(String(row['rowid']))??row['rowid']))
   if(!candidate?.id||this.#operation==='delete'&&candidate.values['Name']!==change.sourcePrimaryKey)return []
   return[{...row,rowid:candidate.id,Name:candidate.values['Name'],FieldType:candidate.values['FieldType']}]
  })
  const projected=change.after.fields.filter(field=>typeof field.values['Name']==='string'&&!field.values['Name'].startsWith('lingma_sys_')&&(this.#operation!=='delete'||field.values['Name']===change.sourcePrimaryKey))
  const outputChanged=projected.length!==before.length||before.some(row=>{const candidate=projected.find(field=>field.id===(ids.get(String(row['rowid']))??row['rowid']));return !candidate||candidate.id!==row['rowid']||candidate.values['Name']!==row['Name']||candidate.values['FieldType']!==row['FieldType']||(typeof candidate.values['description']==='string'?candidate.values['description']:'')!==row['Description']})
  const node=this.#nodes.rows.find(row=>row['rowid']===this.input.nodeId)
  if(outputChanged&&(!node||this.#nodes.editActionState(node)!=='enabled'||this.#nodes.fieldAccess(node,'output_mapping').write!=='allowed'))throw Error('当前查询不允许来源切换所需的节点输出字段')
  await assertWorkflowNodeOutputChanges({dataSet:this.input.dataSet,workflowId:this.input.workflowId,nodeId:this.input.nodeId,before,after,assertCurrent:()=>this.beforeNode()});this.beforeNode()
 }
 private async removals(ids:readonly string[],change?:SourceContractChange|SourceInputTargetChange):Promise<()=>void>{
  this.beforeNode();const suffix=`sourceRemove_${crypto.randomUUID().replaceAll('-','')}`,models=this.#models.createQueryView(suffix),fields=this.#template.createQueryView(suffix),relations=this.#relations.createQueryView(suffix),views=[models,fields,relations];this.#owned.push(...views)
  fields.queryContext={dataSpaceId:this.input.workflowId,modelIds:this.#models.rows.map(row=>text(this.#models,row,'rowid'))};for(const view of views){await view.refresh();this.beforeNode();full(view)}
  const baseline=workflowQueryDraftSignature(views)
  for(const id of ids){const row=fields.rows.find(item=>item['rowid']===id);if(!row||text(fields,row,'dataModelId')!==this.modelId)throw Error('来源删除字段身份不符');LowcodeDataSpaceFieldRemoveReferences.validate(views,row,change&&'sourcePrimaryKey'in change?{primaryKeyReplacement:change.sourcePrimaryKey,fieldPurpose:'inputParams',modelFilterChange:{before:String(change.before.model['Filter']??''),after:String(change.after.model['Filter']??'')}}:{primaryKeyReplacement:String(change?.after.raw['PrimaryKeyFields']??'')})}
  return()=>{this.beforeNode();if(workflowQueryDraftSignature(views)!==baseline)throw Error('来源删除依赖已变化')}
 }
 private bindSource():void{
  const host=createModelSourceEditHost({dataSet:this.input.dataSet,targetId:this.input.workflowId,modelId:this.modelId,sources:this.input.sources,
   views:{models:this.#models.viewId,fields:this.#fields.viewId,fieldTemplate:this.#template.viewId,relations:this.#relations.viewId},
   lifecycle:{assertCurrent:()=>this.guard(),onDispatch(){},completed(){},validateConfiguration:()=>{this.beforeNode();return Promise.resolve(()=>this.beforeNode())},validateTransition:()=>{this.beforeNode();return Promise.resolve(()=>this.beforeNode())},
    ...(this.#operation==='query'||this.#operation==='copy')?{inputParameters:{read:()=>workflowQuerySharedInputPresentation(this.input.dataSet,this.input.workflowId,this.input.nodeId,{fromModelId:this.#fromModelId,modelId:this.modelId,models:this.#models,fields:this.#fields}).inputs,
     validate:input=>validateWorkflowQueryInputChanges(this.input.dataSet,this.input.workflowId,this.input.nodeId,{values:[input.value]},{fromModelId:this.#fromModelId,modelId:this.modelId,models:this.#models,fields:this.#fields})},
    prepareContract:change=>this.contract(change),validateRemovals:(ids,change)=>this.removals(ids,change)}:{inputTarget:{requestType:this.#operation,prepareContract:change=>this.inputContract(change),validateRemovals:(ids,change)=>this.removals(ids,change)}}}})
  this.#host=host;const source=createModelSourceEditHandle(host);this.#source=source
  this.#public={...source,getState:()=>{const state=source.getState(),pending=!!this.#node&&!this.#node.getState().complete;return{...state,...pending&&state.status==='idle'?{status:'configuration' as const,pending:true}:{},canAcceptCurrent:false}},
   save:()=>this.save(),verify:options=>this.verify(options),discard:()=>{if(this.#sourceConfirmed)throw Error('来源已确认，不能取消原节点收口');source.discard()},acceptCurrent:()=>{throw Error('来源差异须独立核验节点输出后处理，不能直接结束工作流操作')}}
 }
 /** 创建前展示关联分量及全部新注册名；不创建记录或改变原关系。 */
 isolationPlan(name:string){this.guard();return LowcodeDataSpaceModelForkGraph.registrations({dataSpaceId:this.input.workflowId,modelId:this.#fromModelId,models:this.#models.readSnapshot().rows,relations:this.#relations.readSnapshot().rows,nodeIds:this.#nodes.rows.map(row=>text(this.#nodes,row,'rowid')),name})}
 /** 明确创建隔离模型分量；不会改绑原节点，失回执保留原fork owner。 */
 async isolate(name:string):Promise<string>{
  this.beforeNode();if(!this.shared||this.#fork||this.#busy)throw Error('隔离创建已开始或当前模型无需隔离');this.assertBindingWritable();this.#busy=true
  try{await this.assertFormalConsumers();this.assertBindingWritable();const plan=this.isolationPlan(name)
   this.#fork=plan.models.length>1||plan.relationCount>0?new LowcodeDataSpaceModelComponentFork({dataSet:this.input.dataSet,targetId:this.input.workflowId,models:this.#models,fields:this.#template,relations:this.#relations,nodeIds:this.#nodes.rows.map(row=>text(this.#nodes,row,'rowid')),assertCurrent:()=>this.guard()}):createModelCreateHandle(createModelCreateHost({dataSet:this.input.dataSet,targetId:this.input.workflowId,sources:this.input.sources,views:{models:this.#models.viewId,fields:this.#template.viewId},lifecycle:{assertCurrent:()=>this.guard(),onDispatch(){}}}));const id=await this.#fork.fork({modelId:this.#fromModelId,name,fields:this.#fields});await this.prepareIsolation();return id}catch(cause){if(this.#fork&&!this.#fork.getState().pending&&!this.#fork.getState().fork)this.#fork=undefined;throw cause}finally{this.#busy=false}
 }
 /** 只接续同一隔离创建捕获，不再创建一份模型。 */
 async verifyIsolation():Promise<void>{
  this.guard();if(!this.#fork||this.#busy)throw Error('隔离创建尚无待核验owner');this.#busy=true
  try{if(!this.#fork.getState().fork?.confirmed){const result=await this.#fork.verify();if(!result.confirmed){if(this.#fork.getState().status==='ready'){this.#fork.discard();this.#fork=undefined;throw Error('隔离创建未派发，本地意图已放弃，可重新创建')}throw Error('原隔离模型尚未完整确认')}}await this.prepareIsolation()}finally{this.#busy=false}
 }
 /** 明确放弃原fork已独立证明未生效的创建，保留原共享定义。 */
 async abandonIsolationNotApplied():Promise<void>{
  this.guard();if(!this.#fork||this.#busy)throw Error('没有可放弃的原隔离批次');this.#busy=true
  try{await this.#fork.abandonNotApplied();this.#fork=undefined}finally{this.#busy=false}
 }
 /** 原fork已确认后只放弃其目标后续草稿，再核原模型与字段；不会重建。 */
 async discardIsolationLocalChanges():Promise<void>{
  this.guard();if(!this.#fork||this.#busy)throw Error('没有可恢复的原隔离批次');this.#busy=true
  try{await this.#fork.discardLocalChanges();await this.prepareIsolation()}finally{this.#busy=false}
 }
 private async prepareIsolation():Promise<void>{
  await this.#models.refresh();this.beforeNode();full(this.#models);await this.readTargetFields();const ids=this.#models.rows.map(row=>text(this.#models,row,'rowid'))
  this.#relations.filterExpression={logic:'and',filters:[{field:'dataSetId',operator:'eq',value:this.input.workflowId},{field:'parentModId',operator:'in',value:ids},{field:'childModId',operator:'in',value:ids}]};await this.#relations.refresh();this.beforeNode();full(this.#relations);this.bindSource()
 }
 private confirmSource():void{
  if(!this.#confirmedSource){
   const host=this.#host,model=host?.models.readSnapshot().rows.find(row=>row['rowid']===this.modelId)
   if(!host||!model)throw Error('来源确认缺少正式目标合同')
   this.#confirmedSource=structuredClone({model,fields:host.fields.readSnapshot().rows.filter(row=>row['dataModelId']===this.modelId)})
  }
  this.#sourceConfirmed=true
 }
 private async completeNode():Promise<void>{
  this.guard();if(!this.#sourceConfirmed)throw Error('来源尚未正式确认')
  if(this.#operation!=='query'&&this.#operation!=='copy'&&this.modelId===this.#fromModelId&&this.#confirmedSource&&sourceProof(this.#confirmedSource.model,this.#confirmedSource.fields)===this.#initialSource){this.beforeNode();await this.assertFormalConsumers();this.#sourceUnchanged=true;return}
  if(!this.#node){
   await this.readTargetFields();const actual=new Set(this.#fields.rows.map(row=>text(this.#fields,row,'rowid'))),map=new Map(this.map.map(item=>[item.from,item.to]))
   if(!this.#confirmedSource)throw Error('缺少已确认目标合同')
   this.#node=openWorkflowQuerySourceNodeCommit({dataSet:this.input.dataSet,workflowId:this.input.workflowId,nodeId:this.input.nodeId,expectedSource:this.#confirmedSource,...this.#operation==='query'?{}:{operation:this.#operation},fromModelId:this.#fromModelId,modelId:this.modelId,nodeBefore:this.#before,fieldsBefore:this.#beforeFields,
    fieldIds:this.map.filter(item=>actual.has(item.to)),removedIds:this.#beforeFields.filter(row=>!actual.has(map.get(String(row['rowid']))??String(row['rowid']))).map(row=>String(row['rowid'])),assertCurrent:()=>this.guard()})
  }
  await this.#node.complete()
 }
 /** 节点回执无效时显式采用原范围；未生效结果不自动重提。 */
 async verifyNodeCurrent():Promise<void>{await this.recoverNode(node=>node.verify(true))}
 /** 原节点独立确认未生效后显式重提，不再保存模型或来源。 */
 async resubmitNode():Promise<void>{await this.recoverNode(node=>node.resubmitNotApplied())}
 /** 明确放弃仅原节点目标的后续草稿，再核验原批次。 */
 async discardNodeLocalChanges():Promise<void>{await this.recoverNode(node=>node.discardLocalChangesAndVerify())}
 private async recoverNode(action:(node:WorkflowModelSourceNodeCommit)=>Promise<void>):Promise<void>{this.guard();if(!this.#node||this.#busy)throw Error('尚无原节点捕获');this.#busy=true;try{await action(this.#node)}finally{this.#busy=false}await this.verify({})}
 private async save():Promise<string>{
  this.beforeNode();if(!this.#source||this.#busy)throw Error('来源尚未准备或正在操作');this.#busy=true
  try{const id=await this.#source.save();this.confirmSource();await this.completeNode();return id}finally{this.#busy=false}
 }
 private async verify(options:Parameters<ModelSourceEditHandle['verify']>[0]):ReturnType<ModelSourceEditHandle['verify']>{
  this.guard();if(!this.#source||this.#busy)throw Error('来源核验尚不可用');this.#busy=true
  try{if(options?.discardLocalChanges&&this.#node?.getState().canDiscardLocalChanges)await this.#node.discardLocalChangesAndVerify()
   const result=this.#source.getState().status==='idle'?{confirmed:this.#sourceConfirmed,modelId:this.modelId}:await this.#source.verify(options)
   if(result.confirmed){this.confirmSource();await this.completeNode()}return result
  }finally{this.#busy=false}
 }
 getState(){const complete=this.#sourceUnchanged||this.#node?.getState().complete===true;return{shared:this.shared,modelId:this.modelId,isolation:this.#fork?.getState(),source:this.#public?.getState(),node:this.#node?.getState(),complete,pending:!this.#closed&&!complete}}
 /** 未派发预览可以取消；已创建隔离模型或已确认来源须保留后续收口入口。 */
 cancel():void{this.guard();if(this.#busy||this.#fork||this.#sourceConfirmed)throw Error('已创建隔离定义或来源阶段已确认，须继续核验');this.#source?.discard();this.release();this.#closed=true}
 /** 已完成后释放本工位视图；未确认阶段必须保留原捕获。 */
 close():void{this.guard();if(!this.getState().complete||this.#busy)throw Error('来源及节点尚未完整确认');this.release();this.#closed=true}
 private release():void{if(this.#fork instanceof LowcodeDataSpaceModelComponentFork)this.#fork.release();for(const view of new Set([...this.#owned,...this.#host?[this.#host.fields,this.#host.relations,this.#host.syncFields,this.#host.replacementFields,this.#host.replacementRelations]:[]]))if(view&&!view.destroyed&&!view.hasUnconfirmedSave&&!view.hasEditingChanges()&&!view.dirtyTracking.hasPendingChanges())view.dataTable?.destroyView(view.viewId)}
 /** 只读取当前工作流元数据，并分离模型关系与节点条件；不创建任何正式记录。 */
 static async open(input:Input):Promise<WorkflowModelSourceEdit>{
  const fieldScope=input.operation?workflowOperationSourceScope:workflowQueryFieldScope
  input.assertCurrent();const scope=fieldScope(input.dataSet,input.workflowId,input.nodeId);for(const view of [scope.nodes,scope.edges,scope.models,scope.fields])clean(view)
  const catalog=input.dataSet.getView('Base_DataModel','modelCatalog'),template=input.dataSet.getView('Base_DataModel_Field','modelInputFields'),relations=input.dataSet.getView('Base_DataModel_Relation','asParent')
  if(!catalog||!template||!relations)throw Error('来源编辑缺少正式模型、字段或关系模板')
  const suffix=`workflowSource_${crypto.randomUUID().replaceAll('-','')}`,models=catalog.createQueryView(suffix),fields=template.createQueryView(suffix),fieldTemplate=template.createQueryView(`${suffix}_template`),relationView=relations.createQueryView(suffix)
  const owned=[models,fields,fieldTemplate,relationView]
  try{
   for(const view of owned){view.queryContext={dataSpaceId:input.workflowId,...view===fields?{modelIds:[scope.modelId]}:{}};view.queryConfig={...view.queryConfig,fields:view.columns.map(column=>column.name).filter(name=>name!=='_pk'&&!name.startsWith('lingma_sys_')),allPages:true}}
   relationView.filterExpression={field:'dataSetId',operator:'eq',value:input.workflowId}
   for(const view of [models,fields,relationView]){await view.refresh();input.assertCurrent();full(view)}
   const modelIds=new Set(models.rows.map(row=>text(models,row,'rowid'))),nodeIds=new Set(scope.nodes.rows.map(row=>text(scope.nodes,row,'rowid')))
   for(const row of relationView.rows){const parent=text(relationView,row,'parentModId'),child=text(relationView,row,'childModId');if(modelIds.has(parent)&&nodeIds.has(parent)||modelIds.has(child)&&nodeIds.has(child)||!(modelIds.has(parent)&&modelIds.has(child))&&!(nodeIds.has(parent)&&nodeIds.has(child)))throw Error('存在混合、歧义或孤立关系端点，来源与节点条件归属须先核定')}
   relationView.filterExpression={logic:'and',filters:[{field:'dataSetId',operator:'eq',value:input.workflowId},{field:'parentModId',operator:'in',value:[...modelIds]},{field:'childModId',operator:'in',value:[...modelIds]}]};await relationView.refresh();full(relationView)
   input.assertCurrent();if(fieldScope(input.dataSet,input.workflowId,input.nodeId).modelId!==scope.modelId)throw Error('来源读取期间节点模型已变化')
   if(fields.rows.some(row=>text(fields,row,'dataSetId')!==input.workflowId||text(fields,row,'dataModelId')!==scope.modelId))throw Error('原来源字段归属不符')
   const owner=new WorkflowModelSourceEdit(input,scope,{models,fields,template:fieldTemplate,relations:relationView});owner.beforeNode();if(!owner.shared)owner.bindSource();return owner
  }catch(cause){for(const view of owned)if(!view.hasEditingChanges()&&!view.dirtyTracking.hasPendingChanges())view.dataTable?.destroyView(view.viewId);throw cause}
 }
}
export function openWorkflowQuerySourceEdit(input:Input):Promise<WorkflowModelSourceEdit>{return WorkflowModelSourceEdit.open(input)}
