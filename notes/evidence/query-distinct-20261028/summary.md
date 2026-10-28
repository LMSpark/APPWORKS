# DataView DISTINCT query option evidence

Date: 2026-10-28

## Red/green

- `red-spark-data.txt`: queryConfig setter rejected `distinct` as unknown (1 failing test, 36 passing).
- `red-lowcode-api.txt`: DataView-to-runtime request rejected `distinct` as unknown (1 failing test, 128 passing).
- `red-encoding.txt`: direct query-option encoder accepted malformed `distinct: "true"` (1 failing test, 102 passing).
- `targeted-spark-data.txt`: 37/37 tests passed.
- `targeted-lowcode-api.txt`: 232/232 tests passed across runtime and query parity suites.

## Scope

- `queryConfig.distinct` is validated as boolean, captured from query params, and serialized by DataView config.
- SPARK runtime query capture forwards the option; wire encoding validates and retains it; `DataSpaceQueryTable` emits `DISTINCT` with a default of false.
- `ScenarioViewConfig` preserves `queryConfig` and delegates validation to `DataViewQuery.parse`; query-cache keys include all execution options, including distinct.

## Checks

- Scoped ESLint passed for all changed source and test files.
- `git diff --check` passed.
- Package typechecks have pre-existing diagnostics in unrelated tests; see `typecheck-spark-data.txt` and `typecheck-lowcode-api.txt`. No diagnostics were reported for changed source files.
- ClassModel generated artifacts were inspected before edits and lacked the new field. Generation was intentionally deferred as requested; root handles regeneration.
