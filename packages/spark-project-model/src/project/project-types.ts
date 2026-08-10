/**
 * @module @spark-appworks/spark-project-model:project/project-types
 * 职责：提供项目模型层 project-types 契约，处理项目蓝图、页面文件、配置内容、工作区与远端 IO。
 * 边界：只表达项目/页面配置领域模型，不直接渲染组件，也不绕过 pageDesign 四文件链路。
 * AI用途：规划项目蓝图、读写 page files 或理解 ProjectModel/ProjectWorkspace 行为时，用本模块定位 project/project-types。
 */
import type {
  ProjectBlueprintTreeData,
  ProjectBlueprintTreeNodeData,
  ProjectBlueprintTreeNodeLocation,
  ProjectBlueprintNodeKind,
  ProjectBlueprintDeliveryKind,
  ProjectPageNodeSummary,
} from '../blueprint/project-blueprint-node'
import type { BlueprintNodeDraft } from '../blueprint/project-blueprint-edit'
import type { PageNodeFileName } from '../page/page-file'

export type ProjectBlueprintDirtyScope = 'node' | 'root'

/** Project Model Event 的事件载荷。 */
export type ProjectModelEvent =
  | {
      type: 'blueprint.changed'
      projectId: string
      revision: number
      scope: ProjectBlueprintDirtyScope
      nodeId?: string
    }
  | {
      type: 'selection.changed'
      projectId: string
      revision: number
      nodeId: string | null
      pageId: string | null
    }
  | {
      type: 'page.file.changed'
      projectId: string
      revision: number
      pageId: string
      fileName: PageNodeFileName
    }
  | {
      type: 'runtime.changed'
      projectId: string
      revision: number
      pageId?: string
    }

export type ProjectModelEventListener = (event: ProjectModelEvent) => void

/** Project Page File Write Command 的命令参数。 */
export type ProjectPageFileWriteCommand = {
  /** 目标配置页 pageId；省略时使用当前 activePage。 */
  pageId?: string | undefined
  /** 要写入的页面四文件名。 */
  fileName: PageNodeFileName
  /** 新的文件文本内容，只写入内存模型，落盘由工作区编排。 */
  text: string
}

export type ProjectBlueprintProjection = {
    /** 完整项目蓝图。 */
blueprint: ProjectBlueprintTreeData
    /** 蓝图树节点投影。 */
tree: ProjectBlueprintTreeNodeData[]
    /** selected Node 字段。 */
selectedNode: ProjectBlueprintTreeNodeData | null
    /** selected Node Id 标识。 */
selectedNodeId: string | null
    /** 当前节点在项目蓝图中的位置。 */
blueprintLocation: ProjectBlueprintTreeNodeLocation | null
    /** 当前项目蓝图节点编辑草稿。 */
blueprintDraft: BlueprintNodeDraft | null
    /** 可交付页面投影。 */
pageDeliveries: ProjectPageNodeSummary[]
}

export type ProjectActivePageProjection = {
    /** page Id 标识。 */
pageId: string
    /** rule Json 字段。 */
ruleJson: string
    /** page Data Json 字段。 */
pageDataJson: string
    /** script 字段。 */
script: string
    /** style 字段。 */
style: string
    /** parse Errors 字段。 */
parseErrors: Record<PageNodeFileName, string | null>
    /** 是否 is Loaded。 */
isLoaded: boolean
}

export type ProjectDirtyProjection = {
    /** dirty Files 字段。 */
dirtyFiles: Set<PageNodeFileName>
    /** 是否 has Any File Dirty。 */
hasAnyFileDirty: boolean
    /** 项目蓝图是否存在未保存变更。 */
blueprintDirty: boolean
    /** 是否 has Any Dirty。 */
hasAnyDirty: boolean
}

/** 项目级策划输入：短需求 + 可选详细说明附件引用。 */
export type ProjectPlanningInput = Readonly<{
  /** 项目级短需求；优先项目蓝图根节点 description，否则 project.description。 */
  requirement: string
  /** 策划详细说明附件引用；正文由工作区解析后传给 LLM。 */
  planningAttachmentRef?: string
}>

/** 单个项目蓝图节点策划输入：节点 description + 可选附件引用。 */
export type BlueprintPlanningInput = Readonly<{
  /** 目标项目蓝图节点 ID。 */
  nodeId: string
  /** 节点标题；用于 LLM 策划上下文中标识节点语义。 */
  title: string
  /** 蓝图业务类型；未知时必须为 unresolved，不能按路径或层级猜测。 */
  blueprintKind: ProjectBlueprintNodeKind
  /** 可选运行交付投影类型，不代表蓝图业务类型。 */
  nodeKind: ProjectBlueprintDeliveryKind
  /** 节点短需求，即项目蓝图节点 description。 */
  requirement: string
  /** 策划详细说明附件引用；省略时仅使用 requirement。 */
  planningAttachmentRef?: string
}>

/** 项目策划完成动作输入；由 agent_complete 转发到领域模型。 */
export type ProjectPlanningCompletionInput = Readonly<{
  /** 策划完成摘要；由 LLM 生成，归纳整个策划过程的结论。 */
  summary?: string
}>

/** 项目策划完成动作结果；失败结果会回灌给 LLM 继续补查/补执行。 */
export type ProjectPlanningCompletionResult = Readonly<{
  ok: true
  completed: true
  summary: string
  nodeCount: number
  blueprintKinds: readonly ProjectBlueprintNodeKind[]
}> | Readonly<{
  ok: false
  code: string
  msg: string
  fix: string
  /** 领域模型需要的业务能力名；由 AI runtime 的知识体系翻译为具体查询和代理执行步骤。 */
  requiredCapabilities?: readonly string[]
  missingFacts?: readonly string[]
  nextStep?: string
}>

export type ProjectInfo = {
  /** 租户 ID；多租户环境下用于隔离项目。 */
  tenantId?: string | undefined
  /** 项目唯一 ID。 */
  projectId: string
  /** 项目名称。 */
  name: string
  /** 项目类型标识。 */
  projectType: string
  /** 项目图标名。 */
  icon?: string | undefined
  /** 项目描述，供项目蓝图、规划和 AI 设计理解项目目标。 */
  description: string
  /** 策划详细说明附件引用（文件 ID / 工作区路径等，由 IO 层约定）。 */
  planningAttachmentRef?: string | undefined
  /** 项目首页交付节点 ID。 */
  homeNodeId?: string | undefined
  /** 项目排序值。 */
  order: number
  /** 项目创建时间。 */
  createdAt?: string | undefined
  /** 项目更新时间。 */
  updatedAt?: string | undefined
}

/** Project Info Input 的输入数据。 */
export type ProjectInfoInput = Partial<Omit<ProjectInfo, 'projectId'>> & {
  /** 可选项目 ID；未提供时由 ProjectModel 构造参数补齐。 */
  projectId?: string | undefined
}

/** 纯领域构造参数（无 IO）。 */
export type ProjectModelInitOptions = {
  /** 当前 ProjectModel 绑定的项目 ID。 */
  projectId: string
  /** 可选项目基础信息；缺省字段由 ProjectModel 使用默认值补齐。 */
  project?: ProjectInfoInput | undefined
}
