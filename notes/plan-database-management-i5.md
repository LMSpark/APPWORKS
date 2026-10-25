状态：superseded（2026-10-25）

> **历史方案警示**：本文及后续正文保留为历史记录，不是当前实施计划。旧 Hub、候选身份解析、五模型档位及页面范围已被本次 B2 核验否定或替代；当前入口、合同、断点与后续范围只读 `notes/data-space-retirement-ledger.md` 的“2026-10-25 B2 数据库目录依赖与关系编辑续核”及其后续更新。不要按本文继续实施或据此认定当前产品事实。

## 任务目标

按整合计划 I5，将 database-management 六页落到 `src/views/features/data-platform/database-management/**`，替换 `DBMS.vue` 多入口包装，矩阵 6 行达到可验收的语义/合同/页面标准；最终删除或收窄 `src/views/app/DBMS.vue`。

## 阶段与业务语义（待首屏范围确认后细化）

- **服务器管理**（service-management-page）：注册/编辑/连接测试/列表（参考 ~660 行）。
- **表和视图**（table-and-view-page + add/register/table/view 四个 dialog）：列表、注册物理对象、表设计、视图设计（参考 hook 合计 >3k 行）。
- **本仓 DBMS 已交付子集**：catalog 只读浏览 + 治理 blocked 的 mutation 入口 + 少量 `/api/Db` 调用。

## 影响范围（预估，随首屏裁剪）

- 新增：`src/views/features/data-platform/database-management/**`
- 改：`config/navigation/vue-pages.json`（`source` 指向新页面，**path 不变**）
- 改：`tests/app/config/vue-page-registry.test.ts`、相关 auth-nav
- 删/弃：迁移完成后 `DBMS.vue`（或保留极薄 re-export 一段过渡期—待决策）
- 可能新增：`packages/spark-lowcode-api` 内 database/catalog mutation 门面（仅在有正式后端合同时）

## 技术方案（草案）

1. **合同核对**：参考 `ServiceManager` / `Base_serverInfo` 字段；确认 FormKey=dataSpaceId 下 DataSet 能否装配服务器模型与视图（缺 pagedata 则按资源专题模板补场景配置，不页面手拼 CRUD）。
2. **数据层**：`LowcodeDatabaseServer.loadCatalog` + `database-server-view-ops`（**非 owner**，只编排 DataView/DataSet）；**spark-data 唯一后端桥梁**；query/save owner 只在装配时 bind 到 DataView。
3. **页面**：`src/views/features/data-platform/database-management/ui/service-management-page.vue`（+ 必要 props/composables 子目录）；布局对照参考 1:1，控件 spark-component；**DataSet 为读写唯一通道**。
4. **导航**：hidden 两页 + `/dbms`、`/DataBaseManage/...` → `database-management-hub.vue`（组合壳）；`DBMS.vue` 仅 re-export。
5. **测试**：registry + 服务器 CRUD/连接 vitest（HTTP 或 DataSet 夹具）；typecheck、page-thin。
6. **后续**：table-and-view 四 dialog → 六页齐后删 DBMS。

## 阶段 1 交付（首屏）

- 输入：宿主/导航提供 **FormKey（= dataSpaceId）**。
- 输出：服务器列表与 CRUD、连接测试结果可见；持久化经 **saveChanges** 精确回读。
- 不含：DBMS 解块、表/视图设计 dialog、四文件化。

## 兼容性

- 蓝图 URL `/DataBaseManage/...` 与 features 路径须继续可导航。
- `/dbms` 是否保留为快捷入口（redirect 或同页）待决策。

## 验证计划

- **硬门禁**：`pnpm run typecheck`；`pnpm run verify:page-thin`；`tests/app/config/vue-page-registry.test.ts`。
- **业务**：新增 vitest（服务器列表/新增/编辑/删除/连接测试），断言经 **DataSet 唯一通道** 与回读；夹具与 `lowcode-catalog-api.test` 风格对齐。
- **验收口径（用户 2026-10-20）**：读写只认 **DataSet**；在线隔离 T 作矩阵「实页」补验（首屏可不阻塞 vitest 绿，但须计划内列 T 项）。

## 风险项

| 风险 | 缓解 |
| --- | --- |
| 参考写能力 vs 本仓 governance blocked | 分阶段：先只读迁移或先对接已确认 API |
| 无 TableAndView API 封装 | 阶段 1 核后端 + 在 spark-lowcode-api 增门面，禁止页面直拼 |
| 6 页一次过大 | 严格单页交付；DBMS 暂留至首屏等价 |

## 已确认（2026-10-20）

- **首屏交付**：参考 1:1 **service-management-page**（服务器 CRUD + 连接测试，恢复写能力；须逐项核 `/api/Db` 及目录表持久化合同）。
- **写能力层（用户纠偏 2026-10-20）**：**必须全仓走 spark-data API**（DataSet/DataView 查询、编辑、`saveChanges`）；不以页面直调 `/api/Db` 为终态。若需跨包门面，仅作 spark-data 的薄封装，不第二套提交链。
- ~~原草案：lowcodeHttp `/api/Db` 门面~~（已否决）。
- **导航共存（首屏）**：仅 `service-management-page` → 新 Vue；`/dbms` 与 table-and-view 仍 `DBMS.vue`。
- **列表读取（服务器页）**：`Base_serverInfo` **DataView** 查询（与保存同链）；**DBMS** 仍 `getDatabaseCatalog` 直至迁移删除。
- **UI**：参考布局与文案 **1:1**，交互控件用 **spark-component** 等价实现。
- **治理**：新页写操作仅经 **spark-data**；**DBMS.vue 内 mutation 仍 blocked**，直至后续 table-and-view 迁移时一并替换。
- **场景身份**：**FormKey 即 dataSpace/scenarioId**；PageRuntime/DataSet 以当前导航/宿主传入的 FormKey 绑定，不另造第二身份。

## pagedata / DataSet 结论（研读已写入 research）

- **不必**为首屏新建 `config/pages/.../pagedata.json`（若导航 FormKey = 单 scenarioId）：采用 **字典式动态装配** — `readSpaceDefinition` + `readModel('Base_serverInfo')` + `ScenarioViewConfig` + `LowcodeDataSpaceAssembler` → DataSet。
- **绑定**：`buildDataViewKey('Base_serverInfo', 'default', blueprintScenarioId)`；`PageRuntime.loadScenario` 返回上述 DataSet。
- **分层**：**DataView** = 组件与数据交互层（`RendererTable`/`RendererForm`/字段子组件经 `dataViewKey`）；**DataSet** = 提交与关系；列表/CRUD 仅 `DataView` 编辑 + `dataSet.saveChanges()`。**连接测试**经 `databaseServerTestConnection`（数据层）；正式 view command executor 可后续收敛。
- **导航**：hidden「服务器管理」节点须带 **blueprintScenarioId**（= FormKey）；不复用 DBMS 多 scenario 合并。
- 详见 [`notes/research-database-management-i5.md`](research-database-management-i5.md) § pagedata / DataSet 合同研读。

## 阶段 1 进度（2026-10-20）

- [x] `service-management-page.vue` + `LowcodeDatabaseServer` + `database-server-view-ops`
- [x] 导航 `source` 切换；registry + page-thin + 服务器 vitest（`tests/runtime/page/database/*` 11+ 项）
- [x] **UI 列统一（2026-10-20）**：服务器 + 表和视图页去掉字段 `children` / 手写字段 filter；`RendererTable`/`RendererForm` 默认 autoColumns（列真源 DataTable.columns，行 DataView 查询）
- [x] 在线/实页：隔离 T 证据 stub（`notes/evidence/database-management-i5/live-pilot-server-crud.json`）；浏览器补图单独 commit
- [x] 连接测试：`lowcode-database-dataset-extensions` + `databaseServerTestConnection` → 命令 DataView.refresh；SSOT 收束至 `packages/spark-data` `DataSetCommandView` helper
- [x] 列表筛选：空 `filter` 占位，后续走 RendererFilter / queryConfig（无手写字段 children）
- [x] table-and-view 四 dialog：`register-dialog.vue`、`add-table-dialog.vue`、`table-design-dialog.vue`、`view-design-dialog.vue`；字段设计经 `databaseCatalogFieldSavePending` + staged `Base_TblField`（vitest `database-catalog-field-view-ops.test.ts`）
- [x] DBMS 包装已删除；导航直链 `database-management-hub.vue` / feature 页；移除 catalog 聚合读与页面 Db HTTP
- [x] 服务器页 vitest 挂载（`service-management-page.test.ts` + 夹具复用）
- [x] table-and-view **只读首切片**（`LowcodeDatabaseTableView` + `table-and-view-page.vue`；四 dialog 未做）

## 阶段 2 启动（table-and-view，draft）

- 研读：`research-database-management-i5-table-and-view.md`（五表、与 DBMS 差异、建议只读首切片）。
- 编码门禁：单 FormKey 动态装配 ≥3 模型 + 级联；仍不调用 `getDatabaseCatalog`；导航已切 hub/feature 页。

## 治理（迭代 4）

- **证据**：`notes/evidence/**` 不与功能同 commit；摘要链台账，实页 JSON 单独提交。
- **superseded**：`notes/plan-data-space-i4-input-parameters.md` 已删除（内容 superseded，见 I4 台账）。

## 待审核

- 状态 **implementing**；矩阵 6 页 Vue 与 DataSet 单链已齐；**I5 持续迭代 II（2026-10-21）**：`resolveDatabaseCatalogScenarioTiered`（五表→单表同 rowid）、`catalogFormalTier` / `catalogHubCatalogBlocked`、Hub `KeepAlive`、resolve 候选数/misbound 诊断；`tests/runtime/page/database` **39** + typecheck + verify 绿（13:44 复验）。
- **实页/blocker**：五表元数据未齐时 hub **serverOnly** 下服务器 Tab 可装配、表和视图 blocked（非双 FormKey）；全绿仍待 operatorActions（gap JSON）；实页取证 `live-pilot-browser-20261021-tier.json`（未登录）。
