状态：draft

## 任务目标

在现有数据空间设计四文件页中，为当前选中的正式模型字段增加单字段 `description` 编辑；只通过原查询 DataView/save owner 授权、提交并精确回读，不改模型、其他字段、关系或布局。

## 影响范围

仅计划下列三个文件；本轮只读拟案，未实施：

| 文件 | 修改概要 |
|---|---|
| `config/pages/data-platform/data-space-design/script.js` | 查询 projection 加入 `description`；加入当前选中字段校验、基线捕获/重验、`$page.showPrompt`、精确字段 patch、单行 DataSet 保存、未知结果锁定和正式回读/刷新编排。复用现有 snapshot、DataView 及 `reloadDesign`；不新增保存 facade/API。 |
| `config/pages/data-platform/data-space-design/rule.json` | 字段表保留只读文本权限投影并展示描述；增加基于 `designFields.currentRow` 的“编辑所选字段描述”入口，开启当前行高亮。Prompt 前与 refresh 前均确认 currentRow 仍是原选中 rowid，不默默改选刷新后第一行；刷新后只允许按原稳定 rowid 恢复选择。标题去掉“只读”字样；不改正式 `pagedata.json`。 |
| `tests/runtime/page/design/data-space-design-four-file.test.ts` | 扩展现有真实装配/Renderer 测试夹具的正式字段模型元数据、后端权限与保存/回读行为，验证 DataView 原查询+统一保存链、用户操作和失败边界；不删减现有权限/完整性数据，也不另造 fake DataView。 |

不修改 `pagedata.json`：设计场景已绑定正式 `Base_DataModel_Field` 模型；增加实际正式字段 `description` 的测试 binding 投影应在现有夹具正式模型上声明，不得把字段定义塞回场景配置。无新增 API、依赖、Vue 页面、后端、测试文件或计划外文件。

## 技术方案

1. **先核写入 owner 和基线合同。** 当前 `designFields` 绑定 `#8D1AB14DD8277F3E7017CD38F77B09FD@Base_DataModel_Field@designFields`，读取由 `DataSpaceRuntimeApi` 原查询 owner 提供；`DataView.editActionState(row)` 消费行级 E，`fieldAccess(row,'description').write` 必须是 `allowed`。不得用登录身份、角色、旧 Vue 门禁或 `prepareMutation` 代替权限/保存。
2. **查询正式描述并维持读权限语义。** `reloadDesign` 的 `fields.loadFromServer` 明确请求 `description`；其余行的身份仍逐行校验 `rowid/dataSetId/dataModelId`、主键与完整性。`description` 是普通展示字段，不作为整页必需身份条件；显示沿用 `r-text` 的 hidden/masked 投影。只有编辑操作要求目标 description 的 `read==='visible'`，确保显示值可以成为源值 preimage，隐藏/脱敏即拒绝编辑，不预填原值或写回掩码。
3. **入口只取当前已选字段。** `RendererTable` 默认 row-click/current-change 经 system default 写入 `DataView.currentRow`；规则开启 `highlightCurrentRow`。点击编辑时从正式 `designFields` view 捕获当前行，要求 `$page.resolveView(binding)` 与捕获 view 相同、目标 row 仍在 `view.rows`、`getPkKey(row)===rowid`、`dataSetId===当前目标 ID`、`dataModelId` 属于当前正式模型行集合、对应权限可读/可写、`editActionState==='enabled'`。同一 DataView 有其他 `dirtyRows` 或 `editingRows` 时拒绝启动，避免误将别的改动捎入单行保存；用 `dirtyRows`、`editingRows` 与 `getDirtyChanges(id)` 确认，不假设存在通用 revert/hasPendingChanges API。
4. **提示期间保持同一操作身份。** 用现有 `$page.showPrompt(message,title,{placeholder,defaultValue})` 单项输入，不新造 dialog；description 必须可读才能提供 default。先捕获 `$page`、路由数据空间 ID、两场景 DataSet、字段 view、选中 `rowid`、字段行引用、当时 `description`、完整 `rows/total/requestState` 与设计 snapshot。Prompt 取消返回 `null` 时不调用 `editRowById/saveChanges`。Prompt 返回后逐项核页面 owner、当前路由与 target snapshot、字段 view/rows 身份、原 rowid/归属/模型关联、选中行、权限/action 和原 description preimage；任一失配即中止，不取新目标行冒充原操作、不自动重开 prompt、不提交。
5. **源值变化先重新查询再决定。** Prompt 可能等待期间有其他操作。prompt 返回后通过现有 `reloadDesign()` 对正式 5 个 view 和布局重新查询，确认页面仍 ready、路由/数据空间身份不变，按捕获 rowid 在新 `designFields` rows 中唯一定位，并比较新旧 `dataSetId/dataModelId/description`、选中身份和权限。描述已变化时报告冲突并停止，不覆盖新值；没有变化且仍可写才进入暂存。输入按用户原文保存，比较时只将可见当前值按字段实际值规范为字符串，不 trim/不截断、不新增必填或长度限制；参考字段行内描述编辑未设这些规则。该步骤是新的原 owner 正式查询，不做本地缓存/假 row。若另一轮 reload 正在进行，不能将 `reloadDesign` 的早返回视作刷新成功，必须验证新 snapshot/requestState 已完成且 current；否则零写退出。
6. **仅暂存一个字段并立即保存一行。** 对当前精确 row 执行 `designFields.editRowById(id,{description:normalized})`；空字符串按实际用户输入保留，不自创默认或必填规则；trim 仅是否 no-op 的比较策略须经参考合同/业务验收确认，不得静默改用户内容。重新核 `$page`/route/target/view/row owner 和 `editActionState`、`description.write==='allowed'` 后调用 `designDataSet.saveChanges({views:[{tableName:'Base_DataModel_Field',viewId:'designFields',ids:[id]}]})`。`DataSpaceQueryContext.prepareSaveChanges` 以原查询行生成差异 patch；计划夹具须证明请求只含本次 `rowid + description`，不带其他属性或其他行。只接受返回 `success===true` 且单 view saved receipt 的回执；`DataView` 会通过原 query/save executor 校验 receipt identity/context，再接纳服务端正式值。
7. **未知结果不重放，成功必须精确重读。** 发出保存前记录 uncertain rowid 并锁编辑入口；任意异常、拒绝或不能确认 success 都按“结果未知”处理，不自动重试、不自动发送还原写、不清掉 dirty、也不让“重新加载”把 pending 变更覆盖。提示用户离开并重新打开本页运行实例核实正式值后再操作；当前实例保持锁定。只有明确 success 回执才清 unknown 锁，再 `reloadDesign()`，按原主键唯一查回并逐项断言 `rowid/dataSetId/dataModelId/description` 精确符合新值、权限仍有效、设计 snapshot ready；刷新失败与已保存事实分开展示，不把仅有回执说成 readback 成功。
8. **乐观并发边界保持 fail-closed。** 本地 prompt 前后源值比较和保存前完整 owner refresh 可检测读后至提交前已可见的变化；`DataSpaceRuntimeApi` 当前源码保证 query-context/scope owner、保存/查询串行及回执身份，不足以证明跨客户端对字段 preimage 做原子 compare-and-swap。正式试验前须由主控确认真实后端 `save` 是否另有并发前置条件/冲突回执；若没有该保证，报告为仍有“最后一次 fresh read 与写入之间”的竞态，不把客户端 preimage 包装成服务器原子锁，不自动放宽。

## 兼容性

- 成功变更限于一个 `Base_DataModel_Field.description`，保留 rowid、归属、字段 `Name/AsName/FieldType/IsOutput/IsPKey`、模型/关系、输入参数及布局不变；既有只读描述呈现继续由原 DataView 双通道权限处理。
- 沿固定参考提交 `E:/r/sparkproject@842dec4f11b333df904b9a4e26b6566b0802bab8`，参考节点字段表将 description 列列为可编辑字段；正式 contract 将它投影为字段描述元数据，字段选择显示存在 `description || Name` 标签变化。本操作不变更字段选值/标识。线上手工验收只可选专用试验 data-space 内的专用字段，禁止编辑平台正式元数据。
- 取消、无选择、无读/写权限、action 禁止、行/归属/owner变化、源 preimage 变化、空操作均为零写。无角色机制或按角色分支。
- 当前 DataView 没有可用于安全“撤销已发出的未知提交”的公开 dirty discard 操作；`refresh()` 在有 dirty 时拒绝覆盖。故未知回执必须锁定本页并离开/reopen 查询核实，不能自动 refresh/revert/resubmit。

## 验证计划

- 基线由实施者在修改前执行并记录：`pnpm run typecheck`；此 draft 阶段未运行。
- RED/GREEN 顺序：在真实 `SparkPageRenderer + LowcodeDataSpaceAssembler + DataSpaceRuntimeApi + DataView` 测试中先证明字段描述当前仅只读/无 edit 行为，再完成单字段改动并立即跑 `pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts`。
- 必须覆盖：成功选中一字段、单字段差异 payload、精确原 rowid/归属/模型 ID/description 回读；无 currentRow；cancel 0 写；无 E/action、description hidden/masked/write denied；prompt 期间 route、target、view、row、query result/requestState/权限变化 0 写；刷新后源 description 改变冲突 0 写；unchanged 输入 0 写；明确失败与 unknown receipt 不重发/不自动撤回/锁定；成功后重载仍见更新值；Renderer 页面显示 description 且无泄漏。
- 在真实 query fixture 增加显式行 E 和字段 E 权限，仅用于测试对话框门禁；正式查询不裁剪生产模型/数据。save fixture 要使用现有 DataSpaceRuntimeApi 的真实 request/receipt 解码路径，并将提交变更反映到随后 formal query；不得用 monkey-patched fake DataView 或脚本 helper 代替。
- 配置与静态检查：`pnpm run verify:pages-config`、`pnpm run verify:page-design`；类型/精确 lint：`pnpm run typecheck`、`pnpm exec eslint config/pages/data-platform/data-space-design/script.js tests/runtime/page/design/data-space-design-four-file.test.ts`。按仓库阶段规则，必要时再执行 `pnpm run lint`。
- 仅在本地与主控现有专用验证环境完成后，由主控明确安排专用试验 data-space 字段的在线操作；确认测试前值并留存安全证据，执行一次修改，独立重新查询核对同一 field rowid 的 description；不触碰现有业务字段、平台正式元数据或他人数据。线上验证不属于本子计划实施者在本轮的操作。

## 风险项

- DataView 接入的是旧查询的权限和 save owner；仅 `editActionState==='enabled'` 不代表 description 可写，必须逐行字段 E 权限通过。测试还需覆盖 row E 与 field E 相互独立。
- `description` 读取为 masked/invisible 时无法安全建立可展示 preimage；本方案 fail closed，不允许基于脱敏文案覆盖原值。
- 前端完整 refresh + preimage 比较不能证明服务端 CAS。真实 owner 并发写协议证据不足时，主控应暂缓任何非专用试验数据写验收并决定下一步，不允许本页自行假设。
- DataView query-backed `editRowById` 暂存后由同一 DataSet owner save；未确认回执时 dirty 状态会阻止 refresh。未知回执采取锁定当前实例/不重试，避免双写，但需要离开并重开实例核实。
- prompt、refresh 或保存期间切换目标/失效 pageRuntime 时，必须按捕获 owner 失效退出；不得对新路由当前字段继续原编辑。

