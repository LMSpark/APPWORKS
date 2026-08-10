# 研读：系统结构 SSOT 归并

## 用户确认
- 研读复述已获确认（用户回复「直接干」）。
- 流程授权：跳过广谱一问一答；仅在精准分叉点提问。

## 仓库现状（代码事实）
- `spark-ai-server` / 仓内 Java 已退役；平台后端为仓外 lowcode-jdk17。
- 依赖版本 catalog SSOT：`pnpm-workspace.yaml` 的 `catalog:`（无 `workspace.catalog.json`）。
- 工作区包：`spark-utils`、`spark-data`、`spark-json-document`、`spark-component`、`spark-project-model`、`spark-lowcode-api`、`spark-app`、`spark-ai`、`vite-plugin-spark-catalog`。
- `packages/README.md` 漏列 `spark-ai`、`spark-json-document`。
- `src/` 应为宿主接线层；适配集中在 `src/lowcode/`。

## 双真源清单与建议归属

### P0（必须裁决或契约归并）

| ID | 语义 | 竞争面 | 建议归属 | 备注 |
|----|------|--------|----------|------|
| P0-1 | 页面数据 | 四文件 `pagedata.json` vs 平台 DataSpace + `src/lowcode/data-space/*` | **分层**：DataSpace=平台数据定义/运行装配；四文件=实现轴编辑（验收清单仍要求不绕过四文件） | 旧计划 `plan-spark-data-data-space-integration.md` 已 superseded；不能按「立刻删 pagedata」实施 |
| P0-2 | 蓝图节点 kind | `spark-project-model` 与 `spark-lowcode-api` 各有一份几乎相同的 `ProjectBlueprintNodeKind` | 两包**互不依赖**，不能直接互相 import | 需精准选择：共享模块 / 等式门禁 / 新薄包 |
| P0-3 | RuntimeNavigation | `spark-app` 壳类型 vs `spark-lowcode-api` 平台投影；桥在 `src/lowcode/lowcode-runtime.ts` | **保留双形状**；桥接适配器为唯一转换 SSOT | 禁止把两类类型当互换 |
| P0-4 | 权限快照 | `DataPermissionSnapshot` vs `Permission*Snapshot` | 平台决策=lowcode；渲染形状=spark-data；需**单一 mapper** | `src/lowcode` 内暂无统一 mapper 命中 |

### P1（收口）

| ID | 问题 | 建议 |
|----|------|------|
| P1-1 | `spark-ai/src/json/*` deprecated re-export | 消费方改直连 `spark-json-document`，再删 shim |
| P1-2 | `spark-lowcode-api` vs `backend-api-contracts/` | 运行时客户端 vs 台账/fixtures；文档与新增端点流程锁死 |
| P1-3 | 文档仍以 pagedata 为唯一数据轴 | 跟 `MODEL-HIERARCHY` + DataSpace 分层口径对齐 |
| P1-4 | `tools/` vs `ai-coding-kit/` verify 副本 | 产品门禁以 `tools/` 为准；kit 防漂移 |

### 分层合理（禁止硬合并成一份）

- 设计态 blueprint 编辑树 ↔ 平台蓝图读/治理
- `design.json` ↔ `definition.json` + 仓内 `agent-workflow-validation.ts`
- ClassModel：源码 → generator → `generated/dts-class-model`
- `vue-pages.json` / 组件 auto-register / vite catalog（三套不同职责）
- spark-app 壳 ↔ `src/` 宿主；会话只认 lowcode session

## 验收口径锚点
- `docs/guides/model-convergence-acceptance.md`：页面消费已绑定数据空间 + `formKey+dataSpaceId+modelId`；同时不绕过四文件。
- `packages/spark-project-model/src/MODEL-HIERARCHY.md`：四文件仍是实现轴编辑真源。

## 复杂度
**复杂**：跨包契约、适配桥、运行/编辑分层、文档与门禁联动；分波实施，每波一个最小闭环。

## 结案（2026-08-10）
- A–F 已实施并验证；计划书已删除（阶段 7）。
- 知识已写入 `knowledge/page-design.md`、`knowledge/vue-frontend.md`；度量已记入 `notes/ai-code-metrics.md`。
- P0-1 按分层落地（运行 DataSpace / 设计 pagedata）；P0-2 kind → utils；P0-3 双形状 + 唯一桥；P0-4 唯一 permission mapper；P1-1 删 spark-ai/json；P1-3 文档已对齐。
