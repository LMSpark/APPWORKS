import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readRegisteredTenderFollowupNotices,tenderFollowupNoticeView} from '@/views/features/application/smart-bid/followup/tender-followup-notice-reader'
import {createTenderFollowupScriptHost} from '@/views/features/application/smart-bid/followup/tender-followup-script-host'
import {tenderAddendumScenarioView} from '@/views/features/application/smart-bid/followup/tender-addendum-reader'
import {tenderChangeChapterScenarioViews} from '@/views/features/application/smart-bid/followup/tender-change-chapter-reader'
import {prepareRegisteredOperationStepRework} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-rework-reader'
import {contentOperationScenarioViews} from '@/views/features/application/smart-bid/authoring/model/operation/content-operation-scenario-views'
import {submissionObligationScenarioView} from '@/views/features/application/smart-bid/followup/submission-obligation-reader'
import {bidProjectScopeScenarioViews} from '@/views/features/application/smart-bid/collaboration/handoff/bid-project-scope-reader'
import {hashRevisionSnapshot} from '@/services/smart-bid/content/revision-snapshot-hash'
import {SNAPSHOT_HASH_CONTRACT} from '@/services/smart-bid/content/revision-snapshot-index'
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

it.each([
 ['openSubmissionObligations','frozenBaselineId'],
 ['openOriginalAttempts','revisionId'],
 ['openOutboundImpact','followupKnownAt'],
 ['openOriginalAttempts','projectId'],
 ['openOutboundImpact','lotId'],
 ['openTenderAddendum','roundId'],
])('suppresses results for a previous selection in %s',async (handler,key)=>{
 const query:Record<string,string>={projectId:'P',lotId:'L',roundId:'R',frozenBaselineId:'B',revisionId:'R',addendumId:'A',followupKnownAt:'TIME'}
 const showAlert=vi.fn(),showMessage=vi.fn(),assertCurrent=vi.fn()
 const invokeHostCommand=vi.fn(async()=>{
  query[key]='OTHER'
  return {assertCurrent}
 })
 const open=compileFunctions(script,{$route:{query},$page:{showAlert,showMessage,invokeHostCommand}} as unknown as PageContext)[handler]
 if(!open)throw Error('TEST_FOLLOWUP_HANDLER_REQUIRED')
 await open()
 expect(invokeHostCommand).toHaveBeenCalledOnce()
 expect(assertCurrent).not.toHaveBeenCalled()
 expect(showAlert).not.toHaveBeenCalled()
 expect(showMessage).not.toHaveBeenCalled()
})

it('only shows the latest original-attempt read on repeated clicks',async()=>{
 const query={revisionId:'R',addendumId:'A'}
 const showAlert=vi.fn(),showMessage=vi.fn(),assertCurrent=vi.fn()
 let rejectPrevious!: (error:Error)=>void
 const previous=new Promise((_resolve,reject)=>{rejectPrevious=reject})
 const invokeHostCommand=vi.fn().mockReturnValueOnce(previous)
  .mockResolvedValueOnce({state:'HISTORY_TRACED',basisRevisionId:'R',items:[],assertCurrent})
 const {openOriginalAttempts}=compileFunctions(script,{$route:{query},$page:{showAlert,showMessage,invokeHostCommand}} as unknown as PageContext)
 if(!openOriginalAttempts)throw Error('TEST_FOLLOWUP_HANDLER_REQUIRED')
 const first=openOriginalAttempts()
 await openOriginalAttempts()
 rejectPrevious(Error('SUPERSEDED_READ'))
 await first
 expect(assertCurrent).toHaveBeenCalledOnce()
 expect(showAlert).toHaveBeenCalledOnce()
 expect(showMessage).not.toHaveBeenCalled()
})

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
   calls:[{callRef:'USED',ownerRef:'OWNER',effect:'COMPUTE',state:'COMPLETE',inputRef:'INPUT',returnRef:'RESULT'}],
   findings:[{cause:'INPUT',callRef:'USED',evidenceRef:'ITEM',affectedRefs:['RESULT']}],priorResults:[],actualRequirementReads:[
   {lineageId:'CLAUSE',version:'V1',callRef:'USED',resultRef:'RESULT',fieldPath:'requirements.qualification'},
   {lineageId:'CLAUSE',version:'V2',callRef:'OTHER',resultRef:'RESULT',fieldPath:'requirements.qualification'},
  ],changeDispositions:[
   {addendumId:'A',changeId:'ITEM',resultRef:'RESULT',decisionRef:'DECISION',ownerRef:'OWNER',reason:'替换资格条件',decision:'REDO'},
   {addendumId:'OTHER',changeId:'ITEM',resultRef:'RESULT',decisionRef:'OTHER-DECISION',ownerRef:'OWNER',reason:'原轮次已核',decision:'REUSE'},
  ]},
 }
 const chapterViews=tenderChangeChapterScenarioViews({ContentRevision:'id',RevisionSnapshot:'id'})
 const baselineViews=bidProjectScopeScenarioViews({ContentProject:'id',ContentRevision:'id',Baseline:'id'}).Baseline
 const views={...chapterViews,Baseline:baselineViews,SubmissionObligation:{originalBaselineObligations:submissionObligationScenarioView('id')},
  GenerationRun:contentOperationScenarioViews({KnowledgeGuide:'id',ContextManifest:'id',GenerationRun:'id'}).GenerationRun}
 const contextTables=Object.fromEntries(Object.entries(rows).map(([model,record])=>[model,{
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
  let roundId='R'
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'addendum',readScope:()=> 'addendum',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,roundId,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
  })})
  const revisionViews={ContentRevision:'originalImpactRevision',RevisionSnapshot:'originalImpactSnapshot',Baseline:'previousFrozenBaseline',
   GenerationRun:'originalRequirementReads',SubmissionObligation:'originalBaselineObligations'}
  for(const model of Object.keys(rows) as Array<keyof typeof rows>){
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
  const attempts=ds.getView('GenerationRun','originalBasisAttempts')
  if(!attempts)throw Error('TEST_ATTEMPT_VIEW_REQUIRED')
  const attemptTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'GenerationRun'})
  let attemptCount=1
  let hiddenFields:string[]=[]
  attempts.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:attemptTable.identity,scope:'attempts',readScope:()=> 'attempts',snapshot:attemptTable.applyResult({Result:{primaryKeyField:'id',
    data:{Count:attemptCount,Items:[{...rows.GenerationRun,lingma_sys_params:{r:[],e:[],h:hiddenFields,m:[],d:false}}]}}}),
  })})
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
  const listed=await page.invoke('tender.followup.readOriginalAttempts',{revisionId:'ORIGINAL'},signal)
  expect(listed).toMatchObject({basisRevisionId:'ORIGINAL',items:[{runId:'RUN',attemptRef:'ATTEMPT',requestKey:'REQUEST'}]})
  const attemptQuery=attempts.queryConfig
  attempts.queryConfig={...attemptQuery,cacheType:'page'}
  await expect(page.invoke('tender.followup.readOriginalAttempts',{revisionId:'ORIGINAL'},signal))
   .rejects.toThrow('TENDER_CHANGE_ATTEMPT_SCOPE')
  attempts.queryConfig=attemptQuery
  const history=await page.invoke('tender.followup.traceOriginalAttempts',{revisionId:'ORIGINAL',addendumId:'A'},signal)
  expect(history).toMatchObject({state:'HISTORY_TRACED',items:[{attemptRef:'ATTEMPT',requestKey:'REQUEST',impacts:[{
   references:[{callRef:'USED'}],results:[{resultRef:'RESULT',disposition:{decision:'REDO'}}],
  }]}]})
  history.assertCurrent()
  expect(history).toMatchObject({items:[{operationAttempt:{projectId:'P',runId:'RUN',attemptRef:'ATTEMPT',
   requestKey:'REQUEST',targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64)}}]})
  const reworkView=ds.getView('GenerationRun','originalReworkEvidence')
  if(!reworkView)throw Error('TEST_REWORK_VIEW_REQUIRED')
  reworkView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:attemptTable.identity,scope:'rework',readScope:()=> 'rework',snapshot:attemptTable.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...rows.GenerationRun,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
  })})
  if(!('state' in history)||history.state!=='HISTORY_TRACED')throw Error('TEST_ATTEMPT_TRACE_REQUIRED')
  const operationAttempt=history.items[0]?.operationAttempt
  if(!operationAttempt)throw Error('TEST_FROZEN_IDENTITY_REQUIRED')
  const rework=await prepareRegisteredOperationStepRework({runtime,scenarioId:'S',projectId:operationAttempt.projectId,
   assertCurrent:history.assertCurrent},{...operationAttempt,reason:'按正式修改退回取材'})
  expect(rework).toMatchObject({...operationAttempt,firstCallRef:'USED',handoffs:[{destination:'03',affectedRefs:['RESULT']}]})
  hiddenFields=['configurationLockHash']
  expect(await page.invoke('tender.followup.traceOriginalAttempts',{revisionId:'ORIGINAL',addendumId:'A'},signal))
   .toMatchObject({items:[{operationAttempt:null,impacts:[{references:[{callRef:'USED'}]}]}]})
  hiddenFields=[]
  const dispositions=rows.GenerationRun.changeDispositions
  dispositions.push({...dispositions[0]!,decisionRef:'CONFLICT',decision:'REUSE'})
  expect(await page.invoke('tender.followup.traceOriginalAttempts',{revisionId:'ORIGINAL',addendumId:'A'},signal))
   .toMatchObject({state:'HISTORY_TRACED',items:[{impacts:[{results:[{resultRef:'RESULT',disposition:null,conflictingDecisionRefs:['DECISION','CONFLICT']}]}]}]})
  dispositions.pop()
  hiddenFields=['changeDispositions']
  expect(await page.invoke('tender.followup.traceOriginalAttempts',{revisionId:'ORIGINAL',addendumId:'A'},signal))
   .toMatchObject({state:'HISTORY_TRACED',items:[{attemptRef:'ATTEMPT',requestKey:'REQUEST',impacts:[{
    references:[{callRef:'USED'}],results:[{resultRef:'RESULT',disposition:null,conflictingDecisionRefs:[]}],
   }]}]})
  hiddenFields=['actualRequirementReads']
  expect(await page.invoke('tender.followup.traceOriginalAttempts',{revisionId:'ORIGINAL',addendumId:'A'},signal))
   .toMatchObject({state:'HISTORY_TRACED',items:[{attemptRef:'ATTEMPT',requestKey:'REQUEST',impacts:null}]})
  attemptCount=2
  await expect(page.invoke('tender.followup.readOriginalAttempts',{revisionId:'ORIGINAL'},signal))
   .rejects.toThrow('TENDER_CHANGE_ATTEMPT_INCOMPLETE')
  expect(()=>history.assertCurrent()).toThrow()
  const result=await page.invoke('tender.followup.readAddendum',{addendumId:'A'},signal)
  expect(view.queryContext).toMatchObject({projectId:'P',lotId:'L',roundId:'R',id:'A'})
  expect(result).toMatchObject({state:'REGISTERED',items:[{
   requirementLineageId:'CLAUSE',previous:{documentVersionId:'V1',locator:'5.2'},current:{documentVersionId:'V2',locator:'1.3'},
  }]})
  const showAlert=vi.fn(async(_message:string,_title:string)=>{}),showMessage=vi.fn()
  const impactQuery={revisionId:'ORIGINAL',previousFrozenBaselineId:'OLD',addendumId:'A',
   runId:'RUN',attemptRef:'ATTEMPT',requestKey:'REQUEST'}
  const {openChapterImpact,openCallImpact,openTenderAddendum}=compileFunctions(script,{$route:{query:impactQuery},
   $page:{invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,showMessage},
  } as unknown as PageContext)
  if(!openChapterImpact||!openCallImpact||!openTenderAddendum)throw Error('TEST_CHAPTER_IMPACT_HANDLER_REQUIRED')
  await openChapterImpact()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith([
   '正式修改 A · 原正文 ORIGINAL',
   'ITEM · REQUIREMENT · 修改依据 V2 / 1.3','原位 V1 / 5.2','已核旧版原挂接 · CHAPTER','本项的基线条款差异待核',
  ].join('\n'),'正文条款引用追查')
  const previousImpact=openChapterImpact()
  impactQuery.previousFrozenBaselineId='OTHER'
  await previousImpact
  const previousCall=openCallImpact()
  impactQuery.attemptRef='OTHER'
  await previousCall
  const previousAddendum=openTenderAddendum()
  impactQuery.addendumId='OTHER'
  await previousAddendum
  expect(showAlert).toHaveBeenCalledTimes(1)
  expect(showMessage).not.toHaveBeenCalled()
  const calls=await page.invoke('tender.followup.traceCallReferences',
   {addendumId:'A',runId:'RUN',attemptRef:'ATTEMPT',requestKey:'REQUEST'},signal)
  expect(calls).toMatchObject({state:'CALLS_TRACED',impacts:[{references:[
   {callRef:'USED',version:'V1',resultRef:'RESULT',fieldPath:'requirements.qualification'},
  ],results:[{resultRef:'RESULT',disposition:{decision:'REDO',decisionRef:'DECISION',ownerRef:'OWNER'}}]}]})
  const batches=await page.invoke('tender.followup.traceOutboundBatches',{addendumId:'A',knownAt},signal)
  expect(batches).toMatchObject({state:'BATCH_EVIDENCE',evidence:[{obligationId:'OBLIGATION',eventRef:'REC',attemptRef:'OUTBOUND'}],
   changes:[{changeId:'ITEM',obligationId:'OBLIGATION',receiptRefs:['REC'],content:{attemptRef:'OUTBOUND',state:'PENDING',
    members:[{position:'技术册',state:'PENDING'}],fields:[{assignmentId:'FORM',fieldId:'PRICE',state:'PENDING'}]}}]})
  readDeadline.mockResolvedValueOnce({...deadline,evidence:deadline.evidence.map(event=>({...event,obligationId:'ANOTHER'}))})
  expect(await page.invoke('tender.followup.traceOutboundBatches',{addendumId:'A',knownAt},signal)).toMatchObject({
   evidence:[{obligationId:'ANOTHER',eventRef:'REC'}],changes:[{changeId:'ITEM',obligationId:'OBLIGATION',receiptRefs:[],content:null}],
  })
  readDeadline.mockResolvedValueOnce({...deadline,scope:{...receiptScope,subjectId:'OTHER'}})
  await expect(page.invoke('tender.followup.traceOutboundBatches',{addendumId:'A',knownAt},signal))
   .rejects.toThrow('TENDER_FOLLOWUP_DEADLINE_SCOPE')
  roundId='OTHER'
  await expect(page.invoke('tender.followup.readAddendum',{addendumId:'A'},signal)).rejects.toThrow('ORIGINAL_REGISTRATION_VIEW_REQUIRED')
  expect(()=>result.assertCurrent()).toThrow()
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
  const signal=new AbortController().signal,showAlert=vi.fn(async(_message:string,_title:string)=>{}),showMessage=vi.fn()
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
  readDeadline.mockResolvedValueOnce({...delivery,roundId:'OTHER'})
  await openFollowupNotices()
  const unlinked=showAlert.mock.lastCall?.[0]
  expect(unlinked).toContain('原包关联证据无法核验')
  expect(unlinked).toContain('所指原包 PKG · 待配')
  expect(unlinked).not.toContain('原递交批次 SEND')
  const previous=openFollowupNotices()
  query.followupKnownAt=later.knownAt
  await previous
  expect(showAlert).toHaveBeenCalledTimes(2)
  expect(showMessage).not.toHaveBeenCalled()
  await openFollowupNotices()
  expect(showMessage).toHaveBeenCalledExactlyOnceWith('后续通知无法核验','warning')
  await expect(readRegisteredTenderFollowupNotices(host,scope,later.knownAt)).rejects.toThrow('TENDER_FOLLOWUP_SOURCE_CONFLICT')
  expect(()=>earlier.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
})
