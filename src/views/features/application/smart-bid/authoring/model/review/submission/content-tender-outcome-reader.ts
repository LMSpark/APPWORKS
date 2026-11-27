/**
 * @module app:views/features/application/smart-bid/authoring/model/review/submission/content-tender-outcome-reader
 * 职责：页14按主体与轮次的原结果视图核阶段结果。
 * 边界：正式主体和轮次事件由原视图提供，阶段结果仅按同次证据投影。
 * AI用途：区分候选推荐、正式结果和整轮终止各自的证据。
 */
import {buildDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {assertRegistrationViewRefreshable} from '../../../../authority/original-registration-view'
import {projectTenderOutcome} from '@/services/smart-bid/content/review/submission/tender-outcome-evidence'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../../content-revision-reader'

/** 原阶段结果的业务范围与获知时点。 */
type Scope=Parameters<typeof projectTenderOutcome>[0]
/** 一笔可核验的正式结果事件。 */
type Event=Parameters<typeof projectTenderOutcome>[1]['officialEvents'][number]
const keys=['projectId','lotId','roundId','stageId'] as const
const fields=[...keys,'subjectId','kind','eventRef','issuerRef','documentVersionId','eventAt','knownAt','supersedesRef']
const valid=(view:DataView,round:boolean)=>view.dataTable?.modelBinding?.modelName==='TenderOutcome'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&view.queryConfig.allPages===true&&
 (view.queryConfig.cacheType===undefined||view.queryConfig.cacheType==='none')&&
 keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))&&
 (round?hasContentScopeCondition(view,'kind','ROUND_TERMINATED'):
  hasContentScopeCondition(view,'subjectId',{Type:'GetInputParam',ParamName:'subjectId'}))

/** 分开读本主体和全轮终止原件，不查询其他投标人的结果。 */
export async function readRegisteredTenderOutcome(host:ContentRevisionReadHost,selection:Omit<Scope,'projectId'>&Readonly<{knownAt:string}>){
 const {runtime,scenarioId,projectId}=host,{lotId,roundId,stageId,subjectId,knownAt}=selection
 const scope={projectId,lotId,roundId,stageId,subjectId}
 host.assertCurrent()
 const error='TENDER_OUTCOME_READ_SCOPE'
 if(![scenarioId,...Object.values(scope)].every(identity)||!identity(knownAt))throw Error(error)
 const read=async(round:boolean)=>{
  const key=buildDataViewKey('TenderOutcome',round?'officialRoundEvents':'officialSubjectEvents',scenarioId)
  const view=runtime.resolveView(key)
  if(!view||!valid(view,round)||view.hasEditingChanges())throw Error('TENDER_OUTCOME_VIEW_REQUIRED')
  const stale='TENDER_OUTCOME_READ_STALE'
  assertRegistrationViewRefreshable(view,stale)
  const context=round?{projectId,lotId,roundId,stageId}:scope
  view.queryContext={...view.queryContext,...context}
  const assertScope=()=>{
   host.assertCurrent()
   if(runtime.resolveView(key)!==view||!valid(view,round)||view.loadingError||view.hasEditingChanges()||
    Object.entries(context).some(([field,value])=>view.queryContext[field]!==value))throw Error(stale)
  }
  const refreshed=await view.requestRefresh({defer:false})
  if(refreshed.refreshStatus!=='read')throw Error(stale)
  assertScope()
  if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true)throw Error('TENDER_OUTCOME_READ_INCOMPLETE')
  const assertRead=view.captureReadResult()
  const events=view.rows.map((row):Event=>{
   const assertRow=view.captureReadRow(row,fields)
   const {kind,eventRef,issuerRef,documentVersionId,eventAt,knownAt:acquiredAt,supersedesRef}=row
   if(keys.some(field=>row[field]!==scope[field])||row['subjectId']!==(round?null:subjectId)||!identity(eventRef)||
    !identity(issuerRef)||!identity(documentVersionId)||!identity(eventAt)||!identity(acquiredAt)||
    (supersedesRef!==null&&!identity(supersedesRef)))throw Error(error)
   const common={projectId,lotId,roundId,stageId,eventRef,issuerRef,documentVersionId,eventAt,knownAt:acquiredAt,
    supersedesRef,assertCurrent:()=>{assertScope();assertRead();assertRow()}}
   if(round&&kind==='ROUND_TERMINATED')return {...common,subjectId:null,kind}
   if(!round&&(kind==='QUALIFIED'||kind==='DISQUALIFIED'||kind==='RECOMMENDED'||kind==='AWARDED'||kind==='NOT_AWARDED'))
    return {...common,subjectId,kind}
   throw Error(error)
  })
  return {events,assertCurrent:()=>{assertScope();assertRead()}}
 }
 const [subject,round]=await Promise.all([read(false),read(true)])
 return projectTenderOutcome(scope,{knownAt,officialEvents:[...subject.events,...round.events],
  assertCurrent:()=>{subject.assertCurrent();round.assertCurrent()}})
}
