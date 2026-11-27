/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-authoring-script-host
 * 职责：将同次正文宿主的业务能力交页11脚本消费。
 * 边界：不创建运行实例、不查询/保存、不持有业务草稿或全局命令表。
 */
import {ContentAuthoringHost,type ContentAuthoringBinding,type ContentAuthoringTarget} from '../../model/content-authoring-host'
import {ContentAuthoringCommands} from './content-authoring-commands'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {JsonPath} from '@spark-appworks/spark-json-document'
import {contentTreeDraftActionLayout,contentTreeEditorLayout,type ContentTreeEditorLayoutInput} from '@/services/smart-bid/content-tree-editor-layout'
import {isCallable,isRecord} from '@spark-appworks/spark-utils'
import {buildDataViewKey,parseDataViewKey} from '@spark-appworks/spark-data'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readBaselineSubmissionObligations} from '../../../followup/submission-obligation-reader'
import {inspectRegisteredAdoption,type ContentAdoptionSelection} from '../../model/adoption/content-adoption-reader'
import {compareRegisteredOriginalForms,readRegisteredOriginalForm} from '../../../response/model/original-form-reader'
import {readCandidateContent,type ContentCandidateBinding} from '../../model/content-candidate-reader'
import {hasCompleteSingleContentResult,hasContentScopeCondition,type ContentRevisionSelection} from '../../model/content-revision-reader'
import {prepareRegisteredDraftCandidateRequest,readDraftCandidateBasis} from '../../model/draft/content-draft-candidate-basis'
import {readRegisteredOriginalContentDraftSave} from '../../model/content-draft-save-reader'
import {reconcileSavedContentDraft,type SavedContentDraftComparison} from '@/services/smart-bid/content/draft/content-draft-save-recovery'
import {decodeContentDraftPayload} from '@/services/smart-bid/content-draft-save-rule'
type Binding=Pick<ContentAuthoringBinding,'runtime'|'dataViewKey'|'projectId'|'draftId'|'actorUserId'|'assertCurrent'|'setPending'>
/** 定位原保存办理的请求和内容摘要。 */
type SaveReadInput=Parameters<typeof readRegisteredOriginalContentDraftSave>[1]
/** 从正式办理记录读取的原保存结果。 */
type OriginalSave=Awaited<ReturnType<typeof readRegisteredOriginalContentDraftSave>>
type CandidatePreviewInput=Parameters<ContentCandidateBinding['previewScope']>[0]
type DraftCandidateInput=Readonly<{
 requestKey:string;targetScope?:unknown;firstBatchId?:string;targetScopeIndex?:number;declaredAddedNodeIds?:readonly string[]
}>
type PublishedContentAuthoringInvoke=(name:string,input:unknown,signal:AbortSignal)=>Promise<unknown>

function readDeclaredAddedNodeIds(value:unknown):readonly string[]|undefined{
 if(value===undefined)return undefined
 const ids=Array.isArray(value)?value:[value]
 if(!ids.every(identity))throw Error('CONTENT_PAGE_COMMAND_INPUT_REQUIRED')
 return ids
}

function readCandidateOriginalForm(value:unknown):CandidatePreviewInput['originalFormTemplate']{
 if(value===undefined)return undefined
 if(!isRecord(value))throw Error('BID_ORIGINAL_FORM_SCOPE')
 const {documentId,templateRef,templateVersion}=value
 if(documentId===undefined&&templateRef===undefined&&templateVersion===undefined)return undefined
 if(!identity(documentId)||!identity(templateRef)||!identity(templateVersion))throw Error('BID_ORIGINAL_FORM_SCOPE')
 return {documentId,templateRef,templateVersion}
}

function isUncachedContentRead(view:NonNullable<ReturnType<PageRuntime['resolveView']>>){
 const {cacheType}=view.queryConfig
 return cacheType===undefined||cacheType==='none'
}

/** 实例池创建宿主后，仅在三文件脚本连接时装配原视图。并行连接共享本次装载。 */
export function createPublishedContentAuthoringHost(runtime:PageRuntime,target:ContentAuthoringTarget,
 {assertSession,receiptDataViewKey}:Readonly<{assertSession:()=>void;receiptDataViewKey?:string}>){
 let active:Readonly<{generation:number;connection:Promise<ReturnType<typeof createContentAuthoringScriptHost>>}>|undefined
 const assertCurrent=()=>{
  assertSession()
  if(runtime.destroyed)throw Error('CONTENT_PAGE_RENDER_STALE')
 }
 const invoke:PublishedContentAuthoringInvoke=async(
  name:string,input:unknown,signal:AbortSignal,
 )=>{
   const generation=runtime.generation
   const assertRender=()=>{
    assertCurrent()
    if(signal.aborted||!runtime.isLoaded||runtime.generation!==generation)throw Error('CONTENT_PAGE_RENDER_STALE')
   }
   assertRender()
   if(name==='content.authoring.connect'&&input!==undefined)throw Error('CONTENT_PAGE_COMMAND_UNKNOWN')
   if(active?.generation!==generation){
    const owner=new ContentAuthoringHost(runtime)
    const connection=owner.open(target).then(binding=>{
     assertCurrent()
     binding.assertCurrent()
     return createContentAuthoringScriptHost(binding,new ContentAuthoringCommands(binding),receiptDataViewKey)
    }).catch((cause:unknown)=>{
     if(active?.connection===connection)active=undefined
     throw cause
    })
    active={generation,connection}
   }
   const host=await active.connection
   assertRender()
   const session=host.invoke('content.authoring.connect',undefined,signal)
   if(name==='content.authoring.connect')return session
   if(!isRecord(input))throw Error('CONTENT_PAGE_COMMAND_INPUT_REQUIRED')
   if(name==='content.authoring.readObligations'&&Object.keys(input).length===0)
    return session.readVolumePlanningObligations()
   if(name==='content.authoring.readOriginalForm')
    return session.readOriginalForm({templateRef:String(input['templateRef']),templateVersion:String(input['templateVersion'])})
   if(name==='content.authoring.compareOriginalForms')
    return session.compareOriginalForms({templateRef:String(input['templateRef']),previousVersion:String(input['previousVersion']),currentVersion:String(input['currentVersion'])})
   if(name==='content.authoring.readOriginalAdoption'&&Object.keys(input).length===4)
    return session.readOriginalAdoption({
     candidateRevisionId:String(input['candidateRevisionId']),requestKey:String(input['requestKey']),
     requestDigest:String(input['requestDigest']),previewRef:String(input['previewRef'])})
   if(name==='content.authoring.readOriginalSave'&&Object.keys(input).length===4)
    return session.readOriginalSave({
     requestKey:String(input['requestKey']),requestDigest:String(input['requestDigest']),
     contentDigest:String(input['contentDigest']),expectedDraftVersion:input['expectedDraftVersion']===null?null:String(input['expectedDraftVersion'])})
   if(name==='content.authoring.readCurrentHead'&&Object.keys(input).length===0)
    return session.readCurrentHead()
   if(name==='content.authoring.previewCandidate'&&isRecord(input['options'])){
    const options=input['options']
    const declaredAddedNodeIds=readDeclaredAddedNodeIds(options['declaredAddedNodeIds'])??[]
    const originalFormTemplate=readCandidateOriginalForm(options['originalFormTemplate'])
    const preview:CandidatePreviewInput={declaredAddedNodeIds,...(originalFormTemplate?{originalFormTemplate}:{})}
    return session.previewCandidate({
     candidateRevisionId:String(input['candidateRevisionId']),
     expectedHead:input['expectedHead']===undefined||input['expectedHead']===null?null:String(input['expectedHead']),
    },preview)
   }
   if(name==='content.authoring.prepareCandidate'){
    const declared=readDeclaredAddedNodeIds(input['declaredAddedNodeIds'])
    const request:DraftCandidateInput={requestKey:String(input['requestKey']),
     ...(input['targetScope']===undefined?{}:{targetScope:input['targetScope']}),
     ...(input['firstBatchId']===undefined?{}:{firstBatchId:String(input['firstBatchId'])}),
     ...(typeof input['targetScopeIndex']==='number'?{targetScopeIndex:input['targetScopeIndex']}:{ }),
     ...(declared?{declaredAddedNodeIds:declared}:{})}
    return session.prepareDraftCandidate(request)
   }
   throw Error('CONTENT_PAGE_COMMAND_UNKNOWN')
 }
 return {runtime,assertCurrent,invoke}
}
/** 脚本句柄只有业务能力和选择代次，没有业务数据副本。 */
export type ContentAuthoringScriptSession=Readonly<{
 assertCurrent:()=>void;select:()=>void;cancel:()=>void;setInputPending:(pending:boolean)=>void
 canLeave:boolean;canCancel:boolean;canEditDraft:boolean
 actionProps:(label:string,path:JsonPath|null)=>Readonly<{disabled:boolean;onClick:()=>void}>
 editorProps:(path:JsonPath)=>Readonly<Record<string,unknown>>
 readOriginalSave:(input:SaveReadInput)=>Promise<OriginalSave&Readonly<{comparison?:SavedContentDraftComparison}>>
 readVolumePlanningObligations:()=>ReturnType<typeof readBaselineSubmissionObligations>
 readOriginalAdoption:(input:ContentAdoptionSelection)=>ReturnType<typeof inspectRegisteredAdoption>
 readCurrentHead:()=>Promise<Readonly<{headRevisionId:string|null;assertCurrent:()=>void}>>
 readOriginalForm:(selection:Parameters<typeof readRegisteredOriginalForm>[1])=>ReturnType<typeof readRegisteredOriginalForm>
 compareOriginalForms:(selection:Parameters<typeof compareRegisteredOriginalForms>[1])=>ReturnType<typeof compareRegisteredOriginalForms>
 previewCandidate:(selection:ContentRevisionSelection,options:CandidatePreviewInput)=>ReturnType<ContentCandidateBinding['previewScope']>
 captureCandidateDraft:()=>ReturnType<ContentAuthoringCommands['captureCandidateDraft']>
 prepareDraftCandidate:(input:DraftCandidateInput)=>ReturnType<typeof prepareRegisteredDraftCandidateRequest>
}>
/** 供正式SparkPageRenderer.host使用；命令对象仍归原薄宿主释放。 */
export function createContentAuthoringScriptHost(binding:Binding,commands:ContentAuthoringCommands,receiptDataViewKey?:string){
 return {runtime:binding.runtime,assertCurrent:binding.assertCurrent,
  invoke(name:string,input:unknown,signal:AbortSignal):ContentAuthoringScriptSession{
   const assertReadSession=()=>{
    if(signal.aborted)throw Error('CONTENT_PAGE_RENDER_STALE')
    binding.assertCurrent()
   }
   const assertCurrent=()=>{assertReadSession();commands.assertInputCurrent(commands.epoch)}
   assertReadSession()
   if(name!=='content.authoring.connect'||input!==undefined)throw Error('CONTENT_PAGE_COMMAND_UNKNOWN')
   const layoutInput=(path:JsonPath|null):ContentTreeEditorLayoutInput=>{
    assertCurrent()
    const view=binding.runtime.resolveView(binding.dataViewKey)
    if(!view)throw Error('CONTENT_COMMAND_VIEW_REQUIRED')
    return {view,dataViewKey:binding.dataViewKey,projectId:binding.projectId,draftId:binding.draftId,selectedPath:path,
     onSelectedPathChange:()=>{},onEditingChange:()=>{}}
   }
   return Object.freeze({assertCurrent,
    get canLeave(){return commands.canLeave},
    get canCancel(){return !signal.aborted&&commands.canCancel},
    get canEditDraft(){
     assertCurrent()
     const view=binding.runtime.resolveView(binding.dataViewKey)
     const row=view?.getEditingRow(binding.draftId)
     if(!view||!row)return false
     const access=view.fieldAccess(row,'draft')
     return access.read==='visible'&&access.write==='allowed'
    },
    async prepareDraftCandidate(selection:DraftCandidateInput){
     assertCurrent()
     const request=structuredClone(selection)
     const requestFields={requestKey:request.requestKey,
      ...(request.declaredAddedNodeIds===undefined?{}:{declaredAddedNodeIds:request.declaredAddedNodeIds})}
     const {runtime,projectId}=binding,scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId)throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
     const captured=await commands.captureCandidateDraft(commands.epoch)
     const assertDraft=()=>{assertCurrent();captured.assertCurrent()}
     const host={runtime,projectId,scenarioId,assertCurrent:assertDraft}
     const {baseRevisionId:revisionId}=captured
     if(revisionId!==null){
      if(request.firstBatchId!==undefined||request.targetScopeIndex!==undefined)throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
      const basis=await readDraftCandidateBasis(host,{revisionId})
      return prepareRegisteredDraftCandidateRequest(host,captured,{basis,input:{...requestFields,targetScope:request.targetScope}})
     }
     const projectKey=buildDataViewKey('ContentProject','selectedProject',scenarioId)
     const projectView=runtime.resolveView(projectKey)
     const {firstBatchId}=request
     if(!projectView||projectView.dataTable?.modelBinding?.modelName!=='ContentProject'||projectView.hasEditingChanges()||
      !isUncachedContentRead(projectView)||projectView.queryContext['projectId']!==projectId||
      !hasContentScopeCondition(projectView,'projectId',{Type:'GetInputParam',ParamName:'projectId'})||!identity(firstBatchId))
      throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
     await projectView.refresh()
     assertDraft()
     const project=projectView.rows[0]
     if(runtime.resolveView(projectKey)!==projectView||projectView.loadingError||!hasCompleteSingleContentResult(projectView)||
      project?.['projectId']!==projectId)
      throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
     const proof=projectView.captureReadRow(project,['projectId','headRevisionId','activeBaselineId'])
     const resultProof=projectView.captureReadResult()
     if(identity(project['headRevisionId']))throw Error('CONTENT_DRAFT_FIRST_HEAD_CHANGED')
     if(project['headRevisionId']!==null||!identity(project['activeBaselineId']))throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
     const assertFirst=()=>{
      assertDraft()
      if(runtime.resolveView(projectKey)!==projectView||!isUncachedContentRead(projectView))throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
      resultProof()
      proof()
     }
     const firstHost={...host,assertCurrent:assertFirst}
     const basis=await readDraftCandidateBasis(firstHost,
      {revisionId,firstBaselineId:project['activeBaselineId'],firstBatchId,targetScope:request.targetScope,
       ...(request.targetScopeIndex===undefined?{}:{targetScopeIndex:request.targetScopeIndex})})
     if(!('targetScope' in basis))throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
     return prepareRegisteredDraftCandidateRequest(firstHost,captured,{basis,input:{...requestFields,targetScope:basis.targetScope}})
    },
    async captureCandidateDraft(){
     assertCurrent()
     const captured=await commands.captureCandidateDraft(commands.epoch)
     assertCurrent()
     return Object.freeze({...captured,assertCurrent:()=>{assertCurrent();captured.assertCurrent()}})
    },
    async previewCandidate(selection:ContentRevisionSelection,options:CandidatePreviewInput){
     assertCurrent()
     const {runtime,projectId}=binding,scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId)throw Error('CONTENT_CANDIDATE_SCOPE_REQUIRED')
     const previewInput=structuredClone(options)
     const candidate=await readCandidateContent({runtime,scenarioId,projectId,assertCurrent},selection)
     return candidate.previewScope(previewInput,assertCurrent)
    },
    compareOriginalForms(selection:Parameters<typeof compareRegisteredOriginalForms>[1]){
     assertCurrent()
     const {runtime,projectId}=binding,scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId)throw Error('BID_ORIGINAL_FORM_SCOPE')
     return compareRegisteredOriginalForms({runtime,scenarioId,projectId,assertCurrent},selection)
    },
    readOriginalForm(selection:Parameters<typeof readRegisteredOriginalForm>[1]){
     assertCurrent()
     const {runtime,projectId}=binding,scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId||!identity(selection.templateRef)||!identity(selection.templateVersion))throw Error('BID_ORIGINAL_FORM_SCOPE')
     return readRegisteredOriginalForm({runtime,scenarioId,projectId,assertCurrent},selection)
    },
    readOriginalAdoption(request:ContentAdoptionSelection){
     assertCurrent()
     const {runtime,projectId}=binding,scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId)throw Error('CONTENT_ADOPTION_SCOPE_REQUIRED')
     return inspectRegisteredAdoption({runtime,scenarioId,projectId,assertCurrent},request)
    },
    async readCurrentHead(){
     assertCurrent()
     const {runtime,projectId}=binding,scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId)throw Error('CONTENT_AUTHORING_HEAD_SCOPE')
     const key=buildDataViewKey('ContentProject','selectedProject',scenarioId),view=runtime.resolveView(key)
     if(view?.dataTable?.modelBinding?.modelName!=='ContentProject'||view.hasEditingChanges()||!isUncachedContentRead(view)||
      view.queryContext['projectId']!==projectId||
      !hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'}))throw Error('CONTENT_AUTHORING_HEAD_SCOPE')
     await view.refresh()
     assertCurrent()
     const row=view.rows[0]
     if(view.loadingError||!hasCompleteSingleContentResult(view)||row?.['projectId']!==projectId)throw Error('CONTENT_AUTHORING_HEAD_SCOPE')
     const {headRevisionId}=row
     if(headRevisionId!==null&&!identity(headRevisionId))throw Error('CONTENT_AUTHORING_HEAD_SCOPE')
     const proof=view.captureReadRow(row,['projectId','headRevisionId']),resultProof=view.captureReadResult()
     const assertHead=()=>{
      assertCurrent()
      if(runtime.resolveView(key)!==view||!isUncachedContentRead(view))throw Error('CONTENT_AUTHORING_HEAD_SCOPE')
      resultProof()
      proof()
     }
     assertHead()
     return Object.freeze({headRevisionId,assertCurrent:assertHead})
    },
    async readVolumePlanningObligations(){
     assertCurrent()
     const {runtime,projectId}=binding,scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId)throw Error('CONTENT_VOLUME_PLAN_SCOPE')
     const key=buildDataViewKey('ContentProject','selectedProject',scenarioId),view=runtime.resolveView(key)
     if(view?.dataTable?.modelBinding?.modelName!=='ContentProject'||view.hasEditingChanges()||!isUncachedContentRead(view)||
      view.queryContext['projectId']!==projectId||
      !hasContentScopeCondition(view,'projectId',{Type:'GetInputParam',ParamName:'projectId'}))throw Error('CONTENT_VOLUME_PLAN_SCOPE')
     await view.refresh()
     assertCurrent()
     const row=view.rows[0]
     if(view.loadingError||!hasCompleteSingleContentResult(view)||row?.['projectId']!==projectId||
      !identity(row['activeBaselineId']))throw Error('CONTENT_VOLUME_PLAN_SCOPE')
     const baselineId=row['activeBaselineId'],proof=view.captureReadRow(row,['projectId','activeBaselineId'])
     const resultProof=view.captureReadResult()
     const assertProject=()=>{
      assertCurrent()
      if(runtime.resolveView(key)!==view||!isUncachedContentRead(view))throw Error('CONTENT_VOLUME_PLAN_SCOPE')
      resultProof()
      proof()
     }
     return readBaselineSubmissionObligations({runtime,scenarioId,projectId,assertCurrent:assertProject},baselineId)
    },
    async readOriginalSave(request:SaveReadInput){
     assertReadSession()
     const scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId||!receiptDataViewKey)throw Error('CONTENT_DRAFT_SAVE_RECEIPT_VIEW_REQUIRED')
     const {runtime,projectId,draftId,actorUserId}=binding
     const receipt=await readRegisteredOriginalContentDraftSave({runtime,scenarioId,projectId,draftId,actorUserId,
      receiptDataViewKey,assertCurrent:assertReadSession},request)
     if(receipt.state!=='SAVED'||commands.hasPendingInput)return receipt
     const view=runtime.resolveView(binding.dataViewKey)
     if(!view)return receipt
     const isLocal=()=>view.hasEditingChanges(draftId)||view.dirtyTracking.hasPendingChanges(draftId)
     const localChanges=isLocal()
     try{
      const row=view.rows.find(item=>view.getPkKey(item)===draftId)
      if(!row)return receipt
      const rowProof=view.captureReadRow(row,['draftVersion','draft']),resultProof=view.captureReadResult()
      const draftVersion=row['draftVersion']
      if(!identity(draftVersion))return receipt
      const draft=decodeContentDraftPayload(row['draft'])
      const assertComparison=()=>{
       assertCurrent()
       if(runtime.resolveView(binding.dataViewKey)!==view||isLocal()!==localChanges||commands.hasPendingInput)
        throw Error('CONTENT_DRAFT_SAVE_COMPARISON_UNAVAILABLE')
       resultProof();rowProof()
      }
      const comparison=await reconcileSavedContentDraft(receipt,{
       projectId,draftId,authorId:actorUserId,draftVersion,draft,assertCurrent:assertComparison,
      })
      return Object.freeze({...receipt,comparison:Object.freeze({...comparison,localChanges})})
     }catch{
      receipt.assertCurrent()
      return receipt
     }
    },
    select(){assertCurrent();commands.selectionChanged(commands.epoch)},
    cancel(){
     if(signal.aborted)throw Error('CONTENT_PAGE_RENDER_STALE')
     commands.cancel(commands.epoch)
    },
    setInputPending(pending:boolean){assertCurrent();commands.setInputPending('page11-detail',pending,commands.epoch)},
    editorProps(path:JsonPath){
     const original=layoutInput(path),epoch=commands.epoch,layout=contentTreeEditorLayout(original),node=layout.children?.[1]
     const props=isRecord(node)&&isRecord(node['props'])?node['props']:undefined
     if(!props)throw Error('CONTENT_PAGE_EDITOR_REQUIRED')
     const readNodeId=()=>{
      const draft=decodeContentDraftPayload(original.view.getEditingRow(original.draftId)?.['draft']),index=path[0]
      const nodes=draft['nodes']
      const selected:unknown=Array.isArray(nodes)&&typeof index==='number'?nodes[index]:undefined
      return isRecord(selected)?selected['nodeId']:undefined
     }
     const nodeId=readNodeId()
     if(!identity(nodeId))throw Error('CONTENT_PAGE_EDITOR_REQUIRED')
     const inputSource=JSON.stringify(['page11-detail',nodeId,path[0]])
     return {...props,onChange(){
      assertCurrent();commands.assertInputCurrent(epoch)
      if(readNodeId()!==nodeId)throw Error('CONTENT_COMMAND_STALE')
     },onEditingChange(pending:boolean){
      if(typeof pending!=='boolean')throw Error('CONTENT_COMMAND_INPUT_STATE_REQUIRED')
      // 旧编辑器卸载的false不能清掉下一编辑器的保护。
      if(!pending&&epoch!==commands.epoch)return
      assertCurrent()
      if(pending&&readNodeId()!==nodeId)throw Error('CONTENT_COMMAND_STALE')
      commands.setInputPending(inputSource,pending,epoch)
     }}
    },
    actionProps(label:string,path:JsonPath|null){
     const original=layoutInput(path),epoch=commands.epoch
     const actions=contentTreeDraftActionLayout(original,{pending:commands.hasPendingInput,
      beforeChange(){assertCurrent();commands.selectionChanged(epoch)},afterChange(){},onError(cause){throw cause}})
     const action=actions.children?.find(child=>isRecord(child)&&isRecord(child['props'])&&child['props']['label']===label)
     const props=isRecord(action)&&isRecord(action['props'])?action['props']:undefined,click=props?.['onClick']
     if(!props||!isCallable(click))throw Error('CONTENT_PAGE_ACTION_UNKNOWN')
     return Object.freeze({disabled:props['disabled']===true,onClick(){assertCurrent();click()}})
    },
   })
  }}
}
