import {expect,it} from 'vitest'
import {recoverProductionRequest} from '@/services/smart-bid/content/review/production/production-recovery'

const request={projectId:'P',documentId:'DOC',revisionId:'R',requestKey:'Q',inputDigest:'a'.repeat(64),purpose:'FORMAL' as const}
const assertCurrent=()=>{}
const receipt={request,state:'COMPLETED' as const,assertCurrent,
 file:{producedFileId:'F',productionRequestRef:'PROD',fileHash:'b'.repeat(64),completedScopeRefs:['SECTION']}}

it('keeps current production results attached to the original request',async()=>{
 expect(await recoverProductionRequest(request,{lookup:async()=>undefined,assertCurrent})).toMatchObject({state:'UNKNOWN'})
 expect(await recoverProductionRequest(request,{lookup:async()=>({...receipt,state:'IN_PROGRESS'}),assertCurrent}))
  .toMatchObject({state:'IN_PROGRESS'})
 expect(await recoverProductionRequest(request,{lookup:async()=>receipt,assertCurrent}))
  .toMatchObject({state:'COMPLETED',producedFileId:'F',requiresFileVerification:true})
 await expect(recoverProductionRequest(request,{lookup:async()=>({...receipt,request:{...request,requestKey:'OTHER'}}),assertCurrent}))
  .rejects.toThrow('BID_PRODUCTION_RECOVERY_SCOPE')
})
