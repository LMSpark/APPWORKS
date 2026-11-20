# tool-loop

Host 层「LLM ↔ 工具执行」闭环编排。

## 核心文件

| 文件 | 职责 |
|------|------|
| `tool-loop-runner.ts` | `AiAgentToolLoopRunner.runToolLoop`：多轮 executeTurn + 本地 tool + appendMessages |
| `tool-call-executor.ts` | 单次 tool：UI 桥 → registration gate → `runtime.executeTool` |
| `function-call-recovery-enricher.ts` | 失败 tool result → `RECOVERY_HINT` checks |
| `turn-event-collector.ts` | app-sse：`llm-frame` 聚合为 `AiAgentStreamTurnResult` |
| `payload-codec.ts` | tool result 序列化、历史消息裁剪 |

## 生产线约束

- 每轮最多 **1 个** tool_call（`TOOL_PRODUCTION_LINE_PROMPT`）
- 工具回合 assistant 正文应为空
- 伪 tool（正文里的 JSON/XML）→ nudge 重试
- 收尾必须 `agent_complete`，不用自然语言正文结束

## 文档

- 状态机与 nudge：[`docs/native-runtime-and-agent-flow-zh-cn.md`](../../../docs/native-runtime-and-agent-flow-zh-cn.md) §9、§16
- 传输交互：[`docs/transport-and-session-zh-cn.md`](../../../docs/transport-and-session-zh-cn.md)
- recovery 删减：主文档 §13
