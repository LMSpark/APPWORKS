# 跨实例未知保存合同核查（2026-10-24）

基线 `c93668b44ad60df2bb6deebf952c64175aaac72d`。本记录是现有源码、静态服务台账与已保存服务证据的核查，不是一次新的真实服务调用。

| 保存路径 | 已确认事实 | 仍未确认 |
| --- | --- | --- |
| `DataSpaceRuntimeApi` → `BatchTableOperateRequestByCRUD` | 当前前端按正式查询上下文提交 CRUD；原上下文仍在时可按捕获主键与修改字段核验。已有正常保存及独立回读证据。 | 持久操作 ID、服务端幂等规则、按操作查状态端点；刷新或重新登录后安全重挂原捕获的公共入口。 |
| `ScenarioDefinitionResource` → `ProjectWorkspace` → `File/UploadFile` | 当前文件适配比较原提交正文、基线和正式远端回读；UI 保存与独立重开已有证据。 | 上传与操作状态之间的持久关联；刷新后恢复原捕获的公共入口。普通文件版本或内容相等不等于具有操作回执。 |

依据为 `packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-request.ts`、`packages/spark-lowcode-api/src/design/lowcode-design-file-upload.ts`、`packages/spark-project-model/src/scenario/scenario-definition-resource.ts` 及 `backend-api-contracts/endpoints.ts` / `lowcode-endpoint-ledger.json`。后者是本地 Java controller 的静态派生产物，不证明当前部署能力。未修改、启动或部署 Java。

已有真实结果仅覆盖 [模型普通保存与恢复](a-unloaded-save-acceptance.md) 和 [文件配置保存与恢复](a8-view-file-acceptance.md)。它们不能证明未知结果跨刷新或重登录恢复，也不能保证未知写入安全重放。

通用 `DataSetTransactionRequest` 的 requestId / operationId / transactionId 不属于当前正式查询保存路径的已确认服务合同；`File/inspect/*` 也没有证据是上述写入的状态查询入口。两者均不作为能力替代。

当前仓内资料没有给出实际部署的 OpenAPI/Swagger 文档 URL，未猜测路由进行探测。后续先取得该部署现有合同，再确定数据层承接及隔离故障验证。现阶段保持此用例未完成，不保存第二份业务草稿、不制造线上 unknown、不自动重发写入；继续推进不依赖该能力的计划项。
