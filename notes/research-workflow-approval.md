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
- Lowcode：`src/lowcode/resources/workflow/manage/*` 包装 FlowManage，禁止 Vue 直接 `lowcodeApi`
- 场景配置：`config/pages/workflow/*/pagedata.json`，并登记 `config/pages/system-scenarios.json`

## 差距（待账本）

- 参考 `FlowDesign.ts` / `FlowRunPage.ts` / `FlowRunDetail.ts` / `FlowAppendUser.ts` 体积大且依赖 `@spark-template/spark-api` 运行时；本批以 DataView 列表 + 占位面板交付，专用命令与运行图未接回。
- 流程设计图编辑（SchemaGraph）、运行办理全套动作、工作台待办查询未验收。
- `flow-model-list` 的 modelId 需与正式库对齐；当前 pagedata 仅声明 modelName，依赖装配时后端绑定。