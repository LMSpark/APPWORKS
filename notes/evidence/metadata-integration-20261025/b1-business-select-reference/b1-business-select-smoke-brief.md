# B1 标准业务选项组件烟测准备

状态：只读源码与既有测试核验；本次没有启动浏览器、发起服务请求或执行写入。以下步骤供主控在已 clean close 的 SPA 会话中做无破坏验收，不能用源码或测试夹具代替真实烟测。

## 已有消费者与数据链

API 管理目录的“请求方案设计”打开 `ApiConfigPage`，数据页绑定当前服务商的公共请求头 DataView。表格列和选中行表单均声明标准 `r-select` 字段 `type`，并通过 `optionDataViewKey` 指向字典条目视图；字段值由 `FieldSelect` 标准组件写入头部原 DataView。

- 页面入口与绑定：`src/views/features/integration/api-management/ui/api-management-page.vue`（从选中服务商打开“请求方案设计”）和 `src/views/features/integration/api-management/ui/api-config-page.vue`（headerKey、headerListFields、headerFields）。
- 字典装配：`src/lowcode/resources/external-api/lowcode-api-provider.ts` 的 `loadHeaderTypes()` 调用 `LowcodeDictionary.loadEditor()`，在正式字典定义 DataView 以 `TypeName=接口公共头部信息使用类型` 读取并核唯一可见定义，再将条目 DataView 按该 rowid 设 `queryContext` 和 `typeid` 过滤，刷新后核所有条目归属。
- 元数据场景与 scope：`src/lowcode/resources/dictionary/lowcode-dictionary.ts` 从 `config/pages/data-platform/data-dictionary/pagedata.json` 获取 `editorScenarioId`，经既有 `loadScenarioDataSet` 装配 DataSet；组合根读取并复核当前登录 token 与 `X-AppId`，页面不处理请求凭据。
- 页面 runtime：`api-config-page.vue` 创建一个 `PageRuntime`，声明 `[LowcodeApiProvider.configurationScenarioId, LowcodeDictionary.editorScenarioId]` 两个场景；loader 对精确场景 ID 返回各自 DataSet。字典 DataSet 不是配置 DataSet 里的本地数组副本。
- 选项呈现/值写回：`packages/spark-component/src/components/fields/options/useFieldOptions.ts` 通过 PAGE_RUNTIME 解析完整 `optionDataViewKey`，复用 DataView rows 和权限过滤的 `buildOptionSourceFromView`；`FieldSelect.vue` 经标准受控字段编辑链处理选择。FieldSelect 属性合同说明下拉展开时挂载、关闭释放、没有匹配项不自动选别项、选择/清空/取消沿原字段 DataView。
- 保存核验：`packages/spark-lowcode-api/src/platform/resources/external-api/api-request-header-design.ts` 在保存头部时从同一字典 DataView 用 `queryOptionRows({fields:['val','txt']})` 读取正式可读选项，并要求新值在查询结果中唯一；头部保存只提交头部 DataView，不保存字典。
- 关闭释放：`ApiConfigPage.cancel()` 显式 discard 头部与前缀草稿后 emit close；父页清空 configProviderId 后子页卸载。子页 onBeforeUnmount 撤销 DataView/cascade 订阅并移除 PAGE_RUNTIME；`PageRuntime.dispose()` 销毁其管理的两个 DataSet。普通 Dialog close 在 busy/pending 时不 emit。重开重新装配并查询，而不是复用旧 owner。

## 正式完整键与身份

字段组件的选项键使用三段完整绑定：

`<dictionary-editorScenarioId>@_Base_DictData@default`

`editorScenarioId` 以正式 pagedata 当前值为准（源码中的 `LowcodeDictionary.editorScenarioId`），不要写入内部 table key 代替模型名。API 配置字段的目标键是：

`<configurationScenarioId>@Base_InterfaceProvider_Headers@default`

`PageRuntime.resolveView` 要求完整键格式 `scenarioId@modelName@viewId`，scope 必须在声明的 scenarioIds 内；DataSet 的 scenarioId 必须匹配，随后按 `modelBinding.modelName`（缺失时正式 tableName）解析且要求模型名唯一，再获取指定 viewId。选项 source 必须是字典 DataSet 的正式 `_Base_DictData@default`，目标编辑行必须是配置 DataSet 的 headers view。不得以两个同名内部表、无scope局部键或页面临时选项数组代替该身份合同。

## 已有测试覆盖与证据边界

`tests/runtime/page/api-provider/api-config.test.ts` 已有标准组件交互用例“writes the standard function editor and dictionary selection to headers without saving the prefix draft”：新增头部，打开“使用范围”标准选择器，选择一项并保存头部；它覆盖一次 UI 选择写入和头部/前缀保存分离。

`writes actual select choices into a new draft and queries the dependent output options` 覆盖公共参数接口/输出字段选择，不是字典用例。

这些测试在 beforeEach 中 mock `LowcodeDictionary.loadEditor()`，返回 `SparkData.fromJson` 的 static-data 定义/条目；因此证明的是前端组件与 owner 的夹具合同，不是正式元数据、真实字典查询、租户 scope 或线上交互证据。字典 fixture 中的“所有接口/需要认证”等值也不能当成 SPA 当前正式数据的证明。

尚缺的目标证据是：当前真实 SPA 下该业务字典数据从正式 SPARK DataView 到标准 r-select 的非空选项、选择写入本地草稿、显式取消后原记录恢复、关闭时 runtime release、同目标重开后临时新行不再出现；并核请求归属实际使用 dictionary editor scenario 和当前应用 scope。此前 B1 删除候选的 workspace/API 与目录测试不覆盖这个专门选择控件路径。

## 主控 SPA 无破坏烟测步骤

1. 在当前应用打开外部服务商目录，选一个已存在服务商，打开“请求方案设计”并切到“公共请求头”。先记录已有头部主键、名称、使用范围和头部/前缀当前保存状态；不要按“保存公共头部”或“保存令牌前缀”。
2. 通过只读网络/运行审计观察已装配的字典查询：正式 DataView 对 `_Base_DictType` 按精确 TypeName 查询；只在唯一可读 rowid 成功后，`_Base_DictData` 按该 rowid 的 `typeid` 查询。两者须是当前 `LowcodeDictionary.editorScenarioId` 所属场景、当前 scope；核到调用链是 SPARK Data runtime 查询。不要记录或展示 token。
3. 点击“新增公共头部”，只在本地填写可辨识的临时名称（例如前缀 `B1-smoke-`），展开“使用范围”，从当前可读下拉项选一个。确认选择前选项来自上一步 DataView；展开本身不应另发独立取数或静态 fallback 请求。暂存后确认行的 `type` 编辑覆盖发生在 headers DataView，字段当前可写；未触发业务写请求。
4. 点击“放弃修改并关闭”。确认事件关闭配置页，临时新行从 UI 消失，弹出层/下拉 DOM 消失；没有 `BatchTableOperateRequestByCRUD` 写入。该按钮会显式 discard 临时头部行与字段覆盖再关闭。
5. 从同一服务商再次打开请求方案设计。核对新请求重新查询正式字典与头部，原记录值与步骤1一致、`B1-smoke-` 行不存在，且没有旧下拉/选中状态残留。这证明取消和重开，不是持久保存。
6. 结束时只保留审计中的 GET/查询证据和 UI 观察；没有新增正式记录。若真实查询未返回选项、identity/scope不匹配或未出现正确下拉项，停止于观察结果并报告，不改 API 头固定源，不修写共享配置。

可记录证据：工作区/页面身份、时间、所选已存在服务商主键（脱敏可见）、字典 DataView key、两类查询的场景/模型/视图及过滤字段、select 显示的候选数、临时选择前后编辑值、HTTP 写调用计数为零、取消后头部视图重新查询与行集、close/unmount 后 DataSet destroyed 状态（若现有诊断面可读）。不得把测试 mock、源码推断或历史 SPA 截图记成此次真实通过。
