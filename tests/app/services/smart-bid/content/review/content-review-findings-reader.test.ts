import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readContentReviewFindings,readFindingsForCompletedCoverage} from '@/views/features/application/smart-bid/authoring/model/review/content-review-findings-reader'
import {readContentReviewCoverageFromFindings} from '@/views/features/application/smart-bid/authoring/model/review/content-review-coverage-reader'
import {createBidFindingsScriptHost} from '@/views/features/application/smart-bid/collaboration/tasks/bid-findings-script-host'
import script from '@/views/features/application/smart-bid/collaboration/tasks/page15/script.js?raw'
import {prepareReviewFindingRecheck} from '@/services/smart-bid/content/review/finding/review-finding-recheck'
import {prepareReviewFindingRegistration} from '@/services/smart-bid/content/review/finding/review-finding-registration'
import {bidFindingsScenarioViews} from '@/views/features/application/smart-bid/collaboration/tasks/bid-findings-scenario-views'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('accepts complete zero findings and rejects findings from a different checker version',async()=>{
 const selection={targetHash:'a'.repeat(64),checkerHash:'b'.repeat(64)}
 const row={id:'F',projectId:'P',...selection,anchor:{nodeId:'N'},code:'V8',severity:'BLOCK',status:'OPEN',message:'缺证'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{CheckFinding:{
  modelBinding:{modelId:'M',modelName:'CheckFinding'},
  columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedReviewFindings:bidFindingsScenarioViews('id').selectedReviewFindings},
 }}})
 const view=ds.getView('CheckFinding','selectedReviewFindings')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'CheckFinding'})
 let rows:Array<typeof row>=[]
 const executeQuery=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',
  snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:rows.length,Items:rows.map(item=>({
   ...item,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false},
  }))}}})}))
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 view.bindQueryExecutor({save,executeQuery})
 const host={runtime:{resolveView:()=>view},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  const result=await readContentReviewFindings(host,[selection])
  expect(result.records).toEqual([])
  expect(view.filterExpression).toMatchObject({logic:'or',filters:[{logic:'and',filters:[
   {field:'targetHash',operator:'eq',value:selection.targetHash},{field:'checkerHash',operator:'eq',value:selection.checkerHash},
  ]}]})
  rows=[row]
  expect((await readContentReviewFindings(host,[selection])).records[0]).toMatchObject({id:'F',severity:'BLOCK'})
  let coverageCurrent=true
  const coverage={projectId:'P',revisionId:'R',completed:[{...selection,kind:'FILE' as const,targetId:'D',
   effectiveHash:'d'.repeat(64),versionHash:'e'.repeat(64),checkRef:'CHECK',checkedUses:[]}],
  assertCurrent:()=>{if(!coverageCurrent)throw Error('COVERAGE_STALE')},
  resolveAnchor:(anchor:unknown)=>{expect(anchor).toEqual({nodeId:'N'});return {kind:'FILE' as const,targetId:'D'}}}
  const combined=await readFindingsForCompletedCoverage(host,coverage)
  expect(combined.findings).toEqual([{id:'F',kind:'FILE',targetId:'D',effectiveHash:'d'.repeat(64),status:'OPEN',severity:'BLOCK'}])
  coverageCurrent=false
  expect(()=>combined.assertCurrent()).toThrow('COVERAGE_STALE')
  coverageCurrent=true
  const target={kind:'FILE' as const,targetId:'D',effectiveHash:'d'.repeat(64),versionHash:'e'.repeat(64),requiredUseIds:[]}
  const request={projectId:'P',revisionId:'R',targets:[target],assertCurrent:()=>{}}
  const review=await readContentReviewCoverageFromFindings(host,request,{approvals:[],readCompleted:async()=>coverage})
  expect(review.items[0]?.state).toBe('BLOCKED')
  const page=createBidFindingsScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{readCoverage:async()=>coverage})
  expect(page.runtime.resolveView).toBe(host.runtime.resolveView)
 }finally{ds.destroy()}
})

it('registers one issue identity across matching observations and requires positive proof for coverage alone',async()=>{
 const target={kind:'FILE' as const,targetId:'DOC',versionRef:'V1',effectiveHash:'a'.repeat(64)}
 const request={projectId:'P',requestKey:'Q',target}
 const assertCurrent=()=>{}
 const finding={findingId:'F',positionRef:'PAGE-3',code:'MISMATCH',severity:'BLOCK' as const,remediatorId:null}
 const observation={projectId:'P',target,positionRef:'PAGE-3',code:'MISMATCH',evidenceRef:'SOURCE-2',assertCurrent}
 const earlier={...observation,evidenceRef:'SOURCE-1'}
 const source={projectId:'P',target,checkRef:'CHECK',ruleRef:'RULE-V1',authorityRef:'AUTH',reviewerId:'REVIEWER',
  checkedAt:'2026-11-18T10:00:00+08:00',finding,observations:[observation,earlier],assertCurrent}
 const prepared=await prepareReviewFindingRegistration(request,source)
 expect(prepared.record).toMatchObject({finding,evidenceRefs:['SOURCE-1','SOURCE-2']})
 expect((await prepareReviewFindingRegistration(request,{...source,observations:[earlier,observation]})).requestDigest)
  .toBe(prepared.requestDigest)
 await expect(prepareReviewFindingRegistration(request,{...source,observations:[{...observation,positionRef:'OTHER'}]}))
  .rejects.toThrow('REVIEW_FINDING_REGISTRATION_SCOPE')
 await expect(prepareReviewFindingRegistration(request,{...source,observations:[]})).rejects.toThrow('REVIEW_FINDING_REGISTRATION_SCOPE')
 const coverage={...source,finding:null,observations:[]}
 const covered=await prepareReviewFindingRegistration(request,coverage)
 expect(covered.record).toMatchObject({checkRef:'CHECK',finding:null})
 await expect(prepareReviewFindingRegistration(request,{...coverage,checkRef:''})).rejects.toThrow('REVIEW_FINDING_REGISTRATION_SCOPE')
 const checkRow={id:'CHECK',projectId:'P',checkRef:'CHECK',state:'COMPLETED',targetKind:target.kind,targetId:target.targetId,
  targetVersionRef:target.versionRef,effectiveHash:target.effectiveHash,ruleRef:source.ruleRef,authorityRef:source.authorityRef,
  reviewerId:source.reviewerId,checkedAt:source.checkedAt}
 const saved=false
 const resultRow={id:'RESULT',projectId:'P',checkRef:'CHECK',requestKey:'Q',requestDigest:covered.requestDigest,
  findingId:null}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{CheckFinding:{
  modelBinding:{modelName:'CheckFinding',modelId:'CHECK-M'},columns:Object.keys({...checkRow,...resultRow}).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...bidFindingsScenarioViews('id')},
 }}})
 try{
 const view=ds.getView('CheckFinding','originalCompletedCheck')
 if(!view)throw Error('TEST_COMPLETED_CHECK_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'CheckFinding'})
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'coverage',readScope:()=> 'coverage',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...checkRow,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const registration=ds.getView('CheckFinding','originalFindingRegistration')
 if(!registration)throw Error('TEST_FINDING_REGISTRATION_VIEW_REQUIRED')
 const resultTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'CheckFinding'})
 registration.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:resultTable.identity,scope:'registration',readScope:()=> 'registration',
  snapshot:resultTable.applyResult({Result:{primaryKeyField:'id',data:{Count:saved?1:0,
   Items:saved?[{...resultRow,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]:[]}}}),
 })})
 const runtime={resolveView:(key:string)=>key==='S@CheckFinding@originalCompletedCheck'?view:
  key==='S@CheckFinding@originalFindingRegistration'?registration:undefined,generation:1,isLoaded:true,destroyed:false}
 const hasFinding=true
 const readRegistration=vi.fn(async()=>hasFinding?{finding,observations:source.observations,assertCurrent}:
  {finding:null,observations:[],assertCurrent})
 const submitAction=vi.fn(async()=>({receiptRef:'REGISTERED'}))
 const page=createBidFindingsScriptHost(runtime,{projectId:'P',scenarioId:'S',assertCurrent},{
  readCoverage:async()=>{throw Error('UNEXPECTED_COVERAGE')},readRegistration,submitAction,
 })
 const submitted=await page.invoke('bid.tasks.registerFinding',{checkRef:'CHECK',requestKey:'Q'},new AbortController().signal)
 expect(submitted).toMatchObject({state:'SUBMITTED',receipt:{receiptRef:'REGISTERED'}})
 expect(submitAction).toHaveBeenCalledWith(expect.objectContaining({operationId:'43',requestKey:'Q'}))
 readRegistration.mockClear()
 const query:{findingCheckRef:string;findingRegistrationKey:string;findingRegistrationDigest?:string}={findingCheckRef:'CHECK',findingRegistrationKey:'Q'}
 expect(query.findingRegistrationKey).toBe('Q')
 }finally{ds.destroy()}
})

it('prepares recheck only for the expected finding version and matching target evidence',async()=>{
 const scope={projectId:'P',findingId:'F'}
 const original={kind:'FILE' as const,targetId:'DOC',versionRef:'V1',effectiveHash:'a'.repeat(64)}
 const changed={...original,versionRef:'V2',effectiveHash:'b'.repeat(64)}
 const request={...scope,expectedFindingVersion:'F1',requestKey:'Q'}
 const current=true
 const assertCurrent=()=>{if(!current)throw Error('EVIDENCE_STALE')}
 const finding={...scope,versionRef:'F1',target:original,remediatorId:'AUTHOR',assertCurrent}
 const evidence={...scope,findingVersionRef:'F1',target:changed,evidenceRef:'RESOURCE-V2',assertCurrent}
 const decision={...scope,findingVersionRef:'F1',target:changed,reviewerId:'REVIEWER',authorityRef:'AUTH',
  ruleRef:'RULE-V1',outcome:'CORRECTED' as const,waiverRef:null,independenceRequired:true,assertCurrent}
 const source={finding,evidence,decision}
 const prepared=await prepareReviewFindingRecheck(request,source)
 expect(prepared.record).toMatchObject({originalTarget:original,checkedTarget:changed,outcome:'CORRECTED',expectedFindingVersion:'F1'})
 expect((await prepareReviewFindingRecheck(request,source)).requestDigest).toBe(prepared.requestDigest)
 await expect(prepareReviewFindingRecheck({...request,expectedFindingVersion:'F2'},source)).rejects.toThrow('REVIEW_FINDING_RECHECK_SCOPE')
 await expect(prepareReviewFindingRecheck(request,{...source,evidence:{...evidence,target:original}}))
  .rejects.toThrow('REVIEW_FINDING_RECHECK_TARGET')
 await expect(prepareReviewFindingRecheck(request,{...source,decision:{...decision,reviewerId:'AUTHOR'}}))
  .rejects.toThrow('REVIEW_FINDING_RECHECK_DECISION')
 await expect(prepareReviewFindingRecheck(request,{...source,decision:{...decision,outcome:'WAIVED'}}))
  .rejects.toThrow('REVIEW_FINDING_RECHECK_DECISION')
 const row={id:'F1',...scope,versionRef:'F1',targetKind:original.kind,targetId:original.targetId,
  targetVersionRef:original.versionRef,effectiveHash:original.effectiveHash,remediatorId:'AUTHOR'}
 const registered=false
 const resultRow={...request,id:'RECHECK',requestDigest:prepared.requestDigest,outcome:'CORRECTED',evidenceRef:'RESOURCE-V2'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{CheckFinding:{
  modelBinding:{modelName:'CheckFinding',modelId:'M'},columns:Object.keys({...row,...resultRow}).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...bidFindingsScenarioViews('id')},
 }}})
 try{
 const view=ds.getView('CheckFinding','originalRecheckFinding')
 if(!view)throw Error('TEST_ORIGINAL_FINDING_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'CheckFinding'})
 const hidden=false
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'recheck',readScope:()=> 'recheck',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:hidden?['targetVersionRef']:[],m:[],d:false}}]}}}),
 })})
 const resultView=ds.getView('CheckFinding','originalRecheckResult')
 if(!resultView)throw Error('TEST_RECHECK_RESULT_VIEW_REQUIRED')
 const resultTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'CheckFinding'})
 resultView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:resultTable.identity,scope:'result',readScope:()=> 'result',
  snapshot:resultTable.applyResult({Result:{primaryKeyField:'id',data:{Count:registered?1:0,
   Items:registered?[{...resultRow,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]:[]}}}),
 })})
 const runtime={resolveView:(key:string)=>key==='S@CheckFinding@originalRecheckFinding'?view:
  key==='S@CheckFinding@originalRecheckResult'?resultView:undefined,
  generation:1,isLoaded:true,destroyed:false}
 const readRecheck=vi.fn(async()=>({decision,evidence}))
 const submitAction=vi.fn(async()=>({receiptRef:'RECHECKED'}))
 const page=createBidFindingsScriptHost(runtime,{projectId:'P',scenarioId:'S',assertCurrent},{
  readCoverage:async()=>{throw Error('UNEXPECTED_COVERAGE')},readRecheck,submitAction,
 })
 const submitted=await page.invoke('bid.tasks.registerRecheck',{findingId:'F',expectedFindingVersion:'F1',requestKey:'Q'},
  new AbortController().signal)
 expect(submitted).toMatchObject({state:'SUBMITTED',receipt:{receiptRef:'RECHECKED'}})
 expect(submitAction).toHaveBeenCalledWith(expect.objectContaining({operationId:'44',requestKey:'Q'}))
 readRecheck.mockClear()
 const query:{findingId:string;expectedFindingVersion:string;recheckRequestKey:string;recheckRequestDigest?:string}={findingId:request.findingId,expectedFindingVersion:request.expectedFindingVersion,recheckRequestKey:request.requestKey}
 expect(query.recheckRequestKey).toBe('Q')
 }finally{ds.destroy()}
})
