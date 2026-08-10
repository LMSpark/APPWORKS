# 前端 Agent 方案调研 — AG-UI 事件层、浏览器验证、多 Agent 编排

> **研究日期**: 2026-06-14
> **关联模块**: `packages/spark-ai/src/agent/`, `packages/spark-component/src/ai/`, `src/services/ai/`
> **关联记忆**: [[dts-to-jsonschema-approaches]]

---

## 一、现状分析

### 1.1 已有的 Agent 运行时

SPARK AppWorks 已有完整的自建 AI Agent 运行时，核心组件：

```
AiAgentHost（注册/编排/运行）
  └─ AiAgentToolLoopRunner（多轮 tool loop）
       ├─ AiAgentTurnCallbacks（I/O 回调：prepareSession / executeTurn / appendMessages）
       ├─ ClassModelRuntime（7-tool 闭合工具集）
       │    ├─ model_query         — 查询 ClassModel 目录
       │    ├─ model_class_guide    — 渲染类声明
       │    ├─ model_attribute_guide — 渲染属性声明
       │    ├─ model_action_guide   — 渲染方法声明
       │    ├─ model_script         — 执行沙箱脚本
       │    ├─ human_question       — 询问用户
       │    └─ agent_complete        — 信号任务完成
       └─ AiAgentToolCallExecutor（工具调用执行 + 生命周期钩子）
```

**关键设计特征**：
- **工具生产线模式**：每轮最多 1 个 tool_call，assistant.content 必须为空，必须以 `agent_complete` 收尾
- **ClassModel 知识系统**：TypeScript 类型 → .d.ts → JSON shards → 运行时按需加载 → 7-tool 查询
- **Nudge 机制**：伪 tool_call 恢复、计划无工具 nudge、执行阶段 nudge、model_script 重试 nudge
- **生命周期钩子**：`beforeFunctionCall`（审批门）→ `executeTool` → `afterFunctionCall`（生命周期指令）
- **Delivery 系统**：`AiDeliveryPort` 提供 save / trace / rollback，支持手动/自动交付

### 1.2 已有的结构化 UI 渲染

**SparkNode** 就是本仓的结构化 UI 体系：

```
AI 生成 rule.json（SparkNode 树）
  → ConfigPageNode.setFileText("rule.json", ...)
  → SparkNodeTree.fromPageChildren(rule)
  → buildPageChildren()（绑定事件、规范化 props）
  → SparkComponentRenderer（递归解析 type → 注册表查找 → Vue 组件渲染）
  → Capability Context Tree 传播 DataSet / DataRow / Permission / PageService
```

**AI 输出的页面本身就是结构化 UI**，走的是和人工设计页面完全相同的渲染管线。缺的不是"结构化 UI 渲染能力"，而是 **Agent 会话流中的结构化交互能力**。

### 1.3 已有的 Agent UI 组件

| 组件 | 位置 | 能力 |
|------|------|------|
| `AiSessionTracePanel` | spark-component/src/ai/ | 双栏：SessionStreamView(16) + SessionDiagnosticsPanel(8) |
| `SessionStreamView` | spark-component/src/ai/ | 按 `StreamDisplayEntry.kind` 分发渲染 |
| `SessionChatBubble` | spark-component/src/ai/ | user/assistant/system/error 消息气泡 |
| `SessionToolCallCard` | spark-component/src/ai/ | 工具调用卡片（名称、参数预览、结果摘要、耗时） |
| `SessionReasoningBlock` | spark-component/src/ai/ | 可折叠推理过程（流式中展开，完成后折叠） |
| `AiToolApprovalCard` | spark-component/src/ai/ | 人工审批卡片（Allow/Reject/Abort） |

**StreamDisplayEntry** 是 AI 会话流的 UI 投影：

```typescript
type StreamDisplayEntry =
  | { kind: 'user-message'; content: string; timestamp: number }
  | { kind: 'assistant-delta'; content: string; turnId: string }
  | { kind: 'assistant-complete'; content: string; turnId: string }
  | { kind: 'reasoning'; item: ReasoningDisplayItem }
  | { kind: 'tool-call'; item: ToolCallDisplayItem }
  | { kind: 'error'; message: string; timestamp: number }
  | { kind: 'system-message'; content: string; timestamp: number }
```

### 1.4 传输协议

当前 `AiAgentTurnCallbacks` 定义了三个 I/O 操作：

| 方法 | 方向 | 传输模式 |
|------|------|----------|
| `startAgentTurn` | APP → lowcode | POST `/api/ai/turns` |
| `connect` | lowcode → APP | SSE `/api/sse/connect` |
| `appendAgentToolResults` | APP → lowcode | POST `/api/ai/sessions/{id}/turn/append` |

**方向是单向的**：APP 发请求 → 后端返回流式响应 → APP 消费事件。没有从 APP 主动推送给 Agent 的通道。

---

## 二、缺口识别

| # | 缺口 | 影响 | 开源方案对照 |
|---|------|------|-------------|
| G1 | **Agent↔前端双向交互** | 用户无法中途干预 Agent（转向/暂停）；Agent 无法请求前端执行操作（高亮/滚动/预览） | AG-UI Protocol 的 Frontend Tool Calls / Agent Steering / Shared State |
| G2 | **会话流中的结构化交互** | `human_question` 只有文本问答；Agent 无法在流中渲染动态组件（如表单、预览卡片） | AG-UI 的 Generative UI；CopilotKit 的 Generative UI |
| G3 | **Agent 产物自验证** | AI 生成页面后无法自动截图/检查，依赖人工查看 | Playwright MCP 的 accessibility snapshot / screenshot |
| G4 | **多 Agent 编排** | 单 Agent 单会话，无法实现"规划→设计→审核"流水线 | Mastra 工作流 / AG-UI Sub-agents |

---

## 三、开源方案对比

### 3.1 浏览器自动化 Agent

| 框架 | Stars | 语言 | 核心架构 | 适合本仓程度 |
|------|-------|------|----------|-------------|
| **Browser Use** | 98.7k | Python | Rust 核心 + Python API | ❌ Python 生态不兼容 |
| **Stagehand** | 23.1k | TypeScript | CDP 引擎 + act/agent/extract | ⭐ extract 能力可参考 |
| **Playwright MCP** | Microsoft 官方 | TypeScript | MCP Server + accessibility tree | ⭐⭐ 浏览器验证核心方案 |

### 3.2 前端嵌入 Agent SDK

| 框架 | Stars | 语言 | 核心架构 | 适合本仓程度 |
|------|-------|------|----------|-------------|
| **CopilotKit** | 35k | TypeScript | AG-UI Protocol + 多框架 UI | ⭐⭐ AG-UI 协议设计参考 |
| **Vercel AI SDK** | 24.9k | TypeScript | ToolLoopAgent + useChat hook | ⭐ 声明式 prompt/tool 模式参考 |
| **Mastra** | 25k | TypeScript | Agent + 图式工作流 + MCP | ⭐⭐ 工作流引擎参考 |
| **LangChain.js** | 17.8k | TypeScript | LangGraph + Deep Agents | ❌ 与 ClassModel 体系重叠 |

### 3.3 Computer Use / GUI Agent

| 方案 | 接入方式 | 适合本仓程度 |
|------|----------|-------------|
| **Claude Computer Use** | API（Beta） | ⭐ 长期回归测试可参考 |
| **OpenAI Operator** | 仅 ChatGPT 内部 | ❌ 无公开 API |

### 3.4 协议层

| 协议 | 定位 | 适合本仓程度 |
|------|------|-------------|
| **AG-UI** | Agent↔用户交互 | ⭐⭐⭐ Phase 1 核心参考 |
| **MCP** | Agent↔工具 | ⭐⭐ Phase 2 参考已有 MCP 生态 |
| **A2A** | Agent↔Agent | ⭐ Phase 3 可参考但不过度依赖 |

---

## 四、Phase 1 — AG-UI 启发的事件层

### 4.1 设计原则

1. **增量扩展**：不替换现有 transport，新增 `AiAgentToolLoopExtensions` 作为可选注入
2. **对齐 AG-UI 语义**：Frontend Tool Calls / Agent Steering / Shared State / Generative UI / HITL
3. **向后兼容**：不提供 extensions 时，tool loop 行为完全不变
4. **复用现有模式**：FrontendToolBridge 接口对齐 `AiAgentToolRuntime`；SteeringChannel 复用 `AiToolApprovalBridge` 的 Promise 阻塞模式

### 4.2 核心类型

#### 前端工具调用（Agent → 前端）

```typescript
/** 前端注册的工具 */
export type AiAgentFrontendTool = Readonly<{
  name: string
  description: string
  parameters: JsonSchemaObject
  execute(args: JsonParams, context: AiAgentFrontendToolContext): Promise<JsonValue>
}>

export type AiAgentFrontendToolContext = Readonly<{
  sessionId: string
  scope: AiAgentScope
  turnId: string
  round: number
}>

/** Agent 请求前端执行（流事件） */
export type AiAgentFrontendToolCall = Readonly<{
  callId: string
  name: string
  args: JsonParams
  context: AiAgentFrontendToolContext
}>

/** 前端返回结果 */
export type AiAgentFrontendToolResult = Readonly<{
  callId: string
  ok: boolean
  data?: JsonValue
  error?: string
}>
```

#### 用户转向（用户 → Agent）

```typescript
export type AiAgentSteeringCommand = Readonly<{
  type: 'redirect' | 'pause' | 'cancel' | 'inject-message'
  sessionId: string
  turnId: string
  payload: JsonParams
}>
```

#### 共享状态（双向）

```typescript
export type AiAgentStatePatch = Readonly<{
  path: string        // 点分路径如 'ui.selectedTab'
  op: 'set' | 'merge' | 'delete'
  value?: unknown
}>
```

### 4.3 新增文件

```
packages/spark-ai/src/agent/frontend-bridge/
  ├── frontend-tool-types.ts      — 核心类型定义
  ├── frontend-tool-bridge.ts     — 前端工具注册中心
  ├── steering-channel.ts         — 用户转向通道（Promise 队列）
  ├── shared-state-sync.ts        — 共享状态同步
  └── index.ts                    — barrel export

packages/spark-component/src/ai/components/
  └── GenerativeUiSlot.vue        — 动态组件插槽
```

### 4.4 修改文件

| 文件 | 变更 |
|------|------|
| `agent/transport/transport-types.ts` | 新增 `AiAgentToolLoopExtensions` 类型 |
| `agent/tool-loop/tool-loop-runner.ts` | 构造器接受 extensions；每轮间 drain steering；前端工具路由 |
| `agent/tool-loop/tool-call-executor.ts` | 执行前检查 frontendToolBridge，命中则路由到前端 |
| `agent/business/ai-host.ts` | CreateAiAgentHostOptions 增加 extensions |
| `agent/chat/chat-types.ts` | 新增 stream event 类型 |
| `spark-component/src/ai/types.ts` | StreamDisplayEntry 扩展 4 个 kind |
| `spark-component/src/ai/components/SessionStreamView.vue` | 新增 template 分支 |
| `src/services/ai/ai-turn-bridge.ts` | 创建 FrontendToolBridge + SteeringChannel |

### 4.5 Tool Loop 集成流程

```
                    ┌─────────────────────────────────────────┐
                    │           AiAgentToolLoopRunner          │
                    │                                         │
  User Steering ──→ │  SteeringChannel.drain()               │
                    │      ↓ prepend as user message          │
                    │                                         │
                    │  executeTurn() → LLM response           │
                    │      ↓                                  │
                    │  tool_call found?                        │
                    │      ↓                                  │
                    │  ┌─ frontendToolBridge.has(name)?       │
                    │  │   YES → bridge.executeToolCall()     │──→ Frontend
                    │  │   NO  → registration.runtime          │    executes
                    │  │         .executeTool()                │    & returns
                    │  └─                                     │←── result
                    │      ↓                                  │
                    │  SharedState.applyPatch()               │
                    │      ↓                                  │
                    │  next round or lifecycle end             │
                    └─────────────────────────────────────────┘
```

### 4.6 Generative UI 机制

1. Agent 通过 `onStreamEvent` 发出 `type: 'generative-ui'` 事件，携带 `{ componentType: 'approval-form', props: {...}, slotId }`
2. `AiAgentRunTrace` 将其映射为 `StreamDisplayEntry { kind: 'generative-ui', ... }`
3. `SessionStreamView` 渲染 `GenerativeUiSlot`
4. `GenerativeUiSlot` 从组件注册表查找 `componentType` 对应的 Vue 组件并渲染
5. 渲染出的组件可通过 SteeringChannel 回调 Agent

### 4.7 HITL 增强

现有 `human_question` 工具只有文本问答。增强方案：

1. `human_question` 的 `afterFunctionCall` 钩子发出 `generative-ui` 事件，`componentType: 'human-question-form'`
2. 表单组件展示问题、缺失事实、候选项
3. 用户填写提交 → `redirect` steering command 注入回答
4. Tool loop 下一轮 pickup 回答

---

## 五、Phase 2 — 浏览器验证

### 5.1 设计原则

1. **Provider 抽象**：定义 `AiAgentBrowserPreviewProvider` 接口，App 层实现
2. **工具集成**：`browser_preview` 作为 ClassModel 第 8 个工具
3. **渐进降级**：Playwright MCP 优先，iframe 降级
4. **验证集成**：与 Delivery Port 集成，验证结果作为交付产物

### 5.2 核心类型

```typescript
/** 浏览器预览结果 */
export type AiAgentBrowserPreviewResult = Readonly<{
  screenshots: readonly AiAgentScreenshot[]
  accessibility?: AiAgentAccessibilitySnapshot
  url?: string
  timestamp: number
}>

export type AiAgentScreenshot = Readonly<{
  mimeType: 'image/png' | 'image/jpeg'
  data: string       // base64
  viewport: Readonly<{ width: number; height: number }>
  label?: string
}>

export type AiAgentAccessibilitySnapshot = Readonly<{
  tree: AiAgentA11yNode
  violations: readonly AiAgentA11yViolation[]
}>

export type AiAgentA11yNode = Readonly<{
  role: string
  name?: string
  children?: readonly AiAgentA11yNode[]
}>

export type AiAgentA11yViolation = Readonly<{
  rule: string
  impact: 'critical' | 'serious' | 'moderate' | 'minor'
  element: string
  fix?: string
}>

/** Provider 接口 */
export type AiAgentBrowserPreviewProvider = Readonly<{
  capture(input: AiAgentBrowserPreviewInput): Promise<AiAgentBrowserPreviewResult>
  isAvailable(): boolean
}>

export type AiAgentBrowserPreviewInput = Readonly<{
  pageId: string
  captureType: 'screenshot' | 'accessibility' | 'both'
  selectors?: readonly string[]
  viewport?: Readonly<{ width: number; height: number }>
}>
```

### 5.3 新增文件

```
packages/spark-ai/src/agent/browser-preview/
  ├── browser-preview-types.ts      — Provider 接口 + 结果类型
  ├── browser-preview-runtime.ts    — 包装为可执行工具
  └── index.ts

packages/spark-ai/src/class-model/tools/
  └── browser-preview-tool-spec.ts  — 工具规格

src/services/ai/
  ├── browser-preview-playwright-provider.ts  — Playwright MCP 实现
  └── browser-preview-iframe-provider.ts      — iframe 降级实现
```

### 5.4 修改文件

| 文件 | 变更 |
|------|------|
| `class-model/tools/tool-names.ts` | 新增 `browserPreview: 'browser_preview'` |
| `class-model/tools/class-model-tool-specs.ts` | listClassModelToolSpecs 新增 |
| `class-model/runtime/class-model-runtime.ts` | options 新增 browserPreviewProvider；route() 新增分支 |
| `agent/business/class-model-agent-adapter.ts` | options 新增 browserPreviewProvider |
| `src/services/ai/ai-delivery-port.ts` | AiDeliveryArtifact.kind 新增 'verification' |
| `src/services/page-design/page-design-ai-runner.ts` | delivery 后可选调用验证 |

### 5.5 Playwright MCP 集成方式

```typescript
// browser-preview-playwright-provider.ts
export function createPlaywrightPreviewProvider(
  mcpEndpoint: string
): AiAgentBrowserPreviewProvider {
  return {
    isAvailable() { /* 检查 MCP 连接 */ },
    async capture(input) {
      // 1. 连接 Playwright MCP Server
      // 2. browser_navigate 到页面预览 URL
      // 3. browser_take_screenshot → screenshots[]
      // 4. browser_snapshot → accessibility tree
      // 5. 可选：运行 axe-core → violations[]
      // 6. browser_close
      return { screenshots, accessibility, timestamp: Date.now() }
    }
  }
}
```

### 5.6 验证集成流程

```
AI 生成 rule.json/pagedata.json
  → delivery.save() 保存文件
  → browserPreviewProvider.capture({ pageId, captureType: 'both' })
  → 返回截图 + accessibility 快照
  → LLM 可在下一轮 tool call 中查看截图/快照，判断是否需要修正
  → 验证结果作为 AiDeliveryArtifact { kind: 'verification' } 记录
  → 若发现 critical violation，可选自动 rollback
```

---

## 六、Phase 3 — 多 Agent 工作流编排

### 6.1 设计原则

1. **复用 AiAgentHost**：工作流引擎调用 `host.run(alias, input)` 执行每个步骤，不创建新 Host
2. **声明式定义**：工作流是数据（`AiAgentWorkflowDefinition`），不是代码
3. **最小表达式**：只支持 `$input.*` / `$steps.*.result.*` / 简单相等判断，不支持循环/函数
4. **子 Agent 委托**：通过工具级别委托，Agent 可在 tool loop 内调用其他 Agent

### 6.2 核心类型

```typescript
/** 工作流步骤 */
export type AiAgentWorkflowStep = Readonly<{
  stepId: string
  alias: string                    // 映射到 AiAgentHost 注册别名
  inputMapping: AiAgentWorkflowInputMapping
  outputKey?: string               // 步骤结果的存储键
  condition?: AiAgentWorkflowCondition
  retry?: AiAgentWorkflowRetryPolicy
  timeout?: number
}>

export type AiAgentWorkflowInputMapping = Readonly<{
  params: Readonly<Record<string, string>>  // 如 { "pageId": "$steps.design.result.pageId" }
}>

export type AiAgentWorkflowCondition = Readonly<{
  expression: string  // 如 "$steps.plan.result.needsDesign === true"
}>

export type AiAgentWorkflowRetryPolicy = Readonly<{
  maxRetries: number
  backoffMs: number
  retryOn: 'failure' | 'always'
}>

/** 工作流定义 */
export type AiAgentWorkflowDefinition = Readonly<{
  workflowId: string
  name: string
  description: string
  steps: readonly AiAgentWorkflowStep[]
  transitions?: readonly AiAgentWorkflowTransition[]
}>

export type AiAgentWorkflowTransition = Readonly<{
  from: string                          // stepId 或 'start'
  to: string | readonly string[]        // 数组表示并行
  condition?: AiAgentWorkflowCondition
}>

/** 工作流执行状态 */
export type AiAgentWorkflowExecution = Readonly<{
  executionId: string
  workflowId: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'
  startedAt: number
  completedAt?: number
  stepResults: Readonly<Record<string, AiAgentWorkflowStepResult>>
  currentStepIds: readonly string[]
  error?: AiAgentWorkflowExecutionError
}>

export type AiAgentWorkflowStepResult = Readonly<{
  stepId: string
  alias: string
  status: 'completed' | 'failed' | 'skipped'
  startedAt: number
  completedAt?: number
  result?: AiAgentHostRunResult
  error?: string
}>
```

### 6.3 子 Agent 委托

```typescript
/** 子 Agent 委托工具 — 可加入 Agent 的工具集 */
export type AiAgentSubAgentDelegationTool = Readonly<{
  name: string           // 如 'delegate_to_reviewer'
  description: string
  targetAlias: string    // 目标 Agent 别名
  parameterMapping: AiAgentWorkflowInputMapping
}>
```

执行流程：
1. 父 Agent 的 LLM 调用 `delegate_to_reviewer({ pageId: "..." })`
2. 工具映射参数 → `host.run('pageReview', mappedInput)`
3. 子 Agent 运行完整 tool loop
4. 结果序列化为 tool result 返回给父 Agent

### 6.4 新增文件

```
packages/spark-ai/src/agent/workflow/
  ├── workflow-types.ts                  — 工作流类型系统
  ├── workflow-engine.ts                 — 执行引擎
  ├── workflow-expression-evaluator.ts   — 最小表达式求值
  ├── sub-agent-delegation.ts            — 子 Agent 委托工具
  └── index.ts
```

### 6.5 修改文件

| 文件 | 变更 |
|------|------|
| `agent/business/ai-host.ts` | 新增 registerWorkflow / executeWorkflow |
| `agent/business/class-model-agent-adapter.ts` | options 新增 subAgentDelegations |
| `agent/tool-runtime/tool-runtime-types.ts` | AiAgentToolRuntime 新增 extendedTools / executeExtendedTool |
| `spark-component/src/ai/types.ts` | StreamDisplayEntry 扩展 workflow-step-* |
| `spark-component/src/ai/components/SessionStreamView.vue` | 渲染工作流步骤进度 |

### 6.6 示例工作流：规划 → 设计 → 审核

```typescript
const pageDesignPipeline: AiAgentWorkflowDefinition = {
  workflowId: 'page-design-pipeline',
  name: 'Page Design Pipeline',
  description: '规划、设计、审核三步流水线',
  steps: [
    {
      stepId: 'plan',
      alias: 'projectPlanning',
      inputMapping: { params: { description: '$input.description', projectId: '$input.projectId' } },
      outputKey: 'plan',
    },
    {
      stepId: 'design',
      alias: 'pageDesign',
      inputMapping: { params: { pageId: '$input.pageId', description: '$steps.plan.result.summary' } },
      outputKey: 'design',
      condition: { expression: '$steps.plan.status === "completed"' },
    },
    {
      stepId: 'review',
      alias: 'pageReview',
      inputMapping: { params: { pageId: '$input.pageId' } },
      outputKey: 'review',
      condition: { expression: '$steps.design.status === "completed"' },
    },
  ],
  transitions: [
    { from: 'start', to: 'plan' },
    { from: 'plan', to: 'design', condition: { expression: '$steps.plan.result.needsDesign === true' } },
    { from: 'design', to: 'review' },
  ],
}
```

### 6.7 工作流引擎执行模型

```
┌─────────────────────────────────────────────────────────┐
│                   WorkflowEngine                         │
│                                                         │
│  execute(definition, input)                             │
│    │                                                    │
│    ├─ 解析 transitions → 构建步骤图                     │
│    │                                                    │
│    ├─ 从 'start' 节点出发                               │
│    │    │                                               │
│    │    ├─ 求值 condition → 决定执行哪些步骤             │
│    │    │                                               │
│    │    ├─ to 是数组？ → Promise.allSettled 并行执行     │
│    │    │   to 是字符串？ → 顺序执行                     │
│    │    │                                               │
│    │    ├─ 每步：resolveInputMapping → host.run()        │
│    │    │                                               │
│    │    ├─ 步骤完成 → 存 stepResults → 解析下一步        │
│    │    │                                               │
│    │    └─ 失败 → 检查 retry 策略 → 重试或终止          │
│    │                                                    │
│    └─ 发出 workflow 事件（workflow-started/step-*等）    │
└─────────────────────────────────────────────────────────┘
```

---

## 七、跨 Phase 依赖与实施顺序

```
Phase 1a  类型 + Bridge       ████████
Phase 1b  Tool Loop 集成      ████████
Phase 1c  UI 组件             ████████
Phase 1d  App 接线            ████████
                              │
Phase 2a  浏览器预览核心       ████████  ← 可独立部署
Phase 2b  Runtime 集成        ████████
Phase 2c  Provider 实现       ████████
Phase 2d  Delivery 集成       ████████
                              │
Phase 3a  工作流类型 + 引擎    ████████  ← 依赖 Phase 1 的 steering
Phase 3b  Host 集成           ████████
Phase 3c  子 Agent 委托       ████████
Phase 3d  UI for Workflows    ████████
```

**关键依赖**：
- Phase 2 可独立于 Phase 1 部署（browser_preview 作为 ClassModel 工具，不需要 FrontendToolBridge）
- Phase 3 的子 Agent 协调依赖 Phase 1 的 SteeringChannel
- Phase 1 完全可独立部署

---

## 八、与 AG-UI Protocol 对齐映射

| AG-UI 能力 | 本方案对应 | Phase |
|------------|-----------|-------|
| Streaming Chat | ✅ 已有（onDelta + SessionChatBubble） | — |
| Multimodality | ✅ 已有（Phase 2 截图作为工具结果） | 2 |
| Generative UI (Static) | 🆕 GenerativeUiSlot | 1 |
| Generative UI (Declarative) | 🆕 componentType 注册表 | 1 |
| Shared State | 🆕 SharedStateSync | 1 |
| Thinking Steps | ✅ 已有（onReasoning + SessionReasoningBlock） | — |
| Frontend Tool Calls | 🆕 FrontendToolBridge | 1 |
| Backend Tool Rendering | ✅ 已有（tool-call StreamDisplayEntry） | — |
| Interrupts (HITL) | 🆕 human_question 表单增强 | 1 |
| Sub-agents & Composition | 🆕 SubAgentDelegation | 3 |
| Agent Steering | 🆕 SteeringChannel | 1 |
| Tool Output Streaming | 🆕 browser_preview 流式截图 | 2 |
| Custom Events | ✅ 已有（onStreamEvent 是 string 类型） | — |

---

## 九、风险与缓解

| 风险 | 缓解 |
|------|------|
| 前端工具执行阻塞 tool loop | FrontendToolBridge.execute 返回 Promise，超时自动返回失败 |
| Steering 命令竞态 | SteeringChannel 是队列，drain 是原子操作 |
| 共享状态冲突 | 单写者原则：Agent 写 state-patch 事件，UI 通过 applyPatch 请求变更，由 tool loop 统一处理 |
| Playwright MCP 不可用 | Provider.isAvailable() 检查 + iframe 降级 |
| 工作流步骤失败级联 | retry 策略 + 条件分支跳过 + 错误处理器步骤 |
| 向后兼容 | 所有扩展都是可选的（extensions? / browserPreviewProvider? / workflow?） |

---

## 十、验证方案

| Phase | 验证方法 |
|-------|---------|
| Phase 1 | 注册前端工具 `highlight_component`，LLM 在 tool loop 中调用，确认前端收到调用并返回结果；发送 steering redirect，确认 tool loop 收到并注入 user message |
| Phase 2 | AI 生成页面后调用 `browser_preview`，确认返回截图和 accessibility 快照 |
| Phase 3 | 定义 plan→design→review 工作流，确认步骤依次执行，数据传递正确 |
| 全局 | `pnpm run build:packages` 编译通过；`pnpm run test` 现有测试不受影响 |
