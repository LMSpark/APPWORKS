/**
 * @module @spark-appworks/spark-lowcode-api:realtime/agent-config/ai-agent-config-resource
 * 职责：把 Agent 配置创建命令与按正式 ID 读取配置装配为当前 DataSet 的语义 DataView。
 * 边界：HTTP 仅由命令提交/只读查询 owner 发出；operationId 是本地命令身份，不作为 Agent ID 或核验凭据。
 * AI用途：配置阶段通过创建命令提交专用Agent配置，再按正式回执ID读取核验；运行生成只消费配置好的Agent ID。
 */
import {
  bindDataSetCommandSubmit, bindDataSetReadonlyCommandQuery,
  type DataColumn, type DataRow, type DataSet, type DataView,
} from '@spark-appworks/spark-data'
import type {HttpClientBase} from '@spark-appworks/spark-utils'

import {LowcodeApiError} from '../../core/lowcode-api-error.js'
import {LowcodeClient} from '../../core/lowcode-client.js'

/**
 * Inputs for the narrow Agent create/read resources during configuration setup.
 * This owner binds both views to one native DataSet and uses the supplied authenticated client and scope guard.
 */
type AgentConfigResourceInput = Readonly<{
  /** 当前配置阶段的原生DataSet；两个资源DataView依附于此实例并随DataSet销毁。 */
  dataSet: DataSet
  /** 既有认证HTTP客户端；请求由本资源绑定的DataView owner发出。 */
  http: HttpClientBase
  /** 每次命令提交和配置读取前后检查当前租户/应用范围；不在资源内推断管理角色。 */
  guard: () => void
}>

type AgentConfigReadbackFields = {
  id: string
  agentName: string
  agentPrompt: string
  aiModelId: string
  enabled: number
  callModelName?: string | null
  functionIds?: string | null
  maxToolRounds?: number | null
  enableSubtask?: number | null
  requireApproval?: number | null
}
type AgentConfigReadback = Readonly<AgentConfigReadbackFields>
type AgentConfigRequestParams = Readonly<{id: string}>
type AgentConfigRequest = Readonly<{
  path: string
  method: 'GET' | 'POST'
  data?: unknown
  params?: AgentConfigRequestParams
}>

const AGENT_CREATE_TABLE = 'AiAgentConfigCreate'
const AGENT_CONFIG_TABLE = 'AiAgentConfig'
const AGENT_CREATE_INPUTS = [
  'agentName', 'agentPrompt', 'aiModelId', 'callModelName', 'enabled', 'functionIds', 'maxToolRounds',
  'enableSubtask', 'requireApproval',
] as const
const AGENT_CONFIG_OPTIONAL_TEXT = ['callModelName', 'functionIds'] as const
const AGENT_CONFIG_OPTIONAL_FLAGS = ['enableSubtask', 'requireApproval'] as const

class AiAgentConfigResultUnknownError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AiAgentConfigResultUnknownError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Agent配置${field}必须是非空字符串`)
  return value
}

function requiredBinary(value: unknown, field: string): number {
  if (value !== 0 && value !== 1) throw new Error(`Agent配置${field}必须是数值0或1`)
  return value
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value !== 'string') throw new Error(`Agent配置${field}必须是字符串或null`)
  return value
}

function nullableBinary(value: unknown, field: string): number | null {
  if (value === null) return null
  return requiredBinary(value, field)
}

function nullableToolRounds(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error('Agent配置maxToolRounds必须是1到100之间的整数或null')
  }
  return value
}

function isExplicitFailure(error: unknown): boolean {
  return error instanceof LowcodeApiError && error.code > 0 && (error.code < 500 || error.code > 599)
}

function toUnknown(error: unknown, message: string): AiAgentConfigResultUnknownError {
  return error instanceof AiAgentConfigResultUnknownError
    ? error : new AiAgentConfigResultUnknownError(message, {cause: error})
}

function dataColumn(name: string, type: DataColumn['type'], primary = false): DataColumn {
  return {name, type, allowDBNull: true, ...(primary ? {isPrimaryKey: true, allowDBNull: false} : {})}
}

function readAgentConfig(value: unknown, expectedId: string): AgentConfigReadback {
  if (!isRecord(value)) throw new Error('Agent配置回读不是对象')
  const id = requiredText(value['id'], 'id')
  if (id !== expectedId) throw new Error('Agent配置回读ID与查询目标不一致')
  const output: AgentConfigReadbackFields = {
    id,
    agentName: requiredText(value['agentName'], 'agentName'),
    agentPrompt: requiredText(value['agentPrompt'], 'agentPrompt'),
    aiModelId: requiredText(value['aiModelId'], 'aiModelId'),
    enabled: requiredBinary(value['enabled'], 'enabled'),
  }
  for (const field of AGENT_CONFIG_OPTIONAL_TEXT) {
    if (Object.hasOwn(value, field)) output[field] = nullableText(value[field], field)
  }
  if (Object.hasOwn(value, 'maxToolRounds')) output.maxToolRounds = nullableToolRounds(value['maxToolRounds'])
  for (const field of AGENT_CONFIG_OPTIONAL_FLAGS) {
    if (Object.hasOwn(value, field)) output[field] = nullableBinary(value[field], field)
  }
  return output
}

function createPayload(row: DataRow): Readonly<Record<string, unknown>> {
  const allowed = new Set<string>(['operationId', ...AGENT_CREATE_INPUTS])
  const unexpected = Object.keys(row).find(key => !allowed.has(key))
  if (unexpected !== undefined) throw new Error(`Agent配置创建包含未声明字段: ${unexpected}`)

  const agentName = requiredText(row['agentName'], 'agentName')
  const agentPrompt = requiredText(row['agentPrompt'], 'agentPrompt')
  const aiModelId = requiredText(row['aiModelId'], 'aiModelId')
  const callModelName = nullableText(row['callModelName'], 'callModelName')
  const functionIds = row['functionIds']
  if (typeof functionIds !== 'string') throw new Error('Agent配置functionIds必须是逗号分隔字符串')
  const enabled = requiredBinary(row['enabled'], 'enabled')
  const maxToolRounds = nullableToolRounds(row['maxToolRounds'])
  const enableSubtask = requiredBinary(row['enableSubtask'], 'enableSubtask')
  const requireApproval = requiredBinary(row['requireApproval'], 'requireApproval')
  requiredText(row['operationId'], 'operationId')
  return {agentName, agentPrompt, aiModelId, callModelName, enabled, functionIds, maxToolRounds, enableSubtask, requireApproval}
}

/**
 * Agent配置阶段的SPARK data语义资源。创建只经 `requests` selected-view save；读取只经
 * `configuration.refresh()`，不会执行管理角色判断或用operationId猜测正式Agent身份。
 *
 * 两个DataView归传入的DataSet所有，并随其销毁。若创建回执丢失且没有可信正式Agent ID，
 * 原命令保持unknown；保存恢复只会报告无法核验，不会重POST。不能销毁视图来清除unknown捕获。
 */
export class AiAgentConfigResource {
  /** 一行对应一次Agent创建命令；operationId本地生成，agentId仅由正式创建回执填充。 */
  readonly requests: DataView
  /** 按queryContext.agentId读取的正式配置白名单，只读，不承载创建草稿。 */
  readonly configuration: DataView

  readonly #dataSet: DataSet
  readonly #client: LowcodeClient
  readonly #guard: () => void
  #createInFlight = false

  /**
   * 将Agent配置命令与只读回读绑定到当前DataSet。
   * @param input.dataSet 本配置阶段的原生DataSet；资源视图随它的生命周期释放。
   * @param input.http 现有认证HTTP客户端；不创建第二套客户端或请求入口。
   * @param input.guard 每次访问时校验当前作用域仍有效，不以角色或用户名称判断权限。
   * @throws 任一保留资源表已存在时，在新增两个表中的任何一个之前拒绝装配。
   */
  public constructor(input: AgentConfigResourceInput) {
    this.#dataSet = input.dataSet
    this.#client = new LowcodeClient(input.http)
    this.#guard = input.guard
    this.assertScope()

    const conflict = [AGENT_CREATE_TABLE, AGENT_CONFIG_TABLE].find(name => input.dataSet.getTable(name) !== undefined)
    if (conflict !== undefined) throw new Error(`Agent配置资源表名冲突: ${conflict}`)

    const requests = this.createView(AGENT_CREATE_TABLE, [
      dataColumn('operationId', 'string', true),
      dataColumn('agentName', 'string'), dataColumn('agentPrompt', 'string'), dataColumn('aiModelId', 'string'),
      dataColumn('callModelName', 'string'), dataColumn('enabled', 'number'), dataColumn('functionIds', 'string'),
      dataColumn('maxToolRounds', 'number'), dataColumn('enableSubtask', 'number'), dataColumn('requireApproval', 'number'),
      dataColumn('agentId', 'string'),
    ], 'ai-agent-config:create')
    const configuration = this.createView(AGENT_CONFIG_TABLE, [
      dataColumn('id', 'string', true), dataColumn('agentName', 'string'), dataColumn('agentPrompt', 'string'),
      dataColumn('aiModelId', 'string'), dataColumn('callModelName', 'string'), dataColumn('functionIds', 'string'),
      dataColumn('maxToolRounds', 'number'), dataColumn('enableSubtask', 'number'),
      dataColumn('requireApproval', 'number'), dataColumn('enabled', 'number'),
    ], 'ai-agent-config:read')
    this.requests = requests
    this.configuration = configuration

    bindDataSetCommandSubmit(requests, {
      resource: {resourceType: 'file', resourceId: 'ai-agent-config:create'},
      guard: () => this.assertScope(),
      inputFields: AGENT_CREATE_INPUTS,
      createKey: () => crypto.randomUUID(),
      submit: row => this.submitCreate(row),
      verify: () => Promise.reject(new AiAgentConfigResultUnknownError('缺少可信Agent ID，创建结果待核验')),
      isUnconfirmed: error => error instanceof AiAgentConfigResultUnknownError,
    })
    bindDataSetReadonlyCommandQuery(configuration, {
      resource: {resourceType: 'file', resourceId: 'ai-agent-config:read'},
      guard: () => this.assertScope(),
      loadRows: view => this.readConfiguration(view),
    })
  }

  private createView(tableName: string, columns: DataColumn[], resourceId: string): DataView {
    const table = this.#dataSet.addTable(tableName, columns)
    table.resourceType = 'file'
    table.resourceId = resourceId
    const view = this.#dataSet.getView(tableName, 'default')
    if (view === undefined) throw new Error(`Agent配置DataView缺失: ${tableName}`)
    return view
  }

  private assertScope(): void {
    this.#guard()
    if (this.#dataSet.destroyed) throw new Error('Agent配置DataSet已销毁')
  }

  private async request(command: AgentConfigRequest): Promise<unknown> {
    this.assertScope()
    const result = await this.#client.requestResult({path: command.path, method: command.method, retry: 0, preserveHttpError: true,
      ...(command.data === undefined ? {} : {data: command.data}), ...(command.params === undefined ? {} : {params: command.params})})
    this.assertScope()
    return result
  }

  private async submitCreate(row: DataRow): Promise<DataRow> {
    if (this.#createInFlight) throw new Error('Agent配置创建命令已有请求正在提交')
    this.assertScope()
    const payload = createPayload(row)
    this.#createInFlight = true
    try {
      let result: unknown
      try { result = await this.request({path: '/api/ai-agent/create', method: 'POST', data: payload}) }
      catch (error) {
        if (isExplicitFailure(error)) throw error
        throw toUnknown(error, 'Agent配置创建结果未知，待核验')
      }
      try {
        return {operationId: row['operationId'], agentId: requiredText(result, '正式创建回执ID')}
      } catch (error) { throw toUnknown(error, 'Agent配置创建回执无效，结果待核验') }
    } finally { this.#createInFlight = false }
  }

  private async readConfiguration(view: DataView): Promise<readonly DataRow[]> {
    const agentId = view.queryContext['agentId']
    if (typeof agentId !== 'string' || agentId.trim() === '') return []
    this.assertScope()
    const raw = await this.request({path: '/api/ai-agent/get', method: 'GET', params: {id: agentId}})
    if (view.queryContext['agentId'] !== agentId) throw new Error('Agent配置读取目标已改变，旧结果已失效')
    return [readAgentConfig(raw, agentId)]
  }
}
