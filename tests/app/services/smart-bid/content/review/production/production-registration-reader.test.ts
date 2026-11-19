import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readOriginalExportRegistration} from '@/views/features/application/smart-bid/authoring/model/review/production/production-registration-reader'
import {producedFileScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/production/production-scenario-views'
import {createContentReviewScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-script-host'
import script from '@/views/features/application/smart-bid/authoring/page12/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

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
