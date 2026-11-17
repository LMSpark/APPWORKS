import {expect,it} from 'vitest'
import {inspectAdoptionRecovery} from '@/services/smart-bid/content/adoption-recovery'

const request={projectId:'P',candidateRevisionId:'T',requestKey:'K',requestDigest:'D',previewRef:'PV'}
const committed={...request,effect:'COMMITTED' as const,resultEvidenceRef:'E'}
it('keeps empty queries and unproven reported success unknown',()=>{
 expect(inspectAdoptionRecovery(request,null,null).effect).toBe('UNKNOWN')
 expect(inspectAdoptionRecovery(request,committed,null).effect).toBe('UNKNOWN')
})
it('keeps proven historical adoption when the execution-check evidence is missing',()=>{
 const evidence={...request,kind:'COMMITTED' as const,resultEvidenceRef:'E',adoptionRef:'A',mergeRevisionId:'R'}
 expect(inspectAdoptionRecovery(request,committed,evidence)).toMatchObject({
  effect:'COMMITTED',adoptionRef:'A',mergeRevisionId:'R',missing:['COMMIT_CHECK'],
 })
 expect(inspectAdoptionRecovery(request,committed,{...evidence,requestDigest:'other'}).effect).toBe('UNKNOWN')
})
it('requires a terminal no-effect record to prove the original execution was fenced',()=>{
 const observation={...request,effect:'NOT_COMMITTED' as const,resultEvidenceRef:'E'}
 const evidence={...request,kind:'NOT_COMMITTED' as const,resultEvidenceRef:'E',executionFenceRef:'F'}
 expect(inspectAdoptionRecovery(request,observation,null).effect).toBe('UNKNOWN')
 expect(inspectAdoptionRecovery(request,observation,evidence).effect).toBe('NOT_COMMITTED')
 expect(()=>inspectAdoptionRecovery(request,{...observation,requestKey:'other'},evidence)).toThrow('ADOPTION_RECOVERY_REQUEST_MISMATCH')
})
