/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/semi-structured/pdf-inspect/init-resource
 * 职责：将固定PDF核验请求接入原DataSet命令提交及未知结果核验。
 * 边界：不上传、不查询配置、不保留第二草稿；恢复不重新要求原规则仍启用。
 */
import type {BindCommandSubmitOptions,DataRow,DataView} from '@spark-appworks/spark-data'
import type {PdfInspectionApi,PdfInspectionInitInput} from './task-api'
import type {PdfInspectionRecoveryJournal,PdfInspectionRecoveryPointer} from './recovery-journal'
class Unconfirmed extends Error{}
type Prepared=Readonly<{input:PdfInspectionInitInput;assertReady:()=>void}>
type Intent={prepared:Prepared;pointer:PdfInspectionRecoveryPointer;mayHaveDispatched:boolean;receipt?:DataRow}
type Binding={guard:()=>void;intents:Map<string,Intent>}
/** prepare只同步核原配置/上传ACK；恢复定位由原命令适配捕获，不改活实例路由。 */
export type PdfInspectionInitResourceInput=Readonly<{
 api:Pick<PdfInspectionApi,'init'|'recover'>
 recovery:Pick<PdfInspectionRecoveryJournal,'begin'|'assertCurrent'|'settle'>
 assertCurrent:()=>void
 prepare:(view:DataView,row:Readonly<DataRow>)=>Prepared
}>
/** 每个绑定视图持有本次不可变命令证明，编辑仍由DataView负责。 */
export class PdfInspectionInitResource{
 static readonly resourceId='pdf-inspect:init'
 private readonly bindings=new WeakMap<DataView,Binding>()
 constructor(private readonly input:PdfInspectionInitResourceInput){}
 binding(view:DataView):BindCommandSubmitOptions{
  if(this.bindings.has(view))throw Error('PDF_INSPECTION_OWNER: 原命令视图已绑定')
  const dataSet=view.dataSet,intents=new Map<string,Intent>()
  const guard=()=>{this.input.assertCurrent();if(!dataSet||dataSet.destroyed||view.destroyed||view.dataSet!==dataSet||dataSet.getView(view.tableName,view.viewId)!==view)throw Error('PDF_INSPECTION_OWNER: 原命令实例已变化')}
  this.bindings.set(view,{guard,intents})
  const intent=(row:Readonly<DataRow>)=>{guard();const key=row['requestId'];const found=typeof key==='string'?intents.get(key):undefined;if(!found||row['configId']!==found.prepared.input.configId||JSON.stringify(row['files'])!==JSON.stringify(found.prepared.input.files))throw Error('PDF_INSPECTION_CAPTURE: 原请求输入不匹配');return found}
  const receipt=(captured:Intent,values:Readonly<{inspectJobId:string;status:string;fileCount:number}>)=>{
   const {input}=captured.prepared,row={requestId:input.requestId,configId:input.configId,files:structuredClone(input.files),inspectJobId:values.inspectJobId,status:values.status,fileCount:values.fileCount}
   captured.receipt=structuredClone(row);return row
  }
  return{resource:{resourceType:'command',resourceId:PdfInspectionInitResource.resourceId},guard,inputFields:['configId','files'],createKey:()=>crypto.randomUUID(),allowAbandonUnconfirmed:false,retainConfirmedOnRefresh:true,
   onPrepareInput:row=>{
    guard();const prepared=this.input.prepare(view,row),key=row['requestId']
    if(typeof key!=='string'||key!==prepared.input.requestId||intents.has(key)||row['configId']!==prepared.input.configId||JSON.stringify(row['files'])!==JSON.stringify(prepared.input.files))throw Error('PDF_INSPECTION_CAPTURE: 缺少唯一原请求')
    prepared.assertReady()
    const captured={input:structuredClone(prepared.input),assertReady:prepared.assertReady}
    // begin写后读失败仍返回同一捕获，原生pending行必须接纳；submit只读核验屏障。
    const pointer=this.input.recovery.begin(key)
    intents.set(key,{prepared:captured,pointer,mayHaveDispatched:false})
   },
   submit:async row=>{
    const captured=intent(row)
    if(captured.mayHaveDispatched)throw new Unconfirmed('原请求已可能派发，禁止再次init')
    this.input.recovery.assertCurrent(captured.pointer);captured.prepared.assertReady();guard()
    captured.mayHaveDispatched=true
    try{const accepted=await this.input.api.init(structuredClone(captured.prepared.input));guard();return receipt(captured,accepted)}catch{throw new Unconfirmed('PDF核验接纳未确认，请仅核验原requestId')}
   },
   verify:async row=>{
    const captured=intent(row)
    try{const recovered=await this.input.api.recover(captured.prepared.input.requestId);guard();if(recovered.requestId!==captured.prepared.input.requestId)throw Error('原请求回执不匹配');return receipt(captured,{inspectJobId:recovered.inspectJobId,status:recovered.status,fileCount:recovered.progress.total})}catch{throw new Unconfirmed('PDF原请求仍未核定，禁止重新提交')}
   },
   isUnconfirmed:error=>error instanceof Unconfirmed,
  }
 }
 /** 只在DataSet已接纳原回执后结算定位；HTTP成功本身不触发清理。 */
 settleConfirmed(view:DataView,requestId:string):void{
  const binding=this.bindings.get(view);binding?.guard()
  const captured=binding?.intents.get(requestId),receipt=captured?.receipt,row=view.rows.find(item=>view.getPkKey(item)===requestId)
  if(!captured||!receipt||!row||view.mutating||view.hasUnconfirmedSave||view.dirtyTracking.isPendingCreate(requestId)
   ||view.getEditingPatch(requestId)!==undefined||Object.entries(receipt).some(([field,value])=>view.fieldAccess(row,field).read!=='visible'||JSON.stringify(row[field])!==JSON.stringify(value)))throw Error('PDF_INSPECTION_RECEIPT: 原DataSet尚未接纳可核定回执')
  this.input.recovery.settle(captured.pointer)
 }
 /** 先取消原pending行；从未可能派发才可清理定位，不能按UI busy推断。 */
 releaseCancelled(view:DataView,requestId:string):void{
  const binding=this.bindings.get(view);binding?.guard()
  const captured=binding?.intents.get(requestId)
  if(!captured||captured.mayHaveDispatched||view.mutating||view.hasUnconfirmedSave||view.dirtyTracking.isPendingCreate(requestId)
   ||view.getEditingPatch(requestId)!==undefined||view.rows.some(row=>view.getPkKey(row)===requestId))throw Error('PDF_INSPECTION_CANCEL: 原请求未取消或已可能派发')
  this.input.recovery.settle(captured.pointer);binding?.intents.delete(requestId)
 }
}
