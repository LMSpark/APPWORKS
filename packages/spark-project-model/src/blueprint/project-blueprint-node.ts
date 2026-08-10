/**
 * @module @spark-appworks/spark-project-model:blueprint/project-blueprint-node
 * 职责：项目蓝图节点、运行交付投影与页面身份闭包契约。
 * 边界：只表达项目/页面配置领域模型；不渲染组件，不绕过 pageDesign 四文件链路。
 * AI用途：规划蓝图或理解 ProjectModel/ProjectWorkspace 时定位本模块。
 *
 * 基 class 按 nodeKind 选择 ConfigPageNode 等子类；ProjectBlueprintTreeNodeData 仅为序列化形状。
 */
import * as SparkUtils from '@spark-appworks/spark-utils'
import type { ProjectBlueprintNodeKind } from '@spark-appworks/spark-utils'

export function normalizePid(v: string | null | undefined): string { return v?.trim() ?? '' }

export function readProjectNodeDescription(node: ProjectBlueprintTreeNodeData | null | undefined): string {
  return node?.description?.trim() ?? ''
}

export function formatProjectDescriptionContext(context: readonly ProjectDescriptionContext[]): string {
  return context.map(item => `${item.title}: ${item.description}`).join('\n')
}

export type ProjectBlueprintNodeFamily = 'module' | 'config-page' | 'system-page' | 'system-action' | 'link' | 'ref'

/** pageDesign 实现放行闸门；缺省过渡期为 open（runner 可 strictImplGate）。 */
export type ProjectBlueprintImplGate = 'closed' | 'open'

/** Project Description Context 的运行上下文。 */
export type ProjectDescriptionContext = {
  /** 上下文来源节点 ID。 */
  nodeId: string
  /** 上下文来源节点标题。 */
  title: string
  /** 上下文来源节点类型。 */
  nodeKind: string
  /** 上下文来源节点描述文本。 */
  description: string
}

/** 项目树节点的可序列化数据形状。 */
export type ProjectBlueprintTreeNodeData = {
  /** 项目蓝图节点唯一 ID。 */
  id: string
  /** 项目蓝图节点标题。 */
  title: string
  /** 节点业务描述，供 AI 策划和页面设计理解用途。 */
  description?: string | undefined
  /** 节点策划详细说明附件引用；正文由工作区解析后传给 LLM。 */
  planningAttachmentRef?: string | undefined
  /** 节点版本号或版本标签。 */
  version?: string | undefined
  /** 节点图标名。 */
  icon?: string | undefined
  /** 运行交付投影类型，决定菜单、页面、链接、引用等输出行为。 */
  nodeKind?: SparkUtils.RuntimeNavigationItemKind | undefined
  /** 蓝图业务种类；nodeKind 仅是旧设计器的运行表面投影。 */
  blueprintKind?: ProjectBlueprintNodeKind | undefined
  /** 子节点在应用壳中的布局区域。 */
  childPlacement?: SparkUtils.NavigationPlacement | undefined
  /** 项目蓝图上下文配置或静态上下文选项。 */
  context?: string | SparkUtils.ContextItem[] | SparkUtils.NavigationContextConfig | undefined
  /** 同级排序值，数值越小越靠前。 */
  order?: number | undefined
  /** 输出为运行菜单时是否隐藏。 */
  hidden?: boolean | undefined
  /** 输出为运行菜单时是否禁用。 */
  disabled?: boolean | undefined
  /** 是否在该节点后显示分隔线。 */
  dividerAfter?: boolean | undefined
  /** 权限不匹配时的展示策略。 */
  permissionMode?: SparkUtils.PermissionMode | undefined
  /** 子蓝图节点。 */
  children?: ProjectBlueprintTreeNodeData[] | undefined
  /** 页面路由路径。 */
  path?: string | undefined
  /** 页面消费的数据空间身份；不得由物理表名或 FormKey 推断。 */
  dataSpaceId?: string | undefined
  /** 具体页面载体进入数据空间时使用的后端 FormKey。 */
  formKey?: string | undefined
  /** 页面在数据空间内消费的唯一前端模型身份。 */
  modelId?: string | undefined
  /** link 节点的打开目标。 */
  linkTarget?: SparkUtils.NavigationLinkTarget | undefined
  /** 重定向目标路径。 */
  redirect?: string | undefined
  /** ref 节点引用的目标节点 ID。 */
  refId?: string | undefined
  /** ref 节点解析后的目标路径。 */
  refPath?: string | undefined
  /** ref 节点引用的目标项目 ID。 */
  refProjectId?: string | undefined
  /** ref 引用是否已失效。 */
  refBroken?: boolean | undefined
  /** pageDesign 实现放行闸门；缺省过渡期为 open。 */
  implGate?: ProjectBlueprintImplGate | undefined
  /** 上游 iPaaS / 契约就绪；缺省 true。 */
  upstreamContractsSatisfied?: boolean | undefined
}

export type ProjectBlueprintNodePatch = {
  /** 新标题。 */
  title: string
  /** 新蓝图业务类型；不得由运行交付投影推断。 */
  blueprintKind?: ProjectBlueprintNodeKind | undefined
  /** 新节点类型。 */
  nodeKind?: SparkUtils.RuntimeNavigationItemKind | undefined
  /** 新图标名。 */
  icon?: string | undefined
  /** 是否在节点后显示分隔线。 */
  dividerAfter?: boolean | undefined
  /** 新节点描述。 */
  description?: string | undefined
  /** 新策划详细说明附件引用。 */
  planningAttachmentRef?: string | undefined
  /** 新路由路径。 */
  path?: string | undefined
  /** link 节点新打开目标。 */
  linkTarget?: string | undefined
  /** 新子节点布局区域。 */
  childPlacement?: string | undefined
  /** 新同级排序值。 */
  order?: number | undefined
  /** 是否隐藏节点。 */
  hidden?: boolean | undefined
  /** 是否禁用节点。 */
  disabled?: boolean | undefined
  /** 新 ref 目标节点 ID。 */
  refId?: string | undefined
  /** 新权限展示策略。 */
  permissionMode?: SparkUtils.PermissionMode | undefined
  /** 新项目蓝图上下文配置。 */
  context?: string | SparkUtils.ContextItem[] | SparkUtils.NavigationContextConfig | undefined
  /** 新 pageDesign 实现放行闸门。 */
  implGate?: ProjectBlueprintImplGate | undefined
  /** 新上游契约就绪状态。 */
  upstreamContractsSatisfied?: boolean | undefined
}

export type ProjectBlueprintTreeNodeLocation = {
  /** 命中的节点数据。 */
  node: ProjectBlueprintTreeNodeData
  /** 父节点数据；根节点无父级时为 null。 */
  parent: ProjectBlueprintTreeNodeData | null
  /** 父节点 ID；根节点无父级时为 null。 */
  parentId: string | null
  /** 节点在父级 children 中的索引。 */
  index: number
}

export function isProjectBlueprintTreeNodeData(value: unknown): value is ProjectBlueprintTreeNodeData {
  if (!SparkUtils.isRecord(value)) return false
  if (typeof value['id'] !== 'string') return false
  if (typeof value['title'] !== 'string') return false
  const children = value['children']
  return children === undefined || (Array.isArray(children) && children.every(isProjectBlueprintTreeNodeData))
}

/** 项目模型的可序列化根数据。 */
export type ProjectBlueprintTreeData = Omit<ProjectBlueprintTreeNodeData, 'id' | 'nodeKind' | 'children' | 'childPlacement'> & {
  /** 项目根节点 ID。 */
  id?: string | undefined
  /** 项目根节点类型。 */
  nodeKind?: 'module' | 'system-directory' | undefined
  /** 项目标题。 */
  title: string
  /** 项目根节点子级布局区域。 */
  childPlacement: SparkUtils.NavigationRootPlacement
  /** 项目蓝图根级子节点。 */
  children: ProjectBlueprintTreeNodeData[]
  /** 项目首页路径。 */
  homePath?: string | undefined
}

/** 蓝图交付页面在模型侧的页面表面（不携带应用框架实现细节）。 */
export type ProjectPageSurface =
  | 'config-files'
  | 'system-page'
  | 'link'
  | 'ref'
  | 'none'

export type ProjectPageNodeSummary = Record<string, unknown> & {
  /** 配置页 pageId。 */
  pageId: string
  /** 页面路由路径。 */
  path: string
  /** 页面标题。 */
  title: string
  /** 项目蓝图节点 ID。 */
  nodeId: string
  /** 运行交付投影类型。 */
  nodeKind: SparkUtils.RuntimeNavigationItemKind
  /** 模型侧编辑表面：config-files=四文件；system-page=系统页；none=不可编辑页面文件 */
  designSurface: ProjectPageSurface
  /** 页面节点自身描述。 */
  description: string
  /** 页面节点策划详细说明附件引用。 */
  planningAttachmentRef?: string
  /** 从祖先或上下文节点继承的描述列表。 */
  descriptionContext: ProjectDescriptionContext[]
  /** 聚合后的有效描述文本，供 AI 理解页面意图。 */
  effectiveDescription: string
  /** 实现放行闸门；缺省过渡期为 open（runner 可 strictImplGate）。 */
  implGate?: ProjectBlueprintImplGate
  /** 上游 iPaaS / 契约就绪；缺省 true。 */
  upstreamContractsSatisfied?: boolean
  /** 页面图标名。 */
  icon?: string
}

/** Project Node Model Options 的调用配置。 */
export type ProjectBlueprintNodeModelOptions = {
  /** 当前项目蓝图节点数据快照。 */
  node: ProjectBlueprintTreeNodeData
  /** 父节点 ID；根级节点传空字符串。 */
  pid: string
  /** 祖先或上下文描述链。 */
  descriptionContext?: readonly ProjectDescriptionContext[]
}

function cloneProjectBlueprintTreeNodeData(node: ProjectBlueprintTreeNodeData): ProjectBlueprintTreeNodeData {
  const cloned = SparkUtils.deepClone(node)
  delete cloned.children
  return cloned
}

/**
 * 项目蓝图节点基类。
 */
export class ProjectBlueprintNode {
  #node: ProjectBlueprintTreeNodeData
  #pid: string
  #descriptionContext: ProjectDescriptionContext[]

constructor(options: ProjectBlueprintNodeModelOptions) {
    this.#node = cloneProjectBlueprintTreeNodeData(options.node)
    this.#pid = normalizePid(options.pid)
    this.#descriptionContext = [...(options.descriptionContext ?? [])]
  }

  /** 节点模型族，用于把蓝图交付投影映射到具体领域模型。 */
  get family(): ProjectBlueprintNodeFamily {
    if (this.nodeKind === 'system-page') return 'system-page'
    if (this.nodeKind === 'system-action') return 'system-action'
    if (this.nodeKind === 'link') return 'link'
    if (this.nodeKind === 'ref') return 'ref'
    return 'module'
  }
toNodeData(): ProjectBlueprintTreeNodeData { return cloneProjectBlueprintTreeNodeData(this.#node) }

  /** 蓝图编辑只能通过 class API 提交；DTO 快照不可作为包内可变真源。 */
  applyBlueprintPatch(patch: ProjectBlueprintNodePatch): void {
    const next = cloneProjectBlueprintTreeNodeData(this.#node)
    if (!('icon' in patch)) delete next.icon
    if (!('description' in patch)) delete next.description
    if (!('path' in patch)) delete next.path
    if (!('linkTarget' in patch)) delete next.linkTarget
    if (!('childPlacement' in patch)) delete next.childPlacement
    if (!('hidden' in patch)) delete next.hidden
    if (!('disabled' in patch)) delete next.disabled
    if (!('context' in patch)) delete next.context
    if (!('dividerAfter' in patch)) delete next.dividerAfter
    if (!('blueprintKind' in patch)) delete next.blueprintKind
    if (!('nodeKind' in patch)) delete next.nodeKind
    if (!('refId' in patch)) delete next.refId
    if (!('permissionMode' in patch)) delete next.permissionMode
    if (!('planningAttachmentRef' in patch)) delete next.planningAttachmentRef
    if (!('implGate' in patch)) delete next.implGate
    if (!('upstreamContractsSatisfied' in patch)) delete next.upstreamContractsSatisfied

    Object.assign(next, SparkUtils.deepClone(patch))

    if (!next.icon) delete next.icon
    if (!next.description) delete next.description
    if (!next.planningAttachmentRef) delete next.planningAttachmentRef
    if (!next.path) delete next.path
    if (next.nodeKind !== 'link' || !next.linkTarget) delete next.linkTarget
    if (!next.childPlacement) delete next.childPlacement
    if (!next.hidden) delete next.hidden
    if (!next.disabled) delete next.disabled
    if (next.context === undefined || next.context === '') delete next.context
    if (!next.dividerAfter) delete next.dividerAfter
    if (next.nodeKind !== 'ref' || !next.refId) delete next.refId
    if (!next.implGate) delete next.implGate
    if (next.upstreamContractsSatisfied !== false) delete next.upstreamContractsSatisfied
    this.#node = next
  }

  /**
   * 父节点 ID；根级节点为 ''。
   */
  get pid(): string { return this.#pid }

  /**
   * 节点 ID。
   */
  get id(): string { return this.#node.id }

  /**
   * 节点名称。
   */
  get name(): string { return this.#node.title }

  /** 节点标题。 */
  get title(): string { return this.#node.title }
  /** 节点版本号或版本标签。 */
  get version(): string | undefined { return this.#node.version }
  /** 节点类型，未配置时按普通 page 处理。 */
  get nodeKind(): SparkUtils.RuntimeNavigationItemKind { return this.#node.nodeKind ?? 'page' }
  /** 节点路由路径。 */
  get path(): string | undefined { return this.#node.path }
  /** 页面消费的数据空间身份。 */
  get dataSpaceId(): string | undefined { return this.#node.dataSpaceId }
  /** 页面载体的后端 FormKey。 */
  get formKey(): string | undefined { return this.#node.formKey }
  /** 数据空间内的前端模型身份。 */
  get modelId(): string | undefined { return this.#node.modelId }
  /** 节点图标名。 */
  get icon(): string | undefined { return this.#node.icon }
  /** 是否在节点后显示分隔线。 */
  get dividerAfter(): boolean { return this.#node.dividerAfter === true }
  /** 子节点布局区域。 */
  get childPlacement(): SparkUtils.NavigationPlacement | undefined { return this.#node.childPlacement }
  /** link 节点的打开目标。 */
  get linkTarget(): ProjectBlueprintTreeNodeData['linkTarget'] | undefined { return this.#node.linkTarget }
  /** 节点是否隐藏。 */
  get hidden(): boolean { return this.#node.hidden === true }
  /** 节点是否禁用。 */
  get disabled(): boolean { return this.#node.disabled === true }
  /** 同级排序值，未配置时为 0。 */
  get order(): number { return typeof this.#node.order === 'number' ? this.#node.order : 0 }
  /** ref 节点引用的目标节点 ID。 */
  get refId(): string | undefined { return this.#node.refId }
  /** ref 节点解析后的目标路径。 */
  get refPath(): string | undefined { return this.#node.refPath }
  /** ref 节点引用的目标项目 ID。 */
  get refProjectId(): string | undefined { return this.#node.refProjectId }
  /** ref 引用是否已失效。 */
  get refBroken(): boolean | undefined { return this.#node.refBroken }
  /** 项目蓝图上下文配置或选项。 */
  get context(): ProjectBlueprintTreeNodeData['context'] { return this.#node.context }
  /** 权限不匹配时的展示策略。 */
  get permissionMode(): SparkUtils.PermissionMode | undefined { return this.#node.permissionMode }
  /** 节点策划详细说明附件引用。 */
  get planningAttachmentRef(): string | undefined { return this.#node.planningAttachmentRef }
  /** pageDesign 实现放行闸门。 */
  get implGate(): ProjectPageNodeSummary['implGate'] { return this.#node.implGate }
  /** 上游契约是否已就绪。 */
  get upstreamContractsSatisfied(): boolean | undefined { return this.#node.upstreamContractsSatisfied }

  /**
   * 节点描述。
   */
  get description(): string { return readProjectNodeDescription(this.#node) }

  protected get effectiveDescription(): string { return formatProjectDescriptionContext(this.#descriptionContext) }
  protected get descriptionContext(): ProjectDescriptionContext[] { return [...this.#descriptionContext] }
    /** 重新绑定项目蓝图节点快照。 */
rebindBlueprintNode(node: ProjectBlueprintTreeNodeData, pid: string, descriptionContext: readonly ProjectDescriptionContext[]): void {
    this.#node = cloneProjectBlueprintTreeNodeData(node)
    this.#pid = normalizePid(pid)
    this.#descriptionContext = [...descriptionContext]
  }
}
