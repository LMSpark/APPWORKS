# Computed query runtime closure

Scope: this runtime prerequisite only. The later pagedata column configuration and UI remain outside this change.

## Files

- `packages/spark-data/src/strategies/computed-column-delegate.ts`: separate registered framework functions from configured expressions; replace removed expressions; evaluate bound rows through permission checked copies and propagate denied reads through relation aggregation and chained calculations.
- `packages/spark-data/src/data-view.ts`: tie computed read status to an opaque query generation token; expose readonly computed field access; keep local computed columns with projections; consume current query field access for inputs.
- `packages/spark-data/src/resource-relation/resource-relation-definition.ts`: relation matcher reads only expression referenced parent and child fields.
- `packages/spark-data/src/tests/data-view/computed-query.test.ts`: bound query, keyless, projection, permission, mutation, chain, config replacement, relation and child aggregate regression cases.

## Verification

- Red test before production changes: 5 failed, 1 passed (`red-test.log`).
- Review correction red test: 1 failed, 20 passed; a caught read of nonprojected `qty` produced visible `77` (`review-red-test.log`).
- Review correction focused test: 21 passed (`review-focused-test.log`). This includes a real editing patch, nested source isolation, and the denied nonprojected read.
- Computed, tree and query-owner regressions: 138 passed across 4 files (`review-regression-test.log`).
- Exact-file ESLint: exit 0 (`review-eslint.log`).
- Root typecheck: exit 0 (`review-typecheck.log`).
- AI codegen rules: 1012 files checked, exit 0 (`ai-codegen-rerun.log`).
- `git diff --check` on tracked production files: exit 0.

## Before and after identities

Before images of the three existing production files and their hashes are in `*.before` and `before.sha256`; the new test was missing before this task.

```text
F2D1ED9EACC01452B4E4AF3556E61165C18C9EDB509B495BDD4A6850BA23DE05  packages/spark-data/src/strategies/computed-column-delegate.ts
93B4D4AA754F4F4B977966C210F3B1EA0A7E58D5FFA142240D50329178043204  packages/spark-data/src/data-view.ts
43EC80460F3DFDBFE3F7306AA0098397BEBF66A2E2247F65113AD91C8DE1F980  packages/spark-data/src/resource-relation/resource-relation-definition.ts
F4172B72763634FF195066854035E1DC5C70DAD9969019A02F0166792F46EDCC  packages/spark-data/src/tests/data-view/computed-query.test.ts
```

No commit, push, branch or online write was performed. Existing unrelated dirty files were retained.

## Root acceptance

ACCEPTED for this runtime prerequisite. Independent final review: `.superpowers/sdd/plan-data-space-metadata-dataset/computed-runtime-review-final.md`; the original four findings are resolved. Root independently passed typecheck (`root-typecheck.log`) and 87 permission/model-alias/relation/CRUD tests (`root-regression.log`).

The read-only live probe (`online-computed.mjs`, `online-result.json`, exit 0) opened the real single-target session, returning 1 space / 7 models / 119 fields / 0 relations. It temporarily added a native computed column to the already queried Base_DataSet, checked actual visible ReportID input consumption, readonly output and submission stripping, then removed it and verified the original query row and file were unchanged. Extra queries and online writes were zero; both DataSets were disposed. This proves real query-context consumption, not persisted computed-column configuration or restricted-account coverage.

Remaining before file support: computed-column schema/assembly, formal-output collision rejection, remote query field exclusion, and save/fresh-workspace reopen integration. These are in the next structured brief and were not changed here.
