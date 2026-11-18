import {expect,it} from 'vitest'
import {projectTenderOutcome} from '@/services/smart-bid/content/review/submission/tender-outcome-evidence'

it('retains recommendations and prior results while limiting corrections to their original scope',()=>{
 const scope={projectId:'P',lotId:'L',roundId:'R',stageId:'RESULT',subjectId:'ORG'}
 const at=(hour:string)=>`2026-11-18T${hour}:00:00+08:00`
 const assertCurrent=()=>{}
 const recommendation={...scope,eventRef:'REC',issuerRef:'AGENCY',documentVersionId:'DOC1',
  eventAt:at('09'),knownAt:at('09'),supersedesRef:null,kind:'RECOMMENDED' as const,assertCurrent}
 const award={...recommendation,eventRef:'AWARD',kind:'AWARDED' as const,eventAt:at('10'),knownAt:at('10')}
 const correction={...award,eventRef:'CORRECT',kind:'NOT_AWARDED' as const,documentVersionId:'DOC2',
  eventAt:at('11'),knownAt:at('12'),supersedesRef:'AWARD'}
 const assess=(knownAt:string,officialEvents:Parameters<typeof projectTenderOutcome>[1]['officialEvents'])=>
  projectTenderOutcome(scope,{knownAt,officialEvents,assertCurrent})
 expect(assess(at('09'),[recommendation,award,correction])).toMatchObject({subjectState:'RECOMMENDED'})
 expect(assess(at('11'),[recommendation,award,correction])).toMatchObject({subjectState:'AWARDED'})
 expect(assess(at('12'),[recommendation,award,correction])).toMatchObject({
  subjectState:'NOT_AWARDED',roundState:'UNCONFIRMED',evidence:[{eventRef:'REC'},{eventRef:'AWARD'},{eventRef:'CORRECT'}],
 })
 expect(()=>assess(at('12'),[{...award,subjectId:'OTHER'}])).toThrow('TENDER_OUTCOME_SCOPE')
})
