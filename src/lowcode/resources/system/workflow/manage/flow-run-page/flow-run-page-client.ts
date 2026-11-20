/**
 * @module app:lowcode/resources/system/workflow/manage/flow-run-page/flow-run-page-client
 * 职责：流程办理 HTTP 命令（选项、提交、退回发起人）。
 */
import type {HttpClientBase} from '@spark-appworks/spark-utils'
import {isRecord} from '@spark-appworks/spark-utils'
import {requestFlowResult, requestFlowOperationResult, type FlowRequestScope} from './flow-http'

export type FlowRunPageClientOptions = Readonly<{
  http: HttpClientBase
  scenarioId: string
  readScope: () => FlowRequestScope
  assertCurrent?: () => void
}>

export type FlowRunHandleOptionParams = Readonly<{
  modelId?: string
  stepId?: string
  busRowId?: string
  formid?: string
}>

export type FlowRunSubmitNode = Readonly<{
  NodeId: string
  ExecUserList?: readonly string[]
}>

export type FlowRunSubmitParams = Readonly<{
  type?: string
  nextNode?: readonly FlowRunSubmitNode[]
  flowId: string
  formKey?: string
  formUrl?: string
  formParams?: string
  busRowid?: string
  curStepId?: string
  flowObjId?: string
  isReturn?: boolean
  idea?: string
  notifyType?: string
}>

export type FlowRunBackParams = Readonly<{
  flowObjId: string
  curStepId: string
  nodeId?: string
  idea?: string
}>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

export class FlowRunPageClient {
  readonly #options: FlowRunPageClientOptions
  readonly #scopeToken: string

  public constructor(options: FlowRunPageClientOptions) {
    this.#options = options
    this.#scopeToken = options.readScope().token
    if (!this.#scopeToken.trim()) throw new Error('流程办理缺少登录身份')
  }

  #guard(): FlowRequestScope {
    this.#options.assertCurrent?.()
    const scope = this.#options.readScope()
    if (scope.token !== this.#scopeToken) throw new Error('SPARK_EXECUTION_SCOPE_STALE: 流程办理执行域已改变')
    return scope
  }

  #headers(scope: FlowRequestScope): Readonly<Record<string, string>> {
    return {...scope.headers, 'X-FormKey': this.#options.scenarioId.trim()}
  }

  async getHandleOptionData(params: FlowRunHandleOptionParams = {}): Promise<Record<string, unknown>> {
    const scope = this.#guard()
    const value = await requestFlowResult(this.#options.http, {
      method: 'GET',
      path: '/api/Flow/GetOptionButtonHandleUserOptionData',
      params: {
        modelId: normalizeText(params.modelId),
        stepId: normalizeText(params.stepId),
        busRowId: normalizeText(params.busRowId),
        formid: normalizeText(params.formid),
      },
      headers: this.#headers(scope),
    })
    this.#options.assertCurrent?.()
    return isRecord(value) ? value : {}
  }

  async submitOrStart(params: FlowRunSubmitParams): Promise<void> {
    const scope = this.#guard()
    await requestFlowOperationResult(this.#options.http, {
      method: 'POST',
      path: '/api/Flow/FlowSubmitOrStart',
      data: {
        type: normalizeText(params.type),
        nextNode: params.nextNode ?? [],
        flowId: normalizeText(params.flowId),
        formKey: normalizeText(params.formKey),
        formUrl: normalizeText(params.formUrl),
        formParams: normalizeText(params.formParams),
        busRowid: normalizeText(params.busRowid),
        curStepId: normalizeText(params.curStepId),
        flowObjId: normalizeText(params.flowObjId),
        isReturn: params.isReturn === true,
        Idea: normalizeText(params.idea),
        notifyType: normalizeText(params.notifyType),
      },
      headers: this.#headers(scope),
    })
    this.#options.assertCurrent?.()
  }

  async backByHistory(params: FlowRunBackParams): Promise<void> {
    const scope = this.#guard()
    await requestFlowOperationResult(this.#options.http, {
      method: 'POST',
      path: '/api/Flow/FlowBack',
      data: {
        flowObjId: normalizeText(params.flowObjId),
        curStepId: normalizeText(params.curStepId),
        Idea: normalizeText(params.idea),
      },
      headers: this.#headers(scope),
    })
    this.#options.assertCurrent?.()
  }

  async forceBack(params: FlowRunBackParams): Promise<void> {
    const scope = this.#guard()
    const nodeId = normalizeText(params.nodeId)
    if (!nodeId) throw new Error('强制退回缺少目标节点')
    await requestFlowOperationResult(this.#options.http, {
      method: 'POST',
      path: '/api/Flow/FlowForceBack',
      data: {
        flowObjId: normalizeText(params.flowObjId),
        curStepId: normalizeText(params.curStepId),
        nodeId,
        Idea: normalizeText(params.idea),
      },
      headers: this.#headers(scope),
    })
    this.#options.assertCurrent?.()
  }

  async rejectToCreator(params: FlowRunBackParams): Promise<void> {
    const scope = this.#guard()
    await requestFlowOperationResult(this.#options.http, {
      method: 'POST',
      path: '/api/Flow/FlowToCreator',
      data: {
        flowObjId: normalizeText(params.flowObjId),
        curStepId: normalizeText(params.curStepId),
        Idea: normalizeText(params.idea),
      },
      headers: this.#headers(scope),
    })
    this.#options.assertCurrent?.()
  }

  async canAutoSubmitAfter(curStepId: string): Promise<unknown> {
    const stepId = normalizeText(curStepId)
    if (!stepId) throw new Error('自动提交判断缺少步骤 ID')
    const scope = this.#guard()
    const value = await requestFlowResult(this.#options.http, {
      method: 'POST',
      path: '/api/Flow/CanAutoSubmitAfter',
      data: {curStepId: stepId},
      headers: this.#headers(scope),
    })
    this.#options.assertCurrent?.()
    return value
  }

  async revokeCurrentStep(flowObjectId: string, curStepId: string): Promise<void> {
    const wfid = normalizeText(flowObjectId)
    const stepId = normalizeText(curStepId)
    if (!wfid || !stepId) throw new Error('撤回缺少流程实例或步骤 ID')
    const scope = this.#guard()
    await requestFlowOperationResult(this.#options.http, {
      method: 'POST',
      path: '/api/Flow/FlowRevoke',
      params: {wfid, curStepID: stepId},
      headers: this.#headers(scope),
    })
    this.#options.assertCurrent?.()
  }

  /** GET /api/Flow/GetStepHistory；query 合同以实服为准，当前登记 wfId。 */
  async fetchStepHistory(flowObjectId: string): Promise<unknown> {
    const wfId = normalizeText(flowObjectId)
    if (!wfId) throw new Error('步骤历史缺少流程实例 ID')
    const scope = this.#guard()
    const value = await requestFlowResult(this.#options.http, {
      method: 'GET',
      path: '/api/Flow/GetStepHistory',
      params: {wfId},
      headers: this.#headers(scope),
    })
    this.#options.assertCurrent?.()
    return value
  }
}

export function createFlowRunPageClient(options: FlowRunPageClientOptions): FlowRunPageClient {
  return new FlowRunPageClient(options)
}
