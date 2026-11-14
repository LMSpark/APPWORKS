# 业务审批流程迁移研读

## 参考范围

- 参考仓：`E:\r\sparkproject` @ `1147b00ee`
- UI：`apps/appworks/src/ui/features/workflow/**`（工作台待办在该 commit 的 appworks 树中未出现，集成清单指向 `packages/ui/domain/metadata`）
- 数据 API：`apps/appworks/src/data/api/FlowManage/*` 与 `data/api/services/flow-utils.ts`

## 身份合同

| 页面 | scenarioId | navigationId | 主模型 |
| --- | --- | --- | --- |
| 流程模型列表 | `87F0EF6AD1B64D67FFE597E7E3285994` | 同 scenarioId | `WFM_FLOW_MODLE` |
| 流程设计 | `6E462C4A39EE0D96F4D1A28FFE887C89` | 同 scenarioId | `WFM_FLOW_MODLE` + 节点/边元表 |
| 流程监控 / 运行详情 | `E328FBBF518141973C575D612CD75151` | 监控页 nodeId 同场景 | `View_FlowObjList` |

流程监控行跳转运行详情：`wfid` ← `View_FlowObjList.rowid`，`flowid` ← `WFMID`。

## 本仓落点

- 视图：`src/views/features/workflow/**` 对齐参考相对路径
- Lowcode：`src/lowcode/resources/system/workflow/manage/**` 包装 FlowManage，禁止 Vue 直接 `lowcodeApi`
- 场景配置：`config/pages/workflow/*/pagedata.json`，并登记 `config/pages/system-scenarios.json`

## 差距（待账本）

- 参考 `FlowDesign.ts` / `FlowRunPage.ts` / `FlowRunDetail.ts` / `FlowAppendUser.ts` 体积大且依赖 `@spark-template/spark-api` 运行时；本批以 DataView 列表 + 占位面板交付，专用命令与运行图未接回。
- 流程设计图编辑（SchemaGraph）、运行办理全套动作、工作台待办查询未验收。
- `flow-model-list` 的 modelId 需与正式库对齐；当前 pagedata 仅声明 modelName，依赖装配时后端绑定。
- **仓内场景登记：** 运行/监控/详情共用 `E328FBBF518141973C575D612CD75151` 时，`system-scenarios.json` 只登记 `flowMonitor` → `config/pages/system/flow-monitor/pagedata.json`；不得对同一 `scenarioId` 重复登记（2026-11-14 烟测已删 `flowRunDetail` 重复项）。
- **设计对话框：** 列表页 `peerScenarioIds` 装配 `6E462…`；`FlowDesignPage` 经 `prepareFlowDesignViews` 消费父 `PAGE_RUNTIME`，按 `FLOWID` 刷新节点/连线；**G1 首包采用 `RendererGraph` 只读预览**，布局由 `flow-design-graph-projection` 投影；**G2 切片** `readFlowDesignDataJsonText` 优先读 `SysForm/{flowId}EJ2.json`（`lowcodeApi.design.readTextFile`），空/404 回退模型 `DesignJson` 字段；**G3 切片** 图 `@select` → 节点/连线表 `setCurrentRowById` 高亮；保存、`resolveFlowDesignFileContext`（导航 folderName）仍待接回。
- **modelId：** `WFM_*` pagedata 仍仅 `modelName`，须实服只读回读后写入（R1 未阻断列表只读装配）。