/**
 * @module @spark-appworks/spark-lowcode-api:realtime/data-entry/ai-data-entry-session
 * 职责：持有单个真实目标 DataView 的暂存式 AI 批量录入会话，协调输入、正式 Agent 轮次、候选查询、确认与安全释放。
 * 边界：轮次命令沿同 DataSet 的 AiTurnResource/DataView 提交；确认只向原目标 DataView 暂存新增行，不保存业务数据，也不自建权限或字段真源。
 * AI用途：页面或标准组件需要创建、查询、停止并确认一批 AI 候选时，使用本会话公共合同；组件卸载只应 detach 订阅，不得销毁仍有待核验状态的 owner。
 */
import {RequestState, bindDataSetReadonlyCommandQuery, ensureDataSetStaticInputTable,
  type DataColumn, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'

import type {AiTurnResource} from '../ai-turn-resource.js'
import {deriveAiDataEntryFields, validateAiDataEntryValue, type AiDataEntryField} from './ai-data-entry-fields.js'

const INPUT_TABLE = 'AiDataEntryInput'
const CANDIDATE_TABLE = 'AiDataEntryCandidates'
const MAX_ENTRIES = 200
const MAX_DRAFT_BYTES = 200 * 1024
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

/** Synchronous domain preflight and optional asynchronous append hooks bound to the exact target view. */
export type AiDataEntryAdapter = Readonly<{
  /** Return only business context needed by this batch; this callback must not perform I/O or return hidden data. */
  readContext(targetView: DataView): unknown
  /** Validate domain rules for the whole batch before any target row is added. Must be synchronous and side-effect free. */
  validateBatch(targetView: DataView, rows: readonly DataRow[]): void
  /** Append the prevalidated batch to the same target DataView. Partial additions remain in its original draft. */
  appendBatch(targetView: DataView, rows: readonly DataRow[]): Promise<void>
}>

/** Dependencies for one session; the caller supplies the existing AiTurnResource for this same DataSet. */
export type AiDataEntrySessionInput = Readonly<{
  /** The current runtime DataSet that owns the target and shared AI turn views. */
  dataSet: DataSet
  /** The staged business DataView that will receive confirmed rows. */
  targetView: DataView
  /** The already-created turn owner whose four views must belong to dataSet. */
  turnResource: AiTurnResource
  /** The configured formal Agent ID, validated against the existing Agent catalog before each create. */
  agentId: string
  /** Optional narrow synchronous domain context/preflight and asynchronous append adapter bound to targetView. */
  adapter?: AiDataEntryAdapter
}>

type SessionCapture = Readonly<{
  dataSet: DataSet
  table: NonNullable<DataView['dataTable']>
  scenarioId: string | undefined
  modelIdentity: string
  queryIdentity: string
  schemaIdentity: string
  adapterIdentity: string
  businessContext: DataRow | undefined
  fields: readonly AiDataEntryField[]
}>

function isRecord(value: unknown): value is DataRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Reflect.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function stableJson(value: unknown, ancestors = new WeakSet<object>()): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('AI录入配置含非有限数字')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new Error('AI录入配置不能包含循环引用')
    ancestors.add(value)
    const result = `[${value.map(item => stableJson(item, ancestors)).join(',')}]`
    ancestors.delete(value)
    return result
  }
  if (typeof value === 'object') {
    if (value instanceof Date) return JSON.stringify(value.toISOString())
    const prototype = Reflect.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) throw new Error('AI录入配置必须是普通JSON对象')
    if (ancestors.has(value)) throw new Error('AI录入配置不能包含循环引用')
    ancestors.add(value)
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    const result = `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item, ancestors)}`).join(',')}}`
    ancestors.delete(value)
    return result
  }
  if (value === undefined) return 'null'
  throw new Error('AI录入配置含不支持的值')
}

function uniqueColumnName(base: string, columns: readonly DataColumn[]): string {
  const names = new Set(columns.map(column => column.name))
  let candidate = base
  let suffix = 0
  while (names.has(candidate)) {
    suffix++
    candidate = `${base}_${suffix}`
  }
  return candidate
}

function candidateColumn(source: DataColumn): DataColumn {
  return {
    name: source.name, type: source.type,
    label: source.label ?? source.name,
    ...(source.allowDBNull === undefined ? {} : {allowDBNull: source.allowDBNull}),
    ...(source.required === undefined ? {} : {required: source.required}),
    ...(source.minLength === undefined ? {} : {minLength: source.minLength}),
    ...(source.maxLength === undefined ? {} : {maxLength: source.maxLength}),
    ...(source.min === undefined ? {} : {min: source.min}),
    ...(source.max === undefined ? {} : {max: source.max}),
    ...(source.pattern === undefined ? {} : {pattern: source.pattern}),
    ...(source.trim === undefined ? {} : {trim: source.trim}),
    ...(source.enumOptions === undefined ? {} : {enumOptions: source.enumOptions}),
  }
}

function selectedView(view: DataView) { return {views: [{tableName: view.tableName, viewId: view.viewId}]} }

/** A single active staged batch-entry conversation; its target DataView never changes after construction. */
export class AiDataEntrySession {
  /** Immutable business target; all confirmed rows are staged through this exact DataView. */
  readonly targetView: DataView
  /** One-row static-data input view; users edit the businessPrompt field through the standard DataView editor. */
  readonly input: DataView
  /** Read-only query view derived from the currently verified formal turn and the current target schema. */
  readonly candidates: DataView
  /** Shared formal turn DataView used for status, completion and cancellation readback. */
  readonly turn: DataView

  readonly #dataSet: DataSet
  readonly #turns: AiTurnResource
  readonly #agentId: string
  readonly #adapter: AiDataEntryAdapter | undefined
  readonly #candidateKey: string
  readonly #unsubscribe: Array<() => void> = []
  readonly #listeners = new Set<() => void>()
  #candidateFields: string[] = []
  #capture: SessionCapture | undefined
  #turnId: string | undefined
  #conversationId: string | undefined
  #busy = false
  #disposed = false
  #consumed = true
  #lastError: Error | null = null

  /**
   * Binds one session to an existing DataSet, target view and shared turn owner.
   * It rejects immediate targets and resource collisions before creating either temporary table.
   */
  public constructor(input: AiDataEntrySessionInput) {
    this.#dataSet = input.dataSet
    this.targetView = input.targetView
    this.#turns = input.turnResource
    this.turn = input.turnResource.turns
    this.#agentId = input.agentId
    this.#adapter = input.adapter

    if (!input.agentId.trim()) throw new Error('AI录入缺少正式Agent ID')
    if (input.dataSet.destroyed || input.dataSet.getView(input.targetView.tableName, input.targetView.viewId) !== input.targetView) {
      throw new Error('AI录入目标DataView不属于当前DataSet')
    }
    if (input.targetView.commitMode !== 'staged') throw new Error('AI批量新增要求目标DataView使用staged模式')
    const turnViews = [input.turnResource.agents, input.turnResource.requests, input.turnResource.turns, input.turnResource.cancellations]
    if (turnViews.some(view => input.dataSet.getView(view.tableName, view.viewId) !== view)) {
      throw new Error('AiTurnResource必须复用当前DataSet中的四个正式轮次视图')
    }
    const conflict = [INPUT_TABLE, CANDIDATE_TABLE].find(name => input.dataSet.getTable(name) !== undefined)
    if (conflict !== undefined) throw new Error(`AI录入临时表名冲突: ${conflict}`)

    const targetColumns = input.targetView.columns
    this.#candidateKey = uniqueColumnName('__aiEntryCandidateKey', targetColumns)
    const inputKey = uniqueColumnName('__aiEntryInputKey', targetColumns)
    ensureDataSetStaticInputTable(input.dataSet, INPUT_TABLE, [
      {name: inputKey, primary: true}, {name: 'businessPrompt'},
    ])
    try {
      const candidateColumns: DataColumn[] = [
        {name: this.#candidateKey, type: 'string', isPrimaryKey: true},
        ...deriveAiDataEntryFields(input.targetView).map(field => {
          const source = input.targetView.columns.find(column => column.name === field.name)
          if (source === undefined) throw new Error(`AI录入字段定义已变化: ${field.name}`)
          return candidateColumn(source)
        }),
      ]
      input.dataSet.addTable(CANDIDATE_TABLE, candidateColumns)
    } catch (error) {
      input.dataSet.removeTable(INPUT_TABLE)
      throw error
    }

    const inputView = input.dataSet.getView(INPUT_TABLE, 'default')
    const candidateView = input.dataSet.getView(CANDIDATE_TABLE, 'default')
    if (inputView === undefined || candidateView === undefined) {
      if (input.dataSet.getTable(INPUT_TABLE) !== undefined) input.dataSet.removeTable(INPUT_TABLE)
      if (input.dataSet.getTable(CANDIDATE_TABLE) !== undefined) input.dataSet.removeTable(CANDIDATE_TABLE)
      throw new Error('AI录入临时DataView装配不完整')
    }
    inputView.commitMode = 'staged'
    inputView.appendRow({[inputKey]: 'input', businessPrompt: ''})
    inputView.setCurrentRowById('input')
    this.input = inputView
    this.candidates = candidateView
    this.#candidateFields = deriveAiDataEntryFields(input.targetView).map(field => field.name)

    const resourceId = `ai-data-entry-candidates:${input.dataSet.scenarioId ?? ''}:${input.targetView.tableName}:${input.targetView.viewId}`
    const candidateTable = input.dataSet.getTable(CANDIDATE_TABLE)
    if (candidateTable === undefined) throw new Error('AI录入候选DataTable装配失败')
    candidateTable.resourceType = 'file'
    candidateTable.resourceId = resourceId
    bindDataSetReadonlyCommandQuery(candidateView, {
      resource: {resourceType: 'file', resourceId},
      guard: () => this.assertUsable(),
      loadRows: async () => this.readCandidateRows(),
    })
    const observedViews = [inputView, candidateView, input.targetView, ...turnViews]
    const viewEvents = ['rowsChanged', 'editingChanged', 'editingFieldChanged', 'cleared', 'configChanged',
      'requestStateChanged', 'requestCompleted', 'mutatingChanged'] as const
    for (const view of observedViews) for (const event of viewEvents) {
      const listener = () => this.emitChange()
      view.events.on(event, listener)
      this.#unsubscribe.push(() => view.events.off(event, listener))
    }
  }

  /** The turn id acknowledged by the current batch, when available. */
  public get turnId(): string | undefined { return this.#turnId }
  /** Status read only from the current, valid formal turns DataView row. */
  public get status(): string | undefined {
    const value = this.currentTurnRow()?.['status']
    return typeof value === 'string' ? value : undefined
  }
  /** Current async command/query activity. */
  public get busy(): boolean { return this.#busy }
  /** Whether unresolved command captures must keep the original turn owner alive. */
  public get hasUnconfirmedSave(): boolean { return this.#turns.requests.hasUnconfirmedSave || this.#turns.cancellations.hasUnconfirmedSave }
  /** Whether the original host should retain this session because an intent or result is unresolved. */
  public get blocksWorkspace(): boolean {
    return this.#busy || this.hasUnconfirmedSave || this.#isNonterminal()
  }
  /** Any input, candidate, command or error that the host must retain for user resolution. */
  public get pending(): boolean {
    return this.blocksWorkspace || this.#hasPendingCommandChanges() || this.input.hasEditingChanges()
      || this.input.dirtyTracking.hasPendingChanges() || this.candidates.rows.length > 0
      || this.#lastError !== null || (this.#capture !== undefined && !this.#consumed)
  }
  /** Last local error, if a completion could not be parsed or validated. */
  public get error(): string {
    if (this.#lastError !== null) return this.#lastError.message
    return this.#turns.turns.loadingError?.message ?? this.candidates.loadingError?.message
      ?? this.#turns.requests.loadingError?.message ?? this.#turns.cancellations.loadingError?.message ?? ''
  }
  /** Whether a new request can be started from the current input and formal target snapshot. */
  public get canStart(): boolean {
    if (this.#disposed || this.#busy || this.#isNonterminal() || this.hasUnconfirmedSave
      || this.#hasPendingCommandChanges() || this.#lastError !== null || this.candidates.rows.length > 0) return false
    try {
      const capture = this.capture()
      const prompt = this.currentBusinessPrompt()
      return capture.fields.length > 0 && prompt.trim() !== ''
    } catch { return false }
  }
  /** Whether a known turn or unresolved original command can be queried without resubmitting it. */
  public get canRefresh(): boolean {
    return !this.#disposed && !this.#busy && (this.#turnId !== undefined || this.hasUnconfirmedSave)
  }
  /** Whether the formal turn is known and nonterminal, with no cancellation command already outstanding. */
  public get canCancel(): boolean {
    if (this.#disposed || this.#busy || this.#turnId === undefined || !this.#isNonterminal()) return false
    if (this.pendingCancellationForCurrentTurn() === undefined) return false
    return !this.#turns.cancellations.rows.some(row => row['turnId'] === this.#turnId && row['requested'] === true)
  }
  /** Whether the current read-only candidate batch passes the same preflight used by confirm. */
  public get canConfirm(): boolean { return this.confirmationError === '' }
  /** User-facing reason matching canConfirm's fail-closed checks. */
  public get confirmationError(): string {
    if (this.#disposed) return 'AI录入会话已释放'
    if (this.#busy) return 'AI录入命令正在进行'
    if (this.hasUnconfirmedSave) return 'AI轮次命令结果待核验'
    if (this.#hasPendingCommandChanges()) return 'AI轮次命令仍有待处理变更'
    if (this.#turnId === undefined || this.status !== 'COMPLETED') return '请先查询到已完成的AI轮次'
    if (this.#consumed) return '当前AI候选批次已确认或已放弃'
    const capture = this.#capture
    if (capture === undefined) return 'AI录入目标快照缺失'
    try {
      this.#assertTargetIntegrity(capture)
      const rows = this.readCandidateRowsFromView(capture.fields)
      if (rows.length === 0) return '当前没有可确认的AI候选'
      this.preflight(rows, capture.fields)
      this.#adapter?.validateBatch(this.targetView, rows)
      return ''
    } catch (error) { return error instanceof Error ? error.message : String(error) }
  }
  /** Host polling hint based only on formal turn readback or an unresolved original command. */
  public get shouldAutoRefresh(): boolean {
    if (!this.canRefresh || this.#turns.requests.hasUnconfirmedSave || this.#turns.cancellations.hasUnconfirmedSave) return false
    const status = this.status
    return this.#turnId !== undefined && (status === undefined || !TERMINAL_STATUSES.has(status))
  }
  /** Listens to input, candidate, target and shared turn DataView state changes; returns an unsubscribe function. */
  public subscribe(listener: () => void): () => void {
    if (this.#disposed) throw new Error('AI录入会话已释放')
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Starts one independent turn from the current businessPrompt editing overlay in the Input DataView. */
  public async start(): Promise<void> {
    this.assertUsable()
    this.assertNoUnknownCommand()
    if (this.#busy) throw new Error('AI录入会话正忙')
    if (this.#isNonterminal()) throw new Error('当前AI轮次尚未结束')
    if (this.#lastError !== null) throw new Error('请先放弃当前错误候选或输入意图')
    if (this.candidates.rows.length > 0 && !this.#consumed) throw new Error('请先确认或放弃当前候选批次')

    const capture = this.capture()
    if (capture.fields.length === 0) throw new Error('当前视图没有可生成且可写的AI字段')
    const businessPrompt = this.currentBusinessPrompt()
    if (businessPrompt.trim() === '') throw new Error('请输入业务提示')

    this.#busy = true
    this.emitChange()
    this.#lastError = null
    this.#capture = capture
    this.#consumed = false
    this.#turnId = undefined
    this.#conversationId = undefined
    try {
      await this.#turns.agents.refresh()
      this.assertCapture(capture)
      if (!this.#turns.agents.rows.some(row => row['id'] === this.#agentId)) {
        throw new Error('当前租户的正式Agent目录不包含已配置录入Agent')
      }

      const userMessage = JSON.stringify({
        businessPrompt,
        allowedFields: capture.fields,
        ...(capture.businessContext === undefined ? {} : {businessContext: capture.businessContext}),
        maxEntries: MAX_ENTRIES,
      })
      if (new TextEncoder().encode(userMessage).byteLength > MAX_DRAFT_BYTES) throw new Error('AI录入请求超过200KB')
      await this.#turns.requests.refresh()
      this.assertCapture(capture)
      const stagedRequest = await this.#turns.requests.addRow({agentId: this.#agentId, message: userMessage})
      await this.#dataSet.saveChanges(selectedView(this.#turns.requests))
      this.assertUsable()
      const idempotencyKey = isRecord(stagedRequest) ? stagedRequest['idempotencyKey'] : undefined
      if (typeof idempotencyKey !== 'string' || idempotencyKey === '') throw new Error('AI轮次创建未返回本地命令身份')
      const request = this.#turns.requests.rows.find(row => row['idempotencyKey'] === idempotencyKey)
      if (request === undefined) throw new Error('AI轮次创建未返回正式turnId')
      this.#turnId = String(request['turnId'])
      this.#conversationId = typeof request['conversationId'] === 'string' ? request['conversationId'] : undefined
      await this.candidates.refresh()
    } catch (error) {
      this.#lastError = error instanceof Error ? error : new Error(String(error))
      throw error
    } finally { this.#busy = false; this.emitChange() }
  }

  /** Reads the current turn through AiTurnResource and installs a validated completion in the Candidates DataView. */
  public async refresh(): Promise<void> {
    this.assertUsable()
    if (this.#busy) throw new Error('AI录入会话正忙')
    if (!this.canRefresh) throw new Error('当前会话没有可核验命令或可刷新的正式turnId')
    this.#busy = true
    this.emitChange()
    this.#lastError = null
    try {
      if (this.#turns.requests.hasUnconfirmedSave) {
        await this.#dataSet.saveChanges(selectedView(this.#turns.requests))
        const acknowledged = this.#turns.requests.rows.find(row => typeof row['turnId'] === 'string' && row['turnId'] !== '')
        if (this.#turnId === undefined && acknowledged !== undefined) {
          this.#turnId = String(acknowledged['turnId'])
          this.#conversationId = typeof acknowledged['conversationId'] === 'string' ? acknowledged['conversationId'] : undefined
        }
      }
      let cancellationError: unknown
      if (this.#turns.cancellations.hasUnconfirmedSave) {
        try { await this.#dataSet.saveChanges(selectedView(this.#turns.cancellations)) }
        catch (error) { cancellationError = error }
      }
      if (this.#turnId === undefined) throw new Error('未知创建命令没有可用正式turnId，原请求已保留且未重发')
      const turnId = this.#turnId
      this.#turns.turns.queryContext = {turnId}
      await this.#turns.turns.refresh()
      const turn = this.currentTurnRow()
      if (turn === undefined) throw new Error('AI轮次正式状态没有返回当前turnId')
      if (turn['agentId'] !== this.#agentId || turn['conversationId'] !== this.#conversationId) {
        throw new Error('AI轮次结果与当前Agent或会话身份不匹配')
      }
      if (turn['status'] === 'FAILED' || turn['status'] === 'CANCELLED') {
        throw new Error(typeof turn['errorMessage'] === 'string' ? turn['errorMessage'] : `AI轮次已结束: ${String(turn['status'])}`)
      }
      const capture = this.#capture
      if (turn['status'] === 'COMPLETED' && capture !== undefined && this.isCurrentCapture(capture) && !this.#consumed) {
        this.updateCandidateSchema(capture.fields)
      }
      this.candidates.clearAll()
      await this.candidates.refresh()
      if (this.candidates.loadingError !== null) throw this.candidates.loadingError
      if (this.#turns.cancellations.hasUnconfirmedSave && cancellationError !== undefined) throw cancellationError
      if (turn['status'] === 'COMPLETED' && this.candidates.rows.length === 0 && capture !== undefined
        && this.isCurrentCapture(capture) && !this.#consumed) this.#consumed = true
    } catch (error) {
      this.candidates.clearAll()
      this.#lastError = error instanceof Error ? error : new Error(String(error))
      throw error
    } finally { this.#busy = false; this.emitChange() }
  }

  /** Confirms the current batch after a fresh all-row preflight; never saves the target DataView. */
  public async confirm(): Promise<void> {
    this.assertUsable()
    this.assertNoUnknownCommand()
    if (this.#busy) throw new Error('AI录入会话正忙')
    if (this.#isNonterminal()) throw new Error('AI轮次尚未到达可确认终态')
    if (this.#consumed) throw new Error('当前候选批次已经确认或放弃')
    const capture = this.#capture
    if (capture === undefined || this.status !== 'COMPLETED') throw new Error('当前没有已完成且可确认的候选批次')
    const rows = this.readCandidateRowsFromView(capture.fields)
    if (rows.length === 0) throw new Error('当前候选批次为空')
    this.#busy = true
    this.emitChange()
    this.#lastError = null
    try {
      this.#assertTargetIntegrity(capture)
      this.preflight(rows, capture.fields)
      this.#adapter?.validateBatch(this.targetView, rows)
      this.#assertTargetIntegrity(capture)
      this.#consumed = true
      if (this.#adapter !== undefined) await this.#adapter.appendBatch(this.targetView, rows)
      else {
        for (const row of rows) {
          this.#assertTargetIntegrity(capture)
          await this.targetView.addRow(row)
        }
      }
      this.#assertTargetIntegrity(capture)
      this.#consumed = true
      this.input.discardEditingRows()
      this.candidates.clearAll()
      await this.candidates.refresh()
    } catch (error) {
      this.#lastError = error instanceof Error ? error : new Error(String(error))
      throw error
    } finally { this.#busy = false; this.emitChange() }
  }

  /** Sends the existing cancellation command; acknowledgement never implies a terminal remote status. */
  public async cancel(): Promise<void> {
    this.assertUsable()
    if (this.#busy) throw new Error('AI录入会话正忙')
    if (!this.canCancel) throw new Error('当前AI轮次没有可取消的活动请求')
    const pendingCancellation = this.pendingCancellationForCurrentTurn()
    if (pendingCancellation === undefined) throw new Error('当前AI轮次取消命令状态不允许重试')
    this.#busy = true
    this.emitChange()
    try {
      if (pendingCancellation === null) {
        await this.#turns.cancellations.refresh()
        await this.#turns.cancellations.addRow({turnId: this.#turnId})
      }
      await this.#dataSet.saveChanges(selectedView(this.#turns.cancellations))
    } finally { this.#busy = false; this.emitChange() }
  }

  /** Explicitly abandons the local prompt/candidates once no command or remote turn is active. */
  public async discard(): Promise<void> {
    this.assertUsable()
    if (this.hasUnconfirmedSave) throw new Error('AI轮次命令结果待核验，保留原DataView捕获且不能丢弃')
    if (this.#busy || this.#isNonterminal()) throw new Error('活动AI轮次期间不能丢弃输入或候选')
    if (this.#turns.requests.dirtyTracking.hasPendingChanges()) this.#turns.requests.discardPendingChanges()
    if (this.#turns.cancellations.dirtyTracking.hasPendingChanges()) this.#turns.cancellations.discardPendingChanges()
    this.input.discardEditingRows()
    this.#consumed = true
    this.#capture = undefined
    this.#lastError = null
    this.candidates.clearAll()
    await this.candidates.refresh()
    this.emitChange()
  }

  /** Releases only the session-owned temporary tables after all local and remote intents are resolved. */
  public dispose(): void {
    this.assertUsable()
    this.assertNoUnknownCommand()
    if (this.pending) throw new Error('AI录入会话仍有未解决输入、候选或活动轮次')
    this.#dataSet.assertCanRemoveTable(INPUT_TABLE)
    this.#dataSet.assertCanRemoveTable(CANDIDATE_TABLE)
    this.#dataSet.removeTable(INPUT_TABLE)
    this.#dataSet.removeTable(CANDIDATE_TABLE)
    this.#disposed = true
    for (const unsubscribe of this.#unsubscribe.splice(0)) unsubscribe()
    this.#listeners.clear()
  }

  private capture(): SessionCapture {
    this.assertUsable()
    const table = this.targetView.dataTable
    if (table === null || this.targetView.loadingError !== null || this.targetView.refreshPending
      || this.targetView.mutating || this.targetView.hasUnconfirmedSave) {
      throw new Error('目标DataView尚未处于可用查询状态')
    }
    const snapshot = this.targetView.readSnapshot()
    const fields = deriveAiDataEntryFields(this.targetView)
    const modelIdentity = stableJson({tableName: table.tableName, modelBinding: table.modelBinding ?? null,
      resourceType: table.resourceType ?? null, resourceId: table.resourceId ?? null})
    const queryIdentity = stableJson({
      queryContext: this.targetView.queryContext,
      queryConfig: this.targetView.queryConfig,
      fieldProjection: this.targetView.fieldProjection,
      filterExpression: this.targetView.filterExpression,
      sortExpression: this.targetView.sortExpression,
      page: this.targetView.page,
      pageSize: this.targetView.pageSize,
      outputFields: snapshot.fields,
    })
    const schemaIdentity = stableJson(fields)
    const adapterValue = this.#adapter?.readContext(this.targetView)
    let businessContext: DataRow | undefined
    if (adapterValue !== undefined && adapterValue !== null) {
      if (!isRecord(adapterValue)) throw new Error('AI录入业务上下文必须是普通JSON对象')
      businessContext = structuredClone(adapterValue)
    }
    const adapterIdentity = stableJson(businessContext ?? null)
    return {dataSet: this.#dataSet, table, scenarioId: this.#dataSet.scenarioId, modelIdentity,
      queryIdentity, schemaIdentity, adapterIdentity, businessContext, fields}
  }

  private assertCapture(capture: SessionCapture): void {
    this.assertUsable()
    if (this.#dataSet !== capture.dataSet || this.targetView.dataTable !== capture.table
      || this.#dataSet.scenarioId !== capture.scenarioId) throw new Error('AI录入目标身份已改变')
    const current = this.capture()
    if (current.modelIdentity !== capture.modelIdentity || current.queryIdentity !== capture.queryIdentity
      || current.schemaIdentity !== capture.schemaIdentity || current.adapterIdentity !== capture.adapterIdentity) {
      throw new Error('AI录入目标字段、权限、查询或领域上下文已改变')
    }
  }

  private parseCandidateDraft(draft: string, fields: readonly AiDataEntryField[]): readonly DataRow[] {
    if (new TextEncoder().encode(draft).byteLength > MAX_DRAFT_BYTES) throw new Error('AI候选结果超过200KB')
    let parsed: unknown
    try { parsed = JSON.parse(draft) } catch (error) { throw new Error('AI候选结果不是有效JSON', {cause: error}) }
    if (!isRecord(parsed) || Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, 'entries') || !Array.isArray(parsed['entries'])) {
      throw new Error('AI候选结果必须严格使用 {"entries":[...]} 格式')
    }
    const entries = parsed['entries']
    if (entries.length > MAX_ENTRIES) throw new Error('AI候选结果最多200行')
    const names = new Set(fields.map(field => field.name))
    const required = fields.filter(field => field.required)
    const rows = entries.map((entry, index) => {
      if (!isRecord(entry)) throw new Error(`AI候选第${index + 1}行不是普通对象`)
      if (Object.getOwnPropertySymbols(entry).length > 0) throw new Error(`AI候选第${index + 1}行含额外键`)
      for (const key of Object.keys(entry)) if (!names.has(key)) throw new Error(`AI候选第${index + 1}行包含未允许字段 ${key}`)
      for (const field of required) {
        if (!Object.hasOwn(entry, field.name)) throw new Error(`AI候选第${index + 1}行缺少必填字段 ${field.name}`)
      }
      for (const field of fields) {
        if (Object.hasOwn(entry, field.name)) validateAiDataEntryValue(field, entry[field.name])
      }
      const result = this.targetView.validator?.validateColumns(entry, names)
      if (result && !result.valid) throw new Error(`AI候选第${index + 1}行正式字段校验失败: ${result.errors.map(item => item.message).join('; ')}`)
      return entry
    })
    return rows
  }

  private candidateRow(row: DataRow, fields: readonly AiDataEntryField[]): DataRow {
    const result: DataRow = {}
    for (const field of fields) if (Object.hasOwn(row, field.name) && row[field.name] !== undefined) result[field.name] = row[field.name]
    return result
  }

  private preflight(rows: readonly DataRow[], fields: readonly AiDataEntryField[]): void {
    const names = new Set(fields.map(field => field.name))
    for (const [index, row] of rows.entries()) {
      if (!isRecord(row)) throw new Error(`AI候选第${index + 1}行不是普通对象`)
      if (Object.getOwnPropertySymbols(row).length > 0) throw new Error(`AI候选第${index + 1}行含额外键`)
      for (const name of Object.keys(row)) if (!names.has(name)) throw new Error(`AI候选第${index + 1}行包含未允许字段 ${name}`)
      for (const field of fields) {
        if (field.required && (!Object.hasOwn(row, field.name) || row[field.name] === undefined)) {
          throw new Error(`AI候选第${index + 1}行缺少必填字段 ${field.name}`)
        }
        if (Object.hasOwn(row, field.name) && row[field.name] !== undefined) validateAiDataEntryValue(field, row[field.name])
      }
      const validation = this.targetView.validator?.validateColumns(row, names)
      if (validation && !validation.valid) {
        throw new Error(`AI候选第${index + 1}行正式字段校验失败: ${validation.errors.map(item => item.message).join('; ')}`)
      }
    }
  }

  #assertTargetIntegrity(capture: SessionCapture): void {
    this.assertCapture(capture)
    if (this.targetView.addActionState() !== 'enabled') throw new Error('目标DataView当前无表级新增权限')
    for (const field of capture.fields) {
      if (this.targetView.newRowFieldAccess(field.name).write !== 'allowed') {
        throw new Error(`目标DataView当前不允许新增字段 ${field.name}`)
      }
    }
  }

  private updateCandidateSchema(fields: readonly AiDataEntryField[]): void {
    const table = this.#dataSet.getTable(CANDIDATE_TABLE)
    if (table === undefined) throw new Error('AI候选DataTable已释放')
    const nextNames = new Set(fields.map(field => field.name))
    for (const name of this.#candidateFields) if (!nextNames.has(name) && table.columns.some(column => column.name === name)) table.removeColumn(name)
    for (const field of fields) {
      const source = this.targetView.columns.find(column => column.name === field.name)
      if (source === undefined) throw new Error(`AI候选字段已从目标DataView移除: ${field.name}`)
      const next = candidateColumn(source)
      if (table.columns.some(column => column.name === field.name)) table.updateColumn(field.name, next)
      else table.addColumns([next])
    }
    this.#candidateFields = [...nextNames]
  }

  private assertNoUnknownCommand(): void {
    if (this.hasUnconfirmedSave) throw new Error('AI轮次命令结果待核验，保留原DataView捕获且不能重试或释放')
    if (this.#hasPendingCommandChanges()) throw new Error('AI轮次命令仍有本地变更，请先显式放弃或处理')
  }

  private pendingCancellationForCurrentTurn(): DataRow | null | undefined {
    if (this.hasUnconfirmedSave || this.#turns.requests.dirtyTracking.hasPendingChanges()) return undefined
    const view = this.#turns.cancellations
    if (view.hasUnconfirmedSave) return undefined
    const pendingIds = [...view.dirtyTracking.pendingCreateIds]
    if (!view.dirtyTracking.hasPendingChanges()) return pendingIds.length === 0 ? null : undefined
    if (pendingIds.length !== 1) return undefined
    const operationId = pendingIds[0]
    const row = view.rows.find(candidate => candidate[view.primaryKey] === operationId)
    if (row === undefined || row['turnId'] !== this.#turnId || row['requested'] === true) return undefined
    return row
  }

  #hasPendingCommandChanges(): boolean {
    return this.#turns.requests.dirtyTracking.hasPendingChanges()
      || this.#turns.cancellations.dirtyTracking.hasPendingChanges()
  }

  private assertUsable(): void {
    if (this.#disposed) throw new Error('AI录入会话已释放')
    if (this.#dataSet.destroyed || this.#dataSet.getView(this.targetView.tableName, this.targetView.viewId) !== this.targetView) {
      throw new Error('AI录入目标DataSet或DataView已失效')
    }
  }

  #isNonterminal(): boolean {
    if (this.#turnId === undefined) return false
    const status = this.status
    return status === undefined || !TERMINAL_STATUSES.has(status)
  }

  private currentBusinessPrompt(): string {
    const row = this.input.currentRow
    if (row === null) throw new Error('AI录入输入DataView没有当前业务提示行')
    const id = this.input.getPkKey(row)
    if (typeof id !== 'string' && typeof id !== 'number') throw new Error('AI录入输入DataView当前行主键无效')
    if (this.input.fieldAccess(row, 'businessPrompt').read !== 'visible') throw new Error('AI录入业务提示不可读')
    const value = this.input.getEditingRow(id)?.['businessPrompt']
    if (typeof value !== 'string') throw new Error('AI录入业务提示必须是文本')
    return value
  }

  private currentTurnRow(): DataRow | undefined {
    if (this.#turnId === undefined || this.#turns.turns.requestState !== RequestState.Loaded
      || this.#turns.turns.loadingError !== null) return undefined
    const row = this.#turns.turns.rows.find(candidate => candidate['id'] === this.#turnId)
    return row?.['agentId'] === this.#agentId && row['conversationId'] === this.#conversationId ? row : undefined
  }

  private readCandidateRows(): Promise<readonly DataRow[]> {
    this.assertUsable()
    const turn = this.currentTurnRow()
    const capture = this.#capture
    if (turn?.['status'] !== 'COMPLETED' || capture === undefined || this.#consumed
      || !this.isCurrentCapture(capture)) return Promise.resolve([])
    const draft = turn['assistantDraft']
    if (typeof draft !== 'string') throw new Error('AI完成结果缺少assistantDraft')
    const rows = this.parseCandidateDraft(draft, capture.fields)
    return Promise.resolve(rows.map((row, index) => ({[this.#candidateKey]: `candidate-${index + 1}`, ...row})))
  }

  private readCandidateRowsFromView(fields: readonly AiDataEntryField[]): readonly DataRow[] {
    if (this.candidates.requestState !== RequestState.Loaded || this.candidates.loadingError !== null) {
      throw new Error('AI候选预览尚未由只读DataView有效读取')
    }
    return this.candidates.readSnapshot().rows.map(row => this.candidateRow(row, fields))
  }

  private isCurrentCapture(capture: SessionCapture): boolean {
    try { this.assertCapture(capture); return true } catch { return false }
  }

  private emitChange(): void {
    for (const listener of this.#listeners) listener()
  }
}
