# G4 独立复审：目录 AI owner 集成缺口

## 结论：ADDRESSED

两项新增测试已覆盖此前报告的唯一缺口，没有发现新阻断。复审仅限这两项测试及其父级真实 owner 接线；未运行测试或改产品/台账。

- `dictionary-catalog.test.ts:596-642` 通过 `openCatalog()` 实际装配目录系统页和 `DictionaryData`；`captureDictionaryAiOwner()` 仅 spy 包装 `LowcodeDictionary.createAiDataEntryHost` 的真实 factory/host (`:160-171`)，通过标准 `SparkAiDataEntry` 输入业务提示。断言提示落在正式 `AiDataEntryInput` DataView、真实 host / data page / system page 均 dirty，`assertPageRuntimesClean()` 与 `closeSystemPageInstance()` 拒绝关闭，Dialog 关闭被拒，D2 打开入口禁用且仍保留 D1 与活动 attachment。这证明父 owner 从 host live state 获得 dirty，不依赖子组件最后一次 pending emit。
- `:644-701` 通过真实组件发起 AI create，在模拟传输断开后检查 `AiTurnRequest` 正式捕获、`hasUnconfirmedSave`、唯一 `idempotencyKey` 和父系统页 dirty/关闭保护。隐藏 AI 面板后 attachment 被 abort，但 host 仍 dirty；重挂得到同一 session、恢复 input edit/capture，turn POST 计数仍为 1。它验证了同 DataSet 的临时附件卸载与宿主 session 生命周期分离，并覆盖 unknown 不重发。
- 这两例分别覆盖未提交业务提示下 close/target switch，以及 unknown 下 route guard/close 与 detach/reattach；结合现有目录生命周期用例，满足原报告要求的最小集成补证。模拟 HTTP 是测试传输边界，session、DataView、factory、Vue 组件、目录宿主与 SystemPageInstance 均走真实实现。

日志 `g4-ai-owner-integration-red.log/.exit` 的内容为目标两例通过（2 passed、41 skipped，exit 0）；文件名中的 `red` 不代表测试失败。未复核或重复其它公共层覆盖。
