# M0 页面脚本 Render 视图刷新执行结果

## 执行结果

- [x] 新增真实挂载回归：外部 DataView currentRow 从 u-1 变为 u-2 后，脚本 Render DOM 同步变化。改动前 RED：断言仍读到 u-1；订阅实现后 GREEN。
- [x] Renderer 为本次 PageRuntime 声明的每个 DataSet 注册实例级 onAnyViewChange；current/selected rows、rows、清空、配置、requestState、mutating、editing 和汇总事件统一进入既有 renderRevision。
- [x] 所有事件回调使用本次加载周期的 current 检查；runtime 替换、同 runtime reload 和卸载均释放订阅。
- [x] 覆盖 rows 替换与 requestState 通知、附加场景后建动态 view、reload 重复订阅防护、卸载释放，以及两个页面实例间视图刷新隔离。

## 修改文件

- `packages/spark-component/src/page/renderer/SparkPageRenderer.vue`：记录并释放视图订阅；按每个已声明场景注册刷新回调。
- `tests/runtime/page/spark-page-renderer-binding.test.ts`：添加 3 个 DOM 行为与生命周期回归。

## 验证输出

- 基线 `pnpm run typecheck`：通过，无错误输出。
- 改后 `pnpm run typecheck`：通过。
- `pnpm exec eslint packages/spark-component/src/page/renderer/SparkPageRenderer.vue tests/runtime/page/spark-page-renderer-binding.test.ts`：通过。
- `pnpm exec vitest run tests/runtime/page/spark-page-renderer-binding.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts tests/runtime/page/runtime/page-script-lifetime.test.ts`：3 files、70 tests 通过。
- `pnpm run verify:ai-codegen`：通过，982 files checked。
- `pnpm run verify:dirs`：通过。

## 写前快照

- `render-view-refresh-before/SparkPageRenderer.vue.txt` SHA256：`896C8DF628EB0E2B84BD4173BB01D0CFD80B62ACA4A4E345177E4808CE82F023`
- `render-view-refresh-before/spark-page-renderer-binding.test.ts.txt` SHA256：`C3C8754DDB641DE51D51ECB6E9CDA76D18EAA04B494612B120F1BB037A844B43`

## 边界

仅修改计划批准的两个代码文件；保留其他既有工作树改动。未执行浏览器操作、commit、push 或分支操作。浏览器端复制按钮验收仍由主控执行。

## 主控审查修正

- 将测试中的 `wrapper.vm as unknown as { reload: ... }` 改为检查 `wrapper.vm.$.exposed` 的运行时对象形状，并通过既有 `requireFunction` 校验 `reload` 后调用；没有新增断言、导出或宽松类型兜底。
- `pnpm exec vitest run tests/runtime/page/spark-page-renderer-binding.test.ts`：1 file、17 tests 通过。
- 精确 ESLint：通过。
- `pnpm run typecheck`：通过。

## 主控验收与知识候选

主控独立3文件70项通过（pilot-render-view-refresh-root-tests.log）；浏览器刷新后普通查询/选行立即出现工具栏，复制及重进成功（pilot-copy-api-online.json/png）。新增非法类型断言已移除复验。知识候选：DataSet.onAnyViewChange会接续后建视图，同一runtime重新装载仍需释放旧调用订阅，不能只依赖DataSet.destroy。暂留候选，不写knowledge。完成子计划按协议删除，范围/快照/验证记录保留本报告。
