/**
 * @module app:services/smart-bid/operation/operation-route-preview
 * 职责：组合工序规范载荷、平铺树与历史类型校验，预演task的有效分类。
 * 边界：不执行when，不匹配未给定的工位合同，不发布或运行路线。
 * AI用途：编排候选先取得确定的结构问题和分类来源，再交工位及交接核验。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {canonicalOperationNode} from '../content-node-hash'
import {validateOperationTreeStructure,type OperationStructureNode} from './operation-tree-structure'

/** 工序分类按同一规范载荷归一；身份与父引用仍保留原精确字符串。 */
type PreviewNode=OperationStructureNode&Readonly<{classes:readonly string[]}>
/** task本身或最近phase的分类来源；无phase时不借root或其它容器的类。 */
export type OperationTaskClasses=Readonly<{taskId:string;sourceId:string|null;classes:readonly string[]}>
/** 结构预演；即便errors为空，仍须继续工位、条件、引用、交接和发布核验。 */
export type OperationRoutePreview=Readonly<{errors:readonly string[];taskClasses:readonly OperationTaskClasses[]}>

function nodeList(value:unknown):value is readonly unknown[]{return Array.isArray(value)}
function stringList(value:unknown):value is readonly string[]{return Array.isArray(value)&&value.every(item=>typeof item==='string')}
function readNode(raw:unknown):PreviewNode|undefined {
 try {
  const payload:unknown=JSON.parse(canonicalOperationNode(raw))
  if(!isRecord(raw)||!isRecord(payload)||!stringList(payload['class']))return undefined
  const id=raw['id'],parentId=raw['parentId'],index=raw['index'],type=raw['type']
  if(typeof id!=='string'||parentId!==null&&typeof parentId!=='string'||typeof index!=='number'||typeof type!=='string')return undefined
  return {id,parentId,index,type,classes:[...payload['class']]}
 } catch{return undefined}
}

/** 仅在完整载荷及结构成立后按前序展示分类；不改变输入，也不产生可执行/已发布状态。 */
export function previewOperationRoute(input:Readonly<{
 nodes:unknown
 previousNodes?:ReadonlyArray<Pick<OperationStructureNode,'id'|'type'>>
}>):OperationRoutePreview {
 if(!nodeList(input.nodes))return {errors:['OPERATION_NODES'],taskClasses:[]}
 const errors:string[]=[],nodes:PreviewNode[]=[]
 for(const [index,raw] of input.nodes.entries()){
  const node=readNode(raw)
  if(node)nodes.push(node)
  else errors.push(`PAYLOAD:${index}`)
 }
 if(errors.length)return {errors,taskClasses:[]}
 errors.push(...validateOperationTreeStructure({nodes,...(input.previousNodes===undefined?{}:{previousNodes:input.previousNodes})}))
 if(errors.length)return {errors,taskClasses:[]}
 const root=nodes.find(node=>node.parentId===null)
 if(!root)return {errors:['ROOT'],taskClasses:[]}
 const children=new Map<string,PreviewNode[]>()
 for(const node of nodes)if(node.parentId!==null){
  const siblings=children.get(node.parentId)??[];siblings.push(node);children.set(node.parentId,siblings)
 }
 for(const siblings of children.values())siblings.sort((a,b)=>a.index-b.index)
 const taskClasses:OperationTaskClasses[]=[],pending:Array<{node:PreviewNode;phase:PreviewNode|undefined}>=[{node:root,phase:undefined}]
 while(pending.length){
  const entry=pending.pop()
  if(!entry)continue
  const {node}=entry,phase=node.type==='phase'?node:entry.phase
  if(node.type==='task'){
   const source=node.classes.length?node:phase
   taskClasses.push({taskId:node.id,sourceId:source?.id??null,classes:[...(source?.classes??[])]})
  }
  const next=children.get(node.id)??[]
  for(let index=next.length-1;index>=0;index--){const child=next[index];if(child)pending.push({node:child,phase})}
 }
 return {errors,taskClasses}
}
