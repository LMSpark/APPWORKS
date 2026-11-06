/**
 * @module app:lowcode/resources/structured-config/workflow-definition/query-output
 * 职责：从当前查询模型字段派生节点输出目录，新建与编辑共用同一结构与身份规则。
 * 边界：只做领域投影，不查询、保存或推导权限；调用方先沿原DataView核对可读字段及完整范围。
 */
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'

type Row=Record<string,unknown>
/** 调用方完成正式引用检查与独立回读后提供的身份迁移；候选身份不能进入持久输出。 */
type Transition=Readonly<{fromModelId:string;fields:ReadonlyArray<Readonly<Row>>;removedIds:readonly string[];fieldIds:ReadonlyArray<Readonly<{from:string;to:string}>>}>
type Input=Readonly<{workflowId:string;modelId:string;fields:ReadonlyArray<Readonly<Row>>;original?:unknown;transition?:Transition}>
function text(value:unknown):string{return typeof value==='string'?value.trim():''}
function id():string{return crypto.randomUUID().replaceAll('-','').toUpperCase()}
function mapping(value:unknown):Row[]{
 const parsed=value===undefined||value===null||value===''?[]:typeof value==='string'?parseJsonDocument(value):value
 if(!Array.isArray(parsed)||!parsed.every(isRecord))throw Error('查询输出必须是对象数组')
 return parsed
}
function originalParts(previous:Row[],fields:ReadonlyMap<string,Readonly<Row>>){
 const ids=new Set<string>(),roots=previous.filter(row=>row['pid']===null),items=roots.find(row=>row['Name']==='items'),count=roots.find(row=>row['Name']==='Count')
 if(previous.length&&(roots.length!==2||!items||!count||items['FieldType']!=='Array'||items['isParent']!==true||count['FieldType']!=='int'||count['isParent']!==false))throw Error('原查询输出根结构无法确认，原文保留')
 for(const row of previous){const key=text(row['rowid']);if(!key||ids.has(key))throw Error('原查询输出身份缺失或重复');ids.add(key)
  if(row===items||row===count){if(fields.has(key))throw Error('查询输出根身份与字段冲突');continue}
  if(row['pid']!==items?.['rowid']||row['isParent']!==false||fields.get(key)?.['type']!=='dataModel')throw Error('原查询输出条目不能归属当前字段，不能自动丢弃')
 }
 return{items,count}
}
/** 新增候选尚无正式ID时仍须独立核旧输出；不补造候选身份或要求旧字段合同已可运行。 */
export function assertWorkflowQueryOutputIdentity(input:Readonly<{workflowId:string;modelId:string;fields:ReadonlyArray<Readonly<Row>>;original:unknown}>):void{
 const fields=new Map<string,Readonly<Row>>()
 for(const field of input.fields){const key=text(field['rowid']);if(!key||fields.has(key)||field['dataSetId']!==input.workflowId||field['dataModelId']!==input.modelId||!['dataModel','inputParams'].includes(String(field['type'])))throw Error('原查询字段身份或归属无效');fields.set(key,field)}
 originalParts(mapping(input.original),fields)
}
/** 保留既有根与字段ID及未知属性，拒绝无法归属的旧条目；只有正式dataModel输出列进入items。 */
export function buildWorkflowQueryOutput(input:Input):Row[]{
 if(!input.workflowId.trim()||!input.modelId.trim())throw Error('查询输出缺少工作流或模型身份')
 const ids=new Set<string>(),fieldNames=new Set<string>(),parameterNames=new Set<string>(),outputNames=new Set<string>()
 const output:Array<Readonly<Row>>=[]
 for(const field of input.fields){
  if(field['dataSetId']!==input.workflowId||field['dataModelId']!==input.modelId)throw Error('查询字段不属于当前模型')
  const key=text(field['rowid']),kind=field['type'],flag=field['IsOutput'],name=text(field['Name'])
  if(!key||key.startsWith('new:')||ids.has(key)||!['dataModel','inputParams'].includes(String(kind))||(flag!==0&&flag!==1&&flag!=='0'&&flag!=='1'))throw Error('查询字段身份、用途或输出标志无效')
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
 const previous=mapping(input.original)
 const oldFields=new Map<string,Readonly<Row>>(),removals=new Set<string>(),mapped=new Map<string,string>(),targets=new Set<string>()
 if(input.transition){
  const transition=input.transition
  if(!transition.fromModelId.trim())throw Error('原查询模型身份缺失')
  for(const field of transition.fields){const key=text(field['rowid']);if(!key||key.startsWith('new:')||oldFields.has(key)||field['dataSetId']!==input.workflowId||field['dataModelId']!==transition.fromModelId||!['dataModel','inputParams'].includes(String(field['type'])))throw Error('原查询字段身份或归属无效');oldFields.set(key,field)}
  for(const key of transition.removedIds){if(!oldFields.has(key)||removals.has(key)||ids.has(key))throw Error('明确移除的原字段不存在、重复或仍在正式结果中');removals.add(key)}
  for(const {from,to} of transition.fieldIds){const before=oldFields.get(from),after=input.fields.find(field=>field['rowid']===to);if(!before||!after||to.startsWith('new:')||mapped.has(from)||targets.has(to)||removals.has(from)||before['type']!==after['type'])throw Error('查询字段身份迁移不唯一或尚未取得正式身份');mapped.set(from,to);targets.add(to)}
  for(const [key,field] of oldFields)if(!removals.has(key)&&!mapped.has(key)){
   const after=input.fields.find(candidate=>candidate['rowid']===key)
   if(!after||after['type']!==field['type']||targets.has(key))throw Error('原查询字段缺少明确身份迁移或移除决定')
   targets.add(key)
  }
 }
 const {items,count}=originalParts(previous,input.transition?oldFields:new Map(input.fields.map(field=>[String(field['rowid']),field])))
 const root:Row=items?{...items}:{rowid:id(),pid:null,Name:'items',Description:'数据项',FieldType:'Array',isParent:true}
 const total:Row=count?{...count}:{rowid:id(),pid:null,Name:'Count',Description:'数据总数',FieldType:'int',isParent:false}
 const leaves=new Map<string,Row>()
 for(const row of previous){
  if(row===items||row===count)continue
  const oldId=String(row['rowid']);if(removals.has(oldId))continue
  const target=mapped.get(oldId)??oldId
  if(leaves.has(target))throw Error('原查询输出迁移目标重复')
  leaves.set(target,row)
 }
 if([root,total].some(row=>ids.has(String(row['rowid']))||oldFields.has(String(row['rowid']))))throw Error('查询输出根身份与字段冲突')
 return[root,total,...output.map(field=>({...leaves.get(String(field['rowid'])),rowid:field['rowid'],pid:root['rowid'],
  Name:text(field['AsName'])||text(field['Name']),Description:text(field['description']),FieldType:text(field['FieldType']),isParent:false}))]
}
