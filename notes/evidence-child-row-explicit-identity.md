# Explicit child row identity verification

## RED
Command: `pnpm --filter @spark-appworks/spark-data exec vitest run src/tests/data-view/data-view-editing-checkpoint.test.ts`
Result: 1 failed, 34 passed. Child creation failed with `DATA_VIEW_NEW_ROW_FIELD_DENIED: parentId` because the first implementation delegated to root new-row permission checks.

## GREEN
Command: `pnpm --filter @spark-appworks/spark-data exec vitest run src/tests/data-view/data-view-editing-checkpoint.test.ts`
Result: 1 test file passed, 35 tests passed.

Blueprint route RED: `pnpm exec vitest run tests/app/dev/file-versions/blueprint-workspace-delivery.test.ts -t "saves and formally reads back an explicit rowid"` initially failed at `BlueprintWorkspaceDataView.preflightChildNode` because it used root `newRowFieldAccess` (requires table add permission). The fixture then exposed a missing `resultPrimaryKey` in its query result; the formal fixture now reports `rowid`.
Blueprint route GREEN: `pnpm exec vitest run tests/app/dev/file-versions/blueprint-workspace-delivery.test.ts` passed, 1 test file and 33 tests. It verifies explicit `STABLE-CHILD` readback and `prowid=NODE-1`, then owner-generated `OWNER-3` behavior when the ID argument is omitted.
Child authorization regression: `child-create c and parent-row field E` passed (1 passed, 31 skipped), covering c denied and parent-row E denied independently. A further test passed for an E-writable, read-hidden child payload field, keeping E separate from h/m visibility.

## Follow-up contract fixes
RED command: `pnpm --filter @spark-appworks/spark-data exec vitest run src/tests/data-view/data-view-editing-checkpoint.test.ts -t "remaps the child foreign key"`
Result: 1 failed, 35 skipped; the owner remapped `parentId` to `OTHER` and the row was incorrectly accepted.
GREEN command: same command after fix; 1 passed, 35 skipped. The owner FK is now checked before DataView acceptance and no pending create remains on rejection.

Parent identity RED command: `pnpm --filter @spark-appworks/spark-data exec vitest run src/tests/data-view/data-view-editing-checkpoint.test.ts -t "invalid canonical parent identities"`
Result: 1 failed, 36 skipped; a blank formal key fell back to stale internal `_pk` and was treated as canonical.
GREEN: same command after requiring valid formal PK equality and formal parent-field output; 1 passed, 36 skipped.

Final suites: `pnpm --filter @spark-appworks/spark-data exec vitest run src/tests/data-view/data-view-editing-checkpoint.test.ts` passed 37/37; `pnpm exec vitest run tests/app/dev/file-versions/blueprint-workspace-delivery.test.ts` passed 33/33. `pnpm run generate:class-model-surface` completed with semantic gaps reduced from 3196 to 3191; unrelated generated churn was restored.

## Rules-gate follow-up
Removed BlueprintWorkspaceDataView non-null assertions using a guarded `requireCurrentParent` helper. Replaced the internal explicit-create positional tail with a named `DataViewIdentityCreateOptions` parameter object.
`pnpm run verify:rules` completed all stages through `page thin: ok`: architecture, dependency catalog, pages config, AI codegen, docs, ClassModel lint/typecheck and 49 tests, workflow designs, lowcode contracts, AI model spec, project blueprint SSOT, Ajax/send-code/wire parity, directory limits, and page-thin checks.
Final reruns: targeted ESLint passed; spark-data build-source TypeScript passed; DataView focused tests passed 37/37; Blueprint harness passed 33/33.

Final fixture check: removed `addEnabled: true` from the explicit/generated child integration test. With root add state hidden, `pnpm exec vitest run tests/app/dev/file-versions/blueprint-workspace-delivery.test.ts -t "saves and formally reads back an explicit rowid"` passed (1 passed, 32 skipped), confirming c+E child authorization is sufficient for both identity paths.

## Additional verification
`pnpm --filter @spark-appworks/spark-data exec eslint src/data-view.ts src/index.ts src/tests/data-view/data-view-editing-checkpoint.test.ts --max-warnings=0` passed.
`pnpm --filter @spark-appworks/spark-data exec tsc -p tsconfig.build.json --noEmit` passed.
Package full typecheck reports existing test typing errors in unrelated tests (readonly test rows, missing tableName, private member access, etc.).
