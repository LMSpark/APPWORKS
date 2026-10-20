状态：draft

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
2. **API 层**：`packages/spark-lowcode-api` 新增 `database-management/service`（或等价路径）— **仅** 封装 PageRuntime/DataSet/DataView 装配与 `saveChanges`；连接测试若不在 DataView 合同内，单独登记服务缺口，不伪造成功。
3. **页面**：`src/views/features/data-platform/database-management/ui/service-management-page.vue`（+ 必要 props/composables 子目录）；布局对照参考 1:1，控件 spark-component；**DataSet 为读写唯一通道**。
4. **导航**：`vue-pages.json` 仅改 `service-management-page` 的 `source`；`/dbms`、table-and-view 仍 DBMS。
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
- **列表读取**：`getDatabaseCatalog` 的 **servers** 切片 + 现有 FormKey 解析（与 DBMS 读链一致）；保存后同链回读验收。
- **UI**：参考布局与文案 **1:1**，交互控件用 **spark-component** 等价实现。
- **治理**：新页写操作仅经 **spark-data**；**DBMS.vue 内 mutation 仍 blocked**，直至后续 table-and-view 迁移时一并替换。
- **场景身份**：**FormKey 即 dataSpace/scenarioId**；PageRuntime/DataSet 以当前导航/宿主传入的 FormKey 绑定，不另造第二身份。

## 待审核

- 状态 **draft** → 你回复「通过/开工」后改为 **approved** 再编码。
- 实施前补充研读：FormKey 场景下 `Base_serverInfo` 的 DataTable/DataView 是否已有 pagedata 或须新建（记入 `notes/research-database-management-i5.md`）。
