# Single-target design session result

Status: ACCEPTED for the focused single-target session. Root final typecheck and live entry read passed; independent scoped re-review passed. Full native DataSet persistence remains incomplete as recorded in the active plan.

Preimages: lowcode-data-space-view-design.ts.before SHA256 D2442277E326ADF97F1AF7C14165A9E4CCB4559DCE5A1984BA38BB0AFCCA5DED; lowcode-data-space-design.ts.before SHA256 A7E6F9541A4DFDA48F6EE675508DFCB2833B502053605CD1975F59FA5EAC94FB. New test file was absent before implementation.

Changed source/test paths:
- src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts: owned session with formal metadata, file-owned native definition projection, target-bound create/stage/save/refresh/dispose, revision and scope checks, candidate cleanup.
- src/lowcode/data-space/lowcode-data-space-design.ts: exported no-UI single-target entry using existing app workspace and metadata loader. Existing page reader contract remains.
- 	ests/runtime/auth-nav/data-space/metadata/lowcode-data-space-design-session.test.ts: real workspace, view design and assembler integration at fixture I/O boundary.

Verification: first new focused test failed as expected because openDesignSession did not exist, then passed. Final focused Vitest: 3 files, 15 tests passed. Precise ESLint on the three paths passed. Root typecheck was green before edits; final root typecheck and online read remain with main.

Boundaries: file missing gives formal metadata and null definition until explicit create. Malformed/wrong-bound file fails. Session does not save native projection mutation; ScenarioViewFile remains the sole editable definition source. File writes use existing workspace compare/readback owner. No UI, Java, permission, or other production path changed. This does not close remaining DataSet column/config/cascade gaps or wire an old page.

## Fix round 1

Status: DONE for the same three source/test paths. Scope assertion failure now disposes the session and destroys both accepted definition and metadata DataSets while rethrowing the original error. Same-scope owner replacement detaches the prior subscription and destroys its projection; refresh may attach the new owner.

Session now exposes target-bound `verifyViews`, `previewRemoteViews`, and `adoptViews` through the existing workspace owner. A lost response after one dispatched write leaves the file `unknown`; a second save is rejected, and `verifyViews` confirms by readback without another write. Remote conflict can be previewed and explicitly adopted. The native projection is checked against its accepted configuration snapshot before stage/save; direct config mutation raises `DATA_SPACE_DESIGN_PROJECTION_EDIT` and requires refresh.

Deterministic tests wait until the real assembler has produced a DataSet before switching scope or disposing, then assert that the produced candidate and metadata are destroyed. Owner removal and external file edits are also covered. Final focused Vitest: 3 files, 20 tests passed (`vitest-fix-round-1.log`). Precise ESLint: passed (`eslint-fix-round-1.log`). Root typecheck and online read remain with main. No UI, Java, permission, or unrelated production path changed.

## Projection snapshot correction

The accepted projection guard now snapshots the full native `DataSet.toJson()` configuration, removing only each view's runtime `rows`. It therefore detects direct changes to DataSet configuration, table binding/columns, and view configuration before stage/save. A new test mutates a native table column and confirms `DATA_SPACE_DESIGN_PROJECTION_EDIT`; refresh restores the file-owned definition. Focused session suite: 11/11 passed (`vitest-projection-snapshot.log`). Precise ESLint on the two changed files: exit 0 (`eslint-projection-snapshot.log`). The application entry was unchanged in this correction.

## Root acceptance

Final root `pnpm run typecheck` exited 0 (`typecheck-final.log`). Real `openLowcodeDataSpaceDesignSession(targetId)` validation completed at 2026-10-08T10:12:47Z (`online-result.json`): formal metadata returned 1 space, 7 models, 119 fields, 0 model relations; target definition contained 7 native DataTables with owned default DataViews. Scope identities remained distinct and disposal destroyed both DataSets. Writes were 0; only metadata/model/file reads were performed. Existing pilot file bytes were not changed. Save/reopen, richer named views and recovery tests use real owners with boundary fixtures; this is not an online edit/save claim.

Independent review accepted the frozen correction for specification and code quality (`.superpowers/sdd/plan-data-space-metadata-dataset/session-review-final.md`); the reviewer did not rerun tests. No production changes followed final checks. Final SHA256:

- view-design/lowcode-data-space-view-design.ts: `5241488B7281CA0E8ED32FC0523959F2D8A423ACD5C712B1D2E751DD7996A198`
- lowcode-data-space-design.ts: `255E03709F78E401E1CA9939830E6D75F947847DBB28F5D388AC0D7B206809B2`
- lowcode-data-space-design-session.test.ts: `D378B685958965C092FC275ACC81FAC6DC3503B2F9B687556E3960C5DA65D719`

Reusable observations pending knowledge approval: losing request scope requires disposing both accepted and late projections; file-owner replacement invalidates projection identity even without a text event; an unknown dispatched save is resolved by verification, not replay. These remain in this evidence report; no unconfirmed knowledge or personal-memory update was made.
