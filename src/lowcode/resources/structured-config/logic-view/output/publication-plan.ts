/**
 * @module app:lowcode/resources/structured-config/logic-view/output/publication-plan
 * 职责：依据当前正式来源核对普通单表输出，生成发布字段值。
 * 边界：不读取或保存数据，不持有草稿；不将未核实的层次/计算结果伪装为平面字段。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import type {PageDataSpaceModelSourcePrepared} from '../../../../data-space/model-source/lowcode-data-space-source-catalog'

/** 正式Base_TblField的可发布成员；身份与所属viewId由原DataView承接。 */
export type LogicViewOutputField=Readonly<{enname:string;cnname:string;description:string;DataType:string;IsPKey:number}>
function text(value:unknown):string{return typeof value==='string'?value.trim():''}
function empty(value:unknown):boolean{return value===undefined||value===null||value===''}
function flag(value:unknown,required=false):boolean{
 if(required&&(value===undefined||value===null||value===''))throw Error('输出标记必须明确声明0或1')
 if(value===1||value==='1'||value===true)return true
 if(value===undefined||value===null||value===0||value==='0'||value===false||value==='')return false
 throw Error('输出字段标记不是明确的0或1')
}
/** 仅接受已核实的单根普通数据库表；发布前须以当次来源reader重新准备source。 */
export function compileLogicViewOutputFields(input:Readonly<{design:unknown;source:PageDataSpaceModelSourcePrepared}>):readonly LogicViewOutputField[]{
 const {design,source}=input
 if(!Array.isArray(design)||design.length!==1||!isRecord(design[0]))throw Error('输出发布尚未确认多根或非节点数组形态')
 const node=design[0]
 if(node['OutputType']!=='Table'||!Array.isArray(node['ChildTables'])||node['ChildTables'].length)throw Error('输出发布尚未确认层次、导航或子表形态')
 if(source.source.type!=='table'||node['Type']!==source.model.Type||text(node['MetaName'])!==source.source.name
  ||text(node['DbId'])!==source.source.dbid||!source.source.id||!source.source.dbid||!source.source.databaseName)throw Error('输出发布来源身份不一致')
 if(!Array.isArray(node['Fields']))throw Error('输出字段数组缺失')
 const formal=new Map<string,typeof source.fields[number]>()
 for(const field of source.fields){if(field.type!=='dataModel')continue
  const name=field.Name.trim();if(!name||formal.has(name.toLowerCase())||!field.FieldType.trim())throw Error('正式来源字段身份或类型未确认')
  formal.set(name.toLowerCase(),field)
 }
 const primary=[...formal.values()].filter(field=>field.IsPKey===1),names=new Set<string>(),result:LogicViewOutputField[]=[]
 for(const field of node['Fields']){
  if(!isRecord(field))throw Error('输出字段不是对象')
  if(flag(field['Group'])||flag(field['DISTINCT']))throw Error('输出发布尚未确认聚合或去重形态')
  if(!flag(field['IsOutput'],true))continue
  if(typeof field['AsName']==='string'&&field['AsName']!==''&&!field['AsName'].trim())throw Error('输出字段别名不能为空白')
  const name=text(field['Name']),alias=text(field['AsName'])||name,original=formal.get(name.toLowerCase()),type=text(field['FieldType'])
  if(!name||!alias||names.has(alias.toLowerCase()))throw Error('输出字段名称缺失或重复')
  if(!original||!type||type!==original.FieldType.trim())throw Error('输出字段类型与正式来源不一致')
  if(!empty(field['ValueFun'])||!empty(field['Expression'])||!empty(field['Value']))throw Error('输出发布尚未确认计算字段的结果类型')
  const isPrimary=flag(field['IsPKey'])
  if(isPrimary&&(primary.length!==1||original.IsPKey!==1||text(node['PrimaryKeyFields'])!==original.Name))throw Error('输出主键尚未由正式单表唯一身份确认')
  names.add(alias.toLowerCase())
  const description=text(field['Description'])||text(field['description'])
  result.push(Object.freeze({enname:alias,cnname:description,description,DataType:type,IsPKey:isPrimary?1:0}))
 }
 if(!result.length)throw Error('空输出不能视作零列；正式查询的默认投影尚未确认')
 return Object.freeze(result)
}
