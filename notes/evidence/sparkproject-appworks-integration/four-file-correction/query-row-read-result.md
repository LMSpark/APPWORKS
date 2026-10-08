# Query row read access result

Date: 2026-10-08
Scope: D03 direct prerequisite only; no page or online completion claim.

## Preserved preimage

The exact bytes of the three target files were copied before edits to `notes/evidence/sparkproject-appworks-integration/four-file-correction/query-row-read-preimage/20261008-124341-452/`. SHA-256 values are recorded in that directory's `manifest.json`. The existing mixed worktree changes in the query context and runtime API test were retained; no reset, stash, commit, or branch operation was performed.

## Change made

- `data-space-query-context.ts`: associates each frozen public query row with its captured `DataSpaceRowPermission` in a private `WeakMap`. `readFieldAccess(row, fieldName)` checks staleness first, then returns only the captured read tri-state for the exact row object, failing closed to `invisible` for clones and foreign rows. Formal key CRUD indexing and `bindFormalModel`'s prior key-based permission rebuild remain unchanged.
- `data-space-runtime-api.test.ts`: added a `runtime.query` keyless wire fixture with `primaryKeyField: null`, a business `rowid`, no system key, and h/m/e/d permission payload. Assertions cover visible/masked/invisible, immutable permission snapshot semantics, clone/foreign rejection, stale rejection, keyless row/action/save boundaries, and no save HTTP. Added direct missing-auth policy comparisons for `deny` and `visible-readonly`. Tests call the declared `context.readFieldAccess` method directly.
- `README.md`: documented exact-row identity, stale behavior, read-only scope, and the fact that page scripts/components continue to consume permission through DataView.

The context and runtime test files already had unrelated approved dirty changes at task start. The preimage preserves their exact starting state; their pre-existing hunks remain in the current worktree and are not attributed to this change.

## Review revision

Addressed the main controller's two review findings without expanding the three-file source scope: removed the test's `unknown as` signature cast; restored `bindFormalModel`'s original loop and key-based permission reconstruction from the saved preimage. The new row WeakMap and read method remain in place. Revision command outputs are retained under `notes/evidence/sparkproject-appworks-integration/four-file-correction/query-row-read-revision-20261008/`.

## Verification

- Pre-change `pnpm run typecheck`: exit 0; pre-change package typecheck: exit 0.
- Minimum RED before the implementation: focused keyless test failed because `readFieldAccess` did not exist. The original run output was not retained to a file; its exact command and failure are recorded here.
- Minimum keyless test after this review revision: exit 0, 1 passed; see `query-row-read-revision-20261008/minimum-keyless-test.log`.
- Final package suite: exit 0, 98 tests passed; see `query-row-read-revision-20261008/api-suite.log`.
- Final root typecheck: exit 0; see `query-row-read-revision-20261008/root-typecheck.log`.
- Final API typecheck: exit 0; see `query-row-read-revision-20261008/api-typecheck.log`.
- Scoped lint: exit 0; see `query-row-read-revision-20261008/lint.log`.
- Earlier unchanged gates: `pnpm run verify:ai-codegen` and `pnpm run verify:dirs` passed; not rerun per review request.
- Earlier scoped three-file `git diff --check` passed. Earlier whole-worktree `git diff --check` failed on pre-existing trailing whitespace in `packages/spark-data/src/tests/cascade-event-filter.test.ts:36` and `src/views/tenant/AppList.vue:183-194`; not rerun per review request.

## Remaining boundary

Root acceptance (2026-10-08): compared all three files against hash-verified preimages. Rejected and corrected the test type assertion and the unrelated bindFormalModel change; the keyed binding loop is restored. Read the revision suite/type/lint logs (all EXIT_CODE=0). The subsequent model-source-live-contract.json probe exercised the new exact-row read method against the authorized backend for all six source lists, including the keyless table source; it proves read feasibility only. The executed child plan is removed under stage 7; the main integration plan remains implementing.

This change only enables a trusted consumer that retains the original `context.rows` object to read its captured read state. No source picker consumer, four-file page behavior, browser run, real backend authorization, or online persistence was implemented or verified here. The main controller should review the exact three-file diff and proceed with page-level acceptance separately.
