import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readOriginalExportRegistration,readOriginalSignedRegistration} from '@/views/features/application/smart-bid/authoring/model/review/production/production-registration-reader'
import {producedFileScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/production/production-scenario-views'
import {createContentReviewScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-script-host'
import script from '@/views/features/application/smart-bid/authoring/page12/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('withdraws coverage when the review scope changes',async()=>{
 const query={reviewSelectionRef:'ORIGINAL'}
 const result={items:[{state:'COVERED'}],assertCurrent:()=>{}}
 const invokeHostCommand=vi.fn(async()=>result)
 const {__init__,bindCoverage,bindDetails}=compileFunctions(script,{$route:{query},$page:{invokeHostCommand}} as unknown as PageContext)
 if(!__init__||!bindCoverage||!bindDetails)throw Error('TEST_COVERAGE_HANDLERS_REQUIRED')
 await __init__()
 expect(bindCoverage()).toEqual({status:'已覆盖 1 项，共 1 项'})
 query.reviewSelectionRef='OTHER'
 expect(bindCoverage()).toEqual({error:'审核覆盖已失效'})
 expect(bindDetails()).toEqual({visible:false})
 const loading=__init__()
 query.reviewSelectionRef='THIRD'
 await loading
 expect(bindDetails()).toEqual({visible:false})
})

it.each([
 ['openSignedRegistration','signedRegistrationRef'],
 ['openExportRegistration','exportRegistrationRef'],
 ['openProductionRecovery','productionSelectionRef'],
 ['openObservation','platformObservationRef'],
 ['openFileObservation','fileObservationRef'],
 ['openPaperObservation','paperObservationRef'],
])('discards obsolete page results in %s',async (handler,queryKey)=>{
 const query:Record<string,string>={[queryKey]:'ORIGINAL'}
 const showAlert=vi.fn(),showMessage=vi.fn(),assertCurrent=vi.fn()
 const invokeHostCommand=vi.fn(async()=>{
  query[queryKey]='OTHER'
  return {state:'UNKNOWN',assertCurrent}
 })
 const functions=compileFunctions(script,{$route:{query},$page:{invokeHostCommand,showAlert,showMessage}} as unknown as PageContext)
 const open=functions[handler]
 if(!open)throw Error('TEST_RECOVERY_HANDLER_REQUIRED')
 await open()
 expect(invokeHostCommand).toHaveBeenCalledWith(expect.any(String),{selectionRef:'ORIGINAL'})
 expect(assertCurrent).not.toHaveBeenCalled()
 expect(showAlert).not.toHaveBeenCalled()
 expect(showMessage).not.toHaveBeenCalled()
})

it('recovers a signed output only for the same signing request',async()=>{
 const signing={requestKey:'Q',requestDigest:'a'.repeat(64),objectVersion:'V1',signerRef:'SIGNER',positionRef:'FIELD'}
 const record={projectId:'P',documentId:'D',revisionId:'R',signatureOperationRef:'OP',signatureRecordId:'SIGNATURE',
  originalFileId:'BEFORE',originalHash:'b'.repeat(64),signedObjectRef:'AFTER',resourceVersionId:'V2',fileHash:'c'.repeat(64),signing}
 const row={...record,id:'ORIGINAL'}
 let persistedSigning={...signing}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ProducedFile:{
  modelBinding:{modelId:'M',modelName:'ProducedFile'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...producedFileScenarioViews()},
 }}})
 try{
  const view=ds.getView('ProducedFile','originalSignedRegistration')!
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ProducedFile'})
  view.bindQueryExecutor({save:async()=>{throw Error('UNEXPECTED_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'signed',readScope:()=> 'signed',
   snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[
    {...row,signing:persistedSigning,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}},
   ]}}}),
  })})
  const host={runtime:{resolveView:()=>view},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
  const read=()=>readOriginalSignedRegistration(host,{record,assertCurrent:()=>{}})
  const original=await read()
  expect(original).toMatchObject({state:'REGISTERED',producedFileId:'ORIGINAL',resourceVersionId:'V2'})
  expect(view.queryContext).toMatchObject({projectId:'P',signatureOperationRef:'OP',signedObjectRef:'AFTER'})
  persistedSigning={...signing,positionRef:'OTHER'}
  await expect(read()).rejects.toThrow('BID_SIGNED_REGISTRATION_REQUEST_MISMATCH')
  expect(()=>original.assertCurrent()).toThrow()
 }finally{ds.destroy()}
})

it('reads the original registration, rejects a different hash and keeps an empty result unknown',async()=>{
 const record={projectId:'P',documentId:'D',revisionId:'R',requestKey:'Q',inputDigest:'a'.repeat(64),productionRequestRef:'RUN',
  outputRef:'DOCX',resourceVersionId:'NEW',fileHash:'b'.repeat(64),templateVersionRef:'T',ruleVersionRef:'RULE',formVersionRef:null}
 const row={...record,id:'ORIGINAL',resourceVersionId:'V1',lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}
 let rows=[row]
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ProducedFile:{
  modelBinding:{modelId:'M',modelName:'ProducedFile'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...producedFileScenarioViews()},
 }}})
 const view=ds.getView('ProducedFile','originalExportRegistration')!
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ProducedFile'})
 view.bindQueryExecutor({save:async()=>{throw Error('UNEXPECTED_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',
  snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:rows.length,Items:rows}}}),
 })})
 const host={runtime:{resolveView:()=>view},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const prepared={record,assertCurrent:()=>{}}
 const read=()=>readOriginalExportRegistration(host,prepared)
 try{
  const original=await read()
  expect(original).toMatchObject({state:'REGISTERED',producedFileId:'ORIGINAL',resourceVersionId:'V1'})
  const queryConfig=view.queryConfig
  view.queryConfig={...queryConfig,cacheType:'page'}
  expect(()=>original.assertCurrent()).toThrow('BID_EXPORT_REGISTRATION_STALE')
  await expect(read()).rejects.toThrow('BID_EXPORT_REGISTRATION_VIEW_REQUIRED')
  view.queryConfig=queryConfig
  const unused=async()=>{throw Error('UNEXPECTED_REVIEW_CALL')}
  const page=createContentReviewScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{
   readSelection:unused,openFile:unused,readField:unused,readDecision:unused,readCompleted:unused,
   readExportRegistrationSelection:async()=>({selectionRef:'EXPORT',prepared}),
  })
  const signal=new AbortController().signal
  await expect(page.invoke('content.review.readExportRegistration',{selectionRef:'OTHER'},signal))
   .rejects.toThrow('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
  await expect(page.invoke('content.review.readExportRegistration',{selectionRef:'EXPORT'},signal))
   .resolves.toMatchObject({state:'REGISTERED',producedFileId:'ORIGINAL'})
  const showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
  const {bindExportRegistration,openExportRegistration}=compileFunctions(script,{
   $route:{query:{exportRegistrationRef:'EXPORT'}},
   $page:{showAlert,showMessage,invokeHostCommand:(command:string,input:unknown)=>page.invoke(command,input,signal)},
  } as unknown as PageContext)
  if(!bindExportRegistration||!openExportRegistration)throw Error('TEST_EXPORT_PAGE_HANDLERS_REQUIRED')
  expect(bindExportRegistration()).toEqual({visible:true})
  await openExportRegistration()
  expect(showAlert).toHaveBeenCalledWith('原登记 ORIGINAL · 文件版本 V1','导出件登记')
  rows=[{...row,templateVersionRef:'OTHER'}]
  await expect(read()).rejects.toThrow('BID_EXPORT_REGISTRATION_SCOPE')
  rows=[{...row,fileHash:'c'.repeat(64)}]
  await expect(read()).rejects.toThrow('BID_EXPORT_REGISTRATION_HASH_CONFLICT')
  await openExportRegistration()
  expect(showMessage).toHaveBeenCalledWith('同一输出的文件摘要与原登记不同，请交制作人核查','warning')
  expect(()=>original.assertCurrent()).toThrow()
  rows=[]
  await expect(read()).resolves.toMatchObject({state:'UNKNOWN'})
  await openExportRegistration()
  expect(showAlert).toHaveBeenLastCalledWith('原登记结果待确认','导出件登记')
 }finally{ds.destroy()}
})
