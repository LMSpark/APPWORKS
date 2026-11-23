# transport

Host 与 APP 之间的 **AI turn I/O 契约**，以及可由宿主注入的 `LowcodeRealtimeApi` HTTP/SSE 适配器。

## 核心类型（`transport-types.ts`）

- `AiAgentTransportToolSpec` / `AiAgentTransportMessage` / `AiAgentTransportToolCall`
- `AiAgentStreamTurnInput` / `AiAgentStreamTurnResult`
- `AiAgentTurnCallbacks` — `prepareSession?`、`executeTurn`、`appendMessages`

## APP 实现

`src/platform-adapters/lowcode-runtime.ts` 注入认证 HTTP、fetch 与当前会话；`src/services/sse-events.ts` 管理共享连接和事件分发。`src/services/ai/ai-turn-bridge.ts` 负责将事件与具体 ToolLoop turn 绑定。

## 文档

[`docs/transport-and-session-zh-cn.md`](../../../../docs/transport-and-session-zh-cn.md)
