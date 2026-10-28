# Remaining application catalog consumers: implementation result

Date: 2026-10-28

## Implementation

- `src/lowcode/lowcode-application-catalog.ts` now exposes the shared full-list and by-id formal DataView readers. Both use one projection (`AppDesc`/`AppName`/`rowid` for name, `AppName` for code, `Memo` for description), returned field visibility, strict stable row IDs, full-list duplicate rejection, and DataSet release. Navigation-root reads, the formal loader, and both consumers share a captured authenticated-scope guard.
- `src/services/project/project-settings.ts` now reads the exact application via the formal reader, retains the route/session enterprise consistency check, and rechecks scope after directory/navigation success and failure.
- `src/lowcode/lowcode-runtime.ts` project references now enforce the fixed workspace `X-AppId`, pass the guard into the formal catalog reader, and reject stale results/errors.
- Removed `LowcodePlatformApi.listApplications()` and its private raw query/normalization helpers. Kept the application type and FormKey. `LowcodeApplication.description` now means the readable `Memo`; owner fields remain source-only, with no username/role inference.
- Removed the old package-only list method test; formal DataView semantic coverage is in `tests/app/lowcode/resources/application/lowcode-application-catalog.test.ts`.

The settings dialog is not currently reachable from AppList (`openSettings` only warns and `settingsTarget` is never assigned). Project-reference methods are exposed through `ProjectWorkspace`/`useDevState` with no discovered Vue call point. This work preserves these public read capabilities and does not claim UI acceptance.

## Verification

- Root targeted command: `pnpm exec vitest run tests/runtime/project/project-settings-formal-catalog.test.ts tests/runtime/project/project-settings-application-type.test.ts tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts tests/runtime/tenant/app-list-dataview-binding.test.ts tests/app/lowcode/resources/application/lowcode-application-catalog.test.ts tests/app/views/tenant/app-list-dataview.test.ts tests/app/views/platform/platform-apps-dataview.test.ts tests/app/services/project/application-switch.test.ts tests/app/dev/dev-state-page-file-closed-loop.test.ts` — **9 files, 205 tests passed**. Raw output: `green-root-final.txt`.
- Reader-specific command: `pnpm exec vitest run tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts tests/app/lowcode/resources/application/lowcode-application-catalog.test.ts` — **2 files, 91 tests passed** before the final two root-reader auth cases were added. Raw output: `green-authenticated-readers.txt`.
- `pnpm run typecheck` — passed after the mapper test signature correction. The final command was run with output redirected to the evidence log by the active task.
- Targeted ESLint on changed source and test files — exit code 0; raw output is empty in `lint.txt`.
- `git diff --check` — passed; Git emitted only line-ending normalization warnings.
- `rg -n "listApplications|applicationCatalogQuery|normalizeApplications" src packages/spark-lowcode-api tests --glob '!**/generated/**'` — production source has no matches. The only remaining test matches assert that the removed method is absent.
- The required package-directory command `pnpm test:run` reported **28 files passed, 2 failed; 1200 passed, 4 failed**. The four failures are in `data-space-model-alias.test.ts` (three derived-alias new-row identity cases) and `dictionary-workspace.test.ts` (server-rejection retry draft case). The parent independently reproduced the same four failures on base commit `3e182b62d` (`baseline-*` evidence), so they predate this change. Full output: `green-package-tests.txt`.
- The broader exploratory `use-dev-state-page-data-history.test.ts` run produced five failures among 18 cases. The parent independently reproduced the same five on base commit `3e182b62d`; the file is excluded from this slice's final targeted pass. Full current-worktree output: `recheck-failures.txt`.
- Implementation-before RED for the two later-added no-op-caller navigation authentication-scope tests was not captured. The gap is recorded, without fabricating a RED transcript, in `red-authenticated-scope.txt`. The original nine-case RED output remains in `red.txt`.

No ledger, generated artifacts, Java, or commits were changed by this slice. The parent ran official ClassModel generation and full `verify:rules`/`build` gates after the source freeze.

## Controller scope correction and live proof (2026-10-29)

- This is an API-convergence intermediate result, not completion of configuration-driven runtime. loadFormalHostDataView still constructs ScenarioViewConfig in host code. The user requires using existing data-resource/data-space management for formal configuration; that architecture analysis is now active.
- The controller ran formal ClassModel generation, lowcode contract generation, complete verify:rules and production build successfully. Source review and independent review passed after the new blueprint fixture was corrected.
- Live SPA: 62 catalog rows, page returns 20/20/20/2 with Count 62, visible Memo values; standard card entered D99 server management and native menu returned to 62-card catalog. No Document request in the untruncated activation window, no saves. See spa-network.json and spa-return-catalog.png.
- Baseline root auth tests both pass (baseline-root-auth-scope.txt); these are consistency coverage, not valid defect RED. Baseline package-ready and dev-history-ready outputs reproduce the same four and five failures respectively. Dependency bootstrap attempts are diagnostic-only, not product-test evidence.
