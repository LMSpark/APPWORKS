/**
 * @module app:services/smart-bid/operation/operation-route-recovery
 * 职责：从原冻结清单只读回查路线试次的实际输入及返回。
 */
import type {freezeOperationRouteContext} from './operation-route-context'
import {verifyOriginalOperationRouteDispatch} from './operation-route-dispatch-evidence'
import {verifyDispatchedOperationRouteReturn} from './operation-route-return'

type Manifest=Awaited<ReturnType<typeof freezeOperationRouteContext>>
type Dispatch=Parameters<typeof verifyOriginalOperationRouteDispatch>[1]
type Result=Parameters<typeof verifyDispatchedOperationRouteReturn>[1]

/** 原记录尚未取得时保留未知，回查不触发任务重发。 */
export async function recoverOperationRouteAttempt(manifest:Manifest,source:Readonly<{
 readDispatch:(input:Manifest['scope'])=>Promise<Dispatch|undefined>
 readResult:(input:Manifest['scope'])=>Promise<Result|undefined>
 guide:Parameters<typeof verifyDispatchedOperationRouteReturn>[2]&Readonly<{guideDigest:string}>
 assertCurrent:()=>void
}>){
 const assertCurrent=()=>{manifest.assertCurrent();source.assertCurrent()}
 assertCurrent()
 if(!manifest.usable||manifest.inputDigest===null)throw Error('OPERATION_ROUTE_RECOVERY_CONTEXT_REQUIRED')
 if(manifest.guideRef!==source.guide.guideRef||manifest.guideDigest!==source.guide.guideDigest)
  throw Error('OPERATION_ROUTE_RETURN_GUIDE_SCOPE')
 const {scope}=manifest
 const sent=await source.readDispatch(scope)
 assertCurrent()
 if(sent===undefined)return Object.freeze({state:'DISPATCH_UNKNOWN' as const,assertCurrent})
 const dispatch=await verifyOriginalOperationRouteDispatch(scope,sent,{expectedInputDigest:manifest.inputDigest,assertCurrent})
 if(dispatch.state!=='MATCHED')return Object.freeze({state:'DISPATCH_EVIDENCE_REQUIRED' as const,dispatch,assertCurrent:dispatch.assertCurrent})
 const response=await source.readResult(scope)
 dispatch.assertCurrent()
 if(response===undefined)return Object.freeze({state:'RETURN_UNKNOWN' as const,dispatch,assertCurrent:dispatch.assertCurrent})
 const result=await verifyDispatchedOperationRouteReturn(dispatch,response,source.guide)
 return Object.freeze({state:result.state,dispatch,result,assertCurrent:result.assertCurrent})
}
