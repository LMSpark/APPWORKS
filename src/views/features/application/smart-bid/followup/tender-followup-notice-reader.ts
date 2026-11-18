/**
 * @module app:views/features/application/smart-bid/followup/tender-followup-notice-reader
 * 职责：第57项从原通知 DataView 形成指定获知时点的通知链。
 */
import {buildDataViewKey,type DataView,type ViewMetadata} from '@spark-appworks/spark-data'
import {mergeTenderFollowupNoticeReads,projectTenderFollowupNotices} from '@/services/smart-bid/content/references/followup/tender-followup-notice'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../authoring/model/content-revision-reader'

type Scope=Parameters<typeof projectTenderFollowupNotices>[0]
type Notice=Parameters<typeof mergeTenderFollowupNoticeReads>[1][number]
const keys=['projectId','lotId','roundId','subjectId','stageId'] as const
const required=['noticeId','documentVersionId','sourceRef','issuerRef','channelId','issuedAt','knownAt'] as const
const optional=['previousNoticeRef','originalObjectRef','replyDueAt','permittedScopeRef'] as const
const fields=[...keys,...required,...optional,'kind','change']
const model='TenderFollowup',viewName='officialNotices',error='TENDER_FOLLOWUP_READ_SCOPE'
const kinds=['INQUIRY','CLARIFICATION','REVIEW','REPRICE_INVITATION','OTHER'] as const
const changes=['INITIAL','SUPPLEMENT','CORRECTION','CANCELLATION'] as const

/** 读取同一范围的完整原通知集合，避免把截断的父链归为缺失。 */
export function tenderFollowupNoticeView(primaryKey:string):ViewMetadata{
 if(!identity(primaryKey))throw Error(error)
 return {commitMode:'staged',autoLoad:false,autoSelectFirst:false,autoCurrentFirst:false,
  scopeFilter:{logic:'and',filters:keys.map(field=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName:field}}))},
  queryConfig:{autoQuery:false,cacheType:'none',allPages:true,fields:[...new Set([primaryKey,...fields])]}}
}

function valid(view:DataView){
 return view.dataTable?.modelBinding?.modelName===model&&view.commitMode==='staged'&&
  view.queryConfig.autoQuery===false&&view.queryConfig.allPages===true&&
  keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

function instant(value:string){
 const time=Date.parse(value)
 if(!Number.isFinite(time)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(value))throw Error('TENDER_FOLLOWUP_READ_TIME')
 return time
}

/** 只归并截至查询时点已经获知的读取证据，并在使用前复核原视图身份。 */
export async function readRegisteredTenderFollowupNotices(host:ContentRevisionReadHost,selection:Omit<Scope,'projectId'>,
 knownAt:string){
 const {runtime,scenarioId,projectId}=host
 const {lotId,roundId,subjectId,stageId}=selection
 const scope={projectId,lotId,roundId,subjectId,stageId}
 host.assertCurrent()
 if(![scenarioId,...Object.values(scope)].every(identity))throw Error(error)
 const cutoff=instant(knownAt)
 const key=buildDataViewKey(model,viewName,scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error('TENDER_FOLLOWUP_VIEW_REQUIRED')
 view.queryContext={...view.queryContext,...scope}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   keys.some(field=>view.queryContext[field]!==scope[field]))throw Error(error)
 }
 await view.refresh()
 assertScope()
 if(view.countReported!==true||view.nextPageAvailable===true||view.total!==view.rows.length)
  throw Error('TENDER_FOLLOWUP_READ_INCOMPLETE')
 const assertRead=view.captureReadResult()
 const assertCurrent=()=>{assertScope();assertRead()}
 const groups=new Map<string,Notice[]>()
 for(const row of view.rows){
  const assertKnown=view.captureReadRow(row,[...keys,'knownAt'])
  assertKnown()
  if(keys.some(field=>row[field]!==scope[field])||!identity(row['knownAt']))throw Error(error)
  if(instant(row['knownAt'])>cutoff)continue
  const assertRow=view.captureReadRow(row,fields)
  assertRow()
  const {noticeId,documentVersionId,sourceRef,issuerRef,channelId,issuedAt,previousNoticeRef,originalObjectRef,replyDueAt,permittedScopeRef}=row
  const kind=kinds.find(value=>value===row['kind']),change=changes.find(value=>value===row['change'])
  if(!kind||!change||!identity(noticeId)||!identity(documentVersionId)||!identity(sourceRef)||!identity(issuerRef)||
   !identity(channelId)||!identity(issuedAt)||(previousNoticeRef!==null&&!identity(previousNoticeRef))||
   (originalObjectRef!==null&&!identity(originalObjectRef))||(replyDueAt!==null&&!identity(replyDueAt))||
   (permittedScopeRef!==null&&!identity(permittedScopeRef)))throw Error(error)
  const entries=groups.get(noticeId)??[]
  entries.push({...scope,noticeId,documentVersionId,sourceRef,issuerRef,channelId,kind,change,issuedAt,knownAt:row['knownAt'],
   previousNoticeRef,originalObjectRef,replyDueAt,permittedScopeRef,assertCurrent:()=>{assertCurrent();assertRow()}})
  groups.set(noticeId,entries)
 }
 const notices=await Promise.all([...groups.values()].map(entries=>mergeTenderFollowupNoticeReads(scope,entries)))
 return projectTenderFollowupNotices(scope,{knownAt,notices,assertCurrent})
}
