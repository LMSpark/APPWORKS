# G3 R1–R4 freeze

Workspace: `C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks`  
Scope: generic AI batch-entry component and host; no G4/dictionary changes.  
Generated ClassModel files were left untouched; formal generation remains for the parent session after this source freeze.

## Changes

- The renderer now requires a fully scoped `PAGE_RUNTIME` key, watches target-key changes, detaches the old UI lease, and ignores late UI results from an obsolete attachment. A matching lease is detached if derived input/candidate/turn bindings fail; mismatched leases are never detached.
- Automatic polling pauses on the formal session/DataView error and continues to pause across detach/reattach. Poll failures without owner error become visible local errors. Explicit refresh clears the local pause path.
- The renderer uses standard `RendererTable.toolbar.children` and a read-only `RendererForm` bound to the turn DataView. The input remains editable for a prompt-only draft, and becomes read-only while the workspace is blocked or candidate rows await confirm/discard.
- Component state is a fresh read-only projection per owner revision so standard controls react to session/DataView changes without storing a second mutable state.
- The app host resolves exact tenant mappings through `Map`, validates tenant/token/AppId scope, and preflights both temporary tables before aborting a clean attachment. `.env.example` documents the deployment map. `src/env.d.ts` was restored to baseline; no duplicate ImportMetaEnv declaration or codegen allowlist change remains.
- Candidate field metadata remains rooted at `DataTable.columns` / `DataColumn.allowAIAdd`.

## Regression evidence

| Command/evidence | Result |
| --- | --- |
| `pnpm exec vitest run packages/spark-component/src/tests/ai/spark-ai-data-entry.test.ts tests/runtime/page/ai-data-entry/ai-data-entry-host.test.ts` — `g3-r1-r4-green-frozen.log/.exit` | 30/30 passed; exit 0 |
| `pnpm run typecheck` — `g3-r1-r4-typecheck-final3.log/.exit` | exit 0 |
| Scoped ESLint over the G3 component, host, exports, and two tests — `g3-r1-r4-eslint-final3.log/.exit` | exit 0 |
| `pnpm run verify:ai-codegen` — `g3-r1-r4-codegen-frozen.log/.exit` | 1392 files passed; exit 0 |

Behavior RED evidence is kept separately, with exit codes:

- `g3-r1-r4-component-red-clean2.log/.exit`: before product repair, R1 repeated polling/error display, complete-key rejection, standard toolbar/turn binding, and post-attach lease cleanup were reached. The component fixture had no `Rows`/`Items` identity mismatch.
- `g3-r2-dynamic-red-verified.log/.exit`: delayed query triggered through the standard refresh action; dynamic binding kept the old target/lease and displayed its late error. Exit 1.
- `g3-r1-start-refresh-red.log/.exit`: reproduced the stable-computed-owner defect; typing `businessPrompt` left the standard start action disabled. Exit 1.
- `g3-r3-candidate-intent-red.log/.exit`: candidate rows were present and rendered, but the business prompt remained editable before the pending-candidate lock. Exit 1.
- `g3-release-preflight-red.log/.exit`: with the two `assertCanRemoveTable` preflights temporarily removed, a candidate relation caused `releaseClean()` to abort the attachment before removal failed. Exit 1. The preflight implementation was restored and retained.

## Frozen source hashes

```text
9D9740BFECC19EE3490EF266505140821A19B0CC8D39D5D765C61696A34F7E31  .env.example
EF687A5ABE43DC89A2FED93794A4AE15F6D8073C50453DEFE82AD6C5566E2522  packages/spark-component/src/ai/data-entry-host-capability.ts
BA9F8F5D19F4AEFF77521A85AEA410C3BB4AFA28679CAE04F25E4FE759A9EBF3  packages/spark-component/src/ai/components/SparkAiDataEntry/SparkAiDataEntry.props.ts
0C1EA864029231F768C2EBC5CD4D9CBC6F97A822F75FA055D3B7432F94C5E458  packages/spark-component/src/ai/components/SparkAiDataEntry/SparkAiDataEntry.vue
2F9AC36B44DEE11C98D5EAE6BCE9564E76ECF3A2E0DDFCE2AA2817473AC72E44  packages/spark-component/src/ai/index.ts
582FA3E9B504D587CEEC53B1C1AAE9358DD5CAAA37B9C39A88913EDD1E97BD05  packages/spark-component/src/index.ts
68FFEC70EEFF053A7869A926150AB37E6C59FEA7A6163597CF44A773DE17DC83  packages/spark-component/src/components/register-renderers.ts
E106A9990B98A38F094288D5497BC3EA40991B303D28CAF22E2A72D0CD43FB06  packages/spark-component/src/tests/ai/spark-ai-data-entry.test.ts
DBA4F7ED6035F27FB5D7A92D947B7D08CBCFB7692B0BD715F18388186D1CD572  src/lowcode/resources/ai-data-entry/ai-data-entry-host.ts
33ED92B8ACF7C8B4949816EF2E609A3BC261D00458DBB715D8FF5B5BE7BE05B9  tests/runtime/page/ai-data-entry/ai-data-entry-host.test.ts
```

No generator, real service, browser, or commit was run in this phase.
