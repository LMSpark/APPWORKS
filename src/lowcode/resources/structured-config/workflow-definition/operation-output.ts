/**
 * @module app:lowcode/resources/structured-config/workflow-definition/operation-output
 * 职责：按正式SQL目标字段与物理来源核定操作节点的平面输出目录。
 * 边界：纯定义投影，不执行节点、不分配字段身份、不保存或改动输入字段用途。
 */
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'

type Row=Readonly<Record<string,unknown>>
type Operation='add'|'edit'|'delete'
type Transition=Readonly<{fromModelId:string;fields:readonly Row[];fieldIds:ReadonlyArray<Readonly<{from:string;to:string}>>;removedIds:readonly string[]}>
type Input=Readonly<{workflowId:string;modelId:string;operation:Operation;model:Row;fields:readonly Row[];physical:readonly Row[];original?:unknown;transition?:Transition}>
function text(value:unknown):string{if(typeof value!=='string'||value.length===0||value!==value.trim())throw Error('操作输出字段名称、类型或身份无效');return value}
function flag(value:unknown):number{if(value!==0&&value!==1&&value!=='0'&&value!=='1')throw Error('操作输出字段标记无效');return Number(value)}
/** 仅接受已核定平面叶；旧mapList树及模糊路径原文保留并拒绝解释。 */
export function workflowOperationOutputFields(value:unknown):Array<Record<string,unknown>>{
 const parsed=value===undefined||value===null||value===''?[]:typeof value==='string'?parseJsonDocument(value):value
 if(!Array.isArray(parsed)||!parsed.every(isRecord))throw Error('操作输出必须是平面对象数组')
 const ids=new Set<string>(),names=new Set<string>()
 for(const row of parsed){const id=text(row['rowid']),name=text(row['Name']);text(row['FieldType'])
  if(id.startsWith('new:')||ids.has(id)||names.has(name.toLowerCase())||name.includes('.')||row['pid']!==null||row['isParent']!==false)throw Error('操作输出不是唯一正式字段的平面目录')
  ids.add(id);names.add(name.toLowerCase())
 }
 return parsed
}
/** 已发布输出必须归属原正式操作模型；空目录不触发自动发布。 */
export function assertWorkflowOperationOutputIdentity(input:Readonly<{workflowId:string;modelId:string;fields:readonly Row[];original:unknown}>):void{
 const original=workflowOperationOutputFields(input.original);if(!original.length)return
 const fields=new Map<string,Row>()
 for(const row of input.fields){const id=text(row['rowid']);if(fields.has(id)||id.startsWith('new:')||row['dataSetId']!==input.workflowId||row['dataModelId']!==input.modelId||row['type']!=='inputParams')throw Error('操作输出原字段身份或归属无效');fields.set(id,row)}
 for(const row of original){const field=fields.get(String(row['rowid']));if(!field||field['Name']!==row['Name']||field['FieldType']!==row['FieldType']||String(row['Name']).startsWith('lingma_sys_'))throw Error('原操作输出无法归属正式输入字段')}
}
/** 首轮来源身份须与输出叶分别捕获；同形异表不视为同一操作目标。 */
export function workflowOperationOutputTarget(input:Pick<Input,'workflowId'|'modelId'|'operation'|'model'>){
 const {workflowId,modelId,operation,model}=input;text(workflowId);text(modelId)
 if(model['rowid']!==modelId||model['dataSetId']!==workflowId||model['Type']!=='数据库表'||model['requestType']!==operation)throw Error('操作输出目标不是已核定SQL操作模型')
 return{workflowId,modelId,operation,dbid:text(model['DbId']),databaseName:text(model['DbName']),name:text(model['MetaName'])}
}
/** 字段集合及内容未变时保留原文本和叶顺序，不为缩进或重新序列化派发节点写入。 */
export function workflowOperationOutputText(input:Readonly<{output:ReadonlyArray<Readonly<Record<string,unknown>>>;original:unknown}>):string{
 const previous=workflowOperationOutputFields(input.original)
 const signature=(rows:ReadonlyArray<Readonly<Record<string,unknown>>>)=>JSON.stringify(rows.map(row=>JSON.stringify(Object.keys(row).sort().map(key=>[key,row[key]]))).sort())
 return typeof input.original==='string'&&signature(previous)===signature(input.output)?input.original:JSON.stringify(input.output)
}
/** ADD/EDIT发布真实业务列，DELETE只发布唯一业务主键；字段ID全部来自正式模型。 */
export function buildWorkflowOperationOutput(input:Input):Array<Record<string,unknown>>{
 const {workflowId,modelId,model,fields,physical,operation}=input
 workflowOperationOutputTarget({workflowId,modelId,operation,model})
 const sources=new Map<string,Row>(),sourceNames=new Set<string>()
 for(const row of physical){const name=text(row['Name']);text(row['FieldType']);flag(row['IsPKey']);if(sources.has(name)||sourceNames.has(name.toLowerCase()))throw Error('操作输出物理列重复');sources.set(name,row);sourceNames.add(name.toLowerCase())}
 const primary=DataSpaceDesignApi.resolveSourcePrimaryKey(physical.map(row=>({name:String(row['Name']),primaryKey:flag(row['IsPKey'])===1})))
 if(primary.startsWith('lingma_sys_')||primary.toLowerCase()==='row_id')throw Error('操作输出主键存在尚未核定的服务别名或系统字段语义')
 const ids=new Set<string>(),names=new Set<string>(),output:Row[]=[]
 for(const row of fields){const id=text(row['rowid']),name=text(row['Name']),type=text(row['FieldType']),source=sources.get(name)
  if(id.startsWith('new:')||ids.has(id)||names.has(name)||row['dataSetId']!==workflowId||row['dataModelId']!==modelId||row['type']!=='inputParams'||flag(row['IsOutput'])!==0||!source||String(source['FieldType']).toLowerCase()!==type.toLowerCase()||flag(source['IsPKey'])!==flag(row['IsPKey'])||name.includes('.'))throw Error('操作输出字段与正式物理来源不符')
  ids.add(id);names.add(name)
  if(!name.startsWith('lingma_sys_')&&(operation!=='delete'||name===primary))output.push(row)
 }
 if(fields.length!==physical.length||names.size!==sources.size)throw Error('操作输出字段未完整匹配物理来源')
 const previous=workflowOperationOutputFields(input.original),transition=input.transition
 assertWorkflowOperationOutputIdentity({workflowId,modelId:transition?.fromModelId??modelId,fields:transition?.fields??fields,original:previous})
 const replacements=new Map<string,string>(),removed=new Set(transition?.removedIds??[]),oldIds=new Set((transition?.fields??fields).map(row=>String(row['rowid']))),targets=new Set<string>()
 for(const pair of transition?.fieldIds??[]){if(!oldIds.has(pair.from)||!ids.has(pair.to)||replacements.has(pair.from)||targets.has(pair.to)||removed.has(pair.from))throw Error('操作输出字段身份迁移无法确认');replacements.set(pair.from,pair.to);targets.add(pair.to)}
 if([...removed].some(id=>!oldIds.has(id)))throw Error('操作输出移除身份无法确认')
 const leaves=new Map<string,Row>()
 for(const row of previous){const old=String(row['rowid']);if(removed.has(old))continue;const next=replacements.get(old)??old;if(!ids.has(next)||leaves.has(next))throw Error('操作输出缺少明确字段身份迁移');leaves.set(next,row)}
 return output.map(field=>({...leaves.get(String(field['rowid'])),rowid:field['rowid'],pid:null,Name:field['Name'],Description:typeof field['description']==='string'?field['description']:'',FieldType:field['FieldType'],isParent:false}))
}
