import {expect,it} from 'vitest'
import {prepareResponseAssignment} from '@/services/smart-bid/content/references/response/response-assignment'

const scope={projectId:'P',baselineId:'B',lineageId:'R',version:'V1'}
const targets=[{kind:'DOCUMENT',targetRef:'DOC',duty:'LEAD'},{kind:'FORM_CELL',targetRef:'CELL',duty:'SEPARATE'},
 {kind:'PLATFORM_FIELD',targetRef:'FIELD',duty:'LEAD'}] as const
const input={...scope,assignmentRef:'A',assignments:targets.map(item=>({...item,assigneeRef:'OWNER',dueAt:10}))}
const source={...scope,destinations:targets,assertCurrent:()=>{},canAccess:()=>true}

it('requires each applicable landing point and access to its material',()=>{
 expect(prepareResponseAssignment(input,source).assignments).toHaveLength(3)
 expect(()=>prepareResponseAssignment({...input,assignments:input.assignments.slice(0,2)},source))
  .toThrow('BID_RESPONSE_ASSIGNMENT_INCOMPLETE')
 expect(()=>prepareResponseAssignment(input,{...source,canAccess:item=>item.kind!=='FORM_CELL'}))
  .toThrow('BID_RESPONSE_ASSIGNMENT_TARGET')
})

it('keeps a separate evidence assignment for the same response location',()=>{
 const evidence={...targets[0],duty:'EVIDENCE' as const}
 const withEvidence={...source,destinations:[...targets,evidence]}
 expect(prepareResponseAssignment({...input,assignments:[...input.assignments,{...evidence,assigneeRef:'PROVER',dueAt:12}]},
  withEvidence).assignments).toMatchObject([...input.assignments,{...evidence,assigneeRef:'PROVER',dueAt:12}])
 expect(()=>prepareResponseAssignment(input,withEvidence)).toThrow('BID_RESPONSE_ASSIGNMENT_INCOMPLETE')
})

it('supports a platform-only requirement without assigning an unrelated document',()=>{
 const independent={...source,destinations:[targets[2]]}
 expect(prepareResponseAssignment({...input,assignments:input.assignments.slice(2)},independent).assignments)
  .toMatchObject([{kind:'PLATFORM_FIELD',targetRef:'FIELD'}])
 expect(()=>prepareResponseAssignment(input,independent)).toThrow('BID_RESPONSE_ASSIGNMENT_TARGET')
})
