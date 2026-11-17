import {expect,it} from 'vitest'
import {hashEffectiveFactDependencies} from '@/services/smart-bid/content/hashes/effective-fact-dependencies'

const fact={id:'F2',projectId:'P',key:'PRICE',version:2,kind:'PRICE',value:'0.00',unit:'元',sourceIds:['Q'],
 claimId:null,scopeRef:{projectId:'P'},decisionRefs:['APPROVAL-1'],dependencyRefs:['RULE-1'],promiseTerms:null,sourceRecord:null,status:'ADOPTED'}
const input={projectId:'P',factVersions:[{factId:'PRICE',version:2},{factId:'UNUSED',version:1}],usedFactIds:['PRICE'],records:[fact]}
it('changes the review dependency even when approved display values stay identical',async()=>{
 const original=await hashEffectiveFactDependencies(input)
 const changed=await hashEffectiveFactDependencies({...input,records:[{...fact,decisionRefs:['APPROVAL-2']}]})
 expect(changed.factDependencyHash).not.toBe(original.factDependencyHash)
 expect(changed.displayHashes).toEqual(original.displayHashes)
})
it('requires the exact fixed member version within this review scope',async()=>{
 await expect(hashEffectiveFactDependencies({...input,records:[]})).rejects.toThrow('EFFECTIVE_FACT_MISSING')
 await expect(hashEffectiveFactDependencies({...input,records:[{...fact,version:3}]})).rejects.toThrow('EFFECTIVE_FACT_VERSION')
 await expect(hashEffectiveFactDependencies({...input,records:[fact,{...fact,key:'UNUSED',version:1}]})).rejects.toThrow('EFFECTIVE_FACT_SCOPE')
})
