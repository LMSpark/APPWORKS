import {expect,it,vi} from 'vitest'
import {assessBaselineRequirementPins,selectBaselineRequirementMember} from '@/services/smart-bid/content/references/baseline-requirement-members'

const nodes=[{nodeId:'C',type:'chapter'},{nodeId:'C2',type:'chapter'},{nodeId:'H',type:'heading'}]
const members=Object.freeze([Object.freeze({lineageId:'L',version:'R2'}),Object.freeze({lineageId:'ZERO',version:'0'})])
it('selects one exact string version and never coerces or sorts version identities',()=>{
 expect(selectBaselineRequirementMember(members,{lineageId:'L'})).toEqual({lineageId:'L',version:'R2'})
 expect(selectBaselineRequirementMember(members,{lineageId:'ZERO',version:'0'})).toEqual({lineageId:'ZERO',version:'0'})
 expect(()=>selectBaselineRequirementMember(members,{lineageId:'L',version:'R1'})).toThrow('BASELINE_REQUIREMENT_MEMBER_MISSING')
 expect(()=>selectBaselineRequirementMember(members,{lineageId:'ABSENT'})).toThrow('BASELINE_REQUIREMENT_MEMBER_MISSING')
})
it('reports changed and unselected bases by chapter without deleting old pins or labelling them withdrawn',()=>{
 const pins=Object.freeze([Object.freeze({chapterId:'C',lineageId:'L',version:'R2'}),
  Object.freeze({chapterId:'C',lineageId:'L',version:'R1'}),Object.freeze({chapterId:'C2',lineageId:'OLD',version:'R0'})])
 expect(assessBaselineRequirementPins(members,pins,nodes)).toEqual([
  {chapterId:'C',lineageId:'L',version:'R1',reason:'VERSION_CHANGED',selectedVersion:'R2'},
  {chapterId:'C2',lineageId:'OLD',version:'R0',reason:'NOT_IN_BASELINE'},
 ])
 expect(pins).toHaveLength(3)
})
it('permits one fixed version across chapters and does not return an adoption or delivery authorization',()=>{
 expect(assessBaselineRequirementPins(members,[{chapterId:'C',lineageId:'L',version:'R2'},{chapterId:'C2',lineageId:'L',version:'R2'}],nodes)).toEqual([])
 expect(assessBaselineRequirementPins([],[],nodes)).toEqual([])
})
it.each([
 [{lineageId:'L',version:2}],[{lineageId:'L',version:''}],[{lineageId:'L',version:' R2'}],
 [{lineageId:'L',version:'R2',text:'原文副本'}],[{lineageId:' L',version:'R2'}],new Array(1),
 [{lineageId:'L',version:'R2'},{lineageId:'L',version:'R2'}],
 [{lineageId:'L',version:'R2'},{lineageId:'L',version:'R3'}],
])('rejects the whole malformed or ambiguous baseline even if no pins refer to it: %j',value=>{
 expect(()=>assessBaselineRequirementPins(value,[],nodes)).toThrow()
})
it('rejects invalid or explicitly undefined selections and does not normalize Unicode identities',()=>{
 expect(()=>Reflect.apply(selectBaselineRequirementMember,undefined,[members,{lineageId:'L',version:undefined}])).toThrow('BASELINE_REQUIREMENT_SELECTION')
 expect(()=>selectBaselineRequirementMember([{lineageId:'é',version:'V'}],{lineageId:'e\u0301'})).toThrow('BASELINE_REQUIREMENT_MEMBER_MISSING')
})
it('validates actual chapters and duplicate pin identities before giving a partial report',()=>{
 const pin={chapterId:'C',lineageId:'L',version:'R1'}
 expect(()=>assessBaselineRequirementPins(members,[{...pin,chapterId:'H'}],nodes)).toThrow('SNAPSHOT_REQUIREMENT_PIN_CHAPTER')
 expect(()=>assessBaselineRequirementPins(members,[pin,pin],nodes)).toThrow('SNAPSHOT_REQUIREMENT_PIN_DUPLICATE')
})
it('rejects baseline member accessors without invoking them',()=>{
 const getter=vi.fn(()=>'R2'),member={lineageId:'L'}
 Object.defineProperty(member,'version',{enumerable:true,get:getter})
 expect(()=>assessBaselineRequirementPins([member],[],nodes)).toThrow('BASELINE_REQUIREMENT_MEMBER_MODEL')
 expect(getter).not.toHaveBeenCalled()
})
