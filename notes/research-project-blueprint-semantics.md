# 项目蓝图语义、现有平铺数据与全输出 API 研读

## 已确认目标

现有 `Base_NavigationInfo` 平铺记录不再在 AppWorks 领域层被称作“导航数据”。它们是项目从需求策划、原型设计、业务场景/数据空间到页面、子页面、报表等交付物的**项目蓝图节点**；平铺只是持久化形态，运行菜单只是其中一个受权限约束的投影视图。

最低不可降级的交付边界是可发布前端 API：`@spark-appworks/spark-lowcode-api` 必须以 `ProjectBlueprint` 作为完整项目数据的公共合同，禁止继续向消费者暴露一个同时冒充项目蓝图和菜单的 `LowcodeNavigationNode`。`RuntimeNavigation` 只作为 `ProjectBlueprint` 的一种常规动态导航输出发布，不形成并列领域或第二份结构事实。

正名范围不能停在运行菜单。凡是以项目结构、策划内容、场景绑定或交付节点为输入生成的目录、投影、AI 上下文、交付物、诊断和文档，都必须统一归属于 `ProjectBlueprintOutputs`。后端物理端点名只能存在于适配器内部，不能继续决定 AppWorks 的公共领域命名。

项目蓝图也不能只是只读目录。不同种类的蓝图节点必须承载其领域修改能力，但节点只暴露类型化 capability，不保存任意端点、脚本或后端 payload。真实写入由统一 mutation executor 执行，继续满足写前镜像、幂等、短事务、journal、readback 和补偿约束。

本轮采用破坏性语义收敛，不保留 AppWorks 内部旧 `ProjectNodeData` / `ProjectNavigationGateway` 等兼容别名或薄壳转发。旧 `navigation` 命名只允许留在以下真实边界：

- lowcode-jdk17 的既有 `/api/FormDesign/*Navigation*` 路径；
- `Base_NavigationInfo`、`NavigationUrl`、`NavigationType` 等既有数据库/线协议字段；
- Admin Shell 中确实负责显示运行菜单、导航交互的组件。

`E:\lowcode-jdk17` 永久只读；本轮不修改 Java、POM、Nacos、数据库或部署配置，不执行 QYAPI/live metadata 写入。

## 当前源码事实

### lowcode-jdk17 持久化实体

`BaseNavigationInfo` 已经远大于菜单 DTO，包含：

- 结构身份：`rowid`、`prowid`、`sysId`、`FunOrderValue`；
- 策划内容：`FunName`、`name`、`caption`、`memo`、`htmlDesc`、`status`、负责人和工时字段；
- 内容绑定：`conid`、`conType`、`fromId`、`funCode`；
- 运行投影：`IsShowAtNav`、`IsShowChildItem`、`NavigationUrl`、`NavigationType`、`NavigationShowType`、`ChildItemLocation`、图标和参数；
- 流程及数据目录相关字段。

因此这张表具备“项目结构节点 + 策划内容 + 运行入口配置”的历史复合形态，不能再被一个菜单节点类型完整表达。

### 两个后端读取面的语义不同

`FormDesignServiceImpl.GetNavigationMenus` / `getNavigationMenusFlat` 明确只读取或投影运行菜单：

- 子节点必须 `IsShowAtNav=1`；
- 根据 `IsShowChildItem` 决定是否继续遍历；
- 经过服务端最终导航权限过滤；
- 输出只保留菜单展示所需字段；
- 扁平接口 `FlatMenuItem` 甚至不包含 `conid`。

因此该接口只能成为 `RuntimeNavigation` 的事实源，不能读取完整项目蓝图。

lowcode 现有 `/api/DataOperation/GetData` 已被 AppWorks 用于读取 `Base_AppSystemList` 和 `Base_NavigationInfo` 根节点；Metadata 源码也通过相同公共数据能力按 `sysid` 查询 `Base_NavigationInfo` 完整树与详情。这证明“读取全量项目蓝图记录”和“读取权限过滤后的运行菜单”可以通过两个现有后端能力分别完成，无需修改 lowcode-jdk17。

### 当前 Metadata 实现暴露的历史错误

`ApplicationFunMan.ts` 当前把每个新导航节点默认设为：

- `conid = rowid`；
- `conType = Model`；
- `IsShowAtNav = 1`；
- 同时创建同 ID 的 `Base_DataSet`。

这等价于“每个树节点都自动创建数据空间并进入菜单”，与已确认的新语义冲突。AppWorks 不能复制该行为。现有身份必须保留，但新增或对账时只有经证据证明的业务场景才绑定数据空间，只有具体页面载体才绑定 FormKey，只有可见运行入口才进入菜单投影。

### AppWorks 当前混叠

`@spark-appworks/spark-lowcode-api` 当前把 `TopMenus/LeftMenus` 归一为嵌套的 `LowcodeNavigationNode[]`，再由 `src/lowcode/lowcode-runtime.ts` 转成 `ProjectNodeData[]`。

`spark-project-model` 同一套 `ProjectNodeData` 同时承担：

- 项目策划树；
- 页面设计入口；
- 运行菜单；
- Vue 系统页；
- 链接、动作和跨项目引用；
- 嵌套 `children` 持久化形状。

`ProjectWorkspace`、`NavigationClient`、DevSystem 编辑器和运行壳层都以 `navigation` 为主语。结果是“项目蓝图”和“运行导航”没有独立合同，设计器也只能看到菜单接口返回的可见节点。

Vue 页面注册表是全局组件目录，没有项目归属；后端项目蓝图记录才应决定某个项目使用哪些共享 Vue 实现。组件注册表只证明实现可解析，不能反向成为项目蓝图或菜单 SSOT。

### AppWorks 当前输出 API 仍以导航为中心

`spark-project-model` 已经存在多类由同一项目聚合派生的输出，但公共命名没有表达其共同来源：

- `navigationRoot`、`toTree()`、`readNavigationProjection()`：结构树和设计器投影；
- `readPlanningProjection()`、`readProjectPlanningInput()`、`readNavigationPlanningInputs()`：策划和 AI 输入；
- `readActivePageProjection()`：页面设计输出；
- `readDirtyProjection()`：蓝图/页面变更诊断；
- `ProjectPlanningAiRunResult.navigationDirty/savedNavigation`、AI delivery artifact `kind/name = navigation`、Host Run `navigationRoot`：AI 交付结果。

这些并不是多个导航 API，而是项目蓝图的结构、策划、页面、状态和 AI 输出。继续逐个改名会再次形成平级 API；应由一个蓝图输出子领域收束，并按输出族分层。

### AppWorks 已有权限组件基座，但没有闭合后端权限合同

`spark-component/src/permission/` 已存在 `PermissionChecker`、`PermissionResolver`、`PermissionFilter`、`FieldRenderHelper` 和 `usePermission`；字段组件通过 `useFieldPermission` 消费部分字段权限。该包应继续作为唯一组件 owner，不另建平行权限组件包。

当前实现仍有以下缺口：

- 缺少模型/行权限快照时，创建、删除、编辑等多处采用默认放行；
- 使用 `_modelPerm`、`_perm.editableFields/hiddenFields/maskedFields` 等二次形状，没有原样承载 `allowAdd`、`lingma_sys_key` 和 `r/e/h/m/d`；
- `permissionMode=masked` 会把后端 hidden 改成 masked，改变后端输出语义；
- `maskFieldValue` 会根据前端字段名自行猜测脱敏算法；
- 字段输入已有部分接入，但容器、动作、展示、批量操作仍大量直接读取本地 `disabled/visible/editable`；
- 当前约 27 个组件文件接入权限 facade，仍有大量组件独立判断状态。

因此“三态”只能作为现有组件的过渡投影。最终目标是所有承载数据或动作的基础组件直接消费后端完整权限快照；修改授权配置后无需修改页面代码。

### lowcode-jdk17 已有三种项目文档任务，但当前覆盖范围仍是菜单

只读源码确认了三个异步端点：

- `/api/File/exportSRS?sysId=...`：需求规格说明书；
- `/api/File/exportDesignDoc?sysId=...&level=...&isText=...&isHtml=...`：功能设计文档；
- `/api/File/exportSDD?sysId=...`：系统详细设计文档。

它们启动后台生成与上传，完成后通过 SSE `SYSTEM_DOWNLOAD` 返回文件路径、应用类型和文件名。因此前端合同应表达“提交蓝图文档生成任务 -> 接收下载回执”，不能伪装成同步二进制下载。

`DocExportServiceImpl.queryNavTree` 明确对 `Base_NavigationInfo` 使用 `IsShowAtNav = 1`。所以当前 SRS/SDD 只使用菜单范围节点；功能设计文档也必须通过行为测试确认实际覆盖范围。它们是可复用的旧渲染器，但在证明完整覆盖前不能称为“完整项目蓝图文档输出”。隐藏需求、原型、业务场景、report-only 和非菜单子页面缺失时，必须返回 coverage diagnostic/capability gap，不能静默成功。

当前 `backend-api-contracts/endpoints.ts` 只登记了 `exportDesignDoc`，尚未登记 `exportSRS`、`exportSDD`，且把响应写成 `binary/void`，与真实“异步任务 + SSE 下载回执”行为不一致；该账本需要由源码和 characterization 补全。

## 正名后的领域模型

### ProjectBlueprint

`ProjectBlueprint` 是项目级持久化事实：

- 以 `projectId/sysId` 隔离；
- 以平铺 `nodes[]` 存储；
- 每个节点使用稳定 `nodeId/rowid`、`parentId/prowid` 和 `order/FunOrderValue`；
- 树、阶段视图、菜单、路由、页面目录均由只读投影器生成；
- 禁止把嵌套 `children` 作为第二份可写真源。

蓝图节点的业务种类至少覆盖：

- 结构节点：项目、模块；
- 策划节点：需求、原型；
- 场景节点：数据空间/业务场景；
- 交付节点：页面、子页面、报表、流程、集成、动作、外链。

种类的最终持久化映射必须来自现有字段/字典的只读证据；`conType=Model/Navitem` 只能作为历史线值，不能继续充当 AppWorks 的完整蓝图类型系统。无法无损映射的记录必须标为 unresolved，不能按标题、URL 或是否有子节点猜测。

### RuntimeNavigation 蓝图输出

`RuntimeNavigation` 是 `ProjectBlueprint` 按常规动态导航数据结构生成的一种只读输出：

- 节点、父子关系、排序、入口配置和菜单候选资格全部来自项目蓝图；
- 输出采用普通动态导航所需的 `id/parentId/title/path/icon/order/children` 等字段，不夹带需求、原型和数据空间设计细节；
- lowcode `GetNavigationMenus` 的后端授权结果仅作为可见性/可访问性裁剪证据，并继续承担最终权限判定；
- 后端授权响应不得被保存或反推为另一棵可写项目结构树；
- AppWorks 只负责组件解析、路由物化、菜单布局和交互状态；
- 不允许前端从角色名称或页面本地状态自行重算用户授权菜单。

`IsShowAtNav` 是“是否具备进入动态导航输出的候选资格”，不是“节点是否存在”；候选节点还要与后端授权结果相交。需求、原型、数据空间或 report-only 节点可以存在于蓝图而不出现在动态导航输出。

### ProjectBlueprintOutputs

`ProjectBlueprintOutputs` 是围绕同一蓝图快照的只读输出门面，不拥有持久化状态，也不反向写蓝图。输出按领域分组，不建立一批平级 interface：

1. **结构输出**：平铺快照、层级树、模块/页面/子页面目录、节点索引。
2. **策划与设计输出**：需求上下文、原型目录、页面策划投影、场景/数据空间与模型绑定矩阵。
3. **交付输出**：常规动态导航、路由/组件绑定清单、页面运行闭包、报表/流程/集成入口目录。
4. **文档输出**：需求规格说明、功能设计文档、系统详细设计文档的规范化 source、异步生成任务和下载回执。
5. **治理输出**：验证诊断、身份闭包、权限覆盖、差异/对账、种子 dry-run 与 capability gap。
6. **AI/工具输出**：项目策划输入、受限节点上下文、交付 artifact 和 Host Run result；其 `kind/name/field` 必须使用 blueprint 语义。

运行菜单只是交付输出之一。文档、目录或 AI 上下文不能通过运行菜单反推；它们必须从完整蓝图快照投影，并在需要时再联合数据空间、模型、权限或后端渲染能力。

非蓝图来源的导出不纳入这次正名，例如租户设置导出、业务表数据导出、报表结果数据导出。判定标准是“蓝图是否是输出的主要结构/策划输入”，不能靠方法名中出现 `export` 机械重命名。

### 蓝图节点的修改能力

节点能力按种类封闭，不提供全局 `mutate(action, payload)`：

- 项目/模块/需求/原型节点：修改自身策划内容和层级；
- 数据空间节点：修改数据空间配置、前端模型、数据资源/字段/关系引用；
- 页面/子页面/报表节点：修改交付定义和数据空间消费配置，不拥有数据定义；
- 流程/集成/动作/外链节点：修改各自定义和交付绑定；
- 功能标签子节点：修改标签定义；
- 项目级权限管理节点：修改功能标签与数据对象对岗位、机构、角色、用户等主体的授权关系。

节点 capability 只形成受约束 command；统一执行器负责鉴权、风险分级、preimage、journal、readback 和 compensation。后端不具备安全闭环的能力必须 fail-closed。

### 数据空间、前端模型与页面消费

数据空间只承载前端模型这条线。前端模型是数据空间内部实体，不是蓝图节点，也不是物理数据资源：

```text
ProjectBlueprint
  -> DataSpace node
       -> FrontendModel
            -> referenced data resources
            -> selected fields
            -> relations and consumption structure

Page / Report node -> consumes DataSpace only
```

页面的所有数据访问必须经数据空间，不能直连物理表、视图、字典、接口或另造页面本地数据定义。页面可在后端权限允许范围内执行完整运行 CRUD，但字段、关系和数据源配置只能由数据空间节点修改。

数据空间公共 API 按目标语义严格拆分：

- `design`：数据空间定义、前端模型、数据资源及字段引用、关系、字典/接口/逻辑视图配置；
- `runtime`：页面通过 FormKey 消费数据空间后的查询、分组、唯一值、自引用、过程调用和业务 CRUD。

同一 lowcode `DataOperation` 物理端点可以被两个内部适配器复用，但公共合同、鉴权上下文、mutation 风险和 journal 必须分离。分类依据是目标数据语义，不是 URL、HTTP 方法或调用页面。

### 功能标签与权限设计独立于数据空间

功能标签属于页面、报表、动作等交付节点的子节点；项目级权限管理域集中维护授权。数据空间不保存功能标签、授权主体或权限计算逻辑。

权限设计以完整对象粒度消费数据空间：可引用数据空间、前端模型、数据资源、字段、行操作和功能标签，再授权给岗位、机构、角色、用户等主体。配置数据继续以后端数据库为持久 SSOT。

运行链固定为：

```text
feature tag + data-object grants
  -> department / organization / position / role / user assignments
  -> lowcode backend authorization
  -> allowAdd + lingma_sys_key + r/e/h/m/d + permitted functions
  -> AppWorks atomic permission snapshot
  -> component rendering and operation guard
```

前端不读取授权配置计算权限，不合并角色放权，也不缓存第二份权限事实。

过渡期现有组件可使用三类三态投影：显示、编辑、动作；原始五个稀疏集合始终保留。完整组件改造后，由基础组件直接消费后端权限快照，三态 adapter 删除。

### 身份必须独立

以下身份默认均不相等：

1. `projectId/sysId`：项目隔离身份；
2. `blueprintNodeId/rowid`：蓝图节点身份；
3. `runtimeNavigationId`：运行投影引用的蓝图节点身份；
4. `dataSpaceId`：可被页面、报表等复用的业务场景容器；
5. `formKey`：具体页面/表单载体进入场景时使用的后端上下文；
6. `modelId`：数据空间内唯一前端模型身份；
7. `componentKey`：共享 Vue 实现的逻辑键；
8. `routePath`：浏览器寻址路径；
9. `resolvedVueFile`：真实实现文件。

`conid` 在 lowcode 线协议边界先作为 `legacyContentId` 保真读取。只有结合节点种类、真实 `_Base_Form` / `Base_DataSet` / 模型读回和运行消费证据后，才能分别形成 `formKey`、`dataSpaceId` 及它们在特定历史记录上相等的证据。禁止把一个 `conid` 无条件复制到两个 canonical 字段。

## 调用链调整

### 设计时

```text
DataOperation.GetData(Base_NavigationInfo, SysId)
  -> LowcodeProjectBlueprintRow[]
  -> ProjectBlueprint(flat nodes SSOT)
  -> ProjectBlueprintTree projection
  -> 项目蓝图设计器
```

设计时看到完整蓝图，包括不显示在菜单中的需求、原型、场景、子页面和报表节点。

### 运行时

```text
ProjectBlueprint(flat SSOT)
  -> conventional dynamic-navigation projection
  -> intersect FormDesign.GetNavigationMenus authorization by stable node id
  -> RuntimeNavigation output
  -> DynamicRouter + Admin Shell
```

运行导航的结构来自蓝图投影，授权来自后端最终结果；任何一方都不能取代另一方。

### 页面/报表数据闭包

```text
blueprint delivery node
  -> scenario binding evidence
  -> dataSpaceId
  -> modelId + fields + relations + inputs
  -> backend-final permission snapshot
  -> Vue page / report renderer
```

页面和报表可以复用同一数据空间，但拥有独立交付身份；物理表名仍不得冒充 modelId。

这里的 `modelId` 只标识数据空间内部的前端模型；它不成为蓝图节点 ID，也不证明物理资源所有权。此前“没有模型”的修正含义是“不建立模型蓝图节点”，不是删除数据空间内部的前端模型。

### 文档输出

```text
ProjectBlueprint(flat SSOT)
  -> ProjectBlueprintDocumentSource
  -> coverage validation
  -> existing lowcode renderer request (SRS / feature design / SDD)
  -> SSE SYSTEM_DOWNLOAD receipt
  -> BlueprintDocumentResult
```

`ProjectBlueprintDocumentSource` 负责表达完整蓝图文档需要的结构和引用；现有 lowcode renderer 只是物理执行适配器。若 renderer 仍只消费菜单节点，结果必须带出 `legacy-menu-scope` 或等价覆盖诊断，本轮不得为掩盖缺口在浏览器端临时拼装一套未经审核的 DOCX 生成器。

## 影响面

- 公共 lowcode 合同：需要把完整蓝图读取与运行菜单读取拆成独立领域文件和方法。
- 项目模型：平铺蓝图成为唯一可写聚合；当前嵌套导航树降为投影。
- 工作区 IO：`ProjectNavigationGateway/NavigationClient` 改为蓝图语义；mutation 仍 fail-closed，直到现有后端能力、写前镜像、幂等、journal、readback 和补偿全部有证据。
- DevSystem：从“导航编辑器”改为“项目蓝图设计器”，并把运行投影配置作为节点的一个局部面板。
- 运行时：消费蓝图派生且与后端授权结果相交的 `RuntimeNavigation` 输出，不能保存第二棵运行结构树。
- Vue 注册表：继续是共享组件实现目录，由项目蓝图记录绑定，不增加项目级代码复制。
- 页面、报表和数据空间：必须按独立身份建立闭包，不再按节点机械创建数据空间。
- 节点 capability：每类蓝图节点暴露受限修改命令，真实写入统一进入治理执行器。
- 数据空间 API：按目标语义物理复用、公共分离为 design/runtime；页面只能消费 runtime。
- 前端模型：仅存在于数据空间内部，负责引用数据资源、字段和关系，不成为蓝图节点。
- 功能与权限：功能标签属于交付节点，授权设计独立消费数据空间并以完整对象粒度配置主体关系。
- 组件权限：保留并重构现有 `spark-component` 权限基座，先统一三态适配，再完成全组件原生权限消费并删除适配层。
- 输出 API：结构、策划、设计、交付、文档、治理和 AI 输出统一收敛到蓝图输出子领域；删除以 navigation 表达蓝图输出的公共字段、结果和 artifact。
- 文档任务：前端补齐 SRS、功能设计、SDD 的异步请求、SSE 下载回执和覆盖诊断；lowcode-jdk17 保持只读。
- 测试：新增平铺 SSOT、树投影、运行菜单投影、身份不混同、未知类型 fail-closed 和现有项目 ID 保留测试。

## 当前限制

1. AppWorks 缺少 `workspace.catalog.json`，技能治理闭工具无法建立机器路由；本轮以仓库源码、AGENTS.md、测试和只读源证据为准，并在计划中补齐该治理缺口。
2. 当前没有可信 S0/T0 初始迁移档案，因此不能宣称严格增量迁移；本轮按完整重建基线处理。
3. `conType` 和相关字典的真实值域尚需授权环境只读 readback；在此之前不能冻结数据库字段到完整蓝图种类的最终映射。
4. 本轮不执行数据库扩字段或 live 元数据写入；若现有字段无法无损保存蓝图种类，形成明确 capability gap，另行提交数据库/治理方案，而不是把 JSON 偷塞入 `memo/htmlDesc`。
5. lowcode 的 SRS/SDD 当前只取 `IsShowAtNav=1` 节点；功能设计文档的完整覆盖仍需行为 characterization。前端正名不能把此限制伪装成已解决。
6. 当前 `backend-api-contracts` 对功能标签、授权配置、权限缓存更新和数据空间 design/runtime 复用关系登记不完整；必须先由源码和只读行为测试补齐，不能据 controller 名猜分层。

## 与既有计划的关系

`notes/plan-lowcode-frontend-api-cutover.md` 的公共 API、前端直连、lowcode-jdk17 只读和后端退役方向继续有效；其中把 `ProjectNodeData` 和后端菜单树视作项目设计模型的部分，被本次项目蓝图方案替代。旧计划不覆盖、不删除，后续实施以本计划的蓝图/运行双合同为准。
