状态：implementing

# 项目蓝图语义正名与全输出 API 收敛计划

## 任务目标

把 AppWorks 当前被称为“导航”的项目平铺数据彻底正名为 `ProjectBlueprint`，建立“平铺项目蓝图 SSOT + 类型化节点 capability + 分层 `ProjectBlueprintOutputs`”体系；数据空间按 design/runtime 分离并在内部拥有前端模型，页面只能消费数据空间；功能标签和完整对象粒度权限设计独立于数据空间；现有 `spark-component` 最终全面消费后端权限快照。同时保留现有项目、节点、FormKey、数据空间、前端模型和 Vue 页面身份，不修改 lowcode-jdk17，不执行 live 元数据写入。

最低验收线：先在可独立发布的 `@spark-appworks/spark-lowcode-api` 完成语义纠正。完整项目数据的公共入口和类型必须叫 `ProjectBlueprint` / `ProjectBlueprintNode`；所有蓝图派生 API 由 `ProjectBlueprintOutputs` 分组承载，`RuntimeNavigation` / `RuntimeNavigationItem` 只能作为其中一种常规动态导航输出。前端 API 不得继续发布一个同时承担两种语义的 `LowcodeNavigationNode`，也不得把运行导航或文档树建成并列 SSOT。

## 已确认决策

1. `Base_NavigationInfo` 的项目级平铺记录是项目蓝图的持久化事实，不再局限于菜单。
2. 项目蓝图覆盖 `需求策划 -> 原型设计 -> 数据空间/业务场景 -> 页面/子页面/报表等交付物`。
3. 存储保持平铺，一项目一组记录；父子层级由稳定 `id + parentId + order` 重建。
4. 运行菜单只是项目蓝图的一个常规动态导航输出；结构由蓝图投影，节点可见性和访问权再与 lowcode 后端最终授权结果相交。
5. FormKey 是具体页面载体身份；数据空间是可被页面、报表等复用的场景；两者在模型中严格分离。
6. 共享“项目管理/系统管理”Vue 实现只保留一份；每项目的蓝图种子记录引用共享实现，不复制 Vue 代码。
7. 新项目可一次性添加完整种子；既有项目保留全部现有 ID、FormKey 和绑定，只补缺失语义，不重建身份。
8. 不提供旧 AppWorks 导航领域类型和方法的兼容别名，不建薄壳转发；更新所有真实消费者后删除旧语义实现。
9. `E:\lowcode-jdk17` 和 `E:\r\sparkproject` 只读；不修改数据库、后端或产品仓。
10. 本计划只实施本地代码、合同、只读 characterization 和 dry-run 差异；任何 live mutation 另行冻结 ACS、审批并由专门流程执行。
11. 所有以蓝图为主要结构/策划输入的输出 API 都要正名；不能只改运行导航，遗漏结构投影、策划输入、AI artifact、Host Run 结果和项目文档。
12. 蓝图输出按结构、策划/设计、交付、文档、治理、AI/工具六组收敛；一个门面加分组合同，禁止制造平级 interface/API 大平层。
13. lowcode 的 SRS、功能设计、SDD 是异步生成任务，完成态来自 SSE `SYSTEM_DOWNLOAD`；后端端点名和原始事件字段只留在适配层。
14. lowcode SRS/SDD 当前仅消费 `IsShowAtNav=1` 节点，不能冒充完整蓝图文档；覆盖不足必须作为 diagnostic/capability gap 暴露。
15. 蓝图节点必须承载与节点种类匹配的修改 capability；节点不保存任意后端端点或脚本，真实 mutation 统一交给治理执行器。
16. 数据空间只承载前端模型线；前端模型引用数据资源、字段和关系，但不是蓝图节点，也不拥有物理资源。
17. 页面所有数据访问只能消费数据空间；不得直连数据资源或拥有第二份页面本地数据定义。页面可在后端最终权限范围内执行完整运行 CRUD。
18. 数据空间 API 按目标语义严格分为 `design` 与 `runtime`；允许内部复用 lowcode 物理端点，公共合同、鉴权和治理不得复用。
19. 功能标签属于交付节点的子节点；权限设计独立于数据空间，按数据空间、前端模型、资源、字段、行操作和功能标签完整对象粒度授权给岗位、机构、角色、用户等主体。
20. 权限配置持久化 SSOT 和最终决策都在 lowcode 后端；前端只原子接收最终权限快照并渲染/拦截，不计算角色权限。
21. `spark-component` 是唯一组件 owner；先补齐现有三态过渡适配，再逐类完成所有数据/动作组件的原生权限消费，最终删除三态 adapter。

## 影响范围

### 公共 lowcode API

- `packages/spark-lowcode-api/src/platform/lowcode-navigation.ts`
  - 拆除“菜单节点同时是项目设计节点”的合同。
  - 保留 lowcode 授权菜单线字段归一，但只输出用于裁剪蓝图动态导航候选的授权证据，不拥有运行结构。
- `packages/spark-lowcode-api/src/platform/project-blueprint/`
  - 新增项目蓝图子领域，按层次组织完整平铺读取合同、身份解析状态和诊断。
  - 目录内源文件控制在 10 个以内，不把 helper 公共导出。
- `packages/spark-lowcode-api/src/platform/project-blueprint/outputs/`
  - 新增蓝图输出门面与分组合同：结构、策划/设计、交付、文档、治理、AI/工具。
  - 公共面收敛为 `ProjectBlueprintApi`、`ProjectBlueprint`、`ProjectBlueprintNode`、`ProjectBlueprintOutputs` 和少量跨边界结果类型；内部 projector/mapper 不导出。
- `packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts`
  - 删除当前混合语义的 `getNavigation`；运行导航由蓝图输出门面生成，平台 API 仅提供后端授权证据读取。
  - 新增只读 `readProjectBlueprint(projectId)`，通过现有 `DataOperation.GetData` 读取该项目全部 `Base_NavigationInfo` 记录。
- `packages/spark-lowcode-api/src/design/lowcode-design-api.ts`
  - 保持文件读取/目录能力，不把项目文档输出继续塞入泛化 Design API。
- `packages/spark-lowcode-api/src/platform/project-blueprint/outputs/document/`
  - 接入 lowcode `exportSRS`、`exportDesignDoc`、`exportSDD`，规范化为三种蓝图文档任务。
  - 规范化异步提交响应、SSE `SYSTEM_DOWNLOAD` 回执、失败和覆盖诊断；后端物理路径仅在内部适配器出现。
- `packages/spark-lowcode-api/src/realtime/lowcode-realtime-api.ts`
  - 在现有 SSE 连接能力上增加受控的系统下载事件归一，不把任意消息结构泄漏到蓝图文档合同。
- `packages/spark-lowcode-api/src/data-space/`
  - 建立数据空间公共门面，内部按 `design/`、`runtime/` 分域；公共消费者不能从 runtime 导入 design mutation。
  - `design` 管理数据空间、前端模型、资源/字段引用和关系；`runtime` 管理 FormKey 上下文中的查询与业务 CRUD。
  - 同一路径复用必须在内部 adapter 层完成，不能暴露通用表名 + 任意 payload 写入口。
- `packages/spark-lowcode-api/src/permission-design/`
  - 建立功能标签、数据对象授权和岗位/机构/角色/用户主体配置合同。
  - 运行权限读取与设计配置写入分域；运行面只返回后端最终权限快照。
- `packages/spark-lowcode-api/src/platform/lowcode-application.ts`
  - 将根节点查询复用为蓝图查询的受控 builder；不公开通用物理表查询入口。
- `packages/spark-lowcode-api/src/index.ts`
  - 显式导出有限的蓝图和运行导航门面；不使用 `export *`。
  - 发布面必须能让外部应用只导入 `ProjectBlueprintApi`、`ProjectBlueprint`、`ProjectBlueprintNode` 及其动态导航输出合同完成消费。
- `packages/spark-lowcode-api/src/platform/lowcode-navigation.test.ts`
  - 改为运行投影 characterization，验证后端权限菜单、不为模块/外链伪造场景身份。
- `packages/spark-lowcode-api/src/platform/project-blueprint/*.test.ts`
  - 验证全量平铺、字段保真、重复 ID/孤儿/环诊断、未知类型阻断和身份分离。

### 项目蓝图领域模型

- `packages/spark-project-model/src/navigation/project-node.ts`
  - 由当前文件迁出项目蓝图职责；删除 `ProjectNodeData` / `NavNodeKind` 等误导命名。
- `packages/spark-project-model/src/blueprint/`
  - 新增 `ProjectBlueprint` 聚合、`ProjectBlueprintNode` 实体、平铺数据合同、索引和只读树投影。
  - canonical SSOT 只保存平铺节点，不保存第二份嵌套 `children` 真源。
- `packages/spark-project-model/src/blueprint/output/`
  - 收敛现有 `toTree/readNavigationProjection/readPlanningProjection/readProjectPlanningInput/readNavigationPlanningInputs` 等派生能力。
  - 提供结构、策划、页面/场景、运行交付、状态诊断和文档 source 投影；按子领域分目录，单目录不超过治理上限。
- `packages/spark-project-model/src/blueprint/capability/`
  - 按节点种类定义有限修改命令和 capability key；禁止一个通用 `mutate(action,payload)` 或在节点 DTO 中保存端点/函数。
  - capability 只构建 command，由工作区 mutation executor 执行。
- `packages/spark-project-model/src/data-space/`
  - 数据空间聚合拥有前端模型；前端模型保存稳定 `modelId`、数据资源/字段引用和关系。
  - 页面/报表仅保存数据空间消费绑定，不复制前端模型或物理资源定义。
- `packages/spark-project-model/src/navigation/navigation-tree.ts`
  - 仅保留真正的运行导航投影职责；蓝图层级逻辑迁入 `blueprint/` 后删除旧实现。
- `packages/spark-project-model/src/navigation/navigation-edit.ts`
  - 改为蓝图节点编辑命令；运行菜单配置只是节点的 `runtimeProjection` 子域。
- `packages/spark-project-model/src/io/navigation-client.ts`
  - 删除并由 `blueprint/project-blueprint-client.ts` 取代。
- `packages/spark-project-model/src/io/navigation-tree-sync.ts`
  - 改为蓝图平铺差异/顺序同步；没有安全 mutation 能力时显式 fail-closed。
- `packages/spark-project-model/src/project/project-model.ts`
  - 项目聚合拥有 `blueprint`，运行导航是派生/注入投影，不再拥有 `navigationRoot` 可写真源。
- `packages/spark-project-model/src/project/project-workspace.ts`
  - `load/save/add/update/delete/moveNavigation*` 全面改为蓝图语义；不保留旧方法兼容层。
  - 新增统一 blueprint mutation executor；每项写入必须携带 capability、目标身份、preimage、幂等键和 readback 期望。
- `packages/spark-project-model/src/page/config-page.ts`
- `packages/spark-project-model/src/page/runtime-page.ts`
- `packages/spark-project-model/src/page/instantiate-project-node.ts`
  - 页面只从蓝图交付节点建立页面闭包；严格区分 `formKey`、`dataSpaceId`、`modelId`。
- `packages/spark-project-model/src/index.ts`
  - 更新显式公共导出并删除旧导航领域符号。
- `packages/spark-project-model/tests/project-model.test.ts`
  - 按蓝图聚合、平铺 SSOT 和身份闭包重写测试。

### AppWorks 组合层与设计器

- `src/lowcode/lowcode-runtime.ts`
  - 分成项目蓝图加载适配和运行导航适配；禁止共用同一节点转换函数。
- `src/services/project/project-shell.ts`
  - 运行壳层只同步 `RuntimeNavigation`；设计工作区只加载 `ProjectBlueprint`。
- `src/main.ts`
- `src/App.vue`
  - 注入独立蓝图/运行导航来源，保持租户 + 项目 URL 隔离。
- `src/views/app/dev-system/DevSiteTree.vue`
  - 重命名为项目蓝图树组件，显示需求、原型、场景、页面、报表等层级，不再显示“后端导航数据为空”。
- `src/views/app/dev-system/components/NodeBasicInfo.vue`
- `src/views/app/dev-system/components/NodeTargetConfig.vue`
- `src/views/app/dev-system/composables/useNodeKindFlags.ts`
- `src/views/app/dev-system/useDevState.ts`
- `src/views/app/dev-system/project-model-dev-bindings.ts`
  - 全面改用蓝图词汇；把运行入口、Vue 组件、FormKey、数据空间分别编辑和校验。
- `src/services/project-planning/project-planning-agent-workflow-binding.ts`
  - AI 策划输入改为蓝图合同，停止要求所有 module 必须直接生成菜单 page。
- `src/services/project-planning/project-planning-ai-runner.ts`
- `src/services/project-planning/project-planning-host-run-provider.ts`
  - 把 `navigationDirty/savedNavigation/navigationRoot`、`saveNavigationAfterRun` 和 `kind/name=navigation` 全部改为 blueprint 语义。
  - AI artifact 与 Host Run extras 作为 `ProjectBlueprintOutputs.ai` 的受控输出，不再发布导航冒充蓝图的结果。
- `src/registries/vue-page-registry.ts`
- `config/navigation/vue-pages.json`
- `config/schemas/vue-pages.schema.json`
  - 明确其职责是共享 Vue 组件/路由实现目录，不承载项目成员关系或蓝图真源。

### 运行导航消费者

- `packages/spark-app/src/router/dynamic.ts`
- `packages/spark-app/src/types.ts`
- `src/layout/AppSidebar.vue`
- `src/layout/AppSidebarNode.vue`
- `src/layout/NavHeaderBar.vue`
- `src/layout/AppBreadcrumb.vue`
- `src/layout/AppHeader.vue`
  - 改为消费独立 `RuntimeNavigationItem`；保留真实导航命名，因为这些文件确实负责运行菜单和路由。

### 权限组件体系

- `packages/spark-component/src/permission/PermissionChecker.ts`
- `packages/spark-component/src/permission/PermissionResolver.ts`
- `packages/spark-component/src/permission/PermissionFilter.ts`
- `packages/spark-component/src/permission/FieldRenderHelper.ts`
- `packages/spark-component/src/permission/usePermission.ts`
  - 删除缺失快照默认放行、前端猜脱敏和 hidden 改 masked 等语义。
  - 原样消费 `allowAdd`、`lingma_sys_key`、`r/e/h/m/d` 和功能权限，派生显示/编辑/动作状态但不覆盖原始集合。
- `packages/spark-component/src/components/fields/`
- `packages/spark-component/src/components/containers/`
- `packages/spark-component/src/components/display/`
- `packages/spark-component/src/page/actions/`
  - 建立组件覆盖矩阵，逐类迁移字段、表单、表格、列表、树、按钮、批量动作、导入/导出和展示组件。
  - 页面业务代码不注册角色规则；所有组件通过唯一 permission facade 消费同一原子快照。
- `packages/spark-data/src/`
  - `DataTable.execQueryResult` 或当前等价入口原子登记 rows、originalRows、总数、后端权限集合和防篡改上下文。
  - 数据层保留原始权限事实和基线，不生成页面级授权结论。

### Characterization 与治理制品

- `backend-api-contracts/lowcode-endpoint-ledger.json`
- `backend-api-contracts/appworks-consumer-ledger.json`
  - 补充“完整蓝图读取”“授权运行菜单读取”“SRS/功能设计/SDD 异步文档任务”和 SSE 下载回执的端点/消费者差分；若文件尚未生成则由现有合同生成流程新增，不手写伪完成状态。
- `backend-api-contracts/endpoints.ts`
  - 补齐 `exportSRS/exportSDD`；纠正 `exportDesignDoc` 被登记为同步 `binary/void` 的错误，以源码和行为测试记录真实异步语义。
- `tools/lowcode-contracts/`
  - 增加只读蓝图字段和菜单裁剪行为 characterization；不执行保存。
- `workspace.catalog.json`
  - 若仓库治理 owner 已存在则按其生成器补齐蓝图和运行导航入口；当前文件缺失，不能手写猜测，若无 owner 则登记为治理 gap。
- `notes/plan-lowcode-frontend-api-cutover.md`
  - 仅在本计划获批后标注其导航章节已由本计划替代；不覆盖其余实施记录。

## 技术方案

1. **冻结词汇与边界**
   - 公共领域词汇固定为 `ProjectBlueprint`、`ProjectBlueprintNode`、`BlueprintNodeKind`、`RuntimeNavigation`、`RuntimeNavigationItem`。
   - raw lowcode 字段只存在于 `spark-lowcode-api` 边界归一层。
   - 建立负向扫描：项目模型、蓝图设计器和项目策划域不得继续出现以 `navigation` 表达蓝图的公开符号。
   - 第一波结束时先执行包级 `pack`/导出冒烟；只要发布面仍把完整项目数据称为 Navigation，该波次即判定失败，不进入 UI 迁移。

2. **建立完整平铺蓝图读取合同**
   - 使用 `/api/DataOperation/GetData` 读取 `Base_NavigationInfo WHERE SysId = projectId`，保留全量记录，包括 `IsShowAtNav=0`。
   - 输出平铺 `nodes[]`；校验唯一 ID、循环、跨项目父链和稳定排序。历史数据允许多个顶层记录与缺失父节点：原始记录不得丢弃，缺口形成 diagnostic；编辑器按项目投影一个非持久化合成根。
   - `conid` 先保真为 legacy binding；基于节点类型、Form/DataSet/模型只读证据解析 `formKey` 和 `dataSpaceId`，无法证明时保持 unresolved。
   - 读取失败或类型未知时 fail-fast，不按标题、URL、叶子状态猜测。

3. **建立蓝图的常规动态导航输出**
   - 从蓝图候选节点投影普通动态导航字段、父子关系、排序和入口，不建立第二棵可写树。
   - 现有 `GetNavigationMenus` 归一为授权裁剪证据，并通过稳定节点 ID 与蓝图候选集合求交；后端未授权节点不得进入输出。
   - 组件目录只补充实现解析和诊断，不增加蓝图中不存在或后端未授权的节点。
   - `DynamicRouter`、Admin Shell 和 Breadcrumb 只消费最终 `RuntimeNavigation` 输出。

4. **建立分层蓝图输出系统**
   - `ProjectBlueprint` 只保存 canonical 平铺状态；`ProjectBlueprintOutputs` 持有同一不可变蓝图快照并提供分组投影。
   - 结构组输出平铺快照、层级树、模块/页面目录；策划/设计组输出需求、原型、页面策划和场景/模型矩阵；交付组输出动态导航、路由/组件绑定和页面运行闭包。
   - 治理组输出身份闭包、权限覆盖、差异/种子 dry-run、校验和 capability gap；AI/工具组输出策划输入、artifact 和 Host Run result。
   - 非蓝图来源的租户设置、业务数据、报表结果导出保持原领域，不按 `export` 字样机械迁入。

5. **建立蓝图文档输出**
   - 先生成规范化 `ProjectBlueprintDocumentSource` 与 coverage report，再决定是否调用现有 lowcode renderer。
   - 三种公共意图固定为需求规格说明、功能设计文档、系统详细设计文档；物理 `exportSRS/exportDesignDoc/exportSDD` 只在 adapter 内映射。
   - 公共调用表达“提交任务 -> 等待 SSE 下载回执 -> 返回文档结果”，不宣称同步下载。
   - 若 readback/characterization 证明 renderer 只覆盖菜单节点，结果必须标明 `legacy-menu-scope` 或等价诊断；不静默称为完整蓝图文档，也不在本波次擅自新增浏览器 DOCX 引擎。

6. **建立节点 capability 与 mutation executor**
   - capability 按节点种类白名单化：策划内容、层级、数据空间设计、交付定义、功能标签、权限配置等互不越权。
   - 节点方法只生成具名 command；executor 校验目标身份、当前后端能力、风险门禁和权限后执行。
   - 所有写操作统一执行 preimage、idempotency、短事务、journal、readback 和 compensation；缺少任一能力时 fail-closed。

7. **建立数据空间 design/runtime 双域**
   - 数据空间内部前端模型只引用数据资源、字段和关系，不成为蓝图节点或物理资源别名。
   - design API 只供数据空间节点与设计工具；runtime API 只供绑定数据空间的页面/报表和运行组件。
   - 运行 CRUD 始终携带 FormKey 和后端返回的系统键/原始行上下文；页面不得构造任意物理表写请求。

8. **建立功能标签与权限设计域**
   - 交付节点拥有稳定功能标签子节点；权限设计按完整对象粒度引用标签及数据空间对象。
   - 岗位、机构、角色、用户等仅作为授权主体，不在页面端聚合成权限。
   - 设计配置 mutation 与运行鉴权结果读取物理和工具层分离；运行组件只看后端最终输出。

9. **重构权限组件基座**
   - 第一阶段用集中 adapter 把后端完整快照投影为现有组件可消费的显示/编辑/动作状态；缺失权限 fail-closed。
   - 第二阶段在现有 `spark-component` 中逐类让基础组件直接消费完整快照，覆盖字段、行、表、动作和批量最小单元交集。
   - 完成覆盖矩阵后删除三态 adapter；不保留页面局部角色判断和双权限状态。

10. **重建项目蓝图聚合**
   - 以平铺节点数组为唯一可写状态，索引和树每次由聚合派生。
   - 节点类型分为结构、策划、场景和交付四组，支持 `模块 => 模块 => 页面 => 子页面`，但不以树深猜类型。
   - 需求、原型、场景和 report-only 节点默认不进入菜单；页面是否进入菜单由运行投影配置决定。
   - 项目蓝图树、页面目录、数据空间目录、报表目录和菜单预览都从同一聚合投影。

11. **破坏性迁移全部消费者**
   - 先新增新合同及聚焦测试，再逐包迁移真实消费者。
   - 每个最小闭环迁移完立即删除对应旧类型/方法；不保留 deprecated alias、facade-to-facade 转发或双写状态。
   - 最终负向扫描旧公开符号必须为 0；确属 lowcode 线字段或运行菜单 UI 的命名列入 allowlist。

12. **项目管理共享种子与既有项目对账**
   - 定义稳定语义键的项目管理蓝图种子：导航/页面策划、基础数据、角色组织、权限、数据资源、集成/流程/报表、运维支撑。
   - 新项目生成平铺种子记录；既有项目按稳定 ID/绑定证据生成只读差异，不按标题匹配、不重建现有身份。
   - Metadata 当前 28 个真实 Vue 导航页面作为首个 characterization 样本；薪资 35 页作为后续业务验收样本，二者都不是硬编码平台规范。
   - 本计划阶段只生成 dry-run 差异与 readback 预期，不执行 live 写入。

13. **数据空间和页面闭包校验**
   - 场景节点绑定可复用 `dataSpaceId`；页面节点拥有独立 `formKey`/组件/路由绑定；报表可直接消费场景而不伪造页面。
   - 每个模型必须通过唯一 `modelId` 和字段/关系读回闭合。
   - 每个数据组件和动作继续消费后端最终权限；`r/e/h/m/d`、字段独立读写、`allowAdd`、`lingma_sys_key` 和批量最小单元交集规则不变。

14. **治理与后续 mutation 门禁**
   - 所有新增/调整/删除/移动意图输出为 bounded reconciliation intent。
   - live mutation 必须另行具备写前镜像、幂等键、短事务、journal、readback、补偿和风险批准；本计划的本地实现批准不等于 live 写授权。
   - 若现有 lowcode 公开接口或字段无法保存蓝图语义，记录 capability gap，不修改 lowcode-jdk17、不偷用 `memo/htmlDesc` 存结构化协议。

## 兼容性

- AppWorks 内部是明确的破坏性重构：旧项目导航领域公共类型、方法和文件删除，不提供兼容层。
- lowcode-jdk17 的 URL、表名和线字段保持不变，由边界层忠实适配。
- 现有前端功能和 Vue 文件不得删除；组件注册表中的实现继续共享。
- 现有项目 ID、节点 ID、FormKey、dataSpaceId、modelId、路由和组件绑定默认全部保留。
- `modelId` 仅标识数据空间内前端模型，不新增模型蓝图节点；物理资源身份保持独立。
- 页面现有功能不删除，但其数据访问必须收敛到数据空间 runtime API；发现直连资源时迁移而非兼容保留。
- 运行菜单结构以蓝图为唯一事实，权限仍以后端授权响应为唯一决策出口；两者相交生成最终输出。
- 蓝图文档、AI 交付物和设计器投影全部从同一蓝图快照派生；禁止以运行菜单树代替完整蓝图。
- 现有 lowcode 文档 renderer 可以继续复用，但覆盖范围必须如实报告；前端语义正名不改变其后端实际能力。
- 未获 live 写授权时，只读蓝图、运行菜单和 dry-run 差异可交付，但不能宣称远端种子或语义字段已写入。

## 实施波次与最小闭环

1. `spark-lowcode-api`：完整蓝图读取合同 + 输出门面骨架 + 包级测试。
2. 数据空间：design/runtime 端点账本、前端模型合同、查询与 CRUD characterization。
3. 权限：功能标签、完整对象粒度授权配置、后端最终权限快照 characterization。
4. 组件过渡闭环：原子权限快照 + 集中三态 adapter + 代表性字段/表格/按钮测试。
5. 文档输出：SRS/功能设计/SDD 端点账本、异步任务、SSE 回执和覆盖诊断 characterization。
6. `spark-project-model`：平铺蓝图聚合 + 节点 capability + 分层输出投影 + 聚焦测试。
7. AppWorks 组合层：蓝图设计加载、数据空间设计、权限设计与运行导航加载分流。
8. 全组件权限改造：按覆盖矩阵迁移并删除三态 adapter。
9. AI/工具链：策划输入、delivery artifact、Host Run result 全面改为蓝图输出语义。
10. DevSystem：项目蓝图词汇、节点类型和独立绑定面板 + 组件测试。
11. 全部消费者迁移与旧符号删除 + 根类型检查和负向扫描。
12. Metadata 28 页只读 characterization、共享项目管理种子 dry-run 和身份闭包报告。
13. 程序测试员黑盒轮次：按项目蓝图、每一类输出、数据空间、权限主体、运行菜单、页面/子页面和每个按钮验证；问题写入独立测试报告。
14. 程序员修复轮次：逐问题复现、最小修改、自动化复验、再黑盒；循环至批准范围内无未解决缺陷。

任一波次出现字段值域不明、源代码与计划不符、现有用户改动重叠、影响文件外溢或需要 live mutation，立即停止该波次并回到方案审核，不扩大改动。

## 验证计划

- 开工基线：`git status --short --branch`；保留当前全部用户改动。
- 编译基线：`pnpm run typecheck`，记录实施前结果。
- 公共包类型：`pnpm --filter @spark-appworks/spark-lowcode-api run typecheck`。
- 公共包测试：`pnpm --filter @spark-appworks/spark-lowcode-api run test:run`。
- 项目模型测试：`pnpm --filter @spark-appworks/spark-project-model run test:run` 或仓库等价命令。
- 根类型检查：`pnpm run typecheck`，必须通过后再运行其他根验证。
- Lint：`pnpm run lint`。
- 单元测试：`pnpm run test` 与相关包测试。
- 构建：`pnpm run build:packages`、`pnpm run build:frontend`。
- 架构/规则：`pnpm run verify:rules` 及仓库当前等价架构检查；已知历史失败与本轮新增失败分开记录。
- 发布验证：`pnpm run publish:dry`，确认新公共合同导出和声明可发布。
- API 命名门禁：构建产物和 `.d.ts` 中不得以 `LowcodeNavigationNode`、`getNavigation` 表达完整项目蓝图；仅独立运行菜单合同可保留 `Navigation` 词汇。
- 输出 API 门禁：所有蓝图派生公共 API 必须归入 `ProjectBlueprintOutputs` 分组；禁止重新形成 `Projection/Export/Artifact` 平级大平层。
- 负向扫描：旧蓝图误称导航的公共符号、字段和 AI artifact 为 0；只允许 lowcode 线协议和真实运行导航 UI 使用 `navigation`。
- 合同 characterization：证明完整蓝图含隐藏节点，动态导航是蓝图的派生子集，最终输出又是候选集合与后端授权集合的交集；不得生成或保存第二棵结构树。
- 文档 characterization：验证三个请求均为异步任务，SSE 下载回执可关联原请求；分别记录完整蓝图节点数、renderer 实际覆盖节点数和遗漏类型，覆盖不足不得标记 complete coverage。
- 身份测试：禁止自动令 `blueprintNodeId = formKey = dataSpaceId = modelId`；历史相等必须携带证据。
- 数据空间边界测试：页面直连物理表/视图/字典/接口的公共调用为 0；所有运行访问均可追溯到数据空间、前端模型和 FormKey。
- design/runtime 门禁：运行包不能导入 design mutation；相同物理端点的两个 adapter 必须使用不同公共 command、权限上下文和 journal 类型。
- 权限 SSOT 测试：授权配置变化只改变后端返回快照；页面代码、页面配置和组件本地规则不发生变化。
- 权限完整性测试：原始 `r/e/h/m/d`、`allowAdd`、`lingma_sys_key` 和 originalRows 原子注册且不被 adapter 改写；缺失任一关键权限时 fail-closed。
- 组件覆盖测试：字段、表单、表格、列表、树、按钮、批量编辑/删除/导出按全部选中最小单元取权限交集，再与业务可用性相交。
- 负向权限扫描：页面和组件不得按角色、岗位、机构、用户名称推导权限；不得保留前端猜测脱敏或缺省放行。
- 浏览器黑盒：使用已授权会话，不记录口令；按租户、项目、蓝图层级、运行菜单、页面、子页面和每个按钮验证 loading/error/empty/success/权限状态。
- Mutation：本计划不执行；任何真实写入必须另行批准并完成 preimage/journal/readback/compensation 验证。

## 风险项

- **现有字段不足以表达完整蓝图类型**：保持 unresolved 并形成数据库能力 gap；不修改 lowcode-jdk17，不把结构化协议塞入备注字段。
- **菜单接口裁剪隐藏节点**：完整蓝图必须走独立只读合同，禁止用菜单接口补猜。
- **文档 renderer 仍按菜单取材**：以 coverage diagnostic 如实暴露；不通过改名掩盖，不擅自修改 lowcode-jdk17 或新增未经审核的浏览器文档引擎。
- **输出族数量多导致新平层**：用一个 `ProjectBlueprintOutputs` 门面和子领域目录收束；仅跨包消费者需要的结果类型公开。
- **节点方法演化成任意后端调用**：capability 白名单 + 具名 command + 单一 executor；DTO 禁止存 endpoint/script/payload template。
- **design/runtime 复用端点导致越权**：按目标语义拆公共 API、依赖方向、鉴权和 journal；物理复用只在内部 adapter。
- **前端模型再次冒充物理资源或蓝图节点**：保留三层独立身份与只读引用，关系由 readback 校验。
- **三态过渡层固化**：为 adapter 设置删除验收门；全组件覆盖完成前不可宣称最终权限体系完成。
- **现有权限实现缺省放行**：按 lowcode 场景 fail-closed，非 lowcode 数据源通过明确 provider 合同决定，不用全局兜底。
- **`conid` 历史复用**：先保真、后举证解析；禁止机械复制为 FormKey 和 dataSpaceId。
- **现有 Metadata 自动建 DataSet 行为**：只作反面 characterization，不移植到 AppWorks。
- **全仓重命名影响面大**：按包/消费者逐闭环，先新合同与测试，迁移完立即删旧符号，不跨波次顺手重构。
- **工作树已有大量用户改动**：修改前逐文件重读并检查 diff；不 reset、stash、checkout、覆盖或格式化无关文件。
- **缺少治理 catalog**：在无法确定 owner 时登记 gap，不手工伪造可执行治理制品。
- **蓝图结构与后端授权被错误二选一**：结构必须来自蓝图，权限必须来自后端，最终动态导航取两者交集；禁止任一方独自生成最终菜单。
- **黑盒验证误触真实写入**：默认只读；写按钮只验证禁用/拦截和请求构造，除非另行批准具体 mutation 范围。

## 审核门

本文件已经用户批准并处于 `implementing`。批准仅授权本地代码与只读验证，不授权 commit、push、部署、数据库修改或任何 QYAPI/live metadata 写入。
