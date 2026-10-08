状态：accepted-ownership-slice

主控于 2026-10-08 05:00 签收：逐一对比五文件前像，独立六suite 64项通过；发现dirty切换测试顺序不足后要求修正，再独立最终tab测试1项通过。实际浏览器返回目录、由记录重新进入相同设计工具、6节点关系图恢复通过（pilot-runtime-ownership-online.json/png）。浏览器仅只读回归；真实dirty卸载/重挂载/跨12标签/关闭门禁由集成测试证明，不冒充在线编辑证据。日志pilot-runtime-ownership-root-tests.log和pilot-runtime-ownership-tab-final-root-tests.log。完成子计划删除，M0仍未整页完成。
# PageRuntime ownership implementation result

## Completed

- Changed `SparkPageRenderer.release()` to abort the active script, unsubscribe view listeners, clear renderer state, and drop its runtime reference without disposing the host-owned `PageRuntime`.
- Added a real `DataView.updateEditingValue()` regression test. The first run failed at `runtime.destroyed === false` because the renderer destroyed the runtime and DataView. After the minimal release change, the same test passed. It now also proves the edit and DataView identity survive renderer remount, and a handler captured from the old renderer rejects with `PAGE_RUNTIME_STALE`.
- Updated the tab integration test to use a real `SparkPageRenderer` through `DynamicRouter` and `KeepAlive`; it now edits a real DataView before navigating away, opens the remaining calls, then switches back and verifies the same view and draft remain. A separate clean-call phase verifies navigation cancellation; dirty close rejection, explicit discard, and owner disposal on close remain covered. Removed the `isDirty` getter spy.
- Confirmed DevPreviewTab disposes both the replaced runtime on refresh and the current runtime on unmount. Updated the API lifecycle wording to make renderer borrowing and creator-owned final disposal explicit.
- Added explicit cleanup for test-created PageRuntime instances. No production owner, PageRuntime/Pool logic, graph code, dependencies, or remote state was changed.

## Verification

| Check | Result |
|---|---|
| Baseline `pnpm run typecheck` | Passed (exit 0) |
| Focused RED `pnpm exec vitest run tests/runtime/page/spark-page-renderer-binding.test.ts -t "keeps a real DataView edit"` | Failed as expected before production change: renderer had destroyed the runtime and DataView |
| Same focused test after production change | Passed (1 test) |
| Six planned test files | Passed: 6 files, 64 tests |
| Final `pnpm run typecheck` | Passed (exit 0) |
| Targeted ESLint for renderer and three target tests | Passed (exit 0) |
| `pnpm run verify:ai-codegen` | Passed; 988 files checked |
| `pnpm run verify:dirs` | Passed |
| `git diff --check` on the five target files | Passed (exit 0; Git emitted only an LF-to-CRLF advisory for the tab test) |
| Review follow-up `pnpm exec vitest run tests/runtime/page/runtime/page-runtime-tabs.test.ts` | Passed: 1 test; draft was edited before switching away and verified after switching back |
| Review follow-up `pnpm run typecheck` | Passed (exit 0) |
| Review follow-up targeted ESLint and `git diff --check` for the tab test | Passed (exit 0; only the same Git line-ending advisory) |

Test command:

```text
pnpm exec vitest run tests/runtime/page/spark-page-renderer-binding.test.ts tests/runtime/page/runtime/page-runtime-tabs.test.ts tests/app/dev/dev-preview-tab-loop.test.ts tests/runtime/auth-nav/application/project-navigation-guard.test.ts tests/app/services/project/application-switch.test.ts packages/spark-project-model/tests/page-runtime.test.ts
```

## File fingerprints

Preimages were saved under `runtime-ownership-before/` before task edits. The shared worktree already contained unrelated dirty changes in the renderer, API, and binding test; these were preserved. The preimage hashes below establish the task baseline, while final hashes identify the frozen working files.

| File | Preimage SHA-256 | Final SHA-256 |
|---|---|---|
| `packages/spark-component/src/page/renderer/SparkPageRenderer.vue` | `FFDBF24841D5E54F75BBCCA9E7A14315BE19C6E223D06D368F09ABE05F4A95B3` | `39A148964F3BC8C871BE8AE003E2DFF43F3FFF39E010FA9118A90D5B792D16E1` |
| `tests/runtime/page/spark-page-renderer-binding.test.ts` | `434386C0B80C994FEA54467241D3D515F423E68EBCAC04E9249D7D062C05179B` | `275CC016DE61B099704C28DA8EA9550256035BA3D5B4A470858DF5A1533F655D` |
| `tests/runtime/page/runtime/page-runtime-tabs.test.ts` | `48CF5747F812584D0906D2F0C7A7D9F14A0AB72632F5975C8E6C82FF0C1725D5` | `1C525D233FF4176704313CFBB8C4E4528AF2F9503C92441286C20D23E15A7393` |
| `tests/app/dev/dev-preview-tab-loop.test.ts` | `3A4C3C3FC784678C5729D2C0AB20CCC79FA4588114A67F5D7E668132242C2621` | `11969736225651EAB6A6EBFC6D2C90D4033E7C2F33A0308EC331E92376A090C7` |
| `packages/spark-component/API.md` | `EB82846BADAF42A309CE0696FDEB0B86AF56A736163FE8732B6BB5F3533D5B1F` | `C0B8F3C118B7F8F8E0E6594F4AFBDF71ED935023DA885F2FF15CCC003876EE82` |

## Boundary

The approved five-file scope is complete and frozen for independent review. Browser verification, any plan cleanup, and deployment checks remain with the parent owner; this change does not claim remote/browser behavior validation.

