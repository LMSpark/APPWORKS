# G4 dictionary integration freeze report

## Scope

Implemented the generic AI batch-add flow in the dictionary data workspace using the existing `AiDataEntryHost` / session and the existing DataSet/DataView save path. The data page owns its standard `RendererDialog`; the directory keeps the owner mounted outside dialog content. Ordinary design pages do not create the AI host. Directory close and target changes use live dirty checks and call `releaseClean()` before changing the current workspace identity. A failed release leaves the prior data page and target active.

Dictionary domain handling uses configured writable/output AI columns rather than a fixed six-field list. `typeid` and `crttime` remain domain-owned; only missing `ordIdx` is filled with `0`. Omitted extension fields remain omitted. Validation uses the existing dictionary schema, and code duplicate checks use visible existing values plus staged candidates. AI submit remains staged until the normal dictionary data save action.

Removed the superseded `DictionaryAiCandidates` implementation, tests, and export. The generic AI session/host tests retain the command, cancellation, unknown-result, and lifecycle coverage under the current contracts.

## Final verification

- `pnpm exec vitest run tests/runtime/page/ai-data-entry/ai-data-entry-host.test.ts tests/runtime/page/dictionary/dictionary-workflow.test.ts tests/runtime/page/dictionary/dictionary-catalog.test.ts` — exit 0, 3 files / 94 tests. Raw output: `g4-page-integration-final3.log`, exit: `g4-page-integration-final3.exit`.
- `pnpm exec vitest run tests/runtime/page/dictionary/dictionary-catalog.test.ts -t "unsubmitted AI business prompt|lost AI create capture"` — exit 0, 2 tests. Raw output: `g4-ai-owner-integration-final.log`, exit: `g4-ai-owner-integration-final.exit`.
- `pnpm exec vitest run src/platform/resources/dictionary/dictionary-workspace.test.ts` from `packages/spark-lowcode-api` — exit 0, 94 tests. Raw output: `g4-dictionary-workspace.log`, exit: `g4-dictionary-workspace.exit`.
- `pnpm exec vitest run src/realtime/data-entry/ai-data-entry-fields.test.ts src/realtime/data-entry/ai-data-entry-session.test.ts` from `packages/spark-lowcode-api` — exit 0, 2 files / 32 tests. Raw output: `g4-lowcode-ai-data-entry.log`, exit: `g4-lowcode-ai-data-entry.exit`.
- `pnpm exec vitest run src/tests/ai/spark-ai-data-entry.test.ts` from `packages/spark-component` — exit 0, 15 tests. Raw output: `g4-component-ai-data-entry.log`, exit: `g4-component-ai-data-entry.exit`.
- `pnpm run typecheck` — exit 0 after the directory tests were added. Raw output: `g4-owner-integration-typecheck-final.log`, exit: `g4-owner-integration-typecheck-final.exit`.
- Scoped ESLint on all changed implementation and test files — exit 0. The added directory integration test also passed its focused ESLint run. Raw outputs: `g4-scoped-lint-final.log`, `g4-owner-integration-lint-final.log`, exits alongside them.
- `pnpm run verify:ai-codegen` — exit 0, 1390 files checked. Raw output: `g4-verify-ai-codegen-final.log`, exit: `g4-verify-ai-codegen-final.exit`.

The first scoped lint attempt found two type-only import issues, corrected before final lint. The first root typecheck found exact-optional-prop typing when the directory passed `dictionaryId: undefined`; the page now omits that prop outside data mode. An integration test initially relied on a typed Vue internal property not exposed by its type, corrected to use `Reflect.get` with runtime validation before the passing final typecheck. Earlier raw outputs remain separate and are not represented as final passes.

## Behavior coverage and limits

Directory tests exercise the mounted data page, clean close, dirty-close protection, release refusal before switching to another dictionary/design/create mode, tenant-mapped AI entry, missing-agent-map behavior while ordinary maintenance remains available, and the real page workflow through candidate confirmation and original DataView save.

Two owner-chain tests use the actual directory page, generic component, tenant-mapped app host, and dictionary factory. An unsubmitted prompt remains dirty through the parent system-page guard and blocks close/switch. A failed AI create keeps its original `AiTurnRequest` capture; detach/remount reuses the same session and idempotency key, and the create POST count remains one. The release-refusal test also confirms the old target stays visible and its DataSet remains alive.

The fixture confirms existing-row field write denial separately from new-row field access. In the current formal query fixture, `newRowFieldAccess` reports the configured entry fields as allowed even when existing-row `fieldAccess(...).write` is denied; therefore this test set does not claim the existing-row denial proves a new-row field denial. The workspace intersects AI configuration with the formal new-row access contract.

## Frozen source hashes

```text
f85e4a4b92575b98368289b42b4eda83f61ee8af7c0d69c8c2a305d42135b8ed  packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.ts
dd8e7e346438f94e64a5f2c9633672bb5d4190fa27b9cd9b7e714f9fe71ba443  packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.test.ts
c300e22a6962dab265c4aab10be4cf26ba0ecdff6c523437c602303f9d2a502c  packages/spark-lowcode-api/src/platform/resources/dictionary/tests/dictionary-workspace.fixture.ts
ed777895f05a05d76eab2a9794f0eb8bd7f2cb81902ef19318f5fe672fe9755b  packages/spark-lowcode-api/src/index.ts
3dccfa9cc6969796dc33750148fdd27995c97566057b85e9398028041dc6228d  src/lowcode/resources/dictionary/lowcode-dictionary.ts
7fafb0b2c7f025a172d9630ea61a68366ce1ab5b8c11f17ef63b5451e743008f  src/lowcode/resources/ai-data-entry/ai-data-entry-host.ts
6a472f7f321f58e3222ac31defd475ff7bb8b77c9b38bb746efb6cdd47474d71  src/views/features/data-platform/structured-config/data-dictionary/model/use-dictionary-workspace.ts
9668d1fda17879a032ee1f1f20eb4572e4c5e7483d9ba8c2e42389595d75c749  src/views/features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue
bfbc25533055dd2fbbc124245e0ea954b1391f59594a12ece1698f5713f62986  src/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page.vue
d8ea562b93dc39d5b6ddb3e3f7c9535b8afdf2881e5f7bea2ea9aa838051f9c2  tests/runtime/page/dictionary/dictionary-catalog.test.ts
6f7a4d044b2e123e115dd11fe8482d25e74ac83d3583673da91b5b45f51f99c8  tests/runtime/page/dictionary/dictionary-workflow.test.ts
```

Generated ClassModel outputs and the single implementation ledger are outside this agent's edit scope and were not changed by this follow-up. No service, browser, commit, or deploy action was performed.
