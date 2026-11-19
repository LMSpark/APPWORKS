/**
 * @module app:services/smart-bid/operation/operation-route-return
 * 职责：核同一已派发路线工艺的原返回身份与原生 JSON。
 */
import {readComposedOperationRouteCandidate} from './operation-station-fit'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '../content/references/snapshot-reference-values'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../content/revision-snapshot-hash'
import type {verifyOriginalOperationRouteDispatch} from './operation-route-dispatch-evidence'

type Scope=Readonly<{
 runId:string;attemptRef:string;requestKey:string;projectId:string;targetDigest:string;configurationLockHash:string
}>
type Receipt=Scope&Readonly<{receiptRef:string;assertCurrent:()=>void}>&(
 Readonly<{state:'COMPLETE';output:unknown}>|Readonly<{state:'PARTIAL'|'FAILED'|'UNKNOWN'}>
)
const fields=['runId','attemptRef','requestKey','projectId','targetDigest','configurationLockHash'] as const
type CandidateIssue='DISPATCH_CATALOG_REQUIRED'|'OUTSIDE_DISPATCH_CATALOG'

/** 用第05项实发证明和原指南核第06项，发送内容不合时暂不交候选。 */
export async function verifyDispatchedOperationRouteReturn(
 dispatch:Awaited<ReturnType<typeof verifyOriginalOperationRouteDispatch>>,receipt:Receipt,
 source:Parameters<typeof verifyOperationRouteReturn>[2]&Readonly<{
  guideRef:string;configurationLockHash:string;assertGuideCurrent:()=>void
 }>){
 const assertCurrent=()=>{dispatch.assertCurrent();source.assertCurrent();source.assertGuideCurrent()}
 assertCurrent()
 if(dispatch.state!=='MATCHED'||dispatch.inputJson===null)return Object.freeze({state:'DISPATCH_EVIDENCE_REQUIRED' as const,assertCurrent})
 if(!identity(source.guideRef)||source.configurationLockHash!==dispatch.scope.configurationLockHash)
  throw Error('OPERATION_ROUTE_RETURN_GUIDE_SCOPE')
 const actualInputJson=dispatch.inputJson
 const verified=await verifyOperationRouteReturn(dispatch.scope,receipt,{catalog:source.catalog,match:source.match,assertCurrent,
  checkCandidateScope(candidate){
   const input:unknown=JSON.parse(actualInputJson)
   if(!isRecord(input)||!Array.isArray(input['stationCatalog'])||!Array.isArray(input['routeCatalog']))
    return 'DISPATCH_CATALOG_REQUIRED'
   const stations=new Set(input['stationCatalog'].filter(isRecord).map(item=>item['ref']).filter(identity))
   const routes=new Set(input['routeCatalog'].map(canonicalSnapshotValue))
   if(candidate.nodes.some(node=>node.type==='task'&&!stations.has(node.data.stationRef)||
    node.type==='call'&&!routes.has(canonicalSnapshotValue(node.data.routeRef))))return 'OUTSIDE_DISPATCH_CATALOG'
   return undefined
  }})
 return Object.freeze({...verified,dispatchRef:dispatch.dispatchRef,actualInputDigest:dispatch.actualInputDigest,guideRef:source.guideRef})
}

/** 只校验原返回，不将工艺完成或候选通过视为发布。 */
export async function verifyOperationRouteReturn(scope:Scope,receipt:Receipt,source:Readonly<{
 catalog:NonNullable<Parameters<typeof readComposedOperationRouteCandidate>[1]>
 match:Parameters<typeof readComposedOperationRouteCandidate>[2]
 assertCurrent:()=>void
 checkCandidateScope?:(candidate:ReturnType<typeof readComposedOperationRouteCandidate>)=>CandidateIssue|undefined
}>){
 const assertCurrent=()=>{source.assertCurrent();receipt.assertCurrent()}
 assertCurrent()
 if(fields.some(key=>!identity(scope[key])||scope[key]!==receipt[key])||!identity(receipt.receiptRef)||
  !['COMPLETE','PARTIAL','FAILED','UNKNOWN'].includes(receipt.state)||
  ![scope.targetDigest,scope.configurationLockHash].every(value=>/^[a-f0-9]{64}$/u.test(value)))
  throw Error('OPERATION_ROUTE_RETURN_SCOPE')
 const {receiptRef}=receipt
 if(receipt.state!=='COMPLETE')return Object.freeze({state:receipt.state,receiptRef,assertCurrent})
 const candidate=readComposedOperationRouteCandidate(receipt.output,source.catalog,source.match)
 const issue=source.checkCandidateScope?.(candidate)
 if(issue){
  assertCurrent()
  return Object.freeze({state:issue,receiptRef,assertCurrent})
 }
 const candidateJson=canonicalSnapshotValue(candidate)
 const candidateDigest=await hashCanonicalSnapshotText(candidateJson)
 assertCurrent()
 return Object.freeze({state:'VERIFIED_CANDIDATE' as const,receiptRef,candidateJson,candidateDigest,assertCurrent})
}
