/**
 * @module app:views/features/application/smart-bid/collaboration/handoff/bid-handoff-reader
 * 职责：第59项读原移交清单，并沿原任务来源核当前版签收。
 * 边界：原任务签收由正式任务来源提供；移交视图只持有清单及可追溯的事项身份。
 */
import {buildDataViewKey,type DataView,type ViewMetadata} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {assessBidHandoff} from '@/services/smart-bid/content/review/submission/bid-handoff-evidence'
import {hasContentScopeCondition,type ContentRevisionReadHost} from '../../authoring/model/content-revision-reader'

type Scope=Parameters<typeof assessBidHandoff>[0]
type Source=Parameters<typeof assessBidHandoff>[1]
type Item=Source['items'][number]
const keys=['projectId','lotId','roundId','stageId','handoffId'] as const
const error='BID_HANDOFF_REGISTERED_READ'

/** 页08所属场景按原清单标识固定移交范围。 */
export function bidHandoffReadView(primaryKey:string):ViewMetadata{
 if(!identity(primaryKey))throw Error(error)
 return {commitMode:'staged',autoLoad:false,autoSelectFirst:false,autoCurrentFirst:false,
  scopeFilter:{logic:'and',filters:keys.map(field=>({field,operator:'eq',value:{Type:'GetInputParam',ParamName:field}}))},
  queryConfig:{autoQuery:false,cacheType:'none',pagination:'none',fields:[...new Set([primaryKey,...keys,'items'])]}}
}

function valid(view:DataView){
 return view.dataTable?.modelBinding?.modelName==='BidHandoff'&&view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
  keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))
}

function readItem(value:unknown):Item{
 if(!isRecord(value))throw Error(error)
 const {id,versionRef,originalAssigneeId,receiverId,openIssueRefs,followupRef,nextDueAt}=value
 if(!identity(id)||!identity(versionRef)||!identity(originalAssigneeId)||!identity(receiverId)||
  (followupRef!==null&&!identity(followupRef))||(nextDueAt!==null&&!identity(nextDueAt))||!Array.isArray(openIssueRefs))
  throw Error(error)
 const issues=Array.from<unknown>(openIssueRefs)
 if(!issues.every(identity))throw Error(error)
 return Object.freeze({id,versionRef,originalAssigneeId,receiverId,followupRef,nextDueAt,openIssueRefs:Object.freeze(issues)})
}

/** 先核唯一原清单和原可读字段，再请正式任务来源读取其签收。 */
export async function readRegisteredBidHandoff(host:ContentRevisionReadHost,
 selection:Omit<Scope,'projectId'>&Readonly<{handoffId:string}>,
 readReceipts:(scope:Scope,items:readonly Item[])=>Promise<Pick<Source,'receipts'|'assertCurrent'>>){
 const {runtime,scenarioId,projectId}=host,{lotId,roundId,stageId,handoffId}=selection
 const scope=Object.freeze({projectId,lotId,roundId,stageId}),query={...scope,handoffId}
 host.assertCurrent()
 if(![scenarioId,...Object.values(query)].every(identity))throw Error(error)
 const key=buildDataViewKey('BidHandoff','originalHandoff',scenarioId),view=runtime.resolveView(key)
 if(!view||!valid(view)||view.hasEditingChanges())throw Error(error)
 view.queryContext={...view.queryContext,...query}
 const assertScope=()=>{
  host.assertCurrent()
  if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
   keys.some(field=>view.queryContext[field]!==query[field]))throw Error(error)
 }
 await view.refresh()
 assertScope()
 const row=view.rows[0]
 if(!row||view.countReported!==true||view.total!==1||view.rows.length!==1||view.nextPageAvailable===true)throw Error(error)
 const assertRead=view.captureReadResult(),assertRow=view.captureReadRow(row,[...keys,'items'])
 const assertCurrent=()=>{assertScope();assertRead();assertRow()}
 assertCurrent()
 if(keys.some(field=>row[field]!==query[field])||!Array.isArray(row['items']))throw Error(error)
 const items=Object.freeze(Array.from<unknown>(row['items']).map(readItem))
 const selected=await readReceipts(scope,items)
 return assessBidHandoff(scope,{items,receipts:selected.receipts,assertCurrent:()=>{assertCurrent();selected.assertCurrent()}})
}
