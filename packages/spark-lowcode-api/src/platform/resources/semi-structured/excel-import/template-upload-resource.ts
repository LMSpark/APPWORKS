/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/semi-structured/excel-import/template-upload-resource
 * 职责：将本次原File的上传/原ACK字节核验接入声明命令DataView。
 * 边界：不建表、不保存方案、不删除共享文件；未知只核原ACK，原File在取消或正式路径发布后释放。
 * AI用途：首次装配声明命令时绑定原File与正式方案证明，按原回执核验后交还可信路径。
 */
import type {BindCommandSubmitOptions,DataRow,DataSet,DataView} from '@spark-appworks/spark-data'
import type {LowcodeDesignFileUpload,LowcodeBinaryFileUploadReceipt} from '../../../../design/lowcode-design-file-upload.js'
import type {DataSpaceRequestScope} from '../../../data-space/runtime/data-space-runtime-contract.js'

/** 宿主基于原正式方案DataView提供的输入与同步证明；回调不返回替代数据或重新查询。 */
export type PreparedExcelTemplateUpload=Readonly<{
 /** 本次原方案所属的数据空间身份。 */
 scenarioId:string
 /** 独立查询及路径写回唯一使用的原方案主键。 */
 schemeId:string
 /** 用户选择的原生File，仅留本次RAM。 */
 file:File
 /** 同步重核原正式方案、查询范围及当前路径写权限；不查询、不派发。 */
 assertReady():void
 /** 同步核已独立回读的正式方案采用此路径，不能以本地草稿作证明。 */
 assertPublished(templatePath:string):void
 /** 同步核已独立回读的原方案尚未采用此路径，供明确保留未发布文件。 */
 assertUnpublished(templatePath:string):void
}>
/** 声明模板命令的存储适配输入；SDK负责文件I/O，宿主只提供原方案同步证明。 */
export type ExcelTemplateUploadResourceInput=Readonly<{
 /** 同一请求身份下的原File上传与字节核验能力。 */
 upload:LowcodeDesignFileUpload
 /** 读取本次真实执行域，用于切换后拒绝旧意图。 */
 readScope:()=>DataSpaceRequestScope
 /** 从当前命令标量身份定位本次RAM File及原正式方案证明，不返回另一份业务草稿。 */
 prepare(view:DataView,row:Readonly<DataRow>):PreparedExcelTemplateUpload
}>
type Intent={view:DataView;id:string;schemeId:string;scenarioId:string;name:string;size:number;file:File|undefined;ack:LowcodeBinaryFileUploadReceipt|undefined;dispatched:boolean;released:boolean;assertReady:(()=>void)|undefined;assertPublished:((path:string)=>void)|undefined;assertUnpublished:((path:string)=>void)|undefined}
class TemplateUploadUnconfirmed extends Error{}
const owners=new WeakMap<DataSet,ExcelTemplateUploadResource>()
function fingerprint(scope:DataSpaceRequestScope):string{return JSON.stringify([scope.token,Object.entries(scope.headers).sort(([a],[b])=>a.localeCompare(b))])}
function text(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.trim()!==value)throw Error('模板命令缺少正式字符串身份');return value}
function mayHaveApplied(error:unknown):boolean{return typeof error==='object'&&error!==null&&'fileResourceMutationMayHaveApplied'in error&&error.fileResourceMutationMayHaveApplied===true}
function pending(view:DataView):boolean{return view.hasUnconfirmedSave||view.mutating||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()}

/** 一DataSet一资源；同方案只有一个活动上传，File及ACK不进入JSON命令行。 */
export class ExcelTemplateUploadResource{
 /** 正式pagedata声明使用的命令资源身份，不充当后端模型ID。 */
 static readonly resourceId='excel:template-upload'
 readonly #scope:string
 readonly #bound=new WeakSet<DataView>()
 readonly #intents=new Map<string,Intent>()
 readonly #targets=new Map<string,Intent>()
 #dataSet:DataSet|undefined
 /** 捕获本次原执行域；同DataSet首次绑定后，不允许第二个资源实例重置上传责任。 */
 constructor(private readonly input:ExcelTemplateUploadResourceInput){const scope=input.readScope();if(!scope.token.trim()||!scope.headers['X-AppId']?.trim()||!scope.headers['tenant-id']?.trim())throw Error('模板上传缺少正式执行身份');this.#scope=fingerprint(scope)}
 private guard():void{if(fingerprint(this.input.readScope())!==this.#scope||this.#dataSet?.destroyed)throw Error('模板上传原执行域已失效')}
 private intent(view:DataView,id:string):Intent{this.guard();const intent=this.#intents.get(id);if(view.destroyed||this.#dataSet?.getView(view.tableName,view.viewId)!==view||intent?.view !== view||intent.released||this.#targets.get(intent.schemeId)!==intent)throw Error('模板原上传意图缺失或已释放');return intent}
 private row(intent:Intent):DataRow{if(!intent.ack)throw new TemplateUploadUnconfirmed('原上传ACK缺失，禁止重传或猜文件');return{commandId:intent.id,schemeId:intent.schemeId,originalName:intent.name,size:intent.size,templatePath:intent.ack.templatePath}}
 /** 首次装配只绑定声明命令；refresh保留已确认只读回执，不再次上传。 */
 binding(view:DataView):BindCommandSubmitOptions{
  const ds=view.dataSet,table=view.dataTable
  if(!ds||!table||this.#dataSet&&this.#dataSet!==ds||this.#bound.has(view)||owners.has(ds)&&owners.get(ds)!==this||table.modelBinding!==undefined||table.resourceType!=='command'||table.resourceId!==ExcelTemplateUploadResource.resourceId||view.primaryKey!=='commandId'||['commandId','schemeId','originalName','size','templatePath'].some(name=>!view.columns.some(column=>column.name===name)))throw Error('模板命令须首次绑定同一正式声明实例')
  this.#dataSet=ds;this.guard();this.#bound.add(view);owners.set(ds,this)
  const guard=()=>{this.guard();if(view.destroyed||ds.getView(view.tableName,view.viewId)!==view||view.dataTable!==table||table.modelBinding!==undefined||table.resourceType!=='command'||table.resourceId!==ExcelTemplateUploadResource.resourceId||view.primaryKey!=='commandId')throw Error('模板命令原视图已失效')}
  const intentFor=(row:Readonly<DataRow>)=>{guard();const intent=this.intent(view,text(row['commandId']));if(row['schemeId']!==intent.schemeId||row['originalName']!==intent.name||row['size']!==intent.size)throw Error('模板输入与首轮原File不符');return intent}
  return{resource:{resourceType:'command',resourceId:ExcelTemplateUploadResource.resourceId},guard,inputFields:['schemeId','originalName','size'],createKey:()=>crypto.randomUUID(),allowAbandonUnconfirmed:false,retainConfirmedOnRefresh:true,
   onPrepareInput:row=>{
    guard()
    if(Object.keys(row).some(name=>!['commandId','schemeId','originalName','size'].includes(name)))throw Error('模板命令只接纳标量输入，File和回执不能进入JSON输入行')
    const prepared=this.input.prepare(view,row),id=text(row['commandId']),schemeId=text(prepared.schemeId),scenarioId=text(prepared.scenarioId)
    prepared.assertReady();guard()
    if(scenarioId!==ds.scenarioId||row['schemeId']!==schemeId||row['originalName']!==prepared.file.name||row['size']!==prepared.file.size||this.#intents.has(id)||this.#targets.has(schemeId))throw Error('原方案已有模板意图或输入与原File不符')
    const intent:Intent={view,id,schemeId,scenarioId,name:prepared.file.name,size:prepared.file.size,file:prepared.file,ack:undefined,dispatched:false,released:false,assertReady:prepared.assertReady,assertPublished:prepared.assertPublished,assertUnpublished:prepared.assertUnpublished}
    this.#intents.set(id,intent);this.#targets.set(schemeId,intent)
   },
   submit:async row=>{
    const intent=intentFor(row);if(intent.dispatched)throw new TemplateUploadUnconfirmed('原模板上传已派发，禁止重传')
    if(!intent.file||!intent.assertReady)throw Error('原File输入已释放')
    intent.assertReady();guard()
    try{
     intent.ack=await this.input.upload.uploadBinaryVersion({file:intent.file,scenarioId:intent.scenarioId,appType:'xlsxtemp',customPath:'xlsxtemp',fieldName:'files',assertReady:()=>{intent.assertReady?.();guard()}});intent.dispatched=true
     await this.input.upload.verifyBinaryVersion({receipt:intent.ack,file:intent.file});guard();return this.row(intent)
    }catch(error){if(intent.ack||mayHaveApplied(error)){intent.dispatched=true;throw new TemplateUploadUnconfirmed(`模板上传结果未确认：${error instanceof Error?error.message:String(error)}`)}throw error}
   },
   verify:async row=>{
    const intent=intentFor(row)
    if(!intent.dispatched||!intent.ack||!intent.file)throw new TemplateUploadUnconfirmed('原上传ACK缺失，保留原意图，禁止重传或猜定位')
    try{await this.input.upload.verifyBinaryVersion({receipt:intent.ack,file:intent.file});guard();return this.row(intent)}catch(error){throw new TemplateUploadUnconfirmed(`原模板字节尚未核定：${error instanceof Error?error.message:String(error)}`)}
   },
   isUnconfirmed:error=>error instanceof TemplateUploadUnconfirmed,
  }
 }
 /** 仅释放已由原DataView取消的未派发File输入；本方法不取消数据，不删除文件。 */
 releaseCancelled(view:DataView,id:string):void{
  const intent=this.intent(view,id)
  if(intent.dispatched||view.hasUnconfirmedSave||view.mutating||view.dirtyTracking.isPendingCreate(id)||view.hasEditingChanges(id)||view.rows.some(row=>view.getPkKey(row)===id))throw Error('原DataView尚未取消输入，或模板已派发/未知')
  this.#targets.delete(intent.schemeId);this.#intents.delete(id)
 }
 /** 在业务暂存与公共保存捕获前核原私有ACK及当前只读行，返回可信路径，不信任可直接变动的展示行。 */
 assertConfirmed(view:DataView,id:string):string{
  const intent=this.intent(view,id),row=view.rows.find(item=>view.getPkKey(item)===id)
  if(!intent.dispatched||!intent.ack||pending(view)||row?.['schemeId'] !== intent.schemeId||row['originalName']!==intent.name||row['size']!==intent.size||row['templatePath']!==intent.ack.templatePath||view.fieldAccess(row,'templatePath').read!=='visible')throw Error('原模板私有ACK与当前只读回执不符')
  return intent.ack.templatePath
 }
 /** 显式保留已确认但未发布的文件；宿主须独立回读证明原方案未采用，保留只读定位且不物理删除。 */
 releaseUnpublished(view:DataView,id:string):void{
  const path=this.assertConfirmed(view,id),intent=this.intent(view,id)
  if(!intent.assertUnpublished)throw Error('原未发布证明缺失')
  const check:(path:string)=>unknown=intent.assertUnpublished,outcome=check(path)
  if(outcome!==undefined){void Promise.resolve(outcome).catch(()=>undefined);throw Error('模板未发布证明必须同步核定')}
  if(this.assertConfirmed(view,id)!==path)throw Error('原模板回执已变化')
  this.release(intent)
 }
 private release(intent:Intent):void{intent.released=true;intent.file=undefined;intent.ack=undefined;intent.assertReady=undefined;intent.assertPublished=undefined;intent.assertUnpublished=undefined;this.#targets.delete(intent.schemeId)}
 /** 宿主已独立确认正式templatePath后释放原File及ACK证据；保留命令只读结果，不改业务或物理文件。 */
 releasePublished(view:DataView,id:string):void{
  const intent=this.intent(view,id),row=view.rows.find(item=>view.getPkKey(item)===id)
  if(!intent.dispatched||!intent.ack||!intent.assertPublished||row?.['templatePath'] !== intent.ack.templatePath||pending(view))throw Error('原模板回执或正式路径尚未完整确认')
  const path=intent.ack.templatePath,check:(path:string)=>unknown=intent.assertPublished,outcome=check(path)
  if(outcome!==undefined){void Promise.resolve(outcome).catch(()=>undefined);throw Error('模板发布证明必须同步核定')}
  this.intent(view,id)
  if(view.rows.find(item=>view.getPkKey(item)===id)!==row||row['schemeId']!==intent.schemeId||row['templatePath']!==path||view.fieldAccess(row,'templatePath').read!=='visible'||pending(view))throw Error('原模板回执在发布核定期间已变化')
  this.release(intent)
 }
}
