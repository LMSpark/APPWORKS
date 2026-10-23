# 表和视图 hub（table-and-view-page）— v3 语义卡（载体页）

> 矩阵行：`table-and-view-page.vue`；子对话框各有独立 research（`research-database-management-i5-*.md`）。
> 参考：`table-and-view-page.vue` + `use-table-and-view-page.ts`（sparkproject）。

## 1. 语义卡

| 项 | 内容 |
| --- | --- |
| 入口 | 导航蓝图 → 单 FormKey catalog DataSet |
| 目的 | 选库 → 表/视图列表 → 字段目录；打开登记/设计/复制/删除 |
| 输入 | `blueprintScenarioId`；隐式 `Base_serverInfo`（`databaseCatalogEnsureImplicitServer`） |
| 输出 | 各子能力经 spark-data；hub 不直调 HTTP |
| 取消 | 关闭对话框 discard；切换库刷新级联 |
| 异常 | 正式模型未登记（实页 gap）；命令未确认结果 |
| 下游 | 服务器管理配置连接；设计对话框消费同一 DataSet |

## 2. 子能力 → 矩阵 / research

| 子 UI | research | 调用分类 |
| --- | --- | --- |
| 注册数据库 | [`research-database-management-i5-register-database.md`](research-database-management-i5-register-database.md) | 模型保存 + 只读库名 |
| 注册表/视图 | [`research-database-management-i5-register-dialog.md`](research-database-management-i5-register-dialog.md) | 写命令 + 只读列表 |
| 复制表 | [`research-database-management-i5-table-duplication.md`](research-database-management-i5-table-duplication.md) | 双视图 saveChanges |
| 新增表 | [`research-database-management-i5-add-table.md`](research-database-management-i5-add-table.md) | 模型 save + 只读 hint |
| 表设计 | [`research-database-management-i5-table-design.md`](research-database-management-i5-table-design.md) | #1–#8；#9 AI 缺口 |
| 视图设计 | [`research-database-management-i5-view-design.md`](research-database-management-i5-view-design.md) | #1–#7；#8 AI 缺口 |
| 复制/删除 | copy-view-ops / object-view-ops | 模型 save / remove（见 [`research-database-management-i5-delete.md`](research-database-management-i5-delete.md)） |
| 库→表/视图→字段 | pagedata 级联 | 模型查询 |

## 3. hub 调用分类（汇总）

| 类别 | 落点 | 状态 |
| --- | --- | --- |
| 模型查询 | 五表 + 级联 field 视图 | 已接 |
| 模型保存 | 库/表 insert、设计 save、删除 | 已接 |
| 只读命令 | 未登记库/表/视图名 | 已接 |
| 写命令 | registerTable/registerView、syncMeta、registerServer 在子页 | 已接 |
| 页面编排 | AI（表/视图设计） | 缺口已登记 |

## 4. 实页

仍阻塞 `live-pilot-formal-model-gap.json`（须后端登记五表正式模型，非前端可关）；`tests/runtime/page/database` **84+** 用例覆盖 hub 与子页主路径。

## 5. v3 代码收束（2026-10-22）

| 项 | 状态 |
| --- | --- |
| 调用分类 #1–#8（表设计）/ #1–#7（视图设计） | vitest + ops 闭环 |
| AI #9 / #8 | 缺口登记，无假按钮 |
| add-table vs 参考 saveAddTable 字段批 | **仍部分**（目录插表；字段在表设计，产品未要求本周期一次 save 两模型） |
| 实页 formal-model-gap | **仍阻塞**（见 gap JSON + tier 测试） |
