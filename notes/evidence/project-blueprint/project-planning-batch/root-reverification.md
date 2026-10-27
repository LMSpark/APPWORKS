# ProjectPlanning 同父批量新增主控复核

日期：2026-10-27

实施冻结后，主控发现并补充了一个 owner 生命周期缺口：正式新增回执已受理但后续完整树读回失败时，原 DataView 仍有待完成命令，项目切换不能释放 owner。当前 `BlueprintWorkspaceDataView.hasPendingBlueprintCommand` 统一暴露待回执/待读回状态，DevSystem 以 `hasPendingDevSystemWrite` 将该状态纳入既有待处理写入保护。没有增加保存器或第二数据通道。

主控新增回归：批次已受理、读回失败后，DevSystem 仍拒绝切换项目。

| 命令 | 结果 |
| --- | --- |
| `pnpm exec vitest run tests/app/dev/dev-state-page-file-closed-loop.test.ts tests/app/services/project-planning-ai-runner.test.ts tests/app/services/project-planning/grouped-planning-contract.test.ts` | 3 files / 76 tests passed |
| `pnpm --filter @spark-appworks/spark-lowcode-api exec vitest run src/platform/data-space/runtime/data-space-runtime-api.test.ts` | 1 file / 128 tests passed |
| `pnpm exec eslint`（9 个受影响 TS 文件） | 通过 |
| `pnpm run typecheck` | 通过 |
| `pnpm run verify:rules` | 通过 |
| `pnpm run build` | 通过；输出保留仓内既有 dynamic-import / chunk-size 告警 |
| `git diff --check` | 通过 |

SPARK runtime package 的独立 `typecheck` 在未修改的 `dictionary-workspace.test.ts` 报 5 条既有 TS6133/TS4111/TS2412 诊断；本次改动源文件没有 package typecheck 诊断。没有 SPA 业务写入或 Java 修改。
