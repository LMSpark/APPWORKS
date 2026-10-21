# 数据库目录与 DataSet 身份（2026-10-21）

## 语义合同

`dataSpaceId` = 正式 **Base_DataSet.rowid** = 运行 **DataSet.scenarioId** = HTTP **x-FormKey**。不是导航 `nodeId`，不是 `__sparkNavigationId`。

## 遇错分析顺序

1. **用例**：入口 URL、`__sparkNavigationId`、要读的模型注册名（五表目录见 `lowcode-database-table-view`）。
2. **DataSet 树**：一个运行 DataSet → 多 DataTable → 命名 DataView + viewCascades；页面只绑 `dataViewKey`。
3. **身份核对**：
   - `blueprintScenarioId === nodeId` → 蓝图误绑，降权或改蓝图。
   - `readModelBatch` 失败但 GetBaseData 有行 → 正式模型未在同一 rowid 登记。
4. **读/写链**：仅 DataView.refresh / saveChanges；`getDatabaseCatalog` 只参与 **FormKey 解析**，不驱动 UI。

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
