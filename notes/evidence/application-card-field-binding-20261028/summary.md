# Application card field binding diagnosis

## Confirmed contract and root cause

- Formal `Base_AppSystemList` SPA field observations supplied by the controller: `AppDesc` is the system's Chinese display name, `AppName` is its application code, `Memo` is the system description, and `AppType` is application status. `Memo` is an output field. No icon field is present in the observed output.
- `src/views/tenant/AppList.vue` used the standard `r-text` field helper for both the name (`AppDesc`) and description (`AppDesc`). The standard field was bound, but the description binding selected the name column. The existing name fallback (`AppName`, then `rowid`) remains intact.
- `src/views/platform/PlatformApps.vue` likewise bound its description row to `AppDesc`; it uses the same formal model and the same field semantics, so it had the same confirmed mismatch.
- The `display-icon` node in AppList has a literal `icon: 'Box'`. Current `RDisplayIconProps` contains only `icon`, `iconSize`, and `color`; the implementation looks up that icon name in Element Plus icons. The observed formal catalog output has no icon field. There is no evidence to bind a data field for the icon.

## Standard component path checked

- `RendererList.vue` resolves its DataView with `useContainerDataSource`, iterates `DataView.rows`, and wraps each card's children in `RendererHostScope` with the row.
- `RendererHostScope.vue` provides a reactive `DATA_ROW` mirror and provides `DATA_SOURCE` inherited from the list.
- `FieldText.vue` uses `useBasicFieldState` and `FieldContextRenderer`; `useActiveFieldRow.ts` resolves the explicit `dataViewKey` through `PAGE_RUNTIME`, subscribes to DataView row/current-row/config/request events, and only inherits the row scope when it belongs to the same DataView. `useFieldPermission.ts` resolves the current field state through the bound DataView and suppresses unreadable values; `displayFallbackFields` are checked one-by-one with `fieldAccess`.
- Local ClassModel shard for `RTextProps` describes `displayFallbackFields` as ordered visible-field fallback and `emptyText` as read-only empty-value text. Its inherited source contract is `SparkFieldSemanticProps` in `packages/spark-component/src/components/shared-types.ts`, which declares `dataViewKey`, `dataMember`, `dataField`, and `field`. `RDisplayIconProps` is classified as `static-display` and carries no DataView binding attributes. Source implementations were checked directly because generated ClassModel data may be stale.

## Change and verification

- Changed only the AppList description field binding and the equivalent PlatformApps description field binding from `AppDesc` to `Memo`. Kept the application name on `AppDesc`, its `AppName`/`rowid` fallback, field-level permissions, `暂无描述`, and the `LowcodeApplication.description` mapping unchanged.
- Added regression assertions against the actual standard child props supplied by AppList's `RendererList`, and against PlatformApps' standard `RendererTable` child fields.
- RED: `pnpm exec vitest run tests/app/views/tenant/app-list-dataview.test.ts tests/app/views/platform/platform-apps-dataview.test.ts --reporter=dot` — exit 1; both targeted binding assertions failed (`AppDesc` received, `Memo` expected), 13 other tests passed. Output: `red-tests-both.log`.
- GREEN: same command — exit 0; 2 files, 15 tests passed. Output: `green-tests.log`.
- Lint: `pnpm exec eslint src/views/tenant/AppList.vue src/views/platform/PlatformApps.vue tests/app/views/tenant/app-list-dataview.test.ts tests/app/views/platform/platform-apps-dataview.test.ts --max-warnings=0` — exit 0.

## Follow-up boundary

The public application catalog mapper still exposes `AppDesc` as `LowcodeApplication.description`; changing that cross-surface API needs separate semantic review. The data model and current SPA evidence establish no app-icon output field, so the card keeps the fixed `Box` icon until a formal field and consumer contract are evidenced.

## Controller verification

- Independently ran AppList, PlatformApps and real PageRuntime list binding regression: 3 files, 20 tests passed.
- Live authorized SPA shows 62 cards. Data asset management displays its actual Memo, empty Memo displays 暂无描述. Card activation reached D99 server management and native menu returned to 62-card catalog without document navigation in the captured activation window.
- Full verify:rules and production build passed. No backend data writes or Java changes. Before/after screenshots and sanitized formal field definitions are in this directory.
- Long descriptions currently wrap in the existing standard detail-field layout; this change corrects field semantics without adding a separate card renderer.
