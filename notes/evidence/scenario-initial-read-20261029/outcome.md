# Scenario 首次读取切片：源码核对与有效 RED

日期：2026-10-29
基线：`f9fb6fe0626874c5db308cd7dcf8661ea4e4966b`。本轮未改产品源码、生成物、Java、正式配置或台账。

## 结论

`loadLowcodeRuntimeScenario({projectId, scenarioId})` 当前先调用文件 gateway `readText(scenarioId)`，再解析 `ScenarioViewConfig`，并在 `loadScenarioDataSet` / assembler 里创建正式 DataSet。首次 pagedata IO 因而发生在 ScenarioConfiguration DataView 存在之前。`ScenarioViewData` 现有 DataView 只在拿到远端文本后以 `initialResult` 注入该文本；它不是首次读取 executor。

一个有效 RED 已加入 `tests/runtime/auth-nav/data-space/scenario-initial-read-red.test.ts`：拦截真实运行入口的第一次 `readText`，检查此前由 `DataSet.fromJson` 创建的目标文件 DataSet/View 是否存在，并检查该 View 的实际 `requestState` 为 `RequestState.Loading`。当前源码失败于“first file IO must already belong to a native ScenarioConfiguration DataView: expected undefined to be defined”，失败栈指向 `lowcode-data-space-runtime.ts:97` 在第一次 `readText` 时尚未创建文件视图。断言不是仅 spy `readText`；它核对真实 DataView 状态，未 stub 权限或手改 rows。

## 现有调用链与签名

1. `loadLowcodeRuntimeScenario(command: {projectId: string; scenarioId: string}): Promise<DataSet>` 在 `src/lowcode/data-space/lowcode-data-space-runtime.ts` 捕获 request scope、建立 `assertCurrent`，直接 `createLowcodeProjectGateways(projectId).scenarioViews.readText(scenarioId)`；仅在成功解析配置后才调用 `loadScenarioDataSet`。
2. `ProjectWorkspace.loadScenarioViews(command: {scenarioId: string; forceReload?: boolean}): Promise<ScenarioViewFile>` 负责 scope、同目标 single-flight、缓存、dirty/保存保护；private `readScenarioViews(scenarioId, scope)` 直接 `scenarioGateway.readText(scenarioId)`，null 明确报 `SCENARIO_VIEW_FILE_MISSING`，随后创建/重载 `ScenarioViewFile`。
3. `ScenarioViewFile(scenarioId: string, initialText: string)` 构造 `ScenarioViewConfig`，再创建 `ScenarioViewData(scenarioId, initialText, initialText, assertValid)`；`ScenarioViewData` 创建 `ScenarioConfiguration` DataSet/DataView，`bindQueryExecutor({executeQuery: () => Promise.resolve(initialResult), save})`。构造本身已拥有文本，无首次网络查询。
4. 已有定义资源路径 `ScenarioDefinitionResource.forQueries(options): DataViewQueryExecutor` 会返回 `executeQuery(view, params)`；其 `ScenarioDefinitionResource.executeQuery(view, params)` 先核验正式 file 资源 DataView、目标 DataSpace，再调用 `workspace.loadScenarioViews(...)`。这是数据空间定义视图后续读取的 DataView 内路径，但当前运行装配的 pagedata 首读发生得更早。
5. `DataView.bindQueryExecutor(executor, options?)` 仅接受 executor 及显式资源身份/可选初始结果；`DataView.loadFromServer(params?)` 置真实状态 Loading，调用 executor，身份校验后接纳结果；失败置 Failed；`RequestState` 包括 Idle/Preparing/Loading/Loaded/Failed。DataSet/DataView 被 destroy 后，异步返回由 request id/liveness 校验拒绝或丢弃。

## 建议的最窄改动面（等待主控核对后实施）

- 把首次文件读取加入现有 `ScenarioViewData` 查询模式：具名 options 对象，保持构造参数不超过 3 个、不增加兼容包装；现有纯已加载基线及保存模式在内部共用同一 DataView owner。`ScenarioConfiguration` DataSet 与完整 file resource identity 必须先创建，再由该 DataView 的 `loadFromServer()` 触发 gateway `readText`。
- `ProjectWorkspace.readScenarioViews` 改为创建该查询 owner、执行 view query、核验 `Loaded` 及唯一文件身份后再生成/安装 `ScenarioViewFile`；把该已查询的 `ScenarioViewData`/DataSet 交给 File 持有，避免读完后再 new 一份 DataSet。保留当前 Workspace 同目标缓存、single-flight、scope token、强制重载/dirty 检查和旧实例释放规则。
- `readText` 回 `null` 仍是明确缺失并沿 `SCENARIO_VIEW_FILE_MISSING` 返回，不将 readonly 没有结果猜成新建。只有现有显式 `createScenarioViews`/定义资源新增命令可建草稿；保存仍沿 `ScenarioViewFile.saveChanges` → 原 `DataSet.saveChanges` → 既有 gateway `writeText`，保留冲突、取消、未知回执和真实回读。
- 首读失败仍保留 DataView Failed/错误；scope 改变、错误目标/空间、迟到查询及 destroy 不得装配/注册旧 File。查询期间修改/保存要沿现有 DataView pending/edit guard 决策，不另建文本 draft/cache。正式 DB model binding 与权限不可伪造。
- 最外层 `loadLowcodeRuntimeScenario` 负责调用 `ProjectWorkspace.loadScenarioViews` 并从 File 取经验证的配置；数据空间装配和保存合同维持不变。后续整阶段1仍需独立做元定义语义资源 bootstrap（首次元定义 IO 前 DataView）、来源 Base_DataSet.sysid locator 和认证 scope 来源定位，本切片不能宣称阶段1完成。

## 公共影响与失败矩阵

推荐 `ProjectWorkspace.loadScenarioViews`、`ScenarioViewFile` 的消费者签名维持原样；`ScenarioViewData` 是包内实现类型，具名 options 改动不扩包根 API。`ScenarioViewGateway.readText/writeText` 外部合同不变，只变更第一次 `readText` 的调用时序/owner。`ScenarioViewFile` 需增加内部接纳已加载 DataView 的构造入口或等价私有 factory；不能再重读/复制成新 Dataset。

实施 RED 应补齐：已有文件首读（本次有效 RED）；null 明确缺失不生成新配置；executor 失败保留 Failed 且不装配；错误 target/scope 不接纳结果；迟到返回在 workspace dispose/destroy 后不注册；跨 scenarioId 不串用 view；query resolving 期间编辑或 save 按既有 pending/dirty 语义阻止覆盖。已有 `scenario-view-file.test.ts` 的保存/冲突/取消/未知回执/回读/并发新编辑测试保留，不改写以消除旧保护。

## 生成合同与验证记录

`generated/dts-class-model/manifest.json` 含 `packages/spark-project-model/src/scenario/scenario-view-data.ts`、`scenario-view-file.ts`、`project/project-workspace.ts` 和 `packages/spark-data/src/data-view.ts`；对应生成物的 JSDoc 来源为 `source-file-jsdoc`，manifest 声明 bundle protocol `spark-appworks.dts-class-model.bundle`，生成入口是根 `package.json` 的 `generate:class-model-surface`（`scripts/generate-dts-class-model.mjs`）。HEAD 工作树开始干净；未运行生成器、未手改生成物。

- 新增 RED：`pnpm exec vitest run tests/runtime/auth-nav/data-space/scenario-initial-read-red.test.ts --reporter=verbose` → 1 test failed，预期；原始失败为 `first file IO must already belong to a native ScenarioConfiguration DataView: expected undefined to be defined`，栈 `src/lowcode/data-space/lowcode-data-space-runtime.ts:97:75`。
- 文件 owner 回归：`pnpm --filter @spark-appworks/spark-project-model exec vitest run tests/scenario/scenario-view-file.test.ts --reporter=dot` → 1 file / 185 tests passed。
- 旧 runtime-loader 文件单独现状：1 file / 25 tests，14 failed、11 passed，含 mock 缺 `lowcodeDesignFileUpload` 等与本 RED 无关的既有失败；不能把它们归为本片 RED 或新回归。新测试独立运行只产生上面的 1 个明确契约失败。

## 补充RED（主控澄清后）

- root runtime RED remains mandatory: `loadLowcodeRuntimeScenario` first-read coverage is saved in `runtime-initial-read-red.txt` (1 failed, expected current bypass).
- Package additions are in `packages/spark-project-model/tests/scenario/scenario-view-file.test.ts`: 7 new real DataView query-path cases for load-null, executor IO error and Failed state, scope change, workspace disposal plus delayed return, explicit-create null preflight, distinct target identities, and forceReload with edits made while query is pending. The assertions inspect an actual `DataView` captured from its DataSet at the gateway boundary and require `RequestState.Loading`; no permission stubs or manual row writes.
- Package run: `pnpm --filter @spark-appworks/spark-project-model exec vitest run tests/scenario/scenario-view-file.test.ts --reporter=dot` -> 7 new RED failures, 185 unchanged existing tests pass, 192 total. Full output is `package-scenario-view-file-red-full.txt`.
- Runtime-loader baseline was rerun before any product edits and its complete 535-line output is saved to `runtime-loader-baseline-full.txt`: 14 failed, 11 passed, 1 unhandled error, including the existing missing `lowcodeDesignFileUpload` mock export. These failures remain separately classified and no test was removed or rewritten.
- Contract clarification: loading null remains an explicit missing-file error. Only the explicit `createScenarioViews` command may treat a null preflight as permission to create that requested draft; a non-null preflight rejects overwrite. `ScenarioViewData` stays package-internal. Prefer the already exported `ScenarioViewFile` as the shared static read/load surface for runtime and Workspace; keep `fromLoadedData` private/minimally visible. Runtime must not instantiate a full `ProjectWorkspace` merely to read one file.
