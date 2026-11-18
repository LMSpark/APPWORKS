import {expect,it} from 'vitest'
import {prepareContentDraftSaveRequest} from '@/services/smart-bid/content/draft/content-draft-save-request'

it('seals the original content and distinguishes saves against different draft versions',async()=>{
 let current=true
 const input={projectId:'P',draftId:'D',baseRevisionId:'BASE',expectedDraftVersion:'V1',requestKey:'Q',
  draft:{nodes:[],responseChanges:[]},assertCurrent:()=>{if(!current)throw Error('DRAFT_STALE')}}
 const sealed=await prepareContentDraftSaveRequest(input)
 expect(sealed.requestJson).toContain('"expectedDraftVersion":"V1"')
 expect((await prepareContentDraftSaveRequest(input)).requestDigest).toBe(sealed.requestDigest)
 const changed=await prepareContentDraftSaveRequest({...input,expectedDraftVersion:'V2'})
 expect(changed.requestDigest).not.toBe(sealed.requestDigest)
 expect(changed.contentDigest).toBe(sealed.contentDigest)
 await expect(prepareContentDraftSaveRequest({...input,draft:{nodes:[]}})).rejects.toThrow('CONTENT_DRAFT_PAYLOAD')
 current=false
 expect(()=>sealed.assertCurrent()).toThrow('DRAFT_STALE')
})
