/**
 * @module @spark-appworks/spark-component:ai/types
 * 职责：定义 types 相关的内部类型契约，支撑渲染器、props、zero-code 和运行时状态协作。
 * 边界：只描述 component-runtime 的类型结构，不直接渲染界面，也不发起数据请求。
 * AI用途：跨文件修改 types 行为或补齐配置类型时，用本模块确认共享类型边界。
 */
/**
 * AI 会话监视组件 — 共享领域类型（SSOT）。
 *
 * StreamDisplayEntry、ToolCallDisplayItem、ReasoningDisplayItem
 * 等流展示类型只在这里定义。UI 组件只消费外部传入的展示投影。
 */

// ── 流展示条目 ──

/** 工具调用展示条目：单次 function tool 调用在 UI 流视图中的投影 */
export type ToolCallDisplayItem = Readonly<{
  /** 工具名称（如 model_script / module_action） */
  toolName: string
  /** 调用参数的截断预览文本，用于 UI 展示而非完整参数还原 */
  argsPreview: string
  /** 所属轮次 ID */
  turnId: string
  /** 工具循环轮次序号（从 1 开始） */
  round: number
  /** OpenAI function call ID，可能为 null（非 function calling 场景） */
  callId: string | null
  /** 调用结果状态：success=成功 / error=失败 */
  status: 'success' | 'error'
  /** 调用结果的截断摘要文本，可能为 null（调用尚未完成或无结果时） */
  resultSummary: string | null
  /** 调用耗时（毫秒），从发起调用到收到结果 */
  durationMs: number
}>

/** 推理过程展示条目：模型 reasoning 输出在 UI 流视图中的投影 */
export type ReasoningDisplayItem = Readonly<{
  /** 推理文本内容 */
  text: string
  /** 所属轮次 ID */
  turnId: string
  /** UI 是否默认折叠；轮次结束后自动折叠已完成的推理块 */
  collapsed: boolean
}>

/**
 * 流视图中的一条渲染条目。
 * 真正的状态机在 spark-ai，UI 只消费这个简版投影。
 */
export type StreamDisplayEntry =
  | Readonly<{ kind: 'user-message'; content: string; timestamp: number }>
  | Readonly<{ kind: 'assistant-delta'; content: string; turnId: string }>
  | Readonly<{ kind: 'assistant-complete'; content: string; turnId: string }>
  | Readonly<{ kind: 'reasoning'; item: ReasoningDisplayItem }>
  | Readonly<{ kind: 'tool-call'; item: ToolCallDisplayItem }>
  | Readonly<{ kind: 'error'; message: string; timestamp: number }>
  | Readonly<{ kind: 'system-message'; content: string; timestamp: number }>

/** AG-UI 事件 timeline 的展示投影：每条事件为摘要行，不含完整 payload */
export type SparkAgentTimelineEvent = Readonly<{
  /** 事件序号，从 1 开始递增 */
  sequence: number
  /** AG-UI 事件类型标识（如 TextMessageStart / ToolCallStart 等） */
  type: string
  /** 事件时间戳（Unix 毫秒） */
  timestamp: number
  /** 事件 payload 的截断预览文本，超出 360 字符自动截断 */
  payloadPreview: string
}>

// ── 诊断数据 ──

/** 单条诊断问题：session 级别的错误/警告/信息，由 runtime inspect 产出 */
export type SessionDiagnosticIssue = Readonly<{
  /** 诊断级别：error=阻断性 / warn=风险 / info=信息 */
  level: 'error' | 'warn' | 'info'
  /** 诊断代码标识，用于程序化匹配（如 MISSING_TOOL / INVALID_SCHEMA） */
  code: string
  /** 人类可读诊断消息 */
  message: string
  /** 可选的修复建议，引导用户解决该问题 */
  hint?: string
}>

/** 会话摘要展示投影；组件包不依赖 spark-ai 内部 session 类型。 */
export type SessionSummaryDisplayData = Readonly<{
  status: string | null
  historyCount: number
  messageCount: number
  toolCallCount: number
  failedToolCallCount: number
  functionNames: readonly string[]
  lastAssistantText: string
}>

/** 会话转写展示投影；只保留诊断面板实际展示需要的字段。 */
export type SessionTranscriptDisplayEntry = Readonly<{
  seq: number | null
  id: string
  timestamp: string | null
  kind: 'message' | 'functionCall' | 'unknown'
  direction: string
  role?: string
  source?: string
  toolName?: string
  status?: string
  content?: string
  args?: string
  result?: string
}>

/**
 * 诊断数据——永远有值（非 null）。
 * 由外部 runtime/diagnostics 层生成；UI 只渲染摘要投影，不读取完整 session。
 */
export type SessionDiagnosticsData = Readonly<{
  /** 会话摘要（含状态、开始/结束时间等） */
  summary: SessionSummaryDisplayData
  /** 完整的会话交互记录列表 */
  transcript: readonly SessionTranscriptDisplayEntry[]
  /** 诊断问题列表，由 runtime inspect 产出 */
  issues: readonly SessionDiagnosticIssue[]
}>

// ── 工具审批 ──

/**
 * 待审批工具调用的展示条目。
 * 只包含调用方映射后的展示字段，不依赖上游包类型。
 */
export type ToolApprovalDisplayItem = Readonly<{
  /** 审批条目唯一标识，用于 UI 匹配审批状态 */
  id: string
  /** 待审批的工具名称 */
  toolName: string
  /** 调用参数的截断预览文本 */
  argsPreview: string
  /** 工具所属业务模块标识，用于定位工具来源 */
  moduleId: string
}>
