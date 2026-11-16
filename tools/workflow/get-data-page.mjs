/**
 * GetData 响应分页解析（与 spark-lowcode-api Result.data 契约一致）。
 */

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** @param {unknown} json 完整 HTTP JSON */
export function parseGetDataResponse(json) {
  if (!isRecord(json)) throw new Error('GetData 响应不是对象')
  const code = json['Code']
  if (code !== 200) {
    const message = json['Message']
    throw new Error(typeof message === 'string' && message.trim() ? message : `GetData 失败 Code=${String(code)}`)
  }
  const result = json['Result'] ?? json['result']
  if (!isRecord(result) && !Array.isArray(result)) return {items: [], count: 0, code: 200}
  const data = isRecord(result) ? (result['data'] ?? result['Data']) : undefined
  const bucket = isRecord(data) ? data : isRecord(result) ? result : {}
  const itemsRaw = bucket['Items'] ?? bucket['items'] ?? (Array.isArray(result) ? result : [])
  const items = Array.isArray(itemsRaw) ? itemsRaw.filter(isRecord) : []
  const countRaw = bucket['Count'] ?? bucket['count'] ?? bucket['Total'] ?? bucket['total']
  const count = typeof countRaw === 'number' && Number.isFinite(countRaw) ? countRaw : items.length
  return {items, count, code: 200}
}

/**
 * @param {Readonly<{baseUrl: string; headers: Record<string, string>; body: unknown}>} input
 */
export async function postGetDataEnvelope(input) {
  const response = await fetch(`${input.baseUrl.replace(/\/$/, '')}/api/DataOperation/GetData`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', ...input.headers},
    body: JSON.stringify(input.body),
  })
  const json = await response.json()
  if (!response.ok && !(typeof json?.Code === 'number' && json.Code === 200)) {
    throw new Error(json?.Message ?? `HTTP ${response.status}`)
  }
  return parseGetDataResponse(json)
}

const defaultTable = name => ({
  Name: name,
  Type: '表',
  PrimaryKeyFields: 'rowid',
  OutputType: 'Table',
  inputParams: [],
  DISTINCT: false,
  IsBusinessMain: 1,
})

/**
 * @param {Readonly<{
 *   baseUrl: string;
 *   headers: Record<string, string>;
 *   tableName: string;
 *   filter?: unknown;
 *   pageIndex: number;
 *   pageSize: number;
 * }>} options
 */
export async function fetchGetDataPage(options) {
  const table = {...defaultTable(options.tableName), ...(options.filter ? {Filter: options.filter} : {})}
  return postGetDataEnvelope({
    baseUrl: options.baseUrl,
    headers: options.headers,
    body: {PageParam: {index: options.pageIndex, size: options.pageSize}, Table: [table]},
  })
}

/**
 * @param {Readonly<{
 *   baseUrl: string;
 *   headers: Record<string, string>;
 *   tableName: string;
 *   filter?: unknown;
 *   pageSize?: number;
 *   maxRows?: number;
 * }>} options
 */
export async function collectAllPages(options) {
  const pageSize = options.pageSize ?? 500
  const maxRows = options.maxRows ?? 50_000
  const all = []
  let total = 0
  let index = 1
  while (all.length < maxRows) {
    const page = await fetchGetDataPage({
      baseUrl: options.baseUrl,
      headers: options.headers,
      tableName: options.tableName,
      filter: options.filter,
      pageIndex: index,
      pageSize,
    })
    if (index === 1) total = page.count
    if (!page.items.length) break
    all.push(...page.items)
    if (all.length >= total || page.items.length < pageSize) break
    index += 1
  }
  return {items: all.slice(0, maxRows), total, pages: index}
}