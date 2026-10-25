# I5 database-management 研读（2026-10-20）

> **历史错误方案，已 superseded**：本文中的 Hub 组合入口、候选身份恢复、服务器前置与五模型档位判断已被当前 B2 核验替代。正文和历史证据保留，但不得作为当前实施依据；当前入口、合同、断点与后续范围只读 `notes/data-space-retirement-ledger.md` 的“2026-10-25 B2 数据库目录依赖与关系编辑续核”及其后续更新。

## 任务来源

`notes/plan-appworks-integration.md` I5：阶段 2 矩阵 6 行通过；删除 `src/views/app/DBMS.vue` 包装，页面落点 `src/views/features/data-platform/database-management/**`。

## 本仓现状

| 入口 | `config/navigation/vue-pages.json` → `source`（2026-10-21） |
| --- | --- |
| `/dbms`、`/DataBaseManage/.../index` | `database-management-hub.vue` |
| hidden 服务器 / 表和视图 | 各 feature 页；hub 内 inject 单身份 + tiered resolve |

`DBMS.vue` 已删除；目录见 `src/views/features/data-platform/database-management/**` 与 `notes/research-database-catalog-dataset-identity.md`。

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

## pagedata / DataSet 合同研读（2026-10-20 补全）

### 0. spark-data 替代业务层 data owner（2026-10-20）

| 概念 | 约定 |
| --- | --- |
| **query/save owner** | 仅在 **装配时** 由 `LowcodeDataSpaceAssembler` + `DataSpaceRuntimeApi.bindModelView` 绑定到 **DataView**；业务代码不可另建 Catalog/Coordinator 充当 owner |
| **组件 ↔ 数据** | 只经 **DataView**（`dataViewKey`、字段子组件、工具栏 `refresh`） |
| **提交** | **DataSet.saveChanges**；编排函数（如 `database-server-view-ops`）只调用 `DataView`/`DataSet` 公开 API |
| **禁止** | 页面 `lowcodeHttp`/`LowcodeApi.catalog` 读写在册业务目录；`getDatabaseCatalog` 仅允许在 **FormKey 解析**（`database-catalog-scenario`）中探测 `sourceDataSpaces`，不得驱动 UI 列表/CRUD |

### 1. 身份链（用户已确认）

| 概念 | I5 服务器管理约定 |
| --- | --- |
| **FormKey** | HTTP 头 `x-FormKey` / 后端查询上下文 |
| **dataSpaceId / scenarioId** | 与 FormKey **同一字符串**；即正式 **Base_DataSet.rowid**（DataSet 身份），**不是**导航 `nodeId` |
| **页面绑定** | 导航 `blueprintScenarioId` 须为上述 DataSet ID；解析后以 `DataSet.scenarioId` 写 `buildDataViewKey(model, view, scenarioId)` |
| **读写通道** | **spark-data 为唯一后端桥梁**；**DataView 是标准组件与数据的交互层**（`dataViewKey` 定位视图，字段子组件在视图上下文读写）；**DataSet** 组织模型、关系、级联与 `saveChanges`。页面/协调器不 `lowcodeHttp`、不借 `_sharedHttpClient` 旁路。`LowcodeCatalogApi` 仅 DBMS 只读聚合，不能作为业务页第二链。 |

黑盒记录（`notes/test-project-blueprint-black-box.md`）：数据库目录路由已从后端授权保留 **FormKey**；`Base_serverInfo` 等模型在 lowcode「可用模型」投影上可能不完整，但 **GetBaseData 仍可按表名读到目录行**（与可见模型列表不完全等价）。

### 2. 本仓两条「读目录」路径对比

| 路径 | 入口 | 请求 | 写 |
| --- | --- | --- | --- |
| **A. LowcodeCatalogApi** | `DBMS.vue` | 对每表 `POST /api/DataOperation/GetBaseData` + `catalogQuery` + `x-FormKey` | 无 |
| **B. spark-data DataSet** | 字典/数据空间列表等 | `DataSpaceRuntimeApi` 查询 + 视图 `saveChanges` → `BatchTableOperateRequestByCRUD` | 有（经 DataView 编辑态） |

I5 service-management **必须走 B**。A 仅可作对照或 DBMS 只读聚合，不能与新页 CRUD 混用。

`loadLowcodeRuntimeScenario(scenarioId)`（`lowcode-data-space-runtime.ts`）要求 **`scenarioViews.readText(scenarioId)`** 有场景 JSON；缺失则 `SCENARIO_VIEW_FILE_MISSING`。字典目录 **不**走该路径，见下节。

### 3. 推荐装配模式：动态 ScenarioViewConfig（字典 `LowcodeDictionary.loadCatalog`）

[`LowcodeDictionary.loadCatalog`](src/lowcode/resources/dictionary/lowcode-dictionary.ts) 模式（**无** `config/pages/.../pagedata.json` 存导航场景）：

1. `blueprintScenarioId` = 导航绑定的 dataSpaceId（FormKey）。
2. `readSpaceDefinition({ designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId })` + 对每个 `metaName` 调 `readModel`。
3. 内存构造 `ScenarioViewConfig(scenarioId, JSON.stringify({ tables, resourceRelations: [], viewCascades: [] }))`。
4. `LowcodeDataSpaceAssembler` + `lowcodeApi.dataSpace.runtime` → **DataSet**。
5. 页面 `PageRuntime` + `RendererTable` 绑定 `buildDataViewKey('_Base_DictType', 'default', scenarioId)`。

**I5 服务器管理首屏建议复用同一模式**（命名如 `LowcodeDatabaseService.loadCatalog(scenarioId)`）：

- 至少装配 **`Base_serverInfo`** 一张表、`default` 视图（后续 table-and-view 再扩展 `_base_dbInfo`、`_Base_TblList` 等）。
- `designScenarioId` 仍用 `DATA_SPACE_DESIGN_FORM_KEY` 读正式模型定义；**运行查询身份**用导航 FormKey。

**静态 pagedata 文件**（`config/pages/data-platform/database-management/pagedata.json`）仅在「固定 editor 场景 ID、与导航 FormKey 解耦」时需要；字典 **条目编辑** 用 `data-dictionary/pagedata.json`，**目录** 不用。服务器页若始终「一导航节点一 FormKey」，**首屏不必**新建 pagedata 文件；若后续有独立「数据库设计工具场景」，再按资源专题拆设计/维护。

### 4. `Base_serverInfo` 模型与字段合同

**LowcodeCatalogApi 读字段**（已落地、有 vitest 夹具）：

`rowid`, `Type`, `ServerName`, `ip_address`, `Port`, `description`

**DBMS 注册表单/UI 额外字段**（当前仅 UI，提交 blocked）：

`UserName`, `Password`, `Port`（数值）、`isolationMode` 等；连接测试 POST `/api/Db/testConnection` 使用 `Type/ServerName/ip_address/UserName/Password/Port`。

| 项 | 状态 |
| --- | --- |
| 列表/编辑 CRUD 字段集 | 须对照参考 `ServiceManager.ts` + 正式 `readModel('Base_serverInfo')` columns **逐字段**定稿；不能假设 catalog 六字段即完整写模型 |
| 密码 | 目录读链不含密码；测试连接与保存是否分通道须在实施前用夹具/在线核 |
| 连接测试 | **非** 行持久化；须作为 **绑定 DataView 的正式命令**（与查询/编辑同一交互层），不能页面直调 `/api/Db` 或 catalog 借 DataSet HTTP 旁路；**当前缺口**，参考页按钮待 spark-data 合同后再启用 |

### 5. 导航与 FormKey 来源

- `vue-pages.json` 只声明 **path → Vue 文件**；**不**含 scenarioId。
- **`blueprintScenarioId`** 来自运行蓝图导航节点（`system-page-identity-resolver` 写入 `route.meta`）。
- 字典页：无 scenarioId 则报错「字典管理入口缺少导航绑定的数据空间ID」。
- DBMS：**不**用 route.meta；自行 `blueprint.readRecords` + 标题集合 **合并多个** scenarioId 再 `getDatabaseCatalog(formKeys)`。

**service-management-page 首屏**：应像字典一样依赖 **单节点 blueprintScenarioId**（= FormKey），**不要**复制 DBMS 多 FormKey 合并；多源合并留给 `/dbms` 直至下线。

实施前检查：目标项目蓝图里「服务器管理」hidden 节点是否已绑 **dataSpace.scenarioId**（与黑盒「数据库管理可读」同一类配置）。

### 6. 与 `getDatabaseCatalog` 的关系

- 新页 **列表/CRUD**：`DataView('Base_serverInfo','default')` + `saveChanges`。
- `getDatabaseCatalog`：可继续给 DBMS 聚合五表；**不要求**新页调用后再手拆 servers。
- 验收：同一 FormKey 下，catalog.servers 与 DataView 行集在 **相同过滤/权限** 下应一致；若不一致，记 **合同差距** 而非前端 merge 算法。

### 7. 实施前核对清单（编码门禁）

- [ ] 目标环境导航节点 **blueprintScenarioId** 非空且可读 `Base_serverInfo`。
- [ ] `readModel({ metaName: 'Base_serverInfo' })` 返回模型 id/字段与参考保存字段一致（或登记缺口）。
- [ ] vitest：DataSet 装配 → 查询 → 编辑 → `saveChanges` → 回读（HTTP 夹具仿 `data-space-runtime-api.test` / catalog 夹具 FormKey 头）。
- [ ] 连接测试：后端合同 + 是否允许非 DataView 门面（用户：DataSet 唯一通道 **指持久化 CRUD**，连接测试单独登记）。
- [ ] P1b：`hasUnconfirmedSave` / 核验顺序若涉及服务器表，与数据空间设计页同链。

### 7b. 注册服务器是后端业务命令（2026-10-21 核对）

- **参考仓**：`ServiceManager.ts` 新增走 `registerServer` → `POST /Db/registerServer`（`SPARK_BUILTIN_META.serverRegister`），入参 Type/ServerName/ip_address/Port/UserName/Password/description，`entID` 可选且页面不传；编辑走 `Base_serverInfo` update（不含密码），删除走 remove。
- **后端源码（`E:\lowcode-jdk17\...\DbInfoController.java:103`，仅参考）**：先测连接；连接重复拒绝；未传 rowid 后端生成；企业所有者由登录上下文写入；密码按字段加密规则持久化，响应清空密码。
- **本仓现状**：注册直接 `Base_serverInfo` CRUD Added，实页回执 200 但回读不见（无 entID），且无法录入密码。语义错误，须改为命令。
- **能力缺口**：spark-data 仅有 `bindDataSetReadonlyCommandQuery`（只读命令视图）；写命令（输入行 → 提交 → 回执 → 刷新目标视图）尚无公共能力，用只读命令承载写入会使刷新重复注册，禁止。

### 7b. 注册服务器是后端业务命令（2026-10-21 核对）

- **参考仓**：`ServiceManager.ts` 新增走 `registerServer` → `POST /Db/registerServer`（`SPARK_BUILTIN_META.serverRegister`），入参 Type/ServerName/ip_address/Port/UserName/Password/description，`entID` 可选且页面不传；编辑走 `Base_serverInfo` update（不含密码），删除走 remove。
- **后端源码（`E:\lowcode-jdk17\...\DbInfoController.java:103`，仅参考）**：先测连接；连接重复拒绝；未传 rowid 后端生成；企业所有者由登录上下文写入；密码按字段加密规则持久化，响应清空密码。
- **本仓现状**：注册直接 `Base_serverInfo` CRUD Added，实页回执 200 但回读不见（无 entID），且无法录入密码。语义错误，须改为命令。
- **能力缺口**：spark-data 仅有 `bindDataSetReadonlyCommandQuery`（只读命令视图）；写命令（输入行 → 提交 → 回执 → 刷新目标视图）尚无公共能力，用只读命令承载写入会使刷新重复注册，禁止。

### 8. 仍待参考仓/在线补证（不阻塞写研读）

- 参考 `ServiceManager.ts` 各操作对应 HTTP 与字段映射（inventory 仅有路径，无源码在本仓）。
- `isolationMode` 等业务字段是否存 `Base_serverInfo` 或扩展表。
- 运行环境删除服务器是否软删/级联（D5 范围，首屏 CRUD 验收须按实际回执）。

---

## 历史待核实项（部分已由首屏决策关闭）

- ~~I5 首屏范围~~ → **service-management 参考 1:1 + spark-data**（见 `notes/plan-database-management-i5.md`）。
- 参考 table-and-view 与 catalog 五表是否同后端：catalog 已证明五表同 FormKey GetBaseData；table-and-view 写路径仍待 D5。
