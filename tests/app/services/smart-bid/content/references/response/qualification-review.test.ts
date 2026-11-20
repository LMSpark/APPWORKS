import {expect,it} from 'vitest'
import {reviewSelectedQualification} from '@/services/smart-bid/content/references/response/qualification-review'

const scope={projectId:'P',baselineId:'B',requirementVersion:'R',assignmentRef:'A',subjectRef:'BIDDER',asOf:10,assertCurrent:()=>{}}
const conditions=[{conditionRef:'COMPANY',kind:'MATERIAL'},{conditionRef:'LEAD',kind:'PERSON'}] as const
const path={pathRef:'DECLARATION',conditions,declarationRequired:true,assertCurrent:()=>{}}
const evidence=conditions.map(item=>({...scope,...item,evidenceRef:`${item.conditionRef}-PROOF`,use:'USABLE' as const}))

it('requires both employer and personnel evidence while leaving the declaration to production',()=>{
 expect(reviewSelectedQualification(scope,path,evidence.slice(0,1))).toMatchObject({
  verified:false,checks:[{state:'USABLE'},{state:'PENDING'}],
 })
 expect(reviewSelectedQualification(scope,path,evidence)).toMatchObject({verified:true,declaration:'TO_PRODUCE'})
 expect(reviewSelectedQualification(scope,path,[{...evidence[0]!,use:'RESTRICTED'},evidence[1]!]).verified).toBe(false)
 expect(()=>reviewSelectedQualification(scope,path,[{...evidence[0]!,subjectRef:'OTHER'}])).toThrow('BID_QUALIFICATION_EVIDENCE')
})
