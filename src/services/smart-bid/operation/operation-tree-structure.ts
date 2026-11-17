/**
 * @module app:services/smart-bid/operation/operation-tree-structure
 * 职责：按投标规格6.1校验路线的平铺工序树和稳定类型。
 * 边界：不执行条件、工位或脚本，不解析发布引用，不替代服务端路线发布校验。
 * AI用途：路线候选在进入工位、输入输出及发布核验前检查闭合结构。
 */
import {isRecord} from '@spark-appworks/spark-utils'

/** 工序节点的结构投影；根有自己的稳定id，parentId为null。 */
export type OperationStructureNode=Readonly<{id:string;parentId:string|null;index:number;type:string}>

/** 工序结构闭合词表；候选输出类型与结构校验共同消费。 */
export const OPERATION_NODE_TYPES=['route','phase','sequence','parallel','choice','call','task'] as const
/** 路线允许的结构分类；企业分类不能增加结构类型。 */
export type OperationNodeType=typeof OPERATION_NODE_TYPES[number]
const operationTypes=new Set<string>(OPERATION_NODE_TYPES.filter(type=>type!=='route'))
const containers=new Set(['route','phase','sequence','parallel','choice'])
function nodeList(value:unknown):value is readonly unknown[]{return Array.isArray(value)}

/** 工序结构检查输入；历史身份与当前候选分别提供。 */
export type OperationTreeStructureInput=Readonly<{
 nodes:readonly OperationStructureNode[]
 /** 已取得的历史身份与类型；不能用当前候选冒充历史真源。 */
 previousNodes?:ReadonlyArray<Pick<OperationStructureNode,'id'|'type'>>
}>

/** 返回结构缺项；不重排或修复输入，空结果不代表工位合同、运行或发布通过。 */
export function validateOperationTreeStructure(input:OperationTreeStructureInput):string[] {
 const errors:string[]=[],byId=new Map<string,OperationStructureNode>(),identities=new Set<string>()
 const children=new Map<string|null,OperationStructureNode[]>(),nodes:OperationStructureNode[]=[]
 const previous=new Map<string,string>()
 let history:unknown=input.previousNodes
 if(history===undefined)history=[]
 if(!nodeList(history))errors.push('HISTORY_NODES')
 else for(const [position,value] of history.entries()){
  if(!isRecord(value)||typeof value['id']!=='string'||!value['id'].trim()
   ||typeof value['type']!=='string'||value['type']!=='route'&&!operationTypes.has(value['type'])){
   errors.push(`HISTORY_NODE_SHAPE:${position}`);continue
  }
  const identity=value['id'].normalize('NFC'),old=previous.get(identity)
  if(old!==undefined&&old!==value['type'])errors.push(`TYPE_HISTORY:${value['id']}`)
  else previous.set(identity,value['type'])
 }
 const source:unknown=input.nodes
 if(!nodeList(source))return ['OPERATION_NODES']
 for(const [position,value] of source.entries()){
  if(!isRecord(value)||typeof value['id']!=='string'||typeof value['type']!=='string'
   ||value['parentId']!==null&&typeof value['parentId']!=='string'||typeof value['index']!=='number'){
   errors.push(`NODE_SHAPE:${position}`);continue
  }
  const node:OperationStructureNode={id:value['id'],parentId:value['parentId'],index:value['index'],type:value['type']}
  const identity=node.id.normalize('NFC')
  if(!node.id.trim()||identities.has(identity))errors.push(`NODE_ID:${node.id}`)
  identities.add(identity);byId.set(node.id,node);nodes.push(node)
  if(node.type!=='route'&&!operationTypes.has(node.type))errors.push(`TYPE:${node.id}`)
  const old=previous.get(identity)
  if(old!==undefined&&old!==node.type)errors.push(`TYPE_CHANGED:${node.id}`)
  const siblings=children.get(node.parentId)??[]
  siblings.push(node);children.set(node.parentId,siblings)
 }
 const roots=children.get(null)??[],root=roots[0]
 if(roots.length!==1||root?.type!=='route'||root.index!==0)errors.push('ROOT')
 for(const [parentId,siblings] of children){
  const ordered=[...siblings].sort((a,b)=>a.index-b.index)
  if(ordered.some((node,index)=>!Number.isSafeInteger(node.index)||node.index!==index))errors.push(`ORDER:${parentId??'ROOT'}`)
  if(parentId===null)continue
  const parent=byId.get(parentId)
  for(const node of siblings)if(!parent||!containers.has(parent.type)||!operationTypes.has(node.type))errors.push(`PARENT:${node.id}`)
 }
 for(const node of nodes)if(containers.has(node.type)&&!(children.get(node.id)?.length))errors.push(`EMPTY_CONTAINER:${node.id}`)
 // 迭代遍历：工艺路线没有正文的六级章节限制，也不能因深层输入耗尽调用栈。
 const checked=new Set<string>()
 for(const node of nodes){
  const path=new Set<string>();let current:OperationStructureNode|undefined=node
  while(current&&!checked.has(current.id)){
   if(path.has(current.id)){errors.push(`CYCLE:${current.id}`);break}
   path.add(current.id)
   current=current.parentId===null?undefined:byId.get(current.parentId)
  }
  for(const id of path)checked.add(id)
 }
 const reachable=new Set<string>(),pending=root?.type==='route'?[root]:[]
 while(pending.length){
  const node=pending.pop()
  if(!node||reachable.has(node.id))continue
  reachable.add(node.id)
  for(const child of children.get(node.id)??[])pending.push(child)
 }
 for(const node of nodes)if(!reachable.has(node.id))errors.push(`UNREACHABLE:${node.id}`)
 return errors
}
