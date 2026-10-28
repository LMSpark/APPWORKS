# Application catalog DataView slice

Date: 2026-10-28

## Contract implemented

- Default AppList scenario identity is the formal `LOWCODE_APPLICATION_CATALOG_FORM_KEY` (`7AB874097A1E8711A42FD845939A6E05`). An explicit `blueprintScenarioId` continues through the existing app-scoped scenario loader.
- The default loader reads formal space/model metadata under `DATA_SPACE_DESIGN_FORM_KEY` (`8D1AB14DD8277F3E7017CD38F77B09FD`) and assembles `Base_AppSystemList` using `DataSpaceApi`, shared `lowcodeHttp`, and `readAuthenticatedRequestScope()`.
- The view config sets `allPages:true`, `distinct:true`, `autoLoad:false`, and sorts by formal `rowid`. The loader only assembles; PageRuntime/AppList issues the single DataView refresh.
- `IsSys` is optional. Flag tags and delete visibility require both a present field and visible DataView permission; absence does not classify a record as a normal app.
- Runtime errors remain visible. Failed/stale runtime loads dispose their PageRuntime/DataSet.

## Evidence

- `red-before-refactor.log` records the old AppList test expectation failing because it still expected the no-scenario legacy `listApplications` path after the route was migrated. This is a transition failure log, not a pre-implementation run of the new assertions. The pre-change call chain was `loadProjects()` -> `lowcodeApi.platform.listApplications()` -> page-local `projects` array -> `el-row/el-card` fallback.
- Root live SPA smoke (reported 2026-10-28): after correcting the optional IsSys assumption, default catalog rendered 62/62 DataView rows and 62 enter controls, zero delete controls, including `元数据管理`; same-session original PlatformApps count was 62. This is root-reported live evidence, not reproduced by this subagent.
- `green-targeted.log`: Vitest 2 files, 10 tests passed. Includes AppList default path with no app project id, explicit scenario path, missing IsSys flag-gating, and a real DataSpaceRuntime DataView query through the shared HTTP transport asserting FormKey, `DISTINCT:true`, Bearer interceptor, and absence of app/tenant headers.
- `scoped-eslint.log`: scoped ESLint passed.
- `git diff --check`: passed; Git emitted only a CRLF normalization warning for the modified AppList test.

## Limits

The loader's formal metadata reads are fixture-backed in this test; the business DataView executor/query, actual request envelope, authorization interceptor, and request headers use the production runtime classes. No external request or metadata write was made by this test.
