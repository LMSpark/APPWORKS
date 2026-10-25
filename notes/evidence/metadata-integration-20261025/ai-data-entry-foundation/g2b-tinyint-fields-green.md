# G2b tinyint field GREEN

Date: 2026-10-25

The formal `tinyint` output is now included by AI field derivation and accepted only as a safe integer by `validateAiDataEntryValue`. The formal field type and configured constraints remain unchanged; configured bounds continue through the existing target DataView validator. No DB signed/unsigned range is inferred.

Command: `pnpm exec vitest run src/realtime/data-entry/ai-data-entry-fields.test.ts src/realtime/data-entry/ai-data-entry-session.test.ts`  
Working directory: `packages/spark-lowcode-api`  
Result: exit 0; 2 files, 32 tests passed.  
Raw output: `g2b-tinyint-fields-session-green.log`  
Exit code: `g2b-tinyint-fields-session-green.exit` = 0.

Changed product path: `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-fields.ts` (only `SUPPORTED_TYPES` and integer validation switch cases changed).

SHA-256:

- `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-fields.ts`: `CBBDF6971CFB0B7F886D865AEFE4B188C0BC6ED17D3A9141E1C8EF316F9769C9`
- `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-fields.test.ts`: `1B5F572AFF5D6C060636F8286B17504A2F34AEB1A3970325753F65920DFA973B`
