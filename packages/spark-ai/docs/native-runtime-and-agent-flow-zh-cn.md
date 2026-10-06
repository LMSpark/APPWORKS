# Native Runtime 与全新 AI 流程

> **速查附录**：执行链与排错表。全仓主文档见 [`spark-ai-platform.md`](spark-ai-platform.md) §7（L4 Script）；业务分层与交付见该文 §1–§2、§8。
>
> 状态：有效（2026-06）。本文从 `packages/spark-ai/src/agent/native-runtime` 出发，说明 DTS ClassModel 驱动的执行流程。

## 一句话

新流程只有一条主线：

```text
DTS ClassModel runtime
  -> ClassModelDocument
  -> ClassModelRuntime 7 工具闭集
  -> ToolLoop
  -> model_script
  -> native-runtime
  -> 业务实例
```

执行只通过 ClassModel 工具闭集进入 native-runtime。

## 关键文件

| 文件 | 职责 |
|------|------|
| `agent/native-runtime/native-script-context.ts` | 创建脚本可见的链式 API surface，执行单个 action |
| `agent/native-runtime/native-script-runner.ts` | 接收 root metadata、schema defs、instance、script，组装执行上下文 |
| `agent/native-runtime/native-script-sandbox.ts` | 执行脚本并把异常转换为 `AiAgentToolResult` |
| `agent/business/class-model-agent-adapter.ts` | 业务注册入口，连接 metadata、ClassModel、ClassModelRuntime、Host |
| `agent/tool-runtime/tool-runtime-types.ts` | Agent 层工具运行时抽象 |
| `class-model/runtime/class-model-runtime.ts` | 7 个 ClassModel tool 的运行时实现 |

## 注册流程

```text
src/services/ai/agent-workflow-bindings.ts
  -> readWorkflowDefinition(...)
  -> activateAgentWorkflowFromDefinition(...)
  -> ClassModelAgentAdapter.createRegistration()
     -> resolveRuntimeApiMetadataJson()
     -> createClassModelDocumentFromRuntimeDocument()
     -> new ClassModelRuntime({ document, knowledge, scriptExecutor })
     -> host.register(AiAgentRegistration)
```

`scriptExecutor` 做的事很窄：

```text
resolveInstance(host.moduleInstanceId)
  -> executeAiNativeScript({ instance, metadata, script })
  -> AiAgentToolResult
```

## ToolLoop 流程

```text
LLM request
  -> AiAgentToolLoopRunner.getTools()
  -> ClassModelRuntime.getTools()
  -> LLM tool_call
  -> tool-call-executor
  -> registration.runtime.executeTool()
  -> ClassModelRuntime.executeTool()
```

工具返回统一是 `AiAgentToolResult`。`agent_complete` 会写入 lifecycle state，ToolLoop 据此收尾。

## 7 工具闭集

| 工具 | 参数 |
|------|------|
| `model_query` | `kind?`, `keyword?`, `componentName?`, `componentType?`, `componentLevel?`, `componentLayer?`, `componentDirectory?`, `includeMembers?` |
| `model_class_guide` | `kind` |
| `model_attribute_guide` | `kind`, `attributeName` |
| `model_action_guide` | `kind`, `actionName` |
| `model_script` | `script` |
| `human_question` | `context`, `reason`, `missingFacts?`, `candidateOptions?` |
| `agent_complete` | `summary` |

所有工具都运行时拒绝未知参数。额外别名不会被接受。

## native-script-context

`createAiApiScriptContext()` 根据业务实例把公开 API 包装成脚本 API：

```text
attribute read/write
  -> schema / writable / readable 检查
  -> Reflect.get / Reflect.set

action call
  -> params schema 校验
  -> Reflect.apply(instance[methodName], instance, args)
  -> result API metadata 投影
```

脚本中的 `this` 是 root API surface。业务对象仍是原始 class 实例，LLM 看到的是由 metadata 投影出的原生方法签名。

## model_script

典型脚本：

```javascript
const page = await this.openPageDesign({ pageId: 'orders' })
await page.editDataSet(async (ds) => {
  ds.createTable({ tableName: 'Orders', columns: [] })
})
return page.getFileText('pagedata.json')
```

执行链路：

```text
ClassModelRuntime.executeTool('model_script')
  -> scriptExecutor({ script, host })
  -> executeAiNativeScript()
  -> createAiNativeScriptContext()
  -> executeNativeScriptInSandbox()
```

失败会返回 `AiAgentToolResult.fail(...)`，recovery hint 只提示 `model_action_guide` / `model_script` 修正方式。

## 当前边界

- JSON 契约只暴露 `@spark-appworks/spark-json-document`；另有 `/class-model`、`/agent` 入口。
- 工具名固定为 ClassModel 7 工具闭集。
- `model_script` 参数只接受 `{ script }`。
- script 通过 native object chain 执行，不开放路径字符串调用协议。

未知工具名或未知参数进入 runtime 时会 fail-fast，不做 silent fallback。

## JSON SSOT（guide manifest）

生产 **不读** `generated/dts-class-model/runtime/`。`model_script` 的 API 元数据来自 guide shard：

```text
manifest.json + files/**/*.json
  → DtsClassModelBundleLoader.buildLoadedSurface()
  → createRuntimeApiMetadataFromSurface() / buildRuntimeApiMetadata()
  → executeDtsNativeScript()
```

`DtsClassModelRuntimeLoader` 已移出公共 API，仅保留在包内单测（`writeExperimentalRuntimeBundle: true` 时对照 ref 图）。日常 generate 默认不写 `runtime/`。

## pageDesign 端到端

```text
DevSystem
  -> runPageDesignAiSession()
  -> appAiAgent.run('page-design', input)
  -> pageDesign registration
  -> ClassModel tools
  -> model_script
  -> ProjectModel / ConfigPageNode / DataSetCrudTool / SparkNodeTree
```

门禁：

- `AiToolApprovalBridge`：UI 审批每次 tool call。
- `page-design-gates.ts`：对 mutation tool 检查 effectiveDescription / implGate / upstreamContractsSatisfied。

页面文件自动交付等待本批每个保存调用结束，再逐文件记录结果。成功调用对应 `saved`，失败调用对应 `dirty`；任一失败使总体交付为 `failed`，错误信息保留各失败原因。一个文件失败不抹掉其他文件的成功回执，也不表示已写文件被回滚。`saved` 指本次捕获文本已提交，保存等待期间的新编辑仍可保持 dirty。

显式保存范围必须是非空有效文件名数组。空数组、未知名称或错误类型使本次输入失败，不过滤坏项、不改成全部 dirty。Agent Run 在执行前校验，直接交付也在写入前校验；省略范围保留既有默认或本次已明确的范围。已接纳的范围保存为独立只读快照，调用方后续修改输入数组不会扩张保存范围。

pageDesign 执行失败时，交付端口没有恢复内容或撤销远端写入。它保留原错误，报告本次保存 `skipped` 和各未保存产物 `dirty`，不生成 `rolledBack` 回执。编辑仍在工作区内时保留实际修改状态，后续放弃或恢复须由相应 owner 明确执行。

## 排错

| 现象 | 处理 |
|------|------|
| LLM 传 `methodName` | 改用 `model_action_guide({ kind, actionName })` |
| LLM 传 `code` | 改用 `model_script({ script })` |
| LLM 传 `path` | `model_script` 只接受 `{ script }`，重新查 `model_class_guide` |
| action 参数不对 | 先读 `model_action_guide`，按签名重写脚本 |
| pageDesign 被门禁拒绝 | 检查 effectiveDescription / implGate / upstreamContractsSatisfied |

## 验证命令

```bash
pnpm run typecheck
pnpm --filter @spark-appworks/spark-ai test:run
pnpm run test
```
