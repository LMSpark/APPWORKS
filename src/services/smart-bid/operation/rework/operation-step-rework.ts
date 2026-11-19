/**
 * @module app:services/smart-bid/operation/rework/operation-step-rework
 * 职责：第07项沿原试次定位返工与逐笔外部接手。
 * 边界：定位首个退回点并移交责任，原办理状态继续由对应责任方维护。
 * AI用途：根据原调用与检查记录找到返工责任方。
 */
import {snapshotReferenceIdentity as identity} from '../../content/references/snapshot-reference-values'

const routes={
 DIRECTORY:'01',BINDING:'02',INPUT:'03',RECOMPUTE:'04',ACTUAL_INPUT_MISSING:'05',EVIDENCE_ONLY:'06',
 MODEL_DEFECT:'MODEL_OWNER',BUSINESS_CONDITION:'BUSINESS_OWNER',UNKNOWN_IMPACT:'CALL_OWNER',
} as const
/** 返工发现所指向的责任原因。 */
type Cause=keyof typeof routes
/** 参与返工定位的原调用事实。 */
type Call=Readonly<{
 callRef:string;ownerRef:string;effect:'COMPUTE'|'SIGN'|'SUBMIT'|'WITHDRAW'|'OTHER_EXTERNAL'
 state:'NOT_STARTED'|'COMPLETE'|'PARTIAL'|'UNKNOWN';inputRef:string|null;returnRef:string|null;assertCurrent:()=>void
}>
/** 本次返工检查记录及其证据引用。 */
type Finding=Readonly<{cause:Cause;callRef:string;evidenceRef:string;affectedRefs:readonly string[];assertCurrent:()=>void}>
/** 可供本次返工核对的原结果。 */
type PriorResult=Readonly<{resultRef:string;applicabilityRef:string;assertCurrent:()=>void}>

/** 原调用按办理顺序传入，影响及可沿用依据来自原试次核验、正式变更追查或执行记录。 */
export function prepareOperationStepRework(source:Readonly<{
 projectId:string;runId:string;attemptRef:string;reason:string;inputRef:string;returnRef:string|null
 calls:readonly Call[];findings:readonly Finding[];priorResults:readonly PriorResult[];assertCurrent:()=>void
}>){
 const {projectId,runId,attemptRef,reason,inputRef,returnRef}=source
 const calls=[...source.calls],findings=[...source.findings],priorResults=[...source.priorResults]
 const proofs=[...calls,...findings,...priorResults]
 const assertCurrent=()=>{source.assertCurrent();for(const proof of proofs)proof.assertCurrent()}
 assertCurrent()
 const order=new Map(calls.map((call,index)=>[call.callRef,index]))
 if(![projectId,runId,attemptRef,inputRef].every(identity)||!reason.trim()||returnRef!==null&&!identity(returnRef)||
  !findings.length||order.size!==calls.length||calls.some(call=>![call.callRef,call.ownerRef].every(identity)||
   !['COMPUTE','SIGN','SUBMIT','WITHDRAW','OTHER_EXTERNAL'].includes(call.effect)||
   !['NOT_STARTED','COMPLETE','PARTIAL','UNKNOWN'].includes(call.state)||
   [call.inputRef,call.returnRef].some(ref=>ref!==null&&!identity(ref))))
  throw Error('OPERATION_REWORK_SCOPE')
 const affected=new Set<string>()
 const handoffs=findings.map(({cause,callRef,evidenceRef,affectedRefs})=>{
  const index=order.get(callRef),call=index===undefined?undefined:calls[index]
  if(!call||!Object.hasOwn(routes,cause)||!identity(evidenceRef)||!affectedRefs.every(identity))
   throw Error('OPERATION_REWORK_SCOPE')
  for(const ref of affectedRefs)affected.add(ref)
  let destination:typeof routes[Cause]|'ORIGINAL_CALL'=routes[cause]
  if(cause==='RECOMPUTE'&&(call.effect!=='COMPUTE'||call.state!=='COMPLETE'))destination='ORIGINAL_CALL'
  else if((cause==='RECOMPUTE'||cause==='EVIDENCE_ONLY')&&call.inputRef===null)destination='05'
  else if(cause==='EVIDENCE_ONLY'&&(call.returnRef===null||call.state!=='COMPLETE'))destination='ORIGINAL_CALL'
  return Object.freeze({cause,callRef,evidenceRef,affectedRefs:Object.freeze([...affectedRefs]),destination,
   originalOwnerRef:call.ownerRef,inputRef:call.inputRef,returnRef:call.returnRef})
 })
 handoffs.sort((left,right)=>(order.get(left.callRef)??calls.length)-(order.get(right.callRef)??calls.length))
 const originalOperations=calls.flatMap(({callRef,ownerRef,effect,state})=>
  effect!=='COMPUTE'&&state!=='NOT_STARTED'?[Object.freeze({callRef,ownerRef,state,
   destination:effect==='SIGN'?'46':effect==='SUBMIT'||effect==='WITHDRAW'?'52':'ORIGINAL_CALL'})]:[])
 const checkedPrior=new Set<string>()
 const impactUnknown=handoffs.some(item=>item.cause==='UNKNOWN_IMPACT')
 const reusable=priorResults.flatMap(({resultRef,applicabilityRef})=>{
  if(![resultRef,applicabilityRef].every(identity)||checkedPrior.has(resultRef))throw Error('OPERATION_REWORK_SCOPE')
  checkedPrior.add(resultRef)
  return impactUnknown||affected.has(resultRef)?[]:[Object.freeze({resultRef,applicabilityRef})]
 })
 assertCurrent()
 return Object.freeze({projectId,runId,attemptRef,reason,inputRef,returnRef,firstCallRef:handoffs[0]?.callRef,
  handoffs:Object.freeze(handoffs),reusable:Object.freeze(reusable),originalOperations:Object.freeze(originalOperations),assertCurrent})
}
