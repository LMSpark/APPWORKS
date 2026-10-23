# 表设计对话框（table-design-dialog）— v3 语义卡与调用分类

> 载体页：`table-and-view-page.vue` + `table-design-dialog.vue`；矩阵行 `table-design-dialog.vue`。
> 参考：`use-table-design-dialog.ts` + `table-design-dialog.vue`（sparkproject metadata）。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | 表和视图 hub 选中物理表 → 工具栏「表设计」 |
| 目的 | 维护表头属性、字段网格、表关系、（参考还有）数据预览与工作流 |
| 输入 | 当前表 `rowid`、所属库 `dbid`；同 FormKey 下 catalog DataSet |
| 输出 | `_Base_TblList` / `Base_TblField` / `Base_TblRln` 经 `saveChanges` 持久化；同步元数据写命令 |
| 取消 | 关闭对话框；字段/表头 staged 变更由 discard 或放弃保存 |
| 异常 | 保存回执失败、未确认结果核验、关系/字段校验失败 |
| 下游 | 列表刷新字段数；关系列表 OR 过滤当前表 |

## 2. 调用分类（参考 → spark-data）

| # | 参考调用 | 类别 | spark-data 落点 | 本仓状态 |
| --- | --- | --- | --- | --- |
| 1 | `getTableDesignDetail` | 模型查询 | `_Base_TblList` DataView + 表头 RendererForm | 已接（选中表 + object header） |
| 2 | `getTableFields` / 字段 save | 模型查询+保存 | `Base_TblField` staged + `databaseCatalogDesignSavePending`；中文名列 `showCellControl` + 设计对话框字段表 `highlight-current-row` | 已接（表头 + 字段网格 cnname page vitest；ops 见 field-view-ops.test） |
| 3 | `syncTableMetadata` | 写命令 | `databaseCatalogSyncTableMetadata` 命令视图 | 已接（表设计工具栏 page vitest） |
| 4 | `getTableRelations` | 模型查询 | `Base_TblRln` `forTable` + OR filter | 已接 |
| 5 | `saveTableRelation` / `deleteTableRelation` | 模型保存 | `table-relation-dialog` + 关系列表 `on-row-click` + staged + `saveChanges` | 已接（增/编/删 page vitest） |
| 6 | `getTablePreviewData` | 只读命令/内置 | 同 FormKey `GetData` 物理表描述 + `DatabaseTablePreviewRows` 只读 DataView | 已接（数据页签 page vitest） |
| 7 | 字典/脱敏/加密/字段类型 | 模型查询 | 同 DataSet 可选模型 + 字段 grid children | 已接（缺实页模型） |
| 8 | `getWorkflowDefinitions` 等 | 模型查询 | 可选 `Base_WorkflowDefinition@forTable` + tblid/可选筛选；页签顶栏 `DatabaseCatalogWorkflowQuery` + 刷新 | 已接（参考列头筛选→顶栏等价；「设计」= 暂未实现） |
| 9 | `AI填表` / `AI描述` | 页面编排 + Agent UI | 回填仍经 `Base_TblField` staged + 用户保存 | **缺口已登记**（[`ai-capability-gap-v3`](research-database-management-i5-ai-capability-gap.md)） |

## 3. 本周期 v3 闭环范围

- **table-design 行收束**：#1–#8 已接；#9 缺口已登记，不伪造按钮。
- **下一页**：`view-design-dialog`（见 `research-database-management-i5-view-design.md`）。
