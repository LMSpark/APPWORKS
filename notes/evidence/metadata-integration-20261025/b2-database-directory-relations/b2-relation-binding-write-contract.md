# B2 关系模型绑定写入合同（只读源码核对）

## 结论

现有 ModelCreate 与字段编辑流程能复用原数据空间 DataSet、权限和回执，不需要关系专用保存器。`Base_TblRln` 的正式物理来源身份和字段已在同目录 `b2-relation-source-inventory-report.md` 由正式 SPARK data API 核实。

关系消费者需要 11 个字段可用，不要求模型输出集合恰好只有这 11 个。当前来源 prepare 的默认状态会同时输出 `rowid` 与 `lingma_sys_ent`；实际字段编辑 UI 无法取消 `IsPKey=1` 行的输出，但本仓正式模型合同会按来源元数据把唯一业务主键解析为 `rowid`，不要求输出列集合排除租户字段。源码中没有拒绝这个额外输出列的查询或保存约束，因此这不是本批阻断，也不要求改通用来源映射。目标是保留默认两列，再将关系消费者清单中其余 10 个未输出字段设为输出；形成 12 个正式输出字段，其中 11 项满足当前消费者。若以后要隐藏租户输出，应另行定义范围与合同。

## 模型新增时的确定值

入口为数据空间设计页的“新增模型”/模型来源选择器（`DataSpaceModelSource.vue`：选择正式数据库表 → 预览 → 确认创建）。当前 A8 模型目录没有名称或 MetaName 为 `Base_TblRln` 的记录，因此按 ModelCreate `uniqueName`，注册 `Name` 的缺省值为 `Base_TblRln`；操作仍须用来源 DataView 重核，不硬编码 ID。`prepare` 从来源 `View_TblList` 按来源 rowid 精确重读；`modelCreateSaveDefinition` 将 `dataSetId` 与注册名加到原 `Base_DataModel` 视图，再将每个字段行的 `dataSetId`、新 `dataModelId` 加到原 `Base_DataModel_Field` 视图。

`lowcode-data-space-model-source-reader.ts` 的数据库表 prepare 确定下列来源字段：`Type=数据库表`、`MetaName=Base_TblRln`、`DbId=EBEFF17BBB6443B185D6FB32FF69F0BB`、`DbName=QYVirtualPlat`；`description` 取源目录描述（可选字段，不在本次盘点回执中，故具体值未核）；`JoinType`、`ForeignKeyFields`、`JoinFilter`、`PId` 为空。`PrimaryKeyFields` 不在该 prepare 结构中。`Name` 缺省取 `Base_TblRln`，但 Name 与 MetaName 仍是两个不同正式属性。

25 个字段行由来源 `Base_TblField` 全部字段产生，不继承来源字段 rowid；字段 rowid 由目标元数据 DataView 新增时生成。默认字段属性为：`type=dataModel`、`Name=enname`、`FieldType=DataType`、说明取 `cnname` 或 `description`、`AsName=''`、`ValueFun=''`、`Expression=''`、`allowAIAdd=0`、`OrderType=''`、`Order=0`、`Group=0`。`IsPKey` 来自来源 `IsPKey`，当前实现把该标记同时赋给 `IsOutput`；实际盘点里只有 `rowid` 和 `lingma_sys_ent` 两行取 1，其余 23 行取 0。

- 正式数据库来源主键合同（`data-space-design-api.ts`）读取精确 `dbid+tblname` 来源，并排除 `lingma_sys_ent` 后要求唯一主键；因此正式 `DataSpaceFormalModel.primaryKey` 是 `rowid`。`formalField` 在数据库来源有主键时以这个来源主键覆盖字段的模型主键语义。物理目录的 `lingma_sys_ent IsPKey=1` 仍会按 prepare 原样留在新字段元数据；它不是本模型的正式业务主键。
- 字段编辑 UI 对数据库模型不允许修改主键；`FieldEditSession.read()` 会把 `IsPKey=1` 行的 `IsOutput` 标为不可写。保留租户列的默认输出即可；额外可见输出与业务主键不是同一语义。
- `DataSpaceDesignApi.resolveOutputFields()` 收集全部正式 `output=true` 字段，不要求恰好匹配某个消费清单；主键检查依据来源 `rowid`，未发现查询/保存合同拒绝 `lingma_sys_ent` 作为额外输出。这里仅记录可见源码的能力，不推断服务端其他隐藏消费者。

## 关系消费者输出字段清单

按当前本仓消费者代码与已核正式字段语义合并后，建议模型输出清单为：

`rowid, pkdbid, pktbid, pktable, fkdbid, fktbid, fktable, rlname, RelshipExp, IsCascadeDeletion, createuser, createtime`

- 查询按 `pktbid OR fktbid` 过滤，需正式模型含这两个字段；选中/编辑身份依赖 `rowid`。关系编辑还需要 `RelshipExp` 的正式结构值。
- 新建/编辑表单读取、验证、peer 表赋值和 `editRowById` 写入使用两个数据库 ID、两个表 ID、两个表名、`rlname`、`RelshipExp` 与 `IsCascadeDeletion`。
- 当前关系列表还呈现 `pktable`、`fktable`、`rlname`、`IsCascadeDeletion`、`createuser`、`createtime`。
- 以上 12 项包括当前本仓查询、列表和表单用字段，以及按正式关系语义需要的 `RelshipExp`；源字段盘点确认名称均存在。它们不推断服务端其他隐藏消费者。当前表单还需纠正旧的“将表达式摘要写进 `rlname`”语义，详见下文。

## 输出配置与一次保存入口

1. 创建成功并完成 create owner 原批次回读后，进入该模型“1 模型结构”下的“模型字段工作区”（`DataSpaceModelFields.vue`），其表格和编辑器绑定同一个 `Base_DataModel_Field@modelFields` DataView。新增模型流程先创建，之后单独加载完整字段工作区；不把尚未加载的数据当作空定义。
2. 每个字段的输出复选框由标准字段子组件直接绑定该 DataView。保留创建时的 `rowid` 和 `lingma_sys_ent` 两个输出；逐项将本清单中其余 11 个初始未输出字段设为输出（原代码清单的 10 个字段，加 `RelshipExp`）。不要用“全部输出”，它会输出当前所有 owner 字段。`rowid` 是正式业务主键；`lingma_sys_ent` 的来源 IsPKey 标记不改变该语义。按这一清单应为 13 个输出列，其中 `rlname` 是关系名，`RelshipExp` 是结构表达式；保存后仍须按正式字段 DataView 回读确认。
3. 调用该工作区“批量保存字段配置”。`ModelEditSession.save(fields,...)` 与 `FieldEditSession.prepareSave`/`DataSpaceDefinitionSave.run` 复用原 DataSet；没有模型属性草稿时只提交发生修改的字段 rowid，若同批有模型/删除等变更则严格按 owner 显式给出的目标合并。批次会校验原视图、目标空间、字段权限和正式模型输出，再经 `DataSet.saveChanges`；`IsOutput` 不属于仅凭原生receipt即可确认的普通字段，因此成功后会从原字段视图完整正式回读，并逐项核对提交值。
4. 请求未知、无效或回读不一致时保留原捕获与字段 owner 的核验状态，不自动重发；只能沿该 owner 的 verify/reload 只读核验并由用户处理。模型首次创建本身也沿原 DataSet 一次提交模型+字段并回读；unknown 时先核验该创建批次，不继续重复创建。
5. `ModelCreate` 本身不保存 pagedata：它沿原元数据 DataSet 提交模型与字段。SPA 画布若该次创建来自待绑定的临时未配置节点，`data-set-design-page.vue` 的 `selectCreatedModel` 会在模型回读后调用 `layout.bindCreatedNode(pendingId, id)`，再立即调用 `layout.save()`；这会产生第二笔独立的 `pagedata:layout` 资源保存。输出标志编辑本身仍只保存正式模型字段定义，不是关系视图私有开关。新增模型会进入 A8 共享模型目录；当前六个既有模型定义不会因此被修改，但同一新模型未来的消费者会共享这 25 字段及输出定义。

### 创建后的画布布局是独立的自动保存边界

- 调用链：`DataSpaceModelSource` 发出 created → `data-set-design-page.vue::selectCreatedModel` 将临时节点绑定到已正式创建并回读的模型 ID → `DataSpaceLayoutEdit.save()` 调用同一 `metadataDataSet.saveChanges({views:[DataSpaceLayoutDefinition@default]})`。
- `DataSpaceLayoutDefinition` 是声明为 `resourceType='file'`、`resourceId='pagedata:layout'` 的正式 DataView。`ScenarioDefinitionResource` 在 DataSet 执行器内将其变更合并进目标场景 `pagedata.json`；`ProjectWorkspace.saveScenarioViews` 做保存前原文冲突检查、写入及正式回读。`createLowcodeProjectGateways().scenarioViews.writeText` 交给 `LowcodeDesignFileUpload.uploadWorkingText`，由适配器调用 `File/UploadFile` 后 `DownFile` 逐字节核验。因此 `File/UploadFile` 是被 DataView 保存调用的文件资源 owner，不是业务页面另开的保存通道。
- 本次实服观测到一个 `BatchTableOperateRequestByCRUD`（模型+字段）和一次 `File/UploadFile` / `DownFile/content` 回读，界面确认“模型已创建，节点位置已保存并回读确认”；没有点击独立布局保存按钮。源码表明第二笔仅在 pending graph node 存在时自动触发。若 `layout.save()` 失败，捕获会明确显示“新模型已创建；布局或目标视图装配仍需处理”，不会重放模型 create。
- 两笔写入各自有原 owner 的回读/未知处理，但数据库模型/字段与 pagedata 布局不是跨来源事务；模型成功、布局失败时可能留下正式模型而布局仍待核验。验收和报告应分别记录两笔边界，不可概括为“这条流程没有 pagedata 写入”。

### 关系名称与表达式：当前代码与正式字段语义不一致

- 已盘点的 A8 `Base_TblRln` 来源字段中，`RelshipExp` 的类型为 `json`、`rlname` 为 `varchar`（字段 rowid 分别见 `b2-relation-source-inventory-report.md`）。正式字段描述将 `rlname` 解释为表关系名，将 `RelshipExp` 解释为含 `Type / Filters / GetTableField` 的关系表达式。
- 参考 UI `use-table-design-dialog.ts` 将 `FilterBuilder` 的结构值独立写到 `raw.RelshipExp`，但 `handleRelationFilterChange` 又把 `payload.text` 写入 `relationForm.rlname`；`saveTableRelation` 先展开 `raw` 再保存 `rlname`。参考列表也把 `rlname` 显示为“关系表达式”。这说明存量 UI 将表达式的可读文本重复放入名称字段，和正式字段目录的字段语义冲突；它不能作为本仓把表达式保存为 `rlname` 的正确性依据。
- 当前本仓关系表单/列表仅读取、编辑和提交 `rlname` 文本，输入示例为 `Orders.Id=Other.OrderId`；尚未接入 JSON `RelshipExp`。正式字段合同要求 `rlname` 与 `RelshipExp` 分别建模：前者展示关系名，后者承载结构表达式。因此已把 `RelshipExp` 加入本轮关系消费者输出清单；需由领域表单以结构数据编辑/写入，列表显示摘要时保留名称字段语义。不能把 `rlname` 当作可解析表达式，也不能因旧列表只展示它就删去 `RelshipExp`。
- 本仓 `RendererFilterExpression` 可按 `field='RelshipExp'` 绑定原关系 DataView 字段；默认 `format='tree'` 可读写 JSON 树，`columns` 提供条件左侧字段，`functionContext.relatedFields` 提供 `GetTableField.Field` 选择项，并且仅写回当前 DataView 编辑值。`DataViewFilterCodec` 可完整编码/解码 `and/or`、`cond`、`GetTableField` 等结构；Java `BaseTblRln` 注释给出的 shape 与之相似。但这是可复用编辑器/结构兼容能力，不自动解决身份语义：Java示例的 `cond.Field` 是实际子表名.字段，`ValueFun.GetTableField.Field` 是实际主表名.字段；`ConvertCondUtils.materializeJoinCondition` 对父字段仅去掉点号前缀后按父行键读取，子字段则原样保留给子表查询。`LowcodeModelRelationAdapter` 的端点解析和正式字段 canonical-name 转换是另一个 SPARK 原生关系合同，不能假设它与物理 `Base_TblRln` 的 JSON 输入名相同。应从正式端点模型生成 `columns` 和 `relatedFields`，明确把值编码为后端期望的物理表名.物理字段，并用真实只读回读确认原文及目标字段映射；不得把 UI 本地表键、任意别名或未知限定名直接拼成关系表达式。是否必须由某个后端消费者执行本结构，仍需目标场景证据确认。
- Java 只读源码还表明 `BasicFunServiceImpl.cascadeDelete` 按端点与 `IsCascadeDeletion` 读取 `BaseTblRln.RelshipExp`，将 `GetTableField` 物化为父行常量；`PlatformToolService.relationRows` 与 `PlatformAgentDomainToolService.relationSummary` 则将 `rlName` 作为 name 返回，后者把 `getRelShipExp()` 作为独立 expression 返回。故名称/表达式的区分有下游服务依据。该源码是实现合同证据，不替代当前运行服务实测。

## 依据路径

- `src/lowcode/data-space/model-source/lowcode-data-space-model-source-reader.ts`：来源精确重读、字段映射与模型来源值。
- `src/lowcode/data-space/model-source/lowcode-data-space-model-create-session.ts`：原 `Base_DataModel`/字段 DataView 暂存、一次 DataSet 保存及 unknown/回读。
- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`：来源主键唯一性、过滤 tenant 标志、正式模型输出列解析。
- `src/lowcode/data-space/model-source/field-edit/lowcode-data-space-field-edit-session.ts`：输出/主键编辑权限、精确变更 IDs、回读与未知状态。
- `src/views/features/data-platform/data-set-management/design/ui/node-panel/fields/DataSpaceFieldEditor.vue`、`DataSpaceModelFields.vue`、`src/lowcode/data-space/model-source/model-edit/lowcode-data-space-model-edit-session.ts`：标准字段 UI 与保存入口。
- `src/lowcode/resources/database/database-catalog-relation-view-ops.ts`、`database-catalog-relation-form-ops.ts`、`database-catalog-relation-metadata.ts`：当前关系查询、字段读写与列表消费者。
- `src/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue::selectCreatedModel`、`src/views/features/data-platform/data-set-management/design/graph/data-space-layout-edit.ts`、`src/lowcode/lowcode-runtime.ts::createLowcodeProjectGateways`、`packages/spark-project-model/src/project/project-workspace.ts::saveScenarioViews`、`packages/spark-lowcode-api/src/design/lowcode-design-file-upload.ts`：创建后临时节点转正式布局、DataView 保存至 pagedata 与文件适配器回读链。
- `E:/r/sparkproject/packages/ui/domain/metadata/src/features/data-platform/database-management/table-and-view/ui/use-table-design-dialog.ts`、`E:/r/sparkproject/packages/data/metadata/src/api/DataBaseManage/TableDesign.ts`：参考表单对 `RelshipExp` 与 `rlname` 的分别写入，以及来源 API 字段投影。
- `E:/lowcode-jdk17/lowcode-framework/lowcode-data-operation/src/main/java/com/htong/model/BaseTblRln.java`、`E:/lowcode-jdk17/lowcode-framework/lowcode-common-data/src/main/java/com/htong/util/dataModel/ConvertCondUtils.java`、`E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/service/impl/BasicFunServiceImpl.java`、`E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/ai/platformtool/PlatformToolService.java`、`PlatformAgentDomainToolService.java`：只读核对 Java 字段语义、关系表达式字段格式、级联消费及名称/表达式输出。
- `packages/spark-component/src/components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.props.ts`、`packages/spark-data/src/query/filter/data-view-filter-codec.ts`、`src/lowcode/data-space/lowcode-model-relation-adapter.ts`：本仓可复用表达式编辑/编解码能力及正式模型字段限定名解析边界。

未运行门禁、未调用服务、未更改模型/字段/产品文件。
