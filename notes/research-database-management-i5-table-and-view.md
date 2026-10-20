# I5 table-and-view 研读（2026-10-20）

> 状态：implementing — **只读首切片已落地**（2026-10-20）；四 dialog 与字段目录仍待。

## 业务语义（参考仓）

| 页面 | 职责概要 |
| --- | --- |
| `table-and-view-page.vue` | 在选定数据库上下文下列出/筛选表与视图，入口注册、设计、同步等 |
| `add-table-dialog.vue` | 新建物理表流程 |
| `register-dialog.vue` | 注册未登记库对象 |
| `table-design-dialog.vue` | 表结构/字段设计 |
| `view-design-dialog.vue` | 视图定义设计 |

本仓当前 **`DBMS.vue`** 合并了服务器→库→表→字段只读树 + 多处 blocked 写入口；**不能**整页搬运，须按上表拆语义。

## 数据合同（与本仓对齐）

- **读路径终态**：与服务器页相同 — 导航 **单 FormKey** → 动态 `ScenarioViewConfig` + `LowcodeDataSpaceAssembler` → 各模型 **DataView**；禁止新页调用 `getDatabaseCatalog` 再手拆。
- **Catalog 五表名**（`LowcodeCatalogApi` 已用）：`Base_serverInfo`、`_base_dbInfo`、`_Base_TblList`、`_Base_ViewList`、 `Base_TblField`。
- **写/设计**：参考仓 hook 体量大；须逐项核 `/api/Db`、BatchTableOperate 与字段设计持久化，**经 spark-data** 落地后再开 dialog。

## 与首屏差异

| 项 | service-management | table-and-view |
| --- | --- | --- |
| 模型数 | 1（`Base_serverInfo`） | 至少 3–5 + 级联（库→表/视图→字段） |
| 导航 | hidden + `blueprintScenarioId` | 同上（`/features/.../table-and-view-page`） |
| DBMS | 仍用 catalog 聚合 | 迁移完成前路由仍指向 `DBMS.vue` |

## 建议切片顺序

1. **只读**：`_base_dbInfo` + `_Base_TblList` + `_Base_ViewList` 三视图装配 + 主从选择（无 dialog）。
2. **注册 dialog**：`register-dialog` 语义 + 未登记库 API（`/api/Db/getUnregisteredDb` 等须纳入 DataView 命令或 spark-data 合同，禁止页面 HTTP）。
3. **add-table / table-design / view-design**：依赖 D5 字段设计与后端 write 合同。

## 待核实

- 参考 `table-and-view-page` 与 DBMS 对应区块的字段、筛选、默认选中规则。
- 多库/多服务器是否在同一 FormKey 下由模型关系表达，还是页面级联配置。
- 实页 FormKey 与黑盒「表和视图管理」节点是否已绑 `dataSpace.scenarioId`。

## 关联

- 总计划：[`plan-database-management-i5.md`](plan-database-management-i5.md)
- 服务器首屏：[`research-database-management-i5.md`](research-database-management-i5.md)
