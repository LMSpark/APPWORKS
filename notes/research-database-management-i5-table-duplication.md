# 复制表对话框（copy-table-dialog）— v3 语义卡与调用分类

> 载体：`table-and-view-page.vue` + `copy-table-dialog.vue`；hub 物理表工具栏「复制」。
> 参考：`copyTable`（sparkproject metadata）。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | hub 选中物理表 → 工具栏「复制」（与表设计互斥关闭） |
| 目的 | 在同库复制目录表行及字段定义 |
| 输入 | 源表 `rowid`、当前库 `dbid`、新表名/描述 |
| 输出 | `_Base_TblList` + `Base_TblField` 同次 `saveChanges` |
| 取消 | 关闭对话框 |
| 异常 | 同名表、源表无字段、保存进行中、回读未见新表 |
| 下游 | 表列表刷新；可选再进表设计 |

## 2. 调用分类

| # | 参考调用 | 类别 | spark-data 落点 | 本仓状态 |
| --- | --- | --- | --- | --- |
| 1 | `copyTable` | 模型保存（双视图） | `databaseCatalogCopyTable` | 已接 |
| 2 | 源字段读取 | 模型查询 | 选中表 → `Base_TblField` refresh | 已接 |

## 3. 验收

- vitest：`table-and-view-page`「copies selected table through copy dialog and saveChanges」→ Batch CRUD。
