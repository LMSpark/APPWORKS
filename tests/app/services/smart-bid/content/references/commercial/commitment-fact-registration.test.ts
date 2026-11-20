import {expect,it} from 'vitest'
import {prepareCommitmentFactRegistration,recoverCommitmentFactRegistration} from '@/services/smart-bid/content/references/commercial/commitment-fact-registration'

it('recovers only the original append request and requires a complete receipt',async()=>{
 const assertCurrent=()=>{}
 const fact={projectId:'P',scopeRef:'LOT',key:'A',kind:'PRICE' as const,value:'0',unit:'CNY',
  claimId:null,sourceIds:['SRC'],decisionRefs:['APPROVAL'],dependencyRefs:[]}
 const prepared=await prepareCommitmentFactRegistration({facts:[fact,{...fact,key:'B'}],assertCurrent},'Q')
 const reversed=await prepareCommitmentFactRegistration({facts:[{...fact,key:'B'},fact],assertCurrent},'Q')
 expect(reversed.request).toEqual(prepared.request)
 const original=structuredClone({request:prepared.request,factKeys:prepared.factKeys})
 const receipt={request:original.request,state:'REGISTERED' as const,assertCurrent,versions:[
  {key:'A',id:'FA',version:1},{key:'B',id:'FB',version:2},
 ]}
 expect(await recoverCommitmentFactRegistration(original,{lookup:async()=>undefined,assertCurrent})).toMatchObject({state:'UNKNOWN'})
 expect(await recoverCommitmentFactRegistration(original,{lookup:async()=>receipt,assertCurrent}))
  .toMatchObject({state:'REGISTERED',versions:receipt.versions})
 await expect(recoverCommitmentFactRegistration(original,{lookup:async()=>({...receipt,versions:receipt.versions.slice(1)}),assertCurrent}))
  .rejects.toThrow('BID_FACT_REGISTRATION_RESULT')
 await expect(recoverCommitmentFactRegistration(original,{lookup:async()=>({...receipt,request:{...receipt.request,requestKey:'OTHER'}}),assertCurrent}))
  .rejects.toThrow('BID_FACT_REGISTRATION_REQUEST')
})
