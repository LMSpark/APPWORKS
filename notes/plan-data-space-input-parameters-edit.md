状态：superseded

2026-10-08 06:27：用户否定长期微切片推进方式，主控已停止执行代理。本计划被 `notes/plan-appworks-four-file-integration.md` 顶部“执行方式重整”取代为整页迁移的一部分，未验收关闭竞态增量冻结。现有代码与证据保留，不声明参数切片完成，不继续单独扩展本计划。

# 数据空间输入参数编辑候选闭环

## 任务目标

为既有数据空间设计页增加对 `Base_DataSet.inputParams` JSON 数组的可审查编辑流程，并在专用验证空间 `97DCB03F75AADEAE6B102B062DB71CEA` 上完成保存、重开、回读和恢复验证；该空间已由只读探针确认存在且 `models=[]`，此候选不依赖模型目标。

本计划已由主控依据用户持续实施授权审定；待 DataView 放弃未保存变更依赖通过独立验收并明确派工后实施。沿已验 `DataSpaceDesignGraph.vue` 的本应用扫描组件路线，增加窄参数数组 UI；四文件 rule 承担入口、dialog、确认/取消，script 承担权限、校验、保存，数组草稿必须写入 PageRuntime 持有的正式 DataView editing overlay，不存为 script local array。线上由主控完成专用验收空间的操作与精确原值恢复。

## 已确认的数据与运行合同

- 固定参考源码：`E:/r/sparkproject@842dec4f11b333df904b9a4e26b6566b0802bab8`。
- 输入参数正式记录定义在 `apps/appworks/src/data/api/data-set/design/contracts.ts`：`DataSetInputParam` 的字段为 `Name`、`Description`、`IsBusParam`、`rowid`，并允许额外属性。`Base_DataSet.inputParams` 是 JSON 字符串。
- 参考页 `use-data-set-design-page.ts` 的参数对话框支持新增、选中、删除和编辑；名称必填、trim 后提交，描述 trim 后提交，业务参数转为布尔值。新增参数通过 `createSparkGuid()` 生成 rowid。保存前保留已有 rowid，保存服务写回的对象只含这四个规范字段。
- 固定源码 `records.ts::normalizeInputParam` 保留额外属性，并识别 `Name/name`、`Description/description` 及 ID 键 `rowid/ROWID/RowID/rowId/id/Id`；仅完全缺少 ID 时才调用真实 `createSparkGuid()`。`IsBusParam` 按 Boolean 解释。旧 `saveInputParams` 只序列化四个规范字段。当前四文件页自己的解析门禁不能把这套正式历史合同缩窄为“必须已有小写 rowid”；实现须按别名优先级投影既有 ID 和显示字段，原 ID 键和值保持为身份，不替换成新 ID。字段编辑以原对象浅拷贝为基础，仅更新被编辑字段的规范键，保留已有别名键和所有未展示属性；不触碰的 item 原样保留。无 ID 项在组件里仅按当前位置取得纯展示 key；打开及未改确认不生成 ID、不写 overlay。用户首次编辑该无 ID 项时才用 Web Crypto 生成一次 rowid，并与该项 change 一起写入 DataView overlay；后续编辑从 overlay 的 rowid 保持稳定。只编辑其它项时不规范化该 legacy 项。Web Crypto 不可用时仍展示历史行，该无 ID 行不可编辑且呈明确错误；新增同样失败，不用随机回退。删除只移除当前明确点击的项；新增只附加四个正式字段。不得隐式删除/覆盖别名或其他未知属性。
- 当前四文件页将正式查询绑定到 `#8D1AB14DD8277F3E7017CD38F77B09FD@Base_DataSet@designParameters`，按目标 `rowid` 读取 `rowid,inputParams`，并通过 `designSnapshotIsCurrent()` 门禁。现有解析器拒绝非法 JSON、非数组和非对象项；空值映射为空数组用于展示。编辑不能把损坏的原始值静默变成空数组后覆盖。
- 保存必须由该正式 DataView/DataSet 的当前 query owner 提交：草稿写入 `updateEditingValue`，最终对原 `designParameters` view 和目标 rowid 调用 `DataSet.saveChanges`，由其默认流程一次应用编辑并保存。`prepareMutation` 不是保存。不得另发查询/HTTP、造参数 DataView 或绕过 DataView 权限。
- 写入口需同时验证目标行 E/action 可用、`rowid` 与 `inputParams` 可读、`inputParams.write==='allowed'`。任何 h/m/invisible、拒绝、当前 owner/目标/行/快照变化都不得展示原始数组或保存。
- 现有已注册 `json-editor` 是通用 JSON 文档编辑器，不提供参数行表单。`JsonTreeEditor.vue` 已公开导出但没有登记到 `register-renderers.ts` / `SparkComponentRenderer.vue`，且是任意 JSON 树，不提供所需参数行 UX。规则内没有 repeat/数组表单 renderer；因此采用应用自有参数控件而非伪 DataView、包级通用 renderer 或业务整页 Vue。
- Vite 扫描 `COMPONENT_SCAN_PATTERNS` 包含 `./src/views/**/*.vue`；已验 `DataSpaceDesignGraph.vue` 位于同路径树，`spark-components-loading.test.ts` 有扫描 fixture 覆盖。参数组件沿同一路径自动注册。sandbox 测试明确拦截 `globalThis`，脚本不能取得 Web Crypto；可信 Vue host 可使用 Web Crypto `getRandomValues`，与参考 `createSparkGuid()` 一样生成 16 字节/32 位大写 hex，禁止 Math.random 回退；不可用时禁新增并报错。组件仅生成本地草稿 rowid，不调用业务 API。

## 影响范围候选

在组件能力与 ID 合同审定后，最小实现范围预期为：

- `config/pages/data-platform/data-space-design/script.js`：增加参数编辑轮次与 owner/preimage 门禁、严格解析和校验、弹窗事件处理、DataView 单行暂存/保存及回执后精确读回。不得导出生产 helper 供测试绕开实际组件链。
- `config/pages/data-platform/data-space-design/rule.json`：在当前输入参数展示区提供真实参数数组编辑入口及专用配置表单；保留既有参数展示权限，不渲染 raw JSON 或绕过字段脱敏。
- `tests/runtime/page/design/data-space-design-four-file.test.ts`：使用真实 `LowcodeDataSpaceAssembler`、`DataSpaceRuntimeApi`、正式 `Base_DataSet` DataView 与 `SparkPageRenderer` 验证读、交互、写回和重新打开；保持完整正式 fixture，不以 fake DataView、裁剪 production pagedata 或单独调用脚本 helper 代替挂载。
- `src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue` 与配对 `DataSpaceParametersEditor.props.ts`：本应用窄组件，只展示/编辑参数数组 Name、Description、IsBusParam，添加/选中/删除参数；新参数 rowid 使用 Web Crypto；保留原 item 未知属性和既有 rowid。只通过 props/emit 与 rule/script 通信，不读取 DataView、权限或路由，不持有 HTTP/save 业务。
- `tests/ui/views/data-space-parameters-editor.test.ts`：挂载本地组件验证受控 `modelValue`、rowid 生成/保留、字段输入、删除、未知属性保持、Name 校验和 Web Crypto 缺失时新增失败。
- `tests/app/config/spark-components-loading.test.ts`：扩展既有 scanner fixture/assertion，证明 `src/views/app/control/.../DataSpaceParametersEditor.vue` 自动变成 registry 项，不增加手工 import/registry 或公共 package export。
- `tests/runtime/page/design/data-space-design-four-file.test.ts`：真实四文件页面验证 rule `props.on.change` 的数组 payload 到达 script、PageRuntime 所属 DataView editing overlay 持有草稿、取消丢弃 overlay、确认经正式 DataSet save owner 发送、readback/权限闭环。

不改 `pagedata.json`：现有正式 `Base_DataSet@designParameters` owner 已具备目标行查询/保存配置。新 `.vue` 位于已有 Vite `COMPONENT_SCAN_PATTERNS` 的 `./src/views/**/*.vue` 范围，由 `vite-plugin-spark-components` 自动按文件名 kebab-case 注册；与已验 `DataSpaceDesignGraph.vue` 相同，不改 spark-component package barrel/register/allowlist。

四文件承接链：rule 放置入口、`r-dialog` 与组件节点；rule `props.on` 配置 `change` handler 名称，`onBeforeRender` 指向一个只读投影函数，返回 `modelValue`（来源是 `DataView.getEditingRow(targetId)?.inputParams` 解析结果）与当前只读态；确认/取消按钮也由 rule 绑定 script handler。`build-page-children.ts::normalizeOnProps` 将字符串 handler 变为 `callFunc` 闭包，`SparkComponentRenderer` 将 Vue emit 转给监听器，事件参数原样进入 script 函数。入口开关等 UI 状态可由 script 控制；参数数组本身不可只存 script `var`。

## PageRuntime/DataView 草稿 owner 与调用序列

当前 `PageRuntime` 持有装配的 DataSet，`resolveView('#...@Base_DataSet@designParameters')` 返回属于该运行实例的正式 DataView。`DataView.getEditingRow(id)` 返回 edit overlay（无 patch 时为正式 row）；`updateEditingValue(id,'inputParams',serialized)` 更新 `_editingPatches` 而不污染正式 `rows`；`discardEditingRows([id])` 可丢弃仍处于 editing buffer、尚未应用的 patch；`DataSet.saveChanges({views:[{tableName:'Base_DataSet',viewId:'designParameters',ids:[id]}]})` 默认 `applyEditingRows:true`，先应用 editing patch，再走原 query owner 保存。

计划中的真实调用顺序：①打开前核 stable target/view/row/action/字段权限，打开 dialog；`onBeforeRender` 从 DataView 正式行或 `getEditingRow(id)?.inputParams` 投影受控 `modelValue`，不复制整份数组到 script local state。②组件每次 `change(nextParams)` 通过 rule `props.on.change` 到达 script；script 重验捕获 owner 与 E/inputParams visible/write，阶段性只校验数组/对象结构、rowid、字段类型和未知属性保留，不要求编辑中的 Name 已非空或 trim；序列化后调用当前 view 的 `updateEditingValue(id,'inputParams',json)`。组件不在每次输入时自动 trim，最终确认才要求 Name trim 后非空并将错误指向具体行。SparkPageRenderer 事件包装会触发 render invalidation；下一次 `onBeforeRender` 从 `getEditingRow(id)` 读回 overlay，script local 变量仅持 dialog/capture 标记。③取消由 rule button 调 script cancel handler，调用 `discardEditingRows([id])`，核对 patch 被清除后关闭；这只丢 PageRuntime DataView editing overlay，零 save 请求。④确认由 rule button 调 script confirm handler，从 DataView editing overlay 取最终值而非信任额外 script draft，再核权限、owner、完整 JSON/Name/id/未知属性保留和 preimage，调用该正式 DataSet `saveChanges` 仅保存此 DataView/row。⑤仅有效正式 success receipt 后关闭并 fresh query 精确读回。保存异常/未知 receipt 后，DataSet 默认已先 `applyEditingRows`，数据可能成为 dirty tracking；恢复须使用独立 DataView unknown-save 依赖，不以 `discardEditingRows`、切 renderer 或 reload 冒充回滚。

## 必需前置依赖：unknown save 后安全刷新

当前 `DataView.discardEditingRows(ids)`（`packages/spark-data/src/data-view.ts:1696`）只清未应用的 `_editingPatches/_editingOriginalRows`；它不调用 `DirtyTrackingDelegate.clearDirty`，不恢复 `rows` 中已由 `editRowById()` 合并的值，也不解决 query context 的远端提交未知态。`editRowById()` 将原行快照记入 dirty tracking；`DataView.refresh()` 在存在 pending dirty/editing 时抛 `DATA_VIEW_UNSAVED_CHANGES`。`PageRuntime.isDirty` 将 DataView dirty 纳入实例状态；`useTabPages.assertClean`、`PageRuntimePool.closePageRuntime` 和 `PageRuntime.reload` 均阻止 dirty 实例关闭/重开/刷新。因此不能用“离开页面后重开”恢复未知回执。

页面实施前置现已批准：`notes/plan-data-view-discard-pending-changes.md`（状态 approved，方法 `DataView.discardPendingChanges(ids?)`）。unknown/失败 save receipt 后用户明确选择放弃本地未确认修改时，按同一 DataView 强 query baseline 同步恢复目标本地行并清除对应 pending/editing 状态；这是本地放弃，不是服务器回滚，不重试保存，也不声称服务器未应用未知提交。随后由调用方显式调用既有原 query owner `refresh()`。若该 fresh query 失败，本地修改已丢弃，保留强 baseline rows/context 并将 view 标 stale/不可写；不得声称草稿仍保留或服务器回滚。query 成功读回 old/new 值才证明服务器当前状态。

`DataView` 依赖计划另定义其精确 API/原子合同和数据层文件，此计划只列调用次序：捕获目标 view/id；用户确认放弃；`discardPendingChanges([id])` 同步恢复强 baseline 并清 pending；用户操作所触发的一次 `view.refresh()`/页面重新读取；按 fresh query 的服务器值重建页面 snapshot。refresh 失败时保留 stale/baseline 供诊断，并提供独立“重新读取”入口；不恢复已被明确放弃的草稿。

## PageRuntime 重挂载、恢复入口与调用序列

页面 `__init__()` 不能无条件调用 `reloadDesign()`。`PageRuntime` 保留现有 DataSet/DataView，SparkPageRenderer 重挂载或脚本函数重编译时，若该 runtime 已存在未应用 `editingRows` 或已应用 dirty rows，重新发起 `loadFromServer()` 会撞上 DataView 的未保存变更替换保护；只把旧查询当作重新初始化会使整页 error/隐藏，从而用户没有可取消或放弃的入口。

新生命周期顺序：

1. `__init__()` 先解析当前 target，取得 route 声明的 DataSet 与五个真实 view；只检查当前 view/context 状态，不先请求网络。若目标/数据集/视图缺失则按页面身份错误处理。
2. 对已完整、非 stale 的 view，从当前 `rows/total/requestState`、每行权限与身份/归属重新跑既有完整性检查，重建 `designSnapshot`。目标目录仍唯一核 rowid/PK；designParameters 仍核同一目标行。参数展示值要从 `parameters.getEditingRow(targetId)?.inputParams`（若存在）而不是 script local cache 获取；这能在已重挂载的 dialog/editor 中恢复 PageRuntime editing overlay 内容。模型/字段/关系使用当前真实 rows 重建原有关联检查。布局继续通过当前 `$page.readDataSpaceLayout(targetId)` 读取，不创建第二 DataSet、不读取/复制旧 snapshot 冒充布局；layout await 后再次核 page/owner/view/snapshot，期间若失效则不发布 ready 状态。
3. 如果已有 editing/pending overlay，初始化只重建该运行实例当前 view snapshot 和组件 props，不调用 `loadFromServer`、`refresh` 或全量 `reloadDesign`，不覆盖/清空 pending。参数 `modelValue` 由现有 view overlay 投影；页面重挂载后的 `onBeforeRender` 继续读 `getEditingRow`。Confirm/Cancel 操作仍可用。若 query stale/failed/incomplete，恢复区位于全页内容门禁之外，仍可明确放弃 pending 并重新读取；无 pending 时提供单独重读入口。
4. `designSnapshot` 无法重建、任一 owner query result stale/failed/loading、身份/权限检查不通过时，不要让唯一的 recovery control 受 `design-content`/`designBeforeRender` 的全页 gate 隐藏。rule 在内容门禁之外保留一个独立恢复区：清楚显示页面/查询不可用状态，但不暴露无权限参数值；若 DataView 存有 pending，提供“放弃本地修改并重新读取”入口；如无 pending 仅 stale，则提供“重新读取”。
5. 前者必须提示这是本地放弃而非服务器撤回，用户确认后先对本地 page runtime 目标 view 执行已批准 `discardPendingChanges([targetId])`，同步验证其已回到强 baseline并清除了本地 pending，再显式 `refresh()`/调用正常 owner 读取链。后者不执行 discard，直接显式 refresh/正常读取。成功后从所有正式当前 views 重建权限/完整性 snapshot 与 overlay-aware 参数值；query 失败后保留 stale baseline并标记不可写，显示“本地修改已放弃，服务器重新读取失败”的独立状态，保留再试读取入口。整页业务视图不可写但恢复控件仍可见；不得描述为草稿仍保留。
6. 不允许创建第二 DataSet/owner，不以临时本地 `[]` 或保存的 script snapshot 替代 View 中的 editing/pending 状态，不自动 query/save，不自动再次丢弃用户未确认的新更改。

## 实施前未决缺口（主控审定项）

1. **DataView unknown-save 恢复能力**：实现前置为已批准的 `notes/plan-data-view-discard-pending-changes.md`。顺序为用户明确放弃、同步恢复强 baseline 并清 pending、原 owner 显式 fresh query；query 失败时 view stale/不可写，本地修改已丢弃且恢复入口保留。
2. **额外属性与原始对象**：默认保留所有已有对象额外属性。实现和测试须证明普通字段编辑、删项、取消与序列化不会丢失它们；未知对象结构/不可序列化值需拒绝编辑而不做部分规范化。
3. **Name 规范化与唯一性**：参考 UI 证明 Name trim 后必填，未证明数组内唯一约束或重复名称服务规则。只按已证规则实施必填，不添加唯一性、默认值或静默去重。
4. **恢复原 null 的保存合同**：专用验证先记录该行 `inputParams` 精确原值。若为 null，成功验证新增/编辑后，通过正式 DataView 保存 `inputParams:null` 并正式重新查询确认仍为 null；若原值不是 null，则恢复其精确原值。仅改同一专用空间行的 inputParams，不删空间行。在线写入前须在离线正式保存夹具验证 null 差异及 wire receipt。

## 候选交互与数据规则（仅在缺口获审定后）

1. 初次载入只读取页面已绑定的正式 owner。编辑入口仅在唯一目标行、稳定 current snapshot、行 action 允许、`rowid/inputParams` 可见且 `inputParams` 可写时可用；不新增第二次查询。
2. 打开时捕获 `$page`、路由 dataSpaceId、两场景 DataSet、目标 view、完整 rows 引用/total/requestState、目标行引用与 rowid、原始 `inputParams` 值及参数项稳定身份列表。严格解析完整 JSON 数组；无效 JSON、非数组、null/primitive 项或重复 ID（包括所有正式 ID 别名间冲突）时只读报错，不以 `[]` 覆盖。读取/编辑投影遵循参考 `normalizeInputParam`：Name/name、Description/description 都映射到显示值；rowid/ROWID/RowID/rowId/id/Id 的原键和值是现存项身份并原样保留。无 ID 行使用当前位置作为临时只读渲染 key；打开/未改确认绝不因缺 ID 变更参数或触发保存。用户首次修改该行时组件用 Web Crypto 生成一个 rowid，跟该次字段 change 一起 emit 并写 DataView overlay；同一 overlay 后续变更保留该 ID，修改其它行不顺带规范化。若 Web Crypto 缺失，行继续展示但无 ID 行明确只读，新增/无 ID 行编辑显示错误并不发 change。别名身份冲突禁写并给出具体项问题，不静默换 ID。
3. `DataSpaceParametersEditor` 以参数行表单呈现中文“名称、描述、业务参数”；新增项由可信 renderer 使用 Web Crypto 创建 32 位大写 hex `rowid`，编辑保留现存 ID（不论 ID 键别名），删除只针对唯一稳定身份。Name/name 与 Description/description 提供显示投影；编辑对应值时写入规范 `Name`/`Description` 键但保留原别名键和所有其它未知属性，保持原 ID 键和值不变。阶段性输入允许 Name 暂空或带首尾空格；控件不自动 trim，用户键入期间只验证行结构、稳定 ID 唯一性、字段类型和未知属性保留。最终确认时才对 Name trim 并检查非空，错误定位具体行；Description 按参考路径 trim，IsBusParam 显式布尔值。没有源码证据时不加重复 Name 限制。
4. 取消/关闭调用 `DataView.discardEditingRows([id])` 清理 PageRuntime overlay，0 次 `saveChanges`/后端写。保存前再次验证原捕获 page、route、DataSet、view、目标行、快照和权限；任何变化即失效并 0 写，不重新捕获新行伪装旧操作。
5. 确认提交前验证数组整体结构、所有 Name 必填、参数 rowid 唯一且现有 ID 集合只保留/删除/编辑预期范围；新 ID 必须来自正式 GUID 能力。无变化为 0 写。精确对原目标 rowid 暂存唯一 `inputParams` JSON 差异，并经当前 `designDataSet.saveChanges({views:[{tableName:'Base_DataSet',viewId:'designParameters',ids:[targetId]}]})` 提交。
6. 只把明确 success 且原 DataView owner/row identity 回执有效视为已确认保存。异常/未知回执不得自动重试或反向写。用户明确确认放弃后先调用前置依赖，同步恢复强 baseline 并清除本地 pending；这是本地放弃，不是服务器回滚。随后原 owner 显式 fresh query。fresh read 成功读回旧值或新值后以服务端当前值恢复页面；查询失败/owner 变化时本地修改已丢弃，保留 baseline 并标 stale/不可写，独立恢复入口可再次读取，不声称仍 dirty 或草稿保留。成功 receipt 后另行 fresh query，唯一核对同一 `Base_DataSet.rowid`、`inputParams` 变更结果及每项 `rowid/Name/Description/IsBusParam`；不得以本地状态代替读回。
7. 该专用空间 `models=[]` 是预期场景：保存/重开参数不需要模型 target。不得通过新增模型来让验收通过。完成一次参数回读后，再用正式 DataView 将该行恢复为保存前的精确 `inputParams`（例如原值为 null 时写回 null），收到明确成功 receipt 并重新读取确认原值后，才关闭干净实例并以新运行实例读回原值，证明无持久测试数据残留；不删除该空间记录。

## 兼容性

- 读展示继续使用正式 DataView 行/字段权限；h/m/invisible 的参数内容不得进入编辑器 DOM、默认值、错误信息或日志。拒绝写权限与无 E/action 不提供可提交路径。
- 成功变更只允许修改专用 `Base_DataSet` 行的 `inputParams`。数据空间主键、名称、类型、模型集合、关系、布局和其他行均不变。
- 空数组 `[]` 是有效空集；原始 null/空串按只读展示的现有解析规则处理，但首次写时的序列化/恢复语义必须由离线正式保存夹具验证，不擅自将原始 null 改成 `[]`。
- 并发与未知回执遵循 DataView 当前 owner/dirty 规则；没有服务端原子 compare-and-swap 证据时，不宣称客户端 preimage 能消除最后一次读与写之间的竞态。

## 验证计划（仅获批实施后执行）

- 基线先运行 `pnpm run typecheck` 并记录结果；修改后运行同命令。
- RED/GREEN 在 `pnpm exec vitest run tests/ui/views/data-space-parameters-editor.test.ts tests/app/config/spark-components-loading.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts` 中完成，使用真实装配、真实 renderer、真实 query/save 请求与正式回执；不得删除已有完整模型/字段/关系 fixtures。
- `DataSpaceParametersEditor` 组件测试：受控 modelValue、已有任一种正式 ID alias 及原键值保持、新 key 由 `crypto.getRandomValues` 创建且唯一 32 位大写 hex；Name 最终确认必填；输入空白和首尾空格期间受控值不被清空/trim；Name/name 与 Description/description 显示别名，编辑时增加规范键但保留旧 alias/未知属性；无 ID 行打开时仍可读且未编辑无 change，首次编辑该行时才生成稳定 rowid，props 回显后的连续编辑保持该 ID且不改写同表其他旧行；duplicate aliases 拒写；描述/业务参数编辑、指定项删除、change emit 原数组完整 payload；disabled controls 不产生 change；Web Crypto 不可用时历史行仍可读，无 ID 行不可编辑并有清楚提示，新增失败。
- scanner 测试扩展既有 `tests/app/config/spark-components-loading.test.ts`，证明 parameters `.vue` 自动注册和 kebab-case 名称。四文件真实挂载覆盖：专用目标行可读/可写；models=[]；rule `props.on.change` payload 正式到达 script，script 调 `DataView.updateEditingValue` 后通过 `getEditingRow` 重建组件值；新增/编辑保留 rowid/未知属性、删除指定 rowid；输入中 Name 空白可暂存且保持原输入空白、最终确认时 Name 空白/非法 JSON/非数组/null项/重复 rowid 为 0 保存请求并定位行错误；原始 null 与空集；E/action 关闭和 inputParams h/m/invisible/write denied 0 写且 DOM 无原值；目标/owner/query/view/permission 变化 0 写；组件 cancel 只清 DataView editing patch、不保存；确认后 `DataSet.saveChanges({views:...})` 正式 receipt/readback；未知回执不重试，用户明确放弃后同步恢复强 baseline/清 pending，再显式 fresh owner query；query失败时 stale/不可写且独立恢复入口保留；测试末尾恢复原值 readback 后关闭干净 runtime/reopen 验证。
- 前置 DataView 依赖覆盖：dirty 未解除前 reload/close 拒绝；显式 discard 同步恢复强 baseline、清本地 pending且不发请求；之后由原 owner 显式 refresh。读取成功时 old/new 服务端值替换当前 rows/context；读取失败或 owner/context 变化时保留 baseline、标 stale/不可写，pending 已清，独立恢复入口仍可再次读取。
- 配置检查：`pnpm run verify:pages-config`、`pnpm run verify:page-design`；精确 lint `pnpm exec eslint src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.props.ts config/pages/data-platform/data-space-design/script.js tests/ui/views/data-space-parameters-editor.test.ts tests/app/config/spark-components-loading.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts`（rule JSON 由 pages-config checker 验证）。
- DataView unknown-save 恢复依赖、PageRuntime overlay 调用合同及本页离线验收均签收后，主控在专用目标行进行写入、独立回读和精确恢复；禁止碰平台正式元数据或其他业务数据空间。

## 风险项

- 参数控件是 Vite 自动扫描的应用级配对组件，不扩 spark-component public API；扫描测试必须证明自动注册，真实四文件 mount 必须证明配置节点事件/payload 链路。
- Web Crypto `getRandomValues` 在宿主运行态需通过 renderer 测试证明；缺失时不得静默降级生成 ID。
- 主业务参数只由 `IsBusParam` 表示布尔值；UI 标签需中文解释，不公开内部键名作为业务文案。
- 异步保存出现未知结果时，`discardEditingRows()` 只丢 editing patch，不能清除 `editRowById()` 产生的 dirty tracking；dirty runtime 的 close/reload 被明确拒绝。按已批准独立 DataView 能力，用户确认放弃后同步恢复强 baseline 并清 pending，再由原 owner 显式读取；读取失败时 baseline 保留但 stale/不可写，不能恢复已放弃的本地修改，也不能自行 `clearDirty` 或关闭实例。
- 专用空间的 `inputParams` 原始值尚需离线正式夹具读取确认；验证结束必须以原值精确恢复，并通过新实例重新读取确认。

## 主控审定与派工顺序

2026-10-08 05:09，主控已核固定contracts/records及当前script/rule、DataView编辑/保存/生命周期、scanner和事件合同，继承用户持续实施授权批准以下7文件范围：script.js、rule.json、DataSpaceParametersEditor.vue、配对.props.ts、data-space-design-four-file.test.ts、data-space-parameters-editor.test.ts、spark-components-loading.test.ts（完整路径见影响范围）。上文初始draft限定不再视为额外用户审批门；**必须等主控签收discardPendingChanges依赖且明确派工后才写代码**。不改style/pagedata/host/runtime草稿API，不引入新依赖，不写其他业务记录。

完整参数闭环包含显示、增改删本地项、校验、取消、确认保存、异常后的显式恢复、原值恢复与重开；缺任一不标完成。草稿只存真实DataView overlay；正常UI关闭等价取消，mutating期间不可关闭/取消；已经应用为pending或收到未知回执不能用discardEditingRows冒充撤销。重挂载若发现pending则进入明确恢复状态，禁止自动再提交。

新条目Name空时允许输入和暂存，最终保存才逐行trim/必填；旧值无变化按语义不发写且不强迫无关规范化。别名身份保留；无ID行只在用户首次直接编辑该行时由可信组件生成一次rowid并与编辑值进入DataView overlay；打开及无改确认不生成ID、不写入。无crypto时历史行仍展示、无ID行明确不可编辑、添加失败且显式报错。cancel还原原始null/空串/文本；不因仅打开对话框就网络写。禁止随机数降级。

主控线上仅使用已建验收空间97DCB03F75AADEAE6B102B062DB71CEA的inputParams；先读取精确原值、证明离线null保存/回执，再真实增改/重开、精确恢复原值。组件里的本地草稿项删除不等同删除空间记录；不得执行该空间记录的未获确认永久删除。

前像 parameters-edit-before/，报告pilot-parameters-edit-result.md。基线typecheck、先真实RED->首个最小GREEN，再分行为扩展测试；typecheck/精确lint/pages-config/page-design/ai-codegen/dirs/diff-check。主控独立验收+配置部署回读+浏览器后才结项。gpt-6-luna单写，无嵌套代理/提交/推送/建分支。


只读预检（2026-10-08 05:10）：使用当前会话正式 DataSpaceRuntimeApi.query，固定8D/Base_DataSet按97DC...CEA查询唯一行；rowid可见，inputParams read=visible/write=allowed，editActionState=enabled，精确原值null。证据pilot-parameters-target-preflight.json。此为实施可行性证据，在线实际写入前仍须重读，不能以此过时快照直接覆盖。

## 主控兼容性验收补充（2026-10-08）

### 06:08 真实回读失败后的修订（当前执行依据）

### 06:19 保存关闭回调竞态补充

06:14 修订脚本部署后，真实唯一目标回读成功且 runtime clean，但弹窗保持打开且只剩确认/取消按钮。截图 `pilot-parameters-dialog-close-red.png`；本次已保存参数 rowid `941D71D3D9D5061FB544AF0939279C05`，根需先恢复原值 null（尚未恢复，不得误读之前的first-restore作为这次恢复）。同范围诊断 `dialog.close()` 后立即 `loadFromServer` 进入 Loading、ElementPlus异步 onClose 调 designCancelParameterEditor 看见busy重新open 的竞态；这是待测试证明的假设。新增真实延迟 readback fixture 和实际关闭事件测试，区分程序已提交关闭与用户保存中取消；不修改 RendererDialog/DataView。可在参数脚本按既有 editorOpen状态拒绝迟到关闭回调，或以已核真实合同收敛同等局部方案，不能增加第二数据状态owner。必须保持 save flight 用户取消不丢草稿/重试的已有合同，修后主控实际保存并确认dialog隐藏，再重开/原值恢复。范围仍七文件。

线上首次参数保存正式回执成功，但 `view.refresh()` 按静态视图输入重查，丢失 `loadFromServer(params)` 的一次性目标 filter；实际发出 `Filter:null`，返回500行/total1185，页面正确拒绝错误目标。证据 `pilot-parameters-save-readback-red.json`。主控未重试写入，按原目标查询确认已保存后，通过同一正式 DataSet 恢复精确原值 null，成功回执/目标回读/clean 见 `pilot-parameters-first-restore.json`。不改 DataView 的既有 refresh 语义。

本计划原先将 refresh 当原查询重放的假设失效，修订限既有七文件：保存成功后的回读必须在同一 view 显式调用 `loadFromServer`，带与首次读取相同的 fields、rowid eq 捕获目标、sort、allPages/maxRows，验证 CrudResult.success 与 loadingError，再作唯一身份/权限/值回读及 await 后 owner/路由有效性检查。弃本地修改/重读恢复不得先发无过滤 refresh；直接执行既有带完整目标条件的 reloadDesign，并保留失败可恢复门禁。测试 GetData fixture 必须根据实际 query filter 返回结果，取消宽松固定目标返回；验证正常保存、未知回执后恢复及重读失败重试的每个参数查询均有指定目标与白名单 fields。先真实 RED 后局部 GREEN，不扩大到数据包修正。

组件同一范围补除 ElCheckbox 外层嵌套 label（ElementPlus 自带 label）；保留输入名称 label 与组件 API。真实浏览器原 `.check()` 未保持选中而点击文本能选中，须复核原生 checkbox 点击与受控值都有效。此修订沿用户持续实施授权由主控批准，仍由同一低阶 writer 执行。

- 编辑的严格字段/身份校验仅限制编辑入口、变更与提交，不收窄既有只读页的结构解析合同。preimage 的 designParseInputParameters 只要求 JSON 数组及对象项；原本能展示的 Name:null/数字或有冲突 ID 的历史对象仍可只读展示。尝试编辑这些对象时明确拒绝并零写，不自动规范化坏身份或隐藏整个设计页。
- 无 ID 的未变历史项在删掉前项后仍须保留，按原数组中未消费的完整对象语义匹配，不能依赖删除后的 index。只有用户真正编辑/新增的项才需要稳定 ID；未触碰属性保持原样。
- 保存 remount 恢复状态由真实 DataView.mutating/requestState/dirty/editing 状态作纯读取投影；Render/onBeforeRender 不得更新任何 recovery state 或发请求。真实事件 handler 才可明确放弃/重查。
