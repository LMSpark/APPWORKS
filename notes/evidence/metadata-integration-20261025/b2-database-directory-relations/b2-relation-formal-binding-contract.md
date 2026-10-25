# B2 Base_TblRln 正式模型绑定合同备忘

## 结论

本仓已有窄而正式的注册/保存链：用数据空间设计器现有 `ModelCreate` owner，从同一设计 `DataSet` 按正式物理表来源读取候选和字段，暂存 `Base_DataModel` 与 `Base_DataModel_Field`，经 `DataSpaceDefinitionSave` 调原 `DataSet.saveChanges`，再回读；不需要新物理表或第二保存器。

但当前证据只证明目标空间按 `Name=Base_TblRln` 查正式模型返回 `Code 200 / Count 0`；它尚未证明物理来源的真实 `dbid`、`View_TblList` 唯一行或字段集/主键，也没有给出同一物理来源是否已用其他模型名登记的信息。现有 table-source adapter 会把非主键字段 `IsOutput` 置为 0；是否将这些字段配置为正式输出，应按本例消费需求走原字段 DataView 确认。故当前不能凭现有证据完成精确模型定义；先只读补证来源和现有绑定，再按现有授权判断是否保存。

## 已核源码合同

1. `src/lowcode/data-space/model-source/lowcode-data-space-source-catalog.ts:8-34,57-67` 支持正式来源类型 `table`，从 `View_TblList` 按来源 `rowid`、`tblname`、`dbid`、数据库名取稳定候选身份；隐藏/不可读身份拒绝使用。
2. `src/lowcode/data-space/model-source/lowcode-data-space-model-source-reader.ts:49-66,82-114,136-208` 对候选按来源 rowid 精确重新读取，校验完整身份；数据库表要求可读 `dbid/DbName`，按 `Base_TblField.tblid = source.id` 完整读取字段，校验字段 rowid/name/type 唯一及 `IsPKey` 标记语法，产生字段草稿。它没有在 prepare 阶段校验唯一主键数。
3. `src/lowcode/data-space/model-source/lowcode-data-space-model-create-session.ts:52-58,101-107,116-132,247-318` 是现有模型新增 owner：绑定正式 `Base_DataModel.default` 与 `Base_DataModel_Field.modelInputFields`，在模型新增后用正式字段 DataView 命名查询读取新 `modelId`，通过原 `view.addRow()` 暂存模型和字段，并用 `addActionState`、目标空间、主键身份、脏草稿及查询完整性守卫。创建时 `validateName()` 只查正式 `Name` 唯一，不检查同 `DbId + MetaName` 源重复。
4. `src/lowcode/data-space/model-source/save/data-space-definition-save.ts:65-114` 把模型/字段目标合并成一个 `DataSet.saveChanges({applyEditingRows:false, views})` 批次，核对原 DataView 收据；未知/回执不完整保留原捕获供核验，不回滚/重放。
5. `modelCreateReadback()` (`lowcode-data-space-model-create-session.ts:334-370`) 确认后完整刷新原模型/字段 DataView，并逐条比较原创建 rowid、正式可读字段和值；这确认创建草稿是否原样落库，但不调用正式模型投影 validator。
6. `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:401-472,680-734` 的 `readModels/readModel` 是后续正式语义读取合同：按目标 `dataSetId + Name` 唯一读取正式模型及 `type=dataModel` 字段；数据库表来源按 `DbId + MetaName` 在 `View_TblList` 精确读取唯一物理来源，再按其 rowid 读 `Base_TblField`，要求恰好一个非 `lingma_sys_ent` 主键。`LowcodeDataSpaceViewDesign.readModel()` 将当前元数据 DataSet 传入此API（`src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts:337-342`），可用于创建后的语义回读。

## 字段输出配置注意事项

`LowcodeDataSpaceModelSourceReader.prepare()` 对普通数据库字段调用 `field({... IsPKey: primary, IsOutput: primary})`（`src/lowcode/data-space/model-source/lowcode-data-space-model-source-reader.ts:178-187`）。因此只有 PK 标为 `IsOutput=1`，其他物理字段会作为正式字段记录写入但标记为非输出。正式 API 的 `resolveOutputFields()` 按 `field.output` 过滤 (`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:315-342`)；视图字段投影校验也只接受 `candidate.output` (`src/lowcode/data-space/view-design/lowcode-data-space-view-fields.ts:31-60,72-83`)。这会使 Base_TblRln 的非 PK 字段无法作为正式 view 输出/视图字段配置候选。

这不是已证实的 adapter 缺陷：模型创建会把这些正式字段写入 `Base_DataModel_Field`，而本仓允许在原字段 DataView 中显式配置正式输出。若本例查询/展示要消费非主键列，就需在正式关系视图使用前通过既有字段配置链将所需列设为 `IsOutput=1`（保留真实 `IsPKey`），再沿正式模型/视图投影核验；否则本例的非主键列不会成为视图输出候选。当前没有 Base_TblRln 实际字段及本例所需输出列的只读证据，不能预设所有列都必须输出，也不建议因此改通用 adapter。

## 当前证据与只读补证

- `node_modules/.cache/metadata-integration-20261025/b2-relation-model-live-read.json` 是一次对当前目标空间 `Base_DataModel` 的正式精确查询：过滤目标 `dataSetId` 与 `Name=Base_TblRln`，返回 `Code 200 / Count 0`。这只说明该正式注册名当前为空；不代表同物理源无别名注册，也不代表服务全局缺字段/模型。
- 保存前应在同目标空间，用原 `Base_DataModel` DataView 全量读取并记录 `rowid,dataSetId,Name,Type,MetaName,DbId`，校验完整分页/字段读权限；排除精确 Name 重复，并盘点数据库表来源身份 `[Type, DbId, MetaName]` 是否已在该空间登记。现有 `ModelCreate.validateName` 只约束 Name 唯一；同源不同名是否允许由当前产品合同决定，不能仅凭命中就自动拒绝或覆盖。
- 通过现有来源目录/ModelSourceReader 只读选出 `tblname=Base_TblRln` 的候选；必须由实际可读结果拿到唯一 `View_TblList.rowid`、`dbid`、数据库名，且组合身份唯一，不得根据表名猜 `DbId` 或跨空间借同名表。
- 按正式 `tblid=该候选rowid` 完整读取 `Base_TblField`，逐项记录真实 field rowid、`enname`、`DataType`、`IsPKey`、可读标题；确认字段身份/名称唯一、类型合同可消费，且恰有一个非租户主键。正式 `DataSpaceDesignApi.readModel()` 之后也会独立重新核这条来源主键链。
- 当前给出的 live-read 不包含以上 `View_TblList/Base_TblField/目标全量模型目录` 的新证据；本轮不执行补查。

## 最小变更/验证路径

在只读补证通过且输出字段语义确认后，复用数据空间设计页 `getModelCreate()`：选择唯一真实 `table` 来源→预览→以精确正式 `Name=Base_TblRln` 创建；不调用任何另一个 HTTP 或页面专用保存器。保存由上述 DataSet 批次提交。原 owner 的精确模型/字段回读成功后，再调用已有 `readModel({designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: targetId, metaName: 'Base_TblRln'}, metadataDataSet)` 作为语义回读，确认 source type/id、完整字段、正式输出及 source PK。失败或未知保留原 capture，按原 model-create recovery 查询，不重发 create。

至少补验：同目标精确 Name 重复在保存前拒绝；同物理源已由别名注册时明确呈现盘点结果并按现有业务合同决定是否继续，不静默覆盖；来源候选多行/来源字段缺主键、多主键或租户键被误选都拒绝；本例所需的字段输出由原字段 DataView配置并覆盖关系查询/展示需要；新增批次只含原模型和所属字段 DataView；完整 DataSet 收据后精确 rowid/字段和值回读，随后正式 `readModel` 能唯一按来源核 PK。不要借这些测试声称当前远端已经支持/写入成功。

## 变更授权边界

本轮只读委派明确禁止服务写入，因此本次没有执行保存；这不单独建立后续正式模型注册一律需要用户二次确认的规则。当前尚无经实查的来源候选、字段清单、PK 和目标模型定义，须先补齐可审查对象，再按原任务授权判断是否实施。若补证发现操作会覆盖/改动已有共享定义、破坏现有引用或扩大到当前计划之外，应说明具体对象和影响后再取得相应确认；若是任务范围内的新模型登记且无此类超范围影响，沿既有授权流程处理即可。
