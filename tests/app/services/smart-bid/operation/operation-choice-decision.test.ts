import {expect,it} from 'vitest'
import {decideOperationChoice,type OperationConditionEvaluation} from '@/services/smart-bid/operation/operation-choice-decision'

const context={runId:'RUN',targetId:'TARGET',artifactHash:'HASH'}
function branch(id:string,value:boolean|null,required=false){
 const evaluation:{-readonly [K in keyof OperationConditionEvaluation]:OperationConditionEvaluation[K]}={...context,state:'CURRENT',value,evidenceRefs:['CHECK']}
 return {id,required,evaluation}
}
it('selects exactly one evidenced branch and preserves declared order',()=>{
 expect(decideOperationChoice({...context,branches:[branch('B',false),branch('A',true)]})).toEqual({status:'EXECUTE',selectedBranchId:'A',skippedBranchIds:['B']})
})
it('does not treat unknown, missing or stale evidence as false even beside a true branch',()=>{
 for(const state of ['PENDING','MISSING','STALE'] as const){const b=branch('B',false);b.evaluation.state=state
  expect(decideOperationChoice({...context,branches:[branch('A',true),b]})).toEqual({status:'WAIT',branchIds:['B']})}
 expect(decideOperationChoice({...context,branches:[branch('A',null)]})).toEqual({status:'WAIT',branchIds:['A']})
})
it('waits when an otherwise current evaluation belongs to another run, target or artifact',()=>{
 for(const key of ['runId','targetId','artifactHash'] as const){const b=branch('A',false);b.evaluation[key]='OTHER'
  expect(decideOperationChoice({...context,branches:[b]})).toEqual({status:'WAIT',branchIds:['A']})}
})
it('requires evidence to skip and refuses to skip a required subtree',()=>{
 expect(decideOperationChoice({...context,branches:[branch('A',false)]})).toEqual({status:'SKIP',skippedBranchIds:['A']})
 expect(decideOperationChoice({...context,branches:[branch('A',false,true)]})).toEqual({status:'REQUIRED',branchIds:['A']})
 expect(decideOperationChoice({...context,branches:[branch('A',true),branch('B',false,true)]})).toEqual({status:'REQUIRED',branchIds:['B']})
 const b=branch('A',false);b.evaluation.evidenceRefs=[]
 expect(decideOperationChoice({...context,branches:[b]})).toEqual({status:'WAIT',branchIds:['A']})
})
it('returns a conflict for multiple true branches without selecting by position',()=>{
 expect(decideOperationChoice({...context,branches:[branch('B',true),branch('A',true)]})).toEqual({status:'CONFLICT',branchIds:['B','A']})
})
it('rejects duplicate or empty branch identities and non-JSON shape instead of silently repairing it',()=>{
 expect(()=>decideOperationChoice({...context,branches:[branch('A',true),branch('A',false)]})).toThrow('OPERATION_CHOICE_MODEL')
 expect(()=>decideOperationChoice({...context,branches:[]})).toThrow('OPERATION_CHOICE_MODEL')
 expect(()=>decideOperationChoice({...context,branches:[branch('',true)]})).toThrow('OPERATION_CHOICE_MODEL')
})
it('rejects accessors without reading them and never coerces a non-string state',()=>{
 let reads=0
 const b=branch('A',false)
 Object.defineProperty(b.evaluation,'state',{enumerable:true,get:()=>{reads++;return 'CURRENT'}})
 expect(()=>decideOperationChoice({...context,branches:[b]})).toThrow('OPERATION_CHOICE_MODEL')
 expect(reads).toBe(0)
 const other=branch('B',false)
 Object.defineProperty(other.evaluation,'state',{value:{toString:()=>{reads++;return 'CURRENT'}},enumerable:true})
 expect(()=>decideOperationChoice({...context,branches:[other]})).toThrow('OPERATION_CHOICE_MODEL')
 expect(reads).toBe(0)
})
