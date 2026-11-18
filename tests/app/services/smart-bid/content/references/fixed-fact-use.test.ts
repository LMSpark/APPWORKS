import {expect,it} from 'vitest'
import {checkFixedFactUse} from '@/services/smart-bid/content/references/fixed-fact-use'

const target={projectId:'P',baselineId:'B',factId:'F',version:1,scopeRef:'LOT',purposeRef:'BID',useAt:10}
const fact={...target,decisionRefs:['ORIGINAL'],assertCurrent:()=>{}}
const check={...fact,useCheckRef:'CHECK',state:'RESTRICTED' as const}

it('preserves the baseline fact identity when usability remains pending or restricted',()=>{
 expect(checkFixedFactUse(target,fact)).toMatchObject({factId:'F',version:1,state:'PENDING',useCheckRef:null})
 expect(checkFixedFactUse(target,fact,check)).toMatchObject({factId:'F',version:1,state:'RESTRICTED',useCheckRef:'CHECK'})
 for(const wrong of [{...check,version:2},{...check,useAt:11},{...check,decisionRefs:['NEW']}])
  expect(()=>checkFixedFactUse(target,fact,wrong)).toThrow('BID_FACT_USE_EVIDENCE')
})
