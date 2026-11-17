/**
 * @module app:services/smart-bid/content/content-scoped-preview
 * 职责：组合完整三版比较与V2目标解析，核候选相对基准的实际差异是否越界。
 * 边界：纯JSON诊断，不合并/保存；响应仅核宿主提供的身份投影，载荷和当前授权仍另核。
 */
import {canonicalContentNode} from '../content-node-hash'
import {compareContentTreeSnapshots} from '../content-tree-comparison'
import type {ContentTreeComparison} from '../content-tree-comparison'
import type {ContentStructureNode} from '../content-tree-structure'
import {resolveContentTargetScope} from './content-target-scope'
import type {ContentScopeResponse,ContentTargetScope} from './content-target-scope'
import {compareRevisionResponses} from './revision-response-comparison'

/** 由宿主从实际响应变更提取，不得由AI另交一份无关的“通过清单”。 */
export type ContentResponseChangeIdentity=Readonly<{assignmentId:string;basisResponseId:string|null;responseId:string|null}>
/** 完整树及变更清单都须显式取得，空数组与缺失不同。 */
export type ScopedContentPreviewInput=Readonly<{
 projectId:string;basis:unknown;current:unknown;candidate:unknown;targetScope:unknown
 responses:readonly ContentScopeResponse[];declaredAddedNodeIds:unknown;responseChanges:unknown
}>
/** 确定的范围错误；scopeCheckPassed只汇总这些错误，不授予采用权。 */
export type ContentScopeViolation=Readonly<{
 code:'NODE_OUTSIDE_SCOPE'|'STRUCTURE_PARENT_OUTSIDE_SCOPE'|'ADDITION_OUTSIDE_SCOPE'|'UNDECLARED_ADDITION'
  |'UNEXPECTED_ADDITION_DECLARATION'|'RESPONSE_OUTSIDE_SCOPE'|'RESPONSE_BASIS_MISMATCH'|'RESPONSE_ID_REUSE'
 ownerKind:'NODE'|'RESPONSE';ownerId:string;relatedId:string|null
}>
/** 业务范围与三方冲突分别展示；不得把本结果作为服务端采用/授权凭据。 */
export type ScopedContentPreview=Readonly<{
 targetScope:ContentTargetScope;comparison:ContentTreeComparison;scopeCheckPassed:boolean
 violations:readonly ContentScopeViolation[];changedNodeIds:readonly string[];addedNodeIds:readonly string[]
 responseChanges:readonly ContentResponseChangeIdentity[]
 requiresCurrentAuthorityChecks:true;requiresResponsePayloadChecks:true;requiresMergedSnapshotValidation:true
}>
type CapturedNode=Readonly<{payload:unknown;shape:ContentStructureNode;canonical:string}>

function own(source:object,key:string):unknown {
 const descriptor=Object.getOwnPropertyDescriptor(source,key)
 if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error('CONTENT_SCOPE_INPUT')
 return descriptor.value
}
function array(value:unknown):unknown[] {
 if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)throw Error('CONTENT_SCOPE_ARRAY')
 const values:unknown[]=[]
 for(let index=0;index<value.length;index++)values.push(own(value,String(index)))
 return values
}
function object(value:unknown):Record<string,unknown> {
 if(value===null||typeof value!=='object'||Array.isArray(value)
  ||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('CONTENT_SCOPE_INPUT')
 return Object.fromEntries(Reflect.ownKeys(value).map(key=>{
  if(typeof key!=='string')throw Error('CONTENT_SCOPE_INPUT')
  return [key,own(value,key)]
 }))
}
function id(value:unknown):string {
 if(typeof value!=='string'||!value.trim())throw Error('CONTENT_SCOPE_ID')
 for(const character of value){const point=character.codePointAt(0)
  if(point!==undefined&&point>=0xD800&&point<=0xDFFF)throw Error('CONTENT_SCOPE_ID')}
 return value
}
function captureNodes(value:unknown):Map<string,CapturedNode> {
 const result=new Map<string,CapturedNode>()
 for(const item of array(value)){
  canonicalContentNode(item)
  if(item===null||typeof item!=='object')throw Error('CONTENT_SCOPE_NODE')
  const payload=structuredClone(Object.fromEntries(['nodeId','parentId','index','type','class','value','data'].map(key=>[key,own(item,key)])))
  const nodeId=id(payload['nodeId']),parentId=id(payload['parentId']),type=id(payload['type']),index:unknown=payload['index']
  if(typeof index!=='number'||result.has(nodeId))throw Error('CONTENT_SCOPE_NODE')
  result.set(nodeId,{payload,shape:{nodeId,parentId,type,index},canonical:canonicalContentNode(payload)})
 }
 return result
}
function changes(value:unknown):ContentResponseChangeIdentity[] {
 const seen=new Set<string>()
 return array(value).map(item=>{
  const row=object(item)
  if(Object.keys(row).length!==3||!['assignmentId','basisResponseId','responseId'].every(key=>Object.hasOwn(row,key)))throw Error('CONTENT_SCOPE_RESPONSE_INPUT')
  const assignmentId=id(row['assignmentId']),basisResponseId=row['basisResponseId']===null?null:id(row['basisResponseId'])
  const responseId=row['responseId']===null?null:id(row['responseId'])
  if(responseId===null&&basisResponseId===null)throw Error('CONTENT_SCOPE_RESPONSE_INPUT')
  if(seen.has(assignmentId))throw Error('CONTENT_SCOPE_RESPONSE_DUPLICATE')
  seen.add(assignmentId);return {assignmentId,basisResponseId,responseId}
 })
}
function responseBasis(value:unknown):ContentScopeResponse[] {
 return array(value).map(item=>{
  const row=object(item)
  if(Object.keys(row).length!==3||!['projectId','assignmentId','responseId'].every(key=>Object.hasOwn(row,key)))throw Error('CONTENT_SCOPE_RESPONSE_INPUT')
  return {projectId:id(row['projectId']),assignmentId:id(row['assignmentId']),responseId:row['responseId']===null?null:id(row['responseId'])}
 })
}
function subtreeContains(input:Readonly<{nodeId:string;tree:ReadonlyMap<string,CapturedNode>;roots:ReadonlySet<string>}>):boolean {
 let nodeId=input.nodeId
 const seen=new Set<string>()
 while(!seen.has(nodeId)){
  if(input.roots.has(nodeId))return true
  seen.add(nodeId)
  const entry=input.tree.get(nodeId)
  if(!entry)return false
  nodeId=entry.shape.parentId
 }
 return false
}

/** 使用同一捕获快照核候选意图；当前头的单方修改不冒充候选越界变更。 */
export function previewScopedContentTree(command:ScopedContentPreviewInput):ScopedContentPreview {
 const fields=object(command)
 const input={projectId:id(fields['projectId']),basis:fields['basis'],current:fields['current'],candidate:fields['candidate'],
  targetScope:fields['targetScope'],responses:responseBasis(fields['responses']),
  declaredAddedNodeIds:fields['declaredAddedNodeIds'],responseChanges:fields['responseChanges']}
 const basis=captureNodes(input.basis),current=captureNodes(input.current),candidate=captureNodes(input.candidate)
 const payloads=(tree:ReadonlyMap<string,CapturedNode>)=>[...tree.values()].map(node=>node.payload)
 const comparison=compareContentTreeSnapshots({projectId:input.projectId,basis:payloads(basis),current:payloads(current),candidate:payloads(candidate)})
 const resolution=resolveContentTargetScope({projectId:input.projectId,scope:input.targetScope,
  basisNodes:[...basis.values()].map(node=>node.shape),responses:input.responses})
 const responseChanges=changes(input.responseChanges),declared=new Set<string>()
 for(const value of array(input.declaredAddedNodeIds)){const nodeId=id(value)
  if(declared.has(nodeId))throw Error('CONTENT_SCOPE_ADDITION_DUPLICATE');declared.add(nodeId)}
 const allowed=new Set(resolution.nodeIds),roots=new Set(resolution.scope.targets.flatMap(target=>target.kind==='NODE'&&target.extent==='SUBTREE'?[target.nodeId]:[]))
 const violations:ContentScopeViolation[]=[],changedNodeIds:string[]=[],addedNodeIds=[...candidate.keys()].filter(nodeId=>!basis.has(nodeId)).sort()
 const add=(code:ContentScopeViolation['code'],ownerId:string,relatedId:string|null=null)=>violations.push({code,ownerKind:'NODE',ownerId,relatedId})
 const additionInside=(nodeId:string)=>resolution.projectWide||subtreeContains({nodeId,tree:candidate,roots})
 const parentInside=(parentId:string)=>resolution.projectWide||allowed.has(parentId)||!basis.has(parentId)&&candidate.has(parentId)&&additionInside(parentId)
 for(const nodeId of [...new Set([...basis.keys(),...candidate.keys()])].sort()){
  const b=basis.get(nodeId),t=candidate.get(nodeId)
  if(b?.canonical===t?.canonical&&b?.shape.parentId===t?.shape.parentId)continue
  changedNodeIds.push(nodeId)
  if(!b&&t){
   if(!declared.has(nodeId))add('UNDECLARED_ADDITION',nodeId)
   if(!additionInside(nodeId))add('ADDITION_OUTSIDE_SCOPE',nodeId)
   if(!parentInside(t.shape.parentId))add('STRUCTURE_PARENT_OUTSIDE_SCOPE',nodeId,t.shape.parentId)
  }else{
   if(!resolution.projectWide&&!allowed.has(nodeId))add('NODE_OUTSIDE_SCOPE',nodeId)
   if(b&&(b.shape.parentId!==t?.shape.parentId||b.shape.index!==t.shape.index)){
    if(!parentInside(b.shape.parentId))add('STRUCTURE_PARENT_OUTSIDE_SCOPE',nodeId,b.shape.parentId)
    if(t&&!parentInside(t.shape.parentId))add('STRUCTURE_PARENT_OUTSIDE_SCOPE',nodeId,t.shape.parentId)
   }
  }
 }
 for(const nodeId of declared)if(!addedNodeIds.includes(nodeId))add('UNEXPECTED_ADDITION_DECLARATION',nodeId)
 const selectedResponses=new Map(resolution.responseTargets.map(row=>[row.assignmentId,row.responseId]))
 const basisResponses=new Map(input.responses.map(row=>[row.assignmentId,row.responseId])),usedResponseIds=new Set(input.responses.flatMap(row=>row.responseId===null?[]:[row.responseId]))
 for(const change of responseChanges){
  const responseViolation=(code:ContentScopeViolation['code'])=>violations.push({code,ownerKind:'RESPONSE',ownerId:change.assignmentId,relatedId:change.responseId})
  if(!selectedResponses.has(change.assignmentId))responseViolation('RESPONSE_OUTSIDE_SCOPE')
  if(!basisResponses.has(change.assignmentId)||basisResponses.get(change.assignmentId)!==change.basisResponseId
   ||selectedResponses.has(change.assignmentId)&&selectedResponses.get(change.assignmentId)!==change.basisResponseId)responseViolation('RESPONSE_BASIS_MISMATCH')
  if(change.responseId!==null){
   if(usedResponseIds.has(change.responseId))responseViolation('RESPONSE_ID_REUSE')
   usedResponseIds.add(change.responseId)
  }
 }
 return {targetScope:resolution.scope,comparison,scopeCheckPassed:violations.length===0,violations,changedNodeIds,addedNodeIds,responseChanges,
  requiresCurrentAuthorityChecks:true,requiresResponsePayloadChecks:true,requiresMergedSnapshotValidation:true}
}

/** 从三份固定清单提取响应变更，避免以调用方的空变更清单绕过范围核验。 */
export function previewScopedRevisionChanges(
 command:Omit<ScopedContentPreviewInput,'responseChanges'>,
 manifests:Readonly<{basis:unknown;current:unknown;candidate:unknown}>,
){
 const responseComparison=compareRevisionResponses(manifests.basis,manifests.current,manifests.candidate,command.projectId)
 const responses=responseBasis(command.responses),projected=new Map(responses.map(row=>[row.assignmentId,row.responseId]))
 const basisIds=new Map(responseComparison.map(row=>[row.assignmentId,row.basisResponseId]))
 if(responses.some(row=>row.responseId!==null&&basisIds.get(row.assignmentId)!==row.responseId))
  throw Error('CONTENT_SCOPE_RESPONSE_BASIS')
 for(const row of responseComparison){
  if(row.basisResponseId!==null&&projected.get(row.assignmentId)!==row.basisResponseId)
   throw Error('CONTENT_SCOPE_RESPONSE_BASIS')
 }
 const responseChanges=responseComparison.filter(row=>row.basisResponseId!==row.candidateResponseId)
  .map(row=>({assignmentId:row.assignmentId,basisResponseId:row.basisResponseId,responseId:row.candidateResponseId}))
 return {...previewScopedContentTree({...command,responses,responseChanges}),responseComparison}
}
