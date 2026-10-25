# B2 directory and relationship batch: principal delivery review

This is evidence for one completed batch, not a replacement integration plan. The only active plan remains `notes/data-space-retirement-ledger.md`.

## Product boundary

- Database directory uses the original `DataBaseManage/DataBaseManage/index` path and formal navigation identity. The former Hub/context fallback and first-server selection path were removed. Directory, table/view workspace, and standard table selection consume their original DataViews and runtime lifecycle.
- Relationship editing now binds standard form, select and expression components to `Base_TblRln@forTable`. Nine real fields remain in the original editing overlay. Checkpoints and exact row-id DataSet saves replace the former row-copy SaveDraft path.
- Structural edits validate formal endpoints and physical fields. Async validation captures and rechecks current structure; changes during validation preserve the latest overlay and send no write. Name-only changes preserve untouched legacy structure. Unknown recovery keeps the original capture and does not replay CRUD.
- `allowAIAdd` remains owned by DataTable.columns/DataColumn; the DataView projection and prior AI entry work were not replaced by this batch.
- Sole product implementer: gpt-6-luna. Principal reviewed original RED output, source, generated contracts, gates and live SPA evidence. Independent frozen review found no blocking finding. The final metadata-label change was one literal label, independently checked by the principal.

## Final checks

- Database suite: 13 files, 147 passed. The only subsequent test changes were two readonly type assertions, followed by successful typecheck.
- Principal host/registry/standard-table suite: 5 files, 53 passed.
- Typecheck, scoped and full ESLint, AI codegen, complete verify:rules: exit 0. Rules include 49 ClassModel checks and two pre-existing AI model warnings.
- Official ClassModel generation was run twice; the second followed a pure label fix. Public source was frozen. Formal provider queried catalog, members and guides for 14 roots with no service calls. The full rules run preceded the pure label change; that change received scoped lint and a separate live UI recheck. No broad test repetition was needed.
- Full build after the final label and second generation: exit 0; existing CodeMirror dynamic/static import warnings remain.
- `git diff --check`: clean at delivery preparation.

## Live SPA proof

The main window has 138 requests: 131 formal GetData reads, two CRUD writes and five static resources. All returned HTTP 200; all formal reads returned Code 200. No Document navigation, failed request or truncated event window occurred. Initial sole-tab close was correctly refused until another application page was opened.

Using sync_test, the principal created a pending relationship through standard components, set `test_user.age = GetTableField(testTB1.id)`, and cancelled it without any write. A second pending row was explicitly saved. The request contained one Base_TblRln Added record, no Changed or Deleted records. Formal readback verified ID, both endpoint identities, expression JSON and numeric cascade 0.

The workspace was closed, PX was opened with its own 11 tables and closed, and sync_test was reopened through its directory entry. The original relationship and expression returned from the service. Editing and cancelling its name restored the original value. A later explicit name-only save submitted only rowid, rlname and the platform permission key; the formal expression and endpoints remained identical.

Retained test record: `34A3F87EA002AF6EB93B3E5C0A173EEA`, final name `B2Relation_20261025_mvn5o60s_verified`. It was not deleted. No Java source/start/deploy, physical schema operation or resource deletion was performed.

A separate final-label window closed and reopened the workspace in the same SPA: 38 successful formal reads, no writes, no Document navigation, no failures or truncation. It verified the list header `关系名称` and the retained record with its unchanged expression. Main-window screenshots predate this one-label fix and are retained with their original scope.

## Limits and next work

Unknown receipts, forced teardown and field-permission variants were validated by the same formal DataView fixture pipeline; no failure was deliberately injected into the live service. A short locator wait expired before the list appeared; subsequent state was correct. An immediate expression Apply after the nested value-function Save kept its candidate open; the stable candidate applied on the next explicit click. These observations are recorded, not replaced by fixture claims.

Unmapped child field types remain excluded from new candidates. Unrelated unmapped fields only warn; an existing expression referencing one stays intact and cannot be edited unsafely. Peer selection covers the current loaded same-database page, not an all-catalog search.

Full B2 remains open: existing-database registration, table/view registration receipts and bounded unknown readback, partial-batch retry, directory CRUD and connection tests, original TableAndView route identity, and remaining page parity. A/B1/C/D/E integration gaps remain in the unique ledger. No push is authorized for this batch.
