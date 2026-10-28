# App catalog card field readability

Date: 2026-10-28

## Diagnosis and change

The AppList fields were correctly bound to the row. `RendererList` provides each item row through `RendererHostScope`; `r-text` resolves its explicit full DataView key and only inherits the host row when it belongs to the same DataView. Root browser inspection found the visible text `数据资产管理` in `.field-value`, with computed `color: rgb(48, 49, 51)` while the inherited dark-theme `--el-text-color-primary` was `#edf2f7`.

Updated the shared `FieldContextRenderer` detail-mode colors to Element Plus theme variables: labels use `--el-text-color-regular` and values use `--el-text-color-primary`, with light-theme fallbacks.

## Regression coverage

Added a real component integration to `tests/ui/renderer/renderer-list-section.test.ts`. It mounts a real `RendererList`, `PageRuntime`, `RendererHostScope`, `SparkComponentRenderer`, and `FieldText` children bound to `APP-CATALOG@Base_AppSystemList@default`. `currentRow` is deliberately set to a third row; the first two cards must still show their own distinct values. Existing field permission visibility/masking suites remain unchanged.

- `pnpm exec vitest run tests/ui/renderer/renderer-list-section.test.ts`: 1 file, 12 tests passed.
- Scoped ESLint on FieldContextRenderer.vue and renderer-list-section.test.ts passed.
- `git diff --check` passed.

## Test environment limitation

JSDOM did not inject the component SFC stylesheet. The first attempted computed-color assertion returned browser-default `rgb(0, 0, 0)` before the change, so it was discarded as an invalid stylesheet test. No CSS was copied into the test. The archived red/debug logs document fixture/environment investigation, not proof of a production binding defect.

Root's post-change real SPA check confirmed the same bound value `数据资产管理`, now computed as `rgb(237, 242, 247)` matching inherited `--el-text-color-primary: #edf2f7`. The dark card screenshot showed application names/descriptions readable across the first two rows; the directory still contained 62 records. No page-local values, business writes or model metadata changes were introduced.
