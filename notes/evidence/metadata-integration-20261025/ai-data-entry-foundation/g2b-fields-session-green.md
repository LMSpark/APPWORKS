# G2b fields/session GREEN freeze

Date: 2026-10-25
Worktree: `C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks`

## Scope

Implemented the G2b generic staged batch-entry owner using the real DataSet/DataView and the injected existing AiTurnResource. Input uses `ensureDataSetStaticInputTable`; candidates are a read-only DataView refreshed from verified formal turn rows. The owner exposes pending/host-lock and action eligibility state, formal-status-based polling, and subscriptions. Unknown request/cancel outcomes are verified through the original command DataViews; request POST is not retried. Target changes suppress stale candidates while preserving formal turn refresh/cancel. Confirmation preflights the full batch, appends only to the bound target DataView, consumes before append, clears candidate/input overlays on success, and never saves business rows itself.

## Changed source/test paths

- `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-fields.ts`
- `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-session.ts`
- `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-fields.test.ts`
- `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-session.test.ts`
- `packages/spark-lowcode-api/src/index.ts` (exports the session facade and its input/adapter types; existing G2a export also remains in this shared file)

## Verification

- `pnpm exec vitest run src/realtime/data-entry/ai-data-entry-fields.test.ts src/realtime/data-entry/ai-data-entry-session.test.ts` from `packages/spark-lowcode-api`: exit 0; 2 files, 25 tests passed. Log: `node_modules/.cache/metadata-integration-20261024/g2b-targeted-tests.log` / `.exit`.
- `pnpm run typecheck`: exit 0. Log: `node_modules/.cache/metadata-integration-20261024/root-typecheck.log` / `.exit`.
- `pnpm --filter @spark-appworks/spark-lowcode-api run lint`: exit 0. Log: `node_modules/.cache/metadata-integration-20261024/lowcode-api-lint.log` / `.exit`.
- `pnpm run verify:ai-codegen`: exit 0; 1,386 files scanned. Log: `node_modules/.cache/metadata-integration-20261024/verify-ai-codegen.log` / `.exit`.
- `git diff --check` for the five paths above: exit 0.
- Package-local `pnpm --filter @spark-appworks/spark-lowcode-api run typecheck`: exit 2 on five existing errors in `src/platform/resources/dictionary/dictionary-workspace.test.ts` (TS4111 at 192; TS2412 at 357, 377, 662, 830). No G2b file appears in those diagnostics; this package-local command is not reported as passing.

## SHA-256

- `ai-data-entry-fields.ts`: `1B89C062B5A0EF72467333C75FBC3F08615891BD6627924DA35A427888F8DDCE`
- `ai-data-entry-session.ts`: `9E1BCEE99F48AFFA3ECAB901C82A10CEDE9ED0C4B218B15E8265B55EB41BFBBA`
- `ai-data-entry-fields.test.ts`: `DC19D5CF169A84ABEC05676E46C417A28C4B4644C7184AAD9818B5B65B71720E`
- `ai-data-entry-session.test.ts`: `92777B7BBB06FC66821C8717F855B4E4EBBE9727812FB7DE7A1966C706422B42`
- `packages/spark-lowcode-api/src/index.ts`: `47C55346705C4BA91E8DFECAEF39A162259F9D43F8895E3FD1B1681B73DF8DDE`

No product-scope expansion, ClassModel generation, real service/UI calls, or commit was performed in this G2b work.

## R1/P2 follow-up verification and final source hashes (2026-10-25)

The original first-pass 25-test block above is retained as history. The corrected R1/P2 follow-up is separately archived here:

- `pnpm exec vitest run src/realtime/data-entry/ai-data-entry-session.test.ts src/realtime/data-entry/ai-data-entry-fields.test.ts` from `packages/spark-lowcode-api`: exit 0, 2 files / 29 tests. Raw output: `g2b-r1-root-tests.log`; exit code: `g2b-r1-root-tests.exit` (0).
- `pnpm exec vitest run tests/dataset/dataset-structure-crud.test.ts` from `packages/spark-data`: exit 0, 1 file / 8 tests. Raw output: `g2b-r1-root-dataset.log`; exit code: `g2b-r1-root-dataset.exit` (0).
- `pnpm run typecheck` from repository root: exit 0 in the tool session; no raw output file was captured.
- `pnpm --filter @spark-appworks/spark-lowcode-api run lint` from repository root: exit 0 in the tool session; no raw output file was captured.
- `pnpm --filter @spark-appworks/spark-data run lint` from repository root: exit 0 in the tool session; no raw output file was captured.

A later attempt to wrap these commands for archival resolved the relative cache path after changing directories and failed to open log files; it was interrupted and is not treated as verification evidence. The two test suites were not rerun after the parent supplied the correct archived logs. Final root typecheck/lint gate remains available to the parent as requested.

### Final SHA-256 for G2b source/test files

- `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-fields.ts`: `813231161C2BEBA203350266615EA00794FB44160E8D52714AFCB6FFCDE52BF1` (JSDoc-only follow-up: module responsibilities/boundaries/use and all 12 field members documented; no behavior change; generated ClassModel refresh is pending the parent’s serial run).
- `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-session.ts`: `FD4F198FFE77703184EDA2569EA75F60CCD677D6A213CE5C66F4530788AFABE4` after the JSDoc-only follow-up; the behavior-fix freeze before that documentation change was `CC2DAA854301FCC64CD002A78FD643DF698125712CC6A8BEE7B37742F8DFA545`.
- `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-fields.test.ts`: `DC19D5CF169A84ABEC05676E46C417A28C4B4644C7184AAD9818B5B65B71720E`.
- `packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-session.test.ts`: `DFF32EF5E86EECAD3538B63A1D55FBF8E781F3ED9E9FDDFD74C145AF82DD9F53`.
- `packages/spark-data/src/dataset.ts`: `F2A84EE808C6C724189F1A1F2C4D85ABF6D42D013709D06CC71B87CE7908F3FC`.
- `packages/spark-data/src/types.ts`: `6EFB0C907A81BF08188972DFD9D10C474762A76BA905CD960D279237F61B9BC9`.
- `packages/spark-data/src/tests/dataset/dataset-structure-crud.test.ts`: `00D2B468DAAD400295BA48F23DCCA5429CF145A86CE07628D39D750C2B52D073`.

## G3 read-only implementation and RED preparation

### Narrow proposed source/test files

- New `packages/spark-component/src/ai/components/SparkAiDataEntry/{SparkAiDataEntry.vue,SparkAiDataEntry.props.ts,index.ts}`; add the component and narrow host capability to the existing `packages/spark-component/src/ai/index.ts`. Add the named component/type exports to the existing `packages/spark-component/src/index.ts` AI export lists and register `spark-ai-data-entry` in `packages/spark-component/src/components/register-renderers.ts`. Define the capability in a narrow `packages/spark-component/src/ai/data-entry-host-capability.ts`; do not change `core/capability-keys.ts` or create a second AI barrel. Keep the public component surface to `dataViewKey`, title and disabled state; resolve the exact target through `PAGE_RUNTIME` and use the host capability.
- `src/lowcode/resources/ai-data-entry/ai-data-entry-host.ts` and colocated `ai-data-entry-host.test.ts`: one persistent host per DataSet, one existing `AiTurnResource`, and one current session lease; same-view attach reuses the session, while unsafe view changes fail without releasing the current owner. Resolve tenant shortName to the configured formal Agent ID from the JSON-valued `VITE_AI_DATA_ENTRY_AGENTS` deployment setting; do not hard-code an ID or perform a management GET in the ordinary run path.
- `.env.example` and `src/env.d.ts`: document/type the tenant-to-Agent map setting. Do not write the ignored `.env.local` value as source or expose it in examples.
- `packages/spark-component/src/tests/ai/spark-ai-data-entry.test.ts`: component/capability/registration binding and teardown tests.

### RED groups to prepare

1. Component registration and full `dataViewKey` resolution return the exact PageRuntime target; missing/ambiguous runtime or host capability fails closed.
2. Input, candidates, and status render through standard DataView-bound fields/containers; the view rows are never copied into component props. Candidate rendering exposes only the session’s already-filtered columns, excluding temporary identity fields. Input edits use its businessPrompt DataView.
3. Component unmount clears only its own timer/listener and calls host `detach`; it does not call session dispose or remove either temporary table. Reattach returns the same session/capture without a second create or parallel poll.
4. Host tests cover same-target reattach, two independent DataSets, duplicate attachment refusal, tenant mapping missing/invalid, scope changes, dirty state surviving detach, and safe release only after the workspace owner’s explicit clean-close path.

### Verified existing contracts and remaining generation

`PAGE_RUNTIME` is the nearest-provider capability; `PageRuntime.resolveView` resolves the full scenario/model/view key. `RendererForm` and `RendererTable` already bind DataViews and support standard field children/`autoColumns`; the generic component must use standard children and the candidate view’s filtered column metadata rather than hand-passing business row arrays. The repository has no current AI entry host/capability or `VITE_AI_DATA_ENTRY_AGENTS` declaration in `.env.example`; `LowcodePrincipal.enterpriseName` is sourced from `session.enterprise.shortName`. Current dictionary workspace disposes its AI owner/runtime inside its child composable on unmount, so it cannot serve as the detach-persistent host. Keep this distinction for G4 integration; do not place the new host inside a Dialog subtree whose unmount destroys the DataSet.

Attachment cleanup has two explicit owners: component unmount only stops that component’s timer/subscription and detaches; it never disposes the session. The persistent host’s clean `releaseClean()` first synchronously revokes/stops any still-registered attachment timer/subscription and detaches idempotently, then checks/disposes the safe session, and only afterward releases its runtime/DataSet/workspace. Do not change SystemPageIdentityPool or route close protocol; the still-live system-page/data-workspace owner calls the explicit clean release only after the existing dirty guard succeeds.

After any G3 public declarations are implemented, the parent must run the formal ClassModel generator serially, then refresh directory/overview/guide and close all new semantic gaps. No G3 product/test files or generated artifacts were changed during this preparation.
