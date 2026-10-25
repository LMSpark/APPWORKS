/**
 * @module @spark-appworks/spark-lowcode-api:platform/resources/dictionary/dictionary-ai-candidates
 * 职责：将已完成的AI轮次投影为只读字典候选，并在人工确认时写入原条目DataView。
 * 边界：复用AiTurnResource、DictionaryWorkspace与原DataSet保存；不持有业务行副本或第二保存器。
 * AI用途：字典数据维护页的候选预览、状态核验、停止和确认流程。
 */
import {type DataSet, RequestState, bindDataSetReadonlyCommandQuery, ensureDataSetStaticInputTable, type DataRow, type DataView} from '@spark-appworks/spark-data'
import type {AiTurnResource} from '../../../realtime/ai-turn-resource'
import {DictionarySchema} from './dictionary-schema'
import type {DictionaryWorkspace} from './dictionary-workspace'

const MAX_CANDIDATES = 200
const MAX_OUTPUT_BYTES = 200 * 1024
const CANDIDATE_FIELDS = DictionarySchema.fields.map(field => field.name)
const FIELD_SET = new Set(CANDIDATE_FIELDS)
const WAITING_STATUSES = new Set(['WAITING_APPROVAL', 'WAITING_CLIENT_TOOL', 'WAITING_ATTACHMENT'])
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'CANCELLED'])

/**
 * 装配字典AI候选owner所需的原生运行对象。
 * @remarks 所有数据与状态仍归属于本次DataSet中的DataView及已有业务owner。
 */
type DictionaryAiCandidatesInput = Readonly<{
  /** 本次字典页面运行实例拥有的正式DataSet。 */
  dataSet: DataSet
  /** 复用原字典定义与条目DataView的业务owner。 */
  workspace: DictionaryWorkspace
  /** 只通过其正式DataView操作AI轮次的资源owner。 */
  aiTurns: AiTurnResource
  /** 由正式Agent目录核验的固定Agent身份。 */
  agentId: string
}>

type CandidateSource = Readonly<{
  revision: number
  dictionaryId: string
  name: string
  dictionaryType: string
  labels: readonly string[]
  requirements: string
  readableCodes: ReadonlyArray<string | number>
}>

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function normalizedCode(value: string | number): string {
  return String(value).trim().toLowerCase()
}

/** 已装配正式字典工作空间的AI候选owner；输入、候选与轮次均以本DataSet中的DataView表示。 */
export class DictionaryAiCandidates {
  /** 单行需求输入视图；标准字段组件编辑requirements覆盖，不持有页面数组。 */
  readonly input: DataView
  /** 只读候选预览视图；行由完成轮次查询即时解析，不含AI生成的身份或排序。 */
  readonly candidates: DataView
  /** 复用AiTurnResource正式轮次查询视图，供状态表单绑定与显式刷新。 */
  readonly turn: DataView

  readonly #dataSet: DataSet
  readonly #workspace: DictionaryWorkspace
  readonly #aiTurns: AiTurnResource
  readonly #agentId: string
  readonly #unsubscribe: Array<() => void> = []
  #sourceRevision = 0
  #captureRevision = -1
  #sourceInvalidated = false
  #turnId: string | undefined
  #conversationId: string | undefined
  #turnAgentId: string | undefined
  #busy = false
  #disposed = false
  #consumedTurnId: string | undefined
  #error = ''
  #duplicateCount = 0

  /**
   * 在原字典DataSet中装配需求与只读候选DataView；禁止表名冲突覆盖已有定义。
   * @param input.dataSet 本次页面实例的原DataSet。
   * @param input.workspace 当前唯一字典的正式definition/entries owner。
   * @param input.aiTurns 现有AiTurnResource；其HTTP只由本资源的DataView executor发出。
   * @param input.agentId 正式Agent ID；生成前还会刷新目录并精确核验。
   */
  constructor(input: DictionaryAiCandidatesInput) {
    this.#dataSet = input.dataSet
    this.#workspace = input.workspace
    this.#aiTurns = input.aiTurns
    this.#agentId = input.agentId
    this.turn = input.aiTurns.turns
    if (!input.agentId.trim()) throw new Error('字典AI候选缺少正式Agent身份')
    this.assertLive()
    const tableNames = ['DictionaryAiInput', 'DictionaryAiCandidates']
    const conflict = tableNames.find(name => input.dataSet.getTable(name) !== undefined)
    if (conflict) throw new Error(`字典AI候选DataView表名冲突: ${conflict}`)

    ensureDataSetStaticInputTable(input.dataSet, 'DictionaryAiInput', [
      {name: 'id', primary: true}, {name: 'requirements'},
    ])
    const inputView = input.dataSet.getView('DictionaryAiInput', 'default')
    if (!inputView) throw new Error('字典AI候选需求视图缺失')
    inputView.commitMode = 'staged'
    inputView.appendRow({id: 'requirements', requirements: ''})
    inputView.setCurrentRowById('requirements')
    this.input = inputView

    const candidateTable = input.dataSet.addTable('DictionaryAiCandidates', [
      {name: 'candidateKey', type: 'string', isPrimaryKey: true},
      ...CANDIDATE_FIELDS.map(name => ({name, type: name === 'val' ? 'object' : 'string'})),
    ])
    candidateTable.resourceType = 'file'
    candidateTable.resourceId = `dictionary-ai-candidates:${input.workspace.definition.tableName}:${input.workspace.definition.viewId}`
    const candidateView = input.dataSet.getView('DictionaryAiCandidates', 'default')
    if (!candidateView) throw new Error('字典AI候选预览视图缺失')
    this.candidates = candidateView

    bindDataSetReadonlyCommandQuery(candidateView, {
      resource: {resourceType: 'file', resourceId: candidateTable.resourceId},
      guard: () => this.assertLive(),
      loadRows: async () => this.readCandidateRows(),
    })
    const events = input.workspace.definition.events
    for (const event of ['rowsChanged', 'configChanged', 'cleared', 'editingChanged', 'editingFieldChanged'] as const) {
      const listener = () => this.invalidateSource()
      events.on(event, listener)
      this.#unsubscribe.push(() => events.off(event, listener))
    }
  }

  /** 轮次是否仍需查询/停止，或输入/候选仍需用户处理。 */
  get pending(): boolean {
    return this.#busy || this.#aiTurns.requests.hasUnconfirmedSave || this.#aiTurns.cancellations.hasUnconfirmedSave || this.hasPendingTurn()
      || this.input.hasEditingChanges() || this.input.dirtyTracking.hasPendingChanges() || this.candidates.rows.length > 0
  }
  /** 当前命令或正式查询错误；由宿主显示原始可读拒绝原因。 */
  get error(): string {
    if (this.#error !== '') return this.#error
    return this.turn.loadingError?.message ?? this.candidates.loadingError?.message ?? ''
  }
  /** 最近一次结果中去重跳过的候选数量。 */
  get duplicateCount(): number { return this.#duplicateCount }
  /** 仅在可进行新的Agent请求时为true。 */
  get canStart(): boolean {
    return !this.#disposed && !this.#busy && !this.#aiTurns.requests.hasUnconfirmedSave
      && !this.#aiTurns.cancellations.hasUnconfirmedSave && !this.hasPendingTurn() && this.candidates.rows.length === 0
  }
  /** 轮次可查询时为true；未知提交必须先沿原命令视图核验。 */
  get canRefresh(): boolean { return !this.#disposed && !this.#busy && (this.#turnId !== undefined
    || this.#aiTurns.requests.hasUnconfirmedSave || this.#aiTurns.cancellations.hasUnconfirmedSave) }
  /** 已知非终态轮次可以请求停止；等待人工工具状态仍保留此入口。 */
  get canCancel(): boolean {
    return !this.#disposed && !this.#busy && !this.#aiTurns.requests.hasUnconfirmedSave
      && !this.#aiTurns.cancellations.hasUnconfirmedSave && this.#turnId !== undefined && this.hasPendingTurn()
      && !this.#aiTurns.cancellations.rows.some(row => row['turnId'] === this.#turnId && row['requested'] === true)
  }
  /** 候选来源仍有效且原workspace可以全批暂存时为true。 */
  get canConfirm(): boolean {
    if (this.#disposed || this.#busy || this.#aiTurns.requests.hasUnconfirmedSave
      || this.#aiTurns.cancellations.hasUnconfirmedSave || this.isConsumed() || this.status !== 'COMPLETED'
      || this.candidates.rows.length === 0 || this.#sourceInvalidated || !this.isCurrentSource()) return false
    return this.confirmationError === ''
  }
  /** 向用户展示与确认资格完全相同的原DataView预检拒绝原因。 */
  get confirmationError(): string {
    if (this.#disposed) return 'AI候选owner已释放'
    if (this.#busy) return 'AI候选命令正在进行'
    if (this.#aiTurns.requests.hasUnconfirmedSave || this.#aiTurns.cancellations.hasUnconfirmedSave) return 'AI轮次或停止请求结果待核验'
    if (!this.#turnId) return '请先查询到已完成的AI轮次'
    const stateMessages: string[] = []
    if (this.#sourceInvalidated) stateMessages.push('字典来源已变化，请重新生成候选')
    if (this.isConsumed()) stateMessages.push('该批候选已确认或已消费')
    if (stateMessages.length > 0) return stateMessages.join('；')
    if (this.status !== 'COMPLETED') return '请先查询到已完成的AI轮次'
    const currentTurn = this.currentTurnRow()
    if (currentTurn?.['id'] !== this.#turnId || currentTurn['agentId'] !== this.#turnAgentId
      || currentTurn['conversationId'] !== this.#conversationId || currentTurn['status'] !== 'COMPLETED') {
      return '当前AI轮次状态或身份尚未由有效查询确认'
    }
    try { this.readSource() } catch (error) { return error instanceof Error ? error.message : String(error) }
    if (this.candidates.rows.length === 0) return '当前没有可确认的候选条目'
    try {
      const candidates = this.readCandidates()
      const existing = this.currentReadableCodes(true)
      if (candidates.some(row => {
        const value = row['val']
        if (typeof value !== 'string' && typeof value !== 'number') throw new Error('AI候选编码类型无效')
        return existing.has(normalizedCode(value))
      })) return '候选编码与当前已加载条目重复，请重新生成或放弃候选'
      return this.#workspace.entryAppendError(candidates) ?? ''
    }
    catch (error) { return error instanceof Error ? error.message : String(error) }
  }
  /** 按已确认轮次状态返回给用户的状态文本。 */
  get status(): string { return String(this.currentTurnRow()?.['status'] ?? '') }
  /** 生成器等待审批或客户端工具时不给工具回执，只提示用户停止或查询。 */
  get waitingForUnsupportedTool(): boolean { return WAITING_STATUSES.has(this.status) }
  /** 宿主按此状态以1500ms串行刷新；首读失败由生命周期暂停，显式查询可恢复。 */
  get shouldAutoRefresh(): boolean {
    if (this.#disposed || this.#busy || this.#aiTurns.requests.hasUnconfirmedSave
      || this.#aiTurns.cancellations.hasUnconfirmedSave || !this.#turnId) return false
    const row = this.currentTurnRow()
    if (!row) return true
    return row['agentId'] === this.#turnAgentId && row['conversationId'] === this.#conversationId
      && ['QUEUED', 'RUNNING', 'CANCELLING'].includes(String(row['status'] ?? ''))
  }
  /** AI命令或已知非终态期间，宿主锁定原字典业务操作；已完成候选预览不锁定。 */
  get blocksWorkspace(): boolean {
    return this.#busy || this.#aiTurns.requests.hasUnconfirmedSave || this.#aiTurns.cancellations.hasUnconfirmedSave || this.hasPendingTurn()
  }

  /**
   * 以当前正式定义、权限可读的已加载编码及需求创建一个Agent轮次；ACK不视作完成。
   * @throws 当前定义/新增权限无效、Agent不存在或原命令回执未知时拒绝新建。
   */
  async start(): Promise<void> {
    this.assertCommandAllowed()
    if (!this.canStart) throw new Error('当前AI轮次尚未完成，不能重复生成')
    const source = this.readSource()
    if (source.requirements.trim() === '') throw new Error('请先填写字典候选生成需求')
    this.#busy = true
    this.#error = ''
    this.#turnId = undefined
    this.#conversationId = undefined
    this.#turnAgentId = undefined
    this.#sourceInvalidated = false
    this.#duplicateCount = 0
    this.clearPreview()
    try {
      await this.#aiTurns.agents.refresh()
      this.assertSourceUnchanged(source.revision)
      const agent = this.#aiTurns.agents.rows.find(row => row['id'] === this.#agentId)
      if (!agent) throw new Error(`正式Agent目录中不存在 ${this.#agentId}`)
      await this.#aiTurns.requests.refresh()
      this.assertSourceUnchanged(source.revision)
      const message = this.buildPrompt(source)
      await this.#aiTurns.requests.addRow({agentId: this.#agentId, message})
      await this.#dataSet.saveChanges({views: [{tableName: this.#aiTurns.requests.tableName, viewId: this.#aiTurns.requests.viewId}]})
      this.assertLive()
      const ack = this.#aiTurns.requests.rows.find(row => row['agentId'] === this.#agentId && typeof row['turnId'] === 'string')
      if (!ack || typeof ack['turnId'] !== 'string' || ack['turnId'].trim() === ''
        || typeof ack['conversationId'] !== 'string' || ack['conversationId'].trim() === '') {
        throw new Error('AI轮次受理身份缺失，结果待核验')
      }
      this.#turnId = ack['turnId']
      this.#conversationId = ack['conversationId']
      this.#turnAgentId = this.#agentId
      this.#captureRevision = source.revision
      this.#aiTurns.turns.clearAll()
      if (source.revision !== this.#sourceRevision) {
        this.#sourceInvalidated = true
        this.#captureRevision = -1
        throw new Error('字典来源在AI请求期间已变化；该轮次仍可查询或停止，但不能生成当前来源候选')
      }
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error)
      throw error
    } finally { this.#busy = false }
  }

  /**
   * 沿原requests/cancellations DataView核验未知提交，或按已确认turnId刷新正式状态并解析终态候选。
   * 不重放未知POST；状态查询失败由调用方暂停自动更新并保留手动查询入口。
   */
  async refresh(): Promise<void> {
    this.assertLive()
    if (this.#busy) throw new Error('AI轮次查询或命令正在进行')
    this.#busy = true
    this.#error = ''
    try {
      if (this.#aiTurns.requests.hasUnconfirmedSave) {
        await this.#dataSet.saveChanges({views: [{tableName: this.#aiTurns.requests.tableName, viewId: this.#aiTurns.requests.viewId}]})
        if (this.isUnconfirmed(this.#aiTurns.requests)) throw new Error('AI创建结果仍待核验')
        const ack = this.#aiTurns.requests.rows.find(row => typeof row['turnId'] === 'string' && row['turnId'] !== '')
        if (!ack || typeof ack['turnId'] !== 'string' || typeof ack['conversationId'] !== 'string') {
          throw new Error('AI创建原命令已核验但没有可用turnId，不能自动重发')
        }
        this.#turnId = ack['turnId']; this.#conversationId = ack['conversationId']
        this.#turnAgentId = typeof ack['agentId'] === 'string' ? ack['agentId'] : this.#agentId
        this.#captureRevision = this.#sourceRevision
      }
      if (this.#aiTurns.cancellations.hasUnconfirmedSave) {
        await this.#dataSet.saveChanges({views: [{tableName: this.#aiTurns.cancellations.tableName, viewId: this.#aiTurns.cancellations.viewId}]})
        if (this.isUnconfirmed(this.#aiTurns.cancellations)) throw new Error('停止请求仍待正式轮次核验')
      }
      if (!this.#turnId) throw new Error('当前没有已确认的AI轮次身份')
      const id = this.#turnId
      this.#aiTurns.turns.queryContext = {turnId: id}
      await this.#aiTurns.turns.refresh()
      this.assertLive()
      if (id !== this.#turnId) throw new Error('AI轮次身份已变化，忽略迟到结果')
      if (this.#aiTurns.turns.loadingError) throw this.#aiTurns.turns.loadingError
      const turnRow = this.#aiTurns.turns.rows[0]
      if (turnRow?.['id'] !== id || turnRow['agentId'] !== this.#turnAgentId
        || turnRow['conversationId'] !== this.#conversationId) {
        this.clearPreview()
        throw new Error('AI轮次回读身份与创建ACK不一致')
      }
      if (turnRow['status'] === 'COMPLETED' && this.isCurrentSource()) {
        await this.candidates.refresh()
        if (this.candidates.loadingError) throw this.candidates.loadingError
      } else if (TERMINAL_STATUSES.has(String(turnRow['status'] ?? '')) || WAITING_STATUSES.has(String(turnRow['status'] ?? ''))
        || !this.isCurrentSource()) {
        this.clearPreview()
      }
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error)
      throw error
    } finally { this.#busy = false }
  }

  /** 请求停止已知非终态轮次；cancel ACK仍须再由refresh查询正式状态。 */
  async cancel(): Promise<void> {
    this.assertCommandAllowed()
    if (!this.canCancel) throw new Error('当前没有可停止的AI轮次')
    this.#busy = true
    this.#error = ''
    try {
      await this.#aiTurns.cancellations.refresh()
      const turnId = this.#turnId
      if (!turnId) throw new Error('当前没有可停止的AI轮次')
      const operation = await this.#aiTurns.cancellations.addRow({turnId})
      const id = this.#aiTurns.cancellations.getPkKey(operation)
      await this.#dataSet.saveChanges({views: [{tableName: this.#aiTurns.cancellations.tableName, viewId: this.#aiTurns.cancellations.viewId}]})
      this.assertLive()
      const receipt = this.#aiTurns.cancellations.rows.find(row => this.#aiTurns.cancellations.getPkKey(row) === id)
      if (!receipt) throw new Error('停止请求缺少原DataView回执')
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error)
      throw error
    } finally { this.#busy = false }
  }

  /** 只把完整预检通过的候选批次暂存到原entries；部分异常后禁止整批重试。 */
  async confirm(): Promise<void> {
    if (this.#turnId && this.#consumedTurnId === this.#turnId) return
    if (!this.canConfirm) throw new Error(this.confirmationError || '当前AI候选不允许确认')
    const candidates = this.readCandidates()
    const problem = this.#workspace.entryAppendError(candidates)
    if (problem) throw new Error(problem)
    const consumed = this.#turnId
    if (!consumed || this.#consumedTurnId === consumed) throw new Error('该AI轮次候选已确认或已消费')
    this.#consumedTurnId = consumed
    this.#busy = true
    try {
      await this.#workspace.appendEntries(candidates)
      this.assertLive()
      this.clearPreview()
      this.resetRequirements()
      this.#captureRevision = -1
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error)
      throw error
    } finally { this.#busy = false }
  }

  /** 清除候选派生结果和输入意图，不取消远端轮次或丢弃原entries草稿。 */
  discard(): void {
    this.assertLive()
    if (this.#busy || this.#aiTurns.requests.hasUnconfirmedSave || this.#aiTurns.cancellations.hasUnconfirmedSave || this.hasPendingTurn()) return
    this.clearPreview()
    this.resetRequirements()
    this.#captureRevision = -1
    this.#error = ''
  }

  /** 释放本owner对源定义的事件订阅；目标切换/页面卸载时由宿主先调用。 */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#sourceRevision++
    for (const unsubscribe of this.#unsubscribe.splice(0)) unsubscribe()
    if (!this.candidates.destroyed) this.candidates.clearAll()
  }

  private buildPrompt(source: CandidateSource): string {
    const existing = source.readableCodes.length > 0 ? `\n当前已加载且本次查询可读的编码（用于避免重复）：${JSON.stringify(source.readableCodes)}` : ''
    const schema = source.labels.map((label, index) => `${CANDIDATE_FIELDS[index]}=${label}`).join('；')
    return [
      '为一个已保存的字典方案生成业务数据候选。只返回JSON，不调用工具、不执行操作。',
      '返回格式为数组或{"rows":[...]}；每行只允许val、txt、exVal_1、exVal_2、exVal_3、exVal_4。',
      'val为文本或有限数值，txt为非空文本，四个扩展字段为文本、null或省略。不得返回rowid、typeid、crttime、ordIdx或其它属性。',
      '最多返回200行，整体输出不超过200 KB；这是前端候选预览资源上限。',
      `${source.name ? `字典名称：${source.name}` : '字典名称不可读，本次提示不包含名称'}；编码类型：${source.dictionaryType}；字段标题：${schema}${existing}`,
      `用户需求：${source.requirements}`,
    ].join('\n')
  }

  private readSource(): CandidateSource {
    this.assertLive()
    const definition = this.#workspace.definition
    if (definition.requestState !== RequestState.Loaded || definition.loadingError || definition.refreshPending
      || definition.hasUnconfirmedSave || definition.hasEditingChanges() || definition.dirtyTracking.hasPendingChanges()) {
      throw new Error('字典定义查询未完成或存在未保存修改')
    }
    const snapshot = definition.readSnapshot()
    if (snapshot.rows.length !== 1) throw new Error('字典来源身份不存在或不唯一')
    const row = snapshot.rows[0]
    if (!row) throw new Error('字典来源身份不存在或不唯一')
    if (definition.fieldAccess(row, 'dictionaryType').read !== 'visible') throw new Error('字典编码类型不可读，不能生成候选')
    const dictionaryId = row['rowid']
    if (typeof dictionaryId !== 'string' || !dictionaryId.trim()) throw new Error('字典身份不可读')
    const nameValue = definition.fieldAccess(row, 'TypeName').read === 'visible' ? row['TypeName'] : undefined
    const name = typeof nameValue === 'string' ? nameValue.trim() : ''
    const dictionaryType = typeof row['dictionaryType'] === 'string' ? row['dictionaryType'] : ''
    if (dictionaryType !== '0' && dictionaryType !== '1') throw new Error('字典编码类型无效，不能生成候选')
    const labels = DictionarySchema.fields.map(field => this.#workspace.fieldLabel(field.name))
    const inputRow = this.input.currentRow
    const requirements = inputRow && this.input.fieldAccess(inputRow, 'requirements').read === 'visible'
      ? this.input.getEditingRow('requirements')?.['requirements'] : undefined
    if (typeof requirements !== 'string') throw new Error('AI候选需求字段不可读')
    const readableCodes = this.currentReadableCodeValues(false)
    return {revision: this.#sourceRevision, dictionaryId, name, dictionaryType, labels, requirements, readableCodes}
  }

  private assertSourceUnchanged(revision: number): void {
    this.assertLive()
    if (revision !== this.#sourceRevision) throw new Error('字典定义已变化，丢弃本次AI响应')
    this.readSource()
  }

  private isCurrentSource(): boolean {
    if (this.#disposed || this.#captureRevision !== this.#sourceRevision) return false
    try { this.readSource(); return true } catch { return false }
  }

  private readCandidateRows(): Promise<readonly DataRow[]> {
    this.assertLive()
    if (!this.#turnId || this.status !== 'COMPLETED' || !this.isCurrentSource()
      || this.#consumedTurnId === this.#turnId) return Promise.resolve([])
    const row = this.turn.rows.find(item => item['id'] === this.#turnId)
    if (row?.['status'] !== 'COMPLETED' || row['agentId'] !== this.#turnAgentId
      || row['conversationId'] !== this.#conversationId) throw new Error('AI轮次回读身份与创建ACK不一致')
    const assistantDraft = row['assistantDraft']
    if (typeof assistantDraft !== 'string' || assistantDraft.trim() === '') throw new Error('已完成AI轮次没有可解析的候选文本')
    if (new TextEncoder().encode(assistantDraft).byteLength > MAX_OUTPUT_BYTES) throw new Error('AI候选输出超过200 KB前端预览上限')
    let jsonText = assistantDraft.trim()
    const startTag = '[[AI_OperateRecord_Start]]', endTag = '[[AI_OperateRecord_End]]'
    const start = jsonText.indexOf(startTag), end = jsonText.indexOf(endTag)
    if (start !== -1 || end !== -1) {
      if (start < 0 || end < start || jsonText.includes(startTag, start + startTag.length)
        || jsonText.includes(endTag, end + endTag.length)
        || jsonText.slice(0, start).trim() !== '' || jsonText.slice(end + endTag.length).trim() !== '') {
        throw new Error('AI候选操作标签不完整或包含额外内容')
      }
      jsonText = jsonText.slice(start + startTag.length, end).trim()
    }
    let parsed: unknown
    try { parsed = JSON.parse(jsonText) }
    catch { throw new Error('AI候选不是有效JSON') }
    const rawRows = Array.isArray(parsed) ? parsed : isPlainRecord(parsed) && Object.keys(parsed).length === 1 && Array.isArray(parsed['rows'])
      ? parsed['rows'] : undefined
    if (!rawRows) throw new Error('AI候选必须是数组或仅含rows数组的对象')
    if (rawRows.length > MAX_CANDIDATES) throw new Error('AI候选超过200行前端预览上限')
    const seen = new Set<string>()
    const currentCodes = this.currentReadableCodes(false)
    const rows: DataRow[] = []
    let skipped = 0
    for (const value of rawRows) {
      if (value === null || isPlainRecord(value) && Object.keys(value).length === 0) { skipped++; continue }
      if (!isPlainRecord(value)) throw new Error('AI候选每一行必须是普通JSON对象')
      const keys = Reflect.ownKeys(value)
      if (keys.some(key => typeof key !== 'string' || !FIELD_SET.has(key))) throw new Error('AI候选包含未知字段、身份字段或排序字段')
      const val = value['val'], txt = value['txt']
      if (typeof val !== 'string' && typeof val !== 'number' || typeof val === 'number' && !Number.isFinite(val)) {
        throw new Error('AI候选编码必须是文本或有限数值')
      }
      if (typeof txt !== 'string' || !txt.trim()) throw new Error('AI候选显示文本必须是非空文本')
      const valColumnType = this.#workspace.entries.getColumn('val')?.type
      const candidateCode = typeof val === 'string' ? val.trim() : valColumnType === 'string' ? String(val) : val
      const normalized: Record<string, unknown> = {val: candidateCode, txt: txt.trim()}
      for (const field of CANDIDATE_FIELDS.slice(2)) {
        const extension = value[field]
        if (extension !== undefined && extension !== null && typeof extension !== 'string') throw new Error(`AI候选扩展字段 ${field} 必须是文本、null或省略`)
        if (extension !== undefined) normalized[field] = extension
      }
      const codeKey = normalizedCode(candidateCode)
      if (seen.has(codeKey) || currentCodes.has(codeKey)) { skipped++; continue }
      seen.add(codeKey)
      const source = this.readSource()
      DictionarySchema.validateEntry(normalized, {dictionaryType: source.dictionaryType})
      rows.push({candidateKey: `candidate-${rows.length + 1}`, ...normalized})
    }
    this.#duplicateCount = skipped
    return Promise.resolve(rows)
  }

  private currentReadableCodes(requireReadable: boolean): Set<string> {
    return new Set(this.currentReadableCodeValues(requireReadable).map(normalizedCode))
  }

  private currentReadableCodeValues(requireReadable: boolean): Array<string | number> {
    const snapshot = this.#workspace.entries.readSnapshot()
    if (!snapshot.fields.includes('val')) {
      if (requireReadable && this.#workspace.entries.rows.length > 0) throw new Error('当前已加载条目编码不可读，不能确认候选')
      return []
    }
    const codes: Array<string | number> = []
    for (const row of this.#workspace.entries.rows) {
      if (this.#workspace.entries.fieldAccess(row, 'val').read !== 'visible') {
        if (requireReadable) throw new Error('当前已加载条目编码不可读，不能确认候选')
        continue
      }
      const id = this.#workspace.entries.getPkKey(row)
      const current = id === undefined ? row : this.#workspace.entries.getEditingRow(id) ?? row
      const value = current['val']
      if (typeof value === 'string' && value.trim() || typeof value === 'number' && Number.isFinite(value)) codes.push(value)
    }
    return codes
  }

  private readCandidates(): Array<Record<string, unknown>> {
    if (this.candidates.requestState !== RequestState.Loaded || this.candidates.loadingError) throw new Error('AI候选预览尚未有效读取')
    const snapshot = this.candidates.readSnapshot()
    for (const field of CANDIDATE_FIELDS) if (!snapshot.fields.includes(field)) throw new Error(`AI候选字段不可读: ${field}`)
    return snapshot.rows.map(row => Object.fromEntries(CANDIDATE_FIELDS.map(field => [field, row[field]])))
  }

  private resetRequirements(): void {
    const row = this.input.currentRow
    const id = row && this.input.getPkKey(row)
    if (id !== undefined && id !== null) this.input.updateEditingValue(id, 'requirements', '')
  }

  private assertCommandAllowed(): void {
    this.assertLive()
    if (this.#busy) throw new Error('AI候选命令正在进行')
    if (this.#aiTurns.requests.hasUnconfirmedSave || this.#aiTurns.cancellations.hasUnconfirmedSave) {
      throw new Error('AI轮次或停止请求结果待核验')
    }
  }

  private isUnconfirmed(view: DataView): boolean { return view.hasUnconfirmedSave }
  private isConsumed(): boolean { return this.#turnId !== undefined && this.#consumedTurnId === this.#turnId }

  private currentTurnRow(): DataRow | undefined {
    if (!this.#turnId || this.turn.requestState !== RequestState.Loaded || this.turn.loadingError) return undefined
    return this.turn.rows.find(row => row['id'] === this.#turnId)
  }

  /** 已确认轮次仅在当前有效正式GET证明终态时解除关闭保护；无结果/读取失败均保守待处理。 */
  private hasPendingTurn(): boolean {
    if (!this.#turnId) return false
    const row = this.currentTurnRow()
    if (!row || row['agentId'] !== this.#turnAgentId || row['conversationId'] !== this.#conversationId) return true
    return !TERMINAL_STATUSES.has(String(row['status'] ?? ''))
  }

  private invalidateSource(): void {
    if (this.#disposed) return
    this.#sourceRevision++
    if (this.#turnId) this.#sourceInvalidated = true
    this.#captureRevision = -1
    this.clearPreview()
  }

  private clearPreview(): void {
    if (!this.candidates.destroyed && (this.candidates.rows.length > 0 || this.candidates.requestState !== RequestState.Idle)) {
      this.candidates.clearAll()
    }
    this.#duplicateCount = 0
  }

  private assertLive(): void {
    if (this.#disposed) throw new Error('字典AI候选owner已释放')
    if (this.#dataSet.destroyed) throw new Error('字典AI候选DataSet已销毁')
  }
}
