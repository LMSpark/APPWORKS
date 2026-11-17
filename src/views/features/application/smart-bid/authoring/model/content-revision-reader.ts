/**
 * @module app:views/features/application/smart-bid/authoring/model/content-revision-reader
 * 职责：在正文宿主的原运行实例内读取精确候选和当前头修订索引。
 * 边界：只查询原DataView，不复制修订、读取快照载荷或执行保存/采用；不提供并发提交保证。
 * AI用途：正文预演先核项目头及精确索引，再沿snapshotHash读取已验证的完整快照资源。
 */
import {buildDataViewKey,type DataView,type DataViewFilterTree} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'

/** 当前正文宿主提供的运行实例和作用域，不从候选重建认证信息。 */
export type ContentRevisionReadHost=Readonly<{
 runtime:Pick<PageRuntime,'resolveView'>;scenarioId:string;projectId:string;assertCurrent:()=>void
}>
/** 空项目首稿必须明确传null；非空头只接受完整精确ID。 */
export type ContentRevisionSelection=Readonly<{candidateRevisionId:string;expectedHead:string|null}>
/** 下游继续绑定原视图；这只是修订索引，完整快照及当次采用另核。 */
export type ContentRevisionReadBinding=Readonly<{
 candidateDataViewKey:string;headDataViewKey:string|null;assertCurrent:()=>void
}>

/** 编制读取所需的AND常驻条件；不解释成额外授权或替代正式查询过滤。 */
export function hasContentScopeCondition(view:DataView,field:string,value:unknown):boolean {
 const includes=(node:DataViewFilterTree):boolean=>{
  if('logic' in node)return node.logic==='and'&&node.filters.some(includes)
  if(node.field!==field||node.operator!=='eq')return false
  if(typeof value==='string')return node.value===value
  return isRecord(node.value)&&isRecord(value)&&node.value['Type']===value['Type']&&node.value['ParamName']===value['ParamName']
 }
 return view.scopeFilter!==undefined&&includes(view.scopeFilter)
}
function valid(view:DataView,parameter:string,status:string):boolean {
 return view.dataTable?.modelBinding?.modelName==='ContentRevision'&&view.commitMode==='staged'
  &&hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'})
  &&hasContentScopeCondition(view,'id',{Type:'GetInputParam',ParamName:parameter})&&hasContentScopeCondition(view,'status',status)
}
function identity(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.trim()===value}
function available(view:DataView,target:{projectId:string;id:string;status:string}):boolean {
 const {projectId,id,status}=target
 const row=view.rows[0]
 return !view.loadingError&&!view.hasEditingChanges()&&view.rows.length===1&&row?.['id']===id&&row['projectId']===projectId
  &&row['status']===status&&identity(row['snapshotHash'])
  &&['id','projectId','status','snapshotHash'].every(field=>view.fieldAccess(row,field).read==='visible')
}

/** 查询前后均核宿主与精确参数；首稿不查询头视图，迟到结果不产生有效绑定。 */
export async function readContentRevisions(host:ContentRevisionReadHost,input:ContentRevisionSelection):Promise<ContentRevisionReadBinding> {
 const {runtime,scenarioId,projectId,assertCurrent:assertHost}=host
 const {candidateRevisionId,expectedHead}=input
 assertHost()
 if(!identity(scenarioId)||!identity(projectId)||!identity(candidateRevisionId)||expectedHead!==null&&!identity(expectedHead))
  throw Error('CONTENT_REVISION_IDENTITY_REQUIRED')
 const projectDataViewKey=buildDataViewKey('ContentProject','selectedProject',scenarioId)
 const project=runtime.resolveView(projectDataViewKey)
 if(!project||project.dataTable?.modelBinding?.modelName!=='ContentProject'||project.queryContext['projectId']!==projectId
  ||!hasContentScopeCondition(project,'projectId',{Type:'GetInputParam',ParamName:'projectId'}))throw Error('CONTENT_REVISION_PROJECT_REQUIRED')
 await project.refresh();assertHost()
 if(runtime.resolveView(projectDataViewKey)!==project)throw Error('CONTENT_REVISION_STALE')
 const matchesHead=()=>{
  const row=project.rows[0]
  return !project.loadingError&&!project.hasEditingChanges()&&project.queryContext['projectId']===projectId
   &&hasContentScopeCondition(project,'projectId',{Type:'GetInputParam',ParamName:'projectId'})
   &&project.rows.length===1&&row?.['projectId']===projectId&&row['headRevisionId']===expectedHead
   &&['projectId','headRevisionId'].every(field=>project.fieldAccess(row,field).read==='visible')
 }
 if(!matchesHead())throw Error('CONTENT_REVISION_HEAD_CHANGED')
 const assertProjectResult=project.captureReadResult()
 const projectRow=project.rows[0]
 if(!projectRow)throw Error('CONTENT_REVISION_HEAD_CHANGED')
 const assertProjectRow=project.captureReadRow(projectRow,['projectId','headRevisionId'])
 const candidateDataViewKey=buildDataViewKey('ContentRevision','selectedCandidate',scenarioId)
 const headDataViewKey=expectedHead===null?null:buildDataViewKey('ContentRevision','selectedHead',scenarioId)
 const candidate=runtime.resolveView(candidateDataViewKey),head=headDataViewKey?runtime.resolveView(headDataViewKey):undefined
 if(!candidate||!valid(candidate,'candidateRevisionId','CANDIDATE')||expectedHead!==null&&(!head||!valid(head,'expectedHead','ADOPTED')))
  throw Error('CONTENT_REVISION_SCOPE_REQUIRED')
 const entries=[{key:candidateDataViewKey,view:candidate,id:candidateRevisionId,parameter:'candidateRevisionId',status:'CANDIDATE'},
  ...(headDataViewKey&&head&&expectedHead!==null?[{key:headDataViewKey,view:head,id:expectedHead,parameter:'expectedHead',status:'ADOPTED'}]:[])]
 for(const item of entries){
  if(item.view.hasEditingChanges())throw Error('CONTENT_REVISION_UNAVAILABLE')
  item.view.queryContext={...item.view.queryContext,projectId,[item.parameter]:item.id}
 }
 const assertScope=()=>{
  assertHost()
  if(runtime.resolveView(projectDataViewKey)!==project||entries.some(item=>runtime.resolveView(item.key)!==item.view))
   throw Error('CONTENT_REVISION_STALE')
  assertProjectResult();assertProjectRow()
  if(!matchesHead()||entries.some(item=>!valid(item.view,item.parameter,item.status)
   ||item.view.queryContext['projectId']!==projectId||item.view.queryContext[item.parameter]!==item.id))
   throw Error('CONTENT_REVISION_STALE')
 }
 assertScope()
 await Promise.all(entries.map(item=>item.view.refresh()));assertScope()
 const assertRows=()=>{if(entries.some(item=>!available(item.view,{projectId,id:item.id,status:item.status})))throw Error('CONTENT_REVISION_UNAVAILABLE')}
 assertRows()
 const proofs=entries.map(item=>{
  const row=item.view.rows[0]
  if(!row)throw Error('CONTENT_REVISION_UNAVAILABLE')
  return {result:item.view.captureReadResult(),row:item.view.captureReadRow(row,['id','projectId','status','snapshotHash'])}
 })
 return Object.freeze({candidateDataViewKey,headDataViewKey,assertCurrent:()=>{
  assertScope();proofs.forEach(proof=>{proof.result();proof.row()});assertRows()
 }})
}
