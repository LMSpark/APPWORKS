/**
 * @module app:services/smart-bid/operation/operation-route-dispatch-evidence
 * 职责：第05项按原试次回读实际发送的工艺 JSON，核对已冻结输入。
 */
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '../content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '../content/references/snapshot-reference-values'
import type {verifyOperationRouteReturn} from './operation-route-return'

type Scope=Parameters<typeof verifyOperationRouteReturn>[0]
type Readback=Scope&Readonly<{assertCurrent:()=>void}>&(
 Readonly<{state:'DISPATCH_RECORDED';dispatchRef:string;actualInputDigest:string;input?:unknown}>|
 Readonly<{state:'UNKNOWN'}>
)

/** 空回读保留未知；仅有摘要也只证明摘要匹配，明细仍按原读权。 */
export async function verifyOriginalOperationRouteDispatch(scope:Scope,receipt:Readback,source:Readonly<{
 expectedInputDigest:string;assertCurrent:()=>void
}>){
 const assertCurrent=()=>{source.assertCurrent();receipt.assertCurrent()}
 assertCurrent()
 const fields=['runId','attemptRef','requestKey','projectId','targetDigest','configurationLockHash'] as const
 const error='OPERATION_ROUTE_DISPATCH_SCOPE'
 const digest=(value:string)=>/^[a-f0-9]{64}$/u.test(value)
 if(fields.some(key=>!identity(scope[key])||scope[key]!==receipt[key])||
  ![scope.targetDigest,scope.configurationLockHash,source.expectedInputDigest].every(digest))throw Error(error)
 if(receipt.state==='UNKNOWN')return Object.freeze({state:'UNKNOWN' as const,assertCurrent})
 const {dispatchRef,actualInputDigest}=receipt
 if(!identity(dispatchRef)||!digest(actualInputDigest))throw Error(error)
 const inputJson=receipt.input===undefined?null:canonicalSnapshotValue(receipt.input)
 if(inputJson!==null&&await hashCanonicalSnapshotText(inputJson)!==actualInputDigest)
  throw Error('OPERATION_ROUTE_DISPATCH_DIGEST')
 assertCurrent()
 return Object.freeze({state:actualInputDigest===source.expectedInputDigest?'MATCHED':'MISMATCHED',
  dispatchRef,actualInputDigest,inputJson,scope:Object.freeze({...scope}),assertCurrent})
}
