/**
 * 权限设计态 wire 共享层：FormKey、GetData 查询封装与响应行解析工具。
 * 仅供 design 读路径复用；runtime 不依赖本模块。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'

import { LowcodeApiError } from '../../core/lowcode-api-error.js'
import { LowcodeClient } from '../../core/lowcode-client.js'

/** 权限设计态 GetData 固定 FormKey；与数据空间设计读共用，变更须全链路回归。 */
export const PERMISSION_DESIGN_FORM_KEY = '8D1AB14DD8277F3E7017CD38F77B09FD'

/** 判断 wire 值是否为对象记录；非对象数组会被拒绝。 */
export function isPermissionRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 权限 wire 文本归一化；undefined/null 转为空串。 */
export function permissionText(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim()
}

/** 必填 wire 文本；空白会 fail-fast。 */
export function requiredPermissionText(value: unknown, name: string): string {
  const normalized = permissionText(value)
  if (!normalized) throw new LowcodeApiError(0, `${name} 不能为空`)
  return normalized
}

/** 权限字段列表解析；支持数组或逗号分隔串，去重并剔除空白项。 */
export function permissionList(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    if (!value.every((item) => typeof item === 'string')) {
      throw new LowcodeApiError(0, '权限集合包含非字符串项')
    }
    return [...new Set(value.map((item) => item.trim()).filter(Boolean))]
  }
  const raw = permissionText(value)
  return raw ? [...new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))] : []
}

function queryPayload(tableName: string, field: string, value: string): Readonly<Record<string, unknown>> {
  return {
    Table: [{
      Name: tableName,
      DbName: 'QYVirtualPlat',
      PrimaryKeyFields: 'rowid',
      Type: '数据库表',
      OutputType: 'Table',
      Filter: {
        Type: 'and',
        Filters: [{
          Type: 'cond',
          Field: field,
          Operator: 'equal',
          ValueFun: { Type: 'GetConstValue', Value: value },
        }],
      },
      inputParams: [],
      DISTINCT: true,
      IsBusinessMain: 1,
      RelationFilterType: 'and',
    }],
  }
}

function resultRows(result: unknown): ReadonlyArray<Record<string, unknown>> {
  if (!isPermissionRecord(result)) throw new LowcodeApiError(0, '权限设计响应不是对象')
  const data = result['data'] ?? result['Data']
  if (!isPermissionRecord(data)) throw new LowcodeApiError(0, '权限设计响应缺少 data')
  const items = data['Items'] ?? data['items'] ?? data['Result'] ?? data['result']
  if (!Array.isArray(items) || !items.every(isPermissionRecord)) {
    throw new LowcodeApiError(0, '权限设计响应 Items 不是对象数组')
  }
  return items
}

/** 权限设计态 QYVirtualPlat 表读取器；按 field=value 等值过滤拉取原始行。 */
export class PermissionDesignReader {
  private readonly client: LowcodeClient

  public constructor(http: HttpClientBase) {
    this.client = new LowcodeClient(http)
  }

  public async readTable(
    tableName: string,
    field: string,
    value: string,
  ): Promise<ReadonlyArray<Record<string, unknown>>> {
    const result = await this.client.requestResult({
      path: '/api/DataOperation/GetData',
      method: 'POST',
      data: queryPayload(tableName, field, value),
      headers: { 'x-FormKey': PERMISSION_DESIGN_FORM_KEY },
    })
    return resultRows(result)
  }
}
