# Pilot edit result: data-space catalog existing-row edit

Date: 2026-10-07
Scope: existing-row Name/description editing in the four-file data-space catalog page.

## Outcome

Implemented one edit action for `view.currentRow`, gated by the current query result's row edit permission and each field's backend write permission. The flow collects inputs before staging, uses defaults only for readable fields, applies required-field validation from the backend permission snapshot, and compares originals only when readable. It stages and saves only changed business fields for the current row ID in `Base_DataSet@catalog`. Search and paging refuse re-entry during a write. Any unsuccessful or thrown save result preserves the unknown-result row ID and blocks new/edit resubmission. A confirmed save refreshes and verifies the same ID.

The test fixture now accepts `maplistedit` Changed receipts and reads changed values back through the assembled runtime. It compiles scripts with the real `buildPageContext` and abort signal. No role/admin branch, rule/pagedata change, host API, dependency, commit, browser action, or backend request was added.

## Changed files

- `config/pages/data-platform/data-space-catalog/script.js`: current-row edit action, permission and row-identity checks, guarded staged-save flow.
- `config/pages/data-platform/data-space-catalog/style.css`: toolbar layout for actions.
- `tests/runtime/page/catalog/data-space-four-file.test.ts`: Changed receipt fixture and edit behavior/lifecycle coverage.

## Before-edit backups and SHA-256

Backups under `edit-before/` are byte-for-byte copies of the three target files before edits. Their hashes match the original files.

| File | Before SHA-256 | After SHA-256 |
|---|---|---|
| `config/pages/data-platform/data-space-catalog/script.js` | `6ED152A4D7B92EBCC3D0FB03FBA530212744F3A3803B86D47658FCA2355B3EB5` | `50AFD4687A72FB4B04665CEB5EF7F0DA40DC28ECA5DF7A20561BC7CC5B420448` |
| `config/pages/data-platform/data-space-catalog/style.css` | `65B854AB2E9A69AF8F780F47C6C1FCA0A342562D1FC1A306F5D4234CEC1023C0` | `A812CD9749764E3076BB550A47F78534B3E954E21EDCA17A9E80DF730C03D21B` |
| `tests/runtime/page/catalog/data-space-four-file.test.ts` | `F75125F37C88A206504619EC89C799BD6F7C0192CEC1020B253722A600E0B90C` | `21364AEA848FA4783D711906D0FD1A9A6AD59256B0DB5F9874F175B513ED96BB` |

## Verification output

- RED: `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts -t "renders an edit action only for rows authorized by the query result"` initially failed because the script exposed only the add action.
- GREEN: `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts` → `Test Files 1 passed (1); Tests 13 passed (13)`.
- Typecheck: `pnpm run typecheck` → exit 0; `$ vue-tsc --noEmit --skipLibCheck -p tsconfig.typecheck.json`.
- Exact lint: `pnpm exec eslint config/pages/data-platform/data-space-catalog/script.js tests/runtime/page/catalog/data-space-four-file.test.ts` → exit 0.
- AI codegen gate: `pnpm run verify:ai-codegen` → exit 0; `AI codegen rule scan passed: 982 file(s) checked.`
- Baseline typecheck evidence: `pilot-edit-baseline-typecheck.log` → passed before edits.

An early post-implementation typecheck found test-only VNode indexing errors; the typed action helper resolved them. A subsequent typecheck found an optional inferred row shape in the multi-row fixture; using a named first-row value resolved it. Final verification above passed after both corrections. An earlier ESLint invocation that included CSS reported CSS has no matching ESLint configuration; the final precise invocation linted the configured JavaScript and TypeScript targets successfully.

## Coverage

- Denied edit actions stay hidden, and direct invocation with denied permission performs no prompt or save.
- One edit action is exposed for the current row; only authorized Name/description fields are accepted. `Type` and `sysid` never enter the patch.
- Hidden writable values never enter prompt defaults. An unread, writable `description` with original `null` and explicit empty input submits `''`; a backend-required description rejects an empty input.
- Cancelled prompts and unchanged visible values perform zero writes.
- Switching current rows or replacing rows with a query during a prompt prevents saving the captured row. Script query re-entry is blocked while editing.
- Actual `buildPageContext` abort during a prompt prevents a save and does not attempt a stale-page message.
- After a dispatched save with unknown outcome, the latest edit and add actions cannot submit again.

## Issues and limits

- No blockers remain within the approved scope.
- Browser/backend verification remains for the main controller's review/acceptance step in the plan.
- The workspace contains unrelated pre-existing modifications and untracked files. This pass changed only the three scoped files plus the requested evidence backups and result record.

## Second review correction (2026-10-07)

Scope remained limited to `script.js` and the existing test file; `style.css` was frozen.

### Corrections

- The edit unknown-save message now says “当前记录” and does not include the internal row ID. The ID remains retained internally to lock repeat submissions. The existing add-specific message was left unchanged.
- After a confirmed save and successful refresh, if the original ID is absent from the active result, the page reports “数据空间已保存，当前记录已不在列表中”. It does not clear the active filter, open another query owner, or report refresh failure.

### Round-two SHA-256

| File | Before round two | After round two |
|---|---|---|
| `config/pages/data-platform/data-space-catalog/script.js` | `50AFD4687A72FB4B04665CEB5EF7F0DA40DC28ECA5DF7A20561BC7CC5B420448` | `5CE621E3172D635E4FFAC18497F6FDB81156A9643AE937537874F92A2A854072` |
| `config/pages/data-platform/data-space-catalog/style.css` | `A812CD9749764E3076BB550A47F78534B3E954E21EDCA17A9E80DF730C03D21B` | `A812CD9749764E3076BB550A47F78534B3E954E21EDCA17A9E80DF730C03D21B` |
| `tests/runtime/page/catalog/data-space-four-file.test.ts` | `21364AEA848FA4783D711906D0FD1A9A6AD59256B0DB5F9874F175B513ED96BB` | `AACB0708C5B9FF62A0F03B9F73042D81793A14FAD06C0D5E361D974F9F39DF80` |

### RED/GREEN and final verification

- RED: the hidden-rowid/unknown-result case observed `DATASET-1` in the edit error message; the refresh-omits-edited-row case observed a false “刷新失败” message.
- GREEN: `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts -t "does not resend an edit when the save outcome is unknown|keeps the active filter and reports success when the edited row leaves the refreshed result"` → 2 passed.
- Focused suite: `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts` → 1 file passed, 14 tests passed.
- Typecheck: `pnpm run typecheck` → exit 0.
- Exact lint: `pnpm exec eslint config/pages/data-platform/data-space-catalog/script.js tests/runtime/page/catalog/data-space-four-file.test.ts` → exit 0.

The refresh test checks the same serialized active `Filter` before and after the save, confirms the row is absent, observes the success/not-in-list message with no refresh-failure text, and sees exactly one save request. The privacy test sets backend `h=['rowid']`, captures UI messages, verifies the original ID is absent, and attempts the latest edit and add actions after failure; only the initial save is dispatched.

Round two had no remaining issue. No browser/backend call, full suite, build, ai-codegen gate, commit, or push was run.
