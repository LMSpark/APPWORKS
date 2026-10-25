状态：blocked

阻塞原因：本地实现和自动化验证完成，但本次无法取得已有线上 AI 轮次的新正式状态，关闭/切换/重开验收因此未执行；最近正式证据仍为 CANCELLING。另，`pnpm run verify:rules` 在 `verify:lowcode-contracts` 因 `appworks-consumer-ledger.json` stale 失败，尚未查明基线来源；不得擅自生成或覆盖该台账。唯一后续断点见 `notes/data-space-retirement-ledger.md`。

## 任务目标

续接 B1 AI 候选闭环：完成既有轮次终态及保存后重开验收，修复共享空态/状态提示，并对字典删除执行完整引用检查；引用范围不完整时失败关闭。

## 阶段与业务语义

1. 只读查询已存在的 AI 轮次，正式终态后关闭原工作区、只读切换至另一个已有字典、关闭并重开目标测试字典；精确核对总数 5、原 3 条和新增 2 条。非终态不关闭、不清理、不重发 cancel，明确保留阻塞。
2. 候选视图确认/放弃/来源变化后，rows 与 total 保持同一 DataView 状态；启用的标准 DataViewMetaBar 显示空视图总数 0；来源变化与已消费状态同时可见，不改变确认、取消和保存责任方。
3. 删除命令追踪数据库、配置和代码消费者。完整查询发现引用则展示并阻止；权限不足、分页不完整、身份失效或缺少全局查询合同均失败关闭。无线上删除试探。
4. 最终按现有保存回执、重开消费、目标回读、自动化测试和唯一删除台账核销 B1；不提交、不推送。

## 影响范围

- `packages/spark-data/src/data-view.ts`：共享清空/重置将 total 归零。
- `packages/spark-data/src/tests/data-view/data-view-events.test.ts`：增加 clear/reset 对 total 的断言，保留原事件行为。
- `packages/spark-component/src/components/containers/data-views/DataViewMetaBar.vue`：启用时空视图显示总数 0。
- `packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-ai-candidates.ts`：拆分来源失效与已消费的可见状态，不放宽确认保护。
- `packages/spark-lowcode-api/src/platform/resources/dictionary/tests/dictionary-ai-candidates.test.ts`：覆盖两种状态并存及确认资格。
- `src/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-data-page.vue`：启用候选表标准 meta bar，并同时呈现两项状态。
- `tests/runtime/page/dictionary/dictionary-catalog.test.ts`：覆盖页面交互/呈现；只有现有挂载合同适合时才扩展。
- 删除检查研读路径：`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`、`config/pages/data-platform/data-space-design/pagedata.json`、`src/lowcode/data-space/model-source/lowcode-data-space-model-source-reader.ts`、`src/lowcode/resources/external-api/lowcode-api-provider.ts`。
- 删除责任方如需实现：`packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.ts`、`packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.test.ts`、`src/views/features/data-platform/structured-config/data-dictionary/ui/dictionary-setting.vue`，必要时 `src/lowcode/resources/dictionary/lowcode-dictionary.ts`。仅沿现有正式 SPARK data 能力实现；无全局合同则只做失败关闭和明确诊断。
- `tests/runtime/page/dictionary/dictionary-workflow.test.ts`：更新既有删除入口/提交回归，断言显示全局引用覆盖缺口、持续禁用删除且不触发正式删除请求。
- `notes/research-b1-ai-candidate-continuation.md`：确认后的阶段 1 研读锚点。
- `notes/data-space-retirement-ledger.md`：本轮实施期间和结束前持续更新唯一断点/证据。
- `notes/ai-code-metrics.md`：阶段 7 度量记录。

## 技术方案

1. 开工基线已复核：分支 `10-17`、HEAD `6cab104ce`、工作区干净、相对远端 ahead 11；`pnpm run typecheck` 基线通过。执行期间若发现冲突或范围外更改，暂停并回报。
2. 先完成阶段 1 研读文件并按本计划的精确路径逐个重读当前源文件，再做成组修改。现有页面回归中存在“删除入口重新启用”及“正式删除成功”预期，需同步改为验证失败关闭，不能保留与本目标冲突的成功删除路径。
3. 沿 `DataView.resetStateInternal` 修复 total 真源；共享 `DataViewMetaBar` 在启用时对空视图显示 0；候选页启用标准能力，不增加业务本地计数。
4. 在候选领域以独立语义暴露 sourceInvalidated/consumed 状态；页面同时显示两者，保持原 `canConfirm`、候选权限预检、原 entries 暂存和 DataSet 保存。
5. 删除前沿正式 DataView 核验 `Base_DataModel.DbId` 与所有可证实消费者；查询必须证明全局覆盖和完整性。存在引用时拒绝并列出已核实引用；不能证明时拒绝并报告缺口。不得使用直接 HTTP、修改 Java、未经确认的批量扫描或自动级联修复。
6. 真实服务验收只读。等待轮次达到正式终态后做关闭/切换/重开；没有终态则继续独立实现，最终仍将线上部分标为未验收。
7. 定向测试、类型检查、lint、完整规则和 build 通过后更新唯一台账；不自动 commit/push。

## 兼容性

- DataView 清空/重置后的 total 修复影响所有调用方，保留原 rows、selection、request-state 与事件语义。
- 所有启用 DataViewMetaBar 的空视图新增“总数 0”显示，属于用户已确认的标准行为调整。
- 候选页面状态提示只增加可见事实，不改变权限或状态机。
- 删除路径有意失败关闭；不能通过现有单空间零命中推断旧行为安全。线上删除数据保持不变。
- 不引入后端合同，不修改 Java，不新增直接 HTTP/第二保存器。

## 验证计划

- 开工基线：`pnpm run typecheck`（已通过）。
- 定向测试：`pnpm --filter @spark-appworks/spark-data run test:run`；`pnpm --filter @spark-appworks/spark-lowcode-api run test:run`；相关 `tests/runtime/page/dictionary/dictionary-catalog.test.ts`、`tests/runtime/page/dictionary/dictionary-workflow.test.ts`。
- 整体验证：`pnpm run typecheck` → `pnpm run lint` → `pnpm run verify:rules` → `pnpm run build`。
- 真实状态验收：正式轮次终态读取、同 SPA 关闭/只读切换/重开、精确读回原 3 条和新增 2 条；非终态或读取失败不冒报成功。
- 删除测试：有引用、未读全、字段不可读、查询失败、scope失效、无完整全局合同都必须阻止；线上不执行删除。

## 风险项

- AI 服务端可能长期保持 CANCELLING；此时保存后的关闭/重开只能保留为阻塞，不绕过保护。
- 当前元数据合同以单个 dataSpaceId 查询模型，可能不支持全局 `DbId` 检查；若核实缺失，删除继续失败关闭并将能力缺口写入唯一台账。
- 数据库与其他资源不承诺跨来源事务；不得将局部回执称为全链路原子成功。

## 阶段 7 备注

- 已按用户选择将“清空 DataView 必须同步清零 total，并在仅残留 total 时发出 cleared”沉淀到 `knowledge/page-design.md`。
- “缺少全局引用覆盖时，字典删除必须失败关闭”本次未获选写入知识库；其本轮证据与决定保留在唯一删除台账。
