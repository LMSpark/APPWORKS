import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readContentReviewFindings,readFindingsForCompletedCoverage} from '@/views/features/application/smart-bid/authoring/model/review/content-review-findings-reader'
import {readContentReviewCoverageFromFindings} from '@/views/features/application/smart-bid/authoring/model/review/content-review-coverage-reader'
import {createBidFindingsScriptHost} from '@/views/features/application/smart-bid/collaboration/tasks/bid-findings-script-host'
import script from '@/views/features/application/smart-bid/collaboration/tasks/page15/script.js?raw'
import {compileFunctions} from '../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../packages/spark-component/src/page/context/types'
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
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{})
  const {openBidFindings}=compileFunctions(script,{$page:{
   invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,
  }} as unknown as PageContext)
  if(!openBidFindings)throw Error('TEST_BID_FINDINGS_HANDLER_REQUIRED')
  await expect(page.invoke('bid.tasks.readFindings',{revisionId:'OTHER'},signal)).rejects.toThrow('BID_FINDINGS_PAGE_REQUEST')
  await openBidFindings()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith(
   `修订 R\nF · 阻断 · 未决 · 目标 D · 内容摘要 ${target.effectiveHash}`,'任务问题回查')
  const calls=executeQuery.mock.calls.length
  await expect(readContentReviewCoverageFromFindings(host,request,{approvals:[],readCompleted:async()=>({...coverage,revisionId:'OLD'})}))
   .rejects.toThrow('CONTENT_REVIEW_CHECK_REVISION')
  await expect(readContentReviewCoverageFromFindings(host,{...request,targets:[{...target,targetId:'OTHER'}]},
   {approvals:[],readCompleted:async()=>coverage}))
   .rejects.toThrow('CONTENT_REVIEW_COVERAGE_SCOPE')
  expect(executeQuery).toHaveBeenCalledTimes(calls)
  await expect(readFindingsForCompletedCoverage(host,{...coverage,resolveAnchor:()=>({kind:'FILE',targetId:'OTHER'})}))
   .rejects.toThrow('CONTENT_REVIEW_FINDINGS_SCOPE')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  rows=[{...row,checkerHash:'c'.repeat(64)}]
  await expect(readContentReviewFindings(host,[selection])).rejects.toThrow('CONTENT_REVIEW_FINDINGS_SCOPE')
  expect(save).not.toHaveBeenCalled()
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
 let saved=false
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
 let hasFinding=true
 const readRegistration=vi.fn(async()=>hasFinding?{finding,observations:source.observations,assertCurrent}:
  {finding:null,observations:[],assertCurrent})
 const page=createBidFindingsScriptHost(runtime,{projectId:'P',scenarioId:'S',assertCurrent},{
  readCoverage:async()=>{throw Error('UNEXPECTED_COVERAGE')},readRegistration,
 })
 const query:{findingCheckRef:string;findingRegistrationKey:string;findingRegistrationDigest?:string}={findingCheckRef:'CHECK',findingRegistrationKey:'Q'}
 const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 const {openBidFindingRegistration}=compileFunctions(script,{$route:{query},$page:{
  invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,showMessage,
 }} as unknown as PageContext)
 if(!openBidFindingRegistration)throw Error('TEST_BID_REGISTRATION_HANDLER_REQUIRED')
 await openBidFindingRegistration()
 expect(readRegistration).toHaveBeenCalledWith(expect.objectContaining({projectId:'P',checkRef:'CHECK',target}),signal)
 expect(showAlert).toHaveBeenLastCalledWith([
  '原检查 CHECK · 目标 DOC · 版本 V1','问题 F · 位置 PAGE-3 · 证据 SOURCE-1、SOURCE-2',`待登记 · 请求摘要 ${prepared.requestDigest}`,
 ].join('\n'),'登记问题或检查覆盖')
 hasFinding=false
 await openBidFindingRegistration()
 expect(showAlert).toHaveBeenLastCalledWith([
  '原检查 CHECK · 目标 DOC · 版本 V1','已核检查覆盖，未发现问题',`待登记 · 请求摘要 ${covered.requestDigest}`,
 ].join('\n'),'登记问题或检查覆盖')
 query.findingCheckRef='OTHER'
 await openBidFindingRegistration()
 expect(showMessage).toHaveBeenCalledExactlyOnceWith('原检查与问题证据无法核验','warning')
 query.findingCheckRef='CHECK'
 checkRow.state='RUNNING'
 await openBidFindingRegistration()
 expect(showMessage).toHaveBeenCalledTimes(2)
 expect(readRegistration).toHaveBeenCalledTimes(2)
 query.findingRegistrationDigest=covered.requestDigest
 await openBidFindingRegistration()
 expect(showAlert).toHaveBeenLastCalledWith('原登记结果待确认','原问题登记结果')
 saved=true
 await openBidFindingRegistration()
 expect(showAlert).toHaveBeenLastCalledWith('原登记 RESULT · 零问题覆盖','原问题登记结果')
 await expect(page.invoke('bid.tasks.readFindingRegistration',{checkRef:'CHECK',requestKey:'Q',requestDigest:prepared.requestDigest},signal))
  .rejects.toThrow('REVIEW_FINDING_REGISTRATION_RESULT_SCOPE')
 expect(readRegistration).toHaveBeenCalledTimes(2)
 }finally{ds.destroy()}
})

it('prepares recheck only for the expected finding version and matching target evidence',async()=>{
 const scope={projectId:'P',findingId:'F'}
 const original={kind:'FILE' as const,targetId:'DOC',versionRef:'V1',effectiveHash:'a'.repeat(64)}
 const changed={...original,versionRef:'V2',effectiveHash:'b'.repeat(64)}
 const request={...scope,expectedFindingVersion:'F1',requestKey:'Q'}
 let current=true
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
 let registered=false
 const resultRow={...request,id:'RECHECK',requestDigest:prepared.requestDigest,outcome:'CORRECTED',evidenceRef:'RESOURCE-V2'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{CheckFinding:{
  modelBinding:{modelName:'CheckFinding',modelId:'M'},columns:Object.keys({...row,...resultRow}).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...bidFindingsScenarioViews('id')},
 }}})
 try{
 const view=ds.getView('CheckFinding','originalRecheckFinding')
 if(!view)throw Error('TEST_ORIGINAL_FINDING_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'CheckFinding'})
 let hidden=false
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
 const page=createBidFindingsScriptHost(runtime,{projectId:'P',scenarioId:'S',assertCurrent},{
  readCoverage:async()=>{throw Error('UNEXPECTED_COVERAGE')},readRecheck,
 })
 const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 const query:{findingId:string;expectedFindingVersion:string;recheckRequestKey:string;recheckRequestDigest?:string}={findingId:request.findingId,expectedFindingVersion:request.expectedFindingVersion,recheckRequestKey:request.requestKey}
 const {openBidFindingRecheck}=compileFunctions(script,{$route:{query},$page:{
  invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,showMessage,
 }} as unknown as PageContext)
 if(!openBidFindingRecheck)throw Error('TEST_BID_RECHECK_HANDLER_REQUIRED')
 await openBidFindingRecheck()
 expect(readRecheck).toHaveBeenCalledExactlyOnceWith({request,finding:expect.objectContaining({
  ...scope,versionRef:'F1',target:original,remediatorId:'AUTHOR',
 })},signal)
 expect(showAlert).toHaveBeenCalledExactlyOnceWith([
  '问题 F · 问题版 F1','复验目标 DOC · 版本 V2','拟登记结论 已纠正 · 证据 RESOURCE-V2',`请求摘要 ${prepared.requestDigest}`,
 ].join('\n'),'问题复验')
 query.expectedFindingVersion='F2'
 await openBidFindingRecheck()
 expect(showMessage).toHaveBeenCalledExactlyOnceWith('复验证据无法核验','warning')
 query.expectedFindingVersion='F1'
 hidden=true
 await openBidFindingRecheck()
 expect(readRecheck).toHaveBeenCalledTimes(1)
 query.recheckRequestDigest=prepared.requestDigest
 await openBidFindingRecheck()
 expect(showAlert).toHaveBeenLastCalledWith('原复验结果待确认','原复验结果')
 registered=true
 await openBidFindingRecheck()
 expect(showAlert).toHaveBeenLastCalledWith('原复验 RECHECK · 已纠正 · 证据 RESOURCE-V2','原复验结果')
 await expect(page.invoke('bid.tasks.readRecheckResult',{findingId:'F',expectedFindingVersion:'F1',requestKey:'Q',
  requestDigest:'a'.repeat(64)},signal)).rejects.toThrow('REVIEW_FINDING_RECHECK_RESULT_SCOPE')
 expect(readRecheck).toHaveBeenCalledTimes(1)
 current=false
 expect(()=>prepared.assertCurrent()).toThrow('EVIDENCE_STALE')
 }finally{ds.destroy()}
})
