# 数据空间布局受限读取实施结果

## 执行结果

- 按计划增加只读宿主 owner：场景身份直接使用 `DATA_SPACE_DESIGN_FORM_KEY`；locator 固定为 `appType=designfile`、`customPath=SysForm`、`fileName=<dataSpaceId>.json`、跨企业读取关闭。owner 在 context 创建时捕获应用/会话 scope，调用前后及错误映射前核验；只有 scope 仍有效时，正式 `LowcodeApiError.code === 404` 映射为 `null`。
- dataSpaceId 原文先检查控制字符和 `%`，之后 trim 并拒绝空值、`.`、`..`、斜杠和反斜杠；不会接收文件名、场景、URL、应用身份或任意路径参数。
- 脚本 `$page.readDataSpaceLayout` 始终存在；仅能力存在且页面声明并装载对应设计场景时创建一个 scope-bound reader。缺能力、场景未声明/未装载、页面 signal/generation/dispose/reload 失效均显式拒绝。重复调用复用该 context 的 reader。
- App 将能力放入既有 `PAGE_RUNTIME_SERVICES`；renderer 传给页面 context。没有改 LowcodeClient、查询权限、目录页面、业务 Vue 或写 API。

## 修改文件

- `src/lowcode/data-space/lowcode-data-space-layout.ts`：新增受限文件读取 owner。
- `src/App.vue`：注入宿主能力。
- `packages/spark-component/src/runtime/app-services.ts`、`script-context-types.ts`：集中页面服务契约及脚本 reader 类型。
- `packages/spark-component/src/page/context/buildPageContext.ts`、`page/renderer/SparkPageRenderer.vue`：按页面实例绑定并传递 reader。
- `tests/runtime/auth-nav/data-space/lowcode-data-space-layout.test.ts`：owner locator、scope、输入边界、404/错误分类。
- `tests/runtime/page/runtime/page-script-lifetime.test.ts`：reader 创建条件与页面失效测试。
- `tests/runtime/page/spark-page-renderer-binding.test.ts`：父级能力经过 renderer 到脚本的传递。
- `packages/spark-component/src/tests/runtime/createSandbox.test.ts`、`tests/runtime/page/catalog/data-space-four-file.test.ts`：手写脚本服务夹具显式拒绝未配置能力。
- `packages/spark-component/API.md`：说明可调用条件、错误边界和只读行为。

## 验证

| 命令/动作 | 结果 |
|---|---|
| 修改前 `pnpm run typecheck` | exit 0，基线通过 |
| 首次新增 owner 测试（RED） | exit 1，模块尚不存在，Vitest 无法解析 owner 导入 |
| owner 最小实现后定向测试 | 通过；随后补充 scope 迟到和边界用例 |
| 最终 `pnpm run typecheck` | exit 0 |
| 对全部修改的 TS/Vue 测试与源码执行精确 ESLint | exit 0 |
| `pnpm exec vitest run` + 计划中的 5 个测试文件 | exit 0；5 files passed，134 tests passed |
| `pnpm run verify:ai-codegen` | exit 0；984 files checked |
| `pnpm run verify:dirs` | exit 0；directory limits ok |

owner 测试覆盖精确固定 locator 与当前 `X-AppId`/FormKey、原文和空文保留、无应用拒绝、11 类非法 ID 零请求、404 唯一映射、403/500/非字符串/网络错误抛出、应用或登录身份变化前拒绝、请求中应用变化及请求中 404 在 scope 变化后仍拒绝。页面测试覆盖缺能力/未声明/未装载、context 内多次读取只建一个 reader、abort 前置拒绝，以及 abort/dispose/reload 后迟到成功和迟到失败拒绝。

## 基线与最终 SHA-256

原有目标文件的完整 preimage 及其 hash 保存在同目录 `layout-read-before/`；新增文件的基线为不存在。当前版本 hash：

| 文件 | 当前 SHA-256 |
|---|---|
| `src/lowcode/data-space/lowcode-data-space-layout.ts` | `2685A4F3CF19C5867A434AACB6F5A1B3887A09F2593DC8664F5793E814E4ACEA` |
| `src/App.vue` | `BA952247588334D71A061C1F3484351206C43FCAFECE601A52720ABA91883C42` |
| `packages/spark-component/src/runtime/app-services.ts` | `A0FFCD8105048E49115E0E8A899E25B27C34EFAD4974B3A8DB60E649E94F04FE` |
| `packages/spark-component/src/runtime/script-context-types.ts` | `AFE4F377F7FC209C66DEF8B478427D6C8862CAB71979DEF520AD6CC49871F1D3` |
| `packages/spark-component/src/page/context/buildPageContext.ts` | `8BA51E742977D9084154F2B67878CFBB6078E488D7A9B3125E1F74E45E70FEBC` |
| `packages/spark-component/src/page/renderer/SparkPageRenderer.vue` | `DF3F46B1C622D11155C8B8FEDE6F9C2DBCD86147AB6EA9CF6FEFB0E01DEAFF93` |
| `tests/runtime/auth-nav/data-space/lowcode-data-space-layout.test.ts` | `E439B24D42FEA008F48EE849C8D803B16AE45930823CD7F8D46237D6CA1A2354` |
| `tests/runtime/page/runtime/page-script-lifetime.test.ts` | `E611F24FB5A7B35254440070536733D5336677B63722B13AF555E224D371049D` |
| `tests/runtime/page/spark-page-renderer-binding.test.ts` | `41FC4FC40C5DF55EA90F83BF9763ACE9C027BB7A17669AF5ED078117EF505634` |
| `packages/spark-component/src/tests/runtime/createSandbox.test.ts` | `BAF32113A045CD003E3A5C9D04F4DA049552BBB76472CBE7C1AD278ABB1A353B` |
| `tests/runtime/page/catalog/data-space-four-file.test.ts` | `AC9B685683217EF532EB68D0D47C8A98E970962AE0325E17D4CB714CC68887CE` |
| `packages/spark-component/API.md` | `E948850E98AD10B43DF9B8F67855C7E420981FA259EB00B5EB64B4DCD2D60FED` |

## 验收边界

本轮证明的是 mock transport 与页面生命周期下的只读契约、scope 检查和接线。未做线上请求或 D2 设计页面验证；迟到请求的 HTTP 传输不会被取消，只保证失效结果不会返回脚本。此前 root tree 存在的其他 dirty 工作未回滚或纳入本项。

## 主控验收（2026-10-08 02:57）

已逐项对照preimage检查五个核心接线文件，确认App仅import/provider两处，原DataView刷新订阅未改。独立复验3文件45项通过，日志pilot-layout-read-root-tests.log。实施者完整134项/typecheck/lint/门禁保留上述记录。

在线先发现bare动态import命中热更新前的旧ESM，实际请求仍为SysForm/<ID>，返回404；对照当前LowcodeDesignApi请求SysForm成功。整页刷新后新owner实际读到7911字符、graphVersion=1、6节点/0边，与原布局一致。证据pilot-layout-read-host-online.json及pilot-layout-read-direct-online.json（仅局部布局原文，未记录凭据）。没有业务或布局写入，不把此宿主读取当成设计页UI通过。判定：本只读能力签收；M0/D2继续。

待沉淀候选：开发环境HMR更新后，用未带更新版本的bare import执行验收可能复用旧ESM；以真实请求和整页刷新复验区分缓存旧代码与接口合同，不修正确代码迎合旧模块。
