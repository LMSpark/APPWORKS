# 项目蓝图页迁移研读

## 任务与基准

- 用户确认：以参考仓 `E:\r\sparkproject` 固定提交 `1147b00ee53a1476d4ee715c61368b453a215192` 的 `apps/appworks` 项目蓝图页及完整功能作为基准。
- 本次依据 `git -C E:\r\sparkproject show 1147b00ee53a1476d4ee715c61368b453a215192:<path>` 读取固定提交；不以参考工作树同名版本代替。
- 参考页面文件：`apps/appworks/src/ui/features/application/application-function-management/ui/application-function-page.vue`。
- 原生业务 URL：`vue:/features/application/application-function-management/ui/application-function-page`。
- 本仓目标组合页路径：`src/views/features/application/application-function-management/ui/application-function-page.vue`。复用现有应用壳和 PageRuntime 链；原 URL 是规范业务导航身份，`/dev` 有独立消费者，不能将它当作页面等价实现或整体退役。
- 不修改 Java、不增加 Node 服务；不整页复制参考 Vue，业务读写须遵循本仓 DataView/标准组件合同。

## 初次研读的工作树与治理状态（历史快照）

- 核对时主工作树为 `D:\SPARK_AppWorks`，分支 `codex/spark-data-s1-command-safety`，HEAD `d9077c8e25bb32e152137c5aa2a02cee9feb19bc`；`git status --short` 无输出，worktree 列表只有主 worktree。
- `knowledge/README.md` 的应用壳/跨包决策表要求读取 Vue 前端、monorepo 依赖及页面设计相关知识；另需核对 ClassModel 知识与本仓相关主合同。`notes/data-space-retirement-ledger.md` 是唯一迁移台账。
- 台账最新蓝图续查记录将原路径导航、准确选中节点与数据空间阶段、owner 租约及未保存状态列为待处理；台账是历史/治理记录，具体源码状态以本次核读为准。

## 参考页面职责与调用链

参考页面使用 `useApplicationFunctionPage` 编排树、节点详情、表单、保存、路由上下文和异步请求；页面本体还处理运行时执行域、菜单宿主上下文、交付核验及数据空间影响范围。

页面能力清单：

1. 蓝图树懒加载、根/同级/子级新增、删除、拖动重排；按 `nodeId` 定位节点并恢复树路径。
2. 基本信息：能力名称、类型、负责人、阶段、简述；名称单独保存，阶段直接在线保存，其余基本信息另行保存。
3. AI 按需求生成下一级蓝图草案及表单回填；先校验结构、展示预览，再由用户确认写入/回填。
4. 需求原型富文本编辑、图片上传、预览、版本保存/应用/删除。
5. 数据空间绑定、影响范围查询、内容设计和权限配置入口。
6. 导航字段配置（地址、移动地址、排序、图标、发布/子项/分组、跳转及布局属性），桌面配置，以及导航宿主关系的分页、CRUD 和资源/字段映射。
7. 读取当前蓝图子树并与目标应用实际交付资源比对；导出需求说明书。
8. 页面直接挂载 `BlueprintDimensionSource`；其下又挂载维度事件编辑和来源提交协议编辑器，涉及正式数据模型字段、维度来源绑定和提交版本草稿。

页面所属的参考源码包括：

- `.../ui/application-function-page.vue`
- `.../ui/use-application-function-page.ts`
- `.../ui/application-function-page.scss`
- `.../ui/blueprint-node-verify.ts`
- `.../ui/blueprint-dimension-source.vue`
- `.../ui/blueprint-dimension-event-editor.vue`
- `.../ui/blueprint-source-commit-editor.vue`
- `apps/appworks/src/data/api/ApplicationFunMan/project-blueprint-owner.ts`
- `apps/appworks/src/data/api/ApplicationFunMan/project-blueprint.ts`
- `apps/appworks/src/data/api/ApplicationFunMan/application-function-contracts.ts`
- 以及页面调用的应用目录、数据菜单、数据空间与维度来源服务。

导航链路：

- 固定提交 `apps/appworks/src/ui/features/application/application-manager/application/application-manager-service.ts` 将 `project` 目标绑定到原 `vue:/.../application-function-page` URL，调用 `enterApplicationMenuContext` 进入该应用菜单上下文。
- `openApplicationBlueprintNode` 仍使用同一业务 URL，但将 `applicationId` 作为宿主身份，并以查询参数单独传 `nodeId` 和 `blueprintTab=dataSpace`。
- 页面再从唯一菜单宿主上下文解析应用身份；`useApplicationFunctionPage` 读取 `nodeId` 与 `blueprintTab`，加载并定位树节点。
- 因而应用/项目身份、节点身份、数据空间场景身份和页面导航 URL 是不同值，不能相互代替。

## 参考节点、导航与数据访问事实

- `AppWorksProjectBlueprint` 按固定提交的 API 场景和 `applicationId` 建立 owner；节点记录映射为 `rowid → nodeId`、`prowid → parentNodeId`、`sysid/SysId → applicationId`、`conid → dataSpace.scenarioId`。
- `scenarioId` 是 SPARK API 执行身份；它不等于 `applicationId`，也不等于节点 `nodeId`。
- 参考规范节点 kind 为 `module`、`page`、`embedded`、`service`、`content`；旧代码字段 `conType` 会归一到该 kind。
- 节点导航 `navigation.target` 与节点 ID 分离，规范目标要求 `vue:/...`。本蓝图页的目标路径不带 `.vue`，并非 `/dev` 路由。
- 参考 owner 通过运行时 API 查询/写入，并检查当前页面执行域、应用归属、导航旧基线和写后读回。这是参考源码事实，不授权本仓页面旁路 DataView。
- 参考页嵌入 `DataSetAuthPage`，且导航宿主关系可打开权限配置；但 `AGENTS.md` 当前原则暂缓新增/扩展数据权限接入。因此，参考行为存在，不代表本阶段可以未经核定新增权限接线。

## 本仓现状与 `/dev` 真实消费者

### 路径和页面注册

- `config/navigation/appworks-system.json` 仍保存项目蓝图子项原 URL：`vue:/features/application/application-function-management/ui/application-function-page`。核对时该子项未列入 `publishedNodeIds`，因此不能仅凭仓内记录断言它当前已出现在运行菜单。
- `config/navigation/vue-pages.json` 只将 `/dev` 注册到 `src/views/app/dev-system/DevSystem.vue`；`src/registries/vue-page-registry.ts` 按配置路径构建组件注册表。原业务 URL 没有对应 Vue 页登记，仓内 `src/views/features/application/application-function-management/` 也未找到。
- `src/main.ts` 将页面注册表交给应用启动配置；`src/lowcode/lowcode-runtime.ts` 从 app 页面构建“SPARK 工具”项，并在无业务页面时将 `/dev` 用作 landing fallback。源码没有将原 `vue:/.../application-function-page` 自动映射为 `/dev` 的逻辑。

### `/dev` 当前不可整体退役的证据

- `/dev` 还有导航/路由消费者：默认系统工具项、无业务页 landing fallback、`packages/spark-app/src/navigation/nav-access.ts` 的默认首页回退；演示租户 JSON 及租户设置 UI 也保存/展示 `/dev`。
- `DevSystem.vue`、`useDevSystem.ts`、`useDevState.ts` 提供现存工作台；蓝图树及 `BlueprintWorkspace` 处理项目蓝图，工具文件通过 `ProjectToolFile` DataView/FileResource 通道管理，并被 AI 页面设计、项目策划等工作流使用。
- `src/services/project/project-shell.ts` 的 `ProjectWorkspace` 生命周期还由应用壳使用；项目策划/页面设计、AI workflow bindings 等也依赖相关能力。
- `PageRuntime` 与动态页面装配是全应用运行链，不等同于 `/dev` UI；退役 `/dev` 页面注册不意味着可以删除该通用运行时或底层项目能力。
- `packages/vite-plugin-spark-catalog/src/scan-config.ts` 排除 dev-system 文件自动扫描，但 Vue page registry 仍显式登记 `/dev`；自动扫描排除不是没有消费者。
- 现有源码与消费者不足以证明 `/dev` 整体可安全退役。保守默认是保留其现有功能；原参考 URL 才是唯一规范业务导航身份。可拆离 UI 与底层服务必须分别核定，不能由“保留 `/dev`”推导它等于目标业务页。

### 当前蓝图数据与 owner

- 当前工作台动态项目通过正式 `Base_NavigationInfo` 蓝图 DataView 读取；仓内 AppWorks 项目走只读仓库蓝图资源。
- `ProjectBlueprintTree.vue` 与 `BlueprintWorkspace.vue` 消费当前项目蓝图 DataView 和运行时；已有阶段包括基本信息、只读信息、数据空间、导航和交付相关职责，但尚无证据证明与参考页其余功能等价。
- 当前 `useDevState.ts` 按工作区、项目管理 owner bundle 与活动租约；同项目仍有活动持有者时拒绝第二个持有者。测试覆盖特定 effect scope 生命周期与受限续接，但不能证明独立导航入口/标签页可无条件共享 owner。
- 参考 `applicationId` 到本仓 `projectId` 的正式桥接，以及原 URL 下如何复用正在编辑的 owner、草稿和未保存状态，仍未确认；不得用节点 ID、项目展示名或新开第二 owner 猜测。

## 测试与验证边界

- 本仓相关测试包括 DevSystem 状态/文件闭环与 owner 生命周期、项目蓝图 DataView、命令输入、交付、离页保护和顶栏保存测试；根 Vitest 配置收集相应 tests 路径。
- 固定参考提交存在项目蓝图 owner/model、页面初始化/视图、节点交付核验、维度来源及提交编辑器测试。
- 本次是只读研读，没有执行测试或浏览器验收；测试存在不代表参考功能已在本仓逐项验收。
- 当前 `pnpm run dev` 的说明是启动 Vite 并代理 `/api` 到既有 gateway；本任务不改 Java、不增加 Node 服务。

## 事实与未确认项

**已确认：**

- 固定参考提交的业务 URL、页面源路径、页面直接能力及数据 owner 身份映射。
- 原蓝图业务 URL 与 `/dev` 是不同身份；当前 `/dev` 有多个真实导航/landing/配置消费者。
- 当前工作台使用 DataView/项目工作区能力，且有同项目 owner 租约拒绝并行持有者。
- `/dev` 整体退役安全尚无证据，须保留现有功能；保留 `/dev` 不等于把它认作蓝图页迁移完成。

**仍未确认：**

- 参考 `applicationId`、本仓 `projectId`、请求/租户身份的正式映射合同。
- 原参考 URL 在 `/dev` 单一入口下的精确加载与菜单发布过程。
- 新的业务页如何在不重复创建 owner 的前提下复用现有同项目工作区、脏状态与保存中的操作。
- 页面内权限配置入口和当前暂缓数据权限接线原则的范围关系。
- 参考页全部子功能映射到本仓 DataView/标准组件后的完整影响文件集合与可分批交付边界。

## 续查后的正式身份合同

以上现状和未确认清单属于初次研读，不是当前实施断点；实施与验收状态只续写唯一台账。

- 当前请求 `X-AppId` 是场景装配的执行应用；蓝图数据库查询的 `SysId` 才是被设计目标，两者允许不同，不改认证头。
- 系统页正式身份由 resolver 的已解析 `route.meta.nodeId` 提供，`__sparkNavigationId` 仅为可选的导航消歧标记；存在时须一致，不能要求唯一可解析路径也必传该标记。
- 正式导航的唯一宿主关系提供 `ValParamName/TextParamName`，页面按该配置读取目标查询值；再用宿主候选及当前租户正式应用目录核验，不回退执行应用或其他同名参数。
- 蓝图页提供唯一 owner 已装配的实际 PageRuntime；表单字段直接绑定其 DataView，保存/取消作用于原编辑覆盖。参考的显式保存语义不能由现有 `NodeBasicInfo` 的自动保存代替。
- 这些身份与组件合同不证明全页已迁移。全树查询向参考懒加载迁移、全部表单字段和批次2–4仍按同一完整页面目标核验。
