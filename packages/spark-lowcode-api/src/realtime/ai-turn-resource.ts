/**
 * @module @spark-appworks/spark-lowcode-api:realtime/ai-turn-resource
 * 职责：把 V1 Agent 目录、创建轮次、轮次状态和取消命令装配为同一 DataSet 的语义 DataView。
 * 边界：HTTP 仅由 DataView query/save owner 调用；不提供审批、前端工具结果、候选解析或独立轮询状态。
 * AI用途：需要将已配置 Agent 的轮次请求、状态查询和取消命令绑定到当前 DataSet 时使用。当前仅提供四个轮次 DataView；字典候选解析、预览和人工确认留给后续领域与页面接线。
 */
import {bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery, type DataColumn, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'

import {LowcodeApiError} from '../core/lowcode-api-error.js'
import {LowcodeClient} from '../core/lowcode-client.js'

const TURN_STATUSES = ['WAITING_ATTACHMENT', 'QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'WAITING_CLIENT_TOOL', 'CANCELLING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const
type TurnStatus = typeof TURN_STATUSES[number]

type AgentRecord = Readonly<{id: string; agentName: string | null; description: string | null}>
type TurnRecord = Readonly<{
  id: string
  conversationId: string
  agentId: string
  status: TurnStatus
  assistantDraft: string | null
  errorCode: string | null
  errorMessage: string | null
}>
type TurnAck = Readonly<{conversationId: string; turnId: string; status: TurnStatus; acceptedAt: string | null}>
/** 构造 AI 轮次语义资源所需的当前运行实例依赖。 */
type AiTurnResourceInput = Readonly<{
  /** 当前目标的原生 DataSet；四个资源视图直接装配在此实例上。 */
  dataSet: DataSet
  /** 由宿主提供的认证 HTTP 客户端；资源在 DataView owner 内发起 V1 请求。 */
  http: HttpClientBase
  /** 同步检查当前租户、应用和目标范围仍有效；失效时应拒绝本次访问。 */
  guard: () => void
}>

class AiTurnResultUnknownError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AiTurnResultUnknownError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`AI轮次响应缺少有效${name}`)
  return value
}

function nullableText(value: unknown, name: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new Error(`AI轮次响应${name}类型无效`)
  return value
}

function turnStatus(value: unknown): TurnStatus {
  const status = TURN_STATUSES.find(candidate => candidate === value)
  if (status === undefined) throw new Error('AI轮次响应状态无效')
  return status
}

function readAgent(value: unknown): AgentRecord[] {
  if (!Array.isArray(value)) throw new Error('AI Agent目录响应不是数组')
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`AI Agent目录第${index + 1}项无效`)
    return {
      id: requiredText(item['id'], 'Agent id'),
      agentName: nullableText(item['agentName'], 'agentName'),
      description: nullableText(item['description'], 'description'),
    }
  })
}

function readTurn(value: unknown, expectedId: string): TurnRecord {
  if (!isRecord(value)) throw new Error('AI轮次状态响应无效')
  const id = requiredText(value['id'], 'turnId')
  if (id !== expectedId) throw new Error('AI轮次状态身份与查询目标不匹配')
  return {
    id,
    conversationId: requiredText(value['conversationId'], 'conversationId'),
    agentId: requiredText(value['agentId'], 'agentId'),
    status: turnStatus(value['status']),
    assistantDraft: nullableText(value['assistantDraft'], 'assistantDraft'),
    errorCode: nullableText(value['errorCode'], 'errorCode'),
    errorMessage: nullableText(value['errorMessage'], 'errorMessage'),
  }
}

function readAck(value: unknown): TurnAck {
  if (!isRecord(value)) throw new AiTurnResultUnknownError('AI轮次创建回执无效，结果待核验')
  try {
    const acceptedAt = value['acceptedAt'] === undefined ? null : nullableText(value['acceptedAt'], 'acceptedAt')
    return {
      conversationId: requiredText(value['conversationId'], 'conversationId'),
      turnId: requiredText(value['turnId'], 'turnId'),
      status: turnStatus(value['status']),
      acceptedAt,
    }
  } catch (error) {
    throw new AiTurnResultUnknownError('AI轮次创建回执不完整，结果待核验', {cause: error})
  }
}

function dataColumn(name: string, type: DataColumn['type'], primary = false): DataColumn {
  return {name, type, ...(primary ? {isPrimaryKey: true} : {}), allowDBNull: true}
}

function encodePathSegment(value: string): string { return encodeURIComponent(value) }

function isExplicitFailure(error: unknown): boolean {
  return error instanceof LowcodeApiError && error.code > 0 && (error.code < 500 || error.code > 599)
}

function toUnknown(error: unknown, message: string): AiTurnResultUnknownError {
  return error instanceof AiTurnResultUnknownError ? error : new AiTurnResultUnknownError(message, {cause: error})
}

/**
 * 四个 AI 语义资源视图；所有写入只通过对应 DataView/DataSet saveChanges 提交。
 * 请求主键为本地生成的 idempotencyKey。若创建 ACK 丢失且没有可信 turnId，核验明确失败并保留 DataView 原 capture，不重放 POST。
 * 四个视图依附传入的 DataSet，并随该 DataSet 销毁。guard 表示租户、应用或目标失效后，必须为新目标重新装配资源，不能复用旧视图或结果。
 * 创建 ACK 仅表示轮次已受理，不代表生成终态；取消 ACK 仅表示取消请求回执，不代表轮次已停止。停止状态须通过 turns 刷新正式读回核验。
 */
export class AiTurnResource {
  /** Read-only AgentCatalogItem projection: id (primary key), agentName, description. */
  readonly agents: DataView
  /** Staged create command: idempotencyKey primary key; agentId/message/conversationId inputs; turnId/status/acceptedAt receipt fields. ACK is not a generation terminal state. */
  readonly requests: DataView
  /** Read-only TurnRecord projection; set queryContext.turnId before refresh. Empty/missing ID returns no rows without HTTP. */
  readonly turns: DataView
  /** Staged cancel command: operationId primary key, turnId input, requested boolean|null ACK and observedStatus readback. ACK is not proof of stop; verify through turns. */
  readonly cancellations: DataView

  readonly #dataSet: DataSet
  readonly #client: LowcodeClient
  readonly #guard: () => void
  #requestInFlight = false
  #cancelInFlight = false

  /**
   * 把 V1 AI 轮次资源绑定到调用方现有 DataSet。
   * @param input.dataSet 本次运行实例的原 DataSet；不得传入另一个目标空间的副本。
   * @param input.http 现有认证 HTTP 客户端；本资源在 DataView executor 内封装协议请求。
   * @param input.guard 每次请求前后校验当前应用/目标身份仍有效。
   * @throws 任一保留表名已存在时，在新增任何表之前拒绝装配。
   */
  public constructor(input: AiTurnResourceInput) {
    this.#dataSet = input.dataSet
    this.#client = new LowcodeClient(input.http)
    this.#guard = input.guard
    this.assertScope()

    const names = ['AiTurnAgents', 'AiTurnRequest', 'AiTurnStatus', 'AiTurnCancel'] as const
    const conflict = names.find(name => input.dataSet.getTable(name) !== undefined)
    if (conflict) throw new Error(`AI轮次资源表名冲突: ${conflict}`)

    const agents = this.createView('AiTurnAgents', [dataColumn('id', 'string', true), dataColumn('agentName', 'string'), dataColumn('description', 'string')])
    const requests = this.createView('AiTurnRequest', [
      dataColumn('idempotencyKey', 'string', true), dataColumn('agentId', 'string'), dataColumn('message', 'string'),
      dataColumn('conversationId', 'string'), dataColumn('turnId', 'string'), dataColumn('status', 'string'), dataColumn('acceptedAt', 'string'),
    ])
    const turns = this.createView('AiTurnStatus', [
      dataColumn('id', 'string', true), dataColumn('conversationId', 'string'), dataColumn('agentId', 'string'),
      dataColumn('status', 'string'), dataColumn('assistantDraft', 'string'), dataColumn('errorCode', 'string'), dataColumn('errorMessage', 'string'),
    ])
    const cancellations = this.createView('AiTurnCancel', [
      dataColumn('operationId', 'string', true), dataColumn('turnId', 'string'), dataColumn('requested', 'boolean'), dataColumn('observedStatus', 'string'),
    ])
    this.agents = agents
    this.requests = requests
    this.turns = turns
    this.cancellations = cancellations

    bindDataSetReadonlyCommandQuery(agents, {
      resource: this.resourceIdentity('AiTurnAgents'), guard: () => this.assertScope(),
      loadRows: async () => this.readAgents(),
    })
    bindDataSetCommandSubmit(requests, {
      resource: this.resourceIdentity('AiTurnRequest'), guard: () => this.assertScope(),
      inputFields: ['agentId', 'message', 'conversationId'], createKey: () => crypto.randomUUID(),
      submit: row => this.submitRequest(row), verify: row => this.verifyRequest(row),
      isUnconfirmed: error => error instanceof AiTurnResultUnknownError,
    })
    bindDataSetReadonlyCommandQuery(turns, {
      resource: this.resourceIdentity('AiTurnStatus'), guard: () => this.assertScope(),
      loadRows: async view => {
        const id = view.queryContext['turnId']
        if (typeof id !== 'string' || id.trim() === '') return []
        return [await this.readTurn(id)]
      },
    })
    bindDataSetCommandSubmit(cancellations, {
      resource: this.resourceIdentity('AiTurnCancel'), guard: () => this.assertScope(),
      inputFields: ['turnId'], createKey: () => crypto.randomUUID(),
      submit: row => this.submitCancellation(row), verify: row => this.verifyCancellation(row),
      isUnconfirmed: error => error instanceof AiTurnResultUnknownError,
    })
  }

  private createView(tableName: string, columns: DataColumn[]): DataView {
    const table = this.#dataSet.addTable(tableName, columns)
    table.resourceType = 'file'
    table.resourceId = `ai-turn:${tableName}`
    const view = this.#dataSet.getView(tableName, 'default')
    if (!view) throw new Error(`AI轮次资源视图缺失: ${tableName}`)
    return view
  }

  private resourceIdentity(resourceId: string) { return {resourceType: 'file' as const, resourceId: `ai-turn:${resourceId}`} }

  private assertScope(): void {
    this.#guard()
    if (this.#dataSet.destroyed) throw new Error('AI轮次DataSet已销毁')
  }

  private async request(path: string, method: 'GET' | 'POST', data?: unknown): Promise<unknown> {
    this.assertScope()
    try {
      const result = await this.#client.requestResult({path, method, retry: 0, preserveHttpError: true,
        ...(data === undefined ? {} : {data})})
      try { this.assertScope() } catch (error) { throw new AiTurnResultUnknownError('AI轮次请求已发出但作用域失效，结果待核验', {cause: error}) }
      return result
    } catch (error) {
      if (error instanceof AiTurnResultUnknownError || isExplicitFailure(error)) throw error
      throw toUnknown(error, 'AI轮次请求结果未知，待核验')
    }
  }

  private async readAgents(): Promise<readonly DataRow[]> {
    const raw = await this.request('/api/ai/v1/agents', 'GET')
    try { return readAgent(raw) } catch (error) { throw error }
  }

  private async readTurn(turnId: string): Promise<TurnRecord> {
    const raw = await this.request(`/api/ai/v1/turns/${encodePathSegment(turnId)}`, 'GET')
    return readTurn(raw, turnId)
  }

  private async submitRequest(row: DataRow): Promise<DataRow> {
    if (this.#requestInFlight) throw new Error('AI轮次创建命令已有请求正在提交')
    this.#requestInFlight = true
    try {
      this.assertScope()
      const agentId = requiredText(row['agentId'], 'agentId')
      const message = requiredText(row['message'], 'message')
      if (message.length > 100000) throw new Error('AI轮次message不能超过100000字符')
      const conversationId = row['conversationId'] === undefined || row['conversationId'] === null || row['conversationId'] === ''
        ? undefined : requiredText(row['conversationId'], 'conversationId')
      const idempotencyKey = requiredText(row['idempotencyKey'], 'idempotencyKey')
      if (idempotencyKey.length > 128) throw new Error('AI轮次idempotencyKey不能超过128字符')
      if (Object.prototype.hasOwnProperty.call(row, 'turnId')) throw new Error('AI轮次turnId只能来自正式创建回执')
      const data = {agentId, message, idempotencyKey, ...(conversationId === undefined ? {} : {conversationId})}
      let raw: unknown
      try { raw = await this.request('/api/ai/v1/turns', 'POST', data) }
      catch (error) { if (isExplicitFailure(error)) throw error; throw toUnknown(error, 'AI轮次创建结果未知，待核验') }
      const ack = readAck(raw)
      return {idempotencyKey, agentId, message, conversationId: ack.conversationId, turnId: ack.turnId, status: ack.status, acceptedAt: ack.acceptedAt}
    } finally { this.#requestInFlight = false }
  }

  private verifyRequest(_row: DataRow): Promise<DataRow | undefined> {
    return Promise.reject(new AiTurnResultUnknownError('缺少只读核验身份，原AI轮次创建请求结果待核验'))
  }

  private async submitCancellation(row: DataRow): Promise<DataRow> {
    if (this.#cancelInFlight) throw new Error('AI轮次取消命令已有请求正在提交')
    this.assertScope()
    const turnId = requiredText(row['turnId'], 'turnId')
    const operationId = requiredText(row['operationId'], 'operationId')
    this.#cancelInFlight = true
    try {
      const result = await this.request(`/api/ai/v1/turns/${encodePathSegment(turnId)}/cancel`, 'POST')
      if (typeof result !== 'boolean') throw new AiTurnResultUnknownError('AI轮次取消回执非boolean，结果待核验')
      return {operationId, turnId, requested: result, observedStatus: null}
    } finally { this.#cancelInFlight = false }
  }

  private async verifyCancellation(row: DataRow): Promise<DataRow | undefined> {
    if (this.#cancelInFlight) throw new AiTurnResultUnknownError('AI轮次取消核验仍在进行，结果待核验')
    this.#cancelInFlight = true
    try {
      const turnId = requiredText(row['turnId'], 'turnId')
      const turn = await this.readTurn(turnId)
      if (turn.status === 'CANCELLING' || turn.status === 'CANCELLED') {
        return {operationId: requiredText(row['operationId'], 'operationId'), turnId, requested: true, observedStatus: turn.status}
      }
      if (turn.status === 'COMPLETED' || turn.status === 'FAILED') {
        return {operationId: requiredText(row['operationId'], 'operationId'), turnId, requested: null, observedStatus: turn.status}
      }
      throw new AiTurnResultUnknownError(`AI轮次当前状态${turn.status}不能确认取消请求结果，待核验`)
    } catch (error) {
      throw toUnknown(error, 'AI轮次取消核验失败，结果待核验')
    } finally { this.#cancelInFlight = false }
  }
}
