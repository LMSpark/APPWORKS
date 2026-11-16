/**
 * @module app:lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-client
 * 职责：追加办理人候选及添加适配（GetExeUsers / FlowAddReceiveUser）；撤回复用原审批命令适配。
 * 边界：经 lowcode HTTP 与正式执行域请求；列表查询优先消费 DataView 行筛选。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {isRecord} from '@spark-appworks/spark-utils'
import {requestFlowResult} from '../flow-run-page/flow-http'
import {
  normalizeFlowAppendUserContext,
  type FlowAppendUserContext,
} from './flow-append-user-records'

export type FlowAppendUserExecUserCandidate = Readonly<{
  UserId: string
  UserName: string
}>

export type FlowAppendUserExecConfig = Readonly<{
  nodeId: string
  maxNum: number
  minNum: number
  allowChange: string
  userList: readonly FlowAppendUserExecUserCandidate[]
}>

export type FlowAppendUserRequestScope = Readonly<{
  token: string
  headers: Readonly<Record<string, string>>
}>

export type FlowAppendUserClientOptions = Readonly<{
  http: HttpClientBase
  scenarioId: string
  readScope: () => FlowAppendUserRequestScope
  assertCurrent?: () => void
}>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function firstTextByKeys(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const text = normalizeText(record[key])
    if (text) return text
  }
  return ''
}

function normalizeUserCandidate(raw: unknown): FlowAppendUserExecUserCandidate | null {
  if (!isRecord(raw)) return null
  const userId = firstTextByKeys(raw, ['UserId', 'userId', 'userid', 'rowid'])
  if (!userId) return null
  return {UserId: userId, UserName: firstTextByKeys(raw, ['UserName', 'userName', 'username', 'NAME'])}
}

function normalizeExecConfig(raw: unknown): FlowAppendUserExecConfig | null {
  if (!isRecord(raw)) return null
  const userListRaw = raw['userList'] ?? raw['UserList'] ?? raw['users']
  const userList: FlowAppendUserExecUserCandidate[] = []
  if (Array.isArray(userListRaw)) {
    for (const entry of userListRaw) {
      const candidate = normalizeUserCandidate(entry)
      if (candidate) userList.push(candidate)
    }
  }
  return {
    nodeId: firstTextByKeys(raw, ['nodeId', 'NodeId', 'nodeID']),
    maxNum: Number(raw['maxNum'] ?? raw['MaxNum'] ?? 0),
    minNum: Number(raw['minNum'] ?? raw['MinNum'] ?? 0),
    allowChange: firstTextByKeys(raw, ['allowChange', 'AllowChange']) || '1',
    userList,
  }
}

export class FlowAppendUserClient {
  readonly #options: FlowAppendUserClientOptions
  readonly #scopeToken: string

  public constructor(options: FlowAppendUserClientOptions) {
    this.#options = options
    this.#scopeToken = options.readScope().token
    if (!this.#scopeToken.trim()) throw new Error('追加办理缺少登录身份')
  }

  #guard(): FlowAppendUserRequestScope {
    this.#options.assertCurrent?.()
    const scope = this.#options.readScope()
    if (scope.token !== this.#scopeToken) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 追加办理执行域已改变')
    const scenarioId = this.#options.scenarioId.trim()
    if (!scenarioId || !scope.headers['X-AppId']?.trim()) throw new Error('追加办理缺少场景或应用身份')
    return scope
  }

  async getExecutionUsers(
    context: Partial<FlowAppendUserContext> | null | undefined,
    isAdd = false,
  ): Promise<readonly FlowAppendUserExecConfig[]> {
    const normalized = normalizeFlowAppendUserContext(context)
    if (!normalized.WFOBJID || !normalized.SendNodeModelId || !normalized.ReceiveNodeModelId) return []
    const scope = this.#guard()
    const headers = {...scope.headers, 'X-FormKey': this.#options.scenarioId.trim()}
    const value = await requestFlowResult(this.#options.http, {
      method: 'GET',
      path: '/api/Flow/GetExeUsers',
      params: {
        wfId: normalized.WFOBJID,
        upNodeId: normalized.SendNodeModelId,
        nodeId: normalized.ReceiveNodeModelId,
        isAdd: String(isAdd),
      },
      headers,
    })
    this.#options.assertCurrent?.()
    if (!Array.isArray(value)) throw new Error('GetExeUsers 结果必须是数组')
    const configs: FlowAppendUserExecConfig[] = []
    for (const entry of value) {
      const config = normalizeExecConfig(entry)
      if (config) configs.push(config)
    }
    return configs
  }

  async addReceiveUsers(
    context: Partial<FlowAppendUserContext> | null | undefined,
    receiveUserList: readonly string[],
  ): Promise<void> {
    const normalized = normalizeFlowAppendUserContext(context)
    if (!normalized.rowid || !normalized.WFOBJID) throw new Error('追加办理缺少步骤或流程实例身份')
    const scope = this.#guard()
    const headers = {...scope.headers, 'X-FormKey': this.#options.scenarioId.trim()}
    await requestFlowResult(this.#options.http, {
      method: 'POST',
      path: '/api/Flow/FlowAddReceiveUser',
      params: {stepId: normalized.rowid, wfId: normalized.WFOBJID},
      data: [...receiveUserList],
      headers,
    })
    this.#options.assertCurrent?.()
  }

}

export function createFlowAppendUserClient(options: FlowAppendUserClientOptions): FlowAppendUserClient {
  return new FlowAppendUserClient(options)
}
