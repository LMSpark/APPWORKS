/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/sort-fields
 * 职责：沿原运行实例读取Excel排序物理字段，并在原节点模型保存链验证排序。
 * 边界：不缓存业务行、不持有排序草稿、不提交或规范化既有定义。
 */
import {buildDataViewKey,RequestState,type DataSet,type DataView,type DataTableQuerySaveReferences,type DataTableQuerySaveRuleInput} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {resolveExcelPhysicalObject} from './physical-source'
import {readExcelTransformRows} from './queries'
const sourceId='34BDBE645F461A3D83282A941D6037F4',designId='0F93B82141CF40852021D704B0E30BF4',table='Base_ImportData_Config'
/** 已核原始存储合同；顺序就是排序优先级，未知扩展不在此丢弃。 */
export function readExcelSortFields(value:unknown):string[]{
 if(value===null||value===undefined||value==='')return []
 if(typeof value!=='string')throw Error('导出排序必须是JSON文本')
 if(!value.trim())return []
 const rows=parseJsonDocument(value)
 if(!Array.isArray(rows))throw Error('导出排序必须是数组')
 return rows.map(row=>{
  if(!isRecord(row)||typeof row['Field']!=='string'||!row['Field'].trim()||row['Field'].trim()!==row['Field']||typeof row['Type']!=='string'||!['ascending','descending'].includes(row['Type']))throw Error('每项导出排序须指定物理字段及升序或降序')
  return row['Field']
 })
}
/** 原节点DataTable仅对实际排序变更调用；不改写未编辑的历史字符串。 */
export function validateExcelSort(input:DataTableQuerySaveRuleInput):undefined{readExcelSortFields(input.values['sorted']);return undefined}
/** 原设计实例及其宿主；不另创建数据空间或查询执行器。 */
export type ExcelSortOwner=Readonly<{
 /** 本次设计的原生0F93实例。 */
 dataSet:DataSet
 /** 原页面宿主，按需加载34B；不得替换成另建查询上下文。 */
 getPage?:()=>PageRuntime
}>
function requireNodes(owner:ExcelSortOwner):DataView{
 const nodes=owner.dataSet.getView(table)
 if(owner.dataSet.destroyed||owner.dataSet.scenarioId!==designId||!nodes||nodes.dataTable?.modelBinding?.modelName!==table)throw Error('排序缺少原节点模型视图')
 return nodes
}
/** 精确节点实际修改的字段沿原DataSet保存预检核对；空排序及普通名称修改不扫物理字段。 */
export function createExcelSortReferences(owner:ExcelSortOwner):DataTableQuerySaveReferences{
 const nodes=requireNodes(owner),ds=owner.dataSet
 return {fields:['schemeid','relatedappid','table','sorted'],triggerFields:['sorted','relatedappid','table'],operations:['create','update'],validate:async({changes})=>{
  const scheme=nodes.queryContext['importConfigId'],context=JSON.stringify(nodes.queryContext),page=owner.getPage?.()
  const check=()=>{if(ds.destroyed||ds.getView(table)!==nodes||JSON.stringify(nodes.queryContext)!==context||owner.getPage?.()!==page||page?.getDataSet(designId)!==ds)throw Error('排序保存的原运行实例已变化')}
  for(const change of changes){
   if(change.kind==='delete')continue
   const selected=readExcelSortFields(change.values['sorted']);if(!selected.length)continue
   check()
   if(!page||typeof scheme!=='string'||change.values['schemeid']!==scheme)throw Error('排序保存缺少正式方案及节点身份')
   const candidates=new Set(nodes.dataTable?.viewList.flatMap(view=>view.rows.filter(row=>change.matchesKey(view.getPkKey(row))&&view.fieldAccess(row,'rowid').read==='visible'&&row['schemeid']===scheme).map(row=>row['rowid'])))
   const nodeId=[...candidates][0]
   if(candidates.size!==1||typeof nodeId!=='string'||!nodeId)throw Error('排序变更未匹配原节点查询身份')
   const formal=await readExcelTransformRows({dataSet:ds,table,fields:['rowid','schemeid','relatedappid','table','sorted'],filter:{logic:'and',filters:[{field:'rowid',operator:'eq',value:nodeId},{field:'schemeid',operator:'eq',value:scheme}]},check})
   if(change.kind==='create'){if(formal.length)throw Error('新增排序节点身份已存在')}
   else if(formal.length!==1||!change.matchesKey(formal[0]?.['rowid'])||!change.originalValues||['schemeid','relatedappid','table','sorted'].some(field=>JSON.stringify(formal[0]?.[field])!==JSON.stringify(change.originalValues?.[field])))throw Error('排序节点正式原值已变化，请重新读取')
   const app=change.values['relatedappid'],path=change.values['table']
   if(typeof app!=='string'||typeof path!=='string')throw Error('排序缺少正式应用及物理路径')
   await page.ensureScenarioLoaded(sourceId);check()
   const source=page.getDataSet(sourceId)
   if(!source)throw Error('排序缺少原物理来源空间')
   const guarded=()=>{check();if(source.destroyed||page.getDataSet(sourceId)!==source)throw Error('排序物理来源实例已变化')}
   const physical=await resolveExcelPhysicalObject({source,applicationId:app,path,allowView:true,check:guarded})
   const rows=await readExcelTransformRows({dataSet:source,table:'Base_TblField',viewId:'excelSortFields',fields:['rowid','tblid','enname'],filter:{logic:'and',filters:[{field:'tblid',operator:'eq',value:physical.objectId},{field:'enname',operator:'in',value:[...new Set(selected)]}]},check:guarded})
   const names=new Set<unknown>(),ids=new Set<unknown>()
   for(const row of rows){if(row['tblid']!==physical.objectId||typeof row['enname']!=='string'||!selected.includes(row['enname'])||names.has(row['enname'])||ids.has(row['rowid']))throw Error('排序物理字段身份不唯一');names.add(row['enname']);ids.add(row['rowid'])}
   if(selected.some(name=>!names.has(name)))throw Error('导出排序字段不属于当前物理表或视图')
  }
 }}
}
/** 仅管理原命名视图的读取代次；字段记录及权限仍由该DataView持有。 */
export class ExcelSortFieldDirectory{
 /** 标准字段候选直接绑定的完整键。 */
 readonly dataViewKey=buildDataViewKey('Base_TblField','excelSortFields',sourceId)
 /** 仅完整正式读取成功后允许编辑；字段和权限仍在原视图。 */
 private isReady=false
 /** 每次消费重新核对原目录，关闭事件派发前的旧候选窗口。 */
 get ready():boolean{this.recheck();return this.isReady}
 /** 当前读取失败或目标未保存的诊断，不吞成合法空候选。 */
 error=''
 private generation=0
 private disposed=false
 private validateDirectory:(()=>void)|undefined
 private detach:(()=>void)|undefined
 /** @param owner 原设计实例及其宿主，不持有页面排序数组。 */
 constructor(private readonly owner:ExcelSortOwner,private readonly onStateChange?:()=>void){requireNodes(owner)}
 private recheck():void{
  if(!this.isReady||!this.validateDirectory)return
  try{this.validateDirectory()}catch(cause){this.isReady=false;this.error=cause instanceof Error?cause.message:String(cause);this.onStateChange?.()}
 }
 private get view():DataView|undefined{return this.owner.getPage?.().getDataSet(sourceId)?.getView('Base_TblField','excelSortFields')}
 private clearDirectory():void{const view=this.view;if(view&&!view.destroyed&&!view.hasUnconfirmedSave&&!view.hasEditingChanges()&&!view.dirtyTracking.hasPendingChanges())view.clearAll()}
 /** 切换节点/来源时立即撤销旧目录和正在飞行的查询结果。 */
 invalidate():void{this.generation++;this.detach?.();this.detach=undefined;this.validateDirectory=undefined;this.isReady=false;this.error='';this.clearDirectory()}
 /** 只读取当前已保存的源身份；草稿来源须先沿原保存或取消命令处理。 */
 async load():Promise<void>{
  this.invalidate()
  const own=this.generation,nodes=requireNodes(this.owner),ds=this.owner.dataSet,page=this.owner.getPage?.(),row=nodes.currentRow,id=row?nodes.getPkKey(row):undefined
  if(!row||id===undefined)return
  const context=JSON.stringify(nodes.queryContext),fields=['rowid','schemeid','relatedappid','table'],values=fields.map(field=>row[field])
  const check=()=>{
   const editing=nodes.getEditingRow(id)
   if(nodes.dirtyTracking.isPendingCreate(id)||fields.some(field=>Object.hasOwn(nodes.getDirtyChanges(id),field)))throw Error('排序来源尚未保存，请先保存或取消来源修改')
   if(this.disposed||own!==this.generation||ds.destroyed||ds.getView(table)!==nodes||nodes.currentRow!==row||JSON.stringify(nodes.queryContext)!==context||this.owner.getPage?.()!==page||page?.getDataSet(designId)!==ds||fields.some((field,index)=>nodes.fieldAccess(row,field).read!=='visible'||row[field]!==values[index]||editing?.[field]!==values[index]))throw Error('排序目录的原节点或来源已变化')
  }
  try{
   check();nodes.readSnapshot()
   if(!page||row['schemeid']!==nodes.queryContext['importConfigId']||typeof row['relatedappid']!=='string'||!row['relatedappid']||typeof row['table']!=='string'||!row['table'])throw Error('请先选择并保存目标数据表或视图')
   await page.ensureScenarioLoaded(sourceId);check()
   const source=page.getDataSet(sourceId),view=this.view
   if(!source||!view)throw Error('排序字段缺少正式命名视图')
   const guarded=()=>{check();if(source.destroyed||view.destroyed||page.getDataSet(sourceId)!==source||this.view!==view)throw Error('排序字段来源实例已变化')}
   const physical=await resolveExcelPhysicalObject({source,applicationId:row['relatedappid'],path:row['table'],allowView:true,check:guarded})
   const expected={field:'tblid',operator:'eq' as const,value:physical.objectId}
   const filter=JSON.stringify(expected),viewContext=JSON.stringify(view.queryContext),queryConfig=JSON.stringify(view.queryConfig)
   view.filterExpression=expected
   await view.refresh();guarded()
   const validate=()=>{
   guarded()
   if(JSON.stringify(view.filterExpression)!==filter||JSON.stringify(view.queryContext)!==viewContext||JSON.stringify(view.queryConfig)!==queryConfig||view.hasUnconfirmedSave)throw Error('排序字段目录查询身份已变化')
   if(view.loadingError)throw view.loadingError
   if(view.requestState!==RequestState.Loaded||!view.countReported||view.total!==view.rows.length||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('排序字段目录尚未取得完整正式结果')
   view.readSnapshot()
   const names=new Set<string>(),ids=new Set<unknown>()
   for(const field of view.rows){if(['rowid','tblid','enname'].some(name=>view.fieldAccess(field,name).read!=='visible')||field['tblid']!==physical.objectId||typeof field['enname']!=='string'||!field['enname'].trim()||names.has(field['enname'])||ids.has(field['rowid']))throw Error('排序字段目录身份或名称不唯一');names.add(field['enname']);ids.add(field['rowid'])}
   }
   validate();this.validateDirectory=validate;this.isReady=true
   const events=['configChanged','rowsChanged','requestStateChanged','cleared','editingChanged','mutatingChanged','disposing'] as const
   const changed=()=>this.recheck()
   for(const event of events)view.events.on(event,changed)
   this.detach=()=>{for(const event of events)view.events.off(event,changed)}
  }catch(cause){if(own===this.generation&&!this.disposed){this.isReady=false;this.error=cause instanceof Error?cause.message:String(cause)}}
 }
 /** 释放不触碰正式节点或来源表，撤销本次专用视图的晚结果。 */
 dispose():void{this.invalidate();this.disposed=true}
}
