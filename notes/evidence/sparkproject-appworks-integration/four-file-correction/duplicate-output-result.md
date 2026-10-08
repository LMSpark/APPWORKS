# 等价重复输出消费闭环结果

## 实现边界

在 `DataSpaceDesignApi.resolveOutputFields(model)` 添加唯一消费解析：仅遍历正式 `output` 字段，按 `canonicalName` 保留首次出现项；重复项须 `name`、`canonicalName`、`type`、`primaryKey`、`description`、`output`、`computed`、`order`、`orderType` 及 raw `Group`/`DISTINCT`/`Value`/`ValueFun`/`Expression` 全部语义相同。结构对象按键集合比较、键顺序无关；缺失与 `null` 不等。字段记录 `id/fieldId` 与 raw `rowid` 不参与比较。冲突 fail-fast。原始 `model.fields` 未更改。

Assembler columns、查询字段映射、formal primary binding、save wire mapping、receipt reverse mapping、ParentField lookup 都消费此解析结果。按源 `name` 反查时，若剩余多个不同 canonical 输出仍 fail-fast。字段权限、行身份、主键/计算字段约束未放宽。

## 验证

- RED：新增 resolver 测试首次运行失败，`DataSpaceDesignApi.resolveOutputFields is not a function`。
- `pnpm run typecheck`：通过。
- `cd packages/spark-lowcode-api; pnpm exec vitest run src/platform/data-space/design/data-space-design-api.test.ts src/platform/data-space/runtime/data-space-runtime-api.test.ts src/platform/data-space/runtime/tests/data-space-model-alias.test.ts`：3 files / 149 tests passed。覆盖等价去重、raw 对象键序无关、缺失/null、source name/type/computed/order/Group/Value/ValueFun 冲突、query mapping、保存与回执、source-name 歧义拒绝。
- `pnpm exec vitest run tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts`：1 file / 32 tests passed，含 assembler 唯一列回归。
- `pnpm exec eslint packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts src/lowcode/data-space/lowcode-data-space-assembler.ts --max-warnings=0`：通过。

本闭环未修改 backend。随后主控已通过真实六模型装配及三表查询，四文件新增/重开也已通过。包含 DISTINCT 反例的最新包级复验为 3 files / 150 tests passed，见 `pilot-package-tests.log`；根全量 192 files / 2262 tests passed，见 `pilot-root-tests.log`。构建以独立日志为准，不由上述测试推导。
