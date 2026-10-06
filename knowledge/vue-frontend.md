# Vue 前端

### 框架无关包禁止导入 Vue

- **场景**：在 `packages/spark-data/` 或 `packages/spark-utils/` 中编写代码
- **规则**：`spark-data` 和 `spark-utils` 是框架无关包，禁止导入 Vue、Vue Router、Element Plus、VueUse 或 Pinia。需要响应式的逻辑应放在 `spark-component/` 或 `src/` 中。
- **违反后果**：`verify:ai-codegen` 会报违规；框架无关包与 Vue 耦合后无法在非 Vue 环境中使用

### .props.ts + .vue 必须配对入子目录

- **场景**：新增一个表单字段组件（如 FieldDatePicker）
- **规则**：`.props.ts` + `.vue` 配对文件必须放入组件专属子目录（如 `data-components/FieldDatePicker/FieldDatePicker.props.ts` + `FieldDatePicker.vue`），禁止平铺在父目录。
- **违反后果**：`verify:ai-codegen` 检测组件配对文件平铺会报违规；平铺后目录文件数很快超过 10 个限制

### Element Plus 组件的使用约定

- **场景**：在页面视图中使用 UI 组件
- **规则**：本项目统一使用 Element Plus 组件库。图标使用 `@element-plus/icons-vue`。表格场景优先使用 `vxe-table`（高性能虚拟滚动），普通表单用 Element Plus 原生组件。
- **违反后果**：混用其他组件库（如 Ant Design Vue）→ 样式不一致、包体积膨胀

### Vue 3 Composition API

- **场景**：编写 Vue 组件逻辑
- **规则**：使用 Composition API（`<script setup>` + `useXxx` 组合式函数），不使用 Options API。状态管理用 Vue 3 原生响应式（`ref`/`reactive`/`computed`），不引入 Pinia 除非涉及跨组件全局状态。
- **违反后果**：Options API 代码与项目风格不一致，增加维护成本

### src/services/ 的领域分组

- **场景**：在前端服务层新增或修改代码
- **规则**：`src/services/` 必须按领域分组（`ai/`、`page-design/`、`project/`），不是平铺。同一级目录下文件和子目录不超过 7 个。
- **违反后果**：平铺后超过 7 个条目违反目录规则；AI 和人类都难以定位相关服务

### src/views/ 的路由对应

- **场景**：新增页面视图
- **规则**：`src/views/` 的目录结构与路由对应：`app/` = 应用页面，`platform/` = 平台管理，`tenant/` = 租户管理。`dev-system/` 工作台以同一ProjectWorkspace管理蓝图和PageTool，场景设计器消费其显式ScenarioViewFile；运行预览使用独立PageRuntime，不能把编辑对象或运行数据混为同一实例。
- **违反后果**：视图放在错误目录下 → 路由配置找不到组件

### 数据权限由原查询 owner 持有

- **场景**：将后端查询数据与权限接到 DataView 和组件。
- **规则**：当前 DataSpaceRuntimeApi 查询生成私有 DataSpaceQueryContext，DataView 经绑定 owner 消费双通道、动作状态与保存基线。公开行剥离权限名单和token；UI/assembler不另写标签或allowAdd推导。旧公开快照mapper已删除。
- **违反后果**：第二套权限投影会脱离实际原查询身份和后端凭据。
- **发现来源**：2026-08 系统结构 SSOT 归并（批次 D）；2026-10 按原查询owner替换旧mapper规则。

### SparkNode 类型与 helpers 只从 spark-data 导入

- **场景**：任意包内/测试/宿主需要 `SparkNode` / `SparkNodeChildren` 类型，或 `getSparkNodeChildren` / `nodeId` / `normalizeSparkNode` / `isSparkNode` / `nodeInputProp(s)` / `SPARK_NODE_STRUCT_KEYS`
- **规则**：一律直连 `@spark-appworks/spark-data`。`spark-component` 公共入口、`core/types`、`components/internal` 均不再转发这些符号。`Spark.nodeId` / `Spark.STRUCT_KEYS` 等命名空间方法可保留（内部仍调 spark-data）。能力树遍历 `sparkFindNearestProvider*` 只从 `@spark-appworks/spark-utils` 导入。
- **违反后果**：类型/函数 SSOT 分叉；机械改写多行 import 时易嵌套损坏
- **发现来源**：2026-08 系统结构 SSOT 归并（helpers 公共面收口）

### ComponentPermissionActionContext ≠ PermissionActionContext

- **场景**：组件渲染层需要带 `permissionMode` 的动作权限上下文
- **规则**：脚本/数据层用 `@spark-appworks/spark-data` 的 `PermissionActionContext`；组件层用 `ComponentPermissionActionContext`（component 包）。禁止同名交叉导出。
- **违反后果**：同名双语义，脚本契约与渲染契约互相污染
- **发现来源**：2026-08 SSOT PermissionActionContext 收口

### Dialog/Drawer API 用 VisibilityContainerApi

- **场景**：r-dialog / r-drawer 的 zero-code API 类型
- **规则**：统一 `VisibilityContainerApi`；禁止 `RendererDialogApi` / `RendererDrawerApi` 薄别名文件
- **违反后果**：同结构多名字，改 API 漏改一边
- **发现来源**：2026-08 SSOT 薄别名清理

### DataView 查询结果与私有权限同源

- **场景**：DataView / DataSpace 查询返回
- **规则**：消费当前 DataViewQueryExecutor/DataViewQueryResult 边界，由原查询owner提供数据、总数、行身份和权限入口。该结果不是公开可替换权限快照，业务组件只使用DataView。
- **违反后果**：回生旧快照登记会绕过原查询基线，产生身份与授权不一致。
- **发现来源**：2026-08 SSOT 薄别名清理；2026-10 随私有查询结果合同更新。

### 台账 WireJsonObject ≠ json-document JsonObject

- **场景**：在 `backend-api-contracts` 描述未定型后端 JSON 袋
- **规则**：使用 `WireJsonObject` / `WireJsonArray`（`Record<string, unknown>`）。递归严格 JSON 值用 `@spark-appworks/spark-json-document` 的 `JsonObject`
- **违反后果**：同名双语义，误把未知 wire 袋当成可校验 JsonValue 树
- **发现来源**：2026-08 SSOT JsonObject 归并

- **场景**：想在组件公共面导出 `FieldRenderConfig`/`FieldRenderState`/`LoggerApi`/`LogLevel`
- **规则**：定义包直连：`FieldRenderConfig`→utils，`FieldRenderState`→data，`LoggerApi`/`LogLevel`→utils。组件可增广自己的 `PermissionActionContext`；禁止纯 `export type { X } from '@spark-appworks/...'`
- **违反后果**：类型 SSOT 分叉，改定义包时漏改消费面
- **发现来源**：2026-08 SSOT G7

### AjaxResult 台账与运行同形

- **场景**：改 `backend-api-contracts` 或 `spark-lowcode-api` 的响应外壳
- **规则**：两侧正式名均为 `AjaxResult`（已删 `LowcodeAjaxResult`），`Code` 必填；改任一处后跑 `pnpm run verify:ajax-result-parity`
- **违反后果**：可选 Code 与运行解包假设冲突 → 假成功或误抛
- **发现来源**：2026-08 SSOT G8

### SendCodeType 台账与运行同形

- **场景**：验证码投递渠道（EMAIL / MOBILE）与业务场景全集
- **规则**：两侧正式名均为 `SendCodeType` / `SendCodeScene`（已删 `LowcodeVerificationChannel`）；改任一处后跑 `pnpm run verify:send-code-parity`。门面 DTO 字段仍可叫 `channel`，类型必须是 `SendCodeType`。`LowcodeVerificationScene = Extract<SendCodeScene, 'REGISTER' | 'REGISTER_ENT'>`，勿再手写双字面量联合
- **违反后果**：第二正式名复活；wire `type`/`scene` 与门面漂移
- **发现来源**：2026-08 SSOT SendCodeType/Scene 收口

### WireFilterOperator / OrderType 与 spark-data 分层

- **场景**：DataView 过滤/排序投影到 GetData wire
- **规则**：公开过滤树与排序类型来自 `@spark-appworks/spark-data`；wire 正式名 `WireFilterOperator` / `OrderType` / `GroupFunType` 在台账与 `spark-lowcode-api/contracts/lowcode-wire-query.ts` 同形（`verify:wire-query-parity`）。转换在 API 包的 `platform/data-space/runtime/protocol/data-space-filter.ts`，宿主assembler不维护第二mapper。`AggregateType` 仍属spark-data，不与GroupFunType硬合并或同名。
- **违反后果**：同名冲突、错误 wire Operator、排序 direction 内联联合再分叉
- **发现来源**：2026-08 SSOT wire-query 收口

### ProjectBlueprintImplGate SSOT 在 project-model

- **场景**：蓝图节点与pageDesign runner读取实现放行闸门。
- **规则**：只用 `@spark-appworks/spark-project-model` 的 `ProjectBlueprintImplGate`。当前节点读取source实际implGate，上游合同缺失时fail closed；后端没有对应可写字段，不得在DevSystem伪造source成功或新增编辑控件充当持久放行。
- **违反后果**：闸门字面量漂移；strictImplGate 语义分叉
- **发现来源**：2026-08 SSOT implGate 收口；2026-10 按实际可读及不可写边界校准。

### HttpEndpoint.method 复用 spark-utils Method

- **场景**：spark-data 树/CRUD 端点元数据、component 上传选项声明 HTTP 方法
- **规则**：`HttpEndpoint.method` 与 `PageUploadFilesOptions.method` 均基于 `@spark-appworks/spark-utils` 的 `Method`（上传可用 `Extract<Method, 'POST'|'PUT'|'PATCH'>`）。台账 `HttpMethod`（仅 GET|POST）仍属 endpoints 台账，勿与客户端 Method 硬合并
- **违反后果**：端点方法字面量与 HTTP 客户端再分叉
- **发现来源**：2026-08 SSOT Method 收口

### DataSpace 资源类型分层与 CN wire 映射

- **场景**：设计读回 Type 中文标签、运行写出 Type、目录 table/view、DataView TableResourceType
- **规则**：领域 `DataSpaceResourceType` 在 `data-space.ts`；CN↔领域唯一映射在 `data-space-resource-type-wire.ts`（`parseDataSpaceResourceType` / `encodeDataSpaceResourceType`）。目录用 `DataSpaceDatabaseResourceType = Extract<table|view>`。宿主LowcodeDataSpaceAssembler按正式模型字段与场景modelBinding装配；旧frontend-model-adapter已退役，不能从旧TableResourceType投影重建正式模型。
- **违反后果**：design/runtime 各维护一份中文表；orderType 自由字符串漏网
- **发现来源**：2026-08 SSOT data-space resource-type 收口

### Element Plus 表排序勿当 wire OrderType

- **场景**：RendererTable `@sort-change`
- **规则**：UI 用本地 `ElementPlusTableSortOrder` + `toSortDirection` → spark-data `SortDirection`。禁止组件 import wire `OrderType`
- **违反后果**：UI 层与 wire 字面量耦合
- **发现来源**：2026-08 SSOT RendererTable sort 收口

- **场景**：在 `ai-coding-kit/` 发现 `verify-*.mjs` 或想“同步一份底板脚本”
- **规则**：可执行门禁 SSOT 仅 `tools/`；`ai-coding-kit/` 只保留 `AGENTS.md` 标准文档。移植到新项目时从 `tools/` 拷贝脚本，禁止在 kit 内维护第二实现
- **违反后果**：kit 副本漂移（曾仍指向已退役仓内 Java 服务端）→ 误用错误门禁或假绿
- **发现来源**：2026-08 SSOT G3

### PermissionMode 三态 SSOT 在 spark-utils

- **场景**：页面渲染、蓝图节点、壳层运行导航都需要 `'none' | 'masked' | 'invisible'`
- **规则**：只用 `@spark-appworks/spark-utils` 的 `PermissionMode` / `isPermissionMode`。禁止再定义 `PagePermissionMode` / `ProjectBlueprintPermissionMode` / `RuntimeNavigationPermissionMode`
- **违反后果**：同形三名，改一处漏两处
- **发现来源**：2026-08 SSOT PermissionMode 收口

### TreeNode 按域命名，禁止裸 TreeNode 公共导出

- **场景**：JSON 文档树、RendererTree、lowcode 蓝图树都有“树节点”
- **规则**：`JsonTreeNode`（json-document）、`RendererTreeNode`（component RendererTree）。编辑树节点用 project-model 的 `ProjectBlueprintTreeNodeData`。不要公共导出裸 `TreeNode`；不要把 `moveTreeNode` / `resolveTreeNodeText` 一并改名
- **违反后果**：跨包同名碰撞；误伤 DataView API
- **发现来源**：2026-08 SSOT TreeNode 收口

### lowcode 蓝图只保留后端记录

- **场景**：读 `Base_NavigationInfo` / GetNavigationMenus
- **规则**：lowcode-api 只暴露 `LowcodeProjectBlueprintRecord` + `LowcodeProjectBlueprintApi.readRecords` / `readNavigationAuthorization`。公共正式名用 `Lowcode*` 前缀：`LowcodeNavigationTargetKind` / `LowcodeNavigationAuthorization*` / `LowcodeProjectBlueprintDocument*`。禁止 `ProjectBlueprintApi`、`RuntimeNavigationTargetKind`、`RuntimeNavigationAuthorization*`、聚合 class。根 `src/lowcode/lowcode-runtime.ts` 用 `assembleLowcodeRuntimeNavigation` 直接装配壳 `RuntimeNavigation`
- **违反后果**：平台 wire 与项目模型/壳导航双真源；`RuntimeNavigation*` 命名误导为壳合同
- **发现来源**：2026-08 plan-project-blueprint-aggregate-ssot + Lowcode* 命名收口

### ContextItem / ContextSnapshot / ComponentInstanceSnapshot SSOT 在 utils

- **场景**：模块上下文选项、脚本沙箱、蓝图 context、壳导航 context
- **规则**：只用 `@spark-appworks/spark-utils` 的 `ContextItem` / `ContextSnapshot` / `ComponentInstanceSnapshot`。禁止 `ModuleContextItem` / `ModuleContext` / `PageComponentInstanceEntry` / `ProjectBlueprintContextItem` / `RuntimeNavigationContextItem`。`ModuleContextCapability` 可留在 component（能力接口）
- **违反后果**：同形多名，能力层与脚本层漂移
- **发现来源**：2026-08 SSOT ContextItem 收口

### 运行导航表面字面量 SSOT 在 spark-utils

- **场景**：蓝图交付投影与壳 `RuntimeNavigation*` 共用 item kind / placement / linkTarget / context config
- **规则**：只用 `@spark-appworks/spark-utils` 的 `RuntimeNavigationItemKind` / `NavigationPlacement` / `NavigationRootPlacement` / `NavigationLinkTarget` / `NavigationContextConfig`。禁止 `ProjectBlueprintDeliveryKind` / `ChildPlacement` / `ProjectLayoutPlacement` / 包内同形内联联合。`NavigationRootPlacement` 是 `header|sidebar` 子集，不可放宽为完整 `NavigationPlacement`。`NavigationContextConfig` 可写字段（编辑草稿会就地赋值），不要再套 `Readonly<>`
- **违反后果**：根布局被误写成 toolbar/user-menu；编辑草稿因 Readonly 编译失败；宿主再造 `ProjectLayoutPlacement` 薄别名
- **发现来源**：2026-08 SSOT navigation-surface 收口

### isThemeMode 与 ThemeMode 同包

- **场景**：校验主题模式字面量
- **规则**：`ThemeMode` / `isThemeMode` 都在 `@spark-appworks/spark-component`（capability-keys）。禁止在 spark-app 再定义或薄转发 `isThemeMode`
- **违反后果**：守卫与类型分家，改字面量漏改一边
- **发现来源**：2026-08 SSOT isThemeMode 收口

### 宿主禁止纯 re-export 绑文件



- **场景**：想给 app 层一个“统一 import 入口”转发 `@spark-appworks/spark-ai/agent` 或 `spark-project-model`
- **规则**：消费方直连包入口；删除仅含 `export … from '包'` 的 `*-bindings.ts` 薄文件
- **违反后果**：额外转发层掩盖真实依赖，SSOT 再次分叉
- **发现来源**：2026-08 SSOT G5/G6

### 运行场景装配经 PageRuntime / DynamicRouter 注入

- **场景**：宿主要把 DataSpace 运行装载接到 `SparkPageRenderer`
- **规则**：宿主通过 DynamicRouterOptions.loadScenario 按projectId/scenarioId装配，DynamicRouter为每次调用创建PageRuntime，并向renderer传pageRuntime与routeSnapshot。PageRuntimeOptions.loadScenario返回本调用独立DataSet；不要共享运行数据或从工具推断场景。组件包不直连lowcode或宿主，也不新增薄转发入口。
- **违反后果**：包边界污染或漏注入 → 有 binding 的页面加载失败；薄转发层再引入双真源
- **发现来源**：2026-08 系统结构 SSOT 归并（批次 F）；2026-10 按工具与调用分离更新注入合同。

### 行级权限五集合里 `r` 是"必填"，不是"可读"

- **场景**：经DataView判断字段与行权限。
- **规则**：正式合同见 `docs/architecture/PERMISSION_SYSTEM.md`。后端R必填且同步加入E，h/m独立表示实际返回值的保护状态，d为删除许可，树c为父行新增子行许可。本仓write消费E，参考sparkproject消费R或E，正常R⊆E输出等价；不能把R当可读名单、用空值推断隐藏或把首行权限复制给新增草稿。公开行不携带原权限名单/token。
- **违反后果**：把 `r` 当可读，会漏掉必填校验，或把只读字段误判成可改。
- **发现来源**：2026-10-05 原权限研读；2026-10-07 对照当前原查询owner及参考SPARK双通道实现更新。

### 收窄 `Object.entries(Partial<Record>)` 用类型守卫，不要断言也不要 `!== undefined` 过滤

- **场景**：把 `Object.entries(patch)` 的键收窄到字面量联合（如 `LowcodeProjectBlueprintMutableField`）
- **规则**：写 `field is X` 类型守卫，并把通过校验的条目收集进带类型的数组。`as Array<[…]>` 会被 `verify:ai-codegen` 拒绝；对值做 `!== undefined` 过滤会被 `@typescript-eslint/no-unnecessary-condition` 拒绝（该类型下 `Object.entries` 的值类型不含 `undefined`）。
- **违反后果**：`verify:ai-codegen` 或 `lint` 失败。
- **发现来源**：2026-10-05 修复 `LowcodeProjectBlueprintApi.updateNodeFields`
