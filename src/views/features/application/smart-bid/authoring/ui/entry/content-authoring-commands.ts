/**
 * @module app:views/features/application/smart-bid/authoring/ui/entry/content-authoring-commands
 * 职责：为页11同次宿主编排原草稿编辑命令及未保存输入守卫。
 * 边界：不另存草稿、不查询/保存、不建立全局命令注册或权限规则。
 * AI用途：正式页面脚本桥调用此实例；旧代次、未确认输入或原查询失效必须拒绝。
 */
import {ContentTreeDraftEditor} from '@/services/smart-bid/content-tree-draft-editor'
import {contentDraftSaveRule,validateContentDraftPayload} from '@/services/smart-bid/content-draft-save-rule'
import {prepareContentDraftSaveRequest} from '@/services/smart-bid/content/draft/content-draft-save-request'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'
import type {ContentAuthoringBinding} from '../../model/content-authoring-host'
import {parseDataViewKey,resolveDataViewKey,type DataView} from '@spark-appworks/spark-data'

type Binding=Pick<ContentAuthoringBinding,'runtime'|'dataViewKey'|'projectId'|'draftId'|'actorUserId'|'assertCurrent'|'setPending'>
type Action='addDocument'|'addChapter'|'addParagraph'|'addList'|'addListItem'|'addQuote'|'addTableOfContents'|'addTable'|'updateTable'|'updateText'|'move'|'remove'
/** 命令参数沿既有领域方法类型，不另造节点或持久化合同。 */
export type ContentAuthoringCommand={[K in Action]:Readonly<{action:K;args:Parameters<ContentTreeDraftEditor[K]>}>}[Action]
/** 本次调用拥有的业务命令；未确认文本只记编辑器标识，不保存其内容。 */
export class ContentAuthoringCommands {
 readonly #view:DataView
 readonly #assertResult:()=>void
 readonly #assertRow:()=>void
 readonly #inputs=new Set<string>()
 readonly #listeners=new Set<()=>void>()
 readonly #dirtyKey=`content-authoring-input:${crypto.randomUUID()}`
 #epoch=0
 #active=true
 constructor(private readonly binding:Binding){
  binding.assertCurrent()
  const view=binding.runtime.resolveView(binding.dataViewKey),key=parseDataViewKey(binding.dataViewKey)
  if(!view?.dataSet||!key?.scope||key.tableName!=='WorkingDraft'||resolveDataViewKey(binding.dataViewKey,view.dataSet)!==view
   ||view.dataTable?.modelBinding?.modelName!=='WorkingDraft'||view.commitMode!=='staged')throw Error('CONTENT_COMMAND_VIEW_REQUIRED')
  const row=view.rows.find(item=>view.getPkKey(item)===binding.draftId)
  if(row?.['projectId'] !== binding.projectId||row['userId']!==binding.actorUserId)throw Error('CONTENT_COMMAND_TARGET_REQUIRED')
  this.#view=view;this.#assertResult=view.captureReadResult()
  this.#assertRow=view.captureReadRow(row,[view.primaryKey,'projectId','userId'])
  const table=view.dataTable
  table.setQuerySaveRule({groups:[...(table.querySaveRule?.groups??[]),...contentDraftSaveRule(binding.projectId).groups,
   {fields:['draft'],validate:()=>{throw Error('CONTENT_DRAFT_REMOTE_SAVE_UNAVAILABLE')}}]})
  const inputs=this.#inputs,listeners=this.#listeners
  binding.runtime.setExternalDirtySource(this.#dirtyKey,{
   get isDirty(){return inputs.size>0},
   subscribe(listener){listeners.add(listener);return()=>{listeners.delete(listener)}},
  })
 }
 get epoch():number{return this.#epoch}
 /** 输入编辑只核本次原身份，不在开始输入时改写草稿。 */
 assertInputCurrent(epoch:number):void{this.assertCurrent(epoch)}
 get hasPendingInput():boolean{return this.#inputs.size>0}
 /** 固定用于生成候选的已保存个人草稿，避免将本地编辑覆盖层当作持久证据。 */
 async captureCandidateDraft(epoch:number){
  this.assertCurrent(epoch)
  const {draftId,projectId,actorUserId}=this.binding,view=this.#view
  const assertSaved=()=>{
   this.assertCurrent(epoch)
   if(this.#inputs.size||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges(draftId))
    throw Error('CONTENT_CANDIDATE_DRAFT_UNSAVED')
  }
  assertSaved()
  const row=view.rows.find(item=>view.getPkKey(item)===draftId)
  if(!row)throw Error('CONTENT_CANDIDATE_DRAFT_REQUIRED')
  const proof=view.captureReadRow(row,['draftVersion','baseRevisionId','draft'])
  const assertCurrent=()=>{assertSaved();proof()}
  assertCurrent()
  const {draftVersion,baseRevisionId,draft}=row
  if(!identity(draftVersion)||(baseRevisionId!==null&&!identity(baseRevisionId)))throw Error('CONTENT_CANDIDATE_DRAFT_REQUIRED')
  const draftJson=canonicalSnapshotValue(draft)
  const snapshot:unknown=JSON.parse(draftJson)
  validateContentDraftPayload({projectId,draft:snapshot})
  const contentDigest=await hashCanonicalSnapshotText(draftJson)
  assertCurrent()
  return Object.freeze({projectId,draftId,actorUserId,draftVersion,baseRevisionId,draftJson,contentDigest,assertCurrent})
 }
 /** 只捕获本行确认为编辑的内容和原查询所见的并发版本。 */
 prepareSave(requestKey:string,epoch:number){
  this.assertCurrent(epoch)
  if(this.#inputs.size)throw Error('CONTENT_COMMAND_PENDING_INPUT')
  const {draftId,projectId}=this.binding
  const view=this.#view
  const original=view.rows.find(row=>view.getPkKey(row)===draftId),edited=view.getEditingRow(draftId)
  if(!original||!edited)throw Error('CONTENT_DRAFT_SAVE_SCOPE')
  const assertVersion=view.captureReadRow(original,['draftVersion','baseRevisionId'])
  const {draftVersion,baseRevisionId}=original
  if(typeof draftVersion!=='string'||baseRevisionId!==null&&typeof baseRevisionId!=='string'||
   view.fieldAccess(edited,'draft').read!=='visible'||view.fieldAccess(edited,'draft').write!=='allowed')
   throw Error('CONTENT_DRAFT_SAVE_SCOPE')
  const draft=edited['draft'],signature=canonicalSnapshotValue(draft)
  if(signature===canonicalSnapshotValue(original['draft']))throw Error('CONTENT_DRAFT_SAVE_UNCHANGED')
  const assertCurrent=()=>{
   this.assertCurrent(epoch);assertVersion()
   const row=view.getEditingRow(draftId)
   if(!row||canonicalSnapshotValue(row['draft'])!==signature)throw Error('CONTENT_DRAFT_SAVE_STALE')
  }
  return prepareContentDraftSaveRequest({projectId,draftId,baseRevisionId,expectedDraftVersion:draftVersion,requestKey,draft,assertCurrent})
 }
 /** 选择元信息仍归标准组件；只撤销旧选择产生的按钮回调，不保存节点副本。 */
 selectionChanged(epoch:number):void{
  this.assertCurrent(epoch)
  if(this.#inputs.size)throw Error('CONTENT_COMMAND_PENDING_INPUT')
  this.#epoch++
 }
 get canLeave():boolean{return this.#inputs.size===0&&!this.binding.runtime.isDirty&&!this.#view.mutating&&!this.#view.hasUnconfirmedSave&&!this.#view.hasPendingSavedRowPermissions}
 private assertCurrent(epoch:number):void {
  if(!this.#active||epoch!==this.#epoch)throw Error('CONTENT_COMMAND_STALE')
  this.binding.assertCurrent();this.#assertResult();this.#assertRow()
  if(this.binding.runtime.resolveView(this.binding.dataViewKey)!==this.#view)throw Error('CONTENT_COMMAND_STALE')
  if(this.#view.mutating||this.#view.hasUnconfirmedSave||this.#view.hasPendingSavedRowPermissions)throw Error('CONTENT_COMMAND_MUTATING')
 }
 run(command:ContentAuthoringCommand,epoch:number):void{
  this.assertCurrent(epoch)
  if(this.#inputs.size)throw Error('CONTENT_COMMAND_PENDING_INPUT')
  const editor=new ContentTreeDraftEditor(this.#view,this.binding.draftId,this.binding.projectId)
  switch(command.action){
   case 'addDocument':editor.addDocument(...command.args);break
   case 'addChapter':editor.addChapter(...command.args);break
   case 'addParagraph':editor.addParagraph(...command.args);break
   case 'addList':editor.addList(...command.args);break
   case 'addListItem':editor.addListItem(...command.args);break
   case 'addQuote':editor.addQuote(...command.args);break
   case 'addTableOfContents':editor.addTableOfContents(...command.args);break
   case 'addTable':editor.addTable(...command.args);break
   case 'updateTable':editor.updateTable(...command.args);break
   case 'updateText':editor.updateText(...command.args);break
   case 'move':editor.move(...command.args);break
   case 'remove':editor.remove(...command.args);break
   default:throw Error('CONTENT_COMMAND_UNKNOWN')
  }
  this.#epoch++
 }
 setInputPending(source:string,pending:boolean,epoch:number):void{
  this.assertCurrent(epoch)
  if(typeof source!=='string'||source.length===0||source.trim()!==source)throw Error('CONTENT_COMMAND_INPUT_SOURCE_REQUIRED')
  if(typeof pending!=='boolean')throw Error('CONTENT_COMMAND_INPUT_STATE_REQUIRED')
  if(pending)this.#inputs.add(source);else this.#inputs.delete(source)
  this.binding.setPending(this.#inputs.size>0)
  for(const listener of this.#listeners)listener()
 }
 cancel(epoch:number):void{
  if(!this.#active||epoch!==this.#epoch||this.binding.runtime.destroyed)throw Error('CONTENT_COMMAND_STALE')
  let discardRows=true
  try{
   this.assertCurrent(epoch)
  }catch(cause){
   // 已失效的编辑器只能清理它尚未写回的输入，不能操作视图中的行。
   if(this.#inputs.size===0||this.#view.hasEditingChanges()||this.#view.mutating||
    this.#view.hasUnconfirmedSave||this.#view.hasPendingSavedRowPermissions)throw cause
   discardRows=false
  }
  if(discardRows)this.#view.discardEditingRows([this.binding.draftId])
  this.#inputs.clear();this.#epoch++;this.binding.setPending(false)
  for(const listener of this.#listeners)listener()
 }
 dispose():void{
  this.#active=false;this.#epoch++
  if(this.#inputs.size===0&&!this.binding.runtime.destroyed)this.binding.runtime.setExternalDirtySource(this.#dirtyKey,null)
 }
}
