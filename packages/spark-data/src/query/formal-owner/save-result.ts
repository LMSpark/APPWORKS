import {DataSpaceApiError} from './request-error'

export type DataSpaceSavePlan = ReadonlyArray<Readonly<{
  TableName: string
  CrudModel: Readonly<{Added: ReadonlyArray<Record<string, unknown>>; Changed: ReadonlyArray<Record<string, unknown>>; Deleted: ReadonlyArray<Record<string, unknown>>}>
}>>

export type DataSpaceSaveReceipt = Readonly<{
  metaName: string
  added: Array<Record<string, unknown>>
  changed: Array<Record<string, unknown>>
  deleted: Array<Record<string, unknown>>
}>

type FormalSaveSuccessOptions = Readonly<{
  fallback?: string
  treatErrorMessageAsFailure?: boolean
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function record(value: unknown): Record<string, unknown> { return isRecord(value) ? value : {} }
function text(value: unknown, fallback = ''): string { return String(value ?? '').trim() || fallback }

const fieldFailureTargets = new Set(['删除失败字段', '更新失败字段', '新增失败字段'])
const saveActions = [
  { kind: 'added', field: 'Added', bucket: 'maplistadd' },
  { kind: 'changed', field: 'Changed', bucket: 'maplistedit' },
  { kind: 'deleted', field: 'Deleted', bucket: 'maplistdelete' },
] as const

function findBuckets(value: unknown, key: string, depth = 0): unknown[] | undefined {
  if (depth > 6 || !isRecord(value)) return undefined
  const direct = Object.entries(value).find(([name]) => name.toLowerCase() === key)
  if (direct) {
    if (!Array.isArray(direct[1])) throw new Error(`保存回执 ${key} 资源桶不是数组`)
    return direct[1].map((item: unknown) => item)
  }
  for (const [name, nested] of Object.entries(value)) {
    if (!['data', 'result'].includes(name.toLowerCase())) continue
    const found = findBuckets(nested, key, depth + 1)
    if (found !== undefined) return found
  }
  return undefined
}

export function readDataSpaceSaveReceipt(response: unknown, groups: readonly DataSpaceSavePlan[]): DataSpaceSaveReceipt[] {
  assertDataSpaceSaveSuccess(response)
  const receipts: DataSpaceSaveReceipt[] = groups.map(group => {
    const first = group[0]
    if (first === undefined || group.some(request => request.TableName !== first.TableName)) {
      throw new Error('保存请求模型分段身份无法确认')
    }
    return { metaName: first.TableName, added: [], changed: [], deleted: [] }
  })
  for (const action of saveActions) {
    const plan = groups.map(group => group.filter(request => request.CrudModel[action.field].length > 0))
    const expected = plan.reduce((count, group) => count + group.length, 0)
    if (expected === 0) continue
    const buckets = findBuckets(response, action.bucket) ?? []
    const entries = buckets.flatMap(bucket => {
      if (!isRecord(bucket)) throw new Error(`保存回执 ${action.kind} 资源桶格式无法确认`)
      return Object.entries(bucket).map(([name, rows]) => {
        if (!Array.isArray(rows)) throw new Error(`保存回执 ${action.kind} 资源桶行不是数组`)
        return { name, rows }
      })
    })
    if (entries.length !== expected) {
      throw new Error(`保存回执 ${action.kind} 资源桶数量不一致：期望 ${expected}，实际 ${entries.length}`)
    }
    let offset = 0
    for (const [index, group] of plan.entries()) {
      const rows: Array<Record<string, unknown>> = []
      let internalName: string | undefined
      for (const request of group) {
        const entry = entries[offset++]
        if (entry === undefined) throw new Error(`保存回执 ${action.kind} 缺少资源桶`)
        if (internalName !== undefined && internalName !== entry.name) {
          throw new Error(`保存回执 ${action.kind} 的同一资源分段身份不一致`)
        }
        internalName = entry.name
        const count = request.CrudModel[action.field].length
        if (entry.rows.length !== count || !entry.rows.every(isRecord)) {
          throw new Error(`保存回执 ${action.kind} 分段行数或行格式不一致：期望 ${count}，实际 ${entry.rows.length}`)
        }
        rows.push(...entry.rows.map(row => structuredClone(row)))
      }
      const receipt = receipts[index]
      if (receipt === undefined) throw new Error('保存回执模型位置无法确认')
      receipt[action.kind].push(...rows)
    }
  }
  return receipts
}

function assertFieldDiagnostics(envelope: Record<string, unknown>): void {
  if (!['Code', 'code', 'Type', 'type'].some(key => Object.hasOwn(envelope, key))
    || !Object.hasOwn(envelope, 'Extras')) return
  const extras: unknown = envelope['Extras']
  if (typeof extras === 'string' && !extras.trim()) return
  if (!Array.isArray(extras)) throw new Error('保存回执 Extras 诊断格式无法确认')
  const failures: string[] = []
  for (const [index, value] of extras.entries()) {
    if (!isRecord(value)) throw new Error(`保存回执 Extras 第 ${index + 1} 项诊断格式无法确认`)
    const target = value['target']
    if (typeof target !== 'string' || !fieldFailureTargets.has(target)) {
      throw new Error(`保存回执 Extras 包含未知字段诊断 target：${text(target, '缺失')}`)
    }
    const messages: unknown = value['message']
    if (!Array.isArray(messages)) throw new Error(`保存回执 Extras ${target} 的 message 必须为数组`)
    for (const [messageIndex, message] of messages.entries()) {
      if (!isRecord(message)) {
        throw new Error(`保存回执 Extras ${target} 第 ${messageIndex + 1} 条失败详情格式无法确认`)
      }
      const entries = Object.entries(message)
      if (!entries.length) throw new Error(`保存回执 Extras ${target} 第 ${messageIndex + 1} 条失败详情缺少字段与原因`)
      for (const [field, reason] of entries) {
        if (!field.trim() || (reason !== null && reason !== undefined && typeof reason !== 'string')) {
          throw new Error(`保存回执 Extras ${target} 第 ${messageIndex + 1} 条失败详情格式无法确认`)
        }
        failures.push(`${target}：${field}：${text(reason, '未提供失败原因')}`)
      }
    }
  }
  if (failures.length) throw new Error(`保存失败：${failures.join('；')}`)
}

export function assertDataSpaceSaveSuccess(response: unknown, options: FormalSaveSuccessOptions = {}): void {
  const outer = record(response)
  const root = record(outer['data'] ?? response)
  const result = record(root['Result'] ?? root['result'] ?? root)
  const resultData = record(result['data'] ?? result['Data'])
  const fallback = options.fallback === '' ? '保存失败' : options.fallback ?? '保存失败'
  const candidates = [outer['Message'], outer['message'], outer['msg'], outer['error'],
    root['Message'], root['message'], root['msg'], root['error'],
    result['Message'], result['message'], result['msg'], resultData['Message'], resultData['message']]
  const message = candidates.map(value => text(value)).find(value => value) ?? fallback
  for (const item of [outer, root, result, resultData]) {
    const code = item['Code'] ?? item['code'] ?? item['Status'] ?? item['status']
    if(code !== undefined && !['0', '200', 'success'].includes(String(code).toLowerCase())){
      const numericCode=Number(code)
      throw new DataSpaceApiError(Number.isFinite(numericCode)?numericCode:0,message)
    }
  }
  assertFieldDiagnostics(root)
  for(const item of [outer,root,result,resultData]){
    const type=text(item['Type']??item['type']).toLowerCase()
    const success=item['Success']??item['success']
    if(type&&!['success','ok'].includes(type)||success===false)throw new Error(message)
  }
  if (options.treatErrorMessageAsFailure !== false && message !== fallback
    && /(异常|错误|失败|incorrect|error|exception)/i.test(message)) throw new Error(message)
}
