import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {contentSubmissionScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import {readRegisteredTenderOutcome} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-tender-outcome-reader'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import script from '@/views/features/application/smart-bid/authoring/page14/script.js?raw'
import {compileFunctions} from '../../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../../packages/spark-component/src/page/context/types'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('keeps recommendations and whole-round decisions separate and rejects another bidder',async()=>{
 const scope={projectId:'P',lotId:'LOT',roundId:'R',stageId:'STAGE',subjectId:'ENT'}
 const time='2026-11-18T12:00:00+08:00'
 const row={...scope,id:'ROW',eventRef:'REC',kind:'RECOMMENDED',issuerRef:'ISSUER',documentVersionId:'DOC',
  eventAt:time,knownAt:time,supersedesRef:null}
 const pageViews=contentSubmissionScenarioViews({SubmissionAttempt:'id',ChannelReceipt:'id',SubmissionReconciliation:'id',TenderOutcome:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{TenderOutcome:{
  modelBinding:{modelId:'M',modelName:'TenderOutcome'},
  columns:Object.keys(row).map(name=>({name,type:'string',isPrimaryKey:name==='id'})),
  views:{default:{},...pageViews.TenderOutcome},
 }}})
 const subject=ds.getView('TenderOutcome','officialSubjectEvents'),round=ds.getView('TenderOutcome','officialRoundEvents')
 if(!subject||!round)throw Error('TEST_OUTCOME_VIEWS_REQUIRED')
 let subjectId='ENT'
 for(const [view,isRound] of [[subject,false],[round,true]] as const){
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'TenderOutcome'})
  const original=isRound?{...row,id:'ROUND',eventRef:'STOP',kind:'ROUND_TERMINATED',subjectId:null}:row
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...original,subjectId:isRound?null:subjectId,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
  })})
 }
 const host={runtime:{resolveView:(key:string)=>key==='S@TenderOutcome@officialSubjectEvents'?subject:
  key==='S@TenderOutcome@officialRoundEvents'?round:undefined},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  const page=createContentSubmissionScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host)
  const signal=new AbortController().signal,showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
  const {openOutcome,bindOriginalSubmission}=compileFunctions(script,{$route:{query:{...scope,outcomeKnownAt:time}},$page:{
   invokeHostCommand:(name:string,params:unknown)=>page.invoke(name,params,signal),showAlert,showMessage,
  }} as unknown as PageContext)
  if(!openOutcome||!bindOriginalSubmission)throw Error('TEST_OUTCOME_PAGE_HANDLERS_REQUIRED')
  expect(bindOriginalSubmission()).toEqual({visible:false})
  await openOutcome()
  expect(showAlert).toHaveBeenCalledExactlyOnceWith(
   `主体 ENT · 获得推荐\n轮次 R · 已终止\n证据截至 ${time}\nREC · 获得推荐 · 原件 DOC\nSTOP · 整轮终止决定 · 原件 DOC`,'阶段结果')
  const result=await readRegisteredTenderOutcome(host,{...scope,knownAt:time})
  expect(result).toMatchObject({subjectState:'RECOMMENDED',roundState:'TERMINATED',evidence:[{eventRef:'REC'},{eventRef:'STOP'}]})
  expect(subject.queryContext).toMatchObject(scope)
  expect(round.queryContext).not.toHaveProperty('subjectId')
  subjectId='OTHER'
  await expect(readRegisteredTenderOutcome(host,{...scope,knownAt:time})).rejects.toThrow('TENDER_OUTCOME_READ_SCOPE')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{ds.destroy()}
})
