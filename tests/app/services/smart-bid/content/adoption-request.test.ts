import {expect,it} from 'vitest'
import {prepareAdoptionRequest} from '@/services/smart-bid/content/adoption-request'
import {inspectAdoptionRecovery} from '@/services/smart-bid/content/adoption-recovery'

const command={projectId:'P',candidateRevisionId:'T',expectedHead:'H',previewRef:'PV',requestKey:'K',
 nodeIds:['N'],responseRefs:[],selectedParts:[],decisionTraceRef:'DEC',reason:'核准所选段落'}
it('binds the request digest to the originating preview, head, selection and decision',async()=>{
 const original=await prepareAdoptionRequest(command)
 expect(original.requestDigest).toMatch(/^[0-9a-f]{64}$/u)
 expect(await prepareAdoptionRequest({...command})).toEqual(original)
 for(const change of [{expectedHead:'NEXT'},{previewRef:'NEXT'},{nodeIds:['OTHER']},{decisionTraceRef:'NEW'}]){
  expect((await prepareAdoptionRequest({...command,...change})).requestDigest).not.toBe(original.requestDigest)
 }
})
it('rejects an empty or repeated whole-node selection',async()=>{
 await expect(prepareAdoptionRequest({...command,nodeIds:[]})).rejects.toThrow('ADOPTION_SELECTION_REQUIRED')
 await expect(prepareAdoptionRequest({...command,nodeIds:['N','N']})).rejects.toThrow('ADOPTION_SELECTION_DUPLICATE')
})
it('reuses the original prepared identity when checking recovery',async()=>{
 const prepared=await prepareAdoptionRequest(command)
 const observation={...prepared,effect:'UNKNOWN' as const}
 expect(inspectAdoptionRecovery(prepared,observation,null).effect).toBe('UNKNOWN')
 const changed=await prepareAdoptionRequest({...command,nodeIds:['OTHER']})
 expect(()=>inspectAdoptionRecovery(changed,observation,null)).toThrow('ADOPTION_RECOVERY_REQUEST_MISMATCH')
})
