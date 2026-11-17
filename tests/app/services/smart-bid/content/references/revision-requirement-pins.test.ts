import {expect,it} from 'vitest'
import {assertRevisionRequirementPins} from '@/services/smart-bid/content/references/revision-requirement-pins'

const nodes=[{nodeId:'C',type:'chapter'},{nodeId:'OTHER',type:'chapter'},{nodeId:'H',type:'heading'},{nodeId:'D',type:'document'}]
const pin={chapterId:'C',lineageId:'L',version:'R1'}
it('accepts empty pins and permits the same requirement in different actual chapters',()=>{
 expect(()=>assertRevisionRequirementPins([],nodes)).not.toThrow()
 expect(()=>assertRevisionRequirementPins([pin,{...pin,chapterId:'OTHER'}],nodes)).not.toThrow()
})
it.each(['H','D','missing',' C'])('rejects non-chapter target %s',chapterId=>{
 expect(()=>assertRevisionRequirementPins([{...pin,chapterId}],nodes)).toThrow('SNAPSHOT_REQUIREMENT_PIN_CHAPTER')
})
it.each([{lineageId:''},{version:1},{version:' R1'},{title:'display'},{format:'docx'}])('rejects invalid closed pin shape: %j',change=>{
 expect(()=>assertRevisionRequirementPins([{...pin,...change}],nodes)).toThrow('SNAPSHOT_REQUIREMENT_PIN_MODEL')
})
it('rejects exact duplicate pins without discarding any input',()=>{
 const pins=[pin,{...pin}]
 expect(()=>assertRevisionRequirementPins(pins,nodes)).toThrow('SNAPSHOT_REQUIREMENT_PIN_DUPLICATE')
 expect(pins).toHaveLength(2)
})
it('does not pretend to choose the baseline version or remove old versions during editing',()=>{
 expect(()=>assertRevisionRequirementPins([pin,{...pin,version:'R2'}],nodes)).not.toThrow()
})
it('keeps exact Unicode identities and rejects getters without evaluating them',()=>{
 expect(()=>assertRevisionRequirementPins([{...pin,chapterId:'e\u0301'}],[{nodeId:'é',type:'chapter'}])).toThrow('SNAPSHOT_REQUIREMENT_PIN_CHAPTER')
 let invoked=false
 const invalid={...pin};Object.defineProperty(invalid,'version',{enumerable:true,get(){invoked=true;return 'R1'}})
 expect(()=>assertRevisionRequirementPins([invalid],nodes)).toThrow('SNAPSHOT_REQUIREMENT_PIN_MODEL');expect(invoked).toBe(false)
 expect(()=>assertRevisionRequirementPins(new Array(1),nodes)).toThrow('SNAPSHOT_REQUIREMENT_PIN_MODEL')
})
