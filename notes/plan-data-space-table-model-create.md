状态：superseded

替代方案：notes/plan-data-space-model-source-create.md。六类来源已完成语义与在线只读核验；复用现有设计 reader、四文件控件和同场景两视图一次保存。旧草案的新 Vue picker、单独宿主能力以及先保存模型再保存字段不再执行；旧 query-row-read 前置已通过并冻结，见 query-row-read-result.md。

# 首个数据库表来源模型创建闭环

## 任务目标

在 8D 数据空间设计页增加一个受限的数据库表来源选择与创建入口，经当前正式 DataView owner 依次创建模型和初始字段，并以正式查询回读确认两阶段结果。

## 前置条件

- `notes/plan-data-space-query-row-read-access.md` 必须先实施并由主控验收。当前 `View_TblList` 原查询返回 `primaryKeyField=null`，普通 `rowKey/fieldAccess` 没有权限身份；本计划不得以公开 raw row、推断 `rowid` 主键、另用管理员身份或改 8D 元数据绕过。可信 host 必须用依赖新增的 `readFieldAccess(row, fieldName)` 消费同一 context 的原始公开行引用。
- 输入参数7文件 writer 冻结并交接后再派本计划实施；实施时核对混合 dirty 与真实当前 owner，不覆盖并行变更。
- `pilot-model-create-owner-preflight.json` 只证明该次 97DC 只读快照中目标干净、模型/字段列表为空、两个 view 的 `addAction` 为 enabled 且 required columns 存在；它不证明创建成功、字段写权限或后续授权仍有效。每次打开与保存前均重新读取并检查实际 scope/action/字段读态。

## 影响范围

新增或修改仅限以下文件；不新增依赖、服务端接口、全页 Vue 或其他来源类型。

- `src/lowcode/data-space/lowcode-data-space-table-sources.ts`：新增固定 8D 的可信只读来源 owner。分页查询 `View_TblList`，在同一次 query context 原行上检查所需 read 三态，只输出白名单来源 DTO；选择来源后重新按真实 `rowid` 校验唯一来源，并从 `Base_TblField` 查询并投影可读字段及主键信息。owner 不向页面返回 QueryContext、原 permission、通用 query 参数或 HTTP 能力。
- `packages/spark-component/src/runtime/app-services.ts`：在现有 `PageRuntimeServicesCapability` 增加窄的 table-source reader service contract；只含来源列表与来源字段读取操作及稳定 DTO，不接收任意 scenario/model/path。
- `packages/spark-component/src/runtime/script-context-types.ts`：将该 reader 作为 `$page` 的真实消费者能力接入类型，避免另造重复签名。
- `packages/spark-component/API.md`：更新 `PageContext.$page` / `PAGE_RUNTIME_SERVICES` 的页面 API 合同说明，注明窄 reader 的固定 8D scope、异步 stale 行为及无能力时显式失败，不记录 host 私有 query/permission 细节。
- `packages/spark-component/src/page/context/buildPageContext.ts`：按页面 context 捕获 reader 与 8D scene identity；每次异步返回前后检查 page generation、当前 DataSet/scene 与 reader owner 仍有效，失效显式失败。
- `packages/spark-component/src/page/renderer/SparkPageRenderer.vue`：沿既有 `PAGE_RUNTIME_SERVICES` 到 `buildPageContext` 的传递链注入窄 reader。
- `src/App.vue`：提供 host owner 实例。reader 固定 `DATA_SPACE_DESIGN_FORM_KEY`/`View_TblList`/`Base_TblField`，不将固定场景变成可由脚本覆盖的参数。
- `src/views/app/control/data-platform/data-space/design/models/DataSpaceTableSourcePicker.props.ts`、`DataSpaceTableSourcePicker.vue`：新增自动扫描的窄来源选择组件，只承载数据库表过滤、分页、选择、加载与错误呈现；props/events 只包含安全 DTO。模型/DataView/save 权限逻辑留在页面 script 和 host owner。
- `config/pages/data-platform/data-space-design/rule.json`：加入新增模型入口与来源选择视图节点；保持表格/交互由 SparkNode renderer 组合，不迁移整页至 Vue。
- `config/pages/data-platform/data-space-design/script.js`：模型 `reloadDesign()` projection 从 `rowid,MetaName,description,Type,dataSetId` 精确增加 `Name,DbId,DbName`，并在 `designVerifyRows`/capture 中读取校验它们。字段 projection 从 `rowid,Name,AsName,FieldType,IsOutput,IsPKey,dataSetId,dataModelId` 精确增加 `description,type,ValueFun,Expression,allowAIAdd,OrderType,Order,Group`；逐项做权限读取/新增合同及保存后回读。编排来源确认、模型/字段预检、两次正式 DataView 保存与回读、stale/error 状态；所有异步点复核同一设计 snapshot 和目标身份。`pagedata.json` 只声明正式 modelBinding/视图配置且不持有这些运行 query projection，本计划不改它。
- `tests/runtime/auth-nav/data-space/lowcode-data-space-table-sources.test.ts`：验证固定查询、逐原行读取投影、read 权限三态、selected id 二次校验、keyless 来源闭合、Base_TblField 字段与正式 key 检查、stale/dispose 和无通用查询/HTTP泄漏。
- `tests/ui/views/data-space-table-source-picker.test.ts`：验证组件筛选/分页/选择/取消/加载失败呈现，不在组件内持有 query context 或发请求。
- `tests/runtime/page/design/data-space-design-four-file.test.ts`：用真实挂载的 SparkPageRenderer/页面脚本和 DataView fixture 验证两阶段创建、权限阻断、ID与来源核对及部分成功。沿用当前真实 runtime owner fixture，不替换成只测 helper 的假流程。
- `tests/runtime/page/catalog/data-space-four-file.test.ts`：更新 `createPageService(): PageContext['$page']` 类型化 host fixture，补齐新增窄 reader 的显式未配置实现，保持 catalog 测试不依赖该能力。
- `packages/spark-component/src/tests/runtime/createSandbox.test.ts`：更新 `createMockPageService(): PageContext['$page']` fixture，验证沙箱基础上下文仍提供完整页面服务合同。
- `tests/runtime/page/runtime/page-script-lifetime.test.ts`：在现有场景加载/abort/dispose/reload 和迟到成功/失败用例中覆盖新增窄 reader 的同等 scope/current-call 守卫，确认旧 context 不触 host、迟到返回拒绝。
- `tests/runtime/page/spark-page-renderer-binding.test.ts`：在现有 renderer 外部 owner/旧 hook stale 用例基础上验证写 await 后 renderer 卸载会阻断下一阶段，且同一 PageRuntime 重挂载复用原 DataSet。
- `tests/app/config/spark-components-loading.test.ts`：确认新增 Vue 配对组件沿既有 `./src/views/**/*.vue` 自动扫描，不加 registry/barrel。

## 技术方案

1. 来源能力固定在可信 host。它只用 `lowcodeApi.dataSpace.runtime.query` 对固定 8D `View_TblList` 执行受限分页和白名单 filter，不调用 `DataSpaceDesignApi.readModel` 绑定这个 keyless view。每条候选只可在同一 QueryContext 原始行上通过依赖 `readFieldAccess` 读取 `rowid/tblname/dbid/DbName` 及可选描述；任一身份字段不是 `visible`、为空或来源 `rowid` 重复时，该候选不可选择。`total` 只用于分页状态，不作为可见来源数量展示。返回 DTO 丢弃其它字段和所有 permission/token。
2. 用户确认时，host 不信任 UI DTO 中的来源值；用选中的真实 `rowid` 重查固定 `View_TblList`，要求唯一匹配且所需字段仍可读、值与选中身份一致。随后按该记录真实 `rowid` 查询正式 `Base_TblField`。在线 probe 已证明该源 wire 列包含 `rowid/tblid/enname/cnname/DataType/description/IsPKey`，不含 `DataTypeName/Memo`；host 必须对这些实际 wire 名调用 `readFieldAccess`，然后遵循固定源 `records.ts::normalizeSourceFieldRecord` 的明确映射（`DataTypeName` 取可见的 `DataType` alias，英文名取 `enname`，中文名取 `cnname`），不能把 DTO 名当 wire 字段查询。描述使用可见 `cnname`，为空时使用可见 `description`；不可假定不存在的 `Memo`。每个采用字段要求 row identity、tblid 关联、名称、类型与 `IsPKey` 的真实来源字段可见；名称/类型非空且无重复，类型缺失或权限非 visible 即拒绝，不能用 `varchar` 掩盖。主键恰有一个、为非 `lingma_sys_ent` 的业务字段。固定证据表明 `Base_TblField` 的正式模型可映射 `rowid` 主键；绝不修改 `View_TblList` 的 `PrimaryKeyFields` 或猜测其 rowid 是 PK。
3. `DataSpaceTableSourcePicker` 只负责窄 UI。数据列表由 `$page` reader 提供；不复用 `r-table` 伪装成 DataView，因为它要求正式 DataView 身份，亦不把 QueryContext 暴露给 page script。组件按一条真实候选 `rowid` 选择，刷新/关闭会取消旧结果展示；页面脚本再次依赖 host 的身份复验。renderer/host 能力未安装或 scene 不是 8D 时，入口显式禁用/报错，不静默降级。
4. 创建前重验页面 snapshot、目标 `designTarget` 唯一 row、目标 `dataSetId`、目标与 `designModels/designFields` 当前 query generation 和必需字段 `visible`。要求 `designModels.addActionState()==='enabled'`、`designFields.addActionState()==='enabled'`；新增行权限按 DataView 的正式 add grant 合同，不复制现存行的 E/R permission。当前行的写权限不能替代新增 grant。模型 `Name/DbId/DbName` 必须完整可读以检查命名唯一并保存/回读，字段初始载荷合同字段必须可写或被正式新增合同覆盖；不能证明时停止。当前 `reloadDesign()` 明确按字段列表加载：模型为 `rowid,MetaName,description,Type,dataSetId`，字段为 `rowid,Name,AsName,FieldType,IsOutput,IsPKey,dataSetId,dataModelId`；本计划须扩充模型投影为 `rowid,Name,MetaName,description,Type,dataSetId,DbId,DbName`，字段投影则增加 `description,type,ValueFun,Expression,allowAIAdd,OrderType,Order,Group` 并对需要使用的字段逐项权限/回读检查。97DC 当前 preflight 不是运行时授权承诺。
5. 模型名称取唯一名称算法的来源名基底；同名时由明确用户可见的命名结果确认，不可静默改 `MetaName`。新增模型只包含正式数据库表最低合同：`dataSetId`、`Type='数据库表'`、唯一 `Name`、`MetaName=tblname`、`description`、`DbId=dbid`、数据库名。formal model view wire 列名是 `DbName`；旧参考 business payload 字段 `DatabaseName` 必须在当前 DataView 载荷映射中落到正式 `DbName`，不能用线上 `DatabaseName` 列假设。模型 rowid 由 `designModels.addRow()/prepareNewRow` 与当前 query owner 产生并以 save receipt 确认，绝不自造或复用样例 ID。
6. 第一阶段只经 `designModels` 对应正式 8D DataView/其 DataSet owner 保存。检查明确成功回执后，在同一 view 显式调用 `loadFromServer({fields: ['rowid','Name','MetaName','description','Type','dataSetId','DbId','DbName'], filter: {field: 'dataSetId', operator: 'eq', value: targetId}, sort: 'rowid:asc', allPages: true, maxRows: 50000})`，检查返回 `success` 与 `loadingError`，按 receipt rowid 找唯一行并核对 `dataSetId/Name/Type/MetaName/DbId/DbName/description`。不得以 `DataView.refresh()` 代替这次回读：真实证据 `pilot-parameters-save-readback-red.json` 显示 `refresh()` 重放静态 `requestData()` 时会丢失 `loadFromServer(params)` 的一次性 filter，实际退化为 `Filter:null` 并返回首500行。每次模型/字段保存回读与恢复查询均须明确带目标 `dataSetId eq`、完整白名单 fields、排序及分页参数，并检查结果成功、无 `loadingError`、目标身份唯一且 generation/owner 仍当前。其间每个 await 后检查 capture 仍为当前，禁止自动重复 save。无法确认 receipt 或读回唯一性时停止并标记结果未知，不启动字段写入。
7. 只有模型精确回读成功才使用确认的 rowid 创建 `designFields` 初始来源字段：字段 Name 来自非空且唯一 `enname`；类型来自 `normalizeSourceFieldRecord` 的明确 `DataTypeName←DataType` 映射，要求原 wire `DataType` visible 且非空；描述用 visible `cnname`，否则用真实 wire `description`；绝不查询不存在的 `DataTypeName/Memo`，也不以 `varchar` 覆盖缺失类型。`type='dataModel'`；`IsPKey` 来自来源标记；`IsOutput` 对唯一主键为 1，其他为 0；`AsName/ValueFun/Expression/OrderType` 为空、`allowAIAdd/Order/Group=0`。其余默认值来自固定参考 `source-record.ts`，实施须与当前字段 formal contract 对齐，不另加角色/API字段。所有字段由真实 view owner 生成 rowid。
8. 第二阶段经 `designFields` DataView save；成功后在同一 view 显式调用 `loadFromServer`，使用 `fields: ['rowid','Name','description','FieldType','IsPKey','IsOutput','type','AsName','ValueFun','Expression','allowAIAdd','OrderType','Order','Group','dataSetId','dataModelId']`、目标 `dataSetId eq targetId` filter、`rowid:asc`、`allPages:true`、`maxRows:50000`，检查 `success/loadingError` 后校验目标 `dataSetId/dataModelId`、字段行唯一 identity、完整 source field 集合、`Name/description/FieldType/IsPKey/IsOutput` 及其他默认值回读和唯一业务 PK 同时 `IsPKey=1 && IsOutput=1`。禁止以 `DataView.refresh()` 替代显式目标回读；它会重放静态 `requestData()` 而丢失一次性过滤。页面 script 不持有 `DataSpaceDesignApi` 或 raw runtime API，不能自行调用正式 `readModel`。在新增的可信 host owner 增加固定 8D 的 `verifyCreatedTableModel({dataSetId, modelName, assertCurrent})` 窄方法，内部以固定参数调用既有 `lowcodeApi.dataSpace.design.readModel({designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: dataSetId, metaName: modelName, assertCurrent})` 并只返回安全验证结果（正式 Name、rowid、字段数及 primaryKey 等最小汇总）；此方法不得转发一般场景/model 参数或 QueryContext，并纳入 `PageRuntimeServicesCapability`、`script-context-types.ts`、`buildPageContext.ts`、`SparkPageRenderer.vue`、`src/App.vue` 同一接线范围。host suite 必须证明方法固定调用 8D、仅核对正式读取结果、scope stale 时失败。任何 required read/write权限缺失、来源/owner变化、receipt不清或正式模型验证失败均停止后续动作，不降级成“创建成功”。
9. 保存之前只允许明确的用户确认取消；对未知 receipt/部分失败，先要求用户明确丢弃当前 DataView dirty，再调用已验收的 `discardPendingChanges(ids)` 恢复该 row 的本地强 baseline，之后由原 DataView owner 用和设计页首次读取相同的显式 `loadFromServer` 参数（模型/字段各自使用 `dataSetId eq targetId` filter、白名单 fields、`rowid:asc`、`allPages:true`/`maxRows:50000`）重查；不调用 `refresh()` 或省略参数的 `loadFromServer()`。检查 query 成功后根据正式结果判定 model/field 是否已经存在、呈现部分成功；query 失败时保留 stale/不可写状态，不把 discard 描述为服务器回滚，不自动重试、创建重复字段或补偿删除。永久删除不属于本计划，不能承诺自动清理。

## 两阶段中断与重挂载合同

- 已核源码证明 renderer context 与业务 owner 生命周期不同：`SparkPageRenderer.vue` 的 `release()` abort 本地 controller 并清理 page context；`buildPageContext()` 将 `AbortSignal` 捕获进 `$page` guarded service wrapper。`PageRuntimePool` 按 route call 保持唯一 `PageRuntime`，其 DataSet 归实例所有；tab/native 导航保留该 runtime，关闭前 `runtime.isDirty` 会拒绝 dispose。`tests/runtime/page/spark-page-renderer-binding.test.ts` 已真实验证 renderer 卸载后 DataView/editing patch 保留、旧 hook 抛 `PAGE_RUNTIME_STALE`、同一 runtime 重挂载复用 DataSet。`DataView.saveQueryViews()` 在统一 save owner await 期间设置 `mutating` 并在 finally 清除；成功回执接纳正式新增 rowid/清 pending create，失败则保留本地 pending。refresh/load 拒绝覆盖 dirty；已验收的 `discardPendingChanges(ids)` 只恢复强 query baseline、不发 HTTP，后续刷新由原 owner 显式发起。
- 同一 PageRuntime 的 renderer remount 不需要另造 operation-state store：原 DataView pending-create/mutating 与 fresh server readback 即为事实。旧 renderer 每个写 await 后须先调用受该 renderer signal 保护的窄 host verify/source 方法，再允许下一阶段；signal 已 abort 时 wrapper 在 host call 前拒绝，旧执行不得新增字段或再次 save。新 renderer 初始化先检查 models/fields `mutating`/dirty；mutating 时只显示等待状态。dirty create rows 只可经用户明确确认后按 DataView `pendingCreateIds` 精确 discard，再由原 view owner 以设计页同样的显式 `loadFromServer` 参数重查模型/字段（目标 `dataSetId eq` filter、完整白名单 projection、sort与allPages/maxRows），成功后新 context按正式 rows 识别完成/部分状态。dirty 阻止加载时，恢复提示与显式 discard 按钮须位于整页内容 gate 外；确认 discard 后，必须用相同显式目标参数重新执行 `loadFromServer`，检查其成功后才调用普通 reload/render，不调用可能丢失一次性 filter 的 `refresh()`。不得用 page-local boolean 当事实。
- 来源 tuple（`Type + DbId + DbName + MetaName`）仅用于校验所选来源与已读模型是否相符，不能作为永久去重键或禁止再次创建条件。固定参考的 `createUniqueModelName` 委托 `createRecordUniqueTextName(record => record.Name)`，按模型 `Name` 唯一并在冲突时生成带序号的名称；普通新增流程每次都基于当前模型列表取唯一名，参考流程允许同一来源产生不同 `Name` 的多个模型别名。故本功能只阻止同一当前 operation 的并发重复触发（`saving` 状态、当前 pending row/receipt rowid），不能禁掉合法的新显式创建。每次创建之前 fresh read 用于命名冲突与当前状态检查，不以相同 source tuple 拒绝。模型 save 的正式 receipt rowid 是当前操作身份；model readback 后以该 rowid 绑定字段保存。若失败/未知或部分完成，展示精确可读状态且不自动续写/重放；重新 renderer/app 不得把旧请求当作自动重试。用户明确开始一个新创建动作时可创建另一个唯一命名别名，并明确显示其新名称；不得声称 exactly-once 或服务端幂等保证。若恢复时多个正式候选无法唯一归属，保留歧义提示并停止对该既有结果的自动处理，但不禁用后续用户显式新建。
- **仍未决的完整进程重启边界**：当前没有服务端幂等键/operation receipt或跨重启本地 operation owner，因此 app/runtime 在 save 在途时硬刷新后，不能判定旧请求的最终结果；fresh正式查询只能报告当下读到的模型/字段。不得自动重放或续写旧操作，也不得将未读到记录解释为旧保存失败/未落库；保持旧操作“结果未知”。这不阻塞一项由用户明确发起的新创建动作，但不保证它与旧的未知请求不会同时落库；新操作须按 fresh Name 唯一算法选取名称并明确呈现结果，系统不宣称 exactly-once/idempotency。未验证后端一致性前不扩大成全局操作框架或持久存储。

## 兼容性

- 只增加一个数据库表来源模型入口；不改现存模型、字段、关系、布局、参数或目录元数据，不扩字典/数据库视图/接口/JSON/逻辑视图来源。
- `View_TblList` 仅作为固定 8D 的原行只读来源查询，不绑定成正式 DataView，不获得主键、写权限或任意 query 能力。
- 正式保存仍由当前设计页 `designModels`/`designFields` DataView owner 管理；不在页面中手造 HTTP/save payload。关系图与模型表保存不是同一事务。
- 若 `readFieldAccess` 依赖未完成、host scope 不匹配、字段 masked/invisible、grant 不足、source 不唯一或当前页面 stale，动作 fail closed，不改数据。

## 验证计划

### 实施前

- 确认输入参数 writer 已冻结；记录 `git status --short --branch`，只核本计划目标文件及每个 preimage，不清理共享 dirty。
- 对计划受影响 workspace 运行 `pnpm run typecheck` 并记录基线；再按实际 package owner 运行包级 typecheck，避免全仓 build。
- 前置 row-read plan 已通过其自身 runtime-api suite/typecheck；不在本计划复制实现或替代其测试。

### RED/GREEN 与定向门禁

- 先在真实挂载页 integration fixture 写来源列表/选择/创建最小 RED，确认当前页面无入口/无来源权限通道；再按“host窄reader → picker → 两阶段 DataView保存”的每一小步立即运行对应单测至 GREEN。
- Host suite 覆盖 keyless wire 原行权限读取、clone/外来行拒绝、来源scope stale、visible/masked/invisible、字段投影白名单、唯一rowid复验、source→Base_TblField关联、恰一非租户PK，以及缺读权限时零 DataView 写。
- 页面 suite 覆盖模型 receipt 与精确 readback 后才提交字段；模型失败无字段写；未知 model receipt 不自动重试；字段 save/readback 失败保留可识别模型且不删除/重建；target/view/page generation 变化后停止；addAction/必要权限不足时零保存。
- 模型 reader host 新增固定 formal verify 方法后，页面 integration fixture 覆盖 DataSpaceDesignApi.readModel 只经 host 触发，正式 model/field source contract 不符合时不报告完成。dirty未知时验证“用户明确 discardPendingChanges → 原 DataView owner 显式带目标过滤器 `loadFromServer` → 按真实结果显示状态”，验证每次请求保留目标 filter/白名单 fields 并拒绝用会丢一次性 filter 的 `refresh()`；拒绝自动重放。
- lifecycle suite 覆盖 DataView save 挂起时 renderer 卸载、旧 `$page` signal stale 后不能提交 fields；同一 PageRuntime remount 保留 DataSet；新 renderer 在 mutating/dirty 时不查询覆盖、不写；用户确认 discard pending creates 后 explicit owner `loadFromServer`；当前 operation 收到有效 receipt 并按 rowid 精确回读时不得重复保存；未知结果不自动续写/重放；固定来源的第二次用户显式新建可依正式唯一名称算法得到新别名，且不被 tuple 全局挡住。覆盖同一 mounted operation 的双击被阻止，并验证“创建新别名”不等同于“重试旧未知保存”。
- 组件 suite 覆盖单选、筛选分页、关闭/迟到响应、空结果和错误；验证页面只消费 DTO。扫描 suite 验证自动注册。
- 最终按顺序：`pnpm run typecheck`；目标包等价 typecheck；`pnpm --filter @spark-appworks/spark-lowcode-api exec vitest run src/platform/data-space/runtime/data-space-runtime-api.test.ts`（仅确认依赖合同且依赖 writer 已冻结）；`pnpm exec vitest run tests/runtime/auth-nav/data-space/lowcode-data-space-table-sources.test.ts tests/ui/views/data-space-table-source-picker.test.ts tests/runtime/page/design/data-space-design-four-file.test.ts tests/runtime/page/catalog/data-space-four-file.test.ts tests/runtime/page/runtime/page-script-lifetime.test.ts tests/runtime/page/spark-page-renderer-binding.test.ts tests/app/config/spark-components-loading.test.ts packages/spark-component/src/tests/runtime/createSandbox.test.ts`；精确 eslint 覆盖本计划 TS/Vue/tests；`pnpm run verify:ai-codegen`、`pnpm run verify:dirs`、`git diff --check`。实施时按 repository实际 package scripts修正命令并记录退出码，不跑全仓 test/build。
- 不在线创建模型。若未来主控另行执行线上闭环，须单独记录真实授权身份下的模型/字段保存 receipt、带精确目标参数的显式 `loadFromServer` 回读与正式 `readModel` 证据；本计划测试绿不能代替线上写回证据。

## 风险项

- 当前真实 `View_TblList` 查询的普通 rowKey/keyed fieldAccess 失败；source picker 的唯一可行读取前提是先验收逐原行 read access。本计划未获批准/前置依赖未完成前不实施。
- 空数据空间与此次 addAction/columns preflight 不能证明目标来源存在、指定字段可见或写入权限持续有效；运行时必须逐scope重验，受限时显式中止。
- 模型与字段不是事务。字段阶段失败会留下可回读的模型记录；不自动永久删除，也不把未知回执当失败重放。
- 同一 PageRuntime 的 remount 由既有 DataSet/DataView owner 承接；完整 browser/app 重启期间的 save 在途未知回执仍无幂等证据，是保留的明确未决边界。
- 当前真实来源候选及候选字段读态、模型/字段正式 save receipt 形状和最终 formal readModel readback 尚无在线创建证据；计划不得将固定源/UI默认或测试 fixture 写成生产保证。
- 计划预计跨应用 host、component runtime、四文件工具页与多层测试。实施只按上述白名单，发现必须改其外文件/新增公开公共 API时停止并先修订计划。
