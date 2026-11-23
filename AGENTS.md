# SPARK AppWorks 全仓代理规约

本文件是所有代理的仓库入口。**先分清用户要求什么、源码实现了什么、真实服务证明了什么，再决定能否动手。** 只读研读、审计或草拟文档不授权修改文件、运行测试或操作真实业务数据。

## 1. 依据与优先级

- **目标与授权**：以用户明确确认的业务要求和本次任务边界为准。已批准方案限定可改范围；研读结论、草案、历史验收和已有代码都不能代替批准。设计取舍依次考虑：业务理念 → 完整业务逻辑 → AI 代码质量规则 → 单一真源与职责边界 → 必要的删、合、拆 → 迁移便利。
- **实现事实**：前端以当前源码、正式模型 class、类型/JSDoc、登记配置及实际调用链为准；架构文档解释跨包合同，冲突时回到实现核对。服务能力以正式服务合同、当前执行域的真实请求、回执和精确回读为据；参考 Java 源码、测试夹具或编译通过不证明线上行为。分别记录**已证事实、目标要求、已知缺陷、待核合同**。
- **工作规程**：修改代码前读 [通用编码规程](ai-coding-kit/AGENTS.md)；若与本文件冲突，本文件优先，尤其是主仓/无额外 worktree、按完整业务阶段实施、权限与数据合同。技能、知识文件和历史计划只补充本文件，不覆盖它。[知识库](knowledge/README.md) 是排查指引，`notes/` 是研读、计划、证据和度量，不是产品真源。命令和可执行门禁以 [根 package.json](package.json) 及其调用的 `tools/`、`scripts/` 为准。

## 2. 按系统体系定位任务

先沿系统层级定位对象，不能从页面按钮、文件名或旧 URL 反推架构：

```text
平台治理
  -> 企业管理（内部事务 / 受托平台应用）
      -> 应用 projectId
          -> ProjectBlueprint
              -> 导航、数据空间、页面工具
                  -> PageRuntime instanceId
                      -> DataSet
                          -> DataTable（resource/model/api/crudConfig）
                              -> DataView（query/edit/run state）
                                  -> 标准组件 / 声明式动作
                                      -> owner / receipt / readback
```

| 体系层 | 唯一责任与真源 | 任务进入点 |
|---|---|---|
| 平台治理 | 平台应用管理委派、租户生命周期、跨企业应用使用授权；权限最终到当前登录人 | [治理方案](notes/plan-five-layer-governance.md)、[治理研读](notes/research-five-layer-governance.md) |
| 企业管理 | 当前企业内部应用、配置、维度、共享；受托应用仍是独立执行域 | `config/navigation/vue-pages.json`、`src/lowcode/system-navigation.ts`、正式查询 DataView |
| 应用设计 | `ProjectBlueprint`、节点、导航、数据空间与工具引用 | `packages/spark-project-model/`、`src/services/project/` |
| 数据空间 | `scenarioId -> DataSet -> DataTable(columns/views/resource/model/api/crudConfig) -> DataView`；接口与模型级执行契约归 DataTable | [数据链路主合同](docs/architecture/DATAFLOW_ARCHITECTURE.md)、`packages/spark-data/src/data-table.ts`、`src/lowcode/data-space/` |
| 页面交付 | `PageTool` 三文件、共享场景文件、一次调用生命周期 | [页面配置架构](docs/architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md)、`SparkPageRenderer` |
| 标准组件 | `dataViewKey/dataMember/dataField` 的运行绑定与权限消费 | `packages/spark-component/`、ClassModel |
| 服务适配 | wire 合同归 `backend-api-contracts`；平台会话与特定服务 adapter 归 `src/lowcode`；数据 owner adapter 必须进入 SPARK Data DataTable/DataView，`spark-lowcode-api` 仅为待退役迁移层 | [退役研读](notes/research-spark-lowcode-api-retirement.md)、[退役计划](notes/plan-spark-lowcode-api-retirement.md) |
| AI/工具链 | ClassModel、Workflow 与宿主 binding；不替代业务真源 | `packages/spark-ai/`、[AI Workflow 合同](packages/spark-ai/docs/business-factory-workflow-zh-cn.md) |

跨层约束：

- 上层只通过正式身份和授权结果进入下层，不继承或放大下层权限。
- 平台委派、应用使用、企业数据共享是三类独立关系。
- 企业内部管理与受托平台管理可共用工作区，不共用名单、owner、执行域或权限结果。
- 应用设计可持有数据空间和页面引用，不持有生产业务数据权限。
- DataTable 配置真实资源、模型、接口、CRUD 策略和模型级约束；DataView 只配置/持有查询、过滤、分页、选择、编辑与本次运行态。装配器把 DataTable 契约解析成各 DataView owner，页面不另写接口、owner 或 save。
- 数据空间和页面运行时只消费当前登录人的当次查询权限，不从导航、目录或草案推导。

## 3. 工作区与 Git 安全

只在 **`D:\SPARK_AppWorks` 主仓**工作。禁止新建、恢复、切换到额外 Git worktree；工具默认隔离、并行任务和委派均不例外。历史恢复备份不是可清理的工作树。

写入前用 `git --no-optional-locks status --short --branch` 核对分支、暂存、未暂存及未跟踪文件，确认目标文件与他人工作不冲突；有锁等待释放。不得擅自建分支、提交、推送、暂存无关文件或批量格式化、重命名。不得用 `reset`、`clean`、整文件检出或全树 `stash` 消除现场。若不能仅撤回本任务自己的改动，保留现场并报告。仅在用户明确要求时按 [CONTRIBUTING.md](CONTRIBUTING.md) 提交。

## 4. 架构、导航与身份

AppWorks 是**纯前端**。浏览器通过同源 `/api` 访问外部 SPARK；开发代理必须配置 `LOWCODE_GATEWAY_URL`，生产代理由部署侧负责。仓内不保存平台密钥或数据库副本，不接入、修改、编译、启动或部署参考 Java 服务来补合同。

- `spark-utils` 提供公共原语及共享字面量；`spark-json-document` 是 JSON 值与 Schema 的真源；`spark-data` 拥有数据空间、视图、owner adapter 及其编辑状态。`spark-project-model` 拥有蓝图、工具、场景配置与调用生命周期；`spark-ai` 拥有 Agent/Workflow。`spark-lowcode-api` 当前仍为过渡适配层，不能继续扩大公共面；平台会话与特定服务归宿主 `src/lowcode/`，wire 合同归 `backend-api-contracts/`。
- `spark-component` 拥有标准组件、能力树、渲染与绑定；`spark-app` 拥有应用壳、`RuntimeNavigation` 和动态路由；`spark-ai` 是通用 Agent/Workflow/ClassModel 内核，业务绑定留在宿主。`vite-plugin-spark-catalog` 是构建工具。依赖不得成环或向上；宿主不重写渲染器、模板编译器或沙箱。`spark-utils`、`spark-data`、`spark-project-model` 不导入 Vue、Router、Element Plus、VueUse 或 Pinia；组件运行时不依赖 `spark-ai`。
- **蓝图不是菜单。** 动态业务导航是正式蓝图候选节点与当前用户后端授权节点按 ID 的交集；隐藏的设计节点仍属于蓝图。系统菜单由[页面登记](config/navigation/vue-pages.json)投影，不能授予权限。`/apps/{projectId}/{pagePath}` 由 `src/services/application-scope.ts` 解析；租户来自认证会话，不写入 URL。`/platform` 的 `homepage` 表示无应用的目录执行域，不是同名业务应用；不为目录请求补造 `X-AppId`。
- **身份不能互换。** 登录人、租户、应用 `projectId/applicationId`、蓝图节点 `nodeId`、工具 `pageId`、场景 `scenarioId`、正式模型 `modelId/modelName`、场景内部 table key、`viewId`、调用 `instanceId`、原查询正式行键各有归属。URL 只寻址；标题、来源名、同名模型、`_pk` 或猜出的 `id/rowid` 不能充当正式身份。
- 新绑定一律写 **`scenarioId@modelName@viewId`**。正式模型取 `modelBinding.modelName`，本地模型取自身 `tableName`；仅显式声明 `mainScenarioId` 时可用 `modelName@viewId`。旧 `#` 前缀只兼容读取。组件、脚本和动作解析本次调用的同一视图；缺失、重名、跨域或未声明即报错，不退回首个场景、首个视图或手传数组。

## 5. 一条 SPARK 数据链，一次查询的权限

**业务输入 → PageRuntime → DataSet → DataTable 配置（resource/model/api/crudConfig）→ 同表各 DataView 的 owner 装配 → DataView 查询/编辑执行 → 标准组件／声明式动作 → 正式回执 → 按键回读 → 独立重开与下游消费。**

- 数据空间是前后端交换中心：向上承接页面输入输出，向下连接数据库、文件、字典、逻辑视图、外部 API 与命令，旁接功能标签及授权配置。一个空间对应 `DataSet`，一个模型对应含 `columns`、多个命名 `DataView`、资源/模型身份、`api`、`crudConfig` 与模型级保存约束的 `DataTable`。空间、模型、字段的正式数据库记录与场景 `pagedata.json` 共同装配实例；`toJson()` 不是保存合同。不得复制模型定义、业务行、权限凭据或草稿形成第二真源。
- **所有业务读写都走 SPARK data API，设计器和文件也不例外。** 后端接口、资源身份、模型绑定、CRUD 策略与模型级约束在 `DataTable` 配置；`DataView` 只声明查询范围、筛选、排序、分页、选择、编辑模式和本次结果。装配器按 DataTable 契约为各视图绑定 query/save/file/command owner，共享需要复用的模型级 CrudService。页面不直调 HTTP、文件 owner 或另设接口、暂存、权限、保存通道。只提交已捕获的变更；未加载不等于删除，普通保存不扫描全空间依赖。命令特有的引用检查仅限该命令。已有旁路登记为差距，切换后删除，不双写。
- **SPARK Data 是唯一业务后端交互入口。** 低代码只提供请求 scope 与 owner adapter，将正式服务合同装配进 DataTable；业务查询与保存必须经 DataView。页面、脚本、平台门面不得开放并行 API；`spark-lowcode-api` 公共聚合面按退役计划拆迁。
- `resourceRelations` 用完整过滤表达式描述稳定模型关系；`viewCascades` 显式描述查询或字段值级联，二者不互推。级联使用原生字段值或选中主键数组；当前行只是取值指针。旧响应不得覆盖新输入，不默认选首项；保留既有 `DataView.value` 序列化合同。本行计算可在前端；跨行、跨模型聚合由后端按实际过滤与权限执行，不以当前分页或拉全量到浏览器代算。
- **前端无角色；权限最终落到当前登录人。** 只消费此人、此租户/应用执行域、此次正式查询的入口和表／行／字段／动作结果。不能按 `admin`、用户名、企业名或简称、`IsSys`、负责人、成员身份、默认应用、菜单或按钮放行。保留“数据空间默认权限＋功能标签＋授权机制”；维护授权配置的权限与配置产生的运行权限分开，前端不重算、不从视图绑定推导授权记录。
- 字段读取、隐藏／脱敏与写入独立，`R` 是必填而非可读；模型新增、行删除、树父行新增子项各有许可，批量逐目标核对。组件通过 DataView 获取字段与动作状态；原行凭据留在原查询 owner，不复制、不解码。业务条件只能收窄权限。提交前重核执行域、行键、实际修改字段和动作；换人、切域、实例释放或查询失效后不沿用旧权限。最终写入由服务端强校验。
- **保存不抛错不等于成功。** 检查 `saveChanges()` 的 `success`、目标和分项结果；分别呈现未提交、明确失败、部分成功、结果未知、已确认但回读失败。数据库、文件、命令分别确认，无跨来源事务或自动回滚。取消只撤本地未提交编辑；unknown 只核验原提交，不自动重发。无权、查询失败、未读全、缺文件或损坏不能显示为正常空结果。HTTP 200、提示成功、待办消失均不能替代精确回读。

## 6. 页面、设计与迁移

- **四文件是工具三文件＋共享场景文件**：`PageTool` 的 `rule.json` 表达组件、绑定和事件，`script.js` 仅编排必要业务差异，`style.css` 按实例隔离；`pagedata.json` 属于场景，声明正式模型绑定、命名视图、查询、关系与级联，不是页面私有数据。系统场景按[当前登记](config/pages/system-scenarios.json)定位，不硬编码场景数量；动态场景使用其正式来源。配置页在整组发布 proof 一致后才物化，快照编号不是发布指针，发布证明也不是数据授权。
- 一次 `PageRuntime` 调用可有多个显式场景，各调用独立装配 DataSet；脚本、样式、组件注册、异步结果和释放均限本实例。原生 Vue 系统页由宿主提供真实运行实例，不要求伪造工具三文件，也不允许包装整页 Vue 冒充配置迁移。
- **先策划数据，再编页面**：业务语义与输入输出 → DataTable → 查 ClassModel 目录、概要、模型／属性／动作指南 → 选标准组件与命名视图 → 显式级联 → 验证实际消费。此顺序适用于手写 Vue/TS 和 AI 生成配置。按组件合同使用 `dataViewKey`、`dataMember`、`dataField`；表格、表单、详情用标准字段子组件，不另造页面列模型或手传候选数组。缺通用能力先扩展标准组件并验证，不在业务页拼底层控件、复制状态机或为假想需求造框架。
- 迁移按**梳理完整语义 → 用本仓底座恢复 → 与原页逐项补齐细节**交付。保留蓝图 URL、导航 ID、`PageScope`、`dataSpaceId`、`identityHost`、隐藏伴随页和原入口文件。参考仓 `apps/appworks/src/ui/` 下的相对目录原样落在 `src/views/`；既有入驻、申请／审核、应用与功能管理、数据空间、维度及 `src/views/app/AppList.vue` 均不搬迁。不改后端 URL 迁就新目录，不用原路径空壳转发到另一套业务实现。
- 资源专题按**原理 → 方案设计 → 数据维护**组织。设计页与业务数据页有独立入口和提交范围；设计器本身也消费元数据 DataView。数据空间设计器只接受目录宿主传入的一个目标空间 ID，不用它替换元数据场景身份；尚无业务视图的正式空间也须能设计。验收要证明新实例实际消费了保存后的设计，而非仅证明设计页可以保存。

## 7. 五个治理观察面（目标要求，不是五级权限树）

不新增五类前端角色、统一权限表或新的 `PageScope`；现有页面作用域是 `public / platform / enterprise / app`。治理关系回答“管理或使用什么”，不替代“当前这个人能做什么”。

1. **平台应用管理委派**：每个平台应用初始委派给**领码科技**，是该治理方案的**强制部署前置条件**。部署／服务责任方依据部署身份、完整的正式平台应用清单和领码稳定租户 ID，一次性建立委派并逐应用独立回读。重跑不重复、不覆盖、不复活；身份不唯一、已有不同委派、已解除或结果未知即停。前端不能在登录、开页、空查询时补写。后续建立、转移、解除只有一个正式维护入口；委派不转移所有权、发布者，不授予使用、模块、默认应用、数据共享或个人权限。
2. **应用使用授权与跨企业申请**：管理委派与使用授权互不推出；使用、模块授权、初始化及撤销也分别核验。直授或申请／审批必须定位正式关系。跨企业用例由申请方与审核方以独立会话按同一正式请求键回读；审核须核当前状态、所属企业、请求类型、个人权限及服务端条件提交。拒绝后申请方重开应读到本笔决定与允许读取的原因；不能用“最新一条”配对。可使用的终态以租户目录、个人业务导航和正式数据查询共同证明。
3. **企业内部管理与受托平台管理**：每家企业都必须有内部事务管理能力，但不是每个员工都可管理。受托域要求**该应用的有效委派 ∩ 当前人的正式入口**。两域可共用工作区壳，不能共用名单、执行域、DataView、写入或回读。验收同租户不同人以及仅内部、仅受托、两者都有、两者皆无；领码成员无个人许可同样不得放行。企业跨应用目录是发现，不是共享：消费应用只存正式引用，服务端限制资源、视图、行、字段和动作，不复制生产数据、不借生产应用请求头；撤销要在已开实例下次访问及新实例验证。企业公共与应用私有维度须证实归属，保留原绑定、规则、台账，不按同名合并或猜测重挂。
4. **应用设计**：以目标应用的正式身份、项目蓝图、功能、数据空间及其引用组织设计。设计入口和发布者身份不授予业务数据权；不把应用私有资源、整场景或设计权限升格到企业或平台。
5. **页面交付**：页面是应用设计的子域，复用 `PageTool`、`ScenarioViewConfig` 与 `PageRuntime`。导航决定入口、发布证明决定可装载版本、本次查询决定数据能力；三者缺一不能用另一个替代。

**现状与范围**：系统菜单当前由本地登记投影，平台菜单可随有效登录启用，这不是已经实现了个人平台管理授权。申请、我的申请、审核三个场景绑定不同正式模型；共享内存表的夹具不能证明线上键映射或双租户并发。以[治理研读](notes/research-five-layer-governance.md)定位证据，以[治理方案](notes/plan-five-layer-governance.md)核对前置条件与审批状态。旧任务的“暂缓新增数据权限接入”不是全仓禁令；既有守卫始终保留，新治理工作只按明确批准的范围开展。草案既不授权开工，也不证明部署委派已完成。

## 8. 修改工作流

下列流程适用于生产代码、测试代码和结构性配置修改。纯查询、文档研读或仅运行获准的已有检查，不触发实施流程。

1. **研读并复述**：完整读目标源码，反查调用者、配置、测试及下游包。向用户复述业务、数据流、约束、影响面；确认后记录 `notes/research-<task-slug>.md`。
2. **提问并评估充分性**：按简单／中等／复杂分别提 3–5／5–8／8–10 个有依据的问题，每题至少五个选项，一问一答，不为凑数编造歧义。覆盖范围、合同、异常、兼容和验收；有影响实现的不确定项就继续核实。
3. **计划与批准**：用具体英文 kebab-case 主题写 `notes/plan-<task-slug>.md`，首行 `状态：draft`。列阶段业务输入输出、前置与下游、逐文件改动、兼容、风险、定向及整体验证。用户明确批准后改为 `approved`，开工时改 `implementing`。范围或前提改变先停、修订再审；受阻标 `blocked`，被替代标 `superseded`。
4. **实施与验收**：记录分支、工作树和改前类型基线，每次改文件前重读当前版本。按一个完整业务阶段成组修改，尽早做定向验证，阶段结束回归实际影响面；不逐控件立项，不混入无关修复。交付证据要串起**谁在何域 → 哪次正式查询 → 改了哪个对象 → 回执确认什么 → 谁独立重开消费 → 失败如何恢复**。分别报告源码、夹具、实服证据和未验证项。
5. **收尾与交接**：验证通过后将复杂度、耗时、返工、审查轮次、人工干预、知识沉淀及待回填的 30 天存活字段记入 [AI 度量台账](notes/ai-code-metrics.md)；可复用规则逐条经用户确认后进入知识库，按规程删除已完成计划。数据空间退役／收敛工作在结束或压缩前更新[唯一实施台账](notes/data-space-retirement-ledger.md)，不沿撤回方案自动续做、不另起总计划。获准委派时只交接持久研读、方案、范围、约束与验证证据，不传完整聊天；预计上下文超过 40% 时按通用规程压缩。

## 9. 代码门禁与验证命令

- 按领域、生命周期和消费者组织代码与测试，不按文件数搬目录。class 用“领域路径＋职责”命名，继承只表达 is-a；配对的 `.props.ts`／`.vue` 归同一组件子目录。Vue 使用 Composition API。禁止非 allowlist 的 `interface`、机械 `Ixxx/XxxInterface/XxxImpl`、TS `namespace`、非 `as const` 的类型断言及尖括号断言。
- 函数／方法最多三个位置参数，更多改具名 options／command；参数属性构造器最多四个。对象参数和深层泛型提取具名类型，不在参数列表嵌 JSDoc。首次声明说明真实合同、约束和风险；无效配置或缺失能力显式失败。
- 跨包只从声明的公共包入口导入；禁跨包相对路径、深导入、`export *`、无消费者的薄别名／转发。`spark-ai` 只公开 `.`、`./agent`、`./class-model`。改公共面同步包 `exports`、TS paths、Vite/Vitest alias 和 import smoke test；声明 workspace 依赖，共享第三方版本用 `pnpm-workspace.yaml` 的 catalog。不得放宽门禁基线掩盖新增违规。
- ClassModel 以源码声明及 JSDoc 为真源。公共模型、组件成员或文档声明变更后正式生成，直接核对 manifest、相关 shard/schema 与消费者；仅 typecheck 或校验旧 bundle 不算刷新。**不手改 `generated/`，不手写第二份目录或服务台账。**

在主仓使用根 `package.json` 指定的 Node 与 pnpm。实施前先跑 `pnpm run typecheck`；阶段验收的标准命令如下（`verify` 包含 typecheck、lint、`verify:rules`，**不含全量测试**）：

```powershell
pnpm run verify
pnpm run test:run
```

- 定位页面／架构问题：`pnpm run verify:pages-config`、`pnpm run verify:page-design`、`pnpm run verify:page-thin`、`pnpm run verify:ai-codegen`、`pnpm run verify:arch`。完整门禁为 `pnpm run verify:rules`。
- 定向测试用 `pnpm exec vitest run <实际测试路径>`；根配置未收集的用例在所属包运行。公共包变更补 `pnpm --filter @spark-appworks/<包名> run typecheck` 和 `run test:run`，覆盖受影响消费者；全仓含包测试用 `pnpm run test:all`。
- ClassModel 变更：`pnpm run generate:class-model-surface` 后跑 `pnpm run verify:class-model`。构建验收用 `pnpm run build`，发布产物门禁用 `pnpm run verify:dist`。报告实际命令、退出结果和阻塞；未运行、未收集、前置门禁提前失败都不是通过。

## 10. 按任务阅读

- **系统结构、跨包或依赖**：[系统架构](docs/architecture/system-architecture.md)、[包索引](packages/README.md)、[跨包知识](knowledge/monorepo-dependencies.md)，再读涉及包的 manifest、公共入口和消费者。
- **数据空间、资源或保存**：[数据链路主合同](docs/architecture/DATAFLOW_ARCHITECTURE.md)、[资源专题模板](docs/guides/resource-topic-template.md)、[服务合同台账说明](backend-api-contracts/README.md)；先读 DataTable 的 `resource/model/api/crudConfig`，再沿 assembler 的 owner 装配、DataView 执行和回执追到下游。
- **权限、治理、导航或切域**：[权限合同](docs/architecture/PERMISSION_SYSTEM.md)、[平台与应用路由](docs/architecture/platform-application-routing.md)，再核上述治理研读／方案、实际登记、宿主守卫及原查询上下文。
- **页面、组件或发布**：[页面配置架构](docs/architecture/SPARK_PAGE_CONFIG_ARCHITECTURE.md)、[项目模型层次](packages/spark-project-model/src/MODEL-HIERARCHY.md)、[页面设计知识](knowledge/page-design.md)、[Vue 知识](knowledge/vue-frontend.md)；核原入口、标准组件合同及新实例消费。
- **AI、Workflow 或 ClassModel**：[Workflow 设计合同](packages/spark-ai/docs/business-factory-workflow-zh-cn.md)、[ClassModel 知识](knowledge/class-model-system.md)，再读实际模型声明、workflow 发布定义与宿主 binding。**验证与收尾**读[测试知识](knowledge/testing.md)、[度量规则](knowledge/ai-metrics.md)。

## 11. 按体系层调用技能

| 体系层或任务类型 | 先使用的技能/动作 | 必须覆盖 |
|---|---|---|
| 入口、权限、导航或执行域异常 | `appworks-debug-problem` → 正式读取链 | 当前登录人、租户/应用 scope、导航节点、正式入口结果、直链与迟到响应 |
| DataTable 配置、owner 装配、DataView 保存或 unknown | `appworks-debug-problem`，实施后 `appworks-verify-change` | DataTable 的 resource/model/api/crudConfig 与模型级 save 约束、assembler 的 owner 绑定、当前人字段权限、回执、按键回读和重复写入风险 |
| 页面、组件或四文件 | `appworks-write-tests` + `appworks-review-change` | PageTool/场景真源、标准组件绑定、独立 PageRuntime、发布 proof 与数据权限分离 |
| 项目蓝图、应用设计或跨应用引用 | `appworks-review-change` | `projectId/nodeId/pageId/scenarioId` 身份、消费者、旧 URL、迁移与跨应用作用域 |
| 评审意见或需求变更 | `appworks-receive-review` | 先核实、范围是否超出已批准计划、相互依赖修改是否成组 |
| 阶段出口、交付或“已完成”声明 | `appworks-verify-change` → `appworks-verify-before-claim` | 体系层影响面、批准验证计划、实际输出、未验证项和证据类型 |

技能只承担专项工作，不改变系统体系：诊断不授权修复，验证不授权修改，审查不授权实施，测试技能不决定是否新增测试。所有技能冲突时先服从根规约，再服从已批准计划和正式产品合同。

## 12. 何时必须停止

方案未批准、工作树冲突、控制路径与方案不符、需要计划外文件／依赖／公共 API、或验证推翻方案前提时，停止写入并报告。**缺服务合同就停在合同边界**：列出缺失事实、受阻操作、已取得的脱敏证据、需哪一责任方提供什么、恢复实施要怎样验证。不猜 ID、端点、默认值、权限或事务，不用本地角色、全量拉取后过滤、重复业务写入或第二写入口绕过。

尤其不得在以下条件未满足时上线相应治理能力：部署初始委派未逐应用回读；无当前人的无应用目录入口合同；跨场景无正式请求键、精确回读或服务端并发决定合同；跨应用共享缺范围、运行强制或撤销合同；维度归属、版本或引用不可判定。此时可继续无写入研读，不能以 UI 已出现或测试已通过宣称业务完成。
