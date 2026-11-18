import {expect,it} from 'vitest'
import {mergeTenderFollowupNoticeReads,prepareTenderFollowupNotice,projectTenderFollowupNotices} from '@/services/smart-bid/content/references/followup/tender-followup-notice'
import {checkTenderFollowupResponseScope} from '@/services/smart-bid/content/references/followup/tender-followup-response-scope'
import {linkTenderOutcomeFollowup,projectTenderOutcome} from '@/services/smart-bid/content/review/submission/tender-outcome-evidence'

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
 const corrected=await mergeTenderFollowupNoticeReads(scope,[{...later,noticeId:'NEW',documentVersionId:'DOC-V2',
  change:'CORRECTION',previousNoticeRef:'NOTICE',permittedScopeRef:'SCOPE-2',replyDueAt:'2026-11-18T14:00:00+08:00'}])
 const timeline={notices:[same,corrected],assertCurrent:line.assertCurrent}
 expect(projectTenderFollowupNotices(scope,{...timeline,knownAt:line.knownAt}).items).toMatchObject([{state:'ACTIVE'}])
 expect(projectTenderFollowupNotices(scope,{...timeline,knownAt:later.knownAt}).items).toMatchObject([
  {state:'SUPERSEDED',event:{noticeId:'NOTICE'}},{state:'ACTIVE',event:{noticeId:'NEW',replyDueAt:'2026-11-18T14:00:00+08:00'}},
 ])
 const actual=projectTenderFollowupNotices(scope,{...timeline,knownAt:later.knownAt})
 const request={noticeId:'NEW',action:'EXPLAIN' as const,targetRefs:['CLAUSE']}
 const proof={noticeId:'NEW',eventDigest:corrected.eventDigest,permittedScopeRef:'SCOPE-2',ruleRef:'RULE',
  allowed:[{action:'EXPLAIN' as const,targetRefs:['CLAUSE']}],assertCurrent:line.assertCurrent}
 expect(checkTenderFollowupResponseScope(actual,request,proof).state).toBe('ALLOWED')
 expect(checkTenderFollowupResponseScope(actual,{...request,action:'REPRICE'},proof).state).toBe('OUTSIDE_SCOPE')
 expect(checkTenderFollowupResponseScope(actual,{...request,noticeId:'NOTICE'},proof).state).toBe('NOTICE_REQUIRED')
 expect(()=>checkTenderFollowupResponseScope(actual,request,{...proof,eventDigest:same.eventDigest}))
  .toThrow('TENDER_FOLLOWUP_RESPONSE_SCOPE')
 const outcome=projectTenderOutcome(scope,{knownAt:later.knownAt,officialEvents:[{...scope,eventRef:'RESULT',
  issuerRef:'ISSUER',documentVersionId:'OUTCOME-V1',eventAt:later.knownAt,knownAt:later.knownAt,
  supersedesRef:null,kind:'AWARDED',assertCurrent:line.assertCurrent}],assertCurrent:line.assertCurrent})
 const link={outcomeEventRef:'RESULT',noticeId:'NOTICE',noticeDigest:same.eventDigest,linkRef:'FORMAL-LINK',assertCurrent:line.assertCurrent}
 expect(linkTenderOutcomeFollowup(outcome,actual,link)).toMatchObject({state:'LINKED',noticeVersionId:'DOC-V1'})
 expect(linkTenderOutcomeFollowup(outcome,actual,{...link,noticeId:'UNSEEN'}).state).toBe('PENDING_LINK')
 expect(()=>linkTenderOutcomeFollowup(outcome,actual,{...link,noticeDigest:corrected.eventDigest})).toThrow('TENDER_OUTCOME_FOLLOWUP_SCOPE')
})
