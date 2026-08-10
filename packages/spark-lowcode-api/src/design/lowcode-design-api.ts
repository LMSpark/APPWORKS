import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../core/lowcode-api-error.js'
import { LowcodeClient } from '../core/lowcode-client.js'

export type LowcodeFileLocator = Readonly<{
  appType: string
  customPath: string
  fileName: string
  isCrossEnterprise?: boolean
}>

export type LowcodeFileDirectory = Readonly<{
  appType: string
  folderPath: string
}>

export type LowcodeFileEntry = Readonly<{
  name: string
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

/** lowcode 文件服务的稳定只读设计资产门面。写入需由具备 journal 的治理通道另行实现。 */
export class LowcodeDesignApi {
  private readonly client: LowcodeClient

  public constructor(http: HttpClientBase) {
    this.client = new LowcodeClient(http)
  }

  public async readTextFile(locator: LowcodeFileLocator): Promise<string> {
    const result = await this.client.requestResult({
      path: '/api/File/content/text',
      method: 'POST',
      data: fileInfo(locator),
    })
    if (typeof result !== 'string') {
      throw new LowcodeApiError(0, '文件内容 Result 不是字符串')
    }
    return result
  }

  public async listFiles(directory: LowcodeFileDirectory): Promise<readonly LowcodeFileEntry[]> {
    const result = await this.client.requestResult({
      path: '/api/File/list',
      method: 'POST',
      data: {
        folderPath: directory.folderPath.trim(),
        appType: requiredText(directory.appType, 'appType'),
      },
    })
    if (!Array.isArray(result)) throw new LowcodeApiError(0, '文件列表 Result 不是数组')
    return result
      .map(normalizeFileEntry)
      .filter((entry): entry is LowcodeFileEntry => entry !== null)
  }
}
