状态：implementing

## 任务目标

完成 DataTable 到 query/save owner 的执行配置闭环：接口、资源、模型与 CRUD 策略由 DataTable 提供；DataView 仅持本次查询/编辑状态，并在表配置改变时失效依赖旧接口的本地适配。

## 阶段与业务语义

- DataTable 是接口与模型级保存配置真源。
- assembler 按 DataTable 契约为每个 DataView 装配独立 owner。
- DataView owner 保留各自查询结果、权限与 private baseline，禁止跨视图共享。
- 保存捕获必须冻结本次 DataTable 执行配置；unknown 只核验原捕获。
- 表级 API 配置变更不得让普通 CRUD、tree API 或 query cache 继续使用旧配置。

## 影响范围

- `packages/spark-data/src/data-table.ts`
  - 增加统一执行配置快照。
  - API/CRUD 策略变更通知所有已绑定视图，使依赖旧表配置的适配失效。
- `packages/spark-data/src/data-view.ts`
  - 保存捕获复用 DataTable 执行配置快照。
  - 接收表配置变更并清理 tree/query-cache 等执行适配，不清空权限 owner、行基线或 unknown 捕获。
- `packages/spark-data/src/dataset-crud-tool.ts`
  - 设计工具清除 crudConfig 时走 DataTable 正式失效入口。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts`
  - 增加 DataTable 级正式模型 owner adapter 绑定；各 DataView 仍持独立结果和权限。
- `src/lowcode/data-space/lowcode-data-space-assembler.ts`
  - 正式模型和文件资源按 DataTable 装配一次，后续视图继承 owner adapter。
- `packages/spark-data/src/tests/crud/crud-delegates.test.ts`
  - 验证 setApi 后模型级 CrudService 重建。
- `packages/spark-data/src/tests/dataset/dataset-tree-4-plus-7.test.ts`
  - 验证 setApi 后 TreeManager 使用新端点。
- `packages/spark-data/src/tests/crud/validation/query-save-validation.test.ts`
  - 验证保存捕获继续冻结 DataTable 配置，后续提交使用新配置。
- `tests/runtime/auth-nav/data-space/lowcode-scenario-assembly.test.ts`
  - 验证低代码 assembler 通过 DataTable 级绑定进入 SPARK Data，而非逐视图建立并行入口。

## 技术方案

1. 在 DataTable 增加不可变执行配置快照 helper，统一输出 `api/crudConfig`。
2. DataView `captureQuerySave()` 只从该 helper 获取表级配置。
3. DataTable `setApi()` 清理模型级 CrudService，并通知所有视图失效 tree/query 适配。
4. DataTable `setCrudConfig()` 通知所有视图失效可缓存的请求执行状态；保留 view owner、rows、权限和 unknown。
5. 若 API 配置未变化则不发配置失效；避免无意义重建。
6. 低代码正式模型装配调用 DataTable 级 adapter 绑定；SPARK Data 是唯一业务后端入口，lowcode 只提供协议与 owner adapter。
7. 补齐测试，确认旧 in-flight/unknown 捕获不受后续配置变更污染。

## 兼容性

- 不改变 `DataView.bindQueryExecutor()` 的实例隔离合同。
- 不改变正式低代码端点、权限 token、保存回执或 unknown 语义。
- 不把 DataTable 变成查询 owner 或保存状态容器。
- 保持 `api/crudConfig` 的公开 TableMetadata/序列化形状。

## 验证计划

- 基线：`pnpm run typecheck` 已在修改前通过。
- 定向：
  - `pnpm exec vitest run packages/spark-data/src/tests/crud/crud-delegates.test.ts packages/spark-data/src/tests/dataset/dataset-tree-4-plus-7.test.ts packages/spark-data/src/tests/crud/validation/query-save-validation.test.ts`
- 包验证：
  - `pnpm --filter @spark-appworks/spark-data run typecheck`
  - `pnpm --filter @spark-appworks/spark-data run test:run`
- 全仓类型与规则：
  - `pnpm run typecheck`
  - `pnpm run verify:ai-codegen`
  - `git diff --check`

## 风险项

- 工作树已有大量无关改动；只修改上述明确文件，不重置或覆盖。
- 正式 owner 的权限与 unknown 基线不能因配置失效而重建。
- TreeManager 在接口变化期间已有请求可能迟到；清理后的 manager 必须按旧对象拒绝迟到结果。

