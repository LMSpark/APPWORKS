import {expect,it,vi} from 'vitest'
import {responseScenarioViews} from '@/views/features/application/smart-bid/response/model/response-scenario-views'
import {DataSet} from '@spark-appworks/spark-data'
import {readRegisteredApprovedPrice} from '@/views/features/application/smart-bid/response/model/approved-price-reader'
import {createApprovedPriceScriptHost} from '@/views/features/application/smart-bid/response/ui/entry/approved-price-script-host'
import script from '@/views/features/application/smart-bid/response/page10/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('reads only the scoped original approval and rejects mismatched or concealed rows',async()=>{
 const row={id:'ID',scopeRef:'LOT',approvalRef:'A',version:'V1',approverRef:'OWNER',value:'0.00',unit:'%',
  detailRef:null,pricingVersion:null,rateOnly:true}
 const sheet={id:'PRICE-ID',scopeRef:'LOT',detailRef:'DETAIL',pricingVersion:'SHEET-V1',currency:'CNY',precision:2,rounding:'HALF_UP',
  lines:[{lineRef:'LINE',quantity:'2',unitPrice:'0.50',reportedAmount:'1.00',unit:'项',sourceRef:'SOURCE'}]}
 const scenarioViews=responseScenarioViews({ApprovedPrice:'id',BidSecurity:'id',PriceSheet:'id',ResponseAssignment:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ApprovedPrice:{
  modelBinding:{modelName:'ApprovedPrice',modelId:'M'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...scenarioViews.ApprovedPrice},
 },PriceSheet:{modelBinding:{modelName:'PriceSheet',modelId:'P'},
  columns:Object.keys(sheet).map(name=>({name,isPrimaryKey:name==='id'})),views:{default:{},...scenarioViews.PriceSheet},
 }}})
 try{
  const view=ds.getView('ApprovedPrice','selectedApprovedPrice')
  const sheetView=ds.getView('PriceSheet','selectedPriceSheet')
  if(!view||!sheetView)throw Error('TEST_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ApprovedPrice'})
  let hidden:string[]=[],version=row.version,withSheet=false,sheetHidden:string[]=[]
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'original',readScope:()=> 'original',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,version,...(withSheet?{detailRef:sheet.detailRef,pricingVersion:sheet.pricingVersion,value:'1.00',unit:'CNY',rateOnly:false}:{}),
     lingma_sys_params:{r:[],e:[],h:hidden,m:[],d:false}}]}}}),
  })})
  const sheetTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'PriceSheet'})
  sheetView.bindQueryExecutor({executeQuery:async()=>new DataSpaceQueryContext({
   identity:sheetTable.identity,scope:'sheet',readScope:()=> 'sheet',snapshot:sheetTable.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...sheet,lingma_sys_params:{r:[],e:[],h:sheetHidden,m:[],d:false}}]}}}),
  })})
  const host={scenarioId:'S',scopeRef:'LOT',runtime:{resolveView:(key:string)=>key==='S@ApprovedPrice@selectedApprovedPrice'?view:
   key==='S@PriceSheet@selectedPriceSheet'?sheetView:undefined,
   generation:1,isLoaded:true,destroyed:false},
   assertCurrent:()=>{}}
  type EvidenceReader=Parameters<typeof readRegisteredApprovedPrice>[2]
  const evidence=vi.fn<EvidenceReader>(async(request,{assertCurrent})=>({
   assertCurrent,use:{...request,decisionRef:'USE',state:'USABLE' as const,assertCurrent},
  }))
  const target={approvalRef:'A',version:'V1',purposeRef:'BID',rateOnly:true}
  const page=createApprovedPriceScriptHost(host.runtime,{...host,purposeRef:'BID',rateOnly:true},evidence)
  const controller=new AbortController()
  expect(()=>page.invoke('bid.response.readApprovedPrice',{approvalRef:'A',version:'V1',rateOnly:true},controller.signal))
   .toThrow('BID_APPROVED_PRICE_PAGE_REQUEST')
  const result=await page.invoke('bid.response.readApprovedPrice',{approvalRef:'A',version:'V1'},controller.signal)
  expect(result).toMatchObject({original:'APPROVED',use:'USABLE',version:'V1',value:'0.00'})
  expect(evidence).toHaveBeenCalledWith(expect.objectContaining({purposeRef:'BID'}),expect.objectContaining({
   scopeRef:'LOT',approvalRef:'A',version:'V1',detailRef:null,value:'0.00',unit:'%',rateOnly:true,
  }))
  expect(view.queryContext).toMatchObject({scopeRef:'LOT',approvalRef:'A',version:'V1'})
  controller.abort()
  expect(()=>result.assertCurrent()).toThrow('BID_APPROVED_PRICE_PAGE_STALE')
  version='V2'
  await expect(readRegisteredApprovedPrice(host,target,evidence)).rejects.toThrow('ORIGINAL_REGISTRATION_VIEW_REQUIRED')
  expect(()=>result.assertCurrent()).toThrow()
  version='V1'
  hidden=['value']
  await expect(readRegisteredApprovedPrice(host,target,evidence)).rejects.toThrow()
  expect(evidence).toHaveBeenCalledTimes(1)
  hidden=[]
  const showAlert=vi.fn(async()=>{})
  const {bindApprovedPrice,openApprovedPrice}=compileFunctions(script,{
   $route:{query:{approvalRef:'A',approvalVersion:'V1'}},
   $page:{invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,new AbortController().signal),showAlert},
  } as unknown as PageContext)
  if(!bindApprovedPrice||!openApprovedPrice)throw Error('TEST_SCRIPT_REQUIRED')
  expect(bindApprovedPrice()).toEqual({disabled:false})
  await openApprovedPrice()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith('原批准 A · 版本 V1\n批准值 0.00 %\n本次用途 可用','原报价批准')
  withSheet=true
  await expect(readRegisteredApprovedPrice(host,{...target,rateOnly:false},evidence)).resolves.toMatchObject({
   original:'APPROVED',use:'USABLE',detailRef:'DETAIL',
  })
  expect(sheetView.queryContext).toMatchObject({pricingVersion:'SHEET-V1',detailRef:'DETAIL',scopeRef:'LOT'})
  sheetHidden=['lines']
  await expect(readRegisteredApprovedPrice(host,{...target,rateOnly:false},evidence)).resolves.toMatchObject({
   original:'APPROVED',use:'PENDING',value:'1.00',detailRef:'DETAIL',
  })
  sheetHidden=[]
  const unavailable:EvidenceReader=async()=>{throw Error('USE_SOURCE_UNAVAILABLE')}
  await expect(readRegisteredApprovedPrice(host,{...target,rateOnly:false},unavailable)).resolves.toMatchObject({
   original:'APPROVED',use:'PENDING',value:'1.00',detailStatus:'MATCHED',
  })
  const scopeLost=new AbortController()
  const stopped=createApprovedPriceScriptHost(host.runtime,{...host,purposeRef:'BID',rateOnly:false},async()=>{
   scopeLost.abort()
   throw Error('USE_SOURCE_UNAVAILABLE')
  })
  await expect(stopped.invoke('bid.response.readApprovedPrice',{approvalRef:'A',version:'V1'},scopeLost.signal))
   .rejects.toThrow('BID_APPROVED_PRICE_PAGE_STALE')
 }finally{ds.destroy()}
})

it('suppresses the old warning after the selected version changes',async()=>{
 const query={approvalRef:'A',approvalVersion:'V1'}
 let rejectPending:(reason:Error)=>void=()=>{throw Error('TEST_REQUEST_REQUIRED')}
 const pending=new Promise<never>((_resolve,reject)=>{rejectPending=reject})
 const showAlert=vi.fn(),showMessage=vi.fn()
 const {openApprovedPrice}=compileFunctions(script,{
  $route:{query},
  $page:{invokeHostCommand:()=>pending,showAlert,showMessage},
 } as unknown as PageContext)
 if(!openApprovedPrice)throw Error('TEST_SCRIPT_REQUIRED')
 const opening=openApprovedPrice()
 query.approvalVersion='V2'
 rejectPending(Error('STALE'))
 await opening
 expect(showAlert).not.toHaveBeenCalled()
 expect(showMessage).not.toHaveBeenCalled()
})
