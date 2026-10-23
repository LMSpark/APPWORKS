# 目录删除（表/视图/关系/服务器）— v3 语义卡

> 矩阵：hub `table-and-view-page`、表设计关系工具栏、`service-management-page`。
> 共性：**模型 saveChanges 删除**，非独立写命令（与 register/sync 区分）。

## 1. 语义卡

| 对象 | 入口 | spark-data | 成功提示 |
| --- | --- | --- | --- |
| 物理表/视图 | hub 列表选中 →「删除」→ 确认对话框 | `databaseCatalogDeleteRow` | 已删除 |
| 表关系 | 表设计「关系」→「删除」 | `databaseCatalogRelationDeleteSelected` | 关系已删除 |
| 服务器 | 服务器管理选中 →「删除」→ 确认 | `databaseServerDeleteSelected` | 服务器已删除 |

## 2. 调用分类

| # | 参考 | 类别 | 本仓 | 验收 |
| --- | --- | --- | --- | --- |
| 1 | deleteTable/deleteView | 模型保存（Deleted） | `database-catalog-object-view-ops` | page vitest 表/视图 |
| 2 | deleteTableRelation | 模型保存 | `database-catalog-relation-view-ops` | ops + 表设计关系 tab page vitest |
| 3 | deleteServer | 模型保存 | `database-server-view-ops` | page vitest |

## 3. 边界

- 删除前须选中行；hub 删除后清空选择并刷新字段区。
- 实页仍受 formal-model-gap 阻塞；vitest 覆盖 UI→saveChanges 链。
