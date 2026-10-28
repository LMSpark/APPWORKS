/**
 * @module @spark-appworks/spark-project-model:scenario/scenario-view-file
 * 职责：场景共享文件的编辑历史与保存基线。
 * 边界：一个场景一个owner，新建草稿不能冒充已持久化。
 * AI用途：编辑场景视图并保持并发保存期间的新修改。
 */
import { SnapshotHistory } from '@spark-appworks/spark-utils'
import { ScenarioViewConfig } from './scenario-view-config'
import {ScenarioViewData} from './scenario-view-data'

/** 单次 DataSet 保存捕获的提交原文和写前基线；对象身份标识当前待核验提交。 */
export type ScenarioViewSubmission = Readonly<{ text: string; baseline: string | null }>

/**
 * 存储适配器对特定提交作出的明确未应用证明。
 * 只用于替换尚未开始且目标资源匹配的拒绝；读回错误、响应丢失或超时不得构造此错误。
 */
export class ScenarioViewWriteNotAppliedError extends Error {
  constructor(readonly resourceId: string, readonly code: string, message: string) {
    super(message)
    this.name = 'ScenarioViewWriteNotAppliedError'
  }
}

/** 场景共享配置的编辑 owner；保存回执仅标记实际提交文本，不能清除等待期间的新编辑。 */
export class ScenarioViewFile {
  readonly #scenarioId: string
  readonly #history = new SnapshotHistory<string>(100)
  #data: ScenarioViewData
  #savedText: string
  #persisted = true
  #value: ScenarioViewConfig
  readonly #listeners = new Set<() => void>()
  #revision = 0
  #saveStatus: 'idle' | 'pending' | 'unknown' = 'idle'
  #submission: ScenarioViewSubmission | null = null
  #invalid = false

  /** 从真实已读取的单场景文件建立保存基线；新增文件应调用 createDraft。 */
  public constructor(scenarioId: string, initialText: string) {
    this.#value = new ScenarioViewConfig(scenarioId, initialText)
    this.#scenarioId = this.#value.scenarioId
    this.#data = new ScenarioViewData(this.#scenarioId, initialText, initialText, () => this.assertValid())
    this.#savedText = initialText
    this.#history.push(initialText)
  }

  /** 验证单场景配置并创建尚未持久化的脏草稿，不能据此声称远端保存成功。 */
  public static createDraft(scenarioId: string, text: string): ScenarioViewFile {
    const file = new ScenarioViewFile(scenarioId, text)
    file.#persisted = false
    file.resetData(text)
    return file
  }

  public get isPersisted(): boolean { return this.#persisted }
  public get scenarioId(): string { return this.#scenarioId }
  public get value(): ScenarioViewConfig { this.assertValid(); return this.#value }
  public get savedText(): string { return this.#savedText }
  public get isDirty(): boolean { return !this.#invalid && (this.#saveStatus !== 'idle' || !this.#persisted || this.#data.text !== this.#savedText) }
  public get revision(): number { return this.#revision }
  public get saveStatus(): 'idle' | 'pending' | 'unknown' { return this.#saveStatus }
  public get submittedText(): string | null { return this.#submission?.text ?? null }
  public get submission(): ScenarioViewSubmission | null { return this.#submission }
  public get canUndo(): boolean { return this.#history.canUndo }
  public get canRedo(): boolean { return this.#history.canRedo }
  public getText(): string { this.assertValid(); return this.#data.text }
  /** 原生 DataSet 提交文件视图变更；调用者提供实际存储适配，不直接拼接请求。 */
  public async saveChanges(write: (text: string) => Promise<void>): Promise<void> {
    this.assertValid()
    if (this.#saveStatus !== 'idle') throw new Error('SCENARIO_VIEW_SAVE_PENDING: 须先核验上次保存')
    await this.#data.save(write)
  }

  private resetData(text: string): void {
    const data = new ScenarioViewData(this.#scenarioId, this.#persisted ? this.#savedText : null, text, () => this.assertValid())
    this.#data.destroy()
    this.#data = data
  }
  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  private notify(): void { for (const listener of this.#listeners) listener() }
  private assertValid(): void { if (this.#invalid) throw new Error('SCENARIO_VIEW_FILE_INVALID: 该草稿已放弃') }

  public beginSave(submitted: string, baseline: string | null): void {
    this.assertValid()
    if (this.#saveStatus !== 'idle') throw new Error('SCENARIO_VIEW_SAVE_PENDING: 须先核验上次保存')
    this.#submission = { text: submitted, baseline }
    this.#saveStatus = 'pending'
    this.#revision++
    this.notify()
  }

  public markSaveUnknown(): void {
    this.assertValid()
    if (this.#saveStatus !== 'pending') throw new Error('SCENARIO_VIEW_SAVE_STATE: 无在途保存')
    this.#saveStatus = 'unknown'
    this.#revision++
    this.notify()
  }

  public markSaveUnknownIfPending(): void {
    if (this.#saveStatus === 'pending') this.markSaveUnknown()
  }

  public confirmSubmitted(): void {
    this.assertValid()
    if (!this.#submission || this.#saveStatus === 'idle') throw new Error('SCENARIO_VIEW_SAVE_STATE: 无待核验提交')
    const text = this.getText()
    this.#savedText = this.#submission.text
    this.#persisted = true
    this.#submission = null
    this.#saveStatus = 'idle'
    this.resetData(text)
    this.#revision++
    this.notify()
  }

  public confirmNotApplied(): void {
    this.assertValid()
    if (!this.#submission || this.#saveStatus !== 'unknown') throw new Error('SCENARIO_VIEW_SAVE_STATE: 无未知提交')
    this.#submission = null
    this.#saveStatus = 'idle'
    this.resetData(this.getText())
    this.#revision++
    this.notify()
  }

  /**
   * 仅在写入适配器明确证明替换未开始后，结算同一对象标识的当前提交。
   * 拒绝其他或已过期提交；保留当前文本、已保存基线和撤销历史，使草稿仍可重试。
   */
  public rejectSaveBeforeApply(submission: ScenarioViewSubmission): void {
    this.assertValid()
    if (this.#saveStatus !== 'pending' || this.#submission !== submission) {
      throw new Error('SCENARIO_VIEW_SAVE_STATE: 明确拒绝不属于当前待提交内容')
    }
    this.#submission = null
    this.#saveStatus = 'idle'
    this.resetData(this.getText())
    this.#revision++
    this.notify()
  }

  public invalidate(): void {
    this.assertValid()
    if (this.#saveStatus === 'pending') throw new Error('SCENARIO_VIEW_SAVE_PENDING: 在途提交不可放弃')
    this.#invalid = true
    this.#data.destroy()
    this.#saveStatus = 'idle'
    this.#submission = null
    this.#revision++
    this.notify()
  }

  public setText(text: string): void {
    this.assertValid()
    if (text === this.getText()) return
    const value = new ScenarioViewConfig(this.#scenarioId, text)
    this.#history.push(text)
    this.#data.text = text
    this.#value = value
    this.#revision++
    this.notify()
  }

  public loadText(text: string): void {
    this.assertValid()
    if (this.#saveStatus === 'pending') throw new Error('SCENARIO_VIEW_SAVE_PENDING: 在途保存不可重载')
    const value = new ScenarioViewConfig(this.#scenarioId, text)
    this.#history.clear()
    this.#history.push(text)
    this.#savedText = text
    this.#persisted = true
    this.resetData(text)
    this.#value = value
    this.#saveStatus = 'idle'
    this.#submission = null
    this.#revision++
    this.notify()
  }

  public markSaved(submittedText: string): void {
    this.assertValid()
    new ScenarioViewConfig(this.#scenarioId, submittedText)
    const text = this.getText()
    this.#savedText = submittedText
    this.#persisted = true
    this.resetData(text)
    this.#revision++
    this.notify()
  }

  public undo(): boolean {
    this.assertValid()
    const text = this.#history.undo()
    if (text === null) return false
    this.#value = new ScenarioViewConfig(this.#scenarioId, text)
    this.#data.text = text
    this.#revision++
    this.notify()
    return true
  }

  public redo(): boolean {
    this.assertValid()
    const text = this.#history.redo()
    if (text === null) return false
    this.#value = new ScenarioViewConfig(this.#scenarioId, text)
    this.#data.text = text
    this.#revision++
    this.notify()
    return true
  }
}
