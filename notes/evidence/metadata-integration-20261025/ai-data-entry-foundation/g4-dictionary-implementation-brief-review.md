# G4 implementation brief 只读复核

## 结论

**按 brief 可以实施；未发现与唯一台账 G4 或现有 SPA host 合同冲突，也未发现源码证明会误伤正常手工新增/保存的阻断项。** 复核只读，不改产品/测试/台账、不运行门禁或服务/UI。

## 对照依据

- **G4字典合同一致**：brief 沿用 `DictionaryWorkspace.entryAppendError/appendEntries`，以正式 allowAIAdd 输出字段为候选，不再把六字段清单作为 AI 白名单；AI字段由 generic derivation 与当次权限判定。`typeid`/`crttime`由领域赋值、`rowid`由`DataView.addRow`，`ordIdx`仅缺省时补0，createuser不按名称排除；这对应台账G4域接线裁决与正式字段事实。
- **类型/重复裁决一致**：正式 DataColumn 类型严格检查；重复按 `String(value).trim().toLowerCase()` 比较本批及已加载可读条目，使用 `getEditingRow` 覆盖并含 staged 新行；确认前再次读原 DataView。任一重复整批拒绝，不静默过滤；readContext不带行/编码列表，不增加查询。与台账 1313 行裁决一致，不重提已否决的 normalize hook。
- **可选 AI 字段不损害保存合同**：brief 要求 validate 只校验实际提供的 val/txt/extension，未提供的非 AI 必填字段保留缺失供原表单补录；`DictionarySchema.validateEntry` 对 `changedFields` 省略时会校验完整新行（`dictionary-schema.ts:46-68`），且 `DictionaryWorkspace.changedFields` 对 pendingCreate 返回 `undefined`（`dictionary-workspace.ts:471`），所以 `saveData()` 对新增行仍走完整校验。当前手工新增是独立 `DictionaryWorkspace.addEntry()` (`:126-136`)，继续初始化 val/txt 空字符串及 `ordIdx:0`；brief复用的 `appendEntries` 是 AI 暂存入口，不需要把手工新增绕到另一路或放宽普通保存。
- **保存/取消仍走原责任方**：`appendEntries`当前经 `entries.addRow`逐条暂存，不执行 save；`saveData()`只保存 entries view，且保留已有 editing patches。brief明确不增加AI-specific save/row copy/HTTP，也保留保存拒绝与原草稿。
- **SPA生命周期一致**：brief要求root dirty getter直读持久 workspace host；AI renderer临时卸载只detach，同目标重挂复用session；整个字典工作区 clean close走releaseClean并销毁编辑runtime/DataSet，重开正式读取；pending/unknown/非终态/业务草稿拦截关闭或切目标；不改SystemPageIdentityPool/路由、不创建global cache。这与G3报告修订及台账1303行裁决一致，目录catalog PAGE_RUNTIME与嵌套编辑runtime保持分离。

## 实施时要锁住的具体检查（非当前brief阻断）

`entryAppendError()`目前只是`prepareEntryAppend()`的无副作用探针；它与`appendEntries()`必须共用同一个字段/权限/Schema/重复预检，避免按钮状态与执行分叉。新增字段白名单须来自当前正式 DataView 派生结果；领域方法不能因为历史六字段数组漏掉allowAIAdd列，也不能给缺失/不写字段要求额外权限。测试须保留独立`addEntry()`手工新增、未填 val/txt 的 AI staged 行在saveData时被拒、手工补完整后沿原DataView保存、已有行草稿与目标切换隔离。

**Disposition：可实施，无brief级核心冲突。** 本结论仅是 brief/源码合同复核，不代表G3冻结、G4实现或整组门禁已验收。
