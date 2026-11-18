import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {assessBidHandoff,compareBidHandoffVersions} from '@/services/smart-bid/content/review/submission/bid-handoff-evidence'
import {bidHandoffReadView,readRegisteredBidHandoff} from '@/views/features/application/smart-bid/collaboration/handoff/bid-handoff-reader'
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
 const ds=DataSet.fromJson({scenarioId:'S',tables:{BidHandoff:{
  modelBinding:{modelName:'BidHandoff',modelId:'M'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalHandoff:bidHandoffReadView('id')},
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
  const host={scenarioId:'S',projectId:'P',runtime:{resolveView:(key:string)=>key==='S@BidHandoff@originalHandoff'?view:undefined},
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
  const {openBidHandoff}=compileFunctions(script,{$route:{query:{handoffId:'H'}},$page:{
   invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert,
  }} as unknown as PageContext)
  if(!openBidHandoff)throw Error('TEST_HANDOFF_PAGE_HANDLER_REQUIRED')
  await openBidHandoff()
  expect(showAlert).toHaveBeenLastCalledWith([
   '移交 H · 所列事项均已签收','GUARANTEE · 版本 V2 · 已签收 · 跟踪人 FINANCE','  原任务凭据 RECEIPT-2',
   '  未决事项 REFUND',`  续查 QUERY · 下次核查 ${item.nextDueAt}`,
  ].join('\n'),'本轮移交核对')
  hasCurrentReceipt=false
  await openBidHandoff()
  expect(showAlert).toHaveBeenLastCalledWith(expect.stringContaining('待签收 · 跟踪人 OWNER'),'本轮移交核对')
  expect(()=>registered.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  hidden=true
  await expect(readRegisteredBidHandoff(host,selection,readReceipts)).rejects.toThrow('DATA_VIEW_READ_ROW')
  expect(readReceipts).toHaveBeenCalledTimes(3)
 }finally{ds.destroy()}
})
