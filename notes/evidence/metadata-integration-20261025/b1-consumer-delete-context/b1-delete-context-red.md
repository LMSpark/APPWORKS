# B1 删除完整性 RED

范围：仅修改 `packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.test.ts`，无产品、生成物、台账或服务改动。

验证命令：在 `packages/spark-lowcode-api` 执行 `pnpm exec vitest run src/platform/resources/dictionary/dictionary-workspace.test.ts`。结果为 98 项：95 通过、3 失败，退出码 1。原始 stdout/stderr：`node_modules/.cache/metadata-integration-20261024/b1-delete-context-red.log`；退出码：`node_modules/.cache/metadata-integration-20261024/b1-delete-context-red.exit`。

真实行为失败：

1. `does not treat an empty reset entry view as a complete deletion snapshot`：成功加载空条目结果后调用公开 `entries.resetState()`；原生状态成为 `rows=0`、`total=0`、`requestState=Idle`，但 `canRemoveDefinition` 返回 `true`。
2. `does not stage a definition deletion from an empty entry view after resetState`：同一真实路径调用 `removeDefinition()` 后，条目没有待删行，但定义行 D1 已从 rows 移除且进入 `pendingDeleteIds`，`pending=true`；未发出保存请求。
3. `does not stage deletion while the entries view is independently refreshing`：公开 `entries.requestRefresh()` 被真实 HTTP 夹具挂起，断言时 `requestState=Loading`。期间 `canRemoveDefinition=true`，`removeDefinition()` 暂存 E1 与 D1 两项删除。释放查询后，DataView 因编辑变化保护而拒绝接纳结果（日志含 `DATA_VIEW_UNSAVED_CHANGES`）；并未静默覆盖删除草稿。

已有保护：`preflights every entry delete permission before staging any child or definition deletion` 使用两条正式查询结果，并令后一条 E2 的删除权限拒绝。该用例通过：可用性为 false，执行拒绝，E1/E2 与定义均无待删项，且没有保存请求。这证明当前完整权限预检能避免已知的后续目标权限失败造成部分暂存；它不覆盖查询失效或在途查询状态。

已核 DataView 正式行为：`resetState()` 是公开 API，清理 rows 并将 requestState 设为 Idle；对已有 edits / staged changes，替换结果公共守卫会拒绝重置。此反例使用无草稿的成功加载后重置，不直接修改内部状态。独立刷新反例通过夹具延迟真实查询，不伪造 requestState 或 `canRemoveDefinition`。

初次命令曾因从包目录使用相对 cache 路径而未能创建日志，vitest 未执行；随后使用 worktree 绝对 cache 路径重跑，以上归档为有效完整输出。
