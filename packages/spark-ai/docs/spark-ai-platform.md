# SPARK AI 平台总览

> 状态：2026-06-19。本文只做平台级入口索引，不再独立定义 Agent Workflow / 业务工厂。
>
> Agent Workflow Designer、`design.json`、`definition.json`、业务节点、ClassModel model context、LLM 工作、验证 action、步骤线投影等概念，只以 [`business-factory-workflow-zh-cn.md`](business-factory-workflow-zh-cn.md) 为准。

## 核心边界

| 层 | 权威说明 |
| -- | -------- |
| ClassModel JSON 与知识体系 | [`class-model-knowledge-system-zh-cn.md`](class-model-knowledge-system-zh-cn.md) |
| Agent Workflow Designer | [`business-factory-workflow-zh-cn.md`](business-factory-workflow-zh-cn.md) |
| 传输与会话 | [`transport-and-session-zh-cn.md`](transport-and-session-zh-cn.md) |
| native runtime / tool loop 速查 | [`native-runtime-and-agent-flow-zh-cn.md`](native-runtime-and-agent-flow-zh-cn.md) |
| pageDesign × DevSystem | [`pagedesign-devsystem-zh-cn.md`](pagedesign-devsystem-zh-cn.md) |

## 平台数据流

```text
TS / Vue source
  -> generated/dts-class-model JSON
  -> ClassModel knowledge / runtime
  -> Agent Workflow Designer
  -> design.json
  -> definition.json
  -> runtime binding
  -> tool loop / model_script
  -> delivery
```

这条链路中，Agent Workflow Designer 的唯一概念源是 `business-factory-workflow-zh-cn.md`。其它文档不得复制一套流程/节点定义，只能链接该文件。

## 代码索引

| 主题 | 路径 |
| ---- | ---- |
| Workflow 设计器页面 | `src/views/app/WorkflowDesigns.vue` |
| Workflow 前端服务 | `src/services/workflow-designs.ts` |
| Workflow 设计服务 | `src/services/workflow-designs.ts`（读取走 lowcode design API；写入在治理合同具备前 fail-closed） |
| Workflow definition 类型 | `packages/spark-ai/src/agent/workflow/agent-workflow-definition.ts` |
| Workflow validation | `packages/spark-ai/src/agent/workflow/agent-workflow-validation.ts` |
| ClassModel runtime | `packages/spark-ai/src/class-model/runtime/class-model-runtime.ts` |
| Tool loop | `packages/spark-ai/src/agent/tool-loop/tool-loop-runner.ts` |
| native script runner | `packages/spark-ai/src/agent/native-runtime/dts-native-script-runner.ts` |
| Delivery port | `src/services/ai/ai-delivery-port.ts` |
