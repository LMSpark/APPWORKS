/**
 * @module app:views/features/application/smart-bid/authoring/model/review/package/content-submission-package-reader
 * 职责：由 SPARK data 的原装封记录定位第50项应重开的固定原包。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {snapshotReferenceFields,snapshotReferenceIdentity as identity,visitSnapshotReferences} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'
import type {readFrozenDeliveryZipPackageMembers} from './content-package-review'

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
