import {expect,it} from 'vitest'
import {prepareAdoptionFromApprovedPreview,prepareAdoptionRequest} from '@/services/smart-bid/content/adoption/adoption-request'
import {inspectAdoptionRecovery} from '@/services/smart-bid/content/adoption/adoption-recovery'

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
it('rejects whole-node overlap and overlapping target parts before capturing the request',async()=>{
 const reference=(revisionId:string,start:number,end:number)=>({schemaVersion:2,projectId:'P',revisionId,
  owner:{kind:'NODE',nodeId:'N'},path:'/value',unit:'utf16',textDigest:'a'.repeat(64),start,end})
 const part=(start:number,end:number)=>({operation:'replace',sourceRef:reference('T',start,end),targetRef:reference('H',start,end)})
 await expect(prepareAdoptionRequest({...command,selectedParts:[part(0,2)]})).rejects.toThrow('ADOPTION_SELECTION_OVERLAP')
 await expect(prepareAdoptionRequest({...command,nodeIds:[],selectedParts:[part(0,2),part(1,3)]})).rejects.toThrow('ADOPTION_SELECTION_OVERLAP')
 expect((await prepareAdoptionRequest({...command,nodeIds:[],selectedParts:[part(0,2),part(2,3)]})).requestDigest).toHaveLength(64)
 const insert=(start:number,end:number)=>({operation:'insert',sourceRef:reference('T',start,end),targetRef:reference('H',2,2)})
 await expect(prepareAdoptionRequest({...command,nodeIds:[],selectedParts:[insert(0,1),insert(1,2)]}))
  .rejects.toThrow('ADOPTION_SELECTION_OVERLAP')
 const response=(revisionId:string,responseId:string)=>({...reference(revisionId,0,1),path:'/statement',
  owner:{kind:'RESPONSE',assignmentId:'A',responseId}})
 await expect(prepareAdoptionRequest({...command,nodeIds:[],responseRefs:[{assignmentId:'A',responseId:'R2'}],
  selectedParts:[{operation:'replace',sourceRef:response('T','R2'),targetRef:response('H','R1')}] })).rejects.toThrow('ADOPTION_SELECTION_OVERLAP')
})
it('binds preparation to the reviewed scope and exact preview revision identity',async()=>{
 const approved={projectId:'P',candidateRevisionId:'T',expectedHead:'H',previewRef:'PV',
  nodeIds:['N','M'],responseRefs:[],selectedParts:[]}
 expect((await prepareAdoptionFromApprovedPreview({...command,nodeIds:['M','N']},approved)).previewRef).toBe('PV')
 await expect(prepareAdoptionFromApprovedPreview({...command,nodeIds:['M','OTHER']},approved))
  .rejects.toThrow('ADOPTION_PREVIEW_SCOPE_MISMATCH')
 await expect(prepareAdoptionFromApprovedPreview({...command,nodeIds:['M','N']},{...approved,expectedHead:'OTHER'}))
  .rejects.toThrow('ADOPTION_PREVIEW_CONTEXT_MISMATCH')
})
