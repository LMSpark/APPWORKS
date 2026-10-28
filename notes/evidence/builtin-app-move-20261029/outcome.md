# Builtin system application migration checkpoint

Date: 2026-10-29
Base: `f9fb6fe0626874c5db308cd7dcf8661ea4e4966b`
Workspace: `C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks`

## Source switch implemented

- `config/applications/appworks.json` is the sole source for AppWorks app identity and the four required system scene resource mappings. The TypeScript registry only validates those entries and binds registered resource IDs to repository paths; startup rejects a manifest missing any of the four semantic scene names.
- `config/navigation/appworks-system.json` carries the formally observed D99 navigation root, IDs, parent IDs, ordering, URLs and conid values. The runtime exposes the 18 registered Vue page targets and their evidenced ancestor groups. Other observed records without a registered native page are excluded; no placeholder wrapper or guessed role model was introduced. `formal-navigation-source.json` remains the exact source evidence.
- The four program scenes 8D1, 90A, 69B and 7AB now load from repository file DataViews. The 7AB `ProjectToolVersion` fourth table is merged from `formal-7ab-pagedata.json`. A registered repository file failure is fatal; builtin writes/history still explicitly fail because no repository writer exists.
- Other explicit data-space design targets remain a separate formal resource: `Base_DataSet` must be loaded, uniquely match the requested ID, and expose readable `rowid` before the existing `ScenarioDefinitionResource` reaches `ProjectWorkspace` for that target. PageRuntime refuses an undeclared D99 program scene before calling its remote scenario gateway. Dynamic applications retain the remote scenario owner.
- Builtin navigation JSON and scenario content both pass through read-only semantic DataView executors. `GetNavigationMenus` keeps the existing official menu authorization contract and now runs only after its authorization DataView is Loading. The executor fences the selected execution token/app/root while treating target app/root separately; it does not infer identity from authenticated scope headers or infer permission from navigation rows.
- AppWorks tool file reads and project-blueprint editor-tree reads now fail explicitly, so those old program-definition reads cannot silently restart from remote D99. Existing metadata/DB queries and business data remain on their SPARK data paths.
- Catalog view access resolves formal `modelBinding.modelName` to one internal table key and rejects duplicate formal-name bindings. Active architecture/config documentation now describes builtin versus dynamic sources and the missing builtin writer.

## Verification

- `pnpm run typecheck`: exit 0 (`TYPECHECK_EXIT=0`).
- Focused suite: `pnpm exec vitest run --reporter=dot tests/runtime/auth-nav/data-space/navigation-authorization-resource.test.ts tests/runtime/auth-nav/data-space/repository-scenario-resource.test.ts tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-design-session.test.ts tests/app/lowcode/resources/application/builtin-system-navigation.test.ts tests/app/lowcode/resources/application/lowcode-application-catalog.test.ts` — 5 files, 167 passed.
- Negative source-routing test: `pnpm exec vitest run --reporter=dot tests/runtime/auth-nav/data-space/lowcode-runtime-scenario-loader.test.ts -t 'rejects an undeclared builtin program scene'` — 1 passed.
- `git diff --check`: passed after removing the trailing blank line from the catalog test.
- `pnpm exec eslint` on changed product/test TypeScript: exit 0 after correcting the initial 7 style errors.
- The broader legacy `lowcode-runtime-scenario-loader.test.ts` still reports its known baseline failures (14 failures in the combined run), including an existing mock without `lowcodeDesignFileUpload` and stale request expectations. The new fail-closed case passes independently; the legacy failures are not hidden or excluded from the report.
- Frontend build was not repeated in this freeze slice; the parent is running the formal generation and engineering gates.

## Deferred and incomplete

- The live SPA catalog regression exposed that the catalog had been moved onto the 90A `Base_AppSystemList` binding (`acb04903…`), which is not the original 7AB formal model. An explicit `Memo` projection on 90A is rejected by the existing formal-output validator; the shared model output contract was not changed. The explicit fields list and its runtime requirement were removed. Formal evidence then confirmed 7AB `Base_AppSystemList` as model ID `7AB874097A1E8711A42FD845939A6E05p001`. The app catalog and navigation-root DataViews now use the 7AB `projectBlueprint` scenario; 90A keeps its original model/default view without the added catalog/root views. The focused catalog fixture still marks `Memo` as output, so its passing test does not establish actual 7AB Memo output or prove the live SPA descriptions are restored. Root will verify those against the real SPA response.
- Re-review regression coverage: the five focused suites (`lowcode-data-space-runtime`, `lowcode-runtime-navigation`, `lowcode-application-catalog`, `app-list-dataview-binding`, `builtin-system-navigation`) passed 156 tests. This count differs from the earlier 167-test migration group because it runs different suite files; the two overlapping suites are the catalog and builtin navigation tests. Targeted ESLint completed without errors after fixing one string-literal warning; `git diff --check` passed.
- Builtin repository write/history support, development-host write allowlist/adapter, conflict/readback handling, and real builtin DataView save verification remain unimplemented. Read-only source migration is not the completed end-to-end merge.
- `readLowcodePageFile` and `readLowcodeProjectBlueprintEditorTree` are explicitly blocked for D99; local tool/project-tree repository definitions are not supplied by this slice.
- The archived 7-case public initial-file-read RED draft was saved verbatim at `notes/evidence/scenario-initial-read-20261029/deferred-public-file-read-tests.patch.gz`, and the test source was restored to HEAD. One draft observer contradicts its later expected state; do not count it as a validated product defect. Its original evidence/log remain for the later public read/write slice.
- No production SPA source switch, writer save, Java change, remote app record, or formal business-data change was performed.


## Controller verification after source correction

- The first 90A directory implementation was rejected by real SPA smoke: its same-name model omitted Memo; adding an explicit field was rejected by the formal output contract. The test fixture had incorrectly represented this output. The final binding uses the verified existing 7AB model `7AB874097A1E8711A42FD845939A6E05p001`. No shared model outputs were changed.
- Final controller gates: formal ClassModel generation, lowcode contract generation, typecheck, full verify:rules and full build all exited 0. Changed-file ESLint: 25 files exit 0; subsequent guard/test delta ESLint also exit 0. The first typecheck/type-assertion gate failures were fixed without relaxing rules.
- Controller focused run: 9 files / 270 passed. After the final parser/test typing correction, 2 affected files / 57 passed; source identity whitespace delta catalog suite / 51 passed. These runs overlap and must not be summed. Original ScenarioViewFile suite: 185 passed.
- Three native catalog interaction tests still time out at 15 seconds. The exact three also failed with the same timeouts in isolated `3e182b62d` (3 failed / 59 skipped), using the installed Vitest executable directly. The initial baseline pnpm invocation stopped at dependency auto-check before tests and did not install anything. Keep this limitation distinct from passing tests; raw outputs are retained.
- Code review after fixes: PASS for resource identity, ordinary target save/history preservation, atomic authorization parent chains, old tool IO boundaries, 7AB binding, and shellTools identity. New parsing preserves the complete official evidence after recursive structural validation.
- Real SPA: card and platform directories read 62 rows, 20/20/20/2, business Code=200, Memo present or empty as formally returned. Platform-directory switch had an untruncated capture with zero Document requests and zero remote program File requests. Builtin activation used the original URL/node IDs and official GetNavigationMenus Code=200; its untruncated capture also had zero Document and zero remote program File requests.
- Ordinary-target close/reopen smoke was interrupted when the browser returned to the public homepage. The capture was truncated, so cause is unproven and the step is not accepted. A fresh authorized session completed the bounded repeat: ordinary target A651B6600F623DD7F22F127CF3B12B56 opened with no configured views, closed, then reopened with the same target and no stale content. Its formal file reads returned Code=404 and the UI retained the explicit missing-configuration state; no online definitions or business records were written.

- The withdrawn public-read test draft is compressed losslessly as `deferred-public-file-read-tests.patch.gz` (decompressed SHA256 `af232f550fe48f052b1ef07000008fb11c7d4679c17833526d852c7f9ca9631f`). It is archived evidence, not an active test or implementation instruction.

- Final bounded design smoke switched from the ordinary target to system 7AB: 24 formal models shown, zero Document requests and zero remote 7AB pagedata reads in an untruncated window. The explicit read-only reference layout `SysForm/7AB874097A1E8711A42FD845939A6E05.json` remains a separate resource and is not counted as migrated program source. See `spa-final-read-source-smoke.json` and `spa-system-scene.png`.

- Readable terminal evidence has only trailing whitespace and surplus final blank lines normalized for the Git whitespace gate. Exact original bytes of the affected logs and SHA256 sums are preserved in `terminal-raw-output.zip`; command content, failures, counts and exit evidence were not rewritten.
