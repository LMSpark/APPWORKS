/**
 * @module app:lowcode/resources/structured-config/workflow-definition/output-fields
 * 职责：按已验证的开始平面参数及普通查询叶合同解析实际输出字段。
 * 边界：纯结构投影，不读写视图、不求值、不把合成items/Count映射为实际行字段。
 */
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import {isRecord} from '@spark-appworks/spark-utils'

/** 操作输出尚未核定时仅接受未发布的空目录；不得在换目标时静默清除既有输出。 */
export function assertUnpublishedWorkflowOperationOutput(mapping:unknown):void{
 const parsed=mapping===undefined||mapping===null||mapping===''?[]:typeof mapping==='string'?parseJsonDocument(mapping):mapping
 if(!Array.isArray(parsed)||parsed.length)throw Error('操作节点已有输出目录的运行合同尚未核定，不能自动覆盖或继续换目标')
}

/** 读取者先核对目录与节点类型权限；copy等未验证类型不能借用query规则。 */
export function workflowOutputFields(input:Readonly<{nodeId:string;position:unknown;nodeType:unknown;mapping:unknown}>):Array<Record<string,unknown>>{
 const start=String(input.position)==='0',query=String(input.position)==='1'&&input.nodeType==='query'
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
