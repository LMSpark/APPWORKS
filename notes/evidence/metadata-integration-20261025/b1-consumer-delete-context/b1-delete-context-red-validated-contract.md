# B1 删除完整性 RED v3

只修改 `packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.test.ts`；产品、生成物、台账和服务未修改。

命令：在 `packages/spark-lowcode-api` 执行 `pnpm exec vitest run src/platform/resources/dictionary/dictionary-workspace.test.ts`。101 项：96 通过、5 失败，退出码 1。原始输出：`node_modules/.cache/metadata-integration-20261024/b1-delete-context-red-v3.log`；退出码：`node_modules/.cache/metadata-integration-20261024/b1-delete-context-red-v3.exit`。

实际失败：

1. 空 entries 查询 `0/0` 后公开 `entries.resetState()` 将其置为 Idle；当前 `canRemoveDefinition` 仍为 true。
2. 同一状态下 `removeDefinition()` 没有抛出预期的“当前查询未授权删除字典及其全部条目”；D1 已移出 rows、待删除集含 D1、pending=true。断言同时检查了拒绝原因和所有草稿状态。
3. entries 独立 refresh 的 HTTP 查询真实挂起时 state=Loading；当前 `canRemoveDefinition` 为 true，`removeDefinition()` 未按预期拒绝，E1 和 D1 均被暂存。解除请求后，DataView 以 `DATA_VIEW_UNSAVED_CHANGES` 拒绝查询结果。
4. definition 独立 refresh 的 HTTP 查询真实挂起时出现相同行为：Loading 期间暂存 E1 与 D1，随后刷新受 DataView unsaved-changes 守卫拒绝。
5. 空 entries 的 reset 之后、重新查询之前，`canRemoveDefinition` 当前仍为 true；合同断言要求先恢复查询再允许删除。

已通过的对照：definition 单独 `resetState()` 后由既有身份检查拒绝，未留待删草稿；E2 的正式行删除权限被拒时，完整批次预检阻止部分暂存；reset 后成功刷新到 Loaded 可以合法删除，并可由 `workspace.load(true)` 取消恢复，未保存。

所有失效/刷新场景均使用正式 DataView 公共 API与实际 HTTP 查询夹具；没有直接修改私有状态或模拟 workspace getter。v1/v2 日志报告保留在各自文件名下。
