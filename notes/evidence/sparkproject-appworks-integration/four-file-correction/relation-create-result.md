# 关系新增本地闭环结果

状态：本轮代码与测试已冻结，待主控整页验收。未部署、未在线写入、未提交或新建分支。

## 实际交付

- 四文件设计页的关系新增入口使用 `rule.json` 中既有 `el-select-v2` 配置节点选择父模型、子模型和依赖类型；Filter 保留完整表达式。图连线只预填输入，明确保存才通过原 DataView/DataSet 发起新增。允许同端点不同关系 ID。
- PageRuntime 的命名不透明本地草稿桥保存独立输入和提交后待核验阶段。请求中及回执后失效的 Renderer 可重挂载继续核验；不自动重复新增。正式回读逐字段核可见性，确认元数据后再同步布局；暂存恢复、显式接受当前正式结果和取消沿原业务通道执行。
- 修改的生产/合同文件：`packages/spark-component/src/runtime/app-services.ts`、`script-context-types.ts`、`page/context/buildPageContext.ts`、`API.md`，以及 `config/pages/data-platform/data-space-design/script.js`、`rule.json`。修改的测试文件：`tests/runtime/page/runtime/page-script-lifetime.test.ts`、`tests/runtime/page/design/data-space-design-four-file.test.ts`、`tests/runtime/page/catalog/data-space-four-file.test.ts`。本轮未修改 `style.css`、`pagedata.json`、DataView/DataSet 或宿主上传实现。

## 可核验证据

- 开工前 11 份原始字节副本及 SHA-256：[`relation-create-preimage/manifest.sha256`](relation-create-preimage/manifest.sha256)。这是本轮新增 diff 的基线，不把 Git HEAD 以来的其他工作算入本轮。
- 最小闭环按桥、独立输入、正式保存、配置下拉、回读权限和重挂载恢复逐轮收敛；对应 `relation-create-bridge-green.log`、`relation-create-input-green.log`、`relation-create-save-green.log`、`relation-create-renderer-green.log`、`relation-create-readback-green.log`、`relation-create-remount-green.log`，失败阶段的 `*-red.log` 保存在同目录。过程中有多次局部修订，未把每次文件写入误报为独立验收轮次。
- 集中行为命令：`pnpm exec vitest run tests/runtime/page/runtime/page-script-lifetime.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts`，[`relation-create-final-tests.log`](relation-create-final-tests.log)，**3 文件、175 项通过，exit 0**。其中真实 SparkPageRenderer 夹具通过实际 DOM 下拉点击选择父/子/类型、填写完整 Filter、保存、正式回读、布局边同步及新 PageRuntime/Renderer 重开；还覆盖同端点多 ID、两视图 Join、隐藏 Join 字段、脱敏回读、请求中和回执后重挂载、暂存恢复及显式接受当前结果。175 是三文件总数，未与定向重复计数相加。
- 根类型：`pnpm run typecheck`，[`relation-create-final-typecheck.log`](relation-create-final-typecheck.log)，exit 0。
- 精确 lint：`pnpm exec eslint packages/spark-component/src/runtime/app-services.ts packages/spark-component/src/runtime/script-context-types.ts packages/spark-component/src/page/context/buildPageContext.ts config/pages/data-platform/data-space-design/script.js tests/runtime/page/runtime/page-script-lifetime.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts --max-warnings=0`，[`relation-create-final-lint.log`](relation-create-final-lint.log)，exit 0。

最后一次生产/测试修改为 2026-10-08 12:37:27.318（`buildPageContext.ts`）；最终 lint、类型、测试日志分别于 12:37:42.126、12:37:51.486、12:38:02.272 写成，均晚于该修改。

## 验收边界

上述真实 Renderer 是本地正式查询/写入夹具，并非在线浏览器或后端实际部署证据。整页与线上零回归仍由主控验收。关系元数据已确认但目标布局缺失或布局后置失败时，页面按部分成功保留记录并提供后续核验；本轮没有后端原子事务、自动回滚或未知请求的幂等重试保证。未变更表达式、图几何和上传底层，未重复其大套件。
