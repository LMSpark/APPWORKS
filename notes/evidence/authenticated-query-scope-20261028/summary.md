# Authenticated request scope evidence

Date: 2026-10-28

- RED: `pnpm --dir packages/spark-lowcode-api exec vitest run src/lowcode-api.test.ts` failed 3 of 4 tests because `readAuthenticatedRequestScope` did not exist. The existing selected-app scope contract test passed.
- GREEN: the same command passed all 4 tests after implementation.
- Regression set: `pnpm --dir packages/spark-lowcode-api exec vitest run src/lowcode-api.test.ts src/platform/lowcode-platform-api.test.ts src/platform/data-space/runtime/data-space-runtime-api.test.ts` passed 176 tests across 3 files.
- Scoped lint: `pnpm --dir packages/spark-lowcode-api exec eslint src/lowcode-api.ts src/lowcode-api.test.ts --max-warnings=0` passed.
- Package typecheck: `pnpm --dir packages/spark-lowcode-api typecheck` remains blocked by pre-existing diagnostics in `src/platform/resources/dictionary/dictionary-workspace.test.ts` (unused `vi`, indexed property access, and exact optional property assignments). See `typecheck.txt`.
- `git diff --check` passed with no output.
