import {expect,it,vi} from 'vitest'
import {bidProjectScopeScenarioViews} from '@/views/features/application/smart-bid/collaboration/handoff/bid-project-scope-reader'
import {DataSet} from '@spark-appworks/spark-data'
import {assessBidHandoff,compareBidHandoffVersions} from '@/services/smart-bid/content/review/submission/bid-handoff-evidence'
import {bidHandoffScenarioViews,readRegisteredBidHandoff} from '@/views/features/application/smart-bid/collaboration/handoff/bid-handoff-reader'
import {createBidHandoffScriptHost} from '@/views/features/application/smart-bid/collaboration/handoff/bid-handoff-script-host'
import script from '@/views/features/application/smart-bid/collaboration/handoff/page08/script.js?raw'
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
  const hidden=false
  let receiptCurrent=true
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
  const projectExists=true
  projectView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:projectTable.identity,scope:'project',readScope:()=> 'project',
   snapshot:projectTable.applyResult({Result:{primaryKeyField:'id',data:{Count:projectExists?1:0,
    Items:projectExists?[{...projectRow,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]:[]}}}),
  })})
  const baseline=ds.getView('Baseline','originalProjectBaseline'),head=ds.getView('ContentRevision','originalProjectHead')
  if(!baseline||!head)throw Error('TEST_PROJECT_POINTER_VIEWS_REQUIRED')
  const hasBaseline=false
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
  const fixedStage='OTHER'
  fixedBaseline.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:fixedTable.identity,scope:'fixed',readScope:()=> 'fixed',
   snapshot:fixedTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,
    Items:[{...baselineRow,id:'PREVIOUS-BASELINE',stageRef:fixedStage,lingma_sys_params:proof}]}}}),
  })})
  const headTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ContentRevision'})
  const headUnavailable=false
  head.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},async executeQuery(){
   if(headUnavailable)throw Error('TEST_HEAD_QUERY_UNAVAILABLE')
   return new DataSpaceQueryContext({identity:headTable.identity,scope:'head',readScope:()=> 'head',
    snapshot:headTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[{...headRow,lingma_sys_params:proof}]}}})})
  }})
  const frozenBaseline=ds.getView('Baseline','originalFrozenBaseline')
  const previousFrozen=ds.getView('Baseline','previousFrozenBaseline')
  if(!frozenBaseline||!previousFrozen)throw Error('TEST_FROZEN_BASELINE_VIEW_REQUIRED')
  const frozenTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'Baseline'})
  const previousFrozenTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'Baseline'})
  previousFrozen.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:previousFrozenTable.identity,scope:'prior-frozen',readScope:()=> 'prior-frozen',
   snapshot:previousFrozenTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[{...baselineRow,
    id:'PREVIOUS-BASELINE',stageRef:'PREVIOUS-STAGE',factVersions:[],lingma_sys_params:proof}]}}}),
  })})
  const duplicateFact=false
  frozenBaseline.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:frozenTable.identity,scope:'frozen',readScope:()=> 'frozen',
   snapshot:frozenTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[{...baselineRow,
    factVersions:duplicateFact?[...baselineRow.factVersions,...baselineRow.factVersions]:baselineRow.factVersions,
    lingma_sys_params:proof}]}}}),
  })})
  const host={scenarioId:'S',projectId:'P',runtime:{resolveView:(key:string)=>key==='S@BidHandoff@originalHandoff'?view:
   key==='S@BidHandoff@previousHandoff'?previousView:key==='S@ContentProject@originalProjectScope'?projectView:
    key==='S@Baseline@originalProjectBaseline'?baseline:key==='S@ContentRevision@originalProjectHead'?head:key==='S@Baseline@originalHeadBaseline'?fixedBaseline:
    key==='S@Baseline@originalFrozenBaseline'?frozenBaseline:key==='S@Baseline@previousFrozenBaseline'?previousFrozen:undefined},
   assertCurrent}
  const hasCurrentReceipt=true
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
  expect(page.runtime.resolveView).toBe(host.runtime.resolveView)
 }finally{ds.destroy()}
})
