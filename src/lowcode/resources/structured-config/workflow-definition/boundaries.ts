/**
 * @module app:lowcode/resources/structured-config/workflow-definition/boundaries
 * 职责：识别和显式补齐工作流开始/结束边界，暂存及提交同一节点DataView。
 * 边界：读取不写入，不删除已有边界，不初始化参数、不创建模型、不执行流程。
 * AI用途：正常设计页与烟测共用缺失边界命令，取消和未知保存由原SPARK data承接。
 */
import {RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import {DataSpaceDefinitionSave,verifyDataSpaceDefinitionCapture,verifyAndDiscardDataSpaceDefinitionCapture,type DataSpaceDefinitionCaptureBatch} from '@/lowcode/data-space/model-source/data-space-definition-save'
import {workflowQueryDraftSignature} from './query-field-context'
/** 本次设计器的唯一目标及原运行实例。 */
type Input=Readonly<{
 /** 宿主提供的元数据实例。 */
 dataSet:DataSet
 /** 被设计工作流。 */
 workflowId:string
}>
function read(view:DataView,row:DataRow,field:string):unknown{
 if(view.fieldAccess(row,field).read!=='visible')throw Error(`工作流边界字段不可读: ${field}`)
 return row[field]
}
function source(input:Input):DataView{
 const view=input.dataSet.getView('Base_WorkflowNodeDefinition'),definition=input.dataSet.getView('Base_WorkflowDefinition')
 if(input.dataSet.destroyed||!input.workflowId.trim()||!view||view.destroyed||!definition||definition.destroyed)throw Error('工作流边界实例已失效')
 for(const current of [view,definition])if(current.requestState!==RequestState.Loaded||current.loadingError||current.queryContext['workflowId']!==input.workflowId)throw Error('工作流边界查询未就绪')
 const root=definition.rows[0]
 if(!root||definition.rows.length!==1||definition.total!==1||read(definition,root,'rowid')!==input.workflowId||definition.hasUnconfirmedSave||definition.hasEditingChanges()||definition.dirtyTracking.hasPendingChanges())throw Error('工作流边界定义身份未确认')
 if(view.rows.length+view.dirtyTracking.pendingDeleteIds.size-view.dirtyTracking.pendingCreateIds.size!==view.total)throw Error('工作流节点未完整读取')
 for(const row of view.rows)if(read(view,row,'workflow_id')!==input.workflowId)throw Error('工作流节点归属不符')
 return view
}
function position(view:DataView,row:DataRow):number{const value=read(view,row,'position_type');if(value!==0&&value!==1&&value!==2&&value!=='0'&&value!=='1'&&value!=='2')throw Error('节点位置不是正式0/1/2');return Number(value)}
/** 从原视图报告缺失；多个结束保留，重复开始拒绝，不以空白结果代替完整查询。 */
export function workflowBoundaryState(input:Input){
 const view=source(input),rows=view.rows.filter(row=>!view.dirtyTracking.isPendingDelete(String(view.getPkKey(row))))
 const starts=rows.filter(row=>position(view,row)===0)
 if(starts.length>1)throw Error('开始节点不唯一，请核查正式定义')
 return{missing:([0,2] as const).filter(value=>!rows.some(row=>position(view,row)===value))}
}
function identities(view:DataView):Array<[string,number]>{
 return view.rows.filter(row=>[0,2].includes(position(view,row))&&!view.dirtyTracking.isPendingCreate(String(view.getPkKey(row)))).map(row=>{const id=read(view,row,'rowid');if(typeof id!=='string'||!id)throw Error('边界身份无效');return [id,position(view,row)]})
}
/** 补齐命令只持有原查询合同、本次ID与共享提交捕获，不保存第二份节点草稿。 */
export class WorkflowBoundaryCompletion{
 readonly #view:DataView
 readonly #context:string
 readonly #original:ReadonlyArray<readonly [string,number]>
 readonly #planned:readonly number[]
 readonly #created:Array<{id:string;position:number}>=[]
 #capture:DataSpaceDefinitionCaptureBatch|undefined
 #attempted=false
 #busy=false
 #complete=false
 #confirmed=false
 #currentChecked=false
 /** 捕获本次完整查询与缺失计划；只有open可构造，不创建或提交记录。
  * @param input 当前工作流及宿主元数据实例。
  */
 private constructor(private readonly input:Input){
  this.#view=source(input);this.#context=this.context();this.#original=identities(this.#view);this.#planned=workflowBoundaryState(input).missing
 }
 /** 在原实例打开一个显式补齐命令，不读取或写入正式存储。 */
 static open(input:Input):WorkflowBoundaryCompletion{return new WorkflowBoundaryCompletion(input)}
 /** 本次已分配ID，仅用于定位原DataView记录。 */
 get ids():readonly string[]{return this.#created.map(item=>item.id)}
 /** 本次是否已补建开始节点，提醒沿原开始参数命令确认输出。 */
 get createdStart():boolean{return this.#created.some(item=>item.position===0)}
 /** 独立回读确认后才结束。 */
 get complete():boolean{return this.#complete}
 /** 是否已派发原提交，用于保留核验入口。 */
 get submitted():boolean{return this.#capture!==undefined}
 /** 正式回读确认，区别于取消。 */
 get confirmed():boolean{return this.#confirmed}
 /** 无效回执须由用户明确读取并采用当前正式结果。 */
 get canAcceptCurrent():boolean{return !this.#busy&&!this.#complete&&!!this.#capture?.receiptInvalid}
 /** 已完整读到当前结果但不匹配原意图，可明确结束意图并保留正式记录。 */
 get canFinishCurrent():boolean{return !this.#busy&&!this.#complete&&this.#currentChecked}
 /** 已证实未生效的批次可显式放弃；不重发。 */
 get canDiscardNotApplied():boolean{return !this.#busy&&!this.#complete&&this.#capture?.resolution==='not-applied'}
 /** 未派发时允许取消本次新增；未知结果不通过取消重置。 */
 get canCancel():boolean{return !this.#busy&&!this.#capture&&!this.#complete}
 private context():string{return JSON.stringify([this.#view.queryContext,this.#view.queryConfig,this.#view.filterExpression])}
 private scope():void{if(source(this.input)!==this.#view||this.context()!==this.#context)throw Error('原边界补齐查询已失效')}
 private values(value:number):Record<string,unknown>{return{workflow_id:this.input.workflowId,position_type:value,name:value===0?'开始':'结束',node_type:'API_CALL',node_config:'',dataOperateModId:'',input_mapping:'[]',output_mapping:'[]',config:''}}
 private intent():void{
  this.scope()
  if(this.#created.length!==this.#planned.length)throw Error('边界尚未全部暂存，请取消本次补齐后重试')
  for(const item of this.#created){const row=this.#view.getEditingRow(item.id)??this.#view.rows.find(candidate=>this.#view.getPkKey(candidate)===item.id)
   if(!row||this.#view.dirtyTracking.isPendingDelete(item.id)||Object.entries(this.values(item.position)).some(([key,value])=>!Object.is(read(this.#view,row,key),value)))throw Error('本次边界字段已有后续修改，请保留并明确处理')
  }
 }
 private async verify(saved=false):Promise<void>{
  if(saved)this.#currentChecked=false
  this.scope();const view=this.#view,definition=this.input.dataSet.getView('Base_WorkflowDefinition');if(!definition)throw Error('工作流定义视图缺失');const draft=workflowQueryDraftSignature([view,definition])
  const fresh=view.createQueryView(`workflowBoundaries_${crypto.randomUUID().replaceAll('-','')}`)
  try{
   fresh.filterExpression={logic:'and',filters:[{field:'workflow_id',operator:'eq',value:this.input.workflowId},{logic:'or',filters:[{field:'position_type',operator:'eq',value:0},{field:'position_type',operator:'eq',value:2}]}]}
   fresh.queryConfig={...fresh.queryConfig,fields:['rowid','workflow_id','position_type','name','node_type','node_config','dataOperateModId','input_mapping','output_mapping','config'],allPages:true}
   await fresh.refresh();this.scope()
   if(workflowQueryDraftSignature([view,definition])!==draft)throw Error('边界检查期间原目标或节点修改已变化')
   if(fresh.requestState!==RequestState.Loaded||fresh.loadingError||fresh.rows.length!==fresh.total||fresh.rows.some(row=>read(fresh,row,'workflow_id')!==this.input.workflowId||![0,2].includes(position(fresh,row))))throw Error('正式边界查询未完整确认')
   const expected:unknown[]=[...this.#original]
   if(saved)expected.push(...this.#created.map(item=>[item.id,item.position]))
   expected.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
   const actual:unknown[]=identities(fresh);actual.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
   let payloadMatches=true
   if(saved)for(const item of this.#created){
    const current=fresh.rows.find(candidate=>fresh.getPkKey(candidate)===item.id)
    if(!current){payloadMatches=false;continue}
    for(const [key,value] of Object.entries(this.values(item.position))){const actualValue=read(fresh,current,key);payloadMatches=Object.is(actualValue,value)&&payloadMatches}
   }
   if(saved)this.#currentChecked=true
   if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('正式边界已变化，请保留原意图并重新核查')
   if(saved){if(!payloadMatches)throw Error('边界独立回读与本次意图不一致')}
   else{
    if(fresh.addActionState()!=='enabled'||view.addActionState()!=='enabled')throw Error('当前正式查询不允许补齐边界')
    for(const value of this.#planned)for(const key of Object.keys(this.values(value)))if(fresh.newRowFieldAccess(key).write!=='allowed'||view.newRowFieldAccess(key).write!=='allowed')throw Error(`当前查询不允许边界字段: ${key}`)
   }
  }finally{fresh.dataTable?.destroyView(fresh.viewId)}
 }
 /** 暂存一次计划内缺失记录；部分失败保留本次ID，取消只撤回这些ID。 */
 async stage():Promise<void>{
  this.scope();if(this.#busy||this.#complete||this.#attempted)throw Error('原边界补齐已暂存或失败，请继续原意图或取消')
  if(this.#view.commitMode!=='staged'||this.#view.hasUnconfirmedSave||this.#view.hasEditingChanges()||this.#view.dirtyTracking.hasPendingChanges())throw Error('请先保存或取消原节点修改')
  if(!this.#planned.length){this.#complete=true;return}
  this.#busy=true
  try{await this.verify();this.#attempted=true
   for(const value of this.#planned){
    const result=await this.#view.addRow(this.values(value)),row=this.#view.rows.find(candidate=>candidate===result),id=row&&this.#view.getPkKey(row)
    if(typeof id!=='string')throw Error('边界新增未获得原DataView身份')
    this.#created.push({id,position:value});this.scope()
   }
  }finally{this.#busy=false}
 }
 /** 共享捕获持有未知提交；已确认写入但回读失败时，仅继续独立读取。 */
 async save():Promise<void>{
  this.scope();if(this.#complete)return;if(this.#busy)throw Error('边界补齐正在处理')
  this.#busy=true
  try{
   if(this.#capture){const outcome=await verifyDataSpaceDefinitionCapture(this.input.dataSet,this.#capture);if(outcome==='not-applied')throw Error('原边界提交确认未生效，请明确处理原批次，不自动重发')}
   else{
    this.intent()
    await DataSpaceDefinitionSave.run([{dataSet:this.input.dataSet,targetId:this.input.workflowId,modelId:this.input.workflowId,
     prepare:async()=>{this.intent();await this.verify()},apply:async()=>{},check:()=>this.intent(),
     targets:()=>[{tableName:this.#view.tableName,viewId:this.#view.viewId,ids:[...this.ids]}],
     dispatched:capture=>{this.#capture=capture},confirm:async()=>{},failed:()=>{},
    }])
   }
   await this.verify(true);this.#confirmed=true;this.#complete=true
  }finally{this.#busy=false}
 }
 /** 明确采用当前正式结果后核对原意图，全程只读，不重发。 */
 async acceptCurrent():Promise<void>{
  this.scope();if(!this.canAcceptCurrent||!this.#capture)throw Error('当前不需要采用正式结果')
  this.#busy=true
  try{await verifyDataSpaceDefinitionCapture(this.input.dataSet,this.#capture,true);await this.verify(true);this.#confirmed=true;this.#complete=true}
  finally{this.#busy=false}
 }
 /** 当前正式结果已经完整读取但不符原意图时，明确结束，不改写或删除正式记录。 */
 finishCurrent():void{this.scope();if(!this.canFinishCurrent)throw Error('尚未完整核查当前正式结果');this.#complete=true}
 /** 显式放弃共享捕获已证实未生效的批次，仅撤销本次ID。 */
 async discardNotApplied():Promise<void>{
  this.scope();if(!this.canDiscardNotApplied||!this.#capture)throw Error('原边界批次尚未证实未生效')
  this.#busy=true
  try{await verifyAndDiscardDataSpaceDefinitionCapture(this.input.dataSet,this.#capture);this.#complete=true}
  finally{this.#busy=false}
 }
 /** 只取消本次尚未提交的新增，保留同视图其他记录与草稿。 */
 cancel():void{
  this.scope();if(!this.canCancel)throw Error('请先核验原边界保存结果')
  this.#view.discardPendingChanges(this.ids);this.#complete=true
 }
}
