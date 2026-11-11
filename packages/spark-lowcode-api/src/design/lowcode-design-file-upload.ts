/**
 * @module @spark-appworks/spark-lowcode-api:design/lowcode-design-file-upload
 * 职责：经既有 multipart 端点上传工作文本、文件名快照或原生二进制模板。
 * 边界：文本保留UTF-8，二进制保留原File；二进制ACK与字节核验分开，不等于业务路径已保存。
 * AI用途：上传后核对实际 filePath 最终名与原字节，再接纳文件写入结果。
 */
import { isRequestError, type HttpClientBase, type RequestConfig } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../core/lowcode-api-error.js'
import { LowcodeDesignApi,type LowcodeFileLocator } from './lowcode-design-api.js'
import { assertExactTextUpload, exactFileContentPath, exactFileName, matchesFileUploadPath } from './lowcode-file-identity.js'
import type { DataSpaceRequestScope } from '../platform/data-space/runtime/data-space-runtime-contract.js'

/** 上传和回读共用的 HTTP 与请求 scope 来源，身份变化不能确认旧写入。 */
type LowcodeDesignFileUploadOptions = Readonly<{
  http: HttpClientBase
  readScope: () => DataSpaceRequestScope
}>

/** 明确目录、最终文件名和原文本；空文本仍按空 UTF-8 字节上传，不自动分配编号。 */
export type LowcodeDesignFileUploadCommand = Readonly<{
  /** 明确文件区；默认designfile保持既有工具合同，JSON文档使用已核实的jsondatapath。 */
  appType?: 'designfile' | 'jsondatapath'
  customPath: string
  fileName: string
  text: string
}>

/** 完成字节回读后的实际后端单文件回执；快照还须核对 filePath 最终名，后续失败不伪造回滚。 */
export type LowcodeDesignFileUploadResult = Readonly<Record<string, unknown>>

/** 原生二进制File上传的已核定文件区：Excel模板目录，或文件管理的filedata根目录。 */
type LowcodeBinaryFileArea=Readonly<{appType:'xlsxtemp';customPath:'xlsxtemp'}>|Readonly<{appType:'filedata';customPath:''}>
/** 本次原File输入；只接受已核定的原目录/字段合同，不转文本或重建Blob。 */
export type LowcodeBinaryFileUploadCommand=LowcodeBinaryFileArea&Readonly<{
  /** 用户本次选择的原生File，保留其文件名和二进制内容，不从JSON重建。 */
  file:File
  /** 所属声明命令的数据空间，用作原上传X-FormKey。 */
  scenarioId:string
  /** 原服务接收原File的multipart字段名。 */
  fieldName:'files'
  /** 存储适配在原File异步读取后、真正派发前重核原方案与当前写权限；异常表示未派发。 */
  assertReady?:()=>void
}>
/** 单文件ACK的实际持久路径及读删定位；仍须原实例verifyBinaryVersion核字节。 */
export type LowcodeBinaryFileUploadReceipt=Readonly<{
  /** 后端ACK返回且核对过企业目录的实际持久路径，字节核验后才供方案写回。 */
  templatePath:string
  /** 固定文件区、目录及ACK实际basename组成的原回读定位。 */
  locator:LowcodeFileLocator
}>

function binaryScope(scope:DataSpaceRequestScope):string{return JSON.stringify([scope.token,Object.entries(scope.headers).sort(([a],[b])=>a.localeCompare(b))])}
function binaryUnconfirmed(cause:unknown):Error{return Object.assign(new Error(`二进制文件上传结果未确认：${cause instanceof Error?cause.message:String(cause)}`,{cause}),{fileResourceMutationMayHaveApplied:true})}

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 保存 designfile 工作文本并回读；版本上传保持禁止覆盖。 */
export class LowcodeDesignFileUpload {
  private readonly design: LowcodeDesignApi
  private readonly http: HttpClientBase
  private readonly readScope: () => DataSpaceRequestScope
  private readonly binaryReceipts=new WeakMap<LowcodeBinaryFileUploadReceipt,Readonly<{file:File;bytes:Uint8Array;scope:string}>>()

  /** 使用同一 HTTP 和 scope 建立上传与原字节回读通道。 */
  public constructor(options: LowcodeDesignFileUploadOptions) {
    this.http = options.http
    this.readScope = options.readScope
    this.design = new LowcodeDesignApi(options)
  }

  public async uploadWorkingText(
    command: LowcodeDesignFileUploadCommand,
  ): Promise<LowcodeDesignFileUploadResult> {
    return this.uploadText(command, true)
  }

  public async uploadTextVersion(
    command: LowcodeDesignFileUploadCommand,
  ): Promise<LowcodeDesignFileUploadResult> {
    return this.uploadText(command, false)
  }

  /**
   * 一次上传原生File并接纳同执行域的正式单文件ACK，不主动下载或保存方案。
   * @remarks 仅供已声明命令的存储适配调用，页面通过DataSet/DataView保存；适配先保留返回回执再调用verifyBinaryVersion。派发后错误可能已写入，禁止自动重传。
   */
  public async uploadBinaryVersion(command:LowcodeBinaryFileUploadCommand):Promise<LowcodeBinaryFileUploadReceipt>{
    const scope=this.readScope(),captured=binaryScope(scope),tenant=requiredText(scope.headers['tenant-id']??'','tenant-id'),scenarioId=requiredText(command.scenarioId,'scenarioId')
    const excel=command.appType==='xlsxtemp'
    if(!scope.token.trim()||!scope.headers['X-AppId']?.trim()||/[\\/]/.test(tenant))throw new LowcodeApiError(0,'二进制模板缺少原执行身份或目录合同')
    const name=requiredText(command.file.name,'file.name')
    if(/[\\/\u0000-\u001f]/.test(name)||name==='.'||name==='..'||excel&&!(/\.xlsx?$/i.test(name)))throw new LowcodeApiError(0,excel?'仅支持原生xls或xlsx模板文件名':'文件名无效')
    const bytes=new Uint8Array(await command.file.arrayBuffer()).slice()
    this.assertBinaryScope(captured)
    if(bytes.length!==command.file.size)throw new LowcodeApiError(0,'原File字节长度与选择时大小不符')
    command.assertReady?.()
    this.assertBinaryScope(captured)
    const data=new FormData()
    data.append('customPath',command.customPath);data.append('appType',command.appType);data.append('isReplace','false');data.append('isCrossEnt','false');data.append('newName',command.file.name);data.append('files',command.file,command.file.name)
    try{
      const result=await this.requestUpload({url:'/api/File/UploadFile',method:'POST',data,headers:{...scope.headers,'X-FormKey':scenarioId}})
      this.assertBinaryScope(captured)
      if(!Array.isArray(result)||result.length!==1||!isRecord(result[0])||result[0]['state']!=='success'||typeof result[0]['filePath']!=='string')throw new LowcodeApiError(0,'二进制文件ACK不是成功的单文件定位')
      const path=result[0]['filePath'],prefix=excel?`/${tenant}/xlsxtemp/`:`/${tenant}/`,actual=path.startsWith(prefix)?path.slice(prefix.length):''
      if(!actual||/[\\/\u0000-\u001f]/.test(actual)||actual==='.'||actual==='..'||actual.split('.').at(-1)?.toLowerCase()!==name.split('.').at(-1)?.toLowerCase())throw new LowcodeApiError(0,'二进制文件ACK不属于原企业目录或文件后缀')
      const receipt:LowcodeBinaryFileUploadReceipt=Object.freeze({templatePath:path,locator:Object.freeze({appType:command.appType,customPath:command.customPath,fileName:actual,isCrossEnterprise:false})})
      this.binaryReceipts.set(receipt,{file:command.file,bytes,scope:captured})
      return receipt
    }catch(error){throw binaryUnconfirmed(error)}
  }

  /** 仅供原命令按本实例ACK下载并核原File字节；失败可再次核验，不上传、不猜文件名或修改方案。 */
  public async verifyBinaryVersion(command:Readonly<{receipt:LowcodeBinaryFileUploadReceipt;file:File}>):Promise<void>{
    const original=this.binaryReceipts.get(command.receipt)
    if(original?.file !== command.file)throw new LowcodeApiError(0,'缺少本实例原File及上传ACK')
    this.assertBinaryScope(original.scope)
    const bytes=await this.design.readFileBytes(command.receipt.locator)
    this.assertBinaryScope(original.scope)
    if(bytes.length!==original.bytes.length||original.bytes.some((value,index)=>bytes[index]!==value))throw new LowcodeApiError(0,'二进制文件写入后回读不一致')
  }

  private assertBinaryScope(expected:string):void{if(binaryScope(this.readScope())!==expected)throw new Error('SPARK_EXECUTION_SCOPE_STALE: 二进制文件原执行域已失效')}

  private async uploadText(
    command: LowcodeDesignFileUploadCommand,
    replace: boolean,
  ): Promise<LowcodeDesignFileUploadResult> {
    const scope = this.readScope()
    const appType = command.appType ?? 'designfile'
    const customPath = exactFileContentPath(command.customPath)
    if (appType === 'designfile' && customPath.length === 0) throw new LowcodeApiError(0, 'customPath 不能为空')
    const fileName = exactFileName(command.fileName)
    assertExactTextUpload({customPath, fileName, appType})
    const bytes = new TextEncoder().encode(command.text)
    const data = new FormData()
    data.append('customPath', customPath)
    data.append('appType', appType)
    data.append('isReplace', String(replace))
    data.append('newName', fileName)
    data.append('isCrossEnt', 'false')
    data.append('file', new Blob([bytes]), fileName)
    const result = await this.requestUpload({ url: '/api/File/UploadFile', method: 'POST', data,
      headers: { ...scope.headers } })
    this.assertScope(scope)
    if (!Array.isArray(result) || result.length !== 1 || !isRecord(result[0])) {
      throw new LowcodeApiError(0, '文件上传 Result 不是单文件信息数组')
    }
    const receipt = Object.freeze({ ...result[0] })
    const actualPath = receipt['filePath']
    // 覆盖和快照都核对ACK实际落盘名称，旧目标字节相同不能替另一个落点确认成功。
    if (receipt['state'] !== 'success' || typeof actualPath !== 'string'
      || !matchesFileUploadPath(actualPath, {customPath, fileName, appType})) {
      throw new LowcodeApiError(0, '文件名与预定目标不一致，不能确认文件')
    }
    const readback = await this.design.readFileBytes({ appType, customPath, fileName })
    this.assertScope(scope)
    if (readback.length !== bytes.length || bytes.some((value, index) => readback[index] !== value)) {
      throw new LowcodeApiError(0, `${fileName} 写入后回读不一致`)
    }
    return receipt
  }

  private assertScope(scope: DataSpaceRequestScope): void {
    if (this.readScope().token !== scope.token) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 文件写入所属执行域已失效，不能确认保存')
    }
  }

  private async requestUpload(config: RequestConfig): Promise<unknown> {
    let response: unknown
    try {
      response = await this.http.request<unknown>({
        ...config, retry: 0, cache: false, meta: { rawEnvelope: true },
      })
    } catch (error) {
      if (!isRequestError(error) || error.response === undefined) throw error
      response = error.response
    }
    if (!isRecord(response) || typeof response['Code'] !== 'number') {
      throw new LowcodeApiError(0, '文件上传响应不是 AjaxResult 对象')
    }
    if (response['Code'] !== 200) {
      const message = response['Message']
      throw new LowcodeApiError(response['Code'],
        typeof message === 'string' && message.trim() ? message : '文件上传失败')
    }
    return response['Result']
  }
}
