# B1 AI 候选续接研读

## 基线与范围

- 分支：`10-17`；HEAD：`6cab104cea31d226688b4f7866297e9572ab40ec`；相对 `origin/10-17` ahead 11。
- 开工时工作区干净；`pnpm run typecheck` 基线通过。
- 当前状态与历史证据只认 `data-space-retirement-ledger.md` 和 `evidence/metadata-integration-20261024/b1-candidate-acceptance.md`；本轮不沿旧 E62 方案继续。
- 用户确认续接完整 B1，并明确不重发停止命令、不清理轮次、不删除测试资源、不改 Java、不绕过关闭保护或 SPARK data。

## 源码职责与调用链

- `src/lowcode/resources/dictionary/lowcode-dictionary.ts` 是组合根：在当前正式 DataSet 及请求 scope 内创建 `AiTurnResource` 和 `DictionaryAiCandidates`，固定使用已核验 Agent ID。
- `packages/spark-lowcode-api/src/realtime/ai-turn-resource.ts` 通过 AI Agent、请求、轮次、取消等 DataView 暴露正式资源；取消提交回执只表示请求受理，取消核验另读正式轮次。
- `packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-ai-candidates.ts` 以请求 DataView 保存创建/取消命令，以轮次 DataView读状态，终态完成后生成只读候选视图；确认时调用原 `DictionaryWorkspace.appendEntries`，没有第二草稿或候选保存通道。
- `src/views/features/data-platform/structured-config/data-dictionary/model/use-dictionary-workspace.ts` 管理运行实例与生命周期：对 `QUEUED/RUNNING/CANCELLING` 通过串行定时查询更新；正式查询失败暂停自动更新；pending 由目录宿主用于阻止关闭。
- `src/views/features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue` 持有工作区 Dialog，`close-disabled` 由 pending 控制；数据页是独立的条目维护工作区。
- `DictionaryWorkspace` 将条目删除暂存后才提交，并在定义和条目正式读回后确认结果；删除本身目前只覆盖这两个视图。

## 原实现事实、目标要求、缺陷及待核实项

### 停止与重开

- 原实现事实：现有测试字典本批保存回执为 HTTP/Code 200，精确读回总数 5；原 3 条未变，本批新增 2 条。停止回执后正式读取仍是 `CANCELLING`，关闭保护有效。
- 目标要求：只使用正式状态读取；轮次终态后再在同一 SPA 关闭、切换到任一可只读打开的已有字典、关闭并重开原测试字典，核对持久结果。
- 缺陷：暂无已证实的关闭保护缺陷；不能将 ACK 或 CANCELLING 解释为终态。
- 待核实：当前服务返回的最新轮次状态及终态后的关闭/切换/重开结果。若始终非终态，保持阻塞，不绕过保护。

### 候选空态与提示

- 原实现事实：`DataView.clearAll()` 经 `resetStateInternal()` 清空 rows 和请求状态，但没有重置 `total`；RendererTable 分页和 DataViewMetaBar 总数当前只在 `total > 0` 时显示。候选表关闭了 DataViewMetaBar，确认/放弃后旧总数可能残留。
- 目标要求：总数由 DataView 唯一持有并正确归零；共享 DataViewMetaBar 对启用的空视图显示“总数 0”；候选页面使用该标准 meta bar。来源失效与已消费是可同时成立的事实，必须同时呈现。
- 缺陷：DataView 清空后的 total 与 rows 脱节；`confirmationError` 的单一优先级会遮蔽其中一项事实。
- 待核实：回归应覆盖 confirm、discard、来源变化、标准 meta bar 隐藏及空视图显示的组合，且不得改变 `canConfirm`、字段权限或保存通道。

### 字典删除引用

- 原实现事实：`DictionaryWorkspace.canRemoveDefinition` 核对当前 definition、已加载 entries 数量及这些行的删除权限；执行只删除定义和条目。
- 原实现事实：`LowcodeDataSpaceModelSourceReader` 将字典 `rowid` 作为正式模型 `DbId`；`LowcodeApiProvider.loadHeaderTypes` 按正式字典名称定位另一消费者。
- 原实现事实：数据空间设计页及 `DataSpaceDesignApi.readModels/readModel/readModelBatch` 均使用目标 `dataSpaceId`；元数据视图配置也以 `dataSpaceId` 过滤 `Base_DataModel`。这里的零命中不能证明全局没有引用。
- 目标要求：数据库、配置和代码消费者都计入删除完整性；确认引用则阻止并展示可证实项；缺少完整的全局检查能力、不可读或结果不完整时失败关闭。整个查询使用 SPARK data/DataView。
- 待核实：现有正式 SPARK data 运行合同能否提供可授权、完整、跨空间的 `DbId` 引用查询。不得用当前单空间视图、直接 HTTP、Java 假设或全量业务扫描宣称全局证明；真实服务不执行删除试探。

## 用户确认的行为决策

- 对既有轮次按现有机制持续只读查询至正式终态，非终态时并行做独立工作。
- 终态后使用一个已存在且可只读打开的其他字典做隔离切换验收。
- 本轮同时修复两项 UI minor。
- 来源失效与已消费状态同时显示。
- 启用 DataViewMetaBar 的空视图统一显示总数 0。
- 有可证实引用时阻止并列出引用；无法证明全局范围时失败关闭。
- 代码、配置和数据库下游消费者都属于引用范围；统一使用 SPARK data。
