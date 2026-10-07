/**
 * @module app:views/app/workflow-designs/workflow-design-view-types
 * 职责：WorkflowDesigns 视图内部的画布、属性面板、ClassModel 选项与结构化字段类型。
 * 边界：只声明类型，不含运行逻辑；仅供 WorkflowDesigns 视图及同目录模块使用。
 * AI用途：修改工作流设计页的节点、连线、面板或表单数据形状时，从本模块定位类型。
 */
import type { CSSProperties } from 'vue'
import type { Connection, MarkerType, Node, Position } from '@vue-flow/core'
import type { WorkflowDesignDocument, WorkflowDesignLineEndpoint, WorkflowDesignLineControlPoint, WorkflowDesignLineType, WorkflowDesignLineView, WorkflowDesignGraphView, WorkflowDesignNodeCreateKind } from '@/services/workflow-designs'

/** 属性面板当前显示的目标类型：工作流整体属性、节点属性或连线属性 */
export type PropertyDrawerTarget = 'workflow' | 'node' | 'line'

/** 页面左右侧边栏拖拽调整的临时状态，记录拖拽起点和初始宽度 */
export type LayoutResizeState = {
  /** 调整的方向（左侧边栏或右侧边栏） */
  side: 'left' | 'right'
  /** 拖拽起点的客户端 X 坐标 */
  startClientX: number
  /** 拖拽开始时左侧边栏的宽度 */
  startLeftWidth: number
  /** 拖拽开始时右侧边栏的宽度 */
  startRightWidth: number
}

/** 画布上下分割面板的折叠状态，null 表示两个面板都展开 */
export type GraphSplitCollapse = 'top' | 'bottom' | null

/** 画布上下分割面板拖拽调整的临时状态 */
export type GraphSplitResizeState = {
  /** 分割面板容器的顶部位置 */
  containerTop: number
  /** 分割面板容器的总高度 */
  containerHeight: number
  /** 是否在拖拽过程中移动过位置 */
  moved: boolean
}

/** 画布分割面板的结构，包含主图和子图两个面板 */
export type GraphSplitPanel = {
  /** 面板的唯一标识 */
  key: string
  /** 面板角色：主图面板或子图面板 */
  role: 'main' | 'child'
  /** 该面板关联的工作流设计图视图，null 时表示面板未初始化 */
  graphView: WorkflowDesignGraphView | null
  /** 面板是否已折叠 */
  collapsed: boolean
}

/** 画布节点的业务数据，包含标题、类型、模型及验证信息 */
export type WorkflowFlowNodeData = {
  /** 节点的视图唯一标识 */
  viewKey: string
  /** 节点在画布上显示的标题 */
  title: string
  /** 设计稿节点类型（node / start / output） */
  nodeType: string
  /** 节点在工作流中的作用域路径 */
  scopePath: string
  /** 是否为业务节点（关联了 ClassModel 模型） */
  isBusinessNode: boolean
  /** 是否为边界节点（start 或 output） */
  isBoundaryNode: boolean
  /** 业务节点绑定的 ClassModel 模型类名 */
  modelClassName: string
  /** 模型类的 JSDoc 文档摘要 */
  modelDocText: string
  /** 节点的验证逻辑对应的方法名 */
  validationActionName: string
  /** 验证方法的 JSDoc 文档摘要 */
  validationActionDocText: string
}

/** 画布连线的业务数据，包含类型、控制点及运行时状态 */
export type WorkflowFlowLineData = {
  /** 连线的唯一标识 */
  lineKey: string
  /** 连线路径风格（orthogonal / straight / bezier） */
  lineType: WorkflowDesignLineType
  /** 连线的路径控制点序列（用于自定义连线弯曲） */
  controlPoints: readonly WorkflowDesignLineControlPoint[]
  /** 连线在工作流执行时的运行状态 */
  runtimeStatus: WorkflowLineRuntimeStatus
}

/** 连线在工作流运行时的执行状态 */
export type WorkflowLineRuntimeStatus = 'idle' | 'running' | 'completed' | 'failed' | 'skipped'

/** vue-flow 连线的渲染插槽数据，包含端点坐标、样式及业务数据 */
export type WorkflowControlEdgeSlot = Readonly<{
  /** 连线的唯一标识 */
  id: string
  /** 起点的 X 坐标 */
  sourceX: number
  /** 起点的 Y 坐标 */
  sourceY: number
  /** 终点的 X 坐标 */
  targetX: number
  /** 终点的 Y 坐标 */
  targetY: number
  /** 箭头标记的 CSS class 或 ID */
  markerEnd?: string
  /** 连线的 CSS 样式对象 */
  style?: CSSProperties
  /** 连线的业务数据 */
  data: WorkflowFlowLineData
}>

/** 节点端口的定义，包括位置和样式 */
export type WorkflowDockDefinition = Readonly<{
  /** 端口的唯一标识 */
  id: number
  /** 端口在节点上的相对位置（上/下/左/右） */
  position: Position
  /** 端口的 CSS 样式 */
  style: CSSProperties
}>

/** 用户在画布上选中的连线控制点 */
export type SelectedControlPoint = Readonly<{
  /** 所属连线的标识 */
  lineKey: string
  /** 控制点在该连线上的序列号 */
  index: number
}>

/** 用户拖拽连线控制点时的临时状态 */
export type ControlPointDragState = Readonly<{
  /** 被拖拽的控制点所属连线的标识 */
  lineKey: string
  /** 被拖拽的控制点在该连线上的序列号 */
  index: number
  /** 连线所在的图结构 */
  graph: WorkflowDesignGraphView['graph']
  /** 拖拽起点的客户端 X 坐标 */
  startClientX: number
  /** 拖拽起点的客户端 Y 坐标 */
  startClientY: number
  /** 拖拽前控制点的原始位置 */
  startPoint: WorkflowDesignLineControlPoint
}>

/** 用户开始拖拽连线控制点的命令 */
export type StartControlPointDragCommand = Readonly<{
  /** 触发拖拽的指针事件 */
  event: PointerEvent
  /** 被拖拽的控制点所属连线的业务数据 */
  data: WorkflowFlowLineData
  /** 被拖拽的控制点在连线上的索引 */
  index: string | number
  /** 连线所在的图视图 */
  graphView: WorkflowDesignGraphView
}>

/** vue-flow 连线变更事件 */
export type VueFlowLineChange = Readonly<{
  /** 变更的连线 ID */
  id?: string
  /** 变更类型（如 select/remove 等） */
  type: string
  /** 连线是否被选中 */
  selected?: boolean
}>

/** vue-flow 连线更新事件 */
export type VueFlowLineUpdateEvent = Readonly<{
  /** 连线的数据和属性 */
  edge: {
    /** 连线的业务数据 */
    data?: unknown
  }
  /** 连线的源点和目标点连接信息 */
  connection: Connection
}>

/** 业务类的方法选项，用于展示在编辑器中 */
export type ClassModelMethodOption = {
  /** 方法名 */
  name: string
  /** 方法的 JSDoc 注释（原始格式） */
  jsdoc: string
  /** 方法的摘要文本 */
  summary: string
  /** 方法的签名（包含参数和返回类型） */
  signature: string
}

/** 业务类的属性选项，用于展示在编辑器中 */
export type ClassModelAttributeOption = {
  /** 属性名 */
  name: string
  /** 属性的 JSDoc 注释（原始格式） */
  jsdoc: string
  /** 属性的摘要文本 */
  summary: string
  /** 属性的类型描述文本 */
  typeText: string
}

/** 业务类的构造器选项，用于展示在编辑器中 */
export type ClassModelConstructorOption = {
  /** 构造器的 JSDoc 注释（原始格式） */
  jsdoc: string
  /** 构造器的摘要文本 */
  summary: string
  /** 构造器的完整签名（包含参数） */
  signature: string
}

/** 业务类的完整模型选项，包括属性、方法和构造器 */
export type ClassModelOption = {
  /** 类的种类名称 */
  kind: string
  /** 类的 JSDoc 注释（原始格式） */
  jsdoc: string
  /** 类的摘要文本 */
  summary: string
  /** 构造器选项，null 表示无指定构造器 */
  constructorSignature: ClassModelConstructorOption | null
  /** 该类的所有属性选项 */
  attributes: ClassModelAttributeOption[]
  /** 该类的所有方法选项 */
  methods: ClassModelMethodOption[]
}

/** vue-flow 画布节点类型，绑定了工作流节点业务数据 */
export type WorkflowFlowNode = Node<WorkflowFlowNodeData, Record<string, never>, 'workflow'>

/** vue-flow 画布连线类型，绑定了工作流连线业务数据 */
export type WorkflowFlowConnection = {
  /** 连线的唯一标识 */
  id: string
  /** 连线的类型标记（固定为 workflow-control） */
  type: 'workflow-control'
  /** 源节点的 ID */
  source: string
  /** 目标节点的 ID */
  target: string
  /** 源节点的连接点 handle ID */
  sourceHandle?: string
  /** 目标节点的连接点 handle ID */
  targetHandle?: string
  /** 连线末端的箭头标记类型 */
  markerEnd: MarkerType
  /** 连线的业务数据 */
  data: WorkflowFlowLineData
}

/** 校验连线新端点是否合法的命令（非空、同图、非自环、不重复） */
export type LineEndpointPatchValidationCommand = Readonly<{
  /** 被修改的连线视图 */
  line: WorkflowDesignLineView
  /** 待写入的起点端点 */
  from: WorkflowDesignLineEndpoint
  /** 待写入的终点端点 */
  to: WorkflowDesignLineEndpoint
  /** 校验选项 */
  options: {
    /** 为 true 时校验失败不弹警告消息 */
    silent?: boolean
  }
}>

/** 创建新节点的表单数据 */
export type NodeCreateForm = {
  /** 新节点所属的图标识 */
  graphKey: string
  /** 新节点类型（node / start / output） */
  nodeKind: WorkflowDesignNodeCreateKind
  /** 新节点的 ID */
  id: string
  /** 新节点的标题 */
  title: string
  /** 新节点的描述 */
  desc: string
}

/** 结构化字段的值类型 */
export type StructuredValueKind = 'text' | 'number' | 'boolean' | 'reference'

/** 结构化表单中的一行字段数据 */
export type StructuredFieldRow = {
  /** 该行的唯一标识 */
  id: string
  /** 字段的 JSON 路径或字段名 */
  path: string
  /** 字段值的类型（文本/数字/布尔/引用） */
  valueKind: StructuredValueKind
  /** 字段的文本值 */
  valueText: string
  /** 字段的布尔值 */
  valueBoolean: boolean
}

/** 递归展开结构化值为字段行的命令：按路径遍历对象/数组，叶子写入 rows */
export type StructuredRowsCollectionCommand = Readonly<{
  /** 当前递归到的值 */
  value: unknown
  /** 当前值的点分路径 */
  path: string
  /** 收集结果的字段行数组（原地追加） */
  rows: StructuredFieldRow[]
  /** 生成行 ID 的前缀 */
  prefix: string
}>

/** 编辑连线端点（绑定业务类成员）的命令 */
export type EditorLineEndpointCommand = Readonly<{
  /** 连接的节点 ID */
  nodeId: string
  /** 节点绑定的业务类模型 ID */
  modelId: string
  /** 连接到的成员名（属性或方法） */
  memberName: string
  /** 该连接在节点上显示的端口号文本 */
  dockText: string
}>

/** 结构化表单中的选择卡片（如能力选择） */
export type StructuredSelectCard = {
  /** 卡片的唯一标识 */
  id: string
  /** 卡片的选中值 */
  value: string
}

/** 结构化表单中的能力卡片（包含输入/输出字段和约束） */
export type StructuredCapabilityCard = {
  /** 卡片的唯一标识 */
  id: string
  /** 能力的名称/标题 */
  title: string
  /** 能力的作用域 */
  scope: string
  /** 能力的描述文本 */
  description: string
  /** 能力的输入字段集合 */
  inputRows: StructuredFieldRow[]
  /** 能力的输出字段集合 */
  outputRows: StructuredFieldRow[]
  /** 能力的约束条件选择卡片集合 */
  constraintCards: StructuredSelectCard[]
}

/** 应用结构化编辑器的选项 */
export type ApplyStructuredEditorOptions = {
  /** 是否以静默模式执行（不触发通知） */
  silent?: boolean
}

/** 工作流变量编辑器的一行数据 */
export type WorkflowVariableEditorRow = {
  /** 变量的唯一标识 */
  id: string
  /** 变量的原始数据来源 */
  source: Record<string, unknown>
  /** 变量的 JSON Schema 约束 */
  schema: Record<string, unknown>
  /** 变量名 */
  name: string
  /** 变量的显示标题 */
  title: string
  /** 变量的文档描述 */
  docText: string
  /** 变量是否必填 */
  required: boolean
  /** 变量的数据类型（如 string/number/object 等） */
  schemaType: string
  /** 变量的默认值 */
  defaultValue: unknown
  /** 变量默认值的文本表示 */
  defaultValueText: string
  /** 默认值是否可编辑 */
  defaultValueEditable: boolean
}

/** 工作流元数据的一行显示数据 */
export type WorkflowMetadataRow = {
  /** 元数据的标签名 */
  label: string
  /** 元数据的值 */
  value: string
}

/** 工作流运行时绑定配置（运行时执行时的上下文绑定） */
export type WorkflowRuntimeBinding = NonNullable<WorkflowDesignDocument['workflow']['runtimeBinding']>
