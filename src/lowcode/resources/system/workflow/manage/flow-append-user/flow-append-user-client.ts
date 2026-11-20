/**
 * @module app:lowcode/resources/system/workflow/manage/flow-append-user/flow-append-user-client
 * 职责：追加办理人候选及添加适配（GetExeUsers / FlowAddReceiveUser）；撤回复用原审批命令适配。
 * 边界：经 lowcode HTTP 与正式执行域请求；列表查询优先消费 DataView 行筛选。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {requestFlowResult, requestFlowOperationResult} from '../flow-run-page/flow-http'
import {
  normalizeFlowAppendUserContext,
  type FlowAppendUserContext,
} from './flow-append-user-records'

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
  ): Promise<readonly unknown[]> {
    const normalized = normalizeFlowAppendUserContext(context)
    if (!normalized.WFOBJID || !normalized.SendNodeModelId || !normalized.ReceiveNodeModelId) throw Error('追加候选缺少原流程关系')
    const scope = this.#guard()
    const headers = {...scope.headers, 'X-FormKey': this.#options.scenarioId.trim()}
    const value = await requestFlowResult(this.#options.http, {
      method: 'GET',
      path: '/api/Flow/GetExeUsers',
      params: {
        wfId: normalized.WFOBJID,
        upNodeId: normalized.SendNodeModelId,
        nodeId: normalized.ReceiveNodeModelId,
        isAdd: 'true',
      },
      headers,
    })
    this.#options.assertCurrent?.()
    if (!Array.isArray(value)) throw new Error('GetExeUsers 结果必须是数组')
    const rows: readonly unknown[] = value
    return rows
  }

  async addReceiveUsers(
    context: Partial<FlowAppendUserContext> | null | undefined,
    receiveUserList: readonly string[],
  ): Promise<void> {
    const normalized = normalizeFlowAppendUserContext(context)
    if (!normalized.rowid || !normalized.WFOBJID) throw new Error('追加办理缺少步骤或流程实例身份')
    const scope = this.#guard()
    const headers = {...scope.headers, 'X-FormKey': this.#options.scenarioId.trim()}
    await requestFlowOperationResult(this.#options.http, {
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
