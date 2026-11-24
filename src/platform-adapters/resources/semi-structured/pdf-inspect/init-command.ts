/**
 * @module app:lowcode/resources/semi-structured/pdf-inspect/init-command
 * 职责：在同一 DataSet 核实上传回执并暂存原任务命令。
 * 边界：由原命令适配记录恢复定位、区分首次派发与未知回查，页面只按原行保存。
 * AI用途：以正式配置和已确认文件发起核验，保留原请求身份。
 */
import { PdfInspectionApi, PdfInspectionInitResource, PdfInspectionRecoveryJournal } from '@/platform-adapters/api'
import type {PdfInspectionRecoveryOwner, PdfInspectionRecoveryStorage} from '@/platform-adapters/api'
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import type {LowcodeDataSpaceAssemblerInput} from '@/platform-adapters/data-space/lowcode-data-space-assembler'
import {cancelPdfInspectionFile,capturePdfInspectionUpload,PDF_INSPECTION_UPLOAD_TABLE,stagePdfInspectionFile} from './upload-command'
import {PDF_INSPECTION_SCENARIO_ID} from './runtime-bindings'

export const PDF_INSPECTION_INIT_TABLE = 'PdfInspectionInit'
export type PdfInspectionExecutionInput=Readonly<{
  dataSet:DataSet
  configId:string
  assertReady:()=>void
  limits:Readonly<{maxFiles:number;maxFileBytes:number;maxTotalFileBytes:number}>
  resolveRecoveryUrl:(requestId:string)=>string
  onChange?:()=>void
}>

/** One SPARK Data command session for the UI-selected files and task init row. */
export class PdfInspectionExecutionSession{
  readonly uploadIds:string[]=[]
  requestId?:string
  dispatched=false
  accepted=false
  submitLabel='开始核验'
  busy=false
  cancellationPending=false
  constructor(private readonly input:PdfInspectionExecutionInput){}
  get limits():PdfInspectionExecutionInput['limits']{return this.input.limits}
  assertReady():void{this.input.assertReady()}
  get pending():boolean{return this.busy||this.uploadIds.length>0}
  async stageAll(files:readonly File[]):Promise<void>{
    this.assertReady()
    if(this.busy||this.cancellationPending||this.uploadIds.length>0)throw new Error('PDF_INSPECTION_EXECUTION: 原批次仍待处理')
    const {maxFiles,maxFileBytes,maxTotalFileBytes}=this.input.limits
    if(files.length>maxFiles||files.some(file=>!/\.(pdf|zip)$/iu.test(file.name)||file.size<1||file.size>maxFileBytes)
      ||files.reduce((total,file)=>total+file.size,0)>maxTotalFileBytes){
      throw new Error('所选文件不符合当前服务限制')
    }
    for(const file of files){
      this.uploadIds.push(await stagePdfInspectionFile(this.input.dataSet,file,this.input.assertReady))
      this.input.onChange?.()
    }
  }
  cancel():void{
    if(this.dispatched||this.busy)return
    this.cancellationPending=true
    while(this.uploadIds.length){
      const id=this.uploadIds[this.uploadIds.length-1]
      if(id===undefined)break
      cancelPdfInspectionFile(this.input.dataSet,id)
      this.uploadIds.pop()
    }
    this.cancellationPending=false
    this.input.onChange?.()
  }
  async submit():Promise<string>{
    if(this.busy||this.cancellationPending||!this.uploadIds.length)throw new Error('PDF_INSPECTION_EXECUTION: 原文件命令未就绪')
    this.busy=true;this.dispatched=true;this.input.onChange?.()
    try{
      const upload=this.input.dataSet.getView(PDF_INSPECTION_UPLOAD_TABLE)
      if(!upload)throw new Error('原上传命令未绑定')
      const uploadIds=this.uploadIds.filter(id=>upload.dirtyTracking.isPendingCreate(id))
      if(uploadIds.length){
        const saved=await this.input.dataSet.saveChanges({views:[{tableName:PDF_INSPECTION_UPLOAD_TABLE,viewId:'default',ids:uploadIds}]})
        if(!saved.success)throw saved.error??new Error(saved.message??'原文件上传尚未核定')
      }
      this.requestId??=await stagePdfInspectionTask(this.input.dataSet,{configId:this.input.configId,uploadIds:this.uploadIds,
        assertRule:this.input.assertReady,resolveRecoveryUrl:this.input.resolveRecoveryUrl})
      this.input.onChange?.()
      if(!this.accepted){
        const saved=await this.input.dataSet.saveChanges({views:[{tableName:PDF_INSPECTION_INIT_TABLE,viewId:'default',ids:[this.requestId]}]})
        if(!saved.success)throw saved.error??new Error(saved.message??'原请求尚未核定')
        this.accepted=true;this.input.onChange?.()
      }
      settlePdfInspectionTask(this.input.dataSet,this.requestId)
      return this.requestId
    }catch(error){
      const upload=this.input.dataSet.getView(PDF_INSPECTION_UPLOAD_TABLE)
      if(!this.requestId&&upload&&!upload.hasUnconfirmedSave&&this.uploadIds.every(id=>upload.dirtyTracking.isPendingCreate(id)))this.dispatched=false
      this.submitLabel=this.accepted?'重试清理恢复定位':this.dispatched?'继续核验原操作':'开始核验'
      throw error
    }finally{this.busy=false;this.input.onChange?.()}
  }
}
export const PDF_INSPECTION_RECOVERY_TABLE = 'PdfInspectionRecovery'

/** 正式请求只能使用同一实例的原配置和已核对的上传编号。 */
type InitInput = Readonly<{configId: string; uploadIds: readonly string[]; assertRule: () => void;
  resolveRecoveryUrl: (requestId: string) => string}>
/** 初始化适配与当前命令视图，只暂存一次原输入许可。 */
type Binding = {view: DataView; resource: PdfInspectionInitResource; openJournal: (resolveUrl: InitInput['resolveRecoveryUrl']) => PdfInspectionRecoveryJournal; pending?: InitInput; activeId?: string; staging: boolean}
export type PdfInspectionRecoveryResult = Readonly<{
  requestId: string
  inspectJobId: string
  journal: Readonly<{state: 'settled' | 'not-pending'}> | Readonly<{state: 'failed'; error: unknown}>
}>
export class PdfInspectionRecoveryProofError extends Error {
  constructor(readonly reason: 'invalid-request' | 'unavailable') {
    super(`PDF_RECOVERY_PROOF: ${reason}`)
  }
}
type RecoveryProof = Readonly<{
  binding: Binding
  requestId: string
  inspectJobId: string
  assertCurrent: () => void
}>
/** 正式场景和当前认证域提供初始化及恢复存储。 */
type Options = ConstructorParameters<typeof PdfInspectionApi>[0] & Readonly<{
  config: ScenarioViewConfig; assertCurrent: () => void; readOwner: () => PdfInspectionRecoveryOwner;
  readStorage: () => PdfInspectionRecoveryStorage
}>

const bindings = new WeakMap<DataSet, Binding>()

/** 只为正式场景中身份匹配的命令声明注册原适配。 */
export function createPdfInspectionInitBindings(input: Options): NonNullable<LowcodeDataSpaceAssemblerInput['commandBindings']> {
  if (input.config.scenarioId !== PDF_INSPECTION_SCENARIO_ID) return {}
  const tables = input.config.toJSON()['tables']
  if (!isRecord(tables) || !Object.hasOwn(tables, PDF_INSPECTION_INIT_TABLE)) return {}
  const table = tables[PDF_INSPECTION_INIT_TABLE]
  if (!isRecord(table) || table['resourceType'] !== 'command' || table['resourceId'] !== PdfInspectionInitResource.resourceId ||
    Object.hasOwn(table, 'modelBinding')) throw Error('PDF_INSPECTION_INIT_BINDING: 正式命令声明不匹配')
  return {[PDF_INSPECTION_INIT_TABLE]: view => bindInit(view, input)}
}

function bindInit(view: DataView, input: Options) {
  const dataSet = view.dataSet
  if (dataSet?.scenarioId !== PDF_INSPECTION_SCENARIO_ID || view.viewId !== 'default' || bindings.has(dataSet)) {
    throw Error('PDF_INSPECTION_INIT_BINDING: 原命令实例不匹配')
  }
  const openJournal = (resolveUrl: InitInput['resolveRecoveryUrl']) => {
    input.assertCurrent()
    return new PdfInspectionRecoveryJournal({storage: input.readStorage(), owner: input.readOwner(), resolveUrl})
  }
  let journal: PdfInspectionRecoveryJournal | undefined
  const currentJournal = () => {
    input.assertCurrent()
    if (!journal) throw Error('PDF_INSPECTION_INIT_RECOVERY: 缺少原恢复定位')
    return journal
  }
  const resource = new PdfInspectionInitResource({
    api: new PdfInspectionApi(input), assertCurrent: input.assertCurrent,
    recovery: {
      begin: requestId => {
        const pointer = currentJournal().begin(requestId)
        binding.activeId = requestId
        return pointer
      },
      assertCurrent: pointer => currentJournal().assertCurrent(pointer),
      settle: pointer => currentJournal().settle(pointer),
    },
    prepare: (command, row) => {
      const pending = binding.pending, requestId = row['requestId']
      if (command !== view || !pending || typeof requestId !== 'string') throw Error('PDF_INSPECTION_INIT_CAPTURE: 缺少原请求许可')
      delete binding.pending
      const uploads = pending.uploadIds.map(id => capturePdfInspectionUpload(dataSet, id))
      const assertReady = () => {pending.assertRule(); for (const upload of uploads) upload.assertCurrent()}
      assertReady()
      journal = openJournal(pending.resolveRecoveryUrl)
      return {input: {requestId, configId: pending.configId, files: uploads.map(upload => upload.input)}, assertReady}
    },
  })
  const binding: Binding = {resource, view, openJournal, staging: false}
  const result = resource.binding(view)
  bindings.set(dataSet, binding)
  return result
}

/** 只暂存原任务行；只有 DataSet 保存该行才会派发。 */
export async function stagePdfInspectionTask(dataSet: DataSet, input: InitInput): Promise<string> {
  const binding = bindings.get(dataSet)
  if (!binding || binding.staging || binding.activeId !== undefined || binding.view.mutating || binding.view.hasUnconfirmedSave ||
    binding.view.dirtyTracking.hasPendingChanges() || !input.uploadIds.length || new Set(input.uploadIds).size !== input.uploadIds.length) {
    throw Error('PDF_INSPECTION_INIT_CAPTURE: 原命令未就绪或文件身份不唯一')
  }
  input.assertRule()
  const uploadIds = [...input.uploadIds]
  const files = uploadIds.map(id => capturePdfInspectionUpload(dataSet, id).input)
  binding.staging = true
  binding.pending = {...input, uploadIds}
  try {
    const row = await binding.view.addRow({configId: input.configId, files})
    const id = binding.view.getPkKey(row)
    if (typeof id !== 'string') throw Error('PDF_INSPECTION_INIT_CAPTURE: 原请求缺少身份')
    return id
  } finally {delete binding.pending; binding.staging = false}
}

/** 只在原 DataSet 接纳可读回执后清理恢复定位。 */
export function settlePdfInspectionTask(dataSet: DataSet, requestId: string): void {
  const binding = bindings.get(dataSet)
  if (binding?.activeId !== requestId) throw Error('PDF_INSPECTION_INIT_BINDING: 原命令未绑定')
  binding.resource.settleConfirmed(binding.view, requestId)
  delete binding.activeId
}

/** 枚举本次实例拥有者的原请求定位。任务结果仍从恢复视图查询。 */
export function pendingPdfInspectionRequests(dataSet: DataSet, resolveUrl: InitInput['resolveRecoveryUrl']): string[] {
  return bindings.get(dataSet)?.openJournal(resolveUrl).pending().map(pointer => pointer.requestId) ?? []
}

function asRequestId(value: unknown): string {
  if (typeof value !== 'string' || !/^[-A-Za-z0-9_]{1,128}$/u.test(value)) {
    throw new PdfInspectionRecoveryProofError('invalid-request')
  }
  return value
}

type RecoverPdfInspectionInput=Readonly<{
  dataSet:DataSet
  requestId:unknown
  resolveUrl:InitInput['resolveRecoveryUrl']
  assertCurrent:()=>void
}>

async function provePdfInspectionRecovery(input:RecoverPdfInspectionInput):Promise<RecoveryProof> {
  const {dataSet,value}= {dataSet:input.dataSet,value:input.requestId}
  const requestId = asRequestId(value)
  try {
    input.assertCurrent()
    const binding = bindings.get(dataSet), view = dataSet.getView(PDF_INSPECTION_RECOVERY_TABLE, 'default')
    if (!binding || dataSet.destroyed || binding.view.destroyed || binding.view.dataSet !== dataSet ||
      !view || view.destroyed || view.dataSet !== dataSet) {
      throw new PdfInspectionRecoveryProofError('unavailable')
    }
    view.queryContext = {requestId}
    await view.refresh()
    input.assertCurrent()
    const row = view.rows[0], inspectJobId = row?.['inspectJobId']
    if (view.loadingError || view.rows.length !== 1 || row?.['requestId'] !== requestId || typeof inspectJobId !== 'string' ||
      !/^[-A-Za-z0-9_]{1,128}$/u.test(inspectJobId) || view.queryContext['requestId'] !== requestId) {
      throw new PdfInspectionRecoveryProofError('unavailable')
    }
    const assertCurrent = view.captureReadRow(row, ['requestId', 'inspectJobId'])
    assertCurrent()
    view.setCurrentRowById(inspectJobId)
    return {binding, requestId, inspectJobId, assertCurrent}
  } catch (cause) {
    if (cause instanceof PdfInspectionRecoveryProofError) throw cause
    input.assertCurrent()
    throw new PdfInspectionRecoveryProofError('unavailable')
  }
}

function settleRecoveredPdfInspection(proof:RecoveryProof,resolveUrl:InitInput['resolveRecoveryUrl'],assertCurrent:()=>void):PdfInspectionRecoveryResult['journal']{
  try {
    assertCurrent()
    proof.assertCurrent()
    const journal = proof.binding.openJournal(resolveUrl)
    const pointer = journal.pending().find(item => item.requestId === proof.requestId)
    if (!pointer) return {state: 'not-pending'}
    journal.settle(pointer)
    return {state: 'settled'}
  } catch (error) {
    return {state: 'failed', error}
  }
}

/** 冷重开时只回读原恢复视图；证明成功后独立结算定位，失败只阻断本次清理。 */
export async function recoverPdfInspectionTask(
  input:RecoverPdfInspectionInput,
): Promise<PdfInspectionRecoveryResult> {
  input.assertCurrent()
  const proof=await provePdfInspectionRecovery(input)
  input.assertCurrent()
  return {
    requestId: proof.requestId,
    inspectJobId: proof.inspectJobId,
    journal:settleRecoveredPdfInspection(proof,input.resolveUrl,input.assertCurrent),
  }
}
