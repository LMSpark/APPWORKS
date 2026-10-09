# M0 复制 API 任务 1：通用剪贴板实施结果

## 结果

任务 1 已完成。页面脚本通过 `$page.copyText(text)` 调用统一 `PageServiceCapability.copyText(text): Promise<void>`。宿主注入的 `pageService.copyText` 优先；未注入时等待 `navigator.clipboard.writeText`。无写入能力时抛出 `当前环境不支持剪贴板写入`，宿主或浏览器拒绝原样向上传播。`buildPageContext` 在调用前及 await 后检查 AbortSignal、runtime destroyed 和 generation；因此失效后不会启动写入，已发出的写入无法撤销且不会继续成功处理。

## 修改文件

生产代码：
- `packages/spark-component/src/runtime/app-services.ts`：增加必需 copyText Promise 契约。
- `packages/spark-component/src/page/services/buildPageService.ts`：增加宿主覆盖与 navigator.clipboard 默认实现；失败显式传播。
- `packages/spark-component/src/page/context/buildPageContext.ts`：增加带调用前后失效检查的脚本代理。
- `packages/spark-component/src/core/capability-keys.ts`：完整 PageService capability 校验要求 copyText。

既有完整 service fixture：
- `tests/runtime/page/page-components-access.test.ts`
- `tests/runtime/page/runtime/page-script-lifetime.test.ts`
- `tests/runtime/page/catalog/data-space-four-file.test.ts`
- `tests/runtime/page/transaction-config-pages.test.ts`
- `tests/ui/renderer/renderer-field-advanced.test.ts`
- `tests/ui/component/zero-code-events.test.ts`
- `tests/runtime/data-view/dataview-crud-bridge.test.ts`
- `packages/spark-component/src/tests/runtime/createSandbox.test.ts`

行为用例覆盖脚本默认剪贴板成功、宿主覆盖及拒绝传播、不支持环境、失效前不调用宿主，以及写入等待期间失效后不执行成功回调。navigator.clipboard stub 都在 finally 中恢复。

## RED / GREEN

- RED：新增编译脚本调用 `$page.copyText` 的默认写入用例，原实现以 `TypeError: $page.copyText is not a function` 失败，Vitest exit 1。
- GREEN：最小实现后同一用例通过。异步生命周期聚焦测试初次暴露成功标志观察方式与 sandbox 导出语义不匹配，调整为外部 notify spy 后通过；没有改动产品行为来适配测试。

## 验证命令与退出码

- `pnpm run typecheck`：0。
- `pnpm exec eslint <本任务 12 个实际变更 TS 文件> --max-warnings=0`：0。
- `pnpm exec vitest run tests/runtime/page/page-components-access.test.ts tests/runtime/page/runtime/page-script-lifetime.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts tests/runtime/page/transaction-config-pages.test.ts tests/ui/renderer/renderer-field-advanced.test.ts tests/ui/component/zero-code-events.test.ts tests/runtime/data-view/dataview-crud-bridge.test.ts`：0，7 个文件、102 项通过。
- 在 `packages/spark-component` 工作目录运行 `pnpm exec vitest run --config vitest.config.ts src/tests/runtime/createSandbox.test.ts`：0，1 个文件、25 项通过。
- `pnpm run verify:ai-codegen`：0，检查 982 个文件。
- `pnpm run verify:dirs`：0。

未运行全量 build。写前快照及 SHA-256 清单位于 `notes/evidence/sparkproject-appworks-integration/four-file-correction/copy-text-before/`。

## 风险与边界

- Clipboard API 受浏览器权限和用户手势等环境限制；失败会 reject，调用脚本需处理拒绝状态。
- 运行时失效不会取消已经交给浏览器或宿主的写入，但 await 返回后会拒绝旧脚本继续执行成功逻辑。
- 当前只交付通用剪贴板能力；任务 2 的场景配置、数据读取和页面接线未实施。

## Fix 1（主控审查补证）

仅补充两处已有测试文件：
- `page-components-access.test.ts` 增加可控 native `navigator.clipboard.writeText` Promise：断言 Promise settle 前仍 pending，拒绝时同一 Error 对象原样 reject，native 写入只调用一次；`finally` 恢复 clipboard descriptor。
- `page-script-lifetime.test.ts` 将等待期间失效场景参数化为 AbortSignal abort 与 PageRuntime dispose；两条路径均断言 stale reject 且不执行脚本成功通知。

验证：
- 最小新增 native 用例：`pnpm exec vitest run tests/runtime/page/page-components-access.test.ts -t "waits for native clipboard writing"`，exit 0，1 项通过。
- 聚焦两文件：`pnpm exec vitest run tests/runtime/page/page-components-access.test.ts tests/runtime/page/runtime/page-script-lifetime.test.ts`，exit 0，2 文件、13 项通过。
- 精确 lint：`pnpm exec eslint tests/runtime/page/page-components-access.test.ts tests/runtime/page/runtime/page-script-lifetime.test.ts --max-warnings=0`，exit 0。
