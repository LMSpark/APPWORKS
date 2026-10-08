# sparkproject AppWorks 完整集成研读

状态：2026-10-07 用户纠偏，业务页面须由参考 Vue 转成本仓四文件配置。原生 Vue 集成总计划与 D1d 生命周期计划已 superseded，实施停止。最新方向以 notes/research-appworks-four-file-integration.md 与 notes/plan-appworks-four-file-integration.md 为准。以下历史研读及已验收记录只保留其当时范围，不能证明四文件迁移完成。

## 已确认目标

- 2026-10-07，用户要求研究完整集成 `sparkproject` 中 AppWorks 的方案。
- 用户确认：**以当前 `D:/SPARK_AppWorks` 底座为主，补齐参考仓全部能力**。
- 第 1/8 题已确认 A：**功能与操作完整等价，界面统一使用当前仓组件和交互**。参考页面的布局、组件实现及源码原样保留不属于既定验收要求；不能因界面重组遗漏业务操作、权限约束或失败处理。
- 第 2/8 题已确认 A：**固定参考提交 `842dec4f11b333df904b9a4e26b6566b0802bab8`，未提交改动单独评估**。后续参考源码以该提交的 Git 对象为准；工作树新增或修改内容不自动进入集成范围。
- 第 3/8 题已确认 A：**只做前端集成，复用现有后端接口和存储结构；后端缺口明确列出**。本方案不包含 Java、后端接口或数据库结构变更。前端缺少接线不能直接认定为后端缺口，须核对固定参考提交的实际调用链与现有接口；业务配置记录经既有接口读写仍须按具体功能与验收范围确定。
- 第 4/8 题已确认 A：**保留既有蓝图节点、页面地址和参数，由本仓新界面承接**。页面重组不能擅自改写正式导航身份或参数语义；具体承接方式仍须核对授权菜单、路由实例和真实调用方。
- 第 5/8 题已确认 A：**优先现有组件，能力不足时引入必要引擎，统一封装并按需加载**。具体引擎及版本须在方案中列明使用者、替代成本、资源与授权条件、加载方式及验证动作；不据此整包引入参考依赖或立即安装依赖。
- 第 6/8 题已确认 A：**先实现完整人工操作，保留现有 AI，本轮不扩展 AI 范围**。新增治理模块不自动增加 AI 工具、workflow binding 或可写入口；现有 pageDesign / projectPlanning 及其依赖合同仍需在受影响时回归。
- 第 7/8 题已确认 A：**工程检查通过，并在测试租户逐模块验证浏览器操作、权限及保存回读**。验收须区分本地测试、真实浏览器与正式后端回读；没有真实证据的能力保持未验收。具体测试对象、操作、数据清理及权限拒绝场景写入对应实施方案，不以此确认代替尚未开展的验证。
- 第 8/8 题已确认 A：**按依赖与风险排序，先补共同接缝，再逐模块完成独立验收闭环**。排序不缩减最终功能范围，不并行推进多个无关代码改动。
- 参考仓定位为 `E:/r/sparkproject`，不是另一个同名目录。
- 本轮仅研读、运行既有检查并记录证据；未修改生产代码、测试、配置或后端数据，未提交、推送或建分支。
- 此文件属于研读记录，产品事实须回到下列源码复核；现有研究记录仅用于定位，不代替当前代码。

## 版本与并发边界

| 对象 | 本轮基线 |
| --- | --- |
| 当前仓 HEAD | `9c225cad78ddca2ac9e80fdb00782d90f3391590` |
| 当前仓分支 | `feat/agent-workflow-node-contract` |
| 当前仓初始工作树 | clean |
| 参考仓 HEAD | `842dec4f11b333df904b9a4e26b6566b0802bab8` |
| 参考仓分支 | `codex/correct-single-web-20260917` |
| 参考仓工作树 | 存在未提交的公共 UI、权限上下文、admin-grid 与测试改动；本轮不写入 |
| 参考 AppWorks 自身 | `git diff --name-only -- apps/appworks` 无输出；其公共依赖仍有工作树差异 |

第 2 题已固定上述参考提交。后续通过 `git show <固定提交>:<路径>` 等只读方式取证，保留源仓并发工作。此前参考测试使用当时工作树，不能改称为固定提交的干净检出验证；受未提交依赖影响的证据须单独复核。第 1 题答复后再次只读核验，参考 HEAD 未变，上述公共 UI 未提交改动仍存在。

第 4 题答复后，当前仓另出现 `notes/research-architecture-overview.md` 未提交修改；归属未认定为本任务，本任务保留其原状，仅维护本研读文件。

## 盘点口径

按参考 `apps/appworks/src` 实际文件统计：297 个 `.ts/.tsx/.vue` 文件（包含声明文件），其中 116 个 Vue 文件。Vue 文件含页面、面板和辅助组件，不能称为 116 项功能。

参考包 `apps/appworks/package.json` 声明 17 个 `@spark-template/*` 直接依赖；沿各包 `dependencies + peerDependencies` 得到 23 个 workspace 包的依赖闭包。这是 manifest 层统计，不是最终打包体积，也不是必须全部迁入的清单。

静态 import 扫描中：122 个源文件引用 `@spark-template/ui`，116 个引用 `@spark-template/spark-api`，53 个引用 `@spark-template/vue-runtime`，23 个引用 `@spark-template/graph-ui`。说明其宿主、API 和公共 UI 依赖是实际调用关系。

当前 `config/navigation/vue-pages.json` 有 21 个路由声明，对应 16 个不同 Vue 文件。其中存在多个地址指向同一页面，不能把路由声明数量当功能完成数。

本轮完成结构盘点与关键接缝研读，**未逐一完整阅读上述 297 个文件，也未宣称所有模块均已完成可行性验证**。文件级实施范围确定后，仍须完整阅读对应文件、调用方和测试。

## 当前已核对的调用链

### 参考仓

```text
根 createSparkRuntime
  → 全局唯一 runtime + Vue runtime 绑定
  → 授权菜单与当前页面上下文
  → AppWorks Vue 页面选择 scenarioId / designTarget
  → AppWorks 领域 class
  → runtime.api.query / save / files / 其他已登记能力
```

事实入口：

- `E:/r/sparkproject/apps/appworks/package.json`：这是根主应用挂载的包，没有独立 dev/build 脚本。
- `E:/r/sparkproject/packages/data/spark-api/src/runtime/create-spark-runtime.ts:103`：根 runtime 包含 api、authentication、session、menu、realtime、llm、execution 等合同。
- 同文件 `requireRootSparkRuntime`：无根实例时显式抛错。
- `E:/r/sparkproject/packages/ui/runtime/vue/src/root-runtime.ts`：Vue 根 runtime 只允许绑定一个实例。
- `E:/r/sparkproject/packages/ui/runtime/vue/src/delivered-page-context.ts`：页面从当前授权路由投影捕获 nodeId / scenarioId；必要场景缺失时失败。
- `E:/r/sparkproject/apps/appworks/src/ui/app/navigation-host.ts`：入口动作经授权导航解析，并使用明确宿主参数；多宿主不自动猜选。
- `E:/r/sparkproject/apps/appworks/src/ui/app/design-target.ts`：设计目标取自实际应用记录与宿主输入，校验 applicationId，不以名称推断。
- `E:/r/sparkproject/apps/appworks/src/data/api/ApplicationFunMan/project-blueprint-owner.ts`：蓝图 owner 持有管理 scenarioId、目标 applicationId 与 assertCurrent，查询保存经过根 SPARK API。

参考 `docs/appworks-layer-model.md` 区分平台、租户、应用控制面，并明确控制面执行应用与 designTarget 不同。该合同用于解释参考机制，不自动替换当前仓产品合同。

### 当前仓

```text
src/main.ts / SparkApp.start
  → src/lowcode/lowcode-runtime.ts
  → LowcodeApi（会话、当前应用、请求 scope、蓝图、文件等）
  → DataSpaceRuntimeApi（私有查询上下文及统一保存）
  → 正式模型 + 场景视图文件装配 DataSet / DataView
  → PageRuntime / SparkPageRenderer
```

事实入口：

- `packages/spark-lowcode-api/src/lowcode-api.ts:31`：当前统一 API 组合根；`readRequestScope` 来自实际登录和当前选中应用，带身份代次。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts:48`：query 返回本 owner 的 DataSpaceQueryContext。
- 同文件 `save`：检查原查询归属、请求 scope 和同模型写入队列。
- `src/lowcode/data-space/lowcode-data-space-runtime.ts`：从正式模型与关系读取，再装配场景视图。
- `src/lowcode/data-space/lowcode-data-space-assembler.ts`：按 modelBinding 匹配正式模型，给每个 DataView 绑定同一个运行 owner。
- `packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-api.ts`：已有 Base_NavigationInfo 蓝图 query/save 集成，不能按未迁入重新实现。
- `src/lowcode/lowcode-runtime.ts:271`：蓝图记录与后端授权证据装配导航，并合并宿主工具入口。
- `src/registries/vue-page-registry.ts`：本仓 Vue 系统页绑定 `src/views` 的 glob 与显式配置。

两仓 API 的查询上下文、宿主上下文和 UI 合同不相同，不能通过替换包名前缀证明互通；也不能把两个根实例同时启动作为已满足“以当前底座为主”。

## 功能覆盖差异

下表的“参考能力”表示源码中存在相应模块，不代表已经在真实后端全量验收。

| 领域 | 参考源码范围 | 当前仓已见能力及缺口 |
| --- | --- | --- |
| 应用与项目蓝图 | `ui/features/application`、`data/api/ApplicationFunMan` | 已有应用目录、蓝图编辑、三文件编辑与发布引用；应用授权申请、导航宿主、目标应用隔离等需逐操作对照 |
| 正式数据空间设计 | `ui/features/data-platform/data-set-management`、`data/api/data-set/design` | 已有正式模型读取、DataSet 装配和场景视图文件编辑；不能据此认定已具备参考模型、字段、关系设计器 |
| 数据库与资源治理 | `ui/features/data-platform/database-management` | DBMS 已读真实目录；新增服务器、库、表、关系等处理函数当前调用 reportGovernanceBlocked |
| 组织、岗位、人员 | `ui/features/organization`、`data/api/organization` | 当前路由目录未见对应工作台；参考当前共享列表与 owner 主要提供查询，不能扩写为已证实的完整组织 CRUD |
| 角色、授权、脱敏 | `ui/features/governance`、`data/api/SafetyProtectionManager` | 已有查询结果权限消费；PermissionDesignApi 目前 read / prepareMutation，不执行设计写入，治理编辑尚不能据此视为接通 |
| 字典、编码、逻辑视图、维度 | `ui/features/data-platform/structured-config` | 当前系统页目录未见等价工作台；涉及 dictionary、businessCode、logicalViews、dimension 等额外 API 成员 |
| 业务流程 | `ui/features/workflow`、`data/api/FlowManage` | 参考含流程模型、设计、运行与明细；当前 Agent workflow 不能作为等价实现 |
| 数据工作流 | `ui/features/data-platform/structured-config/workflow-definition` | 参考有独立图设计和来源选择；需与业务流程、Agent workflow 分别盘点 |
| 报表 | `ui/features/integration/report`、`ui/views/ReportManage`、`runtime/report.ts` | 当前路由目录未见报表工作台；参考依赖 ReportHost / Stimulsoft loader、模板读写回读和执行域校验 |
| 文件、JSON、Excel、接口 | `ui/views/FileDataManager`、`ui/features/data-platform/semi-structured`、`ui/features/integration/api-management` | 当前文件 API 可作局部基础，但管理页面、结构编辑、导入配置和注册接口调用需分别核对 |
| 系统支持 | `ui/features/system` | 当前有缓存管理；流程监控、数据恢复和问题管理未见对应系统页注册 |
| 当前 AI 与页面能力 | 当前 `spark-ai`、`spark-project-model`、`DevSystem` | 保留当前底座；第 6 题已决定不增加 AI 工具及治理写入暴露，仅回归现有能力 |

## 已证实的重要区别

1. **场景视图与正式模型设计不同。** `src/views/app/dev-system/DevDataSetDesigner.vue` 编辑 `pagedata.json`，明确不在该文件重定义正式模型字段。参考 `AppWorksDataSpaceDesign` 另有模型/字段/关系读写和设计布局处理。
2. **业务流程、数据工作流、AI workflow 不是一个对象。** 当前 `src/services/workflow-designs.ts` 管理 `agent.workflow.design`，开头明确只处理编辑态设计稿；不能因页面均称“工作流”就判定重复。
3. **准备命令不等于写入。** 当前 DataSpaceDesignApi 与 PermissionDesignApi 都有 prepareMutation；本轮定位到的实现只生成命令。`src` 对数据空间设计入口的直接消费主要是 readModel/readModels/readRelations。
4. **数据库治理有显式未接通入口。** DBMS 的 submitCreateServer、submitCreateDatabase、submitCreateTable、submitCreateRelation 等调用 reportGovernanceBlocked。保留按钮外观不能算完整集成。
5. **管理目标与运行应用须单独核验。** 参考 owner 的 applicationId 用作业务记录过滤，根 execution 负责实际请求域；当前 LowcodeApi 的 scope 来自当前选中应用。后续必须逐项核对读写与切换失效，不能混成一个 ID。
6. **授权与运行实例不只在 API 层。** 参考 53 个文件直接引用 Vue runtime；UI 还消费 SparkResourceQueryContext、导航结果、人员选择和公共表单合同，不能只桥接 HTTP。
7. **源仓并非当前严格门禁的直接可复制代码。** 参考 AppWorks tsconfig 设 strict:false / noImplicitAny:false；当前 typecheck 使用 strict、exactOptionalPropertyTypes、noUncheckedIndexedAccess 等。实施估算应包含真实类型和公开面收束成本，不能预先降低当前门禁。
8. **重型资源不是页面源码。** 参考 report runtime 使用 `Report/` 静态脚本路径及配置的 Stimulsoft license；graph-ui 引入 LogicFlow/TinyFlow。资源存在性、当前授权、构建加载和运行行为本轮未验证。
9. **页面地址与界面实现可分别演进。** 当前 `config/navigation/vue-pages.json` 已将部分参考风格路径绑定到本仓 AppList、DBMS、CacheManager；`runtimeTargetProjection` 将蓝图 `vue:` 目标转换为本仓路由。固定参考提交的 navigation-host 则通过授权导航和宿主参数打开目标。功能界面重做不自动授权改写存量蓝图地址；地址兼容及配置迁移方式须单独确认。当前证据来自源码，未读取真实环境的完整导航集合。

## 初次研读的验证结果（后续补充见文末）

以下均于 2026-10-07 对本轮工作树执行，退出码 0。

| 目录 / 命令 | 结果 | 证据范围 |
| --- | --- | --- |
| 当前仓 `pnpm run typecheck` | 通过 | 当前根类型检查基线，不证明参考页面可直接迁入 |
| 当前仓 `pnpm exec vitest run tests/auth-nav/lowcode-runtime-navigation.test.ts tests/auth-nav/lowcode-data-space-runtime.test.ts tests/auth-nav/data-space/lowcode-scenario-assembly.test.ts --maxWorkers=1 --reporter=dot` | 3 文件，43 项通过 | 当前导航、DataView 查询与正式场景装配定向测试 |
| 当前 `packages/spark-lowcode-api`：`pnpm exec vitest run src/platform/project-blueprint/project-blueprint-api.test.ts src/platform/data-space/design/data-space-design-api.test.ts src/platform/permission/permission-api.test.ts --maxWorkers=1 --reporter=dot` | 3 文件，71 项通过 | 当前蓝图、设计读取与权限 API 测试 |
| 参考 `apps/appworks`：`pnpm exec vitest run tests/data/api/project-blueprint.test.ts tests/data/application-isolation.test.ts tests/data/data-space-formal-model.test.ts --pool=threads --maxWorkers=1 --reporter=dot` | 3 文件，13 项通过 | 参考蓝图纯合同、应用隔离和正式模型测试 |

合计当前仓 114 项、参考仓 13 项定向测试通过。测试使用局部/mock 合同，不证明跨仓集成、浏览器可用、线上写入或持久化事务。本轮未运行全套 lint/build/test，未安装依赖、未启动第二服务、未登录或修改真实业务数据。

## 下一阶段约束

- 复杂度：复杂，依据为跨应用壳、数据 API、组件、导航、构建与多个领域模块。
- 计划澄清 8 个基于实际差异的问题，遵循一问一答；只解决未定决策，不重问已确认的当前底座方向。
- 第 1 至 8 题均已确认，约束见“已确认目标”。无需重问已决定的八项边界。
- 第 5 题依据：当前 `package.json` / `pnpm-workspace.yaml` 及 `WorkflowDesigns.vue` 实际使用 Vue Flow；固定参考提交的 graph-ui 声明 LogicFlow / TinyFlow，report runtime 使用 Stimulsoft loader。统一界面并未决定是否复用这些底层引擎；引擎替换的功能等价性、资源与授权状态仍未验证。
- 第 6 题依据：当前 `src/services/ai/agent-workflow-bindings.ts` 显式组合 pageDesign / projectPlanning 的编辑对象、ClassModel 知识、prompt 与 gate；`createAppAgentWorkflowRuntimeBindings` 并未把任意新增治理页面自动暴露给 AI。现有 AI 保留与新功能进入 AI 可操作范围属于不同范围决定，不能用“页面已接入”宣称“AI 已可操作”。
- 第 7 题依据：已跑导航测试构造 BlueprintFixtureInput，蓝图 API 测试使用 FixtureHttpClient / BlueprintMutationHttp 等模拟请求。它们证明本地合同，不证明真实身份、权限、浏览器导航或后端保存回读。方案须明确工程检查之外的证据标准；目前没有跨仓集成的真实运行验收结论。
- 第 8 题依据：固定参考提交的 FlowDesign 同时消费流程、正式模型字段、组织岗位、角色和授权记录；ReportComp 消费报表与正式模型、字段、关系及模板文件。模块存在真实依赖，业务优先级会影响补齐接缝和先行验收的顺序；不能按菜单顺序机械复制，也不并行推进多个无关代码闭环。
- 总体方案位于 `notes/plan-sparkproject-appworks-integration.md`，状态 draft。完整范围的架构研究与每个模块的开工级逐文件研读分开记录；不能据总体方案跳过后者。
- 用户审核方案前不修改代码。实际实施前还需重读目标文件和依赖、核对并发状态，并先跑规定的类型基线。

## 第 8 题之后补充核验

1. `packages/spark-app/src/router/dynamic.ts:548-675`：系统页注册按剥去 query/hash 的路径去重；系统页 meta 有 pageId，但未像配置页一样记录 nodeId/tool。`packages/spark-app/src/navigation/useNavigation.ts:494-613` 按路径查第一个系统路由，菜单点击也走此分支。`useTabPages.ts:34-46` 的非配置页标签 id 是 route.path。三者共同构成多菜单复用系统页时的身份丢失风险；不能只给页面增加一个 scenarioId prop 就宣布解决。
2. `src/registries/vue-page-registry.ts:83-93` 的 buildComponentMap 在启动时 Promise.all 调用所有 entry.load。glob 本身是动态导入，并不证明当前整体按需加载。基础闭环先改此处的装配时机，再验证重型模块不进入首屏请求。
3. `packages/spark-lowcode-api/src/design/lowcode-design-api.ts` 已支持文件字节、文本、目录、历史和删除；`lowcode-design-file-upload.ts` 支持工作文本/版本上传及回读。它们不是参考 files 的完整等价物：二进制上传、转换、Excel、场景文件命名空间仍需逐项适配。
4. 固定参考提交的 `packages/data/spark-api/src/public/builtin-capabilities.ts`、`business-code/runtime-api.ts`、`registered-interfaces/runtime-api.ts`、`resource-registration/runtime-api.ts`、`logical-views/runtime-api.ts`、`json-documents/runtime-api.ts` 说明 `spark.*` 名称是前端能力登记名，不等于普通后端模型。不能把 `spark.api-call` 等直接传给当前只处理模型的运行查询器。
5. 专用端点来源是固定参考提交 `packages/data/spark-api/src/kernel/endpoints.ts` 和 `protocol/executor.ts`。已定位逻辑视图、JSON、登记接口、表/视图注册、元数据同步、业务编码、文件与 Excel 接口。这里只证明参考前端的调用合同，不证明目标部署接口在线、权限配置齐全或写入成功。
6. 参考 `dimension/runtime-api.ts` 为 2272 行，含来源合同、账本、当前投影与执行域检查；本轮只定位调用链与关键方法，未完整研读。维度定义页面迁入不得自动等于来源提交链已经迁入。它是后续独立高风险批次。
7. 参考 `ui/views/appworks/field/index.vue`、`appworks/table/index.vue`、`schema/relation/index.vue`、`system/menu/index.vue`、`system/role/index.vue`、`system/user/index.vue` 是“功能开发中”占位页；`schema/design/index.vue` 是图编辑演示，保存只输出当前组件图数据。不得将这些计为后端治理能力。其存量地址仍需纳入路由清单，按本地正式模块承接或明确显示状态。
8. 参考 graph 包 manifest 包含 `@logicflow/core ^2.2.4` 与 `@tinyflow-ai/vue ^1.3.6`；AppWorks 的 SchemaGraph 直接消费 LogicFlow，静态检索未发现 AppWorks 直接使用 TinyFlow。不能仅因包依赖存在就把 TinyFlow 列为必迁引擎。Stimulsoft 的资产和 license 仍未验证。
9. 本轮后段发现当前仓新增并发修改：`packages/spark-ai/src/agent/workflow/agent-workflow-runtime.ts`、`packages/spark-ai/src/tests/agent-workflow-definition.test.ts`、`src/services/ai/agent-workflow-bindings.ts`，以及两份 workflow 研究/计划文件。全部保留。本文件中的既有 typecheck/测试结果属于运行时刻的基线，不能自动覆盖这些后续改动。

## 研读充分性与实施边界

八个用户决策已足以形成完整范围、目标架构、迁入顺序和验收方案。尚未完成的技术核验作为明确任务和门禁列入计划，不伪装成已知事实：真实导航/参数全集、源页面逐按钮清单、专用端点目标部署行为、图数据无损往返、维度提交链、报表资产与运行授权。

这些核验不需要再次向用户提出泛泛选择题；可以继续只读和受控验证。若后续证明需要改后端、改存量业务协议或扩展 AI，才构成已确认前提变化，届时修订方案。完整集成只有在操作清单全部有真实验收证据后才能称为完成。

## 计划落盘后的可行性验证补充

本节由用户“计划先落盘，并逐项验证可行性，迭代优化，直到零回归”推动。用户随后提供测试登录，已在当前本地宿主登录领码科技；不记录密码或 token。详细操作、日志和局限集中见 [验证账本](./validation-sparkproject-appworks-integration.md)。本次没有修改生产/测试/配置代码，也未执行后端业务写入。

1. **工程基线扩展**：typecheck、lint、8 项架构/API 门禁退出码均为 0；根测试 180 文件 / 2079 项、包级测试 113 文件 / 1690 项通过。page-design 7 文件 / 64 项和 project-planning 5 文件 / 21 项离线检查也通过。重叠测试不累计为唯一覆盖数量。
2. **生产构建揭示第二条加载链**：直接 Vite 构建成功，但 Settings.vue 被 `virtual:spark-components` 静态导入。已完整阅读 `tools/vite-plugin-spark-components.ts`、`scan-config.ts`：根配置扫描 views，策略先同步名单、再异步名单、再文件大小，默认同步。`packages/spark-app/src/start.ts` 启动导入虚拟模块。先前只改注册表两文件即可完成懒加载的判断不充分，已在计划拆为 C1a/C1b。当前 pages-config 产物 1433.38 kB（gzip 424.74 kB）是基线，非优化结果。
3. **真实导航验证**：测试应用“元数据管理”返回 51 节点、39 个目标、32 个不同路径。7 组路径复用；其中导航权限两个节点同路径同场景但 nodeId 不同。文件管理场景为空。当前映射只有 5 路径 / 6 节点，其余 27 路径 / 33 节点缺失；数据空间管理在浏览器明确报 system-page mapping error。此证据将身份冲突从源码风险提升为实际必须处理的问题。
4. **真实读取可行**：应用目录 80 行；DBMS 渲染 4 个连接并明确只读。使用真实授权场景和当前模型 wire，Base_DataSet 返回 200、总数 68 / 首批 5 行，_Base_DictType 返回 200、总数 4 / 4 行；按当前目标应用过滤。不读取整库或保存业务行到证据，不据此声称写入或权限验收通过。
5. **第三类服务合同**：固定源 `application/metadata-service-catalog.generated.ts` 有 17 个 application.documentation/lifecycle、designer.code/execution、workflow.runtime 的 resource/intent 路由，已保存并补入计划。它们既非普通模型，也不能由 spark.* 内建能力列表代替。未用 GET 名称推断初始化无副作用，未调用初始化/流程执行接口试探。
6. **源操作索引**：固定 Git 对象生成 297 文件哈希/导入索引；54 个 owner 文件、59 类、524 个非 private/# 方法。这只是静态入口索引，尚未等同逐按钮完整研读。计划已补原型版本、桌面配置、布局重建确认、工作流测试、报表版本激活、流程退回和撤销恢复等易漏操作。
7. **报表资产存在性已核实**：固定提交 `packages/ui/optional/report/assets/Report` 有 73 个资产。`stimulsoft/runtime.ts` 明确 reports→dashboards/viewer→设计态 designer 的加载次序，失败会释放 Promise 以允许重试；vite-plugin 以包内目录为资产源。当前宿主的部署路径、运行授权、旧模板兼容及未保存保护仍须独立验证，不能把静态资产存在说成报表已可用。
8. **并发与取证边界**：验证期间其他任务还修改了 sandbox、page-design binding、知识文件、生成产物，并删除一个生成脚本；本任务全部保留。`working-tree-snapshot.json` 是验证后观察的哈希，不追溯代表每次测试时刻。最终交付必须固定整合状态重新验证受影响项，不能在持续变动工作树上宣称永久零回归。

以上是旧基线的阶段结论；最新计划与下一步以以下重新研读为准。

## 最新代码重新研读：0b6c85d

用户要求按最新代码重写计划并逐项验证。原八项决定继续有效。本次先比较固定源和目标 Git 差异，再读取当前调用链，没有重问已经确认的范围。新执行候选见 [替代计划](./plan-appworks-control-plane-integration.md)，旧计划已标 superseded。

### 核心事实和影响面

1. 目标 HEAD 为 `0b6c85d9979205cf733da8b0ba663c63e89ec395`；相对旧 HEAD 的提交修改 1029 个文件，其中包含大量移动和生成文件。不能把此数当本任务修改数。参考仍固定 `842dec4f11b333df904b9a4e26b6566b0802bab8`，其未提交共享 UI 改动不迁入。
2. 当前 `packages/spark-app/src/router/page-runtime-pool.ts` 只服务 config-page，键包含 projectId/nodeId/tool.pageId/规范 query/hash，承担三文件读取、正式场景、配置刷新和销毁。DynamicRouter 通过 readPageFile/loadScenario 注入，不再采用旧 PageContentLoader 路由选项。**PageContentLoader 仍存在于 project-model/io 且由 ProjectWorkspace 使用，不能误写成整个类已删除。**
3. 系统页注册仍按去 query/hash 的 path 去重且缺节点独立 meta；useNavigation 按路径选路由；useTabPages 的非配置页 id 为 route.path。当前 `src/App.vue` 非配置页 keep-alive 用 route.fullPath。这四处身份必须一致，不能以新增配置页实例池判断系统页问题已解决。
4. `src/lowcode/data-space/lowcode-data-space-runtime.ts` 的正式场景入口核对 scope 的 X-AppId，读取真实 scenarioViews 文件，缺文件显式失败，装配正式模型/关系后再次校验 scope，迟到结果会销毁。集成不得用空配置兜底绕过这些检查。
5. `src/services/page-design/page-design-operation-guard.ts` 限制 editor 对象可调用的操作，原始 editor 仍用于 save/gates。新控制面不扩此 AI 边界。WorkflowDesigns 的图状态/节点交互已抽为子目录，其领域仍是 Agent workflow。
6. Vue registry 测试迁入 `tests/app/config/`；正式导航/装配测试迁入 `tests/runtime/auth-nav/`。旧 `tests/auth-nav/` 中两个同名文件仍存在并纳入根 Vitest；本任务不顺手去重。完整 typecheck、根测试和包测试均通过，不能以文件名重复臆断测试失败。
7. 新目录检查进入 verify:rules，baseline 是空对象。src/components 当前 4 源文件/0 子目录，views/app 7/2，lowcode-api/src 1/6，tests/runtime/auth-nav 9/1。新 UI 改为 app/control，API control 占第七目录；C2 新测试应放专属子目录。
8. 注册表 buildComponentMap 仍在启动 Promise.all 执行所有 loader；编译扫描又静态导入 Settings。本次完整 build 重现两条加载链。全局 error handler 主要记录日志；ErrorFallback 文案是应用启动失败，不能直接证明异步页面错误已有合适呈现。新 C1a 增加 PageLoadError，精确范围从历史两文件改为三文件。
9. 参考 17 条服务的 HTTP 方法和规范路径与当前后端端点账本逐条唯一匹配。最新 `verify:lowcode-contracts` 通过（587 endpoints、150 consumers），但该结果不覆盖在线部署、payload 细节和副作用。未调用初始化、生成编码、流程运行或恢复端点试探。

### 当前验证与边界

本轮 typecheck、lint、根测试 186 文件/2112 项、包测试 113 文件/1691 项、完整 build、verify:rules 的 14 个入口，以及 page-design/project-planning/model-convergence 离线检查全部退出 0。工程警告保留：Settings/CodeMirror 动静态加载、第三方注解、大 chunk、AI model 2 warning；不据退出码声称零告警。

本地旧服务未在运行，使用已有 pnpm dev 命令在 127.0.0.1:5273 启动最新宿主。浏览器重新选择正式企业记录后登录成功，应用目录可读；数据空间原 URL 仍显示 SYSTEM PAGE MAPPING ERROR，pageId 为 `90A82E287930A234FEC3E687C94A93EA`。登录表单已有中文显示值不等于其值已是企业 shortName，验收选择实际企业选项；不把一次输入值错误当后端登录不可用。

新证据独立置于 `notes/evidence/sparkproject-appworks-integration/baseline-0b6c85d/`。本次无产品/测试/配置代码变化、无后端业务写入。29 项已逐项检查承接点和待验门槛；未全读的维度链、复杂图/流程/报表和真实权限/保存回读继续标待验，完整集成尚未实施。
