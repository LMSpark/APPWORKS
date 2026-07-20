# 意图操作系统（Intent Operating System）理念研究报告

> 研究日期：2026-06-23
> 用途：与 SPARK_AppWorks 的 Agent Flow 设计器做理念对标
> 说明：本报告区分"业界共识"（有多方来源支撑）与"个人推测/综合"（作者基于多源资料的综合判断），并在每节末标注来源。

---

## 1. "意图操作系统"的定义与边界

### 一段话定义

**意图操作系统（Intent Operating System / Intent OS）是一类以"意图"（intent）为一等公民的计算协调层**：用户或上游系统用自然语言或结构化声明表达"想要达成什么"（what），系统自动完成意图解析、任务规划、能力调度、代理编排、执行反馈与闭环验证，把"如何做"（how）的负担从人转移到机器。它不是对传统内核（Linux/Windows）的整体替代，而是在传统 OS 之上叠加一层"意图→执行"的控制平面（agentic control plane），负责代理身份、记忆、工具权限、调度、治理与可观测性。与传统 OS"用户驱动、系统被动反应"的命令式范式不同，意图操作系统接受声明式目标，主动推理、选择工具、在不确定下决策，并在越界时暂停求助。

### 要点列表

- **意图为一等公民**：意图是可被系统识别、存储、调度、治理的独立实体，而非一次性 prompt。AOS 论文明确把"intent and governance as first-class scheduling and enforcement concerns"列为核心主张 [arXiv:2606.01508]。
- **声明式输入，自动式执行**：用户给目标与约束，系统自己分解步骤、选工具、处理异常。这与 IBN 的"separates the what from the how"理念一致 [RFC 9315；HPE]。
- **协调层而非单产品**：业界共识是"an agentic OS is a layer, not a product you install"，是一个需要组装的架构模式 [Make 2026 Guide]。
- **不替代传统内核**：AOS 论文与 Agent libOS 都强调运行于传统 OS 之上，不实现硬件驱动或 POSIX 内核，而是为 agent 工作负载补充身份、能力、调度、审计等原语 [arXiv:2606.01508；arXiv:2606.03895]。
- **调度单元变了**：传统 OS 调度可运行线程；意图 OS 调度"长程目标循环"——在事件上唤醒、在不确定下推理、跨应用边界发起工具调用 [revolutionized.com]。
- **用户角色变了**：用户从"逐步操作者"变为"监督者"——定义意图、设定边界、设审核阈值，平台处理执行图 [revolutionized.com]。
- **覆盖范围广**：从自研内核（ICM-OS 的 Synapse Kernel）到用户态运行时（Agent libOS），到控制平面（KnowledgeOS、Make），到移动 OS 意图框架（App Intents / AppFunctions），都属于这一理念谱系。

> 来源：[arXiv:2606.01508] Agent Operating Systems (AOS)；[arXiv:2606.03895] Agent libOS；[Make 2026 Guide]；[revolutionized.com]；[RFC 9315]；[HPE IBN]；[OpenIntentOS GitHub]；[COGNOS GitHub]；[KnowledgeOS GitHub]

---

## 2. 概念体系

意图操作系统的概念体系围绕"意图如何被表达、解析、调度、执行、反馈"展开。以下是核心概念及其相互关系。

### 2.1 意图（Intent）

**定义**：用户或上游系统希望达成的目标状态，附带的约束、成功度量与未决设计空间。它不指定实现步骤。

- 在 AI Agent 语境：自然语言目标 + 隐含约束（"帮我订下周去日本的机票，预算 5000 内"）。
- 在 IBN 语境：RFC 9315 把 intent 定义为"一组运营目标和约束，不指定如何实现"。
- 在企业架构语境（William El Kaim 的 Intent-Driven Architecture）：intent 是结构化声明——包含期望的事态、业务范围、必须保持的约束、成功度量、仍开放的设计选择；它是一个独立于 Project/Initiative 的一等实体，可被多个 initiative 复用、可超越单个项目的生命周期 [el-kaim.com Chapter 3]。

**关键性质**：意图是**有生命周期的**——被识别、翻译、部署、验证、可能漂移、被重新对齐。IBN 把这称为 intent lifecycle [RFC 9315；draft-irtf-nmrg-ibn-usecases]。

### 2.2 能力（Capability）

**定义**：系统或代理可被授权调用的工具、动作或资源的边界。能力是"代理能做什么"的显式契约。

- AOS 论文把 capability 定义为"which tools can be invoked, which resource scopes, … capability checks must be deterministic and deny by default" [arXiv:2606.01508 §4.5]。
- Agent libOS 把"tools are libc-like wrappers; runtime primitives are the authority boundary"作为核心设计规则，文件访问、对象访问、sleep、人工审批、JIT 工具注册都在原语边界上受能力与策略检查 [arXiv:2606.03895]。
- KAIJU 的 Intent-Gated Execution（IGX）用四个独立变量（scope、intent、impact、clearance）授权，每个变量由模型之外的独立权威控制，单点失守不致全局失守 [arXiv:2604.02375]。
- 移动端：Apple App Intents / Android AppFunctions 把"app 的动作与数据"以结构化方式暴露给系统级 agent，是能力的声明式注册 [Apple Developer；Android Developers]。

### 2.3 调度（Scheduling）

**定义**：决定哪个代理/任务在何时、以何种顺序、在什么触发下运行，以及如何分配资源（模型 token、API 配额、计算预算）。

- 传统 OS 调度 CPU 时间片与 I/O 阻塞；AOS 调度器"把代理进展当作一等信号"，目标函数不同——不是吞吐，而是目标推进 [arXiv:2606.01508 §4.3]。
- Make 指出"只响应用户 prompt 的代理不是运行在 OS 上，而是运行在一个按钮上"，触发层（轮询/webhook/定时）决定是否真有 agentic 系统 [Make 2026 Guide]。
- KAIJU 的执行层在 LLM 产出依赖图后"独立调度、门控、派发工具"，LLM 是无状态资源 [arXiv:2604.02375]。

### 2.4 代理（Agent）

**定义**：具备身份、目标、工具集、模型选择的执行主体，能在定义的护栏内感知状态、决策下一步、对真实系统采取行动。

- Make 的 agent 四要素：identity（是谁）、goal（要达成什么）、tool set（能调什么）、model choice（用哪个 LLM 推理）[Make 2026 Guide]。
- AOS 把 agent 作为 first-class entity，额外包含 goal/task graphs、capability sets、context state、execution lineage [arXiv:2606.01508 §3.2]。
- Agent libOS 把 agent 建模为 AgentProcess：可调度执行主体，带进程身份、父子血缘、生命周期状态、工具表、类型化对象记忆、显式能力、人工队列、检查点、事件、审计记录 [arXiv:2606.03895]。

### 2.5 编排（Orchestration）

**定义**：决定哪个代理处理哪个任务、何时升级、何时重试、何时移交的协调逻辑。

- 四种路由模式：确定性路由（规则）、概率路由（LLM 决策）、人在环检查点（高风险前审批）、错误升级 [Make 2026 Guide]。
- 三种编排模型：中央编排器（主代理委派专家）、对等（代理互调为工具）、混合（确定性规则包裹概率决策）[Make 2026 Guide]。
- GraphBit 用 DAG 表达工作流，执行引擎管所有路由/状态/工具调用，agent 只做领域推理，消除"幻觉路由"和无限循环 [arXiv:2605.13848]。
- KAIJU 的 reflector 在结构化叶节点评估证据，决定 continue/conclude/replan [arXiv:2604.02375]。

### 2.6 概念相互关系（文字描述）

数据流自上而下形成一个闭环：

1. **意图表达层**：用户/上游用自然语言或结构化声明产出 Intent。
2. **意图解析与规划层**：系统把 Intent 翻译成目标图/任务 DAG，识别所需能力与约束。这是 LLM 作为"无状态推理资源"被调用的点（KAIJU 模式）。
3. **能力调度层**：调度器依据任务图、能力集、资源预算决定执行顺序；每个工具调用经能力门控（如 IGX 的四变量）授权后派发。
4. **代理执行层**：代理在护栏内调用工具、产生副作用、写回记忆与对象状态。
5. **反馈与闭环层**：reflector/assurance 模块比对实际状态与意图状态，检测漂移，决定继续/结论/重规划/升级人工。

闭环的关键在于：**意图是输入也是验证基准**——执行不是为了"跑完流程"，而是为了"对齐意图"。这是意图 OS 区别于普通工作流引擎的根本点。

> 来源：[arXiv:2606.01508]；[arXiv:2606.03895]；[arXiv:2604.02375]；[arXiv:2605.13848]；[Make 2026 Guide]；[RFC 9315]；[el-kaim.com]；[Apple/Android 开发者文档]

---

## 3. 不同语境下的"意图"对比

| 维度 | 移动端 Intent（Android Intent / iOS App Intents） | 网络领域 Intent-Based Networking（IBN） | AI Agent 意图驱动编排 | OS 层意图操作系统 |
|------|----------------------------------------------------|------------------------------------------|------------------------|-------------------|
| **意图是什么** | 一个显式的动作描述对象（action + data + category），用于跨组件/跨应用通信 | 运营目标与约束的声明，不指定实现步骤 | 用户用自然语言表达的目标，系统自动分解执行 | 把意图作为 OS 一等调度与执行单元，贯穿整个计算栈 |
| **表达形式** | 结构化对象（Intent / AppIntent 类型，带参数） | 声明式策略（GUI/API，如"服务 A 到 B 经 TLS 延迟<10ms"） | 自然语言 + 隐含约束，或结构化 intent 对象 | 自然语言意图接口 + 结构化 intent 实体（带版本、事件日志） |
| **谁来解析** | 系统的 Intent 解析器 / AppFunctionManager | IBN 翻译引擎 + 策略映射模块 | LLM 推理层（planner） | 意图分类器 + 规划器（如 OpenIntentOS 的 Intent Router） |
| **执行单元** | Activity / Service / AppFunction | 网络设备配置（ACL、路由、防火墙规则） | 工具调用 / 子代理 / DAG 节点 | 代理进程（AgentProcess）+ 工具调用 |
| **调度模型** | 显式启动（startActivity）或系统匹配 | 闭环控制器持续保障 | 事件驱动 + 目标循环 + 人在环检查点 | 长程目标循环，事件唤醒，跨应用边界 |
| **闭环验证** | 无（一次性调用） | 有（continuous assurance，检测漂移并自愈） | 有（reflector 比对证据与原查询） | 有（intent assurance 是一等输出） |
| **能力/权限模型** | 应用沙箱 + 权限声明（EXECUTE_APP_FUNCTIONS） | 访问控制 + 威胁态势纳入意图 | 能力集 + IGX 四变量门控 + deny by default | 能力 token + 系统调用层 mediation + 审计流 |
| **代表实现** | Android Intent（2010→）、AppFunctions（Android 16/17, 2026）；Apple App Intents（iOS 16, 2022→, 3.0 预期 iOS 20） | Cisco DNA Center、Juniper Apstra、HPE Aruba；RFC 9315/9316 | KAIJU、GraphBit、LangGraph、AutoGen、Make、OneReach GSX | OpenIntentOS、COGNOS、ICM-OS、KnowledgeOS、Agent libOS、AOS（论文） |
| **核心差异点** | 跨应用通信机制，意图是消息载体，不含自动规划 | 声明式网络配置 + 闭环保障，但领域限定在网络 | 把"意图→规划→执行→反思"自动化，但通常不触及 OS 内核 | 把意图下沉到 OS 层，让代理成为一等进程，调度/权限/审计都围绕意图 |

**关键观察**：四个语境共享"声明式 what、自动 how、闭环验证"的内核，但抽象层级递进——移动端 Intent 是消息传递原语，IBN 是领域专属的声明式控制，AI Agent 编排是应用层的意图自动化，OS 层意图 OS 是把意图下沉为计算栈一等概念。后续对标真实项目时，应明确项目处于哪一层。

> 来源：[Android Developers AppFunctions]；[Apple Developer App Intents]；[agentmarketcap.ai 2026]；[RFC 9315]；[HPE IBN]；[arXiv:2604.02375]；[arXiv:2605.13848]；[Make 2026 Guide]；[OpenIntentOS]；[COGNOS]；[ICM-OS]；[arXiv:2606.01508]；[arXiv:2606.03895]

---

## 4. 设计原则

以下 7 条原则综合自多方来源，每条附一句话原则与一句解释。

1. **意图为一等公民**
   意图必须被显式建模为独立实体，有自己的身份、生命周期与状态，而非消散在 prompt 里。
   解释：AOS 把 agent identity、goal/task graphs、capability sets、context state 都列为 first-class entities [arXiv:2606.01508 §3.2]；企业架构侧要求 Intent 实体独立于 Initiative/Project，可被多 initiative 复用 [el-kaim.com]。

2. **声明式输入，自动式执行**
   用户表达"想要什么"与约束，系统自行分解、选工具、处理异常。
   解释：IBN 的"separates the what from the how"是这一原则的最早成熟表述 [RFC 9315；HPE]；KAIJU 让 LLM 只产出依赖图，执行层独立调度 [arXiv:2604.02375]。

3. **推理与执行分离**
   LLM 作为无状态推理资源在离散点被调用，执行层独立处理依赖解析、工具派发、失败恢复、安全执行。
   解释：KAIJU 的两层抽象是这一原则的代表；GraphBit 同样让引擎管所有路由，agent 只做领域推理 [arXiv:2604.02375；arXiv:2605.13848]。这避免了 LLM 控制执行机制带来的不可审计与提示注入风险。

4. **能力显式、最小权限、默认拒绝**
   每个工具调用必须在能力边界内被确定性授权，模糊时拒绝。
   解释：AOS §4.5 明确"capability checks must be deterministic and deny by default"；Agent libOS 把文件/对象/sleep/审批都放在原语边界检查；KAIJU 的 IGX 用四个独立变量分权 [arXiv:2606.01508；arXiv:2606.03895；arXiv:2604.02375]。

5. **闭环验证，漂移可检测**
   系统必须持续比对实际状态与意图状态，检测并修正漂移。
   解释：IBN 的 continuous assurance 是闭环范式源头 [RFC 9315]；KAIJU 的 reflector 在叶节点评估证据决定 continue/conclude/replan [arXiv:2604.02375]；Spec-Driven Development 把 drift detection 作为一等能力 [InfoQ SDD]。

6. **可审计、可解释、可回滚**
   每个代理决策、工具调用、输出都要有可读记录，高风险动作可被人工审批或回滚。
   解释：Make 把 audit trail & explainability 列为治理四控制之一 [Make 2026 Guide]；OneReach GSX 强调"reversible autonomy"——可断路、撤销、回滚 [onereach.ai]；AOS 把 decision lineage 列为一等输出 [arXiv:2606.01508]。

7. **人在环为一等设计原则，而非安全网**
   人工介入不是事后兜底，而是治理结构的一部分——定义意图、设边界、设审核阈值、在语义边界做判断。
   解释：revolutionized.com 指出"agentic OS reframes the user as a supervisor"；InfoQ SDD 文章强调 HITL 在"自动化执行 vs 解释性判断"边界是 first-class design principle [revolutionized.com；InfoQ SDD]。

> 来源：综合各文献，标注如上。

---

## 5. 架构特征（分层描述）

综合 AOS 论文、Make 六层、OpenIntentOS 五层内核、KAIJU 两层抽象、IBN 功能模块，可归纳出一个通用的意图 OS 分层架构。**这是作者基于多源资料的综合（个人推测/综合）**，用以对标。

### Layer 0：意图表达层（Intent Expression）
- 用户/上游用自然语言、结构化声明、或 cron/webhook 事件表达意图。
- OpenIntentOS 的 Layer 5（Intent Interface）支持自然语言、REST、cron、Telegram/Discord [OpenIntentOS]。
- Apple App Intents 用 Swift 宏声明参数化动作 [Apple Developer]。
- **对标要点**：系统是否有显式的意图输入接口，而非把意图藏在 chat 消息里？

### Layer 1：意图解析与规划层（Intent Parsing & Planning）
- 意图分类器把自然语言转成类型化 handler 调用（如 Imperal web-kernel 返回 intent/confidence/action_plan）[docs.imperal.io]。
- Planner 产出目标图/任务 DAG，识别所需能力与约束。
- KAIJU 让 LLM 一次性产出工具调用依赖图 [arXiv:2604.02375]。
- **对标要点**：意图是否被解析成可调度、可验证的结构化计划？

### Layer 2：能力调度层（Capability Scheduling）
- 调度器依据任务图、能力集、资源预算决定执行顺序。
- 每个工具调用经能力门控授权（IGX 四变量 / capability token / ABAC 策略）。
- OpenIntentOS 的 Layer 3 Micro-Kernel 含 Scheduler、Intent Router(SIMD)、Wasm Sandbox、ABAC Policy [OpenIntentOS]。
- **对标要点**：工具调用是否经过显式能力授权？调度是否基于目标推进而非纯 FIFO？

### Layer 3：代理执行层（Agent Execution）
- 代理在护栏内执行 ReAct 循环（Plan→Execute→Reflect），调用工具产生副作用。
- Agent libOS 把 agent 建模为 AgentProcess，带类型化对象记忆、人工队列、检查点 [arXiv:2606.03895]。
- GraphBit 用三层记忆隔离（scratch / workflow state / connector）防止上下文污染 [arXiv:2605.13848]。
- **对标要点**：代理是否有持久身份与状态？执行是否可中断/恢复？

### Layer 4：记忆与共享上下文层（Memory & Shared Context）
- 三类记忆：ephemeral（单次运行）、session（多步工作流）、shared（组织级策略/SOP）[Make 2026 Guide]。
- AOS 的 context and memory management 是独立组件 [arXiv:2606.01508]。
- **对标要点**：状态住在哪里？谁能读？跨会话是否持久？

### Layer 5：治理、护栏与审计层（Governance, Guardrails & Audit）
- 身份与权限、动作审批阈值、输出校验、审计轨迹与可解释性 [Make 2026 Guide]。
- AOS 的 policy and trust enforcement + observability and audit [arXiv:2606.01508]。
- **对标要点**：能否看到每个代理决策？高风险动作前能否人工审批？

### Layer 6：可观测性与持续改进层（Observability & Continuous Improvement）
- 执行日志、成本监控、漂移检测 [Make 2026 Guide]。
- AOS 把 audit 列为一等输出 [arXiv:2606.01508]。
- **对标要点**：能否追踪每次执行的成本、token、决策路径？能否复现？

### Layer 7：反馈与闭环层（Feedback & Closed-Loop Assurance）
- reflector/assurance 比对实际 vs 意图，触发 continue/conclude/replan/升级人工。
- IBN 的闭环保障是这一层的范式源头 [RFC 9315]。
- **对标要点**：执行结果是对照意图验证的，还是只跑完流程就结束？

> 来源：[arXiv:2606.01508]；[Make 2026 Guide]；[OpenIntentOS]；[arXiv:2604.02375]；[arXiv:2606.03895]；[arXiv:2605.13848]；[RFC 9315]；[docs.imperal.io]。分层为作者综合。

---

## 6. 代表性实践与产品

### 6.1 OpenIntentOS（开源，Rust）
用 Rust 写的意图驱动 AI OS，单二进制约 10MB、冷启动 <200ms、7 家 LLM 级联容灾。五层内核架构：Runtime/Adapters/Micro-Kernel/Agent Runtime/Intent Interface。Micro-Kernel 含 SIMD 加速的 Intent Router、crossbeam 调度器、Wasm 沙箱、AES-256 Auth Vault、ABAC 策略。体现了"意图为一等公民 + 推理执行分离 + 能力门控"特征。[https://github.com/OpenIntentOS/OpenIntentOS]

### 6.2 COGNOS / OS（intent-native Linux）
AI 被编入 OS 本身，拥有真实 syscall 访问、真实内存、真实调度权限，但内核强制永久从属于人类用户。"你治理，AI 运营"——用户定义意图与边界，AI 在边界内执行并需批准。体现了"声明式输入 + 能力边界 + 人在环"特征。[https://github.com/iCrewZero/COGNOS]

### 6.3 ICM-OS（意图驱动元操作系统，自研内核）
自研 i386 Synapse Kernel，分页内存管理、ELF 加载器、VFS/TmpFS。Python/C Shell 把任意语言意图经 DeepSeek 分解为 24 个原语 + AI 动态生成原语执行。体现了"意图→原语分解"的 OS 层设想，是把意图下沉到内核层的最激进尝试。[https://github.com/jinbohao1688/icm-os]

### 6.4 KnowledgeOS（意图驱动 AgentOS 控制平面）
在 `.agent-os/` 下提供项目控制平面：任务/路由/运行/评估/回执/移交的固定生命周期、写保护、冷归档、能力总线（MCP/skills/workflows/subagents/orchestrators）、内核模块（启动纪律/阶段日志/记忆车道）。把 OS 隐喻（shell=自然语言意图、syscall=CLI、进程状态=任务、文件权限=写策略、驱动=能力层、内核日志=阶段日志）落到知识工作场景。[https://github.com/fly-carrot/knowledgeos]

### 6.5 KAIJU（意图门控执行内核，论文）
两层抽象：推理层处理用户交互，执行层负责依赖解析/工具派发/失败恢复/安全执行/结果综合。LLM 是无状态资源，在离散点被调用。Intent-Gated Execution（IGX）用 scope/intent/impact/clearance 四个独立变量授权，每个由模型外的独立权威控制。体现了"推理执行分离 + 分权能力门控 + 闭环 reflect"特征。[https://arxiv.org/abs/2604.02375]

### 6.6 GraphBit（图式非线性编排框架）
用户把工作流定义为类型化 DAG（agent 节点、tool 节点、控制流逻辑），执行引擎确定性执行：agent 只做领域推理，引擎管所有路由/状态/工具调用。三层记忆隔离防上下文污染。Rust 核心 + Python 绑定，11.9ms 均值延迟。体现了"声明式 DAG + 引擎治理编排 + 确定性可审计"特征。[https://arxiv.org/abs/2605.13848]

### 6.7 Agent libOS（库 OS 启发的 agent 运行时，论文）
把 agent 当 AgentProcess：可调度执行主体，带进程身份、父子血缘、生命周期、工具表、类型化对象记忆、显式能力、人工队列、检查点、事件、审计记录。核心规则"工具是 libc 式包装，运行时原语才是权威边界"。体现了"代理为一等进程 + 能力原语边界 + 可检查点恢复"特征。[https://arxiv.org/abs/2606.03895]

### 6.8 AOS（Agent Operating System，论文）
把 agentic control plane 集成进现有 OS 的系统架构，分解为调度器、上下文与记忆管理、工具与能力注册表、策略与信任执行、可观测与审计。不替代内核，而是把 intent 和 governance 作为一等调度与执行关注点。映射到 Linux/Windows 原语，定义以确定性执行、可审计、操作者可理解为重点的评估标准。[https://arxiv.org/abs/2606.01508]

### 6.9 Apple App Intents / Android AppFunctions（移动 OS 意图框架）
Apple App Intents（iOS 16, 2022→，3.0 预期 iOS 20）：开发者用 @AppIntent 宏把参数化动作暴露给 Apple Intelligence/Siri/Shortcuts，Agent Siri 可链式调用完成多步任务而无需手动切应用。封闭——只有 Apple 一方 agent 可调用。
Android AppFunctions（Android 16/17, 2026）：on-device MCP 实现，用 @AppFunction 注解暴露能力给 Gemini 等授权 agent，权限门控但开放。
两者都体现了"能力声明式注册 + 无头执行 + agent 链式调用"特征，是移动 OS 层的意图机制。[Apple Developer；Android Developers；agentmarketcap.ai]

### 6.10 Intent-Based Networking（IBN，RFC 9315）
运营商声明高层网络结果（"服务 A 经 TLS 到 B，延迟<10ms"），IBS 翻译成配置、部署、持续验证、漂移自愈。闭环保障是核心。体现了"声明式 what + 自动 how + 闭环 assurance"的最早成熟范式，是意图 OS 理念的网络领域先驱。[https://datatracker.ietf.org/doc/rfc9315/]

### 6.11 Make / OneReach GSX（编排平台层）
Make 把 agentic OS 落地为六层协调层（连接/记忆/代理/编排/治理/可观测），Scenario Builder 做可视化编排，Make AI Agents 做推理，Make Grid 做可观测。OneReach GSX 强调模型无关网关 + reversible autonomy + 集中策略执行。两者体现了"协调层而非产品 + 治理设计前置 + 可逆自治"特征。[https://www.make.com/en/blog/agentic-operating-system；https://onereach.ai/cognitive-orchestration-engine/]

### 6.12 Intent-Driven Architecture / Spec-Driven Development（企业架构层）
William El Kaim 的 Intent-Driven Architecture 把 intent 作为企业架构一等实体（结构化声明：事态/范围/约束/度量/开放设计空间），独立于 Initiative。Spec-Driven Development（InfoQ）把意图落为可执行规范，AI agent 与 CI/CD 管道据此生成/校验代码，drift 可机器检测，HITL 在语义边界做判断。体现了"意图为可治理一等实体 + 可执行规范 + 漂移检测"特征。[https://el-kaim.com/chapter-3-intent-driven-architecture-1c678bf1a979；https://www.infoq.com/articles/spec-driven-development/]

> 来源：如各条末 URL 所示。

---

## 7. 可对标维度清单（最重要——用于对照真实项目）

以下 12 条是作者综合上述理念提炼的检查清单。每条是一个可对照回答的问题，括号内标注对应的设计原则/层。**这部分是个人综合，用于对照 SPARK_AppWorks Agent Flow 设计器。**

1. **意图一等公民**：系统是否把用户意图显式建模为一等实体（有身份、生命周期、状态），而非消散在 prompt 或一次性请求里？（对应原则 1，Layer 0/1）
2. **声明式输入**：用户是否能用自然语言或结构化声明表达"想要什么"+ 约束，而无需手动编排执行步骤？（对应原则 2，Layer 0）
3. **意图解析可结构化**：意图是否被解析成可调度、可验证的结构化计划（任务图/DAG），而非停留在隐式 prompt？（对应原则 2，Layer 1）
4. **推理与执行分离**：LLM 推理是否与执行机制分离——LLM 产出计划，执行层独立调度派发，LLM 不直接控制授权逻辑？（对应原则 3，Layer 1/2）
5. **能力显式注册**：工具/动作是否以结构化方式声明式注册（参数、副作用、破坏性标记），可被 agent 发现与调用？（对应原则 4，Layer 2；移动端 App Intents 模式）
6. **能力门控与最小权限**：每次工具调用是否经过显式能力授权（能力集/策略/IGX 式分权），默认拒绝，模糊时拒绝？（对应原则 4，Layer 2/5）
7. **调度基于目标推进**：调度是否基于目标推进与事件触发（而非纯 FIFO 或仅响应用户点击）？代理是否可作为长程目标循环被调度？（对应原则 2，Layer 2）
8. **代理持久身份与状态**：代理是否有持久身份、生命周期、可中断/恢复（检查点）？还是每次都从零开始？（对应原则 1，Layer 3）
9. **记忆分层与隔离**：是否有 ephemeral/session/shared 分层记忆，且跨代理/跨会话的状态有显式归属与读写控制？（对应原则 1，Layer 4）
10. **闭环验证**：执行结果是否对照原始意图验证（reflector/assurance），能检测漂移并触发 continue/conclude/replan？还是只跑完流程就结束？（对应原则 5，Layer 7）
11. **可审计可回滚**：每个代理决策、工具调用、输出是否有可读审计轨迹？高风险/不可逆动作前能否人工审批？能否回滚？（对应原则 6，Layer 5）
12. **人在环为一等设计**：人工介入是否是治理结构的一部分（定义意图/设边界/设审核阈值/在语义边界判断），而非事后兜底？（对应原则 7，Layer 5/7）

> 使用建议：对 SPARK_AppWorks Agent Flow 设计器逐条回答"是/部分/否/不适用"+ 证据，即可得到一份理念对标差距分析。

---

## 8. SPARK_AppWorks Agent Flow 设计器对标结论

> 本节基于本仓源码、产品层文档和当前落盘 workflow 数据，不再引用外部资料作为产品事实源。
> 核心事实源：`packages/spark-ai/docs/business-factory-workflow-zh-cn.md`、`packages/spark-ai/docs/spark-ai-platform.md`、`packages/spark-ai/docs/native-runtime-and-agent-flow-zh-cn.md`、`src/views/app/WorkflowDesigns.vue`、`src/services/workflow-designs.ts`、`packages/spark-ai/src/agent/workflow/*`、`spark-ai-server/src/main/java/com/spark/ai/service/WorkflowDesignService.java`、`spark-ai-server/data/workflow-designs/lmspark/homepage/*`。

### 8.1 一句话判断

**当前 Agent Flow 设计器已经接近意图操作系统的"业务能力注册器 + 契约编译器"层，但还不是完整的意图操作系统。**

它已经能把一个业务意图流程沉淀成可发布的 `definition.json`：流程变量、运行绑定、ClassModel model context、LLM 工作、validation action、步骤线投影和发布校验都有明确结构。但它还没有把"用户自然语言意图 → 自动选择 workflow → 补齐缺参 → 调度执行 → 运行账本 → 闭环验收"连成统一产品面。

更准确地说：当前设计器不是 Dify/Coze 式"节点类型堆叠器"，而是 SPARK 意图 OS 的**业务形态定义面**。它负责回答"这个业务意图应被登记成什么可治理能力"，而不是直接承担完整 OS 的意图入口、调度器和运行态观测。

### 8.2 当前架构中的三条主线

| 主线 | 当前实现 | 对意图 OS 的意义 |
|------|----------|------------------|
| 知识大无边 | TS/Vue 源码与 JSDoc 编译为 `generated/dts-class-model`，运行时通过 ClassModel knowledge provider 和 7 工具闭集消费。 | 全仓业务能力可被模型查询、阅读、调用；这是意图 OS 的能力知识层。 |
| 业务有边界 | Agent Workflow Design 通过 `design.json -> definition.json` 定义 `start -> node -> output` 图，每个业务节点绑定 model context、LLM work、validation action。 | 意图不是裸 prompt，而是可发布、可校验、可溯源的业务能力契约。 |
| 执行有窄门 | `runtimeBinding -> ClassModelAgentAdapter -> ToolLoop -> model_script -> native-runtime -> business instance`。 | LLM 不能任意调用后端能力，只能通过 ClassModel 工具闭集和 gate 进入真实业务对象。 |

平台文档给出的主链路是：

```text
TS / Vue source
  -> generated/dts-class-model JSON
  -> ClassModel knowledge / runtime
  -> Agent Workflow Designer
  -> design.json
  -> definition.json
  -> runtime binding
  -> tool loop / model_script
  -> delivery
```

这条链路与意图 OS 的核心范式高度一致：业务能力来自源码真源，设计器把能力编排成意图契约，运行时通过受治理工具闭集执行。

### 8.3 与传统 Agent Workflow 设计器的关键差异

| 维度 | 常见 Workflow / Chatflow 设计器 | SPARK Agent Flow 设计器 |
|------|----------------------------------|--------------------------|
| 节点模型 | `llm` / `tool` / `condition` / `code` / `agent` 等结构性节点大量平铺。 | 发布态只允许 `start`、`node`、`output`；`node` 是唯一业务节点。 |
| 业务语义 | 节点常绑定某个工具调用或 prompt。 | 节点绑定 ClassModel model context，LLM 在模型上下文内完成普通工作。 |
| 完成判定 | 节点跑完即完成，或靠 LLM 自称完成。 | 节点完成只能通过 `validation.action`，LLM 不能直接声明完成。 |
| 能力来源 | 手写 tool registry / app registry / prompt 模板。 | TypeScript class + JSDoc 是语义真源，DTS ClassModel 是查询索引和缓存。 |
| 连线语义 | 多数是控制流边。 | 步骤线表达上游输出到下游输入、子模型或 workflow output 的投影与分支。 |
| 发布边界 | 编辑态常直接等于运行态。 | `design.json` 是编辑态，`definition.json` 是发布态，发布前会做阻断校验。 |

这个设计选择很重要：它避免把业务流程拆成一堆工具节点，转而把业务节点提升为"一个模型上下文下的工作站"。这更接近意图 OS 的"能力边界 + 目标推进"范式。

### 8.4 对标意图 OS 七层架构

| 意图 OS 层 | 当前状态 | 证据 | 缺口 |
|------------|----------|------|------|
| Layer 0 意图表达 | 部分具备 | 首页产品语义已明确"理解意图、调度系统、写回业务"；workflow 变量可表达输入契约。 | 缺统一自然语言意图入口；用户还不能从一个泛化入口提交任意业务意图并进入 workflow 匹配。 |
| Layer 1 意图解析与规划 | 偏弱 | `definition.json` 可表达结构化流程，业务节点可表达 LLM task。 | 缺通用 intent router；当前 `pageDesign` / `projectPlanning` 激活仍在 app binding 层硬编码。 |
| Layer 2 能力调度 | 部分具备 | ClassModel 7 工具闭集、runtimeBinding、capabilities、line projection、branch schema 已存在。 | workflow graph 还不是实际调度器；分支条件和优先级在 UI 中未充分产品化。 |
| Layer 3 代理执行 | 中等 | `ClassModelAgentAdapter` 把 workflow runtimeBinding 激活为 Agent registration；ToolLoop 执行 `model_script`。 | runtime 解释的是 workflow 级绑定，不是逐节点 graph execution；节点状态不是运行调度状态。 |
| Layer 4 记忆与上下文 | 中等 | ClassModel root 可达闭包、session store、run trace、business instance 共同构成上下文。 | 设计器没有把 ephemeral/session/shared 记忆分层呈现为 workflow 可治理配置。 |
| Layer 5 治理与审计 | 较强但未闭环 | legacy 结构三层拒绝；gate、beforeFunctionCall、validation action、fail-fast 参数校验已存在。 | gate 参数仍偏业务硬编码；缺跨 workflow 的统一审批、风险级别和审计视图。 |
| Layer 6 可观测性 | 偏弱 | 节点有 `state/result` 字段，session/run trace 在运行时侧存在。 | 设计器没有集成真实运行轨迹、当前节点、工具调用、失败原因、成本和回放。 |
| Layer 7 闭环保障 | 部分具备 | `agent_complete`、completion member、validation action 都在表达完成闭环。 | 多节点 pageDesign 的 completion 仍缺失；闭环更多是契约字段，尚未成为每节点运行时强制机制。 |

综合评分：**能力契约层 7/10，执行治理层 6/10，意图入口与路由层 3/10，运行观测层 3/10。**

### 8.5 当前设计器已经具备的 OS 级特征

1. **workflow definition 已经可作为能力注册单元**
   `definition.json` 包含 `workflowId`、`source`、`runtimeBinding`、`variables`、`capabilities`、`graph`、`validation`，具备成为意图 OS 注册表条目的基础。

2. **业务节点是模型上下文，不是工具调用**
   `node` 绑定 `models[]`、`llm`、`validation`，普通工作由 LLM 在当前 ClassModel context 内自由编排。这比"一个节点一个工具"更接近业务意图执行。

3. **模型知识真源清晰**
   设计器不维护手写 registry；ClassModel 的语义真源是 TS class + JSDoc，`generated/dts-class-model` 只是索引和缓存。这降低了"工具描述与代码实现漂移"的风险。

4. **发布态拒绝旧结构**
   TS 校验器、前端发布前校验、Java 文件服务都会拒绝 legacy `tool` / `workflow` / `condition` / `provider` / `toolName` / `inputMapping` 等旧协议，说明新契约已经有硬边界。

5. **运行入口收束到 ClassModel 工具闭集**
   实际执行经 `model_query`、`model_*_guide`、`model_script`、`human_question`、`agent_complete` 等固定工具进入 native runtime；未知工具和未知参数 fail-fast。

6. **设计态与发布态分离**
   `design.json` 可容纳画布坐标、viewport、草稿和占位；`definition.json` 表达发布态业务契约，带 source 溯源和 validation。这个分离是 OS 级治理的必要前提。

### 8.6 当前还不是完整意图 OS 的原因

1. **没有通用意图入口**
   现在已有 `pageDesign`、`projectPlanning` 等业务入口，但缺一个统一的"用户说意图，系统选择 workflow"入口。

2. **没有 workflow 召回/路由层**
   workflow 列表只是设计器左侧列表，还不是运行时 registry index。缺 intent examples、trigger phrases、能力标签、租户启用状态、版本状态、召回分数和冲突消解。

3. **没有缺参澄清的产品闭环**
   `human_question` 是运行时工具协议，但设计器层还没有把 workflow variables、ClassModel 成员、required inputs 映射成 preflight clarifier。

4. **workflow graph 尚未成为执行调度图**
   当前 runtime 主要读取 workflow 级 `runtimeBinding` 并创建一个 ClassModel Agent registration。graph 是业务契约和提示/验证结构，不是实际逐节点执行调度器。

5. **语义校验还不够深**
   现有校验强在 JSON shape 和 legacy reject，但没有在发布前验证 `models[].className`、line endpoint `memberName`、`validation.action.actionName` 是否真实存在于 ClassModel 投影。

6. **运行态账本没有进入设计器**
   设计器还不能看到一次意图执行经过了哪个 workflow、哪个节点、哪些 tool call、哪些 gate、哪些 validation issue、是否写回成功。

### 8.7 当前落盘 workflow 状态

基于 `spark-ai-server/data/workflow-designs/lmspark/homepage` 的当前数据：

| workflow | design 状态 | definition 状态 | 业务节点 | 线数 | 当前结论 |
|----------|-------------|-----------------|----------|------|----------|
| `agent.workflow.projectPlanning` | valid，3 nodes / 5 lines | valid，3 nodes / 5 lines，0 issues | 1 个：`node.projectPlanning` | 5 | 已符合当前单节点 workflow 契约；completion 与 validation 都绑定 `completeProjectPlanning`。 |
| `agent.workflow.pageDesign` | invalid，9 nodes / 12 lines | invalid，9 nodes / 15 lines，7 issues | 7 个业务节点 | design 12，definition 15 | 多节点业务形态已经成型，但 design/definition 不一致，且 7 个业务节点都缺 completion member / validation action。 |

`tools/verify-workflow-designs.mjs` 当前失败点：

```text
workflow-designs: agent.workflow.pageDesign design.lines.length: expected 15, got 12
```

这说明 pageDesign 不能被当作已经闭环的意图 OS 样板。它更像一个目标形态清晰、但发布契约尚未补齐的多节点草稿。

### 8.8 pageDesign 七节点形态的价值与风险

pageDesign 的七个业务节点分别覆盖页面入口意图、页面文件盘点、数据结构规划、表关系、视图设计、规则/脚本/样式资产、渲染收口。这是非常接近意图 OS 的业务分层：用户不再操作具体文件，而是表达页面目标，由流程分阶段对齐模型上下文和输出。

但当前风险也集中在这里：

- 节点标题和模型绑定已有业务分层，但 completion / validation 为空，意味着"节点何时算完成"还没有机器可验证标准。
- design 12 条线、definition 15 条线，说明编辑态和发布态已经漂移。
- line schema 能表达 member-level 投影，但 UI 尚未充分表达 branch condition、priority、validation、projection transform。
- 若不补齐完成标准，多节点图会退化为"展示型流程图"，无法成为 OS 级可调度契约。

### 8.9 projectPlanning 单节点形态的价值与边界

projectPlanning 当前更接近可发布样板：一个业务节点绑定 `ProjectModel`，completion 和 validation 都指向 `completeProjectPlanning`，definition validation 为 valid。

它的价值是证明了最小闭环成立：

```text
workflow variables
  -> ProjectModel context
  -> LLM work
  -> completeProjectPlanning
  -> valid definition
```

它的边界是：单节点 workflow 无法证明多节点投影、分支、节点间 completion、局部 validation 和运行态观测已经成熟。因此它适合作为"注册与运行绑定样板"，不适合作为"复杂意图 OS 编排样板"。

---

## 9. SPARK 意图 OS 演进路线

### Phase 0：先修当前契约一致性

目标：让现有 workflow 数据不再自相矛盾。

- 同步 `agent.workflow.pageDesign/design.json` 与 `definition.json` 的 line 数量和 line endpoint。
- 明确 pageDesign 是 draft 还是 publishable：如果是 draft，UI 和校验脚本应明确显示；如果要 publishable，必须补齐 7 个业务节点的 completion member 和 validation action。
- `tools/verify-workflow-designs.mjs` 应区分"可发布 workflow"和"草稿 workflow"；对可发布 workflow，校验 `x_spark.validation.status` 必须是 `valid`。

### Phase 1：把 workflow 列表升级为 OS 注册表

目标：让每个 workflow definition 成为可被意图路由检索的能力条目。

建议新增或规范化以下 metadata：

| 字段 | 作用 |
|------|------|
| `intent.description` | 该 workflow 能处理什么业务意图。 |
| `intent.examples[]` | 典型用户说法，用于召回和测试。 |
| `intent.triggers[]` | 结构化触发条件，如页面设计、项目策划、数据建模。 |
| `lifecycle.status` | draft / published / deprecated / blocked。 |
| `owner` | 业务责任人或模块归属。 |
| `tenantEnablement` | 租户/项目级启用状态。 |
| `riskLevel` | 执行动作风险级别，用于审批策略。 |

设计器左侧列表应从"文件列表"升级为"能力注册表视图"：支持搜索、标签、状态、可运行性、版本、最近发布和验证结果。

### Phase 2：新增通用 Intent Router

目标：用户只表达意图，系统返回候选 workflow。

输入：

```json
{
  "utterance": "帮我为订单管理做一个带查询和明细的页面",
  "tenantId": "lmspark",
  "projectId": "homepage",
  "context": {}
}
```

输出：

```json
{
  "candidates": [
    {
      "workflowId": "agent.workflow.pageDesign",
      "confidence": 0.86,
      "reason": "意图涉及页面设计、数据视图和配置页生成",
      "missingVariables": ["pageId", "effectiveDescription"]
    }
  ]
}
```

路由依据不应硬编码 `pageDesign` / `projectPlanning`，而应读取已发布 definitions 的 intent metadata、variables、capabilities、modelProjectionRef 和 examples。

### Phase 3：把缺参澄清前置为 workflow preflight

目标：在执行前补齐必要事实，减少运行时反复 `human_question`。

preflight 应读取：

- workflow variables 的 required 字段。
- `runtimeBinding.inputContract.identityField` / `messageField` / `resolveInstance.identityField`。
- 业务节点 `inputs`、line endpoint、ClassModel required params。
- 风险动作所需的人工确认。

产出是结构化澄清问题，而不是自由聊天：

```json
{
  "question": "这个页面的唯一标识 pageId 是什么？",
  "bindsTo": "$workflow.pageId",
  "reason": "pageDesign workflow 的 identityField 需要 pageId",
  "candidateOptions": []
}
```

### Phase 4：发布前增加 ClassModel 语义校验

目标：让 definition 不仅 JSON 合法，而且业务引用真实可达。

建议校验：

- `workflow.runtimeBinding.modelProjectionRef.rootClassName` 是否存在。
- `models[].rootClassName` / `models[].className` 是否存在且可达。
- `models[].completion.memberName` 是否是模型可读属性或合法完成成员。
- line endpoint 的 `modelId + memberName` 是否能在对应节点模型上解析。
- `validation.action.className/actionName` 是否是真实 action，参数是否能由 `inputProjection` 覆盖。

校验实现不应把设计器变成第二套 ClassModel 解释器；更稳的方式是复用 generated dts-class-model loader / knowledge service 做只读验证。

### Phase 5：明确 graph execution 语义

目标：避免 graph 只停留在"画布表达"。

有两条路线，必须选一种：

| 路线 | 含义 | 优点 | 风险 |
|------|------|------|------|
| 契约编译路线 | graph 只编译为一个 Agent 的系统提示、上下文约束、validation 计划。 | 改动小，贴合当前 runtimeBinding。 | 多节点状态和分支容易只是展示语义。 |
| 图调度路线 | runtime 逐节点执行 start/node/output，line 投影 cargo，branch 决定下游。 | 更接近意图 OS scheduler。 | 需要新增调度器、节点状态、重试、回滚和观测面。 |

如果目标是"意图操作系统"，长期更建议走图调度路线；短期可以先把契约编译路线文档化，避免误解。

### Phase 6：把运行态账本接入设计器

目标：让设计器不仅能画 workflow，也能解释一次意图执行。

运行面板应显示：

- 本次用户意图与匹配 workflow。
- 变量绑定和 preflight 澄清记录。
- 当前节点、节点输入/输出、completion 状态。
- tool calls、gate 结果、人工审批、失败重试。
- validation action 的输入、输出、issue。
- 最终 delivery / write-back / rollback 状态。

这一步完成后，Agent Flow 设计器才会从"定义面"升级成"意图 OS 控制台"。

---

## 10. 对 SPARK 的最终定位

### 10.1 当前定位

SPARK 当前最有竞争力的不是"再做一个 Agent 工作流编辑器"，而是：

> **用源码级 ClassModel 把企业系统能力结构化，再用 Agent Workflow definition 把业务意图注册成可治理能力，最后通过 ClassModel 工具闭集把 LLM 行为收束到真实业务对象。**

这个定位比普通 prompt workflow 更深，因为它的核心资产不是 prompt，也不是手写工具列表，而是"源码语义投影 + 业务能力契约 + 受控运行窄门"。

### 10.2 与意图 OS 的关系

| 判断 | 结论 |
|------|------|
| 是否已经是意图 OS？ | 还不是。缺通用意图入口、路由、preflight、graph scheduler 和运行账本。 |
| 是否具备意图 OS 的核心底座？ | 是。ClassModel、workflow definition、runtimeBinding、ToolLoop、gate、validation 已经构成底座。 |
| 当前最应该补哪层？ | 先补 registry/router/preflight，而不是继续扩节点类型。 |
| 当前最大工程风险？ | pageDesign 多节点契约未闭环，design/definition 漂移，语义校验不足。 |
| 最小可展示样板？ | projectPlanning 展示单节点闭环；pageDesign 修复后展示多节点意图编排。 |

### 10.3 产品叙事建议

可以把 Agent Flow 设计器对外叙事从"工作流设计"升级为：

```text
业务意图注册台：
把一个可重复的业务目标登记成 workflow definition，
绑定业务模型、输入契约、执行权限、验证动作和交付出口。
```

再把未来完整系统叙事为：

```text
意图操作系统：
用户表达业务意图，
系统匹配已注册 workflow，
澄清缺失事实，
在 ClassModel 能力边界内执行，
通过 validation action 验收，
把结果写回真实业务系统并留下审计账本。
```

这个叙事与当前代码事实一致，也给后续研发留下清晰分层：设计器负责注册和契约，router 负责选择，preflight 负责澄清，runtime 负责执行，ledger 负责观测和审计。

### 10.4 本次验证记录

本次补充研究时执行了以下只读验证：

```text
pnpm exec vitest run tests/services/workflow-designs.test.ts tests/views/workflow-designs.test.ts packages/spark-ai/src/tests/agent-workflow-definition.test.ts --config vitest.config.ts
```

结果：

```text
Test Files  3 passed (3)
Tests       44 passed (44)
```

同时执行：

```text
pnpm exec node tools/verify-workflow-designs.mjs
```

结果失败：

```text
workflow-designs: agent.workflow.pageDesign design.lines.length: expected 15, got 12
```

该失败已纳入第 8.7 节和 Phase 0 路线图。

---

## 附：来源索引

| 编号 | 来源 | URL |
|------|------|-----|
| arXiv:2606.01508 | Agent Operating Systems (AOS) | https://arxiv.org/abs/2606.01508 |
| arXiv:2606.03895 | Agent libOS | https://arxiv.org/abs/2606.03895 |
| arXiv:2604.02375 | KAIJU: Intent-Gated Execution | https://arxiv.org/abs/2604.02375 |
| arXiv:2605.13848 | GraphBit: Graph-based Agentic Framework | https://arxiv.org/abs/2605.13848 |
| Make 2026 Guide | What Is an Agentic Operating System? | https://www.make.com/en/blog/agentic-operating-system |
| revolutionized.com | Agentic OS vs Traditional OS | https://revolutionized.com/what-makes-an-agentic-os-different-from-traditional-operating-systems/ |
| RFC 9315 | Intent-Based Networking Concepts | https://datatracker.ietf.org/doc/rfc9315/ |
| HPE IBN | What is Intent-Based Networking | https://www.hpe.com/us/en/what-is/intent-based-networking.html |
| OpenIntentOS | GitHub | https://github.com/OpenIntentOS/OpenIntentOS |
| COGNOS | GitHub | https://github.com/iCrewZero/COGNOS |
| ICM-OS | GitHub | https://github.com/jinbohao1688/icm-os |
| KnowledgeOS | GitHub | https://github.com/fly-carrot/knowledgeos |
| Apple App Intents | Apple Developer | https://developer.apple.com/documentation/appintents |
| Android AppFunctions | Android Developers | https://developer.android.com/ai/appfunctions |
| agentmarketcap.ai | Mobile OSes as Agent Platforms 2026 | https://agentmarketcap.ai/blog/2026/04/10/android-intelligent-os-apple-intelligence-appintents-agent-platforms-2026 |
| el-kaim.com | Intent-Driven Architecture Ch.3 | https://el-kaim.com/chapter-3-intent-driven-architecture-1c678bf1a979 |
| InfoQ SDD | Spec Driven Development | https://www.infoq.com/articles/spec-driven-development/ |
| OneReach GSX | Cognitive Orchestration Engine | https://onereach.ai/cognitive-orchestration-engine/ |
| docs.imperal.io | Imperal web-kernel architecture | https://docs.imperal.io/en/concepts/architecture/ |
| JetBrains 2026 | Top Agentic Frameworks 2026 | https://blog.jetbrains.com/pycharm/2026/06/top-agentic-frameworks-for-building-applications-2026/ |

---

## 研究方法说明与局限性

- **业界共识**：AOS 论文的 first-class entity 主张、IBN 的闭环保障范式、Make 的六层架构、KAIJU 的推理执行分离与 IGX 分权，均有独立多方来源支撑，可视为共识。
- **个人综合**：第 5 节的七层架构、第 7 节的 12 条对标维度，是作者基于多源资料综合提炼，用于对标目的，不代表任何单一文献的官方表述。
- **时效**：检索于 2026-06-23，覆盖至 2026 年 6 月的公开资料。部分 GitHub 项目（OpenIntentOS、COGNOS、ICM-OS）为较新或实验性项目，成熟度不一，引用时请注意其原型性质。
- **未覆盖**：未深入 AutoGPT/BabyAGI 早期自治代理（已被 2026 年的编排框架超越）、RealityComposer（与意图 OS 关联较弱）。如需补充可再检索。
