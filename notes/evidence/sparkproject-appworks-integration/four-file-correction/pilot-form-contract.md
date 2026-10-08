# Four-file pilot: r-form + staged DataView contract

This is a source/test-backed contract for the Base_DataSet asset page proposal. It does not change application code or contact a backend. The proposed page keeps the `spark-page` root, uses one dedicated `Base_DataSet@catalog` view for the table and page script, leaves other consumers on their shared default view, and delegates only the custom OR search UI to a small `RenderCatalogFilters` plus the page script. The adopted create flow collects authorized app selection, name, and description before it creates a DataView row; it does not depend on editing a newly appended row through `r-form`.

## Data path and contracts

`r-button(action="append-row")` is parsed by `node-to-descriptor.ts` into `AppendRowAction`, and `action-data.ts` calls `view.addRow(payload)`. In a query-owner-bound view, `DataView.addRow` requires `prepareNewRow` and uses its returned row before appending/tracking it. `DataSpaceQueryContext.prepareNewRow` obtains the formal primary-key field from the bound model, removes `_pk` and query permission wire fields, and assigns a generated uppercase 32-hex key when that formal field is empty. The action can then set this returned row as `currentRow` with `setCurrentRowOnSuccess:true`. Therefore the form must bind to the same exact `Base_DataSet@catalog` DataView and its default `currentRow` context.

For staged changes, `save-dataset` resolves a DataSet by the explicit scenario ID. With no override, `DataSet.saveChanges` applies editing rows (`applyEditingRows` defaults to `true`) and then saves pending DataView changes. An explicit `views` selector narrows the operation to the requested table/view. The selector shape is `{ tableName, viewId }`; the four-file asset view must use `viewId: "catalog"`.

`r-form.resetFields()` is only the underlying Element Plus form reset. It does not invoke `DataView.discardEditingRows()` or remove a staged new row. A pending create can be discarded at the data layer by `view.removeRow(id)`: `DirtyTrackingDelegate.trackDelete` recognizes pending-create and cancels it without creating a server delete. The built-in `delete-current` action is permission-checked as a normal row deletion and is not the right command for this page-owned local draft discard. Do not wire reset as Cancel.

## Distinguish form-edit from collect-then-create

The earlier `append-row` then edit-in-`r-form` path is not supported for query-owner DataSpace drafts: `prepareNewRow()` gives the row a formal key but no row permission snapshot; `fieldAccess()` denies fields for a key absent from the query permission map; the field component consequently renders non-editable. This is a limitation of that particular UI sequence, not a blocker for all create flows.

The current approved plan uses the existing page UI capability to collect values first, and only appends once all prompts/selectors have completed. `PageServiceCapability.selectEntities` accepts explicit authorized `options` and returns selected `{label,value,...}` entries; `showPrompt` returns a string or `null`. The plan selects from the page's authorized application candidates, prompts for `Name` and `description`, aborts with no write on cancellation, then checks `view.addActionState()` and calls `view.addRow` with those values plus fixed `Type: "datasource"`. Because input is collected before the row exists, no draft-row field authorization is being bypassed. It then calls `DataSet.saveChanges` with the explicit `Base_DataSet@catalog` selector and reads back the saved row. This is the intended minimal create/save route; it does not require a newly added row to be editable in `r-form`.

## Local pending-create cancellation versus persisted delete

The DataView exposes `dirtyTracking.pendingCreateIds`. For a row whose ID is in that set on this page's own `Base_DataSet@catalog` view, `view.removeRow(id)` is a local discard. In a query-owner-bound DataView, `shouldDirectCommitCrud()` is always false; `removeRow` removes the local row and calls `trackDelete`; `DirtyTrackingDelegate.trackDelete` sees the pending-create registration and calls `cancelCreate`, without queuing a pending delete. The existing `commit-mode.test.ts` verifies pending-create becomes false and pending-delete remains false. The main controller also captured an isolated local DataView check in [pilot-local-draft-cancel.json](D:/SPARK_AppWorks/notes/evidence/sparkproject-appworks-integration/four-file-correction/pilot-local-draft-cancel.json): formal key generated, pending-create `1 -> 0`, pending-delete `0`, and row count restored. This verifies local draft cancellation only; it does not verify remote save. Restrict the UI/script command to IDs found in this view's `pendingCreateIds`; do not apply it to a persisted row or infer identity from arbitrary row input.

This explicit local discard is separate from the built-in `delete-current` action. The latter is governed by row delete permission and represents the normal delete action; it should not be repurposed as the generic draft-cancel path. A page-local Cancel for an owned pending-create may call `removeRow` after the `pendingCreateIds` check because that DataView method's staged semantics cancel only the local create.

Evidence for why the *append-first form-edit* sequence does not work:

- `DataSpaceQueryContext.addActionState()` exposes `allowAdd` as the create action state. The permission module explicitly says that global `allowAdd` does not imply draft-field authorization (`packages/spark-component/src/page/actions/README.md`).
- `prepareNewRow()` returns a row with a formal key but no signed `lingma_sys_params` permission snapshot. `DataSpaceQueryContext` builds its row-permission map from the original query snapshot; `fieldAccess()` returns denied when a row key is absent.
- `usePermission.resolveFieldState()` asks `DataView.fieldAccess(row, field)` and marks a field editable only for `write:"allowed"`. `useFieldPermission.syncValue()` refuses the write when the field is not editable. Thus the just-added form row is not editable merely because append-row was allowed.
- The action permission resolver maps delete-current/delete-row to row delete permission. The newly prepared row has no row permission entry, so that *normal delete action* is not an authorized cancel route. The page-owned pending-create discard described above has separate, verified local semantics and does not invoke remote delete.

## Verified rule wiring shape

The following illustrates the real append/table and same-view form wiring. It is not the chosen create flow: it only becomes an editable form for rows whose `fieldAccess` grants the fields. The Add payload must not invent `rowid`, `createuser`, or permission fields. `r-form` defaults to `currentRow`; both containers deliberately point at the same named view. Let the page use its actual scenario ID from the four-file binding.

```json
{
  "type": "spark-page",
  "id": "data-space-catalog",
  "children": [
    {
      "type": "r-table",
      "id": "catalog-table",
      "props": {
        "dataViewKey": "Base_DataSet@catalog",
        "toolbar": {
          "children": [
            {
              "type": "r-button",
              "id": "catalog-add",
              "props": {
                "label": "新增",
                "action": "append-row",
                "dataViewKey": "Base_DataSet@catalog",
                "idField": "rowid",
                "appendPayload": { "Type": "datasource" },
                "setCurrentRowOnSuccess": true
              }
            }
          ]
        }
      },
      "children": [
        { "type": "r-text", "id": "catalog-name-column", "props": { "field": "Name", "label": "名称" } },
        { "type": "r-text", "id": "catalog-description-column", "props": { "field": "description", "label": "描述" } }
      ]
    },
    {
      "type": "r-form",
      "id": "catalog-editor",
      "props": {
        "dataViewKey": "Base_DataSet@catalog",
        "contextDataMember": "currentRow",
        "autoColumns": true,
        "toolbar": {
          "children": [
            {
              "type": "r-button",
              "id": "catalog-save",
              "props": {
                "label": "保存",
                "action": "save-dataset",
                "scenarioId": "<four-file page scenario id>",
                "views": [{ "tableName": "Base_DataSet", "viewId": "catalog" }]
              }
            }
          ]
        }
      }
    }
  ]
}
```

The button descriptor parser supports `appendPayload`, `idField`, `setCurrentRowOnSuccess`, `scenarioId`, and `views`. A form toolbar is rendered as component children and receives the same form scope; `submit-current-form` validates then calls `view.editRowById`, but it is not a substitute for DataSet staged-save. `save-dataset` is the correct staged commit operation. For the approved create flow, present the app/name/description collection before `addRow`; use a dedicated cancel handler that checks this view's `pendingCreateIds` and calls `removeRow` only for that page-owned unsaved row.

The create sequence after the existing prompts return values has this verified shape (the app selector's authorized candidate list is prepared from the page's selected app DataView, and the four-file pilot remains responsible for proving the actual selector/UI interaction):

```js
async function createCatalogEntry(input) {
  const view = $page.resolveView('Base_DataSet@catalog')
  if (!view) throw new Error('Base_DataSet@catalog 未装配')
  if (view.addActionState() !== 'enabled') throw new Error('当前没有新增权限')
  const row = await view.addRow({
    Name: input.name,
    description: input.description,
    sysid: input.applicationId,
    Type: 'datasource',
  })
  const dataSet = $page.getDataSet('<four-file page scenario id>')
  if (!dataSet) throw new Error('页面 DataSet 未装配')
  const result = await dataSet.saveChanges({
    views: [{ tableName: 'Base_DataSet', viewId: 'catalog' }],
  })
  if (!result.success) throw new Error(result.message ?? '新增保存失败')
  return row
}

async function discardCatalogDraft(rowid) {
  const view = $page.resolveView('Base_DataSet@catalog')
  if (!view) throw new Error('Base_DataSet@catalog 未装配')
  if (!view.dirtyTracking.pendingCreateIds.has(rowid)) return false
  return await view.removeRow(rowid)
}
```

The helper takes already-collected input so it cannot call `addRow` before the prompts resolve. The exact entity-selector candidate source and the real page-script event adapter are part of the four-file fixture; no claim of backend success is made here.

## OR-search script example

The existing `pilot-mapping.md` already records the DataView filter constructor and `executeFilter` API. The view key is updated here to the approved dedicated catalog view. This function is usable once the small filter component passes its actual field values; it does not use DOM lookup or access rows directly.

```js
async function searchCatalog(input) {
  const view = $page.resolveView('Base_DataSet@catalog')
  if (!view) throw new Error('Base_DataSet@catalog 未装配')
  const term = String(input.name ?? '').trim()
  const sysid = String(input.sysid ?? '').trim()
  const groups = []
  if (term) groups.push(SparkData.DataViewFilter.group({ logic: 'or', filters: [
    { field: 'Name', operator: 'contains', value: term },
    { field: 'rowid', operator: 'eq', value: term },
  ] }).toJSON())
  if (sysid) groups.push(SparkData.DataViewFilter.condition({
    field: 'sysid', operator: 'eq', value: sysid,
  }).toJSON())
  const filter = groups.length === 0 ? undefined : groups.length === 1
    ? groups[0]
    : SparkData.DataViewFilter.group({ logic: 'and', filters: groups }).toJSON()
  await view.executeFilter(filter)
}
```

The explicit script function and DataView API contract are source-backed. The exact event argument plumbing from the proposed custom filter component into this named function still needs to be demonstrated by the four-file pilot harness; this evidence does not invent an event signature.

## Existing verification references (read only)

- `tests/runtime/data-view/dataview-crud-bridge.test.ts`: `append-row` calls `view.addRow`; `setCurrentRowOnSuccess`; `submit-current-form` validates and calls `editRowById`; permission fixture distinguishes `allowAdd` from editable fields.
- `packages/spark-data/src/tests/crud/commit-mode.test.ts`: staged add tracks pending-create; removing a pending-create cancels it without pending-delete; staged editing and save behavior.
- `tests/runtime/page/transaction-config-pages.test.ts`: `save-dataset` action uses explicit scenario and transaction configuration.
- `tests/ui/renderer/renderer-form-detail.test.ts`: r-form renders against the bound DataView/current-row context.
- `tests/page/runtime/page-runtime-tabs.test.ts` and `tests/runtime/page/runtime/page-runtime-tabs.test.ts`: PageRuntime retains per-instance dirty state and refuses a close with unsaved edits. `PageRuntime.isDirty` checks each owned DataSet's pending dirty-tracking changes and editing rows; the native page close path therefore protects staged create/edit until saved or explicitly discarded.

No tests were run for this read-only contract check.
