/**
 * @module @spark-appworks/spark-project-model:page/page-tool
 * 职责：独立页面工具的三文件编辑状态。
 * 边界：不继承蓝图节点，不持业务DataSet。
 * AI用途：编辑工具定义并输出每次调用所需三文件。
 */
import type { SparkNodeTree, SparkNode } from '@spark-appworks/spark-data'
import { PageRuleFile } from './content/rule-file'
import { PageTextFile } from './content/text-file'
import { PAGE_TOOL_FILE_NAMES, type PageToolFileName } from './page-file'

/** 创建独立页面工具的稳定 pageId；不包含蓝图节点身份或运行数据。 */
export type PageToolOptions = { pageId: string }
/** 三文件编译输出，供一次页面调用物化；场景视图配置由场景文件独立提供。 */
export type PageToolDefinition = { pageId: string; rule: SparkNode[]; script: string | undefined; css: string | undefined }
/** 页面工具持有 rule/script/style 三文件编辑与保存基线；不继承蓝图节点，也不拥有 DataSet。 */
export class PageTool {
  readonly pageId: string
  readonly rule: PageRuleFile
  readonly script: PageTextFile
  readonly style: PageTextFile
  #loaded = false
  /** 按明确 pageId 建立三文件编辑 owner，装载状态由真实读取完成后确认。 */
  constructor(options: PageToolOptions) {
    const id = options.pageId.trim(); if (!id) throw new Error('页面工具缺少 pageId')
    this.pageId = id; this.rule = new PageRuleFile(id); this.script = new PageTextFile(id, 'script.js'); this.style = new PageTextFile(id, 'style.css')
  }
  get isLoaded(): boolean { return this.#loaded }
  markLoaded(): void { this.#loaded = true }
  markUnloaded(): void { this.#loaded = false }
  #file(name: PageToolFileName): PageRuleFile | PageTextFile { return name === 'rule.json' ? this.rule : name === 'script.js' ? this.script : this.style }
  /** 装载已读取文本并重置该文件保存基线；宿主须先保护 dirty 与请求代次。 */
  hydrateFileText(name: PageToolFileName, text: string): void { this.#file(name).loadText(text) }
  /** 仅将实际提交文本作为保存基线，保留保存等待期间的新编辑。 */
  markFileSaved(name: PageToolFileName, submittedText: string): void { this.#file(name).markSaved(submittedText) }
  getFileText(name: PageToolFileName): string { return this.#file(name).getText() }
  setFileText(name: PageToolFileName, text: string): void { this.#file(name).setText(text) }
  getDirtyFileNames(): PageToolFileName[] { return PAGE_TOOL_FILE_NAMES.filter(name => this.#file(name).isDirty) }
  isDirty(): boolean { return this.getDirtyFileNames().length > 0 }
  canUndoFile(name: PageToolFileName): boolean { return this.#file(name).canUndo }
  canRedoFile(name: PageToolFileName): boolean { return this.#file(name).canRedo }
  undoFile(name: PageToolFileName): boolean { return this.#file(name).undo() }
  redoFile(name: PageToolFileName): boolean { return this.#file(name).redo() }
  get nodeTree(): SparkNodeTree { return this.rule.getTree() }
  getNodeTree(): SparkNodeTree { return this.rule.getTree() }
  async editNodeTree(run: (tree: SparkNodeTree) => void | Promise<void>): Promise<void> { await this.rule.editTree(run) }
  /** 未装载时拒绝输出定义；返回三文件内容，不附带场景运行状态。 */
  toDefinition(): PageToolDefinition { if (!this.#loaded) throw new Error(`页面工具 ${this.pageId} 尚未加载`); return { pageId: this.pageId, rule: this.rule.children, script: this.script.text.trim() ? this.script.text : undefined, css: this.style.text.trim() ? this.style.text : undefined } }
}
