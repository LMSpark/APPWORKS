import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {createContentReviewScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-review-script-host'
import {readRegisteredPaperAnswer} from '@/views/features/application/smart-bid/authoring/model/review/content-paper-answer-reader'
import {contentProductionReviewScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/production/production-scenario-views'
import script from '@/views/features/application/smart-bid/authoring/page12/script.js?raw'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('requires the exact registered copy and page before returning the original observed value',async()=>{
 const row={id:'OBS',projectId:'P',paperRef:'PAPER',copyRef:'COPY',revisionId:'R',
  pageRef:'P01',locationRef:'TOTAL',evidenceRef:'SCAN',value:'0.00',unit:'元',producedFileId:'REG'}
 const registration={id:'REG',projectId:'P',paperRef:'PAPER',revisionId:'R',copies:[
  {copyRef:'COPY',pageRefs:['P01']},{copyRef:'SECOND',pageRefs:['P02']},
 ]}
 const {ProducedFile,AnswerLocation}=contentProductionReviewScenarioViews()
 const ds=DataSet.fromJson({scenarioId:'S',tables:{AnswerLocation:{
  modelBinding:{modelId:'M',modelName:'AnswerLocation'},
  columns:Object.keys(row).map(name=>({name,type:'string',isPrimaryKey:name==='id'})),
  views:{default:{},selectedPaperObservation:AnswerLocation.selectedPaperObservation},
 },ProducedFile:{modelBinding:{modelId:'PAPER-M',modelName:'ProducedFile'},
  columns:Object.keys(registration).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedPaperRegistration:ProducedFile.selectedPaperRegistration},
 }}})
 const view=ds.getView('AnswerLocation','selectedPaperObservation')
 if(!view)throw Error('TEST_PAPER_VIEW_REQUIRED')
 const paperView=ds.getView('ProducedFile','selectedPaperRegistration')!
 const paperTable=new DataSpaceQueryTable({scenarioId:'S',metaName:'ProducedFile'})
 paperView.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:paperTable.identity,scope:'paper',readScope:()=> 'paper',
  snapshot:paperTable.applyResult({Result:{primaryKeyField:'id',data:{Count:1,Items:[{
   ...registration,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false},
  }]}}}),
 })})
 const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'AnswerLocation'})
 const copyRef='COPY',pageRef='P01',hidden=false,producedFileId='REG'
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'p',readScope:()=> 'p',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,copyRef,pageRef,producedFileId,lingma_sys_params:{r:[],e:[],h:hidden?['value']:[],m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@AnswerLocation@selectedPaperObservation'?view:
  key==='S@ProducedFile@selectedPaperRegistration'?paperView:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  const unused=async()=>{throw Error('UNEXPECTED_REVIEW_CALL')}
  const page=createContentReviewScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host,{
   readSelection:unused,openFile:unused,readField:unused,readDecision:unused,readCompleted:unused,
  })
  const controller=new AbortController()
  await expect(page.invoke('content.review.readPaperObservation',{selectionRef:'OTHER'},controller.signal))
   .rejects.toThrow('CONTENT_PAPER_ANSWER_SCOPE')
  const observed=await page.invoke('content.review.readPaperObservation',{selectionRef:'OBS'},controller.signal)
  expect(observed).toMatchObject({copyRef:'COPY',pageRef:'P01',observedValueJson:'"0.00"',unit:'元',evidenceRef:'SCAN'})
  const registrationQueryConfig=paperView.queryConfig
  paperView.queryConfig={...registrationQueryConfig,cacheType:'page'}
  expect(()=>observed.assertCurrent()).toThrow('CONTENT_PAPER_REGISTRATION_STALE')
  await expect(readRegisteredPaperAnswer(host,'OBS')).rejects.toThrow('CONTENT_PAPER_REGISTRATION_VIEW_REQUIRED')
  paperView.queryConfig=registrationQueryConfig
  const invokeHostCommand=vi.fn((name:string,params:unknown)=>page.invoke(name,params,controller.signal))
  expect(invokeHostCommand).toBeTypeOf('function')
 }finally{ds.destroy()}
})
