# transport

Host 与 APP 之间的 **AI turn I/O 契约**（无 HTTP 实现）。

## 核心类型（`transport-types.ts`）

- `AiAgentTransportToolSpec` / `AiAgentTransportMessage` / `AiAgentTransportToolCall`
- `AiAgentStreamTurnInput` / `AiAgentStreamTurnResult`
- `AiAgentTurnCallbacks` — `prepareSession?`、`executeTurn`、`appendMessages`

## APP 实现

`src/services/ai-turn-bridge.ts` → 生产 `appAiAgent` 使用 `session-turn`（`src/services/ai-host.ts`）。

## 文档

[`docs/transport-and-session-zh-cn.md`](../../../../docs/transport-and-session-zh-cn.md)
