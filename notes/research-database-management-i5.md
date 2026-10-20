# I5 database-management 研读（2026-10-20）

## 任务来源

`notes/plan-appworks-integration.md` I5：阶段 2 矩阵 6 行通过；删除 `src/views/app/DBMS.vue` 包装，页面落点 `src/views/features/data-platform/database-management/**`。

## 本仓现状

| 入口 | `config/navigation/vue-pages.json` → `source` |
| --- | --- |
| `/dbms` | `src/views/app/DBMS.vue` |
| `/features/.../service-management-page` | 同上（hidden） |
| `/DataBaseManage/DataBaseManage/index` | 同上（hidden，蓝图 URL） |
| `/features/.../table-and-view-page` | 同上（hidden） |

`src/views/features/data-platform/database-management/` **不存在**。`vue-page-registry.test.ts` 断言上述别名均指向 DBMS.vue。

## DBMS.vue 职责与数据链（约 2570 行）

- **读**：`lowcodeApi.catalog.getDatabaseCatalog(formKeys)`，formKeys 来自蓝图记录（导航标题「数据库管理 / 数据资源管理 / 结构化配置」下的 scenarioId）。
- **UI**：单页「对象资源管理器」— 服务器 → 数据库 → 表/视图 → 结构/数据/SQL 页签；非参考仓「列表页 + 多个对话框」分文件结构。
- **写**：`catalogMutationsDisabled` + `reportGovernanceBlocked()` — 注册服务器/库/表、同步 catalog、删表等多处 **显式 blocked**，文案为 lowcode mutation 尚无写前镜像/幂等/journal 合同。
- **直连 HTTP**（少量）：`/api/Db/testConnection`、`/api/Db/getUnregisteredDb/{serverId}`（注册流程相关）。
- **数据浏览**：占位说明需数据空间 + modelId + 权限，不伪造业务数据查询。
- **边界**：物理 catalog 语义，**不是**数据空间 DataSet 设计链（AGENTS 0.2 数据空间原则不直接套用；属资源专题，可参考 `docs/guides/resource-topic-template.md`）。

## 参考仓（inventory，无本地 appworks 源码）

| 文件 | 行数 | 数据 API（import） |
| --- | --- | --- |
| `service-management-page.vue` | 660 | spark-api + list-page |
| `table-and-view-page.vue` | 462 | `use-table-and-view-page.ts` (733) → `DataBaseManage/TableAndView` |
| `add-table-dialog.vue` | — | `TableAndViewRegister` |
| `register-dialog.vue` | — | register |
| `table-design-dialog.vue` | 648 | `use-table-design-dialog.ts` (1908) → `TableDesign` |
| `view-design-dialog.vue` | 618 | `ViewDesign` |

参考为 **多页/多 dialog + 大 hook**；本仓 DBMS 为 **合并只读工作台 + 变更能力被治理门禁关闭**。

## spark-lowcode-api

- 已用：`LowcodeDatabaseCatalog`、`lowcodeApi.catalog.getDatabaseCatalog`。
- **未发现** `TableAndView` / `TableDesign` / `ViewDesign` 等价封装（packages 内 grep 无 DataBaseManage）。

## 测试与导航

- `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` 含 `/dbms`。
- 迁移后须更新 registry 测试：`source` 指向新 features 路径，蓝图 URL 不变。

## 约束（AGENTS / 台账）

- 后端：实际运行服务为准，不改本地 Java 补能力。
- 交付单位：**完整页面**闭环（0.7），不能拆成仅换路径壳。
- 写能力：须核对正式 mutation 合同；不能因参考仓有按钮就恢复未确认的写入。

## 待核实项

- 运行环境 `/api/Db/*` 与 `getDatabaseCatalog` 对「注册/建表/表设计/视图设计」的覆盖范围。
- 参考 `use-table-and-view-page` 与 DBMS 只读 catalog 是否同一后端模型，或两套合同。
- I5 首屏交付：对齐参考 1:1 列表/dialog，还是先 **行为等价** 把 DBMS 拆到 features 路径（只读）再逐 dialog 恢复写能力。
