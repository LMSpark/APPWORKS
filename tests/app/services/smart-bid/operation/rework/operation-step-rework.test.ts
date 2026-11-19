import {expect,it} from 'vitest'
import {prepareOperationStepRework} from '@/services/smart-bid/operation/rework/operation-step-rework'

it('returns to the earliest affected call and hands external operations back to their owners',()=>{
 let stale=false
 const current=()=>{if(stale)throw Error('STALE_PROOF')}
 const makeFinding=(cause:'INPUT'|'RECOMPUTE'|'EVIDENCE_ONLY'|'UNKNOWN_IMPACT',callRef:string,affectedRefs:string[]=[])=>({
  cause,callRef,affectedRefs,evidenceRef:'FINDING',assertCurrent:current,
 })
 const request={
  projectId:'P',runId:'RUN',attemptRef:'ATTEMPT',inputRef:'INPUT',returnRef:'RECEIPT',reason:'原值已被招标变更替代',
  calls:[
   {callRef:'CALC',ownerRef:'OPERATOR',effect:'COMPUTE',state:'COMPLETE',inputRef:'CALC-IN',returnRef:'CALC-OUT',assertCurrent:current},
   {callRef:'SIGN',ownerRef:'SIGNER',effect:'SIGN',state:'COMPLETE',inputRef:'SIGN-IN',returnRef:'SIGN-OUT',assertCurrent:current},
   {callRef:'SUBMIT',ownerRef:'REP',effect:'SUBMIT',state:'UNKNOWN',inputRef:'SUBMIT-IN',returnRef:null,assertCurrent:current},
  ] as const,
  priorResults:[{resultRef:'USED',applicabilityRef:'PROOF',assertCurrent:current},
   {resultRef:'INDEPENDENT',applicabilityRef:'PROOF-2',assertCurrent:current}],
  findings:[makeFinding('RECOMPUTE','SUBMIT'),makeFinding('INPUT','CALC',['USED']),makeFinding('EVIDENCE_ONLY','SIGN')],
  assertCurrent:()=>{},
 }
 const rework=prepareOperationStepRework(request)
 expect(rework).toMatchObject({firstCallRef:'CALC',inputRef:'INPUT',returnRef:'RECEIPT',
  handoffs:[{destination:'03'},{destination:'06',inputRef:'SIGN-IN',returnRef:'SIGN-OUT'},{destination:'ORIGINAL_CALL'}],
  reusable:[{resultRef:'INDEPENDENT'}],originalOperations:[{destination:'46',ownerRef:'SIGNER'},
   {destination:'52',state:'UNKNOWN',ownerRef:'REP'}]})
 expect(prepareOperationStepRework({...request,findings:[makeFinding('UNKNOWN_IMPACT','CALC')]}))
  .toMatchObject({reusable:[],handoffs:[{destination:'CALL_OWNER',originalOwnerRef:'OPERATOR'}]})
 expect(prepareOperationStepRework({...request,findings:[makeFinding('EVIDENCE_ONLY','SUBMIT')]}).handoffs)
  .toMatchObject([{destination:'ORIGINAL_CALL',originalOwnerRef:'REP'}])
 stale=true
 expect(()=>rework.assertCurrent()).toThrow('STALE_PROOF')
})
