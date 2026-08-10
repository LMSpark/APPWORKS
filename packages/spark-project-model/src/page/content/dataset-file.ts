/**
 * @module @spark-appworks/spark-project-model:page/content/dataset-file
 * 职责：提供项目模型和页面配置域中的 dataset file 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/**
 * PageDataSetFile——pagedata.json 的内存模型，负责 DataSet 的读写与撤销重做。
 */
import { DataSet, DataSetCrudTool } from '@spark-appworks/spark-data'
import { parsePageDataText, serializeDataSet } from '../page-file'

export class PageDataSetFile {
    /** 当前值。 */
value: DataSet

  private readonly undoStack: string[] = []
  private readonly redoStack: string[] = []
  private dirty = false
  private toolCache: DataSetCrudTool | null = null

constructor(
    readonly pageId: string,
  ) {
    this.value = DataSet.fromJson({ dataSetName: pageId, tables: {} })
  }

  get isDirty(): boolean { return this.dirty }
  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }

    /** get Text 文本。 */
getText(): string { return serializeDataSet(this.value) }

    /** set Text 文本。 */
setText(text: string): void {
    if (text === this.getText()) return
    this.pushUndo()
    this.value = parsePageDataText(text, this.pageId)
    this.invalidateToolCache()
    this.dirty = true
  }

    /** load Text 文本。 */
loadText(text: string): void {
    this.value = parsePageDataText(text, this.pageId)
    this.invalidateToolCache()
    this.clearHistory()
    this.dirty = false
  }

markSaved(): void {
    this.dirty = false
  }

    /** 读取 Tool。 */
getTool(): DataSetCrudTool {
    this.toolCache ??= DataSetCrudTool.fromJson(this.value.toJson())
    return this.toolCache
  }

replaceTool(tool: DataSetCrudTool): void {
    this.pushUndo()
    this.value = DataSet.fromJson(tool.toJson())
    this.invalidateToolCache()
    this.dirty = true
  }

async editTool(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    const beforeText = this.getText()
    const tool = this.getTool()
    await run(tool)
    const nextValue = DataSet.fromJson(tool.toJson())
    const afterText = serializeDataSet(nextValue)
    if (afterText === beforeText) return
    this.pushUndo()
    this.value = nextValue
    this.invalidateToolCache()
    this.dirty = true
  }

undo(): boolean {
    const text = this.undoStack.pop()
    if (text === undefined) return false
    this.redoStack.push(this.getText())
    this.value = parsePageDataText(text, this.pageId)
    this.invalidateToolCache()
    this.dirty = true
    return true
  }

redo(): boolean {
    const text = this.redoStack.pop()
    if (text === undefined) return false
    this.undoStack.push(this.getText())
    this.value = parsePageDataText(text, this.pageId)
    this.invalidateToolCache()
    this.dirty = true
    return true
  }

  private invalidateToolCache(): void {
    this.toolCache = null
  }

  private pushUndo(): void {
    this.undoStack.push(this.getText())
    this.redoStack.length = 0
  }

  private clearHistory(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
}
