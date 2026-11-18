import {expect,it} from 'vitest'
import {mergeTenderFollowupNoticeReads,prepareTenderFollowupNotice} from '@/services/smart-bid/content/references/followup/tender-followup-notice'

it('retains a formal notice and deadline while the historical package and scope are still pending',async()=>{
 const scope={projectId:'P',lotId:'L',roundId:'R',subjectId:'ORG',stageId:'FOLLOW-UP'}
 const line={...scope,noticeId:'NOTICE',documentVersionId:'DOC-V1',sourceRef:'INBOX',issuerRef:'ISSUER',channelId:'PORTAL',
  kind:'REPRICE_INVITATION' as const,change:'INITIAL' as const,previousNoticeRef:null,originalObjectRef:null,permittedScopeRef:null,
  issuedAt:'2026-11-18T10:00:00+08:00',knownAt:'2026-11-18T11:00:00+08:00',replyDueAt:'2026-11-18T12:00:00+08:00',
  assertCurrent:()=>{}}
 const original=await prepareTenderFollowupNotice(scope,line)
 expect(original).toMatchObject({objectState:'PENDING_PAIR',scopeState:'PENDING_SCOPE',record:{replyDueAt:line.replyDueAt}})
 expect((await prepareTenderFollowupNotice(scope,line)).digest).toBe(original.digest)
 await expect(prepareTenderFollowupNotice(scope,{...line,roundId:'OTHER'})).rejects.toThrow('TENDER_FOLLOWUP_SCOPE')
 await expect(prepareTenderFollowupNotice(scope,{...line,change:'CORRECTION'})).rejects.toThrow('TENDER_FOLLOWUP_SCOPE')
 const correction=await prepareTenderFollowupNotice(scope,{...line,noticeId:'NEW',documentVersionId:'DOC-V2',
  change:'CORRECTION',previousNoticeRef:'NOTICE'})
 expect(correction.record.previousNoticeRef).toBe('NOTICE')
 expect(correction.digest).not.toBe(original.digest)
 const later={...line,sourceRef:'PORTAL-RECORD',knownAt:'2026-11-18T11:30:00+08:00'}
 const same=await mergeTenderFollowupNoticeReads(scope,[line,later])
 expect(same.eventDigest).toBe((await mergeTenderFollowupNoticeReads(scope,[later])).eventDigest)
 expect(same.origins).toEqual([{sourceRef:line.sourceRef,knownAt:line.knownAt},{sourceRef:later.sourceRef,knownAt:later.knownAt}])
 await expect(mergeTenderFollowupNoticeReads(scope,[line,{...later,replyDueAt:null}])).rejects.toThrow('TENDER_FOLLOWUP_SOURCE_CONFLICT')
})
