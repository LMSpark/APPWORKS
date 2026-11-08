/**
 * @module @spark-appworks/spark-lowcode-api:design/lowcode-design-api
 * 职责：读取设计文件原文、原字节与实际目录快照，确认文件删除。
 * 边界：请求后核对 scope；列表不推断发布指针，删除回列确认不提供 CAS。
 * AI用途：按实际 N__filename 历史定位文件，上传确认交给文件上传 owner。
 */
import { isRequestError, type HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../core/lowcode-api-error.js'
import { LowcodeClient } from '../core/lowcode-client.js'
import { exactFileContentPath, exactFileDirectoryPath, exactFileName } from './lowcode-file-identity.js'
import type { DataSpaceRequestScope } from '../platform/data-space/runtime/data-space-runtime-contract.js'

/** 实际 HTTP 通道与请求身份读取器；token 变化使迟到响应失效。 */
type LowcodeDesignApiOptions = Readonly<{
  http: HttpClientBase
  readScope: () => DataSpaceRequestScope
}>

/** 单文件读取定位；appType/customPath/fileName 组合须与后端文件命名空间一致，跨企业读需显式 `isCrossEnterprise`。 */
export type LowcodeFileLocator = Readonly<{
  appType: string
  customPath: string
  fileName: string
  isCrossEnterprise?: boolean
}>

/** 目录列表查询键；folderPath 可为空字符串表示根级，appType 必填。 */
export type LowcodeFileDirectory = Readonly<{
  appType: string
  folderPath: string
}>

/** 后端实际文件名和修改时间；未知时间保留 null，不生成伪时间。 */
export type LowcodeFileEntry = Readonly<{
  name: string
  lastModified: number | null
}>

/** 实际存在的规范 N__filename 快照及非负安全编号；最大编号只供调用方分配候选，不代表当前或发布版本。 */
export type LowcodeFileVersionSummary = Readonly<{
  version: number
  fileName: string
  lastModified: number | null
}>

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

/** 删除派发后的不确定结果沿既有文件变更标记交回同一DataView核验，不表示可以重试。 */
function deletionUnconfirmed(error: unknown): Error {
  return Object.assign(new Error(`文件删除结果未确认，后续核验失败：${error instanceof Error ? error.message : String(error)}`, {cause: error}), {fileResourceMutationMayHaveApplied: true})
}

function fileInfo(locator: LowcodeFileLocator): Readonly<Record<string, unknown>> {
  return {
    customPath: exactFileContentPath(locator.customPath),
    fileName: exactFileName(locator.fileName),
    appType: requiredText(locator.appType, 'appType'),
    isCrossEnt: locator.isCrossEnterprise ?? false,
    isReplace: true,
    content: null,
    convertType: 0,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function decodeFileEntries(values: readonly unknown[]): readonly LowcodeFileEntry[] {
  const names = new Set<string>(), entries: LowcodeFileEntry[] = []
  for (const value of values) {
    if (!isRecord(value)) throw new LowcodeApiError(0, '文件列表条目不是对象')
    const name = exactFileName(value['name']), lastModified = value['lastModified']
    if (names.has(name)) throw new LowcodeApiError(0, `文件列表名称重复：${name}`)
    if (lastModified !== undefined && lastModified !== null && (typeof lastModified !== 'number' || !Number.isSafeInteger(lastModified))) {
      throw new LowcodeApiError(0, `文件列表修改时间不是安全整数：${name}`)
    }
    names.add(name)
    entries.push({name, lastModified: lastModified ?? null})
  }
  return entries
}

/** 设计文件读取和删除 owner；保留原字节，版本列表严格匹配同文件规范名并拒绝重复编号。 */
export class LowcodeDesignApi {
  private readonly client: LowcodeClient
  private readonly http: HttpClientBase
  private readonly readScope: () => DataSpaceRequestScope

  /** 持有 HTTP 与 scope 读取器，文件读取和删除均使用实际请求身份。 */
  public constructor(options: LowcodeDesignApiOptions) {
    this.http = options.http
    this.readScope = options.readScope
    this.client = new LowcodeClient(options.http)
  }

  /** 下载原始文件字节；接受 ArrayBuffer 或保留偏移/长度的字节视图，不解包 AjaxResult 或转换文本。 */
  public async readFileBytes(locator: LowcodeFileLocator): Promise<Uint8Array> {
    const scope = this.readScope()
    const response = await this.http.request<unknown>({
      url: '/api/File/DownFile', method: 'POST', data: fileInfo(locator),
      headers: { ...scope.headers },
      responseType: 'arraybuffer', cache: false, meta: { rawEnvelope: true },
    })
    this.assertScope(scope)
    if (response instanceof ArrayBuffer) return new Uint8Array(response)
    if (ArrayBuffer.isView(response)) return new Uint8Array(response.buffer, response.byteOffset, response.byteLength).slice()
    throw new LowcodeApiError(0, '文件下载响应不是 ArrayBuffer 或字节视图')
  }

  /** 读取 UTF-8 文本文件全文；Result 非 string 视为协议错误。 */
  public async readTextFile(locator: LowcodeFileLocator): Promise<string> {
    const scope = this.readScope()
    const result = await this.client.requestResult({
      path: '/api/File/content/text',
      method: 'POST',
      data: fileInfo(locator),
      headers: scope.headers,
    })
    this.assertScope(scope)
    if (typeof result !== 'string') {
      throw new LowcodeApiError(0, '文件内容 Result 不是字符串')
    }
    return result
  }

  /** 列出正式目录快照；整批校验名称、唯一性及安全整数时间，异常不伪装为空目录。 */
  public async listFiles(directory: LowcodeFileDirectory): Promise<readonly LowcodeFileEntry[]> {
    const scope = this.readScope()
    const result = await this.client.requestResult({
      path: '/api/File/list',
      method: 'POST',
      headers: scope.headers,
      data: {
        folderPath: exactFileDirectoryPath(directory.folderPath),
        appType: requiredText(directory.appType, 'appType'),
      },
    })
    this.assertScope(scope)
    if (!Array.isArray(result)) throw new LowcodeApiError(0, '文件列表 Result 不是数组')
    return decodeFileEntries(result)
  }

  private assertScope(scope: DataSpaceRequestScope): void {
    if (this.readScope().token !== scope.token) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 文件请求所属执行域已失效')
    }
  }

  /** 仅返回目录实际存在的规范编号快照；裸工作文件不代表任何版本。 */
  public async listFileVersions(locator: LowcodeFileLocator): Promise<readonly LowcodeFileVersionSummary[]> {
    const fileName = exactFileName(locator.fileName)
    const entries = await this.listFiles({ appType: locator.appType, folderPath: locator.customPath })
    const versions: LowcodeFileVersionSummary[] = []
    for (const entry of entries) {
      const separator = entry.name.indexOf('__')
      if (separator < 1 || entry.name.slice(separator + 2) !== fileName) continue
      const prefix = entry.name.slice(0, separator)
      if (!/^(0|[1-9]\d*)$/.test(prefix)) continue
      const version = Number(prefix)
      if (!Number.isSafeInteger(version)) throw new LowcodeApiError(0, `快照编号超出安全范围：${entry.name}`)
      if (versions.some(item => item.version === version)) throw new LowcodeApiError(0, `快照文件重复：${entry.name}`)
      versions.push({ version, fileName: entry.name, lastModified: entry.lastModified })
    }
    return versions.sort((left, right) => right.version - left.version)
  }

  /** 正式后端删除端点以请求参数定位；不重试，成功后回列确认文件消失，后续核验失败携带既有fileResourceMutationMayHaveApplied标记，交原文件链只读核验。 */
  public async removeFile(locator: LowcodeFileLocator): Promise<void> {
    const scope = this.readScope()
    const fileName = exactFileName(locator.fileName), customPath = exactFileContentPath(locator.customPath), appType = requiredText(locator.appType, 'appType')
    let response: unknown
    try {
      response = await this.http.request<unknown>({
        url: '/api/File/RemoveFile', method: 'POST',
        params: { customPath, fileName, appType },
        headers: { ...scope.headers }, retry: 0, cache: false, meta: { rawEnvelope: true },
      })
    } catch (error) {
      if (!isRequestError(error) || error.response === undefined) throw error
      response = error.response
    }
    try {this.assertScope(scope)} catch (error) {throw deletionUnconfirmed(error)}
    if (!isRecord(response) || typeof response['Code'] !== 'number') throw deletionUnconfirmed(new LowcodeApiError(0, '文件删除响应不是 AjaxResult 对象'))
    if (response['Code'] !== 200) {
      const error = new LowcodeApiError(response['Code'], typeof response['Message'] === 'string' ? response['Message'] : '文件删除失败')
      if (error.code >= 400 && error.code < 500 && error.code !== 408) throw error
      throw deletionUnconfirmed(error)
    }
    try {
      const entries = await this.listFiles({ appType, folderPath: customPath })
      this.assertScope(scope)
      if (entries.some(entry => entry.name === fileName)) throw new LowcodeApiError(0, `${fileName} 删除后仍存在，不能确认删除`)
    } catch (error) {
      throw deletionUnconfirmed(error)
    }
  }
}
