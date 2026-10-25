# G4 implementation handoff

This is a task brief, not another plan. The only authoritative progress ledger is notes/data-space-retirement-ledger.md. Do not start G4 product writes until the supervisor accepts G3.

## Product result

Replace the dictionary-only AI owner, UI and polling with SparkAiDataEntry + AiDataEntryHost + AiDataEntrySession. Preserve dictionary design/data separation, original staged DataView, ordinary save/cancel, SPA target isolation and close guards. No backend Java changes, HTTP in pages, business-row copies, new save channels or automatic pushes.

## Domain ruling

Keep the existing DictionaryWorkspace.entryAppendError / appendEntries as the dictionary staging path. Once the old owner is deleted, do not retain a second legacy candidate path or add an AI-specific save method.

- Accept the actually provided formal fields, including AI-enabled ordIdx/createuser; the six display fields are not a generic AI whitelist.
- Enforce formal current output/new-row write access and reject primary keys/computed/unsupported/unenabled candidate fields. Reuse the generic field derivation rather than copy its algorithm where AI admission is needed.
- Domain owns typeid/current dictionary, crttime/creation timestamp and fallback ordIdx=0 only when absent. rowid comes from DataView.addRow. Do not name-blacklist createuser.
- Validate supplied val/txt/extension fields using DictionarySchema with the provided field set. Missing non-AI required values may remain absent for manual completion; saveData still performs full new-row validation. Do not write null to every omitted extension or require permission on fields not written.
- Compare supplied codes with each other and with currently loaded readable entries, including getEditingRow overlays and staged new rows. Canonical comparison uses String(value).trim().toLowerCase(). Any duplicate rejects the whole batch before append and reports why. Confirmation rechecks current rows. No all-page queries or claims of global uniqueness.
- Existing hidden/masked codes must not be guessed. If a batch supplies val and duplicate verification cannot read an existing loaded code, reject. A batch supplying no val does not need duplicate comparison; original save still validates completed data.
- Keep the new strict entries envelope and formal DataColumn types. Do NOT add normalizeBatch, permissive number/string conversion, old tagged output/rows formats, silent row filtering or duplicateCount state. These old AI-specific tolerances are superseded by the configuration-driven generic contract. Record test replacements honestly rather than claim old compatibility.
- readContext carries only readable saved design semantics (dictionaryType, readable labels/name) needed by the generator. Do not put business rows/all codes into the capture fingerprint: adding the batch to the original view must not invalidate its own captured context. Domain validateBatch reads existing rows independently.
- Adapter must verify targetView === workspace.entries. Its readContext/validateBatch are synchronous and do not mutate/query. appendBatch delegates to the same workspace.appendEntries; no auto save.

## Host / SPA lifecycle ruling

Catalog root keeps its own PAGE_RUNTIME. Editing PAGE_RUNTIME is scoped to a persistent nested data workspace owner, outside any Dialog slot v-if. Prefer retaining existing dictionary-data-page.vue as a persistent owner or a narrow split within the same native business directory; do not create global caches or generic routing changes. Propose an exact split before adding files.

- Root dirty source directly reads the retained host/workspace, not solely the last child pending event. Design child may keep its existing event contract.
- AI panel/component temporary unmount only detaches timers/subscriptions; same target can reattach its original session/capture.
- Whole dictionary workspace clean close calls releaseClean: synchronously abort attachments, then safely dispose session, then editing runtime/DataSet. A clean reopen must load a fresh instance and formal data.
- Busy, unknown, nonterminal AI, unsolved input/candidates, or business drafts block close/target switch before changing editing ID. Keep the old instance and visible state.
- Existing SystemPageIdentityPool dirty guard remains; do not change router or pool protocol. Normal root unmount uses the same clean release. Do not depend on Vue child hook order. Hard process exit/forced auth revoke remains the explicitly recorded nonrecoverable boundary.
- Generic host configuration failure should affect AI availability, not prevent ordinary dictionary maintenance from loading. No fallback Agent ID.

## Expected affected paths

- packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.ts and existing tests/fixture
- delete packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-ai-candidates.ts and its old tests after moving retained business coverage
- packages/spark-lowcode-api/src/index.ts: remove obsolete owner export
- src/lowcode/resources/dictionary/lowcode-dictionary.ts: replace old factory with narrow host/adapter composition
- src/views/features/data-platform/structured-config/data-dictionary/model/use-dictionary-workspace.ts
- src/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page.vue
- src/views/features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue
- tests/runtime/page/dictionary/dictionary-workflow.test.ts and dictionary-catalog.test.ts
- generator-owned ClassModel output, never edited by hand

## RED then GREEN

Start with tests for configured ordIdx/createuser staging, absent val/txt manual completion and full-save rejection until complete, duplicate rejection with overlays/new rows, final target/permissions changed, old draft preserved, no definition or unmodified-field writes. Update the workflow protocol fixture to new exact Agent mapping, entries envelope and DataColumn flags.

Exercise actual component+app host in workflow tests (no per-page mock AI loop): input binding, configured read-only preview, confirm to original staged rows, cancel, explicit save, known refusal and unknown retention, poll pause/recovery, detach/reattach and safe close ordering.

Catalog tests must prove D1 close destroys old runtime and D2/reopen uses fresh formal reads, dirty AI persists independently of surface mounting, catalog/entry PAGE_RUNTIME don't mix, and old async results do not enter D2. Existing sorting/save-scope coverage must remain.

Save raw RED before product changes. Structural import failures do not prove behavior assertions. Freeze source+tests after GREEN and send hashes/log paths. Supervisor reviews; fixes go back to this same gpt-6-luna writer. Full typecheck/lint/generation/verify:rules/build and true SPA smoke run after the complete group, not repeatedly during unrelated edits.
