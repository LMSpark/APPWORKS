/**
 * @module app:views/features/application/smart-bid/authoring/model/content-draft-save-reader
 * 职责：从正式办理记录的命名视图回查页11原保存结果。
 * 边界：只读原办理命名视图，草稿编辑与原保存命令各自维护状态。
 * AI用途：检查保存结果未知时是否可以从原办理视图确认结果。
 */
import {parseDataViewKey,type DataView} from '@spark-appworks/spark-data'
import {readOriginalContentDraftSave} from '@/services/smart-bid/content/draft/content-draft-save-recovery'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {hasContentScopeCondition,type ContentRevisionReadHost} from './content-revision-reader'

/** 独立于当前草稿内容的原保存回查请求。 */
type Request=Parameters<typeof readOriginalContentDraftSave>[0]
const keys=['projectId','draftId','authorId','requestKey','requestDigest'] as const
const fields=[...keys,'expectedDraftVersion','contentDigest','state']
const valid=(view:DataView)=>view.dataTable?.modelBinding?.modelName!=='WorkingDraft'&&
 view.commitMode==='staged'&&view.queryConfig.autoQuery===false&&
 keys.every(field=>hasContentScopeCondition(view,field,{Type:'GetInputParam',ParamName:field}))

/** 原办理视图地址由正式场景交付，原作者只能取当前会话。 */
export function readRegisteredOriginalContentDraftSave(host:ContentRevisionReadHost&Readonly<{
 draftId:string;actorUserId:string;receiptDataViewKey:string
}>,input:Omit<Request,'projectId'|'draftId'|'authorId'>){
 const {runtime,scenarioId,projectId,draftId,actorUserId,receiptDataViewKey:key}=host
 const error='CONTENT_DRAFT_SAVE_RECEIPT_SCOPE'
 host.assertCurrent()
 const parsed=parseDataViewKey(key)
 if(!identity(scenarioId)||parsed?.scope!==scenarioId||parsed.tableName==='WorkingDraft')throw Error(error)
 return readOriginalContentDraftSave({...input,projectId,draftId,authorId:actorUserId},{
  assertCurrent:()=>host.assertCurrent(),
  async lookup(request){
   const {authorId,requestKey,requestDigest}=request,context={projectId,draftId,authorId,requestKey,requestDigest}
   const view=runtime.resolveView(key)
   if(!view||!valid(view)||view.hasEditingChanges())throw Error('CONTENT_DRAFT_SAVE_RECEIPT_VIEW_REQUIRED')
   view.queryContext={...view.queryContext,...context}
   const assertScope=()=>{
    host.assertCurrent()
    if(runtime.resolveView(key)!==view||!valid(view)||view.loadingError||view.hasEditingChanges()||
     keys.some(field=>view.queryContext[field]!==context[field]))throw Error('CONTENT_DRAFT_SAVE_RECEIPT_STALE')
   }
   await view.refresh()
   assertScope()
   if(view.countReported!==true||view.total!==view.rows.length||view.nextPageAvailable===true||view.rows.length>1)
    throw Error('CONTENT_DRAFT_SAVE_RECEIPT_INCOMPLETE')
   const assertResult=view.captureReadResult(),row=view.rows[0]
   if(!row)return {...request,state:'UNKNOWN',assertCurrent:()=>{assertScope();assertResult()}}
   const {state,draftVersion,receiptRef,terminalRef}=row
   const assertRow=view.captureReadRow(row,state==='SAVED'?[...fields,'draftVersion','receiptRef']:
    state==='NOT_SAVED'?[...fields,'terminalRef']:fields)
   const assertCurrent=()=>{assertScope();assertResult();assertRow()}
   if(Object.entries(request).some(([field,value])=>row[field]!==value))throw Error(error)
   if(state==='SAVED'&&identity(draftVersion)&&identity(receiptRef))return {...request,state,draftVersion,receiptRef,assertCurrent}
   if(state==='NOT_SAVED'&&identity(terminalRef))return {...request,state,terminalRef,assertCurrent}
   if(state==='UNKNOWN')return {...request,state,assertCurrent}
   throw Error(error)
  },
 })
}
