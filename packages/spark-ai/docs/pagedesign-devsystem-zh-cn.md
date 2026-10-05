# pageDesign × DevSystem 消费方

> APP 层如何把 DevSystem 里的 `ProjectWorkspace` 接到 spark-ai Host。内核见 [`native-runtime-and-agent-flow-zh-cn.md`](native-runtime-and-agent-flow-zh-cn.md) §7、§11。

## 数据流

```mermaid
sequenceDiagram
  participant UI as DevSystem / useDevState
  participant Bridge as AiToolApprovalBridge
  participant Runner as page-design-ai-runner
  participant Host as appAiAgent
  participant TL as ToolLoop
  participant NR as native-runtime
  participant WS as ProjectWorkspace

  UI->>Runner: runPageDesignAiSession({ pageId, editor })
  Runner->>Host: read definition + activatePageDesignAgentWorkflow + host.run
  Host->>TL: startSession(moduleInstanceId=pageId)
  TL->>Bridge: beforeFunctionCall（UI 审批）
  Bridge-->>TL: allow / reject / abort
  TL->>NR: model_script → this.openPageDesign...
  NR->>WS: 同一 editor.project 内存 mutation
  TL-->>UI: onToolCall / trace
  Note over UI,WS: 默认不 auto-save；用户手动保存
```

## Editor 策略

| 场景 | 实例来源 | 文件 |
|------|----------|------|
| DevSystem 面板 | 与手动编辑同一 `editor.project` | `page-design-ai-runner.ts` |
| Agent Run / E2E | headless `ProjectWorkspace` registry | `page-design-agent-run-provider.ts` |

AI 与手动编辑共用 DevSystem 的编辑宿主 `ProjectWorkspace`（`getAppProjectBlueprintWorkspace(scope)`，由调用方作为 `command.editor` 传入 runner），避免双份 project 状态。

## 注册与实例解析

```typescript
await activatePageDesignAgentWorkflow({
  host: appAiAgent,
  // 返回调用方传入的 ProjectWorkspace；runner 会先校验 moduleInstanceId === pageId
  getPageDesignEditor: ({ moduleInstanceId }) => editor,
})
```

- `moduleInstanceId` = `pageId`（会话级钉死，非 path 寻址）
- `page-design-agent-workflow-binding.ts` 的 editor getter → `ProjectModel` 根实例
- 知识索引：`generated/dts-class-model/manifest.json`

## 门禁（mutation）

`evaluatePageDesignMutationToolGate` 拦截：

- `model_script`
- `openPageDesign`（经 direct runner 或 script 内调用）
- `writePageFile`

检查项（`readPlanningProjection()`）：

- `effectiveDescription` 非空 → 策划就绪；为空 → pageDesign mutation 拒绝
- `implGate`、`upstreamContractsSatisfied`

DevSystem `NodeAgentGateConfig` 暴露 **implGate** 与 **upstreamContractsSatisfied**。

**两层 beforeFunctionCall**（顺序）：

1. UI：`createAiToolApprovalBridge()`（`packages/spark-app/src/ai/tool-approval-bridge.ts`）
2. Registration：`page-design-gates.ts`

## DevSystem 接线

`src/views/app/dev-system/useDevState.ts`：

```text
aiToolApprovals = createAiToolApprovalBridge()
runPageDesignAi → beforeFunctionCall: aiToolApprovals.beforeFunctionCall
会话结束 → aiToolApprovals.cancelPending()
```

审批 UI：`AiToolApprovalPanel.vue`（spark-component）。

## 典型 AI 脚本（systemPrompt 模板）

```javascript
const page = await this.openPageDesign({ pageId: '<pageId>' })
await page.editDataSet(async (ds) => {
  ds.createTable({ tableName: 'Orders', columns: [...] })
})
return {
  ruleJson: page.getFileText('rule.json'),
  pageDataJson: page.getFileText('pagedata.json'),
}
```

脚本只改内存；`ProjectWorkspace.save*` 由用户或 E2E 显式触发。

## 排错

| 现象 | 检查 |
|------|------|
| AI 改的不是当前页 | `moduleInstanceId` 是否等于面板 `pageId` |
| 审批一直 pending | `cancelPending()` 是否在 session 结束调用 |
| 改完 UI 不刷新 | 是否未 save；DevSystem 是否监听 project 变更 |
| implGate 拒绝 | `page-design-gates` + planning 投影 |
| 脚本 hint 无效 | recovery enricher §17 常见错误表 |

## 关键文件

| 路径 | 职责 |
|------|------|
| `src/services/ai/agent-workflow-bindings.ts` | 读取落盘 definition 并组合 app binding 激活 Host |
| `src/services/page-design/page-design-agent-workflow-binding.ts` | pageDesign editor getter、prompt、nudge、gate 领域能力 |
| `src/services/page-design/page-design-ai-runner.ts` | DevSystem session 启动 |
| `src/services/page-design/page-design-gates.ts` | mutation gate、`allowedOperations` |
| `src/services/page-data-design/page-data-design-agent-run-provider.ts` | pageDataDesign preset Agent Run |
| `src/services/ai/ai-turn-bridge.ts` | `appAiAgent` 与 session-turn transport |
| `src/views/app/dev-system/useDevState.ts` | UI 集成 |
| `packages/spark-app/src/ai/tool-approval-bridge.ts` | 审批 Promise 桥 |
