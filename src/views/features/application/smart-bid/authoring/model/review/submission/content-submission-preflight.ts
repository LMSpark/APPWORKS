/**
 * @module app:views/features/application/smart-bid/authoring/model/review/submission/content-submission-preflight
 * 职责：第51项固定待发送包与平台栏，交发送前的原办理检查。
 */
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {comparePlatformFieldObservation} from '../content-platform-field-review'
import type {assessSubmissionPackageRelease} from '../content-package-release'

type ApprovedField=Parameters<typeof comparePlatformFieldObservation>[0]
type SavedObservation=Parameters<typeof comparePlatformFieldObservation>[2]
type Release=ReturnType<typeof assessSubmissionPackageRelease>
type FieldRequirement=Readonly<{assignmentId:string;fieldId:string;versionHash:string;savedReadbackRequired:boolean}>
const fieldKey=({assignmentId,fieldId}:Pick<FieldRequirement,'assignmentId'|'fieldId'>)=>JSON.stringify([assignmentId,fieldId])

/** 文件与字段均须按原要求核齐，提交后才可回读的栏保留待核。 */
export async function checkSubmissionContents(input:Readonly<{
 projectId:string;revisionId:string;attemptRef:string;assertCurrent:()=>void
 package:Readonly<Pick<Release,'packageId'|'packageHash'|'selectionHash'>>|null
 fields:readonly FieldRequirement[]
}>,sources:Readonly<{
 release:Release|null;fields:readonly ApprovedField[];observations:readonly SavedObservation[]
}>){
 const {projectId,revisionId,attemptRef}=input
 const expectedPack=input.package&&Object.freeze({...input.package})
 const fields=input.fields.map(field=>Object.freeze({...field}))
 const approved=[...sources.fields],observations=[...sources.observations],release=sources.release
 const assertCurrent=()=>{
  input.assertCurrent();release?.assertCurrent()
  for(const item of [...approved,...observations])item.assertCurrent()
 }
 assertCurrent()
 const error='SUBMISSION_PREFLIGHT_SCOPE'
 if(![projectId,revisionId,attemptRef].every(identity)||(!expectedPack&&!fields.length))throw Error(error)
 if(release&&(!expectedPack||release.projectId!==projectId||release.packageId!==expectedPack.packageId||
  release.packageHash!==expectedPack.packageHash||release.selectionHash!==expectedPack.selectionHash))throw Error(error)
 const required=new Map(fields.map(item=>[fieldKey(item),item]))
 if(required.size!==fields.length||fields.some(item=>![item.assignmentId,item.fieldId].every(identity)||
  !/^[a-f0-9]{64}$/u.test(item.versionHash)))throw Error(error)
 const versions=new Map(approved.map(item=>[fieldKey(item),item])),saved=new Map(observations.map(item=>[fieldKey(item),item]))
 if(versions.size!==approved.length||saved.size!==observations.length||
  approved.some(item=>!required.has(fieldKey(item))||item.projectId!==projectId||item.revisionId!==revisionId)||
  observations.some(item=>!required.get(fieldKey(item))?.savedReadbackRequired||
   item.projectId!==projectId||item.revisionId!==revisionId||item.attemptRef!==attemptRef))throw Error(error)
 const results=[]
 for(const requirement of fields){
  const id=fieldKey(requirement),version=versions.get(id),observation=saved.get(id)
  const state=version?.versionHash!==requirement.versionHash?'APPROVED_VERSION_REQUIRED':
   !requirement.savedReadbackRequired?'POST_SUBMISSION_REQUIRED':
    !observation?'SAVED_READBACK_REQUIRED':(await comparePlatformFieldObservation(version,{stage:'SAVED',attemptRef},observation)).state
  results.push(Object.freeze({...requirement,state}))
 }
 assertCurrent()
 const packageReady=expectedPack===null||release?.deliverable===true
 return Object.freeze({projectId,revisionId,attemptRef,package:expectedPack,packageReady,fields:Object.freeze(results),
  contentsReady:packageReady&&results.every(item=>item.state==='MATCHED'||item.state==='POST_SUBMISSION_REQUIRED'),assertCurrent})
}
