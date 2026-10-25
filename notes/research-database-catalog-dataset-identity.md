# 数据库目录与 DataSet 身份（2026-10-21）

> **历史错误研读，已被当前合同替代**：以下关于 `blueprintScenarioId === nodeId` 即误绑/降权、候选空间探测、Hub tiered resolve 与五表档位的判断已证伪，不得作为当前产品事实或实施依据。历史正文与原证据保留；当前唯一依据为 `notes/data-space-retirement-ledger.md` 的“2026-10-25 B2 数据库目录依赖与关系编辑续核”及其后续更新。

## 语义合同

`dataSpaceId` = 正式 **Base_DataSet.rowid** = 运行 **DataSet.scenarioId** = HTTP **x-FormKey**。不是导航 `nodeId`，不是 `__sparkNavigationId`。

## 遇错分析顺序

1. **用例**：入口 URL、`__sparkNavigationId`、要读的模型注册名（五表目录见 `lowcode-database-table-view`）。
2. **DataSet 树**：一个运行 DataSet → 多 DataTable → 命名 DataView + viewCascades；页面只绑 `dataViewKey`。
3. **身份核对**：
   - `blueprintScenarioId === nodeId` → 蓝图误绑，降权或改蓝图。
   - `readModelBatch` 失败但 GetBaseData 有行 → 正式模型未在同一 rowid 登记。
4. **读/写链**：仅 DataView.refresh / saveChanges；`getDatabaseCatalog` 只参与 **FormKey 解析**，不驱动 UI。

## 本地 dev 路由（实页前置）

| 状态 | 行为 |
|------|------|
| **未登录** | 动态路由仅来自 `buildPreAuthNavTree()`（`scope: public`）。直链 `/t/{tenant}/{appId}/DataBaseManage/DataBaseManage/index` 常出现 Vue Router **No match**，并重定向平台首页 `/`；**不是 hub 组件缺陷**。 |
| **已登录** | 路由由 `readLowcodeRuntimeNavigation()` 蓝图 + 授权装配。元数据应用入口：`/t/{tenant}/{appId}/DataBaseManage/DataBaseManage/index`（hidden，`vue-pages.json` → hub）；壳侧快捷 **`/t/{tenant}/{appId}/dbms`** 与 hub 同组件（`withShellSystemTools` 注入 SPARK 工具，且不与蓝图同 path 重复）。 |
| **hidden 子页** | `service-management-page`、`table-and-view-page` 路径见 `config/navigation/vue-pages.json`；FormKey 仍须 hub inject 的 `resolvedScenarioId`。 |

登录页：`/login`。取证顺序：登录 → 进入元数据管理应用 → 打开 hub 或 `/dbms` → 记录 Network 中 **x-FormKey** 与 hub 解析文案（serverOnly / full）。

## 实页取证模板（元数据管理 D99A…）

| 导航项 | nodeId | blueprintScenarioId | 是否 nodeId=scenario | readModelBatch(五表) | DataView 列表 |
|--------|--------|---------------------|----------------------|----------------------|---------------|
| 服务器管理 | | | | Base_serverInfo only | |
| 表和视图管理 | | | | 五表 | |
| 数据库管理 hub | | | | | |
| 蓝图「结构化配置」等 | 来自 readRecords | dataSpace.scenarioId | | | |

2026-10-20 实页：`A8FB2B2B…` 与 nodeId 相同 → 非 DataSet rowid；解析后仍可能「正式模型集合不完整」→ 元数据层缺口。Hub **serverOnly** 时同一 rowid 仍可进服务器 Tab；表和视图 Tab blocked（见 `catalogFormalTier`）。

## Hub 单身份

[`database-management-hub.vue`](../src/views/features/data-platform/database-management/ui/database-management-hub.vue) 通过 `database-catalog-context` 一次 **tiered** 解析（五表→同 rowid 单表）并提供 `resolvedScenarioId` / `catalogFormalTier`；子页 inject 优先于 `useRoute()`。**Hub 解析完成前**子页不用 `preferred`（`catalogAwaitingHubResolve`）；`serverOnly` 时表和视图 `catalogHubCatalogBlocked`，服务器 Tab 仍走单表 loadCatalog。

## 整合流水线

`resolveDatabaseCatalogScenarioId` → `readSpaceDefinition` + `readModel*` → `ScenarioViewConfig` → `LowcodeDataSpaceAssembler` → `PageRuntime` + `buildDataViewKey(..., dataSet.scenarioId)`。

参考：[`LowcodeDictionary.loadCatalog`](../src/lowcode/resources/dictionary/lowcode-dictionary.ts)、[`notes/research-database-management-i5.md`](research-database-management-i5.md) § pagedata/DataSet。
