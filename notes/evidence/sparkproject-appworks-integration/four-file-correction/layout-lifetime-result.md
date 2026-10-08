# 布局内容归属 PageRuntime：本地实施结果

状态：本轮生产/测试已冻结，待主控验收；仍是完整设计页总计划的一个局部闭环。

## 本轮变化

本轮相对 `layout-lifetime-preimage/` 的原始字节副本，仅新增 `packages/spark-project-model/src/page/content/runtime-content.ts`，并修改该 manifest 中的 13 个文件：`runtime-page.ts`、`buildPageContext.ts`、`app-services.ts`、`script-context-types.ts`、`SparkPageRenderer.vue`、设计页 `script.js/rule.json`、`packages/spark-component/API.md`，以及 `page-runtime.test.ts`、`page-script-lifetime.test.ts`、`page-runtime-tabs.test.ts`、`data-space-design-four-file.test.ts`、`data-space-four-file.test.ts`。manifest 内 `packages/spark-project-model/src/index.ts` 与 `packages/spark-component/src/tests/runtime/createSandbox.test.ts` 字节未变；不将 Git HEAD 以来其他共存修改算作本轮。

新内容 owner 按同一 PageRuntime 内的设计场景/目标空间 key 持有未加载、明确缺失或原文基线、草稿、pending/unknown、提交原文及实际 host Promise 结算。`isDirty` 汇总这些状态和原 DataView 状态，现有 Pool 关闭/刷新/项目切换直接沿这一出口拒绝丢草稿。旧 Renderer abort 后，真实 host 成功推进提交原文基线、失败保持 unknown；旧回调仍拒绝 UI 副作用。运行实例通知新 Renderer 同步投影，无轮询或无关点击。dispose 后迟到结果不再改变内容或发通知。

PageContext 对布局普通读取、独立 create 和原 `save(expectedContent:string)` 加同 key 内容协调。普通读取可初始化或更新干净基线；pending/unknown 在发文件请求前拒绝。保存前的远端预像读取不覆盖已存在草稿。设计页三个写入口——图保存、首次布局创建、关系元数据确认后的布局边同步——共用 owner；关系的正式完整过滤表达式仍由 DataView/正式模型管理，图文件只存 ID、端点及几何，关系后置布局失败仍提示部分成功。未确认的自动创建预览仍是可重建 UI 投影。

未知结果必须经页级“重新读取并采用远端布局”确认。取消保留本地状态；确认窗口、远端读取期间的修订变化、读取失败或坏图均不采用。当前正式模型/关系校验通过后才接受这次真实远端读取对象；远端可能是提交内容、旧基线、第三方内容或明确缺失，不据此推断先前请求成败。采用后旧脚本保存锁也被清理，可继续拖动/保存。图无法装配时恢复入口仍位于页级区域。旧原文与已确认关系元数据暂不匹配时，保留可用的新草稿投影，避免丢失部分成功路径。

## 验证

- 原始字节副本：`notes/evidence/sparkproject-appworks-integration/four-file-correction/layout-lifetime-preimage/`，按原目录结构保存 15 个开工前现有文件；同目录 `manifest.sha256` 记录对应 SHA-256。新增 owner 文件原先不存在。主控已逐文件核副本与 manifest 一致。
- 最小先红后绿：`pnpm exec vitest run packages/spark-project-model/tests/page-runtime.test.ts`，首个布局草稿用例的 `layout-lifetime-owner-red.log` exit 1，接入后 `layout-lifetime-owner-green.log` exit 0；host settlement 用例 `layout-lifetime-settlement-red.log` exit 1、`layout-lifetime-settlement-green.log` exit 0。其他定向绿包括 `layout-lifetime-remount-green.log`（真卸载/重挂载与旧 host 成功/未知 2 项）、`layout-lifetime-adoption-green.log`（取消/第三方/坏图/确认窗口修订 4 项）、`layout-lifetime-recovery-reuse-smoke.log`（坏草稿页级恢复和恢复后再次保存 2 项）。
- 最终根类型：`pnpm run typecheck`，exit 0，`layout-lifetime-final-typecheck.log`。精确 ESLint：`pnpm exec eslint packages/spark-project-model/src/page/content/runtime-content.ts packages/spark-project-model/src/page/runtime-page.ts packages/spark-component/src/page/context/buildPageContext.ts packages/spark-component/src/runtime/app-services.ts packages/spark-component/src/runtime/script-context-types.ts packages/spark-component/src/page/renderer/SparkPageRenderer.vue config/pages/data-platform/data-space-design/script.js packages/spark-project-model/tests/page-runtime.test.ts tests/runtime/page/runtime/page-script-lifetime.test.ts tests/runtime/page/runtime/page-runtime-tabs.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts`，exit 0，`layout-lifetime-final-lint.log`。
- 最终四行为套件和两受影响夹具：`pnpm exec vitest run packages/spark-project-model/tests/page-runtime.test.ts tests/runtime/page/runtime/page-script-lifetime.test.ts tests/runtime/page/runtime/page-runtime-tabs.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts packages/spark-component/src/tests/runtime/createSandbox.test.ts --testTimeout 30000`，exit 0，6 文件 202 项通过，`layout-lifetime-final-tests.log`；该命令确实执行了 package 的 `page-runtime.test.ts`。JSDOM `requestSubmit` 提示不代表浏览器验收。
- 本轮生产/测试文件最后实质修改为 `tests/runtime/page/design/data-space-design-four-file.test.ts` 于 **2026-10-08 03:49:23 UTC**；最终 typecheck、lint、tests 日志分别于 03:50:12、03:50:35、03:51:13 UTC 生成，均晚于该修改。202 为最终合并套件通过数，定向用例与它重叠，未额外累加。

## 保留边界

状态只保证同一存活 PageRuntime；进程硬刷新不持久化内存草稿。宿主文件创建仍非原子 CAS，unknown 不自动重试；取消不撤回已发请求。未修改后端、Pool/导航/App、低层上传、图几何、pagedata 或线上；未部署、未在线写。主控另跑 pages/AI/dirs 及整页验收，本轮通过不称整页或线上零回归。
