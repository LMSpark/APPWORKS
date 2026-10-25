# G4 dictionary integration independent review

## 结论

- **Spec：核心实现与 G4 领域合同一致。** 正式 `DataTable.columns` 经 `deriveAiDataEntryFields` 与新行写权限共同筛选；字典适配器仍写原 `_Base_DictData@default` DataView，并保留普通整表校验、暂存和保存路径。没有发现额外查询、业务行副本、第二保存通道或设计页 AI host。
- **Quality：有一项验收阻断（测试证据缺口，非已证实的运行时代码缺陷）。** 目录/root 集成测试没有实际触发 AI 输入或 AI 命令 unknown，再经真实 `dataWorkspace.isDirty`/SystemPageDirtySource 验证 close、目标切换/route guard 被拦截。G4 brief 明确要求目录测试证明 dirty AI 独立于 surface 挂载；当前同类能力分散在 AI/session、组件测试和直接挂 `DictionaryData` 的成功流程里，不能证明父目录 owner 链。
- **已知边界：** 强制认证/进程 teardown 可能绕过正常 dirty guard，`onBeforeUnmount` 释放失败后执行 `disposeRuntime()`；台账和 brief 将其界定为不可恢复边界。正常 clean close 先 `releaseClean()` 再销毁旧 runtime/DataSet，重开重新加载，符合约定。

## 冻结身份

实现冻结报告列出的10个源码/测试 hash 均与当前工作区一致。冻结报告漏列的 `src/lowcode/resources/ai-data-entry/ai-data-entry-host.ts` 当前 SHA256：`7FAFB0B2C7F025A172D9630EA61A68366CE1AB5B8C11F17EF63B5451E743008F`。复核期间未改源码、测试、台账或生成物。

## 发现

### P1 — 缺少真实目录 owner 对 AI dirty/unknown 的集成保护断言

`use-dictionary-workspace.ts:42-46` 的 workspace `pending` 与 `useSystemPageDirtySource` 直接读 `aiHost.isDirty`；host 在 `:59` 订阅 session，并在状态变化时 `changed()`；session 的 `pending` 包含 `blocksWorkspace`、未核验命令、输入/候选和未消费 capture。因此实现路径能把这些状态传到父 owner，而不是只依赖 child 最后一次 `onPending` emit。`data-dictionary-list-page.vue:52,100-106,120-125` 的关闭/切换也直接读取子 owner，并在释放失败时保留旧目标。代码链本身未见漏传。

但测试并未把这条链走通：`dictionary-workflow.test.ts:128-157` 直接打开 `DictionaryData`，只覆盖成功候选暂存/保存和未配置映射；`:209-279` 是组件 + 人工构造 `AiDataEntryHost`/adapter 的独立 workflow。`dictionary-catalog.test.ts:476-587` 确实从真实目录装配 owner，但 dirty/unknown 用例覆盖的是普通业务草稿或 DataView 保存未知回执；该文件没有 AI component、host 或 turn command 操作。故现有测试不能证明父目录的关闭按钮、切目标和系统页 dirty guard 在 AI input/unknown 状态下保留完整 session/capture，亦不能证明卸载/重挂组件时父 owner 仍可读取该状态。

最小补证：在 `dictionary-catalog.test.ts` 的目录真实挂载流程中，用正式组件和 app host 分别制造未提交业务提示、AI create unknown（可保留原 capture，不重发），断言父 `SystemPageDirtySource`/目录 close 与切换均被阻止、旧 DataSet/session 未释放；再卸载 AI 面板、确认父 owner 仍 dirty，重挂同目标恢复原 session/capture。无需复刻所有 host/session 细节测试。

## 其余核查

- `dictionary-workspace.ts:365-430` 通过通用字段派生筛正式可写输出字段，批次校验先完成后暂存；读取当前已加载快照与编辑 overlay 检查 code，不额外全量拉取；实际写字段保持候选提供内容与领域 `typeid/crttime/ordIdx`，缺省字段不置 null。`dictionary-workspace.test.ts` 有配置 `ordIdx/createuser`、未提供 `val/txt` 后手补、overlay/批次重复、不可读 code、禁止额外字段及原 DataView 保存相关用例。未发现新领域合同冲突。
- `dictionary-data-page.vue:8,19,55-59` 将 AI 控制限定在正式数据页的标准组件中， dirty 状态包括 host；目录 `data-dictionary-list-page.vue:31,51-52` 将数据页 owner 放在设计 Dialog 外，目录 PAGE_RUNTIME 未被替换。clean close 通过 `releaseClean` 清掉 AI 会话后销毁 editing runtime/DataSet；watch reopen 重新 `loadEditor`。
- 关闭 AI 面板仅变更 `aiVisible`；标准组件 detach 不销毁 host/session。配置失败仅显示 `aiError`，普通数据维护 owner 可继续使用。未见真实代码阻断。
