# 通用 AI 批量录入：基础链证据

唯一计划和最新状态见 `notes/data-space-retirement-ledger.md`，本目录只保存证据，不是并行实施计划。所有清单文件复制后按 SHA-256 核对，见 `manifest.json`。本工作区基线为 6cab104；实现由 gpt-6-luna 承担，主控复核及真实只读/配置验证。

- G1：正式字段 allowAIAdd → DataTable.columns/DataColumn → DataView 输出列继承。原生 API/runtime RED 后 168+56=224 项 GREEN；根 typecheck/scoped lint 通过。只读实服 16 个 GetData、零写入，证明列元信息装配；不是 AI 组件或 SPA 验收。
- G2a：Agent 配置命令/只读 DataView。目录中的两次在途目标切换 RED 均为实际行为反例；最终 28 项资源测试通过，前一修复版本含原 AiTurn/LowcodeClient 共 62 项通过。最终只补输入类型 JSDoc，正式生成语义缺口为已有 3110；根 typecheck/scoped lint 通过。独立复核报告记录对应当时 hash，最新源码 hash 在唯一台账。
- 实际配置创建只 POST 一次，响应通过 Code=200 检查，但 Result 没有非空字符串 ID，原命令仍 unknown。`g2a-agent-config-live.json` 如实记录失败；原进程继续保留 capture，防重标记在本目录上一级 `ai-data-entry-agent-create-attempt.json`。没有重试，也没有推定该次写入失败或成功。
- `g2a-preserved-error-read.json` 是对保留的本机 Node 错误链的只读诊断，未发后端请求。参考 Java 字符串 success 重载可能将 ID 放在 Message；本次原始 Message 未被保存，不能将源码推断当作实际报文。
- `g2a-existing-config-read.json` 独立证明正式目录中的现存 ID `2114051153246425088`，并按该 ID 完整回读核对提示词哈希、模型、启用与空工具配置。运行引用采用该正式配置；这不是原创建回执，也不消除其 unknown。提示词正文和凭据不进入证据 JSON。
- G2b：原生会话及字段校验已经过行为反例与复审；tinyint补齐后主控32/32。真实原生轮次2114063013848944640已COMPLETED、两条候选通过，但未确认进业务草稿，零业务保存/删除。这只证明原生SPARK data链。
- G3：标准组件及应用host经R1—R4修复、独立复审，最后禁用态输入锁另有独立RED；主控最终31/31。正式生成972DTS/1985symbols/1601index，语义缺口仍为已有3110。目录同时保留首版失败和后续通过证据，冻结hash及适用范围以各报告和唯一台账为准。
- G4字典替换已完成独立复审；真实目录AI输入/unknown关闭保护、原owner重挂均有集成证据。真实布局发现提示框挤压后，仅修标准Form属性，截图保留修复前后对照。
- `g4-spa-verified-network.json`与`g4-spa-evidence-check.json`证明完整连续SPA：35条请求、0Document、0截断；第一批取消恢复原5条，第二批仅2条Added，关闭→另一字典→重开读回7条，原5条逐值不变。保留两条新增ID为77CDFBD360F6E82554CA4A7094EA80B9与4BE2596650D71A59E02C381B496286C7；没有资源删除。截图为g4-spa-layout-corrected.png、g4-spa-saved-reopened.png。
- `g4-spa-bootstrap-network.json`和`g4-spa-before-layout-network.json`包含开发导航/热更新造成的观察截断，只作局部过程证据，不能用于连续SPA声明。完整验收结束后纯路径归位，host除模块路径外内容hash与原冻结版相同；`g4-spa-relocation-readback.json`独立证明最终路径读回7条、通用host装配及clean release，0写入。
- 最终host/workflow/catalog94/94、root typecheck、全lint、正式生成、verify:rules、build均通过（g4-relocation-*）。正式生成为971DTS/1983symbols/1600index，保留原3110语义缺口；既有2项AI-model警告和构建分包提示没有被隐去。
- 旧SPA的停止中轮次、原Agent配置创建unknown不由新组件烟测成功核销。第二正式模型未做线上烟测，B1删除引用/下游消费仍见唯一台账。

本目录脚本是过程证据，不能直接反复执行写入探针。创建脚本依赖防重标记；无可信回执不得再次 POST。所有后端配置/业务交互仍由 SPARK data DataView 承接，未修改或启动 Java，未删除测试资源。
