# B1 删除完整性 RED v2

仅修改 `packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.test.ts`；未改产品、生成物、台账或服务。

命令：在 `packages/spark-lowcode-api` 执行 `pnpm exec vitest run src/platform/resources/dictionary/dictionary-workspace.test.ts`。101 项：97 通过、4 失败，退出码 1。原始输出：`node_modules/.cache/metadata-integration-20261024/b1-delete-context-red-v2.log`；退出码：`node_modules/.cache/metadata-integration-20261024/b1-delete-context-red-v2.exit`。

实际失败（均使用正式 DataSet/DataView 公共 API）：

1. `entries.resetState()` 在成功读取空结果之后将 entries 置为 `rows=0,total=0,requestState=Idle`，但 `canRemoveDefinition` 仍为 true。
2. 同一空视图状态下 `removeDefinition()` 返回成功，definition D1 被移出 rows 并进入 `pendingDeleteIds`，workspace `pending=true`；没有业务保存请求。测试以一次状态快照同时记录了执行是否拒绝及所有遗留草稿状态。
3. entries 独立 refresh 被真实 HTTP 夹具挂起时，state 为 Loading，`canRemoveDefinition=true`；删除返回成功，E1 和 D1 都进入待删除。释放查询后，DataView 因 `DATA_VIEW_UNSAVED_CHANGES` 拒绝刷新结果；草稿仍在，没有保存请求。
4. 对称的 definition 独立 refresh 挂起期间同样可以暂存 E1 和 D1 删除，刷新随后由 DataView 的 unsaved-changes 守卫拒绝。

已有保护与恢复路径：

- 成功加载后单独 `definition.resetState()` 会使 `canRemoveDefinition=false`；remove 被拒，条目及定义均没有删除草稿。此路径受 `assertScope` 的正式行身份检查保护。
- 两条条目中后一条 E2 删除权限不可用时，完整权限预检拒绝整批，未删除 E1 或定义。
- entries reset 后再通过 `entries.requestRefresh()` 恢复到 Loaded，可以合法暂存删除；`workspace.load(true)` 能取消删除并恢复原查询数据，未保存写入。

DataView 公开 `resetState()` 在有草稿时本身拒绝替换；本组 reset 反例在无草稿的成功查询之后执行。独立刷新测试通过真实请求延迟，不写私有状态、不伪造 workspace getter。

初次 v1 原始输出及报告另存于 `b1-delete-context-red.log/.exit/.md`，未覆盖。当前等待主控复核；没有开放产品修复。
