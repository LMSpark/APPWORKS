# spark-ai 工作流 SOP（速查）

> 完整架构见 [`packages/spark-ai/ARCHITECTURE.md`](../ARCHITECTURE.md)。

## 角色一览

| 层 | 做什么 |
|----|--------|
| **lowcode API** | 浏览器直接消费 lowcode-jdk17 现有接口；AppWorks 不运行自有 Java 后端 |
| **Host** (`createAiAgentHost`) | 注册业务、`run` → ToolLoop |
| **ClassModelRuntime** | 7 工具闭集、`executeTool` 路由 |
| **Worker 知识** | Web Worker（Comlink）内 lazy fetch JSON shard；主线程不加载全量 manifest |
| **pageDesign 业务** | `ProjectModel` 注册、闸门、四文件内存编辑 |

## 一次 turn（最短路径）

1. `host.run('pageDesign', { pageId, description, effectiveDescription, … })`
2. ToolLoop：`prepareSession` → 循环 `executeTurn`
3. LLM 发起 tool_call（每轮最多 1 个受控 call）
4. `tool-call-executor` → `beforeFunctionCall`（gates/审批）→ `ClassModelRuntime.executeTool`
5. 写页面：`model_script({ script })` → `this.openPageDesign` → `editDataSet` / `editNodeTree` → return 四文件
6. `agent_complete({ summary })` → 会话收尾

## 知识消费顺序

```text
model_query → model_class_guide / model_attribute_guide / model_action_guide → model_script
```

- 组装 UI 前只查模型动作：`model_action_guide({ kind: "SparkNodeTree", actionName: "addNode" })`
- 通过 `model_script({ script })` 执行对象链调用；不要提交 `/kind[id]` 形式的路径参数

## 相位门控（Host 自动 nudge）

- 读完 `model_action_guide` 仍只查目录 → 强制 `model_script`
- `model_script` 失败 → 按 RECOVERY_HINT 修正，必要时回查对应 action guide
- 正文伪 tool_call / 只写计划 → 强制真实 OpenAI tool_calls

## 渐进澄清（human_question 随属性链推进）

订单（业务需求）初始只有意图，参数表不是预先固定，而是随知识探索逐层生长。澄清不是一次问全，而是「知识探索」与「提问补全」两个指针交替推进：

```text
意图"我要请假申请"
  → model_query / model_class_guide：知识体系定位请假流程 root model
  → model_attribute_guide：暴露当前层字段（申请人 / 假期类型 / 起止日期…）
  → human_question：缺哪问哪（"你是谁？请什么假？"）
  → 人答回填 → 顺 attribute.api 走到子 model（申请人 → 员工，发现"要工号不要人名"）
  → 再 attribute_guide → 再 human_question … 直到属性链到叶子、无新字段冒出
  → 收敛 → model_script 生产四文件
```

- **参数表会生长**：`attribute.api` 指向子 model kind，每深入一层才暴露下一层字段与约束（代码：`class-model/class-model/model-projection.ts` 的 `listAttributeReachableKinds` / `projectClassModelForGuide`，可达才投影）。
- **收敛 = 探索到底**，不是填满一张预设表：属性链 BFS 走到叶子、当前层 required 已补全、无新 `attribute.api` 子 kind 待问，即可进入生产。
- `human_question` 的 `missingFacts` / `candidateOptions` 参数承载「当前层还缺什么」，是渐进澄清的接口锚点（见 [`../ARCHITECTURE.md`](../ARCHITECTURE.md) 工具闭集表）。

## 编译与运行时加载

```text
编译（pnpm run generate:class-model-surface）
  src + JSDoc → 内存 emit .d.ts → AST 投影 → generated/dts-class-model/*.json

运行时（浏览器）
  主线程 WorkerClassModelKnowledgeProvider
    → Comlink → Worker DtsClassModelBundleLoader
    → fetch(manifest) → ensureReachableClosure(root) → 按需 fetch shard
```

- 编译 refresh：`DtsBundleClassModelKnowledgeService.refresh()` + 宿主 `refreshBundle`（Node 见 `scripts/lib/class-model-knowledge-refresh.mjs`）
- 内存 emit 使用虚拟前缀 `class-model-emit/`（非磁盘目录）；落盘 manifest / shard 索引键为源码 repo 相对路径（如 `packages/.../foo.ts`）

## 生成物

| 文件 | 命令 |
|------|------|
| `generated/dts-class-model/manifest.json` | `pnpm run generate:class-model-surface` |
| `generated/dts-class-model/files/**/*.json` | `pnpm run generate:class-model-surface` |

## 入口

| 场景 | 文件 |
|------|------|
| DevSystem 面板 | `src/services/page-design-ai-runner.ts` |
| Agent Run | `src/services/ai/ai-agent-run.ts` + `src/services/page-design/page-design-agent-run-provider.ts` |
| Workflow 激活 | `src/services/ai/agent-workflow-bindings.ts` + `src/services/page-design/page-design-agent-workflow-binding.ts` |

## 未实现（勿假设存在）

- Runtime API metadata / catalog 之外的第二知识真源
- `verifyPageDesignModelEdit` root action
- `model_query({ includePayloads: true })`
