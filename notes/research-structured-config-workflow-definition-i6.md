# 数据工作流（workflow-definition）— I6 v3 研读卡

> FormKey：`5E9676B1E38860B023921F48FB4370DE`。**≠** `src/views/app/WorkflowDesigns.vue`（Agent workflow）。

## 1. 参考 API

- `DataWorkFlow.ts`：page/detail/create/update/remove/triggerTables
- `DataWorkFlowDesign.ts`：nodes/connectors/saveNode/saveConnector/dataSet

## 2. 调用分类

| # | 能力 | 类别 |
| --- | --- | --- |
| 1 | 目录 CRUD | 模型 + 专用 manager |
| 2 | 图设计 save | 专用 design API |
| 3 | 触发表选择 | triggerTables 只读查询 |

## 3. MVP 边界

目录 + 设计页（节点/边列表编辑 + JSON 草稿）+ 触发表对话框；完整画布见 gap 卡。

## 4. 缺口

`backend-api-contracts` 未列 DataWorkFlow REST → `api-gaps.json` `dataWorkflow`.
