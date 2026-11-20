import {expect,it} from 'vitest'
import {recoverSubmissionAttempt} from '@/services/smart-bid/content/review/submission-attempt-recovery'

it('separates upload, dispatch and unknown without accepting another channel or request',()=>{
 const scope={projectId:'P',lotId:'L',subjectId:'ORG',channelId:'PORTAL',attemptRef:'SEND',requestDigest:'a'.repeat(64)}
 const assertCurrent=()=>{}
 const upload={...scope,eventRef:'UPLOAD',kind:'UPLOADED' as const,fileVersionId:'FILE',assertCurrent}
 const sent={...scope,eventRef:'SEND-EVENT',kind:'DISPATCHED' as const,actualObjectRef:'PACKAGE',
  uploadEventRef:upload.eventRef,assertCurrent}
 const terminal={...scope,eventRef:'TERM',kind:'NOT_EXECUTED' as const,assertCurrent}
 const recover=(events:Parameters<typeof recoverSubmissionAttempt>[1]['events'])=>recoverSubmissionAttempt(scope,{events,assertCurrent})
 expect(recover([upload]).status).toBe('UNKNOWN')
 expect(recover([sent]).status).toBe('UNKNOWN')
 expect(recover([upload,sent])).toMatchObject({status:'DISPATCHED',actualObjectRef:'PACKAGE',uploadedFileVersionId:'FILE'})
 expect(recover([terminal])).toMatchObject({status:'NOT_EXECUTED',evidenceRef:'TERM'})
 expect(recover([upload,sent,terminal]).status).toBe('UNKNOWN')
 expect(()=>recover([{...sent,channelId:'OTHER'}])).toThrow('SUBMISSION_ATTEMPT_RECOVERY_SCOPE')
 const withdrawal={...scope,eventRef:'WITHDRAW',kind:'WITHDRAWAL_SENT' as const,targetAttemptRef:'OLD',assertCurrent}
 const combined=(events:Parameters<typeof recoverSubmissionAttempt>[1]['events'])=>
  recoverSubmissionAttempt(scope,{events,assertCurrent,combinedWithdrawalTarget:'OLD'})
 expect(combined([withdrawal,sent])).toMatchObject({status:'PARTIAL',newDelivery:null,oldWithdrawal:{targetAttemptRef:'OLD'}})
 expect(combined([withdrawal,upload,sent])).toMatchObject({status:'COMBINED_SENT',
  newDelivery:{evidenceRef:'SEND-EVENT',uploadedFileVersionId:'FILE'},oldWithdrawal:{evidenceRef:'WITHDRAW',targetAttemptRef:'OLD'}})
 expect(()=>combined([{...withdrawal,targetAttemptRef:'OTHER'},upload,sent])).toThrow('SUBMISSION_ATTEMPT_RECOVERY_EVIDENCE')
})
