# G4 字典领域 adapter 只读复核

## 范围与结论

只读查看 `DictionaryWorkspace.prepareEntryAppend`、`DictionaryAiCandidates` 的 source/parse/dedup、`DictionarySchema`、对应 lowcode/runtime workflow tests、通用 `AiDataEntrySession` adapter/parse/confirm 顺序，以及保存的正式 DataView 配置快照。没有改产品/测试/台账，也没有跑门禁、服务或 UI。

**结论：字典领域逻辑可以由通用 session + 原 DictionaryWorkspace adapter 承接，但不能直接用现有 `readContext / validateBatch / appendBatch` 三个回调完整保留旧行为。** 有两项契约需主控在 G4 接线前裁决/补齐：通用字段类型校验发生在 adapter `validateBatch` 之前，拦住字典既有 val 数值/数字字符串归一化；通用 session 没有候选归一化/过滤阶段，adapter 不能在只读全批校验阶段实现旧的“跳过重复项并给 duplicateCount”语义。不要以 prompt 指令替代这两项本地确定性校验。

## 源码事实：必须保留的领域规则

1. **六个字典业务字段与领域校验**：`DictionarySchema.fields` (`dictionary-schema.ts:21-28`) 是 `val/txt/exVal_1..4`，标题来自 definition 的 `val/txt/secondValue/thirdValue/fourthvalue/fiveValue`。标题未配置/不可读时保留字段并显示默认标签，不裁剪扩展数据。`validateEntry` (`:46-68`) 要求 val 非空文本或数值；数值型字典的 val 必须为有效十进制；txt 非空；四个扩展值可省略、null 或文本。
2. **旧 AI 的归一化与解析**：`dictionary-ai-candidates.ts:442-475` 接受数组或 `{rows}`（也解析完整包裹的操作标签），拒绝普通对象外/身份字段/排序字段，最多 200 行、assistantDraft 不超过 200 KiB；跳过 null/空对象。文本 val trim；正式 val 列为 string 时，把有限数值转为字符串；txt trim；extension 保留空串与 null。`dictionary-ai-candidates.test.ts:108-137,244-259` 覆盖同批大小写/空白重复、已加载重复、字符串 val 数字归一化及数值字典代码语义。新通用系统的 `parseCandidateDraft` 则只接受 `{"entries":[...]}`，由正式 allowAIAdd 字段 type 做硬类型校验；旧 array/rows/tag 格式和 `candidateKey` 属于被替代的 AI 专用协议/预览实现，不应搬回。
3. **去重范围与时点**：旧 `currentReadableCodeValues` (`dictionary-ai-candidates.ts:483-501`) 只遍历 `workspace.entries.rows`，读取每个可读 val；对有主键行取 `entries.getEditingRow(id) ?? row`，所以覆盖既有行草稿，也包括已经在同一原 DataView 暂存的新条目。归一化键为 `String(value).trim().toLowerCase()`；generation 阶段跳过与本批前项/当前已加载可读行重复项并计数，confirmation 再检查一次当前已有编码 (`:130-139,324-337`)。此链没有为去重另发查询；G4 adapter 应使用当下已加载 rows 与原编辑覆盖，不额外全量拉取、保存、或检查其他 DataSet。
4. **权限/上下文**：`DictionaryWorkspace.prepareEntryAppend` (`dictionary-workspace.ts:364-420`) 要求 definition/entries 查询已有效加载、无未知保存/刷新/提交、当前 scope 精确匹配单字典、definition 无未保存修改、条目新增 action enabled；检查新行权限而非借用已有行权限；按当前可读 dictionaryType 验 val 语义；全批预检成功才逐行 addRow。`DictionaryAiCandidates.readSource` (`:394-420`) 要求 definition 单行和 dictionaryType 可读/有效，按权限读取字段标题/name，name 不可读时 prompt 不泄露原值。`tests/.../dictionary-ai-candidates.test.ts:341-356` 覆盖 val 隐藏后不得确认。
5. **条目身份与赋值**：旧 append owner 固定 `typeid = 当前 dictionaryId`、`crttime = 一次格式化的本地创建时间`、`ordIdx = 0`，`rowid` 由 DataView 加行产生；这些不是 AI 身份字段 (`prepareEntryAppend :390-416`)。但正式配置快照 `ai-data-entry-formal-config-read.json` 的 `_Base_DictData` 中 `ordIdx`（tinyint）和 `createuser` 的 `allowAIAdd` 均为 1；`exVal_4/val/txt` 也为 1，扩展字段并非全部启用。generic field derivation 可带出 ordIdx/createuser，领域 adapter 不得再用六字段白名单剔除它们。`typeid/crttime` 保留领域赋值；候选不得伪造 rowid/typeid/crttime。
6. **部分草稿/保存边界**：领域新增和 AI 确认都只用 `_Base_DictData` 原 entries DataView 暂存；`saveData()` 沿现 DataSet/DataView 保存，确认阶段不持久化。原 tests 覆盖候选全部预检失败时无一行写入并保留已有 draft、成功暂存不发保存、普通取消/保存沿原 view (`dictionary-workspace.test.ts:877-928`)，以及拒绝回执保留原草稿。通用 session 对 adapter appendBatch 部分失败会将轮次标记 consumed，避免重放整批；这一约束应保留。

## 推荐最窄接线

- **readContext(targetView)**：先要求 `targetView === workspace.entries` 且 DataSet/definition/entries 仍是本字典实例；只读已加载的 definition 与 entries。返回最小领域上下文：当前有效 dictionaryType、逐字段可读标签、必要时可读字典名称、以及已加载且可读的编码值（含 editing overlay，仅用于提示避免重复）。不带 masked 值，不启动额外 query，不带身份作为模型可控字段。输入 businessPrompt 仍由通用 Input DataView 管理。
- **validateBatch(targetView, rows)**：继续精确校 target/workspace、definition 无变更、状态/查询有效、addActionState 与每个实际生成列的权限。按当前 dictionaryType 只校验 AI 实际提供的 DictionarySchema 字段（如 val/txt 未被选为 AI 列，就不要求模型提供也不在这里要求非空）；对 `ordIdx/createuser` 等非六字段按 formal DataColumn + DataView validator 校验。重查已加载可读条目与 pending create/edit overlay 的规范化编码，作为确认前硬拒绝/复核；不做 HTTP。拒绝 candidate 的 rowid/typeid/crttime，确保这三项仍由 domain append 赋值。
- **appendBatch(targetView, rows)**：调用 DictionaryWorkspace 的窄 AI-staging 方法，不直接拼 HTTP，也不调用 save。新行以原 DataView addRow；domain 注入 typeid/crttime；ordIdx 有正式 AI 值时保留，否则回退0；保留已允许的 createuser 和所有 AI 提供的 formal allowAIAdd 列；缺失的 val/txt 建空编辑值供原标准表单手补。保存仍由原 `saveData` 与 DataView validator / DictionarySchema 完整校验。
- **需要的窄 Workspace API**：现有 `prepareEntryAppend/appendEntries` (`dictionary-workspace.ts:364-420`) 固定要求六字段+typeid/crttime/ordIdx 全部有写权限，并完整 `DictionarySchema.validateEntry`，正好会阻断“val/txt未勾选时生成其他列后手补”。不建议删除/弱化普通手工新增及旧完整候选合同；应另加或抽取一个参数明确的 AI staging 预检/追加路径，校验“当前实际AI输出的字段 + domain必赋字段”，不全局放宽默认新增。现有 view 的 form 负责用户补齐 val/txt；正式 save 要求完整有效条目。

## G4 前置阻断风险：当前 adapter hook 顺序不足

`AiDataEntrySession.confirm()` 顺序为 `readCandidateRowsFromView(capture.fields)` → `preflight(rows, fields)` → `adapter.validateBatch` → `adapter.appendBatch` (`ai-data-entry-session.ts:… confirm`; parser `:540-570`)。`parseCandidateDraft` 在 adapter 之前按 DataColumn 类型调用 `validateAiDataEntryValue`，因此 adapter 无法归一化旧字典已支持的类型输入：

- string formal val 列，旧逻辑把 AI 返回 `12.5` 转为 `'12.5'`，有现成测试 `dictionary-ai-candidates.test.ts:244-259`；generic parser 会在 adapter 获得 rows 前以“应为 string”拒绝。
- number formal val 列，旧 `DictionarySchema` 接受有效数字字符串并保留编码语义，旧解析后继续用领域类型规则；generic parser 会在 adapter 前拒绝 string 值。
- 旧 AI 在解析候选时过滤本批/已加载重复值并保留第一条、更新重复数；现有 `validateBatch` 是只读全批验证，不能移除重复行或让预览表反映过滤结果。

**最小建议**：在通用 session 的 shape/未知键检查之后、通用字段 type/required/validator 检查之前增加一个窄可选的同步 `normalizeBatch(targetView, rows)`，只允许返回原候选字段白名单的规范化/过滤 rows（可伴随 skipped count）；再走通用类型检查、domain validateBatch 和 staged appendBatch。字典实现据正式 val 列类型做 val trim/有限数值格式归一，统一去重（同批 + 当前已加载 readable rows及editing overlay），且仅本地已加载范围；validateBatch 在确认前再重核。若不允许改这个 hook，需接受并显式记录“数字/字符串宽容归一与预览跳过重复项”产品行为变化；不要把该职责塞进副作用式 validateBatch 或扩大 `readContext` 查询。

## 关键反例映射（实现后应覆盖）

1. val/txt `allowAIAdd=false`、其他 writable 列（如 exVal_4、ordIdx、createuser）允许：生成字段不含 val/txt；确认只暂存原 entries 一行，val/txt 留空供手工编辑；填好后仅原 saveData 提交。若把 val/txt 仍标 required for AI，会错误拒绝；若过滤掉非六字段，会丢正式字段。
2. ordIdx tinyint/createuser varchar正式允许：预览与暂存均保留其 AI 值并通过正式权限/type/validator；未给 ordIdx 时 domain 默认0。AI提供的 rowid/typeid/crttime 不得改写目标身份/归属/创建时间，domain 注入正式值。
3. `val:' Blue '`/`'blue'` 同批仅保留首条并计数；与已加载行 `val:' BLUE '` 重复时生成时跳过；候选生成后既有行编辑覆盖或原 DataView 新增草稿占用了该码，确认前拒绝/按既定规则过滤，不发补充 GET；val masked 且存在已加载条目时 fail closed，不猜不重复。
4. string val 的数值候选转正式字符串；number val 的合法数字字符串按 DictionarySchema 正式编码语义处理；超出字典 numeric/string contract 的值不得被通用 adapter 放行。
5. 全批后项无效、重复/来源身份失效或写权限改变时，预检阶段不追加任意条目且保留旧草稿；append 部分异常后会话已消费，不能重复整批；confirmed rows仍是原DataView待新增且无后台 save，使用原取消/保存责任方。

这是一份静态合同准备意见；没有验证实际新 adapter，也没有运行测试。

## 主控裁决：前置normalizeBatch建议不纳入实施合同

以下为本报告中“G4前置阻断风险”及最小建议的裁决更新：主控已明确不扩展 `normalizeBatch` hook。新的通用合同按正式 DataColumn 类型严格校验；额外键/非法结果整批拒绝。旧字典 AI 专用跨类型容错、旧 array/rows/tag 格式、静默去重与 duplicateCount 不属于新配置驱动合同，不作为兼容要求。当前正式 val 为 varchar；旧 Number→String 仅适配历史 string 字段路径，不能据此扩大新 session 的类型合同。

保留的字典领域要求：按正式字典编码类型、trim/case-insensitive 规则比较候选与已加载条目；包括原 DataView 的 getEditingRow 覆盖及 staged 新增；确认前重核，不扩全量查询、不把 rows/code 列表塞入 readContext/capture。发现任意重复时整批拒绝并向用户说明，禁止静默过滤。readContext 仅带可读的已保存设计语义/字段标签，不能带当前业务行；缺少非 AI 必填字段可以留在原草稿由用户补录，完整 saveData 校验不放宽。

故我上文提出的 normalize/filter hook 是已否决提案，不应作为 G4 blocker 或实施要求；只保留为历史审查意见。实施应通过既有正式 DataColumn 类型校验、`DictionaryWorkspace.entryAppendError/appendEntries` 完成领域预检与同源 staged 写入。
