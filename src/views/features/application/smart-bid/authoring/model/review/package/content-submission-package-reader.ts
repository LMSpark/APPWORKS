/**
 * @module app:views/features/application/smart-bid/authoring/model/review/package/content-submission-package-reader
 * 职责：由 SPARK data 的原装封记录定位第50项应重开的固定原包。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceFields,snapshotReferenceIdentity as identity,visitSnapshotReferences} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'
import type {readFrozenDeliveryZipPackageMembers} from './content-package-review'
import type {packFrozenDeliveryZip} from '@/services/smart-bid/content/review/delivery-zip-packing'
import {hashContentBytes} from '@/services/smart-bid/content/revision-snapshot-hash'

type Source=Parameters<typeof readFrozenDeliveryZipPackageMembers>[0]
type Selection=Readonly<{packageId:string;packingRequestRef:string}>
type ResourceScope=Selection&Readonly<{projectId:string;resourceVersionId:string}>
const scopeFields=[['id','packageId'],['projectId','projectId'],['packingRequestRef','packingRequestRef']] as const
const fields=['id','projectId','packingRequestRef','format','packageHash','resourceVersionId',
 'selectionId','selectionVersion','selectionHash','requiredPositions','packed']
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value)
const error='SUBMISSION_ORIGINAL_PACKAGE_SCOPE'
function valid(view:DataView){
 return view.dataTable?.modelBinding?.modelName==='SubmissionPackage'&&view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  scopeFields.every(([field,ParamName])=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName}))
}

/** 按原装封请求找唯一登记；空查保留未知。 */
export async function readPackingRegistrationIdentity(host:ContentRevisionReadHost,packingRequestRef:string,format:'ZIP'|'PAPER'){
 const {runtime,scenarioId,projectId}=host
 host.assertCurrent()
 if(![scenarioId,projectId,packingRequestRef].every(identity))throw Error(error)
 const key=buildDataViewKey('SubmissionPackage',format==='ZIP'?'originalPackedZipByRequest':'originalPackedPaperByRequest',scenarioId)
 const view=runtime.resolveView(key),context={projectId,packingRequestRef,format}
 const isRequestView=(target:DataView)=>target.dataTable?.modelBinding?.modelName==='SubmissionPackage'&&
  target.commitMode==='staged'&&target.queryConfig.autoQuery===false&&Object.keys(context).every(field=>
   hasContentScopeCondition(target,field,{Type:'GetInputParam',ParamName:field}))
 if(!view||!isRequestView(view)||view.hasEditingChanges())throw Error('SUBMISSION_ORIGINAL_PACKAGE_VIEW')
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!isRequestView(view)||view.loadingError||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('SUBMISSION_ORIGINAL_PACKAGE_STALE')
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
  throw Error('SUBMISSION_ORIGINAL_PACKAGE_NOT_UNIQUE')
 const assertResult=view.captureReadResult(),row=view.rows[0]
 if(!row)return Object.freeze({status:'REGISTRATION_UNKNOWN' as const,assertCurrent:()=>{assertScope();assertResult()}})
 const assertRow=view.captureReadRow(row,['id','projectId','packingRequestRef','format'])
 const packageId=row['id']
 if(!identity(packageId)||row['projectId']!==projectId||row['packingRequestRef']!==packingRequestRef||row['format']!==format)
  throw Error(error)
 return Object.freeze({status:'REGISTERED' as const,packageId,packingRequestRef,assertCurrent:()=>{
  assertScope();assertResult();assertRow()
 }})
}

/** 核原请求登记所指的电子实包。 */
export async function recoverRegisteredPackingCandidate(host:ContentRevisionReadHost,packingRequestRef:string,
 candidate:Parameters<typeof verifyRegisteredPackingCandidate>[2],openAuthorized:Parameters<typeof verifyRegisteredPackingCandidate>[3]){
 if(candidate.projectId!==host.projectId)throw Error(error)
 const registration=await readPackingRegistrationIdentity({...host,assertCurrent:()=>{
  host.assertCurrent();candidate.assertCurrent()
 }},packingRequestRef,'ZIP')
 if(registration.status!=='REGISTERED')return registration
 const verified=await verifyRegisteredPackingCandidate({...host,assertCurrent:registration.assertCurrent},registration,candidate,openAuthorized)
 return Object.freeze({status:'REGISTRATION_VERIFIED' as const,verified,assertCurrent:verified.assertCurrent})
}

/** 核本次装封回执所指原登记及实包，给下游交付同版证据。 */
export async function verifyRegisteredPackingCandidate(host:ContentRevisionReadHost,input:Selection,
 candidate:Omit<Awaited<ReturnType<typeof packFrozenDeliveryZip>>,'bytes'>,
 openAuthorized:Parameters<typeof readRegisteredSubmissionZipSource>[2]){
 const assertScope=()=>{host.assertCurrent();candidate.assertCurrent()}
 assertScope()
 if(candidate.projectId!==host.projectId)throw Error(error)
 const source=await readRegisteredSubmissionZipSource({...host,assertCurrent:assertScope},input,openAuthorized)
 const positions=new Set(source.requiredPositions)
 const packed=new Map(source.packed.map(member=>[member.position,member]))
 if(source.selectionId!==candidate.selectionId||source.selectionVersion!==candidate.selectionVersion||
  source.selectionHash!==candidate.selectionHash||source.packageHash!==candidate.packageHash||
  positions.size!==candidate.packed.length||packed.size!==candidate.packed.length||packed.size!==source.packed.length||
  candidate.packed.some(member=>{
   const original=packed.get(member.position)
   return !positions.has(member.position)||original?.fileVersionId!==member.fileVersionId||original.fileHash!==member.fileHash
  }))throw Error(error)
 const bytes=await source.reopen()
 if(await hashContentBytes(bytes)!==candidate.packageHash)throw Error('SUBMISSION_ORIGINAL_PACKAGE_HASH')
 source.assertCurrent()
 return Object.freeze({projectId:source.projectId,packageId:source.packageId,packageHash:source.packageHash,
  selectionHash:source.selectionHash,assertCurrent:source.assertCurrent})
}

/** 只重开原记录授权的资源版本，查询换代或附件授权失效时撤销原证明。 */
export async function readRegisteredSubmissionZipSource(host:ContentRevisionReadHost,input:Selection,
 openAuthorized:(scope:ResourceScope)=>Promise<Readonly<{projectId:string;resourceVersionId:string;bytes:ArrayBuffer;assertCurrent:()=>void}>>):Promise<Source>{
 const {runtime,scenarioId,projectId}=host,{packageId,packingRequestRef}=input
 host.assertCurrent()
 if(![scenarioId,projectId,packageId,packingRequestRef].every(identity))throw Error(error)
 const key=buildDataViewKey('SubmissionPackage','originalPackedZip',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('SUBMISSION_ORIGINAL_PACKAGE_VIEW')
 const context={projectId,packageId,packingRequestRef}
 view.queryContext={...view.queryContext,...context}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.hasEditingChanges()||
   Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error('SUBMISSION_ORIGINAL_PACKAGE_STALE')
 }
 await view.refresh()
 assertScope()
 if(!hasCompleteSingleContentResult(view))throw Error('SUBMISSION_ORIGINAL_PACKAGE_NOT_UNIQUE')
 const row=view.rows[0]
 if(row?.['id']!==packageId||row['projectId']!==projectId||row['packingRequestRef']!==packingRequestRef||row['format']!=='ZIP')
  throw Error(error)
 const assertRead=view.captureReadResult(),assertRow=view.captureReadRow(row,fields)
 const {packageHash,resourceVersionId,selectionId,selectionVersion,selectionHash}=row
 if(!identity(resourceVersionId)||!identity(selectionId)||!identity(selectionVersion)||!digest(selectionHash)||!digest(packageHash))
  throw Error(error)
 const requiredPositions:string[]=[],packed:Array<Source['packed'][number]>=[]
 visitSnapshotReferences(row['requiredPositions'],position=>{
  if(!identity(position)||requiredPositions.includes(position))throw Error(error)
  requiredPositions.push(position)
 },error)
 visitSnapshotReferences(row['packed'],item=>{
  const {position,fileVersionId,fileHash}=snapshotReferenceFields(item,['position','fileVersionId','fileHash'],error)
  if(!identity(position)||!identity(fileVersionId)||!digest(fileHash))throw Error(error)
  packed.push(Object.freeze({position,fileVersionId,fileHash}))
 },error)
 const assertCurrent=()=>{assertScope();assertRead();assertRow();assertResource?.()}
 let assertResource:(()=>void)|undefined
 assertCurrent()
 return Object.freeze({projectId,packageId,packageHash,selectionId,selectionVersion,selectionHash,
  requiredPositions:Object.freeze(requiredPositions),packed:Object.freeze(packed),assertCurrent,reopen:async()=>{
   assertCurrent()
   const resource=await openAuthorized(Object.freeze({...context,resourceVersionId}))
   assertCurrent()
   if(resource.projectId!==projectId||resource.resourceVersionId!==resourceVersionId)throw Error(error)
   resource.assertCurrent()
   assertResource=()=>resource.assertCurrent()
   return resource.bytes
  }})
}
