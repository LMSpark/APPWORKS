import {expect,it} from 'vitest'
import {hashContentEffective,hashEffectiveResponseDependencies} from '@/services/smart-bid/content/hashes/content-effective-hash'

const digest=(char:string)=>char.repeat(64)
const base={subtreeHash:digest('a'),
 displayRefs:[{nodeId:'N',occurrence:1,displayHash:digest('b')},{nodeId:'N',occurrence:0,displayHash:digest('c')}],
 factDependencyHash:digest('d'),requirementBindingHash:digest('e'),responseDependencyHash:digest('f'),
 qualificationHash:digest('1'),contentRulesHash:digest('2'),calculationInputsHash:digest('3')}
it('changes for business evidence even if all rendered values remain the same',async()=>{
 const original=await hashContentEffective(base)
 expect(await hashContentEffective({...base,factDependencyHash:digest('4')})).not.toBe(original)
 expect(await hashContentEffective({...base,displayRefs:[...base.displayRefs].reverse()})).toBe(original)
})
it('rejects ambiguous display positions and missing business digests',async()=>{
 await expect(hashContentEffective({...base,displayRefs:[base.displayRefs[0],base.displayRefs[0]]})).rejects.toThrow('CONTENT_EFFECTIVE_DISPLAY_DUPLICATE')
 await expect(hashContentEffective({...base,qualificationHash:undefined})).rejects.toThrow('CONTENT_EFFECTIVE_COMPONENT')
})
it('includes fixed independent response displays in the effective content digest',async()=>{
 const refs=[{assignmentId:'A',responseId:'R',occurrence:1,displayHash:digest('6')},
  {assignmentId:'A',responseId:'R',occurrence:0,displayHash:digest('7')}]
 const hash=(displayRefs:unknown)=>hashEffectiveResponseDependencies(base.responseDependencyHash,displayRefs)
 const responseDependencyHash=await hash(refs)
 expect(await hash([...refs].reverse())).toBe(responseDependencyHash)
 expect(await hash([])).toBe(base.responseDependencyHash)
 await expect(hash([refs[0],refs[0]])).rejects.toThrow('CONTENT_EFFECTIVE_DISPLAY_DUPLICATE')
 expect(await hashContentEffective({...base,responseDependencyHash})).not.toBe(await hashContentEffective(base))
 expect(await hash(refs.map(ref=>({...ref,assignmentId:'B'})))).not.toBe(responseDependencyHash)
})
