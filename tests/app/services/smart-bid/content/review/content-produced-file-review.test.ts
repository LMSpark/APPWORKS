import {expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {readCompletedProductionFiles,readProducedFileReviewVersion,readRegisteredProducedFileReviewVersion,readRegisteredProducedFileReviewVersions} from '@/views/features/application/smart-bid/authoring/model/review/content-produced-file-review'
import {recoverProductionRequest} from '@/services/smart-bid/content/review/production/production-recovery'
import {producedFileScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/production/production-scenario-views'
import {DataSet} from '@spark-appworks/spark-data'
import {createContentReviewScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-script-host'
import {compareApprovedFileAnswer,readRegisteredFileAnswer,verifyOriginalFormFileAnswer} from '@/views/features/application/smart-bid/authoring/model/review/content-file-answer-reader'
import {mapOriginalForm} from '@/services/smart-bid/content/references/response/original-form-mapping'
import script from '@/views/features/application/smart-bid/authoring/page12/script.js?raw'
import {compileFunctions} from '../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('reopens exactly the fixed production output and independently verifies its bytes',async()=>{
 const selection={projectId:'P',producedFileId:'FILE',productionRequestRef:'REQUEST'}
 const bytes=new TextEncoder().encode('标书实件')
 const fileHash=createHash('sha256').update(bytes).digest('hex')
 let current=true
 const original={...selection,revisionId:'R',documentId:'D',fileHash,
  assertCurrent:()=>{if(!current)throw Error('PRODUCTION_STALE')},reopen:vi.fn(async()=>bytes.buffer)}
 const verified=await readProducedFileReviewVersion(selection,async input=>{expect(input).toEqual(selection);return original})
 expect(verified).toMatchObject({revisionId:'R',documentId:'D',versionHash:fileHash})
 await expect(readProducedFileReviewVersion(selection,async()=>({...original,productionRequestRef:'OTHER'})))
  .rejects.toThrow('CONTENT_PRODUCED_FILE_SCOPE')
 expect(original.reopen).toHaveBeenCalledOnce()
 await expect(readProducedFileReviewVersion(selection,async()=>({...original,reopen:async()=>new TextEncoder().encode('异版').buffer})))
  .rejects.toThrow('CONTENT_PRODUCED_FILE_HASH_MISMATCH')
 current=false
 expect(()=>verified.assertCurrent()).toThrow('PRODUCTION_STALE')
})

it('keeps both original file versions current from one complete read and rejects mixed request rows',async()=>{
 const bytes=new TextEncoder().encode('registered file')
 const fileHash=createHash('sha256').update(bytes).digest('hex')
 const targets=[{producedFileId:'F1',productionRequestRef:'REQ1'},{producedFileId:'F2',productionRequestRef:'REQ2'}]
 const rows=targets.map(({producedFileId:id,productionRequestRef})=>({id,productionRequestRef,projectId:'P',
  revisionId:'R',documentId:'D',fileHash,resourceVersionId:id,usage:null as string|null,
  lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}})).reverse()
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ProducedFile:{
  modelBinding:{modelId:'M',modelName:'ProducedFile'},columns:Object.keys(rows[0]!).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedReviewFiles:producedFileScenarioViews().selectedReviewFiles},
 }}})
 const view=ds.getView('ProducedFile','selectedReviewFiles')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ProducedFile'})
 const executeQuery=vi.fn(async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:2,Items:rows}}}),
 }))
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery})
 const host={runtime:{resolveView:()=>view},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const open=vi.fn(async({resourceVersionId}:{resourceVersionId:string})=>({projectId:'P',resourceVersionId,
  bytes:bytes.buffer,assertCurrent:()=>{}}))
 try{
  const versions=await readRegisteredProducedFileReviewVersions(host,targets,open)
  expect(versions.map(item=>item.producedFileId)).toEqual(['F1','F2'])
  expect(executeQuery).toHaveBeenCalledOnce()
  for(const version of versions)expect(()=>version.assertCurrent()).not.toThrow()
  const scope={projectId:'P',revisionId:'R',files:targets,approvalIds:[],assertCurrent:()=>{},
   targets:targets.map(({producedFileId})=>({kind:'FILE' as const,targetId:producedFileId,effectiveHash:fileHash,requiredUseIds:[]}))}
  const page=createContentReviewScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{
   readSelection:async()=>({...scope,selectionRef:'FIXED'}),
   openFile:open,readField:async()=>{throw Error('UNEXPECTED_FIELD')},
   readDecision:async()=>{throw Error('UNEXPECTED_APPROVAL')},
   readCompleted:async input=>{
    expect(input.targets.map(target=>target.versionHash)).toEqual([fileHash,fileHash])
    return {projectId:'P',revisionId:'R',completed:[],resolveAnchor:()=>{throw Error('UNEXPECTED_FINDING')},assertCurrent:()=>{}}
   },
  })
  const signal=new AbortController().signal
  await expect(page.invoke('content.review.readCoverage',{selectionRef:'OTHER'},signal)).rejects.toThrow('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
  const review=await page.invoke('content.review.readCoverage',{selectionRef:'FIXED'},signal)
  if(!('items' in review))throw Error('TEST_REVIEW_COVERAGE_REQUIRED')
  expect(review.items.map(item=>item.state)).toEqual(['CHECK_REQUIRED','CHECK_REQUIRED'])
  const showAlert=vi.fn(async()=>{})
  const {__init__,bindCoverage,openDetails}=compileFunctions(script,{$route:{query:{reviewSelectionRef:'FIXED'}},
   $page:{invokeHostCommand:async()=>review,showAlert}} as unknown as PageContext)
  if(!__init__||!bindCoverage||!openDetails)throw Error('TEST_REVIEW_PAGE_HANDLERS_REQUIRED')
  await __init__()
  expect(bindCoverage()).toEqual({status:'已覆盖 0 项，共 2 项'})
  await openDetails()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith('文件 F1 · 待同版检查\n文件 F2 · 待同版检查','审核覆盖明细')
  const request={projectId:'P',documentId:'D',revisionId:'R',requestKey:'RUN',inputDigest:'a'.repeat(64),purpose:'FORMAL' as const}
  const recovered=await recoverProductionRequest(request,{assertCurrent:host.assertCurrent,lookup:async()=>({
   request,state:'PARTIAL',assertCurrent:host.assertCurrent,missingScopeRefs:['ANNEX'],
   files:targets.map(target=>({...target,fileHash,completedScopeRefs:[target.producedFileId]})),
  })})
  if(recovered.state!=='PARTIAL')throw Error('TEST_PARTIAL_RECEIPT_REQUIRED')
  const queryCount=executeQuery.mock.calls.length
  const verified=await readCompletedProductionFiles(host,recovered,open)
  expect(verified.files.map(file=>[file.producedFileId,file.completedScopeRefs])).toEqual([['F1',['F1']],['F2',['F2']]])
  expect(executeQuery).toHaveBeenCalledTimes(queryCount+1)
  expect(()=>verified.assertCurrent()).not.toThrow()
  rows[0]!.usage='READ_ONLY'
  await expect(readRegisteredProducedFileReviewVersions(host,targets,open)).rejects.toThrow('CONTENT_PRODUCED_FILE_READ_ONLY')
  expect(open).toHaveBeenCalledTimes(6)
  rows[0]!.usage=null
  rows[0]!.productionRequestRef='OTHER'
  await expect(readRegisteredProducedFileReviewVersions(host,targets,open)).rejects.toThrow('CONTENT_PRODUCED_FILE_SCOPE')
  expect(open).toHaveBeenCalledTimes(6)
  expect(()=>verified.assertCurrent()).toThrow()
  expect(()=>review.assertCurrent()).toThrow()
  expect(bindCoverage()).toEqual({error:'审核覆盖已失效'})
  for(const version of versions)expect(()=>version.assertCurrent()).toThrow()
 }finally{ds.destroy()}
})

it('opens only the original registered resource version read through SPARK data',async()=>{
 const bytes=new TextEncoder().encode('registered file')
 const selection={producedFileId:'F',productionRequestRef:'REQUEST'}
 const row={id:'F',projectId:'P',productionRequestRef:'REQUEST',revisionId:'R',documentId:'D',
  fileHash:createHash('sha256').update(bytes).digest('hex'),resourceVersionId:'RESOURCE-V1'}
 const answer={id:'OBS',projectId:'P',producedFileId:'F',revisionId:'R',documentId:'D',fileHash:row.fileHash,
  locationRef:'PAGE-1-TOTAL',value:'0.00',unit:'元'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{ProducedFile:{
  modelBinding:{modelId:'M',modelName:'ProducedFile'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedReviewFile:producedFileScenarioViews().selectedReviewFile},
 },AnswerLocation:{
  modelBinding:{modelId:'ANSWER',modelName:'AnswerLocation'},
  columns:Object.keys(answer).map(name=>({name,type:'string',isPrimaryKey:name==='id'})),
  views:{default:{},selectedFileObservation:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',
   filters:([['projectId','projectId'],['id','observationId'],['producedFileId','producedFileId']] as const)
    .map(([field,ParamName])=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName}}))}}},
 }}})
 const view=ds.getView('ProducedFile','selectedReviewFile')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'ProducedFile'})
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const answers=ds.getView('AnswerLocation','selectedFileObservation')
 if(!answers)throw Error('TEST_FILE_ANSWER_VIEW_REQUIRED')
 const answerTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'AnswerLocation'})
 let hidden=false
 answers.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:answerTable.identity,scope:'a',readScope:()=> 'a',snapshot:answerTable.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...answer,lingma_sys_params:{r:[],e:[],h:hidden?['value']:[],m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@AnswerLocation@selectedFileObservation'?answers:view},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 let current=true
 const open=vi.fn(async()=>({projectId:'P',resourceVersionId:'RESOURCE-V1',bytes:bytes.buffer,
  assertCurrent:()=>{if(!current)throw Error('RESOURCE_STALE')}}))
 try{
  const result=await readRegisteredProducedFileReviewVersion(host,selection,open)
  expect(open).toHaveBeenCalledWith({...selection,projectId:'P',resourceVersionId:'RESOURCE-V1'})
  expect(result.versionHash).toBe(row.fileHash)
  current=false
  expect(()=>result.assertCurrent()).toThrow('RESOURCE_STALE')
  current=true
  await expect(readRegisteredProducedFileReviewVersion(host,{...selection,productionRequestRef:'OTHER'},open))
   .rejects.toThrow('CONTENT_PRODUCED_FILE_SCOPE')
  expect(open).toHaveBeenCalledOnce()
  await expect(readRegisteredProducedFileReviewVersion(host,selection,async()=>({...await open(),resourceVersionId:'OTHER'})))
   .rejects.toThrow('CONTENT_PRODUCED_FILE_RESOURCE_MISMATCH')
  expect(()=>result.assertCurrent()).toThrow()
  const production={projectId:'P',documentId:'D',revisionId:'R',requestKey:'RUN',inputDigest:'a'.repeat(64),purpose:'FORMAL' as const}
  const recover=(fileHash:string)=>recoverProductionRequest(production,{assertCurrent:host.assertCurrent,lookup:async()=>({
   request:production,state:'COMPLETED',assertCurrent:host.assertCurrent,
   files:[{...selection,fileHash,completedScopeRefs:['TOTAL']}],
  })})
  const completed=await recover(row.fileHash),mismatching=await recover('c'.repeat(64))
  if(completed.state!=='COMPLETED'||mismatching.state!=='COMPLETED')throw Error('TEST_PRODUCTION_RECEIPT_REQUIRED')
  await expect(readCompletedProductionFiles(host,completed,open)).resolves.toMatchObject({
   files:[{producedFileId:'F',versionHash:row.fileHash,completedScopeRefs:['TOTAL']}],
  })
  await expect(readCompletedProductionFiles(host,mismatching,open)).rejects.toThrow('CONTENT_PRODUCED_FILE_RECEIPT_SCOPE')
  const selected={...selection,observationId:'OBS',locationRef:'PAGE-1-TOTAL'}
  const approved={projectId:'P',revisionId:'R',producedFileId:'F',fileHash:row.fileHash,locationRef:selected.locationRef,
   approvalRef:'APP',value:'1.00',unit:'元',assertCurrent:host.assertCurrent}
  const form={projectId:'P',formRef:'FORM',formVersion:'V1'}
  const mapping=mapOriginalForm({...form,assertCurrent:()=>{},cells:[
   {cellRef:'T',rowRef:'1',columnRef:'TOTAL',meaningRef:'PRICE',fillerRef:'P',unit:'元',displayRef:'DECIMAL'},
  ]},{...form,fillerRef:'P',mappings:[{fieldRef:'TOTAL',cellRef:'T',meaningRef:'PRICE'}]})
  const placement={...form,fieldRef:'TOTAL',cellRef:'T',locationRef:selected.locationRef,revisionId:'R',
   producedFileId:'F',fileHash:row.fileHash,assertCurrent:()=>{}}
  const unused=async()=>{throw Error('UNEXPECTED_REVIEW_CALL')}
  const pending=vi.fn(async()=>undefined)
  const page=createContentReviewScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{
   readSelection:unused,openFile:open,readField:unused,readDecision:unused,readCompleted:unused,
   readProductionSelection:async requestedRef=>({selectionRef:requestedRef==='PENDING'?'PENDING':'RUN',request:production,source:{
    ...(requestedRef==='PENDING'?{lookup:pending}:{
     lookup:async()=>({request:production,state:'COMPLETED' as const,assertCurrent:host.assertCurrent,
      files:[{...selection,fileHash:row.fileHash,completedScopeRefs:['TOTAL']}] }),
    }),
    assertCurrent:host.assertCurrent,
   }}),
   readFileObservationSelection:async()=>({projectId:'P',input:selected,approved,originalForm:{mapping,placement},assertCurrent:host.assertCurrent}),
  })
  const recoverySignal=new AbortController()
  const openCount=open.mock.calls.length
  await expect(page.invoke('content.review.recoverProduction',{selectionRef:'PENDING'},recoverySignal.signal))
   .resolves.toMatchObject({state:'UNKNOWN'})
  expect(pending).toHaveBeenCalledWith(production)
  expect(open).toHaveBeenCalledTimes(openCount)
  await expect(page.invoke('content.review.recoverProduction',{selectionRef:'OTHER'},recoverySignal.signal))
   .rejects.toThrow('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
  const recovered=await page.invoke('content.review.recoverProduction',{selectionRef:'RUN'},recoverySignal.signal)
  expect(recovered).toMatchObject({state:'COMPLETED',verifiedFiles:[{producedFileId:'F',versionHash:row.fileHash}]})
  recoverySignal.abort()
  expect(()=>recovered.assertCurrent()).toThrow('CONTENT_REVIEW_PAGE_STALE')
  const observed=await page.invoke('content.review.readFileObservation',{selectionRef:'OBS'},new AbortController().signal)
  expect(observed).toMatchObject({locationRef:'PAGE-1-TOTAL',observedValueJson:'"0.00"',unit:'元',file:{versionHash:row.fileHash},
   comparison:{state:'MISMATCHED',approvalRef:'APP',valueJson:'"1.00"'},form:{formVersion:'V1',cellRef:'T',unitMatched:true}})
  if(!('file' in observed))throw Error('TEST_FILE_ANSWER_REQUIRED')
  expect(()=>compareApprovedFileAnswer(observed,{...approved,locationRef:'OTHER'})).toThrow('CONTENT_FILE_ANSWER_APPROVAL_SCOPE')
  const verified=verifyOriginalFormFileAnswer(observed,mapping,placement)
  expect(verified).toMatchObject({formVersion:'V1',cellRef:'T',unitMatched:true})
  expect(()=>verifyOriginalFormFileAnswer(observed,mapping,{...placement,formVersion:'V2'})).toThrow('CONTENT_FILE_ANSWER_FORM_SCOPE')
  answer.fileHash='a'.repeat(64)
  await expect(readRegisteredFileAnswer(host,selected,open)).rejects.toThrow('CONTENT_FILE_ANSWER_SCOPE')
  expect(()=>observed.assertCurrent()).toThrow()
  expect(()=>verified.assertCurrent()).toThrow()
  answer.fileHash=row.fileHash
  hidden=true
  await expect(readRegisteredFileAnswer(host,selected,open)).rejects.toThrow('DATA_VIEW_READ_ROW')
 }finally{ds.destroy()}
})
