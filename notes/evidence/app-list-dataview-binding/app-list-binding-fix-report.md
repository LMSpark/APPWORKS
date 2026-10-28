# AppList DataView binding fix loop

## Review finding (verbatim)

Finding — P2: Per-row read restrictions can hide the entire list. `validateScenarioView` rejects the whole DataView if any row lacks visible access to any of `rowid`, `AppName`, `AppDesc`, or `IsSys`; its caller then sets `runtimeError`, which suppresses `RendererList`. That defeats the per-field visibility behavior expected from the field fallback and row-button checks when only an individual field or row is unreadable. Validate structural identity separately, and let each field or action handle its own read access.

## Required repair

Keep fail-closed validation for formal model identity, primary key, and row identity required by RendererList. Do not fail the entire list because a presentation field is unreadable. The standard FieldText fallback must continue to select only DataView-readable fields. Hide only the action whose required row fields are unreadable; do not read hidden values or weaken permissions.

## Covering tests

- `tests/runtime/tenant/app-list-dataview-binding.test.ts`
- `packages/spark-component/src/tests/runtime/field-display-fallback.test.ts`
- `packages/spark-component/src/tests/runtime/field-row-scope.test.ts`

## Repro/validation report required

Append the exact commands, exit codes, and output for the covering tests and official ClassModel generation/check. Do not modify unrelated product files. Do not submit or push.

## Round 1 repair and verification

### Repair

- `validateScenarioView` still fails closed when the bound model is not `Base_AppSystemList`, the primary key is not `rowid`, or any row lacks visible/readable/valid `rowid`. It no longer checks `AppName`, `AppDesc`, or `IsSys` globally, so one row's presentation-field restriction cannot suppress the entire `RendererList`.
- `FieldText` continues to select fallback values only after `fieldAccess(row, field).read === 'visible'`. `projectFromRow` reads AppDesc/AppName/IsSys only after the corresponding read check. RendererButton `onBeforeRender` continues to hide the per-row tag/delete action when its required field is unreadable; rowid remains a fail-closed list identity requirement.
- Added tests in all three requested files. The fallback test uses a throwing getter to prove hidden values are not accessed. The row-scope test confirms narrowed field permissions do not discard a matching DataView row scope.

### RED

Command: `pnpm exec vitest run tests/runtime/tenant/app-list-dataview-binding.test.ts packages/spark-component/src/tests/runtime/field-display-fallback.test.ts packages/spark-component/src/tests/runtime/field-row-scope.test.ts`

Exit: 1. Output: 3 files; 1 failing test (AppList validator still gated the whole DataView on rowid/AppName/AppDesc/IsSys); 2 files passed. Full captured output: `%TEMP%\app-list-binding-fix.RED.txt`.

### GREEN

Command: `pnpm exec vitest run tests/runtime/tenant/app-list-dataview-binding.test.ts packages/spark-component/src/tests/runtime/field-display-fallback.test.ts packages/spark-component/src/tests/runtime/field-row-scope.test.ts`

Exit: 0. Output: `Test Files 3 passed (3); Tests 10 passed (10)`.

Lint command: `pnpm exec eslint tests/runtime/tenant/app-list-dataview-binding.test.ts --max-warnings=0`

Exit: 0, no warnings. Then re-ran `pnpm exec vitest run tests/runtime/tenant/app-list-dataview-binding.test.ts`; exit 0, `Test Files 1 passed (1); Tests 4 passed (4)`.

Typecheck command: `pnpm run typecheck`

Exit: 0, output: `$ vue-tsc --noEmit --skipLibCheck -p tsconfig.typecheck.json`.

ClassModel verification command: `pnpm run verify:class-model`

Exit: 0. Output: `Test Files 4 passed (4); Tests 49 passed (49)`; `ensure:class-model-bundle`, Spark AI lint, and Spark AI typecheck all completed successfully.

### Official ClassModel generation stability

The exact generation command was run three times, with stdout/stderr/exit captured under `%TEMP%\app-list-binding-classmodel-round1\run{1,2,3}.{stdout,stderr,exit}.txt`:

`pnpm run generate:class-model-surface -- --incremental --source packages/spark-component/src/components/containers/layout/action/RendererButton/RendererButton.props.ts --source packages/spark-component/src/components/fields/context/field-display-fallback.ts --source packages/spark-component/src/components/fields/context/field-row-scope.ts --source packages/spark-component/src/components/fields/context/useActiveFieldRow.ts --source packages/spark-component/src/components/fields/context/useFieldPermission.ts --source packages/spark-component/src/components/fields/data-components/text/FieldText/FieldText.props.ts --source src/views/tenant/AppList.vue`

All three exits were 0. Each run emitted `sources=7 root DTS=7 closure DTS=705`, `DTS files: 705`, and `Semantic gaps: 3276`. The closure reflects the official DTS compiler dependency closure of the seven requested public/source contracts, including shared spark-component and spark-data types; it is not a request to widen product changes. To check repeatability after pass 2, generated files were SHA-256 hashed before and after pass 3 while normalizing only the volatile `generatedAt` line. Difference count: 0. Hash lists are `%TEMP%\app-list-binding-classmodel-round1\before-pass3.normalized.sha256` and `after-pass3.normalized.sha256`. Generation stdout/stderr/exit are saved for all passes.

No unrelated product source was modified; no submit or push was performed.

## Main-controller regression check after round 1

Command: `pnpm exec vitest run tests/app/views/tenant/app-list-dataview.test.ts tests/runtime/tenant/app-list-dataview-binding.test.ts packages/spark-component/src/tests/runtime/field-display-fallback.test.ts packages/spark-component/src/tests/runtime/field-row-scope.test.ts --reporter=dot`
Result: exit 1; 1 file failed, 3 passed; 3 failed, 15 passed; 3 unhandled errors. The pre-existing AppList route tests mount the real RendererList with a mocked PageRuntime class. RendererList consumes PAGE_RUNTIME and Spark capability validation rejects the mocked instance: `spark:capability:page-runtime failed runtime validation` at `useContainerDataSourceCore`. This appears to be an obsolete fixture after switching the formal route to the standard runtime component; update the fixture to provide a valid PageRuntime/DataSet, or stub RendererList while separately asserting the full DataView key and preserve actual runtime binding coverage in a component test. Do not weaken PAGE_RUNTIME validation.
Root independently confirmed targeted new tests 10/10 pass, typecheck process still running, ESLint clean, verify:class-model 49/49 pass.

## Round 2 fixture repair and regression

### Test setup change

The route lifecycle suite now stubs only `RendererList`, because it exercises route loading/cancellation and intentionally mocks `PageRuntime`. The stub displays its test rows and exposes the received `dataViewKey`; tests assert the exact key for the first scenario and after scenario switching. The source-contract test continues to assert direct `RendererList` binding and absence of scenario `projects[]` rendering. No PAGE_RUNTIME capability validation or product behavior was weakened. The rejected mock was only consumed by the real RendererList, matching the review diagnosis.

### Four-file regression

Exact command:

`pnpm exec vitest run tests/app/views/tenant/app-list-dataview.test.ts tests/runtime/tenant/app-list-dataview-binding.test.ts packages/spark-component/src/tests/runtime/field-display-fallback.test.ts packages/spark-component/src/tests/runtime/field-row-scope.test.ts --reporter=dot`

Exit: 0.

Output summary:

```text
Test Files 4 passed (4)
Tests 18 passed (18)
Start at 10:56:19
Duration 11.51s
```

The AppList view mount emits existing Vue warnings for the uninjected project-switch service and unstubbed Element Plus tags; all 18 assertions pass. Round 2 changed only `tests/app/views/tenant/app-list-dataview.test.ts`; no product behavior changed. No submit or push was performed.

## Re-review round 2 finding

Finding — Remaining test gap: the RendererList stub avoids the PAGE_RUNTIME mock failure and checks exact dataViewKey on initial load and scenario switch, but it does not resolve a DataView. Its stub renders shared state.rows directly; the switch test changes shared rows before navigating. The companion source-contract test also does not assert the direct :data-view-key="scenarioDataViewKey" relationship or runtime provider resolution. Keep the stub for route lifecycle coverage, and retain a separate runtime binding test using a valid PageRuntime fixture with distinct rows per scenario. That would verify cross-scenario data resolution without making the route suite depend on RendererList.
Reviewer verdict: Partial. This is a real cross-scenario data binding regression-test gap; product behavior may still be correct, but the requirement is not proven.

## Round 3 runtime-binding evidence

### Repair

- Strengthened the source contract to require the literal `:data-view-key="scenarioDataViewKey"` binding and `sparkProvide(PAGE_RUNTIME, current)` in AppList.
- Added an independent integration test in `tests/runtime/tenant/app-list-dataview-binding.test.ts`. It constructs and loads a real `PageRuntime` with two distinct `DataSet.fromJson` fixtures, provides it using `PAGE_RUNTIME`, mounts two real `RendererList` instances with `SCENE-A@Base_AppSystemList@default` and `SCENE-B@Base_AppSystemList@default`, and asserts each renders only its own scenario row. Route lifecycle tests keep their RendererList stub.
- No product behavior changed.

### Runtime binding focused test

Exact command: `pnpm exec vitest run tests/runtime/tenant/app-list-dataview-binding.test.ts --reporter=dot`

Exit: 0. Output: `Test Files 1 passed (1); Tests 5 passed (5)`.

### All covering files

Exact command: `pnpm exec vitest run tests/app/views/tenant/app-list-dataview.test.ts tests/runtime/tenant/app-list-dataview-binding.test.ts packages/spark-component/src/tests/runtime/field-display-fallback.test.ts packages/spark-component/src/tests/runtime/field-row-scope.test.ts --reporter=dot`

Exit: 0. Output: `Test Files 4 passed (4); Tests 19 passed (19); Start at 10:59:29; Duration 11.47s`.

The route suite retains pre-existing Vue warnings for the uninjected project-switch service and unstubbed Element Plus components; all tests pass. No submit or push was performed.
