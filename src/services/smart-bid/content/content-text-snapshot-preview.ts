/**
 * @module app:services/smart-bid/content/content-text-snapshot-preview
 * 职责：把已定位文字差异临时物化到当前快照，复核完整内容树与未改绑定。
 * 边界：仅纯预演；响应只核文字投影，不创建新响应版或写入DataView。
 */
import {canonicalContentNode} from '../content-node-hash'
import {isRecord} from '@spark-appworks/spark-utils'
import {compareContentTreeSnapshots} from '../content-tree-comparison'
import {validateContentPlaceholders} from '../content-placeholders'
import {validateContentReference} from '../content-reference'
import {previewContentTextPatch} from './content-text-patch'
import type {ContentTextPatchPreview,ContentTextPatchObject} from './content-text-patch'
import type {ContentTextOwner,ContentTextSpan} from './content-text-span'
import {previewScopedContentTree} from './content-scoped-preview'
import type {ScopedContentPreview} from './content-scoped-preview'

/** 从指定版回读的独立响应文字投影，不代替完整Response业务模型。 */
export type ContentResponseTextSnapshot=Readonly<{
 projectId:string;assignmentId:string;responseId:string;statement:string;data:Readonly<Record<string,unknown>>
}>
/** 两份完整内容树及响应文字投影来自宿主固定版，变更仍用V2 sourceRef/targetRef。 */
export type ContentTextSnapshotInput=Readonly<{
 projectId:string;candidateRevisionId:string;expectedHead:string;candidateNodes:unknown;currentNodes:unknown
 candidateResponses:readonly ContentResponseTextSnapshot[];currentResponses:readonly ContentResponseTextSnapshot[]
 targetScope:unknown;changes:unknown
}>
/** 旧响应身份只定位预演头；正式采用必须分配实际新响应版，不能原地覆盖。 */
export type CheckedResponseText=Readonly<{assignmentId:string;responseId:string;before:string;after:string}>
/** 已检查树结构/引用形状/占位一致性，不代表外部依赖、句意或正式采用通过。 */
export type ContentTextSnapshotPreview=Readonly<{
 textPreview:ContentTextPatchPreview;nodeScopePreview:ScopedContentPreview;checkedResponseTexts:readonly CheckedResponseText[]
 requiresResponsePayloadChecks:true;requiresNewResponseVersionAllocation:boolean;requiresCurrentAuthorityChecks:true
 requiresMeaningChecks:true;requiresExternalReferenceChecks:true
}>
type RecordValue=Record<string,unknown>
type Slot=Readonly<{record:RecordValue;key:'value'|'statement';data:RecordValue}>

function own(value:object,key:string):unknown {
 const descriptor=Object.getOwnPropertyDescriptor(value,key)
 if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error('CONTENT_TEXT_SNAPSHOT_INPUT')
 return descriptor.value
}
function record(value:unknown):RecordValue {
 if(value===null||typeof value!=='object'||Array.isArray(value)
  ||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('CONTENT_TEXT_SNAPSHOT_INPUT')
 return Object.fromEntries(Reflect.ownKeys(value).map(key=>{
  if(typeof key!=='string')throw Error('CONTENT_TEXT_SNAPSHOT_INPUT')
  return [key,own(value,key)]
 }))
}
function array(value:unknown):unknown[] {
 if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)throw Error('CONTENT_TEXT_SNAPSHOT_LIST')
 return Array.from({length:value.length},(_,index)=>own(value,String(index)))
}
function text(value:unknown):string {
 if(typeof value!=='string')throw Error('CONTENT_TEXT_SNAPSHOT_STRING')
 return value
}
function clone(value:unknown,ancestors=new Set<object>()):unknown {
 if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return value
 if(typeof value!=='object'||ancestors.has(value))throw Error('CONTENT_TEXT_SNAPSHOT_JSON')
 ancestors.add(value)
 try{return Array.isArray(value)?array(value).map(item=>clone(item,ancestors))
  :Object.fromEntries(Object.entries(record(value)).map(([key,item])=>[key,clone(item,ancestors)]))}
 finally{ancestors.delete(value)}
}
function nodes(value:unknown):RecordValue[] {
 return array(value).map(item=>{
  canonicalContentNode(item)
  if(item===null||typeof item!=='object')throw Error('CONTENT_TEXT_SNAPSHOT_NODE')
  return Object.fromEntries(['nodeId','parentId','index','type','class','value','data'].map(key=>[key,clone(own(item,key))]))
 })
}
function responses(value:unknown,projectId:string):RecordValue[] {
 const seen=new Set<string>()
 return array(value).map(item=>{
  const row=record(item),assignmentId=text(row['assignmentId'])
  if(row['projectId']!==projectId||!assignmentId.trim()||seen.has(assignmentId))throw Error('CONTENT_TEXT_RESPONSE_BASIS')
  seen.add(assignmentId)
  return {projectId,assignmentId,responseId:text(row['responseId']),statement:text(row['statement']),data:clone(row['data'])}
 })
}
function ownerKey(owner:ContentTextOwner):string {
 return JSON.stringify(owner.kind==='NODE'?['NODE',owner.nodeId]:['RESPONSE',owner.assignmentId,owner.responseId])
}
function entries(input:Readonly<{nodes:readonly RecordValue[];responses:readonly RecordValue[]}>):Map<string,ContentTextPatchObject> {
 const result=new Map<string,ContentTextPatchObject>()
 for(const row of input.nodes){const owner:ContentTextOwner={kind:'NODE',nodeId:text(row['nodeId'])};result.set(ownerKey(owner),{owner,object:row})}
 for(const row of input.responses){const owner:ContentTextOwner={kind:'RESPONSE',assignmentId:text(row['assignmentId']),responseId:text(row['responseId'])};result.set(ownerKey(owner),{owner,object:row})}
 return result
}
function slot(value:unknown,ref:Readonly<{owner:ContentTextOwner;path:string}>):Slot {
 if(!isRecord(value))throw Error('CONTENT_TEXT_SNAPSHOT_PATH')
 if(ref.owner.kind==='RESPONSE')return {record:value,key:'statement',data:record(own(value,'data'))}
 if(ref.path==='/value')return {record:value,key:'value',data:record(own(value,'data'))}
 const match=/^\/data\/rows\/(0|[1-9]\d*)\/(0|[1-9]\d*)\/value$/u.exec(ref.path),data=record(own(value,'data'))
 if(!match)throw Error('CONTENT_TEXT_SNAPSHOT_PATH')
 const rows=data['rows']
 if(!Array.isArray(rows))throw Error('CONTENT_TEXT_SNAPSHOT_PATH')
 const row=own(rows,String(Number(match[1])))
 if(!Array.isArray(row))throw Error('CONTENT_TEXT_SNAPSHOT_PATH')
 const cell=own(row,String(Number(match[2])))
 if(!isRecord(cell))throw Error('CONTENT_TEXT_SNAPSHOT_PATH')
 return {record:cell,key:'value',data:record(own(cell,'data'))}
}
function equal(left:unknown,right:unknown):boolean {
 if(left===right)return true
 if(left===null||right===null||typeof left!=='object'||typeof right!=='object')return false
 if(Array.isArray(left))return Array.isArray(right)&&left.length===right.length&&left.every((value,index)=>equal(value,right[index]))
 if(Array.isArray(right))return false
 const a=Object.keys(left).sort(),b=Object.keys(right).sort()
 return a.length===b.length&&a.every((key,index)=>key===b[index]&&equal(own(left,key),own(right,key)))
}
function checkBindings(input:Readonly<{source:ContentTextSpan;sourceObjects:ReadonlyMap<string,ContentTextPatchObject>;targetData:RecordValue}>):void {
 const sourceObject=input.sourceObjects.get(ownerKey(input.source.owner))
 if(!sourceObject)throw Error('CONTENT_TEXT_BINDING_OWNER')
 const sourceSlot=slot(sourceObject.object,input.source),selected=text(own(sourceSlot.record,sourceSlot.key)).slice(input.source.start,input.source.end)
 for(const match of selected.matchAll(/\{\{([^{}]+)\}\}/gu)){
  const key=match[1]
  if(key===undefined||!Object.hasOwn(input.targetData,key)||!equal(sourceSlot.data[key],input.targetData[key]))throw Error('CONTENT_TEXT_BINDING_CHANGE')
 }
}
function checkResponse(row:RecordValue):void {
 const data=record(row['data']),errors=validateContentPlaceholders({value:text(row['statement']),data})
 if(errors.length)throw Error(`CONTENT_TEXT_RESPONSE_FIELDS:${errors.join(';')}`)
 for(const value of Object.values(data))if(validateContentReference(value).length)throw Error('CONTENT_TEXT_RESPONSE_REFERENCE')
}

/** 临时物化只改声明的文字路径，data保持当前值；最终整串与整树重新核验。 */
export async function previewContentTextSnapshot(command:ContentTextSnapshotInput):Promise<ContentTextSnapshotPreview> {
 const input=record(command),projectId=text(input['projectId']),candidateNodes=nodes(input['candidateNodes']),currentNodes=nodes(input['currentNodes'])
 const candidateResponses=responses(input['candidateResponses'],projectId),currentResponses=responses(input['currentResponses'],projectId)
 const initial=compareContentTreeSnapshots({projectId,basis:currentNodes,current:currentNodes,candidate:candidateNodes})
 if(initial.nodes.some(node=>node.conflicts.includes('TYPE_CHANGED')))throw Error('CONTENT_TEXT_CANDIDATE_TYPE')
 const sourceObjects=entries({nodes:candidateNodes,responses:candidateResponses}),targetObjects=entries({nodes:currentNodes,responses:currentResponses})
 const workingNodes=nodes(currentNodes),workingResponses=currentResponses.map(row=>record(clone(row))),workingObjects=entries({nodes:workingNodes,responses:workingResponses})
 const targetScope=clone(input['targetScope'])
 const textPreview=await previewContentTextPatch({projectId,candidateRevisionId:text(input['candidateRevisionId']),expectedHead:text(input['expectedHead']),
  sources:[...sourceObjects.values()],targets:[...targetObjects.values()],changes:input['changes']})
 const checkedResponseTexts:CheckedResponseText[]=[]
 for(const patch of textPreview.patches){
  const target=workingObjects.get(ownerKey(patch.owner))
  if(!target)throw Error('CONTENT_TEXT_SNAPSHOT_OWNER')
  const targetSlot=slot(target.object,patch)
  for(const part of patch.parts)if(part.sourceRef)checkBindings({source:part.sourceRef,sourceObjects,targetData:targetSlot.data})
  targetSlot.record[targetSlot.key]=patch.after
  if(patch.owner.kind==='RESPONSE')checkedResponseTexts.push({assignmentId:patch.owner.assignmentId,responseId:patch.owner.responseId,before:patch.before,after:patch.after})
 }
 for(const row of workingResponses)checkResponse(row)
 const nodeScopePreview=previewScopedContentTree({projectId,basis:currentNodes,current:currentNodes,candidate:workingNodes,targetScope,
  responses:currentResponses.map(row=>({projectId,assignmentId:text(row['assignmentId']),responseId:text(row['responseId'])})),declaredAddedNodeIds:[],responseChanges:[]})
 for(const response of checkedResponseTexts){
  if(!nodeScopePreview.targetScope.targets.some(target=>target.kind==='RESPONSE'&&target.assignmentId===response.assignmentId&&target.responseId===response.responseId))throw Error('CONTENT_TEXT_RESPONSE_SCOPE')
 }
 return {textPreview,nodeScopePreview,checkedResponseTexts,requiresResponsePayloadChecks:true,requiresNewResponseVersionAllocation:checkedResponseTexts.length>0,
  requiresCurrentAuthorityChecks:true,requiresMeaningChecks:true,requiresExternalReferenceChecks:true}
}
