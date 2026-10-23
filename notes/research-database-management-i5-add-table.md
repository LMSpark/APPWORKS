# 新增数据表对话框（add-table-dialog）— v3 语义卡与调用分类

> 载体页：`table-and-view-page.vue` + `add-table-dialog.vue`；矩阵行 `add-table-dialog.vue`。
> 参考：`AddTable.ts` + 参考仓新建表向导（sparkproject metadata）。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | hub 选中库 → 物理表页签 →「新增」 |
| 目的 | 在目录中登记新物理表（`_Base_TblList`）；字段可在「表设计」后续维护 |
| 输入 | 当前库 `dbid`；同 FormKey catalog DataSet |
| 输出 | `_Base_TblList` 新行经 `saveChanges`；可选提示未登记物理表名（只读命令） |
| 取消 | 关闭对话框 discard 草稿行 |
| 异常 | 保存回执失败、未确认结果核验、回读失败 |
| 下游 | 表列表刷新；表设计补字段/同步元数据 |

## 2. 调用分类（参考 → spark-data）

| # | 参考调用 | 类别 | spark-data 落点 | 本仓状态 |
| --- | --- | --- | --- | --- |
| 1 | `getUnregisteredTable`（物理表名） | 只读命令 | `DatabaseUnregisteredTables` + `databaseCatalogQueryUnregisteredTableNames` | 已接 |
| 2 | `saveAddTable`（表头+字段一次 save） | 模型保存 | 参考一次 save 两模型；本仓 **仅** `_Base_TblList` staged + `databaseCatalogTableSaveEdit` | **部分**（目录插表 page vitest；字段仍在表设计） |
| 3 | 字典/应用/脱敏（参考向导内） | 模型查询 | 表设计/字段 grid 消费同 DataSet 可选模型 | 不在本对话框 |

## 3. 与参考差距（登记，不伪造）

- 参考 `saveAddTable` 同批提交 `Base_TblField`；本仓 I5 当前路径为 **目录插表 + 表设计补字段**，与 `copy-table-dialog`（表+字段一次 save）分工不同。
- 若产品要求新建表必须带初始字段网格，须在 `add-table-dialog` 或专用向导扩展 staged 双视图 save，单独 v3 周期实施。

## 4. 下一 v3 页

- 收束 **hub** `table-and-view-page`（调用分类汇总）或 **register-dialog** 复核。
