状态：implementing

## 任务目标

以参考仓固定提交 `1147b00ee53a1476d4ee715c61368b453a215192` 的 `apps/appworks` 项目蓝图页为完整功能基准，在本仓保留原业务 URL
`vue:/features/application/application-function-management/ui/application-function-page`，并将组合页真实业务放在
`src/views/features/application/application-function-management/ui/` 下。

页面必须经本仓动态系统页与现有 PageRuntime/DataView 链运行；不把 `/dev` 当目标页、不整体退役 `/dev`、不建立第二套应用架构、不复制参考 Vue 整页、不修改 Java、不增加 Node 服务。除权限配置外，按下列批次完成参考页功能；权限配置独立登记为后续批次，本计划不实现也不宣称其验收完成。

## 范围纠偏与实施前提

- 用户要求接入的是参考仓整个 `apps/appworks`，本计划仅为其中项目蓝图业务的子计划。全部业务域、宿主、组件、数据与运行时代码及逐项验收状态以唯一台账为准，路径存在不代表功能已迁移。
- 当前未提交页面是中断的工作，尚未形成可发布入口。它把宿主应用误作被设计应用，强制要求节点参数，未为标准组件提供实际的蓝图 PageRuntime，并使用了不符合参考显式保存语义的共享组件。应用管理的项目管理入口仍未接通；不能凭 mock 测试或 typecheck 通过宣称业务完成。
- 常规项目管理入口允许没有 `nodeId`；维度来源等深链接才额外传入节点及 `blueprintTab`。目标应用必须通过当前正式导航宿主关系解析；参考宿主的参数名称由 `ValParamName` 等配置确定，不能固定假定为路由应用 `projectId`。
- 执行应用、被设计应用、导航节点、蓝图节点和数据空间是不同身份。加载元数据场景时保持当前执行应用及原有认证校验；目标应用作为正式查询值进入既有 DataView。工作区租约、草稿、未确认回执、数据权限与文件持久边界不得因跨应用设计被绕过。
- 业务页中的新增、保存、取消和切换须匹配参考业务语义，提交通过 DataSet/DataView 并按实际回执回读；存量 `/dev` 的自动保存行为不能直接当作本页合同。懒加载树、父链定位、失败与异步失效按参考流程和本仓公共链核实，不能将当前全树加载写成已完成。
- 修复前先隐藏中断实现产生的合成壳工具入口；仅在正式原导航、宿主参数与实际 PageRuntime 和业务闭环验证后开放。不得因有同名页面或路径就发布不可用入口。

## 阶段与业务语义

### 全局身份与 owner 不变量

- 页面通过正式导航节点身份定位并保持上述原 `vue:/...` URL；节点身份、资源 URL、浏览器路径、执行应用、被设计应用、蓝图节点 `nodeId` 和数据空间 `scenarioId` 分离。
- 业务页通过原应用菜单宿主上下文获取应用身份；`nodeId`、`blueprintTab=dataSpace` 等查询参数只定位当前节点与阶段，不能充当项目身份或资源 URL。
- 复用本仓现有 `ProjectWorkspace` / 蓝图 DataView；owner 独占。仅在原 owner 已释放且身份、scope 均匹配时才可接管。活动 owner、身份不匹配或未确认保存状态存在时明确阻止；不创建第二 DataView、不自动保存/丢弃、不绕租约。
- `applicationId` 与本仓 `projectId`、请求/租户身份的桥接，以及释放/接管 API 的真实合同，均为实施前置核验。核验不通过时将本计划标记 `blocked`，不得猜字段或增加并行 owner。

### 批次与验收矩阵

| 批次 | 完整业务能力 | 必须通过的验收结果 | 主要证据 |
|---|---|---|---|
| 1. 原生入口、PageRuntime 与核心蓝图 | 在页面 registry 中正式注册原 `vue:/.../application-function-page`；由应用管理器入口建立上下文并经本仓动态系统页/PageRuntime 加载；解析应用身份、`nodeId`、`blueprintTab`；蓝图树懒加载/定位、根与子节点增删、拖动排序、基本信息读写。 | 不是只有 route stub：页面真实挂载、加载当前 DataView、显示并定位正确项目/节点；原 `/dev` 工具入口仍可用。活动 owner 时拒绝新 owner；释放后只接受身份匹配的 owner；不发生双 DataView、未请求写入或自动保存/丢弃。 | 新增 page-registry、动态运行时与 DataView 测试；DevSystem owner 租约回归；浏览器验证原 URL 的动态入口。 |
| 2. AI 与需求原型 | AI 下一级节点与表单填充先严格校验并预览、用户确认后写入/回填；富文本原型编辑、上传状态、清洗与预览、版本列举/新增/应用/删除。 | 非法 AI 结果不能写入；取消预览无写入；原型保存/版本操作通过 DataView/正式命令并确认结果；图片未完成或失败时阻止保存；切换节点不会串数据。 | 新增页面 workflow 测试；原型 HTML 清洗、版本、请求迟到/节点切换测试；隔离浏览器 smoke。 |
| 3. 数据空间与维度来源 | 节点主数据空间绑定/改绑、影响范围查询、内容设计入口；维度来源映射/集合编辑、事件编辑、来源提交协议草稿及正式回读。 | `scenarioId` 只从已确认绑定读取；影响范围使用正式节点身份与完整父链；来源模型必须属于所选节点正式 DataSet；未验证的服务合同阻止写入并报告未完成，不猜接口或字段。 | DataView/DataSet 测试；维度来源、事件及提交草稿测试；本地隔离夹具浏览器验证。状态：3a 与 3b 已按台账“蓝图批次3a”“蓝图批次3b”验证（含隔离烟测与阶段0认证只读核验）；页面未发布，实服打开核验与维度运行时缺口另行登记。 |
| 4. 导航、桌面与交付 | 导航属性、图标/排序、PC/移动 target、显示/打开/布局属性；桌面新增/取消显示；导航宿主关系分页与 CRUD、DataSet/资源/字段映射；子树交付核验与需求说明书导出。 | 导航保存以当前 DataView 基线防止 stale overwrite；target 精确规范且只针对当前应用交付；宿主关系字段映射稳定；桌面状态保存并读回；交付核验检查完整子树且唯一命中；导出只报告真实服务回执。 | 导航 stale-write、owner 行身份、桌面/宿主 CRUD、交付子树/重复目标测试；动态页面浏览器 smoke。 |
| 5. 权限（后续独立批次，不在本计划实施） | 参考页的数据空间权限配置及导航宿主权限配置两个入口与其完整合同。 | 仅在本仓权限专题恢复并单独审核后迁移、验证；当前蓝图批次不新增/扩展数据权限接线，不把入口缺失说成权限功能完成。 | 唯一台账保留未完成项；另行方案与审核。 |

全页完成定义：批次1–4均按参考功能通过各自矩阵，批次5明确保持未完成并由台账追踪；不得把批次1的 URL/加载成功冒充完整蓝图迁移，也不得宣称全平台或权限验收完成。

## 影响范围

### 预计新增的业务源码

以下文件全部位于参考业务相对目录；只实现本仓组件/DataView 合同，不照抄参考 SFC：

- `src/views/features/application/application-function-management/ui/application-function-page.vue`：原生页面组合入口，处理 PageRuntime 上下文与 view state，不承载第二套项目 owner。
- `src/views/features/application/application-function-management/ui/use-application-function-page.ts`：该页的交互编排；只消费正式 DataView、已存在的命令/服务与页面上下文。
- `src/views/features/application/application-function-management/ui/application-function-page.css`：页面布局与局部样式；沿本仓现有 CSS，不为参考 SCSS 语法额外引入预处理依赖。
- `src/views/features/application/application-function-management/ui/blueprint-node-verify.ts`：蓝图子树到交付目标的纯核验逻辑。
- `src/views/features/application/application-function-management/ui/blueprint-dimension-source.vue`：维度来源工作区。
- `src/views/features/application/application-function-management/ui/blueprint-dimension-event-editor.vue`：维度事件编辑器。
- `src/views/features/application/application-function-management/ui/blueprint-source-commit-editor.vue`：来源提交协议版本编辑器。

### 预计修改的现有配置、工作区边界及测试

- `config/navigation/vue-pages.json`：以 registry 的现有记录格式登记 path `/features/application/application-function-management/ui/application-function-page`，source 为上述页面文件，scope 按已核实的当前 app 页面合同设置；不添加 `/dev` 别名。
- `config/navigation/appworks-system.json`、`src/views/features/application/application-manager/ui/application-manager-page.vue`：核实并在业务闭环具备后接入原正式导航节点和应用管理入口，不使用合成壳工具身份替代授权导航。
- `src/views/app/dev-system/nav-host-project-picker/NavHostProjectPicker.vue` 及其相关宿主绑定公共实现：核对正式导航宿主关系和参数名称，复用 DataView 查询、身份及权限合同；必要的公共提取和调用方修改需先确定完整影响面。
- `src/services/project/project-shell.ts`、`src/lowcode/data-space/lowcode-data-space-runtime.ts` 及实际场景资源装配/工作区调用方：核对并分离执行应用与被设计应用，继续执行现有认证守卫，不为页面建立旁路查询或存储通道；具体修改仅在对应真实合同与影响面查清后实施。
- `src/views/app/dev-system/useDevState.ts`：仅当实现前核读证实现有 owner 的释放/身份匹配接管无法由目标页调用时，才在本计划范围内暴露/复用现有独占合同；不得复制 owner/DataView。若需要改变 owner 不变量、自动提交或丢弃，即停止并修订计划。
- `tests/app/config/vue-page-registry.test.ts`：覆盖原资源路径注册及组件 source 映射。
- `tests/runtime/auth-nav/navigation/lowcode-runtime-navigation.test.ts`：覆盖原资源 URL 保持原身份且经现有导航解析；不移除 `/dev` tool/landing 断言。
- `tests/runtime/page/runtime/system-page-identity-tabs.test.ts`：覆盖动态系统页/PageRuntime 中 app 与 page identity 的隔离。
- `tests/app/dev/dev-state-page-file-closed-loop.test.ts`：补充/保持 DevSystem owner 独占、释放后身份匹配接管以及失败不改变原未保存状态的回归。
- `tests/app/services/project/blueprint-workspace-dataview.test.ts`：覆盖新业务入口使用现有 DataView 的行身份、字段权限与查询上下文。
- 新增 `tests/app/features/application/application-function-management/application-function-page-entry.test.ts`：原 URL、宿主上下文、query identity、PageRuntime 与 owner gate。
- 应用管理、导航宿主、项目工作区及场景资源装配的现有对应测试：覆盖宿主与目标不同、动态参数名称、无节点普通入口、节点深链接、独占租约、错误及真实 DataView 绑定；以实际文件位置为准。
- 新增 `tests/app/features/application/application-function-management/application-function-page-workflows.test.ts`：树、基本信息、AI 与原型流程。
- 新增 `tests/app/features/application/application-function-management/blueprint-dimension-source.test.ts`：来源绑定、事件、提交草稿及失败阻断。
- 新增 `tests/app/features/application/application-function-management/blueprint-node-verify.test.ts`：子树遍历、未知子节点与目标唯一性。
- `notes/data-space-retirement-ledger.md`：每批完成后只更新唯一现有台账中的蓝图迁移项、未完成项与证据；不新建并行总体台账。

### 只读依赖（本计划不预先改动）

- 导航与运行时：`src/registries/vue-page-registry.ts`、`src/main.ts`、`src/lowcode/lowcode-runtime.ts`、`config/navigation/appworks-system.json`。
- 现有蓝图及 owner：`src/views/app/dev-system/DevSystem.vue`、`src/views/app/dev-system/useDevSystem.ts`、`src/views/app/dev-system/ProjectBlueprintTree.vue`、`src/views/app/dev-system/blueprint-workspace/BlueprintWorkspace.vue`、`src/services/project/blueprint-workspace-dataview.ts`、`src/services/project/project-shell.ts`、`src/lowcode/resources/repository/builtin-blueprint-node-resource.ts`、`src/lowcode/resources/repository/builtin-system-navigation.ts`。
- 模型合同：`packages/spark-project-model/src/blueprint/project-blueprint-node.ts`、`packages/spark-project-model/src/blueprint/project-blueprint-tree.ts`、`packages/spark-utils/src/contract/project-blueprint-node-kind.ts`。
- `config/navigation/appworks-system.json` 已含原 URL，但目标未进入当前 `publishedNodeIds`。它与 Vue 页注册是不同合同。本计划默认不改发布列表；若源码证明菜单投影必须改变，先停下修订方案，不能顺手发布节点。
- 不修改 Java/API 合同、不新增 Node 服务、不改通用 registry/runtime，不整体移除 `/dev`。

## 技术方案

### 已验证成组检查点：正式宿主目标与页面基本编辑（整页仍执行中）

- 沿上一组已核实的固定参考合同，蓝图页从正式导航身份查询唯一宿主关系，按配置的值参数读取目标；再通过候选 DataView 精确查询和读取权限核验，不回退路由执行应用。
- 修改 `nav-host-project-picker-contract.ts` 返回已校验的值/文案参数名称；现有 picker 消费不变，定向测试补充配置参数保留。
- 在本页 `use-application-function-page.ts` 使用已有 NativePageRuntimeSession 装配宿主和候选，始终保留执行应用身份；切换、卸载及迟到响应失效，失败不提供旧目标运行时。复用现有 `openEditingProject`、独占 owner 与真实蓝图 PageRuntime，不复制数据 owner。
- 普通入口不要求节点参数；显式节点参数仍精确核验，不猜第一个节点。宿主目标和节点变更时，未处理编辑、未知回执均阻止换目标。
- 页面通过能力树提供实际蓝图 PageRuntime；基本信息改为直接绑定标准表单与字段，在原 DataView 编辑覆盖中保存/取消，不复用自动保存表单。修改范围限本页 `.vue`、hook 和既有页面入口测试。
- 本组不发布该页面，不把仍采用全树读取的现有 owner 当作已完成懒加载。树加载、参考全部表单字段和批次2–4继续在同一完整页面目标下实施。
- 验证：真实 SparkData/PageRuntime 夹具覆盖动态宿主参数、执行/目标分离、无节点入口、深链、失效及基本信息显式保存/取消；定向 picker/owner/页面测试、typecheck、lint和构建。

### 已验证成组检查点：执行应用与目标应用分离

- 元数据场景由当前请求的执行应用装配；所选项目只作为蓝图 DataView 的查询目标，不能替换 `X-AppId` 或触发执行应用切换。
- 在 `src/views/app/dev-system/useDevState.ts` 修正场景装配参数，并将执行应用加入 owner 租约核验；继续保留文件 gateway 的目标归属守卫。
- 在 `tests/app/dev/dev-state-page-file-closed-loop.test.ts` 通过真实 DataView 验证跨目标读取、执行身份失效及租约，修正原先将场景装配应用当成查询目标的夹具假设。
- `NavHostProjectPicker.vue` 的关系及候选场景同样按执行应用装配，并在选中项目提交前保持原执行上下文核验；`nav-host-project-picker-render.test.ts` 验证候选值与装配身份分离。
- 导航宿主绑定消费正式配置中的 `ValParamName` / `TextParamName`，不强制前者为 `projectId`。影响 `nav-host-project-picker-contract.ts`、`nav-host-project-relation-command.ts` 及各自同名测试；保留原字段读取权限与候选身份核验。
- 这些是蓝图完整接入批次中的公共链修正，不单独宣称蓝图或全平台完成；未完成页面继续隐藏，不发布占位入口。

1. 实施前再核读全部上述现有依赖及目标文件当前内容，确认 Vue registry 的 path/scope/source 格式、应用菜单上下文到 PageRuntime 的真实装载链，以及 `applicationId`↔`projectId` 映射。
2. 查明现有 owner 的 lease acquire/release 与 dirty/unconfirmed 生命周期。目标页只接管已释放且 scope/项目身份匹配的唯一 owner；活动/未知持有状态 fail closed。若无现有可调用合同，停止并将计划标为 `blocked`，不得为赶路由复制 DataView 或 owner。
3. 先完成批次1，使原 URL 可动态加载并真实读取/编辑核心蓝图；同一批验证 route、运行时、DataView 与租约。不能把仅配置注册当作完成。
4. 按批次2、3、4逐项迁移完整业务语义；每批只依赖已核实的现有 SPARK DataView/标准组件合同。业务 Vue 不直接组装 Element Plus CRUD，不直接调用参考仓 API。
5. 权限入口留在独立后续批次；本计划的权限功能差距不以空壳、静默兜底或按钮伪装成完成。
6. 每个批次完成后运行其针对性测试并更新唯一台账；整页批次1–4完成后执行总体验证及人工 smoke。审核前不改生产代码、测试或配置。

## 兼容性

- 规范业务 URL 保持参考值，不以 `/dev`、新 alias 或文件后缀替换。
- `/dev` 保留其已证实的独立消费者和能力；本计划不删除其页面、默认入口、工作区及工具文件功能。
- 单一应用壳、单一动态页面/运行时与单一 DataView owner；不创建第二应用或并行数据链。
- 不承诺未知身份、权限、服务端写入或跨来源事务。服务合同缺失、读回不一致、owner identity 不匹配均显式阻断；不宣称服务端行为或回滚结果。
- 不考虑保留迁移临时 alias；既有 `/dev` 是仍有消费者的独立系统功能，不是为兼容旧蓝图 URL 保留的 alias。

## 验证计划

每批先执行针对性验证，批次1–4结束后再做整页回归：

- 类型检查：`pnpm run typecheck`。
- Lint：`pnpm run lint`。
- 定向测试：`pnpm exec vitest run` 加载本计划列明的 registry、navigation、PageRuntime、owner、DataView 及新增项目蓝图测试文件。
- 规则与构建：`pnpm run verify:rules`、`pnpm run build`；不得用旧通过记录替代本轮结果。
- 人工/浏览器 smoke（隔离测试项目或服务夹具，不写真实业务数据）：从应用管理器以原 `vue:/.../application-function-page` 打开；确认页面经动态系统页/PageRuntime 链挂载；在查询参数中定位节点并切到数据空间阶段；在 `/dev` owner 活动、已释放匹配、身份不匹配及未确认状态下分别验证阻止/允许边界；验证页面内各批业务动作、取消、失败和精确读回。
- 真实服务/API 合同未具备认证环境或正式身份时，记录为未验收/阻断，不以 fixture 结果替代实服证据；不执行 Java 构建/部署或新增服务启动。

## 风险项

- **身份边界：**执行应用与动态被设计目标已分离并验证；跨仓内文件来源与工具文件的真实归属仍须核验，不能将数据库目标的验证外推到全部来源。
- **owner 接管：**继续使用已验证的活动租约拒绝、释放后同身份续接及待确认保留合同，不新增第二 owner；不能把可续接推断为活动owner可并行共享。
- **树懒加载：**现有蓝图owner的树投影和结构命令仍假定全树，普通查询和保存会重查完整树；通用 `DataView.loadTreeChildren` 当前只调用 `TreeManager` 的 `api.children` HTTP端点，不是本页正式DataSpace查询owner，不能直接套用。下一组先明确同一DataView的正式查询增量装载、原行权限/回执及完整性边界，再修改数据层与标准组件；不通过页面append临时行、伪造权限或新建Node/Java端点规避。
- **导航投影边界：**仓内菜单记录未发布与动态 Vue 页面注册并非同一件事；不擅自改 `publishedNodeIds`。
- **服务合同：**原型、导航宿主、维度来源、桌面、交付/导出等各自的读写与正式回执必须以本仓现有服务为准；任何缺失或不一致均停止对应批次并记录。
- **权限范围：**两个权限入口排除当前蓝图批次，后续需按本仓权限专题另行方案审核；不能因此缩小全平台总体迁移目标。
- **批次范围大：**每批须完成表内业务闭环和证据；批次未通过时总体蓝图迁移保持未完成，不以路由、页面骨架或局部测试通过结题。
