/**
 * @module app:services/smart-bid/content/revision-response-comparison
 * 职责：按三版清单的作答分工比较固定响应内容。
 * 边界：只计算差异；调用方仍须证明清单摘要、完整分工、当前依据和采用权限。
 */
import type {ContentVersionDelta} from '../content-node-comparison'
import {canonicalRevisionSnapshot} from './revision-snapshot-hash'
import {snapshotReferenceIdentity,snapshotReferenceRecord,visitSnapshotReferences} from './references/snapshot-reference-values'

type ResponseVersion=Readonly<{id:string;payload:string}>
export type RevisionResponseComparison=Readonly<{
 assignmentId:string;basisResponseId:string|null;currentResponseId:string|null;candidateResponseId:string|null
 delta:ContentVersionDelta;requiresCurrentBasisChecks:true
}>

/** 使用快照规范编码比较载荷，保留响应身份用于后续定位和重核。 */
export function compareRevisionResponses(basis:unknown,current:unknown,candidate:unknown,expectedProjectId?:string):readonly RevisionResponseComparison[]{
 const identities=new Map<string,string>()
 let projectId:unknown=expectedProjectId
 const read=(input:unknown)=>{
  const value:unknown=JSON.parse(canonicalRevisionSnapshot(input))
  const manifest=snapshotReferenceRecord(value,'RESPONSE_COMPARISON_MANIFEST')
  projectId??=manifest['projectId']
  if(projectId!==manifest['projectId'])throw Error('RESPONSE_COMPARISON_PROJECT')
  const byAssignment=new Map<string,ResponseVersion>()
  visitSnapshotReferences(manifest['responses'],item=>{
   const row=snapshotReferenceRecord(item,'RESPONSE_COMPARISON_MODEL')
   const {id,assignmentId,revisionId,...payload}=row
   if(!snapshotReferenceIdentity(id)||!snapshotReferenceIdentity(assignmentId)||!snapshotReferenceIdentity(revisionId))
    throw Error('RESPONSE_COMPARISON_MODEL')
   if(byAssignment.has(assignmentId))throw Error('RESPONSE_COMPARISON_ASSIGNMENT_DUPLICATE')
   const identity=JSON.stringify(row),previous=identities.get(id)
   if(previous!==undefined&&previous!==identity)throw Error('RESPONSE_COMPARISON_ID_REUSE')
   identities.set(id,identity)
   byAssignment.set(assignmentId,{id,payload:JSON.stringify(payload)})
  },'RESPONSE_COMPARISON_MODEL')
  return byAssignment
 }
 const b=read(basis),o=read(current),t=read(candidate)
 return [...new Set([...b.keys(),...o.keys(),...t.keys()])].sort().map(assignmentId=>{
  const base=b.get(assignmentId),head=o.get(assignmentId),proposed=t.get(assignmentId)
  const headChanged=head?.payload!==base?.payload,candidateChanged=proposed?.payload!==base?.payload
  const delta:ContentVersionDelta=!headChanged?(candidateChanged?'CANDIDATE_ONLY':'UNCHANGED'):
   !candidateChanged?'CURRENT_ONLY':head?.payload===proposed?.payload?'SAME_CHANGE':'DIVERGED'
  return {assignmentId,basisResponseId:base?.id??null,currentResponseId:head?.id??null,candidateResponseId:proposed?.id??null,
   delta,requiresCurrentBasisChecks:true}
 })
}
