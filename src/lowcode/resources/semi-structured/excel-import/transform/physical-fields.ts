/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/physical-fields
 * 职责：排序与版式共用原命名DataView的物理字段目录与读取代次。
 * 边界：显式节点身份，各目录独立绑定；不缓存字段数组、不保存、不建立查询owner。
 */
import {buildDataViewKey,RequestState,type DataSet,type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {resolveExcelPhysicalObject} from './physical-source'
const sourceId='34BDBE645F461A3D83282A941D6037F4',designId='0F93B82141CF40852021D704B0E30BF4',table='Base_ImportData_Config'
/** 原设计实例和明确的物理字段目录，不提供隐式节点或空间回退。 */
export type ExcelPhysicalFieldOwner=Readonly<{
 /** 原设计DataSet。 */
 dataSet:DataSet
 /** 本次原PageRuntime。 */
 getPage:()=>PageRuntime
 /** 原34B声明的字段命名视图。 */
 viewId:string
 /** 本次明确选择的原节点主键。 */
 recordId:()=>string|number|undefined
 /** 业务已确认是否允许物理视图来源。 */
 allowView:boolean
}>
/** 原命名视图持有候选及权限，本对象只核对其正式来源身份。 */
export class ExcelPhysicalFieldDirectory{
 /** 标准字段或JSON Schema选项绑定使用的完整键。 */
 readonly dataViewKey:string
 private isReady=false
 /** 消费时同步重核，拒绝事件派发前的旧候选。 */
 get ready():boolean{this.recheck();return this.isReady}
 /** 当前正式来源尚未就绪的诊断。 */
 error=''
 private generation=0
 private disposed=false
 private validateDirectory:(()=>void)|undefined
 private detach:(()=>void)|undefined
 /** @param owner 显式节点及原命名视图。 @param onStateChange 原宿主刷新呈现状态。 */
 constructor(private readonly owner:ExcelPhysicalFieldOwner,private readonly onStateChange?:()=>void){
  this.owner=Object.freeze({...owner});this.nodes();this.dataViewKey=buildDataViewKey('Base_TblField',owner.viewId,sourceId)
 }
 private nodes():DataView{
  const nodes=this.owner.dataSet.getView(table)
  if(this.owner.dataSet.destroyed||this.owner.dataSet.scenarioId!==designId||!nodes||nodes.dataTable?.modelBinding?.modelName!==table)throw Error('物理字段目录缺少原节点模型')
  return nodes
 }
 private recheck():void{if(!this.isReady||!this.validateDirectory)return;try{this.validateDirectory()}catch(cause){this.isReady=false;this.error=cause instanceof Error?cause.message:String(cause);this.onStateChange?.()}}
 private get view():DataView|undefined{if(this.owner.dataSet.destroyed)return undefined;const page=this.owner.getPage();return page.destroyed?undefined:page.getDataSet(sourceId)?.getView('Base_TblField',this.owner.viewId)}
 private clearDirectory():void{const view=this.view;if(view&&!view.destroyed&&!view.hasUnconfirmedSave&&!view.hasEditingChanges()&&!view.dirtyTracking.hasPendingChanges())view.clearAll()}
 /** 撤销本目录的晚结果及旧候选；不清除外部编辑。 */
 invalidate():void{this.generation++;this.detach?.();this.detach=undefined;this.validateDirectory=undefined;this.isReady=false;this.error='';this.clearDirectory()}
 /** 按当前显式节点的已保存来源读取；不切换原节点指针。 */
 async load():Promise<void>{
  this.invalidate()
  const own=this.generation
  try{
  if(this.disposed||this.owner.dataSet.destroyed||this.owner.getPage().destroyed)return
  const nodes=this.nodes(),ds=this.owner.dataSet,page=this.owner.getPage(),id=this.owner.recordId(),row=id===undefined?undefined:nodes.rows.find(value=>nodes.getPkKey(value)===id)
  if(!row||id===undefined)return
  const context=JSON.stringify(nodes.queryContext),fields=['rowid','schemeid','relatedappid','table'],values=fields.map(field=>row[field])
  const check=()=>{
   if(nodes.dirtyTracking.isPendingCreate(id)||fields.some(field=>Object.hasOwn(nodes.getDirtyChanges(id),field)))throw Error('物理来源尚未保存，请先保存或取消来源修改')
   const editing=nodes.getEditingRow(id)
   if(this.disposed||own!==this.generation||ds.destroyed||nodes.destroyed||ds.getView(table)!==nodes||this.owner.recordId()!==id||!nodes.rows.includes(row)||JSON.stringify(nodes.queryContext)!==context||this.owner.getPage()!==page||page.getDataSet(designId)!==ds||fields.some((field,index)=>nodes.fieldAccess(row,field).read!=='visible'||row[field]!==values[index]||editing?.[field]!==values[index]))throw Error('物理字段目录的原节点或来源已变化')
  }
   check();nodes.readSnapshot()
   if(row['schemeid']!==nodes.queryContext['importConfigId']||typeof row['relatedappid']!=='string'||!row['relatedappid']||typeof row['table']!=='string'||!row['table'])throw Error('请先选择并保存目标数据表或视图')
   await page.ensureScenarioLoaded(sourceId);check()
   const source=page.getDataSet(sourceId),view=this.view
   if(!source||!view)throw Error('物理字段缺少正式命名视图')
   const guarded=()=>{check();if(source.destroyed||view.destroyed||page.getDataSet(sourceId)!==source||this.view!==view)throw Error('物理字段来源实例已变化')}
   const physical=await resolveExcelPhysicalObject({source,applicationId:row['relatedappid'],path:row['table'],allowView:this.owner.allowView,check:guarded})
   const expected={field:'tblid',operator:'eq' as const,value:physical.objectId},filter=JSON.stringify(expected),viewContext=JSON.stringify(view.queryContext),queryConfig=JSON.stringify(view.queryConfig)
   view.filterExpression=expected;await view.refresh();guarded()
   const validate=()=>{
    guarded()
    if(JSON.stringify(view.filterExpression)!==filter||JSON.stringify(view.queryContext)!==viewContext||JSON.stringify(view.queryConfig)!==queryConfig||view.hasUnconfirmedSave)throw Error('物理字段目录查询身份已变化')
    if(view.loadingError)throw view.loadingError
    if(view.requestState!==RequestState.Loaded||!view.countReported||view.total!==view.rows.length||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())throw Error('物理字段目录尚未取得完整正式结果')
    view.readSnapshot();const names=new Set<string>(),ids=new Set<unknown>()
    for(const field of view.rows){if(['rowid','tblid','enname'].some(name=>view.fieldAccess(field,name).read!=='visible')||field['tblid']!==physical.objectId||typeof field['enname']!=='string'||!field['enname'].trim()||names.has(field['enname'])||ids.has(field['rowid']))throw Error('物理字段目录身份或名称不唯一');names.add(field['enname']);ids.add(field['rowid'])}
   }
   validate();this.validateDirectory=validate;this.isReady=true
   const events=['configChanged','rowsChanged','requestStateChanged','cleared','editingChanged','mutatingChanged','disposing'] as const,changed=()=>this.recheck()
   for(const event of events)view.events.on(event,changed)
   this.detach=()=>{for(const event of events)view.events.off(event,changed)}
  }catch(cause){if(own===this.generation&&!this.disposed){this.isReady=false;this.error=cause instanceof Error?cause.message:String(cause)}}
 }
 /** 释放本次目录的监听与读取代次。 */
 dispose():void{this.invalidate();this.disposed=true}
}
