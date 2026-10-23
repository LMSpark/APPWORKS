# 服务器管理页（service-management-page）— v3 语义卡汇总

> 组合 hub 子页；矩阵行 `service-management-page.vue`。

## 调用分类

| # | 能力 | 类别 | 落点 | page vitest |
| --- | --- | --- | --- | --- |
| 1 | 目录查询 | 模型查询 | `Base_serverInfo` + 7 列 children | 加载列表 |
| 2 | 注册服务器 | 写命令 | `DatabaseServerRegister` → `/Db/registerServer` | 注册确认 |
| 3 | 测连 | 只读命令 | `databaseServerTestConnection` | 注册对话框测连 |
| 4 | 编辑 | 模型 save | `databaseServerBeginEdit` + `saveEdit` | 编辑描述 save |
| 5 | 删除 | 模型 save | `databaseServerDeleteSelected` | 删除确认 |

## 实页

仍依赖 formal-model-gap；vitest 覆盖 UI→spark-data 链。
