# business 层（Host 注册与业务适配）

> DTS ClassModel manifest → `ClassModelDocument` → `ClassModelRuntime` → `AiAgentRegistration`。

## 核心文件

| 文件 | 职责 |
|------|------|
| `class-model-agent-adapter.ts` | `ClassModelAgentAdapter.register`：metadata → ClassModel + ClassModel tool runtime |
| `ai-host.ts` | `createAiAgentHost`：ToolLoop + session + turnCallbacks |
| `business-session.ts` | `startSession` / `send` / `stopSession` |
| `registration-types.ts` | `resolveInstance`、`beforeFunctionCall`、lifecycle、`toolLoopNudge` / `enrichRecoveryHints` |
| `business-task.ts` | `AiAgentInputContract`、systemPrompt 拼接 |

## ClassModelAgentAdapter 注册流程

```text
ClassModelAgentAdapter.register({ host, alias, metadata, moduleClass, options })
  ├─ resolveRuntimeApiMetadataJson(metadata)
  ├─ createClassModelDocumentFromRuntimeDocument()
  ├─ new ClassModelRuntime({ document, knowledge, scriptExecutor })
  │    └─ model_script → executeAiNativeScript(instance, rootApi, script)
  └─ host.register(AiAgentRegistration)
```

**实例钉死**：`options.resolveInstance({ moduleInstanceId })` 在执行 `model_script` 时解析业务实例；脚本 `this` 绑定该实例，**不**经 path 解析。

## 业务 Nudge / Recovery 下沉（app 层注入）

内核 `tool-loop-runner`、`function-call-recovery-enricher`、`native-runtime` 只保留 ClassModel 协议级提示。
业务 SOP 通过 `AiAgentRegistration` 可选 hook 注入：

| Hook | 用途 |
|------|------|
| `toolLoopNudge` | plan-without-tool / execution-phase / module-script-retry 回合纠偏 |
| `planWithoutToolMarkers` | 扩展「口头承诺要调工具」检测关键词 |
| `executionToolNames` | 判定已进入执行阶段的工具名（默认 `model_script`） |
| `enrichRecoveryHints` | 可选追加 RECOVERY_HINT；默认由 `collectClassModelFailureModeRecoveryHints` 从动作失败描述注入（不遍历 ClassModel 图） |

## APP 消费方

| 文件 | 职责 |
|------|------|
| `src/services/ai/agent-workflow-bindings.ts` | 落盘 definition 读取、解释器激活、领域 binding 组合 |
| `src/services/page-design/page-design-agent-workflow-binding.ts` | pageDesign SOP hooks、data-only prompt 分支、gate 领域能力 |
| `src/services/page-data-design/page-data-design-agent-run-provider.ts` | pageDataDesign preset → pageDesign Agent Run |
| `src/services/project-planning/project-planning-agent-workflow-binding.ts` | projectPlanning 输入、prompt、gate 领域能力 |
| `src/services/page-design/page-design-ai-runner.ts` | DevSystem `runPageDesignAiSession` |
| `src/services/project-planning/project-planning-ai-runner.ts` | headless `runProjectPlanningAiSession`、Agent Run 复用 |
| `src/services/page-design/page-design-gates.ts` | mutation gate、`allowedOperations`、run context |
| `src/services/ai/ai-agent-run.ts` | transport-neutral Agent Run 契约 |
| `src/services/ai/ai-turn-bridge.ts` | `appAiAgent` 生产 Host 与 session-turn transport |

DevSystem 端到端：[`docs/pagedesign-devsystem-zh-cn.md`](../../../docs/pagedesign-devsystem-zh-cn.md)

## 文档

- 注册拓扑：[`docs/native-runtime-and-agent-flow-zh-cn.md`](../../../docs/native-runtime-and-agent-flow-zh-cn.md)
- ClassModel metadata：[`src/class-model/metadata`](../../class-model/metadata)
