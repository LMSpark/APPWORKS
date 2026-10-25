# B1 删除完整性 GREEN

范围限于原字典workspace及其测试文件；没有新增状态、查询、保存或全局引用扫描。

## 修复

`DictionaryWorkspace.canRemoveDefinition` 在原有业务态、完整行数和逐行删除权限条件之前，增加只读查询上下文准入：DataSet 和两个 DataView 均未销毁；definition 与 entries 均处于 `RequestState.Loaded`；两个视图均无 `loadingError`、`refreshPending`、`mutating` 或未确认保存。`removeDefinition()` 继续用同一 getter 作为首个删除操作前的守卫；不发额外查询，不动普通保存或行权限合同。

该检查让 `rows=total=0` 的 reset 空视图无法冒充成功查询，也阻止任一视图 Loading 时逐条暂存删除。两视图重新 Loaded 且通过原数据/权限检查后，删除和显式取消仍可用。

## 验证

- `pnpm exec vitest run src/platform/resources/dictionary/dictionary-workspace.test.ts`：101/101 通过。日志：`b1-delete-context-green-domain-final.log/.exit`。
- `pnpm exec vitest run tests/runtime/page/dictionary/dictionary-workflow.test.ts tests/runtime/page/dictionary/dictionary-catalog.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts`：143/143 通过。日志：`b1-delete-context-green-runtime-final.log/.exit`。
- `pnpm run typecheck`：exit 0。日志：`b1-delete-context-green-typecheck-final.log/.exit`。
- 两个修改文件 scoped eslint：exit 0。日志：`b1-delete-context-green-lint-final.log/.exit`。
- 第一轮 scoped lint 曾因测试 finally 中 `await dataSet.destroy()`（同步API）报两处 await-thenable；移除无效 await 后，最终 scoped lint 通过。首次失败日志留存于 `b1-delete-context-green-lint.log/.exit`。

RED 证据仍在 `b1-delete-context-red-v3.log/.exit/.md`。

## 冻结 hash

- `packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.ts`：`6B6F940BDB71E8E18B4F8521B75F1CC9484277B84E916C5A48D1D3AF8A4C9B1F`
- `packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.test.ts`：`4D814D27C9E5836FD6BBD29F4C4770F6807E3A2E05966DE3A2F27001C98CCD9B`

本次未运行 ClassModel 生成，未提交。检查 git status 时另见大量 generated/dts-class-model 删除和 `notes/data-space-retirement-ledger.md` 修改；这些不是本组文件，本组未触碰，需由主控核查其来源。
