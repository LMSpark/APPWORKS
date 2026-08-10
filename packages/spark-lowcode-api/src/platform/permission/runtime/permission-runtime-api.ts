import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../../../core/lowcode-api-error.js'
import { LowcodeClient } from '../../../core/lowcode-client.js'
import {
  isPermissionRecord,
  permissionList,
  requiredPermissionText,
} from '../permission-wire.js'

export type PermissionRuntimeSnapshot = Readonly<{
  formKey: string
  authorizedFeatureTags: readonly string[]
  allowAddByResource: Readonly<Record<string, boolean>>
}>

function allowAddByResource(value: unknown): Readonly<Record<string, boolean>> {
  if (value === undefined || value === null) return {}
  if (!isPermissionRecord(value)) throw new LowcodeApiError(0, '功能权限 allowAdd 不是对象')
  const result: Record<string, boolean> = {}
  for (const [resource, allowed] of Object.entries(value)) {
    if (typeof allowed !== 'boolean') {
      throw new LowcodeApiError(0, `功能权限 allowAdd.${resource} 不是布尔值`)
    }
    result[resource] = allowed
  }
  return result
}

export class PermissionRuntimeApi {
  private readonly client: LowcodeClient

  public constructor(http: HttpClientBase) {
    this.client = new LowcodeClient(http)
  }

  public async read(formKey: string): Promise<PermissionRuntimeSnapshot> {
    const normalizedFormKey = requiredPermissionText(formKey, 'formKey')
    const result = await this.client.requestResult({
      path: '/api/Function/GetFormUserFunction',
      method: 'GET',
      headers: { 'x-FormKey': normalizedFormKey },
    })
    if (!isPermissionRecord(result)) throw new LowcodeApiError(0, '功能权限响应不是对象')
    return {
      formKey: normalizedFormKey,
      authorizedFeatureTags: permissionList(result['childFun']),
      allowAddByResource: allowAddByResource(result['allowAdd']),
    }
  }
}
