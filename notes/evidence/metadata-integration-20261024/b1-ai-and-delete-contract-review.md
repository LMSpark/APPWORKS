# B1 AI 服务及删除引用续核（2026-10-24）

本轮只读核定，未改产品、测试或生成物，未执行 AI、工具、业务保存或资源删除。主控复核两份 gpt-6-luna 报告，原报告留在 ignored cache；本文件记录采纳结论与修正。唯一计划状态仍在 data-space-retirement-ledger.md。

基线：AppWorks `95af068ce2ec84f66bc234348fe81c736f801b75`；参考前端 `791c464b8c6b3c7049ea36ab57546c3481e4d889`；Java 只读参考 `f1620968b6902d799ccc0ae16fc57c86205da03d`。源码不等于部署版本证明。

## 真实服务只读结果

已授权测试身份及应用上下文，通过现有 authenticated HTTP owner 做来源明确的只读合同诊断。该诊断不是产品接入，也不新增业务 HTTP 入口；正式实现仍必须通过 SPARK data。脚本限定登录、原应用读取与列出的 GET，不允许 AI POST 或配置变更。敏感字段不出进程、不入证据。

| 已执行读取 | HTTP / 业务结果 | 能证明的范围 |
| --- | --- | --- |
| GET /api/ai-agent/get?id=1 | 200 / 1004，Agent不存在 | 新 Agent 管理链没有该 ID；不说明 SAP 的配置 Agent 1 不存在 |
| GET /api/sap/agent-loop | 200 / 500，method not allowed | GET 被拒；未执行 POST 或生成 |
| GET /api/ai/turns | 200 / 500，method not allowed | GET 被拒；未执行 POST 或生成 |
| GET /api/ai/chat | 200 / 500，No static resource | 本次 GET 未找到该资源；不冒称已测 POST |
| GET /api/ai-agent/page?index=1&size=20 | 200 / 200，Count 9 | 当前正式可读配置 9 项 |
| GET /api/ai/v1/agents | 200 / 200，9 项 | 当前 V1 Agent 目录可达，含 agent-metadata-admin 与 agent-001 |

元数据助手及默认助手配置含写工具，requireApproval=0；这两个字段只表示配置，不可忽略不同执行链的审批规则。其余空 functionIds 的既有配置用于验收、投标、Excel，不擅自借用。白名单结果及原缓存文件 hash 见 [b1-ai-service-contract.json](b1-ai-service-contract.json)。三个最终诊断文件是独立运行，不是一个完整浏览器请求窗口，不累计为完整网络审计。

初始两次诊断在 activateApplication 的原 GetData 被脚本 allowlist 误挡，尚未到达 AI 合同读取；修正 allowlist 后退出 0。此为诊断脚本错误，不是服务不可用证据。后续增加业务错误分类以区分 HTTP 200 中的 1004/500，未按 HTTP 状态误判成功。

## 协议及责任方复核

参考前端路径以 `E:/r/sparkproject` 为根：

- `packages/ui/domain/metadata/src/components/AiChat/MetadataAiAssistant.vue:19` 默认 agentId=1；字典页未覆盖它。
- `packages/ui/domain/metadata/src/app/auth.ts:12` 注册 applicationAi“元数据智能助手”；`features/integration/ai-assistant/application/dify-transport.ts` 经 SPARK resource create 调用。
- `packages/data/spark-api/src/application/application-platform-capabilities.ts:97` 映射 POST /sap/agent-loop；capability-internal.ts 消费 conversation_id/data 文本块，再由 tagged-text transport 交页面候选解析。

当前本仓 `src/services/ai/ai-turn-bridge.ts:105` 及 `packages/spark-lowcode-api/src/realtime/lowcode-realtime-api.ts:172` 使用旧 /api/ai/turns。创建本地 Host registration 不会创建后端 Agent，也不随请求发送本地 systemPrompt/tool schemas。当前源码未发现 V1 客户端，不能把现有 Host 直接等同参考 applicationAi 或 V1。

Java 路径以 `E:/lowcode-jdk17/lowcode-llm-agent/src/main/java/com/htong/agent` 为根，SAP 位于同仓 lowcode-mainbody：

- SAP `sap/core/AgentLoopTemplate.java` 会把模型输出的 SAP 块交 serviceRouter 执行；不是天然文本候选服务。
- 旧 `engine/AgentRunLoop.java:317` 调用无显式 Agent allowlist 的 ToolDispatcher 重载；`tool/ToolDispatcher.java:62` 按返回名称查全局注册表。空 functionIds 只限制发给模型的声明，不能据此保证执行期无工具。此为参考源码审查，不是线上攻击或写入测试。
- V1 `v1/controller/V1AiController.java:28` 是 /api/ai/v1；`v1/dto/CreateTurnRequest.java:14` 只有 Agent、消息、附件及幂等键，没有 candidateOnly/readOnly 或按请求缩减工具的字段。
- V1 `v1/service/TurnExecutionService.java:169` 从同 Agent 的 functionIds 构造允许的 runtime map；`:203` 空声明使用 toolChoice=none；`:396` 执行前拒绝 map 外的名称。
- V1 `:333` 对非 READ_ONLY 工具或 ALWAYS 审批策略强制进入审批，不因 Agent requireApproval=0 放开；通过审批后才走 dispatch。这与旧执行链必须区分。

主控裁决：否决“只要配置有写工具，就不存在可用候选路线”的过度结论。V1 提供了有源码依据的候选路线：使用正式元数据 Agent，候选消费方不暴露或调用批准工具的能力，遇审批需求即停止并处理原轮次；只读候选经人工确认后进入原 entries DataView。此路线尚未实施，也没有部署中执行、审批、取消或返回事件的实证；GET 目录不能核销它们。不得新造 Agent ID、借用其它业务 Agent、使用旧写工具 Host，或靠提示词代替执行边界。

候选业务合同保持：入口在数据维护；读取已保存定义与获准字段；确认前短命只读建议，确认后立即清空并仅留原 entries DataView staged-create；整体取消/saveData 保持原范围与责任方；目标/查询/定义版本切换时拒绝旧结果。没有第二草稿、候选专属保存器或批次撤销通道。

## 删除引用复核

已证实本仓数据空间字典来源把 `_Base_DictType.rowid` 存为模型 `DbId`（`src/lowcode/data-space/model-source/lowcode-data-space-model-source-reader.ts:60`）；外部接口配置另按名称“接口公共头部信息使用类型”取得正式字典并绑定条目（`src/lowcode/resources/external-api/lowcode-api-provider.ts:31`）。它们不能用定义与条目删除成功代替下游完整性验证。

现有 DictionaryWorkspace 只暂存定义及全部条目删除。正式 Base_DataModel 视图可按 Type=字典 AND DbId=目标做精确引用查询；当前设计工作区视图有单空间范围，零命中不代表所有空间无引用。命中可作为明确阻止依据；未查询/不可读不解释为无引用。没有实施全表扫描或额外级联删除。

Java DictServiceImpl.deleteDict（lowcode-mainbody，:98）依次删除定义与条目，没有在该方法检查模型 DbId；物理表 BaseTblRln 级联也不自动等于此类配置引用约束。服务端完整引用检查或原子拒绝合同仍未证实，未调用删除试探。

报告初版把缺显式 Loaded 检查列成风险。主控复核后的修正：正常页面只有 load 两次查询成功才 ready，没有找到初始 entries Idle 0/0 可删除的 UI 路径。外部直接 resetState 后的公开领域 API 反例只是待验证建议，不宣称已证实页面漏洞；本轮不增加重复守卫、不一概关闭既有删除、不硬编码系统字典保护。

## 当前断点

目录范围修复的 353/5/353 与跨应用读取证据继续有效，详见既有 scope 验收。共享 typeid ValueFun 更正仍等待已发出的精确范围答复；真实三条新增及排序保存/重开未完成。下一独立 AI 工作须先落定 V1 经 SPARK data 的调用/回执/停止合同并补反例，再开放单写者实现；删除引用保持未完成，不用前端零行扫描冒充全局约束。无产品变更，未重跑此前产品测试和 build。
