import {expect,it} from 'vitest'
import {hashContentEffective} from '@/services/smart-bid/content/hashes/content-effective-hash'

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
