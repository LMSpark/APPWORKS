/**
 * @module app:lowcode/resources/structured-config/workflow-definition/layout/layout-document
 * 职责：投影与更新工作流布局文件的坐标，保留未修改的原生图快照成员。
 * 边界：文件中的节点属性和边端点不作为数据库业务真源；不读写视图或文件。
 * AI用途：从DataView当前content派生图坐标，移动后把新文本写回同一content字段。
 */
import {isRecord} from '@spark-appworks/spark-utils'
type Point=Readonly<{x:number;y:number}>
type Move=Readonly<{id:string|number;x:number;y:number;edges:ReadonlyArray<Readonly<{id:string|number;pointsList:readonly Point[]}>>}>
/** 工作流独立布局文本的纯投影；每次从传入文本解析，不持有第二份草稿。 */
export class WorkflowLayoutDocument{
 private static parse(text:string):{root:Record<string,unknown>;nodes:Array<Record<string,unknown>>;edges:Array<Record<string,unknown>>} {
  const root:unknown=JSON.parse(text)
  if(!isRecord(root)||!Array.isArray(root['nodes'])||!Array.isArray(root['edges']))throw new SyntaxError('工作流布局必须包含nodes和edges数组')
  const records=(input:unknown[]):Array<Record<string,unknown>>=>{
   const ids=new Set<string>()
   return input.map(item=>{
    if(!isRecord(item)||(typeof item['id']!=='string'&&typeof item['id']!=='number')||(typeof item['id']==='number'?!Number.isFinite(item['id']):!item['id'].trim())||ids.has(String(item['id'])))throw new SyntaxError('工作流布局对象身份无效或重复')
    ids.add(String(item['id']));return item
   })
  }
  return {root,nodes:records(root['nodes']),edges:records(root['edges'])}
 }
 /** 仅投影布局坐标与显式折线；历史业务属性、端点和未知成员均不用于图业务身份。 */
 static read(text:string):Readonly<{nodePositions:Readonly<Record<string,Point>>;edgePaths:Readonly<Record<string,readonly Point[]>>}>{
  const {nodes,edges}=this.parse(text)
  const point=(value:unknown):Point=>{if(!isRecord(value)||typeof value['x']!=='number'||typeof value['y']!=='number'||!Number.isFinite(value['x'])||!Number.isFinite(value['y']))throw new SyntaxError('工作流布局坐标无效');return {x:value['x'],y:value['y']}}
  const nodePositions=Object.fromEntries(nodes.filter(node=>node['x']!==undefined||node['y']!==undefined).map(node=>[String(node['id']),point(node)]))
  const edgePaths=Object.fromEntries(edges.filter(edge=>edge['pointsList']!==undefined).flatMap(edge=>{
   const points=edge['pointsList'];if(!Array.isArray(points))throw new SyntaxError('工作流布局折线无效');if(points.length===0)return [];if(points.length<2)throw new SyntaxError('工作流布局折线至少需要两个点')
   return [[String(edge['id']),points.map(point)]]
  }))
  return {nodePositions,edgePaths}
 }
 /** 只改变本次节点坐标和明确关联边折线，其他对象及未知成员原样保留；调用方核对正式视图身份。 */
 static move(text:string,event:Move):string{
  const {root,nodes,edges}=this.parse(text)
  const node=nodes.find(candidate=>candidate['id']===event.id)
  if(node){node['x']=event.x;node['y']=event.y}else nodes.push({id:event.id,x:event.x,y:event.y})
  for(const patch of event.edges){const edge=edges.find(candidate=>candidate['id']===patch.id);if(edge)edge['pointsList']=patch.pointsList;else edges.push({id:patch.id,pointsList:patch.pointsList})}
  const next=JSON.stringify({...root,nodes,edges});this.read(next);return next
 }
 /** 仅移除正式命令捕获的对象ID；历史布局端点不扩张删除集合，无变化时保留原文。 */
 static remove(text:string,ids:Readonly<{nodes:ReadonlyArray<string|number>;edges:ReadonlyArray<string|number>}>):string{
  this.read(text)
  const {root,nodes,edges}=this.parse(text),nodeIds=new Set(ids.nodes.map(String)),edgeIds=new Set(ids.edges.map(String))
  const retainedNodes=nodes.filter(node=>!nodeIds.has(String(node['id']))),retainedEdges=edges.filter(edge=>!edgeIds.has(String(edge['id'])))
  if(nodes.length===retainedNodes.length&&edges.length===retainedEdges.length)return text
  return JSON.stringify({...root,nodes:retainedNodes,edges:retainedEdges})
 }
}
