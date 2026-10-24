# G3 host/component RED

## Scope

Prepared the two authorized G3 test files only. No G3 product files were added or changed.

## Command and result

Working directory: `C:\Users\lgf22\.codex\worktrees\ai-data-entry\SPARK_AppWorks`

```powershell
pnpm exec vitest run packages/spark-component/src/tests/ai/spark-ai-data-entry.test.ts tests/runtime/page/ai-data-entry/ai-data-entry-host.test.ts
```

Exit code: `1`, recorded in `g3-host-component-red-final.exit`.

Raw output: `g3-host-component-red-final.log`.

Both test files failed during module collection; Vitest reports `2 failed`, `Tests no tests`. The unresolved imports are the not-yet-created G3 products:

- `@/lowcode/resources/ai-data-entry/ai-data-entry-host`
- `../../ai/components/SparkAiDataEntry/SparkAiDataEntry.vue`

Therefore none of the behavior assertions below ran. This is a structural RED only, not evidence that runtime behavior failed.

## Test cases prepared

`packages/spark-component/src/tests/ai/spark-ai-data-entry.test.ts`:

- resolve the complete `PAGE_RUNTIME` binding and attach the exact target DataView;
- edit only `businessPrompt` through the standard input DataView, without exposing Agent ID, system prompt, or schema props;
- detach a pending component without disposing its session, then reattach without another create;
- pause automatic refresh after a query error and allow explicit query recovery.

`tests/runtime/page/ai-data-entry/ai-data-entry-host.test.ts`:

- reuse one same-target session after detach and reject a second simultaneous attachment;
- isolate DataSets and reject a pending target change without disposing its original session;
- map exact tenant short names to configured Agents and reject missing/malformed mappings;
- reject tenant/token changes before reusing an existing session;
- revoke attachment cleanup synchronously before safely disposing the session.

## File hashes

- `packages/spark-component/src/tests/ai/spark-ai-data-entry.test.ts` — `C186EE166E0CD8E19715D1B7920EC4C5FBB1389A92B1F8F1ADA3745E097EE617`
- `tests/runtime/page/ai-data-entry/ai-data-entry-host.test.ts` — `F2BFAD54FF76E0D691B3D9394D3798FB72BD0F571FE8CBC66FD0B2CF2569650B`

The preceding G2b `tinyint` correction remains frozen; its focused fields/session verification was independently rerun by the parent at 32/32. The current fields source hash is `CBBDF6971CFB0B7F886D865AEFE4B188C0BC6ED17D3A9141E1C8EF316F9769C9`.
