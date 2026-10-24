# G3 R3 最终限定复审

范围仅为 R3 `disabled` 输入锁缺口；未运行测试/门禁，未改产品或台账。

## 快照与证据

- `SparkAiDataEntry.vue` 当前 SHA-256：`86BE8260952B08A777512E9F2737EC427C792145CEC7D0ED331F35717BC9456B`，与指定 hash 一致。
- `spark-ai-data-entry.test.ts` 当前 SHA-256：`7816ACECAB7A83C7A7A1B599458270212E1F4BF8E13A0B53A9BF03C092DFE919`，与指定 hash 一致。
- 源码新增 `isPromptReadonly = computed<boolean>(() => isDisabled.value || sessionState.value?.blocksWorkspace === true || sessionState.value?.hasCandidates === true)`（组件148-150行）；模板只使用 `:readonly="isPromptReadonly"`（32行），避开模板内对已解包顶层 ref 的二次 `.value` 访问。
- 测试新增“disabled且无候选/无workspace lock”场景（`spark-ai-data-entry.test.ts:231-244`）：先断言候选为空及未阻塞，再通过 `provideRuntimeAndHost(..., true)` 传入disabled，最后断言textarea具有disabled属性。对应此前 RED 日志显示该断言失败并报告 disabled 属性缺失；修复后归档GREEN日志的exit为0、31/31测试通过，typecheck及scoped lint日志exit均为0。未重跑这些命令。

## 结论

**R3剩余P2 — ADDRESSED。** 实现表达符合 Vue ref 解包语义，新增测试把 disabled 唯一条件隔离出来，验证了实际文本框锁定；没有发现本次修复引入的新问题。此前 R1、R2、R4 及 host release 预检不在本次复审范围，沿用上一份报告结论。
