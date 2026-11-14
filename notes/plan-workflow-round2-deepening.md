状态：superseded

> 2026-11-14 Round2 收工：设计对话框 `prepareFlowDesignViews` + mount 测试 + 门禁绿；D99 手工三项 P1 待补。深化交付见 `notes/plan-workflow-round3-graph-runtime.md`。

## 任务目标

在批 5–6 + 审批骨架烟测 Go 基础上，按参考仓 `E:\r\sparkproject` @ `1147b00ee` 分批接回 FlowDesign / FlowRunDetail / FlowRunPage / FlowAppendUser 业务语义，并对齐实服 pagedata 与命令资源。

## 阶段与业务语义

- **R0（烟测跟进）**：D99 蓝图内补验流程模型列表查询、设计入口、监控→详情跳转（只读）；记录控制台与首屏截图。
- **R1 配置合同**：`WFM_FLOW_MODLE` / 设计场景元表补全 `modelId`（以实服回读为准）；合并或删除未登记的 `flow-run-detail/pagedata.json` 草案；`flowModelList` 与监控场景 `E328…` 继续单场景单登记。
- **R2 流程设计（W2）**：接回参考 `FlowDesign`——节点/边元表 DataView、SchemaGraph（或仓内窄组件）、保存经 `src/lowcode/resources/system/workflow/manage/**`；Vue 不直调 `lowcodeApi`。
- **R3 运行态（W3）**：`FlowRunDetail` 图与步骤；`FlowRunPage` / 移动办理 Back/Submit 等；监控→详情→办理链 **写入验收** 须用户单独授权。
- **R4 命令与注册**：`FlowAppendUser` 命令资源；按需将 `flow-append-user` 注册为工具页（非菜单则仅命令挂载）。
- **R5 测试**：扩展 vitest mount（`flow-model-list-page`、`flow-design-page` 打开、`flow-monitor` 行跳转）；保持 `flow-runtime-route` 与维度/数据库回归。

## 影响范围（预估）

- `src/views/features/workflow/**`
- `src/lowcode/resources/system/workflow/manage/**`
- `config/pages/workflow/**`、`config/pages/system/flow-monitor/pagedata.json`
- `config/navigation/vue-pages.json`（若注册加签页）
- `tests/runtime/**/workflow/**`、`tests/runtime/application/dimension/**`（回归）
- `notes/research-workflow-approval.md`（差距核销）

## 技术方案（有序）

1. 研读参考 `apps/appworks/src/ui/features/workflow/**` 与 `data/api/FlowManage/*`，更新 `research-workflow-approval.md` 差距表。
2. 实服只读回读 `87F0…` / `6E46…` 场景模型 ID，写入对应 `pagedata.json`（不猜测）。
3. 设计页：列表→设计对话框数据链 → 图/节点面板 → 保存命令。
4. 运行详情/办理：替换占位 `DisplayAlert`，接回图与动作资源。
5. 阶段验收：typecheck + verify:rules + 定向 vitest；授权后单条监控实例只读/退回烟测。

## 兼容性

- 不修改蓝图导航 URL；系统页仍靠 `navigationId`/`dataSpaceId` 与 `vue-pages.json` 对齐。
- 同一运行场景 `E328…` 仅保留 `flowMonitor` 一处 `system-scenarios` 登记。

## 验证计划

- `pnpm run typecheck`
- `pnpm run verify:rules`
- `pnpm exec vitest run tests/runtime/page/structured-config/workflow/flow-runtime-route.test.ts tests/runtime/application/dimension/dimension-design-page.test.ts tests/runtime/page/database/directory-page.test.ts`（基线）
- 新增/扩展 workflow mount 套件（实施后补充路径）
- D99 只读烟测矩阵（R0 + 阶段末）

## 风险项

- 参考依赖 `@spark-template/spark-api` 运行时，需按本仓 spark-data / 资源层逐项映射。
- `WFM_FLOW_MODLE` 无 `modelId` 时列表装配失败——R1 阻塞 R2。
- 浏览器自动化对 D99 可能无法挂载 Vue，关键路径保留人工烟测。

## 审核

待用户「通过/开工」后状态改为 `approved` 并进入阶段 6 实施。