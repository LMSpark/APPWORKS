# 研读：蓝图批次3b与4按 SPARK data 统一链返工

## 用户纠偏（2026-11-13）
批次3b（维度来源）与批次4（导航、桌面、宿主）移植到仓内后，必须使用统一 SPARK data 与标准组件；凡违反本仓数据层的实现都要返工，被替代的代码一并删除。

## 违规事实（源码）
- 手写级联：`blueprint-nav-host-editor.ts` 的 `followCascade`，binding-editor 与 commit-policy-editor 的 `onAnyViewChange` 监听。它们自行清空下游字段、重查选项、用序号丢弃迟到结果，并回填同行字段。蓝图 pagedata 的 `viewCascades` 为空。
- 内存选项表：`DimensionSourceOptionTables.mount` 共 8 处，行数据来自设计 API `readModels`、静态合同表或编辑器自身草稿。
- 第二份草稿：`NavHostParam`（宿主 paramType）、`DimensionSourceCommitDraft`/`DimensionSourceCommitFact`（提交协议）。
- TypeScript 校验：`requiredText`、`positiveInteger`、`REQUIRED_FIELDS`，以及按大小写猜测列名。
- 页面提交包装：`DimensionSourceChangeSubmission` 在 `DataSet.saveChanges` 外另做回执计数与逐字段回读。
- 旁路装配：桌面 `BlueprintDesktopEditor.assemble` 自读 `desktop-views.json`，按名称解析模型，自建 `NativePageRuntimeSession`；账套守卫用只写名称的 `ledger-views.json` 自行装配。
- 手工权限：导航页签逐字段传 `access()` 并设置 `v-if`/`readonly`；标准字段组件本已经 `useFieldPermission` 消费 DataView 的 `fieldAccess`。

## 已核实的公共能力
- 字段级联 `viewCascades` 的 `kind:'field'`：`parents[].parameter` 作为选项查询的 `context` 键并入 `queryContext`，由选项视图用 `GetInputParam` 过滤；选项结果返回后按 `valuePolicy`（clear / retain-valid / retain）调整子字段值；链式级联逐级触发；手动刷新与初始化不写值。
- pagedata 列规则：`required`、`minLength`/`maxLength`、`min`/`max`、`pattern`、`trim`、`unique`、`immutable`、`optionsView`（含 `fill`）；保存时由 `validateQuerySaveColumns` 与 `SaveRuleValidator` 强制执行。
- `optionsView.fill` 目前只在保存前（`prepareQuerySave`）回填。
- 跨字段规则：`DataTable.setQuerySaveRule`，代码注册、不序列化（参照 excel-import 的 `bindEditorModelRules`）。
- 保存：`DataSet.saveChanges` 校验回执身份与计数；结果未知时 `resolveUnconfirmedSaves` 只核验原提交；不自动逐字段回读。
- pagedata 模型表必须同时有 `modelBinding.modelId` 与 `modelName`；一个 PageRuntime 中每个场景 ID 只有一个 DataSet。
- `Base_DataModel` 有 `MetaName`、`Type`；`Base_DataModel_Field` 只有 `dataModelId`，没有模型 MetaName；宿主 `DataName` 存资源 MetaName，参考页按资源 rowid 查字段。
- `Base_Desktop_System` 的模型 ID 在仓内没有任何来源；三个桌面字典只在一份证据审计文件中出现。

## 用户决定
1. 桌面与账套守卫的模型身份：用户手动登录后实服只读核实，再写入正式 pagedata；核实前这部分阻塞。
2. 保存核验：删除页面包装，只用公共 `saveChanges` 回执、`resolveUnconfirmedSaves` 与公共 `refresh`。
3. 选项回填：扩展公共链，编辑时按 `optionsView.fill` 回填同行字段。
4. paramType：扩展标准字段组件，对 JSON 文本列按子键读写。

## 实服只读核验结论（2026-11-13，只记已核实范围）
- 7AB 场景：`Base_DataSet`、`Base_DataModel`、`Base_DataModel_Field` 在本空间的正式模型身份与原 pagedata 所写（取自其他空间）不一致，原配置无法装配；已核实本空间身份及所需列（字段表含 `dataSetId`、`IsPKey`、`IsOutput`、`ValueFun`、`Expression`、`type`）。
- 宿主表列名以正式字段为准：资源列为小写开头的 `dataName`，参数类型 `paramType` 为文本列。
- `Base_NavigationInfo` 的 `BeginGroup` 未输出，正式查询读不到；其余导航属性列已输出。
- `Base_Desktop_System` 在 7AB 有正式模型，但只有主键 `rowid` 被输出，桌面名称、地址、排序、显示等字段都未输出。这是实服模型配置缺口，只读核验无法修正；前端按正式字段权限隐藏不可读字段，不另建读取通道。
- 字典：`NavigationType`、`NavChildrenLocation`、`数据目录参数处理方式`、`Dict_Page_Popup`、`Dict_Desktop_AppType`、`DesktopStyle` 均为 `_Base_DictData` 中的正式字典类型，可沿数据字典场景的命名视图消费；无需单独装配桌面字典模型。
- `Bil_Dimension_Set` 在账套场景有正式模型，主键与所需列已核实。
- 维度设计场景（88A4）不含 `Base_DataModel`、`Base_DataModel_Field`、`Base_DataSet`。批次3b的模型/字段候选只能来自 7AB DataSet，而维度来源正式表在 88A4 DataSet；当前字段级联与 `optionsView` 只在同一 DataSet 内声明，跨 DataSet 级联是公共能力缺口，须由用户决定。
