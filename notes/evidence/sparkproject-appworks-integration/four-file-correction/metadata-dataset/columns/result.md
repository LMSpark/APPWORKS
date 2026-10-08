# Native column validation slice

Status: ACCEPTED for native column-validation persistence and the single-session definition editing boundary. Full DataSet coverage remains in the active plan.

## Scope and source

- Exact six production/test files are listed with byte-for-byte preimages and SHA256 values in `preimages.json`; final SHA256 values are in `final-hashes.json`.
- Existing database models remain the source of column name, type, label and primary-key status. The scenario file now accepts `tables[tableName].columns` entries containing only native `name` and seven validation properties. Unknown keys, duplicate names, invalid bounds and invalid patterns fail before a file edit.
- The assembler accepts only the existing validated, frozen ScenarioViewConfig instance and rejects structural impostors before reading configuration. It resolves each configured name against that table's unique formal output names; unknown or vanished outputs fail explicitly.
- The single-target session exposes `stageDefinition({expectedText,text})`. It validates an independent file and real assembler candidate, releases that candidate, checks scope/owner/revision/text/generation, and applies the validated input snapshot through the existing file owner. Save and recovery remain with the existing owner.

## Verification

- Initial minimal test immediately after the first production edit: 72 passed, one expected old assertion failed because it required rejecting all `columns` (`first-edit-test.log`). That assertion was updated for the approved contract.
- Final focused run: four suites, 99 tests passed (`focused-tests.log`). It covers real file owner save, a fresh workspace, native assembly, `DataView.validator.validate` and `extractColumnRules`, same-name fields in separate models, clearing, vanished formal outputs, staging views without losing columns, failed draft atomicity, late candidate disposal, and mutable asynchronous input.
- Exact six-file ESLint passed with zero warnings (`lint.log`). Scoped `git diff --check` passed.
- Follow-up test-only correction removed the new non-`as const` type assertions in the two integration suites. The real reopened DataView validator now also verifies a formal numeric output with `min: 0`, rejects values below and above the configured bounds, and accepts 0 and an interior value. The two modified suites passed 18/18 (`test-correction.log`); exact six-file ESLint passed with zero warnings again (`lint-correction.log`). Final hashes were refreshed.
- Independent P2 review follow-up: existing `stageView` now checks retained `columns[].name` against the freshly read formal output set before `file.setText`. The real owner test proved the previous failure happened after the draft mutation (`review-min-red.log`) and now proves the old text and accepted projection remain intact (`review-min-green.log`).
- The assembler now accepts the existing `ScenarioViewConfig` class directly and rejects a structural impostor before calling its `toJSON`. The red/green test is in `review-instance-red.log` and `review-instance-green.log`. This avoids a JSON stringify pass silently dropping `undefined` properties.
- After both P2 fixes, all four focused suites passed 101/101 (`review-focused-tests.log`), and exact six-file ESLint passed with zero warnings (`review-lint.log`). The main agent owns the final root typecheck and broader runtime regression after this follow-up.
- Root final typecheck passed after both P2 fixes (`typecheck-final.log`). Three related runtime/metadata/formal-assembly suites passed 43/43 (`runtime-regression-final.log`). The AI codegen rule scan passed for 1011 scanned files (`ai-codegen.log`).
- The root's final real single-ID session probe passed (`online-result.json`): database output shif.val temporarily received a local required constraint through stageDefinition; native rule extraction saw it, database type/label/key remained intact, then the exact original file text was restored locally and all DataSets disposed. The network allowlist permitted reads only; writes were 0. This proves actual model integration, not an online configuration save.
- Independent focused re-review resolved both P2 findings (`.superpowers/sdd/plan-data-space-metadata-dataset/column-review-final.md`). Original bytes were hash checked by root; final sources match `final-hashes.json`. No production change followed final checks.

## Boundary

- `computeExpression` remains unsupported in the file codec. The existing query-save path is not proven to invoke `DataValidator`, so this slice does not claim universal save validation.
- Candidate validation failure leaves the existing draft and accepted projection usable. If candidate validation succeeds and `file.setText` commits, a later `refresh` failure can leave the new draft applied with the projection invalidated; it is not an all-network-failure rollback guarantee.
- No UI, Java, commit, push, branch, or online write was performed in this slice.

Reusable observations retained pending knowledge approval: partial native column config must not copy database structure; an asynchronous edit validates a captured input snapshot; both whole-definition and old view-edit paths must reject invalid retained references before changing that draft. No personal-memory or unconfirmed knowledge entry was written.
