/**
 * @module app:lowcode/resources/structured-config/workflow-definition/node-removal
 * 职责：预览普通查询节点删除，检查共享模型和删除后祖先，沿原数据链分别确认数据库与布局。
 * 边界：不自动重连、不执行流程；未知结果保留原捕获，布局失败不重放数据库删除。
 */
import {DataViewFilterCodec,RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {DataSpaceDefinitionSave,definitionTargetDraftSignature,verifyDataSpaceDefinitionCapture,type DataSpaceDefinitionCaptureBatch} from '@/lowcode/data-space/model-source/data-space-definition-save'
import {LowcodeDataSpaceModelRemoveReferences} from '@/lowcode/data-space/model-source/removal/lowcode-data-space-model-remove-references'
import {workflowQueryAncestors} from './fields/query-inputs'
import {WorkflowLayoutDocument} from './layout/layout-document'
import {WORKFLOW_LAYOUT_TABLE} from './layout/layout-resource'

type Input=Readonly<{dataSet:DataSet;workflowId:string;nodeId:string;assertCurrent():void}>
type Selection=Readonly<{view:DataView;ids:readonly string[]}>
type Summary=Readonly<{nodeId:string;modelId:string;deleteModel:boolean;modelContractConfirmed:boolean;edgeCount:number;conditionCount:number;modelRelationCount:number;fieldCount:number;layoutChanges:boolean}>
type Status='ready'|'staged'|'database'|'layout'|'complete'|'cancelled'|'not-applied'
const tableNames=['Base_WorkflowNodeDefinition','Base_WorkflowConnectors','Base_DataModel','Base_DataModel_Field','Base_DataModel_Relation','Base_DataSet'] as const
function read(view:DataView,row:DataRow,key:string):unknown{if(view.fieldAccess(row,key).read!=='visible')throw Error(`删除依赖不可读: ${view.tableName}.${key}`);return row[key]}
function id(view:DataView,row:DataRow):string{const key=read(view,row,view.primaryKey);if(typeof key!=='string'||!key||view.getPkKey(row)!==key)throw Error('删除记录正式身份无效');return key}
function document(value:unknown):unknown{return value===undefined||value===null||value===''?null:typeof value==='string'?parseJsonDocument(value):value}
function filter(value:unknown):unknown{if(value!==undefined&&value!==null&&typeof value!=='string')throw Error('删除依赖过滤原文不是文本');return DataViewFilterCodec.parseStored(value)?.toJSON()}
function snapshot(view:DataView):string{
 // 计算列（含框架主键 _pk）不是来源业务字段，不参与依赖可读性与回读证据。
 const columns=view.queryConfig.fields??view.columns.filter(column=>column.name!=='_pk'&&!column.isComputed&&!column.computeExpression).map(column=>column.name)
 for(const row of view.rows){id(view,row);for(const key of columns)read(view,row,key)}
 // Readback evidence uses the public permission-projected query snapshot; edits remain native DataView diffs.
 const {rows}=view.readSnapshot()
 return JSON.stringify(rows.map(row=>[row[view.primaryKey],columns.map(key=>[key,row[key]])]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
}
/** 原命令持有视图及提交捕获，不持有第二份可编辑数据。 */
export class WorkflowNodeRemoval{
 readonly #views=new Map<string,DataView>()
 readonly #templates:ReadonlyArray<Readonly<{view:DataView;context:string}>>
 readonly #layout:DataView
 readonly #prefix=`workflowNodeRemoval_${crypto.randomUUID().replaceAll('-','')}`
 #status:Status='ready'
 #summary:Summary|undefined
 #selections:Selection[]=[]
 #baseline=''
 #expected=new Map<DataView,string>()
 #initial=new Map<DataView,string>()
 #stageSignatures=new Map<DataView,string>()
 #databaseCapture:DataSpaceDefinitionCaptureBatch|undefined
 #layoutCapture:DataSpaceDefinitionCaptureBatch|undefined
 #layoutText:string|undefined
 #layoutBefore:string|undefined
 #layoutNotApplied=false
 #layoutId:string|undefined
 #databaseConfirmed=false
 #busy=false
 #foreignEdit=false
 readonly #listeners:Array<()=>void>=[]
 private constructor(private readonly input:Input){
  const sources=tableNames.map(name=>{const view=input.dataSet.getView(name,name==='Base_DataModel'?'modelCatalog':name==='Base_DataModel_Field'?'modelInputFields':name==='Base_DataModel_Relation'?'asParent':'default');if(!view)throw Error(`删除缺少正式视图: ${name}`);return view})
  const definition=input.dataSet.getView('Base_WorkflowDefinition'),layout=input.dataSet.getView(WORKFLOW_LAYOUT_TABLE)
  if(!definition||!layout)throw Error('删除缺少正式流程或布局视图')
  this.#templates=[...sources,definition,layout].map(view=>({view,context:JSON.stringify([view.queryContext,view.filterExpression,view.queryConfig])}))
  this.assertCurrent()
  for(const source of sources){
   const view=source.createQueryView(this.#prefix)
   view.queryContext={...source.queryContext,workflowId:input.workflowId,dataSpaceId:input.workflowId}
   view.filterExpression={field:source.tableName==='Base_DataSet'?'rowid':source.tableName==='Base_WorkflowNodeDefinition'||source.tableName==='Base_WorkflowConnectors'?'workflow_id':'dataSetId',operator:'eq',value:input.workflowId}
   view.queryConfig={...view.queryConfig,allPages:true};this.#views.set(source.tableName,view)
  }
  this.#layout=layout.createQueryView(this.#prefix);this.#layout.queryContext={workflowId:input.workflowId}
 }
 private assertCurrent(checkDrafts=false):void{
  const {dataSet,workflowId}=this.input;this.input.assertCurrent()
  if(dataSet.destroyed||!workflowId.trim()||!this.input.nodeId.trim()||this.#templates.some(({view,context})=>view.destroyed||dataSet.getView(view.tableName,view.viewId)!==view||JSON.stringify([view.queryContext,view.filterExpression,view.queryConfig])!==context))throw Error('节点删除目标或正式视图已变化')
  const definition=dataSet.getView('Base_WorkflowDefinition'),root=definition?.rows[0]
  if(definition?.rows.length!==1||!root||id(definition,root)!==workflowId||definition.queryContext['workflowId']!==workflowId)throw Error('删除流程身份不唯一')
  if(checkDrafts){const owned=new Set([...this.#views.values(),this.#layout]);for(const table of Object.values(dataSet.tables))for(const view of table.viewList)if(!owned.has(view)&&(view.hasUnconfirmedSave||view.mutating||view.requestState===RequestState.Loading||view.requestState===RequestState.Preparing||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()))throw Error('请先处理其他草稿、在途操作或未知提交，删除不会覆盖它们')}
 }
 private view(name:typeof tableNames[number]):DataView{const view=this.#views.get(name);if(!view)throw Error('原删除视图已释放');return view}
 private summary():Summary{if(!this.#summary)throw Error('删除预览尚未取得原目标');return this.#summary}
 private async load():Promise<void>{
  this.assertCurrent(true)
  for(const view of [...this.#views.values(),this.#layout]){
   await view.refresh();this.assertCurrent(true)
   if(view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==view.total)throw Error(`删除依赖未完整读取: ${view.tableName}`)
   const ids=new Set<string>();for(const row of view.rows){const key=id(view,row);if(ids.has(key))throw Error('删除依赖身份重复');ids.add(key);const owner=view===this.#layout?'workflowId':view.tableName==='Base_DataSet'?'rowid':view.tableName==='Base_WorkflowNodeDefinition'||view.tableName==='Base_WorkflowConnectors'?'workflow_id':'dataSetId';if(read(view,row,owner)!==this.input.workflowId)throw Error('删除依赖不属于当前流程')}
  }
  const parameters=this.view('Base_DataSet');if(parameters.rows.length!==1||!parameters.rows[0]||read(parameters,parameters.rows[0],'Type')!=='workflow')throw Error('删除缺少同ID工作流参数定义')
  if(this.#layout.rows.length>1)throw Error('布局身份不唯一')
 }
 private allSnapshot():string{return JSON.stringify([...this.#views.values(),this.#layout].map(view=>[view.tableName,snapshot(view)]))}
 private plan():void{
  const nodes=this.view('Base_WorkflowNodeDefinition'),edges=this.view('Base_WorkflowConnectors'),models=this.view('Base_DataModel'),fields=this.view('Base_DataModel_Field'),relations=this.view('Base_DataModel_Relation')
  const node=nodes.rows.find(row=>id(nodes,row)===this.input.nodeId)
  if(!node||String(read(nodes,node,'position_type'))!=='1'||!['query','copy','add','edit','delete','merge'].includes(String(read(nodes,node,'node_type'))))throw Error('仅普通节点可沿本命令删除；开始和结束节点保留')
  const type=read(nodes,node,'node_type'),operation=['add','edit','delete'].includes(String(type))
  const binding=read(nodes,node,operation?'dataOperateModId':'node_config'),target=read(nodes,node,'dataOperateModId')
  const empty=(value:unknown)=>value===undefined||value===null||value===''
  const unbound=empty(read(nodes,node,'node_config'))&&empty(target)
  if(type==='merge'&&!unbound)throw Error('合并节点不能绑定模型；请先核查错误归属')
  const modelId=unbound?'':binding,model=unbound?undefined:models.rows.find(row=>id(models,row)===modelId)
  if(typeof modelId!=='string'||!unbound&&(!modelId||!model))throw Error('查询节点所属模型缺失')
  const modelContractConfirmed=unbound||type==='query'||!!model&&read(models,model,'requestType')===type
  const consumers=nodes.rows.filter(row=>id(nodes,row)!==this.input.nodeId&&(read(nodes,row,'node_config')===modelId||read(nodes,row,'dataOperateModId')===modelId))
  const deleteModel=!unbound&&consumers.length===0&&modelContractConfirmed,nodeIds=new Set(nodes.rows.map(row=>id(nodes,row))),modelIds=new Set(models.rows.map(row=>id(models,row)))
  if(nodeIds.has(modelId)||modelIds.has(this.input.nodeId))throw Error('节点与模型身份重叠，无法区分条件和模型关系')
  const edgeIds=edges.rows.filter(row=>read(edges,row,'sourceID')===this.input.nodeId||read(edges,row,'targetID')===this.input.nodeId).map(row=>id(edges,row))
  const conditionIds:string[]=[],modelRelationIds:string[]=[]
  for(const row of relations.rows){
   const parent=read(relations,row,'parentModId'),child=read(relations,row,'childModId')
   if(parent===this.input.nodeId||child===this.input.nodeId){
    if(typeof parent!=='string'||typeof child!=='string'||!nodeIds.has(parent)||!nodeIds.has(child)||modelIds.has(parent)||modelIds.has(child))throw Error(`节点条件端点身份无法核定: ${id(relations,row)}`)
    if(!edges.rows.some(edge=>read(edges,edge,'sourceID')===parent&&read(edges,edge,'targetID')===child))throw Error(`存在无连线的历史条件，请先处理: ${id(relations,row)}`)
    conditionIds.push(id(relations,row))
   }else if(deleteModel&&(parent===modelId||child===modelId)){
    if(typeof parent!=='string'||typeof child!=='string'||!modelIds.has(parent)||!modelIds.has(child)||nodeIds.has(parent)||nodeIds.has(child))throw Error(`模型关系端点身份无法核定: ${id(relations,row)}`)
    modelRelationIds.push(id(relations,row))
   }
  }
  const fieldIds=deleteModel?fields.rows.filter(row=>read(fields,row,'dataModelId')===modelId).map(row=>id(fields,row)):[]
  this.#selections=[{view:relations,ids:[...conditionIds,...modelRelationIds]},{view:edges,ids:edgeIds},{view:fields,ids:fieldIds},{view:models,ids:deleteModel?[modelId]:[]},{view:nodes,ids:[this.input.nodeId]}].filter(item=>item.ids.length>0)
  this.references({modelId,deleteModel,edgeIds,conditionIds:new Set(conditionIds),fieldIds:new Set(fieldIds)})
  if(deleteModel&&model)LowcodeDataSpaceModelRemoveReferences.validate({views:[models,fields,relations],modelId,modelName:String(read(models,model,'Name')),removedRelationIds:new Set([...conditionIds,...modelRelationIds])})
  this.#layoutText=undefined;this.#layoutId=undefined
  const layout=this.#layout.rows[0]
  if(layout){const before=read(this.#layout,layout,'content');if(typeof before!=='string')throw Error('布局内容不是文本');const after=WorkflowLayoutDocument.remove(before,{nodes:[this.input.nodeId],edges:edgeIds});if(after!==before){if(this.#layout.fieldAccess(layout,'content').write!=='allowed')throw Error('当前查询不允许清理布局');this.#layoutText=after;this.#layoutId=id(this.#layout,layout)}}
  this.#summary={nodeId:this.input.nodeId,modelId,deleteModel,modelContractConfirmed,edgeCount:edgeIds.length,conditionCount:conditionIds.length,modelRelationCount:modelRelationIds.length,fieldCount:fieldIds.length,layoutChanges:this.#layoutText!==undefined}
  this.permissions()
 }
 private references(command:Readonly<{modelId:string;deleteModel:boolean;edgeIds:readonly string[];conditionIds:ReadonlySet<string>;fieldIds:ReadonlySet<string>}>):void{
 const {modelId,deleteModel,edgeIds,conditionIds,fieldIds}=command

  const nodes=this.view('Base_WorkflowNodeDefinition'),edges=this.view('Base_WorkflowConnectors'),models=this.view('Base_DataModel'),fields=this.view('Base_DataModel_Field'),relations=this.view('Base_DataModel_Relation'),parameters=this.view('Base_DataSet')
  const model=models.rows.find(row=>id(models,row)===modelId);if(modelId&&!model)throw Error('删除模型原身份已变化')
  const modelName=model?String(read(models,model,'Name')):'',projection={nodes:[this.input.nodeId],edges:edgeIds}
  const lostByNode=new Map<string,ReadonlySet<string>>()
  for(const row of nodes.rows){const key=id(nodes,row);if(key===this.input.nodeId)continue;const before=workflowQueryAncestors({nodes,edges,workflowId:this.input.workflowId,nodeId:key}).ancestors,after=workflowQueryAncestors({nodes,edges,workflowId:this.input.workflowId,nodeId:key,projection}).ancestors;lostByNode.set(key,new Set([...before].filter(ancestor=>!after.has(ancestor))))}
  function visit(value:unknown,path:string,consumers:readonly string[]):void{
   if(Array.isArray(value)){value.forEach((child,index)=>visit(child,`${path}[${index}]`,consumers));return}
   if(!isRecord(value)||value['Type']==='GetConstValue')return
   const type=value['Type']
   if(type==='GetExpData')throw Error(`删除依赖含不透明表达式，请先处理: ${path}`)
   if(type==='GetInputParam'){
    const name=value['ParamName'];if(typeof name!=='string')throw Error(`输入引用无法核定: ${path}`)
    const ancestor=name.split('.')[0]
    if(ancestor===projection.nodes[0]||consumers.some(key=>ancestor!==undefined&&lostByNode.get(key)?.has(ancestor)))throw Error(`删除后输入失去祖先，请先重连或解除引用并保存: ${path} (${name})`)
    return
   }
   if(deleteModel){
    if(type==='GetTableField'&&typeof value['Field']==='string'&&value['Field'].startsWith(`${modelName}.`))throw Error(`模型仍被引用: ${path}`)
    const key=type==='GetRefData'?'RefTableName':type==='GetGroupData'?'GroupTableName':undefined
    if(key&&value[key]===modelName)throw Error(`模型仍被引用: ${path}`)
   }
   for(const [key,child] of Object.entries(value))visit(child,`${path}.${key}`,consumers)
  }
  const consumers=(owner:unknown)=>nodes.rows.filter(row=>id(nodes,row)!==this.input.nodeId&&(read(nodes,row,'node_config')===owner||read(nodes,row,'dataOperateModId')===owner)).map(row=>id(nodes,row))
  for(const row of nodes.rows)if(id(nodes,row)!==this.input.nodeId){
   const key=id(nodes,row),mapping=document(read(nodes,row,'input_mapping'))
   if(read(nodes,row,'node_type')==='merge'&&mapping!==null){
    if(!Array.isArray(mapping)||mapping.some(item=>!isRecord(item)||typeof item['rowid']!=='string'||!item['rowid']))throw Error(`合并输入无法核定: ${key}`)
    for(const item of mapping)if(isRecord(item)&&(item['rowid']===this.input.nodeId||typeof item['rowid']==='string'&&lostByNode.get(key)?.has(item['rowid'])))throw Error(`删除后合并输入失去祖先: ${key} (${String(item['rowid'])})`)
   }
   visit(mapping,`节点[${key}].input_mapping`,[key]);visit(document(read(nodes,row,'config')),`节点[${key}].config`,[key])
  }
  for(const row of edges.rows)if(!edgeIds.includes(id(edges,row)))visit(document(read(edges,row,'params')),`连线[${id(edges,row)}].params`,[String(read(edges,row,'targetID'))])
  for(const row of models.rows)if(!deleteModel||id(models,row)!==modelId)for(const key of ['Filter','JoinFilter'])visit(filter(read(models,row,key)),`模型[${id(models,row)}].${key}`,consumers(id(models,row)))
  for(const row of fields.rows)if(!fieldIds.has(id(fields,row))){const value=document(read(fields,row,'ValueFun'));if(deleteModel&&read(fields,row,'type')==='dataModel'&&isRecord(value)&&value['Type']==='GetRefData')continue;visit(value,`字段[${id(fields,row)}].ValueFun`,consumers(read(fields,row,'dataModelId')))}
  for(const row of relations.rows)if(!conditionIds.has(id(relations,row))&&(!deleteModel||read(relations,row,'parentModId')!==modelId&&read(relations,row,'childModId')!==modelId)){const child=read(relations,row,'childModId');visit(filter(read(relations,row,'filter')),`关系[${id(relations,row)}].filter`,models.rows.some(candidate=>id(models,candidate)===child)?consumers(child):[String(child)])}
  for(const row of parameters.rows)visit(document(read(parameters,row,'inputParams')),`参数[${id(parameters,row)}].inputParams`,[])
 }
 private permissions():void{for(const selection of this.#selections)for(const key of selection.ids){const row=selection.view.rows.find(candidate=>id(selection.view,candidate)===key)??selection.view.dirtyTracking.getPendingDeleteSnapshot(key);if(!row||selection.view.deleteActionState(row)!=='enabled')throw Error(`当前查询不允许删除: ${selection.view.tableName}[${key}]`)}}
 /** 从原正式视图按需读取删除命令范围，尚不暂存或提交。 */
 static async open(input:Input):Promise<WorkflowNodeRemoval>{const owner=new WorkflowNodeRemoval(input);try{await owner.load();owner.plan();owner.#baseline=owner.allSnapshot();return owner}catch(cause){owner.release();throw cause}}
 /** 只展示原捕获身份和计数，不提供独立可编辑副本。 */
 getState(){return{status:this.#status,pending:this.#status!=='complete'&&this.#status!=='cancelled',busy:this.#busy,summary:this.#summary,databaseConfirmed:this.#databaseConfirmed,canReadCurrent:this.#databaseCapture?.receiptInvalid===true||this.#layoutCapture?.receiptInvalid===true,canRetryLayout:this.#layoutNotApplied}}
 /** 删除暂存归原DataView；正式服务记录仍保留，保存前可取消。 */
 async stage():Promise<void>{
  if(this.#busy||this.#status!=='ready')throw Error('删除预览已变化或正在操作')
  this.#busy=true
  try{await this.load();if(this.allSnapshot()!==this.#baseline)throw Error('正式删除范围已变化，请取消后重新预览');this.plan();for(const view of [...this.#views.values(),this.#layout])this.#initial.set(view,snapshot(view));const content=this.#layout.rows[0]?read(this.#layout,this.#layout.rows[0],'content'):undefined;if(content!==undefined&&typeof content!=='string')throw Error('布局内容不是文本');this.#layoutBefore=content;this.#status='staged'
   for(const view of this.#views.values()){const listener=()=>{this.#foreignEdit=true};view.events.on('editingFieldChanged',listener);this.#listeners.push(()=>view.events.off('editingFieldChanged',listener))}
   for(const {view,ids} of this.#selections)for(const key of ids){this.assertCurrent(true);await view.removeRow(key);if(!view.dirtyTracking.isPendingDelete(key))throw Error('删除未进入原视图暂存')}
   for(const {view,ids} of this.#selections)this.#stageSignatures.set(view,definitionTargetDraftSignature(view,ids))
   for(const view of this.#views.values())this.#expected.set(view,snapshot(view))
  }finally{this.#busy=false}
 }
 private checkStaged():void{this.assertCurrent(true);if(this.#foreignEdit||this.#selections.some(({view,ids})=>definitionTargetDraftSignature(view,ids)!==this.#stageSignatures.get(view)))throw Error('删除等待期间出现新修改；保留修改，不派发旧删除');this.permissions()}
 /** 结构删除在派发前重读原命令已捕获的依赖；新消费者或权限变化不能套用旧删除范围。 */
 private async checkFormalBaseline():Promise<void>{
  for(const source of [...this.#views.values(),this.#layout]){
   this.checkStaged()
   const current=source.createQueryView(`${this.#prefix}_preflight`)
   try{
    await current.refresh();this.checkStaged()
    if(current.loadingError||current.requestState!==RequestState.Loaded||current.rows.length!==current.total||snapshot(current)!==this.#initial.get(source))throw Error(`正式删除范围已变化，请取消后重新预览: ${source.tableName}`)
    for(const key of this.#selections.find(selection=>selection.view===source)?.ids??[]){const row=current.rows.find(candidate=>id(current,candidate)===key);if(!row||current.deleteActionState(row)!=='enabled')throw Error(`当前查询不允许删除: ${source.tableName}[${key}]`)}
    if(source===this.#layout&&this.#layoutText!==undefined&&(!current.rows[0]||current.fieldAccess(current.rows[0],'content').write!=='allowed'))throw Error('当前查询不允许清理布局')
   }finally{current.dataTable?.destroyView(current.viewId)}
  }
 }
 private async readbackDatabase():Promise<void>{
  this.assertCurrent()
  for(const view of this.#views.values()){const ids=this.#selections.find(selection=>selection.view===view)?.ids??[];await view.refresh();this.assertCurrent();if(view.loadingError||view.rows.length!==view.total||view.rows.some(row=>ids.includes(id(view,row)))||snapshot(view)!==this.#expected.get(view))throw Error(`删除回读与精确保留范围不同: ${view.tableName}`)}
  this.#databaseConfirmed=true
 }
 private async finishLayout(acceptCurrent=false):Promise<void>{
  if(!this.#databaseConfirmed)throw Error('数据库删除尚未独立确认')
  this.#status='layout';this.assertCurrent()
  const key=this.#layoutId,text=this.#layoutText
  if(key!==undefined&&text!==undefined){
   if(this.#layoutCapture){if(this.#layout.hasUnconfirmedSave){const original=await this.#layout.verifySourceWriteAttempt();this.assertCurrent();if(original.state==='not-applied'){this.#layoutNotApplied=true;throw Error('布局原批次已确认未生效，数据库删除不会重放')}}const outcome=await verifyDataSpaceDefinitionCapture(this.input.dataSet,this.#layoutCapture,acceptCurrent);if(outcome==='not-applied'){this.#layoutNotApplied=true;throw Error('布局原批次已确认未生效，数据库删除不会重放')}}
   else{this.#layout.updateEditingValue(key,'content',text);await DataSpaceDefinitionSave.run([{dataSet:this.input.dataSet,targetId:this.input.workflowId,modelId:this.summary().modelId,
    prepare:()=>{this.assertCurrent();return Promise.resolve()},apply:async()=>{const result=await this.#layout.applyEditingRows([key]);if(!result.success)throw Error('布局编辑未应用')},check:()=>{this.assertCurrent();if(this.#layout.getEditingRow(key)?.['content']!==text)throw Error('布局清理草稿已变化')},targets:()=>[{tableName:this.#layout.tableName,viewId:this.#layout.viewId,ids:[key]}],dispatched:capture=>{this.#layoutCapture=capture},confirm:async()=>{},failed:()=>{}}])}
   const verify=this.#layout.createQueryView(`${this.#prefix}_layoutVerify`)
   try{await verify.refresh();this.assertCurrent();const row=verify.rows[0];if(!verify.loadingError&&verify.rows.length===1&&row&&verify.getPkKey(row)===key&&this.#layoutCapture?.resolution==='accepted-current'&&read(verify,row,'content')===this.#layoutBefore){this.#layoutNotApplied=true;throw Error('布局原批次已确认未生效，数据库删除不会重放')}if(verify.loadingError||verify.rows.length!==1||!row||verify.getPkKey(row)!==key||read(verify,row,'content')!==text)throw Error('布局独立回读与精确清理意图不同')}finally{verify.dataTable?.destroyView(verify.viewId)}
  }
  this.#status='complete';this.release()
 }
 /** 已派发数据库批次只核验原捕获；文件阶段失败不会再次删除数据库记录。 */
 async save():Promise<void>{
  if(this.#busy)throw Error('节点删除正在操作')
  if(this.#status==='database'||this.#status==='layout')return this.verify()
  if(this.#status!=='staged')throw Error('请先暂存原删除预览')
  this.#busy=true
  try{this.checkStaged();await DataSpaceDefinitionSave.run([{dataSet:this.input.dataSet,targetId:this.input.workflowId,modelId:this.summary().modelId,
   prepare:()=>this.checkFormalBaseline(),apply:async()=>{},check:()=>this.checkStaged(),targets:()=>this.#selections.map(({view,ids})=>({tableName:view.tableName,viewId:view.viewId,ids:[...ids]})),dispatched:capture=>{this.#databaseCapture=capture;this.#status='database'},confirm:()=>this.readbackDatabase(),failed:()=>{}}]);await this.finishLayout()}
  finally{this.#busy=false}
 }
 /** 核验只沿原DataSet捕获及原文件owner，未确认未生效时不自动重提。 */
 async verify(acceptCurrent=false):Promise<void>{
  if(this.#busy)throw Error('节点删除正在核验')
  this.#busy=true
  try{this.assertCurrent();if(this.#foreignEdit)throw Error('原删除视图有后续修改，核验不会覆盖它们');if(!this.#databaseConfirmed){if(!this.#databaseCapture)throw Error('缺少原删除捕获');const outcome=await verifyDataSpaceDefinitionCapture(this.input.dataSet,this.#databaseCapture,acceptCurrent);let unchanged=outcome==='accepted-current';if(unchanged)for(const view of this.#views.values()){await view.refresh();this.assertCurrent();if(view.loadingError||view.rows.length!==view.total)throw Error('原范围读取未完成');unchanged=snapshot(view)===this.#initial.get(view)&&unchanged}if(outcome==='not-applied'||unchanged){this.#status='not-applied';throw Error('原删除已确认未生效，不会自动重放')}await this.readbackDatabase()}await this.finishLayout(acceptCurrent)}
  finally{this.#busy=false}
 }
 /** 仅在原文件批次已确认未生效后显式重提布局，数据库删除不会重放。 */
 async retryLayout():Promise<void>{if(this.#busy||!this.#databaseConfirmed||!this.#layoutNotApplied||this.#foreignEdit)throw Error('布局未取得可重提证明');this.#busy=true;try{this.assertCurrent();if(this.#layout.hasUnconfirmedSave){const proof=await this.#layout.verifySourceWriteAttempt();this.assertCurrent();if(proof.state!=='not-applied'||!this.#layout.abandonUnconfirmedSave())throw Error('原布局未生效证明已变化，保留原意图')}if(this.#layoutId)this.#layout.discardPendingChanges([this.#layoutId]);this.#layoutCapture=undefined;this.#layoutNotApplied=false;await this.finishLayout()}finally{this.#busy=false}}
 /** 仅撤销本命令未派发或已确认未生效的删除，不丢弃其他视图编辑。 */
 cancel():void{this.assertCurrent();if(this.#busy||this.#databaseConfirmed||this.#databaseCapture&&this.#status!=='not-applied'||!['ready','staged','not-applied'].includes(this.#status)||this.#foreignEdit)throw Error('原删除已派发或有后续修改，请保留并核验');for(const {view,ids} of this.#selections)view.discardPendingChanges([...ids]);this.#status='cancelled';this.release()}
 private release():void{this.#listeners.splice(0).forEach(off=>off());for(const view of [...this.#views.values(),this.#layout])if(!view.hasUnconfirmedSave&&!view.hasEditingChanges()&&!view.dirtyTracking.hasPendingChanges())view.dataTable?.destroyView(view.viewId)}
}
/** 当前系统页提供唯一流程/节点身份及生命周期守卫。 */
export async function openWorkflowNodeRemoval(input:Input):Promise<WorkflowNodeRemoval>{return WorkflowNodeRemoval.open(input)}
