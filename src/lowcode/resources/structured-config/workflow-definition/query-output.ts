/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-output
 * 职责：从当前查询模型字段派生节点输出目录，新建与编辑共用同一结构与身份规则。
 * 边界：只做领域投影，不查询、保存或推导权限；调用方先沿原DataView核对可读字段及完整范围。
 */
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'

type Row=Record<string,unknown>
type Input=Readonly<{workflowId:string;modelId:string;fields:ReadonlyArray<Readonly<Row>>;original?:unknown}>
function text(value:unknown):string{return typeof value==='string'?value.trim():''}
function id():string{return crypto.randomUUID().replaceAll('-','').toUpperCase()}
function mapping(value:unknown):Row[]{
 const parsed=value===undefined||value===null||value===''?[]:typeof value==='string'?parseJsonDocument(value):value
 if(!Array.isArray(parsed)||!parsed.every(isRecord))throw Error('查询输出必须是对象数组')
 return parsed
}
/** 保留既有根与字段ID及未知属性，拒绝无法归属的旧条目；只有正式dataModel输出列进入items。 */
export function buildWorkflowQueryOutput(input:Input):Row[]{
 if(!input.workflowId.trim()||!input.modelId.trim())throw Error('查询输出缺少工作流或模型身份')
 const ids=new Set<string>(),fieldNames=new Set<string>(),parameterNames=new Set<string>(),outputNames=new Set<string>()
 const output:Array<Readonly<Row>>=[]
 for(const field of input.fields){
  if(field['dataSetId']!==input.workflowId||field['dataModelId']!==input.modelId)throw Error('查询字段不属于当前模型')
  const key=text(field['rowid']),kind=field['type'],flag=field['IsOutput'],name=text(field['Name'])
  if(!key||ids.has(key)||!['dataModel','inputParams'].includes(String(kind))||![0,1,'0','1'].includes(flag as string|number))throw Error('查询字段身份、用途或输出标志无效')
  ids.add(key)
  if((field['IsPKey']===1||field['IsPKey']==='1')&&Number(flag)!==1)throw Error('查询模型主键必须参与输出')
  const names=kind==='inputParams'?parameterNames:fieldNames
  if(!name||names.has(name))throw Error('查询字段或参数名称缺失或重复')
  names.add(name)
  if(kind!=='dataModel'||Number(flag)!==1)continue
  const outputName=text(field['AsName'])||name
  if(!text(field['FieldType'])||outputNames.has(outputName))throw Error('查询输出名称或类型缺失或重复')
  outputNames.add(outputName);output.push(field)
 }
 const previous=mapping(input.original),roots=previous.filter(row=>row['pid']===null),previousIds=new Set<string>()
 for(const row of previous){
  const key=text(row['rowid'])
  if(!key||previousIds.has(key))throw Error('原查询输出身份缺失或重复')
  previousIds.add(key)
 }
 const items=roots.find(row=>row['Name']==='items'),count=roots.find(row=>row['Name']==='Count')
 if(previous.length&&(roots.length!==2||!items||!count||items['FieldType']!=='Array'||items['isParent']!==true
  ||count['FieldType']!=='int'||count['isParent']!==false))throw Error('原查询输出根结构无法确认，原文保留')
 const root:Row=items?{...items}:{rowid:id(),pid:null,Name:'items',Description:'数据项',FieldType:'Array',isParent:true}
 const total:Row=count?{...count}:{rowid:id(),pid:null,Name:'Count',Description:'数据总数',FieldType:'int',isParent:false}
 for(const row of previous){
  if(row===items||row===count)continue
  if(row['pid']!==root['rowid']||row['isParent']!==false
   ||!input.fields.some(field=>field['type']==='dataModel'&&field['rowid']===row['rowid']))throw Error('原查询输出条目不能归属当前字段，不能自动丢弃')
 }
 if(ids.has(String(root['rowid']))||ids.has(String(total['rowid'])))throw Error('查询输出根身份与字段冲突')
 return[root,total,...output.map(field=>({...previous.find(row=>row['rowid']===field['rowid']),rowid:field['rowid'],pid:root['rowid'],
  Name:text(field['AsName'])||text(field['Name']),Description:text(field['description']),FieldType:text(field['FieldType']),isParent:false}))]
}
