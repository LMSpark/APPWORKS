状态：superseded

2026-10-07 用户纠偏：参考 AppWorks Vue 页面必须转换成本仓四文件配置页面。本文误将业务页面迁移按原生 Vue system-page 路线推进，不再作为后续编码依据。替代计划为 `notes/plan-appworks-four-file-integration.md`。既有验证仅保留各自历史范围，不计作四文件迁移完成；在途 native lifecycle 已停止，代码尚未回撤。

执行授权：用户已要求“用低阶模型实施计划，你负责派工，验收，有效控制消耗，遇到问题按长期利益选择”。据此开始 C1a；控制器负责后续批次研读、范围收敛与验收，不重复询问同一授权。原八项产品边界持续有效。

# AppWorks 控制面完整集成计划

## 任务目标

以当前 SPARK_AppWorks 为唯一底座，补齐固定参考仓 AppWorks 的全部有效人工操作能力，逐项验证并迭代，最终在确定代码、环境和操作范围内达到零新增回归。

本计划替代 `notes/plan-sparkproject-appworks-integration.md`。2026-10-07 按最新代码重新研读、构建、测试及浏览器复核；原八项选择继续有效，不重新提问。C1/C2 宿主及 D1a/b/c 只读目录已逐批主控验收，真实浏览器曾拦下选择失败丢页、排序丢失、用户主键与关联键混淆，均保留拒收和修复证据。D1c最终根191文件/2256项、定向46项、类型/限定lint/生成目录门禁/完整build通过；39个既有文件hash不变，复用API包18/588、宿主包12/80结果。生产确认创建人解析、未解析计数、应用筛选与标签状态，0console error。未签署29项完整能力、受限用户或真实写回。下一闭环详见 `notes/plan-data-space-create-lifecycle.md`：原生表单生命周期与单条新增精确回读。逐批状态和证据见 `notes/evidence/sparkproject-appworks-integration/execution-ledger.md`。

## 基线与已确认边界

| 项目 | 本次基线 / 决定 |
| --- | --- |
| 当前仓 | `D:/SPARK_AppWorks`，HEAD `0b6c85d9979205cf733da8b0ba663c63e89ec395`，分支 `feat/agent-workflow-node-contract` |
| 参考仓 | `E:/r/sparkproject` 固定提交 `842dec4f11b333df904b9a4e26b6566b0802bab8`；参考工作树未提交改动不纳入 |
| UI | 功能、操作完整等价；界面统一当前组件与交互 |
| 后端 | 仅前端集成，复用现有接口和存储；不修改后端实现、数据库结构定义代码或做迁移脚本 |
| 存量资产 | 保留蓝图 nodeId、正式 URL 和原参数语义 |
| 引擎 | 当前能力优先；来源中确有消费者的必要引擎单独封装、按需加载 |
| AI | 保留现有 AI，不新增 AI 工具、治理写入入口或 workflow binding |
| 验收 | 工程检查、测试租户浏览器、权限边界测试、真实保存回读均须有证据；用户最新明确“都用 admin”，在线身份统一admin，不再等待受限账号 |
| 顺序 | 按依赖和风险推进；每轮一个明确问题、一个局部改动面、一个对应验证 |

当前工程基线取证开始与结束时均无 tracked 文件改动，仅有本任务 notes。证据在 `notes/evidence/sparkproject-appworks-integration/baseline-0b6c85d/`。历史取证保留在其父目录，不能与本次结果混用。

## 最新源码对原计划的修正

| 最新事实 | 方案调整 |
| --- | --- |
| DynamicRouter 已将配置页实例管理委托给 `packages/spark-app/src/router/page-runtime-pool.ts` | 复用 PageRuntimePool。系统页不能伪造 PageTool/DataSet 后塞入该池；该池仅接受 config-page |
| 启动注入 `PageFileReader`、正式场景加载函数；启动文件迁入 `packages/spark-app/src/app/start.ts` | 沿用当前注入链。PageContentLoader 在 project-model 中仍存在，但不恢复其旧路由注入方式；不复活已删除的旧 page-cache |
| 系统页路由仍按 path 去重、菜单按 path 选择、标签按 route.path；App.vue 缓存按 route.fullPath | 系统页身份修复必须覆盖注册、导航、标签和渲染四处；将 `src/App.vue` 纳入候选范围 |
| 正式场景 loader 检查执行应用、读取场景文件、装配正式模型，并销毁迟到结果 | 集成必须保留缺配置显式失败、跨应用拒绝、切域失效及销毁；不得添加空 DataSet 兜底 |
| 新增 page-design operation guard，WorkflowDesigns 已拆分子目录 | 继续复用当前 AI 操作边界；业务流程和数据工作流不得混入 Agent workflow |
| 测试大量迁入 tests/app、tests/runtime；旧 tests/auth-nav 中两个同名测试仍存在 | 命令改为当前路径；根测试继续覆盖两处，不顺手删除或把旧路径全部替换 |
| `verify:dirs` 已进入总门禁，baseline 为 `{}` | 所有新目录先按 ≤10 源文件 / ≤7 子目录计算；不放宽基线。新页面规划到 `src/views/app/control/` |
| 本次完整 build 再次报告 Settings 同时动态/静态导入 | C1a 注册表、C1b 编译扫描分别闭环；两者通过后再签署页面按需加载结论 |
| 现有全局 error handler 主要记日志，ErrorFallback 是应用启动失败界面 | C1a 增加页面加载失败组件；不能只换成 defineAsyncComponent 后让失败成为空白页 |
| 17 条参考 application service 路由均在当前后端账本有唯一方法/路径匹配 | 前端对接有源码落点；仍逐项验证参数、返回值、权限、部署及副作用，不视为 17 个已验收功能 |

## 技术方案

### 1. 单一宿主与领域所有权

沿用当前 SparkApp 的认证、租户、应用和授权导航，沿用 LowcodeApi 作为唯一请求根。将参考 owner 的业务约束、操作和必要算法迁入当前领域 API，使用本仓 Vue 页面呈现。原包有 17 个直接 workspace 依赖、23 个依赖闭包，不整体挂载第二套 runtime/UI/HTTP，也不模拟整套参考 runtime 作为长期兼容层。

- 蓝图继续由现有 blueprint API / ProjectWorkspace / DevSystem 管理；不另造导航或蓝图事实源。
- 正式模型、字段、关系是治理对象；场景 `pagedata.json` 是视图与 modelBindings。二者分别读写，模型设计不能覆盖场景编辑。
- 模型查询结果保留原 DataSpaceQueryContext、原始 rows/total、权限与保存队列；UI 只做投影，不复制或序列化重建伪 context。
- 图设计、文件、业务流程、数据工作流各循原存储合同；现有 Agent workflow 的语义和 AI gate 保留。
- 执行应用来自当前 LowcodeApi scope，被管理目标应用作为业务参数独立校验。身份 token、目标及查询必须绑定同一次操作；切域后迟到结果不能继续保存。

### 2. 系统页身份与地址兼容

当前 PageRuntimePool 的配置页键包含 projectId、nodeId、tool.pageId、规范化 query 和 hash；能保留超过 10 个实例，拒绝 dirty 关闭，保留 configPending，并在读取后核对蓝图绑定和代次。集成不改变这些已验证约束。

系统页需要独立的调用身份，最少包含 tenant、执行应用、授权 nodeId、规范路径、原 query/hash，以及真实 scenarioId/designTarget。按领域动作声明应用级或场景级要求，缺必要参数明确拒绝。文件管理的历史授权节点无场景，不能补默认 scenarioId。导航授权历史样本中同路径、同场景仍有两个不同节点，scenarioId 不能替代 nodeId。

实施分解为 C2a 解析合同、C2b 导航与恢复、C2c 标签/缓存生命周期，每个闭环先独立列出精确文件和测试：

1. 一个路径只注册一个匹配入口，但维护该路径的完整授权节点候选集。不要继续把首个候选写成唯一节点 meta。
2. 菜单显式传递选中节点；调用身份只接受当前授权树中的节点与允许目标，不信任用户可编辑参数本身作为权限。
3. 保留正式路径、业务 query、hash。经固定参考源码复核，沿用参考保留参数 `__sparkNavigationId` 携带节点身份；仅当节点属于当前授权树且目标路径、配置参数与作用域匹配时接受。保留参数不能作为授权凭据；重复、空值、冲突、跨作用域或未知节点显式拒绝。不使用无法独立支持刷新与书签的 history state 作为唯一身份。
4. 从旧地址直接进入时，以当前授权节点及目标显式配置的 query 缩小候选；保持 Vue Router 的 null、空字符串和重复值语义，不覆盖动态调用参数。唯一匹配可恢复；多个等价候选则明确要求从授权菜单选择，不暗选第一个。蓝图场景独立保存为 `blueprintScenarioId`，不得用它覆盖或反推 URL 的 `scenarioId`。
5. 标签键、渲染缓存键、当前调用快照及关闭/销毁使用同一身份；不能只改 useTabPages。查询参数重排不新建实例，不同节点/场景不共享编辑状态。
6. 切应用、退出、撤权时失效并释放系统页状态；dirty 关闭遵循显式确认，取消后保留。导航刷新不能丢弃仍合法的编辑实例。

### 3. 三类 API 分别接线

| 类型 | 处理方式 | 核验要求 |
| --- | --- | --- |
| 正式模型查询/保存 | 当前 dataSpace.runtime 持有原 query context、字段/行权限及保存队列 | 原始分页、应用过滤、权限拒绝、保存确认、回读 |
| 参考内建能力，例如 spark.json-data、spark.api-call | 将实际调用映射到 LowcodeApi 内具名领域方法，不当成普通模型名 | JSON/FormData/Blob、参数位置、取消、错误和成功条件 |
| application service 的 resource/intent | 展开成明确领域动作，按固定源服务表核对，复用已有本仓方法 | 17 条静态匹配仅为路由证据；逐项核对参数和部署行为 |

内建能力重点端点包括文件 UploadFile/uploadFileByStr/content/text/DownFile/RemoveFile；Table/registerTable、View/registerView、Table/SyncMetaData；ViewData/GetView/SaveView/GetViewData；JsonData/GetJson/SaveJsonData；dataInterface/callApi/Body/FormData；Codeing/GetCodeString；File/ExportExcel/importExcel/ConvertFile。`/api` 前缀由当前配置组合一次。元数据同步等明确应用级操作不强加场景。

17 条服务的分组与真实端点见新证据 `service-correspondence.json`：文档导出 2、企业初始化 1、编码 2、设计执行 2、流程运行 10。流程运行包含查询执行人/按钮候选/历史、启动提交、退回发起人/历史/强制退回、后续自动提交判断、追加/撤销参与人。初始化、流程测试和状态变更不用于盲探在线性。编码初始化列表的 controller 当前进入 CodeInitDataList；仅追到方法名不推断其整个调用链无副作用。

### 4. 引擎、资源与错误

- 当前组件、Element Plus、已安装表格能力优先，树搜索保留祖先上下文。原始分页收齐后再过滤。
- 当前 Vue Flow 只在旧图的节点/边 ID、类型、properties、顺序、条件、布局可以无损往返后才承接该图。否则按固定源 lockfile 选择必要 LogicFlow 最小依赖；不能仅凭外观近似替换格式。
- 固定源 SchemaGraph 有 LogicFlow 消费者；未找到 AppWorks 对 TinyFlow 的直接消费者，暂不纳入默认依赖。
- 固定源报表资产 73 个，加载顺序 reports → dashboards/viewer → 设计态 designer。Stimulsoft 模板兼容、授权、资源路径、取消/销毁和实际数据查询分别验证；资产存在不等于可运行。license 不写入证据。
- 所有实际失败进入可见状态，不把取消、缺配置、权限拒绝包装为空表/空模板；不以 prepare、前端提示或 HTTP 200 单独证明写入成功。

## 逐项可行性与完整验收范围

范围共 29 项。固定源静态索引为 297 个 TS/TSX/Vue 文件（116 Vue）、54 个 owner 文件、59 个类、524 个非 private/# 方法；不是 524 个已验证用户功能。源路径均在固定 Git 对象读取，详见 `reference-inventory.json`。每项最终必须形成 UI 触发点 → owner 方法 → 请求 → 当前实现 → 权限 → 回读证据的操作级记录。

**当前可承接**表示存在当前能力和来源合同；**关键链待验**表示核心等价条件尚不能签署。历史读取仅保留为历史，不能替代最新身份下验收。所有项的完整操作验收目前都未完成。

| ID / 领域 | 来源 owner / 当前承接 | 可行性结论与必须完成的闭环 |
| --- | --- | --- |
| A1 应用管理 | ApplicationManager；当前 AppList | 当前目录浏览器可读；维护、关联数据库、文档任务、A/B 隔离逐项回读 |
| A2 蓝图 | ApplicationFunMan；当前 blueprint / DevSystem | 当前可承接；移动/删除、属性、设计/发布引用、原型上传和版本、桌面配置、维度来源分别对账；保留 ID 和发布指针 |
| A3 导航宿主 | DataMenu、navigation-host；当前 DynamicRouter | 关键链待验；C2 同时覆盖真实节点、宿主选择、恢复和缓存，不按路径首选 |
| A4 企业治理 | EnterpriseRegistManager；当前 PlatformTenantManagement | 当前可承接；登记/审核、初始化、配置、模块授权增减和密码操作分开验收；敏感动作按实际权限执行 |
| A5 授权申请 | EnterpriseAppAuthApplication 与三个申请页面 | 当前可承接；申请、我的申请、审批状态与最终授权分别回读 |
| D1 正式数据空间目录 | data-set/list；当前 dataSpace.runtime | D1a/b/c正式只读目录、应用筛选/名称、创建人权限解析已验收；D1d原生生命周期+新增回读按独立计划推进；宿主绑定、编辑/删除、设计/复制API/影响范围及完整保存重开仍待接 |
| D2 正式模型设计 | data-set/design；当前 dataSpace.design + 场景装配 | 关键链待验；字段/关系/模型、来源同步、输入参数、布局重建 prepare/confirm、级联删除/预览分别回读 |
| D3 数据空间授权 | data-set/auth；当前 permission 域 | 当前可承接；prepare 不是执行；功能节点授权与受限身份实际效果须验 |
| D4 数据库目录 | ServiceManager、DataBaseManage；当前 DBMS | 历史 DBMS 读取成功，治理入口 blocked；连接测试、登记、维护分别核实既有后端 |
| D5 表/视图治理 | AddTable、TableAndView、Register、TableDesign、ViewDesign | 当前可承接；创建、复制、登记、设计、关系、同步区分；仅用专用测试资源执行既有接口，不修改后端结构定义代码 |
| D6 字典 | DataDictionary；当前模型查询/保存 | 历史目录读取成功；类型、配置及参考实际数据操作保留字段权限、真实场景和应用归属 |
| D7 编码 | DataCode、DataCodeEdit、designer.code | 当前可承接；父码、序列、时间片、分类、测试码、初始化、正式分配分别核对副作用；失败不自动重放 |
| D8 逻辑视图 | LogicView、LogicViewDesign；ViewData 专用合同 | 关键链待验；元记录与图设计分开保存，旧图往返、预览字段/分页和引擎需证据 |
| D9 维度来源 | DimensionDesign、DimensionSourceBinding/Commit；公共 dimension runtime | 关键链待验；2272 行 runtime 尚未全读，须完整追来源身份、账本、事实、投影版本及提交次序后才能判定无需后端变化 |
| D10 数据工作流 | DataWorkFlow、DataWorkFlowDesign；designer.execution | 关键链待验；触发表、节点/边/模型/字段/关系级联、输入参数、整图/单节点测试需真实回执；与 Agent workflow 分开 |
| O1 组织人员 | TenantOrganization、PersonSelector | 当前可承接；部门树、岗位/人员查询、选择身份、原始分页及祖先上下文；不虚构源仓未证实的 HR CRUD |
| G1 角色授权 | RoleClassManagement、RoleAndUserManagement、RoleAuthManagement | 当前可承接；分类、角色、用户和授权编辑后用受限身份验效果 |
| G2 导航/用户应用授权 | NavigationPermissionConfig、UserAppAuth | 关键链待验；同路径同场景不同 nodeId 的样本必须区分；菜单/按钮/行/字段分层验证 |
| G3 脱敏 | DesensitizationRuleConfig；当前运行权限消费 | 当前可承接；规则回读、显示、导出/剪贴板/保存边界验证，掩码不能作为原值写回 |
| I1 文件 | FileManager；当前 design 文件域 | 当前可承接；目录、二进制上传、下载/预览、删除回列；场景为空的应用级命名空间需支持 |
| I2 JSON | JsonDataManager；JsonData 专用合同 | 当前可承接；目录记录与树内容分别确认，旧树格式无损保存重开 |
| I3 Excel | ExcelImportConfig、ExcelImportConfigConfigSet | 关键链待验；模板、上传、Sheet 布局、转换规则、参数和实际导入结果完整验收 |
| I4 外部接口 | APIManage；登记模型 + 专用执行 | 当前可承接；服务商、账号、公参/headers、接口输入输出字段嵌套维护及 Body/FormData 实际调用 |
| I5 报表 | ReportManage、ReportComp、runtime/report | 关键链待验；目录、数据源/参数、版本分页/维护/激活、模板上传、设计/预览/输出、保存重开；激活版本不可按最大版本号猜测 |
| W1 业务流程设计 | FlowModel、FlowDesign | 关键链待验；依赖组织/角色/正式模型，节点边、岗位表单配置、模板文件及旧图往返分别验 |
| W2 业务流程运行 | FlowRunPage/Detail/AppendUser、移动页 | 关键链待验；启动/提交、各退回动作、后续自动提交判断、已读、追加/撤销、详情和移动交互逐项真实状态回读 |
| S1 缓存 | CacheManager；当前同名页面 | 当前可承接；列表与实际缓存动作分开证明，只操作明确测试对象 |
| S2 系统支持 | FlowMonitor、DataRecover、BugManage | 当前可承接；只读监控、恢复/撤销恢复、问题状态分别验收；不得恢复真实业务记录试探 |
| P1 共享支撑 | 公共表单/图面板/表与字段/人员选择 | 关键链待验；53 个参考文件直接消费 Vue runtime，需核对权限、原查询、取消和未保存保护；不只替换 import |

源 `ui/views/appworks/{field,table}`、`schema/relation`、`system/{menu,role,user}` 是占位页，schema/design 为组件图演示。有效地址继续对账，正式功能由所属当前治理页承接；示例保存不计后端保存通过。来源新 AI 入口依既定边界排除，当前 AI 保留。

## 影响范围

所有以下路径相对 `D:/SPARK_AppWorks`。C1a、C1b 已收敛为精确代码闭环；后续表列为候选范围，不能用于任意批量编码。每个领域需补齐完整源码、调用方、测试、配置后，由主控据用户授权形成精确清单和任务切片。

### C1a：页面注册表按需装配与失败呈现

| 精确文件 | 拟修改 |
| --- | --- |
| `src/registries/vue-page-registry.ts` | buildComponentMap 返回按 source 复用的同步路由宿主，在内部呈现异步页面；保留 Promise 返回合同、元数据及地址映射；接入页面加载错误组件 |
| `src/components/page-loading/PageLoadError.vue`（新增） | 当前组件风格的页面加载失败状态与明确的重新加载入口；仅处理模块加载失败，不吞掉业务错误 |
| `tests/app/config/vue-page-registry.test.ts` | 通过真实组件挂载验证懒加载、别名复用、失败可见及重新加载入口，保留现有元数据断言 |

只读影响面：`src/main.ts`、`src/App.vue`、`packages/spark-app/src/router/dynamic.ts`、`packages/spark-app/src/app/error-handler.ts`、`src/components/ErrorFallback.vue`、`config/navigation/vue-pages.json`。不改这些消费者；若实际证明需要改，先修订本闭环。

顺序与验收：

1. 审核通过后重读上述文件、核对 git status 和 HEAD；若并发改动进入本范围，停止并重对齐。先取得 typecheck 基线。
2. 在现有注册表测试中增加可观察行为并立即运行最小测试，确认失败来自注册表提前调用 loader，不将环境导入错误当有效反例。
3. 注册表按 source 复用同步路由宿主及其异步子页面；未挂载时零 loader 调用，挂载目标只调用目标 loader，别名共享模块加载状态但不共享不同调用的业务编辑状态。同步宿主保持 Vue Router 的组件合同，异步子页面承担错误呈现；真实 RouterView 导航不新增 async-route 警告。
4. 缺 source 等配置错误保持现有显式失败；模块导入失败由新增 PageLoadError 显示，恢复按钮重新加载页面。不自动无限重试，不承诺浏览器缓存失败模块一定能在原页面内重导入。
5. 保持 `Promise<Record<string, Component>>` 返回；如果函数不再需要 await，采用保留 Promise 拒绝语义的实现，不能只删除 async 而改变调用合同或用无 await 的 async 触发 lint。
6. 每次实质修改后立即最小验证；生产文件暂未接入时用新增组件相关断言检查，完成接入后再运行全组。随后 typecheck、定向 lint、路由回归；浏览器复核首页、登录、应用列表及已有系统页。
7. 此闭环只消除注册表主动提前加载。C1b 仍会静态导入部分页面，不能在 C1a 后宣称整体首屏已按需加载。

最小命令：

```powershell
pnpm exec vitest run tests/app/config/vue-page-registry.test.ts --maxWorkers=1 --reporter=dot
pnpm run typecheck
pnpm exec eslint src/registries/vue-page-registry.ts src/components/page-loading/PageLoadError.vue tests/app/config/vue-page-registry.test.ts
pnpm exec vitest run tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts tests/runtime/auth-nav/navigation-platform-paths.test.ts tests/auth-nav/dynamic-router-platform-pages.test.ts tests/auth-nav/navigation-platform-paths.test.ts --maxWorkers=1 --reporter=dot
```

目录核验：src/components 当前 4 文件/0 子目录，新增 page-loading 后为 4/1；该子目录仅一个源文件。tests/app/config 当前一个测试，修改原文件不增数；注册表无新增公开 API。C1a 没有依赖、配置或后端写入变化。

### C1b：编译扫描的页面加载策略

候选精确范围：`tools/vite-plugin-spark-components.ts`、`packages/vite-plugin-spark-catalog/src/scan-config.ts`、`vite.config.ts`，新增 `tests/app/config/spark-components-loading.test.ts`。

集中声明 `src/views/**/*.vue` 的异步路径策略，插件以规范化路径判定；保留同步核心/错误组件优先级、注册名和排除规则，不直接删除扫描页面。用真实插件生成的虚拟模块测试动态 import 与同步核心，而非只检查配置文本。C1a/C1b 合并后完整构建，确认 Settings 冲突消失并在生产冷启动观察未打开系统页与引擎不主动加载、打开后可用。Codemirror 的其他静态消费者是独立来源，不能以隐藏警告或挪 chunk 掩盖，也不顺手纳入本闭环。

开工细化（主控完成只读依赖核对，C1a 验收后执行）：使用具名 `asyncPathPrefixes` 配置，相对 root 的目录前缀规范为 `/` 分隔、去掉前导 `./` 并保留目录边界；集中配置只指定 `src/views/`，不引入新 glob 匹配器或依赖。先判显式 syncComponents，再判路径前缀，再沿用现有异步名称/大小/默认策略。scan-config 的新常量由 vite.config 和测试直接消费，暂不加入包公共 barrel，避免无消费者公共面。

四文件精确范围不变。测试在临时目录生成小 SFC 夹具，运行真实 Vite 插件取得生成模块，断言页面/嵌套页面为动态 import、同步核心优先、相邻 views-other 路径不误命中、非页面默认策略不变、排除及注册名不变；测试需清理服务和临时目录。最小测试为 `pnpm exec vitest run tests/app/config/spark-components-loading.test.ts --maxWorkers=1 --reporter=dot`。GREEN 后 typecheck、四文件定向 lint、registry 测试和相关依赖/目录门禁。主控执行一次最终 build 和冷启动浏览器检查，不由每个执行者反复跑全套。

### C2 及后续现有文件候选

**C2a 精确切片**：系统页解析、菜单身份、活动节点和首页恢复须作为同一可打开闭环。13 文件及逐点 RED/GREEN 见 `notes/evidence/sparkproject-appworks-integration/c2a/dispatch.md`，由主控依据既有授权收敛。新增 `system-page-identity/` 内部解析器/同步 host；只对已映射 native 页面安装一次 beforeResolve，保留 cfg/ref/iframe/unmapped 行为。`SYSTEM_PAGE_NAVIGATION_ID_QUERY` 集中在既有导航契约并从包入口导出，根宿主和包内共享；这是有实际跨包消费者的单一常量，现有 exports/alias 覆盖根入口，不新增配置入口。包级 Vitest 同步启用既有 Vue 插件，以真实测试新 SFC 宿主，不引入依赖。候选表必须随 C2p1 路由事务提交或回滚。首页显式 query 优先，旧动态参数只补非冲突项并丢旧 marker；首页 hash 优先，否则保留旧 hash。本切片不签署标签缓存、编辑状态、脏状态与关闭释放，后者归 C2c。

**C2p1 精确实施范围**：仅 `packages/spark-app/src/router/dynamic.ts` 和现有 `tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts`。私有递增代次覆盖首次注册与刷新；先在局部变量等待主导航和可选平台导航，再仅由最新代次同步发布树与注册路由，最后删除旧路由。不预载任何业务组件，保持 C1 懒加载。旧成功不发布其结果、刷新只返回当时已提交树；旧失败向原调用者抛出且不回退、不清理、不覆盖新树。当前 401 保持 preAuth 回退；当前刷新一般失败保持 preAuth 回退并抛出。回退时清空旧 tenant/platform 树并移除旧授权路由，防止 getNavTree 又读回旧应用。配置页实例池及其 dirty 合同不变。已有跨应用引用 host 在提交中仍需进入注册集合，避免清理阶段误删。

先用同一真实 memory Router 的 deferred loader 验证旧成功/旧 401/旧一般失败晚于新成功，以及旧成功早于新完成但不能发布；平台读取等待期间不得提前发布半套导航。再证明当前失败/未认证回退移除旧授权路由、顺序刷新仍保留既有 cfg runtime、跨引用 host 不被误删。有效 RED 后局部实现，最小 GREEN，typecheck、定向 lint、根 auth-nav 回归、包级现有 fallback 测试和代码/目录门禁；主控审 diff 并复验浏览器刷新。此闭环只保护路由发布，后续 C2p2 再约束低层读取期间的 session/application revision，不等同于目标 projectId 必须等于 selected app。

**C2p2 已研读、待 C2p1 验收后派工**：精确范围 `src/lowcode/lowcode-runtime.ts` 的 `readLowcodeRuntimeNavigation` 与 `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts`。导航装配等待 records/authorization 时，records 查询已有 scope fence，但授权 HTTP 返回没有相同保护，records 先完成后换域仍可能组合旧授权。入口捕获当前 session/application revisions 与已选应用/导航根身份，每次异步读返回后及错误退出前核对；失配显式 stale，不继续下一请求或装配导航。不把业务参数 projectId 与执行应用强行相等，不改变请求目标，也不更改 stores/API。无选中应用且无显式目标继续返回本地 catalog，不调用 app-required readRequestScope。合法 token 刷新保持 identity/enterprise 引用和 revision，不能被当作换身份。显式读取其他应用且执行域稳定继续合法；未选应用时显式读取原本受底层 query 的 scope-required 限制，本轮不偷偷选中应用修补。

C2p1 主控审查补充：真实 `addRoute('/foo/:id(')` 同步抛错，因此发布须保存并可恢复本类受管平铺路由的 name/path/components/props/meta、树引用及追踪集合。同步注册失败先恢复完整旧状态再按 register/refresh 原错误合同处理，不能残留合法前半段新路由，也不能删除外部静态路由。仍限 C2p1 两文件；新增真实 memory-router 坏路径 RED，详细恢复约束见切片补充。

另行记录待收敛风险：`activateLowcodeApplication` 等待目录后调用 `selectApplication`，后者异步读取导航根再保存，尚无选择意图代次；A/B 逆序选择可能使较早选择最后写入，不能靠导航发布代次单独解决。C2 身份总验收前需补充专门的选择闭环，不在 C2p1 中扩散修改。

C1 生产验收补充闭环（C1d）：生产浏览器报 Element Plus 和 VXE 插件默认导出无效。源码确认 presets 的 `readProperty` 只读 descriptor.value，而真实打包 namespace 的默认导出为 getter，已有 HEAD 同样使用此读取方式。只修改 `packages/spark-app/src/shell/plugins/presets.ts` 和新增其 `__tests__/presets.test.ts`：在已知模块边界用正常属性读取消费默认导出，并保留 Vue Plugin 结构验证/非法导出显式失败。通用 guards 的不执行 getter 合同和 PluginManager 的既有失败处理不变。先通过公开注册表 loader 和 getter namespace 夹具复现，再修正并立即验证；最后 typecheck、定向 lint/registry、生产 build/浏览器证明真实插件可加载。此缺陷阻碍生产页面验收，不能以首页纯原生元素可显示判通过。

C1c 产物复验补充：移除 pages-config 后，同样问题转移到页面组 pages-data-heavy；Settings 已独立，但 Dashboard/CapabilityDemo 仍被 preload。因此 C1c 精确范围扩大为删除这两处手工页面分组，保留全部 core/vendor 分组，统一由实际动态 import 决定页面 chunk。需保留两轮真实产物对比，不把某个 chunk 消失当作整体懒加载成功。

C1 生产构建补充闭环（C1c，C2 前）：C1a/C1b 的组合 build 暴露 `dist/index.html` 仍 preload `pages-config`；Settings 静态依赖 registry/lowcode-runtime，手工页面分组将共享启动模块与该页面合并，使加载器惰性被抵消。仅修改 `vite.config.ts`，移除针对 `views/tenant/Settings` / `TenantConfig` 的 `pages-config` 手工分组，让构建器按真实动态边界生成页面 chunk；不迁移共享源码、不变更 vendor/core 分组、不靠改 chunk 名证明改善。先保留该 build 作为失败证据，改后立即 Vite build 比较 HTML 静态入口和 Settings 独立 chunk，再由主控在生产 preview 观察 Settings/DBMS/WorkflowDesigns 冷启动不请求、打开目标后请求且界面可用。原 CodeMirror 静态消费链独立，保持已知限制。配置后执行 typecheck、既有 C1 测试、相关门禁，不新增镜像配置文本的单元测试。

| 精确文件 | 计划职责 |
| --- | --- |
| `packages/spark-app/src/navigation/runtime-navigation.ts` | 授权节点和系统页调用身份合同 |
| `packages/spark-app/src/router/dynamic.ts` | 路径候选解析、路由注册、当前调用及失效 |
| `packages/spark-app/src/navigation/useNavigation.ts` | 菜单保留 nodeId、明确路径解析 |
| `packages/spark-app/src/navigation/useTabPages.ts` | 标签激活、恢复和关闭绑定真实调用 |
| `src/App.vue` | 系统页渲染缓存使用相同实例身份，保留配置页专属 runtime 缓存 |
| `src/lowcode/lowcode-runtime.ts` | 当前 API/scope 与授权蓝图的投影 |
| `config/navigation/vue-pages.json` | 按领域逐批补正式地址到当前页面的映射 |
| `packages/spark-lowcode-api/src/lowcode-api.ts`、`packages/spark-lowcode-api/src/index.ts` | 组合必要领域能力，最少显式导出 |
| `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`、`data-space-design-mutation.ts`（同目录） | 正式设计变更与确认，保留读取 |
| `packages/spark-lowcode-api/src/platform/permission/design/permission-design-api.ts`、`permission-design-mutation.ts`（同目录） | 授权编辑与确认，不改运行权限事实 |
| `packages/spark-lowcode-api/src/design/lowcode-design-api.ts`、`lowcode-design-file-upload.ts`（同目录） | 补实际缺失文件能力，保留版本与回读语义 |
| `src/views/tenant/AppList.vue`、`src/views/platform/PlatformTenantManagement.vue` | 应用与企业操作补差 |
| `src/views/app/DBMS.vue`、`src/views/tenant/CacheManager.vue` | 对应已存在治理入口逐动作接通 |
| `src/views/app/dev-system/DevSystem.vue`、`DevNodeProps.vue`、`useDevSystem.ts`（同目录） | 补治理设计入口及节点属性，复用蓝图 owner |
| `pnpm-workspace.yaml`、`package.json`、`pnpm-lock.yaml` | 仅确有必要引擎时按单独审核清单修改，不降低门禁 |

PageRuntimePool、正式场景 loader、project-model、spark-data、spark-ai 当前均为复用和回归对象，不默认列为修改范围。公共入口需要变化时，该批必须另列实际 exports/alias/导入测试文件。

### 新领域组织

新 UI 统一规划到 `src/views/app/control/`；其下 application、data-platform、organization、governance、integration、workflow、system 共七组，按领域细分组件专属目录。API 优先扩已有域，缺失的放 `packages/spark-lowcode-api/src/control/`，内部同样最多七组，经根门面组合，不公开 helper。

例如首个 D1 新入口拟为 `src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue`，对应现有 dataSpace.runtime；D2 模型设计与场景 DevDataSetDesigner 保持分离。其他领域的新文件必须在该批读完代码后给出精确文件表，不能用此目录规划授权通配符增文件。

当前 lowcode-api/src 已有 6 个子目录，control 将占用第 7 个；views/app 当前 7 文件/2 子目录，control 增为第 3 个。tests/runtime/auth-nav 已有 9 个源文件，C2 新测试须规划到专属 system-page 子目录，不把多个测试继续平铺。每批实施前再次运行目录门禁，不修改空基线以容纳超限。

## 实施顺序

1. **B0 账本**：以本次基线为起点，逐模块完成有效操作清单、请求/回执/权限、地址/参数与引擎格式核验；完整研读 D9 等未知链，不靠空接口或假保存通过。
2. **B1 基础**：C1a → C1b；C2a 身份解析 → C2b 导航/恢复 → C2c 标签/缓存；再按首个消费者建立原查询与领域 API 接线。每一项独立测试和审核。
3. **B2 基础治理**：A1/A3 → O1 → G1/G2/G3 → A4/A5；A2 已有能力持续回归。
4. **B3 数据底座**：D4/D5 → D1/D2/D3 → D6/D7；I1 按消费者需要先行。走通数据库资源 → 正式模型 → 场景视图 → 当前页面。
5. **B4 复杂数据**：D8 → I2/I3/I4 → D9 与 A2 来源配置 → D10。逐项做格式、执行域、失败和回读闭环。
6. **B5 流程/报表**：W1 → W2 → I5；必要引擎/授权/资源可行性在 B0 先核实，不拖到最后才暴露。
7. **B6 支撑与总验收**：S1/S2、P1 全部消费者、存量 URL、权限矩阵、构建加载和现有 AI。全部有效操作均有证据才结束。

源有能力但目标部署缺端点/模型/权限时，阻塞该动作并保留证据。可以继续不依赖它的研究；不能悄悄增加后端或缩减完整范围。需要改变八项前提时才向用户补充具体决策。

## 验证计划与最新结果

| 检查 | 0b6c85d 本次结果 | 日志 |
| --- | --- | --- |
| typecheck | 退出码 0，先于后续检查通过 | typecheck.log |
| lint | 退出码 0 | lint.log |
| 根 Vitest | 186 文件 / 2112 项通过 | root-tests.log |
| 七个包 Vitest | 113 文件 / 1691 项通过 | package-tests.log |
| 完整 pnpm run build | 退出码 0，包构建及前端构建均执行；有现存警告 | build.log |
| verify:rules | 全部 14 个入口完成，退出码 0；class-model 子测试 4 文件 / 49 项 | verify-rules.log |
| verify:page-design | 4 文件 / 53 项通过 | verify-page-design.log |
| verify:project-planning | 2 文件 / 11 项通过 | verify-project-planning.log |
| verify:model-convergence | 6 文件 / 67 项通过 | verify-model-convergence.log |
| 浏览器只读复核 | 首页、正式企业选择后登录、应用目录通过；数据空间入口仍为明确映射错误 | browser-smoke.json、system-page-mapping-error.jpg |

测试集合有重叠，不能将不同命令数量相加为唯一覆盖数。AI 检查是离线合同验证，不证明在线 LLM 或工具调用。verify:rules 中 AI model 保留 2 条 warning；build 保留 Settings/CodeMirror 动静态导入、第三方注解及大 chunk 警告。退出码通过不等于零告警，也不等于全部集成已通过。

复现工程命令：

```powershell
pnpm run typecheck
pnpm run lint
pnpm exec vitest run --maxWorkers=2 --reporter=dot
pnpm --workspace-concurrency=1 -r --filter=@spark-appworks/* run test:run --maxWorkers=2 --reporter=dot
pnpm run build
pnpm run verify:rules
pnpm run verify:page-design
pnpm run verify:project-planning
pnpm run verify:model-convergence
```

根与包命令执行 test:all 的相同两组测试，仅限制并发与输出。后续 typecheck 必须先通过；每次首改立即最小测试，其后只扩大到真实影响面。最终整合代码执行上述全部命令，不能用历史日志代替。

重点已有回归文件：`tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts`、`tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts`、`tests/runtime/auth-nav/data-space/lowcode-scenario-assembly.test.ts`、`tests/app/services/page-design-operation-guard.test.ts`，以及 C1a 所列两处路由测试。覆盖原权限、跨域迟到、正式模型装配、配置实例、版本/发布和 AI 操作边界。领域新增测试必须覆盖真实易错合同，不能仅复写实现。

### 浏览器、权限和回读门禁

| 维度 | 验收要求 |
| --- | --- |
| 身份与隔离 | 测试租户内两个明确目标应用；管理用户和受限用户；菜单/按钮/行/字段及拒绝写入；切域后旧请求失效 |
| 调用恢复 | 旧地址、刷新、前进后退、书签、同路径异场景、同场景异节点、空场景应用级页面、多标签与 dirty 取消 |
| 保存 | 操作前快照 → 提交 → 业务回执成功 → 后端再次读取 → 关闭重开；记录对象 ID、内容校验与清理结果 |
| 非普通查询 | JSON、FormData、Blob、编码、物理登记/同步、图格式、分页及专用回执逐项验证 |
| 失败 | 接口缺失、权限拒绝、超时、取消、部分写入、回读不一致、scope 过期均有明确状态；写入结果未知先回读 |
| 现有主链 | 蓝图编辑/发布/预览、三文件、正式模型/场景装配、DataSet 查询保存、现有 pageDesign/projectPlanning/Agent workflow |

账号密码、token、license 和业务整行不进入证据。业务写入仅对明确测试对象，删除/恢复/流程推进记录可逆性与独立清理；Git 回滚不能回滚后端副作用。

## 风险项与停止条件

- **系统页串上下文**：当前四处身份不一致；必须 C2 联合验收，不能只增加 scenarioId prop。
- **加载失败从启动转移到页面**：新异步策略改变错误时机；C1a 的可见失败与恢复必须与加载时机一起验证。
- **维度/图/流程/报表等价性**：D9 尚未全读、多个领域真实写入尚未证明；这些项保持关键链待验，不能签署全量可行或零回归。
- **查询/权限丢失**：坚持原 context、后端事实及请求代次；错误不能静默降级为无权限的兼容查询。
- **文件与记录非同一事务**：分别确认，保留中间状态；失败先回读，禁止盲目重复上传/分配编码/执行流程。
- **目录/类型/导出扩散**：不复制 strict:false、any、断言、export *；新增消费者、文件或依赖超批次即先修订计划。
- **并发漂移**：当前 tracked 干净不保证未来不变；每闭环重读、记录 HEAD 和范围内哈希。发现用户修改或契约变化立即停止该实施闭环，不覆盖并发工作。

回滚只恢复本闭环差异，保留验证与失败记录；已有他人修改不得整文件覆盖。超出既定文件、引入未覆盖设计决定或验证推翻方案时，回到计划修订，不边失败边扩大范围。

## 完成定义与审核边界

“零回归”限定为固定整合代码、已列操作清单、明确测试环境和身份下：原用例零新增失败，新增动作全部真实浏览器/权限/保存回读通过，受影响旧链路通过，未解释失败与待验项清零。现有告警有归属，受本次改动影响的告警不得恶化；它不是对所有未来输入的绝对保证。

本次已完成最新工程基线、关键路径重新研读、29 项范围逐项可行性审查和计划修订；完整控制面未实施，零回归尚未达成。已开始 C1 基础闭环；C2/各领域必须补齐该批精确文件和完整研读再开工，不把总体方向等同数百文件批量编码许可。

根 AGENTS.md 阶段 5 的开工授权已由用户本轮实施指令满足，状态已先 approved 再 implementing。不 commit、push、建分支或修改知识库。全量实施通过后再按阶段 7 确认可复用知识、追加度量并删除执行完成的计划。
