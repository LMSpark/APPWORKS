# D03 六类来源新增模型合同

参考代码固定为 `E:\r\sparkproject` commit `842dec4f11b333df904b9a4e26b6566b0802bab8`。本文只核“新增来源模型”的来源候选、模型/初始字段映射和保存调用；替换、字段同步、数据处理只记录共用边界，不扩大本批范围。下列参考仓事实不自动成为 AppWorks 合同。

## 来源候选列表合同（参考仓事实）

六类候选共用 `useModelSourceDialog` 和 `buildSourcePageQuery`：初始第 1 页、每页 10 条；切换类型/搜索/分页清空当前选择；请求序号及弹窗可见状态过滤迟到结果。服务端 `total` 用于分页。查询按非空条件 AND 组合：来源名 `contains`、描述 `contains`；数据库表/数据库视图另按 `DbName contains`。所有类型发送 `page:{index,size}`；没有 sort 或字段 projection。列表记录由 `rowid`、来源名/描述及可选的 dbid、DbName、ProviderID 归一化，且 UI mapper 保留 `raw` 原行。

| type | 列表 metaName；名称/描述字段 | 附加条件与创建身份 | 初始字段/参数来源 |
|---|---|---|---|
| `table` | `View_TblList`；`tblname` / `tbldesc` | 可见 `DbName` 搜索；模型 `DbId=dbid`、`DatabaseName=DbName`、`MetaName=tblname` | `Base_TblField` 按来源 `rowid` 读字段 |
| `dict` | `_Base_DictType`；`TypeName` / `functiondesc` | 无数据库条件；模型 `DbId=候选 rowid`、`MetaName=TypeName` | 静态四字段；不读来源字段表 |
| `interface` | `Base_DataServiceInterface`；`Name` / `Desc` | 模型 `DbId=ProviderID`（空时 rowid）、`MetaName=Name` | `Base_TblField`；再按 `pid=来源 rowid` 加 `_Base_ParamList` 入参字段 |
| `json` | `Base_JsonData`；`name` / `description` | 模型 `DbId=候选 rowid`、`MetaName=name` | 静态六字段；不读来源字段表 |
| `logicView` | `Base_DataViewList`；`name` / `description` | 模型 `DbId=候选 rowid`、`MetaName=name` | `Base_TblField`；再按 `pid=来源 rowid` 加 `_Base_ParamList` 入参字段 |
| `databaseView` | `View_ViewList`；`vewname` / `vewdesc` | 可见 `DbName` 搜索；模型 `DbId=dbid`、`DatabaseName=DbName`、`MetaName=vewname` | `Base_TblField` 按来源 `rowid` 读字段 |

2026-10-08 只读 probe (`model-source-live-contract.json`, 04:57 UTC) 六类列表均可达，报告 total：table 1188、dict 346、interface 86、JSON 11、logicView 16、databaseView 135。JSON/logicView 实际候选行键只有 `rowid,name`，没有 `description` 值；即使 query/权限描述字段存在，也不能把缺值当作已知描述。接口来源字段 0 行、参数 6 行；逻辑视图字段 0 行、参数 1 行。零来源字段不能阻断两类模型新增：参数读取与字段读取是独立查询，参数可形成初始字段。

`buildDataModelPayloadFromSource` 将模型 `Type` 取类型标签（数据库表/字典/接口/JSON/视图/数据库视图），`Name` 取同数据空间下的唯一展示名，`MetaName` 保留来源注册名；非数据库来源 `DatabaseName=''`。唯一名只按当前模型 `Name` 集合判重；冲突后依次用 `原名（1）`、`原名（2）`。`sourceTableMap.dict.type='数据库表'` 不参与 payload，不能把它当模型类型合同。

创建 payload 不含 `rowid`；参考 `buildDataModelSaveRecord` 在保存时补正式 `rowid`，无 payload 值时由 `createSparkGuid()` 生成。保存 wire 记录固定带 `dataSetId/Type/Name/MetaName/description/DbId/DbName/JoinType/ForeignKeyFields/JoinFilter/PId`；来源创建只显式给前七项，后四项归一为空串。`DatabaseName` 在参考层经 model builder 映射成 wire `DbName`；目标正式 DataView 载荷须按当前模型字段 `DbName`，不能直接提交来源 DTO 的 `DatabaseName`。

## 初始字段及来源缺陷

| 来源 | 初始字段行为（参考仓） |
|---|---|
| 字典 | 固定 `rowid,val,txt,ordIdx`；全部 `IsOutput=1`，`ordIdx` 为 int 且升序；均非主键标记 |
| JSON | 固定 `id,pid,name,type,haschild,value`；全部 `IsOutput=1`，均非主键标记 |
| table / interface / logicView / databaseView | 按 `Base_TblField.tblid=来源 rowid` 读字段；跳过空 `enname`，`Name=enname`、描述 `cnname || Memo`、类型 `DataTypeName || 'varchar'`、`IsPKey=来源 IsPKey`、`IsOutput=IsPKey`。基础字段默认 `type=dataModel`，别名/值函数/表达式/排序/分组为空或 0 |
| interface / logicView 参数 | `includeInputParams=true` 时再读 `_Base_ParamList.pid=来源 rowid`；非空 `parname` 成为 `type=inputParams` 字段，名称/描述/类型映射 `parname/pardesc/parzdtype`，不输出、不设主键 |

参数身份/类型差异：live `_Base_ParamList` 行只返回 `parname,pid,parid,pardesc,testvalue`，不返回 `rowid/parzdtype`。固定参考的 `normalizeBoundInputParamRecord` 明确把 `parid` 作为 `rowid` 最后 fallback；部署源 DDL 将 `(parid,lingma_sys_ent)` 定为复合主键。`parzdtype` 归一化只读现存别名且无默认；随后 `buildBoundInputParamFieldPayloads` 才显式以 `normalizeText(parzdtype) || 'varchar'` 设 FieldType。`varchar` 是参考创建代码明确的缺类型默认，不是已观察到的来源类型；物理 DDL 确有 `parzdtype` 列，但当前来源查询未返回它。实现不能要求不存在的 query `rowid/parzdtype`，不能因缺 type 禁用整个接口/逻辑视图；如沿用 `varchar`，应表述为配置默认而非来源推断。`testvalue` 不参与该初始字段 payload，不能据此填值函数/调用参数值。

源缺陷/不应复制：确认新增只要求 UI 里有 `currentRow`，未按选中身份新查候选并核唯一性/一致；随后字段读取不能替代候选身份复验。动态来源字段 builder 会以 `varchar` 隐藏缺失类型、不强制名称唯一或恰一业务主键；目标 8D 字段 wire 为 `DataType/description`，没有 `Memo`，应按可读真实字段映射。字典/JSON 静态种子没有任何 `IsPKey` 标记，落库归一为 0；这是模型创建配置，不能根据字段名（如 JSON `id`）强造主键。后续运行预览的 row identity / primary-key 合同须独立按正式 runtime query 验证；不能为让预览看似可用而改写创建字段语义。

## 确认、新增与持久阶段（参考仓事实）

1. UI 行选择事件仅设置 `sourceDialog.currentRow`。`handleConfirmAddSource` 只判空；普通新增用当前行来源名生成唯一 `Name`，调用 `saveModel(payload)` 取得模型 rowid。
2. 接着 `buildInitialFields({dataModelId,sourceType,sourceRowId,includeInputParams:true})` 只需要所选来源 rowid 和模型 ID；函数本身没有读取“模型已保存”的服务器状态。它按上述来源规则独立读取来源字段/参数并把传入 ID 写进字段 payload。
3. 随后 `syncModelFields(modelId,initialFields,[])` 保存字段、重读字段列表，最后保存图布局；模型、字段和布局是连续阶段，不是已证明的事务。异常路径只提示“添加/更新模型失败”，不自动回滚已成功的阶段。
4. 占位节点新增分支额外强制新增模型、回读模型定位 rowid，再保存字段并改图节点身份；数据处理上下文则先构造暂存目标。它们是本次新增来源的共用边界，不应被误作新批次功能。

## AppWorks 当前正式合同及可复用边界

- 场景文件已为 `Base_DataModel@designModels` 与 `Base_DataModel_Field@designFields` 声明正式命名 DataView（均不自动加载，rowid 升序）；模型绑定本身不包含来源候选列表。见 `config/pages/data-platform/data-space-design/pagedata.json:2-49,83`。
- 页面已有 `designSnapshot`/命名 view owner、`DataView.addRow`、`DataSet.saveChanges({views})` 和明确目标参数 `loadFromServer` 路径；沿现有四文件事件/表单控件组合及这些 DataView 增行、保存、回读，不另造查询/保存通道。`DataView.addRow` 由当前 query result 的 `prepareNewRow` 生成新行身份（`packages/spark-data/src/data-view.ts:1912-1928`）。
- `DataSet.saveChanges({views:[model,field]})` 可在同一调用选中两个 view。对同 scenario DataSet，默认 `perView` 路径先收集各 view 的 query save，再一次调用 `DataView.saveQueryViews`；它要求所有有变更的 view 共享同一 scenario 与 query executor，然后执行一次 `executor.save({changes:[...]})`，并逐 view 校验唯一 metaName 回执。故模型行与字段行可先分别由当前 `designModels/designFields` owner `addRow()` 取得 rowid，在保存前读完来源字段、构造两表 pending rows，再提交给该 owner 聚合。这里证实的是一次 executor save 调用；后端对 changes 数组的事务/原子/部分提交语义仍未知，不能宣称原子或 exactly-once。显式 `transaction` mode 另需配置 transaction endpoint；目标场景是否配置仍未知。
- 当前 `DataSpaceDesignApi.read()` 是设计快照读取；内部 `readFormalSourceKey` 只在正式数据库表模型读取闭包中复验 `View_TblList` 的 `tblname+dbid` 唯一身份并读取 `Base_TblField` 主键，未提供六类来源候选分页/过滤读取 API，也不是新增写入 owner。模型创建/字段写入仍用当前场景正式 DataView owner。
- 当前草案标题/白名单仍只列数据库表来源模型入口；本批若恢复六类，须由主控替换/修订该草案，不应把本证据当成已批准的扩大范围。见 `notes/plan-data-space-table-model-create.md:3-5,17-31`。

## 最少新增能力建议与未知项

1. 用一项固定场景、类型白名单的只读来源查询能力承接六种来源表名/字段映射及统一 `contains`/AND/分页合同；按当前查询权限逐原行投影安全 DTO。UI 复用四文件已有布局、筛选/分页/单选控件，不新建来源专用 Vue picker 或通用来源框架。
2. 确认时按真实来源身份重新查询并核唯一性；来源字段/参数读取按来源类型使用精确 metaName/filter/字段白名单。字典/JSON 使用有合同的静态种子；动态来源字段类型须真实可读，不以 `varchar` 掩盖缺值。参数 `parzdtype` 在当前 wire 缺失时，不得因此禁用接口/逻辑视图；若复用参考行为，应将 `varchar` 标明为显式缺类型默认。另校验字段名、来源关联和可证明的主键语义。
3. 只用 `designModels`/`designFields` DataView owner 构造正式新增行和保存回执，再精确回读。可先生成 model rowid、预读字段并构造两组待新增行；同一 DataSet 默认路径会聚合两 view 为一次 `executor.save({changes:[model,fields]})`，可缩短参考仓两阶段调用之间的失败窗口。必须检查聚合结果及每个模型的正式回执/精确回读；server 是否原子、某一 change 是否已写仍未知，失败后不自动补偿或重放。

仍未知：六来源在当前 8D 的可用查询身份和逐原行/字段读权限；四个动态字段来源（table/interface/logicView/databaseView）各自真实字段 wire/主键规则；接口/逻辑视图参数读取是否在目标合同中可达；`executor.save` 对多模型 changes 的服务端处理、部分失败回执及事务原子语义。来源候选读取权限实现由并行 writer 负责，本文不重复设计。

## 精确源码索引

参考仓均为上述固定 SHA：

- `apps/appworks/src/data/api/data-set/design/records.ts:47-59,160-184,186-241` — 类型标签、来源字段归一化、六来源 metaName/fieldMap。
- `apps/appworks/src/data/api/services/source-record.ts:33-45,61-84,86-101,121-198` — 候选映射、过滤/分页、输入参数、静态及动态字段种子。
- `apps/appworks/src/ui/composables/dialog/modelSource.ts:34-54,97-163` — tab、UI列、分页默认、请求过期和选择清理。
- `apps/appworks/src/data/api/data-set/design/source.ts:86-142` — 创建模型 payload 与唯一名入口；`apps/appworks/src/data/utils/text.ts:88-106` — 冲突名后缀算法。
- `apps/appworks/src/data/api/data-set/design/model.ts:14-78` — 模型保存 wire 字段、rowid 与缺省值；`apps/appworks/src/data/api/data-set/design/data-space-design.ts:384-425,520-552,769-789` — 来源查询、来源字段/参数读取、初始字段、正式模型保存回执。
- `apps/appworks/src/ui/features/data-platform/data-set-management/design/ui/data-set-design-page.vue:163-231`、`.../use-data-set-design-page.ts:207-224,1022-1192` — 表格选中与确认、普通新增/占位/替换/暂存分支。
- 当前在线观察：`notes/evidence/sparkproject-appworks-integration/four-file-correction/model-source-live-contract.json` — 六类列表可达、实际 wire keys/counts、table/databaseView 原行字段读权限与接口/逻辑视图参数行缺省列。
- 参数存储定义：`E:\lowcode-jdk17\data\heec\mysql-init\platform-schema.sql:6307-6337` — 参数物理列及 `(parid,lingma_sys_ent)` 复合主键；定义包含 `parzdtype`，不能替代 live query wire 投影证据。

本仓当前合同：`config/pages/data-platform/data-space-design/pagedata.json:2-83`；`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:52-65,602-620,741-797`；`packages/spark-data/src/data-view.ts:1912-1928,2019-2063`；`packages/spark-data/src/dataset.ts:1332-1343,1399-1419,1707-1739`；`packages/spark-data/src/types.ts:1253-1264,1311-1343`。
