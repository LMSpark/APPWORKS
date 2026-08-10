/**
 * @module @spark-appworks/spark-project-model:page/content/text-file
 * 职责：提供项目模型层 text-file 能力，围绕 PageTextFile 处理导航、页面文件、配置内容、工作区或远端 IO 契约。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划导航、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 page/content/text-file。
 */
/**
 * PageTextFile——script.js / style.css 的内存模型，负责文本内容的读写与撤销重做。
 */
import { SnapshotHistory } from '@spark-appworks/spark-utils'

const TEXT_HISTORY_LIMIT = 100

export class PageTextFile {
  private _text: string
  private savedText: string
  private readonly history = new SnapshotHistory<string>(TEXT_HISTORY_LIMIT)

constructor(
    readonly pageId: string,
    readonly fileName: 'script.js' | 'style.css',
    initialText = '',
  ) {
    this._text = initialText
    this.savedText = initialText
    this.history.push(initialText)
  }

  get text(): string { return this._text }
  get isDirty(): boolean { return this._text !== this.savedText }
  get canUndo(): boolean { return this.history.canUndo }
  get canRedo(): boolean { return this.history.canRedo }

    /** get Text 文本。 */
getText(): string {
    return this._text
  }

    /** set Text 文本。 */
setText(content: string): void {
    if (this.history.current === content) return
    this.history.push(content)
    this._text = content
  }

    /** load Text 文本。 */
loadText(text: string): void {
    this.history.clear()
    this.history.push(text)
    this._text = text
    this.savedText = text
  }

markSaved(): void {
    this.savedText = this._text
  }

undo(): boolean {
    const prev = this.history.undo()
    if (prev === null) return false
    this._text = prev
    return true
  }

redo(): boolean {
    const next = this.history.redo()
    if (next === null) return false
    this._text = next
    return true
  }
}
