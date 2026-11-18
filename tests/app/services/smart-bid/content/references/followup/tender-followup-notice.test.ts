import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readRegisteredTenderFollowupNotices,tenderFollowupNoticeView} from '@/views/features/application/smart-bid/followup/tender-followup-notice-reader'
import {createTenderFollowupScriptHost} from '@/views/features/application/smart-bid/followup/tender-followup-script-host'
import script from '@/views/features/application/smart-bid/followup/page09/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {reconcileDeadlineDelivery} from '@/views/features/application/smart-bid/authoring/model/review/deadline/content-deadline-reconciliation'
import {pairOriginalChannelReceipt} from '@/services/smart-bid/content/review/submission/channel-receipt-pairing'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
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
 const {assertCurrent,...record}=line
 const row={...record,id:'1',originalObjectRef:'PKG'}
 const future={...row,id:'2',knownAt:later.knownAt,sourceRef:later.sourceRef,documentVersionId:'OTHER'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{TenderFollowup:{
  modelBinding:{modelName:'TenderFollowup',modelId:'M'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},officialNotices:tenderFollowupNoticeView('id')},
 }}})
 try{
  const view=ds.getView('TenderFollowup','officialNotices')
  if(!view)throw Error('TEST_FOLLOWUP_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'TenderFollowup'})
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'notices',readScope:()=> 'notices',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:2,Items:[row,future].map(item=>({...item,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}))}}}),
  })})
  const host={scenarioId:'S',projectId:'P',runtime:{resolveView:(key:string)=>key==='S@TenderFollowup@officialNotices'?view:undefined},assertCurrent}
  const earlier=await readRegisteredTenderFollowupNotices(host,scope,line.knownAt)
  expect(earlier.items).toMatchObject([{event:{noticeId:'NOTICE',replyDueAt:line.replyDueAt},origins:[{sourceRef:line.sourceRef}]}])
  expect(view.queryContext).toMatchObject(scope)
  const receiptScope={projectId:'P',lotId:'L',subjectId:'ORG',channelId:'PORTAL'}
  const receiptIdentity={...receiptScope,operationRef:'OP',objectRef:'PKG'}
  const receipt=pairOriginalChannelReceipt(receiptScope,[{...receiptIdentity,eventRef:'REC',sourceRef:'PORTAL',kind:'RECEIVED',
   eventAt:line.knownAt,knownAt:line.knownAt}],[{...receiptIdentity,attemptRef:'SEND'}])
  const packageHash='a'.repeat(64)
  const delivery=reconcileDeadlineDelivery({roundId:'R',cutoffAt:line.knownAt,knownAt:line.knownAt,obligationIds:['O']},
   {scope:receiptScope,receipts:[receipt],decisions:[{eventRef:'REC',obligationId:'O',attemptRef:'SEND',kind:'RECEIVED',
    knownAt:line.knownAt,effectiveAt:line.knownAt,ruleRef:'RULE',assertCurrent}],assertCurrent},
   {contents:{projectId:'P',requiredMembers:[{obligationId:'O',position:'册'}],links:[
    {obligationId:'O',position:'册',attemptRef:'SEND',packageId:'PKG',packageHash,assertCurrent}],requiredFields:[],assertCurrent},
   proofs:{packages:[{projectId:'P',packageId:'PKG',packageHash,membershipMatches:false,members:[],assertCurrent}],batches:[]}})
  const readDeadline=vi.fn(async()=>delivery)
  const page=createTenderFollowupScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{selection:scope,readDeadline})
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
  const query={followupKnownAt:line.knownAt}
  const {openFollowupNotices}=compileFunctions(script,{$route:{query},$page:{
   invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,showMessage,
  }} as unknown as PageContext)
  if(!openFollowupNotices)throw Error('TEST_FOLLOWUP_PAGE_HANDLER_REQUIRED')
  await expect(page.invoke('tender.followup.readNotices',{knownAt:line.knownAt,subjectId:'OTHER'},signal))
   .rejects.toThrow('TENDER_FOLLOWUP_PAGE_REQUEST')
  await openFollowupNotices()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith([
   `标段 L · 轮次 R · 证据截至 ${line.knownAt}`,'NOTICE · 报价邀请 · 有效来件 · 原件 DOC-V1',
   `  答复截止 ${line.replyDueAt} · 允许范围待取证`,'  原包 PKG · 原递交批次 SEND','  出具方 ISSUER · 来源 INBOX',
  ].join('\n'),'后续通知')
  expect(readDeadline).toHaveBeenCalledExactlyOnceWith({...scope,knownAt:line.knownAt},signal)
  query.followupKnownAt=later.knownAt
  await openFollowupNotices()
  expect(showMessage).toHaveBeenCalledExactlyOnceWith('后续通知无法核验','warning')
  await expect(readRegisteredTenderFollowupNotices(host,scope,later.knownAt)).rejects.toThrow('TENDER_FOLLOWUP_SOURCE_CONFLICT')
  expect(()=>earlier.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
})
