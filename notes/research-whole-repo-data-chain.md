# 全仓数据链研读（2026-10-31）

产品代码基线 `67788ae93`，外加本轮修复的 `catalogScenarioText` 签名。本文件是赋能层研读记录，不是产品事实源；每条都给 `路径:行号`。长期队列只在[唯一台账](data-space-retirement-ledger.md)维护，本文件不另起计划。

范围：`packages/spark-data`、`spark-project-model`、`spark-lowcode-api`、`spark-component`，以及 `src/lowcode`、`src/services`、`src/registries`、`src/composables`、`src/views`。数据平台页面的断链表已在台账，本文件只补它没覆盖的部分并纠正两条裁决。

## 1. 主链（已核实）

读取：`DataSet.fromJson` → `DataTable.fromJson` → `DataView`，`DataView.refresh()` → `reloadQuery` → `requestData` → `loadFromServer`（`packages/spark-data/src/data-view.ts:2111-2121`、`:1937-1942`）。有查询 owner 时走 `#queryExecutor.executeQuery`，否则退到 `crudDelegate.list`。

正式数据空间分支：`DataSpaceRuntimeApi.bindModelView` 绑定 executor，`executeQuery` 映射字段与过滤，经 `data-space-query-cache.ts` → `data-space-query-resource.ts` → `data-space-request.ts` 发出 GetData。

保存：`DataView` 编辑跟踪 → `DataSet.saveChanges`（`dataset.ts:1461-1466`）→ `DataView.saveChanges`（`data-view.ts:2932-2942`）→ `DataView.saveQueryViews` → `executor.save`（`:3007-3021`，缺 owner 抛 `DATA_VIEW_SAVE_OWNER`）→ `DataSpaceRuntimeApi.save`（`data-space-runtime-api.ts:367-391`）。文件与 pagedata 的存储适配都在 executor 内部：`spark-data/src/query/file-resource-adapter.ts`、`spark-project-model/src/scenario/scenario-view-data.ts`、`scenario-definition-resource.ts`。

**结论：主链成立，存储适配在 executor 内部，不构成业务层第二入口。**

## 2. 仍能绕过 `DataSet.saveChanges` 的写入口

| 入口 | 证据 | 影响面 | 裁决 | 删除条件 |
| --- | --- | --- | --- | --- |
| `commitMode: 'immediate'` 的即时写 | `spark-data/src/data-view.ts` 约 2695-2889，`addRow` / `editRowById` / `removeRow` 在配置了 CrudApi 且无查询 owner 时直接调 `crudDelegate` | 同一视图可以不经 `saveChanges` 落库，未确认结果与变更比较都绕开 | 逐个核 `src/` 里是否真有消费者；无消费者则收窄该分支 | 正式业务视图不再使用该模式，或该模式只保留在已登记的非业务来源 |
| 批量与导入 | `spark-data/src/strategies/crud/crud-delegate.ts` 的 `batchCreateRecords` / `batchUpdateRecords` / `batchDeleteRecords`、约 396 行 `importData` | 批量写不走变更捕获和回执核验 | 同上 | 同上 |

两条都是包内能力，不等于当前有页面在用。先核消费者再决定收窄，不先改包。

## 3. 前端角色模型（本轮新发现，违反 AGENTS 0.3）

| 证据 | 影响面 | 裁决 | 删除条件 |
| --- | --- | --- | --- |
| `src/lowcode/lowcode-runtime.ts:35` 声明 `roles: readonly string[]`；`:85` 从 `session.identity.role` 映射；`:102-103` `isLowcodePlatformAdministrator` 判断 `'SUPER_ADMIN'` | 前端存在角色类型和管理员判断，与「前端只有数据权限，没有角色概念」直接冲突 | 删除角色字段、映射和管理员判断。登录身份保留，权限继续由正式查询返回的数据权限承接 | 全仓无 `roles` / `SUPER_ADMIN`；登录与应用切换行为不变 |

全仓 grep `isLowcodePlatformAdministrator` 与 `SUPER_ADMIN` 只命中这处定义，**没有调用方**，所以是零消费者的死代码，可独立删除。

`src/views/platform/LoginView.vue`、`PlatformTenantManagement.vue` 里的「管理员」是注册表单字段文案，`database/catalog/relation/form-ops.ts:20` 的 `currentRole` 是主子表语义，`services/ai/ai-turn-bridge.ts:151` 的 `message.role` 是协议字段，`role=` 属性是无障碍标记。这些都不是前端 RBAC，不在删除范围。

## 4. 配置未正式化：数据库族（本轮新发现）

台账原先只登记了 `structured-config/catalog.ts`。数据库族同样在代码里拼场景，且**没有任何 config 文件**：

| 证据 | 影响面 | 裁决 | 删除条件 |
| --- | --- | --- | --- |
| `src/lowcode/resources/database/directory.ts:85-99` 内联 `tables` | 改目录查询配置必须改源码 | 改由正式 pagedata 承接 | 不再内联 `tables`，改配置后不改 host 即生效 |
| `src/lowcode/resources/database/server/resource.ts:37-54` 内联 `tables` 与视图默认值 | 同上 | 同上 | 同上 |
| `src/lowcode/resources/database/catalog/table-view.ts:177` 起大段内联多视图 | 同上 | 同上 | 同上 |

数据库族的 HTTP 在 executor 内部（`dataset-extensions.ts` 的 `/api/Db|Table|View`、`catalog/table/preview-view-ops.ts:170-173` 的 `/api/DataOperation/GetData`），属于合规位置，不在本行。

`structured-config/catalog.ts:35-55` 仍为编码、逻辑视图、工作流、JSON、Excel、PDF 六个专题拼场景；字典已改读 `config/pages/data-platform/data-dictionary/catalog-views.json`。

## 5. 标准组件数据合同缺口

| 组件 | 证据 | 影响面 | 裁决 | 删除条件 |
| --- | --- | --- | --- | --- |
| `FieldCheckTag` | `FieldCheckTag.props.ts:12` 只有 `checked`；`FieldCheckTag.vue:44-55` 用 `useSparkPageComponent` 加本地 `checked` ref | 无视图定位、无字段权限、无编辑覆盖 | 接入与其它 choice 字段相同的 `SparkFieldSemanticProps` 与 `useFieldPermission` 链 | 本地 `checked` ref 删除，读写取消和权限用例通过 |
| `FieldMention` | `FieldMention.vue:189-195` 直接 `row[props.field] = value`；`:202-208` 直接写 writeback 字段 | 绕开 `writeDataViewEditingValue`，权限与编辑覆盖失效 | 主值与 writeback 都走统一写入 | 不再直接赋值 row 字段 |
| picker 预设 | `createPickerPreset.ts:40-82` 的共享 props 只转发 `field`、`optionDataViewKey`、`options`，没有 `dataViewKey` / `dataMember` / `dataField` | 页面无法按配置为预设 picker 指定值所属视图 | 补齐三项转发 | 预设能按完整键定位值视图并通过绑定切换用例 |
| `DisplayPagination` | `DisplayPagination.props.ts:10-28` 无视图键；`DisplayPagination.vue:52-57` 只 inject `DATA_SOURCE`；`:68-74` 只 emit 页码 | 分页要页面自行接线，不由公共链承接 | 补视图键并由组件消费 `DataView` 分页 | 页面不再手工接分页 |

绝大多数字段与容器组件已经消费绑定：字段经 `useActiveFieldRow.ts:42-46` 解析显式键、`useFieldPermission.ts:214-216` 写回；容器经 `useContainerDataSource`；布局经 `layout-data-context.ts:37-38`。静态 `options` 是有正式声明的旁路（`shared-types.ts:592-594,601`），与无绑定不同，单独登记。

`RendererCard`、`RendererCollapse`、`RendererSteps`、`RendererEditor` 及 `create-passthrough.ts:54-57` 的透传布局没有声明数据上下文，只靠祖先 inject。按 AGENTS 0.4「布局组件同样须支持标准数据上下文」，这是实现差距，不是例外。

## 6. `src/views/app` 的页面级旁路

| 页面 | 证据 | 影响面 | 裁决 |
| --- | --- | --- | --- |
| `Settings.vue` | `:223-233` 页面 `settings` ref + `:24-71` 原生 el 控件；无 PageRuntime | 整页不走 DataView | 按业务语义确认哪些是真业务数据，再接正式视图 |
| `CacheManager.vue` | `:193-241` 读 `localStorage`；`:278-281` 调 `lowcodeApi.platform.getCacheStats()` | 后端缓存统计不经 DataView | 同上；前端本地缓存不是业务数据，分开裁决 |
| `AppProjectSettingsDialog.vue` | `:75-77,98-101` `snapshot` + `form`；`:18-27` 原生控件；经 `services/project/project-settings.ts:104-119` 读写 | 编辑不计入 DataView dirty | 接正式视图；保存动作当前已被拒绝，不扩写 |
| `WorkflowDesigns.vue` | `:1892-1995` 一批 `*Text` / `editorDirty` ref；`:3583-3605` 从解析文档回填 ref；`:420-503` 原生 `el-input` | 图与属性编辑可与 design DataView 分叉 | 目录与保存已走 owner DataView（`:2344-2355`、`:2296-2312`），属性编辑改绑同一视图 |
| `demo/*` | `CustomRTableDemo.vue:84-107`、`RFormCompareDemo.vue:151-171` 用 `SparkData.createDataSet` 内联表；`Dashboard.vue:148-164`、`CapabilityDemo.vue:231-246` 纯 ref | 演示页不代表业务链 | 登记为演示，不按业务页验收；`CapabilityDemo.vue:232` 的 `roles` 是模拟载荷，不是权限判断 |

已合规的样板：`AppList.vue:137-163` PageRuntime 加 `dataViewKey`、`DevFileEditor.vue:38-56` 文件 DataView 加 `FieldJson`、`ProjectBlueprintTree.vue:15-32` 树绑定。

`useDevState.ts:847-854` 的 `blueprintDraft` 代理与 `:1093-1100` 的 `JSON.stringify({...JSON.parse(text), tables})` 属于开发工作台的设计态；与业务页的并行状态分开裁决，先核它写回的定义视图身份。

## 7. 平台与实时通道（边界，非业务数据）

`src/views/platform/LoginView.vue:222,262,319,330,347,385,400,405` 调 `lowcodeApi.platform` 的登录、租户与验证码；`PlatformTenantManagement.vue:175-176`、`TenantConfigPanel.vue:263-267` 读租户信息；`services/sse-events.ts:250-274` 与 `composables/useNotifications.ts:128,147` 是实时与离线消息；`services/ai/ai-turn-bridge.ts:121,174` 是 AI 轮次。

这些不是业务数据读写，登记为**已声明边界**，不计入 SPARK data 唯一通道的断链。真要改需要先有产品裁决，本轮不排队。

## 8. 聚合：后端通过值函数承接（纠正台账裁决）

用户 2026-10-31 明确：后端通过值函数支持聚合。源码核实一致：

- `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-aggregation.ts:14` 映射 `Sum/Count/Avg/Min/Max` 到 `SUM/COUNT/AVERAGE/MIN/MAX`；`:39-54` 把视图声明或已解析值函数规范为 `{Type: 'GetGroupData', ValType}`，只允许本字段，不接受跨表引用或任意表达式。
- `data-space-runtime-api.ts:277-282` 在请求字段位置带上 `valueFun` 与 `group`；`:286-299` 处理显式视图分组整组覆盖；`:311-319` 要求参与聚合的查询里每个字段都分组或配聚合，否则抛 `SPARK_QUERY_AGGREGATE`。

因此台账原「子表汇总仍在前端」描述过宽。实际状态：

- **前端守卫已存在。** `computed-column-delegate.ts:104-120` 对 `supportsLocalAggregates === false` 抛 `DATA_VIEW_REMOTE_COMPUTED_AGGREGATE`；`data-view.ts:1370-1386` 抛 `DATA_VIEW_REMOTE_AGGREGATE`。`DataSpaceRuntimeApi.localAggregates = false`、文件 executor 同样为 false，所以正式来源上本地汇总已经停掉。
- **本地 reduce 只对允许本地汇总的来源生效**，即静态/数组 owner（`computed-column-delegate.ts:212-213`）。
- **剩余工作**是把存量聚合配置迁到消费视图的查询配置（字段级 `valueFun` + `group`），不是拆一条活旁路。按 AGENTS 0.4，不为某个视图统计而永久改写共享列表模型的 `ValueFun`。
- **真实缺口很窄**：`$list` / `$join` 没有后端对应函数；`引用` 与 `计算字段` 类型被 `data-space-query-aggregation.ts:41` 明确拒绝；请求级聚合只对 `database-table` / `database-view`、非树、`Table` / `Join` 输出成立（`data-space-runtime-api.ts:304`）；任意 JS 公式不猜测转换。

## 9. 序列化对称与形状门禁

`DataViewFilter` 有 `toJSON()`（`query/filter/data-view-filter.ts:177`）和 `parse()`（`:153`），没有 `fromJson`；`ScenarioViewConfig` 有 `toJSON()`（`scenario/scenario-view-config.ts:183`）但只能由构造函数接 JSON（`:82-84`）。这两条正是 `verify:rules` 长期保留的 2 条 warning。`SparkNodeTree` 用 `toJSON` / `static fromJson`（`node-tree/spark-node-tree.ts:534,456`），命名与仓内 `toJson` 约定不一致。

三个核心包与 `spark-component` 都没有超过单目录 10 文件或单层 7 子目录的硬门禁违反。`spark-component` 存在若干父子组件同目录的配对文件（`RendererTabs/`、`RendererAnchor/`、`FieldJson/` 等），按 2.5 节属于待收敛项，不是硬门禁失败。

三个核心包的 `src` 下没有 `export interface`；跨模块合同用 `export type`（如 `types.ts:1294` 的 `DataSetContract`），符合 2.2 节立场。

## 10. 本轮门禁

日志在 [`evidence/whole-repo-chain-audit-20261031/`](evidence/whole-repo-chain-audit-20261031/)。

- `typecheck` 退出 0（149 秒）；签名改动后重跑仍为 0。
- `lint` 退出 0（262 秒）。
- `verify:rules` 首跑**退出 1**：`verify:ai-codegen` 报 `src/lowcode/resources/structured-config/dictionary/resource.ts:40` 的 `catalogScenarioText` 有 4 个位置参数，超过限制 3。这是 `9ab5ebbfd` 带入的真实回归；上一轮审计的门禁跑在该提交之前，所以没拦住。改为具名入参对象 `CatalogScenarioTextInput` 后重跑退出 0（102 秒），仍是原有 2 warning / 1 info（`verify:ai-model` 的 DataViewFilter、ScenarioViewConfig 缺 fromJson，加 `dataset.ts:390` 一条 info）。
- 全量 `test:run` 退出 1：**7118 通过 / 4 失败**，377 个文件中 3 个失败，总时长 928 秒。4 条失败全部是 `Test timed out in 15000ms`，没有断言失败：`data-space-view-parameter-input.test.ts` 1 条、`data-space-chain.test.ts` 2 条、`data-space-field-batch.test.ts` 1 条。单独重跑这三个文件 **43/43 通过，31 秒**，判定为并发超时，不记回归。
- 字典专题测试在签名改动后 **83/83 通过**。
- `build` 退出 0。

**教训：改了产品源码就要跑 `verify:rules`，不能按「这轮没改合同」跳过。**
