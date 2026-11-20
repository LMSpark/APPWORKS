import {expect,it} from 'vitest'
import {recoverProductionRequest} from '@/services/smart-bid/content/review/production/production-recovery'

const request={projectId:'P',documentId:'DOC',revisionId:'R',requestKey:'Q',inputDigest:'a'.repeat(64),purpose:'FORMAL' as const}
const assertCurrent=()=>{}
const receipt={request,state:'COMPLETED' as const,assertCurrent,
 files:[{producedFileId:'F',productionRequestRef:'PROD',fileHash:'b'.repeat(64),completedScopeRefs:['SECTION']}]}

it('keeps current production results attached to the original request',async()=>{
 expect(await recoverProductionRequest(request,{lookup:async()=>undefined,assertCurrent})).toMatchObject({state:'UNKNOWN'})
 expect(await recoverProductionRequest(request,{lookup:async()=>({...receipt,state:'IN_PROGRESS'}),assertCurrent}))
  .toMatchObject({state:'IN_PROGRESS'})
 expect(await recoverProductionRequest(request,{lookup:async()=>receipt,assertCurrent}))
  .toMatchObject({state:'COMPLETED',files:[{producedFileId:'F'}],requiresFileVerification:true})
 await expect(recoverProductionRequest(request,{lookup:async()=>({...receipt,request:{...request,requestKey:'OTHER'}}),assertCurrent}))
  .rejects.toThrow('BID_PRODUCTION_RECOVERY_SCOPE')
})

it('retains missing scopes for partial output and rejects overlapping scopes',async()=>{
 const recover=(missingScopeRefs:readonly string[])=>recoverProductionRequest(request,{
  lookup:async()=>({...receipt,state:'PARTIAL',missingScopeRefs}),assertCurrent,
 })
 await expect(recover(['ATTACHMENT'])).resolves.toMatchObject({state:'PARTIAL',files:[{producedFileId:'F',completedScopeRefs:['SECTION']}],
  missingScopeRefs:['ATTACHMENT'],requiresFileVerification:true})
 await expect(recover(['SECTION'])).rejects.toThrow('BID_PRODUCTION_RECOVERY_RECEIPT')
})
