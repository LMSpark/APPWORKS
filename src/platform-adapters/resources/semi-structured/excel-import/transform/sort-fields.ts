/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/sort-fields
 * 职责：沿原运行实例读取Excel排序物理字段，并在原节点模型保存链验证排序。
 * 边界：不缓存业务行、不持有排序草稿、不提交或规范化既有定义。
 */
import type {DataSet,DataView,DataTableQuerySaveReferences,DataTableQuerySaveRuleInput} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {resolveExcelPhysicalObject} from '../metadata/physical-source'
import {readExcelTransformRows} from '../metadata/queries'
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
