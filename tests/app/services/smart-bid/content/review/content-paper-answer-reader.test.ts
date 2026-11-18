import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {createContentReviewScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-script-host'
import {readRegisteredPaperAnswer} from '@/views/features/application/smart-bid/authoring/model/review/content-paper-answer-reader'
import script from '@/views/features/application/smart-bid/authoring/page12/script.js?raw'
import {compileFunctions} from '../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('requires the exact registered copy and page before returning the original observed value',async()=>{
 const input={paperRef:'PAPER',copyRef:'COPY',revisionId:'R',observationId:'OBS',pageRef:'P01',locationRef:'TOTAL'}
 const row={id:'OBS',projectId:'P',paperRef:'PAPER',copyRef:'COPY',revisionId:'R',
  pageRef:'P01',locationRef:'TOTAL',evidenceRef:'SCAN',value:'0.00',unit:'元'}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{AnswerLocation:{
  modelBinding:{modelId:'M',modelName:'AnswerLocation'},
  columns:Object.keys(row).map(name=>({name,type:'string',isPrimaryKey:name==='id'})),
  views:{default:{},selectedPaperObservation:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',
   filters:([['projectId','projectId'],['id','observationId'],['paperRef','paperRef'],['copyRef','copyRef']] as const)
    .map(([field,ParamName])=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName}}))}}},
 }}})
 const view=ds.getView('AnswerLocation','selectedPaperObservation')
 if(!view)throw Error('TEST_PAPER_VIEW_REQUIRED')
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'AnswerLocation'})
 let copyRef='COPY',hidden=false
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'p',readScope:()=> 'p',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,copyRef,lingma_sys_params:{r:[],e:[],h:hidden?['value']:[],m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@AnswerLocation@selectedPaperObservation'?view:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const readPaper:Parameters<typeof readRegisteredPaperAnswer>[2]=async scope=>({...scope,registrationRef:'REG',
  pageRefs:['P01'],assertCurrent:()=>{}})
 try{
  const unused=async()=>{throw Error('UNEXPECTED_REVIEW_CALL')}
  const page=createContentReviewScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{
   readSelection:unused,openFile:unused,readField:unused,readDecision:unused,readCompleted:unused,
   readPaperObservationSelection:async()=>({projectId:'P',input,readPaper,assertCurrent:host.assertCurrent}),
  })
  const controller=new AbortController()
  await expect(page.invoke('content.review.readPaperObservation',{selectionRef:'OTHER'},controller.signal))
   .rejects.toThrow('CONTENT_REVIEW_PAGE_SELECTION_SCOPE')
  const observed=await page.invoke('content.review.readPaperObservation',{selectionRef:'OBS'},controller.signal)
  expect(observed).toMatchObject({copyRef:'COPY',pageRef:'P01',observedValueJson:'"0.00"',unit:'元',evidenceRef:'SCAN'})
  const showAlert=vi.fn(async()=>{})
  const invokeHostCommand=vi.fn((name:string,params:unknown)=>page.invoke(name,params,controller.signal))
  const {__init__,bindCoverage,bindObservations,openPaperObservation}=compileFunctions(script,
   {$route:{query:{paperObservationRef:'OBS'}},$page:{invokeHostCommand,showAlert}} as unknown as PageContext)
  if(!__init__||!bindCoverage||!bindObservations||!openPaperObservation)throw Error('TEST_REVIEW_PAGE_HANDLERS_REQUIRED')
  await __init__()
  expect(bindCoverage()).toEqual({visible:false})
  expect(bindObservations()).toEqual({visible:true})
  expect(invokeHostCommand).not.toHaveBeenCalled()
  await openPaperObservation()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith('纸件 PAPER · 份次 COPY\n页 P01 · 位置 TOTAL\n原实填值 "0.00" 元\n原登记 REG · 观察凭据 SCAN','纸件实填回读')
  await expect(readRegisteredPaperAnswer(host,{...input,pageRef:'P02'},readPaper)).rejects.toThrow('CONTENT_PAPER_ANSWER_SCOPE')
  copyRef='OTHER'
  await expect(readRegisteredPaperAnswer(host,input,readPaper)).rejects.toThrow('CONTENT_PAPER_ANSWER_SCOPE')
  expect(()=>observed.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  copyRef='COPY';hidden=true
  await expect(readRegisteredPaperAnswer(host,input,readPaper)).rejects.toThrow('DATA_VIEW_READ_ROW')
  controller.abort()
  await expect(page.invoke('content.review.readPaperObservation',{selectionRef:'OBS'},controller.signal))
   .rejects.toThrow('CONTENT_REVIEW_PAGE_STALE')
 }finally{ds.destroy()}
})
