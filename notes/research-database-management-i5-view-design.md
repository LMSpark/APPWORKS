# 视图设计对话框（view-design-dialog）— v3 语义卡与调用分类

> 载体页：`table-and-view-page.vue` + `view-design-dialog.vue`；矩阵行 `view-design-dialog.vue`。
> 参考：`ViewDesign.ts` + `view-design-dialog.vue`（sparkproject metadata）；同 catalog **FormKey**（不单独 `viewDesign` 场景）。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | 表和视图 hub 选中视图 → 工具栏「视图设计」 |
| 目的 | 维护视图定义（名称/SQL/应用/功能描述）、输出字段网格、样例数据预览 |
| 输入 | 当前视图 `rowid`、所属库 `dbid`；同 FormKey catalog DataSet |
| 输出 | `_Base_ViewList` + `Base_TblField@viewFields` 经 `databaseCatalogDesignSavePending` / `saveChanges` |
| 取消 | 关闭对话框；staged 变更由 discard 或放弃保存 |
| 异常 | 保存回执失败、SQL/名称校验失败、预览查询失败 |
| 下游 | 视图列表与字段数展示 |

## 2. 调用分类（参考 → spark-data）

| # | 参考调用 | 类别 | spark-data 落点 | 本仓状态 |
| --- | --- | --- | --- | --- |
| 1 | `getViewDetail` | 模型查询 | `_Base_ViewList` 当前选中行 + 设计页签 RendererForm | 已接 |
| 2 | `getViewOutputFields` | 模型查询 | `Base_TblField@viewFields`，tblid=视图 rowid | 已接 |
| 3 | `saveViewDesign` | 模型保存 | staged `_Base_ViewList` + `databaseCatalogDesignSavePending` | 已接 |
| 4 | `saveViewFields` | 模型保存 | `Base_TblField@viewFields` + 设计「保存」 | 已接（输出模型 cnname page vitest + field-view-ops） |
| 5 | `getApplicationOptions` | 模型查询 | 可选 `Base_AppSystemList` + `application-option-dialog.vue` | 已接（应用选择 + save page vitest） |
| 6 | `getFieldTypeOptions` | 模型查询 | `TblField_type` | 已接 |
| 7 | `getViewPreviewData` | 只读命令 | `DatabaseViewPreviewRows` → GetData `Type: 数据库视图` | 已接（数据页签 page vitest） |
| 8 | AI 输出字段 | 页面编排 + Agent | 同 table-design #9 | **缺口已登记**（[`ai-capability-gap-v3`](research-database-management-i5-ai-capability-gap.md)） |

## 3. 预览合同（核对结论）

- 参考：`metadataSparkApiClient.query({ metaName: viewName })`（独立 viewDesign FormKey）。
- 本仓：与物理表预览同一 `POST /api/DataOperation/GetData`，`Type: 数据库视图`，`DbId` + 视图名（`vewname`）；scenarioId = catalog `DataSet.scenarioId`。
- 若运行服务不支持该描述符，UI 展示 `loadingError` 文案，不伪造数据。

## 4. 本周期 v3 闭环范围

- **已完成**：#1–#7；AI #8 缺口登记。
- **实页**：仍受 formal-model-gap；未升矩阵实页列。
