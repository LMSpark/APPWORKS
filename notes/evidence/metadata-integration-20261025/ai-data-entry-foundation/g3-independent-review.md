# G3 独立 Spec / Quality 复核

范围：冻结首版 G3 五文件；以 `g3-root-review.md` 和唯一台账“当前成组实施设计：通用AI批量新增”G3 合同为基准。只读检查源码、测试、props/注册/导出/环境声明；未运行门禁、生成、服务或 UI。

## 快照核验

当前五文件 SHA-256 与主控冻结记录逐一一致：

- `packages/spark-component/src/ai/components/SparkAiDataEntry/SparkAiDataEntry.vue` — `EC34B759E378B454C67340C37D68ECD0965BF0D6BF1E07D139EB169C9D87948F`
- `packages/spark-component/src/ai/data-entry-host-capability.ts` — `EF687A5ABE43DC89A2FED93794A4AE15F6D8073C50453DEFE82AD6C5566E2522`
- `src/lowcode/resources/ai-data-entry/ai-data-entry-host.ts` — `A4F38C33DB6E7CE2CCB63CF4D513B60DCBABAE77AA631A75EFD6F1B45EB13CD7`
- `packages/spark-component/src/tests/ai/spark-ai-data-entry.test.ts` — `2BACFB55A37593D067D2A4BF1776F9FF39AEBB9601005EA6A2F7F880A059776C`
- `tests/runtime/page/ai-data-entry/ai-data-entry-host.test.ts` — `D9B90E7FFD2A8F01A1778DE7B429692A460C41912FF1790540B2EC9AB7EE741D`

## Spec / Quality 结论

**Needs revision；主控 R1–R4 均由冻结源码独立确认，未发现额外核心阻断。** 25/25 用例通过不能覆盖以下运行时合同缺口：

1. **R1 自动查询失败仍无限轮询。** 组件 `SparkAiDataEntry.vue:136-153` 在 refresh reject 后总会 `scheduleRefresh()`；真实 `AiDataEntrySession.shouldAutoRefresh`（`packages/spark-lowcode-api/src/realtime/data-entry/ai-data-entry-session.ts:294-299`）仅依据轮次状态/unknown 命令，不因 `error` 暂停。组件测试 fixture `spark-ai-data-entry.test.ts:76-92` 却令 `shouldAutoRefresh` 随 error 变 false 并在失败时关闭 autoRefresh，因此当前 GREEN 未验证真实合同。停轮询应由组件/UI owner 捕获失败实现；手动查询可恢复，不能改 session 的状态 hint。
2. **R2 绑定变化仍操作旧目标。** 组件仅 `onMounted(connect)`（`SparkAiDataEntry.vue:156-186,213`），无 props/runtime 变化监听及异步 generation guard。`PageRuntime.resolveView` 明确允许缺场景的本地两段键由 `mainScenarioId` 补全（`packages/spark-project-model/src/page/runtime-page.ts:167-180`），而该组件合同要求完整三段键。故换 `dataViewKey` 后会继续显示并把操作作用于旧 session；只测错误绑定的独立新挂载不足以覆盖此情况。
3. **R3 标准视图/交互合同未完成。** 候选表没有 `RendererTable.toolbar.children`，操作按钮由普通 `div` 渲染且未带 `dataViewKey`（`SparkAiDataEntry.vue:37-50,195-210`）；状态只显示为普通 `span`（第11行），不是绑定正式 turn DataView 的只读 Form/字段；业务提示 `FieldTextarea` 没有绑定 `disabled`/`blocksWorkspace`（第26-34行）。这与台账所定标准 toolbar、turn 状态绑定以及忙碌/禁用时锁定输入不符。
4. **R4 附着后的局部初始化失败泄漏 host lease。** `connect()` 在接受匹配 attachment 后先保存 `attachment/session`，再解析 Input/Candidates key 和订阅（`SparkAiDataEntry.vue:166-182`）。若 key/订阅步骤失败，catch 只设 `localError`（183-185），没有清理本地 observer/timer 并 detach 已接受的附件；宿主会继续持有 lease，之后重连可能被拒。清理只能作用于已接受的同一 attachment，不能 detach 错配目标的别家 lease，也不能 dispose host session/capture。

**质量门禁证据（主控报告项复核）。** `src/env.d.ts:3-6` 新增 `ImportMetaEnv` interface；host `ai-data-entry-host.ts:39` 使用 `Object.create(null) as Record<string,string>`。这两项在 `g3-root-review.md` 已列为 `verify:ai-codegen` 约束失败，应按仓内许可形式修复后重跑对应门禁；本复核未运行门禁。主控报告未留 typecheck 完成证据，也不把它视作通过。

## 公开面检查

新属性类型仅声明 `dataViewKey/title/disabled`（`SparkAiDataEntry.props.ts`）；AI index、包 `src/index.ts` 与 renderer register 均已导出/注册该组件及窄 host capability，未见因此新增 Agent/system prompt 或业务数据旁路。`.env.example` 中映射示例为 `{}`；host 以可信 request scope 的 tenant-id 精确查映射并将 agentId 传给 session。以上不抵消 R1–R4。

未发现主控报告之外的新增阻断。建议作者按 R1–R4 修复并用真实 session/error 和 prop-change/delayed-result 反例重新冻结；冻结后再按新 hash复核。
