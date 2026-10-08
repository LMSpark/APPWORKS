/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/protocol/data-space-query-table
 * 职责：构造模型查询封包并解码原结果快照。
 * 边界：保留后端权限与正式主键，不从普通 id 字段猜测身份。
 * AI用途：核对请求模型 Name、输出投影与结果元数据。
 */
import type { DataSpaceQueryIdentity, DataSpaceQueryOptions } from '../data-space-runtime-contract'
import { encodeDataSpaceQueryOptions } from '../query/data-space-query-options'
import type { DataSpaceWireQueryOptions, DataSpaceWireQueryRequest } from './data-space-wire-contract'
import { LowcodeApiError } from '../../../../core/lowcode-api-error'

type QueryFieldProjection = Record<string, unknown>
/** 冻结的后端原行、总数及权限凭据；countReported 区分实际总数与行数推导。 */
type DataSpaceQuerySnapshot = Readonly<{
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>
  total: number
  countReported: boolean
  primaryKey: string
  allowAdd: boolean
  systemKey: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function explicitEnvelope(value: Record<string, unknown>): boolean {
  const type = String(value['Type'] ?? value['type'] ?? '').toLowerCase()
  return ('Result' in value || 'result' in value) && (
    (('Code' in value || 'code' in value) && ('Message' in value || 'message' in value))
    || type === 'success' || type === 'error')
}

function queryData(payload: unknown): unknown {
  if (!isRecord(payload)) return payload
  if ((payload['data'] === null || payload['Data'] === null)
    && ('primaryKeyField' in payload || 'allowAdd' in payload)) return null
  let current: unknown = payload['data'] ?? payload['Data'] ?? payload
  const visited = new Set<object>()
  while (isRecord(current) && !visited.has(current)) {
    visited.add(current)
    if (explicitEnvelope(current)) {
      const code = current['Code'] ?? current['code']
      if ((code !== undefined && !['0', '200'].includes(String(code)))
        || String(current['Type'] ?? current['type']).toLowerCase() === 'error') {
        throw new LowcodeApiError(Number(code) || 0, String(current['Message'] ?? current['message'] ?? 'SPARK 查询响应失败'))
      }
    }
    const nested = current['data'] ?? current['Data']
    if ((isRecord(nested) || Array.isArray(nested)) && (Object.keys(current).length === 1
      || Object.keys(current).some(key => ['Code', 'Message', 'code', 'errCode', 'errMsg', 'errcode',
        'errmsg', 'globalTicket', 'message', 'success'].includes(key)))) {
      current = nested
      continue
    }
    const result = current['Result'] ?? current['result']
    if ((isRecord(result) || Array.isArray(result)) && explicitEnvelope(current)) {
      current = result
      continue
    }
    break
  }
  return current
}

const countKeys = ['Count', 'Total', 'TotalCount', 'count', 'total', 'totalCount']

function queryRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (!isRecord(data)) return []
  const explicit = data['Items'] ?? data['items'] ?? data['List'] ?? data['list']
  const result = data['Result'] ?? data['result']
  if (explicit === undefined && isRecord(result) && !explicitEnvelope(data)
    && Object.keys(data).some(key => !['Result', 'result', ...countKeys].includes(key))) return [data]
  const items = explicit ?? result
  if (Array.isArray(items)) return items
  if (isRecord(items)) return [items]
  return Object.keys(data).some(key => !countKeys.includes(key)) ? [data] : []
}

function freezeNested(value: unknown, visited = new Set<object>()): void {
  if (value === null || typeof value !== 'object' || visited.has(value)) return
  visited.add(value)
  Object.values(value).forEach(child => freezeNested(child, visited))
  Object.freeze(value)
}

function reportedCount(data: unknown, payload: unknown): unknown {
  for (const candidate of [data, payload]) {
    if (!isRecord(candidate)) continue
    const direct = candidate['Count'] ?? candidate['count'] ?? candidate['Total'] ?? candidate['total']
      ?? candidate['TotalCount'] ?? candidate['totalCount']
    if (direct !== undefined && direct !== null) return direct
    const page = candidate['Page'] ?? candidate['page'] ?? candidate['PageInfo'] ?? candidate['pageInfo'] ?? candidate['pagination']
    if (isRecord(page)) {
      const nested = page['Count'] ?? page['count'] ?? page['Total'] ?? page['total']
      if (nested !== undefined && nested !== null) return nested
    }
  }
  return undefined
}

function requireIdentityText(value: string, field: string): string {
  if (!value.trim()) throw new Error(`${field} 不能为空`)
  return value.trim()
}

function projectSortFields(options: DataSpaceWireQueryOptions): QueryFieldProjection[] | undefined {
  if (options.fields === undefined) return undefined
  const projected: QueryFieldProjection[] = options.fields.map(field => ({ ...field }))
  options.sortFields?.forEach((sort, index) => {
    const name = sort.Field.trim()
    if (!name) return
    let target = projected.find(field => typeof field['Name'] === 'string' && field['Name'].toLowerCase() === name.toLowerCase())
    if (target === undefined) {
      target = { Name: name, AsName: name, IsOutput: false }
      projected.push(target)
    }
    target['OrderType'] = sort.OrderType
    target['Order'] = Number.isFinite(sort.Order) && sort.Order > 0 ? sort.Order : (options.sortFields?.length ?? 0) - index
  })
  return projected
}

/** API 内部模型查询表；不向组件暴露另一套 DataTable，也不保存物理资源身份。 */
export class DataSpaceQueryTable {
  readonly #identity: DataSpaceQueryIdentity

  /** 规范化并冻结场景和模型 Name；缺少任一身份直接失败。 */
  public constructor(identity: DataSpaceQueryIdentity) {
    this.#identity = Object.freeze({
      scenarioId: requireIdentityText(identity.scenarioId, 'scenarioId'),
      metaName: requireIdentityText(identity.metaName, 'metaName'),
    })
  }

  public get identity(): DataSpaceQueryIdentity { return this.#identity }

  public applyResult(result: unknown): DataSpaceQuerySnapshot {
    const outer = isRecord(result) && isRecord(result['data'])
      && ('Result' in result['data'] || 'result' in result['data']) ? result['data'] : result
    const payload: unknown = isRecord(outer) ? outer['Result'] ?? outer['result'] ?? outer : outer
    const data = queryData(payload)
    const rows = queryRows(data).map(row => {
      if (!isRecord(row)) throw new TypeError('SPARK 查询记录必须是对象')
      const snapshot: Record<string, unknown> = structuredClone(row)
      freezeNested(snapshot)
      return snapshot
    })
    const rawCount = reportedCount(data, payload)
    const total = Number(rawCount)
    const countReported = rawCount !== undefined && rawCount !== null && Number.isSafeInteger(total) && total >= 0
    const metadata = isRecord(payload) ? payload : {}
    const nested = isRecord(metadata['data']) ? metadata['data'] : isRecord(metadata['Data']) ? metadata['Data'] : {}
    const table = metadata['Table'] ?? metadata['table'] ?? nested['Table'] ?? nested['table']
    const descriptor = Array.isArray(table) && isRecord(table[0]) ? table[0] : isRecord(table) ? table : {}
    const primaryKey = metadata['primaryKeyField'] ?? descriptor['PrimaryKeyFields'] ?? descriptor['primaryKeyFields']
      ?? metadata['PrimaryKeyFields'] ?? metadata['primaryKeyFields'] ?? nested['PrimaryKeyFields'] ?? nested['primaryKeyFields']
    return Object.freeze({ rows: Object.freeze(rows), total: countReported ? total : rows.length, countReported,
      primaryKey: primaryKey === null || primaryKey === undefined ? '' : String(primaryKey).trim(), allowAdd: Boolean(metadata['allowAdd']),
      systemKey: typeof metadata['lingma_sys_key'] === 'string' ? metadata['lingma_sys_key'] : '' })
  }

  public buildRequest(input: DataSpaceQueryOptions): DataSpaceWireQueryRequest {
    const options = encodeDataSpaceQueryOptions(input)
    const fields = projectSortFields(options)
    const table: Record<string, unknown> = {
      Name: this.#identity.metaName,
      OutputType: options.outputType ?? 'Table',
      Filter: options.filter ?? null,
      inputParams: options.inputParams ?? [],
      DISTINCT: false,
      IsBusinessMain: 1,
      ...(fields === undefined ? {} : { Fields: fields }),
    }
    const tree = options.tree
    return {
      Table: [table],
      ...(options.outputFieldMode === undefined ? {} : {OutputFieldMode: options.outputFieldMode}),
      ...(options.pageIndex === undefined || options.pageSize === undefined ? {}
        : { PageParam: { index: options.pageIndex, size: options.pageSize } }),
      ...(tree === undefined ? {} : { keyField: tree.keyField, parentField: tree.parentField,
        nodeid: tree.nodeid, hasChildField: tree.hasChildField, type: tree.type }),
    }
  }
}
