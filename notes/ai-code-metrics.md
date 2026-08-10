# AI 编码效果度量台账 - 2026-06

> 本文件属于 AI 编码赋能层，只记录 AI 助手在本项目执行任务时的复杂度、返工、审查和存活率。它不是产品路线图，也不是 SPARK AI 产品契约或架构事实源。

### 2026-08-10 冗余过时代码安全清除（续）

- **复杂度**：中等（注释/文档收束）
- **总耗时**：约 15 分钟
- **返工次数**：0
- **审查轮次**：0（用户续做授权）
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：否
- **人工干预**：继续安全清除；仍不删 contracts / 不合双蓝图。

### 2026-08-10 冗余过时代码安全清除

- **复杂度**：复杂（口头「全部」收束为安全清除）
- **总耗时**：约 25 分钟
- **返工次数**：1（批量脚本损坏 JSDoc 后从 HEAD 恢复再安全删单行噪音）
- **审查轮次**：1（用户跳过问答直接授权清除）
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：待确认
- **人工干预**：明确跳过一问一答；未删 `backend-api-contracts`、未合双蓝图包、未移除 `sub-page`。

### 2026-08-10 spark-lowcode-api 生产源中文注释

- **复杂度**：中等（多文件纯注释，无行为变更）
- **总耗时**：约 15 分钟
- **返工次数**：0
- **审查轮次**：1（用户跳过反问直接授权实施）
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：否
- **人工干预**：用户确认「直接加」，跳过阶段 2 选择题。

### 2026-06-16 首页重写为企业 AI 中枢定位

- **复杂度**：中等
- **总耗时**：约 75 分钟
- **返工次数**：0
- **审查轮次**：2（初版方案 + 底部 4 字标签约束补充）
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：否
- **人工干预**：阶段2 纠正首页主张需要更高级和有韵味；阶段5 补充“最后一排文字都改为4字”。

### 2026-06-19 WorkflowDesigns 旧设计稿 unreadable 处理

- **复杂度**：复杂
- **总耗时**：约 50 分钟
- **返工次数**：0
- **审查轮次**：1
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：待确认
- **人工干预**：阶段2 选择保留旧稿显示、全不可读保留空态并提示、错误短消息暴露和定向验证范围。

### 2026-06-19 WorkflowDesigns ClassModel/Dify 对齐

- **历史注记**：该任务记录的是当时的 AI 编码过程；其中 ClassModel/Dify 对齐方向已被后续 “Agent Workflow Dify 模块级工具契约” 取代，不代表当前产品契约。
- **复杂度**：复杂
- **总耗时**：约 70 分钟
- **返工次数**：0
- **审查轮次**：1
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：否
- **人工干预**：阶段2 指出内置流程未充分使用 dts-class-model JSON、节点参数仍靠手写、流程级和节点级未与 Dify 对齐。

### 2026-06-20 Agent Workflow Dify 模块级工具契约

- **复杂度**：复杂
- **总耗时**：约 95 分钟
- **返工次数**：1（lint 发现多余类型断言后修正）
- **审查轮次**：1
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：待确认
- **人工干预**：阶段2 确认不向后兼容、`toolName` 映射模块名、`capabilities` 分 workflow/node 两层且 capability 使用数组对象结构。

### 2026-06-20 AI 编码赋能层清理

- **复杂度**：复杂
- **总耗时**：约 45 分钟
- **返工次数**：1（`verify:docs` 发现新建 notes 文件名含低信号词后改名）
- **审查轮次**：2（先区分产品层/赋能层，再补充 `notes/` 计划文件管理规则）
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：否
- **人工干预**：纠正 AI 将产品层和赋能层混淆；确认 `AGENTS.md` 是 AI 编码助手赋能项目开发的纲领文件；要求明确计划文件位置、命名、状态流转和完成后处理。

### 2026-06-20 仓库冗余深度清理

- **复杂度**：中等
- **总耗时**：约 35 分钟
- **返工次数**：1（`agents/clear-cache` 分支被 worktree 占用，先移除 worktree 再删分支）
- **审查轮次**：1
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：否
- **人工干预**：阶段 1.5 确认清理范围（分支+依赖）、红线（允许动 lockfile、删 master、保留今天 backup、删旧 backup/checkpoint、删未合并分支、删已合并本地分支）；执行中确认移除 agents-clear-cache worktree；origin/master 因 gitee 默认分支设置暂留。

### 2026-06-20 Agent Workflow Designer 单一业务节点契约落地

- **复杂度**：复杂
- **总耗时**：约 120 分钟
- **返工次数**：1（`lint` 发现类型收窄后的多余条件判断，已修正）
- **审查轮次**：1
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：是（后端 Maven 测试必须使用 JDK 17）
- **人工干预**：阶段2-4 多次纠正产品口径：只保留一种业务节点、Chat/LLM/workflow invocation 作为能力配置、validation action 必须绑定、分支和属性投影属于步骤线，本轮不改运行时。

### 2026-06-20 全仓世界观总览研读

- **复杂度**：复杂
- **总耗时**：约 25 分钟
- **返工次数**：1（用户反馈 ASCII 总览图不美观，改用表格）
- **审查轮次**：1
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：否（研读锚点写入 `notes/research-repo-worldview-overview.md`）
- **人工干预**：用户提出三条主线总纲（知识大无边 / 业务有边界）；用户要求落盘图文并茂、语义精美不吹牛；用户要求 ASCII 图改为表格；用户纠偏要求把业务工厂注册换成单一的 Workflow、暂不考虑运行时。

### 2026-06-20 业务工厂注册迁移为单一 Workflow runtimeBinding

- **复杂度**：复杂
- **总耗时**：约 150 分钟
- **返工次数**：2（`verify:ai-codegen` 暴露 type assertion / 公共面违规后修正；根级 `lint` 暴露 type-only import 后修正）
- **审查轮次**：1
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：待确认
- **人工干预**：用户给出已审核计划并要求执行；实施中未发生新的需求纠偏。

### 2026-06-20 合并 AI 编码标准（ai-spec 覆盖根 AGENTS.md，清理 docs/ai 重复）

- **复杂度**：中等
- **总耗时**：约 40 分钟
- **返工次数**：0
- **审查轮次**：2（先确认 ai-spec 定位为可拷贝底板、去占位符用通用示例值；再确认 SPARK 特有门禁只留根 AGENTS.md 不混入通用底板）
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：是（更新"规范文档跨项目移植的三层切分"——占位符策略改为通用示例值；新增"verify-docs allowlist 反向校验"）
- **人工干预**：用户明确 ai-spec 用途是"拷贝到其他项目的底板"且"不需要那么多占位符"；确认根 AGENTS.md 内嵌写死版标准、ai-spec 保留为通用底板、docs/ai 删三个重复文档保留产品事实文档。

### 2026-06-20 ai-spec 底板补入检查脚本与 README

- **复杂度**：简单
- **总耗时**：约 15 分钟
- **返工次数**：0
- **审查轮次**：1（确认"复制非移动"、确认原样拷贝全部 9 个脚本不挑通用性）
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：否
- **人工干预**：用户明确"不是移动是复制，整个文件夹作为其他项目 AI 生成代码的准则和检查脚本"；在被提示 6 个脚本 SPARK 专属不可直接用时，用户仍坚持"保持原样"，由 README 标注通用性。

### 2026-06-21 Agent Workflow runtime 模型投影边界

- **复杂度**：复杂
- **总耗时**：约 150 分钟
- **返工次数**：1（根级 typecheck 暴露 workflow-designs 测试 fixture 仍用旧 runtimeBinding 字段后修正）
- **审查轮次**：1
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：待确认
- **人工干预**：用户确认生产路线采用已编译生成的 ClassModel JSON + JS dynamic import；TypeScript compiler API 只在投产前生成/验证，不进入生产 runtime；函数调用必须落到 JS `model_script`。
- **验证摘要**：typecheck、spark-ai typecheck、workflow-designs verify、目标 Vitest、verify:class-model、lint、build:fe、AI business boundary 和 direct-turn 可选探针跳过路径均通过；全量 `pnpm run test:run` 另有 2 个未改动 dev-system 测试文件失败，已标注为计划外既有 fixture 风险。

### 2026-06-21 升级全部基础依赖到最新稳定版

- **复杂度**：复杂
- **总耗时**：约 90 分钟（3:14 - 4:08，含阻塞等待）
- **返工次数**：2（pnpm 11 要求 Node 22 阻塞、pnpm 11 忽略 package.json overrides 阻塞）
- **审查轮次**：1（方案一次通过）
- **30天存活**：（30天后回填）
- **知识沉淀**：是（5 条，pnpm 11 约束 3 条 + @types/node 适配结论 1 条 + 动态 import eslint 约束 1 条）
- **人工干预**：阶段 2 提问 8 题全答；阶段 6 两次阻塞需用户决策 Node 版本和 overrides 迁移路径

### 2026-06-21 修复 verify:ai-codegen 3 个违规

- **复杂度**：中等
- **总耗时**：约 17 分钟（3:51 - 4:08）
- **返工次数**：1（消费面研读遗漏上层 barrel 二次 re-export，typecheck 阶段暴露后修复）
- **审查轮次**：1（方案一次通过）
- **30天存活**：（30天后回填）
- **知识沉淀**：是（1 条，动态 import eslint 约束，与依赖升级合并记录）
- **人工干预**：阶段 2 提问 4 题全答；阶段 6 方案 D 实施遇 eslint no-unsafe-assignment 障碍，调整为守卫 + 局部 disable

### 2026-06-22 工作目录深度清理垃圾文件

- **复杂度**：中等
- **总耗时**：约 17 分钟（2:06 - 2:23，含 pnpm install 等待）
- **返工次数**：0
- **审查轮次**：1（提问 6 题确认范围与收尾）
- **30天存活**：（30天后回填）
- **知识沉淀**：是（1 条，工作目录清理时的进程句柄锁定）
- **人工干预**：阶段 1.5/2 提问 6 题；阶段 4 研读发现 spark-ai-server/data 含 git 追踪配置，纠正用户"整目录删"选择的风险并获明确授权；执行后用户选择 git restore 恢复配置；worker 执行中 2 个 dev-setup 日志被 node 进程锁定未删，未强行 kill。
### 2026-06-22 Page Design 100-Step Workflow Data Migration

- **Complexity**: complex
- **Total time**: about 4 hours
- **Rework count**: 5 (template encoding cleanup, line/model test fixture migration, generator/verifier contract alignment, lint cleanup, static definition validation corrected for missing completion members)
- **Review rounds**: 1 approved plan, multiple user corrections before implementation
- **30-day survival**: pending
- **Knowledge deposition**: pending user confirmation
- **Human intervention summary**: User clarified that ClassModel projection is the truth, `models[]` replaces single `model`, graph persistence must be nodes + lines, completion belongs on model entries and must not use runtime-only `llm.knowledge.models` or protocol-only `agent_complete` when no projected member exists.

### 2026-06-22 Workflow Designs Auto Layout

- **Complexity**: medium
- **Total time**: about 75 minutes across the original pass and this repair pass
- **Rework count**: 1 (current frontend worktree did not contain the expected auto-layout button, so the scoped change was re-applied and revalidated)
- **Review rounds**: 1 approved plan, with user choices for scope, order, start position, row size, auto-save, and same-rank ordering
- **30-day survival**: pending
- **Knowledge deposition**: pending user confirmation
- **Human intervention summary**: User reported the missing toolbar button with a screenshot, which triggered code verification against the live Vite source and the repair pass.

### 2026-06-22 Workflow Designs Structured Property Drawer

- **Complexity**: complex
- **Total time**: about 95 minutes
- **Rework count**: 2 (Vue template narrowing in hidden legacy blocks, then select change handling and tests after replacing apply buttons with draft writes)
- **Review rounds**: 1 approved plan plus 2 user refinements about runtime-only fields and dynamic model/member/property loading
- **30-day survival**: pending
- **Knowledge deposition**: pending user confirmation
- **Human intervention summary**: User clarified that all runtime-determined data must be read-only and that model/member/property choices must be loaded dynamically rather than typed manually.

### 2026-08-10 AppWorks 直连 lowcode 前端 API 与项目蓝图正名

- **复杂度**：复杂
- **总耗时**：跨多轮实施与浏览器验证，约 1 个工作日
- **返工次数**：4（物理单根假设、多顶层缺失父记录、合成根身份冲突、route 类型丢失 conid）
- **审查轮次**：多轮领域语义校正后，2 份正式计划获用户批准
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：待用户确认
- **人工干预**：用户明确 AppWorks 不保留后端、前端直连只读 lowcode-jdk17、项目蓝图替代导航语义、数据空间只承载前端模型线、权限由后端唯一决策并保留五稀疏集合。
- **验证摘要**：公共包/根类型检查、Lint、单元测试、包构建、前端构建、发布 dry-run、合同/架构/文档校验和授权浏览器黑盒；未执行 live mutation。`verify:ai-codegen` 的既有 6 项基线违规单独记录，不在本轮静默豁免。

### 2026-08-10 原 Java 服务端退役现场清理

- **复杂度**：复杂
- **总耗时**：约 3 小时（含全量构建、1233 项测试、发布 dry-run 与真实 lowcode 浏览器复验）
- **返工次数**：2（配置加载器删除后保留纯显式配置合并；语义 gateway fixture 的文件路径分隔符修正）
- **审查轮次**：1（8 个真实歧义逐题确认，方案一次批准）
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：本轮没有新增独立知识条目；配置边界、项目蓝图与 lowcode 运行事实已写入现有知识索引和研读文件。
- **人工干预**：用户明确要求彻底清除原 Java 服务端现场、不保留兼容壳、不删除任何前端功能，并授权在全部验证后永久删除旧 MySQL 备份、构建缓存和 `node_modules`。
- **验证摘要**：typecheck、Lint、166 个测试文件/1233 项测试、ClassModel 47 项测试、架构/依赖/文档/页面/workflow/lowcode 合同/AI 模型门禁、完整构建和发布 dry-run 通过；领码科技真实登录、应用目录、薪酬授权导航和项目蓝图工作台冷启动复验通过。`verify:ai-codegen` 仍为既有 6 项，无新增。

### 2026-08-10 原 spark-ai-server 深度残留清理

- **复杂度**：复杂
- **总耗时**：约 45 分钟（含冻结安装、ClassModel 全量重建、1235 项测试、完整构建和清理后复验）
- **返工次数**：0 次代码返工；2 次清理命令因安全策略调整为“只读列举绝对路径 + 固定路径 rimraf”
- **审查轮次**：1（阶段 2 的 8 个真实歧义逐题确认，计划一次批准）
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：待用户确认“lowcode 合同账本扫描 build dist 导致假漂移”的验证顺序规则
- **人工干预**：用户确认只清当前可交付产品和安全临时残留，保留前端 `packages/spark-ai`、受保护考古材料、Git 历史及共享恢复对象；选择生成器重建、持久残留门禁、冻结安装和全量验证。
- **验证摘要**：冻结安装未改 lockfile；typecheck、Lint、166 个测试文件/1235 项测试、常规 ClassModel 4 个文件/47 项测试、完整包与前端构建、架构、依赖、页面、文档、工作流、lowcode 合同和 AI 模型门禁通过；当前产品旧服务端精确引用、Java/POM、陈旧 ClassModel shard/index、dist/cache/空目录均为 0。严格 ClassModel semantic-gap 门禁仍被既有 344 项阻断且报告无差异；`verify:ai-codegen` 仍为既有 6 项，无新增。

### 2026-08-10 lowcode 模型与关系前端反腐适配

- **复杂度**：复杂
- **总耗时**：跨多轮领域校正与实现，约 2 小时
- **返工次数**：2（全量语义正名后补齐 PAGE_DATASET 运行时校验消费者；字段重命名闭环补齐复合资源映射与 DataView 过滤绑定）
- **审查轮次**：1（模型适配器补入正式计划后获用户批准）
- **30天存活**：（30天后回填）待回填
- **知识沉淀**：待用户确认“公开合同破坏性正名必须同步 capability 运行时校验”和“consumer ledger 在源码消费面变化后必须由生成器刷新”两条规则
- **人工干预**：用户明确 DataTable 对应数据资源、DataView 对应资源视图、DataSet 层保持稳定；后端混合关系由前端分别投影为资源关系和 UI 输入级联；模型必须经过独立适配器；不改 lowcode-jdk17，不保留旧合同兼容层。
- **验证摘要**：spark-data 类型检查与 28 文件/401 项测试、spark-lowcode-api 类型检查与 13 文件/44 项测试、根类型检查、Lint、架构门禁、168 文件/1246 项测试和 lowcode 合同账本校验全部通过；未执行后端、数据库或 live mutation。
