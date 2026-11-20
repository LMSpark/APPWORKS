import {expect,it} from 'vitest'
import {compareAdoptionBasisChecks} from '@/services/smart-bid/content/adoption/adoption-basis-checks'

const check={owner:'招标来源',scopeRef:{projectId:'P',stage:'投标'},scopeVersion:'002',recordRefs:['原件']}
it('requires a new preview when the responsible scope changes despite an unchanged head',()=>{
 const current={...check,scopeVersion:'003',recordRefs:['原件','新勘误']}
 expect(compareAdoptionBasisChecks([check],[current])).toMatchObject({
  matches:false,issues:[{owner:check.owner,code:'SCOPE_VERSION_CHANGED',expectedVersion:'002',actualVersion:'003'}],
 })
})
it('compares structured scope and evidence as JSON while rejecting missing or duplicate checks',()=>{
 const reordered={...check,scopeRef:{stage:'投标',projectId:'P'}}
 expect(compareAdoptionBasisChecks([check],[reordered]).matches).toBe(true)
 expect(compareAdoptionBasisChecks([check],[]).issues[0]?.code).toBe('SCOPE_CHECK_MISSING')
 expect(compareAdoptionBasisChecks([check],[{...check,recordRefs:['其它']}]).issues[0]?.code).toBe('SCOPE_EVIDENCE_CHANGED')
 expect(()=>compareAdoptionBasisChecks([check],[check,check])).toThrow('ADOPTION_BASIS_CHECK_DUPLICATE')
})
it('rejects an empty preview and keeps execution checks pending even when versions match',()=>{
 expect(()=>compareAdoptionBasisChecks([],[])).toThrow('ADOPTION_BASIS_CHECK_REQUIRED')
 const withEvidence={...check,recordRefs:['原件',{id:'更正'}]}
 expect(compareAdoptionBasisChecks([withEvidence],[{...withEvidence,recordRefs:[{id:'更正'},'原件']}]))
  .toEqual({matches:true,issues:[],requiresAtomicCommitChecks:true})
 expect(compareAdoptionBasisChecks([check],[check,{...check,owner:'商务批准'}]).issues[0]?.code).toBe('SCOPE_CHECK_ADDED')
})
