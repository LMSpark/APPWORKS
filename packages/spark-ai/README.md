# @spark-appworks/spark-ai

Spark AI agent runtime：ClassModel 工具闭集、Host 编排、ToolLoop、传输契约与 native-runtime 脚本执行。

JSON Schema / 值类型 SSOT 在 `@spark-appworks/spark-json-document`，本包不转发。

## 公共入口

| 子路径 | 用途 |
|--------|------|
| `@spark-appworks/spark-ai` | 薄门面（Host / ClassModelRuntime 等） |
| `@spark-appworks/spark-ai/agent` | Host、会话、ToolLoop、传输、native-runtime |
| `@spark-appworks/spark-ai/class-model` | ClassModel 反射图、metadata 解析与 ClassModel 工具 |
| `@spark-appworks/spark-json-document` | Schema 校验与 JSON 规整（独立包） |

## 文档

| 文档 | 说明 |
|------|------|
| [`docs/spark-ai-platform.md`](docs/spark-ai-platform.md) | **全仓 AI 主文档**（.d.ts → 交付 + 接入 checklist） |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | 包架构薄版 SSOT |
| [`docs/README.md`](docs/README.md) | 文档索引与阅读顺序 |
| [`docs/transport-and-session-zh-cn.md`](docs/transport-and-session-zh-cn.md) | V4 传输、session-turn / app-sse |
| [`src/agent/native-runtime`](src/agent/native-runtime) | model_script 脚本上下文与执行 |

## APP 消费示例

```typescript
import { createAiAgentHost } from '@spark-appworks/spark-ai/agent'
import { createAiAgentTurnCallbacks } from '@/services/ai-turn-bridge'
import { activatePageDesignAgentWorkflow } from '@/services/ai/agent-workflow-bindings'

const host = createAiAgentHost({
  turnCallbacks: createAiAgentTurnCallbacks({ transport: 'session-turn' }),
})

await activatePageDesignAgentWorkflow({ host, getPageDesignEditor })
```

生产 Host 见 `src/services/ai/ai-turn-bridge.ts`（`appAiAgent`）。

## 开发

```bash
pnpm --filter @spark-appworks/spark-ai test:run
pnpm --filter @spark-appworks/spark-ai typecheck
```
