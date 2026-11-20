# spark-ai 架构

## 当前主线

spark-ai 的 AI 知识面只来自 TypeScript 声明，编译期**不在磁盘落盘 `.d.ts`**：

```text
源码 class + JSDoc
  -> generate-dts-class-model.mjs（内存 emit .d.ts，compiler-api / vue-tsc）
  -> buildDtsClassModelBundle（AST 投影，一次性写出 JSON shard）
  -> generated/dts-class-model/manifest.json + files/{packages,src}/**/*.json   # guide SSOT（生产）
  -> model_script：同一 manifest → DtsClassModelBundleLoader.buildRuntimeApiMetadata()
  -> 运行时 Web Worker（Comlink）按 className 按需 fetch shard
```

`generated/dts-class-model/runtime/`（ref 图实验树）**默认不再生成**；需 `node scripts/generate-dts-class-model.mjs --experimental-runtime-bundle` 才写出。已冻结：生产 guide/script 不读；`pnpm run build` 不校验其 manifest。详见 [`docs/spark-ai-platform.md`](docs/spark-ai-platform.md) §3.4。

没有额外 registry、没有额外 catalog、没有约定标签。`.d.ts` 只在编译期内存 emit 中使用虚拟前缀 `class-model-emit/`（非磁盘目录）；落盘 manifest / shard 索引键为源码 repo 相对路径（如 `packages/.../foo.ts`）。

## 运行时（主线程 / Worker）

| 模块 | 线程 | 职责 |
|---|---|---|
| `WorkerClassModelKnowledgeProvider` | 主线程 | Comlink 客户端；只传 manifest URL 与查询参数 |
| `worker-knowledge-handler` | Web Worker | Comlink 服务端；持有 `DtsBundleClassModelKnowledgeService` |
| `DtsClassModelBundleLoader` | Worker 内 | `fetch(manifest)` → BFS 按需加载 shard JSON；`buildRuntimeApiMetadata()` 供 script |
| `createRuntimeApiMetadataFromSurface` | 主线程 | guide surface → `AiRuntimeApiMetadataJson` 薄映射（与 guide 同源 shard） |
| `ClassModelKnowledgeService` | Worker 内 | 已加载 surface → query / guide 文本 |
| `ClassModelRuntime` | 主线程 | 七个工具闭集；路由到 knowledge provider 或 script executor |
| `ClassModelAgentAdapter` | 主线程 | 业务实例 + ToolLoop 接入 |

## 工具闭集

| 工具 | 参数 |
|---|---|
| `model_query` | `kind?`, `keyword?`, `includeMembers?` |
| `model_class_guide` | `kind` |
| `model_attribute_guide` | `kind`, `attributeName` |
| `model_action_guide` | `kind`, `actionName` |
| `model_script` | `script` |
| `human_question` | `context`, `reason`, `missingFacts?`, `candidateOptions?` |
| `agent_complete` | `summary` |

未知工具名和多余参数都 fail-fast，不做额外别名映射。

## 生成命令

```bash
pnpm run generate:class-model-surface
pnpm run generate:class-model-surface:model -- ProjectModel
```

- 全量：`generate:class-model-surface`
- 增量：按 root className 定位 bundle 中 emit 闭包，merge 回 `generated/dts-class-model`

动态编译与运行时加载已整合：`DtsBundleClassModelKnowledgeService.refresh()` 调用宿主注入的 `refreshBundle`（Node 可用 `scripts/lib/class-model-knowledge-refresh.mjs` 触发 `--model` 增量编译），再 `loader.reload()` 清空 Worker 内缓存。Worker 是 browser/node 共用隔离层，只承载 refresh/reload 协议，不内置 HTTP 或具体编译实现。

## 业务接入

pageDesign / projectPlanning 在 app 层选择 root className 和业务实例：

- pageDesign：`ProjectModel`
- projectPlanning：按业务注册选择 root model

**全仓 AI 入口：** [`docs/spark-ai-platform.md`](docs/spark-ai-platform.md) · Agent Workflow / 业务工厂唯一权威文件 [`docs/business-factory-workflow-zh-cn.md`](docs/business-factory-workflow-zh-cn.md)

AI 通过公开字段和公开方法工作。class 之间只能通过公开属性暴露子 class 或子 class 数组；序列化使用 `toJson()`，恢复入口按模型需要提供 `fromJson()` 或 `fromJsonString()`。
