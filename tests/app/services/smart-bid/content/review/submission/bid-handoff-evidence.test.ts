import {expect,it,vi} from 'vitest'
import {bidProjectScopeScenarioViews} from '@/views/features/application/smart-bid/collaboration/handoff/bid-project-scope-reader'
import {DataSet} from '@spark-appworks/spark-data'
import {assessBidHandoff,compareBidHandoffVersions} from '@/services/smart-bid/content/review/submission/bid-handoff-evidence'
import {bidHandoffScenarioViews,readRegisteredBidHandoff} from '@/views/features/application/smart-bid/collaboration/handoff/bid-handoff-reader'
import {createBidHandoffScriptHost} from '@/views/features/application/smart-bid/collaboration/handoff/bid-handoff-script-host'
import script from '@/views/features/application/smart-bid/collaboration/handoff/page08/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('keeps responsibility with the original assignee until the current version is accepted',async()=>{
 const scope={projectId:'P',lotId:'L',roundId:'R',stageId:'RESULT'}
 const item={id:'GUARANTEE',versionRef:'V2',originalAssigneeId:'OWNER',receiverId:'FINANCE',openIssueRefs:['REFUND'],
  followupRef:'QUERY',nextDueAt:'2026-11-19T10:00:00+08:00'}
 const assertCurrent=()=>{}
 const old={...scope,itemId:item.id,versionRef:'V1',receiverId:item.receiverId,taskReceiptRef:'RECEIPT-1',
  state:'ACCEPTED' as const,assertCurrent}
 const assess=(receipts:Parameters<typeof assessBidHandoff>[1]['receipts'])=>
  assessBidHandoff(scope,{items:[item],receipts,assertCurrent})
 expect(assess([old])).toMatchObject({handoffConfirmed:false,items:[{state:'AWAITING_ACCEPTANCE',trackingAssigneeId:'OWNER'}]})
 const current={...old,versionRef:'V2',taskReceiptRef:'RECEIPT-2'}
 expect(assess([old,current])).toMatchObject({handoffConfirmed:true,items:[{state:'ACCEPTED',
  trackingAssigneeId:'FINANCE',openIssueRefs:['REFUND']}]})
 expect(assessBidHandoff(scope,{items:[{...item,followupRef:null}],receipts:[current],assertCurrent}))
  .toMatchObject({items:[{state:'FOLLOWUP_REQUIRED',trackingAssigneeId:'OWNER'}]})
 expect(()=>assess([{...current,receiverId:'OTHER'}])).toThrow('BID_HANDOFF_SCOPE')
 expect(()=>assess([old,{...current,taskReceiptRef:old.taskReceiptRef}])).toThrow('BID_HANDOFF_SCOPE')
 const past=assessBidHandoff(scope,{items:[{...item,versionRef:'V1'}],receipts:[old],assertCurrent})
 expect(compareBidHandoffVersions(past,assess([old])).items).toMatchObject([
  {state:'CHANGED',originalVersionRef:'V1',versionRef:'V2',requiresAcceptance:true,acceptanceReceiptRef:null},
 ])
 expect(compareBidHandoffVersions(past,past).items).toMatchObject([{state:'UNCHANGED',requiresAcceptance:false}])
 expect(()=>compareBidHandoffVersions(past,assess([{...current,taskReceiptRef:old.taskReceiptRef}])))
  .toThrow('BID_HANDOFF_VERSION_DRIFT')
 const reopened=assessBidHandoff(scope,{items:[{...item,versionRef:'V1'}],receipts:[],assertCurrent})
 expect(compareBidHandoffVersions(past,reopened).items).toMatchObject([
  {state:'UNCHANGED',requiresAcceptance:false,acceptanceReceiptRef:'RECEIPT-1'},
 ])
 expect(()=>compareBidHandoffVersions(past,assessBidHandoff(scope,{
  items:[{...item,versionRef:'V1',originalAssigneeId:'OTHER'}],receipts:[old],assertCurrent,
 }))).toThrow('BID_HANDOFF_VERSION_DRIFT')
 expect(compareBidHandoffVersions(past,assessBidHandoff(scope,{items:[],receipts:[],assertCurrent})).removed)
  .toMatchObject([{id:item.id,openIssueRefs:['REFUND'],trackingAssigneeId:'FINANCE'}])
 expect(()=>compareBidHandoffVersions(past,assessBidHandoff(scope,{
  items:[{...item,versionRef:'V1',nextDueAt:'2026-11-20T10:00:00+08:00'}],receipts:[old],assertCurrent,
 }))).toThrow('BID_HANDOFF_VERSION_DRIFT')
 const row={...scope,id:'ROW',handoffId:'H',items:[item]}
 const projectRow={id:'P',projectId:'P',stageRefs:['STAGE-1'],headRevisionId:null as string|null,activeBaselineId:'BASELINE'}
 const baselineRow={id:'BASELINE',projectId:'P',stageRef:'STAGE-1',
  factVersions:[{factId:'FACT',version:1}],requirementVersions:[{lineageId:'CLAUSE',version:'V1'}],
  tenderRecords:[{runId:'RUN',type:'CLAUSES',ordinal:0,recordVersion:'TV1',recordHash:'b'.repeat(64)}]}
 const headRow={id:'HEAD',projectId:'P',status:'ADOPTED',snapshotHash:'a'.repeat(64),stageRef:'PREVIOUS-STAGE',baselineId:'PREVIOUS-BASELINE'}
 const scopeViews=bidProjectScopeScenarioViews({ContentProject:'id',ContentRevision:'id',Baseline:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{BidHandoff:{
  modelBinding:{modelName:'BidHandoff',modelId:'M'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...bidHandoffScenarioViews('id')},
 },ContentProject:{
  modelBinding:{modelName:'ContentProject',modelId:'PROJECT-M'},columns:Object.keys(projectRow).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...scopeViews.ContentProject},
 },Baseline:{
  modelBinding:{modelName:'Baseline',modelId:'BASELINE-M'},columns:Object.keys(baselineRow).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...scopeViews.Baseline},
 },ContentRevision:{
  modelBinding:{modelName:'ContentRevision',modelId:'REVISION-M'},columns:Object.keys(headRow).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...scopeViews.ContentRevision},
 }}})
 try{
  const view=ds.getView('BidHandoff','originalHandoff')
  if(!view)throw Error('TEST_HANDOFF_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'BidHandoff'})
  let hidden=false,receiptCurrent=true
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'handoff',readScope:()=> 'handoff',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:hidden?['items']:[],m:[],d:false}}]}}}),
  })})
  const previousView=ds.getView('BidHandoff','previousHandoff')
  if(!previousView)throw Error('TEST_PREVIOUS_HANDOFF_VIEW_REQUIRED')
  const previousTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'BidHandoff'})
  previousView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:previousTable.identity,scope:'previous',readScope:()=> 'previous',snapshot:previousTable.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,id:'PREVIOUS',handoffId:'H1',items:[{...item,versionRef:'V1'}],
     lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
  })})
  const projectView=ds.getView('ContentProject','originalProjectScope')
  if(!projectView)throw Error('TEST_PROJECT_SCOPE_VIEW_REQUIRED')
  const projectTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContentProject'})
  let projectExists=true
  projectView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:projectTable.identity,scope:'project',readScope:()=> 'project',
   snapshot:projectTable.applyResult({Result:{primaryKeyField:'id',data:{Count:projectExists?1:0,
    Items:projectExists?[{...projectRow,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]:[]}}}),
  })})
  const baseline=ds.getView('Baseline','originalProjectBaseline'),head=ds.getView('ContentRevision','originalProjectHead')
  if(!baseline||!head)throw Error('TEST_PROJECT_POINTER_VIEWS_REQUIRED')
  let hasBaseline=false
  const proof={r:[],e:[],h:[],m:[],d:false}
  const baselineTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'Baseline'})
  baseline.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:baselineTable.identity,scope:'baseline',readScope:()=> 'baseline',
   snapshot:baselineTable.applyResult({Result:{primaryKeyField:'id',data:{Count:hasBaseline?1:0,
    Items:hasBaseline?[{...baselineRow,lingma_sys_params:proof}]:[]}}}),
  })})
  const fixedBaseline=ds.getView('Baseline','originalHeadBaseline')
  if(!fixedBaseline)throw Error('TEST_FIXED_BASELINE_VIEW_REQUIRED')
  const fixedTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'Baseline'})
  let fixedStage='OTHER'
  fixedBaseline.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:fixedTable.identity,scope:'fixed',readScope:()=> 'fixed',
   snapshot:fixedTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,
    Items:[{...baselineRow,id:'PREVIOUS-BASELINE',stageRef:fixedStage,lingma_sys_params:proof}]}}}),
  })})
  const headTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContentRevision'})
  let headUnavailable=false
  head.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},async executeQuery(){
   if(headUnavailable)throw Error('TEST_HEAD_QUERY_UNAVAILABLE')
   return new DataSpaceQueryContext({identity:headTable.identity,scope:'head',readScope:()=> 'head',
    snapshot:headTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[{...headRow,lingma_sys_params:proof}]}}})})
  }})
  const frozenBaseline=ds.getView('Baseline','originalFrozenBaseline')
  if(!frozenBaseline)throw Error('TEST_FROZEN_BASELINE_VIEW_REQUIRED')
  const frozenTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'Baseline'})
  let duplicateFact=false
  frozenBaseline.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:frozenTable.identity,scope:'frozen',readScope:()=> 'frozen',
   snapshot:frozenTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[{...baselineRow,
    factVersions:duplicateFact?[...baselineRow.factVersions,...baselineRow.factVersions]:baselineRow.factVersions,
    lingma_sys_params:proof}]}}}),
  })})
  const host={scenarioId:'S',projectId:'P',runtime:{resolveView:(key:string)=>key==='S@BidHandoff@originalHandoff'?view:
   key==='S@BidHandoff@previousHandoff'?previousView:key==='S@ContentProject@originalProjectScope'?projectView:
    key==='S@Baseline@originalProjectBaseline'?baseline:key==='S@ContentRevision@originalProjectHead'?head:key==='S@Baseline@originalHeadBaseline'?fixedBaseline:
    key==='S@Baseline@originalFrozenBaseline'?frozenBaseline:undefined},
   assertCurrent}
  let hasCurrentReceipt=true
  const readReceipts=vi.fn(async()=>({receipts:hasCurrentReceipt?[old,current]:[old],
   assertCurrent:()=>{if(!receiptCurrent)throw Error('RECEIPT_STALE')}}))
  const selection={lotId:'L',roundId:'R',stageId:'RESULT',handoffId:'H'}
  const registered=await readRegisteredBidHandoff(host,selection,readReceipts)
  expect(readReceipts).toHaveBeenCalledExactlyOnceWith(scope,[item])
  expect(registered).toMatchObject({handoffConfirmed:true,items:[{taskReceiptRef:'RECEIPT-2',trackingAssigneeId:'FINANCE'}]})
  receiptCurrent=false
  expect(()=>registered.assertCurrent()).toThrow('RECEIPT_STALE')
  receiptCurrent=true
  const page=createBidHandoffScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{selection,readReceipts})
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{})
  const {openBidHandoff,openHandoffComparison,openBidProjectScope,openFrozenBaseline}=compileFunctions(script,{$route:{query:{handoffId:'H',previousHandoffId:'H1',frozenBaselineId:'BASELINE'}},$page:{
   invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,
  }} as unknown as PageContext)
  if(!openBidHandoff||!openHandoffComparison||!openBidProjectScope||!openFrozenBaseline)throw Error('TEST_HANDOFF_PAGE_HANDLER_REQUIRED')
  await openBidHandoff()
  expect(showAlert).toHaveBeenLastCalledWith([
   '移交 H · 所列事项均已签收','GUARANTEE · 版本 V2 · 已签收 · 跟踪人 FINANCE','  原任务凭据 RECEIPT-2',
   '  未决事项 REFUND',`  续查 QUERY · 下次核查 ${item.nextDueAt}`,
  ].join('\n'),'本轮移交核对')
  hasCurrentReceipt=false
  await openBidHandoff()
  expect(showAlert).toHaveBeenLastCalledWith(expect.stringContaining('待签收 · 跟踪人 OWNER'),'本轮移交核对')
  expect(()=>registered.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  await openHandoffComparison()
  expect(showAlert).toHaveBeenLastCalledWith('GUARANTEE · 换版 · V2 · 待签收','移交清单差异')
  expect(readReceipts).toHaveBeenLastCalledWith(scope,[{...item,versionRef:'V1'}],signal,'previous')
  const compared=await page.invoke('bid.handoff.compareVersions',{handoffId:'H',previousHandoffId:'H1'},signal)
  compared.assertCurrent()
  await previousView.refresh()
  expect(()=>compared.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  await openBidProjectScope()
  expect(showAlert).toHaveBeenLastCalledWith('编制项目 P\n阶段引用 STAGE-1\n原正文头 尚未形成\n激活基线 BASELINE · 缺原记录，恢复待核','原编制项目范围')
  hasBaseline=true
  projectRow.headRevisionId='HEAD'
  await openBidProjectScope()
  expect(showAlert).toHaveBeenLastCalledWith(
   '编制项目 P\n阶段引用 STAGE-1\n原正文头 HEAD · 已核原记录\n正文头阶段 PREVIOUS-STAGE · 固定基线 PREVIOUS-BASELINE · 原阶段不符，恢复待核\n激活基线 BASELINE · 已核原记录\n激活基线阶段 STAGE-1','原编制项目范围')
  fixedStage='PREVIOUS-STAGE'
  const recovered=await page.invoke('bid.project.readScope',{},signal)
  expect(recovered).toMatchObject({headBaselineState:'VERIFIED'})
  await fixedBaseline.refresh()
  expect(()=>recovered.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  await openFrozenBaseline()
  expect(showAlert).toHaveBeenLastCalledWith([
   '基线 BASELINE · 阶段 STAGE-1','固定事实 1 项 · 固定要求 1 项 · 招标记录 1 项',
   '事实 FACT · 版本 1','要求 CLAUSE · 版本 V1',`招标记录 RUN / CLAUSES / 0 · 版本 TV1 · 摘要 ${'b'.repeat(64)}`,
  ].join('\n'),'冻结依据回查')
  duplicateFact=true
  await expect(page.invoke('bid.project.readFrozenBaseline',{baselineId:'BASELINE'},signal)).rejects.toThrow('BASELINE_FACT_MEMBER_DUPLICATE')
  headUnavailable=true
  await openBidProjectScope()
  expect(showAlert).toHaveBeenLastCalledWith(
   '编制项目 P\n阶段引用 STAGE-1\n原正文头 HEAD · 原记录无法核验，恢复待核\n激活基线 BASELINE · 已核原记录\n激活基线阶段 STAGE-1','原编制项目范围')
  projectExists=false
  await openBidProjectScope()
  expect(showAlert).toHaveBeenLastCalledWith('当前项目范围登记待确认','原编制项目范围')
  await expect(page.invoke('bid.project.readScope',{projectId:'OTHER'},signal)).rejects.toThrow('BID_HANDOFF_PAGE_REQUEST')
  hidden=true
  await expect(readRegisteredBidHandoff(host,selection,readReceipts)).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(readReceipts).toHaveBeenCalledTimes(7)
 }finally{ds.destroy()}
})
