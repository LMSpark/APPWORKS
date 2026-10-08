# 页面渲染钩子刷新结果

## 结论

完成四文件范围内的专用 `onBeforeRender` 调用接线。首次单钩子用例通过，但双 sibling 钩子最小用例复现 Vue `Maximum recursive updates exceeded`；给渲染计算提供只读 `renderRevision` 依赖，并避免钩子执行后调用 `invalidate()` 后，双钩子初始化、普通事件和 DataView 状态用例通过。没有改布局读取 owner、业务页面、`SparkComponentRenderer` 或新增能力键。

## 改动

- `packages/spark-component/src/page/binding/build-page-children.ts`：`BuildPageChildrenOptions` 增加可选 `callBeforeRender`；只对字符串 `onBeforeRender` 使用它，其他事件仍按原 `callFunc` 归一化。未提供该调用器的既有消费者保持原行为。
- `packages/spark-component/src/page/renderer/SparkPageRenderer.vue`：提供闭包内专用调用器，读取当前 `renderRevision`、检查当前页面调用、执行当前脚本函数并保留异常/异步失败诊断，不触发 invalidate。
- `tests/runtime/page/spark-page-renderer-binding.test.ts`：真实挂载两个声明式 sibling 钩子。异步初始化等待期间先将 DataView 设为 Loaded，确认初始化完成前仍关闭、完成后两者都显示；继续验证普通事件切换、Loading/Failed 关闭、Loaded 恢复，以及多次 flush 后两个局部调用计数稳定。
- 复核补充同文件真实双实例测试：A/B 使用相同 `pageId` 和不同 `PageRuntime`；A 的初始化、按钮事件、DataView 状态变化均不增加 B 的 hook 计数或改变 B 显示。测试从挂载后真实 `SparkComponentRenderer` config 保存 A 的绑定闭包，替换 A 后调用旧闭包得到 `PAGE_RUNTIME_STALE`，且对旧 runtime 的 `getDataSet` spy 证明业务脚本函数未执行。
- `packages/spark-component/API.md`：补充同步纯钩子、刷新来源与 `visible:false` 关闭态说明。

## 验证

| 命令 | 结果 |
| --- | --- |
| 基线 `pnpm run typecheck`（改动前） | 退出码 0；`vue-tsc --noEmit --skipLibCheck -p tsconfig.typecheck.json` |
| 首次单钩子 RED 探测 `pnpm exec vitest run tests/runtime/page/spark-page-renderer-binding.test.ts -t "refreshes nested declaration hooks"`（未改生产代码） | 退出码 0；仅单 hook 不足以暴露互相失效问题 |
| 双 sibling RED `pnpm exec vitest run tests/runtime/page/spark-page-renderer-binding.test.ts -t "refreshes nested declaration hooks"`（专用 caller 接线前） | 退出码 1；测试在第二 hook DOM 断言失败，stderr 出现 3 个 `Maximum recursive updates exceeded in component <SparkComponentRenderer>` 未处理 rejection |
| 同一双 sibling GREEN 命令（专用 caller 接线后） | 退出码 0；1 test passed |
| 最终 `pnpm run typecheck` | 退出码 0 |
| `pnpm exec eslint packages/spark-component/src/page/binding/build-page-children.ts packages/spark-component/src/page/renderer/SparkPageRenderer.vue tests/runtime/page/spark-page-renderer-binding.test.ts` | 退出码 0 |
| `pnpm exec vitest run tests/runtime/page/spark-page-renderer-binding.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts tests/ui/renderer/renderer-link-permission.test.ts` | 退出码 0；3 files、93 tests passed |
| `pnpm run verify:ai-codegen` | 退出码 0；984 files checked |
| `pnpm run verify:dirs` | 退出码 0；directory limits ok |
| 复核补充后的 `pnpm exec vitest run tests/runtime/page/spark-page-renderer-binding.test.ts` | 退出码 0；1 file、20 tests passed |
| 复核补充后的 `pnpm exec eslint tests/runtime/page/spark-page-renderer-binding.test.ts` | 退出码 0 |
| 复核补充后的 `pnpm run typecheck` | 退出码 0 |

Vitest 输出的 esbuild/oxc 双配置提示为既有 warning；最终验证无失败或未处理错误。本轮没有运行 build、全量测试或浏览器验证，符合计划边界。

## 文件指纹

实施前快照存于 `notes/evidence/sparkproject-appworks-integration/four-file-correction/render-hook-refresh-before/`。SHA-256：

| 文件 | 实施前 | 当前 |
| --- | --- | --- |
| `packages/spark-component/src/page/binding/build-page-children.ts` | `50A9B2E9C3E90FA8E6C108998ADEB42E3589A4EB714610C0AD007FBE8086F6B5` | `901297ECBE48EF91B7EE0133CD470B6E8BD30BB45F6E599B39918644C253F71E` |
| `packages/spark-component/src/page/renderer/SparkPageRenderer.vue` | `DF3F46B1C622D11155C8B8FEDE6F9C2DBCD86147AB6EA9CF6FEFB0E01DEAFF93` | `FFDBF24841D5E54F75BBCCA9E7A14315BE19C6E223D06D368F09ABE05F4A95B3` |
| `tests/runtime/page/spark-page-renderer-binding.test.ts` | `41FC4FC40C5DF55EA90F83BF9763ACE9C027BB7A17669AF5ED078117EF505634` | `434386C0B80C994FEA54467241D3D515F423E68EBCAC04E9249D7D062C05179B` |
| `packages/spark-component/API.md` | `E948850E98AD10B43DF9B8F67855C7E420981FA259EB00B5EB64B4DCD2D60FED` | `EB82846BADAF42A309CE0696FDEB0B86AF56A736163FE8732B6BB5F3533D5B1F` |

## 边界与待签收

工作树含有其他并行任务的既存改动；本项只编辑计划中的四个目标文件。`SparkPageRenderer.vue` 与 `API.md` 的完整文件前像包含已签收布局读取任务的改动，本报告指纹记录完整文件快照，不把那些既存改动归入本项。没有 commit、push 或分支操作。等待主控复核并签收；这项支撑闭环不代表 D2 业务页或整体集成完成。

## 主控签收（2026-10-08 03:09）

已对照preimage阅读全部4文件改动，并审查双hook、同工具双实例和旧hook失效用例。独立运行renderer+catalog两个suite共84项通过，日志pilot-render-hook-refresh-root-tests.log。该修正签收，原业务事件与目录行为保留。后续四文件设计页消费；不将平台支撑验收记作D2业务完成。

待沉淀候选：渲染computed内执行ref.value++既读取依赖又修改依赖；单hook可表现正确，但多个hook互相失效递归。用于渲染的脚本调用必须只读刷新版本，事件调用才写版本。早期单hook绿色和双hookRED均保留，不为预设结论造失败。
