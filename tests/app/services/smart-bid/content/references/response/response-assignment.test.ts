import {expect,it} from 'vitest'
import {prepareResponseAssignment} from '@/services/smart-bid/content/references/response/response-assignment'

const scope={projectId:'P',baselineId:'B',requirementRef:'R'}
const targets=[{kind:'DOCUMENT',targetRef:'DOC'},{kind:'FORM_CELL',targetRef:'CELL'},{kind:'PLATFORM_FIELD',targetRef:'FIELD'}] as const
const input={...scope,assignmentRef:'A',assignments:targets.map(item=>({...item,assigneeRef:'OWNER',dueAt:10}))}
const source={...scope,destinations:targets,assertCurrent:()=>{},canAccess:()=>true}

it('requires each applicable landing point and access to its material',()=>{
 expect(prepareResponseAssignment(input,source).assignments).toHaveLength(3)
 expect(()=>prepareResponseAssignment({...input,assignments:input.assignments.slice(0,2)},source))
  .toThrow('BID_RESPONSE_ASSIGNMENT_INCOMPLETE')
 expect(()=>prepareResponseAssignment(input,{...source,canAccess:item=>item.kind!=='FORM_CELL'}))
  .toThrow('BID_RESPONSE_ASSIGNMENT_TARGET')
})

it('supports a platform-only requirement without assigning an unrelated document',()=>{
 const independent={...source,destinations:[targets[2]]}
 expect(prepareResponseAssignment({...input,assignments:input.assignments.slice(2)},independent).assignments)
  .toMatchObject([{kind:'PLATFORM_FIELD',targetRef:'FIELD'}])
 expect(()=>prepareResponseAssignment(input,independent)).toThrow('BID_RESPONSE_ASSIGNMENT_TARGET')
})
