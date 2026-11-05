/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/physical-source
 * 职责：按Excel节点的正式应用和物理路径定位唯一元数据对象。
 * 边界：只查询原DataSet的独立视图，不改变选择器、业务数据或保存入口。
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {readExcelTransformRows} from './queries'
/** 原来源实例、明确应用和库名@对象名；可选视图回退遵循表优先。 */
export type ExcelPhysicalObjectInput=Readonly<{
 /** 原PageRuntime按需装配的34B来源。 */
 source:DataSet
 /** 当前节点的可读应用身份。 */
 applicationId:string
 /** 当前节点的可读物理路径，不接受内部模型键。 */
 path:string
 /** 仅实际允许物理视图的消费者显式启用，默认只接受表。 */
 allowView?:boolean
 /** 每次异步边界核对原实例和目标。 */
 check():void
}>
/** 查询唯一非空数据库身份和对象主键，不返回业务行或权限凭据。 */
export async function resolveExcelPhysicalObject(input:ExcelPhysicalObjectInput):Promise<Readonly<{kind:'Table'|'View';databaseId:string;objectId:string}>>{
 const {source,applicationId,path,check}=input,parts=path.split('@')
 check()
 if(source.destroyed||source.scenarioId!=='34BDBE645F461A3D83282A941D6037F4'||!applicationId||parts.length!==2||!parts[0]||!parts[1])throw Error('Excel缺少正式应用及库表路径')
 const relations=await readExcelTransformRows({dataSet:source,table:'Base_AppAndSource_Relation',viewId:'excelStoredDatabases',fields:['sysid','conName','conid'],filter:{logic:'and',filters:[{field:'sysid',operator:'eq',value:applicationId},{field:'conName',operator:'eq',value:parts[0]}]},check})
 const ids=new Set(relations.map(row=>row['conid'])),databaseId=[...ids][0]
 if(!relations.length||ids.size!==1||typeof databaseId!=='string'||!databaseId||relations.some(row=>row['sysid']!==applicationId||row['conName']!==parts[0]))throw Error('Excel数据库归属或运行库名不唯一')
 const tables=await readExcelTransformRows({dataSet:source,table:'_Base_TblList',viewId:'excelStoredObject',fields:['rowid','tblname'],filter:{logic:'and',filters:[{field:'dbid',operator:'eq',value:databaseId},{field:'tblname',operator:'eq',value:parts[1]}]},check})
 const table=tables[0]
 if(tables.length===1&&table?.['tblname']===parts[1]&&typeof table['rowid']==='string'&&table['rowid'])return {kind:'Table',databaseId,objectId:table['rowid']}
 if(tables.length||!input.allowView)throw Error('Excel物理表不存在或不唯一')
 const views=await readExcelTransformRows({dataSet:source,table:'_Base_ViewList',viewId:'excelStoredObject',fields:['rowid','dbid','vewname'],filter:{logic:'and',filters:[{field:'dbid',operator:'eq',value:databaseId},{field:'vewname',operator:'eq',value:parts[1]}]},check})
 const view=views[0]
 if(views.length!==1||view?.['dbid']!==databaseId||view['vewname']!==parts[1]||typeof view['rowid']!=='string'||!view['rowid'])throw Error('Excel物理视图不存在或不唯一')
 return {kind:'View',databaseId,objectId:view['rowid']}
}
