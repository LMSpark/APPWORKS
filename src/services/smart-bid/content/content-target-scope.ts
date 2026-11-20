/**
 * @module app:services/smart-bid/content/content-target-scope
 * 职责：解析V2内容目标，在固定基准树及独立作答清单上核归属与范围不重叠。
 * 边界：不查询、不授予权限；新增/移动差异、当前头及正式采用仍另行实核。
 */
import {validateContentTreeStructure} from '../content-tree-structure'
import type {ContentStructureNode} from '../content-tree-structure'

/** 节点范围须显式选择，首个独立答复以null明确表示基准中无版。 */
export type ContentTarget=Readonly<{kind:'PROJECT'}>
 |Readonly<{kind:'NODE';nodeId:string;extent:'NODE'|'SUBTREE'}>
 |Readonly<{kind:'RESPONSE';assignmentId:string;responseId:string|null}>
/** 新业务V2正式目标；不承接旧节点专用签名或默认范围。 */
export type ContentTargetScope=Readonly<{schemaVersion:2;projectId:string;targets:readonly ContentTarget[]}>
/** 宿主从固定基准取得的分工及响应身份投影；不是可由候选提供的归属证明。 */
export type ContentScopeResponse=Readonly<{projectId:string;assignmentId:string;responseId:string|null}>
/** 基准必须完整取得；空树与未加载不同。 */
export type ContentTargetScopeInput=Readonly<{
 projectId:string;scope:unknown;basisNodes:readonly ContentStructureNode[];responses:readonly ContentScopeResponse[]
}>
/** 仅固定基准中的目标，不是变更授权，也不包含拟新增节点。 */
export type ResolvedContentTargetScope=Readonly<{
 scope:ContentTargetScope;projectWide:boolean;nodeIds:readonly string[]
 responseTargets:ReadonlyArray<Readonly<{assignmentId:string;responseId:string|null}>>
 requiresCurrentAuthorityChecks:true;requiresAdditionScopeChecks:true
}>

function object(value:unknown):Record<string,unknown> {
 if(value===null||typeof value!=='object'||Array.isArray(value)
  ||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('CONTENT_TARGET_OBJECT')
 const entries:Array<[string,unknown]>=[]
 for(const key of Reflect.ownKeys(value)){
  const descriptor=Object.getOwnPropertyDescriptor(value,key)
  if(typeof key!=='string'||descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error('CONTENT_TARGET_OBJECT')
  entries.push([key,descriptor.value])
 }
 return Object.fromEntries(entries)
}
function list(value:unknown):unknown[] {
 if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)throw Error('CONTENT_TARGET_LIST')
 const result:unknown[]=[]
 for(let index=0;index<value.length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(value,String(index))
  if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('CONTENT_TARGET_LIST')
  result.push(descriptor.value)
 }
 return result
}
function identity(value:unknown):string {
 if(typeof value!=='string'||!value.trim())throw Error('CONTENT_TARGET_IDENTITY')
 for(const character of value){const point=character.codePointAt(0)
  if(point!==undefined&&point>=0xD800&&point<=0xDFFF)throw Error('CONTENT_TARGET_IDENTITY')}
 return value
}
function keys(value:Record<string,unknown>,expected:readonly string[]):void {
 if(Object.keys(value).length!==expected.length||expected.some(key=>!Object.hasOwn(value,key)))throw Error('CONTENT_TARGET_FIELDS')
}
function target(value:unknown):ContentTarget {
 const item=object(value)
 switch(item['kind']){
  case 'PROJECT':keys(item,['kind']);return {kind:'PROJECT'}
  case 'NODE':{
   keys(item,['kind','nodeId','extent'])
   const extent=item['extent']
   if(extent!=='NODE'&&extent!=='SUBTREE')throw Error('CONTENT_TARGET_EXTENT')
   return {kind:'NODE',nodeId:identity(item['nodeId']),extent}
  }
  case 'RESPONSE':{
   keys(item,['kind','assignmentId','responseId'])
   return {kind:'RESPONSE',assignmentId:identity(item['assignmentId']),responseId:item['responseId']===null?null:identity(item['responseId'])}
  }
  default:throw Error('CONTENT_TARGET_KIND')
 }
}
function responseMap(input:ContentTargetScopeInput):Map<string,ContentScopeResponse> {
 const result=new Map<string,ContentScopeResponse>()
 for(const value of list(input.responses)){
  const row=object(value)
  keys(row,['projectId','assignmentId','responseId'])
  const projectId=identity(row['projectId']),assignmentId=identity(row['assignmentId'])
  const responseId=row['responseId']===null?null:identity(row['responseId'])
  if(projectId!==input.projectId||result.has(assignmentId))throw Error('CONTENT_TARGET_RESPONSE_BASIS')
  result.set(assignmentId,{projectId,assignmentId,responseId})
 }
 return result
}
function basisProjection(value:unknown):ContentStructureNode[] {
 return list(value).map(item=>{
  const node=object(item),index=node['index']
  if(typeof index!=='number'||!Number.isSafeInteger(index))throw Error('CONTENT_TARGET_BASIS_INDEX')
  return {nodeId:identity(node['nodeId']),parentId:identity(node['parentId']),type:identity(node['type']),index}
 })
}

/** 解析同版基准；项目根与节点不叠加，独立响应须显式列明，不由根隐式选取。 */
export function resolveContentTargetScope(input:ContentTargetScopeInput):ResolvedContentTargetScope {
 const root=object(input.scope)
 keys(root,['schemaVersion','projectId','targets'])
 if(root['schemaVersion']!==2)throw Error('CONTENT_TARGET_SCHEMA')
 const projectId=identity(root['projectId'])
 if(projectId!==identity(input.projectId))throw Error('CONTENT_TARGET_PROJECT')
 const targets=list(root['targets']).map(target)
 if(targets.length===0)throw Error('CONTENT_TARGET_EMPTY')
 const basisNodes=basisProjection(input.basisNodes)
 const errors=validateContentTreeStructure({projectId,nodes:basisNodes})
 if(errors.length)throw Error(`CONTENT_TARGET_BASIS:${errors.join(';')}`)
 const byId=new Map(basisNodes.map(node=>[node.nodeId,node])),responses=responseMap(input)
 const projectWide=targets.some(item=>item.kind==='PROJECT')
 if(projectWide&&(targets.filter(item=>item.kind==='PROJECT').length!==1||targets.some(item=>item.kind==='NODE')))throw Error('CONTENT_TARGET_OVERLAP')
 const nodeIds=new Set<string>(),responseTargets:Array<{assignmentId:string;responseId:string|null}>=[],assignments=new Set<string>()
 for(const item of targets){
  if(item.kind==='PROJECT'){
   for(const id of byId.keys())nodeIds.add(id)
  }else if(item.kind==='NODE'){
   if(!byId.has(item.nodeId))throw Error('CONTENT_TARGET_NODE_BASIS')
   const selected=new Set([item.nodeId])
   if(item.extent==='SUBTREE'){
    const queue=[item.nodeId]
    for(const parentId of queue)for(const node of byId.values()){
     if(node.parentId===parentId&&!selected.has(node.nodeId)){selected.add(node.nodeId);queue.push(node.nodeId)}
    }
   }
   for(const id of selected){if(nodeIds.has(id))throw Error('CONTENT_TARGET_OVERLAP');nodeIds.add(id)}
  }else{
   const row=responses.get(item.assignmentId)
   if(row?.responseId!==item.responseId)throw Error('CONTENT_TARGET_RESPONSE_BASIS')
   if(assignments.has(item.assignmentId))throw Error('CONTENT_TARGET_OVERLAP')
   assignments.add(item.assignmentId);responseTargets.push({assignmentId:item.assignmentId,responseId:item.responseId})
  }
 }
 return {scope:{schemaVersion:2,projectId,targets},projectWide,nodeIds:[...nodeIds].sort(),responseTargets,
  requiresCurrentAuthorityChecks:true,requiresAdditionScopeChecks:true}
}
