# 原数据空间正式数据合同与运行下游语义

> 基线：`E:/r/sparkproject` 提交 `842dec4f11b333df904b9a4e26b6566b0802bab8`。已核对所读数据空间设计/API路径工作树无局部改动。本文只据源码确认静态语义；没有启动测试、浏览器或线上读写。

## 结论先行

- **源码已证实**：数据空间不是单一 JSON 配置。其正式定义分散在 `Base_DataSet`、`Base_DataModel`、`Base_DataModel_Field`、`Base_DataModel_Relation` 四类元数据记录，以及独立布局文件 `{dataSpaceId}.json`；输入参数序列化在数据空间主记录的 `inputParams` 字段。
- **源码已证实**：`dataSetId`/数据空间 `rowid` 是资源归属与运行场景身份；设计场景 `designScenarioId` 承载元数据表查询/保存；模型 `rowid` 标识模型记录，`Name` 是业务资源注册名，`MetaName` 是绑定来源名。运行查询以 `scenarioId=dataSpaceId, metaName=model.Name` 发起，不是用 MetaName。
- **源码已证实**：平台 `readContract/readModel` 是严格读取和校验正式模型元数据的投影 API，不执行业务数据查询。业务查询位于 `AppWorksDataSpacePreview` / 调用它的预览流程；`prepare` 一类操作也不等于保存或执行。
- **需运行核实**：后端对多表 `api.save` 的事务/部分成功保证、跨资源文件写入后的最终一致性、身份对应的实际租户/授权，以及真实数据库/接口/视图返回形态，静态源码不能证明。

## 身份与实体关系

```text
Base_DataSet.rowid (= dataSpaceId; 同时作为运行 scenarioId)
  ├─ Base_DataModel.dataSetId
  │    rowid (= dataModelId), Name (= 运行资源 metaName), MetaName (= 来源注册名)
  │    └─ Base_DataModel_Field.dataModelId + dataSetId
  └─ Base_DataModel_Relation.dataSetId
       childModId / parentModId → Base_DataModel.rowid
       childTable / parentTable → 模型 Name（运行资源名）

设计场景 designScenarioId: 上述正式记录的存储/读写场景
布局文件: designScenarioId + SysForm/designfile + `${dataSpaceId}.json`
```

| 标识/名称 | 源码定义与用途 | 常见误读 |
|---|---|---|
| 数据空间 `rowid` | `Base_DataSet` 主记录稳定 ID；API 校验唯一；作为模型/字段/关系的 `dataSetId`，并用于运行 `scenarioId`。`data-space-design.ts:307-323`; `preview.ts:273-280, 293-305` | 不是设计场景 ID，也不是页面标题/Name。 |
| `designScenarioId` | 元数据的查询/保存场景，`Base_DataSet` 与 Base_DataModel 系列表均在此读取；布局文件也存放于此场景。`data-space-design.ts:309-312, 627-640`; `runtime-api.ts:54-63, 128-140` | 不等于模型来源的场景名，也不用于查业务模型数据。 |
| 模型 `rowid` | Base_DataModel 单条记录 ID；字段通过 `dataModelId` 指回它，关系通过 child/parentModId 指向它。`contracts.ts:21-45, 51-70, 79-89` | 不是资源 metaName。 |
| 模型 `Name` | 数据空间内唯一的业务资源注册名；平台合同 `metaName` 来源于 Name；运行 query 的 metaName 也取 Name。`formal-contract.ts:43-52, 92-100`; `preview.ts:75-80, 405-410` | 不是绑定来源名。 |
| 模型 `MetaName` | 被绑定的源注册名称，例如数据库表名、接口名、JSON/视图源名。平台合同字段 `sourceName` 映射此值。`source.ts:86-100`; `formal-contract.ts:43-49, 92-100` | 不是执行数据空间查询的 metaName。 |
| `DbId` / `DatabaseName` | 来源 DTO 定位信息。表/数据库视图依赖 dbid 与数据库名；接口 `DbId` 写 ProviderID；字典/JSON/逻辑视图 `DbId` 写源 rowid。保存映射把 DTO `DatabaseName` 写为正式 wire 字段 `DbName`；读回 normalize 再将 `DbName` 映射回 `DatabaseName`。`source.ts:91-136`; `model.ts:21-34`; `records.ts:92-94` | `DbId` 并非所有来源统一的数据库主键；`DatabaseName` 不是本保存器发出的 wire 字段名。 |
| 字段 `Name` / `AsName` | 来源/设计字段名与输出别名；正式运行合同 `canonicalName=AsName || Name`。`data-space.ts:19-27`; `formal-contract.ts:21-27` | API 的字段 `type='dataModel'` 是字段类别，不是数据类型；实际 FieldType 才是字段类型。 |

### 正式实体字段字典（按源码实际使用）

| 实体 | 核心字段 | 语义 |
|---|---|---|
| `Base_DataSet` | `rowid`, `Name`, `Type`, `description`, `inputParams` | 空间主记录；inputParams 是 JSON 字符串，元素含 Name、Description、IsBusParam、rowid。`contracts.ts:13-20`; `records.ts:61-79`; `data-space-design.ts:754-766` |
| `Base_DataModel` | `rowid`, `dataSetId`, `Type`, `Name`, `MetaName`, `DbId`, `DbName`, `items` | 资源模型、来源绑定及额外类型特有属性；前端 DTO 的 `DatabaseName` 通过 save record 映射为 `DbName`。`contracts.ts:21-45`; `records.ts:82-116`; `model.ts:21-34` |
| 业务模型字段 | `rowid`, `dataSetId`, `dataModelId`, `type`, `Name`, `description`, `FieldType`, `IsOutput`, `AsName`, `ValueFun`, `Expression`, `allowAIAdd`, `OrderType`, `Order`, `IsPKey`, `Group` | 字段属性、输出开关、别名、计算定义、排序分组、主键标志。`contracts.ts:47-70`; `records.ts:119-143` |
| `Base_DataModel_Relation` | `rowid`, `dataSetId`, `childModId`, `parentModId`, `depType`, `filter`, `childTable`, `parentTable`, `cascadeDel` | child 依赖 parent；filter 是关系查询过滤表达式。预览排序器要求 table 字段等于端模型 Name，但关系面板保存时优先写端模型 MetaName；当二者不同时合同冲突，见下方“已识别的原实现缺陷”。`contracts.ts:79-89`; `relation.ts:5-21`; `edge-panel/use-data-set-design-edge-panel.ts:120-128`; `preview.ts:195-220` |
| 来源字段/入参（读取源定义） | 来源表 `Base_TblField` 的 enname/cnname/DataTypeName/Memo/IsPKey；接口/逻辑视图参数 `_Base_ParamList` 的 pid/parname/pardesc/parzdtype | 用于初始化或同步模型字段；来源定义本身不是数据空间的字段记录。`records.ts:160-181`; `data-space-design.ts:403-437` |

模型接口类型的设计类型为 `table | dict | interface | json | logicView | databaseView` (`contracts.ts:1`)；UI 来源中文标签映射分别是“数据库表、字典、接口、JSON、视图、数据库视图”，表见 `records.ts:47-58,186-241`。`sourceTableMap.dict.type='数据库表'` 是 source config 上的 `type` 元数据，不是新增模型的正式 Type；`buildDataModelPayloadFromSource` 各分支实际写 `Type: sourceConfig.label`，dict 因而保存“字典”。当前已读 `buildSourcePageQuery` 未消费 config.type，故该字段在这条来源查询调用链中的作用尚未证实。`file` 标签被单独映射，但并不在 `DataModelSourceType` 联合类型内（同处 47-58）；不要据标签推断存在可绑定文件来源。

## 来源绑定、字段计算与联动

| 类型 | 来源表/关键字段 | 绑定模型字段/限制 |
|---|---|---|
| 数据库表 `table` | `View_TblList`，来源 tblname/tbldesc/dbid/DbName | DTO 保存来源 Name 为 MetaName、DbId 为数据库 ID、DatabaseName 为数据库名；持久化时 DatabaseName 映射到 wire `DbName`。来源回读按名称+dbid唯一匹配。平台合同还回读正式来源及字段，只接受一个非 `lingma_sys_ent` 主键。`records.ts:186-196`; `source.ts:91-101`; `model.ts:21-34`; `data-space-design.ts:503-516`; `runtime-api.ts:192-240` |
| 数据库视图 `databaseView` | `View_ViewList`，vewname/vewdesc/dbid/DbName | 同样使用 DTO `DatabaseName`，wire 保存字段为 `DbName`；回读按视图名+dbid唯一匹配。`records.ts:231-241`; `source.ts:91-101`; `model.ts:21-34`; `data-space-design.ts:503-516` |
| 接口 `interface` | `Base_DataServiceInterface`，Name/Desc/ProviderID | DbId 存 ProviderID；参数来自 `_Base_ParamList`；提供方+Name 优先匹配，随后仅按 Name 回退。普通新增/替换走 `buildInitialFields` 的通用源字段转换，`IsOutput` 取 Base_TblField 的 IsPKey；绑定源同步 `buildBoundSourceNextFields` 才走接口专用输出字段转换并设 `IsOutput=0`。两条路径不得概括成统一的初始输出值。`records.ts:206-214`; `source.ts:10-34,103-114`; `services/source-record.ts` 的 `buildSourceDataModelFieldPayloads`; `data-space-design.ts:520-551,554-584`; `use-data-set-design-page.ts:1106-1112,1157-1165` |
| 字典 `dict` | `_Base_DictType`，TypeName/functiondesc | DbId 存来源 rowid；字段初始化使用静态种子 rowid/val/txt/ordIdx，全部输出并按 ordIdx 升序，不依赖 Base_TblField。`records.ts:197-205`; `source.ts:116-125`; `services/source-record.ts` 的 DICTIONARY_FIELD_SEEDS / `buildStaticDataModelFieldPayloads`。 |
| JSON `json` | `Base_JsonData`，name/description | DbId 存源 rowid；字段初始化使用静态种子 id/pid/name/type/haschild/value，全部输出；种子注释分别称记录路径、父级 id、子项标志和值函数。`records.ts:215-222`; `source.ts:116-125`; `services/source-record.ts` 的 JSON_FIELD_SEEDS / `buildStaticDataModelFieldPayloads`。 |
| 逻辑视图 `logicView`（显示“视图”） | `Base_DataViewList`，name/description | DbId 存源 rowid；字段从 Base_TblField 读取，输入参数从 `_Base_ParamList` 读取；运行时按接口/logicview 构造 inputParams。`records.ts:223-230`; `source.ts:116-125`; `data-space-design.ts:428-437,520-551`; `preview.ts:382-400` |

字段生成与源变更同步由 `buildInitialFields` / `buildBoundSourceNextFields` 完成（`data-space-design.ts:520-604`）：字典与 JSON 使用固定字段种子；其他来源先尝试静态字段（无种子），再按 sourceRowId 取 Base_TblField；接口普通新增/替换使用通用 Base_TblField 字段转换，接口绑定源同步使用专用接口输出字段转换；接口/逻辑视图可附加 `_Base_ParamList` 入参字段。通用源字段 `IsOutput` 初值等于来源 `IsPKey`，字典/JSON 种子则全部输出，接口专用同步转换输出标记为 0。同步时仅将 `type=dataModel` 与 `type=inputParams` 两组替换合并，保留其他字段类型；标记为 `FieldType=计算字段` 的已有数据字段保留，其他既有源字段按 `Name` 对齐，源中新增字段追加、源中消失字段移除。`services/source-record.ts` 的 `buildSourceDataModelFieldPayloads` / `buildStaticDataModelFieldPayloads` / `buildBoundInputParamFieldPayloads`; `source.ts:36-80`; `data-space-design.ts:568-603`。

计算字段的语义在这里体现为字段 `ValueFun`/`Expression` 数据随记录持久化、平台正式合同将非空值投影为 `computed=true`，并禁止计算字段成为有效主键；源码没有在合同读取时执行计算。`records.ts:119-143`; `formal-contract.ts:21-37,73-90,146-159`。预览字段投影将 ValueFun、排序、Group 信息带入查询，但不能据此推断每种 ValueFun 都由本地执行：查询调用仍交由运行 API。`preview.ts:29-55`。

## 请求、响应与保存顺序

### 查询正式设计

1. `AppWorksDataSpaceDesign` 绑定 `designScenarioId`、`dataSpaceId` 与执行域有效性检查 (`data-space-design.ts:230-264`)。
2. 读取基线时并行取空间主记录、models、fields、relations 和依赖字典；空间主记录必须唯一完整，其他表按 `dataSetId` 收集全页，字段有 rowid 稳定排序。`data-space-design.ts:266-363`。
3. 平台 `readContract` 按设计场景依次完整分页读取 models、fields，并检查所属空间及模型归属；表来源继续校验唯一定义、字段所属与唯一有效非租户主键；最终回传 `{scenarioId: dataSpaceId, models:[...]}`。`runtime-api.ts:122-169,173-240`; 结构定义 `public/data-space.ts:4-60`。
4. `readModel(metaName)` 限定同一空间内 Name 精确匹配且唯一，再取 `type=dataModel` 字段，给页面/能力提供单模型正式语义。`runtime-api.ts:44-118`。

平台模型合同字段投影：`id`=模型 rowid；`metaName`/`name`=模型 Name；`sourceName`=模型 MetaName；`sourceId`=DbId 或 PId；`sourceType`=Type；`primaryKey` 是验证后的规范输出字段名；`businessMain`=IsBusinessMain；`fields` 含 id/modelId/name/canonicalName/type/primaryKey/description/output/computed/order/orderType/raw。`public/data-space.ts:4-53`; `formal-contract.ts:43-103`。

### 保存以及跨资源顺序

| 操作 | API 请求/持久资源 | 源码可证的完成边界 |
|---|---|---|
| 保存空间入参 | 对 `Base_DataSet` 发 `changed[{rowid:dataSpaceId,inputParams:JSON.stringify(...)}]`；元素仅序列化 Name/Description/IsBusParam/rowid。`data-space-design.ts:754-766` | 单个 save 请求返回；该动作自身不连带保存模型/布局。 |
| 保存模型 | `Base_DataModel` added 或 changed；生成 rowid；归属必须等于当前 dataSpaceId。`data-space-design.ts:769-788`; 模型字段映射在 `model.ts` | 主记录成功才返回 rowid 候选；新模型字段需另行 `syncModelFields` 调 Base_DataModel_Field。 |
| 保存字段 | 先按 `(type, Name)` 去重，既有 rowid 对应 changed，缺 rowid added，消失字段 deleted；差异用快照比较。`model.ts` 中 `buildFieldCrudPayload`; `data-space-design.ts:791-812` | 与保存模型是独立调用，因此 UI 调用顺序/失败后残留需看交互流程与后端行为；不能把第一次请求成功当完整业务完成。 |
| 保存模型与关系 | 同一个 `api.save` changes 同时携带 Base_DataModel 和 Base_DataModel_Relation 的 added/changed/deleted；relation rowid 独立生成。`relation.ts:5-21`; `data-space-design.ts:815-871` | 客户端一次批量调用；事务原子性、部分成功回包需运行验证。 |
| 数据处理批量保存 | 将 owner/target models 与 fields 构建多资源 changes，一次提交；若无差异返回 `result:null`。`model.ts` 的 `buildDataProcessSavePayload`; `data-space-design.ts:875-900` | 仅描述配置记录保存，不是执行处理器或重新计算业务数据。 |
| 删除模型级联 | 一次 save changes 删除模型、其字段及引用该模型的关系。`data-space-design.ts:963-997` | 关系清理由客户端给定当前关系集推导；未验证服务端事务。 |
| 保存图布局 | 独立 scenario text 文件 `{dataSpaceId}.json`，路径 SysForm/designfile、`isReplace:true`。`data-space-design.ts:615-640` | 与上述元数据 save 不同资源、不同请求；跨两者的原子提交不能假定。 |

布局缺失修复的 `prepareMissingLayoutRebuild` 只读取正式设计全量并确认目标布局文件明确缺失，返回冻结预览和内存 fingerprint；`confirmMissingLayoutRebuild` 再读最新元数据、比 fingerprint、复查文件仍缺失后写文件并回读逐字比较。`data-space-design.ts:644-713`。这段 prepare 仅准备/核对，不写文件；写入后回读相同才报告成功。布局 JSON 内容契约的全部字段结构需结合设计器 state/serializer 研读，当前 data 分工不详述。

## 预览：配置投影与业务读取的边界

- 单模型预览 `queryModel` 把 `model.Name` 当运行资源 `metaName`，并以 `scenarioId=dataSpaceId` 调 `api.query`；`OutputType` 默认 Table。普通集合可分页；SelfRefData 要提供 child/parent 模式与节点参数，完整集合 `allPages` 禁止树方式。`preview.ts:57-109,273-282`。
- 完整数据空间预览先并行读取设计场景的模型、字段、关系三份元数据全页；按关系方向 child→parent 作拓扑排序，因此先查被依赖的 parent。缺失引用、资源名与端模型不一致、重复模型身份/Name、循环依赖会失败；JSON 模型被排除，SelfRefData 不允许走全量集合预览。`preview.ts:195-243,297-352`。
- 执行业务查询前解析模型 Filter 与关系 filter；`SystemData` 参数值仅由调用方明确传入的唯一命名参数替换，未提供值、重名、非法 filter 会失败，不会静默删条件/猜服务器参数。所有条件在第一个业务模型查询前解析。`preview.ts:126-163,354-360`。
- 每个模型把自身过滤器与其依赖关系过滤器 AND 合并；如果有关联过滤的父模型结果为空，则子模型直接得到空集合；否则按拓扑顺序调用资源查询，全页采集，排序字段用正式模型主键推导；取消/执行域失效会中止。返回 `{data: Record<model.Name, rows[]>, relations}`。`preview.ts:362-416`。
- `buildPreviewTableFields` 只生成查询字段元信息；`buildDataModelPreviewQuery`/`queryDataSpace` 请求的是平台查询 API，不是本地执行字段表达式。正式平台 contract 与这套 AppWorks 预览查询是相关但不同的消费路径。

## 下游消费者与权限边界

| 消费方 | 如何读合同/数据 | 对迁移的含义 |
|---|---|---|
| 通用 schema-form 页面能力 | `SparkDataSpaceApi.readModel` 的注释明确此只读正式元数据模型被 AppWorks 与 page capabilities 使用；公有合同将注册名/来源名分开。`packages/data/spark-api/src/public/data-space.ts:32-93` | 页面绑定数据空间身份与模型注册名后，运行数据源应按合同读取字段，不应把设计页面的元数据读写当业务读数。 |
| 数据空间设计/预览 | `readContract` 提供编辑器完整正式投影；另有 `AppWorksDataSpacePreview` 查询业务模型。`data-space-design.ts:735-751`; `preview.ts:255-417` | 迁移必须保留“设计场景元数据”与“业务数据空间场景”两条身份/请求路径。 |
| 导航宿主 | `Base_DataMenu` 保存 dataSetId，并读 Base_DataModel、字段；数据空间列表按应用 `sysid` 筛选。`ApplicationManager/DataMenu.ts:13-47,214-263` | 下游宿主绑定的是数据空间稳定 ID 与模型资源；仅更名显示值不应误当改 ID。 |
| 报表 | `ReportComp` 使用 DataFormID 对应空间 rowid 读取 Base_DataSet.inputParams 和空间模型、字段、关系。`data/api/system/ReportComp.ts:10-23,360-392` | inputParams 变更会影响报表请求参数契约。 |
| 流程/业务模型设计 | `FlowDesign` 消费 `dataSetId`、模型与字段，按 IsBusinessMain/IsBusiness 选择模型/字段。`data/api/FlowManage/FlowDesign.ts`（由 dataSetId/字段相关查询调用） | 标志字段虽不全进入公共 contract projection，仍是下游正式设计语义，不宜在迁移中丢弃。 |

**权限：查询数据权限与功能标签侧配置是两条相关但不能混为一谈的链**。预览 owner 固定一个数据空间，元数据读取为 `designScenarioId + Base_DataModel*`，业务读取为 root runtime `scenarioId=dataSpaceId + metaName=model.Name`；全空间预览用 queryContext `rowKey` 收集/去重行（`preview.ts:255-280,297-305,405-410`）。正式合同 API 仅读元数据；`assertCurrent` 只阻止过期执行域，不是授权。实际查询沿 Spark runtime owner 进入平台权限协议；回来的 queryContext/row `lingma_sys_params` 提供当前表/行/字段操作上下文，DataTable `fieldAccess`/权限方法消费该结果（原平台 `data-table.ts:372-443`；`runtime-api.ts:44-118`；`executor.ts:267-280`）。数据空间作为交换中心，还侧接功能标签、数据对象策略与授权配置；原 `auth.ts` 不是可整体排除的无关角色实现：其中 `_Base_FunctionNode`、`Base_DataSet_Config`、`Base_FunctionDetail`、`FunctionNodeAuth` 读写用于配置建模。必须保留此侧向语义并追查它到实际运行查询/权限回执的连接；旧 `readRoles`/`RoleCategories` 及 grant 的 role/position/user 分支是原实现事实，不迁移成目标前端角色判断、角色映射或 admin 放行。原 `DefaultPermission`、`Base_FunctionDetail` 保存成功也不能单独证明它已改变查询权限；目标当前 `PermissionApi` 读到设计配置或 `GetFormUserFunction` 响应，仍未证明与数据空间查询回执 `lingma_sys_params` 的组装/生效链，须标为待证并分别验证。


### 功能标签及数据对象授权侧配置闭环（配置事实与运行权限结果分开）
原侧向配置源码为 `E:/r/sparkproject/apps/appworks/src/data/api/data-set/auth.ts` 与 `.../ui/use-data-set-auth-page.ts`；目标能力为 `D:/SPARK_AppWorks/packages/spark-lowcode-api/src/platform/permission/{design/permission-design-api.ts,design/permission-design-mutation.ts,runtime/permission-runtime-api.ts}`。

| 环节/字段 | 原源码输入、输出与异常 | 目标已读能力 | 判定 / 待证 |
|---|---|---|---|
| 默认权限 | `apps/appworks/src/data/api/data-set/auth.ts::readDefaultPermission/saveDefaultPermission`（334-354）；UI `use-data-set-auth-page.ts`（120-123,907-935,1182-1209） 以当前空间 `dataSetId` 查 `Base_DataSet_Config`，按 `id` 更新或新增 `DefaultPermission`，读取首条且未见重复配置冲突检查；UI 默认 `edit`，可选 `visible/none/all_visible`。owner `#run` 前后校验执行域，`loadPage` 主请求失败提示，保存先写配置再顺序写 dirty detail，后续失败时前段可能已成功。 | `PermissionApi` 无 `Base_DataSet_Config` 读写能力；`PermissionRuntimeApi.read(formKey)` 返回后端接口结果，不含明确映射的 DefaultPermission 字段。 | 需保留默认权限配置的数据语义；这些标记的服务端解释/它们是否影响查询回执未证实，禁止将保存成功等同权限已生效。 |
| 功能标签 | `auth.ts::readFunctionNodes/createFunctionNode/updateFunctionNode/deleteFunctionNode`（356-410）与 `use-data-set-auth-page.ts`（811,987-1070）：按 `prowid=dataSpaceId` 查询 `_Base_FunctionNode`；create/update 写 `Nodetext`；delete 先完整读 `FunctionNodeAuth.pageID=dataSpaceId` 的 `functionoption`，依据回执 row/field 权限移除 tag id，再同一次 save 请求删标签和更新授权引用，最后分别读回；身份缺失、重复行、字段不可见、不可写或回读不全会 fail closed，结果未确认抛 `FunctionNodeDeletionUnconfirmedError`，不自动重试。 | `PermissionDesignApi.read(formKey)` 读取 `_Base_FunctionNode`（筛选 `prowid=formKey`），输出 `featureTags`；`PermissionRuntimeApi.read(formKey)` 调 `/api/Function/GetFormUserFunction`，输出 `authorizedFeatureTags=childFun`、`allowAddByResource`。Design 的空 formKey/缺必需行身份/无效 Items fail-fast，Runtime 的非对象响应或非布尔 allowAdd fail-fast。 | 是旁侧业务配置和后端功能授权结果，不是数据表/行/字段权限。原空间 ID 与目标 formKey 的身份关系、标签结果如何连接数据空间运行请求待证。 |
| 数据对象策略 | `auth.ts::readFunctionDetail/saveFunctionDetail`（533-568）及 `use-data-set-auth-page.ts::buildFieldPermissionRows/buildDetailDraft/persistDetailDraft/handleSave`（576-628,1146-1209）：`readFunctionDetail(tagId, model.Name)` 取 `Base_FunctionDetail` 的 `FunId + ConName` 首条；字段来自模型字段（只含 `IsOutput=1`）/公开表字段。UI 投影 `allowAddData`、add-child/show/edit/delete/save filters、editable/required/masked/displayNone 字段集。`saveFunctionDetail` 按 rowid 改或新增，保存字段逗号串；当前保存后只在新建且无回执 rowid 时回读定位，未统一精确策略 readback。 | `packages/spark-lowcode-api/src/platform/permission/design/permission-design-api.ts::PermissionDesignApi.read/dataObjectPolicy`（112-177）按标签读 `Base_FunctionDetail`，映射 `AllowShowFields/AllowEditFields/DesensitizationFields/ShowFilter/AllowAddFilter/AllowEditFilter/AllowDeleteFilter/EditDataSaveFilter`；仅只读 DTO。`prepareMutation` 只校验 FormKey/preimage/移除目标并生成 high-risk journal/readback/compensation 命令，不执行保存。 | **目标字段损失**：DTO 没映射原 `allowAddData`、`AllowAddChildFilter`、`displayNoneFields`、`RequiredFields`；目标 `addFilter` 来自 `AllowAddFilter`，与原 `AllowAddChildFilter` 尚无已证等价；`AllowShowFields` 亦不能直接等同原页面显示/脱敏/隐藏三态。不能宣称权限合同齐全。策略对当前数据查询的作用待沿服务端/运行消费者证实。 |
| 对象授权引用 | 原 `FunctionNodeAuth` 以 `pageID` 空间/页面、`functionoption` 标签 ID 及 `granttype/QID/masterId/mastervaluefield/status/businessId` 保存授权范围；删除标签处理已读到的所有页记录，且只对 `functionoption` 可见完整、具备行编辑和字段写权限的变更执行。 | `PermissionDesignApi.read` 输出 `grants`，但 `subjectKind` 当前把 `granttype` 映射成 `role/position/user/unresolved`；这不是目标页面可复用合同。runtime `authorizedFeatureTags` 是接口返回，不由前端算 grants。 | 保留标签关联、授权配置维护与引用完整性语义，不擅自缩成只读；目标不建立前端角色模型或判断。grant 的真实运行匹配及组织范围结果必须由后端实际响应证明；未知 granttype 在 design snapshot 仅 diagnostics，读/解码错误 fail-fast。 |
| 运行权限回执 | 原正式查询路径由查询 owner 获取结果，行权限/字段权限由 query context 与 `fieldAccess` 消费；不能以配置页的静态策略自行覆盖回执。 | 当前 `packages/spark-data` DataView/DataSpace runtime 消费 `lingma_sys_params` 的字段/行授权；PermissionRuntime 单独提供功能标签及资源 allowAdd 响应。源码搜索未见数据空间调用 `lowcodeApi.permission.runtime` 或把这两种响应合并的直接 consumer。 | 需证明同一空间/资源下 feature tag → policy/grant configuration → 后端当前用户决策 → 查询响应的端到端链；未证实前分列展示/校验，不推导权限，不用 admin 放行。 |
## 易丢字段的实际下游语义（只写源码可证）

| 字段 | 源码证实的业务用途 | 保留边界/未证实 |
|---|---|---|
| `IsBusinessMain` | 设计页以它选“主业务表”并展示数量（`use-data-set-design-page.ts:249-274`）；FlowDesign `formMainModel` 精确查它为 1，业务模型列表包含主表并排序置顶（`FlowDesign.ts:1026-1056`）；导航权限配置据它找主业务模型（`NavigationPermissionConfig.ts:461-474`）。正式合同投影为 `businessMain`（`formal-contract.ts:92-103`）。 | 代码没有强制全空间只能有一条；UI 提示显示标记数量，Flow 返回第一条。不能迁移成隐含唯一约束，除非另有产品确认。 |
| `IsBusiness` | Flow 业务模型集合筛 `IsBusinessMain=1 OR IsBusiness=1`，字段选择附带模型名/来源名（`FlowDesign.ts:1037-1077`）；旧数据权限 UI 将 IsBusiness/IsBusinessMain 用于资源分类（`use-data-set-auth-page.ts:258-262,524-527`）。 | 正式合同公开投影只显式给 `businessMain`，raw 保留原模型字段。业务标志不是查询权限；旧 UI 分类不得当成本轮角色权限合同。 |
| `inputParams[].IsBusParam` | 持久化在 `Base_DataSet.inputParams` JSON；报表 Viewer 显示“业务参数”标签（`use-data-set-design-page.ts:974-1019`; `ReportViewer/index.vue:80-103`）。 | 查到的下游只是展示标记，未发现它改变参数值、过滤或权限执行。更深含义未证实。 |
| `Base_DataModel_Field.type='inputParams'` | 接口/逻辑视图来源入参可转成独立字段记录；全空间预览按字段 Name 从用户给的 inputParams 取值并构造 Spark 查询参数（`data-space-design.ts:541-551,579-598`; `preview.ts:169-188,382-400`）。报表读取空间级参数定义作为查询筛选输入（`ReportViewer/index.vue:80-108`; `ReportComp.ts:360-384`）。 | 空间级定义 (`Base_DataSet.inputParams`) 和模型级来源入参字段 (`type=inputParams`) 是两个不同实体/作用域，不可折成一种。 |
| 字段 `ValueFun` / `Expression` | 正式合同将非空 ValueFun（可解析 JSON 且非 null/空，或非 JSON 文本）或非空 Expression 投影为 `computed=true`，并禁止计算字段作模型主键（`formal-contract.ts:21-37,73-90,146-159`）。字段同步特别保留 `FieldType='计算字段'`（`data-space-design.ts:590-598`）。 | 预览字段投影会携带 ValueFun 给查询 API（`preview.ts:29-55`）；本地合同不执行计算。表达式语言和实际运行时点尚未证实。 |
| 关系 `depType` / `cascadeDel` | depType 原样存关系并可从“数据关系依赖”字典读供设计；cascadeDel 规范为 0/1 并持久化。完整预览使用 child/parent 图及 relation.filter 做拓扑/过滤；删除模型时客户端删指向该模型的关系，不读 cascadeDel（`records.ts:41-45`; `relation.ts:5-20`; `data-space-design.ts:615-623,963-995`; `preview.ts:195-243,341-380`）。 | 当前预览没有按 depType 分支，也不执行 cascadeDel 业务动作；级联删除的其他消费者语义未证实。 |
| 模型 `JoinType` / `PrimaryKeyFields` / `ForeignKeyFields` / `JoinFilter` / `PId` | 它们被 normalize/save 快照保存；删除已保存关系时会清空 child 模型 JoinType、ForeignKeyFields、JoinFilter、PId，说明界面把它们作为关联配置一并维护（`model.ts:28-34`; `use-data-set-design-page.ts:1311-1361`）。正式合同会验证表主键与来源实际主键一致，并将唯一输出字段别名作为 `primaryKey`；非表源要求 PrimaryKeyFields 唯一映射到有效输出字段（`formal-contract.ts:55-90`; `runtime-api.ts:192-240`）。 | 当前批量预览故意将 PId、JoinType、ForeignKeyFields、JoinFilter 置空，用 relation 表 child/parent + filter 执行其预览路径（`preview.ts:388-400`）。已读消费者不足以证实传统字段完整含义；迁移须保留原始正式值，不能将它们等同 relation.filter 或自行赋义。 |

## 输入、输出、失败与部分成功

| 边界 | 输入 | 输出/失败条件 |
|---|---|---|
| `readContract` | 必需设计场景 ID、数据空间 ID，可选 stale-scope assert | 空间内模型/字段完整投影；数据归属错、缺 rowid、分页不完整、模型缺 Name/MetaName、无效/歧义主键即拒绝。`runtime-api.ts:122-169`; `formal-contract.ts:43-90` |
| `readModel` | 上述身份 + Name 精确值 | 唯一模型的合同字段；0/多条或归属不符失败。`runtime-api.ts:44-75` |
| 单模型预览 | 模型 Name/OutputType/Filter、可选 fields/inputParams/page/tree 参数 | 查询行；非法过滤、无效参数、SelfRefData 参数错误时失败。`preview.ts:57-109,273-282` |
| 完整空间预览 | 调用者输入参数、pageSize/maxRows/signal | 每个可查询模型的 rows，按依赖先后；循环/无效关系/过滤、业务请求失败或取消时 reject，不伪造缺失父记录。`preview.ts:284-416` |
| 布局修复 | prepare 返回的本实例预览对象 + 对应内容 | prepare 无写入；confirm 才写，重复消费、其他实例 token、配置 fingerprint 变化、目标文件已出现、写后回读不同均失败。`data-space-design.ts:644-713` |

静态源码可见许多操作有回读校验（正式合同、数据空间唯一、布局写后比对），但普通 API `saveModel/saveInputParams/saveRelations` 主要依赖 `api.save` 返回并未统一回读核实持久最终值。不能把 HTTP/SDK 成功等同于业务全闭环，尤其模型主表和字段是分开保存，布局与元数据也分开保存。

## 设计意图、代码边界与当前迁移判断

- **源码已证实的意图**：稳定的 rowid 关联正式元数据；资源注册名与来源注册名分离；批量预览按依赖图向下执行；关键身份与主键不确定时 fail-fast；布局修复必须显式预览后确认并写后回读。
- **代码边界/待核**：源类型静态定义含 6 种，各源字段格式和查询合同不同；字典/JSON 字段从静态种子生成，接口新增与绑定同步的字段构造路径不同。source config 的 dict `type` 值在已读来源查询 helper 中未见消费；对字段可见性的最终体验还需结合字段编辑器和服务端 API。`records.ts:186-262`; `source.ts:10-34`; `services/source-record.ts`。
- **迁移决策（目标，不是当前事实）**：保留当前 AppWorks 底座；旧 Vue 页面改为 `rule.json/script.js/style.css` 与共享场景 `pagedata.json`；维持当前组件；前端消费表/行/字段数据权限，保留功能标签及授权配置维护，不引入角色模型、角色判断/映射或 admin 放行；不改后端或数据结构；保留现有 AI 路径并排除参考新增 AI。数据模型 Name、MetaName、字段 AsName、过滤器参数及各保存资源的边界须映射到现有合同，不应通过一个页面 JSON 合并掉独立持久资源。
- **运行核实**：确认设计场景 ID 与 dataSpaceId 在生产配置中的绑定；逐种来源读取字段/主键并做 query；关系 filter 是否对应服务端查询语义；ValueFun/Expression 的服务端运行方式；`api.save` 批量 changes 的事务、实际返回行和失败后的回滚/部分写入；布局文件存储 ACL 与文件名碰撞；身份绑定用户实际授权与报表/导航/流程下游样例。

### 已识别的原实现缺陷：关系端名称语义不一致

关系面板 `assignForm` 用 `parentModel.MetaName || parentModel.Name` 与 `childModel.MetaName || childModel.Name` 写入关系记录的 parentTable/childTable（`edge-panel/use-data-set-design-edge-panel.ts:120-128`）；完整预览的拓扑校验却要求这两个值分别等于关联模型的 `Name`（`preview.ts:215-220`），之后又用 `parentTable` 作为 `previewData` 的键（`preview.ts:371-376`）。只要某模型的 Name 与 MetaName 不同，面板保存的正式关系名就会被预览校验拒绝，故这不是一致的关系合同，而是现有实现缺陷/歧义。静态源码可确认冲突路径，真实存量是否已有受影响关系需读数据核实。

## 完整阅读与覆盖记录

完整阅读的源文件：

- `apps/appworks/src/data/api/data-set/design/contracts.ts`
- `apps/appworks/src/data/api/data-set/design/model.ts`
- `apps/appworks/src/data/api/data-set/design/source.ts`
- `apps/appworks/src/data/api/data-set/design/relation.ts`
- `apps/appworks/src/data/api/data-set/design/records.ts`
- `apps/appworks/src/data/api/data-set/design/preview.ts`
- `apps/appworks/src/data/api/data-set/design/data-space-design.ts`
- `apps/appworks/src/data/api/services/source-record.ts`（来源查询、字典/JSON 静态字段、源字段与入参字段快照）
- `packages/data/spark-api/src/public/data-space.ts`
- `packages/data/spark-api/src/data-space/runtime-api.ts`
- `packages/data/spark-api/src/data-space/formal-contract.ts`
- `apps/appworks/src/data/api/ApplicationManager/DataMenu.ts`（导航宿主下游）

只读了相关片段/调用点、未完整阅读的文件：

- `apps/appworks/src/data/api/data-set/auth.ts`：权限边界相关片段。
- `apps/appworks/src/ui/features/data-platform/data-set-management/design/ui/use-data-set-design-page.ts`：数据来源保存、入参保存、关系删除相关片段；页面其他交互由 interaction 分工分析。
- `apps/appworks/src/ui/features/data-platform/data-set-management/design/ui/edge-panel/use-data-set-design-edge-panel.ts`：`assignForm` 关系字段命名片段。
- `apps/appworks/src/data/api/system/ReportComp.ts` 与 `apps/appworks/src/ui/views/ReportManage/ReportViewer/index.vue`：空间 inputParams 消费片段。
- `apps/appworks/src/data/api/FlowManage/FlowDesign.ts`、`apps/appworks/src/data/api/SafetyProtectionManager/NavigationPermissionConfig.ts`、`apps/appworks/src/ui/features/data-platform/data-set-management/ui/use-data-set-auth-page.ts`：业务标志消费者调用点/筛选片段。
- `apps/appworks/src/data/api/DimensionDesign.ts` 与 schema-form/page-renderer 各消费者：仅定位下游合同引用，未读完整实现。
- 交互面板和 serializer/state 对全部输入、字段计算器、关系以及图 JSON schema 的全量语义由 interaction 分工负责，本报告不重复。

真实歧义：

1. 新建 dict 模型保存 Type 取 `sourceConfig.label`，标签为“字典”；`sourceTableMap.dict.type='数据库表'` 与 source label 是不同配置属性，且当前已读来源查询 helper 未消费该 type。字典运行资源实际元数据仍需实例核对。
2. JSON 使用静态字段种子，字段注释提示层级结构，但当前批量预览明确排除 Type=json 模型；JSON 运行消费者/预览入口需独立核实。
3. `Base_DataModel_Field.IsPKey`、模型 `PrimaryKeyFields`、数据库源 `IsPKey` 三份声明的权威优先级在合同投影中由代码限定，但未用在线数据验证既有记录兼容性。
4. 完整空间预览排序与接口/逻辑视图执行参数静态可见；后端实际支持的 filter/InputParams/分页组合和 ValueFun/Expression 计算规则需运行核实。
5. 关系 `depType`、`cascadeDel` 在保存/投影中保留，但本批量预览只按 `filter` 和 child/parent 图做 AND 过滤；级联业务写语义未在预览 API 执行。
6. `JoinType`、`ForeignKeyFields`、`JoinFilter`、`PId` 与正式关系记录联动清空，可确认共同参与旧模型关联配置生命周期；各字段实际语义尚未由本轮下游查询路径证实。
7. 业务参数 IsBusParam 仅查到报表 Viewer 的标签消费，没有发现筛选/授权执行作用；需要产品事实补充其非展示语义（若有）。
8. 关系面板存 MetaName 优先的端名称，而全空间预览强制 Name 相等；名称不同时构成可定位的静态实现缺陷，现有数据受影响比例需运行核查。




