# B1 `typeid` SystemData new-row save gap — read-only root cause

Status: read-only source/contract trace for the real acceptance blocker. No product/test/source/service/Java changes were made. The report only records evidence and scope.

## Observed live evidence (from root capture)

- Dedicated dictionary: `327D74EC0ABC4196AA75C56D944B8201`; attempted one save for three staged entries.
- Formal field record: `typeid`, field ID `6DEED3F0B04C4AD1B369843C4AD35FD5`, model ID `FBC266CB81A3E3D1D6D67F9B9D7FFF04`; `IsOutput=true`; `ValueFun={ParamName:'rowid', Value:null, Type:'SystemData'}`.
- Save stopped with `SPARK_MODEL_SAVE_FIELD:typeid`; the associated network window showed 8 reads, 0 writes. This is a local DataSpace model-field guard before dispatch, **not** an HTTP/backend `Code:500` response. The prior `crttime` failure was a separate server response.

## Current source contracts

1. **`SystemData` in source-input mappings is not a generic field default.** `DataSpaceDesignApi.readSourceInputBindings` reads `Base_DataModel_Field` rows with `type='inputParams'`, and the caller only invokes that path for third-party API/logical-view models (`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:542-549,553-562`). `DataSpaceSourceInput.resolve` executes only `GetInputParam` and `GetConstValue`; all other types fail with `SPARK_SOURCE_INPUT` (`packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-source-input.ts:21-49`). Tests explicitly reject `SystemData` as a source-input mapping and show that changing it requires explicit authorized migration to `GetInputParam` plus a fresh formal read (`packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-source-input.test.ts:208-226,231-240`). That is a different record kind and execution direction from this database model's output `typeid` field.

2. **The output-field parser classifies any nonempty `ValueFun` as computed.** `formalComputedValue` parses a nonempty string as JSON and returns true for any nonempty JSON object; `formalField` carries that result into `field.computed` (`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:100-120`). `resolveOutputFields` preserves the formal output field (`:303-304`); this classification does not evaluate `SystemData`, read `ParamName`, or fill an add-row value.

3. **Formal save mapping rejects computed output values before dispatch.** `buildSaveRequest` runs each Added/Changed row through `prepareSaveRow` (`packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts:334-336`). That method maps canonical names to formal output fields and throws `SPARK_MODEL_SAVE_FIELD: <field>` for absent or computed fields on add/change (`:367-388`). It has no `SystemData` resolution/default branch. This matches the observed `typeid` error and zero write requests; it should not be reported as backend failure.

4. **The generic `SystemData` function definition does not establish a save-time row initializer.** The standard filter value-function catalog exposes `SystemData` with a `ParamName` selector supplied by `systemParams` (`packages/spark-data/src/query/filter/data-view-filter-catalog.ts:101-104`). That is a query/filter function definition, not an output-row default or write grant. The existing source-input evaluator above also refuses `SystemData`; no source-read evidence establishes a reusable, permission-preserving DataView add/save evaluator for this output field.

5. **Reference dictionary code explicitly supplies creation data.** Its data editor creates an empty entry with the dictionary ID as `typeid` and a caller-provided creation timestamp (`E:/r/sparkproject/packages/ui/domain/metadata/src/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-editor.vue:258-261`; model projection is at `.../model/data-dictionary-model.ts:228-240`). Before persistence it keeps/creates `crttime` on the Added row (`.../ui/dictionary-data-editor.vue:336-341,385`). This is evidence that the reference UI explicitly constructs the new record; it does not establish an AppWorks `SystemData` output-field execution or save exception.

## Finding and boundary

No reusable formal capability was found that resolves this `SystemData` output `ValueFun` into an authorized `typeid` value when a new DataView row is saved. `SystemData` is recognized as a query value-function shape, while the present output projection treats it as computed and the save owner blocks computed-field writes. The source-input support is separate and does not execute `SystemData`.

This records a remaining online acceptance blocker only. It does not decide whether the authoritative correction belongs in the formal field metadata or in a documented shared computation contract. Do not infer what `ParamName:'rowid'` means or relax the computed-field guard, change metadata, or write `typeid` through a bypass based on this evidence. Root subsequently cancelled the three local entry drafts, closed the workspace, switched to another dictionary, and reopened this retained dictionary in the same SPA. The authoritative reread confirms one saved definition and zero entries. No resource was deleted. This source trace performed no service operation.

## Files/operations

- Created only: `node_modules/.cache/metadata-integration-20261024/b1-sort-typeid-gap.md`
- Read-only source inspection: `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`; `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts`; `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-source-input.ts`; `packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-source-input.test.ts`; `packages/spark-data/src/query/filter/data-view-filter-catalog.ts`; `src/lowcode/data-space/model-source/field-output/lowcode-data-space-field-output.ts`; reference dictionary model/editor files listed above.
- No tests, product writes, Git writes, browser/service operations, or Java inspection were performed.
