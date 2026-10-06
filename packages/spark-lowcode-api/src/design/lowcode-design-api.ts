/**
 * @module @spark-appworks/spark-lowcode-api:design/lowcode-design-api
 * 职责：读取设计文件原文、原字节与实际目录快照，确认文件删除。
 * 边界：请求后核对 scope；列表不推断发布指针，删除回列确认不提供 CAS。
 * AI用途：按实际 N__filename 历史定位文件，上传确认交给文件上传 owner。
 */
import { isRequestError, type HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../core/lowcode-api-error.js'
import { LowcodeClient } from '../core/lowcode-client.js'
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

function fileInfo(locator: LowcodeFileLocator): Readonly<Record<string, unknown>> {
  return {
    customPath: locator.customPath.trim(),
    fileName: requiredText(locator.fileName, 'fileName'),
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

function normalizeFileEntry(value: unknown): LowcodeFileEntry | null {
  if (!isRecord(value) || typeof value['name'] !== 'string' || value['name'].trim() === '') return null
  const rawLastModified = value['lastModified']
  return {
    name: value['name'],
    lastModified: typeof rawLastModified === 'number' && Number.isFinite(rawLastModified)
      ? rawLastModified
      : null,
  }
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

  /** 下载原始文件字节，不解包 AjaxResult 或转换文本。 */
  public async readFileBytes(locator: LowcodeFileLocator): Promise<Uint8Array> {
    const scope = this.readScope()
    const response = await this.http.request<unknown>({
      url: '/api/File/DownFile', method: 'POST', data: fileInfo(locator),
      headers: { ...scope.headers },
      responseType: 'arraybuffer', cache: false, meta: { rawEnvelope: true },
    })
    this.assertScope(scope)
    if (!(response instanceof ArrayBuffer)) {
      throw new LowcodeApiError(0, '文件下载响应不是 ArrayBuffer')
    }
    return new Uint8Array(response)
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

  /** 列出目录下文件；非法条目静默过滤，仅返回 name 非空且结构合法的项。 */
  public async listFiles(directory: LowcodeFileDirectory): Promise<readonly LowcodeFileEntry[]> {
    const scope = this.readScope()
    const result = await this.client.requestResult({
      path: '/api/File/list',
      method: 'POST',
      headers: scope.headers,
      data: {
        folderPath: directory.folderPath.trim(),
        appType: requiredText(directory.appType, 'appType'),
      },
    })
    this.assertScope(scope)
    if (!Array.isArray(result)) throw new LowcodeApiError(0, '文件列表 Result 不是数组')
    return result
      .map(normalizeFileEntry)
      .filter((entry): entry is LowcodeFileEntry => entry !== null)
  }

  private assertScope(scope: DataSpaceRequestScope): void {
    if (this.readScope().token !== scope.token) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 文件请求所属执行域已失效')
    }
  }

  /** 仅返回目录实际存在的规范编号快照；裸工作文件不代表任何版本。 */
  public async listFileVersions(locator: LowcodeFileLocator): Promise<readonly LowcodeFileVersionSummary[]> {
    const fileName = requiredText(locator.fileName, 'fileName')
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

  /** 正式后端删除端点以请求参数定位；不重试，成功后回列确认文件消失。 */
  public async removeFile(locator: LowcodeFileLocator): Promise<void> {
    const scope = this.readScope()
    const fileName = requiredText(locator.fileName, 'fileName')
    let response: unknown
    try {
      response = await this.http.request<unknown>({
        url: '/api/File/RemoveFile', method: 'POST',
        params: { customPath: locator.customPath.trim(), fileName, appType: requiredText(locator.appType, 'appType') },
        headers: { ...scope.headers }, retry: 0, cache: false, meta: { rawEnvelope: true },
      })
    } catch (error) {
      if (!isRequestError(error) || error.response === undefined) throw error
      response = error.response
    }
    this.assertScope(scope)
    if (!isRecord(response) || typeof response['Code'] !== 'number') throw new LowcodeApiError(0, '文件删除响应不是 AjaxResult 对象')
    if (response['Code'] !== 200) throw new LowcodeApiError(response['Code'], typeof response['Message'] === 'string' ? response['Message'] : '文件删除失败')
    const entries = await this.listFiles({ appType: locator.appType, folderPath: locator.customPath })
    this.assertScope(scope)
    if (entries.some(entry => entry.name === fileName)) throw new LowcodeApiError(0, `${fileName} 删除后仍存在，不能确认删除`)
  }
}
