# I5 database-management 研读入口（2026-10-20）

整合计划 I5 退出：阶段 2 矩阵 **6 行**通过；删除 `src/views/app/DBMS.vue` 包装，页面落点 `src/views/features/data-platform/database-management/**`（与参考仓相对路径对齐）。

## 矩阵六页（参考 features/）

| 参考路径 | 本仓现状 |
| --- | --- |
| `database-management/table-and-view/ui/table-and-view-page.vue` | 能力在 `src/views/app/DBMS.vue` 单页 |
| `table-and-view/ui/add-table-dialog.vue` | 缺（DBMS 内联） |
| `table-and-view/ui/register-dialog.vue` | 缺 |
| `table-and-view/ui/table-design-dialog.vue` | 缺 |
| `table-and-view/ui/view-design-dialog.vue` | 缺 |
| `database-management/ui/service-management-page.vue` | 同上 DBMS |

## 当前 DBMS.vue（约 2.5k 行）

- 职责：lowcode 已注册服务器 → 数据库 → 表 → 字段（只读）+ 注册/同步/建表等编排。
- 边界：app 层入口，非 spark-data 数据空间链；与 I4 设计器无直接耦合。
- 实施前须：对照参考六页语义（输入输出、持久化、取消/异常）→ 是否已有 `spark-lowcode-api` 合同 → 四文件或原生 Vue 落点 → 整页验收。

## 与 I4 的关系

I4 §4.3 删类已交付（`5b09bab85`）；I5 不依赖 view-design session。阶段 1 仍开放 `data-set-auth-page.vue`（权限配置 UI，AGENTS 0.3 暂缓运行权限扩展）。

## 下一动作

- pagedata/DataSet 合同：**已补全** → [`research-database-management-i5.md`](research-database-management-i5.md) § pagedata / DataSet。
- 计划：**`notes/plan-database-management-i5.md`**（implementing；首屏 `bbc254aba`）。
- table-and-view 研读：**[`research-database-management-i5-table-and-view.md`](research-database-management-i5-table-and-view.md)**（draft）。
