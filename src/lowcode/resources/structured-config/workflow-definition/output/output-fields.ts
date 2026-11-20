/**
 * @module app:lowcode/resources/structured-config/workflow-definition/output/output-fields
 * 职责：按已验证的开始参数、查询叶及SQL操作平面目录解析实际输出字段。
 * 边界：纯结构投影，不读写视图、不求值、不把合成items/Count映射为实际行字段。
 */
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'
import {workflowOperationOutputFields} from './operation-output'

/** 首次空节点绑定及尚未核定的输出类型仅接受空目录，不覆盖或转换已有定义。 */
export function assertWorkflowOutputUnpublished(mapping:unknown):void{
 const parsed=mapping===undefined||mapping===null||mapping===''?[]:typeof mapping==='string'?parseJsonDocument(mapping):mapping
 if(!Array.isArray(parsed)||parsed.length)throw Error('节点已有输出目录，不能通过未发布合同入口覆盖或转换')
}

/** 查询及已核定的数据库迁移输出均为实际平面行；迁移只发布服务返回的首批，不把全部已写入行当输出。 */
export function workflowOutputFields(input:Readonly<{nodeId:string;position:unknown;nodeType:unknown;mapping:unknown}>):Array<Record<string,unknown>>{
 if(String(input.position)==='1'&&['add','edit','delete'].includes(String(input.nodeType))){if(!input.nodeId||input.nodeId.includes('.'))throw Error('操作节点身份不能形成唯一输入路径');return workflowOperationOutputFields(input.mapping)}
 const start=String(input.position)==='0',query=String(input.position)==='1'&&['query','copy'].includes(String(input.nodeType))
 if(!start&&!query)throw Error('当前节点输出运行合同尚未核定')
 const raw=input.mapping,output=raw===undefined||raw===null||raw===''?[]:typeof raw==='string'?parseJsonDocument(raw):raw
 if(!Array.isArray(output)||!output.every(isRecord))throw Error('节点输出必须是对象数组')
 if(!output.length)return []
 const roots=query?output.filter(item=>item['pid']===null):[],items=roots.find(item=>item['Name']==='items'),count=roots.find(item=>item['Name']==='Count')
 if(query&&(roots.length!==2||!items||!count||items['FieldType']!=='Array'||items['isParent']!==true||count['FieldType']!=='int'||count['isParent']!==false))throw Error('查询输出根结构无法确认；层次原文保留')
 const ids=new Set<string>(),names=new Set<string>(),fields:Array<Record<string,unknown>>=[]
 for(const item of output){
  const name=item['Name'],id=item['rowid']
  if(typeof name!=='string'||!name.trim()||typeof id!=='string'||!id||ids.has(id))throw Error('输出字段名称或身份缺失或重复')
  ids.add(id)
  if(query&&(item===items||item===count))continue
  if(input.nodeId.includes('.')||name.includes('.'))throw Error('节点或字段名称含点，不能猜测递归路径')
  if(query?(item['pid']!==items?.['rowid']||item['isParent']!==false||typeof item['FieldType']!=='string'||!item['FieldType'].trim()):
   item['isParent']===true||item['pid']!==undefined&&item['pid']!==null&&item['pid']!=='')throw Error('层次输出不是已核定的字段结构')
  if(names.has(name))throw Error('输出字段名称重复')
  names.add(name);fields.push(item)
 }
 return fields
}
