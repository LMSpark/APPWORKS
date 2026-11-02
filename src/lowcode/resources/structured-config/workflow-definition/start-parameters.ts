/**
 * @module app:lowcode/resources/structured-config/workflow-definition/start-parameters
 * 职责：保留开始参数元数据，校验参数身份并派生开始输出；提交原DataSet中的两份正式记录。
 * 边界：不查询、不持有草稿、不推导权限、不重放未知提交，也不执行工作流。
 */
import type {DataSet,DataRow,DataView} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'

type ObjectRow=Record<string,unknown>
function object(value:unknown):value is ObjectRow{return value!==null&&typeof value==='object'&&!Array.isArray(value)}
function id():string{return crypto.randomUUID().replaceAll('-','').toUpperCase()}
function text(value:unknown):string{return typeof value==='string'?value:''}
function parameterId(value:unknown):string{
 if(value!==undefined&&value!==null&&typeof value!=='string')throw Error('已有输入参数身份不是字符串，不能自动替换')
 return text(value).trim()
}
function rows(value:unknown):ObjectRow[]{
 const parsed=value===null||value===undefined?[]:typeof value==='string'?(value.trim()?parseJsonDocument(value):[]):value
 if(!Array.isArray(parsed)||!parsed.every(object))throw Error('开始参数或输出必须是对象数组')
 return parsed
}
/** 标准JSON对象行适配；打开时不补默认值，确认时只修改当前行并保留未声明成员。 */
export function workflowStartParameterAdapter(nodeName:string){
 return{
  read:(original:Readonly<ObjectRow>):ObjectRow=>({...original}),
  write(value:Readonly<ObjectRow>,original:Readonly<ObjectRow>|undefined):ObjectRow{
   const result:ObjectRow=original?{...original,...value}:{Description:'',ValueFun:null,NodeName:nodeName,FieldType:'string',Value:'',...value}
   if(!text(result['Name']).trim())throw Error('输入参数名称不能为空')
   if(!original||value['Name']!==original['Name'])result['Name']=text(result['Name']).trim()
   if(!parameterId(result['rowid']))result['rowid']=id()
   return result
  },
 }
}
function readable(view:DataView,row:DataRow,fields:string[]):void{
 for(const field of fields)if(view.fieldAccess(row,field).read!=='visible')throw Error(`开始参数身份或字段不可读: ${field}`)
}
/** 保存输入定义及对应开始输出；各视图按原owner确认，不承诺跨记录事务。 */
export async function saveWorkflowStartParameters(dataSet:DataSet,workflowId:string){
 const params=dataSet.getView('Base_DataSet'),start=dataSet.getView('Base_WorkflowNodeDefinition','start')
 if(!workflowId.trim()||!params||!start)throw Error('开始参数正式视图缺失')
 if(params.queryContext['workflowId']!==workflowId||start.queryContext['workflowId']!==workflowId)throw Error('开始参数查询目标已变化，请重新读取')
 const definition=params.rows[0],node=start.rows[0]
 if(params.rows.length!==1||!definition||params.getPkKey(definition)!==workflowId||start.rows.length!==1||!node)throw Error('开始参数定义或开始节点不唯一')
 readable(params,definition,['rowid','Type','inputParams']);readable(start,node,['rowid','workflow_id','position_type','output_mapping'])
 if(definition['Type']!=='workflow'||node['workflow_id']!==workflowId||String(node['position_type'])!=='0')throw Error('开始参数归属不匹配')
 const nodeId=start.getPkKey(node);if(nodeId===undefined)throw Error('开始节点身份缺失')
 const targets={views:[{tableName:'Base_DataSet',viewId:'default',ids:[workflowId]},{tableName:'Base_WorkflowNodeDefinition',viewId:'start',ids:[nodeId]}]}
 if(params.hasUnconfirmedSave||start.hasUnconfirmedSave)return dataSet.saveChanges(targets)
 if(params.fieldAccess(definition,'inputParams').write!=='allowed'||start.fieldAccess(node,'output_mapping').write!=='allowed')throw Error('当前查询不允许保存开始参数及输出')
 const input=rows(params.getEditingRow(workflowId)?.['inputParams']),names=new Set<string>(),ids=new Set<string>()
 for(const param of input){
  const name=text(param['Name']).trim(),key=parameterId(param['rowid'])
  if(!name||names.has(name))throw Error('输入参数名称不能为空或重复')
  if(key&&ids.has(key))throw Error('输入参数身份不能重复')
  names.add(name);if(key)ids.add(key)
 }
 const normalized=input.map(param=>parameterId(param['rowid'])?param:{...param,rowid:id()})
 const previous=rows(start.getEditingRow(nodeId)?.['output_mapping']),byId=new Map(previous.map(row=>[row['rowid'],row]))
 const output=normalized.map(param=>({...byId.get(param['rowid']),rowid:param['rowid'],pid:null,Name:param['Name'],Description:param['Description']??'',FieldType:param['FieldType']??'string',isParent:false}))
 if(normalized.some((param,index)=>param!==input[index]))params.updateEditingValue(workflowId,'inputParams',JSON.stringify(normalized))
 if(JSON.stringify(output)!==JSON.stringify(previous))start.updateEditingValue(nodeId,'output_mapping',JSON.stringify(output))
 return dataSet.saveChanges(targets)
}
