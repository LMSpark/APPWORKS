/**
 * @module @spark-appworks/spark-lowcode-api:realtime/ai-turn-draft-runner
 * 职责：在同一 DataSet 的 AiTurnResource 四个语义 DataView 上，按“核 Agent→暂存创建命令→saveChanges→读回轮次终态”取得一次 assistantDraft 文本。
 * 边界：只经 DataView/DataSet 提交与查询，不直连 HTTP；不解析草稿、不写业务数据。创建回执未知时保留原命令，不重放；取消只发正式取消命令，不代表已停止。
 * AI用途：页面需要“AI 生成 → 严格校验 → 预览 → 用户确认后写入”而非批量追加候选行时，用本运行器取得草稿，再由页面领域解析与确认。
 */
import type {DataSet, DataView} from '@spark-appworks/spark-data'

import type {AiTurnResource} from './ai-turn-resource.js'

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])
const MAX_MESSAGE = 100000

/** 构造输入：已在 dataSet 上装配的 AiTurnResource 与正式 Agent。 */
export type AiTurnDraftRunnerInput = Readonly<{
  /** 拥有四个轮次视图的当前运行 DataSet。 */
  dataSet: DataSet
  /** 同一 dataSet 上已装配的轮次资源。 */
  turnResource: AiTurnResource
  /** 当前租户配置的正式 Agent ID；每次运行前在 Agent 目录中核对。 */
  agentId: string
  /** 两次轮次状态读回间隔（毫秒），默认 1000。 */
  pollIntervalMs?: number
  /** 最长等待终态时间（毫秒），默认 180000；超时会发出取消命令。 */
  timeoutMs?: number
}>

function selected(view: DataView) { return {views: [{tableName: view.tableName, viewId: view.viewId}]} }

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('AI生成已取消')); return }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(timer); reject(new Error('AI生成已取消')) }
    signal?.addEventListener('abort', onAbort, {once: true})
  })
}

/** 单实例串行；一次 run 对应一个正式轮次。 */
export class AiTurnDraftRunner {
  readonly #dataSet: DataSet
  readonly #turns: AiTurnResource
  readonly #agentId: string
  readonly #interval: number
  readonly #timeout: number
  #busy = false

  /** 校验轮次视图属于 dataSet 且 Agent 非空；不发请求。 */
  public constructor(input: AiTurnDraftRunnerInput) {
    if (!input.agentId.trim()) throw new Error('AI生成缺少正式Agent ID')
    const views = [input.turnResource.agents, input.turnResource.requests, input.turnResource.turns, input.turnResource.cancellations]
    if (input.dataSet.destroyed || views.some(view => input.dataSet.getView(view.tableName, view.viewId) !== view)) {
      throw new Error('AiTurnResource必须复用当前DataSet中的四个正式轮次视图')
    }
    this.#dataSet = input.dataSet
    this.#turns = input.turnResource
    this.#agentId = input.agentId
    this.#interval = input.pollIntervalMs ?? 1000
    this.#timeout = input.timeoutMs ?? 180000
  }

  /** 是否正在运行一个轮次。 */
  public get busy(): boolean { return this.#busy }

  /** 是否有结果未知、保留原捕获的创建或取消命令。 */
  public get hasUnconfirmedSave(): boolean { return this.#turns.requests.hasUnconfirmedSave || this.#turns.cancellations.hasUnconfirmedSave }

  /**
   * 创建一个轮次并等待终态，返回完成的 assistantDraft 原文。
   * @param message 发送给 Agent 的完整用户消息（≤100000 字符）。
   * @param signal 中止后对已知轮次发正式取消命令并以“AI生成已取消”拒绝。
   * @throws 轮次 FAILED/CANCELLED、草稿为空、超时、未知回执或作用域失效。
   */
  public async run(message: string, signal?: AbortSignal): Promise<string> {
    if (this.#busy) throw new Error('AI生成正在进行')
    if (this.hasUnconfirmedSave) throw new Error('上一轮AI命令结果待核验，原请求已保留且不会重发')
    if (!message.trim()) throw new Error('AI生成消息不能为空')
    if (message.length > MAX_MESSAGE) throw new Error('AI生成消息不能超过100000字符')
    this.#busy = true
    let turnId: string | undefined
    try {
      await this.#turns.agents.refresh()
      if (!this.#turns.agents.rows.some(row => row['id'] === this.#agentId)) throw new Error('当前租户的正式Agent目录不包含已配置Agent')
      if (signal?.aborted) throw new Error('AI生成已取消')
      await this.#turns.requests.refresh()
      const staged = await this.#turns.requests.addRow({agentId: this.#agentId, message})
      const key: unknown = Reflect.get(staged, 'idempotencyKey')
      const saved = await this.#dataSet.saveChanges(selected(this.#turns.requests))
      if (!saved.success) throw saved.error ?? new Error(saved.message ?? 'AI轮次创建命令未确认')
      if (typeof key !== 'string' || !key) throw new Error('AI轮次创建未返回本地命令身份')
      const request = this.#turns.requests.rows.find(row => row['idempotencyKey'] === key)
      if (typeof request?.['turnId'] !== 'string' || !request['turnId']) throw new Error('AI轮次创建未返回正式turnId')
      turnId = request['turnId']
      const conversationId = request['conversationId']
      const deadline = Date.now() + this.#timeout
      for (;;) {
        if (signal?.aborted) throw new Error('AI生成已取消')
        this.#turns.turns.queryContext = {turnId}
        await this.#turns.turns.refresh()
        const turn = this.#turns.turns.rows.find(row => row['id'] === turnId)
        if (turn === undefined) throw new Error('AI轮次正式状态没有返回当前turnId')
        if (turn['agentId'] !== this.#agentId || turn['conversationId'] !== conversationId) throw new Error('AI轮次结果与当前Agent或会话身份不匹配')
        const status = String(turn['status'])
        if (TERMINAL.has(status)) {
          turnId = undefined
          if (status !== 'COMPLETED') throw new Error(typeof turn['errorMessage'] === 'string' && turn['errorMessage'] ? turn['errorMessage'] : `AI轮次已结束: ${status}`)
          const draft = turn['assistantDraft']
          if (typeof draft !== 'string' || !draft.trim()) throw new Error('AI轮次完成但没有返回内容')
          return draft
        }
        if (Date.now() >= deadline) throw new Error('AI生成超时')
        await wait(this.#interval, signal)
      }
    } catch (error) {
      if (turnId !== undefined) {
        try { await this.cancel(turnId) } catch (cancelError) {
          throw new Error(`${error instanceof Error ? error.message : String(error)}；取消命令未确认：${cancelError instanceof Error ? cancelError.message : String(cancelError)}`, {cause: error})
        }
      }
      throw error
    } finally { this.#busy = false }
  }

  private async cancel(turnId: string): Promise<void> {
    await this.#turns.cancellations.refresh()
    await this.#turns.cancellations.addRow({turnId})
    const saved = await this.#dataSet.saveChanges(selected(this.#turns.cancellations))
    if (!saved.success) throw saved.error ?? new Error(saved.message ?? 'AI轮次取消命令未确认')
  }
}
