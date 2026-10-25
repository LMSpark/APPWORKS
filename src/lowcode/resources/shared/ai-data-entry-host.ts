/**
 * @module app:lowcode/resources/shared/ai-data-entry-host
 * 职责：在一个运行DataSet内持有通用AI录入会话，并管理标准组件的临时附件。
 * 边界：正式Agent轮次仍经同DataSet的AiTurnResource；租户映射只读部署配置；不读取管理端Agent配置、不保存业务DataView。
 * AI用途：将当前已配置Agent与精确目标DataView组合成可安全重挂、停止和清理的通用录入owner。
 */
import {AiDataEntrySession, AiTurnResource, type AiDataEntryAdapter} from '@spark-appworks/spark-lowcode-api'
import type {DataSet, DataView} from '@spark-appworks/spark-data'
import {lowcodeApi, lowcodeHttp} from '@/lowcode/lowcode-runtime'
import type {AiDataEntryAttachment, AiDataEntryHostCapability} from '@spark-appworks/spark-component'

type CapturedScope = Readonly<{token: string; tenantId: string; appId: string}>

/** 可选领域回调仅用于当前目标的最窄业务语义，不接管模型字段、权限或保存。 */
export type AiDataEntryHostInput = Readonly<{
  /** 当前PageRuntime拥有的正式DataSet；四个轮次视图与临时会话视图都依附此实例。 */
  dataSet: DataSet
  /** 为特定真实目标提供同步领域校验与原DataView追加回调；未匹配时使用通用新增。 */
  adapterForView?: (targetView: DataView) => AiDataEntryAdapter | undefined
}>

function requiredScope(): CapturedScope {
  const scope = lowcodeApi.readRequestScope()
  const tenantId = scope.headers['tenant-id']?.trim()
  const appId = scope.headers['X-AppId']?.trim()
  if (!scope.token.trim() || !tenantId || !appId) throw new Error('AI录入需要有效登录身份、租户和选中应用')
  return {token: scope.token, tenantId, appId}
}

function parseTenantAgentMap(): ReadonlyMap<string, string> {
  const raw: unknown = import.meta.env['VITE_AI_DATA_ENTRY_AGENTS']
  if (typeof raw !== 'string' || raw.trim() === '') throw new Error('AI录入缺少VITE_AI_DATA_ENTRY_AGENTS部署映射')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) { throw new Error('AI录入租户Agent映射不是有效JSON', {cause: error}) }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('AI录入租户Agent映射必须是对象')
  const entries = Object.entries(parsed)
  if (entries.length === 0) throw new Error('AI录入租户Agent映射不能为空')
  const map = new Map<string, string>()
  for (const [tenantId, agentId] of entries) {
    if (tenantId.trim() === '' || typeof agentId !== 'string' || agentId.trim() === '') {
      throw new Error('AI录入租户Agent映射含无效租户或Agent ID')
    }
    map.set(tenantId, agentId.trim())
  }
  return map
}

/** 一个运行DataSet中的AI批量新增owner；组件卸载只撤销附件，安全释放由宿主明确调用。 */
export class AiDataEntryHost implements AiDataEntryHostCapability {
  readonly #dataSet: DataSet
  readonly #scope: CapturedScope
  readonly #turns: AiTurnResource
  readonly #adapterForView: AiDataEntryHostInput['adapterForView']
  #session: AiDataEntrySession | undefined
  #sessionAgentId: string | undefined
  #attachment: AiDataEntryAttachment | undefined
  #sessionUnsubscribe: (() => void) | undefined
  readonly #listeners = new Set<() => void>()

  /**
   * 绑定一个PageRuntime DataSet、同实例正式AiTurnResource和可选领域回调。
   * @param input.dataSet 本次应用运行实例的原生DataSet，不能用业务行副本替代。
   * @param input.adapterForView 仅为精确目标提供领域语义；其输入仍是同一个正式DataView。
   */
  public constructor(input: AiDataEntryHostInput) {
    if (input.dataSet.destroyed) throw new Error('AI录入DataSet已销毁')
    this.#dataSet = input.dataSet
    this.#scope = requiredScope()
    this.#adapterForView = input.adapterForView
    this.#turns = new AiTurnResource({dataSet: input.dataSet, http: lowcodeHttp, guard: () => this.assertScope()})
  }

  /** 是否存在需用户保留或处理的AI会话状态。 */
  public get isDirty(): boolean { return this.#session?.pending === true }
  /** 是否有忙碌、未知命令或非终态轮次需要锁定原业务操作。 */
  public get blocksWorkspace(): boolean { return this.#session?.blocksWorkspace === true }

  /** 订阅当前会话状态；会话仍由正式DataView提供状态真源。 */
  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /**
   * 为目标DataView附着会话；同目标重挂复用原session，不同目标先安全释放旧临时表。
   * @param targetView 必须是本owner DataSet中身份相同的正式DataView对象。
   */
  public openSession(targetView: DataView): AiDataEntryAttachment {
    this.assertScope()
    if (this.#dataSet.destroyed || this.#dataSet.getView(targetView.tableName, targetView.viewId) !== targetView) {
      throw new Error('AI录入目标DataView不属于当前宿主DataSet')
    }
    const agentId = this.agentForCurrentTenant()
    const current = this.#session
    if (current?.targetView === targetView && this.#sessionAgentId === agentId) {
      if (this.#attachment !== undefined && !this.#attachment.signal.aborted) throw new Error('AI录入会话已有活动附件')
      return this.attach(current)
    }
    if (this.#attachment !== undefined && !this.#attachment.signal.aborted) {
      throw new Error('AI录入请先detach当前目标后再切换')
    }
    if (current !== undefined) this.releaseSession(current)

    const adapter = this.#adapterForView?.(targetView)
    const session = new AiDataEntrySession({
      dataSet: this.#dataSet,
      targetView,
      turnResource: this.#turns,
      agentId,
      ...(adapter === undefined ? {} : {adapter}),
    })
    this.#session = session
    this.#sessionAgentId = agentId
    this.#sessionUnsubscribe = session.subscribe(() => this.notify())
    this.notify()
    return this.attach(session)
  }

  /** 同步撤销活动附件，再安全释放仅两张会话临时表；共享轮次视图归DataSet继续持有。 */
  public releaseClean(): void {
    const current = this.#session
    if (current === undefined) return
    if (current.pending || current.blocksWorkspace || current.hasUnconfirmedSave) {
      throw new Error('AI录入会话仍有输入、候选、活动轮次或待核验命令，不能安全释放')
    }
    this.releaseSession(current)
  }

  private attach(session: AiDataEntrySession): AiDataEntryAttachment {
    const controller = new AbortController()
    let detached = false
    const attachment: AiDataEntryAttachment = {
      session,
      signal: controller.signal,
      detach: () => {
        if (detached) return
        detached = true
        controller.abort()
        if (this.#attachment === attachment) this.#attachment = undefined
      },
    }
    this.#attachment = attachment
    return attachment
  }

  private releaseSession(session: AiDataEntrySession): void {
    if (session.hasUnconfirmedSave) throw new Error('AI录入会话存在结果未知的轮次命令，需保留原捕获并核验')
    if (session.blocksWorkspace) throw new Error('AI录入会话仍有活动或未终结轮次，不能切换目标')
    if (session.pending) throw new Error('AI录入会话仍有输入或候选未处理，不能切换目标')
    this.#dataSet.assertCanRemoveTable(session.input.tableName)
    this.#dataSet.assertCanRemoveTable(session.candidates.tableName)
    const attachment = this.#attachment
    if (attachment?.session === session) attachment.detach()
    session.dispose()
    if (this.#session === session) {
      this.#sessionUnsubscribe?.()
      this.#sessionUnsubscribe = undefined
      this.#session = undefined
      this.#sessionAgentId = undefined
      this.notify()
    }
  }

  private notify(): void { for (const listener of this.#listeners) listener() }

  private agentForCurrentTenant(): string {
    const mapping = parseTenantAgentMap()
    const agentId = mapping.get(this.#scope.tenantId)
    if (agentId === undefined) throw new Error(`AI录入未配置租户 ${this.#scope.tenantId} 的正式Agent ID`)
    return agentId
  }

  private assertScope(): void {
    const current = requiredScope()
    if (current.token !== this.#scope.token || current.tenantId !== this.#scope.tenantId || current.appId !== this.#scope.appId) {
      throw new Error('AI录入请求所属租户、应用或登录身份已变化')
    }
  }
}
