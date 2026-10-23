# 注册对话框（register-dialog）— v3 语义卡与调用分类

> 载体：`table-and-view-page.vue` + `register-dialog.vue`；矩阵行 `register-dialog.vue`。
> 参考：`TableAndViewRegister.ts`（sparkproject metadata）。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | hub 选中库 → 物理表/视图工具栏「注册」 |
| 目的 | 将物理库中未登记对象注册进 `_Base_TblList` / `_Base_ViewList` |
| 输入 | 当前 `dbid`；多选未登记名称 |
| 输出 | `POST /Table/registerTable/{dbid}` 或 `POST /View/registerView/{dbid}`；目录 refresh |
| 取消 | 关闭对话框 |
| 异常 | 未选行、命令失败、未确认结果 |
| 下游 | 表/视图列表；表设计补字段 |

## 2. 调用分类

| # | 参考调用 | 类别 | spark-data 落点 | 本仓状态 |
| --- | --- | --- | --- | --- |
| 1 | `getUnregisteredTableList` | 只读命令 | `DatabaseUnregisteredTables` + `databaseCatalogQueryUnregisteredTableNames` | 已接 |
| 2 | `getUnregisteredViewList` | 只读命令 | `DatabaseUnregisteredViews` + `databaseCatalogQueryUnregisteredViewNames` | 已接 |
| 3 | `saveRegisterTable` | 写命令 | `DatabaseTableRegister` + `databaseCatalogRegisterTables` | 已接（含 addDefaultFields） |
| 4 | `saveRegisterView` | 写命令 | `DatabaseViewRegister` + `databaseCatalogRegisterViews` | 已接（视图页签注册 + page vitest） |
| 5 | `getRegisterDatabaseList` | 模型查询 | 参考独立 FormKey；本仓库列表在 hub 左侧 | **不在本对话框**（`register-database-dialog` 负责库） |

## 3. UI 对照

- 表/视图切换、多选列表、表侧「为选中项添加默认字段」与参考一致。
- 列表 `RendererTable` 绑定只读命令 DataView；确认走 `confirmObjectRegister` → register ops。
