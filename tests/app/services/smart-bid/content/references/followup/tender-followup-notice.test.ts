import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readRegisteredTenderFollowupNotices,tenderFollowupNoticeView} from '@/views/features/application/smart-bid/followup/tender-followup-notice-reader'
import {createTenderFollowupScriptHost} from '@/views/features/application/smart-bid/followup/tender-followup-script-host'
import {tenderAddendumScenarioView} from '@/views/features/application/smart-bid/followup/tender-addendum-reader'
import {tenderChangeChapterScenarioViews} from '@/views/features/application/smart-bid/followup/tender-change-chapter-reader'
import {prepareOperationStepRework} from '@/services/smart-bid/operation/rework/operation-step-rework'
import {submissionObligationScenarioView} from '@/views/features/application/smart-bid/followup/submission-obligation-reader'
import {bidProjectScopeScenarioViews} from '@/views/features/application/smart-bid/collaboration/handoff/bid-project-scope-reader'
import {hashRevisionSnapshot} from '@/services/smart-bid/content/revision-snapshot-hash'
import {SNAPSHOT_HASH_CONTRACT} from '@/services/smart-bid/content/revision-snapshot-index'
import script from '@/views/features/application/smart-bid/followup/page09/script.js?raw'
import {reconcileDeadlineDelivery} from '@/views/features/application/smart-bid/authoring/model/review/deadline/content-deadline-reconciliation'
import {pairOriginalChannelReceipt} from '@/services/smart-bid/content/review/submission/channel-receipt-pairing'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'
import {mergeTenderFollowupNoticeReads,prepareTenderFollowupNotice,projectTenderFollowupNotices} from '@/services/smart-bid/content/references/followup/tender-followup-notice'
import {checkTenderFollowupResponseScope} from '@/services/smart-bid/content/references/followup/tender-followup-response-scope'
import {linkTenderOutcomeFollowup,projectTenderOutcome} from '@/services/smart-bid/content/review/submission/tender-outcome-evidence'



it('reads the original addendum locations for the current project, lot and round',async()=>{
 const scope={projectId:'P',lotId:'L',roundId:'R',subjectId:'ORG',stageId:'FOLLOW-UP'}
 const row={projectId:'P',lotId:'L',roundId:'R',id:'A',issuerRef:'ISSUER',publicationRef:'PUBLICATION',
  applicableScopeRef:'LOT-L',effectiveAt:'2026-11-18T08:00:00+08:00',changes:[
   {id:'ITEM',kind:'REPLACED',subjectRef:'REQUIREMENT',requirementLineageId:'CLAUSE',
    previousRequirementVersion:'V1',currentRequirementVersion:'V2',deliveryObligationId:'OBLIGATION',
    previousSource:{documentVersionId:'V1',locator:'5.2'},currentSource:{documentVersionId:'V2',locator:'1.3'}},
  ]}
 const manifest={hashContract:SNAPSHOT_HASH_CONTRACT,projectId:'P',stageRef:'STAGE',baselineId:'OLD',
  nodes:[{nodeId:'CHAPTER',nodeHash:'a'.repeat(64)}],requirementPins:[{chapterId:'CHAPTER',lineageId:'CLAUSE',version:'V1'}],
  templateRefs:[],responseAssignments:[],responses:[],qualificationReviews:[],sensitiveRefs:[]}
 const snapshotHash=await hashRevisionSnapshot(manifest)
 const rows={
  ContentRevision:{projectId:'P',id:'ORIGINAL',status:'ADOPTED',stageRef:'STAGE',baselineId:'OLD',templateRefs:[],snapshotHash},
  RevisionSnapshot:{projectId:'P',id:'S1',snapshotHash,manifest},
  Baseline:{projectId:'P',id:'OLD',stageRef:'STAGE',factVersions:[],requirementVersions:[{lineageId:'CLAUSE',version:'V1'}],tenderRecords:[]},
  SubmissionObligation:{projectId:'P',id:'O',baselineId:'OLD',obligationRef:'O',sourceRef:'FORM-V1',
   kind:'INDEPENDENT',required:true,allowedDisclosureRefs:['PUBLIC']},
  GenerationRun:{projectId:'P',id:'CALLS',basisRevisionId:'ORIGINAL',runId:'RUN',attemptRef:'ATTEMPT',requestKey:'REQUEST',
   targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64),inputRef:'INPUT',returnRef:'RESULT',
   calls:[{callRef:'USED',ownerRef:'OWNER',effect:'COMPUTE' as const,state:'COMPLETE' as const,inputRef:'INPUT',returnRef:'RESULT'}],
   findings:[{cause:'INPUT' as const,callRef:'USED',evidenceRef:'ITEM',affectedRefs:['RESULT']}],priorResults:[],actualRequirementReads:[
   {lineageId:'CLAUSE',version:'V1',callRef:'USED',resultRef:'RESULT',fieldPath:'requirements.qualification'},
   {lineageId:'CLAUSE',version:'V2',callRef:'OTHER',resultRef:'RESULT',fieldPath:'requirements.qualification'},
  ],changeDispositions:[
   {addendumId:'A',changeId:'ITEM',resultRef:'RESULT',decisionRef:'DECISION',ownerRef:'OWNER',reason:'替换资格条件',decision:'REDO'},
   {addendumId:'OTHER',changeId:'ITEM',resultRef:'RESULT',decisionRef:'OTHER-DECISION',ownerRef:'OWNER',reason:'原轮次已核',decision:'REUSE'},
  ]},
 }
 const chapterViews=tenderChangeChapterScenarioViews({ContentRevision:'id',RevisionSnapshot:'id'})
 const baselineViews=bidProjectScopeScenarioViews({ContentProject:'id',ContentRevision:'id',Baseline:'id'}).Baseline
 const views={...chapterViews,Baseline:baselineViews,SubmissionObligation:{originalBaselineObligations:submissionObligationScenarioView('id')}}
 const contextTables=Object.fromEntries(Object.entries(rows).filter(([model])=>model!=='GenerationRun').map(([model,record])=>[model,{
  modelBinding:{modelName:model,modelId:model},columns:Object.keys(record).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...views[model as keyof typeof views]},
 }]))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{...contextTables,TenderAddendum:{
  modelBinding:{modelName:'TenderAddendum',modelId:'M'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalTenderAddendum:tenderAddendumScenarioView('id')},
 }}})
 try{
  const view=ds.getView('TenderAddendum','originalTenderAddendum')
  if(!view)throw Error('TEST_ADDENDUM_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'TenderAddendum'})
  const roundId='R'
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'addendum',readScope:()=> 'addendum',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,roundId,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
  })})
  const revisionViews={ContentRevision:'originalImpactRevision',RevisionSnapshot:'originalImpactSnapshot',Baseline:'previousFrozenBaseline',
   SubmissionObligation:'originalBaselineObligations'}
  for(const model of Object.keys(revisionViews) as Array<keyof typeof revisionViews>){
   const source=ds.getView(model,revisionViews[model])
   if(!source)throw Error('TEST_REFERENCE_VIEW_REQUIRED')
   const queryTable=new DataSpaceQueryTable({scenarioId:'S',metaName:model})
   source.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
    identity:queryTable.identity,scope:model,readScope:()=>model,snapshot:queryTable.applyResult({Result:{primaryKeyField:'id',
     data:{Count:1,Items:[{...rows[model],lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
   })})
  }
  const runtime={generation:1,isLoaded:true,destroyed:false,resolveView:(key:string)=>{
   const [scenario,model,name]=key.split('@')
   return scenario==='S'&&model&&name?ds.getView(model,name):undefined
  }}
  const receiptScope={projectId:'P',lotId:'L',subjectId:'ORG',channelId:'PORTAL'}
  const receiptIdentity={...receiptScope,operationRef:'SEND',objectRef:'PKG'}
  const knownAt=row.effectiveAt
  const received=pairOriginalChannelReceipt(receiptScope,[{...receiptIdentity,eventRef:'REC',sourceRef:'PORTAL',
   kind:'RECEIVED',eventAt:knownAt,knownAt}],[{...receiptIdentity,attemptRef:'OUTBOUND'}])
  const assertCurrent=()=>{}
  const deadline=reconcileDeadlineDelivery({roundId:'R',cutoffAt:knownAt,knownAt,obligationIds:['OBLIGATION']},
   {scope:receiptScope,receipts:[received],decisions:[{eventRef:'REC',obligationId:'OBLIGATION',attemptRef:'OUTBOUND',
    kind:'RECEIVED',knownAt,effectiveAt:knownAt,ruleRef:'RULE',assertCurrent}],assertCurrent},
   {contents:{projectId:'P',requiredMembers:[{obligationId:'OBLIGATION',position:'技术册'}],links:[],
    requiredFields:[{obligationId:'OBLIGATION',assignmentId:'FORM',fieldId:'PRICE'}],assertCurrent},proofs:{packages:[],batches:[]}})
  const readDeadline=vi.fn(async()=>deadline)
  const page=createTenderFollowupScriptHost(runtime,{scenarioId:'S',projectId:'P',assertCurrent},{selection:scope,readDeadline})
  const signal=new AbortController().signal
  const obligations=await page.invoke('tender.followup.readBaselineObligations',{baselineId:'OLD'},signal)
  expect(obligations).toMatchObject({baselineId:'OLD',obligations:[{obligationRef:'O',sourceRef:'FORM-V1',kind:'INDEPENDENT'}]})
  await expect(page.invoke('tender.followup.readBaselineObligations',{baselineId:'OTHER'},signal))
   .rejects.toThrow('BID_SUBMISSION_OBLIGATION_SCOPE')
  const attempts=[{...rows.GenerationRun}]
  const listed=await page.invoke('tender.followup.readOriginalAttempts',{revisionId:'ORIGINAL',attempts},signal)
  expect(listed).toMatchObject({basisRevisionId:'ORIGINAL',items:[{runId:'RUN',attemptRef:'ATTEMPT',requestKey:'REQUEST'}]})
  await expect(page.invoke('tender.followup.readOriginalAttempts',{revisionId:'ORIGINAL',attempts:[...attempts,...attempts]},signal))
   .rejects.toThrow('TENDER_CHANGE_ATTEMPT_SCOPE')
  const history=await page.invoke('tender.followup.traceOriginalAttempts',{revisionId:'ORIGINAL',addendumId:'A',attempts},signal)
  expect(history).toMatchObject({state:'HISTORY_TRACED',items:[{attemptRef:'ATTEMPT',requestKey:'REQUEST',impacts:[{
   references:[{callRef:'USED'}],results:[{resultRef:'RESULT',disposition:{decision:'REDO'}}],
  }]}]})
  history.assertCurrent()
  expect(history).toMatchObject({items:[{operationAttempt:{projectId:'P',runId:'RUN',attemptRef:'ATTEMPT',
   requestKey:'REQUEST',targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64)}}]})
  if(!('state' in history)||history.state!=='HISTORY_TRACED')throw Error('TEST_ATTEMPT_TRACE_REQUIRED')
  const operationAttempt=history.items[0]?.operationAttempt
  if(!operationAttempt)throw Error('TEST_FROZEN_IDENTITY_REQUIRED')
  const rework=prepareOperationStepRework({...operationAttempt,reason:'按正式修改退回取材',
   inputRef:rows.GenerationRun.inputRef,returnRef:rows.GenerationRun.returnRef,
   calls:rows.GenerationRun.calls.map(call=>({...call,assertCurrent:history.assertCurrent})),
   findings:rows.GenerationRun.findings.map(finding=>({...finding,assertCurrent:history.assertCurrent})),
   priorResults:[],assertCurrent:history.assertCurrent})
  expect(rework).toMatchObject({projectId:'P',runId:'RUN',attemptRef:'ATTEMPT',
   firstCallRef:'USED',handoffs:[{destination:'03',affectedRefs:['RESULT']}]})
  const missingFrozen={...rows.GenerationRun,configurationLockHash:undefined}
  expect(await page.invoke('tender.followup.traceOriginalAttempts',{revisionId:'ORIGINAL',addendumId:'A',attempts:[missingFrozen]},signal))
   .toMatchObject({items:[{operationAttempt:null,impacts:[{references:[{callRef:'USED'}]}]}]})
  const dispositions=rows.GenerationRun.changeDispositions
  dispositions.push({...dispositions[0]!,decisionRef:'CONFLICT',decision:'REUSE'})
  expect(await page.invoke('tender.followup.traceOriginalAttempts',{revisionId:'ORIGINAL',addendumId:'A',attempts:[rows.GenerationRun]},signal))
   .toMatchObject({state:'HISTORY_TRACED',items:[{impacts:[{results:[{resultRef:'RESULT',disposition:null,conflictingDecisionRefs:['DECISION','CONFLICT']}]}]}]})
  dispositions.pop()
  const withoutDispositions={...rows.GenerationRun,changeDispositions:undefined}
  expect(await page.invoke('tender.followup.traceOriginalAttempts',{revisionId:'ORIGINAL',addendumId:'A',attempts:[withoutDispositions]},signal))
   .toMatchObject({state:'HISTORY_TRACED',items:[{attemptRef:'ATTEMPT',requestKey:'REQUEST',impacts:[{
    references:[{callRef:'USED'}],results:[{resultRef:'RESULT',disposition:null,conflictingDecisionRefs:[]}],
   }]}]})
  const withoutReads={...rows.GenerationRun,actualRequirementReads:undefined}
  expect(await page.invoke('tender.followup.traceOriginalAttempts',{revisionId:'ORIGINAL',addendumId:'A',attempts:[withoutReads]},signal))
   .toMatchObject({state:'HISTORY_TRACED',items:[{attemptRef:'ATTEMPT',requestKey:'REQUEST',impacts:null}]})
  await expect(page.invoke('tender.followup.readOriginalAttempts',{revisionId:'ORIGINAL',attempts:[{},rows.GenerationRun]},signal))
   .rejects.toThrow('TENDER_CHANGE_ATTEMPT_SCOPE')
  const result=await page.invoke('tender.followup.readAddendum',{addendumId:'A'},signal)
  expect(view.queryContext).toMatchObject({projectId:'P',lotId:'L',roundId:'R',id:'A'})
  expect(result).toMatchObject({state:'REGISTERED',items:[{
   requirementLineageId:'CLAUSE',previous:{documentVersionId:'V1',locator:'5.2'},current:{documentVersionId:'V2',locator:'1.3'},
  }]})
  const impactQuery={revisionId:'ORIGINAL',previousFrozenBaselineId:'OLD',addendumId:'A',
   runId:'RUN',attemptRef:'ATTEMPT',requestKey:'REQUEST'}
  expect(impactQuery.addendumId).toBe('A')
}finally{ds.destroy()}
})

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
  const signal=new AbortController().signal
  const query={followupKnownAt:line.knownAt}
  expect(query.followupKnownAt).toBe(line.knownAt)
}finally{ds.destroy()}
})
