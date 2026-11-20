/**
 * @module app:lowcode/resources/structured-config/logic-view/output/publication-edit
 * 职责：按输出名称在原正式视图暂存变更，保留同名身份及可核验的取消范围。
 * 边界：不查询业务行、不保存文件或数据库；草稿只在原DataView，命令只持身份及只读签名。
 */
import {DataViewFilter,RequestState,type DataSet,type DataView,type DataRow,type DataViewEditingFieldChangeEvent} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {definitionTargetDraftSignature} from '../../../../data-space/model-source/data-space-definition-save'
import type {LogicViewOutputField} from './publication-plan'
type Input=Readonly<{
 /** 本次宿主的原元数据实例。 */
 dataSet:DataSet
 /** 被设计逻辑视图的唯一正式身份。 */
 viewId:string
 /** 当次来源已核实的只读输出计划，不是可编辑副本。 */
 fields:readonly LogicViewOutputField[]
 /** 调用方捕获的原页面、设计版本及来源身份守卫。 */
 assertCurrent:()=>void
}>
type Change=Readonly<{row:DataRow;values:Partial<LogicViewOutputField>}>
const members=['enname','cnname','description','DataType','IsPKey'] as const
function value(row:DataRow,key:typeof members[number]):unknown{return key==='IsPKey'?Number(row[key]):row[key]}
function sameValues(actual:Readonly<Record<string,unknown>>|undefined,expected:Readonly<Record<string,unknown>>):boolean{
 return !!actual&&Object.keys(actual).length===Object.keys(expected).length&&Object.entries(expected).every(([key,next])=>Object.hasOwn(actual,key)&&Object.is(actual[key],next))
}
function sameDiff(actual:Record<string,{from:unknown;to:unknown}>,expected:Record<string,{from:unknown;to:unknown}>):boolean{
 return Object.keys(actual).length===Object.keys(expected).length&&Object.entries(expected).every(([key,next])=>sameValues(actual[key],next))
}

/** 一次输出结构暂存；取消仅处理本次原生delta，不触碰文件或参数视图。 */
export class LogicViewOutputEdit{
 readonly #view:DataView
 readonly #query:string
 readonly #plan:string
 readonly #owned=new Map<string,string>()
 readonly #contents=new Map<string,string>()
 #attempted=false
 #busy=false
 #cancelled=false
 #staged=false
 #requiresReferences=false
 constructor(private readonly input:Input){
  const view=input.dataSet.getView('Base_TblField','logicViewOutputFields')
  if(!view)throw Error('输出发布视图未装配')
  if(JSON.stringify(view.filterExpression)!==JSON.stringify(DataViewFilter.condition({field:'tblid',operator:'eq',value:{Type:'GetInputParam',ParamName:'viewId'}}).toJSON()))throw Error('输出发布必须使用正式精确目标过滤')
  this.#view=view;this.#query=this.query();this.#plan=JSON.stringify(input.fields);this.scope()
 }
 /** 本次已捕获的原DataView操作身份；不含范围外草稿。 */
 get ids():readonly string[]{return [...this.#owned.keys()]}
 private query():string{return JSON.stringify([this.#view.queryContext,this.#view.filterExpression,this.#view.queryConfig,this.#view.fieldProjection])}
 private scope():void{
  this.input.assertCurrent()
  const view=this.#view,ds=this.input.dataSet
  if(this.#cancelled||ds.destroyed||view.destroyed||ds.scenarioId!==DATA_SPACE_DESIGN_FORM_KEY||ds.getView('Base_TblField','logicViewOutputFields')!==view
   ||view.dataTable?.modelBinding?.modelName!=='Base_TblField'||view.primaryKey!=='rowid'||view.commitMode!=='staged'
   ||view.requestState!==RequestState.Loaded||view.mutating||view.hasUnconfirmedSave||!view.countReported||view.queryContext['viewId']!==this.input.viewId
   ||this.query()!==this.#query||JSON.stringify(this.input.fields)!==this.#plan)throw Error('输出发布身份或查询已变化')
 }
 private guardOwned():void{
  this.scope()
  for(const [id,signature] of this.#owned)if(definitionTargetDraftSignature(this.#view,[id])!==signature||this.content(id)!==this.#contents.get(id))throw Error('原输出暂存已变化，不能覆盖后续修改')
 }
 private content(id:string):string{
  const row=this.#view.dirtyTracking.getPendingDeleteSnapshot(id)??this.#view.getEditingRow(id)
  return JSON.stringify(['rowid','tblid',...members].map(key=>row?.[key]))
 }
 private remember(id:string,expected:Readonly<Record<string,unknown>>):void{
  this.#owned.set(id,'OUTPUT_CHANGED_DURING_STAGE')
  if(!this.matches(id,expected))throw Error('输出暂存期间记录已变化')
  this.#owned.set(id,definitionTargetDraftSignature(this.#view,[id]))
  this.#contents.set(id,this.content(id))
 }
 private matches(id:string,expected:Readonly<Record<string,unknown>>):boolean{
  const view=this.#view,row=view.dirtyTracking.getPendingDeleteSnapshot(id)??view.getEditingRow(id)
  return !!row&&!Object.keys(view.getEditingPatch(id)??{}).some(key=>!Object.hasOwn(expected,key))
   &&Object.entries(expected).every(([key,next])=>key==='IsPKey'?Number(row[key])===Number(next):Object.is(row[key],next))
 }
 private writeMember(input:Readonly<{id:string;key:string;next:unknown;expected:Record<string,unknown>}>):void{
  this.guardOwned();const {id,key,next,expected}=input,row=this.#view.rows.find(candidate=>this.id(candidate)===id)
  if(!row||this.#view.editActionState(row)!=='enabled'||this.#view.fieldAccess(row,key).write!=='allowed')throw Error('当前查询不允许修改输出字段')
  this.remember(id,expected);const updated={...expected,[key]:next}
  try{this.#view.updateEditingValue(id,key,next)}catch(cause){
   if(this.matches(id,updated))this.remember(id,updated)
   else if(!this.matches(id,expected))this.#owned.set(id,'OUTPUT_CHANGED_DURING_STAGE')
   throw cause
  }
  Object.assign(expected,updated);this.remember(id,expected)
 }
 private id(row:DataRow):string{
  const id=this.#view.getPkKey(row)
  if(typeof id!=='string'||!id)throw Error('输出行缺少原DataView身份')
  return id
 }
 private baseline():DataRow[]{
  this.scope();const view=this.#view
  if(view.dirtyTracking.pendingDeleteIds.size)throw Error('原输出存在待删除草稿，请先处理')
  const rows=view.rows.filter(row=>!view.dirtyTracking.isPendingCreate(this.id(row))).map(row=>({...row,...view.dirtyTracking.getOriginal(this.id(row))}))
  if(rows.length!==view.total)throw Error('原输出正式范围未完整读取')
  const ids=new Set<string>(),names=new Set<string>()
  for(const row of rows){
   const id=view.getPkKey(row),name=row['enname']
   if(typeof id!=='string'||!id||ids.has(id)||row['tblid']!==this.input.viewId||typeof name!=='string'||!name.trim()||names.has(name.toLowerCase()))throw Error('原输出身份、名称或归属不唯一')
   for(const key of ['rowid','tblid',...members])if(view.fieldAccess(row,key).read!=='visible')throw Error(`原输出字段不可读: ${key}`)
   ids.add(id);names.add(name.toLowerCase())
  }
  return rows
 }
 private calculate(){
  const rows=this.baseline(),existing=new Map(rows.map(row=>[String(row['enname']).toLowerCase(),row])),names=new Set<string>()
  const changed:Change[]=[],added:LogicViewOutputField[]=[]
  if(!this.input.fields.length)throw Error('输出发布不能为空')
  for(const field of this.input.fields){
   const name=field.enname.trim().toLowerCase()
   if(!name||names.has(name)||!field.DataType.trim()||![0,1].includes(field.IsPKey))throw Error('输出发布字段名称或类型未确认')
   names.add(name);const row=existing.get(name)
   if(!row){added.push(field);continue}
   const values=Object.fromEntries(members.filter(key=>!Object.is(value(row,key),field[key])).map(key=>[key,field[key]]))
   if(Object.keys(values).length)changed.push({row,values})
  }
  const deleted=rows.filter(row=>!names.has(String(row['enname']).toLowerCase()))
  return{changed,added,deleted,signature:JSON.stringify(rows.map(row=>['rowid','tblid',...members].map(key=>row[key])))}
 }
 private preflight(plan:ReturnType<LogicViewOutputEdit['calculate']>):void{
  for(const change of plan.changed)this.checkChange(change)
  for(const row of plan.deleted)this.checkDelete(row)
  for(const field of plan.added)this.checkAdd(field)
 }
 private checkChange({row,values}:Change):void{
  const view=this.#view
  this.assertClean(row);if(view.editActionState(row)!=='enabled')throw Error('当前查询不允许修改输出')
  for(const key of Object.keys(values))if(view.fieldAccess(row,key).write!=='allowed')throw Error(`当前查询不允许输出字段: ${key}`)
 }
 private checkDelete(row:DataRow):void{
  this.assertClean(row);if(this.#view.deleteActionState(row)!=='enabled')throw Error('当前查询不允许删除输出')
 }
 private checkAdd(field:LogicViewOutputField):void{
  const view=this.#view
  if(view.addActionState()!=='enabled')throw Error('当前查询不允许新增输出')
  for(const key of ['tblid',...members])if(view.newRowFieldAccess(key).write!=='allowed')throw Error(`当前查询不允许新增输出字段: ${key}`)
  if(view.rows.some(row=>view.dirtyTracking.isPendingCreate(this.id(row))&&field.enname.toLowerCase()===String(row['enname']).toLowerCase()))throw Error('新增输出与已有草稿冲突')
 }
 private assertClean(row:DataRow):void{
  const id=this.id(row)
  if(this.#view.hasEditingChanges(id)||this.#view.dirtyTracking.hasPendingChanges(id))throw Error('本次输出目标已有草稿，请先处理')
 }
 private async checkConsumers():Promise<void>{
  const view=this.input.dataSet.getView('Base_DataModel','logicViewConsumers')
  const expected=DataViewFilter.group({logic:'and',filters:[{field:'Type',operator:'eq',value:'视图'},{field:'DbId',operator:'eq',value:{Type:'GetInputParam',ParamName:'viewId'}}]}).toJSON()
  if(view?.queryContext['viewId']!==this.input.viewId||view.dataTable?.modelBinding?.modelName!=='Base_DataModel'||view.primaryKey!=='rowid'
   ||JSON.stringify(view.filterExpression)!==JSON.stringify(expected)||view.queryConfig.allPages!==true)throw Error('输出消费者视图身份或过滤不匹配')
  const signature=JSON.stringify([view.queryContext,view.filterExpression,view.queryConfig])
  const assertCurrent=()=>{this.guardOwned();if(view.destroyed||this.input.dataSet.getView('Base_DataModel','logicViewConsumers')!==view
   ||JSON.stringify([view.queryContext,view.filterExpression,view.queryConfig])!==signature)throw Error('消费者查询合同已变化')}
  const validation={accepted:false}
  const validate:NonNullable<DataView['validateQueryResult']>=result=>{
   assertCurrent();const ids=new Set<unknown>()
   if(!result.countReported||result.rows.length!==result.total)throw Error('消费者未完整读取')
   for(const row of result.rows){const id=result.rowKey(row)
    if(typeof id!=='string'||!id||ids.has(id)||row['rowid']!==id||row['Type']!=='视图'||row['DbId']!==this.input.viewId)throw Error('消费者身份或归属不符')
    for(const key of ['rowid','dataSetId','Type','DbId','MetaName'])if(result.fieldAccess(id,key).read!=='visible'||typeof row[key]!=='string'||!row[key])throw Error('消费者必要身份不可读')
    ids.add(id)
   }
   validation.accepted=true
  }
  view.validateQueryResult=validate
  await view.refresh();assertCurrent();if(view.loadingError)throw view.loadingError
  if(!validation.accepted||!Object.is(view.validateQueryResult,validate)||view.requestState!==RequestState.Loaded||!view.countReported||view.rows.length!==view.total)throw Error('消费者查询尚未完整确认或已被替代')
  if(view.rows.length)throw Error('输出存在正式模型消费者，不能删除、改名或改变类型与主键')
 }
 /** 全部预检完成后通过原API暂存；失败保留已登记身份，仍可明确取消。 */
 async stage():Promise<void>{
  this.guardOwned();if(this.#busy||this.#attempted)throw Error('原输出计划已暂存或失败，请继续处理原意图')
  this.#busy=true;this.#attempted=true
  try{
   let plan=this.calculate();this.preflight(plan)
   this.#requiresReferences=plan.deleted.length>0||plan.changed.some(change=>['enname','DataType','IsPKey'].some(key=>Object.hasOwn(change.values,key)))
   if(this.#requiresReferences){
    await this.checkConsumers();const current=this.calculate();if(current.signature!==plan.signature)throw Error('预检期间正式输出已变化');plan=current;this.preflight(plan)
   }
   for(const {row,values} of plan.changed){this.guardOwned();const id=String(this.#view.getPkKey(row))
    this.checkChange({row,values})
    const expected=Object.fromEntries(['rowid','tblid',...members].map(key=>[key,row[key]]))
    for(const [key,next] of Object.entries(values))this.writeMember({id,key,next,expected})
   }
   for(const field of plan.added){this.guardOwned();this.checkAdd(field);const result=await this.#view.addRow({tblid:this.input.viewId,...field}),row=this.#view.rows.find(candidate=>candidate===result),id=row&&this.#view.getPkKey(row)
    if(typeof id!=='string'||!this.#view.dirtyTracking.isPendingCreate(id))throw Error('原DataView未生成新增输出身份')
    this.remember(id,{rowid:id,tblid:this.input.viewId,...field});this.guardOwned()
   }
   for(const row of plan.deleted){this.guardOwned();this.checkDelete(row);const id=String(this.#view.getPkKey(row)),removed=await this.#view.removeRow(id)
    if(removed!==true)throw Error('原DataView未暂存输出删除');this.remember(id,Object.fromEntries(['rowid','tblid',...members].map(key=>[key,row[key]])));this.guardOwned()
   }
   this.#staged=true
  }finally{this.#busy=false}
 }
 /** 暂存后再次读取正式消费者；不能用暂存前的空查询结果授权实际提交。 */
 async verify():Promise<void>{
  this.guardOwned();if(this.#busy||!this.#staged)throw Error('原输出暂存尚未完成')
  this.#busy=true
  try{if(this.#requiresReferences)await this.checkConsumers();this.guardOwned()}finally{this.#busy=false}
 }
 /** 仅应用原暂存覆盖；原生合法转换更新归属签名，晚到编辑仍留在原视图并阻止继续。 */
 async apply():Promise<void>{
  this.guardOwned();if(this.#busy||!this.#staged)throw Error('原输出暂存尚未完成')
  const view=this.#view
  const ids=this.ids,unchanged=ids.filter(id=>!view.hasEditingChanges(id)).map(id=>({id,
   row:view.dirtyTracking.getPendingDeleteSnapshot(id)??view.rows.find(candidate=>this.id(candidate)===id)}))
  const captures=this.ids.flatMap(id=>{
   const patch=view.getEditingPatch(id)
   if(!patch||!Object.keys(patch).length)return[]
   const row=view.rows.find(candidate=>this.id(candidate)===id)
   if(!row)throw Error('原输出行已变化')
   const expected={...row,...patch},original=view.dirtyTracking.getOriginal(id)
   const diff=original?view.dirtyTracking.getDiff(id,expected):Object.fromEntries(Object.entries(patch)
    .filter(([key,next])=>!Object.is(row[key],next)).map(([key,to])=>[key,{from:row[key],to}]))
   return[{id,row,expected,diff,original:original?{...original}:undefined,
    creating:view.dirtyTracking.isPendingCreate(id),deleting:view.dirtyTracking.isPendingDelete(id)}]
  })
  const late=new Set<string>()
  const onInput=(event:DataViewEditingFieldChangeEvent):void=>{const id=String(event.rowId);if(ids.includes(id))late.add(id)}
  this.#busy=true
  view.events.on('editingFieldChanged',onInput)
  try{
   const result=await view.applyEditingRows(captures.map(capture=>capture.id))
   this.scope()
   for(const capture of unchanged)if((view.dirtyTracking.getPendingDeleteSnapshot(capture.id)??view.rows.find(candidate=>this.id(candidate)===capture.id))!==capture.row)late.add(capture.id)
   for(const capture of captures){
    const {id,row:before,expected}=capture,row=view.rows.find(candidate=>this.id(candidate)===id)
    if(late.has(id))continue
    if(definitionTargetDraftSignature(view,[id])===this.#owned.get(id))continue
    const original=view.dirtyTracking.getOriginal(id)
    if(!row||view.hasEditingChanges(id)||view.dirtyTracking.isPendingCreate(id)!==capture.creating
     ||view.dirtyTracking.isPendingDelete(id)!==capture.deleting
     ||!Object.entries(expected).every(([key,next])=>Object.is(row[key],next))
     ||!sameDiff(view.dirtyTracking.getDiff(id,row),capture.diff)
     ||(capture.original!==undefined?!sameValues(original,capture.original)
      :!original||!Object.entries(original).every(([key,previous])=>Object.is(before[key],previous))))continue
    this.#owned.set(id,definitionTargetDraftSignature(view,[id]))
   }
   for(const id of late)this.#owned.set(id,'OUTPUT_CHANGED_DURING_APPLY')
   this.guardOwned()
   if(!result.success)throw Error(result.message??'输出原生编辑应用失败')
   if(this.ids.some(id=>view.hasEditingChanges(id)))throw Error('输出仍有未应用覆盖，不能继续保存')
  }finally{view.events.off('editingFieldChanged',onInput);this.#busy=false}
 }
 /** 只核本命令原生delta归属，不执行消费者检查或修改数据。 */
 assertUnchanged():void{this.guardOwned();if(this.#busy)throw Error('输出暂存正在处理')}
 /** 原签名仍一致时，仅撤回本命令的原生delta。 */
 cancel():void{this.assertUnchanged();this.#view.discardPendingChanges(this.ids);this.#cancelled=true}
}
