# G2a Agent 配置资源只读复核

日期：2026-10-25  
范围：`ai-agent-config-resource.ts`、同名测试、`src/index.ts`，并按需核对既有 `DataView`/命令绑定实现。未调用服务/UI、未修改产品/测试、未重跑门禁。

## 结论

有 1 项核心生命周期/身份隔离缺口需在实施闭环前明确处理：`configuration.queryContext.agentId` 在 GET 途中改变时，资源自身不会判定该响应过期；DataView 的请求序号只在后续查询真正启动时使旧响应失效，而 `requestRefresh()` 在视图 Loading 时会延后执行，允许旧目标响应先被接纳。建议增加一个 pending GET 期间切换目标的回归用例，并由资源或 DataView 所有者保证旧目标结果不会作为新目标配置被消费。

未发现 create unknown 回执重放/猜 ID、绕过 DataView、DTO字段校验方面的其他阻断问题。

## 发现（按重要性）

### P1 — GET 在途时目标改变，当前资源没有独立的后置目标核验

依据：`ai-agent-config-resource.ts:254-260` 在请求前捕获 `agentId`，GET 后直接 `readAgentConfig(raw, agentId)` 并返回；`request()` 只前后核 `guard` 与 DataSet 生命周期（约 `:218-231`），不比较当前 `view.queryContext.agentId`。因此它能拒绝服务器回传的错误 `id`，但不能识别“请求目标虽正确、调用期间用户已切到另一个目标”的响应。

底座确有请求序号隔离：`data-view.ts:1839-1874` 为真实 load 分配 `currentLoadRequestId`，仅当后续 load 已启动并更换序号时忽略旧结果。可是 `DataView.requestRefresh()`（约 `:2052-2075`）在 `Loading` 时将刷新登记为延迟请求；`refreshIdentity()`（约 `:2078-2080`）包含 `queryContext`，用于决定延迟刷新是否仍适用，但上下文直接变化本身不会取消正在执行的 `readConfiguration`。所以常规的“改变上下文 + requestRefresh”路径可能先把旧目标返回行送入当前 DataView，再处理登记的下一次刷新；现有资源测试只覆盖响应 `id` 与捕获目标不一致，没有覆盖在途期间切换 `queryContext.agentId`。

建议的最小验收：用延迟 GET 请求 `AGENT-1`，改变 `queryContext.agentId` 为 `AGENT-2` 并走实际支持的 `requestRefresh()` 路径；释放 `AGENT-1` 回执后，断言旧回执不成为当前目标可消费行，随后只有 `AGENT-2` 结果被接纳。若由通用 DataView 负责隔离，应以该集成用例证明，不必在此资源重复造取消框架。该只读视图本身不保存业务行；风险是错配配置短暂进入消费视图，不是越权写入。

## 已确认正确的合同

- 创建经 `requests` DataView 的 command executor 与所选 DataSet `saveChanges`；只读配置经 `configuration.refresh()` 绑定的 DataView query executor。资源没有页面侧第二套数据状态或直接绕过 DataView 的公开提交入口（`ai-agent-config-resource.ts:184-213`）。
- 创建命令 `operationId` 是本地命令主键；payload 只允许约定 DTO 字段，不含 `operationId` 或伪造 `agentId`。正式创建回执只有非空 string 才成为 `agentId`（约 `:129-155`, `:236-252`）。
- 网络/HTTP 5xx、Ajax 5xx、超时、作用域在派发后失效、畸形成功回执被分类为 unknown。通用 command submit 将原 capture 存在 `WeakMap`，再次 `saveChanges` 只调用 verify，不重发 submit；本资源无可信 ID 时 verify 明确拒绝，因此 unknown 不被重 POST 或猜测 ID。明确业务拒绝保持可编辑（`data-set-command-view.ts` 的 `pending`/verify 分支；资源测试约 `:200-235`, `:265-281`）。
- DTO 创建字段有 allowlist、必填非空字符串、0/1 binary、nullable string、`functionIds` string、1–100 安全整数 `maxToolRounds` 校验；拒绝额外字段。GET 回读要求对象、非空正式 ID 严格相等、核心字段有效，并只投影声明字段；可选 `null` 保留，不把任意服务字段/敏感信息带进 DataView（`ai-agent-config-resource.ts:62-126`, `:129-155`）。
- API 入口导出 `AiAgentConfigResource`（`src/index.ts`）；没有发现改动现有权限角色判断的痕迹，授权仍留服务端。

## 覆盖与冻结 hash

现有 G2a 测试覆盖创建成功与 payload、只读字段白名单、DTO无效输入/回读、明确拒绝、unknown 不重放、错误回读 ID、表名冲突、DataSet scope 失效及 selected-view 保存范围；缺少上述“GET pending 时改变 agentId”用例。复核者未运行测试或门禁。

冻结清单初版 hash 中 resource TS 为 `1E447653...`；作者完成文档/类型形态清理后，当前 TS hash 与主控提供的最终冻结值一致。测试与入口仍等于初版冻结 hash：

| 文件 | 当前 SHA-256 | 状态 |
| --- | --- | --- |
| `packages/spark-lowcode-api/src/realtime/agent-config/ai-agent-config-resource.ts` | `D3DFD35DA49EF012C4C7AA7F2438E9BA26FB3AF536697C62581D9A1B79F5F5BB` | 对齐作者最终冻结值；初版冻结已过期 |
| `packages/spark-lowcode-api/src/realtime/agent-config/ai-agent-config-resource.test.ts` | `7D86DA909F131724CE25A5086478DA237E8BBF9AF6FDB18DA719E8E478DEE6D6` | 与初版冻结一致 |
| `packages/spark-lowcode-api/src/index.ts` | `DE52182040C5C4BA01934F31347452E944C75B24D467B97495038148E520B972` | 与初版冻结一致 |
