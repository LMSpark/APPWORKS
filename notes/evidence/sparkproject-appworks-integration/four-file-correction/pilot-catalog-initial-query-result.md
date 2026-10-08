# 目录初始化期间查询保护执行结果

## 完成情况

按 `notes/plan-catalog-initial-query.md` 完成首载查询保护：初始化期间保留筛选输入，禁用查询、分页与动作控件，并在脚本入口用同一 pending 状态阻止直接调用；`__init__` 的 `finally` 在成功或失败后释放状态。初始化后仍可使用保留的 ID 查询，真实 mounted 页面回归得到目标 1/1。

变更仅限计划批准的两个代码文件：

- `config/pages/data-platform/data-space-catalog/script.js`：初始化 pending 状态及 `__init__` finally；查询、分页/页大小、增删改、复制 handler 均在 pending 时返回；查询、分页和动作 UI 反映 pending 及既有忙/保存未知状态，输入框仍可编辑。
- `tests/runtime/page/catalog/data-space-four-file.test.ts`：新增真实 SparkPageRenderer 延迟应用选项请求回归，验证初始化期间输入保留、按钮禁用、直接 handler 无额外查询/写入，初始化结束后查询真实筛选得到 1/1；另验证应用选项初始化失败后保护释放。夹具识别实际 wire filter；合法的 `Filter: null` 按未筛选处理。

## 验证

- RED：在生产改动前运行新 mounted 用例，失败于查询按钮缺少 disabled 属性，确认复现。
- GREEN：两条新增回归通过。第一次 GREEN 扩展校验时发现夹具将 `Filter: null` 当作筛选导致假 `ERR_NETWORK`；修正夹具空值判断后复验通过。
- `pnpm run typecheck`：通过。
- `pnpm exec eslint config/pages/data-platform/data-space-catalog/script.js tests/runtime/page/catalog/data-space-four-file.test.ts`：通过。
- `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts --silent`：51/51 通过（含原有 49 项）。
- `pnpm run verify:ai-codegen`：通过，982 个文件。
- `pnpm run verify:dirs`：通过。
- 未运行全量测试、未做浏览器操作、未 commit/push。

## 写前快照

- `initial-query-before/script.js.txt` SHA256：`3B21C483CAEBA42E4ABAD19395C1794AA193862029DE65B93A9B2276B21DA2EF`
- `initial-query-before/data-space-four-file.test.ts.txt` SHA256：`80CCD5195805793F386172BC1B1CF3242496B657CA51A11B4E55905506F121F3`

快照目录：`notes/evidence/sparkproject-appworks-integration/four-file-correction/initial-query-before/`。

## 边界

没有修改 DataView、权限或保存语义；没有触碰批准范围外文件。在线刷新验收由主控执行。

## 主控审查修订

按主控审查要求，将 `createCatalogScriptFixture` 的场景/初始化参数收束为第三个具名 `CatalogScriptFixtureOptions`，同步调整未初始化及未声明设计场景的调用；不添加别名，生产脚本保持冻结。复验结果：

- `pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts --silent`：51/51 通过。
- `pnpm exec eslint config/pages/data-platform/data-space-catalog/script.js tests/runtime/page/catalog/data-space-four-file.test.ts`：通过。
- `pnpm run typecheck`：通过。

第一次重跑捕获到原“未声明设计场景”调用点仍使用第三个布尔位置参数；该调用已改为具名 options 并完成上述复验。

## 主控验收（2026-10-08 02:03）

生产差异审查通过；测试fixture的第4位置参数已收束为具名options。主控独立51/51通过，pilot-initial-query-root-tests.log。只部署script，五份相关资产回读一致，pilot-deploy-initial-query.json。最初保存前检查因读取CDP envelope层次不对失败，未执行任何写入，修正数据解包后精确比对再保存。

浏览器延迟首载保留已填ID、查询与操作禁用；初始化结束恢复，用同一输入得到1-1/1，复制按钮可用，0console error。临时网络延迟已恢复。见pilot-initial-query-online.json/png。本闭环通过，完成子计划依协议删除，下一项进入查询绑定。
