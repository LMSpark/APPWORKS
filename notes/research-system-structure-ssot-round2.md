# 研读续篇：SSOT 归并下一轮（删断再改）

## 策略（用户再次锁定）
- 不考虑向后兼容
- 不搞薄包 / re-export 转发
- 可先断开删除，再改消费方，循环直到 0 回归

## A–F 已结案（不再当候选）
JSON 源码已从 WC 删除（git `D`）、kind、导航改名、权限 mapper、pagedata 运行轴分层、文档分层。

## 本轮扫描出的残留（代码事实）

### P0 — 本批优先删断

| ID | 问题 | 证据 | 动作 |
|----|------|------|------|
| G1 | `spark-ai/json` **死别名** | 源目录已不存在；`packages/spark-app/tsconfig.json`、`tsconfig.build.json`、`spark-component/tsconfig.json` 仍映射 `@spark-appworks/spark-ai/json` | 删 aliases；清 generated 残留；修仍引用方 |
| G2 | 四文件名双清单 | `spark-app/.../page-cache.ts` 本地 `PAGE_FILES` vs `PAGE_NODE_FILE_NAMES` | 删本地数组，直连 project-model SSOT |
| G3 | `ai-coding-kit` verify 副本漂移 | kit 仍指向 `spark-ai-server/...`；产品门禁在 `tools/` | 删 kit 内重复 verify（或改为只引用 tools，禁止第二份实现） |
| G4 | 文档仍承诺 AiJson / spark-ai/json 兼容 | `spark-json-document/API.md` 等 | 删兼容承诺，改正式名口径 |

### P1 — 下一循环

| ID | 问题 | 动作 |
|----|------|------|
| G5 | `src/services/ai/spark-ai-agent-bindings.ts` 纯 re-export | 删文件，消费方直连 `@spark-appworks/spark-ai/agent` |
| G6 | `project-model-dev-bindings.ts` 纯 re-export | 删文件，消费方直连 project-model |
| G7 | 组件/app 桶对 utils/data 的薄类型再导出 | 收窄公共面，消费方直连定义包 |
| G8 | `AjaxResult`（contracts）vs `LowcodeAjaxResult`（lowcode-api） | 裁决唯一信封类型或明确「台账 vs 运行」边界并门禁 |

## 本批建议闭环
先做 **G1+G2+G4**（死别名 + PAGE_FILES + 文档兼容承诺），验证 typecheck/相关 test；再开 G3/G5…

## G1+G2+G4 结案（2026-08-10）
- tsconfig 死别名已删；`PAGE_FILES` → `PAGE_NODE_FILE_NAMES`；文档兼容承诺已去掉
- spark-app / spark-component / 宿主 typecheck 通过
- 生产 `packages/`+`src/` 无 `spark-ai/json` / `AiJson` / 本地 `PAGE_FILES`

## G3+G5+G6 结案（2026-08-10）
- 删除 `ai-coding-kit/verify-*.mjs` + `verifier-common.mjs`；README 改为「门禁只在 tools/」
- 删除 `spark-ai-agent-bindings.ts`、`project-model-dev-bindings.ts`；消费方直连包入口
- 知识已写入 monorepo-dependencies / vue-frontend

## G7+G8 结案（2026-08-10）
- `spark-component` 根公共面已删除 SparkNode 工具再导出，外部消费者直连 `spark-data`。
- `AjaxResult` 已统一命名并增加同形门禁；台账宽对象明确命名为 `WireJsonObject`，不冒充递归 JSON 文档模型。
- 相关 19 项测试、`spark-component` 类型检查和根类型检查通过。

## H：项目蓝图节点实体双主

### 代码事实

- `spark-lowcode-api` 与 `spark-project-model` 仍分别公开同名 `ProjectBlueprintNode` class；此前只归并了 `ProjectBlueprintNodeKind`，实体所有权尚未收敛。
- 生产调用只有 `src/lowcode/lowcode-runtime.ts` 同时接触两套结构：先读取 lowcode `ProjectBlueprint`，再手写转换为 `ProjectBlueprintTreeNodeData`，供 `ProjectBlueprintGateway` 消费。
- lowcode `ProjectBlueprint` 的 structure/runtime navigation 被生产调用；planning/governance/AI/document source/mutation planner 当前仅由包内测试消费。
- 文档提交端点是真实后端能力，必须保留；纯规划、身份闭包和 AI 投影属于项目蓝图领域，应归 `spark-project-model`；后端 wire 归一化、授权证据和端点调用仍归 `spark-lowcode-api`。

### 已确认裁决

- `spark-project-model` 是项目蓝图唯一领域模型所有者。
- 不保留 `spark-lowcode-api.ProjectBlueprintNode` 的别名、deprecated 导出或转发壳。
- 先将 lowcode 节点断开为明确的后端记录，修复输出函数和根适配器；随后迁走纯领域输出并删除 lowcode 通用 `ProjectBlueprint` 聚合，直至跨包同名扫描归零。

### H1 结案（2026-08-10）

- `spark-lowcode-api.ProjectBlueprintNode` class 与 `ProjectBlueprintNodeSnapshot` 已永久删除，无别名、deprecated 导出或转发入口。
- lowcode wire 只生成冻结的 `LowcodeProjectBlueprintRecord`，项目蓝图领域 class 只保留在 `spark-project-model`。
- mutation preimage、运行导航和包内输出暂时消费后端记录，行为未改变；新增 `verify:project-blueprint-ssot` 门禁防止同名实体回生。
- 顺带修复 G7b 遗留的两个 type-only import Lint 错误。
- 验证：lowcode 13 文件/44 项测试、根导航 5 项、容器 23 项、全量 169 文件/1250 项测试、根与包类型检查、Lint、架构门禁和项目蓝图 SSOT 门禁通过。
- 下一残留：lowcode 通用 `ProjectBlueprint` 聚合和纯领域 output groups 尚待迁走/删除。
