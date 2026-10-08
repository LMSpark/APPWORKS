# 数据空间设计正式表编辑合同盘点

状态：只读对账；未改生产代码、测试、在线数据或源仓。

## 对照对象

- 参考固定提交：`E:/r/sparkproject` `842dec4f11b333df904b9a4e26b6566b0802bab8`。
- 参考 UI owner：`apps/appworks/src/ui/features/data-platform/data-set-management/design/ui/use-data-set-design-page.ts`、节点面板 `.../node-panel/use-data-set-design-node-panel.ts`、连线面板 `.../edge-panel/use-data-set-design-edge-panel.ts`。
- 参考正式写 owner：`apps/appworks/src/data/api/data-set/design/data-space-design.ts`。
- 当前只读页：`config/pages/data-platform/data-space-design/{script.js,rule.json,pagedata.json}`；目录写 owner：`config/pages/data-platform/data-space-catalog/script.js` 的 `editCatalogEntry`。
- `pilot-design-read-page-result.md` 记录读取挂载/权限/刷新证据；当前设计 rule 的正式 `Name` 字段修正确认在本地测试，不改变本报告的写入判断。

## 操作、字段与正式保存合同

| 操作入口 / 参考 UI 方法 | 当前 formal DataView 覆盖 | 可变字段、必填与联动 | 固定源写次序及回读 | 当前结论 / 风险 |
|---|---|---|---|---|
| 现有模型节点 → 节点面板“元模型/请求设置” → `handleSaveMetaAndRequest`（node panel）；模型名失焦校验 `handleModelNameBlur` | `designModels` 当前脚本取 `rowid, MetaName, description, Type, dataSetId`；**未取 `Name`**。规则目前显示 MetaName/description/Type，未提供编辑控件。正式身份为 `rowid`，归属 `dataSetId`。 | 普通既有模型首选可变 `Name`（节点显示名称）；非空且在当前模型集合内不得与其他模型同名。保存载荷保留 `MetaName`、`description`、Type、DbId 等来源身份/内容，不由此方法编辑它们。请求设置可编辑 `IsBusinessMain, IsBusiness, OutputType, Filter, parentField, hasChildField, selfType, topValue, cacheType, RequestComplete`；元模型/请求设置保存还会合并字段草稿。`MetaName` 是来源元名称/读源键，在这个既有编辑方法中原样保留；不能把它当成普通重命名字段直接改。 | `saveModel(changed model)` → `syncModelFields(modelId, nextFields, prevFields)` → `readFields()`；仅字段合同有改变时做字段合同 readback。此方法本身未独立 `readModels()` 并精确核对模型 Name 回执。源码 `saveModel` 通过 `api.save` 返回 receipt/rowid；UI常规路径未证明其 `success` 和正式模型值已独立回读。 | **撤回“首选 Name”的小闭环建议。** 虽然失焦检查只校验非空/模型集内重名，但 `Name` 同时是正式运行模型的查询 `metaName`、预览图关系表名和关系预览键；关系写入还会把父 `Name` 派生到 child `PId`。只改 Name 没有同步或精确回读这些依赖，不能作为安全的独立字段闭环。候选更小操作见下方“Name 重命名反向影响与最小独立操作”。 |
| 新增/换来源模型 → 页面工具栏“新增模型”或节点面板“更换模型” → `handleConfirmAddSource` | 当前 `designModels` 取 `MetaName/description/Type/dataSetId`，未取 `Name, DbId, DatabaseName, items` 等写回基线字段；当前字段视图也不包含完整来源字段载荷。 | 新增模型由选择来源生成 ID/来源字段；唯一名称使用 `createUniqueModelName`。换来源会重建正式字段草稿，保留计算字段，并对接口/逻辑视图合并参数字段；这不是普通 Name 编辑。不可直接更改 `Type/DbId/MetaName` 假装完成来源同步。 | 新模型保存后才读/构建初始字段并调用 `syncModelFields`；待配置节点换来源可能先按生成 rowid 强制 add、再 `readModels()` 推断正式 rowid、写字段；路径中间失败可能已有模型落库但字段未齐。随后 `readFields()`，必要时再持久化图。 | 不是首个改动闭环；涉及来源查询、多写和部分失败。需独立拆分，逐阶段核正式 ID 与关联回读。 |
| 节点“字段”页 → `openFieldDialog` / `handleConfirmFieldDialog` / `handleSaveCurrentTab`→`handleSaveMetaAndRequest` | 当前 `designFields` 取 `rowid, Name, AsName, FieldType, IsOutput, IsPKey, dataSetId, dataModelId`；缺 `type, description, ValueFun, Expression, allowAIAdd, OrderType, Order, Group`。 | 字段对话框：`Name` 必填；`FieldType`、`AsName` 必填。普通来源字段编辑时保留原 Name，只有计算字段允许在对话框改 Name；计算字段不能设正式主键；每模型至多一个 `IsPKey`，主键强制 `IsOutput`。仅计算字段可删除。表内双击可编辑列严格为 `description, AsName, OrderType, Order, Group`。值函数与表达式、输出/主键通过相应字段/前端模型设置修改。来源字段更新会重建并合并字段，不等于直接编辑。 | 对话框只改本地 rows；保存按差异执行 `syncModelFields`，再 `readFields()`；字段合同变化先弹确认、调用 `assertFieldContractBaseline` 与最新字段合同比较，保存后 `assertFieldContractReadback` 比较字段数及身份/合同。前端模型另用 `handleSaveFrontModel` 保存 `Expression/allowAIAdd`，之后 `readFields()`、刷新前端字段。 | 当前展示字段虽然够读，但不能支持正式编辑：需拓宽查询投影及在每行重验 dataSetId/dataModelId/rowid 和 field/action/write 权限。不能因表格展示值可见就认定可写；不同字段变更的源契约、同步副作用与回读范围需保留。 |
| 连线选中 → 连线设置面板 → `persistRelation(false/true)` | 当前 `designRelations` 取 `rowid, dataSetId, parentModId, childModId, depType, filter, cascadeDel`；模型 DataView 未取 Join 字段；关系视图有关系身份及关联列。 | 端点由当前图选择解析为 parent/child 模型 ID；要求双方属于当前 dataSet。拒绝同一 parent-child 有多条正式关系。可写关系 `depType/filter/childTable/parentTable`，`cascadeDel` 保留现值（缺省代码为0），当前 UI未编辑它。filter 必须通过 `parseSparkQueryFilter`。关联查询设置 `JoinType/ForeignKeyFields/JoinFilter` 若有任一值则三者必须齐全；同时派生 child model `PId=parent.Name`。 | `saveRelations` 在同一正式 save batch 同时变更 child model 与 relation（或删除 relation）；要求成功回执及正式 rowid。并行 `readModels/readRelations`，核对子模型联表字段、关系 rowid、端点、dataSetId、table labels、depType、cascadeDel 与filter；确认后刷新内存，再单独保存图文件。删除连线时关系删除及子模型关联配置清空同批提交。 | 当前模型查询不足以构造/回读这组载荷，需增加正式模型依赖字段并在两 view 上校验写权限。关系回执不等于布局文件保存回执；数据保存成功而图保存失败时 UI明示不确定。 |
| 顶栏“输入参数” → `openInputParamDialog` / `handleAddInputParam` / `handleDeleteInputParam` / `handleSaveInputParams` | `designParameters` 当前只查询 `rowid,inputParams`；每个参数是 inputParams JSON 内对象，不是单独 DataView 行。 | 写入对象为 `Name, Description, IsBusParam, rowid`；仅 `Name` 必填，无唯一名称检查。原 rowid 保留，无 rowid 时产生 GUID。新增/删除在对话框本地完成，点保存才整批替换 JSON。不要虚构额外默认字段或参数 ID。 | `AppWorksDataSpaceDesign.saveInputParams` 把这些对象序列化为单条 `Base_DataSet.changed[{rowid:dataSpaceId,inputParams}]`，交 `api.save`；旧 UI只 await 后更新本地 state/成功提示，没有检查返回 success、按 rowid 重读 inputParams 或比对正式 JSON。 | 当前表级视图已读 inputParams，但脚本只做读取/解析，未做 write/action/field 权限门禁。迁移时需从 `designParameters` query owner 检查目标身份、`editActionState` 与 inputParams 写权；按 DataView save owner 后刷新目标行并解析回读 JSON。注意它与模型字段中的 `type=inputParams`、`ValueFun` 是另一种数据：后者属于模型字段联动，不要混为同一“输入参数”表。 |
| 工具栏“保存”/各模型关系操作后图持久化 → `handleSaveDesign` / `notifySaveSuccessWithGraphPersist` | 当前页面使用受限 `$page.readDataSpaceLayout`，没有 layout writer。 | 图文件是独立资源：模型 node 坐标/关系 edge、graphVersion，不是 DataView 字段。缺失图重建有独立的 preview/confirm/preimage/fingerprint 流程，不能套普通保存。 | 旧 owner 使用 `writeGraph`（`writeScenarioText`, replace=true）单独上传；普通保存未逐字节读回。特定编辑在表写入/读回后才 `persistCurrentDesignGraph`；布局写失败会与正式表保存成功分别提示。 | 表保存、图保存是分立回执，不是跨资产事务。当前 capability 只读；未计划并签收布局写 capability 前不能加画布保存。 |

## 当前 DataView 权限与保存 owner 对照

- 当前 `reloadDesign` 对 designTarget/parameters/models/fields/relations 各执行一次完整查询，并把 DataView、DataSet、rows 引用及 requestState 放入 snapshot。必需身份/归属/关联字段使用 `fieldAccess(...).read==='visible'`；普通展示列由 `r-text` 执行 hidden/masked 投影。页面 rule 的表列均 readonly；当前脚本没有任何 `editActionState`、`addActionState`、`fieldAccess(...).write` 调用，所以目前**没有设计写权限授权或保存入口**。
- 视图绑定：`designModels -> #8D...@Base_DataModel@designModels`，`designFields -> #8D...@Base_DataModel_Field@designFields`，`designParameters -> #8D...@Base_DataSet@designParameters`，`designRelations -> #8D...@Base_DataModel_Relation@designRelations`；四视图 `autoLoad:false,pageSize:500,rowid升序,selectionDelimiter:''`。实际请求见当前 `script.js`：Models 缺 `Name`；Fields 缺 `description/type/ValueFun/Expression/allowAIAdd/OrderType/Order/Group`；Relations 缺 child model `JoinType/ForeignKeyFields/JoinFilter/PId` 所属的模型字段；Parameters 仅以父数据集的 JSON 字符串承载。
- 当前已验目录 `editCatalogEntry` 是现成 DataView 写入模式：复核当前行/rowid、`editActionState`；按字段 `write==='allowed'` 构造可编辑集合；再次确认授权后 `editRowById(id,patch)` → `dataSet.saveChanges({views:[{tableName:'Base_DataSet',viewId:'catalog',ids:[id]}]})` → 精确确认 `result.success` → `view.refresh()` → 按原主键查回记录。它处理 unknown receipt 阻止重试；但仍须对本次实际字段值做明确 readback assertion，不能仅以行存在当精确核验。
- 四文件集成路线已明确：优先复用 query-backed DataView `addRow/editRowById/removeRow/saveChanges` 与同一 query-save owner，不把 `DataSpaceRuntimeApi.save` 直接暴露给脚本。`DataSpaceDesignApi.prepareMutation`/command prepare 也不是保存，不能用其返回值假报成功。实际 DataView save 的后端权限仍需逐请求 owner和receipt验证，不能假设 admin等同于全允许；不引入角色模型。

## 建议的第一个最小闭环

撤回模型 `Name` 单字段重命名建议：它是运行查询注册 `metaName`，同时被预览关系表名、关系校验/预览数据键、child `PId` 派生及数据处理按名称查找消费；标准模型保存不迁移这些引用。详细源码链见下方“Name 重命名反向影响与最小独立操作”。

源码语义上更独立的最小候选是**编辑一个既有模型字段的 `description`**：参考节点字段表将其列为可编辑列，正式 contract 只将其映射为字段描述元数据；模型/字段身份和关联仍由 `rowid/dataSetId/dataModelId/Name/AsName` 等决定。改 description 会改变节点/关系字段选择项的可读标签（`description || Name`），但未发现其参与运行查询标识、关系端点或请求字段键。它尚不是当前页面的可用写能力，仍须按下方列出的 DataView owner、row/action/field write 权限、保存回执和原 rowid 精确回读闭环实施；若正式权限不允许，则不编辑。
尚未核实：正式线上 model Name 的 write/action 权限回执、字段视图现有 `writeState` 与 `editActionState`、DataView 的规范化保存回执字段、并发修改保护/读后写 preimage要求、MetaName 是否后端也有额外不可变校验。以上需用真实只读 schema/专用响应夹具/当前 API 源码确认，不能用 admin 特权或角色分支跳过。

## Name 重命名反向影响与最小独立操作

固定参考提交 `842dec4f11b333df904b9a4e26b6566b0802bab8` 的调用链显示，模型 `Name` 不是纯显示文案：

| 消费位置 / 源方法 | `Name` 的实际用途与影响 | 是否由单字段重命名同步 |
|---|---|---|
| 节点面板 `handleModelNameBlur`、`handleSaveMetaAndRequest` | blur 仅检查非空和当前 `state.models` 内重名。保存会将新 `Name` 与原 `MetaName/description/Type/DbId/Join* /PId`、请求字段一起写入模型，再同步字段、回读字段并更新本地图节点；没有单独回读并精确核对模型 `Name`。 | 否。方法不会扫描或更新其他模型、关系记录、场景绑定。 |
| 关系面板 `assignForm`、`persistRelation` | 关系 `parentTable/childTable` 初始取端点模型 `MetaName || Name`；保存时作为关系字段持久化。若关联 join filter 存在，保存还显式派生 `child.PId = parentModel.Name`，并将 child model 与关系一起提交。 | 否。父模型重命名操作不运行 relation 保存，也不更新 child `PId` 或 relation table labels。 |
| 预览校验 `topologicalSortModels`（`preview.ts`） | 要求 `relation.parentTable === parent.Name` 且 `relation.childTable === child.Name`；预览数据还以 `relation.parentTable` 为键读取。重命名可能令已存关系校验失败或数据键失配。 | 否。 |
| 正式运行 `DataSpaceRuntimeApi.readModel` / `buildFormalDataSpaceModels` | `readModel` 按当前 `dataSetId` 与 `Name === input.metaName` 查模型并要求唯一精确匹配；formal contract 将 `Name` 映射为 `metaName` 和运行模型 `name`。调用方使用的 `metaName` 因而受此标识变化影响。`MetaName` 是来源名，`DbId/PId` 在这里又映射为来源 ID，须与关系保存派生的 child `PId=parent.Name` 用途区分。 | 否。单表写入不会迁移调用方传入的旧 `metaName`，也未证明全场景注册名同步。 |
| 节点面板数据处理模型解析 / 运行预览绑定 | 固定源 state 的 `getModelByName` 先按 `Name`、再按 `MetaName` 解析；部分数据处理操作以模型名定位 add/update/delete 目标。 | 否。改名可能使名字绑定解析到不同项或失效。 |

因此，不能建议只改父模型 `Name`；安全迁移需另外盘点/迁移受影响关系表名、child `PId`、运行 `metaName` 调用方和数据处理目标绑定，并逐项正式回读，这超出单字段小闭环。

**更小的候选：只改一个既有模型字段的 `description`。** 固定源节点面板 `editableFieldColumns` 包含 `description`，字段行可内联编辑，并由既有 `handleSaveMetaAndRequest` 汇入字段同步；字段 `Name/AsName/FieldType/IsOutput/IsPKey` 等身份和合同不变。正式运行 contract 将字段 description 投影为描述元数据，运行查询/主键映射依字段 `Name/AsName` 和输出/主键合同完成，没有将字段 description 用作模型/关系标识的证据。它会改变节点面板、关系字段选择项的可读标签（多处用 `description || Name`），所以是展示层变化，但不应改变关系端点、字段选择值或请求字段键。

这只是**源码语义上相对独立的最小候选**，不是当前页面已具备的写能力：当前 `designFields` DataView 未查询 `description`，当前规则只读，且脚本没有 action/write 授权。若后续实施，仍须在批准范围内补 description 查询投影、核当前 DataView row/view owner 与 `dataSetId/dataModelId/rowid`，对该行 `editActionState` 和 `fieldAccess(description).write` 做正式检查，以既有 DataView 保存 owner 持久化、refresh 后按同一 rowid 精确核对 description；不得依赖旧 UI 的授权假设或直接调用 `prepareMutation` 冒充保存。若权限不可写或字段读值 hidden/masked，则此候选也不能编辑。

## 输入参数编辑候选、renderer 与 dirty 恢复对账

| 操作/源码方法 | 当前 formal DataView 字段与 owner | 权限、ID 与字段合同 | 保存/回读 | 当前结论 |
|---|---|---|---|---|
| 参数 dialog：`openInputParamDialog`、`handleAddInputParam`、`handleDeleteInputParam`、`handleSaveInputParams`（参考 `apps/appworks/src/ui/features/data-platform/data-set-management/design/ui/use-data-set-design-page.ts`） | 当前四文件设计页 `designParameters` 从正式 `Base_DataSet` 行读取 `rowid,inputParams`；`pagedata.json` 的现有绑定即该 owner。没有把数组项拆成 DataView 行的合同。 | `records.ts::normalizeInputParam` 正式识别 `Name/name`、`Description/description`、`rowid/ROWID/RowID/rowId/id/Id`，并保留未知属性；只有完全缺 ID 才调用 `createSparkGuid()`。Name trim 后必填、Description trim、IsBusParam 按 Boolean 解释。已有任一 ID alias 的原键和值是身份，不可重新生成覆盖；完全缺 ID 的 legacy item 按源规则补一次稳定 GUID；编辑别名字段时加/更新规范键，但保留旧别名及其它未知键。旧 `saveInputParams` 序列化四个正式字段会剥离额外属性，新计划需按原对象浅拷贝保留它们。 | 参考 `data-space-design.ts::saveInputParams` 调统一 `api.save`，写入 `Base_DataSet`、同 dataSpace rowid 的 inputParams JSON。新页仍应通过当前 owner `DataView.editRowById` 后 `DataSet.saveChanges({views:[{tableName:'Base_DataSet',viewId:'designParameters',ids:[targetId]}]})`；receipt 后重新用正式查询核同一行、每项稳定 ID、已知字段投影与未知属性。 | `models=[]` 不妨碍此操作。查询仅为当前 Base_DataSet row，不依赖 model/field/relation view；权限仍必须按本次 row/field owner 的 E/action 和 inputParams visible/write allowed 核验。输入中 Name 可暂空、不 trim；最终确认才 trim/必填。 |
| 新参数 ID | 页面 script sandbox 测试 `createSandbox.test.ts` 明确拦截 `globalThis`，故 script 不能直接访问 Web Crypto；当前 `PageRuntime` 使用 `crypto.randomUUID()` 生成 runtime instance ID。固定参考 `createSparkGuid` 实现为 `crypto.getRandomValues(new Uint8Array(16))`，编码成 32 uppercase hex，且没有后端格式 validator。 | 当前仓库通用 `PrimaryKeyGenerator` 是 DataView 行主键生成器，不能把它的行 PK 混用为嵌套参数 rowid；`spark-json-document::generateUid()` 是树节点 UI ID（12 hex），也不合适。 | 新可信 renderer 在宿主组件内调用 `crypto.getRandomValues` 并采用已核实 SparkGuid 的 32 位大写编码；无 Web Crypto 时禁新增，不降级到 Math.random。组件测试和真实 renderer mount 需证明新 ID 被正式保存/读回保留。 | 当前无可由页面脚本直接 import 的 SparkGuid 工具；可信 renderer 可持 ID 创建能力，但不得持有业务保存/授权职责。 |
| 参数数组 UI | 已注册 `json-editor` 是通用 JSON 文档编辑器；`JsonTreeEditor.vue` 虽由 spark-component 公共 barrel 导出，但未注册到 `register-renderers.ts`/`SparkComponentRenderer.vue` allowlist。rule 没有 repeat/array 表单；`r-table` 使用 DataView binding，不能为数组项造第二 DataView。 | 只展示 Name/Description/IsBusParam，rowid 稳定；未知属性保存在对象但不渲染。 | 采用本应用配对组件 `src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue` + `.props.ts`，只做参数数组行控件及 Web Crypto rowid，无 DataView/API/权限。复用 `DataSpaceDesignGraph.vue` 路径扫描：`COMPONENT_SCAN_PATTERNS` 的 `./src/views/**/*.vue`，无需 package barrel/register/allowlist。扫描回归用既有 `tests/app/config/spark-components-loading.test.ts`，真实组件测试计划放 `tests/ui/views/data-space-parameters-editor.test.ts`。 | 四文件 rule 持入口/dialog/确认取消；组件变更由 rule `props.on` 传给 script。script 校验并保存；没有迁移回业务整页 Vue。 |
| 取消、dirty、unknown receipt | `DataView.discardEditingRows(ids)`（`packages/spark-data/src/data-view.ts:1696`）仅丢未应用 editing patch；`editRowById()` 会替换 row 并标 dirty。两层状态不同。 | Cancel 在 DataSet save 前只清 editing overlay，故能零写且runtime干净；确认才应用 patch 并保存。输入中允许 Name 暂空/带空格；只在最终确认 trim 并必填，避免受控表单每次 change 校验打断用户输入。 | `DataView.refresh()`、`PageRuntime.isDirty`、tab close、`PageRuntimePool.closePageRuntime`、`PageRuntime.reload` 对应用后 dirty 都有阻止。unknown save 后不得“离开重开”或只调 discardEditingRows。依已批准 `notes/plan-data-view-discard-pending-changes.md`，用户明确放弃后先同步 `discardPendingChanges([id])` 恢复强 baseline并清本地 pending（不发请求），再由原 query owner 显式 fresh `refresh()`。fresh query 成功才以服务器 old/new 值替换状态；失败时本地修改已丢弃，baseline 保留但标 stale/不可写，不能称 server rollback/自动重试/草稿保留。恢复控件须在全页内容 gate 外。 | DataView discard 依赖现已获主控批准；实施顺序及 remount 约束见 `notes/plan-data-space-input-parameters-edit.md`。 |

参数页面候选路线为“先完成主控并行 DataView dirty 恢复计划，再增加本应用自动扫描参数控件与四文件页薄编排”。本追加为只读源码对账与计划输入，不代表已有组件或运行页面已经实现这些能力。

### 已批准恢复依赖与页面重挂载约束（计划补充）

未知保存回执后的业务语义固定为：用户明确放弃 → 同步恢复同一 DataView 强 query baseline、清除本地 pending → 原 query owner 显式 fresh query。query 失败时本地修改已经放弃；旧 baseline 保留但 stale/不可写，不表示服务器回滚，也不表示本地草稿仍在。页面 `__init__` / renderer remount 应复用现有 PageRuntime/DataSet/DataView，从当前完整真实 view 重建权限与完整性 snapshot；参数草稿如仍在 editing overlay 则用 `getEditingRow` 读取，布局仍走现有 layout read API，不得无条件 `reloadDesign`/创建第二 DataSet 覆盖 dirty。stale/failed 时恢复入口须处于整页内容 gate 外。


## M0 模型新增预研（只读；2026-10-08）

### 范围与现状

本节对照固定 `E:/r/sparkproject` 提交 `842dec4f11b333df904b9a4e26b6566b0802bab8` 的模型新增 UI/API，并核对当前 AppWorks 8D 页面、`DataSpaceDesignApi`、`DataSpaceRuntimeApi` 与 DataView owner。主控给定目标空间 `97DCB03F75AADEAE6B102B062DB71CEA` 当前 `models=[]`；此值和空模型状态作为主控已有证据引用，本轮没有在线查询或改写，也没有修改 90A 目录/平台元数据。未从源码证据得到任何可用物理来源行 ID，因此本节不指定 source/model/field ID。

当前页面 `config/pages/data-platform/data-space-design/pagedata.json` 只绑定 8D 下的 `Base_DataModel@designModels`、`Base_DataModel_Field@designFields`、参数及关系视图。`script.js` 仅加载/呈现，没有新增模型入口、`addActionState`、`fieldAccess(...).write` 或保存调用；Models 当前投影也缺 `Name/DbId/DatabaseName`，Fields 投影缺描述等编辑合同。`DataSpaceDesignApi` 当前公开正式读 `readModels/readModel/readRelations` 与 `prepareMutation`，没有 source-page 或模型/字段持久化 API；`DataSpaceRuntimeApi.query` 可由 trusted TypeScript owner 按场景查询，但脚本 `$page` 只提供 `getDataSet/resolveView`、基础交互和布局 reader，没有任意模型查询/HTTP，也没有动态 source-picker capability。当前 `PageServiceCapability.selectEntities` 接收静态 options，不带加载回调。

### 最小可真实创建的模型种类与来源 ID

推荐首个闭环只新增**数据库表来源模型**（固定源 `sourceType: 'table'` / 正式 `Type: '数据库表'`），并且只允许用户从 8D design scope 实际读取的 `View_TblList` 候选中选一条通过字段预检的表：

- 选择回来的 `source.rowid` 是实际来源目录记录身份，用它查询 `Base_TblField.tblid`；`source.name` 是 `tblname`/模型 `MetaName`，`source.dbid` 与 `source.databaseName` 分别是 `dbid` 和数据库名。四个值必须来自同一次受限来源查询结果，不由空间 ID、模型名或常量拼造。
- 还须按该真实来源 rowid 完整读取 `Base_TblField`，确保关联一致，且恰好有一个非 `lingma_sys_ent` 主键字段和至少一个非空字段名。当前 formal `DataSpaceDesignApi.readModel()` 对数据库表会独立按 `tblname+dbid` 唯一回读 `View_TblList`，按真实来源 rowid 读 `Base_TblField`，再次要求恰有一个非租户主键；这使无有效主键的来源不能成为首个可读正式模型。
- 模型 `Name` 需在当前目标空间模型中唯一；固定 UI 以来源名为基底执行 `createUniqueModelName`。模型 `MetaName` 保留物理源表名，两者不能合并。`dataSetId` 必须来自已验证的目标目录 DataView 行。
- 新 rowid 应来自当前 8D `designModels` 查询 owner 的 `DataView.addRow()`/`prepareNewRow` 或其真实保存回执，不应把固定参考源码里的 `createSparkGuid()` 硬编码为线上事实，更不得复用 97DC、90A 或测试样例 ID。当前 owner 的 `prepareNewRow()` 在正式 key 字段有效时用 Web Crypto 产生候选主键；成功保存回执和重新查询才确认正式 ID。

不建议把字典型模型作为首个 M0：固定源 `dict` 初始字段是静态 seed，`rowid` seed 并未标 `IsPKey`，而当前正式模型读口要求能把模型主键唯一映射到一个已输出、非计算的主键字段；字典还需要另外明确 `PrimaryKeyFields`/主键合同。普通数据库表来源已经带真实 PK 字段与来源身份，步骤更少、正式读回校验更直接。数据库视图也暂不选作首项：formal `readModel` 的来源主键路径特别针对数据库表；先扩展其确切正式 key 合同会增加范围。

### 字段必需值与默认值来源

固定源 `source.ts::buildDataModelPayloadFromSource` 对表来源生成 `dataSetId`、`Type='数据库表'`、唯一 `Name`、`MetaName=source.name`、`description=source.description`、`DbId=source.dbid`、`DatabaseName=source.databaseName`。固定源 `model.ts::buildDataModelSaveRecord` 把这些字段规范化并把数据库名写成 `DbName`；普通“新增模型”分支先以该 payload 保存模型，随后用保存返回的 rowid 构造字段。可选的 `items/API/请求/关联` 设置不是首个来源模型的必需字段；不能仅为了凑字段而赋空值冒充业务默认值。

固定源 `services/source-record.ts::buildSourceDataModelFieldPayloads` 只取非空 `enname`，字段默认值来源为真实来源字段：`Name=enname`、`description=cnname || Memo`、`FieldType=DataTypeName || 'varchar'`、`IsPKey=IsPKey`、`IsOutput=IsPKey`。每字段共同默认 `type='dataModel'`、`AsName=''`、`ValueFun=''`、`Expression=''`、`allowAIAdd=0`、`OrderType=''`、`Order=0`、`Group=0`；正式字段 rowid 由 owner/正式保存层创建。首个模型的唯一 key 必须仍是 output；因此这一默认即使非主键字段暂不 output，也满足当前 `readModel` 的最低 key 条件，后续用户可在授权允许时再开放其它字段。

### GUI、host 与现有 owner

固定参考页用 Element Plus `el-dialog` + `el-tabs` + `el-table`（按 `rowid` 选择一行）+ `el-pagination`，提供表名/描述/数据库过滤；`useModelSourceDialog` 负责 tab/分页查询、清理旧结果和丢弃关闭后的迟到响应。M0 可缩为一个“数据库表”选择页，不需先实现字典/接口/JSON/逻辑视图等 tabs。

当前 renderer registry 已有 `r-dialog`、`r-tabs`、`r-tab-pane`、`r-table`、`r-button`、`r-text`、`r-pagination` 等可视积木，但 `r-table` 通过 `dataViewKey` 绑定正式 DataView；单有这些组件和 `$page.selectEntities()` 静态选择器并不能发起受限的 `View_TblList` 查询或把分页异步结果当 DataView 使用。故实施入口必须先选择一种明确 host/data owner 路线：给现有正式设计 API 增加**只读且场景固定的来源列表/来源字段读取能力**并由可信 host 暴露给本页；或预装一个确有正式 query owner 的 source-picker DataView/专用可信 picker component。不能从 script 直接构造 URL、访问 `lowcodeHttp`、借用 90A 的目录 view 或拷贝旧 Vue composable 的 raw query。

模型和字段持久化仍应使用本页既有 `designModels` / `designFields` 的 query-backed DataView 与 8D DataSet save owner；不是调用 `DataSpaceDesignApi.prepareMutation()`（它只准备命令），也不是在 script 使用另一个 runtime/client。`DataView.addRow()` 依原 query context 准备正式主键，`DataSet.saveChanges({views:[...]})` 经该 view 的统一 owner 保存；增加前脚本必须检查 `addActionState()==='enabled'`，更新现存字段时按该行 `editActionState` 与各字段 `fieldAccess(...).write==='allowed'` 门控。新增行没有原行 permission map，不能把某行的 `e/r` 权限复制给它；新增只凭原查询 add grant 加后端实际授权/回执。`DataSpaceQueryContext.fieldAccess` 对没有原查询身份的行返回 denied，所以在 field-save 后应先 refresh 形成新的正式权限上下文再启用后续编辑。

### 保存顺序、回读与失败边界

固定普通新增路径的真实顺序是 `saveModel(payload)` → 使用保存回执 rowid 调 `buildInitialFields(sourceRowId)` → `syncModelFields(modelId, initialFields, [])` → `readFields()`。新 rowid 是外键连接的关键，字段不能使用临时 UI id。旧路径没有严格单独 `readModels()`/`readModel()` 精确回读刚建模型，也没有在字段读回后证明模型来源字段与数量都对应本次 source；它只能证明历史 UI 顺序，不能作为本次完整验收标准。

建议新实现按真实回执拆成两阶段：先经 `designModels` owner 新增一条，检查保存结果成功，再 refresh 同 owner，以回执 rowid 精确找唯一目标并核对 `dataSetId/Name/Type/MetaName/DbId/DatabaseName`；随后才用该已读回 rowid 生成字段草稿，通过 `designFields` owner 新增；再次保存成功后 refresh fields，按 `dataSetId/dataModelId` 核对来源字段集合、唯一正式字段 rowid 和 key 的 `IsPKey=1 && IsOutput=1`，最后用 `DataSpaceDesignApi.readModel({designScenarioId:8D,dataSpaceId,metaName:Name})` 做正式合同回读。因为 model 与 field 关联依赖真实模型 ID，不要在尚未确认服务器接纳其 ID 前将临时 ID 批量写进字段。

模型保存已成功而字段创建/保存/回读失败属于部分成功：重读并明确展示现存正式模型与缺失/不完整字段，停止自动重试/重建/补偿删除；由用户选择再次核对或继续修复。未知回执不等于服务器没写，模型/字段删除必须另行具备明确 delete action、row 身份、权限及服务端回执；本预研不承诺或触发永久删除。两个表保存并非跨资产事务。

### 精确建议范围与未证实项

下一实施计划应只针对 8D 的一条 table-backed 模型创建闭环、初始来源字段和后续至少一种字段编辑（字段投影/校验需包含真实合同字段），复用 `designModels`/`designFields` owner；不得改 90A 元数据、生成空模型/假 source ID、扩成六种来源、写关系/布局或改后端。开工前还要从当前真实 query context 验证 97DC 的 add grant、required model/field columns 和 save receipt 实际形状；若用户当前身份没有 create grant，则只可报告受权阻塞，不借管理员或伪造权限绕过。

本轮没有在线读取具体来源候选，没有写入 97DC/90A，也未创建模型；源候选真实 ID、source form 下每个列的读权限、目标 8D `Base_DataModel`/`Base_DataModel_Field` 的 add/field write 授权、线上新增 save 的具体回执和字段 readback 仍待实施时用实际 host owner 核实。以上未证实项不是“可用来源”的断言。

### View_TblList 来源读取路线修正（只读探针补充）

主控保存的 `pilot-design-source-models-probe.json`、`pilot-design-source-bindings-probe.json` 与 `pilot-design-source-key-probe.json` 把“目录可查询”与“可作为正式模型绑定”区分开了：8D 已登记 `View_TblList`（正式模型 ID `8D1AB14DD8277F3E7017CD38F77B09FDp004`）及 `Base_TblField`（`8D1AB14DD8277F3E7017CD38F77B09FDp010`）；后者 `readModel` 可装配 `rowid` 主键。`View_TblList` 声明为 `Type=数据库视图`、`PrimaryKeyFields=null`，48 个字段没有 `IsPKey=1`；虽然 `rowid` 是输出字段，但并非主键，且 `tblname` 有两条输出字段、均无 `AsName`。在线只读绑定因此报“正式主键无法映射到唯一有效输出字段”。

这与当前源码的两条路径吻合。`DataSpaceDesignApi.readModel()` 对正式数据库表模型先按来源 `tblname+dbid` 查询 `View_TblList`，再取该来源 `Base_TblField`；`projectFormalModel()` 要求来源主键字段唯一、非计算、输出且正式标记为主键，并拒绝无法唯一映射的候选。这里的失败有正式声明和算法证据，不是“数据可能不完整”；不得放宽该验证去猜 `rowid`、从重复 `tblname` 输出中择一、伪造 `View_TblList` 主键/别名或改 8D 元数据。`View_TblList` 不适合作为绑定到 DataView 的正式模型。

但来源 picker 可沿现有可信 runtime 查询 owner 只读读取：`DataSpaceRuntimeApi.query({scenarioId: <固定8D>, metaName:'View_TblList'}, options)` 直接走 `DataSpaceQueryCache`，不要求先 `readModel()`/`bindModelView()`。返回的 `DataSpaceQueryContext` 持有本次查询快照，公开 `rows`、`rowKey(row)` 和逐行 `fieldAccess(rowKey, fieldName)`；构造时按每条原查询行建立权限对象，并从公开行剔除 `lingma_sys_key` 与 `lingma_sys_params`。因此窄 picker 可以使用真实查询行身份与本行读取权限，只投影用户可见的候选字段并以真实 `rowKey` 作为选择身份；scope 过期时 context 访问失效。实际哪些行/字段可见仍由当次查询回执决定，不能根据本次只读探针推断写权限。

现有页面脚本没有任意 `runtime.query` 能力；`$page.selectEntities()` 是静态 options 选择器，不能代替带权限快照的来源查询。后续若实施，最小桥接应是固定 8D、只读、受限分页的可信 host/picker owner，内部复用 `DataSpaceRuntimeApi.query` 与 `QueryContext.rowKey/fieldAccess`，只把白名单投影和选中行真实身份交给 UI；按已登记的 `Base_TblField` 正式模型读取所选来源字段，再执行来源关联与唯一非租户主键预检。不要向脚本暴露通用查询/HTTP，也不要为了来源浏览把 `View_TblList` 转成可写 DataView。若只能通过正式模型绑定得到来源，则此处应阻塞并先取得经批准的真实正式合同变更；当前已有直接 runtime query 路径，无须为 picker 先修复该视图模型的主键声明。

本补充只基于仓库实现及主控既有只读探针，不执行线上调用，不改模型/字段元数据，不创建模型，也未增加实现计划。来源候选实际可见字段、过滤分页和目标空间新增授权仍须由后续受限 owner 在真实授权身份下验证。

### 主控真实原查询反证（05:30，优先于上节推断）

pilot-design-source-query-probe.json：固定8D runtime.query View_TblList，tblname=Base_DataSet，明确fields rowid/tblname/dbid/DbName/tbldesc；返回total=1、rows=1，但QueryContext.rowKey无身份，五字段fieldAccess均invisible。证据仅保留投影后不可用标记，未泄漏原值。因此上节“只读picker可直接走该query owner”尚不具备线上可行性：原查询身份门未通过，不能读取raw rows绕过fieldAccess、硬编码rowid主键、按admin放行或改8D元数据凑通过。数据库表来源模型创建路径当前受此来源身份/权限合同限制；参数页独立闭环继续。需进一步核实正式来源owner/后端既有合同或真实其它来源后，再审定模型新增计划；不得宣称source picker已可用。
