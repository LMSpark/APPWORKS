import {expect,it} from 'vitest'
import {projectSubmissionOpeningDisposition} from '@/services/smart-bid/content/review/submission/submission-opening-disposition'

it('keeps opening and admissibility independent and binds each to the original object',()=>{
 const scope={projectId:'P',lotId:'L',roundId:'R',attemptRef:'SEND',objectRef:'PKG'}
 const at=(hour:string)=>`2026-11-18T${hour}:00:00+08:00`
 const assertCurrent=()=>{}
 const opening={...scope,issuerRef:'RECEIVER',eventRef:'OPEN',stage:'OPENING' as const,state:'OPENED' as const,
  eventAt:at('10'),knownAt:at('11'),assertCurrent}
 const excluded={...opening,eventRef:'REJECT',stage:'ADMISSIBILITY' as const,state:'EXCLUDED' as const,knownAt:at('13')}
 expect(projectSubmissionOpeningDisposition(scope,{knownAt:at('11'),records:[opening,excluded],assertCurrent}))
  .toMatchObject({opening:{state:'OPENED'},admissibility:{state:'PENDING'}})
 expect(projectSubmissionOpeningDisposition(scope,{knownAt:at('14'),records:[opening,excluded],assertCurrent}))
  .toMatchObject({opening:{state:'OPENED'},admissibility:{state:'EXCLUDED'}})
 expect(()=>projectSubmissionOpeningDisposition(scope,{knownAt:at('14'),records:[{...opening,objectRef:'OTHER'}],assertCurrent}))
  .toThrow('SUBMISSION_DISPOSITION_SCOPE')
 const wrongStage={...opening,state:'EXCLUDED'} as unknown as typeof opening
 expect(()=>projectSubmissionOpeningDisposition(scope,{knownAt:at('14'),records:[wrongStage],assertCurrent}))
  .toThrow('SUBMISSION_DISPOSITION_STAGE')
 expect(()=>projectSubmissionOpeningDisposition(scope,{knownAt:at('14'),records:[{...opening,knownAt:at('09')}],assertCurrent}))
  .toThrow('SUBMISSION_DISPOSITION_TIME')
})
