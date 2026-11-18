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
import type {ContentRevisionSelection} from '../../model/content-revision-reader'
import {readDraftCandidateBasis} from '../../model/content-draft-candidate-basis'
import {prepareDraftCandidateRequest} from '@/services/smart-bid/content/draft/content-draft-candidate-request'
import {readRegisteredOriginalContentDraftSave} from '../../model/content-draft-save-reader'
import {reconcileSavedContentDraft} from '@/services/smart-bid/content/draft/content-draft-save-recovery'
type Binding=Pick<ContentAuthoringBinding,'runtime'|'dataViewKey'|'projectId'|'draftId'|'actorUserId'|'assertCurrent'|'setPending'>
/** 定位原保存办理的请求和内容摘要。 */
type SaveReadInput=Parameters<typeof readRegisteredOriginalContentDraftSave>[1]
/** 从正式办理记录读取的原保存结果。 */
type OriginalSave=Awaited<ReturnType<typeof readRegisteredOriginalContentDraftSave>>
/** 原回执与当前草稿在同一版本下的比较结果。 */
type SaveComparison=Awaited<ReturnType<typeof reconcileSavedContentDraft>>
type CandidatePreviewInput=Parameters<ContentCandidateBinding['previewScope']>[0]
type DraftCandidateInput=Readonly<{requestKey:string;targetScope?:unknown;firstBatchId?:string;targetScopeIndex?:number}>

/** 实例池创建宿主后，仅在三文件脚本连接时装配原视图。并行连接共享本次装载。 */
export function createPublishedContentAuthoringHost(runtime:PageRuntime,target:ContentAuthoringTarget,
 {assertSession,receiptDataViewKey}:Readonly<{assertSession:()=>void;receiptDataViewKey?:string}>){
 let active:Readonly<{generation:number;connection:Promise<ReturnType<typeof createContentAuthoringScriptHost>>}>|undefined
 const assertCurrent=()=>{
  assertSession()
  if(runtime.destroyed)throw Error('CONTENT_PAGE_RENDER_STALE')
 }
 return {runtime,assertCurrent,
  async invoke(name:string,input:unknown,signal:AbortSignal):Promise<ContentAuthoringScriptSession>{
   const generation=runtime.generation
   const assertRender=()=>{
    assertCurrent()
    if(signal.aborted||!runtime.isLoaded||runtime.generation!==generation)throw Error('CONTENT_PAGE_RENDER_STALE')
   }
   assertRender()
   if(name!=='content.authoring.connect'||input!==undefined)throw Error('CONTENT_PAGE_COMMAND_UNKNOWN')
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
   return host.invoke(name,input,signal)
  },
 }
}
/** 脚本句柄只有业务能力和选择代次，没有业务数据副本。 */
export type ContentAuthoringScriptSession=Readonly<{
 assertCurrent:()=>void;select:()=>void;cancel:()=>void;setInputPending:(pending:boolean)=>void
 canLeave:boolean
 actionProps:(label:string,path:JsonPath|null)=>Readonly<{disabled:boolean;onClick:()=>void}>
 editorProps:(path:JsonPath)=>Readonly<Record<string,unknown>>
 readOriginalSave:(input:SaveReadInput)=>Promise<OriginalSave&Readonly<{comparison?:SaveComparison}>>
 readVolumePlanningObligations:()=>ReturnType<typeof readBaselineSubmissionObligations>
 readOriginalAdoption:(input:ContentAdoptionSelection)=>ReturnType<typeof inspectRegisteredAdoption>
 readOriginalForm:(selection:Parameters<typeof readRegisteredOriginalForm>[1])=>ReturnType<typeof readRegisteredOriginalForm>
 compareOriginalForms:(selection:Parameters<typeof compareRegisteredOriginalForms>[1])=>ReturnType<typeof compareRegisteredOriginalForms>
 previewCandidate:(selection:ContentRevisionSelection,options:CandidatePreviewInput)=>ReturnType<ContentCandidateBinding['previewScope']>
 captureCandidateDraft:()=>ReturnType<ContentAuthoringCommands['captureCandidateDraft']>
 prepareDraftCandidate:(input:DraftCandidateInput)=>ReturnType<typeof prepareDraftCandidateRequest>
}>
/** 供正式SparkPageRenderer.host使用；命令对象仍归原薄宿主释放。 */
export function createContentAuthoringScriptHost(binding:Binding,commands:ContentAuthoringCommands,receiptDataViewKey?:string){
 return {runtime:binding.runtime,assertCurrent:binding.assertCurrent,
  invoke(name:string,input:unknown,signal:AbortSignal):ContentAuthoringScriptSession{
   const assertCurrent=()=>{
    if(signal.aborted)throw Error('CONTENT_PAGE_RENDER_STALE')
    binding.assertCurrent();commands.assertInputCurrent(commands.epoch)
   }
   assertCurrent()
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
    async prepareDraftCandidate(selection:DraftCandidateInput){
     assertCurrent()
     const request=structuredClone(selection)
     const {runtime,projectId}=binding,scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId)throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
     const captured=await commands.captureCandidateDraft(commands.epoch)
     const assertDraft=()=>{assertCurrent();captured.assertCurrent()}
     const host={runtime,projectId,scenarioId,assertCurrent:assertDraft}
     const {baseRevisionId:revisionId}=captured
     if(revisionId!==null){
      if(request.firstBatchId!==undefined||request.targetScopeIndex!==undefined)throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
      const basis=await readDraftCandidateBasis(host,{revisionId})
      return prepareDraftCandidateRequest(captured,basis,{requestKey:request.requestKey,targetScope:request.targetScope})
     }
     const projectKey=buildDataViewKey('ContentProject','selectedProject',scenarioId)
     const projectView=runtime.resolveView(projectKey),project=projectView?.rows[0]
     const {firstBatchId}=request
     if(!projectView||project?.['projectId']!==projectId||project['headRevisionId']!==null||!identity(project['activeBaselineId'])||
      !identity(firstBatchId))
      throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
     const proof=projectView.captureReadRow(project,['projectId','headRevisionId','activeBaselineId'])
     const assertFirst=()=>{
      assertDraft()
      if(runtime.resolveView(projectKey)!==projectView)throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
      proof()
     }
     const basis=await readDraftCandidateBasis({...host,assertCurrent:assertFirst},
      {revisionId,firstBaselineId:project['activeBaselineId'],firstBatchId,targetScope:request.targetScope,
       ...(request.targetScopeIndex===undefined?{}:{targetScopeIndex:request.targetScopeIndex})})
     if(!('targetScope' in basis))throw Error('CONTENT_DRAFT_CANDIDATE_BASIS')
     return prepareDraftCandidateRequest(captured,basis,{requestKey:request.requestKey,targetScope:basis.targetScope})
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
    async readVolumePlanningObligations(){
     assertCurrent()
     const {runtime,projectId}=binding,scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId)throw Error('CONTENT_VOLUME_PLAN_SCOPE')
     const key=buildDataViewKey('ContentProject','selectedProject',scenarioId),view=runtime.resolveView(key)
     const row=view?.rows[0]
     if(!view||row?.['projectId']!==projectId||!identity(row['activeBaselineId']))throw Error('CONTENT_VOLUME_PLAN_SCOPE')
     const baselineId=row['activeBaselineId'],proof=view.captureReadRow(row,['projectId','activeBaselineId'])
     const assertProject=()=>{
      assertCurrent()
      if(runtime.resolveView(key)!==view)throw Error('CONTENT_VOLUME_PLAN_SCOPE')
      proof()
     }
     return readBaselineSubmissionObligations({runtime,scenarioId,projectId,assertCurrent:assertProject},baselineId)
    },
    async readOriginalSave(request:SaveReadInput){
     assertCurrent()
     const scenarioId=parseDataViewKey(binding.dataViewKey)?.scope
     if(!scenarioId||!receiptDataViewKey)throw Error('CONTENT_DRAFT_SAVE_RECEIPT_VIEW_REQUIRED')
     const {runtime,projectId,draftId,actorUserId}=binding
     const receipt=await readRegisteredOriginalContentDraftSave({runtime,scenarioId,projectId,draftId,actorUserId,receiptDataViewKey,assertCurrent},request)
     if(receipt.state!=='SAVED'||commands.hasPendingInput)return receipt
     const view=runtime.resolveView(binding.dataViewKey)
     const draft=()=>{
      assertCurrent()
      const row=view?.rows.find(item=>view.getPkKey(item)===draftId)
      if(commands.hasPendingInput||!view||!row||view.fieldAccess(row,'draft').read!=='visible')
       throw Error('CONTENT_DRAFT_SAVE_COMPARISON_UNAVAILABLE')
      return view.getEditingRow(draftId)?.['draft']
     }
     try{
      const comparison=await reconcileSavedContentDraft(receipt,{
       projectId,draftId,authorId:actorUserId,get draft(){return draft()},assertCurrent,
      })
      return Object.freeze({...receipt,comparison})
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
     return {...props,onChange(){assertCurrent();commands.assertInputCurrent(epoch)},onEditingChange(pending:boolean){
      if(typeof pending!=='boolean')throw Error('CONTENT_COMMAND_INPUT_STATE_REQUIRED')
      // 旧编辑器卸载的false不能清掉下一编辑器的保护。
      if(!pending&&epoch!==commands.epoch)return
      assertCurrent();commands.setInputPending('page11-detail',pending,epoch)
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
