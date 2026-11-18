/**
 * @module app:services/smart-bid/operation/operation-route-recovery
 * 职责：从原冻结清单只读回查路线试次的实际输入及返回。
 * 边界：依据原调用清单和回执核对结果，正式办理记录由原服务持有。
 * AI用途：判断原试次能否沿原回执继续处理。
 */
import type {freezeOperationRouteContext} from './operation-route-context'
import {verifyOriginalOperationRouteDispatch} from './operation-route-dispatch-evidence'
import {verifyDispatchedOperationRouteReturn} from './operation-route-return'
import {isRecord} from '@spark-appworks/spark-utils'

/** 原调用固定的输入、工具版本和证据清单。 */
type Manifest=Pick<Awaited<ReturnType<typeof freezeOperationRouteContext>>,
 'scope'|'guideRef'|'guideVersionRef'|'guideDigest'|'usable'|'inputDigest'|'assertCurrent'>&
 Partial<Pick<Awaited<ReturnType<typeof freezeOperationRouteContext>>,'requirementReads'>>
/** 原办理发出的请求及其回查凭据。 */
type Dispatch=Parameters<typeof verifyOriginalOperationRouteDispatch>[1]
/** 原调用返回并用于核验的结果证据。 */
type Result=Parameters<typeof verifyDispatchedOperationRouteReturn>[1]

/** 原记录尚未取得时保留未知，回查不触发任务重发。 */
export async function recoverOperationRouteAttempt(manifest:Manifest,source:Readonly<{
 readDispatch:(input:Manifest['scope'])=>Promise<Dispatch|undefined>
 readResult:(input:Manifest['scope'])=>Promise<Result|undefined>
 guide:Parameters<typeof verifyDispatchedOperationRouteReturn>[2]&Readonly<{guideVersionRef:string;guideDigest:string}>
 assertCurrent:()=>void
}>){
 const assertCurrent=()=>{manifest.assertCurrent();source.assertCurrent()}
 assertCurrent()
 if(!manifest.usable||manifest.inputDigest===null)throw Error('OPERATION_ROUTE_RECOVERY_CONTEXT_REQUIRED')
 if(manifest.guideRef!==source.guide.guideRef||manifest.guideDigest!==source.guide.guideDigest||
  manifest.guideVersionRef!==source.guide.guideVersionRef||manifest.scope.configurationLockHash!==source.guide.configurationLockHash)
  throw Error('OPERATION_ROUTE_RETURN_GUIDE_SCOPE')
 const {scope}=manifest
 const sent=await source.readDispatch(scope)
 assertCurrent()
 if(sent===undefined)return Object.freeze({state:'DISPATCH_UNKNOWN' as const,assertCurrent})
 const dispatch=await verifyOriginalOperationRouteDispatch(scope,sent,{expectedInputDigest:manifest.inputDigest,assertCurrent})
 if(dispatch.state==='UNKNOWN')return Object.freeze({state:'DISPATCH_UNKNOWN' as const,assertCurrent:dispatch.assertCurrent})
 if(dispatch.state!=='MATCHED')return Object.freeze({state:'DISPATCH_EVIDENCE_REQUIRED' as const,dispatch,assertCurrent:dispatch.assertCurrent})
 const response=await source.readResult(scope)
 dispatch.assertCurrent()
 if(response===undefined)return Object.freeze({state:'RETURN_UNKNOWN' as const,dispatch,assertCurrent:dispatch.assertCurrent})
 const result=await verifyDispatchedOperationRouteReturn(dispatch,response,source.guide)
 const actualInput:unknown=dispatch.inputJson===null?null:JSON.parse(dispatch.inputJson)
 const requirementReads=manifest.requirementReads
 const actualRequirementReads=result.state==='VERIFIED_CANDIDATE'&&requirementReads?.length&&
  isRecord(actualInput)&&requirementReads.every(reference=>Object.hasOwn(actualInput,reference.fieldPath))?
  Object.freeze(requirementReads.map(reference=>Object.freeze({
   ...reference,callRef:dispatch.dispatchRef,resultRef:response.receiptRef,
  }))):null
 result.assertCurrent()
 return Object.freeze({state:result.state,dispatch,result,actualRequirementReads,assertCurrent:result.assertCurrent})
}
