import {expect,it} from 'vitest'
import {prepareContentDraftSaveRequest} from '@/services/smart-bid/content/draft/content-draft-save-request'
import {readOriginalContentDraftSave,reconcileSavedContentDraft} from '@/services/smart-bid/content/draft/content-draft-save-recovery'

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
 const invalidDigest=[sealed.requestDigest] as unknown as string
 await expect(readOriginalContentDraftSave({...sealed,authorId:'U',requestDigest:invalidDigest},{
  lookup:async()=>{throw Error('LOOKUP_MUST_NOT_RUN')},assertCurrent,
 })).rejects.toThrow('CONTENT_DRAFT_SAVE_RECEIPT_SCOPE')
 await expect(recover(async request=>({...request,state:'INVALID' as 'SAVED',draftVersion:'V2',
  receiptRef:'SAVE',assertCurrent}))).rejects.toThrow('CONTENT_DRAFT_SAVE_RECEIPT_SCOPE')
 const receipt=await recover(async request=>({...request,state:'SAVED',draftVersion:'V2',receiptRef:'SAVE',assertCurrent}))
 expect(receipt).toMatchObject({state:'SAVED',draftVersion:'V2',contentDigest:sealed.contentDigest})
 if(receipt.state!=='SAVED')throw Error('EXPECTED_DRAFT_RECEIPT')
 const edit={projectId:'P',draftId:'D',authorId:'U',draft:{nodes:[],responseChanges:[] as string[]},assertCurrent}
 const matched=await reconcileSavedContentDraft(receipt,edit)
 expect(matched.currentState).toBe('MATCHED')
 edit.draft.responseChanges.push('later change')
 expect(()=>matched.assertCurrent()).toThrow('CONTENT_DRAFT_SAVE_STALE')
 expect(await reconcileSavedContentDraft(receipt,edit)).toMatchObject({savedVersion:'V2',currentState:'NEWER_EDITS'})
 expect(edit.draft.responseChanges).toEqual(['later change'])
 await expect(recover(async request=>({...request,state:'SAVED',draftVersion:'V3',receiptRef:'LATER',
  requestKey:'OTHER',assertCurrent}))).rejects.toThrow('CONTENT_DRAFT_SAVE_RECEIPT_SCOPE')
})
