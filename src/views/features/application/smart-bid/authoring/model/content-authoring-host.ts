/**
 * @module app:views/features/application/smart-bid/authoring/model/content-authoring-host
 * 职责：以当前认证作者及明确项目装配正文编制的原生运行实例。
 * 边界：仅编排原 PageRuntime/DataView；不复制草稿、不提交CRUD、不替代服务端授权或权威保存。
 * AI用途：导航宿主已核实页面身份后，打开正文工作区并将原实例交正文组件。
 */
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import {buildDataViewKey, type DataView, type DataViewFilterTree} from '@spark-appworks/spark-data'
import type {PageRuntime,PageTool} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {lowcodeApi} from '@/platform-adapters/lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '@/platform-adapters/data-space/lowcode-data-space-runtime'
import {hasCompleteSingleContentResult,readContentRevisions,type ContentRevisionSelection,type ContentRevisionReadBinding} from './content-revision-reader'
import {readContentNodeVersion,type ContentNodeVersionSelection,type ContentNodeVersionBinding} from './content-node-version-reader'
import {readContentSnapshotIndex,type ContentSnapshotSelection,type ContentSnapshotIndexBinding} from './hashes/content-snapshot-reader'
import {readContentSnapshotNodes,type ContentSnapshotNodesBinding} from './content-snapshot-nodes'
import {readCandidateContent,type ContentCandidateBinding} from './content-candidate-reader'
import {readContentFactVersion,type ContentFactVersionSelection,type ContentFactVersionBinding} from './content-fact-version-reader'
import {readContentBaselineFact,type ContentBaselineFactSelection,type ContentBaselineFactBinding} from './content-baseline-reader'
import {readContentAdoption,type ContentAdoptionSelection} from './adoption/content-adoption-reader'

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
 /** 原节点版本读取；完整快照成员关系仍由快照装配核对。 */
 readNodeVersion:(selection:ContentNodeVersionSelection)=>Promise<ContentNodeVersionBinding>
 /** 读取并核同版清单摘要；业务闭包及修订匹配仍另核。 */
 readSnapshotIndex:(selection:ContentSnapshotSelection)=>Promise<ContentSnapshotIndexBinding>
 /** 沿完整成员视图装配本次已核清单节点；其它分组和采用另核。 */
 readSnapshotNodes:(snapshot:ContentSnapshotIndexBinding)=>Promise<ContentSnapshotNodesBinding>
 /** 候选索引、同版依据、清单摘要和完整节点串联；完整业务闭包及采用另核。 */
 readCandidateContent:(selection:ContentRevisionSelection)=>Promise<ContentCandidateBinding>
 /** 只读原事实键版本；基线归属和本次使用准用仍须原责任域核验。 */
 readFactVersion:(selection:ContentFactVersionSelection)=>Promise<ContentFactVersionBinding>
 readBaselineFact:(selection:ContentBaselineFactSelection)=>Promise<ContentBaselineFactBinding>
 /** 只读原请求关联的采用行；实际原办理结果另核。 */
 readOriginalAdoption:(selection:ContentAdoptionSelection)=>ReturnType<typeof readContentAdoption>
}>

function hasRequiredEquality(filter:DataViewFilterTree,field:string,matches:(value:unknown)=>boolean):boolean {
 if('logic' in filter)return filter.logic==='and'&&filter.filters.some(child=>hasRequiredEquality(child,field,matches))
 return filter.field===field&&filter.operator==='eq'&&matches(filter.value)
}
function scoped(view:DataView, field:string, parameter:string):boolean {
 const filter=view.scopeFilter
 return filter!==undefined&&hasRequiredEquality(filter,field,value=>isRecord(value)
  &&value['Type']==='GetInputParam'&&value['ParamName']===parameter)
}
function validScope(project:DataView,draft:DataView):boolean {
 return project.dataTable?.modelBinding?.modelName==='ContentProject'
  && draft.dataTable?.modelBinding?.modelName==='WorkingDraft' && draft.commitMode==='staged'
  && scoped(project,'projectId','projectId') && scoped(draft,'projectId','projectId') && scoped(draft,'userId','currentUserId')
}
function readableProject(view:DataView,projectId:string):boolean {
 const row=view.rows[0]
 return hasCompleteSingleContentResult(view)&&row?.['projectId']===projectId&&view.fieldAccess(row,'projectId').read==='visible'
}
function readOwnDraft(view:DataView,target:ContentAuthoringTarget,actorUserId:string) {
 const row=view.rows[0]
 if(hasCompleteSingleContentResult(view)&&row!==undefined&&view.getPkKey(row)===target.draftId&&
  row['projectId']===target.projectId&&row['userId']===actorUserId&&
  [view.primaryKey,'projectId','userId','draft'].every(field=>view.fieldAccess(row,field).read==='visible'))return row
 return undefined
}

/** 一次正文编制宿主；未保存输入/原视图编辑均阻止换目标，过期装配不能发布新绑定。 */
export function captureContentAuthoringSession(target: Pick<ContentAuthoringTarget,'applicationId'|'scenarioId'>&Readonly<{projectId?:string}>) {
 const actorUserId = lowcodeApi.session.get()?.identity.userId
 const scope = lowcodeApi.readRequestScope()
 if (!actorUserId?.trim() || scope.headers['X-AppId'] !== target.applicationId) {
  throw Error('CONTENT_AUTHORING_IDENTITY_REQUIRED: 当前作者或应用与目标不符')
 }
 const applicationId = target.applicationId
 return {
  actorUserId,
  scenarioInputs: Object.freeze({[target.scenarioId]: Object.freeze({...(target.projectId===undefined?{}:{projectId:target.projectId}),currentUserId:actorUserId})}),
  assertCurrent() {
   const current = lowcodeApi.readRequestScope()
   if (current.token !== scope.token || current.headers['X-AppId'] !== applicationId
    || lowcodeApi.session.get()?.identity.userId !== actorUserId) {
    throw Error('CONTENT_AUTHORING_STALE: 正文编制的会话或目标已失效')
   }
  },
 }
}

export class ContentAuthoringHost {
 readonly #session=new NativePageRuntimeSession()
 #generation=0
 #binding:ContentAuthoringBinding|undefined
 #key:string|undefined
 #tool:PageTool|undefined
 #pending=false
 /** 由导航实例池传入时，运行实例继续由实例池负责装载和释放。 */
 constructor(private readonly borrowedRuntime?:PageRuntime){}
 get binding():ContentAuthoringBinding|undefined{return this.#binding}
 get hasPending():boolean{return this.#pending || (this.borrowedRuntime??this.#session.runtime)?.isDirty===true}

 /** 装配正式空间，按本次项目、认证作者和正式草稿键查询；目标或认证代次变化创建新实例。 */
 async open(input:ContentAuthoringTarget,tool?:PageTool):Promise<ContentAuthoringBinding> {
  const target=Object.freeze({...input})
  if((['applicationId','pageId','scenarioId','projectId','draftId'] as const).some(name=>{
   const value=target[name]
   return typeof value!=='string'||!value.trim()||value.trim()!==value
  }))
   throw Error('CONTENT_AUTHORING_IDENTITY_REQUIRED: 缺少明确的编制目标')
  if(tool&&(tool.pageId!==target.pageId||!tool.isLoaded))throw Error('CONTENT_AUTHORING_TOOL_IDENTITY_REQUIRED')
  const session = captureContentAuthoringSession(target)
  const {actorUserId} = session
  const borrowed=this.borrowedRuntime
  const borrowedInputs=borrowed?.call.scenarioInputs?.[target.scenarioId]
  if(borrowed&&(!borrowed.isLoaded||borrowed.pageId!==target.pageId
   ||borrowed.call.scenarioIds.length!==1||borrowed.call.scenarioIds[0]!==target.scenarioId
   ||borrowedInputs?.['projectId']!==target.projectId||borrowedInputs['currentUserId']!==actorUserId
   ||tool!==undefined&&borrowed.tool!==tool))
   throw Error('CONTENT_AUTHORING_RUNTIME_IDENTITY_REQUIRED')
  const key=JSON.stringify([target.applicationId,target.pageId,target.scenarioId,target.projectId,target.draftId,lowcodeApi.readRequestScope().token,actorUserId])
  if(this.#key===key && this.#binding&&this.#tool===tool){this.#binding.assertCurrent();return this.#binding}
  if(this.hasPending)throw Error('CONTENT_AUTHORING_PENDING: 请先处理原项目的未保存编辑')
  const own=++this.#generation
  this.#binding=undefined;this.#key=undefined;this.#tool=undefined;this.#pending=false
  try {
   const runtime=borrowed??this.#session.acquire({...(tool?{tool}:{pageId:target.pageId}),scenarioIds:[target.scenarioId],targetId:key,
    scenarioInputs:session.scenarioInputs,
    loadScenario:scenarioId=>loadLowcodeRuntimeScenario({projectId:target.applicationId,scenarioId})})
   if(!borrowed)await runtime.load()
   const generation=runtime.generation
   const runtimeCurrent=()=>runtime.isLoaded&&runtime.generation===generation
    &&(borrowed!==undefined||this.#session.isCurrent(runtime))
   const projectKey=buildDataViewKey('ContentProject','selectedProject',target.scenarioId)
   const draftKey=buildDataViewKey('WorkingDraft','personalDraft',target.scenarioId)
   let views:DataView[]=[]
   const assertScope=()=>{
    session.assertCurrent()
    const [project,draft]=views
    if(own!==this.#generation||!runtimeCurrent()
     ||views.some(view=>view.queryContext['projectId']!==target.projectId||view.queryContext['currentUserId']!==actorUserId)
     ||views.length>0 && (!project||!draft||runtime.resolveView(projectKey)!==project
      ||runtime.resolveView(draftKey)!==draft||!validScope(project,draft)))
     throw Error('CONTENT_AUTHORING_STALE: 正文编制的会话或目标已失效')
   }
   assertScope()
   const project=runtime.resolveView(projectKey)
   const draft=runtime.resolveView(draftKey)
   if(!project||!draft||!validScope(project,draft))
    throw Error('CONTENT_AUTHORING_SCOPE_REQUIRED: 缺少项目或当前作者的正式常驻范围')
   views=[project,draft];assertScope()
   const originalKey:DataViewFilterTree={field:draft.primaryKey,operator:'eq',value:target.draftId}
   const existingFilter=draft.filterExpression
   if(!existingFilter||!hasRequiredEquality(existingFilter,draft.primaryKey,value=>value===target.draftId)){
    draft.filterExpression=existingFilter?{logic:'and',filters:[existingFilter,originalKey]}:originalKey
   }
   await Promise.all(views.map(view=>view.refresh()));assertScope()
   const failed=views.find(view=>view.loadingError)
   if(failed?.loadingError)throw failed.loadingError
   const draftRow=readOwnDraft(draft,target,actorUserId)
   if(!readableProject(project,target.projectId)||!draftRow)
    throw Error('CONTENT_AUTHORING_TARGET_UNAVAILABLE: 本项目或当前作者的指定草稿不可读取')
   const assertDraftRead=draft.captureReadRow(draftRow,[draft.primaryKey,'projectId','userId'])
   const assertCurrent=()=>{
    assertScope()
    if(project.loadingError||draft.loadingError||!readableProject(project,target.projectId)||!readOwnDraft(draft,target,actorUserId))
     throw Error('CONTENT_AUTHORING_STALE: 正文编制的会话或目标已失效')
    assertDraftRead()
   }
   const binding:ContentAuthoringBinding=Object.freeze({runtime,
    dataViewKey:draftKey,
    projectId:target.projectId,draftId:target.draftId,actorUserId,assertCurrent,
    readRevisions:selection=>readContentRevisions({runtime,scenarioId:target.scenarioId,projectId:target.projectId,assertCurrent},selection),
    readNodeVersion:selection=>readContentNodeVersion({runtime,scenarioId:target.scenarioId,projectId:target.projectId,assertCurrent},selection),
    readSnapshotIndex:selection=>readContentSnapshotIndex({runtime,scenarioId:target.scenarioId,projectId:target.projectId,assertCurrent},selection),
    readSnapshotNodes:snapshot=>readContentSnapshotNodes({runtime,scenarioId:target.scenarioId,projectId:target.projectId,assertCurrent},snapshot),
    readCandidateContent:selection=>readCandidateContent({runtime,scenarioId:target.scenarioId,projectId:target.projectId,assertCurrent},selection),
    readFactVersion:selection=>readContentFactVersion({runtime,scenarioId:target.scenarioId,projectId:target.projectId,assertCurrent},selection),
    readBaselineFact:selection=>readContentBaselineFact({runtime,scenarioId:target.scenarioId,projectId:target.projectId,assertCurrent},selection),
    readOriginalAdoption:selection=>readContentAdoption({runtime,scenarioId:target.scenarioId,projectId:target.projectId,assertCurrent},selection),
    setPending:(value:boolean)=>{
     if(own!==this.#generation||!runtimeCurrent())return
     // 失效只能保留未写回输入的保护；旧回调不能清除它并放行销毁。
     if(value){this.#pending=true;return}
     try{assertCurrent();this.#pending=false}catch{/* 保留当前未保存输入。 */}
    },
   })
   this.#binding=binding;this.#key=key;this.#tool=tool
   return binding
  } catch(cause){if(own===this.#generation)this.#session.dispose();throw cause}
 }

 /** 正常离页前调用；未保存编辑必须先通过原组件取消或正式保存，不能隐式丢弃。 */
 close():void {
  if(this.hasPending)throw Error('CONTENT_AUTHORING_PENDING: 请先处理未保存编辑')
  this.#generation++;this.#binding=undefined;this.#key=undefined;this.#tool=undefined;this.#pending=false;this.#session.dispose()
 }
}
