import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {bidSecurityRequirementView,readRegisteredBidSecurity} from '@/views/features/application/smart-bid/response/model/bid-security-reader'
import {createBidResponseScriptHost} from '@/views/features/application/smart-bid/response/ui/entry/response-script-host'
import script from '@/views/features/application/smart-bid/response/page10/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('reads the specified security requirement before requesting finance receipts',async()=>{
 const row={id:'SEC',scopeRef:'LOT',requirementVersion:'R1',liablePartyRef:'BIDDER',clauseRef:'CLAUSE',
  terms:{kind:'REQUIRED',methodRef:'CASH',milestones:['RECEIVED'],deadline:10}}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{BidSecurity:{
  modelBinding:{modelName:'BidSecurity',modelId:'M'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedSecurityRequirement:bidSecurityRequirementView('id')},
 }}})
 try{
  const view=ds.getView('BidSecurity','selectedSecurityRequirement')
  if(!view)throw Error('TEST_VIEW_REQUIRED')
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'BidSecurity'})
  let hidden:string[]=[],liablePartyRef=row.liablePartyRef
  view.bindQueryExecutor({executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'security',readScope:()=> 'security',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,liablePartyRef,lingma_sys_params:{r:[],e:[],h:hidden,m:[],d:false}}]}}}),
  })})
  const host={scenarioId:'S',scopeRef:'LOT',runtime:{resolveView:(key:string)=>key==='S@BidSecurity@selectedSecurityRequirement'?view:undefined,
   generation:1,isLoaded:true,destroyed:false},
   assertCurrent:()=>{}}
  const target={requirementVersion:'R1',liablePartyRef:'BIDDER',asOf:10}
  type ReadReceipts=Parameters<typeof readRegisteredBidSecurity>[2]
  const readReceipts=vi.fn<ReadReceipts>(async(requirement)=>[{
   scopeRef:requirement.scopeRef,requirementVersion:requirement.requirementVersion,liablePartyRef:requirement.liablePartyRef,
   receiptRef:'BANK',kind:'RECEIVED',methodRef:'CASH',effectiveAt:9,knownAt:10,assertCurrent:()=>{},
  }])
  const result=await readRegisteredBidSecurity(host,target,readReceipts)
  expect(result).toMatchObject({state:'VERIFIED',clauseRef:'CLAUSE',proofRefs:['BANK']})
  expect(view.queryContext).toMatchObject({scopeRef:'LOT',requirementVersion:'R1',liablePartyRef:'BIDDER'})
  hidden=['terms']
  await expect(readRegisteredBidSecurity(host,target,readReceipts)).rejects.toThrow()
  expect(()=>result.assertCurrent()).toThrow()
  hidden=[]
  liablePartyRef='OTHER'
  await expect(readRegisteredBidSecurity(host,target,readReceipts)).rejects.toThrow('ORIGINAL_REGISTRATION_VIEW_REQUIRED')
  expect(readReceipts).toHaveBeenCalledTimes(1)
  liablePartyRef='BIDDER'
  const page=createBidResponseScriptHost(host.runtime,{...host,asOf:8,purposeRef:'BID',rateOnly:false},
   {readSecurityReceipts:readReceipts,readPriceEvidence:async()=>{throw Error('UNEXPECTED_PRICE_READ')}})
  const signal=new AbortController().signal
  expect(()=>page.invoke('bid.response.readSecurity',{...target},signal)).toThrow('BID_SECURITY_PAGE_REQUEST')
  const showAlert=vi.fn()
  const {bindBidSecurity,openBidSecurity}=compileFunctions(script,{
   $route:{query:{securityRequirementVersion:'R1',liablePartyRef:'BIDDER'}},
   $page:{invokeHostCommand:(name:string,input:unknown)=>page.invoke(name,input,signal),showAlert},
  } as unknown as PageContext)
  if(!bindBidSecurity||!openBidSecurity)throw Error('TEST_SCRIPT_REQUIRED')
  expect(bindBidSecurity()).toEqual({disabled:false})
  await openBidSecurity()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith('待核\n原条款 CLAUSE\n欠项 到账','投标担保')
  const unavailable:ReadReceipts=async()=>{throw Error('FINANCE_UNAVAILABLE')}
  await expect(readRegisteredBidSecurity(host,target,unavailable)).resolves.toMatchObject({
   state:'PENDING',clauseRef:'CLAUSE',pending:['RECEIVED'],receiptsUnavailable:true,
  })
  const controller=new AbortController()
  const closingPage=createBidResponseScriptHost(host.runtime,{...host,asOf:10,purposeRef:'BID',rateOnly:false},{
   readPriceEvidence:async()=>{throw Error('UNEXPECTED_PRICE_READ')},
   readSecurityReceipts:async()=>{controller.abort();throw Error('FINANCE_UNAVAILABLE')},
  })
  await expect(closingPage.invoke('bid.response.readSecurity',{requirementVersion:'R1',liablePartyRef:'BIDDER'},controller.signal))
   .rejects.toThrow('BID_SECURITY_PAGE_STALE')
 }finally{ds.destroy()}
})
