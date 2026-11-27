import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {contentSubmissionScenarioViews} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-submission-scenario-views'
import {readRegisteredTenderOutcome} from '@/views/features/application/smart-bid/authoring/model/review/submission/content-tender-outcome-reader'
import {createContentSubmissionScriptHost} from '@/views/features/application/smart-bid/authoring/ui/entry/content-submission-script-host'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'

it.each(['exact','subject','round'] as const)('keeps recommendations and whole-round decisions separate: %s',async mode=>{
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
 let subjectId='ENT',paused=false,successor=false
 let release:()=>void=()=>{}
 const gate=new Promise<void>(resolve=>{release=resolve})
 const save=vi.fn(async()=>{throw Error('NO_WRITE')})
 for(const [view,isRound] of [[subject,false],[round,true]] as const){
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'TenderOutcome'})
  const original=isRound?{...row,id:'ROUND',eventRef:'STOP',kind:'ROUND_TERMINATED',subjectId:null}:row
  view.bindQueryExecutor({save,executeQuery:async()=>{
   const selected=mode===(isRound?'round':'subject')
   const eventRef=selected&&successor?'SUCCESSOR':original.eventRef
   if(selected&&!paused){paused=true;await gate}
   return new DataSpaceQueryContext({
    identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
     data:{Count:1,Items:[{...original,eventRef,subjectId:isRound?null:subjectId,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
   })
  }})
 }
 const host={runtime:{resolveView:(key:string)=>key==='S@TenderOutcome@officialSubjectEvents'?subject:
  key==='S@TenderOutcome@officialRoundEvents'?round:undefined},scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 try{
  const page=createContentSubmissionScriptHost({...host.runtime,generation:1,isLoaded:true,destroyed:false},host)
  const signal=new AbortController().signal
  if(mode!=='exact'){
   const result=page.invoke('content.submission.readOutcome',{...scope,knownAt:time},signal).then(value=>({value}),error=>({error}))
   await vi.waitFor(()=>expect(paused).toBe(true))
   successor=true
   const replaced=mode==='round'?round:subject
   await replaced.refresh()
   release()
   expect(await result).toEqual({error:expect.objectContaining({message:'TENDER_OUTCOME_READ_STALE'})})
   expect(replaced.rows[0]).toMatchObject({eventRef:'SUCCESSOR'})
   expect(save).not.toHaveBeenCalled()
   return
  }
  const hostResult=await page.invoke('content.submission.readOutcome',{...scope,knownAt:time},signal)
  expect(hostResult).toMatchObject({subjectState:'RECOMMENDED',roundState:'TERMINATED'})
  const result=await readRegisteredTenderOutcome(host,{...scope,knownAt:time})
  expect(result).toMatchObject({subjectState:'RECOMMENDED',roundState:'TERMINATED',evidence:[{eventRef:'REC'},{eventRef:'STOP'}]})
  expect(subject.queryContext).toMatchObject(scope)
  expect(round.queryContext).not.toHaveProperty('subjectId')
  subjectId='OTHER'
  await expect(readRegisteredTenderOutcome(host,{...scope,knownAt:time})).rejects.toThrow('TENDER_OUTCOME_READ_SCOPE')
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(save).not.toHaveBeenCalled()
 }finally{release();ds.destroy()}
})
