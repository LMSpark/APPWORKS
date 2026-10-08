# DataView pending discard implementation result

验收状态：accepted-discard-slice（主控，2026-10-08 05:21）。已按前像审查新增方法及全部测试差异，独立运行根 DataView suite 21 项和 lowcode-api 包 suite 95 项，全部通过；日志 pilot-pending-discard-root-tests.log、pilot-pending-discard-runtime-root-tests.log。独立审查发现的树缓存、删除行重现与取消新增孤立 overlay 已在同4文件修正并复验。最终指纹以本报告末尾 Current target SHA-256 为准。未知回执不保证服务器回滚；仅完成本地丢弃依赖，不代表参数页或 M0 完成。

## Outcome

Implemented `DataView.discardPendingChanges(ids?)` for query-backed views. It restores only pending target rows from the same strongly-held query context, clears matching create/update/delete tracking and editor overlays, and recalculates rows through the existing mutation path. Omitting `ids` selects only current pending IDs; `[]` is a no-op. Every target is validated before state changes. Missing owner/baseline, stale identity, ambiguous row identity, destroyed view, loading, or mutating rejects without clearing pending state. The method sends no query or save request; callers may explicitly call `refresh()` afterward.

An unknown save result is treated only as uncertainty about the server. The test demonstrates that after explicit local discard, a successful owner query can return a different value; a failed refresh preserves the restored local baseline and leaves the view stale/read-only. No server rollback or automatic save retry is claimed.

## RED/GREEN

- RED: before implementation, `discardEditingRows()` left `view.rows[0].name` as `Unsaved` instead of the strong query baseline value `Alice`; the legacy editing-overlay method does not undo business-row dirty state.
- GREEN: after implementation, the focused test restored `Alice`, cleared dirty and editing state, then allowed an explicit refresh.
- During expanded verification, the owner fixture showed `refresh()` resolves `void` while marking a failed query stale, rather than rejecting. The test was corrected to assert preserved rows and stale write refusal, then recover via a later successful refresh.
- A duplicate-row fixture failed first at current row identity validation (`DATA_VIEW_DISCARD_ROW`); the test asserts all rows and dirty flags remain unchanged. This verifies validation completes before any row is restored.

## Changed files

- `packages/spark-data/src/data-view.ts`: added the public discard method.
- `tests/runtime/data-view/dataview-crud-bridge.test.ts`: added baseline restore, stale-context refusal, and local-view/no-owner refusal tests.
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts`: added unknown-result/fresh-read, failed-refresh, busy owner, mixed partial/all pending state, permissions/selection, and atomic duplicate-identity tests.
- `packages/spark-data/API.md`: documented local-only semantics and explicit refresh behavior.

No other source or test files were changed for this implementation. Target-file preimages and hashes are retained under `notes/evidence/sparkproject-appworks-integration/four-file-correction/pending-discard-before/`.

## Verification

| Command | Exit | Result |
| --- | ---: | --- |
| Baseline `pnpm run typecheck` | 0 | Passed before production/test edits. |
| RED `pnpm exec vitest run tests/runtime/data-view/dataview-crud-bridge.test.ts` | 1 | 18 passed, 1 failed at the expected `Unsaved` vs `Alice` assertion. |
| Focused GREEN `pnpm exec vitest run tests/runtime/data-view/dataview-crud-bridge.test.ts -t 'restores a failed query-backed edit'` | 0 | 1 passed. |
| `pnpm exec vitest run tests/runtime/data-view/dataview-crud-bridge.test.ts` | 0 | 21 passed. |
| `pnpm --dir packages/spark-lowcode-api test:run -- src/platform/data-space/runtime/data-space-runtime-api.test.ts` | 0 | 92 passed. |
| Final `pnpm run typecheck` | 0 | Passed. |
| Final precise `pnpm exec eslint packages/spark-data/src/data-view.ts tests/runtime/data-view/dataview-crud-bridge.test.ts packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts` | 0 | Passed. |
| `pnpm run verify:ai-codegen` | 0 | 988 files checked. |
| `pnpm run verify:dirs` | 0 | Directory limits passed. |
| `git diff --check -- packages/spark-data/src/data-view.ts tests/runtime/data-view/dataview-crud-bridge.test.ts packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts packages/spark-data/API.md` | 0 | Passed; Git printed only its existing LF-to-CRLF advisory for the package test file. |

The root Vitest config does not include `packages/spark-lowcode-api/src/platform/...` directly. That suite was run with the package’s own `vitest.config.ts` via the package script above; a root-config attempt correctly reported “No test files found” and was not counted as verification.

## Target hashes

SHA-256 after implementation:

- `packages/spark-data/src/data-view.ts`: `2C24F5DA60C8A1D506C2725CAA8F107609646F034D703CD3B62E49C3D77A7FE8`
- `tests/runtime/data-view/dataview-crud-bridge.test.ts`: `C3440D30C5DCFC8C8DBE354CF51964BEC5ABA9178A3A3E21D34DE394E033F585`
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts`: `84FD7109836E92BCB33BC99F1B21E01A1A7AF529065AEE931E551067A00193F9`
- `packages/spark-data/API.md`: `937CBB55CCB66E2CD4BF85A637F10074E89F6CDB10EAF3EE060E392318BDC615`

## Boundaries

- No online calls, deployments, commits, pushes, or branches were performed.
- No full repository test, lint, or build was run.
- The plan remains `implementing` pending independent owner review.

## 2026-10-08 follow-up repair and verification

Independent review found two owner-state gaps and an avoidable repeated-scan path. The repair remains within the same four files.

### Additional RED/GREEN evidence

- Tree cache RED: with the real query owner, edited CHILD.parentId from ROOT-A to ROOT-B, then discarded; public rows restored ROOT-A but `view.treeManager?.getNode('CHILD')?.parentId` remained ROOT-B. GREEN after calling the existing `syncTreeManagerFromRows()` immediately after the mutation replacement; both public row and tree cache now read ROOT-A.
- Reappeared delete RED: call public `removeRow('ROW-1')`, then public `appendRow({ rowid: 'ROW-1', ... })`; discard previously accepted this contradictory pending-delete/current identity. GREEN after prevalidation rejects it before any row/tracking mutation; test verifies rows remain unchanged and pending delete remains.
- Cancelled create overlay RED: `addRow(ROW-NEW)` → `updateEditingValue(ROW-NEW, ...)` → `removeRow(ROW-NEW)` leaves an editor overlay but no pending-create/current row. Discard previously rejected with `DATA_VIEW_DISCARD_ROW`. GREEN now only when the captured editing original has a valid owner key absent from both the strong query baseline owner-key map and baseline row-ID map, with no current row or pending create/update/delete state. The test confirms the overlay clears, the canceled row stays absent, a different dirty row remains unchanged, and no query/save is sent. Missing/ambiguous identity continues to fail atomically.

The restore-order assembly now builds a set of surviving IDs, buckets pending deleted baseline rows before the next surviving baseline row (or after the last survivor), and emits the result in a single pass. This removes repeated `slice`/`findIndex` scans while preserving baseline order and unrelated current row order.

### Final follow-up checks

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm run typecheck` | 0 | Passed. |
| `pnpm exec vitest run tests/runtime/data-view/dataview-crud-bridge.test.ts` | 0 | 21 passed. |
| `pnpm --dir packages/spark-lowcode-api test:run -- src/platform/data-space/runtime/data-space-runtime-api.test.ts` | 0 | 95 passed. |
| Precise `pnpm exec eslint packages/spark-data/src/data-view.ts tests/runtime/data-view/dataview-crud-bridge.test.ts packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts` | 0 | Passed. |
| `pnpm run verify:ai-codegen` | 0 | 988 files checked. |
| `pnpm run verify:dirs` | 0 | Passed. |
| Scoped `git diff --check` for the four plan files | 0 | Passed; only the existing LF-to-CRLF advisory appeared. |

### Current target SHA-256

- `packages/spark-data/src/data-view.ts`: `ECBC0E3B9D5D0D7D0FCD8AA523151C1BDA7062EEEF61545DE26064FE3628677E`
- `tests/runtime/data-view/dataview-crud-bridge.test.ts`: `C3440D30C5DCFC8C8DBE354CF51964BEC5ABA9178A3A3E21D34DE394E033F585`
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts`: `CD58A056C518684C8B3DA7EB481340CAA12F74846D8F8ED2B663431DDDCF0473`
- `packages/spark-data/API.md`: `937CBB55CCB66E2CD4BF85A637F10074E89F6CDB10EAF3EE060E392318BDC615`

No online calls or unrelated file edits were made. The plan remains `implementing` for independent owner review.
