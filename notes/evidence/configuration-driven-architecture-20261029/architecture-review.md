# 配置驱动架构核对与实施建议（只读分析）

日期：2026-10-29。核对基线：`0535fbe993bea2c989f42f9f28176fd169ef5c03`。本文是供主控合并到 `notes/data-space-retirement-ledger.md` 的分析证据，不是第二本总台账；未修改产品、测试、生成物、正式数据或 Java。本文中的拟议接口和阶段均不是已实施事实。

## 1. 结论与范围

现有底座足以承接配置驱动的主体：正式 DB 模型/字段、原生 DataSet/DataTable/DataView、ScenarioViewConfig、五类 pagedata 定义视图、DataView 变更提交、文件冲突/回读、PageRuntime 多空间和标准组件绑定均已存在。不能重新造配置框架。当前缺口集中在：首次元定义与配置读取尚有 DataView 之外的入口；配置文件所属应用被现执行应用绑定；部分消费者仍在 host 拼视图和覆盖查询；正式 7AB 还没有应用目录绑定/视图。

目标链是：**稳定的引导资源合同 → SPARK data 元定义视图读取正式来源 → SPARK data 场景配置资源读取 pagedata → 选择本次需要的模型范围 → 现有装配器 → PageRuntime → 标准组件完整键绑定**。LowcodeDesignApi、Runtime API 和原文件网关只能处于数据层 executor 的内部，不能先由 host 调用它们得到文本/数组，末端才包装 DataSet。

实施优先顺序：先补引导公共缺口并只读验证，再用现有设计器部署最小 7AB 视图，再切换目录/根及其全部消费者；随后空间管理、DevSystem NavHost 和资源专题依次消除覆盖配置。每一片都删除已被取代的逻辑，保留必要领域命令。不能以完成两个摘要调用或页面 TS 迁移文件为总体完成。

## 2. 当前事实、缺陷、目标与待核分开记录

| 分类 | 已核内容 | 证据/含义 |
| --- | --- | --- |
| 当前事实 | 认证 scope 的正式 7AB/Base_AppSystemList DataView 已返回 62 条，根查询返回唯一 D99 根；SPA 激活采集无 Document 请求 | `remaining-catalog-consumers-20261028/outcome.md`、`spa-network.json` 及当前唯一台账；这是中间 API 收敛的证据，不是正式配置加载证据 |
| 当前缺陷 | `loadFormalHostDataView` 仍 `new ScenarioViewConfig`，目录/根模型、字段、排序、分页和请求配置在 host 构造 | `src/lowcode/lowcode-application-catalog.ts:46`、`:68`、`:94`、`:111`；不得把构造搬到新 helper 后宣布配置化 |
| 当前事实 | 正式空间记录 `7AB874097A1E8711A42FD845939A6E05` 的 `sysid` 为 `D99A1DCE9894698799101EFD70F8FC76`；rowid、Name、sysid 可读且结果唯一 | `spa-formal-config-source.json`；这次证据在已选 D99 执行 scope 下取得，不外推为认证 scope 元定义读取证明 |
| 当前事实 | 正式 `D99/SysForm/7AB/pagedata.json` 存在，Code=200，字符串内容可解析，scenarioId 匹配 | 同上；此路径来自本次正式记录及现有适配约定，不得硬编码 D99 到产品 |
| 当前事实 | 配置仅有 Base_NavigationInfo(default、catalogBindings)、Base_Navigation_Desc_Version(default)、Base_Navigation_DataRelation(default)、ProjectToolVersion(file/default) | 同上；没有 Base_AppSystemList 绑定，必须经定义视图补齐，不能仅把 host 切到不存在的配置 |
| 当前事实 | 该 pagedata 未采用原生 resourceRelations 数组模式 | 同上；保存新增视图必须保留 legacy 关系模式和现有四个绑定，不自动写 `resourceRelations: []`、升级 schema 或重建整份文件 |
| 当前缺陷 | `readSpaceDefinition` 只返回 rowid/Name；`loadLowcodeRuntimeScenario`、scenarioViewPath 与 ProjectWorkspace 当前要求选中执行应用等于文件来源应用 | `data-space-design-api.ts:69,376`；`lowcode-data-space-runtime.ts:88`；`lowcode-runtime.ts:464`；这是前端公共链缺口，不是新 owner/后端协议的证据 |
| 目标 | 目录在选应用之前可用，查询范围由登录与正式服务端返回决定；执行应用、资源来源、目标应用分别携带真实身份 | 0.2—0.7 和最新用户纠偏；不建前端 tenant/role/owner 权限模型，不取消原 fence/authscope |
| 精确待核 | 认证 scope 下通过 SPARK data 元定义资源读取 7AB/sysid；随后同 scope 的场景配置资源能否读取正式文件 | 首片正式资源链及只读验收。现有 selected-D99 文件响应不能代替该证据；也不能把尚未验证表述成后端不支持 |

## 3. 现有能力应如何复用

### 3.1 正式模型、语义资源和数据资源管理

- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts` 已读取 Base_DataSet、Base_DataModel、Base_DataModel_Field、资源主键与输入参数，校验空间/模型身份、完整性和本次字段可读性。`readModelBatch` 可批量取得本次模型，模型名称是正式绑定名，不等于物理来源名或内部表键。字段投影从正式定义派生，不应保存第二份 columns 真源。
- `packages/spark-data/src/data-view.ts` 的 `bindQueryExecutor` 与正式 modelBinding 互斥；显式语义资源有独立 queryIdentity；`types.ts` 的 TableResourceType 允许扩展资源类别。现有能力允许实现少量元定义读取 executor，不需要伪造 DB 模型绑定或另造查询框架。
- 数据资源来源管理已覆盖数据库表/视图、字典、API、JSON/结构化数据、逻辑视图等；`src/lowcode/data-space/model-source/` 的选择/详情链从对应正式目录和字段/参数资源读取。API 输入/输出、头参数和提供方认证配置不是同一 CRUD；数组模型、物理注册、预览也各有真实语义。
- `api-interface-list-page.vue`、`api-config-page.vue` 已沿现有场景加载和标准组件使用 Base_DataServiceInterface、_Base_ParamList、Base_InterfaceApi_Headers、Base_TblField 等定义视图；不能以这些表单已经存在就宣称所有外部调用、账号凭据和返回映射都已执行验证。
- `LOWCODE_FILE_RESOURCE_REGISTRY` 已有 AgentWorkflowFiles、ProjectToolVersion 等明确资源 adapter。资源能力注册表属于执行能力映射；不得把任意文件路径/任意接口作为可执行配置开放。资源输入属于相应 executor 的语义合同。

### 3.2 DataView 与 pagedata 的现成持久化闭环

`ScenarioViewConfig` 已承接 `fieldProjection/queryContext/queryConfig/filterExpression/sortExpression/page/pageSize/treeConfig/valueField/labelField/selectionDelimiter/autoLoad/commitMode/aggregates/allowDelete/lockCurrentWhilePending/onRequestComplete` 等视图合同，以及模型绑定、原生资源关系、视图级联和布局。保存的能力不等于每项运行语义已支持；例如后端聚合需按现行合同另核，不能用当前页求和代替。

`ScenarioDefinitionRecords` 与 `ScenarioDefinitionResource` 已把以下资源绑定到同一 DataSet：

| 定义视图 | 资源 | 现有责任 |
| --- | --- | --- |
| DataSpaceLayoutDefinition | pagedata:layout | 布局定义 |
| DataTableBindingDefinition | pagedata:tables | 引用正式模型或明确 file 资源 |
| DataViewDefinition | pagedata:views | 所属模型内命名视图、查询与交互配置 |
| DataResourceRelationDefinition | pagedata:resourceRelations | 原生资源关系；不冒充 Base_DataModel_Relation |
| DataViewCascadeDefinition | pagedata:viewCascades | 显式视图级联；不从模型关系自动推导 |

现有 `ScenarioDefinitionResource` 的查询 executor 内部调用 workspace；提交捕获本次查询身份/基线/字段变更，保留未查询与未修改记录，限制 target 一致，验证受影响范围，未知结果保留原捕获批次并验证，不自动重发。`DataSpaceViewEditor` 使用标准组件，向原 DataView 新增/编辑视图，保存限定定义视图和绑定视图；取消丢弃原视图变更。应直接复用，不再建立 JSON 草稿或第二保存入口。

`ProjectWorkspace` 已有文件前像比较、保存后精确回读、未知结果核验、显式采用远端版本和历史能力。它不是原子 CAS 或跨源事务；保留这些差异，放在存储 adapter 内。`ScenarioViewData` 当前虽然通过 DataView 保存 text，但构造时必须接收已经读取的 baseline/text，因此**第一次文件读取仍未统一**。这是应补齐的读取能力，不是重写保存器的理由。

`ScenarioDefinitionDocument` 的完整文档编辑确需加载其明确编辑的完整定义；不能把这一特殊合同扩大为所有普通保存都查询全部模型/关系。普通保存继续改什么存什么。

### 3.3 运行装配、完整键与生命周期

`src/lowcode/data-space/lowcode-data-space-runtime.ts:40` 的 `loadScenarioDataSet` 已支持 modelScope，native/legacy 关系的依赖选择、正式模型批读和文件 executor 注入；`lowcode-data-space-assembler.ts` 已把正式 DB 定义与配置组合装配为原生实例。应在加载前选择消费所需模型范围，不能为应用目录装入整个 7AB、ProjectToolVersion 或全部 24 个模型。

modelScope 当前是配置内部 table key；消费者给的是正式模型名称。必须沿 `modelBinding.modelName` 唯一解析到 table key，再交现有选择逻辑，不能把两个名字视为相同，也不能忽略 legacy 关系依赖。作用域裁剪后仍须通过完整身份/关系校验，不为装载成功删掉配置关系。

`packages/spark-project-model/src/page/runtime-page.ts` 已持有声明空间集合、不可变场景输入、异步代际、失败/迟到实例释放、完整键解析和 dirty reload 防护。`resolveDataViewKey` 负责模型名称到内部表键的唯一解析；页面不能退回首个空间或同名表。PageRuntime 能装多空间不等于所有现有页面都已正确使用它。

标准组件应直接消费实例 DataView，字段组件读同一行上下文及权限，动作沿原 view/row 执行；摘要读取可以投影为领域摘要，但不能把摘要数组重新喂给业务表单替代视图绑定。应用摘要、激活查询与页面展示要共用同一合同和唯一投影。

## 4. 必须补齐的最小公共链：bootstrap 不开旁路

### 4.1 三类身份分开

| 身份 | 来源 | 作用与约束 |
| --- | --- | --- |
| 登录查询 scope | `readAuthenticatedRequestScope()` 和既有 HTTP 拦截器 | 认证态失效 fence；业务范围与权限仍由后端判断。当前返回 headers={}，不复制凭据 |
| 现执行应用/激活目标 | 现有路由、应用选择服务、调用者 intent | 执行上下文、用户动作隔离与提交前核验；不用于猜文件归属或筛掉未选应用时的目录 |
| 配置资源来源 | 正式 Base_DataSet 唯一记录的可读 sysid + 已确认存储约定 | 确定配置定位；不是授权、不是创建全局 owner，也不意味着该 app 的查询头必须用于业务数据 |

### 4.2 建议的最窄实现形态（待实施）

1. 在现有 lowcode 数据适配层提供**元定义语义资源读取**，复用 native DataSet/DataTable/DataView 和已有 DataSpaceDesignApi 请求/响应处理。第一次网络请求前已有绑定 executor 的 DataView。executor 内部才执行现有元定义协议，并核对正式 Code/Count/身份/字段权限；host 仅请求该视图。无 metadata 参数时直接 `runtime.query` 的旧上层入口被替代或收为 executor 内部。
2. 引导描述只定义元数据服务的稳定资源身份、必要输入/输出和读取操作；它不是另存一份 Base_DataSet 模型，更不是目录业务视图配置。来源记录输出加入 `sysid`，仅在唯一、完整、可读、合法路径段时形成只读 locator。不得为空时退回选中应用或 D99。
3. 扩展现有 `ScenarioViewData`/场景配置资源读取模式，使 `loadFromServer` 的 executor 内部根据 locator 调用现有 LowcodeDesignApi/ScenarioViewGateway。让原 ProjectWorkspace 保存、冲突与回读消费同一资源合同；业务层不能直接暴露 readText/writeText。不要把读取文本提前到资源创建之前，也不要新建平行文件 owner。
4. 实现时优先复用已存在的 `ScenarioDefinitionResource` 查询与编辑资源；最初载入场景全文可由现有 ScenarioConfiguration 语义资源承接，后续五类定义资源按需投影。明确避免“加载元配置需要先加载其自身 pagedata”的递归：最低层固定的是协议级资源 adapter，不是业务 view 的默认查询。
5. 将加载器的依赖从全局 selected-scope `lowcodeApi.dataSpace.design` 改为本次已建立的元定义资源/读上下文；Assembler 继续使用已有注入接口。认证 scope 读取业务元定义与执行正式目录查询；文件读取独立保留源身份和登录 fence。普通已选应用执行仍保留原有 scope 行为，不能为修 bootstrap 广泛撤销写守卫。
6. 载入配置后先验证 scenarioId、模型绑定唯一性、正式 modelId/modelName、消费所需视图与字段、输入参数和完整结果合同，再装配/查询。缺配置、缺模型、缺视图、来源不可读、歧义或不合法明确失败。禁止 host 回退构造视图。
7. 一次实例持有 source locator、query scope、caller fence 和 generation；切换来源/登录/参数后旧结果不得装配或提交。新来源创建新资源实例，旧 DataSet/View/临时查询释放。文件资源的可编辑配置能力不代表业务模型行字段被授权；不制造权限回包或 admin 特例。

这是一处已有加载/适配链的补口，不建议新增通用“BootstrapManager”、权限中心、全局配置缓存或自定义第二请求协议。

### 4.3 稳定身份与正式配置的边界

可以保留：平台正式元数据入口标识（当前 8D 设计 FormKey）、平台目录空间标识（当前 7AB）、资源种类/adapter 注册、分页响应编码、路径段合法性、DataView 完整键语法、领域要求的身份字段，以及视图 `default` 的运行结构约束。这些只定位既有产品/协议能力，集中由已有平台注册合同承接，不能散落多份。

必须来自正式配置：业务模型绑定及其正式 ID、命名视图、查询输出/过滤/排序/页大小/选项字段/树/级联/布局、NavHost 数据关联、调用参数定义。D99 是本次读回的来源，不是可固定的平台常量。`prowid='000000'` 作为根筛选应存入根专用视图；host 保留对根结果是否符合领域合同的验证。

## 5. 7AB 首批配置和消费者迁移

首批配置可采用 `Base_AppSystemList@applicationCatalog` 与 `Base_NavigationInfo@navigationRoot` 命名（名称最终以正式编辑结果统一，不做别名 fallback）。Base_AppSystemList 目前无 table binding，必须读取其真实 modelId/modelName；先在现有设计器填写绑定表名 Base_AppSystemList、首个视图名 default，沿 DataSpaceViewEditor.add() → 定义 DataView.addRow 暂存并由现有绑定/default staging 处理，再在同一绑定内新增 applicationCatalog 命名视图。不能猜 modelId，不预造首视图创建能力；只有实际合同或回归证明现有链不能完成时才修。导航在已有绑定内新增 navigationRoot，保留 default/catalogBindings、全部四个原绑定及 legacy 关系模式。

- 应用目录视图配置来自当前已证实请求语义：正式输出字段、distinct、完整列表加载、初始分页/排序等。字段必须以正式输出定义为准，不凭空添加 IsSys。`Memo` 描述与 `AppDesc → AppName → rowid` 名称语义分别保留。完整 ID、唯一性及可读字段投影继续校验。
- 根视图只投影 rowid/SysId/prowid，保存 `SysId=GetInputParam(systemId)` 与 `prowid='000000'`，distinct、读取完整候选范围及至多两个候选的防御上限。host 只设置本次 systemId 输入并核唯一结果，不再覆盖 filterExpression/queryConfig。参数绑定复用 `DataViewFilter.bindInputParams` 和现有 queryContext 输入，不建字符串拼 SQL。
- 配置保存通过 DataTableBindingDefinition/DataViewDefinition 原视图和 `DataSet.saveChanges({views: ...})`。此次仅改变新绑定/两个命名视图，不修改 DB 模型、默认导航视图、文件表或 legacy 关系模式；回读必须逐项证明未修改部分保留。
- AppList、PlatformApps、应用选择内部查询、显式导航、settings、projectReferences 全部引用这组正式视图和唯一权限感知摘要。PageRuntime 不再声明假 default 后由 host 装出相似对象；标准列表/字段绑定真实完整键。
- 核心“配置驱动”验收：通过正式设计器修改目录命名视图排序和页大小，保存、关闭、重开；在无需修改 host 代码的同一 SPA 新实例中核对查询参数、排序与最终完整列表。在自动化夹具或隔离测试配置中去掉必需视图，验证明确缺配置且零旧请求回退；不删除共享线上入口的必需视图来制造故障。正式排序/分页验证后仅恢复本次变更。

## 6. 不应漏掉的后续消费面与删除清单

| 当前消费面 | 配置化切点 | 必须保留的领域差异/生命周期 | 被替代后删除 |
| --- | --- | --- | --- |
| 数据空间目录 `lowcode-data-space-catalog.ts` | 已有 catalog/catalogApps/catalogUsers 视图，去掉 host 对 fields/allPages/autoQuery 的强制覆盖；来源 sysid 显示与设计器定位来自正式读回 | 目录创建的正式应用候选、删除前精确目标引用检查、scope 和 pending guard | 重复选项/查询状态、可由命名视图/输入表达的查询构造；不删除合理业务命令检查 |
| 数据空间设计 `lowcode-data-space-design.ts` | 单个目标 spaceId，metadata 与配置资源从正式来源定位；视图保存闭环直接复用 | 定义取消、未保存切换、字段/关系归属、变更范围/未知回执，元配置与目标空间身份分开 | 页面可直接进入的 workspace 文件读写入口、当前应用充当所有配置来源的假设 |
| DevSystem `NavHostProjectPicker.vue` | 关系视图的 prowid 输入、候选场景/模型和树/选项配置；组件绑定候选 DataView | 候选完整性、重复/环/孤儿校验、分页值证明、选择应用 intent、旧资源释放 | host 覆盖 allPages/树/过滤的可配置部分；不把合法领域校验搬进配置后消失 |
| 蓝图 workspace 与只读信息 | 节点/子节点专用命名视图及 SysId/prowid 输入，引用正式场景 | 节点业务命令、编辑版本、真实保存回执和切换 fence | 通用查询字段/分页/过滤构造；不以删除整个 workspace 达成行数目标 |
| 数据库服务器/目录/表视图 | 把 `lowcode-database-server.ts`、directory、table-view 中的 ScenarioViewConfig 移入正式定义，保留已有数据资源 | 连接测试、注册命令、后端真实结果与默认字段是否应用、未知结果核验 | host 的默认视图与级联配置构造、重复查询/状态；不把注册假扮普通 CRUD |
| 字典 | catalog/application options/formal editor 视图，运行从正式配置装配；设计与条目独立保存 | 编码/标题/六字段结构校验、条目权限、分别回执 | 硬编码 view builder、运行时 bundled pagedata fallback；发布种子可留但不能成为运行第二真源 |
| 结构化/API/逻辑视图/文件资源 | structured-config-catalog 的视图/树/用户选项配置；已使用正式场景的页面先核执行与绑定完整性 | 来源独有输入输出、JSON/脚本/头参数、文件修改范围、实际协议差异 | 仅替代重复配置与算法，不强制全部来源统一 CRUD、不删除仍使用的 adapter |

NavHost 特别约束：当前 Base_Navigation_DataRelation 合同有 dataSetId/DataName/字段映射，但没有独立 viewId 字段。不能发明后端列，也不能把完整键塞进 DataName。首片可明确绑定正式 `default` 视图；如确需多个命名视图选择，必须在已有页面/场景绑定配置落点表达并验证，而不是修改未经确认的 DB 协议。参考仓 DataName 来自资源 MetaName，当前消费者按正式注册 modelName 解析；二者须逐条核对正式记录，不能因同名就猜等价或自动重写。

## 7. 可执行切片计划

| 切片 | 输入与输出/公共能力 | RED、自动化与真实验收 | 正式修改、回滚/保留边界 |
| --- | --- | --- | --- |
| 0：冻结来源证据 | 输入当前 HEAD、7AB 正式来源/现有配置；输出源身份/绑定/关系模式清单及精确前像 | 核摘要与原始响应相符；确认登录与执行 scope 标签，区分当前证据和历史 | 只读；不补数据、不改 Java；本报告并入唯一台账 |
| 1：元定义与配置资源读取 | 输出首次 I/O 前已存在 DataView 的公共链、sysid locator、认证读取能力；现有 assembler 和源适配复用 | RED：旧入口绕开 view；来源缺/隐藏/重复/非法；auth 变化/迟到；配置缺失/错 scenario；命名视图缺失；modelScope 不装 ProjectToolVersion。真实 SPA 只读：未选应用读取正式元定义和 pagedata，捕获 source/headers/Code/结果，已有执行应用不同也验证 | 无正式写；失败保留当前可用收敛片，不加回退。auth-only 失败保存精确服务回执并沿现行 API 排查；不能以 selected-D99 成功代替，也不能先宣布缺全局 owner |
| 2：正式 7AB 最小定义 | 输出 AppSystemList 正式绑定/default/catalog view、导航 root view；维持原 legacy 配置 | RED：首次模型无 binding 仍能创建 view 草稿并连同绑定提交；空输入 disabled 正常；取消不变；保存后重开相同；已有四表/字段/关系模式未变；权限失效/未知结果不重发。源码确认后只修实际缺口 | 仅此空间配置文件的捕获变更；不写业务 app/root 行，不改 DB 模型。先本地完整演练再正式编辑，记录影响消费者；未知回执停留 verify，不全文件覆盖回滚 |
| 3：目录/根全部消费者 | 输出所有消费者从正式 named view 加载，host builder 和 query override 删除；摘要投影/选择 fence 保持 | RED：修改配置排序/pageSize 改变实际请求和展示，不改 host；缺配置明确报错；无/多根、缺输出、hidden/masked、重登录/快速切换/abort、重复 ID、finally destroy。真实 SPA 首次目录、标准卡片激活、返回/刷新、不整页刷新、不同执行应用与 source | 修改仅消费代码和绑定；配置仍可回读。切换后删除旧构造，不能保留隐藏 fallback；不可达 settings/reference 只标自动化，不冒充页面烟测 |
| 4：空间目录/设计 + NavHost | 输出单目标设计器来源正确，已有命名视图驱动目录和项目候选；开发实例各自绑定 | RED：内部表键≠modelName、跨空间同名表、来源切换旧草稿禁止保存、只改本视图、不查未加载依赖、首次 view、取消/reopen、候选页外值、重复/环、切换释放。真实页面按参考工作区逐项核布局/入口/动作顺序与下游项目切换 | 逐个空间/明确目标配置修改，不自动重挂孤立记录、不创建猜测关联；保留授权不可写/缺候选的真实状态 |
| 5：资源专题逐页迁移 | 顺序建议：服务器/数据库目录→表视图注册→字典→结构化/API/逻辑/文件；每页列配置、公共能力、领域命令 | 每页至少读取/编辑/取消/保存/未知回执/重开/下游消费；标准组件 fullkey/字段权限/绑定释放；注册默认字段和外部接口实际行为分别取证 | 设计与业务数据分开，变更按各资源实际回执确认；不为配置化扩展写入授权，不承诺跨来源事务 |
| 6：页面配置与第二页复用 | 已确认数据合同后，用现有 rule/script/style + 共享 pagedata 恢复完整页面；至少第二页沿同一流程复用 | ClassModel 目录→概要→指南→标准组件/成员/事件→真实绑定；同空间多 view/多空间参数切换、保存范围和 UI 原路径回归；证明删掉重复状态/算法 | 原生目录/蓝图 URL 保持，不改后端导航迁就目录；不将整个 Vue 包装称四文件完成；需要的窄交互组件留在所属域 |

每片的工程验证由变更面决定：先有效 RED，再定向单测、typecheck/相关 lint、正式 ClassModel/lowcode 合同生成（涉及声明时），完整 verify:rules/build；测试命令和实际结果归同一台账。原有 4+5 个失败基线分开记录，不改测试使其消失，不把本报告视为新增测试通过。

正式修改前，应列出目标空间、定义视图/记录、DB 或文件来源、所有直接消费者、预计持久结果和撤销范围，导出当前正式前像。回滚代码与回滚配置分别确认；共享文件不能整份恢复旧快照覆盖他人变更。回滚也从原 DataView 形成仅本片变更并消费真实回执。发生未知结果先核验原批次，禁止再次执行或自动删数据。

## 8. 当前源码与参考依据索引

| 源码 | 核对点 |
| --- | --- |
| `src/lowcode/lowcode-application-catalog.ts:46,68,94,111,208,249` | host 拼配置；正式目录/根查询；唯一摘要投影与释放 |
| `packages/spark-lowcode-api/src/lowcode-api.ts:105,114` | 认证 scope 与已有应用 scope 的不同用途 |
| `src/lowcode/data-space/lowcode-data-space-runtime.ts:40,78,88,113,144` | 模型范围、全局 design 读取、文件首次读取、文件资源绑定、metadata 装配 |
| `src/lowcode/data-space/lowcode-data-space-assembler.ts` | 正式模型/配置唯一装配；native/legacy 关系、文件 executor |
| `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:69,376,434,474,743` | 来源输出缺 sysid；正式模型；有/无 metadata 的不同查询入口 |
| `src/lowcode/lowcode-runtime.ts:464,497,517` | 配置来源与 selected app 被绑定；现有文件 gateway |
| `packages/spark-lowcode-api/src/design/lowcode-design-api.ts:108` | 已有 File/content/text 协议与注入 scope；只能处于资源适配内部 |
| `packages/spark-project-model/src/scenario/scenario-view-config.ts` | pagedata 配置合同、模型范围选择、legacy/native 模式 |
| `packages/spark-project-model/src/scenario/` 的 ScenarioDefinitionRecords/Resource/Document、ScenarioViewData | 五类定义资源、变更范围、全文特例、首次读取缺口 |
| `src/lowcode/data-space/view-design/lowcode-data-space-view-metadata.ts`、`DataSpaceViewEditor.vue` | 定义视图标准绑定、新视图草稿/隐式绑定、取消、saveChanges 范围 |
| `src/lowcode/data-space/model-source/save/data-space-definition-save.ts` | 捕获本次提交、分别确认、未知结果验证 |
| `packages/spark-project-model/src/page/runtime-page.ts` | 多空间、完整键、调用参数、异步代际与释放 |
| `packages/spark-data/src/data-view.ts`、`data-space-query-options.ts`、DataViewFilter | 资源 executor、查询身份、参数化过滤、字段/提交合同 |
| `src/lowcode/resources/database/`、`resources/dictionary/`、`resources/structured-config/` | 当前 host 构造与必要领域 adapter 的不同归属 |

已找到且核对的参考仓为 `E:/r/sparkproject`，当前读到 HEAD `d472c070f72751bcfdf136ebc25bce6cc4575edd`。原生设计页面现位于 `packages/ui/domain/metadata/src/features/data-platform/data-set-management/design/ui/`，而不是继续假定旧 apps/appworks 路径存在。其工作区、节点面板和 DataView 配置 UI 可作语义/交互参照；参考实现的本地草稿、角色、后端 DataView 表和直接 API 不成为本仓合同。NavHost 参照 `packages/ui/domain/metadata/src/features/application/application-function-management/ui/use-application-function-page.ts:2363`。本仓仍按用户确认保留原业务相对路径和蓝图 URL。

## 9. 未验证项及下一步只读验证

1. **认证 scope 元定义与文件读取**：先实现正式资源读取入口与 RED，再从未选应用的原生目录触发，保存可审核网络证据。仅核对请求身份/定位/结果，不用 CUA 隐藏调用、不拼额外 fetch、不人为改为 D99 请求头追求成功。失败按实际 HTTP/业务回执与既有存储合同定位；没有证据前不宣布后端缺协议。
2. **首次视图创建**：当前 UI 空“绑定表名/新视图名称”导致按钮 disabled 是正常候选解释，不能直接认定坏。已核 DataSpaceViewEditor.add() → 定义 DataView.addRow 的现有暂存入口；实施片继续核其输入、模型唯一性、binding/default staging，再用自动化证明“已有 DB 模型、无 pagedata binding”的首次创建/取消/保存/重开；只有失败才修公共能力。
3. **正式元数据输出**：7AB 的 sysid 当前已选应用下可读；认证读取的字段可见性/完整性仍须从同链回包验证。必需来源字段不可见应明确失败，不使用已缓存或历史来源兜底。
4. **模型范围依赖**：7AB 是 legacy 关系模式，限定目录/根范围后是否引入其它必要 DB 依赖需从实际关系记录核对；不能凭四个配置表推断完整关系，也不能为跳过文件 executor 把关系默默丢弃。
5. **NavHost 视图选择与已存 DataName**：先读当前导航关联和候选模型的正式身份与输出；默认视图可复用，命名视图选择字段不存在不能猜；参考资源 MetaName 与注册名的映射必须实证。
6. **外部资源执行/现存回归缺口**：只读预览、注册结果、API 实际调用、工作流空目录/权限、应用 CRUD 不因本文配置方案自动完成；按各消费片列正式验收，原基线失败持续保留。

完成判据是：资源与配置的首次读取、定义编辑/取消/提交/重开、业务装配/查询、标准组件绑定及生命周期均可沿同一 SPARK data 链审计；正式配置变化驱动运行变化，无 host 补造默认值、无旁路文件读写、无第二模型/草稿真源。所有尚未验证项按上述边界保留。62 条是当前正式证据，不是未来硬编码的应用条数；验收核后端 Count、完整结果与同次展示一致。
