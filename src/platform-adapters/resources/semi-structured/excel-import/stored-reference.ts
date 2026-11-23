/**
 * @module app:lowcode/resources/semi-structured/excel-import/stored-reference
 * 职责：按已保存的物理身份精确读取引用对象和字段，恢复原命名视图的选择。
 * 边界：只读正式元数据；不猜应用关系，不复制候选或编辑行，不提交或规范化原引用。
 * AI用途：重开Excel引用选择器时复用同一DataSet的独立查询范围和服务路径校验。
 */
import {RequestState,type DataSet,type DataView,type DataRow,type DataViewFilterTree} from '@spark-appworks/spark-data'
/** 已存引用的身份及两个字段；描述不参与定位。 */
export type ExcelStoredReference=Readonly<{
 /** 正式字典标志。 */
 isDict:0|1
 /** 已保存的注册对象身份。 */
 refDataid:string
 /** 库名@物理名，字典固定为_Base_DictData。 */
 refTable:string
 /** 文本字段英文名。 */
 textField:string
 /** 值字段英文名。 */
 valueField:string
 /** 字典固定过滤字段。 */
 filterField:string
 /** 字典真实身份。 */
 filterValue:string
}>
/** 当前已存对象所在的原生来源范围，不持有业务记录。 */
export type ExcelStoredScope=Readonly<{
 /** 唯一解析出的业务资源种类。 */
 kind:'Table'|'View'|'Dict'
 /** 原宿主装配的来源空间。 */
 source:DataSet
 /** 物理库身份；字典不使用。 */
 databaseId?:string
}>
function view(source:DataSet,table:string,id:string):DataView{
 const found=source.getView(table,id)
 if(source.destroyed||!found||found.dataTable?.modelBinding?.modelName!==table)throw new Error('已存引用缺少正式来源视图')
 return found
}
function text(source:DataView,row:DataRow,field:string):string{
 if(source.fieldAccess(row,field).read!=='visible'||typeof row[field]!=='string'||!row[field])throw new Error(`已存引用字段不可读或缺失：${field}`)
 return row[field]
}
async function load(source:DataView,filter:DataViewFilterTree|undefined,check:()=>void):Promise<void>{
 check();source.filterExpression=filter;await source.refresh();check()
 if(source.loadingError)throw source.loadingError
 if(source.requestState!==RequestState.Loaded||!source.countReported||source.total!==source.rows.length||source.hasEditingChanges()||source.dirtyTracking.hasPendingChanges())throw new Error('已存引用未取得完整正式结果')
 source.readSnapshot()
}
function pick(source:DataView,row:DataRow,check:()=>void):void{check();source.setCurrentRow(row);check();source.setSelectedRows([row]);check()}
/** 按服务的表优先、名称或主键别名匹配规则核对精确物理路径。 */
export async function assertExcelReferencePath(input:Readonly<{source:DataSet;databaseId:string;name:string;id:string;kind:'Table'|'View';check():void}>):Promise<void>{
 const read=async(table:string,nameField:string)=>{
  const original=view(input.source,table,'default'),query=original.createQueryView(`excelReferenceRoute_${crypto.randomUUID()}`)
  try{
   query.treeMode='flat';query.queryConfig={fields:table==='_Base_TblList'?['rowid','tblname']:['rowid','dbid','vewname'],allPages:true}
   await load(query,{logic:'and',filters:[{field:'dbid',operator:'eq',value:input.databaseId},{logic:'or',filters:[{field:nameField,operator:'eq',value:input.name},{field:'rowid',operator:'eq',value:input.name}]}]},input.check)
   if(table==='_Base_TblList'&&input.kind==='View'){if(query.total!==0)throw new Error('同库存在优先匹配的数据表，不能保存为视图引用')}
   else{const row=query.rows[0];if(query.total!==1||!row||query.getPkKey(row)!==input.id||text(query,row,nameField)!==input.name||table==='_Base_ViewList'&&text(query,row,'dbid')!==input.databaseId)throw new Error('物理引用路径不唯一或已变化')}
  }finally{query.dataTable?.destroyView(query.viewId)}
 }
 await read('_Base_TblList','tblname');if(input.kind==='View')await read('_Base_ViewList','vewname')
}
function objectFilter(reference:ExcelStoredReference,input:Readonly<{databaseId:string|string[];name:string;field:string}>):DataViewFilterTree{
 return {logic:'and',filters:[{field:'dbid',operator:Array.isArray(input.databaseId)?'in':'eq',value:input.databaseId},{field:'rowid',operator:'eq',value:reference.refDataid},{field:input.field,operator:'eq',value:input.name}]}
}
/** 精确定位已存对象；来源应用只是浏览维度，不从同库多关系中猜一个应用。 */
export async function restoreExcelStoredObject(input:Readonly<{source:DataSet;reference:ExcelStoredReference;check():void}>):Promise<ExcelStoredScope>{
 const {source,reference,check}=input
 if(reference.isDict===1){
  if(reference.refTable!=='_Base_DictData'||reference.filterField!=='typeid'||reference.filterValue!==reference.refDataid)throw new Error('已存字典引用的身份或过滤不完整')
  const definition=view(source,'_Base_DictType','excelStoredReference');await load(definition,{field:'rowid',operator:'eq',value:reference.refDataid},check)
  const row=definition.rows[0];if(definition.rows.length!==1||!row||text(definition,row,'rowid')!==reference.refDataid)throw new Error('已存字典不存在或身份不唯一')
  pick(definition,row,check);return {kind:'Dict',source}
 }
 if(reference.filterField||reference.filterValue)throw new Error('已存物理引用仍含字典过滤，请重新选择')
 const parts=reference.refTable.split('@'),databaseName=parts[0],name=parts[1]
 if(parts.length!==2||!databaseName||!name)throw new Error('已存物理引用路径无效')
 const databases=view(source,'Base_AppAndSource_Relation','excelStoredDatabases')
 await load(databases,{field:'conName',operator:'eq',value:databaseName},check)
 const databaseIds=[...new Set(databases.rows.map(row=>{if(text(databases,row,'conName')!==databaseName)throw new Error('数据库关系范围不匹配');return text(databases,row,'conid')}))]
 if(!databaseIds.length)throw new Error('已存引用的数据库不可读或不存在')
 const tables=view(source,'_Base_TblList','storedObject'),views=view(source,'_Base_ViewList','storedObject')
 await load(tables,objectFilter(reference,{databaseId:databaseIds,name,field:'tblname'}),check)
 await load(views,objectFilter(reference,{databaseId:databaseIds,name,field:'vewname'}),check)
 if(tables.total+views.total!==1)throw new Error('已存引用对象不存在或跨表／视图身份不唯一')
 const kind=views.total===1?'View':'Table',object=kind==='View'?views:tables,row=object.rows[0]
 if(!row)throw new Error('已存引用对象不存在')
 let databaseId=kind==='View'?text(views,row,'dbid'):databaseIds.length===1?databaseIds[0]:undefined
 if(!databaseId){
  const matches:string[]=[]
  for(const candidate of databaseIds){const query=tables.createQueryView(`excelStoredDatabase_${crypto.randomUUID()}`);try{await load(query,objectFilter(reference,{databaseId:candidate,name,field:'tblname'}),check);if(query.rows.length===1)matches.push(candidate);else if(query.rows.length>1)throw new Error('已存表注册身份不唯一')}finally{query.dataTable?.destroyView(query.viewId)}}
  if(matches.length!==1)throw new Error('已存引用的物理库无法唯一确定');databaseId=matches[0]
 }
 if(!databaseId||!databaseIds.includes(databaseId))throw new Error('已存引用的物理库归属不匹配')
 await assertExcelReferencePath({source,databaseId,name,id:reference.refDataid,kind,check})
 check();pick(object,row,check)
 const columns=kind==='View'?['storedViewText','storedViewValue']:['storedTableText','storedTableValue']
 for(const [index,id] of columns.entries()){
  const fields=view(source,'Base_TblField',id);await load(fields,undefined,check)
  const names=new Set<string>();for(const field of fields.rows){const value=text(fields,field,'enname');if(text(fields,field,'tblid')!==reference.refDataid||names.has(value.toLowerCase()))throw new Error('已存引用字段归属错误或名称不唯一');names.add(value.toLowerCase())}
  const fieldName=index===0?reference.textField:reference.valueField,selected=fields.rows.filter(field=>text(fields,field,'enname')===fieldName)
  const selectedRow=selected[0]
  if(selected.length!==1||!selectedRow||fields.fieldAccess(selectedRow,'cnname').read==='masked')throw new Error('已存引用字段缺失或标题不可读')
  pick(fields,selectedRow,check)
 }
 return {kind,source,databaseId}
}
