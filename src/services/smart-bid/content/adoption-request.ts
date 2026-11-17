/**
 * @module app:services/smart-bid/content/adoption-request
 * 职责：捕获采用准备的原请求身份和确定 JSON 内容。
 * 边界：本地准备，原请求持久记录、范围复核及正式提交仍待权威服务。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from './revision-snapshot-hash'
import {snapshotReferenceFields,snapshotReferenceIdentity,visitSnapshotReferences} from './references/snapshot-reference-values'

const fields=['projectId','candidateRevisionId','expectedHead','previewRef','requestKey','nodeIds','responseRefs','selectedParts','decisionTraceRef','reason'] as const
function identity(value:unknown):string{
 if(!snapshotReferenceIdentity(value))throw Error('ADOPTION_REQUEST_MODEL')
 return value
}
function selection(value:unknown,kind:'NODE'|'OBJECT'):number{
 const seen=new Set<string>()
 visitSnapshotReferences(value,item=>{
  if(kind==='OBJECT'&&(item===null||typeof item!=='object'||Array.isArray(item)))throw Error('ADOPTION_SELECTION_MODEL')
  const key=kind==='NODE'?identity(item):canonicalSnapshotValue(item)
  if(seen.has(key))throw Error('ADOPTION_SELECTION_DUPLICATE')
  seen.add(key)
 },'ADOPTION_SELECTION_MODEL')
 return seen.size
}

/** 数组顺序纳入本地原请求摘要，调用方须保存同一原文供恢复核对。 */
export async function prepareAdoptionRequest(input:unknown){
 const row=snapshotReferenceFields(input,fields,'ADOPTION_REQUEST_MODEL')
 const projectId=identity(row['projectId']),candidateRevisionId=identity(row['candidateRevisionId']),
  previewRef=identity(row['previewRef']),requestKey=identity(row['requestKey'])
 if(row['expectedHead']!==null)identity(row['expectedHead'])
 identity(row['decisionTraceRef'])
 if(typeof row['reason']!=='string')throw Error('ADOPTION_REQUEST_MODEL')
 const selected=selection(row['nodeIds'],'NODE')+selection(row['responseRefs'],'OBJECT')+selection(row['selectedParts'],'OBJECT')
 if(!selected)throw Error('ADOPTION_SELECTION_REQUIRED')
 const canonicalInput=canonicalSnapshotValue(row)
 const requestDigest=await hashCanonicalSnapshotText(canonicalInput)
 return Object.freeze({projectId,candidateRevisionId,previewRef,requestKey,requestDigest,canonicalInput,
  requiresScopeAndAuthorityChecks:true as const,requiresPersistentRequestRecord:true as const})
}
