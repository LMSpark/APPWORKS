/**
 * @module @spark-appworks/spark-lowcode-api:design/lowcode-design-file-upload
 * 职责：经既有 multipart 端点上传工作文本或禁止覆盖的文件名快照。
 * 边界：保留 UTF-8 原字节，核对 scope 和字节回读；快照确认不等于发布或 CAS。
 * AI用途：上传后核对实际 filePath 最终名与原字节，再接纳文件写入结果。
 */
import { isRequestError, type HttpClientBase, type RequestConfig } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../core/lowcode-api-error.js'
import { LowcodeDesignApi } from './lowcode-design-api.js'
import type { DataSpaceRequestScope } from '../platform/data-space/runtime/data-space-runtime-contract.js'

/** 上传和回读共用的 HTTP 与请求 scope 来源，身份变化不能确认旧写入。 */
type LowcodeDesignFileUploadOptions = Readonly<{
  http: HttpClientBase
  readScope: () => DataSpaceRequestScope
}>

/** 明确目录、最终文件名和原文本；空文本仍按空 UTF-8 字节上传，不自动分配编号。 */
export type LowcodeDesignFileUploadCommand = Readonly<{
  customPath: string
  fileName: string
  text: string
}>

/** 完成字节回读后的实际后端单文件回执；快照还须核对 filePath 最终名，后续失败不伪造回滚。 */
export type LowcodeDesignFileUploadResult = Readonly<Record<string, unknown>>

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

  private async uploadText(
    command: LowcodeDesignFileUploadCommand,
    replace: boolean,
  ): Promise<LowcodeDesignFileUploadResult> {
    const scope = this.readScope()
    const customPath = requiredText(command.customPath, 'customPath')
    const fileName = requiredText(command.fileName, 'fileName')
    const bytes = new TextEncoder().encode(command.text)
    const data = new FormData()
    data.append('customPath', customPath)
    data.append('appType', 'designfile')
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
    if (!replace) {
      const actualPath = receipt['filePath']
      // 后端重名另存时 fileName 仍是请求名，必须核对实际落盘路径。
      if (receipt['state'] !== 'success' || typeof actualPath !== 'string'
        || actualPath.split(/[/\\]/).at(-1) !== fileName) {
        throw new LowcodeApiError(0, '快照文件名与预定版本不一致，不能确认版本')
      }
    }
    const readback = await this.design.readFileBytes({ appType: 'designfile', customPath, fileName })
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
