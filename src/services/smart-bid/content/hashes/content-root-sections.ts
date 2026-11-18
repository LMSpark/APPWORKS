/**
 * @module app:services/smart-bid/content/hashes/content-root-sections
 * 职责：从固定快照生成要求挂接和响应集的根摘要输入。
 * 边界：核引用形状与归属；原权限、响应载荷业务条件及快照来源另核。
 */
import {canonicalRevisionSnapshot,canonicalSnapshotValue,hashCanonicalSnapshotText} from '../revision-snapshot-hash'
import {snapshotReferenceFields,snapshotReferenceIdentity,snapshotReferenceRecord,visitSnapshotReferences} from '../references/snapshot-reference-values'

/** 空答复保留原分工，只适用于尚无答复的任务。 */
export type ScopedResponseTarget=Readonly<{assignmentId:string;responseId:string|null}>

function compare(left:string,right:string):number{return left<right?-1:left>right?1:0}
function requirementPins(value:unknown){
 const error='CONTENT_ROOT_REQUIREMENT_PIN',pins:Array<Readonly<{chapterId:string;lineageId:string;version:string}>>=[],seen=new Set<string>()
 visitSnapshotReferences(value,item=>{
  const {chapterId,lineageId,version}=snapshotReferenceFields(item,['chapterId','lineageId','version'],error)
  if(!snapshotReferenceIdentity(chapterId)||!snapshotReferenceIdentity(lineageId)||!snapshotReferenceIdentity(version))throw Error(error)
  const key=JSON.stringify([chapterId,lineageId,version])
  if(seen.has(key))throw Error('CONTENT_ROOT_SECTION_DUPLICATE')
  seen.add(key);pins.push({chapterId,lineageId,version})
 },error)
 return pins.sort((left,right)=>compare(left.chapterId,right.chapterId)||compare(left.lineageId,right.lineageId)||compare(left.version,right.version))
}
function indexedRecords(value:unknown){
 const error='CONTENT_ROOT_RESPONSE_MODEL',records=new Map<string,Record<string,unknown>>()
 visitSnapshotReferences(value,item=>{
  const record=snapshotReferenceRecord(item,error),id=record['id']
  if(!snapshotReferenceIdentity(id))throw Error(error)
  if(records.has(id))throw Error('CONTENT_ROOT_SECTION_DUPLICATE')
  records.set(id,record)
 },error)
 return records
}
function ordered(records:ReadonlyMap<string,Record<string,unknown>>){
 return [...records].sort(([left],[right])=>compare(left,right)).map(([,record])=>record)
}

/** 从固定快照取范围内章或锚点的响应，以及显式选中的独立答复。 */
export async function hashScopedResponses(manifest:unknown,nodeIds:readonly string[],targets:readonly ScopedResponseTarget[]){
 const source=snapshotReferenceRecord(manifest,'CONTENT_ROOT_SNAPSHOT_MODEL')
 const assignments=indexedRecords(source['responseAssignments']),responses=indexedRecords(source['responses'])
 const selectedAssignments=new Map<string,Record<string,unknown>>(),selectedResponses=new Map<string,Record<string,unknown>>()
 const answeredAssignments=new Set([...responses.values()].map(response=>response['assignmentId']))
 for(const {assignmentId,responseId} of targets){
  const assignment=assignments.get(assignmentId)
  if(!assignment||selectedAssignments.has(assignmentId))throw Error('CONTENT_EFFECTIVE_RESPONSE_SCOPE')
  if(responseId===null){
   if(answeredAssignments.has(assignmentId))throw Error('CONTENT_EFFECTIVE_RESPONSE_SCOPE')
   selectedAssignments.set(assignmentId,assignment)
   continue
  }
  const response=responses.get(responseId)
  if(response?.['assignmentId']!==assignmentId||Object.hasOwn(response,'chapterId')||selectedResponses.has(responseId))
   throw Error('CONTENT_EFFECTIVE_RESPONSE_SCOPE')
  selectedAssignments.set(assignmentId,assignment)
  selectedResponses.set(responseId,response)
 }
 const selectedNodes=new Set(nodeIds)
 for(const [id,response] of responses){
  const {chapterId,anchorNodeId,assignmentId}=response
  if(!snapshotReferenceIdentity(chapterId)||!snapshotReferenceIdentity(anchorNodeId)||
   !selectedNodes.has(chapterId)&&!selectedNodes.has(anchorNodeId))continue
  const assignment=snapshotReferenceIdentity(assignmentId)?assignments.get(assignmentId):undefined
  if(!assignment||typeof assignmentId!=='string')throw Error('CONTENT_EFFECTIVE_RESPONSE_SCOPE')
  selectedAssignments.set(assignmentId,assignment)
  selectedResponses.set(id,response)
 }
 return hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.scoped-responses/1',
  ordered(selectedAssignments),ordered(selectedResponses)]))
}

/** 固定原响应及分工完整记录；落点、承诺和证明不会在计算前被投影丢弃。 */
export async function hashContentRootSections(value:unknown){
 const parsed:unknown=JSON.parse(canonicalRevisionSnapshot(value))
 const manifest=snapshotReferenceRecord(parsed,'CONTENT_ROOT_SNAPSHOT_MODEL')
 const pins=requirementPins(manifest['requirementPins']),assignments=indexedRecords(manifest['responseAssignments']),responses=indexedRecords(manifest['responses'])
 for(const row of responses.values()){
  const assignmentId=row['assignmentId']
  if(!snapshotReferenceIdentity(assignmentId)||!assignments.has(assignmentId))throw Error('CONTENT_ROOT_RESPONSE_ASSIGNMENT')
 }
 const [requirementPinHash,responseSetHash]=await Promise.all([
  hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.requirement-pins/1',pins])),
  hashCanonicalSnapshotText(canonicalSnapshotValue(['spark-bid.response-set/1',ordered(assignments),ordered(responses)])),
 ])
 return Object.freeze({requirementPinHash,responseSetHash})
}
