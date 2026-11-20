/**
 * @module app:lowcode/data-space/model-source/model/lowcode-data-space-model-component-fork
 * 职责：关系分量沿原DataView暂存并通过原定义保存器创建，保留完整身份清单及原捕获恢复。
 * 边界：不保存节点、不自建提交器；只读基线用于原图保留证明，正式草稿仍归原数据视图。
 */
import {RequestState,type DataSet,type DataView,type DataRow} from '@spark-appworks/spark-data'
import {DataSpaceDefinitionSave,definitionTargetDraftSignature,verifyDataSpaceDefinitionCapture,verifyAndDiscardDataSpaceDefinitionCapture,type DataSpaceDefinitionCaptureBatch} from '../data-space-definition-save'
import {LowcodeDataSpaceModelForkGraph} from './lowcode-data-space-model-fork-graph'
import type {ModelCreateStatus} from './lowcode-data-space-model-create-session'

type Input=Readonly<{dataSet:DataSet;targetId:string;models:DataView;fields:DataView;relations:DataView;nodeIds:readonly string[];assertCurrent():void}>
type Row=Readonly<Record<string,unknown>>
type Item={view:DataView;id:string;from:string;values:Row}
function id(view:DataView,row:DataRow):string{const key=view.getPkKey(row);if(typeof key!=='string'||!key||row['rowid']!==key)throw Error('隔离新增记录身份无效');return key}
function loaded(view:DataView):void{if(view.destroyed||view.loadingError||view.requestState!==RequestState.Loaded||view.rows.length!==view.total)throw Error('隔离分量定义未完整读取')}
function readable(view:DataView):readonly Row[]{loaded(view);for(const row of view.rows)for(const field of view.queryConfig.fields??[])if(view.fieldAccess(row,field).read!=='visible')throw Error(`隔离定义不可读：${view.tableName}.${field}`);return view.readSnapshot().rows}
function sorted(rows:readonly Row[]):readonly Row[]{return [...rows].sort((a,b)=>String(a['rowid']).localeCompare(String(b['rowid'])))}

/** 同一次分量创建的生命周期；核验不会另建一组副本。 */
export class LowcodeDataSpaceModelComponentFork{
 readonly #views:DataView[]=[]
 readonly #items:Item[]=[]
 readonly #before=new Map<DataView,readonly Row[]>()
 readonly #contexts=new Map<DataView,string>()
 #discarded=false
 #busy=false
 #closed=false
 #capture:DataSpaceDefinitionCaptureBatch|undefined
 #signatures:ReadonlyArray<readonly [DataView,readonly string[],string]>=[]
 #sourceModelId=''
 #rootId:string|null=null
 #confirmed=false
 #unresolved=false
 readonly #sources=new Map<DataView,Readonly<{context:string;rows:string|undefined}>>()
 #bindings:Array<{from:string;to:string;name:string}>=[]
 constructor(private readonly input:Input){}
 private guard():void{this.input.assertCurrent();if(this.#closed||this.input.dataSet.destroyed)throw Error('隔离分量实例已失效');for(const view of this.#views)if(view.destroyed||this.input.dataSet.getView(view.tableName,view.viewId)!==view||JSON.stringify([view.queryContext,view.filterExpression,view.queryConfig])!==this.#contexts.get(view))throw Error('隔离分量原查询已变化')}
 private clone(source:DataView,suffix:string):DataView{
  const view=source.createQueryView(`modelComponentFork_${suffix}_${crypto.randomUUID().replaceAll('-','')}`)
  view.queryContext={dataSpaceId:this.input.targetId};view.filterExpression={field:'dataSetId',operator:'eq',value:this.input.targetId}
  view.queryConfig={...view.queryConfig,fields:view.columns.map(column=>column.name).filter(name=>name!=='_pk'&&!name.startsWith('lingma_sys_')),allPages:true}
  this.#views.push(view);this.#contexts.set(view,JSON.stringify([view.queryContext,view.filterExpression,view.queryConfig]));if(view.commitMode!=='staged')throw Error('隔离分量必须使用原视图暂存合同');return view
 }
 private assertOriginals():void{
  this.guard()
  for(const [view,source] of this.#sources)if(view.destroyed||this.input.dataSet.getView(view.tableName,view.viewId)!==view||view.mutating||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()||JSON.stringify([view.queryContext,view.filterExpression,view.queryConfig])!==source.context||source.rows!==undefined&&JSON.stringify(sorted(view.readSnapshot().rows))!==source.rows)throw Error('隔离原来源或原字段视图、查询或草稿已变化；保留修改')
  for(const view of this.#views){const targets=new Set(this.#items.filter(item=>item.view===view).map(item=>item.id)),rows=view.readSnapshot().rows.filter(row=>!targets.has(String(row['rowid'])))
   if(JSON.stringify(sorted(rows))!==JSON.stringify(sorted(this.#before.get(view)??[])))throw Error('隔离期间原定义发生变化；不派发旧副本')
   if([...view.dirtyTracking.pendingDeleteIds].some(key=>!targets.has(String(key)))||rows.some(row=>{const key=row['rowid'];if(typeof key!=='string'||!key)throw Error('隔离原记录身份无效');return view.hasEditingChanges(key)||view.dirtyTracking.hasPendingChanges(key)}))throw Error('隔离期间原定义出现新草稿；修改保留')
  }
 }
 private checkTargets():void{
  this.assertOriginals()
  for(const item of this.#items){const row=item.view.getEditingRow(item.id)??item.view.rows.find(candidate=>id(item.view,candidate)===item.id)
   if(!row||!item.view.dirtyTracking.isPendingCreate(item.id)||item.view.addActionState()!=='enabled'||Object.entries(item.values).some(([key,value])=>JSON.stringify(row[key])!==JSON.stringify(value)))throw Error('隔离新增草稿或权限已变化；保留修改')
  }
 }
 private async add(view:DataView,from:string,values:Row):Promise<Item>{
  this.assertOriginals();if(view.addActionState()!=='enabled')throw Error('当前查询不允许创建隔离定义')
  const before=new Set(view.dirtyTracking.pendingCreateIds);let item:Item|undefined
  try{await view.addRow(structuredClone(values))}finally{
   const added=view.dirtyTracking.pendingCreateRows.filter(row=>!before.has(view.getPkKey(row)??'')),row=added[0]
   if(added.length===1&&row){const key=id(view,row);if(Object.entries(values).some(([field,value])=>JSON.stringify(row[field])!==JSON.stringify(value)))this.#unresolved=true;else{item={view,id:key,from,values:structuredClone(values)};this.#items.push(item);if(view===this.#views[0]&&from===this.#sourceModelId)this.#rootId=key}}
   else if(added.length)this.#unresolved=true
  }
  this.guard();if(!item)throw Error('隔离新增未获得唯一原生身份');return item
 }
 /** 全部分量模型、字段和关系在一个原DataSet批次提交；没有跨来源事务假设。 */
 async fork(input:Readonly<{modelId:string;name:string;fields:DataView}>):Promise<string>{
  if(this.#busy||this.#sourceModelId)throw Error('隔离分量创建已经开始');this.#busy=true;this.#sourceModelId=input.modelId
  try{
   this.input.assertCurrent();if(input.fields.dataSet!==this.input.dataSet)throw Error('隔离原字段不属于当前实例');readable(input.fields)
   for(const view of new Set([this.input.models,this.input.relations,this.input.fields,input.fields]))this.#sources.set(view,{context:JSON.stringify([view.queryContext,view.filterExpression,view.queryConfig]),rows:view.requestState===RequestState.Loaded?JSON.stringify(sorted(view.readSnapshot().rows)):undefined})
   const models=this.clone(this.input.models,'models'),fields=this.clone(this.input.fields,'fields'),relations=this.clone(this.input.relations,'relations')
   await Promise.all([models.refresh(),relations.refresh()]);this.guard()
   const originalModels=readable(models),originalRelations=readable(relations),scope=LowcodeDataSpaceModelForkGraph.scope({dataSpaceId:this.input.targetId,modelId:input.modelId,models:originalModels,relations:originalRelations,nodeIds:this.input.nodeIds})
   fields.queryContext={dataSpaceId:this.input.targetId,modelIds:scope.modelIds};fields.filterExpression={logic:'and',filters:[{field:'dataSetId',operator:'eq',value:this.input.targetId},{field:'dataModelId',operator:'in',value:scope.modelIds}]};this.#contexts.set(fields,JSON.stringify([fields.queryContext,fields.filterExpression,fields.queryConfig]));await fields.refresh();this.guard();const originalFields=readable(fields)
   for(const view of this.#views)this.#before.set(view,readable(view))
   const plans=LowcodeDataSpaceModelForkGraph.registrations({dataSpaceId:this.input.targetId,modelId:input.modelId,models:originalModels,relations:originalRelations,nodeIds:this.input.nodeIds,name:input.name}).models
   for(const plan of plans){const item=await this.add(models,plan.from,{dataSetId:this.input.targetId,Name:plan.name});this.#bindings.push({from:plan.from,name:plan.name,to:item.id});if(plan.from===input.modelId)this.#rootId=item.id}
   const prepared=LowcodeDataSpaceModelForkGraph.prepare({dataSpaceId:this.input.targetId,modelId:input.modelId,models:originalModels,fields:originalFields,relations:originalRelations,nodeIds:this.input.nodeIds,bindings:this.#bindings})
   for(const copy of prepared.models){const item=this.#items.find(candidate=>candidate.view===models&&candidate.from===copy.from);if(!item)throw Error('隔离模型新增身份缺失');item.values=copy.value;for(const [key,value] of Object.entries(copy.value))if(key!=='rowid')models.updateEditingValue(item.id,key,structuredClone(value))}
   const allIds=[...scope.modelIds,...this.#bindings.map(binding=>binding.to)];fields.queryContext={dataSpaceId:this.input.targetId,modelIds:allIds};fields.filterExpression={logic:'and',filters:[{field:'dataSetId',operator:'eq',value:this.input.targetId},{field:'dataModelId',operator:'in',value:allIds}]};this.#contexts.set(fields,JSON.stringify([fields.queryContext,fields.filterExpression,fields.queryConfig]));await fields.refresh();this.assertOriginals();readable(fields)
   for(const copy of prepared.fields)await this.add(fields,copy.from,copy.value)
   for(const copy of prepared.relations)await this.add(relations,copy.from,copy.value)
   this.checkTargets();const rootId=this.#rootId;if(!rootId)throw Error('隔离目标模型新增身份缺失')
   await DataSpaceDefinitionSave.run([{dataSet:this.input.dataSet,targetId:this.input.targetId,modelId:rootId,
    prepare:()=>Promise.resolve().then(()=>this.checkTargets()),apply:async()=>{for(const view of this.#views){const ids=this.#items.filter(item=>item.view===view).map(item=>item.id);if(ids.length){const result=await view.applyEditingRows(ids);if(!result.success)throw Error('隔离定义编辑未应用')}this.guard()}},check:()=>this.checkTargets(),
    targets:()=>this.#views.map(view=>({tableName:view.tableName,viewId:view.viewId,ids:this.#items.filter(item=>item.view===view).map(item=>item.id)})).filter(target=>target.ids.length),
    dispatched:capture=>{this.#capture=capture;this.#signatures=capture.targets.map(target=>[target.view,target.ids,definitionTargetDraftSignature(target.view,target.ids)] as const)},confirm:()=>this.readback(),failed:()=>{}}])
   return rootId
  }finally{this.#busy=false}
 }
 private async readback():Promise<void>{
  this.guard();if(this.#capture?.resolution!=='confirmed')throw Error('隔离原批次尚未取得正式确认')
  if(this.#items.some(item=>item.view.hasEditingChanges(item.id)||item.view.dirtyTracking.hasPendingChanges(item.id)))throw Error('隔离已保存，但目标有后续修改；保留修改后再核验')
  for(const view of this.#views){const independent=view.createQueryView(`componentVerify_${crypto.randomUUID().replaceAll('-','')}`)
   try{await independent.refresh();this.guard();const rows=readable(independent),items=this.#items.filter(item=>item.view===view),targetIds=new Set(items.map(item=>item.id))
    if(JSON.stringify(sorted(rows.filter(row=>!targetIds.has(String(row['rowid'])))))!==JSON.stringify(sorted(this.#before.get(view)??[]))||rows.length!==(this.#before.get(view)?.length??0)+items.length)throw Error('隔离独立回读原图保留范围不一致')
    for(const item of items){const row=rows.find(candidate=>candidate['rowid']===item.id);if(!row||Object.entries(item.values).some(([key,value])=>JSON.stringify(row[key])!==JSON.stringify(value)))throw Error('隔离独立回读新增值不一致')}
    if(this.#items.some(item=>item.view.hasEditingChanges(item.id)||item.view.dirtyTracking.hasPendingChanges(item.id)))throw Error('隔离回读期间出现后续修改；修改已保留')
   }finally{independent.dataTable?.destroyView(independent.viewId)}
  }
  this.#confirmed=true
 }
 /** 只核同一原捕获，未生效不自动重新创建，部分结果不当作全部确认。 */
 async verify():Promise<{confirmed:boolean;modelId:string|null}>{
  this.guard();if(this.#busy)throw Error('隔离分量仍在操作');this.#busy=true
  try{if(!this.#capture){this.discardRows();return{confirmed:false,modelId:null}}
   const result=await verifyDataSpaceDefinitionCapture(this.input.dataSet,this.#capture)
   if(result==='not-applied')return{confirmed:false,modelId:this.#rootId}
   await this.readback();return{confirmed:true,modelId:this.#rootId}
  }finally{this.#busy=false}
 }
 /** 明确放弃原生证明未生效的批次；不发新请求重放创建。 */
 async abandonNotApplied():Promise<void>{this.guard();if(this.#busy||this.#capture?.resolution!=='not-applied')throw Error('原隔离批次尚未证明未生效');this.#busy=true;try{if(this.#signatures.some(([view,ids,signature])=>definitionTargetDraftSignature(view,ids)!==signature))throw Error('原隔离目标有后续修改；不能放弃');await verifyAndDiscardDataSpaceDefinitionCapture(this.input.dataSet,this.#capture,{acceptCurrentOnInvalidReceipt:false});this.#capture=undefined;this.#items.length=0;this.#discarded=true}finally{this.#busy=false}this.release()}
 /** 原批次已确认后，显式只丢弃捕获目标的新编辑，再独立核对同一组记录。 */
 async discardLocalChanges():Promise<void>{this.guard();if(this.#busy||this.#capture?.resolution!=='confirmed')throw Error('原隔离批次尚未完整确认');this.#busy=true;try{await verifyAndDiscardDataSpaceDefinitionCapture(this.input.dataSet,this.#capture,{acceptCurrentOnInvalidReceipt:false});await this.readback()}finally{this.#busy=false}}
 private discardRows():void{if(this.#unresolved)throw Error('隔离新增身份尚不唯一，保留原视图待处理');for(const view of this.#views){const ids=this.#items.filter(item=>item.view===view).map(item=>item.id);if(view.hasUnconfirmedSave)throw Error('原隔离提交仍未确认');view.discardPendingChanges(ids)}this.#items.length=0;this.#discarded=true}
 private status():ModelCreateStatus{if(this.#busy)return 'saving';if(this.#confirmed)return 'idle';if(this.#capture?.resolution==='not-applied')return 'different';if(this.#capture?.resolution==='confirmed')return 'readback';if(this.#capture)return 'unknown';if(this.#discarded)return 'ready';return this.#sourceModelId?'unsubmitted':'idle'}
 /** 与原单模型fork一致暴露目标字段映射，同时保留整个分量清单。 */
 getState(){const status=this.status(),rootFields=this.#items.filter(item=>item.view.tableName===this.input.fields.tableName&&item.values['dataModelId']===this.#rootId),verification:Array<{table:string;id:string;result:string}>=[];return{status,pending:status!=='idle'&&status!=='ready',modelId:this.#rootId,canAbandonNotApplied:this.#capture?.resolution==='not-applied',canDiscardLocalChanges:this.#capture?.resolution==='confirmed'&&this.#items.some(item=>item.view.hasEditingChanges(item.id)||item.view.dirtyTracking.hasPendingChanges(item.id)),verification,fork:this.#rootId?{sourceModelId:this.#sourceModelId,modelId:this.#rootId,fieldIds:rootFields.map(item=>({from:item.from,to:item.id})),confirmed:this.#confirmed,models:structuredClone(this.#bindings),relationIds:this.#items.filter(item=>item.view.tableName===this.input.relations.tableName).map(item=>({from:item.from,to:item.id}))}:null}}
 /** 未派发可取消；已创建的正式分量由后续命令精确清理，不伪造回滚。 */
 discard():void{this.guard();if(this.#capture||this.#busy)throw Error('隔离分量已开始提交，须继续核验');this.discardRows();this.release()}
 /** 完整确认或本地取消后释放专用查询；原捕获和草稿尚在时拒绝释放。 */
 release():void{if(this.#busy||this.#capture&&!this.#confirmed||this.#views.some(view=>view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()))throw Error('隔离分量仍有原始捕获或草稿');for(const view of this.#views)view.dataTable?.destroyView(view.viewId);this.#closed=true}
}
