/**
 * @module app:lowcode/resources/semi-structured/excel-import/layout/definition
 * 职责：已实服验证的单组导出版式结构与坐标校验。
 * 边界：不查询、不规范化历史定义、不保存；未知成员保持原文归属。
 */
import {isJsonObject,parseJsonDocument,type JsonObject} from '@spark-appworks/spark-json-document'
/** 单组定义中的原对象与路径；仅供读取/显式命令操作其独立解析副本。 */
export type ExcelSingleExportLayout=Readonly<{
 /** 本次解析的完整独立JSON对象。 */
 document:JsonObject
 /** 主表物理路由定义。 */
 rootTable:JsonObject
 /** 明细物理路由定义。 */
 detailTable:JsonObject
 /** 固定格主表区域。 */
 form:JsonObject
 /** 明细区域。 */
 list:JsonObject
 /** 相对表尾区域。 */
 block:JsonObject
 /** 三区域在原数组中的下标，不改写原顺序。 */
 indexes:Readonly<{form:number;list:number;block:number}>
}>
function text(value:unknown):value is string{return typeof value==='string'&&value.trim()!==''&&value===value.trim()}
function object(value:unknown,label:string):JsonObject{if(!isJsonObject(value))throw Error(`${label}必须是对象`);return value}
function objects(value:unknown,label:string):JsonObject[]{if(!Array.isArray(value)||!value.every(isJsonObject))throw Error(`${label}必须是对象数组`);return value}
function same(a:unknown,b:unknown):boolean{return JSON.stringify(a)===JSON.stringify(b)}
/** 仅显式新建命令生成v3骨架；字段、坐标和关联键均等待用户填写。 */
export function createSingleExportLayout(root:string,detail:string):JsonObject{
 if(!text(root)||!text(detail)||root===detail||[root,detail].some(path=>path.split('@').length!==2||path.split('@').some(part=>!text(part))))throw Error('主表与明细须为不同的完整物理路由')
 const id=()=>crypto.randomUUID().replaceAll('-',''),head=id(),child=id(),form=id(),list=id(),block=id()
 return {version:3,enabled:false,tables:[{id:head,table:root,regionIds:[form,block]},{id:child,table:detail,regionIds:[list]}],regions:[
  {id:form,tableId:head,shape:'form',bounds:{sheet:0,from:'',to:''},fields:[]},
  {id:list,tableId:child,shape:'list',bounds:{sheet:0,from:'',to:''},scan:{},fields:[],link:{fromTableId:head,fromRegionId:form,parentField:'',foreignKeyField:''}},
  {id:block,tableId:head,shape:'block',bounds:{sheet:0,from:'',to:''},fields:[]},
 ],sheetOrder:[{op:'readWrite',regionId:form},{op:'readWrite',regionId:list},{op:'readWrite',regionId:block}]}
}
/** 只识别可完整编辑的已证实单组合同；其他定义明确只读，不自动转换。 */
export function readSingleExportLayout(raw:unknown):ExcelSingleExportLayout|undefined{
 if(raw===null||raw===undefined||raw==='')return undefined
 if(typeof raw!=='string')throw Error('版式必须是JSON文本')
 const document=object(parseJsonDocument(raw),'版式')
 if(document['version']!==3||typeof document['enabled']!=='boolean')throw Error('当前结构编辑只接受已验证的v3单组导出版式')
 const tables=objects(document['tables'],'表'),regions=objects(document['regions'],'区域'),steps=objects(document['sheetOrder'],'执行顺序')
 if(tables.length!==2||regions.length!==3||steps.length!==3||tables.some(table=>!text(table['id'])||!text(table['table']))||tables[0]?.['id']===tables[1]?.['id']||tables[0]?.['table']===tables[1]?.['table'])throw Error('单组版式须有主表和明细两条不同路由及三个区域')
 const indexes={form:regions.findIndex(region=>region['shape']==='form'),list:regions.findIndex(region=>region['shape']==='list'),block:regions.findIndex(region=>region['shape']==='block')}
 const form=regions[indexes.form],list=regions[indexes.list],block=regions[indexes.block],rootTable=tables[0],detailTable=tables[1]
 if(!form||!list||!block||!rootTable||!detailTable||new Set(regions.map(region=>region['id'])).size!==3||regions.some(region=>!text(region['id'])||!isJsonObject(region['bounds'])||region['bounds']['sheet']!==0||!Array.isArray(region['fields']))||form['tableId']!==rootTable['id']||block['tableId']!==rootTable['id']||list['tableId']!==detailTable['id'])throw Error('单组区域身份、来源或工作表无效')
 if(!same(rootTable['regionIds'],[form['id'],block['id']])||!same(detailTable['regionIds'],[list['id']])||steps.some((step,index)=>step['regionId']!==[form['id'],list['id'],block['id']][index]||step['op']!==undefined&&step['op']!=='readWrite'))throw Error('区域归属或执行顺序不属于已验证的单组合同')
 const link=object(list['link'],'明细关联');object(list['scan'],'明细读取设置')
 if(link['fromTableId']!==rootTable['id']||link['fromRegionId']!==form['id'])throw Error('明细关联必须指向本组主表')
 for(const [region,mode]of [[form,'cell'],[list,'listColumn'],[block,'afterList']] as const)for(const field of objects(region['fields'],'区域字段')){
  if(!isJsonObject(field['locate'])||field['locate']['mode']!==mode||field['lookup']!==undefined||field['desenId']!==undefined||field['codec']!==undefined)throw Error('该字段含尚未验证的定位、转换、引用或脱敏配置，保持只读')
 }
 return {document,rootTable,detailTable,form,list,block,indexes}
}
function column(value:unknown):number{
 if(typeof value!=='string'||!/^[A-Z]{1,3}$/.test(value))throw Error('列号须为大写Excel列名')
 const result=[...value].reduce((total,char)=>total*26+char.charCodeAt(0)-64,0)
 if(result>16384)throw Error('列号超过Excel范围');return result
}
function cell(value:unknown):Readonly<{row:number;column:number}>{
 if(typeof value!=='string')throw Error('请填写Excel单元格')
 const match=/^([A-Z]{1,3})([1-9]\d*)$/.exec(value),letters=match?.[1],row=Number(match?.[2])
 if(!letters||!Number.isSafeInteger(row)||row<1||row>1048576)throw Error('单元格超出Excel范围')
 return {row,column:column(letters)}
}
function integer(value:unknown,label:string):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>1048576)throw Error(`${label}须为正整数`);return value}
/** 原字段首次保存校验：结构、坐标、列与显式关联完整，不代替物理引用回读。 */
export function validateSingleExportLayout(raw:unknown):undefined{
 const part=readSingleExportLayout(raw);if(!part)return undefined
 const bounds=new Map<JsonObject,Readonly<{from:ReturnType<typeof cell>;to:ReturnType<typeof cell>}>>()
 for(const region of [part.form,part.list,part.block]){
  const box=object(region['bounds'],'区域范围'),from=cell(box['from']),to=cell(box['to'])
  if(from.row>to.row||from.column>to.column)throw Error('区域范围起点不得晚于终点')
  bounds.set(region,{from,to});if(!objects(region['fields'],'字段').length)throw Error('请配置每个区域的字段')
 }
 const listBounds=bounds.get(part.list),scan=object(part.list['scan'],'明细设置'),link=object(part.list['link'],'明细关联')
 if(!listBounds||!text(link['parentField'])||!text(link['foreignKeyField']))throw Error('请填写主键与明细外键')
 const header=integer(scan['headerRow'],'表头行'),offset=integer(scan['dataStartOffset'],'数据偏移')
 if(header<listBounds.from.row||header+offset>listBounds.to.row)throw Error('表头及数据起点须在明细范围内')
 const positions=new Set<string>()
 for(const region of [part.form,part.list,part.block])for(const field of objects(region['fields'],'区域字段')){
  if(!text(field['name']))throw Error('请选择真实字段')
  const locate=object(field['locate'],'字段定位'),box=bounds.get(region)
  if(!box)throw Error('缺少区域范围')
  let target:string
  if(region===part.form){const position=cell(locate['cell']);if(position.row<box.from.row||position.row>box.to.row||position.column<box.from.column||position.column>box.to.column)throw Error('主表单元格不在区域范围');target=`cell:${locate['cell']}`}
  else if(region===part.list){const col=column(locate['column']);if(col<box.from.column||col>box.to.column)throw Error('明细列不在区域范围');target=`list:${locate['column']}`}
  else{const col=column(locate['column']),after=integer(locate['rowOffset'],'表尾偏移');if(col<box.from.column||col>box.to.column||header+offset+after<box.from.row||listBounds.to.row+after>box.to.row)throw Error('相对表尾须覆盖明细变化后的定位范围');target=`tail:${after}:${locate['column']}`}
  if(positions.has(target))throw Error('字段位置重复');positions.add(target)
 }
 return undefined
}
