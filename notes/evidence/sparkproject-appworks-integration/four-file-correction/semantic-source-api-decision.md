# 数据空间六来源读取 API 裁定依据

日期：2026-10-08。范围仅回答六来源候选与初始字段读取的目标现状、运行模型/权限依赖及四文件可达性。依据当前目标工作树、固定参考提交 `842dec4f11b333df904b9a4e26b6566b0802bab8` 与已完成语义报告；未运行测试或浏览器。

## 结论

- 当前目标已有公开数据库目录 API **仅覆盖数据库表、数据库视图和 `Base_TblField` 字段目录**：`LowcodeApi.catalog.getDatabaseCatalog(formKeys)` 获取目录，`resolveDatabaseResource(catalog, selector)` 解析唯一表/视图及其字段。
- `DataSpaceDesignApi.read/readModel/readModels` 是正式设计模型/关系读取及已有模型来源解析，不是六类 source candidate API。它内部私有调用 catalog，但只把已存在模型映射成 `resources`；资源解析明确拒绝 table/view 以外类型。正式表模型读取另核数据库源唯一有效主键。
- 当前代码没有目标 API 查询 `_Base_DictType`、`Base_DataServiceInterface`、`Base_JsonData`、`Base_DataViewList`、`_Base_ParamList` 或为字典/JSON 生成原设计静态字段种子的读取链。
- 四文件脚本目前**不能通过现有页面宿主直接调用** `lowcodeApi.catalog` 或 `DataSpaceDesignApi`。`ScriptContext.$page` 只暴露 UI 服务、当前页 `getDataSet/resolveView` 与布局读取；`PageRuntimeServicesCapability` 没有 source/catalog 方法，当前 `pagedata.json` 仅绑定正式设计表。
- 建议整页接入使用一个数据空间专用、只读 source reader 宿主边界：表/视图复用现有 catalog；其余四类依原 source query 字段逐类承接。需主控裁定正式查询/权限载体后再补最窄桥接，不另建通用 catalog 框架，不将正式模型写入放进 reader。

## 六来源对照

| 来源 | 原候选与字段读取（固定提交） | 当前目标真实 API/能力 | 主键、查询权限与四文件可达性 |
|---|---|---|---|
| 数据库表 `table` | `sourceTableMap.table` → `View_TblList`；字段 `Base_TblField(tblid=source rowid)`。`readSourcePage(type, SourceQueryParams)` 输出 `{list,total,label}`；`buildInitialFields` 通用字段投影。 | `LowcodeApi.catalog.getDatabaseCatalog(dataSpaceIds)` 返回 `tables` 与 `fields`；`resolveDatabaseResource({databaseId,resourceName,resourceType:'table'})` 返回资源字段。 | 列目录/读字段不要求已有运行模型主键；读 API 用 `x-FormKey`，但不返回 DataView/queryContext 的字段权限快照，不能据此宣称原查询权限已等价消费。正式现有模型 `readModel` 要表来源唯一非租户主键证据。脚本不可直接访问 catalog。 |
| 数据库视图 `databaseView` | `View_ViewList`；字段仍以 `Base_TblField(tblid=source rowid)` 读取。候选/字段与表是不同表及身份。 | 同 `getDatabaseCatalog` 的 `views` 与 `fields`；`resolveDatabaseResource(...resourceType:'view')` 独立筛视图。 | 候选字段读取无需既有模型主键；目标 catalog 无 `DataView` 权限上下文，需核 formKey 服务端授权合同。作为正式模型消费时还须有唯一有效模型主键映射；不能由视图 rowid 推断业务主键。无现有脚本 host 调用。 |
| 字典 `dict` | `_Base_DictType`，映射 `TypeName/functiondesc`；候选按页读。字段不读 `Base_TblField`，由固定 `rowid/val/txt/ordIdx` 种子生成。 | 未发现目标源 candidate/read/seed API。`DataSpaceDesignApi.read` 不支持该资源类型稳定目录映射。 | 候选与静态字段构造都不需已建数据模型主键；source rows 原来走 design scenario 的 Spark query owner，目标无同等可调用页面入口。读权限回执/字段权限仍需核原查询响应。 |
| 接口 `interface` | `Base_DataServiceInterface`，候选 `Name/Desc/ProviderID`；源字段 `Base_TblField`，绑定入参 `_Base_ParamList(pid=source rowid)`。普通新增字段与绑定后字段同步采用不同转换。 | 未发现目标 candidate、field、parameter API。通用 catalog 不含这三张源表；目标 design API 不提供来源选择器。 | source 查询不要求先存在数据空间模型主键；候选/字段/参数读取走原 design query owner。目标 DataSpaceRuntime.query identity 语义是 `scenarioId + 注册模型 Name`，未证明这些裸源名均为该场景注册模型；不能直接认定可替代。 |
| JSON `json` | `Base_JsonData`，候选 `name/description`；字段不查询目录字段表，由 `id/pid/name/type/haschild/value` 种子生成。 | 未发现目标候选或静态字段种子实现。 | 不需现有模型主键来列候选/生成字段；JSON 运行预览还有原页面范围限制，不能把源 candidate API 当预览 API。四文件无来源 reader 宿主。 |
| 逻辑视图 `logicView` | `Base_DataViewList`，候选 `name/description`；源字段 `Base_TblField`，入参 `_Base_ParamList(pid=source rowid)`；源 UI 显示“视图”，与数据库视图分开。 | 未发现目标 candidate、field、parameter API；数据库 catalog 的 `views` 指 `_Base_ViewList`，不可当逻辑视图。 | 不需已建模型主键读取候选；与接口类似，目标没有证明裸 `Base_DataViewList` 可按正式注册模型 Name 直接 query。页面无现存 host 调用。 |

## API 输入、输出和失败边界

| 当前公开入口 | 输入与返回 | 失败/限制及权限证明边界 |
|---|---|---|
| `packages/spark-lowcode-api/src/catalog/lowcode-catalog-api.ts::LowcodeCatalogApi.getDatabaseCatalog(dataSpaceIds)`；根门面 `LowcodeApi.catalog` | 一个或多个 formKey；返回 servers/databases/tables/views/fields、逐目录 `sourceErrors` 与 `sourceDataSpaces`。不接 keyword、资源类型或分页参数，读取五目录源并返回全量快照。 | 空 formKey 列表立即拒绝；单源会尝试各 formKey，所有 key 均失败则用空 rows + `sourceErrors` 表示，不会抛整包错误；wire 响应结构/ID/数字/布尔校验失败抛 `LowcodeApiError`。 |
| 同文件 `resolveDatabaseResource(catalog, selector)` | selector `{databaseId, resourceName, resourceType:'table'|'view'}`；返回唯一资源及 `Base_TblField` 字段。 | 目录源有错误、零/多候选、字段源错误、重复字段 ID/name 均 fail-fast；只支持 table/view，不验证运行模型主键，也不建立当前 DataView 权限 context。 |
| `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts::DataSpaceDesignApi.read(input)` | `{dataSpaceId,catalogFormKeys}`；输出当前空间与正式模型/字段/关系/参数、现有模型资源快照。 | 内部 `catalog` 私有且不返回候选清单；`resourceReference` 仅 table/view 可解析，其他类型抛“尚无稳定资源目录身份”。不是 source editor API。 |
| 同文件 `readModel({designScenarioId,dataSpaceId,metaName,assertCurrent?})` | 以模型注册 `Name` 唯一读取正式模型、正式字段，复原物理 table/view 来源字段与主键。 | scope stale、正式模型不唯一/归属错误、数据库来源/字段歧义、主键证据不唯一均拒绝。它是模型消费合同验证，不能拿来为尚未建立的 source candidate 生成主键。 |
| `DataSpaceRuntimeApi.query({scenarioId,metaName}, options)` | 正式场景/注册模型身份 + filter/page/fields 等；输出 `DataSpaceQueryContext`，查询回执可消费 `rowKey/fieldAccess`。 | owner 注释和 request identity 把 `metaName` 作为模型名；裸物理来源表是否注册可查、keyless 候选的行权限 identity 是否有效，当前源码未证实。不能先假设为六源查询 API。 |

## 原查询消费者对照

原侧 `apps/appworks/src/data/api/data-set/design/{data-space-design.ts,source.ts,records.ts}` 与 `apps/appworks/src/data/api/services/source-record.ts` 把六种来源登记在 `sourceTableMap`。`readSourcePage(sourceType, params)` 调通用 `requireRootSparkRuntime().api.query({scenarioId: designScenarioId, metaName: sourceTableMap[type].tableName}, filter/page)`，返回映射行、后端 total、类型 label；`source-record.ts::buildSourcePageQuery` 处理关键词、描述、数据库过滤和页码。`readSourceFields(sourceRowId)` 对 `Base_TblField` 全页拉取；`readBoundInputParams(sourceRowId)` 对 `_Base_ParamList.pid` 拉取。owner `#run` 前后校验执行域，返回原 Spark 查询 context 的行/字段访问信息；候选请求不依赖先有数据空间模型 PK。原映射不是“所有来源都查 Base_TblField”：字典/JSON用静态 seeds，接口/逻辑视图才另读参数表。

目标 catalog 的 `/api/DataOperation/GetBaseData` 请求只有 `Table` 投影和 `x-FormKey`，内部没有 `DataSpaceQueryContext`、`rowKey/fieldAccess` 或 `lingma_sys_params` 消费。此事实只说明客户端权限上下文承接不同；不据此猜服务端授权松紧。原 source query context 到目标 catalog 回执是否等价需用正式合同确认。

## 四文件最小承接建议与文件范围

1. **复用**：数据库表/视图候选与字段直接复用 `LowcodeApi.catalog` 的现有能力；不再为这两类造查询逻辑。候选上层按 databaseId/resourceType/name 做本地筛选时须保留目录读取错误和字段歧义状态。
2. **补缺**：字典/接口/JSON/逻辑视图及接口/逻辑视图参数需补一个数据空间专用只读 source reader，按原 `sourceTableMap` 与字段路径返回 typed rows；不得塞进 `DataSpaceDesignApi.read` 的正式模型快照，不为每来源各建一套框架。
3. **权限裁定**：宿主 reader 应绑定当前应用/租户 scope 与正式数据查询 owner；原接口使用当前 design scenario/query owner。目标裸源名经 `DataSpaceRuntimeApi.query` 是否有效注册、是否完整携带当前权限回执尚未证实。接入前由主控核定这是复用 `LowcodeApi.catalog` 的 formKey 服务合同，还是使用正式 query owner；不按资源名称猜。
4. **四文件可达性**：当前 ScriptContext 无 API 暴露，所以即使有 `LowcodeApi.catalog` 公有方法，页面 `script.js` 也不可直调。最小宿主接线触点为 `packages/spark-component/src/runtime/app-services.ts` 的 page services capability、`packages/spark-component/src/page/context/buildPageContext.ts` 的 script `$page` 投影、`src/App.vue` 的 capability 注册，以及 `src/lowcode/data-space/` 的 data-space scoped reader；四文件只调用注入的窄 reader。若主控选择把所有查询绑定成真实模型 views，则需另证来源模型绑定和权限上下文能成立，当前 `pagedata.json` 未这样配置。
5. 候选→字段流程留在 `config/pages/data-platform/data-space-design/{rule.json,script.js,pagedata.json}`：页面负责来源类型/筛选/选择与调用；source reader 返回真实字段及可区分的参数/静态字段材料；正式模型/字段持久化仍归同一页面 DataSet.saveChanges owner。不要让 reader 保存模型或改场景。
6. 若实现范围扩出当前派工文件（新增宿主 capability/source reader），先交主控裁定并将精确文件纳入当前整页派工；本报告仅给依赖边界，不授权自行改公共 API。

边界：只完成 source API 事实核对与最小承接建议。未读取全局计划其余部分、未浏览全仓其他来源域、未登录、未测试、未改代码。
