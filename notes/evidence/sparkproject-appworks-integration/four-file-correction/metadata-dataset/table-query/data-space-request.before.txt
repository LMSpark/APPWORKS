/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/protocol/data-space-request
 * 职责：执行原始 SPARK 查询与同场景批量保存。
 * 边界：请求前后检查 scope 与代次，保存依据实际动作回执确认。
 * AI用途：使用原封包和上下文组装统一 CRUD 请求。
 */
import type { HttpClientBase } from '@spark-appworks/spark-utils'
import { LowcodeApiError } from '../../../../core/lowcode-api-error'
import type { DataSpaceQueryIdentity, DataSpaceQueryOptions, DataSpaceRequestScope } from '../data-space-runtime-contract'
import { DataSpaceQueryTable } from './data-space-query-table'
import type { DataSpaceQueryContext } from '../query/data-space-query-context'
import { requireDataSpaceMutationInput, failDataSpaceMutationWithoutEffect } from '../save/data-space-save-guard'
import { readDataSpaceSaveReceipt } from '../save/data-space-save-result'
import { DataSpaceSaveConfig } from '../save/data-space-save-config'

/** 实际 HTTP 通道及请求 scope 读取器，供请求前后核对执行域。 */
type DataSpaceRequestOptions = Readonly<{
  http: HttpClientBase
  readScope: () => DataSpaceRequestScope
}>
/** 模型查询表、执行选项与可选取消信号的请求命令。 */
type DataSpaceRequestQueryCommand = Readonly<{
  table: DataSpaceQueryTable
  options: DataSpaceQueryOptions
  signal?: AbortSignal
}>
type DataSpaceRequestCapture = Readonly<{ token: string; generation: number; signal?: AbortSignal }>
/** 单模型候选变更及其原查询上下文；身份必须与上下文一致。 */
type DataSpaceRequestSaveChange = Readonly<{
  identity: DataSpaceQueryIdentity
  context: DataSpaceQueryContext
  changes: Parameters<DataSpaceQueryContext['buildSaveRequest']>[0]
}>
/** 同场景且模型不重复的批量保存目标；无实际变更不能提交。 */
type DataSpaceRequestSaveCommand = Readonly<{
  changes: readonly DataSpaceRequestSaveChange[]
  config?: DataSpaceSaveConfig
  signal?: AbortSignal
}>
/** 逐模型实际动作回执及新基线，不以 HTTP 成功代替保存确认。 */
type DataSpaceRequestSaveResult = Array<ReturnType<DataSpaceQueryContext['acceptSaveReceipt']>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function decodeEnvelope(input: unknown, operation: '查询' | '保存' = '查询'): unknown {
  let decoded = input
  for (let depth = 0; depth < 3 && typeof decoded === 'string'; depth += 1) {
    try { decoded = JSON.parse(decoded) } catch { break }
  }
  if (isRecord(decoded)) {
    const code = decoded['code'] ?? decoded['Code'] ?? decoded['status'] ?? decoded['Status']
    const successCodes = operation === '保存' ? ['0', '200', 'success'] : ['0', '200']
    if (code !== undefined && !successCodes.includes(String(code).toLowerCase())) {
      const message = decoded['message'] ?? decoded['Message'] ?? decoded['msg'] ?? decoded['error'] ?? decoded['repMsg']
      const numericCode = Number(code)
      throw new LowcodeApiError(Number.isFinite(numericCode) ? numericCode : 0,
        typeof message === 'string' && message.trim() ? message : `SPARK ${operation}请求失败`)
    }
  }
  return decoded
}

/** 拥有请求执行与失效代次；保留完整 SPARK 封包供原查询结果/权限算法消费。 */
export class DataSpaceRequest {
  readonly #http: HttpClientBase
  readonly #readScope: () => DataSpaceRequestScope
  #generation = 0
  #disposed = false

  /** 持有 HTTP 与 scope 读取器；失效代次由此请求对象管理。 */
  public constructor(options: DataSpaceRequestOptions) {
    this.#http = options.http
    this.#readScope = options.readScope
  }

  public invalidate(): void { this.#generation += 1 }

  public dispose(): void {
    this.#disposed = true
    this.invalidate()
  }

  public async query(command: DataSpaceRequestQueryCommand): Promise<unknown> {
    const scope = this.#readScope()
    if (!scope.token.trim()) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 请求层未提供有效 scope token')
    const captured: DataSpaceRequestCapture = { token: scope.token, generation: this.#generation,
      ...(command.signal === undefined ? {} : { signal: command.signal }) }
    this.assertCurrent(captured)
    const scenarioId = command.table.identity.scenarioId
    const headers = this.scenarioHeaders(scope, scenarioId)
    const data = command.table.buildRequest(command.options)
    this.assertCurrent(captured)
    try {
      const response = await this.#http.request<unknown>({
        url: '/api/DataOperation/GetData', method: 'POST', data, headers,
        retry: 0, cache: false, meta: { rawEnvelope: true },
        ...(command.signal === undefined ? {} : { signal: command.signal }),
      })
      this.assertCurrent(captured)
      return decodeEnvelope(response)
    } finally {
      this.assertCurrent(captured)
    }
  }

  /** 同场景多模型只发送一次；核对实际动作行，尚不确认本地 dirty 状态。 */
  public async save(command: DataSpaceRequestSaveCommand): Promise<DataSpaceRequestSaveResult> {
    const scope = this.#readScope()
    if (!scope.token.trim()) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 请求层未提供有效 scope token')
    const captured: DataSpaceRequestCapture = { token: scope.token, generation: this.#generation,
      ...(command.signal === undefined ? {} : { signal: command.signal }) }
    this.assertCurrent(captured)
    requireDataSpaceMutationInput('保存', command.changes.length)
    const targets = command.changes.map(change => ({ ...change, identity: new DataSpaceQueryTable(change.identity).identity }))
    const first = targets[0]
    if (first === undefined) throw new Error('SPARK API 保存至少需要一组变更')
    const scenarioId = first.identity.scenarioId
    const models = new Set<string>()
    for (const target of targets) {
      if (target.identity.scenarioId !== scenarioId) throw new Error('SPARK API 不允许跨数据空间批量保存')
      if (models.has(target.identity.metaName)) throw new Error('SPARK API 同一批保存不允许重复模型')
      models.add(target.identity.metaName)
      target.context.assertIdentity(target.identity)
      requireDataSpaceMutationInput('保存', (target.changes.added?.length ?? 0) + (target.changes.changed?.length ?? 0)
        + (target.changes.deleted?.length ?? 0), target.identity.metaName)
    }
    const prepared = targets.map(target => ({ ...target,
      changes: target.context.prepareSaveChanges(structuredClone(target.changes)) }))
    const ineffective = prepared.find(target => (target.changes.added?.length ?? 0)
      + (target.changes.changed?.length ?? 0) + (target.changes.deleted?.length ?? 0) === 0)
    if (ineffective !== undefined) failDataSpaceMutationWithoutEffect('保存', ineffective.identity.metaName)
    const groups = prepared.map(target => target.context.buildSaveRequest(target.changes))
    for (const group of groups) requireDataSpaceMutationInput('保存', group.length)
    const data = groups.flat()
    const config = command.config ?? DataSpaceSaveConfig.resolve([])
    const headers = config.mergeHeaders(this.scenarioHeaders(scope, scenarioId))
    this.assertCurrent(captured)
    try {
      const response = await this.#http.request<unknown>({
        ...config.endpoint, method: 'POST', data, headers,
        ...(config.timeout === undefined ? {} : {timeout: config.timeout}),
        retry: 0, cache: false, meta: { rawEnvelope: true },
        ...(command.signal === undefined ? {} : { signal: command.signal }),
      })
      this.assertCurrent(captured)
      const decoded = decodeEnvelope(response, '保存')
      const receipts = readDataSpaceSaveReceipt(decoded, groups)
      return prepared.map((target, index) => {
        const receipt = receipts[index]
        if (receipt === undefined) throw new Error('SPARK 保存缺少模型回执')
        return target.context.acceptSaveReceipt({ requested: target.changes, receipt })
      })
    } finally {
      this.assertCurrent(captured)
      targets.forEach(target => target.context.assertIdentity(target.identity))
    }
  }

  private scenarioHeaders(scope: DataSpaceRequestScope, scenarioId: string): Record<string, string> {
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(scope.headers)) {
      if (key.toLowerCase() === 'x-formkey') {
        if (value !== scenarioId) throw new Error('请求 scenario header 与模型场景不一致')
      } else headers[key] = value
    }
    headers['x-FormKey'] = scenarioId
    return headers
  }

  private assertCurrent(captured: DataSpaceRequestCapture): void {
    captured.signal?.throwIfAborted()
    if (this.#disposed || this.#generation !== captured.generation || this.#readScope().token !== captured.token) {
      throw new Error('SPARK_EXECUTION_SCOPE_STALE: 请求所属执行域已失效')
    }
  }
}
