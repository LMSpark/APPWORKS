/**
 * @module app:services/smart-bid/content/adoption-request
 * 职责：捕获采用准备的原请求身份和确定 JSON 内容。
 * 边界：本地准备，原请求持久记录、范围复核及正式提交仍待权威服务。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from './revision-snapshot-hash'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from './references/snapshot-reference-values'
import {contentTextRangeConflict,readContentTextSpanReference,type ContentTextOwner,type ContentTextSpan} from './content-text-span'

const fields=['projectId','candidateRevisionId','expectedHead','previewRef','requestKey','nodeIds','responseRefs','selectedParts','decisionTraceRef','reason'] as const
function identity(value:unknown):string{
 if(!snapshotReferenceIdentity(value))throw Error('ADOPTION_REQUEST_MODEL')
 return value
}
function logicalOwner(owner:ContentTextOwner):string{
 return JSON.stringify(owner.kind==='NODE'?['NODE',owner.nodeId]:['RESPONSE',owner.assignmentId])
}
function assertSelection(row:Readonly<Record<string,unknown>>,projectId:string,candidateRevisionId:string):void{
 const error='ADOPTION_SELECTION_MODEL',whole=new Set<string>(),paths=new Map<string,ContentTextSpan[]>()
 const addWhole=(key:string)=>{
  if(whole.has(key))throw Error('ADOPTION_SELECTION_DUPLICATE')
  whole.add(key)
 }
 visitSnapshotReferences(row['nodeIds'],item=>addWhole(logicalOwner({kind:'NODE',nodeId:identity(item)})),error)
 visitSnapshotReferences(row['responseRefs'],item=>{
  const ref=snapshotReferenceFields(item,['assignmentId','responseId'],error)
  addWhole(logicalOwner({kind:'RESPONSE',assignmentId:identity(ref['assignmentId']),responseId:identity(ref['responseId'])}))
 },error)
 visitSnapshotReferences(row['selectedParts'],item=>{
  const operation=snapshotReferenceFields(item,Object.hasOwn(item??{},'sourceRef')?['operation','sourceRef','targetRef']:['operation','targetRef'],error)
  const kind=operation['operation']
  if(kind!=='replace'&&kind!=='insert'&&kind!=='delete')throw Error(error)
  const target=readContentTextSpanReference(operation['targetRef']),owner=logicalOwner(target.owner)
  if(target.projectId!==projectId||target.revisionId!==row['expectedHead']||(target.start===target.end)!==(kind==='insert'))throw Error(error)
  if(kind==='delete'){
   if(Object.hasOwn(operation,'sourceRef'))throw Error(error)
  }else{
   const source=readContentTextSpanReference(operation['sourceRef'])
   if(source.projectId!==projectId||source.revisionId!==candidateRevisionId||logicalOwner(source.owner)!==owner||source.start===source.end)throw Error(error)
  }
  if(whole.has(owner))throw Error('ADOPTION_SELECTION_OVERLAP')
  const key=JSON.stringify([owner,target.path]),selections=paths.get(key)??[]
  selections.push(target);paths.set(key,selections)
 },error)
 if(!whole.size&&!paths.size)throw Error('ADOPTION_SELECTION_REQUIRED')
 for(const selections of paths.values()){
  selections.sort((a,b)=>a.start-b.start||a.end-b.end)
  for(let index=1;index<selections.length;index++){
   const prior=selections[index-1],next=selections[index]
   if(prior&&next&&contentTextRangeConflict(prior,next))throw Error('ADOPTION_SELECTION_OVERLAP')
  }
 }
}

/** 数组顺序纳入本地原请求摘要，调用方须保存同一原文供恢复核对。 */
export async function prepareAdoptionRequest(input:unknown){
 const row=snapshotReferenceFields(input,fields,'ADOPTION_REQUEST_MODEL')
 const projectId=identity(row['projectId']),candidateRevisionId=identity(row['candidateRevisionId']),
  previewRef=identity(row['previewRef']),requestKey=identity(row['requestKey'])
 if(row['expectedHead']!==null)identity(row['expectedHead'])
 identity(row['decisionTraceRef'])
 if(typeof row['reason']!=='string')throw Error('ADOPTION_REQUEST_MODEL')
 assertSelection(row,projectId,candidateRevisionId)
 const canonicalInput=canonicalSnapshotValue(row)
 const requestDigest=await hashCanonicalSnapshotText(canonicalInput)
 return Object.freeze({projectId,candidateRevisionId,previewRef,requestKey,requestDigest,canonicalInput,
  requiresScopeAndAuthorityChecks:true as const,requiresPersistentRequestRecord:true as const})
}
