/**
 * @module @spark-appworks/spark-project-model:page/config-page
 * 职责：提供项目模型和页面配置域中的 config page 能力，支撑 navigation、page content、project session 或远程 IO。
 * 边界：只描述配置和项目结构，不渲染 Vue 组件，也不直接操作 spark-data 运行态。
 * AI用途：读取、生成或同步项目页面配置时，用本模块确认项目模型字段和 IO 边界。
 */
/** ConfigPageNode——配置页节点，挂接 rule/dataset/script/style（纯内存领域模型）。 */
import type { DataSet, DataSetCrudTool, SparkNode, SparkNodeTree as SparkNodeTreeModel } from '@spark-appworks/spark-data'
import type {
  PageNodeLoadOptions,
  PageNodeFileName,
} from './page-file'
import { PAGE_NODE_FILE_NAMES } from './page-file'
import {
  ProjectBlueprintNode,
  type ProjectBlueprintNodeFamily,
  type ProjectBlueprintTreeNodeData,
  type ProjectBlueprintNodeModelOptions,
  type ProjectPageNodeSummary,
} from '../blueprint/project-blueprint-node'
import {
  normalizeConfigPageId,
  isNestedConfigPageNode,
  resolveProjectPageSurface,
  resolvePageNodePageId,
} from '../blueprint/project-blueprint-tree'
import { PageRuleFile } from './content/rule-file'
import { PageDataSetFile } from './content/dataset-file'
import { PageTextFile } from './content/text-file'

export type { PageNodeLoadOptions } from './page-file'

/** 页面进入数据空间时使用的完整身份闭包。 */
export type PageDataSpaceBinding = Readonly<{
  formKey: string
  dataSpaceId: string
  modelId: string
}>

function readPageDataSpaceBinding(node: ProjectBlueprintTreeNodeData): PageDataSpaceBinding | null {
  const formKey = node.formKey?.trim() ?? ''
  const dataSpaceId = node.dataSpaceId?.trim() ?? ''
  const modelId = node.modelId?.trim() ?? ''
  return formKey && dataSpaceId && modelId ? { formKey, dataSpaceId, modelId } : null
}

/** Page Node Render Config 的配置结构。 */
export type PageNodeRenderConfig = {
    /** page Id 标识。 */
pageId: string
    /** 产生当前页面的项目蓝图节点。 */
blueprintNode: ProjectBlueprintTreeNodeData | null
    /** 页面消费的数据空间身份；不完整时为 null，数据读取必须失败关闭。 */
dataSpaceBinding: PageDataSpaceBinding | null
    /** rule 字段。 */
rule: SparkNode[]
    /** 业务数据载荷。 */
data: DataSet
    /** script 字段。 */
script: string | undefined
    /** css 字段。 */
css: string | undefined
}

export type PageNodeLike = {
    /** 页面唯一标识，与配置页存储目录名一致 */
readonly pageId: string
    /** 页面四文件（rule/pagedata/script/style）是否已从远端加载到内存 */
readonly isLoaded: boolean
  /** 从远端加载页面四文件到内存；重复加载会覆盖内存中未保存的变更 */
  load(options?: PageNodeLoadOptions): Promise<void>
  /** 将已加载的页面内容组装为渲染配置；未加载时调用会抛异常 */
  toRenderConfig(): PageNodeRenderConfig
}

/** Project Config Page Node Model Options 的调用配置。 */
export type ProjectConfigPageNodeModelOptions = ProjectBlueprintNodeModelOptions & {
  /** 配置页唯一 pageId；省略时从蓝图交付节点解析。 */
  pageId?: string
}

function optionalText(value: string): string | undefined { return value.trim() === '' ? undefined : value }

type ConfigPageFileModel = {
  readonly isDirty: boolean
  getText(): string
}

/**
 * 配置页面节点。
 *
 * 持有当前页面的 rule.json、pagedata.json、script.js、style.css 子模型。
 * 四文件持久化由 ProjectWorkspace 或 PageContentLoader 编排。
 *
 */
export class ConfigPageNode extends ProjectBlueprintNode {
    /** rule 字段。 */
readonly rule: PageRuleFile
    /** data Set 字段。 */
readonly dataSet: PageDataSetFile
    /** style 字段。 */
readonly style: PageTextFile
    /** script 字段。 */
readonly script: PageTextFile
  /** 配置页唯一 pageId，与四文件存储目录一致。 */
  readonly pageId: string
  private readonly files: Record<PageNodeFileName, ConfigPageFileModel>
  private _isLoaded = false

  /**
   * 创建配置页节点实例，并初始化 rule/pagedata/script/style 四文件内存模型。
   *
   * @param options 配置页蓝图节点、pageId 与基础 ProjectBlueprintNode 初始化参数。
   */
  constructor(options: ProjectConfigPageNodeModelOptions) {
    super(options)
    const pageId = normalizeConfigPageId(options.pageId ?? resolvePageNodePageId(options.node))
    if (!pageId) throw new Error('配置页面节点缺少 pageId')
    this.pageId = pageId
    this.rule = new PageRuleFile(pageId)
    this.dataSet = new PageDataSetFile(pageId)
    this.style = new PageTextFile(pageId, 'style.css')
    this.script = new PageTextFile(pageId, 'script.js')
    this.files = {
      'rule.json': this.rule,
      'pagedata.json': this.dataSet,
      'script.js': this.script,
      'style.css': this.style,
    }
  }

  override get family(): ProjectBlueprintNodeFamily { return 'config-page' }

  protected get resolvedPath(): string { return this.path ?? `/${this.pageId}` }

  get isLoaded(): boolean { return this._isLoaded }

  get isSubPage(): boolean {
    return isNestedConfigPageNode({
      nodeKind: this.nodeKind,
      path: this.path,
      hidden: this.hidden,
    })
  }

    /** 是否 is Dirty。 */
isDirty(): boolean {
    return this.getDirtyFileNames().length > 0
  }

  /** 由 ProjectWorkspace 或 PageContentLoader 在远端加载后灌入，不标 dirty。 */
  hydrateFileText(name: PageNodeFileName, text: string): void {
    switch (name) {
      case 'rule.json':
        this.rule.loadText(text)
        break
      case 'pagedata.json':
        this.dataSet.loadText(text)
        break
      case 'script.js':
        this.script.loadText(text)
        break
      case 'style.css':
        this.style.loadText(text)
        break
    }
  }

markLoaded(): void {
    this._isLoaded = true
  }

markUnloaded(): void {
    this._isLoaded = false
  }

markFileSaved(name: PageNodeFileName): void {
    switch (name) {
      case 'rule.json':
        this.rule.markSaved()
        break
      case 'pagedata.json':
        this.dataSet.markSaved()
        break
      case 'script.js':
        this.script.markSaved()
        break
      case 'style.css':
        this.style.markSaved()
        break
    }
  }

  /**
   * 读取四文件文本。
   *
   * @param name 要读取的页面文件名。
   */
  getFileText(name: PageNodeFileName): string {
    return this.files[name].getText()
  }

  /**
   * 写入四文件文本到内存模型。
   *
   * @param name 要写入的页面文件名。
   * @param text 新的文件文本内容。
   */
  setFileText(name: PageNodeFileName, text: string): void {
    switch (name) {
      case 'rule.json':
        this.rule.setText(text)
        break
      case 'pagedata.json':
        this.dataSet.setText(text)
        break
      case 'script.js':
        this.script.setText(text)
        break
      case 'style.css':
        this.style.setText(text)
        break
    }
  }

    /** 是否 can Undo File。 */
canUndoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.canUndo
      case 'pagedata.json': return this.dataSet.canUndo
      case 'script.js': return this.script.canUndo
      case 'style.css': return this.style.canUndo
    }
  }

    /** 是否 can Redo File。 */
canRedoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.canRedo
      case 'pagedata.json': return this.dataSet.canRedo
      case 'script.js': return this.script.canRedo
      case 'style.css': return this.style.canRedo
    }
  }

undoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.undo()
      case 'pagedata.json': return this.dataSet.undo()
      case 'script.js': return this.script.undo()
      case 'style.css': return this.style.undo()
    }
  }

redoFile(name: PageNodeFileName): boolean {
    switch (name) {
      case 'rule.json': return this.rule.redo()
      case 'pagedata.json': return this.dataSet.redo()
      case 'script.js': return this.script.redo()
      case 'style.css': return this.style.redo()
    }
  }

    /** 读取 Dirty File Names。 */
getDirtyFileNames(): PageNodeFileName[] {
    return PAGE_NODE_FILE_NAMES.filter(name => this.files[name].isDirty)
  }

  /**
   * rule.json 节点树根；结构读写入口。
   */
  get nodeTree(): SparkNodeTreeModel {
    return this.getNodeTree()
  }

  /** pagedata.json 数据集 CRUD 工具入口。 */
  get dataSetTool(): DataSetCrudTool {
    return this.getDataSetTool()
  }

  /**
   * 读取 rule.json 节点树。
   *
   */
  getNodeTree(): SparkNodeTreeModel {
    return this.rule.getTree()
  }

  /**
   * 修改 rule.json 节点树。
   *
   * @param run 节点树编辑回调；回调参数是当前页面 SparkNodeTree。
   */
  async editNodeTree(run: (tree: SparkNodeTreeModel) => void | Promise<void>): Promise<void> {
    await this.rule.editTree(run)
  }

  /** 读取 pagedata 数据集工具入口。 */
  getDataSetTool(): DataSetCrudTool {
    return this.dataSet.getTool()
  }

  /** 修改 pagedata.json 数据集模型。 */
  async editDataSet(run: (tool: DataSetCrudTool) => void | Promise<void>): Promise<void> {
    await this.dataSet.editTool(run)
  }

    /** to Render Config 配置。 */
toRenderConfig(): PageNodeRenderConfig {
    if (!this._isLoaded) throw new Error(`配置页面节点 ${this.pageId} 尚未加载完成`)
    const blueprintNode = this.toNodeData()
    return {
      pageId: this.pageId,
      blueprintNode,
      dataSpaceBinding: readPageDataSpaceBinding(blueprintNode),
      rule: this.rule.children,
      data: this.dataSet.value,
      script: optionalText(this.script.text),
      css: optionalText(this.style.text),
    }
  }

toSummary(): ProjectPageNodeSummary {
    const node = this.toNodeData()
    return {
      pageId: this.pageId, path: this.resolvedPath, title: this.name,
      nodeId: this.id, nodeKind: this.nodeKind,
      designSurface: resolveProjectPageSurface(node),
      description: this.description,
      ...(this.planningAttachmentRef === undefined
        ? {}
        : { planningAttachmentRef: this.planningAttachmentRef }),
      descriptionContext: this.descriptionContext,
      effectiveDescription: this.effectiveDescription,
      ...(this.implGate !== undefined ? { implGate: this.implGate } : {}),
      ...(this.upstreamContractsSatisfied !== undefined
        ? { upstreamContractsSatisfied: this.upstreamContractsSatisfied }
        : {}),
      ...(this.icon === undefined ? {} : { icon: this.icon }),
    }
  }
}
