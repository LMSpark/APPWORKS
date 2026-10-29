# 工作台标准组件直接接入清册（2026-10-29，只读）

范围仅主树、BlueprintWorkspace、四个Node配置组件、相邻pane和NavHostProjectPicker。用户纠偏优先：从本仓复用，不新建一套组件或页面数据适配层。未修改仓库、生成物或运行UI。现HEAD a6682cf5dbbb9d4148490a71a47d48934ad29b5d。

## 当前指南来源

已比较 `.dts-manifest.json` 中sourceModifiedAt与36份下列既有组件props/Vue源码mtime：0差异；并从manifest.componentIndex.byName定位真实kind，读取props及实现。此仅证明本次既有面未过期，不等于运行验收。公共RendererTree新drop/排序/root集合仍WIP，本清册不把刚生成/未重新冻结的新树shard当已验收指南。

正式入口：`model_query({componentName:'FieldSelect',includeMembers:true})`→`model_class_guide({kind:'RSelectProps'})`；继承字段面查`SparkFieldSemanticProps`、`SparkOptionFieldProps`，布局查`LayoutDataContextProps`；动作查`model_action_guide({kind:'RendererTreeApi',actionName:'filter'})`。真源 tools参数位于 packages/spark-ai/src/class-model/tools/class-model-tool-specs.ts:37–100。离线等价目录为generated/dts-class-model/manifest.json的componentIndex/classIndex，再读返回file shard；不能把组件名误当class kind。

常用kind：RFormProps、RTabsProps、RTabPaneProps、RDialogProps、RButtonProps、RDividerProps、RDropdownProps、RTextProps、RTextareaProps、RNumberProps、RSelectProps、RRadioProps、RHtmlEditorProps、RAutocompleteProps、RAlertProps、REmptyProps、RSkeletonProps、RTagProps。源码均从manifest索引定位，不另建组件目录。

## 统一绑定先决条件（不是新层）

主树与工作区复用现有BlueprintWorkspaceDataView.view和当前PAGE_RUNTIME；完整key用现buildDataViewKey按view所属scenarioId、正式modelBinding.modelName（DB）或正式文件tableName（无modelBinding）、viewId构建。builtin是RepositoryBlueprintNode，dynamic是Base_NavigationInfo，不能继续NodeBasicInfo:77与NodeStateConfig:28固定DB key。字段dataMember=currentRow、dataField=原wire字段；RendererForm contextDataMember=currentRow，子字段继承也可。现主树与BlueprintWorkspace为兄弟，后者的provide只覆盖后者后代，主树需由已有宿主提供同runtime，不能另造运行时或rows副本。

Field自身在RendererForm上下文提供form-item/label，删页面el-form-item套壳。字段直接编辑原DataView，不同时v-model领域draft再二次写入；update:modelValue只接现通知/必要业务副作用。保存/取消继续现owner/DataSet责任，不能把发布三步骤替换成一键DataView普通save。

## 可直接替换清单

| 原位置与残留 | 本仓直接能力 | 实际字段/必要命令 |
|---|---|---|
| ProjectBlueprintTree:10–79 el-input/button/dropdown/tree/tag/empty | FieldText（非持久搜索词）、RendererButton、RendererDropdown、RendererTree、DisplayTag、DisplayEmpty | 树绑定原owner.view；字段rowid/prowid、FunName/name/conType/NavigationUrl；filter/expand/collapse走既有RendererTreeApi。搜索词属于界面状态，不造DB字段或查询草稿。选择/增删/relative drop仍调用现业务owner；见raw-row补充报告。 |
| BlueprintWorkspace:8–21 el-tabs/pane/button/empty | RendererTabs/RendererTabPane（明确index、name、lazy）、RendererButton、DisplayEmpty | 维持activeStage/activeExtension本地UI状态与readyWorkspace门禁；save/cancel/saveDelivery保持原捕获身份、pending/unknown和三文件发布流程。 |
| NodeBasicInfo:10–26 基本/导航表单 | RendererDivider、RendererForm、FieldText/FieldTextarea、FieldSelect或FieldRadio | rowid只读；name/memo/FunName/NavigationUrl直接字段；conType用下节wire值。已有name/memo标准字段去掉外层el-form-item。 |
| NodeBasicInfo:21、58 “提供导航/提供原型” | RendererButton作为明确领域命令；不能假装单字段FieldSwitch | navigation是一组字段、prototype是htmlDesc的可选领域形态，没有HasNavigation/HasPrototype正式字段。保留现初始化/清除命令、所涉及字段权限，不伪造布尔列、不顺手删除。 |
| NodeBasicInfo:25 图标 | 已有FieldIcon（CSS图标类）或FieldSelect/FieldAutocomplete绑定NavigationImageWxz | 当前IconPicker用Element图标名+NavIcon绘制，FieldIcon.vue:110仅输出i.class，不能声称图标预览等价。可直接用标准候选选择保留图标名值；原精确图标格预览暂列视觉缺口，不立即新造图标组件。 |
| NodeBasicInfo:31–59 场景与原型 | 保留现FieldSelect+RendererDialog/Filter/Table；FieldHtmlEditor/FieldTextarea绑定htmlDesc；DisplayAlert | conid动态选项仍现catalogViewKey、rowid/Name与选择确认身份；删除普通el-form-item/alert。原型字段不能仅v-model本地model而漏dataViewKey/dataField。 |
| NodeStateConfig:9–16 | RendererForm/Divider、FieldRadio或FieldSelect、FieldNumber；已有两FieldSelect保留 | IsShowAtNav/IsShowChildItem/BeginGroup真实0/1；FunOrderValue数字；NavigationShowType、HorizontalAlignment继续现字典optionDataViewKey的val/txt，不能改静态硬编码或手传数组。 |
| NodeTargetConfig:9–18 | RendererForm/Divider、FieldAutocomplete（自由文本+建议）、FieldText、FieldSelect、RendererButton | NavigationUrl、MobileUrl、NavigationType。保留handlePathChange同步活动工具身份、createPageForSelectedNode文件/绑定事务及probeLinkTarget业务动作。不得仅改字段后丢原必要副作用。标准Autocomplete已有fetchSuggestions/valueKey并写同字段，无需新建allowCreate属性。 |
| NodeLayoutConfig:9–19 | RendererForm/Divider、FieldRadio buttonStyle=true | ChildItemLocation直接wire候选，不将领域top/left等直接落库；仅正式module显示，保留conType判断。 |
| PrototypePane:9–11、PlanningPane:9–11 | 已有FieldHtmlEditor补正式字段绑定；RendererButton/DisplayAlert | 当前PrototypePane经draft.prototypeHtml间接写htmlDesc，改原view的htmlDesc。PlanningPane本范围无实际import消费者，先核事实，不为了清单启用新页。 |
| EstimatePane:9–20 | RendererForm，FieldNumber、FieldText，DisplayAlert，RendererButton | DifficultyFactor/Manhour/Number/Sum/Total/personCharge/status；沿正式列类型，根控已有Sum/Total decimal证据，不把统计字段假设为浏览器聚合。删form代理get/set与重复本地字段state。 |
| ReleasePane:9–15 | RendererForm、FieldSelect/Radio、FieldText只读/Display文本、RendererButton | IsShowAtNav与NavigationType和前页是同一原字段；runtimeSummary为派生说明，不造列。不能由此直接扩大发布菜单身份。 |
| DataPlanningPane:9–15 | RendererForm/标准只读展示、DisplayAlert；保留既有DevDataSetDesigner | persistedDataSpaceId明确已确认conid，不拿editing overlay冒充已保存目标。设计器仅在绑定保存回读完成后打开。 |
| DeliveryPane:11–17 | RendererButton、RendererTabs/TabPane | 保留现DevFileEditor/DevPreviewTab窄编辑器与PageToolFiles DataView；不是把代码编辑器强换FieldText。版本发布仍父saveDelivery。 |
| BlueprintReadonlyInfo:3–6 | DisplayAlert/DisplaySkeleton；已有RendererTable+FieldText保持 | 原型历史Base_Navigation_Desc_Version、导航宿主Base_Navigation_DataRelation为独立正式资源；builtin85文件不自动授予它们DB读取能力，保留显式不可用边界。 |
| NavHostProjectPicker:6、27 | RendererDialog+RendererButton | 现RendererTree/Table已经绑定动态viewKey和正式候选，保留host navigationId→关系view→目标view身份链、选中守卫与dispose；不改回app数组。 |

本仓真实页面例子：
- `src/views/features/data-platform/data-set-management/ui/data-set-list-page.vue:15–34`：RendererDialog→RendererForm→FieldSelect/Text/Textarea，catalog/apps不同完整key，字段自带label；35–42标准删除确认。
- `src/views/features/integration/api-management/ui/api-config-page.vue:13–31`：RendererTabs/RendererTabPane/index/lazy和面板各自DataView key。
- `src/views/features/integration/api-management/ui/api-interface-list-page.vue:16–39`：主记录与参数/headers/output多视图标准tab。
- `src/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-setting.vue:11–21`：RendererForm children与RendererDialog/Button，公共布局无需手拼el-form-item。
- 本范围NodeBasicInfo:42–54自身已是标准场景选择对话框，可直接复用其现动作边界，不另起picker体系。

## 必须保留的wire映射

依据 packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-wire.ts:31–35、46–59、72–83、89–125：

| 原字段 | wire→领域/显示 | 直接绑定注意 |
|---|---|---|
| conType | Model→module；Navitem→page；embedded/service/content保留正式领域值；未知值仍unknown | FieldSelect/Radio的value用Model/Navitem/embedded/service/content，不用module/page覆盖原值。Model带Vue URL仍Model。未知原值保留显示、不自动选第一项。 |
| NavigationType | '4' subsystem；'3' current；'2' new-window；'1' modal；'0' embedded | 原代码NodeTarget用领域字符串，Release用number代理；直接字段统一用正式wire选项，按真实列/值合同保持类型，不能把subsystem写进数字码字段。 |
| ChildItemLocation | Top/Left/Right/Parent/Tabs/Popup→top/left/right/parent/tabs/popup；读取还容纳中文等存量别名 | 直接选项value用正式write字面量Top等；空值/未知值不得在挂载时写成Parent。 |
| IsShowAtNav/IsShowChildItem/BeginGroup | 原写回1/0；读取兼容数值/字符串 | 现FieldSwitch.props只boolean|null，handleChange写boolean；无activeValue/inactiveValue公开面。无需造新开关API，可用已有FieldRadio/FieldSelect的精确0/1候选。候选string/number类型须对实际field值核定（FieldSelect严格匹配类型），不能靠truthy把'0'当真，不能初载规范化落库。 |

当前标准能力核对：SparkFieldSemanticProps(shared-types.ts:138–144)已有完整key/dataMember/dataField；SparkOptionFieldProps:501–523已有optionDataViewKey/member/field；FieldRadio继承buttonStyle；FieldAutocomplete已有fetchSuggestions/triggerOnFocus/highlightFirstItem/valueKey；FieldSwitch无wire映射属性。FieldIcon只支持CSS类样式，不能将NavIcon组件名预览称作已支持。

目标建议来源分清：Vue注册表是静态页面定义候选；当前pageList来自已有blueprintProjection.pageDeliveries(useDevState:550)，是同源派生不是权限授予。可在现Autocomplete公开fetchSuggestions回调消费已核当前scope的这些候选，选择值仍由绑定NavigationUrl字段写入；不能把候选列表当写权限，也不为此次替换新造候选DataSet/第二缓存。若改用动态选项字段，则沿已有正式option DataView，不临时包装业务数组冒充绑定。

## 执行小组顺序（不是新总计划）

A. 先提供当前owner完整key+现PAGE_RUNTIME，再替换主树/Workspace/picker公共布局和操作，保留原业务命令与raw-row边界。
B. 将NodeBasic/State/Target/Layout、Prototype/Estimate/Release的原wire字段直接绑定标准组件；同步删被替代draft字段代理/v-model、固定DB key、el-form-item。静态wire枚举用现options；真实字典/场景用现optionDataViewKey。
C. 替换辅助反馈、删除确认、Delivery tabs/button；现窄文件编辑器/设计器保留正式职责。验收字段写入值、保存/取消重开、拒选/跨scope、cfg与Vue动作差异，不仅检查DOM组件名称。

## 公共WIP必要性重新收窄

- builtin85单根：既有rootParentValue=真实根rowid即隐藏根；不要求使用rootParentValues。
- dynamic原合同允许多组根哨兵并合并显示，既有单rootParentValue不能无损替代。若本片把dynamic也接标准树，最小rootParentValues仍必要；不新增节点数据源，不改原prowid。若只处理builtin可暂不消费集合，但不能谎称dynamic迁移完成。
- 同父移动只暂存FunOrderValue，现树未按已有sortExpression消费overlay是真实RED；修现RendererTree/DataView消费即可，不加orderBy或另一套组件。纯sortDataRowsByExpression属于这项实现补齐，可共用已有数据查询算法，不另建页面排序/新配置真源。未证明的公共扩展一律不纳入此次直接替换。
