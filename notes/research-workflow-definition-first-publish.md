# 工作流 Definition 首次发布研读

## 当前源码事实

- 页面入口为 `src/views/app/WorkflowDesigns.vue`。设计稿、Definition 与目录由 `createAgentWorkflowFileDataViewOwner` 提供，查询和保存绑定于本次 `PageRuntime` 的 DataView。
- `publish()` 先拒绝 Definition 视图上的未保存/未知修改，再保存设计视图，读取已有 `definition.json`，从已保存 `design.json` 派生 Definition，最后更新原 Definition DataView 行。`loadDefinitionRow()` 对缺失文件返回拒绝，因此发布只覆盖已有 Definition。
- 文件写入在 `src/lowcode/resources/repository/agent-workflow/agent-workflow-file-resource.ts` 中实现：只允许修改查询到的 `content`，上传前核原文基线，成功后精确字节回读；未知结果挂在原查询上下文，重提只核验，不重传。
- 场景装配在 `src/lowcode/data-space/lowcode-data-space-runtime.ts` 注入正式命令绑定。`pagedata.json` 已声明 `AgentWorkflowCreation`，通过 `bindDataSetCommandSubmit` 承接首稿创建。
- `bindDataSetCommandSubmit` 支持单行新增命令、不可变原命令身份、未知状态核验和禁止自动重放。首稿命令 `creation.ts` 是可复用的领域实现范例。
- 文件 SDK `uploadTextVersion` 使用 `isReplace=false`，并检查上传 ACK 及实际目标字节；创建命令已有独立测试。页面测试覆盖已有 Definition 更新与缺失拒绝，但没有首次发布命令。
- FileController 合同记录有单文件读取、列表、上传、`RemoveFile`；工作流整目录删除能力未证实，不纳入本次首发修改。带点 workflowId 的正式消费能力也未证实，避免本次旁路该身份守卫。

## 本批局部假设

假设：在现有 Definition DataView 更新链之外增加独立 `AgentWorkflowPublication` command DataView，且仍走正式 `commandBindings → DataSet.saveChanges → uploadTextVersion → 原字节核验`，可以实现“Definition 缺失时仅创建一次、已有文件不覆盖、未知结果不重传”，而不改变已冻结的公共 DataSet/组件合同。

可证伪检查：先在领域命令测试中覆盖空目标、既有 Definition 冲突、上传结果未知、原目标精确核验、变更输入拒绝和 scope/视图失效。若命令接口不能保留原输入并核验同一 attempt，停止该方案，回到命令消费者/领域合同重新裁决。

## 影响面与约束

- 预计改动：`config/pages/shared/agent-workflow-files/pagedata.json`、`src/lowcode/resources/repository/agent-workflow/` 下新增发布 command binding、`src/lowcode/data-space/lowcode-data-space-runtime.ts` 接线、`src/views/app/WorkflowDesigns.vue`、工作流命令夹具及资源/页面测试。
- 页面不可直接调用 HTTP/文件 owner；首发上传仅在文件资源命令适配器内调用正式 SDK。
- 已有 Definition 的发布更新、Definition 草稿、设计草稿、命令未知状态、导航离开保护必须保持。
- 不改 Java、正式服务协议、冻结 S1/S2/S3、权限规则或其他业务包；不执行线上写入，不据本地 mock 宣称服务验收。
- 整工作流删除及含点 ID 路径需另有正式服务/身份证据后再实施。本批不得恢复为直接路径拼接或逐文件静默循环。

## 验证依据

- 首先运行新增命令测试，确保 RED 针对缺少首发命令而非装配/mock 缺陷。
- 首发命令和页面集成测试通过后，运行工作流资源/命令/UI 相关测试、根 `typecheck`、改动文件 ESLint、`verify:rules`、`build`。
- 仅在公开声明变化时运行正式 ClassModel 生成；不手改生成产物。
- 真实服务首发、回读、关闭重开及清理仍是独立门禁；服务与清理能力不明则保持阻塞。