# Dictionary design/data read-path research

## User goal and scope

Continue moving the approved AppWorks metadata platform into this repository. This iteration targets the dictionary topic only; it does not resume application-management work or claim the platform migration is complete. The user authorized continued progress with “按目标进行”. A follow-up priority form returned that the user was unavailable, so this iteration proceeds with the recommended dictionary path and the existing repository contracts.

## Reference and current implementation

- Reference source: fixed AppWorks commit `1147b00ee53a1476d4ee715c61368b453a215192` in `E:\r\sparkproject`.
- The reference dictionary setting page loads the selected definition record through its setting manager; it does not load the dictionary's full business-entry collection as part of opening the definition form.
- The current topic correctly separates definition editing (`_Base_DictType`) from business-entry editing (`_Base_DictData`) and persists them separately through the same DataSet/DataView owner.
- `DictionaryWorkspace.load()` currently queries both the definition and all entries for both pages. `entries` is needed by data maintenance, by a new-definition identity collision check, and to validate existing values when changing `dictionaryType`; it is not needed to open or save an unrelated edit to an existing definition.
- The dictionary-entry view is already configured for complete results. When a type change requires validating existing codes, that complete query and validation must remain mandatory; a failed/incomplete query must prevent saving.

## Intended behavior

- Existing-definition design opens and reloads the definition only.
- Data maintenance opens/reloads both the definition and its entries.
- New dictionary creation retains the exact-target entry read used to reject orphan entries under the requested ID.
- Changing an existing dictionary's encoding type loads the complete entry view before validation; invalid values or query failure preserve the draft and submit no write.
- Once the design workspace has loaded entries for one of these explicit reasons, subsequent verification/reloads continue to refresh that view.
- All reads, edits, validation, cancellation, and saves remain on the existing DataSet/DataView path. No Java, Node.js service, alternate query path, or deletion behavior is introduced.

## Evidence and files reviewed

- Reference setting: `apps/appworks/src/ui/features/data-platform/structured-config/data-dictionary/ui/dictionary-setting.vue`.
- Current owner: `packages/spark-lowcode-api/src/platform/resources/structured-config/dictionary/workspace.ts`.
- Current page lifecycle: `src/views/features/data-platform/structured-config/data-dictionary/model/use-dictionary-workspace.ts`.
- Design/data consumers: `dictionary-setting.vue`, `dictionary-data-page.vue`.
- Existing domain and page regression coverage: `packages/spark-lowcode-api/src/platform/resources/structured-config/dictionary/workspace.test.ts`, `.../tests/workspace.fixture.ts`, `tests/runtime/page/dictionary/dictionary-workflow.test.ts`.
- Active migration evidence and unconfirmed source repairs remain in `notes/data-space-retirement-ledger.md`; this iteration does not infer or rewrite any of those business identities.

## Constraints

- Keep the working path at `D:\SPARK_AppWorks`; do not create or switch worktrees.
- Do not modify or run backend Java, add a Node.js service, or modify live dictionary records.
- Preserve the existing save receipt, unknown-result recovery, field permissions, exact dictionary identity, and independent design/data submissions.
