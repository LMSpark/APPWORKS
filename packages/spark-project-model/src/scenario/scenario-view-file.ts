/**
 * @module @spark-appworks/spark-project-model:scenario/scenario-view-file
 * 职责：场景共享文件的编辑历史与保存基线。
 * 边界：一个场景一个owner，新建草稿不能冒充已持久化。
 * AI用途：编辑场景视图并保持并发保存期间的新修改。
 */
import { SnapshotHistory } from '@spark-appworks/spark-utils'
import { ScenarioViewConfig } from './scenario-view-config'

/** 场景共享配置的编辑 owner；保存回执仅标记实际提交文本，不能清除等待期间的新编辑。 */
export class ScenarioViewFile {
  readonly #scenarioId: string
  readonly #history = new SnapshotHistory<string>(100)
  #text: string
  #savedText: string
  #persisted = true
  #value: ScenarioViewConfig

  /** 从真实已读取的单场景文件建立保存基线；新增文件应调用 createDraft。 */
  public constructor(scenarioId: string, initialText: string) {
    this.#value = new ScenarioViewConfig(scenarioId, initialText)
    this.#scenarioId = this.#value.scenarioId
    this.#text = initialText
    this.#savedText = initialText
    this.#history.push(initialText)
  }

  /** 验证单场景配置并创建尚未持久化的脏草稿，不能据此声称远端保存成功。 */
  public static createDraft(scenarioId: string, text: string): ScenarioViewFile {
    const file = new ScenarioViewFile(scenarioId, text)
    file.#persisted = false
    return file
  }

  public get isPersisted(): boolean { return this.#persisted }
  public get scenarioId(): string { return this.#scenarioId }
  public get value(): ScenarioViewConfig { return this.#value }
  public get savedText(): string { return this.#savedText }
  public get isDirty(): boolean { return !this.#persisted || this.#text !== this.#savedText }
  public get canUndo(): boolean { return this.#history.canUndo }
  public get canRedo(): boolean { return this.#history.canRedo }
  public getText(): string { return this.#text }

  public setText(text: string): void {
    if (text === this.#text) return
    const value = new ScenarioViewConfig(this.#scenarioId, text)
    this.#history.push(text)
    this.#text = text
    this.#value = value
  }

  public loadText(text: string): void {
    const value = new ScenarioViewConfig(this.#scenarioId, text)
    this.#history.clear()
    this.#history.push(text)
    this.#text = text
    this.#savedText = text
    this.#persisted = true
    this.#value = value
  }

  public markSaved(submittedText: string): void {
    new ScenarioViewConfig(this.#scenarioId, submittedText)
    this.#savedText = submittedText
    this.#persisted = true
  }

  public undo(): boolean {
    const text = this.#history.undo()
    if (text === null) return false
    this.#value = new ScenarioViewConfig(this.#scenarioId, text)
    this.#text = text
    return true
  }

  public redo(): boolean {
    const text = this.#history.redo()
    if (text === null) return false
    this.#value = new ScenarioViewConfig(this.#scenarioId, text)
    this.#text = text
    return true
  }
}
