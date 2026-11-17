/**
 * @module app:services/smart-bid/content/content-text-patch
 * 职责：组合固定候选和预演头的文字片段，检查不重叠后同时生成文字预览。
 * 边界：不改正式节点/响应或绑定；预览坐标不是已采用修订的来源坐标。
 */
import {readContentTextOwner,verifyContentTextSpan} from './content-text-span'
import type {ContentTextOwner,ContentTextSpan,VerifiedContentTextSpan} from './content-text-span'

/** 宿主从固定修订读回的对象，不能用当前屏幕文字代替。 */
export type ContentTextPatchObject=Readonly<{owner:ContentTextOwner;object:unknown}>
/** 所有目标都属于同一expectedHead；删除不能夹带sourceRef。 */
export type ContentTextPatchInput=Readonly<{
 projectId:string;candidateRevisionId:string;expectedHead:string
 sources:readonly ContentTextPatchObject[];targets:readonly ContentTextPatchObject[];changes:unknown
}>
/** 预览串中的实际位置；正式采用后仍须按新修订核定并生成来源记录。 */
export type ContentTextPatchPart=Readonly<{
 changeIndex:number;operation:'replace'|'insert'|'delete';sourceRef:ContentTextSpan|null;targetRef:ContentTextSpan
 resultStart:number;resultEnd:number
}>
/** 此处after只是待核文字，不自动写回绑定DataView。 */
export type ContentTextPatch=Readonly<{
 owner:ContentTextOwner;path:string;before:string;after:string;parts:readonly ContentTextPatchPart[]
}>
/** 独立的文字预览，语义、绑定、删除依据、范围和授权均不得据此跳过。 */
export type ContentTextPatchPreview=Readonly<{
 patches:readonly ContentTextPatch[];containsSelectedPlaceholders:boolean;requiresFieldBindingChecks:true;requiresDeletionDifferenceChecks:boolean
 requiresMeaningChecks:true;requiresTargetScopeChecks:true;requiresCurrentAuthorityChecks:true;requiresMergedSnapshotValidation:true
}>
type Pair=Readonly<{index:number;operation:'replace'|'insert'|'delete';source:VerifiedContentTextSpan|null;target:VerifiedContentTextSpan}>
type Reference=Readonly<{value:Record<string,unknown>;owner:ContentTextOwner}>
type Prepared=Readonly<{index:number;operation:Pair['operation'];target:Reference;targetObject:ContentTextPatchObject
 source:Reference|null;sourceObject:ContentTextPatchObject|undefined}>

function own(value:object,key:string):unknown {
 const descriptor=Object.getOwnPropertyDescriptor(value,key)
 if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error('CONTENT_PATCH_INPUT')
 return descriptor.value
}
function object(value:unknown):Record<string,unknown> {
 if(value===null||typeof value!=='object'||Array.isArray(value)
  ||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('CONTENT_PATCH_INPUT')
 return Object.fromEntries(Reflect.ownKeys(value).map(key=>{
  if(typeof key!=='string')throw Error('CONTENT_PATCH_INPUT')
  return [key,own(value,key)]
 }))
}
function array(value:unknown):unknown[] {
 if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)throw Error('CONTENT_PATCH_LIST')
 const result:unknown[]=[]
 for(let index=0;index<value.length;index++)result.push(own(value,String(index)))
 return result
}
function id(value:unknown):string {
 if(typeof value!=='string'||!value.trim())throw Error('CONTENT_PATCH_ID')
 return value
}
function ownerKey(value:ContentTextOwner):string {
 return JSON.stringify(value.kind==='NODE'?['NODE',value.nodeId]:['RESPONSE',value.assignmentId,value.responseId])
}
function sameLogicalOwner(source:ContentTextOwner,target:ContentTextOwner):boolean {
 return source.kind==='NODE'?target.kind==='NODE'&&source.nodeId===target.nodeId
  :target.kind==='RESPONSE'&&source.assignmentId===target.assignmentId
}
function objects(value:unknown):Map<string,ContentTextPatchObject> {
 const result=new Map<string,ContentTextPatchObject>()
 for(const entry of array(value)){
  const row=object(entry),owner=readContentTextOwner(row['owner']),key=ownerKey(owner)
  if(Object.keys(row).length!==2||!Object.hasOwn(row,'object')||result.has(key))throw Error('CONTENT_PATCH_OWNER')
  result.set(key,{owner,object:row['object']})
 }
 return result
}
function reference(value:unknown):Reference {
 const row=object(value),owner=readContentTextOwner(row['owner'])
 return {value:{...row,owner},owner}
}
function patch(pairs:readonly Pair[]):ContentTextPatch {
 const sorted=[...pairs].sort((a,b)=>a.target.reference.start-b.target.reference.start||a.target.reference.end-b.target.reference.end)
 const first=sorted[0]
 if(!first)throw Error('CONTENT_PATCH_EMPTY')
 let previous:Pair|undefined,cursor=0,after=''
 const before=first.target.containerText,parts:ContentTextPatchPart[]=[]
 for(const pair of sorted){
  const {start,end}=pair.target.reference
  if(pair.target.containerText!==before)throw Error('CONTENT_PATCH_HEAD')
  if(previous){
   const prior=previous.target.reference
   if(prior.start===prior.end&&start===end&&prior.start===start)throw Error('CONTENT_PATCH_INSERT_ORDER')
   if(start<prior.end)throw Error('CONTENT_PATCH_OVERLAP')
  }
  after+=before.slice(cursor,start)
  const resultStart=after.length
  after+=pair.source?.text??''
  parts.push({changeIndex:pair.index,operation:pair.operation,sourceRef:pair.source?.reference??null,targetRef:pair.target.reference,
   resultStart,resultEnd:after.length})
  cursor=end;previous=pair
 }
 after+=before.slice(cursor)
 return {owner:first.target.reference.owner,path:first.target.reference.path,before,after,parts}
}

/** 所有核验任务在await前捕获原串，排序后使用同一头坐标同时应用，不逐次平移输入坐标。 */
export async function previewContentTextPatch(command:ContentTextPatchInput):Promise<ContentTextPatchPreview> {
 const input=object(command),projectId=id(input['projectId']),candidateRevisionId=id(input['candidateRevisionId']),expectedHead=id(input['expectedHead'])
 const sources=objects(input['sources']),targets=objects(input['targets']),changes=array(input['changes'])
 if(changes.length===0)throw Error('CONTENT_PATCH_EMPTY')
 const prepared=changes.map((value,index):Prepared=>{
  const row=object(value),operation=row['operation']
  if(operation!=='replace'&&operation!=='insert'&&operation!=='delete')throw Error('CONTENT_PATCH_OPERATION')
  const allowed=operation==='delete'?['operation','targetRef']:['operation','sourceRef','targetRef']
  if(Object.keys(row).length!==allowed.length||allowed.some(key=>!Object.hasOwn(row,key)))throw Error('CONTENT_PATCH_FIELDS')
  const target=reference(row['targetRef']),targetObject=targets.get(ownerKey(target.owner))
  if(!targetObject)throw Error('CONTENT_PATCH_OWNER')
  const source=operation==='delete'?null:reference(row['sourceRef']),sourceObject=source?sources.get(ownerKey(source.owner)):undefined
  if(source&&(!sourceObject||!sameLogicalOwner(source.owner,target.owner)))throw Error('CONTENT_PATCH_OWNER')
  return {index,operation,target,targetObject,source,sourceObject}
 })
 const jobs=prepared.map(({index,operation,target,targetObject,source,sourceObject}):Promise<Pair>=>{
  const targetJob=verifyContentTextSpan({projectId,revisionId:expectedHead,owner:target.owner,object:targetObject.object,reference:target.value,
   mode:operation==='insert'?'INSERTION':'TEXT'})
  const sourceJob=source&&sourceObject?verifyContentTextSpan({projectId,revisionId:candidateRevisionId,owner:source.owner,
   object:sourceObject.object,reference:source.value,mode:'TEXT'}):Promise.resolve(null)
  return Promise.all([sourceJob,targetJob]).then(([verifiedSource,verifiedTarget])=>({index,operation,source:verifiedSource,target:verifiedTarget}))
 })
 const pairs=await Promise.all(jobs),groups=new Map<string,Pair[]>()
 for(const pair of pairs){
  const key=JSON.stringify([ownerKey(pair.target.reference.owner),pair.target.reference.path]),group=groups.get(key)??[]
  group.push(pair);groups.set(key,group)
 }
 return {patches:[...groups.keys()].sort().map(key=>patch(groups.get(key)??[])),
  containsSelectedPlaceholders:pairs.some(pair=>pair.source?.containsPlaceholders===true||pair.target.containsPlaceholders),
  requiresFieldBindingChecks:true,
  requiresDeletionDifferenceChecks:pairs.some(pair=>pair.operation==='delete'),requiresMeaningChecks:true,
  requiresTargetScopeChecks:true,requiresCurrentAuthorityChecks:true,requiresMergedSnapshotValidation:true}
}
