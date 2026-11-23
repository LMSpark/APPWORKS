import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readOriginalExportRegistration,readOriginalSignedRegistration} from '@/views/features/application/smart-bid/authoring/model/review/production/production-registration-reader'
import {producedFileScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/production/production-scenario-views'
import {createContentReviewScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-script-host'
import script from '@/views/features/application/smart-bid/authoring/page12/script.js?raw'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'



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
 const rows=[row]
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
  expect(signal.aborted).toBe(false)
 }finally{ds.destroy()}
})
