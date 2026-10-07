# SPARK AppWorks 全仓世界观总览

> 研读锚点。基于 2026-06-20 全仓代码研读，梳理三条主线的因果关系。涉及产品事实时以对应源码、模型 class、JSDoc 和产品层文档为准。

## 三句话总纲

| 主线 | 一句话 |
|------|--------|
| 全仓大分析 | 低代码应用平台，pnpm monorepo，前端 Vue 3 + TypeScript + Element Plus，后端 Spring Boot（Java）位于 `spark-ai-server/`。AI 编码赋能层（`knowledge/`、`notes/`）对接真实代码，不替代产品事实。 |
| 知识大无边 | 前端写的全部内容（`.ts` / `.vue` 业务源码 + JSDoc）通过编译系统，投影成可查询、可校验、可执行前置阅读的完整知识体系（`generated/dts-class-model`）。 |
| 业务有边界 | 通过 Agent Workflow Design（`design.json` → `definition.json`）确定业务形态：流程图 `start → node → output`，每个业务节点绑定一个 ClassModel model context + LLM 工作 + validation action。 |

## Monorepo 包结构

| 包 / 目录 | 职责 | 在三条主线中的角色 |
|-----------|------|-------------------|
| `packages/spark-ai/` | AI Agent 运行时、ClassModel、工具循环 | 知识查询面 + 业务执行的枢纽 |
| `packages/spark-project-model/` | 项目模型、页面配置、导航 | 业务模型 class 的真源（ProjectModel、ConfigPageNode） |
| `packages/spark-data/` | DataSet、数据管理 | 配置页四文件中 pagedata.json 的运行态模型本体 |
| `packages/spark-component/` | Vue UI 组件 | 组件 Props 投影为 ClassModel componentIndex 的输入 |
| `packages/spark-utils/` | 共享工具，SparkAIModel 基类 | AI 可编辑模型协议基类 |
| `packages/spark-app/` | 应用基础设施层 | bootstrap、router、auth、navigation、plugins、theme |
| `src/` | 应用壳、Vue 视图、前端服务 | Workflow Designer UI、业务定义编排 |
| `spark-ai-server/` | Java Spring Boot 后端 | SSE、会话、LLM 代理、workflow 文件存储 |
| `generated/` | 自动生成 | dts-class-model JSON bundle（知识体系产物） |

---

## 第一主线：知识大无边

### 知识四层架构

| 层级 | 真源 | 产物或消费 | 说明 |
|------|------|-----------|------|
| Authoring SSOT | `packages/*/src/**/*.ts`、`*.vue` | 业务源码、组件 Props、JSDoc | 人维护的唯一业务语义来源 |
| 编译语义边界 | TypeScript / Vue 内存 emit `.d.ts` | 编译器语义树 | 只作为投影输入，不作为生成物命名和查询口径 |
| JSON 投影 | `generated/dts-class-model/manifest.json`、`files/**/*.json` | shard、classIndex、componentIndex | 生产读取的薄索引和缓存 |
| 知识运行时 | loader、knowledge service、tools、native runtime | model_query、guide、model_script | LLM 和脚本执行前的查询面 |

核心原则：**模型 class = LLM 知识真源，无额外 registry、无 metadata 第二真源。**

### 编译管线

| 阶段 | 实现入口 | 输入 | 输出 |
|------|---------|------|------|
| 源码 → 内存 emit | `scripts/generate-dts-class-model.mjs` | `.ts` / `.vue` 源码 | 内存 `class-model-emit/*.d.ts`（虚拟前缀，非磁盘目录） |
| 内存 emit → JSON 投影 | `build-dts-class-model-bundle.ts` | `.d.ts` AST | per-file shard + manifest.json + semantic-gaps.json |
| 投影分发 | `project-from-declarations.ts` | `ts.SourceFile` 顶层语句 | class / interface / typeAlias / enum 四种 DtsTypeDeclarationModel |
| 索引构建 | `build-dts-class-model-bundle.ts` 主循环 | projection.symbols | classIndex + componentIndex（5 倒排桶） |
| 落盘 | `compactDtsFileProjectionForBundle` | 内存 model | `$defs` 提取 + `$ref` 内联引用替换后写盘 |

### 投影保留的语义

| 声明类型 | 投影函数 | 保留内容 |
|---------|---------|---------|
| class | `projectClassDeclaration` | constructor + property（attribute）+ method（action）+ 签名 + paramsSchema + returnSchema + JSDoc + 类型树 + extends/implements 关系 |
| interface | `projectInterfaceDeclaration` | 同 class 的成员级语义 |
| typeAlias | `projectTypeAliasDeclaration` | JSON Schema + 成员解构 + Readonly 透明穿透 + intersection 合并 |
| enum | `projectEnumDeclaration` | 枚举成员 |

类型树 `DtsTypeMeta` 保留 11 种判别分支：intrinsic / reference / array / union / intersection / literal / optional / rest / tuple / reflection / unknown。

### 索引结构

| 索引 | 键 | 值 | 用途 |
|------|----|----|------|
| classIndex | className | `{ sourcePath, file }` | 跨 shard 模型跳转的唯一全局跳表 |
| componentIndex.entries | className | `{ sourcePath, file, component }` | 组件画像主表 |
| componentIndex.byName | componentName | className[] | 精确组件名查询 |
| componentIndex.byType | componentType | className[] | 渲染类型查询（如 `r-table`） |
| componentIndex.byLevel | componentLevel | className[] | 分级查询（table-level / row-level / field-level 等） |
| componentIndex.byLayer | componentLayer | className[] | 架构分层查询（data-view-container / row-scope 等） |
| componentIndex.byDirectory | componentDirectory | className[] | 目录域查询 |

### 按需加载（知识有界）

"知识大无边"但**消费有界**——这是设计平衡的关键。

| 加载方法 | 触发条件 | 行为 |
|---------|---------|------|
| `ensureSourcePath(sourcePath)` | 按源文件路径 | 拉单个 shard，灌入 loadedModels |
| `ensureClassName(className)` | 按模型名 | 经 classIndex 定位 shard，再加载 |
| `ensureReachableClosure(rootClassName)` | 按 root 模型 | BFS 扫 constructor / attributes / methods / schema 中的类型引用，只加载可达闭包 |

| 有界（允许） | 无边（禁止） |
|-------------|-------------|
| 当前会话 root 实例上的字段 + API | 整包 dts manifest 全量灌 prompt |
| 实例已引用的子 model class | 仓库里所有 export class |
| 各 class 短 JSDoc | 规范全文、SOP 副本 |

浏览器里通过 Web Worker（Comlink）异步 fetch，主线程不加载全量 manifest。

### 知识查询面：7 工具闭集

| 工具 | 参数 | 角色 |
|------|------|------|
| `model_query` | kind / keyword / componentName / componentType / componentLevel / componentLayer / componentDirectory / includeMembers | 查目录，可选组件维度过滤 |
| `model_class_guide` | kind（必填） | 渲染单个 model 完整契约 |
| `model_attribute_guide` | kind + attributeName | 渲染单个属性（读写前置阅读） |
| `model_action_guide` | kind + actionName | 渲染单个方法（调用前置阅读） |
| `model_script` | script（必填） | 执行 JS-only 脚本，调对象链 API |
| `human_question` | context + reason + missingFacts + candidateOptions | 渐进澄清（缺哪问哪） |
| `agent_complete` | summary | 完成请求（触发领域模型完成方法） |

`ClassModelRuntime.executeTool` 先 `rejectUnknownArgs` 拒绝未声明参数（fail-fast），再路由到 knowledge provider（查询类）或 scriptExecutor（执行类）。

---

## 第二主线：业务有边界

### Workflow 两层产物

| 文件 | schema | 角色 | 状态字段 |
|------|--------|------|---------|
| `design.json` | `spark.agent.workflow.design.v1` | 编辑态，可含占位，含画布坐标 / viewport / draft | `x_spark.validation.status: unknown` |
| `definition.json` | `spark.agent.workflow.definition.v1` | 发布态，只表达 workflow graph，含 source 溯源 + publishedAt | `x_spark.validation.status: valid` |

发布态从设计稿生成：前端 `src/services/workflow-designs.ts` 的 `createAgentWorkflowDefinitionFromDesign` 收集发布阻断问题 → 构建 source 溯源 → 映射节点 → 写入 validation。

### 节点契约

| 节点类型 | 语义 | 绑定 |
|---------|------|------|
| `start` | Workflow 入口边界 | 承接流程入参并投影到后续节点 |
| `node` | 唯一业务节点 | model context + LLM 工作 + validation action |
| `output` | Workflow 完成边界 | 收集最终输出并检查上游验证结果 |

不再保留结构性 `tool` / `chatflow` / `workflow` / `condition` / `llm` / `agent` / `code` 节点。

### 业务节点的四个绑定

| 绑定 | 字段 | 作用 |
|------|------|------|
| model | `rootClassName` / `className` / `contextPath` | 绑定 ClassModel model context。rootClassName 是可达闭包入口，className 是当前工作模型，contextPath 是在流程 cargo 中的位置。普通工作由 LLM 在此 context 内自由编排。 |
| llm | `task` / `knowledge` / `functionCalling` / `output` | 节点内 LLM 工作内容。functionCalling 默认 `freeWithinModelContext`。LLM 不能直接声明节点完成。 |
| validation | `action.className` / `action.actionName` / `inputProjection` / `expectedResult` | 必须显式绑定验证 action。节点完成只能通过 validation.action。发布前必须绑定真实 model 和 validation action。 |
| 步骤线（edge） | `projection` / `branch` / `validation` | projection 描述 cargo 从哪来到哪去；branch 描述分支条件、标签、默认路径。 |

### 旧结构拒绝链路（三层）

| 层 | 实现 | 拒绝内容 |
|----|------|---------|
| TS 校验器 | `validateAgentWorkflowDefinition`（`agent-workflow-validation.ts`） | provider / toolName / workflowRef / toolParameters / inputMapping / outputMapping / x_spark.classModel + 结构性 tool 节点类型 |
| Java 后端 | `WorkflowDesignService.rejectLegacyNode` | 同上，读写时直接抛异常 |
| 前端发布前 | `collectDefinitionPublishIssues`（`workflow-designs.ts`） | 同上，标记为 error issue 阻断发布 |

### 实际业务样本

| workflow | 业务 | 节点链（旧 tool 结构） |
|----------|------|----------------------|
| `20260615130850` | 表单设计（pageDesign） | start → resolve-run-input → open-page-design → edit-dataset → edit-node-tree → write-page-files → verify-render-config → output |
| `20260615130928` | 项目策划（projectPlanning） | start → read-project-input → read-navigation-inputs → plan-navigation-children → write-navigation → complete-project-planning → output |

这两套 JSON 实际仍是旧 `type:"tool"` 节点结构，疑似在新契约收紧前手工落盘的遗留产物。新结构参考样本在 `src/services/project-planning/project-planning-business.ts` 的 code-emitted definition（单一 `node.projectPlanning` 节点绑定 `model.rootClassName=ProjectModel`）。

### 业务形态边界

业务边界就是单一的 Workflow——一个 workflow definition 完整表达一个业务形态：入参、节点图、验证、输出。不需要在定义层考虑运行时如何调度、重试或参数校验，那些属于后续运行时实现。

| 层 | 职责 | 不做 |
|----|------|------|
| Workflow definition | 命名业务形态：入参变量、`start → node → output` 节点图、model context 绑定、validation action 绑定、步骤线投影 | 不描述运行时调度、重试、参数校验 |
| Java 后端（`spark-ai-server`） | design/definition 文件存储 + 结构校验 | 不执行 workflow graph、不调度节点、不解析模板 |

发布态 definition 由前端 `createAgentWorkflowDefinitionFromDesign` 从设计稿生成，经三层校验（TS / Java / 前端）确认后落盘。definition 本身就是业务边界的持久化契约。

---

## 第三主线：Agent 运行时

### 角色一览

| 层 | 做什么 |
|----|--------|
| Java（`spark-ai-server`） | 持久化 session、代理 LLM、SSE / Host Run |
| Host（`createAiAgentHost`） | 注册业务、`run` → ToolLoop |
| ClassModelRuntime | 7 工具闭集、`executeTool` 路由 |
| Worker 知识 | Web Worker（Comlink）内 lazy fetch JSON shard；主线程不加载全量 manifest |
| 业务层（pageDesign / projectPlanning） | ProjectModel 注册、闸门、四文件内存编辑 |

### 一次 turn 的最短路径

| 步骤 | 动作 |
|------|------|
| 1 | `host.run('pageDesign', { pageId, description, effectiveDescription, … })` |
| 2 | ToolLoop：`prepareSession` → 循环 `executeTurn` |
| 3 | LLM 发起 tool_call（每轮最多 1 个受控 call） |
| 4 | `tool-call-executor` → `beforeFunctionCall`（gates / 审批）→ `ClassModelRuntime.executeTool` |
| 5 | 写页面：`model_script({ script })` → `this.openPageDesign` → `editDataSet` / `editNodeTree` → return 四文件 |
| 6 | `agent_complete({ summary })` → 会话收尾 |

### 知识消费顺序

| 阶段 | 工具 | 目的 |
|------|------|------|
| 查目录 | `model_query` | 定位模型，可选组件维度过滤 |
| 读契约 | `model_class_guide` / `model_attribute_guide` / `model_action_guide` | 理解类 / 属性 / 方法的完整契约 |
| 执行 | `model_script` | 调对象链 API，写数据 |

这是"先懂结构再动手"的强制顺序。对应 `tool-loop-runner.ts` 里的 `CATALOG_DISCOVERY_TOOL_NAMES`（query + 三个 guide）和 `DEFAULT_EXECUTION_TOOL_NAMES`（script）。

### 相位门控（三类 nudge 纠偏）

代码中没有显式 phase 状态机，"相位门控"体现为三类 nudge 机制：

| nudge 原因 | 触发条件 | 纠偏动作 | 上限 |
|-----------|---------|---------|------|
| `plan_without_tool` | LLM 输出计划正文但没调工具；或把 tool_call 写进 assistant 正文（伪 tool_call） | 注入 nudge 提示，要求直接发起真实 OpenAI tool_calls | 伪 tool_call 2 次 / 空计划 3 次 |
| `execution_phase` | `model_action_guide` 已成功但仍停留在目录查询，未进入执行 | 注入 nudge 推动进入 `model_script` 执行 | 3 次 |
| `model_script_retry` | 最后一条历史是 `model_script` 失败 | 注入 nudge 引导按 RECOVERY_HINT 重试 | 3 次 |

另一层门控是 `beforeFunctionCall` 三态裁决（allow / reject / abort），业务可做 implGate / upstreamContractsSatisfied 检查。

### 渐进澄清

`human_question` 是 7 工具闭集之一，但它是**纯协议工具，不阻塞等待人类回答**。

| 特性 | 说明 |
|------|------|
| 机制 | LLM 调用后，runtime 返回 `{ awaitingHuman: true, context, reason, missingFacts, candidateOptions }` 作为 tool result 回灌给 LLM 上下文 |
| 参数表生长 | `attribute.api` 指向子 model kind，每深入一层才暴露下一层字段与约束 |
| 收敛条件 | 属性链 BFS 走到叶子、当前层 required 已补全、无新子 kind 待问 |
| 传输 | 通过 SSE `llm-frame` 事件经 `turn-event-collector` 聚合后透传给前端 |

### 会话管理四层

| 文件 | 职责 |
|------|------|
| `session-types.ts` | 定义全部数据模型和抽象契约（SessionRecord / HistoryEntry / SessionStore） |
| `default-session-store.ts` | 纯内存实现，用 Map 存储，深拷贝保证外部无法污染内部状态 |
| `session-run-trace.ts` | headless 活跃 run 状态投影，为 UI 提供实时快照订阅 |
| `session-diagnostics.ts` | 会话历史诊断视图（摘要 / 转录），不维护第二份历史 |

### ClassModel → Agent 对接

`ClassModelAgentAdapter.createRegistration` 是业务注册入口：

| 步骤 | 动作 |
|------|------|
| 解析元数据 | `resolveRuntimeApiMetadataJson` + `validateApiObjectMetadata` |
| 解析业务实例 | resolveInstance / instance / constructArgs |
| 构造 runtime | `ClassModelAgentToolRuntime` 实现 `AiAgentToolRuntime` 接口 |
| 绑定生命周期 | onEndBusinessInstance / releaseModuleInstance / beforeFunctionCall / afterFunctionCall / onStartSession / toolLoopNudge |
| 返回 | `AiAgentRegistration` |

`ClassModelAgentToolRuntime.executeTool`：`agent_complete` 走自定义领域完成方法；其余委托 `ClassModelRuntime.executeTool`。

---

## 三条主线的因果关系

| 因果链 | 说明 |
|--------|------|
| 知识大无边 → 知识有界 | 全仓源码投影成完整知识体系，但运行时只 BFS 加载 root 可达闭包，prompt 只注入当前 root 实例字段 + 短 JSDoc。无边是潜力，有界是约束。 |
| 知识有界 → 业务有边界 | 7 工具闭集 + 相位门控 + 知识消费顺序，把无边知识收敛到"先懂结构再动手"的受控路径。 |
| 业务有边界 → Agent 执行 | Workflow definition 就是业务边界本身：一个 workflow 完整表达入参、节点图、model context、validation action。运行时如何调度属于后续实现，定义层只命名业务形态。 |

---

## 三个需要关注的发现

### 1. 两套 workflow JSON 是旧结构遗留

`data/workflow-designs/lmspark/homepage/` 下的 design/definition 都用 `type:"tool"` 节点（带 provider / toolName / capabilities），不符合新 `start → node → output` 契约。三层校验（TS / Java / 前端）都会拒绝。疑似在新校验收紧前手工落盘。新流程下需要迁移后才能重新发布。

### 2. SparkAIModel 规范与实现的偏差

`ai-model-spec.md` 规定"凡 AI 要改数据的 class → extends SparkAIModel"，但实际只有 `DataSet` 严格遵守。

| 模型 | 继承 SparkAIModel | 实现 toJson/fromJson | 验证脚本判定 |
|------|:-:|:-:|------|
| DataSet | 是 | 是 | 通过 |
| ProjectModel | 否 | 是 | 网开一面（"extends SparkAIModel 或快照/树模型"） |
| SparkNodeTree | 否 | 是 | 同上 |

`verify-ai-model-spec.mjs` 验证脚本对此的判定是"有 toJson（extends SparkAIModel 或快照/树模型）"，即快照/树模型可不继承基类。规范文档与实现之间存在偏差，值得沉淀或澄清。

### 3. Java 后端只存储不执行

`spark-ai-server` 里没有任何"执行 workflow graph / 调度节点 / 解析模板"的 Java 类。definition 的运行时消费在 TS（`agent-workflow-dry-run.ts`）。Java 后端只做 design/definition 文件存储 + 结构校验。

---

## 关键文件索引

| 维度 | 文件 |
|------|------|
| 知识体系主文档 | `packages/spark-ai/docs/class-model-knowledge-system-zh-cn.md` |
| 编译入口 | `packages/spark-ai/src/class-model/class-model/bundle/build-dts-class-model-bundle.ts` |
| 投影机制 | `packages/spark-ai/src/class-model/class-model/declaration/project-from-declarations.ts` |
| 按需加载 | `packages/spark-ai/src/class-model/class-model/bundle/dts-class-model-bundle-loader.ts` |
| 工具闭集 | `packages/spark-ai/src/class-model/tools/class-model-tool-specs.ts` |
| 工具执行 | `packages/spark-ai/src/class-model/runtime/class-model-runtime.ts` |
| Workflow 契约 | `packages/spark-ai/docs/business-factory-workflow-zh-cn.md` |
| Workflow TS 类型 | `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts` |
| Workflow 校验 | `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts` |
| design → definition 生成 | `src/services/workflow-designs.ts` |
| Workflow 设计器 UI | `src/views/app/WorkflowDesigns.vue` |
| Workflow 文件存储 | `spark-ai-server/.../WorkflowDesignController.java` + `WorkflowDesignService.java` |
| 工具循环 | `packages/spark-ai/src/agent/tool-loop/tool-loop-runner.ts` |
| 工具调用执行 | `packages/spark-ai/src/agent/tool-loop/tool-call-executor.ts` |
| Agent Host | `packages/spark-ai/src/agent/business/host/ai-host.ts` |
| ClassModel 对接 | `packages/spark-ai/src/agent/business/class-model-agent-adapter.ts` |
| SparkAIModel 基类 | `packages/spark-utils/src/ai-model.ts` |
| ProjectModel | `packages/spark-project-model/src/project/project-model.ts` |
| AI 工作流 SOP | `packages/spark-ai/docs/spark-ai-workflow.md` |
| AI 模型规范 | `packages/spark-ai/docs/ai-model-spec.md` |
| 代码修改协议与代码生成规范 | `ai-coding-kit/AGENTS.md` |
