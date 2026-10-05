import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../core/lowcode-api-error.js'
import { LowcodeClient } from '../core/lowcode-client.js'

export type LowcodeDesignFileUploadCommand = Readonly<{
  customPath: string
  fileName: string
  text: string
}>

export type LowcodeDesignFileUploadResult = Readonly<Record<string, unknown>>

function requiredText(value: string, name: string): string {
  const normalized = value.trim()
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 追加上传 designfile 文本版本；固定禁止覆盖已有同名文件。 */
export class LowcodeDesignFileUpload {
  private readonly client: LowcodeClient

  public constructor(http: HttpClientBase) {
    this.client = new LowcodeClient(http)
  }

  public async uploadTextVersion(
    command: LowcodeDesignFileUploadCommand,
  ): Promise<LowcodeDesignFileUploadResult> {
    const result = await this.client.requestResult({
      path: '/api/File/uploadFileByStr',
      method: 'POST',
      data: {
        customPath: requiredText(command.customPath, 'customPath'),
        appType: 'designfile',
        isReplace: false,
        fileName: requiredText(command.fileName, 'fileName'),
        content: command.text,
        convertType: 0,
      },
      headers: { 'Content-Type': 'application/json' },
    })
    if (!isRecord(result)) throw new LowcodeApiError(0, '文件上传 Result 不是对象')
    return Object.freeze({ ...result })
  }
}
