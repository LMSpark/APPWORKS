# 注册数据库对话框（register-database-dialog）— v3 语义卡与调用分类

> 载体：`table-and-view-page.vue` + `register-database-dialog.vue`。
> 参考：hub 登记物理库（`_base_dbInfo`）。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | hub 左侧库列表工具栏「注册数据库」（须隐式/选中服务器） |
| 目的 | 在目录登记新物理库 |
| 输入 | 当前 `Base_serverInfo` 上下文；表单 Name 等 |
| 输出 | `_base_dbInfo` 经 `saveChanges` |
| 取消 | discard staged |
| 异常 | 未填库名、未确认保存、回读失败 |
| 下游 | 库列表级联表/视图 |

## 2. 调用分类

| # | 参考调用 | 类别 | spark-data 落点 | 本仓状态 |
| --- | --- | --- | --- | --- |
| 1 | 库列表 | 模型查询 | `_base_dbInfo` DataView | 已接 |
| 2 | saveRegisterDatabase | 模型保存 | `databaseCatalogDbBeginCreate` + `databaseCatalogDbSaveEdit` | 已接 |
| 3 | getUnregisteredDb | 只读命令 | `DatabaseUnregisteredDbs` + refresh 按钮 | 已接 |

## 3. 验收

- ops：`database-catalog-db-view-ops` saveChanges。
- 页面：`table-and-view-page` 打开对话框 + 注册确认（vitest）。
