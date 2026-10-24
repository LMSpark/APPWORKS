# G3 R1–R4 独立复审

范围仅限 `g3-r1-r4-freeze.md` 列出的十个文件、冻结源码、组件/host相关测试，以及前轮R1–R4。没有运行测试、生成、服务或UI。

## 冻结核对

十个源码/测试/环境文件当前 SHA-256 均与 `g3-r1-r4-freeze.md` 完全一致；本复审基于该冻结版本。主控归档的30/30、typecheck、scoped ESLint、`verify:ai-codegen` 成功记录与复审无冲突；未重新运行。

## 逐项结论

- **R1 — ADDRESSED。** `SparkAiDataEntry.vue:198-232` 在排程时检查owner `error`、turn/candidate `loadingError` 和本地错误；自动refresh失败时保留owner错误，缺少owner错误则显示本地错误。`run()` 显式操作前清除本地暂停，手动刷新完成后可恢复排程。测试 `spark-ai-data-entry.test.ts:290-350` 令 `shouldAutoRefresh` 在错误后仍为true，检查失败后暂停、detach/reattach仍暂停，以及显式刷新恢复，已覆盖之前伪造hint变false的问题。session hint合同未改，组件没有另存远端轮次状态。
- **R2 — ADDRESSED。** `connect():236-276` 要求 `parseDataViewKey` 有非空scope；`watch(dataViewKey)` 在变化时清旧附件、清键并尝试新目标（314-326）。`run` 和 `pollOnce` 捕获原attachment/session，并仅在它们仍为当前对象时写本地状态或继续排程（210-232、277-298）。测试 `spark-ai-data-entry.test.ts:353-410` 覆盖完整键拒绝本地二段键、挂载后切换目标、旧请求迟到拒绝不污染新UI。没有发现旧目标继续显示/操作的可达路径；host既有pending/unknown拒绝切目标测试仍证明原session保留。
- **R3 — PARTIALLY ADDRESSED，仍有一项真实交互缺口。** `RendererTable` 已接标准 `toolbarConfig`，按钮均绑定具体视图；turn状态/错误字段绑定只读turn `RendererForm`（`SparkAiDataEntry.vue:43-74,297-314`）。候选行出现时提示只读，busy/workspace-blocked时也锁定；候选只读和blocked测试分别在 `spark-ai-data-entry.test.ts:208-228,412-431`。但业务输入的readonly表达式是 `isDisabled.value || ...`（组件第32行），而 `isDisabled` 是 `useSparkPageComponent` 返回的顶层 computed ref（`useSparkComponent.ts:67,411-462`）；在 Vue 模板中顶层ref自动解包，此处再访问 `.value` 会对布尔结果取 `.value`，不能可靠反映 `disabled=true`。后续条件可能遮住缺口，因此现有candidate/blocksWorkspace用例均不能验证组件disabled prop本身。应修为模板顶层ref表达式并补一个 `disabled=true`、无候选且未blocked时输入只读的断言。此为R3合同的剩余P2；action按钮脚本内的 `isDisabled.value` 用法正确，不受此项影响。
- **R4 — ADDRESSED。** `connect()` 先确认返回session目标一致且attachment未abort，再解析三个派生视图完整键；失败时只detach已接受的同一attachment，若本地已安装则经 `cleanupLocal` 清timer/订阅并detach（`SparkAiDataEntry.vue:241-274`）。错配目标未被接受，仍不detach他方lease。测试 `spark-ai-data-entry.test.ts:434-470` 覆盖派生输入视图不属于本runtime时detach并可重试。

**Host clean release预检 — 保持正确。** `ai-data-entry-host.ts:136-149` 在detach之前对Input与Candidates都调用 `assertCanRemoveTable`，之后才detach、dispose和清owner；所以任一删除预检失败都不会先撤销活动附件。host测试 `ai-data-entry-host.test.ts:334+` 证明候选表被关系引用时附件及两张临时表保留。未见新生命周期冲突。

## 总结

R1、R2、R4已满足；host release预检已保留。R3尚有组件 `disabled` 无法可靠锁住业务提示的模板表达式缺口，修正并补对应断言后可完成本轮R1–R4复审。除此之外未发现新增真实阻断。
