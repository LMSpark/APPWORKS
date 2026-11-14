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

- 参考体量仍大于本仓；**Round4 已接**：办理 **FlowForceBack**（`flow-run-page-client` + 侧栏）、设计页 **新增/删除节点**（`flow-design-graph-edit` + 节点表 TITLE/MEMO 可编辑）、工作台待办 **MVP 列表**（共用 `E328` + `View_FlowObjList`）。未接：`saveFlowAndFormRelation`、详情页强退、精确「我的待办」过滤合同。
- 设计保存：EJ2.json + DesignJson + 节点/边表同步 + `saveChanges`；**未**接回 `saveFlowAndFormRelation` 与节点权限扩展表。
- **`flow-model-list` / `flow-design` modelId：** 仍仅 `modelName`；2026-11-15 实服回读阻塞见 `notes/evidence/workflow-g0-model-ids-attempt-20261115.json`（脚本 `tools/workflow/read-workflow-model-ids.mjs` 已就绪）。
- **仓内场景登记：** 运行/监控/详情共用 `E328FBBF518141973C575D612CD75151` 时，`system-scenarios.json` 只登记 `flowMonitor` → `config/pages/system/flow-monitor/pagedata.json`；不得对同一 `scenarioId` 重复登记（2026-11-14 烟测已删 `flowRunDetail` 重复项）。
- **设计对话框：** 布局可拖 + `layoutOverride` 保存；**G2** `saveFlowDesignInfo` + `syncFlowDesignTables`；**G3** 图↔表双向高亮。
- **办理页：** 业务页签、`Submit`、**FlowBack** / **FlowForceBack**（`BackNodeList`、`ForceBackNodeList`、`AllowToForceBack`）、退回发起人、流程图/加签对话框。
- **运行详情 G4：** `flow-run-detail-page` 在 `E328…` 场景 + `peerScenarioIds` 设计场景上，`prepareFlowRunDetailPage` 刷新 `WFOBJ_FLOW_RELATIONLINE_STEP`/`WFOBJ_FLOW_Waiting` 并投影只读运行图（节点 completed/waiting 徽标）；节点/连线 `@select` 打开步骤钻取弹窗（不含强退）。
- **modelId：** `WFM_*` pagedata 仍仅 `modelName`，须实服只读回读后写入（R1 未阻断列表只读装配）。
- **G5 FlowAppendUser：** `flow-append-user/` lowcode 客户端（`GetExeUsers`/`FlowAddReceiveUser`/`FlowRevoke`）+ 步骤 DataView 筛选列表；`flow-append-user.vue` 接回列表/加人/撤回（无 PersonPicker，allowChange=1 时可选 `userDirectoryViewKey` 绑定 `Base_UserInfo`）。
- **D99 烟测（P1）：** 门禁自动化已通过；手工矩阵：① 设计拖拽保存重开 ② 办理 FlowBack/发起人/加签 ③ G0 modelId 写回后列表装配 —— 需登录 D99；G0 阻塞见 `notes/evidence/workflow-g0-model-ids-attempt-20261115.json`（`apply-workflow-model-ids.mjs` 已就绪）。