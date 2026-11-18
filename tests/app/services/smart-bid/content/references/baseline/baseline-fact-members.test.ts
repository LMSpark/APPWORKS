import {expect,it,vi} from 'vitest'
import {assertBaselineFactMember} from '@/services/smart-bid/content/references/baseline/baseline-fact-members'

it('selects the exact original key and version without rewriting the JSON',()=>{
 const members=Object.freeze([Object.freeze({factId:'PRICE',version:2}),Object.freeze({factId:'TERM',version:0})])
 expect(()=>assertBaselineFactMember(members,{factId:'PRICE',version:2})).not.toThrow()
 expect(()=>assertBaselineFactMember(members,{factId:'TERM',version:0})).not.toThrow()
})
it.each([
 [],[{factId:'PRICE',version:3}],['PRICE'],[{factId:'PRICE'}],
 [{factId:'PRICE',version:'2'}],[{factId:'PRICE',version:-1}],
 [{factId:'PRICE',version:2},{factId:'PRICE',version:3}],
 [{factId:'PRICE',version:2},{factId:'PRICE',version:2}],
 [{factId:'PRICE',version:2,value:'0.00'}],
 [{factId:' PRICE',version:2}],new Array(1),
])('rejects missing, ambiguous or noncanonical members %j',members=>{
 expect(()=>assertBaselineFactMember(members,{factId:'PRICE',version:2})).toThrow()
})
it('does not execute member getters',()=>{
 const getter=vi.fn(()=>2),member={factId:'PRICE'}
 Object.defineProperty(member,'version',{enumerable:true,get:getter})
 expect(()=>assertBaselineFactMember([member],{factId:'PRICE',version:2})).toThrow()
 expect(getter).not.toHaveBeenCalled()
})
