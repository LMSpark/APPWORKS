# G2b tinyint field RED

Date: 2026-10-25  
Scope: test-only; no product source changed.

Command: `pnpm exec vitest run src/realtime/data-entry/ai-data-entry-fields.test.ts`  
Working directory: `packages/spark-lowcode-api`  
Raw output: `g2b-tinyint-fields-red.log`  
Exit code: `g2b-tinyint-fields-red.exit` = 1  
Result: 1 test file; 2 failed, 4 passed (6 total).

Reached behavior failures:

1. `includes an enabled tinyint output column and preserves its formal type and bounds`: the real DataView fixture had output `DataColumn` `ordIdx`, `type: tinyint`, `allowAIAdd: true`, `min: 0`, `max: 10`; `deriveAiDataEntryFields(view)` returned no `ordIdx`, so the enabled formal field was omitted from the schema.
2. `accepts tinyint safe integers and rejects fractional or string values`: `validateAiDataEntryValue` rejected integer `4` with `AI候选字段 ordIdx 的值不符合正式类型 tinyint`. The same test checks fractional and numeric-string rejection after valid-integer acceptance is fixed.

The real target DataView validator test for configured bounds passed: 0 and 10 are accepted; -1/11 report `MIN_VALUE`/`MAX_VALUE`. The intended product change is narrowly to include the formal `tinyint` type in AI field derivation and accept only `Number.isSafeInteger` values; preserve `type: tinyint` and use the existing DataView validator for configured bounds. No signed/unsigned database range is inferred.

Test source SHA-256: `1B5F572AFF5D6C060636F8286B17504A2F34AEB1A3970325753F65920DFA973B`
