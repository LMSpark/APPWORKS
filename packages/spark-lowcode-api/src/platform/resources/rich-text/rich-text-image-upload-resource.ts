/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/rich-text/rich-text-image-upload-resource
 * 职责：把富文本图片上传装配为宿主 DataSet 上的运行时写命令 DataView：一行命令=一张原 File 上传并按 ACK 回读字节核验。
 * 边界：只写 wwwroot 需求原型图片目录；不保存业务行、不删除文件。原 File 仅留本实例 RAM，不进入 JSON 命令行；结果未知只核原 ACK，不重传。
 * AI用途：富文本编辑器的 imageUploader 经本资源 upload(file) 取得已核验的持久图片地址，再由业务 DataView 保存 HTML。
 */
import {bindDataSetCommandSubmit,ensureDataSetResourceView,type DataRow,type DataSet,type DataView} from '@spark-appworks/spark-data'
import type {LowcodeBinaryFileUploadReceipt,LowcodeDesignFileUpload} from '../../../design/lowcode-design-file-upload.js'
import type {DataSpaceRequestScope} from '../../data-space/runtime/data-space-runtime-contract.js'

/** 构造输入：同一请求身份下的上传 SDK 与执行域读取。 */
export type RichTextImageUploadResourceInput=Readonly<{
 /** 宿主 PageRuntime 拥有的数据空间；命令表依附它并随其销毁。 */
 dataSet:DataSet
 /** 与当前执行域一致的二进制上传/字节核验能力。 */
 upload:LowcodeDesignFileUpload
 /** 读取本次真实执行域；与构造时指纹不一致即拒绝旧意图。 */
 readScope:()=>DataSpaceRequestScope
}>
type Intent={file:File;ack:LowcodeBinaryFileUploadReceipt|undefined;dispatched:boolean}
class RichTextImageUploadUnconfirmed extends Error{}
const IMAGE_NAME=/\.(?:png|jpe?g|gif|webp)$/i
const TABLE='RichTextImageUpload'
function mayHaveApplied(error:unknown):boolean{return typeof error==='object'&&error!==null&&'fileResourceMutationMayHaveApplied'in error&&error.fileResourceMutationMayHaveApplied===true}
function fingerprint(scope:DataSpaceRequestScope):string{return JSON.stringify([scope.token,Object.entries(scope.headers).sort(([a],[b])=>a.localeCompare(b))])}

/** 一 DataSet 一实例；上传串行，未知回执须先核验或确认未生效后才接受下一张图片。 */
export class RichTextImageUploadResource{
 /** 运行时命令资源身份，不对应后端模型。 */
 static readonly resourceId='rich-text:image-upload'
 /** 命令行 DataView：commandId 主键；originalName/size 为输入；imagePath 为核验后的只读回执。 */
 readonly view:DataView
 readonly #dataSet:DataSet
 readonly #guard:()=>void
 readonly #intents=new Map<string,Intent>()
 #next:File|undefined
 #pendingId:string|undefined
 #flight:Promise<unknown>=Promise.resolve()

 /** 在宿主 DataSet 上创建命令表并绑定提交；同名表已存在或执行身份缺失时拒绝。 */
 public constructor(input:RichTextImageUploadResourceInput){
  if(input.dataSet.destroyed)throw Error('富文本图片上传DataSet已销毁')
  if(input.dataSet.getTable(TABLE))throw Error(`富文本图片上传资源表名冲突: ${TABLE}`)
  const scope=input.readScope()
  if(!scope.token.trim()||!scope.headers['X-AppId']?.trim()||!scope.headers['tenant-id']?.trim())throw Error('富文本图片上传缺少正式执行身份')
  const captured=fingerprint(scope)
  this.#dataSet=input.dataSet
  this.#guard=()=>{if(fingerprint(input.readScope())!==captured||input.dataSet.destroyed)throw Error('富文本图片上传原执行域已失效')}
  this.view=ensureDataSetResourceView({dataSet:input.dataSet,tableName:TABLE,resource:{resourceType:'command',resourceId:RichTextImageUploadResource.resourceId},
   columns:[{name:'commandId',type:'string',primary:true},{name:'originalName',type:'string'},{name:'size',type:'number'},{name:'imagePath',type:'string'}]})
  this.view.commitMode='staged'
  const guard=()=>{this.#guard();if(this.view.destroyed||input.dataSet.getView(TABLE,'default')!==this.view)throw Error('富文本图片上传原视图已失效')}
  const intentFor=(row:Readonly<DataRow>):Intent=>{const intent=this.#intents.get(String(row['commandId']??''));if(!intent||row['originalName']!==intent.file.name||row['size']!==intent.file.size)throw Error('图片命令与原File不符');return intent}
  const receipt=(row:Readonly<DataRow>,intent:Intent):DataRow=>{if(!intent.ack)throw new RichTextImageUploadUnconfirmed('图片上传ACK缺失，禁止重传');return{commandId:row['commandId'],originalName:intent.file.name,size:intent.file.size,imagePath:intent.ack.templatePath}}
  bindDataSetCommandSubmit(this.view,{
   resource:{resourceType:'command',resourceId:RichTextImageUploadResource.resourceId},guard,inputFields:['originalName','size'],createKey:()=>crypto.randomUUID(),
   allowAbandonUnconfirmed:false,retainConfirmedOnRefresh:true,
   onPrepareInput:row=>{
    guard()
    const file=this.#next,id=String(row['commandId']??'')
    if(!file||!id||this.#intents.has(id)||row['originalName']!==file.name||row['size']!==file.size)throw Error('图片命令缺少本次原File')
    this.#next=undefined;this.#intents.set(id,{file,ack:undefined,dispatched:false})
   },
   submit:async row=>{
    const intent=intentFor(row)
    if(intent.dispatched)throw new RichTextImageUploadUnconfirmed('原图片上传已派发，禁止重传')
    guard()
    try{
     intent.ack=await input.upload.uploadBinaryVersion({file:intent.file,scenarioId:input.dataSet.scenarioId??'',appType:'wwwroot',customPath:'ApplicationFunMan/Prototype',fieldName:'files',assertReady:guard})
     intent.dispatched=true
     await input.upload.verifyBinaryVersion({receipt:intent.ack,file:intent.file});guard()
     return receipt(row,intent)
    }catch(error){if(intent.ack||mayHaveApplied(error)){intent.dispatched=true;throw new RichTextImageUploadUnconfirmed(`图片上传结果未确认：${error instanceof Error?error.message:String(error)}`)}throw error}
   },
   verify:async row=>{
    const intent=intentFor(row)
    if(!intent.dispatched||!intent.ack)throw new RichTextImageUploadUnconfirmed('原图片上传ACK缺失，保留原意图，禁止重传或猜定位')
    try{await input.upload.verifyBinaryVersion({receipt:intent.ack,file:intent.file});guard();return receipt(row,intent)}
    catch(error){throw new RichTextImageUploadUnconfirmed(`原图片字节尚未核定：${error instanceof Error?error.message:String(error)}`)}
   },
   isUnconfirmed:error=>error instanceof RichTextImageUploadUnconfirmed,
  })
 }

 /** 是否存在结果未知、须先核验的原上传。 */
 public get hasUnconfirmedUpload():boolean{return this.view.hasUnconfirmedSave}

 /**
  * 串行上传一张图片：经命令 DataView 新增一行并由 DataSet.saveChanges 提交，返回核验后的持久路径。
  * 存在未知回执时先只核验原命令（不重传）；核验仍未确定则拒绝本次上传。
  */
 public upload(file:File):Promise<string>{
  const run=this.#flight.catch(()=>undefined).then(async()=>this.uploadNow(file))
  this.#flight=run
  return run
 }

 private async uploadNow(file:File):Promise<string>{
  this.#guard()
  if(!IMAGE_NAME.test(file.name))throw Error('仅支持png/jpg/gif/webp图片文件')
  const previous=this.#pendingId
  if(previous!==undefined){
   try{await this.save(previous)}catch(error){if(this.view.hasUnconfirmedSave)throw Error(`上一张图片上传结果仍未确认，请稍后重试：${error instanceof Error?error.message:String(error)}`)}
   this.release(previous)
  }
  await this.view.refresh()
  this.#next=file
  let id:string
  try{
   const row=await this.view.addRow({originalName:file.name,size:file.size})
   const key=this.view.getPkKey(row)
   if(typeof key!=='string'||!key)throw Error('图片命令未生成本地身份')
   id=key
  }finally{this.#next=undefined}
  this.#pendingId=id
  try{await this.save(id)}catch(error){if(!this.view.hasUnconfirmedSave)this.release(id);throw error}
  const row=this.view.rows.find(item=>this.view.getPkKey(item)===id),intent=this.#intents.get(id)
  const path=row?.['imagePath']
  if(typeof path!=='string'||!path||path!==intent?.ack?.templatePath)throw Error('图片上传回执与原ACK不一致')
  this.release(id)
  return path
 }

 private async save(id:string):Promise<void>{
  const result=await this.#dataSet.saveChanges({views:[{tableName:TABLE,viewId:'default',ids:[id]}]})
  this.#guard()
  if(!result.success)throw result.error??Error(result.message??'图片上传命令未确认')
 }

 private release(id:string):void{
  if(this.view.dirtyTracking.isPendingCreate(id)&&!this.view.hasUnconfirmedSave)this.view.discardPendingChanges([id])
  this.#intents.delete(id)
  if(this.#pendingId===id)this.#pendingId=undefined
 }
}
