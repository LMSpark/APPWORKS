# 原数据空间设计器交互语义分析

## 范围、基准与判断标签

本报告沿用户业务任务还原旧数据空间设计器的交互：入口、输入、校验、状态变更、调用顺序、屏幕结果、持久结果、失败/取消及后续任务。按 brief 固定检查仓 `E:/r/sparkproject` 提交 `842dec4f11b333df904b9a4e26b6566b0802bab8`；目标 `data-set-management` 源码在该提交上无差异，仓库其他路径存在未提交改动，故本文行号与描述均以固定提交为准。

- **源码已证实**：固定提交中的前端实现明确表现出的路径和行为；不代表线上已经运行验证。
- **需运行核实**：组件/API/服务端结果以及交互时序需在目标环境实际运行才能确认。
- **目标迁移决策**：按本轮 brief，只保留现有 SPARK_AppWorks 底座与原 Vue 业务语义，转为 `rule.json/script.js/style.css` 加共享场景 `pagedata.json`；数据权限无角色；不改后端/数据结构；保留现有 AI 路径并排除参考新增 AI。此处只记录其对交互映射的约束，不作实现。

本分析不以管理员/普通用户/角色拆需求。前端设计器没有角色概念；访问由数据权限边界约束。源码里任何角色实现如被后续发现，只应标成待剔除项，不迁移，也不做角色到数据权限的映射。节点字段中的 `allowAIAdd` 是前端模型字段行为，不是角色授权语义。

## 用户任务与入口

| 业务任务 | 入口/前置条件 | 输入与校验 | 可见/持久结果与下一步 |
|---|---|---|---|
| 打开一个数据空间设计 | 数据空间列表行的“设计”动作设置 `currentRow` 并打开 dialog；组件仅在 `rowid` 有值时挂载。大弹窗阻止点击遮罩关闭，销毁关闭时销毁设计页。`ui/data-set-list-page.vue:128-138,480-483` | 输入是当前行 `rowid`，设计页固定场景 ID；缺 rowid、rowid 变化、页面执行上下文失效都会阻断加载。`design/ui/data-set-design-page.vue:247-252`; `design/ui/use-data-set-design-page.ts:51-69,906-942` | `readBaseline` 完整读取后才显示画布；任一异常呈错误视图并隐藏画布和保存入口。错误区可重试，或尝试进入布局重建预览；重建 API 仅在确认布局文件明确不存在时允许预览/覆盖，文件已存在（包括损坏或旧版本）会拒绝该流程。`use-data-set-design-page.ts:831-845,906-942`; `design/ui/data-set-design-page.vue:1-38` |
| 观察当前设计 | 设计器加载成功后显示数据空间名称/描述、主业务模型、模型与关系计数、按类型计数、画布和图例。`use-data-set-design-page.ts:251-308`; `data-set-design-page.vue:39-117` | 无新增输入 | 图例“主业务/业务层/基础层”是节点显示风格，不能解释成访问角色或权限。没有字段/行授权编辑入口；权限策略细节要看数据合同及服务端。 |
| 调用全局设计工具 | SchemaGraph 默认工具条被页面自定义按钮覆盖同一 action：新增节点显示为“新增模型”，删除走业务删除回调，保存写图；另有选择、居中、全图、对齐、缩放、输入参数、复制 API。`use-data-set-design-page.ts:135-198`; `SchemaGraph/index.vue:313-338,1561-1621`; `schema-graph-toolbar.ts:4-70` | “新增模型”创建待配置占位节点；选择现有元素后可删除；保存仅保存当前画布图 JSON。输入参数和复制 API 为独立动作 | 普通删除会直接删除选中画布元素并发图变化；页面自定义删除则删除持久模型/关系（见下表），两者同一按钮名称但业务语义不同。画布排布/拖动与缩放仅改内存图/布局状态，设计图需保存按钮或节点/关系保存后自动持久化。`SchemaGraph/index.vue:441-477,618-651`; `use-data-set-design-page.ts:1288-1477` |
| 打开节点配置 | 双击模型节点打开节点侧面板；占位节点若可打开，可用“选择模型”进行替换。`SchemaGraph/index.vue:1057-1068`; 节点 UI `node-panel/data-set-design-node-panel.vue:1-43` | 当前 `dataModelId`/node id 决定模型；无当前模型时保存/预览提示先选节点 | 面板分元模型、请求设置、前端模型、数据处理四个任务页。每页签的“保存”只提交该页或合并相关页，不是统一事务。 |
| 打开关系配置 | 拖拽连接两个模型产生边，双击边打开关系面板。页面未传 `onEdgeAdd`，图组件先保留新边并发图变化；用户在关系面板显式保存后才写关系资源。`SchemaGraph/index.vue:1013-1055,1070-1080`; `data-set-design-page.vue:100-117` | 父子模型来自边 source/target；两端必须在当前数据空间；同一有向节点对不可有多条关系 | 临时连线可删除/清理；关系保存后先回读关系和子模型联表配置，再保存图布局。 |

## 交互任务详解

### 从模型来源新增、替换，或为数据处理暂存目标模型

模型选择弹窗由“新增模型”占位节点、节点“选择模型”（替换），或数据处理页“选择”触发。共用 `useModelSourceDialog`；默认 tab 是数据库表，类型切换/搜索/分页都会重载列表，响应过期或弹窗关闭时丢弃；查询字段是名称、描述、以及对数据库表/数据库视图显示的数据库名称筛选。`data-set-design-page.vue:163-231`; `composables/dialog/modelSource.ts:34-54,99-163`; `use-data-set-design-page.ts:207-224,1022-1027`。

| 来源类型（代码值） | UI 标签/列差异 | 选择后业务行为 |
|---|---|---|
| `table` | 数据库表；显示“表名/描述/数据库名称或稳定 ID” | 建模型、读取来源初始字段、同步字段 |
| `dict` | 字典；不显示数据库列 | 同上；额外打开排序/分组字段列以便核对 |
| `interface` | 接口；不显示数据库列 | 同上；请求设置 UI 将其归入 inputParams 模式 |
| `json` | JSON；不显示数据库列 | 同上 |
| `logicView` | 视图；不显示数据库列；在节点请求 UI 同样归入 inputParams 模式 | 同上 |
| `databaseView` | 数据库视图；显示数据库名称或稳定 ID | 同上 |

新增到占位节点时，来源名与已有模型重名则生成唯一名；以占位 node id 提交强制新增，回读模型定位持久 rowid，再读初始字段并同步。最后替换图节点 id、补字段列表并保存布局。替换已有模型时保留其 `Name`，先保存来源映射，再生成初始字段并按旧字段同步；若面板目标节点已不在模型集合，则走占位节点强制新增分支。普通新增走模型创建、初始字段、字段同步、刷新字段。数据处理上下文则不立即写入模型/字段：构造临时模型和初始字段，在选择状态中回传 owner/操作类型，关窗提示“目标模型已暂存”，最后由数据处理保存。代码：`use-data-set-design-page.ts:1029-1188`; 回传消费在 `node-panel/use-data-set-design-node-panel.ts:2445-2465`。

来源弹窗“取消”只关闭；确认没有当前选中行会警告并不调用。请求错误统一提示新增或更新来源失败，但步骤可能已部分写入：新增模型后读/同步字段失败、替换模型成功后字段失败时，catch 不回滚已完成写入，也不刷新视图或宣称补偿成功。**需运行核实**部分成功时后端最终状态及重进页面表现。

### 编辑元模型与字段输出合同

“元模型”页可改节点名称、字段描述/别名/输出/值函数/排序/分组，新增计算字段，编辑字段合同，删除计算字段；来源模型字段名称只读，计算字段名可编辑。隐藏系统字段只改变列表显示，不删除字段；“显示排序分组”控制列显示。主键字段强制输出，计算字段不能设正式主键，同一模型最多一个主键；名称非空且不能与同空间模型重名。`node-panel/data-set-design-node-panel.vue:45-201,568-602`; `use-data-set-design-node-panel.ts:1453-1487,1565-1692`。

表格内双击仅对 description、AsName、OrderType、Order、Group 启动编辑；“删除”只允许删除 `FieldType=计算字段`。新建字段默认 `type=dataModel`、字段类型“计算字段”、输出开启、非主键。输入值函数可直接输入文本或从值函数对话框选择；节点祖先字段作为可引用上下文。批量“全部输出/输出反转”是字段级输出，不是行权限。

保存“元模型”或“请求设置”时二者合并：若字段合同的 rowid/type/name/type/alias/主键/输出有变，会二次确认，先独立读取字段基线比较，保存模型再同步字段；字段合同变更还做独立回读校验。若基线已变，先覆盖本地字段为最新值并中止。成功后重读字段、重新归一 UI 草稿、重读前端模型、保存图文件，然后提示节点配置已保存。保存的 rowid/name 外其他描述等字段不在字段合同比较项内。`use-data-set-design-node-panel.ts:501-644,2047-2188`。

### 请求设置与预览

对除 `接口`/`视图` 外模型，请求设置输入过滤条件（FilterBuilder，字段取本模型，值函数可用当前数据空间参数）和模型请求参数。接口/视图切换为输入参数字段列表，并由这些字段的值函数定义其请求输入；不会显示通用过滤器。旁栏显示当前模型祖先关系中各祖先字段。通用设置包括业务表/主业务表标记、输出类型（Join/SelfRefData/HierarchyData/Navigation/Table）、自引用父字段/包含子数据字段/输出类型/顶层 id、缓存类型、请求完成事件。`node-panel/data-set-design-node-panel.vue:302-443`; `use-data-set-design-node-panel.ts:266-307,332-434,875-937`。

输入参数在页面工具栏单独维护：新建 GUID、名称、描述、主业务参数标记；仅验证名称非空，未见页面层重名检查。保存为独立参数资源并同步本地 `dataSet.inputParams` JSON；“取消”仅关弹窗。失败提示保存失败且弹窗仍在。参数选项被值函数上下文消费。`data-set-design-page.vue:120-161`; `use-data-set-design-page.ts:944-948,974-1020`。

“预览”从当前本地表单初始化输出类型、自引用 node id、当前请求过滤器和输入字段草稿；查询字段来自元模型字段（优先输出字段及排序字段，否则全字段）。预览输入字段测试值初始为空，接口/视图才随请求发送；表格模式默认 pageNo=1/pageSize=10，也可选择完整集合；结果可切完整原始响应或提取 data。展示 Json 树与由前端模型标量字段构成的前 10 条表格。预览是独立查询，不会保存编辑。取消/关闭清空结果状态；请求失败清空上次结果并提示。`node-panel/data-set-design-node-panel.vue:39-41,445-566`; `use-data-set-design-node-panel.ts:1067-1189`。

**需运行核实**预览服务端对各 OutputType、数据权限和分页输入的真实行为；源码所见只是请求构造与展示流程。

### 前端模型、脱敏、数组与数据处理

“前端模型”页在进入时读取前端模型字段；由元模型页切换过来时，用当前草稿中输出字段即时投影本地列表。点击“生成输出”会重新读取并覆盖该页本地快照。每行可选脱敏规则并切换 AI 操作标记；保存只更新前端模型字段 Expression/allowAIAdd，再重读字段、重载前端模型并保存图。`node-panel/data-set-design-node-panel.vue:204-248`; `use-data-set-design-node-panel.ts:560-573,1329-1365,2354-2389`。

“添加数组/编辑数组”在节点元模型页打开本地弹窗，表头优先来自当前字段草稿；没有字段时从 `items` 第一条 JSON 行推断；仍为空时默认 rowid 主键。表头可增删改，名称必填且同数组唯一；主键标记保持唯一并强制输出；更改表头名会将已有行值按表头身份映射到新名称。数据行新增/编辑先进入草稿，显式保存或取消；已有数组数据从模型 `items` JSON 读入。确认要求名称和至少一个表头，之后先保存数组模型 `items`，再同步数组字段，回读字段、刷新面板草稿并保存布局。关闭弹窗不保存并在 closed 时清空草稿。该数组编辑任务与来源模型普通字段编辑共用节点，可能生成/替换数组模型记录。`node-panel.vue:604-730`; `use-data-set-design-node-panel.ts:770-873,1527-1552,1694-2045`。

“数据处理”对当前 owner 模型分别设置新增/编辑/删除 API 目标模型及目标字段值函数。目标选择会暂存模型/字段，名称避开 owner 已选目标名；三个操作页签切换或退出未保存数据时弹出保存并继续、放弃并继续、关闭取消；放弃会从持久数据重建本地状态。保存先确认所有非空目标仍可解析，再调用统一数据处理保存，随后重读模型和字段、重新归一四页签状态、保存图。**部分成功边界**：服务端数据处理调用若成功而后续回读/图写失败，catch 只显示保存失败，现代码没有回滚已写资源。`node-panel.vue:251-300`; `use-data-set-design-node-panel.ts:1200-1314,2191-2352`。

### 关系、删除、布局文件、复制 API

关系面板父/子模型只读；可配置依赖类型、关系条件过滤器，以及关联查询的 Join 类型、子表外键字段、联表条件。保存时表标识从两端模型的 `MetaName || Name` 写入 `parentTable`/`childTable`。但完整数据空间预览的 `topologicalSortModels` 用关系模型 rowid 找到模型后，严格要求 `parent.Name === relation.parentTable` 且 `child.Name === relation.childTable`。因此同一模型 `Name` 与 `MetaName` 不同会形成保存可成功、完整预览报“资源名称不匹配”的字段契约冲突；当前节点单表预览以 `Name` 查询，不等同于验证依赖图。此冲突需数据/API 与交互实现共同厘清。`edge-panel/use-data-set-design-edge-panel.ts:111-128,218-228`; `data/api/data-set/design/preview.ts:200-220`。若任一联表配置非空，则三者必须齐全；过滤器解析有结构问题时禁止保存。保存先将关系及子模型关联字段一同提交，校验成功回执和返回 ID，再并行独立重读模型/关系；必须唯一匹配且字段一致后更新本地状态、替换 edge id 并保存图。保存后图写失败会报告“关系已保存并回读确认，但设计图保存未确认”。删除已保存关系会清联表配置并删除关系，再独立回读确认；临时边删除仅本地清理。回读不一致将面板锁定，提示关窗重开核验，禁止盲目重复提交。`edge-panel.vue:1-88`; `use-data-set-design-edge-panel.ts:56-88,111-143,166-266`。

自定义删除操作有显著后果：删持久关系会先保存 `relations.deleted` 并清空子模型 JoinType/ForeignKeyFields/JoinFilter/PId，然后本地删边并保存图；删模型会先删除函数详情，再级联删模型及其字段/关系，并可能删除被 addApi/updateApi/deleteApi 引用的模型；之后本地过滤模型、字段、关系和节点，再保存图。源码未显示二次确认对话框。若写到中途失败，catch 只显示删除失败，前序后端写入可能已完成；没有事务/补偿证明。临时节点/边仅从图清理。`use-data-set-design-page.ts:1288-1428`。

布局文件有单独生命周期：正常画布加载时 parse graph JSON；图版本、节点 id/数量、edge id/数量/端点有不符则警告并在内存中转模型/关系自动排布，但不会因此开放覆盖现存布局文件的重建确认。只有 `readGraph` 失败且 `isExplicitMissingFile(error)` 判定为文件明确不存在时，`prepareMissingLayoutRebuild` 才生成预览；确认阶段会再次检查文件仍不存在、正式配置指纹未变化后写入并完整回读。文件存在但 JSON 损坏/结构不匹配/版本过旧时，不能用该确认流程覆盖；若其他原因导致 baseline 加载失败，错误视图虽显示“预览重建”按钮，prepare 仍会拒绝已存在文件或非明确缺失错误。预览展示空间、模型字段关系计数及包含所有模型的新图；不会恢复旧自定义坐标/边标签，也不动模型/字段/关系/权限。`use-data-set-design-page.ts:647-792,847-903`; `data-space-design.ts:644-715`（明确缺失识别 `:217-219`）；`data-set-design-page.vue:1-37`。

画布显式保存仅序列化 SchemaGraph 的 node/edge 数据加 `graphVersion` 并调用 graph 文件写入；不会替代节点/关系/字段资源保存。节点、关系保存会在其业务资源流程后自动写图。复制 API 取页面本地 models/fields 快照（页面已加载时）或独立 readApiInfo，再复制剪贴板；仅显示复制成功/失败。`use-data-set-design-page.ts:950-968,1452-1477`。

## 状态转换与输出总览

| 起始 | 用户动作 | 本地状态 | 持久调用/确认点 |
|---|---|---|---|
| 未加载 | 进入/重试 | loading → loaded 或 loadError | readBaseline；失败隐藏编辑器 |
| loaded | 新增占位模型 | graphData/layout 变更，待配置节点 | 不写业务模型；替换来源确认时才建模/字段并写图 |
| loaded | 普通新增/替换模型来源 | source dialog selection → 模型/字段列表刷新 | saveModel → buildInitialFields → syncModelFields → readFields（部分分支额外 readModels）→ 写图 |
| loaded | 改节点元模型/请求设置 | 两页签共享本地草稿 | 条件确认字段合同 → saveModel → syncModelFields → readFields/核验 → refresh front model → 写图 |
| loaded | 关系配置 | edge form 草稿 | saveRelations → readModels/readRelations 核验 → 写图 |
| loaded | 前端模型/数组/数据处理 | 对应各自本地草稿 | 字段或模型独立保存/同步和回读 → 写图（过程各异） |
| loaded | 仅拖拽/排布/编辑图文本 | designGraphData + layout snapshot | 单击工具条保存写独立图文件；无业务模型写入 |
| loadError | 预览重建/取消/确认 | read-only preview → 取消或新的 loaded baseline | prepare 只读；confirm 写图文件并完整回读 |

## 设计意图、缺陷/不可达路径

| 代码意图/现象 | 业务影响 |
|---|---|
| 图层是模型关系的编排入口，双击节点/连线进入丰富配置面板；节点/关系/字段/参数/图布局分资源保存 | 迁移需保留“每类资源各自保存与回读”的业务闭环，不能把工具条保存解释为全量保存 |
| 数据处理来源选择采用临时模型预览/编辑，最终随 owner 数据处理一起落库 | 新建目标与关联字段存在暂存态；关闭面板或切换 owner 前的退出提示是防止丢草稿的交互 |
| 设计图明确缺失时提供只读预览和人工确认重建 | 只有加载失败视图显示入口；prepare/confirm 两端均拒绝“已存在”的文件，损坏/旧版本图仅触发内存自动布局回退，不能从该按钮确认覆盖 |
| `openSource` prop 被声明且默认空，但完整设计页未见任何消费；`close` emit 同样未调用 | 面向当前列表入口，两者是未接线接口，不构成可达功能。`data-set-design-page.vue:247-250`; `use-data-set-design-page.ts:42-49` |
| 输入参数取消仅关窗，字段/数组编辑弹窗取消仅关闭或丢本地草稿，没有页面级脏状态提醒 | 提供取消结果，但离开整个设计器时仅外层 dialog 关闭，不提示未保存节点/参数/数组修改；需产品确认迁移是否保持这一语义 |
| 设计页删除按钮会删除持久模型级联影响资源，但图组件通用删除行为只是画布删除 | 一处同名按钮取决于 action 回调；迁移实现必须维持持久删除路径而非只删节点。源码未见二次确认，是数据损失保护方面的明显交互缺口 |
| 普通模型/字段/数据处理多处操作错误只提示“失败”而不呈现分阶段成功状态；只有字段合同和关系强调独立回读 | 网络中断或后段失败可能造成前端旧快照与服务端部分新资源并存；需运行核实，不可从 success/error toast 推断事务性 |

## 目标迁移约束与运行验收建议

- 页面入口依赖已选数据空间行 `rowid` 和数据权限。保持当前授权数据面，拒绝引入前端角色判断或管理员旁路；如旧源角色代码出现，标为待移除，不转化成数据权限规则。
- 将一个业务任务映射到一个清晰的页面交互/页面数据变更闭环：模型来源、节点元模型与请求参数、关系、前端模型、数据处理、空间输入参数、布局图。分别映射加载态、编辑草稿、保存态、回读结果、取消/失败提示。
- 迁移验收需覆盖表/字典/接口/JSON/逻辑视图/数据库视图六来源；新建、替换、数据处理暂存三种上下文；连接临时/保存/删除；字段合同基线冲突与回读差异；服务端写后图写失败；数组表头改名后数据保留；预览各输出类型/数据权限；图文件明确缺失时的重建确认；旧版本/结构不匹配时只核实内存回退，不把它列为可确认覆盖。
- AI 交互只按目标保留已存在的 AI 语义，`allowAIAdd` 仍属数据字段能力；参考新增 AI 不纳入迁移。具体语义应由负责数据/API 侧的报告和当前实际调用补足。

## 源码完整阅读范围

以下使用固定提交版本完整核对：

- `apps/appworks/src/ui/features/data-platform/data-set-management/design/ui/data-set-design-page.vue`（含模板、脚本、样式入口）
- `.../design/ui/data-set-design-page.scss`
- `.../design/ui/data-set-design-state.ts`
- `.../design/ui/use-data-set-design-page.ts`
- `.../design/ui/node-panel/data-set-design-node-panel.vue`
- `.../design/ui/node-panel/data-set-design-node-panel.scss`
- `.../design/ui/node-panel/use-data-set-design-node-panel.ts`
- `.../design/ui/edge-panel/data-set-design-edge-panel.vue`
- `.../design/ui/edge-panel/use-data-set-design-edge-panel.ts`
- 直接交互依赖：`apps/appworks/src/ui/composables/dialog/modelSource.ts`、`apps/appworks/src/ui/composables/graph/designState.ts`、`apps/appworks/src/ui/components/SchemaGraph/index.vue`、`.../SchemaGraph/schema-graph-toolbar.ts`、`.../SchemaGraph/schema-graph-placement.ts`（工具链涉及布局）
- 入口确认：`apps/appworks/src/ui/features/data-platform/data-set-management/ui/data-set-list-page.vue`（只读入口片段）

未覆盖直接实现/事实依赖：data-set design API 和后端请求/响应合同、SchemaGraph 的 `@spark-template/graph-ui/design` 内部实现、FilterBuilder/值函数组件合同、数据空间列表上游的菜单/数据权限加载机制、线上运行结果。它们由 data/API 分工或现场验收负责；本报告不据此声称已验证线上行为。SchemaGraph 节点/边锁定规则属于直接子依赖，当前仅核对其被调用点，没有展开包内实现。未启动测试或浏览器。

## 尚待厘清

1. 数据处理目标“暂存模型/字段”的实际服务端写入分段，以及失败后的可恢复行为，需要 API 实现/运行证据。
2. 数据空间权限在列表查询、设计 API 和每种来源列表上的实际粒度（行/字段/动作）需要权限/API 侧确认；前端未见角色 gating。
3. `逻辑视图` 与 `视图` 标签/类型的术语是否代表同一来源类型：选择器值是 `logicView`，节点 input-param 判断按模型类型字符串 `视图`，需合同报告厘清。
4. 普通节点保存中若模型保存已成功而字段同步/字段回读/图保存失败，用户重新打开时的实际恢复状态尚未运行核实。
5. 页面已有 `openSource`/`close` 未接线，及保存失败/弹窗关闭时没有统一未保存提示，是旧行为缺陷还是有意依赖外层策略，需需求裁定。


### 画布操作的实际边界

画布默认工具条中的选择、居中、全图、对齐、放大和缩小只影响视图/布局；新增动作由页面替换默认 `addNode` 行为后使用 232×120 的“待配置模型”模板并找空位。用户也可拖动节点/调整连线折点，节点移动同步相关边几何；变化由 `on-graph-change` 同步到设计图草稿。双击节点/边在有面板时打开相应面板；当前页面始终提供两面板，所以图组件不会走无面板的原位文字编辑分支。`SchemaGraph/index.vue:618-651,1057-1080`; `schema-graph-placement.ts:1-162`; `data-set-design-page.vue:100-117`。

画布默认“删除”被页面相同 action 覆盖为业务删除回调；这意味着 selectedElement 缺失时提示先选择节点/关系，单选已保存元素时走持久化级联路径，选多个元素虽在 SchemaGraph 内部支持批量视觉删除，但页面自定义删除回调只按 `selectedElement` 单个目标处理。若用户选中集合里多个对象，真实 UI 的 `selectedElement` 与被选集合的一致性需运行核实。多选不构成被源码确认的批量持久删除功能。`SchemaGraph/index.vue:313-338,441-477,1561-1594`; `use-data-set-design-page.ts:1288-1428`。

图组件对禁删、禁开面板、禁改标签提供 `isDeleteLocked`、`isPanelDisabled`、`isTextLocked` 保护；本次只读到组件调用点，未读 `@spark-template/graph-ui/design` 内部定义，不能列出何种具体节点被锁，也不把它猜成权限规则。`SchemaGraph/index.vue:108-111,451-457,730-765,1057-1079`。连线新增由图组件 `edge:add` 触发；页面未提供 `onEdgeAdd`，所以不会在连线时立即写关系，新增边先成为临时图状态。用户双击保存后才进入数据空间关系 API。`SchemaGraph/index.vue:1013-1055`; `data-set-design-page.vue:100-117`。

输入参数弹窗与来源选择弹窗均可由 X / 遮罩行为影响的细节取决于 Element Plus dialog 配置；输入参数对话框 append-to-body、destroy-on-close，但没有显式 `close-on-click-modal=false`。来源弹窗同样没有遮罩关闭限制。源码显式“取消”只关闭，不运行额外 dirty 检查。**需运行核实**实际外部关闭行为及弹窗关闭中进行中的请求是否可见部分结果。`data-set-design-page.vue:120-161,163-233`。

## 功能可达性小结

- 直接从列表入口可达的主流程：选择数据空间 → 完整加载 → 图上模型编排 → 双击配置节点/关系 → 保存各自资源与图；无需通过 `openSource` 参数才能新增来源模型。
- 六种模型来源均从同一 tab 选择器可达，视图类字段编辑采用输入参数分支；字典来源只额外开启排序/分组可见状态。数据库视图和普通数据库表的列表多显示一列数据库名/稳定 ID。
- 数据处理的目标来源与图上模型创建共用来源选择器，但选后暂存，作为 owner 字段的 addApi/updateApi/deleteApi 目标；退出未保存时才有三选提示。
- “关系条件”和“关联查询条件”虽共用 FilterBuilder 组件，但属于不同请求输入；Join 三字段联动在保存时按“全空或三项齐全”约束。
- API 信息复制可从列表行复制，也可从设计器工具栏复制。列表入口复制直接读 API 信息；设计器优先用当前内存快照，分别处理剪贴板反馈。
- 可见工作台的主业务统计取 `IsBusinessMain`，主模型显示首条匹配，允许 UI 通过勾选标记多个主模型；摘要仅展示首条名称和总数，没有前端唯一性校验。这一多主标记现象属于代码明确允许的状态。



### 隐式读取与字段写入核对

面板挂载/切换节点时，`currentModelId` 与 `state.fields` 的 immediate watch 只把已加载字段归一成前端本地草稿；另一个节点 ID watch 只读脱敏规则、调用 `readFrontModelFields` 初始化前端模型页。元模型切换到前端模型时用当前输出字段草稿本地投影；其他页签切换本身不写字段。若数据处理页存在未保存修改，离开时会提示；只有用户选择“保存并继续”才显式调用数据处理保存。用户显式点击“从来源更新字段”会读取来源并把差异放入 `boundSourceDraft`/本地字段草稿，也不会直接同步；持久字段同步只发生在明确保存路径（例如节点配置/数组/前端模型保存）。因此打开或切换节点面板本身不会隐式同步字段，但会发起只读加载请求。`node-panel/use-data-set-design-node-panel.ts:525-557,1329-1365,1411-1441,2397-2473`; `data/api/data-set/design/data-space-design.ts:554-613`。

