# Native view configuration correction

Status: stage contract and its existing four-file caller are compatible; old page layout is frozen pending the approved native Vue design page.

Changed `packages/spark-component/src/runtime/app-services.ts`, `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts`, `config/pages/data-platform/data-space-design/script.js`, and the corresponding two tests. Stage now accepts `configuration` derived from `ViewMetadata` without `tableName`, `viewId`, or `rows`, plus explicit `clear` keys. The service merges one selected view through the existing ScenarioViewFile owner, validates native field references, rejects runtime rows/identity, and preserves other tables/views. The current six-control form maps populated values to `configuration` and blanks to `clear`; its layout and controls were not changed.

Evidence: `manifest.json` records pre-change and post-change SHA256; original bytes remain under matching relative paths. Root typecheck baseline/final, spark-component typecheck, exact service lint, view-design suite (8/8), rendered page stage interaction, and exact page/script lint passed; see sibling logs. The rendered interaction asserts both the populated stage input and explicit clear input, then saves and reopens the target view.

Boundary: this closes the existing caller regression only. It does not make the old four-file page a completed design page, deliver full native view editing, or implement data input cascades. The user has authorized a native Vue system page as the next implementation direction. No upload, commit, branch, route, rule, style, or remote data write was performed.

Review correction: `DataView.setAggregates` uses `config.field ?? key` as the source column. Stage now checks that fallback against formal output fields, and uses `Set<string>` to filter explicit clear keys without a type assertion. A focused test first failed on the missing-field case (`aggregate-red.log`), then the full service suite (8/8) and exact service/test lint passed (`aggregate-final-*.log`). The manifest post-change hashes were refreshed. No page, layout, route, or native Vue files changed in this correction.
