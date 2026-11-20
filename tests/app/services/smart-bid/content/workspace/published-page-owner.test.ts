import {expect,it,vi} from 'vitest'
import {createContentReviewScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-script-host'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import {createBidFindingsScriptHost} from '@/views/features/application/smart-bid/collaboration/tasks/bid-findings-script-host'
import {createBidHandoffScriptHost} from '@/views/features/application/smart-bid/collaboration/handoff/bid-handoff-script-host'
import {createTenderFollowupScriptHost} from '@/views/features/application/smart-bid/followup/tender-followup-script-host'
import {createBidResponseScriptHost} from '@/views/features/application/smart-bid/response/ui/entry/response-script-host'

const runtime={resolveView:()=>undefined,generation:1,isLoaded:true,destroyed:false}
const signal=new AbortController().signal
const scope={scenarioId:'SPACE',projectId:'PROJECT',assertCurrent:()=>{}}
const stale=()=>{throw Error('PUBLISHED_SOURCE_OWNER_STALE')}

it('blocks page 08 when its handoff source owner is stale',async()=>{
 const readReceipts=vi.fn(async()=>{throw Error('UNEXPECTED_READ')})
 const host=createBidHandoffScriptHost(runtime,{...scope},{selection:{
  lotId:'LOT',roundId:'ROUND',stageId:'STAGE',
 },readReceipts,assertCurrent:stale})
 await expect(host.invoke('bid.project.readScope',{},signal)).rejects.toThrow('PUBLISHED_SOURCE_OWNER_STALE')
 expect(readReceipts).not.toHaveBeenCalled()
})

it('blocks page 09 before querying a stale followup owner',async()=>{
 const host=createTenderFollowupScriptHost(runtime,scope,{selection:{
  lotId:'LOT',roundId:'ROUND',stageId:'STAGE',subjectId:'SUBJECT',
 },assertCurrent:stale})
 await expect(host.invoke('tender.followup.readNotices',{knownAt:'2026-01-01T00:00:00Z'},signal))
  .rejects.toThrow('PUBLISHED_SOURCE_OWNER_STALE')
})

it('blocks page 10 before consulting stale response sources',async()=>{
 const readPriceEvidence=vi.fn(async()=>{throw Error('UNEXPECTED_READ')})
 const host=createBidResponseScriptHost(runtime,{
  ...scope,scopeRef:'SCOPE',purposeRef:'PURPOSE',rateOnly:false,asOf:1,
 },{assertCurrent:stale,readPriceEvidence,readSecurityReceipts:async()=>[]})
 await expect(host.invoke('bid.response.readApprovedPrice',{approvalRef:'APPROVAL',version:'1'},signal))
  .rejects.toThrow('PUBLISHED_SOURCE_OWNER_STALE')
 expect(readPriceEvidence).not.toHaveBeenCalled()
})

it('blocks page 12 before reading a stale review selection owner',async()=>{
 const readSelection=vi.fn(async()=>{throw Error('UNEXPECTED_READ')})
 const host=createContentReviewScriptHost(runtime,scope,{
  assertCurrent:stale,readSelection,
  openFile:async()=>{throw Error('UNEXPECTED_OPEN')},
  readField:async()=>{throw Error('UNEXPECTED_FIELD')},
  readDecision:async()=>{throw Error('UNEXPECTED_DECISION')},
  readCompleted:async()=>{throw Error('UNEXPECTED_COMPLETED')},
 })
 await expect(host.invoke('content.review.readCoverage',{selectionRef:'SELECTION'},signal))
  .rejects.toThrow('PUBLISHED_SOURCE_OWNER_STALE')
 expect(readSelection).not.toHaveBeenCalled()
})

it('blocks pages 13 and 14 before using stale submission owners',async()=>{
 const host=createContentSubmissionScriptHost(runtime,scope,{assertCurrent:stale})
 await expect(host.invoke('content.submission.readOriginal',{
  attemptRef:'ATTEMPT',requestKey:'REQUEST',requestDigest:'a'.repeat(64),
 },signal)).rejects.toThrow('PUBLISHED_SOURCE_OWNER_STALE')
 await expect(host.invoke('content.submission.readReceipt',{receiptRef:'RECEIPT'},signal))
  .rejects.toThrow('PUBLISHED_SOURCE_OWNER_STALE')
})

it('blocks page 15 before reading from a stale task owner',async()=>{
 const readCoverage=vi.fn(async()=>{throw Error('UNEXPECTED_READ')})
 const host=createBidFindingsScriptHost(runtime,scope,{assertCurrent:stale,readCoverage})
 await expect(host.invoke('bid.tasks.readFindings',{},signal)).rejects.toThrow('PUBLISHED_SOURCE_OWNER_STALE')
 expect(readCoverage).not.toHaveBeenCalled()
})
