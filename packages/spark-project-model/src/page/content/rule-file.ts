/**
 * @module @spark-appworks/spark-project-model:page/content/rule-file
 * 职责：提供项目模型层 rule-file 能力，围绕 PageRuleFile 处理导航、页面文件、配置内容、工作区或远端 IO 契约。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划导航、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 page/content/rule-file。
 */
/**
 * PageRuleFile——rule.json 的内存模型，负责节点树的读写与撤销重做。
 */
import { getSparkNodeChildren, SparkNodeTree } from '@spark-appworks/spark-data'
import type { SparkNodeTree as SparkNodeTreeModel, SparkNode } from '@spark-appworks/spark-data'
import { parseRuleText, serializeRuleTree } from '../page-file'

export class PageRuleFile {
    /** tree 字段。 */
tree: SparkNodeTreeModel = SparkNodeTree.fromPageChildren([])

  private dirty = false

constructor(
    readonly pageId: string,
  ) {}

  get root(): SparkNode { return this.tree.root }
  get children(): SparkNode[] { return getSparkNodeChildren(this.root.children) }
  get isDirty(): boolean { return this.dirty }
  get canUndo(): boolean { return this.tree.canUndo }
  get canRedo(): boolean { return this.tree.canRedo }

    /** get Text 文本。 */
getText(): string { return serializeRuleTree(this.root) }

    /** set Text 文本。 */
setText(text: string): void {
    if (text === this.getText()) return
    this.tree.replaceRoot(parseRuleText(text))
    this.dirty = true
  }

    /** load Text 文本。 */
loadText(text: string): void {
    this.tree = SparkNodeTree.fromJson(parseRuleText(text))
    this.dirty = false
  }

markSaved(): void {
    this.dirty = false
  }

    /** 读取 Tree。 */
getTree(): SparkNodeTreeModel {
    return this.tree
  }

replaceTree(tree: SparkNodeTreeModel): void {
    this.tree = tree
    this.dirty = true
  }

async editTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    const beforeText = this.getText()
    const tree = this.getTree()
    await run(tree)
    if (this.getText() === beforeText) return
    this.replaceTree(tree)
  }

undo(): boolean {
    const ok = this.tree.undo() !== null
    if (ok) this.dirty = true
    return ok
  }

redo(): boolean {
    const ok = this.tree.redo() !== null
    if (ok) this.dirty = true
    return ok
  }
}
