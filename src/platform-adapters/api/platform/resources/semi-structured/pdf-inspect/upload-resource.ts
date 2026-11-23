/**
 * @module @/platform-adapters/api:platform/resources/semi-structured/pdf-inspect/upload-resource
 * 职责：PDF/ZIP原File通过DataSet命令上传并核验原ACK字节。
 * 边界：File与ACK只留本次存储适配；未知只核原ACK，不重传、不从展示路径重建ACK。
 */
import type {BindCommandSubmitOptions,DataRow,DataView} from '@spark-appworks/spark-data'
import type {LowcodeDesignFileUpload,LowcodeBinaryFileUploadReceipt} from '../../../../design/lowcode-design-file-upload'
import type {PdfInspectionFileInput} from './task-api'
type Prepared=Readonly<{scenarioId:string;file:File;assertReady:()=>void}>
type Intent={prepared:Prepared;ack?:LowcodeBinaryFileUploadReceipt;attempted:boolean;confirmed:boolean}
class UploadUnknown extends Error{}
/** 原宿主提供用户选择的File及限制/原配置证明，不在这里读取第二份业务数据。 */
export type PdfInspectionUploadResourceInput=Readonly<{
 upload:Pick<LowcodeDesignFileUpload,'uploadBinaryVersion'|'verifyBinaryVersion'>
 assertCurrent:()=>void
 prepare:(view:DataView,row:Readonly<DataRow>)=>Prepared
}>
export class PdfInspectionUploadResource{
 static readonly resourceId='pdf-inspect:upload'
 private readonly intents=new WeakMap<DataView,Map<string,Intent>>()
 constructor(private readonly input:PdfInspectionUploadResourceInput){}
 binding(view:DataView):BindCommandSubmitOptions{
  if(this.intents.has(view))throw Error('PDF_UPLOAD_OWNER: 视图已绑定')
  const dataSet=view.dataSet,intents=new Map<string,Intent>();this.intents.set(view,intents)
  const guard=()=>{this.input.assertCurrent();if(!dataSet||dataSet.destroyed||view.destroyed||view.dataSet!==dataSet||dataSet.getView(view.tableName,view.viewId)!==view)throw Error('PDF_UPLOAD_OWNER: 原视图已变化')}
  const original=(row:Readonly<DataRow>)=>{guard();const key=row['uploadId'],intent=typeof key==='string'?intents.get(key):undefined
   if(!intent||row['originalName']!==intent.prepared.file.name||row['size']!==intent.prepared.file.size)throw Error('PDF_UPLOAD_CAPTURE: 原文件捕获不匹配');return intent}
  const receipt=(row:Readonly<DataRow>,intent:Intent)=>{if(!intent.ack)throw Error('PDF_UPLOAD_ACK: 原ACK缺失');return{uploadId:row['uploadId'],originalName:intent.prepared.file.name,size:intent.prepared.file.size,filePath:intent.ack.templatePath}}
  return{resource:{resourceType:'command',resourceId:PdfInspectionUploadResource.resourceId},guard,inputFields:['originalName','size'],createKey:()=>crypto.randomUUID(),allowAbandonUnconfirmed:false,retainConfirmedOnRefresh:true,
   onPrepareInput:row=>{
    guard();const key=row['uploadId'],prepared=this.input.prepare(view,row)
    if(typeof key!=='string'||intents.has(key)||prepared.scenarioId!==dataSet?.scenarioId||!(prepared.file instanceof File)||row['originalName']!==prepared.file.name||row['size']!==prepared.file.size)throw Error('PDF_UPLOAD_CAPTURE: 原文件输入无效')
    prepared.assertReady();intents.set(key,{prepared,attempted:false,confirmed:false})
   },
   submit:async row=>{
    const intent=original(row);if(intent.attempted)throw new UploadUnknown('原文件已派发，禁止重传')
    intent.prepared.assertReady();guard()
    try{
     intent.ack=await this.input.upload.uploadBinaryVersion({file:intent.prepared.file,scenarioId:intent.prepared.scenarioId,appType:'filedata',customPath:'',fieldName:'files',assertReady:()=>{intent.prepared.assertReady();guard()}})
     intent.attempted=true;await this.input.upload.verifyBinaryVersion({receipt:intent.ack,file:intent.prepared.file});guard();intent.confirmed=true;return receipt(row,intent)
    }catch(error){
     if(intent.ack||typeof error==='object'&&error!==null&&'fileResourceMutationMayHaveApplied'in error&&error.fileResourceMutationMayHaveApplied===true){intent.attempted=true;throw new UploadUnknown('PDF上传未确认，保留原File及ACK')}
     throw error
    }
   },
   verify:async row=>{
    const intent=original(row)
    if(!intent.attempted||!intent.ack)throw new UploadUnknown('原上传ACK缺失，禁止猜测路径或重传')
    try{await this.input.upload.verifyBinaryVersion({receipt:intent.ack,file:intent.prepared.file});guard();intent.confirmed=true;return receipt(row,intent)}catch{throw new UploadUnknown('原上传字节仍未核定')}
   },isUnconfirmed:error=>error instanceof UploadUnknown,
  }
 }
 /** 只把同一视图已确认回执的真实ACK交给init；不接受手工路径。 */
 fileInput(view:DataView,uploadId:string):Readonly<{input:PdfInspectionFileInput;assertCurrent:()=>void}>{
  const intent=this.intents.get(view)?.get(uploadId),row=view.rows.find(item=>view.getPkKey(item)===uploadId)
  if(!intent?.confirmed||!intent.ack||!row)throw Error('PDF_UPLOAD_ACK: 尚无确认回执')
  const ack=intent.ack
  const assertCurrent=()=>{this.input.assertCurrent();if(view.destroyed||view.dataSet?.destroyed||view.rows.find(item=>view.getPkKey(item)===uploadId)!==row
    ||view.mutating||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()
    ||view.fieldAccess(row,'filePath').read!=='visible'||row['filePath']!==ack.templatePath)throw Error('PDF_UPLOAD_ACK: 原回执路径或确认状态变化')}
  assertCurrent();return{input:{fileId:uploadId,appType:'filedata',filePath:ack.templatePath},assertCurrent}
 }
 /** 仅释放原视图已取消且从未派发的File，不删除物理文件。 */
 releaseCancelled(view:DataView,uploadId:string):void{
  const intents=this.intents.get(view),intent=intents?.get(uploadId)
  if(!intent||intent.attempted||view.mutating||view.hasUnconfirmedSave||view.dirtyTracking.isPendingCreate(uploadId)||view.rows.some(row=>view.getPkKey(row)===uploadId))throw Error('PDF_UPLOAD_CAPTURE: 原文件尚未取消或已派发')
  intents?.delete(uploadId)
 }
}
