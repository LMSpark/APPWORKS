/**
 * @module app:views/features/application/smart-bid/authoring/model/content-authoring-host
 * 职责：以当前认证作者及明确项目装配正文编制的原生运行实例。
 * 边界：仅编排原 PageRuntime/DataView；不复制草稿、不提交CRUD、不替代服务端授权或权威保存。
 * AI用途：导航宿主已核实页面身份后，打开正文工作区并将原实例交正文组件。
 */
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataView, type DataViewFilterTree} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {lowcodeApi} from '@/lowcode/lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '@/lowcode/data-space/lowcode-data-space-runtime'
import {readContentRevisions,type ContentRevisionSelection,type ContentRevisionReadBinding} from './content-revision-reader'

/** 导航宿主核实的应用、页面和数据空间，以及本次明确选中的业务目标。作者不由调用参数提供。 */
export type ContentAuthoringTarget = Readonly<{
 applicationId:string; pageId:string; scenarioId:string; projectId:string; draftId:string
}>
/** 直接交给正文组件的原实例绑定；pending只表示尚未写回字段的交互，不保存业务数据。 */
export type ContentAuthoringBinding = Readonly<{
 runtime:PageRuntime; dataViewKey:string; projectId:string; draftId:string; actorUserId:string
 assertCurrent:()=>void; setPending:(value:boolean)=>void
 /** 查询原候选/头修订索引；完整快照与采用另核。 */
 readRevisions:(selection:ContentRevisionSelection)=>Promise<ContentRevisionReadBinding>
}>

function scoped(view:DataView, field:string, parameter:string):boolean {
 const includes=(node:DataViewFilterTree):boolean=>{
  if('logic' in node)return node.logic==='and' && node.filters.some(includes)
  const value=node.value
  return node.field===field && node.operator==='eq' && isRecord(value)
   && value['Type']==='GetInputParam' && value['ParamName']===parameter
 }
 return view.scopeFilter!==undefined && includes(view.scopeFilter)
}
function validScope(project:DataView,draft:DataView):boolean {
 return project.dataTable?.modelBinding?.modelName==='ContentProject'
  && draft.dataTable?.modelBinding?.modelName==='WorkingDraft' && draft.commitMode==='staged'
  && scoped(project,'projectId','projectId') && scoped(draft,'projectId','projectId') && scoped(draft,'userId','currentUserId')
}
function readableProject(view:DataView,projectId:string):boolean {
 const row=view.rows[0]
 return view.rows.length===1&&row?.['projectId']===projectId&&view.fieldAccess(row,'projectId').read==='visible'
}

/** 一次正文编制宿主；未保存输入/原视图编辑均阻止换目标，过期装配不能发布新绑定。 */
export class ContentAuthoringHost {
 readonly #session=new NativePageRuntimeSession()
 #generation=0
 #binding:ContentAuthoringBinding|undefined
 #key:string|undefined
 #pending=false
 get binding():ContentAuthoringBinding|undefined{return this.#binding}
 get hasPending():boolean{return this.#pending || this.#session.runtime?.isDirty===true}

 /** 装配正式空间并只查询本次项目与作者的视图；目标或认证代次变化创建新实例。 */
 async open(input:ContentAuthoringTarget):Promise<ContentAuthoringBinding> {
  const target=Object.freeze({...input})
  if((['applicationId','pageId','scenarioId','projectId','draftId'] as const).some(name=>{
   const value=target[name]
   return typeof value!=='string'||!value.trim()||value.trim()!==value
  }))
   throw Error('CONTENT_AUTHORING_IDENTITY_REQUIRED: 缺少明确的编制目标')
  const actorUserId=lowcodeApi.session.get()?.identity.userId
  const scope=lowcodeApi.readRequestScope()
  if(!actorUserId?.trim()||scope.headers['X-AppId']!==target.applicationId)
   throw Error('CONTENT_AUTHORING_IDENTITY_REQUIRED: 当前作者或应用与目标不符')
  const key=JSON.stringify([target.applicationId,target.pageId,target.scenarioId,target.projectId,target.draftId,scope.token,actorUserId])
  if(this.#key===key && this.#binding){this.#binding.assertCurrent();return this.#binding}
  if(this.hasPending)throw Error('CONTENT_AUTHORING_PENDING: 请先处理原项目的未保存编辑')
  const own=++this.#generation
  this.#binding=undefined;this.#key=undefined;this.#pending=false
  try {
   const runtime=this.#session.acquire({pageId:target.pageId,scenarioIds:[target.scenarioId],targetId:key,
    scenarioInputs:{[target.scenarioId]:{projectId:target.projectId,currentUserId:actorUserId}},
    loadScenario:scenarioId=>loadLowcodeRuntimeScenario({projectId:target.applicationId,scenarioId})})
   let views:DataView[]=[],loaded=false
   const assertCurrent=()=>{
    const current=lowcodeApi.readRequestScope()
    const [project,draft]=views
    if(own!==this.#generation||!this.#session.isCurrent(runtime)||current.token!==scope.token
     ||current.headers['X-AppId']!==target.applicationId||lowcodeApi.session.get()?.identity.userId!==actorUserId
     ||views.some(view=>view.queryContext['projectId']!==target.projectId||view.queryContext['currentUserId']!==actorUserId)
     ||views.length>0 && (!project||!draft||!validScope(project,draft))
     ||loaded && (!project||!readableProject(project,target.projectId)))
     throw Error('CONTENT_AUTHORING_STALE: 正文编制的会话或目标已失效')
   }
   await runtime.load();assertCurrent()
   const project=runtime.resolveView(buildDataViewKey('ContentProject','selectedProject',target.scenarioId))
   const draft=runtime.resolveView(buildDataViewKey('WorkingDraft','personalDraft',target.scenarioId))
   if(!project||!draft||!validScope(project,draft))
    throw Error('CONTENT_AUTHORING_SCOPE_REQUIRED: 缺少项目或当前作者的正式常驻范围')
   views=[project,draft];assertCurrent()
   await Promise.all(views.map(view=>view.refresh()));assertCurrent()
   const failed=views.find(view=>view.loadingError)
   if(failed?.loadingError)throw failed.loadingError
   const row=draft.getEditingRow(target.draftId)
   if(!readableProject(project,target.projectId)
    ||row?.['projectId']!==target.projectId||row['userId']!==actorUserId
    ||draft.fieldAccess(row,'projectId').read!=='visible'||draft.fieldAccess(row,'userId').read!=='visible')
    throw Error('CONTENT_AUTHORING_TARGET_UNAVAILABLE: 本项目或当前作者的指定草稿不可读取')
   loaded=true
   const binding:ContentAuthoringBinding=Object.freeze({runtime,
    dataViewKey:buildDataViewKey('WorkingDraft','personalDraft',target.scenarioId),
    projectId:target.projectId,draftId:target.draftId,actorUserId,assertCurrent,
    readRevisions:selection=>readContentRevisions({runtime,scenarioId:target.scenarioId,projectId:target.projectId,assertCurrent},selection),
    setPending:(value:boolean)=>{
     if(own!==this.#generation||!this.#session.isCurrent(runtime))return
     // 失效只能保留未写回输入的保护；旧回调不能清除它并放行销毁。
     if(value){this.#pending=true;return}
     try{assertCurrent();this.#pending=false}catch{/* 保留当前未保存输入。 */}
    },
   })
   this.#binding=binding;this.#key=key
   return binding
  } catch(cause){if(own===this.#generation)this.#session.dispose();throw cause}
 }

 /** 正常离页前调用；未保存编辑必须先通过原组件取消或正式保存，不能隐式丢弃。 */
 close():void {
  if(this.hasPending)throw Error('CONTENT_AUTHORING_PENDING: 请先处理未保存编辑')
  this.#generation++;this.#binding=undefined;this.#key=undefined;this.#pending=false;this.#session.dispose()
 }
}
