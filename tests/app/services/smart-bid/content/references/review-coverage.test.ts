import {expect,it} from 'vitest'
import {compareReviewCoverage} from '@/services/smart-bid/content/review/review-coverage'

const file={kind:'FILE' as const,targetId:'X',effectiveHash:'a'.repeat(64),versionHash:'c'.repeat(64),requiredUseIds:['PRICE']}
const field={...file,kind:'FIELD' as const}
const check={...file,checkRef:'CHECK',openBlockerIds:[],checkedUses:[{id:'PRICE',useCheckRef:'USE'}]}
const approval={...file,approvalRef:'APPROVAL'}

it('keeps file approval separate from an independent platform field with the same identifier',()=>{
 const result=compareReviewCoverage({targets:[file,field],checks:[check,{...check,kind:'FIELD'}],approvals:[approval]})
 expect(result.items.map(item=>item.state)).toEqual(['COVERED','NO_APPROVAL'])
 expect(result.complete).toBe(false)
})

it('keeps exact approved versions distinct from historical versions without selecting by return order',()=>{
 const older={...approval,approvalRef:'OLD',versionHash:'d'.repeat(64)}
 const other={...approval,approvalRef:'SECOND'}
 const compare=(approvals:readonly typeof approval[])=>compareReviewCoverage({targets:[file],checks:[check],approvals}).items[0]
 expect(compare([older,approval])).toMatchObject({state:'COVERED',approvalRef:'APPROVAL',matchingApprovalRefs:['APPROVAL']})
 expect(compare([other,older,approval])).toMatchObject({state:'COVERED',approvalRef:null,matchingApprovalRefs:['APPROVAL','SECOND']})
 expect(compare([older])).toMatchObject({state:'CHANGED',matchingApprovalRefs:[]})
 expect(()=>compare([approval,{...older,approvalRef:approval.approvalRef}])).toThrow('CONTENT_REVIEW_COVERAGE_EVIDENCE')
})

it('requires current zero-blocker and use evidence before treating an approval as covered',()=>{
 const state=(checks:Parameters<typeof compareReviewCoverage>[0]['checks'])=>
  compareReviewCoverage({targets:[file],approvals:[approval],checks}).items[0]?.state
 expect(state([])).toBe('CHECK_REQUIRED')
 expect(state([{...check,openBlockerIds:['BLOCK']}])).toBe('BLOCKED')
 expect(state([{...check,checkedUses:[{id:'OTHER',useCheckRef:'USE'}]}])).toBe('USE_CHECK_REQUIRED')
 expect(state([check])).toBe('COVERED')
 expect(state([{...check,versionHash:'d'.repeat(64)}])).toBe('CHECK_REQUIRED')
 expect(compareReviewCoverage({targets:[file],checks:[check],approvals:[{...approval,versionHash:'d'.repeat(64)}]}).items[0]?.state).toBe('CHANGED')
 expect(compareReviewCoverage({targets:[file],checks:[check],approvals:[{...approval,effectiveHash:'b'.repeat(64)}]}).items[0]?.state).toBe('CHANGED')
})
