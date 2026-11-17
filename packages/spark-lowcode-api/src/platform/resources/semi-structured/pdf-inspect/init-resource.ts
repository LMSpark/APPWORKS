/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/semi-structured/pdf-inspect/init-resource
 * 职责：将固定PDF核验请求接入原DataSet命令提交及未知结果核验。
 * 边界：不上传、不查询配置、不保留第二草稿；恢复不重新要求原规则仍启用。
 */
import type {BindCommandSubmitOptions,DataRow,DataView} from '@spark-appworks/spark-data'
import type {PdfInspectionApi,PdfInspectionInitInput} from './task-api'
class Unconfirmed extends Error{}
type Prepared=Readonly<{input:PdfInspectionInitInput;assertReady:()=>void}>
/** prepare同步核原配置/上传ACK及已持久化的requestId书签；不得派发或返回替代行。 */
export type PdfInspectionInitResourceInput=Readonly<{
 api:Pick<PdfInspectionApi,'init'|'recover'>
 assertCurrent:()=>void
 prepare:(view:DataView,row:Readonly<DataRow>)=>Prepared
}>
/** 每个绑定视图持有本次不可变命令证明，编辑仍由DataView负责。 */
export class PdfInspectionInitResource{
 static readonly resourceId='pdf-inspect:init'
 constructor(private readonly input:PdfInspectionInitResourceInput){}
 binding(view:DataView):BindCommandSubmitOptions{
  const dataSet=view.dataSet,intents=new Map<string,Prepared>()
  const guard=()=>{this.input.assertCurrent();if(!dataSet||dataSet.destroyed||view.destroyed||view.dataSet!==dataSet||dataSet.getView(view.tableName,view.viewId)!==view)throw Error('PDF_INSPECTION_OWNER: 原命令实例已变化')}
  const intent=(row:Readonly<DataRow>)=>{guard();const key=row['requestId'];const found=typeof key==='string'?intents.get(key):undefined;if(!found||row['configId']!==found.input.configId||JSON.stringify(row['files'])!==JSON.stringify(found.input.files))throw Error('PDF_INSPECTION_CAPTURE: 原请求输入不匹配');return found}
  const receipt=(prepared:Prepared,values:Readonly<{inspectJobId:string;status:string;fileCount:number}>)=>({requestId:prepared.input.requestId,configId:prepared.input.configId,files:prepared.input.files,...values})
  return{resource:{resourceType:'command',resourceId:PdfInspectionInitResource.resourceId},guard,inputFields:['configId','files'],createKey:()=>crypto.randomUUID(),allowAbandonUnconfirmed:false,retainConfirmedOnRefresh:true,
   onPrepareInput:row=>{
    guard();const prepared=this.input.prepare(view,row),key=row['requestId']
    if(typeof key!=='string'||key!==prepared.input.requestId||intents.has(key)||row['configId']!==prepared.input.configId||JSON.stringify(row['files'])!==JSON.stringify(prepared.input.files))throw Error('PDF_INSPECTION_CAPTURE: 缺少唯一原请求')
    prepared.assertReady();intents.set(key,{input:structuredClone(prepared.input),assertReady:prepared.assertReady})
   },
   submit:async row=>{
    const prepared=intent(row);prepared.assertReady();guard()
    try{return receipt(prepared,await this.input.api.init(prepared.input))}catch{throw new Unconfirmed('PDF核验接纳未确认，请仅核验原requestId')}
   },
   verify:async row=>{
    const prepared=intent(row)
    try{const recovered=await this.input.api.recover(prepared.input.requestId);guard();return receipt(prepared,{inspectJobId:recovered.inspectJobId,status:recovered.status,fileCount:recovered.progress.total})}catch{throw new Unconfirmed('PDF原请求仍未核定，禁止重新提交')}
   },
   isUnconfirmed:error=>error instanceof Unconfirmed,
  }
 }
}
