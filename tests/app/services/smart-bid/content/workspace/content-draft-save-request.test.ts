import {expect,it} from 'vitest'
import {prepareContentDraftSaveRequest} from '@/services/smart-bid/content/draft/content-draft-save-request'
import {readOriginalContentDraftSave} from '@/services/smart-bid/content/draft/content-draft-save-recovery'

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
 const assertCurrent=()=>{}
 const recover=(lookup:Parameters<typeof readOriginalContentDraftSave>[1]['lookup'])=>
  readOriginalContentDraftSave({...sealed,authorId:'U'},{lookup,assertCurrent})
 expect(await recover(async()=>undefined)).toMatchObject({state:'UNKNOWN'})
 expect(await recover(async request=>({...request,state:'SAVED',draftVersion:'V2',receiptRef:'SAVE',assertCurrent})))
  .toMatchObject({state:'SAVED',draftVersion:'V2',contentDigest:sealed.contentDigest})
 await expect(recover(async request=>({...request,state:'SAVED',draftVersion:'V3',receiptRef:'LATER',
  requestKey:'OTHER',assertCurrent}))).rejects.toThrow('CONTENT_DRAFT_SAVE_RECEIPT_SCOPE')
})
