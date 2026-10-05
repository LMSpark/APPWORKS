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

## 金规则的完成判定

`agent_complete` 是请求领域验收的 FC。完成摘要只用于说明，能否结束工具循环由绑定的 `agentCompleteAction`、`agentCompleteMethodName` 或实例默认 `agentComplete` 方法判定。领域方法应查询真实业务状态；适配器只解释验收结果，不替领域方法证明数据来源或业务正确性。

| 领域验收返回值 | 处理 |
|------|------|
| `true`、`{ ok: true }`、`{ completed: true }` 或成功的 `AiAgentToolResult` | 在没有否决标记和错误检查项时，确认完成并保留结果数据 |
| `false`、非空原因字符串、顶层或 `data` 中的 `ok: false` / `completed: false` | 拒绝完成，把原因交回工具循环 |
| 顶层或 `data.checks` 中含 `level: 'error'` | 拒绝完成；错误检查项优先于成功标记 |
| 未绑定验收方法 | 返回 `AGENT_COMPLETE_METHOD_NOT_CONFIGURED`，由应用补齐绑定 |
| 空值、空字符串或没有明确判定的值 | 返回 `AGENT_COMPLETE_INVALID_RESULT`，由领域方法修正结果契约 |

拒绝时保留 `missingFacts`、`requiredCapabilities` 和 `nextStep` 等反馈；已有能力映射可给出 `model_action_guide` 查询入口，供模型按需查询、执行修正后再次验收。配置错误与结果契约错误需要修复对应实现，不能靠重复调用完成函数变成成功。知识查询、执行约束和验收共同应用金规则，不拆成不同类别。

设计参考：Kambhampati 等人的 [LLM-Modulo（2024）](https://arxiv.org/abs/2402.01817) 提出模型与外部验证器通过反馈协作；此处将该思路落实为领域验收控制完成判定。Anthropic 的 [Effective context engineering for AI agents（2025）](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) 讨论按需取用上下文；此处沿用已有知识函数和操作指南查询入口，不将全部领域知识塞入完成反馈。两项参考均不意味着当前业务验收已经覆盖所有错误或接入真实数据库。

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
