/**
 * @module app:lowcode/resources/semi-structured/excel-import/transform/export-fields
 * 职责：按导出实际库表路径核对候选输入列；不把Excel映射当成物理字段。
 * 边界：仅查询原PageRuntime按需装配的34B元数据，独立查询不改变选择弹窗。
 */
import type {DataSet,DataRow} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {excelTransformEnumValue} from './definition'
import {readExcelTransformRows} from '../metadata/queries'
import {resolveExcelPhysicalObject} from '../metadata/physical-source'
/** 原运行实例及当前节点的精确导出来源。 */
export type ExcelTransformExportSource=Readonly<{
 /** 原设计DataSet，不另装配同空间。 */
 dataSet:DataSet
 /** 返回本次宿主，缺失时显式拒绝物理证明。 */
 getPage?:()=>PageRuntime
 /** 正式节点投影。 */
 node:Readonly<DataRow>
 /** 本次变更前正式规则。 */
 before:ReadonlyArray<Readonly<DataRow>>
 /** 仅叠加本批变更后的规则。 */
 after:ReadonlyArray<Readonly<DataRow>>
 /** 有有效列号的Excel输出映射。 */
 outputFields:readonly string[]
 /** 原实例生命周期守卫。 */
 check():void
}>
const sourceId='34BDBE645F461A3D83282A941D6037F4'
/** 原规则和本批规则分别产生的真实查询初始字段。 */
export type ExcelTransformExportProjection=Readonly<{before:string[];after:string[]}>
function projection(rules:ReadonlyArray<Readonly<DataRow>>,mapped:readonly string[]):Set<string>{
 const fields=new Set(mapped),synthetic=new Set<string>(),produced=new Set<string>(),initial=new Set<string>()
 for(const row of [...rules].sort((a,b)=>Number(a['sort_order']??0)-Number(b['sort_order']??0))){
  if(row['enabled']!==null&&row['enabled']!==1)continue
  const raw=row['config_json'],cfg=typeof raw==='string'&&raw.trim()?parseJsonDocument(raw):{}
  if(!isRecord(cfg)||!['EXPORT','BOTH'].includes(excelTransformEnumValue(cfg['executionScope']??'IMPORT')))continue
  const sources:unknown[]=[],targets:unknown[]=[],type=excelTransformEnumValue(row['rule_type'])
  if(type==='PIVOT'){
   if(Array.isArray(cfg['groupFields']))sources.push(...cfg['groupFields'])
   sources.push(cfg['keyField'],cfg['valueField'])
   if(isRecord(cfg['columns']))targets.push(...Object.values(cfg['columns']))
  }
  if(type==='UNPIVOT'){
   if(Array.isArray(cfg['columns']))for(const column of cfg['columns'])if(isRecord(column))sources.push(column['sourceField'])
   targets.push(cfg['keyTargetField'],cfg['valueTargetField'])
  }
  for(const source of sources)if(typeof source==='string'&&source.trim()){fields.add(source);if(!produced.has(source))initial.add(source)}
  for(const target of targets)if(typeof target==='string'){synthetic.add(target);produced.add(target)}
 }
 for(const field of fields)if(!field.trim()||synthetic.has(field))fields.delete(field)
 for(const field of initial)fields.add(field)
 return fields
}
/** 返回确实存在的候选物理列；生成列与已被行结构操作移除的列仍由规则管线区分。 */
export async function readExcelTransformExportFields(input:ExcelTransformExportSource):Promise<ExcelTransformExportProjection>{
 const before=projection(input.before,input.outputFields),after=projection(input.after,input.outputFields),names=new Set([...before,...after])
 if(!names.size)return {before:[],after:[]}
 const page=input.getPage?.()
 if(page?.getDataSet(input.dataSet.scenarioId??'') !== input.dataSet)throw Error('转换导出引用缺少原页面运行实例')
 const check=()=>{input.check();if(input.getPage?.()!==page||page.getDataSet(input.dataSet.scenarioId??'')!==input.dataSet)throw Error('转换导出原运行实例已变化')}
 check();await page.ensureScenarioLoaded(sourceId);check()
 const source=page.getDataSet(sourceId)
 if(!source||source.destroyed)throw Error('转换导出缺少正式物理来源空间')
 const guarded=()=>{check();if(page.getDataSet(sourceId)!==source||source.destroyed)throw Error('转换导出物理来源实例已变化')}
 const table=input.node['table'],app=input.node['relatedappid']
 if(typeof table!=='string'||typeof app!=='string'||!app)throw Error('转换导出缺少正式应用及库表路径')
 const physical=await resolveExcelPhysicalObject({source,applicationId:app,path:table,check:guarded})
 const columns=await readExcelTransformRows({dataSet:source,table:'Base_TblField',viewId:'excelFields',fields:['rowid','tblid','enname'],filter:{logic:'and',filters:[{field:'tblid',operator:'eq',value:physical.objectId},{field:'enname',operator:'in',value:[...names]}]},check:guarded})
 const found=new Set<string>(),ids=new Set<unknown>()
 for(const row of columns){
  const name=row['enname'];if(typeof name!=='string'||!names.has(name)||row['tblid']!==physical.objectId||found.has(name)||ids.has(row['rowid']))throw Error('转换导出物理字段身份或名称不唯一')
  found.add(name);ids.add(row['rowid'])
 }
 for(const field of after)if(!before.has(field)&&!found.has(field))throw Error(`本次导出新增的查询字段不存在于物理表: ${field}`)
 return {before:[...before].filter(field=>found.has(field)),after:[...after].filter(field=>found.has(field))}
}
