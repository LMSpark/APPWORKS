# Architecture feature-path rule correction

Date: 2026-10-25. This narrow change updates only `tools/verify-architecture.mjs` and adds `tests/runtime/page/verify-architecture-feature-import-paths.test.ts`. It does not move/copy retained pages, exempt broad path patterns, modify other architecture rules, or touch product runtime code.

## Rule correction

The prior scanner matched the substring `/features/` in both the importer-relative path and every import specifier. That confused the legacy source boundary `src/features/` with the preserved business page hierarchy `src/views/features/`.

The scanner now resolves only the repository-supported local source forms used by this rule: `@/…` (the configured `src` alias), `./` and `../` imports, and Vite root-relative `/src/…` imports. It rejects a resolved target only when that target is at or under the actual `src/features` directory. The importer exemption is likewise limited to files physically inside `src/features`; files inside retained `src/views/features` remain checked and cannot import the old feature boundary without a violation. Package specifiers, arbitrary aliases, and unrelated rules are unchanged.

## Regression evidence

Before the rule edit, `b2-verify-architecture-features-path-red4.log/.exit` recorded the valid retained-page alias import failing with `src/views/DataBaseManage/DataBaseManage/index.vue:2 src/ must not import features outside tests`, while the legacy `@/features/...` negative control passed. After adding coverage for Vite root-relative forms, `b2-verify-architecture-features-path-root-relative-red1.log/.exit` recorded the old rule incorrectly allowing `/src/features/legacy/feature` (1 failed / 6 passed).

The final isolated suite exercises seven cases:

1. Alias import to preserved `src/views/features` is allowed.
2. Relative import to preserved `src/views/features` is allowed.
3. Vite root-relative `/src/views/features` import is allowed.
4. Alias import into old `src/features` is rejected.
5. Relative import into old `src/features` is rejected.
6. Vite root-relative `/src/features` import is rejected.
7. A file inside preserved `src/views/features` importing old `src/features` is rejected; the importer exemption is not broadened by a path substring.

Command: `pnpm exec vitest run tests/runtime/page/verify-architecture-feature-import-paths.test.ts --pool=threads --testTimeout=30000 --hookTimeout=30000`.

Final log/exit: `b2-verify-architecture-features-path-green2.log/.exit`; exit 0, 1 file, 7/7 passed.

## Verification

| Check | Command / log | Result |
| --- | --- | --- |
| Targeted architecture paths | Vitest command above; `b2-verify-architecture-features-path-green2.log/.exit` | 7/7 passed. |
| Repository architecture scan | `pnpm run verify:arch`; `b2-verify-architecture-features-path-verifyarch-final2.log/.exit` | Exit 0, Architecture verification passed. |
| Scoped ESLint | `pnpm exec eslint --no-ignore tools/verify-architecture.mjs tests/runtime/page/verify-architecture-feature-import-paths.test.ts`; `b2-verify-architecture-features-path-eslint-final2.log/.exit` | Exit 0. `--no-ignore` ensures the `.mjs` rule file is linted instead of silently reported as ignored. |
| TypeScript | `pnpm run typecheck`; `b2-verify-architecture-features-path-typecheck-final.log/.exit` | Exit 0. |
| Diff check | `git diff --check -- tools/verify-architecture.mjs`; `b2-verify-architecture-features-path-diff-check-final.log/.exit` | Exit 0; the command checks the tracked rule diff. The new untracked test is covered by ESLint and typecheck. |

The existing `tests/runtime/page/verify-rules.test.ts` has an unrelated pre-collection Rolldown failure while transforming its existing static import of `tools/verify-docs.mjs` (shebang appears after generated code; zero tests). Attempts and exact output remain in `b2-verify-architecture-features-path-red1.log` and `red2.log`; the isolated new test file avoids that unrelated harness path. The retained RED log is `b2-verify-architecture-features-path-red-report.md`. Full rules/build were not run here; the parent owns those gates.

Source/test SHA256 values are in `b2-verify-architecture-features-path-freeze-sha256.txt`.
