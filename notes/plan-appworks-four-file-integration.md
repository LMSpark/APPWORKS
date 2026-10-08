状态：implementing

# AppWorks 完整四文件集成实施计划

## 当前执行路径：先搭元数据 DataSet，暂停界面

用户最新明确先不做界面，先按仓内 DataSet 搭起“数据空间的数据空间”。当前由 [元数据 DataSet 实施计划](./plan-data-space-metadata-dataset.md) 接续，原生 Vue 页面计划标为 superseded，尚未实施。元数据空间身份与目标空间参数分开，先验证真实四表和原生多视图。AppWorks 完整集成目标、原页完整语义清单和数据权限等约束继续有效；本轮不以局部数据闭环冒充完整页面交付。已有局部改动保留并按证据核对，不整体回滚混合工作树。

## 当前立意：按本仓数据结构恢复完整数据空间

用户最新明确的领域归属是：**数据空间 → DataSet；模型 → DataTable；DataTable 包含字段（columns）和多个 DataView（views）**。该归属是整体设计的起点，优先于下文历史实施安排。参考仓只覆盖模型层是来源能力边界，不构成拆散本仓结构的理由。

**保存方向纠正**：以 `packages/spark-data` 的类和类型确认前端结构，但空间、模型、字段已经由后端数据库持久化，不能将完整 DataSet 序列化作为新的数据空间文件。读取方向为“正式元数据 + 视图/级联配置 → 既有装配器 → DataSet/DataTable/DataView → 页面”；设计变更按元数据、视图配置各自已有保存 owner 回写。当前 `loadScenarioDataSet` 已读取正式模型/关系并结合 `ScenarioViewConfig` 装配，保留此单向装配边界；不因原生 `toJson()` 可输出 columns/rows，就允许共享配置保存字段副本或运行数据。后续纠正对象是视图编辑合同与设计器组织，不将数据库真源改为文件真源。

1. 设计器沿空间、模型、模型下字段与命名视图组织；DataView 的配置按本仓真实合同恢复，配置定义与运行状态分开。仅增加空间级“数据视图”页签及少量配置，不满足此目标。
2. 两类关系分别建模：模型关系是 DataTable 之间的完整过滤表达式；数据级联是具体 DataView 中父字段集合的当前值驱动目标字段值及选项。级联支持多父字段，并明确值处理、权限、取消与异步过期行为；不由模型关系自动生成。
3. 原页 D01—D15 的完整业务语义映射到上述结构，再确定四文件配置、公共能力及必要业务编排。配置设计本身也按依赖级联，避免逐页手写通用联动。先完成一个完整数据空间页面，再推广。
4. 验收沿同一空间中模型的字段与多个命名视图配置、保存重开、页面引用与数据消费展开；模型关系和数据级联分别验证。前端仅消费数据权限。测试数量与局部配置保存不作为整页成功标准。

下文“数据空间视图配置首个实施闭环”的**界面组织和以基础视图配置收口的推进方式已 superseded**，由本节立意取代。已有代码保留为待核对资产，未上传的候选继续冻结；不默认丢弃已验证的共享保存、运行隔离等能力，也不据此宣布页面完成。本次只落实立意，实施文件范围须随后按这一结构核定。

### 结构纠正实施范围（持续授权，implementing）

用户继续纠正界面与入口后，当前生产实施仅收口下面前两项原生视图配置合同及对应服务测试，页面改动暂停重排。设计页应采用空间根节点、模型子节点及模型下定义/字段/命名视图的层次导航，右侧仅展示当前对象；模型关系与数据级联独立。唯一业务目标从 URL 场景参数代入，工具 ID 与目标空间 ID 分开。

已核实入口缺陷：目录 `openCatalogDesign` 把设计元数据场景作为 scenarioId、目录场景作为 additionalScenarioIds、目标另作 dataSpaceId；PageRuntimePool.scenarioCall 把前两者加载成公共运行 DataSet；buildPageContext 又以加载设计场景为能力开关。修复不能仅换 URL 字符串，否则会要求尚无视图配置的目标空间先成功运行，并失去设计元数据保存 owner。后续须连同内部元数据 owner、上下文绑定与目录入口整体纠正；模型关系、字段和模型的数据库真源及数据权限保留，不把目标空间伪装成包含 Base_DataModel 等元模型。准确宿主范围核定前禁止执行者扩改路由或简单隐藏旧参数。

本轮把领域归属落实到真实消费者：模型下包含定义、字段、命名视图；视图编辑宿主合同直接派生自 spark-data 的 ViewMetadata，去掉只支持六个属性的自造 basic 合同。数据库里的空间/模型/字段不进入共享文件。实现边界：

- `packages/spark-component/src/runtime/app-services.ts`：用 ViewMetadata 去除身份和 rows 后的配置类型定义 stage.configuration；clear 显式列出要移除的配置键，不把 null 当作原生配置值。
- `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts`：在指定 table/views/viewId 合并原生配置并显式清除指定属性；复用已有配置校验和共享保存 owner，保留其他模型/视图/属性。维持正式模型绑定、权限及原生字段引用检查，不放宽装配器的正式投影约束。
- `config/pages/data-platform/data-space-design/{rule.json,script.js,style.css}`：字段与视图归入模型区；以同一当前模型驱动两者，禁止两份可分叉的模型选择。模型切换保护未应用视图草稿，过期字段读取不得套用到新模型；原有模型/字段保存能力保留。页面 stage 调用切换为 configuration/clear，现有基础表单只表示当前已覆盖面，不能冒称完整原生配置编辑。
- `tests/runtime/auth-nav/data-space/view-design/lowcode-data-space-view-design.test.ts`、`tests/runtime/page/design/data-space-design-four-file.test.ts`：验证模型归属、跨模型切换、草稿保留、同模型多个视图隔离、原生多字段 valueField/过滤/排序/树/聚合配置往返，以及无 columns/运行 rows 写入文件。

开工前保留上述文件实际字节并运行根 typecheck；单执行者串行修改与最小验证。冻结后根与 spark-component 类型、精确 lint、上述两套定向测试及 pages-config 门禁各一次。改动仍只在本地验收，线上既有页面保持到候选验收后再切换。本轮是纠正结构的实施步骤；完整 DataView 配置编辑、公共多父字段级联和 D01—D15 整页交付仍须完成，不能用本轮替代全目标。

## 最新验收：模型关系完整过滤表达式底座

### 最新产品纠正：DataView 纳入数据空间

用户明确 DataView 要纳入数据空间。目标是空间统一管理正式模型及其多个命名视图，页面引用配置，运行实例保持每次调用独立；不能只完成参考模型层或在预览/验收脚本临时装配 DataView。此前把 D07 后续只写为“页面预览接线”不足以覆盖这一要求，该局部推进假设由本节替代。主计划仍 implementing，整页其他需求保留。

随后用户补充“配置设计要级联”：设计器按配置依赖限定空间、模型、DataView 及字段/参数/选项来源；上游变更后重查下游候选与引用有效性，多父依赖要读取完整父值集合。级联定义及值/选项更新规则属于配置，公共逻辑负责执行。对无效引用明确反馈，不默认清空或自动选首项；设计器自身的联动和设计出的运行级联各自验收，稳定模型关系不被联动改写。下一闭环不能只增加几个互不关联的下拉框或独立 DataView 列表。

当前代码核实：`src/lowcode/data-space/lowcode-data-space-runtime.ts` 已将 scenarioId 作为目标 dataSpaceId 读取正式模型/关系；`ScenarioViewConfig` 保存 modelBinding + 多个命名 views + 显式级联，`ScenarioViewFile`/`ProjectWorkspace` 有读、创建草稿、保存与回读冲突检查，持久文件沿 `SysForm/<空间ID>/pagedata.json`。因此有可复用配置和持久化底座。当前四文件数据空间设计页只有概览/模型/字段/关系/关系图，还没有维护被设计空间 DataView 的入口；设计页自身的 designModels 等视图不等于被设计目标的视图。

接续闭环须覆盖：选定空间→读取其视图配置及正式模型→模型下命名视图配置管理→保存并重开→由同一装配入口预览→页面按引用消费。模型关系继续独立于前端输入级联；空间只持久化配置，查询结果、选择和编辑状态由每次运行实例持有。沿现有配置 owner 补入口，不另建配置表或页面私有视图真源。生产扩展前仅核上述入口与缺失/冲突/引用路径，再在本计划列准确文件和验证标准，不重做已验的来源创建或无键底座。

#### 数据空间视图配置首个实施闭环（持续授权，implementing）

目标：在当前数据空间四文件设计页内创建/编辑同一模型的多个命名 DataView，经共享配置 owner 保存并重开，使用同一装配管线预览实际数据。设计器的空间→模型→视图→字段候选联动本轮必须成立；它不是已完成多父业务输入级联的证明，后者仍按 0.5 单独实现，不能用 viewCascades 顶替。

准确生产范围：
1. `packages/spark-project-model/src/scenario/scenario-view-file.ts`：共享文件状态订阅；正式配置仍只有该 owner。
2. `packages/spark-project-model/src/page/runtime-page.ts`：外部配置 owner 的只读脏状态/订阅绑定，纳入已有刷新与关闭保护；重载/销毁只解订阅，不销毁共享文件。
3. `packages/spark-project-model/src/project/project-workspace.ts`：仅在现有缺失文件草稿无法显式放弃时补准确文件的 discard 操作，禁止绕过在途保存或抹掉其他空间的草稿；已有 load/create/save 不另造同类链。
4. 新增 `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts`：空间视图设计服务，复用 `getAppProjectBlueprintWorkspace`（与 DevSystem 同一 owner）、既有正式模型读取与装配入口；作用域/文件身份/提交文本必须稳定。
5. `src/lowcode/data-space/lowcode-data-space-design.ts`、`packages/spark-component/src/runtime/app-services.ts`、`packages/spark-component/src/runtime/script-context-types.ts`、`packages/spark-component/src/page/context/buildPageContext.ts`：沿已有 dataSpaceDesign 能力提供受限视图配置操作与代次检查，不暴露整个工作区或原查询上下文，不新增顶层能力或 App 注入副本。
6. `config/pages/data-platform/data-space-design/rule.json`、`script.js`、`style.css`：新增数据视图配置区；复用当前控件和现有模型元数据候选，按选择读取正式字段候选，支持命名视图及基础显示/分页配置；已有过滤、排序、输入、树、聚合、级联等未编辑属性原样保留，不用裸 JSON 替代主流程。保存/取消/重读/预览要显式呈现文件状态与错误。

实施顺序：先共享 owner 订阅/生命周期的最小验证；再服务读取/定点变更/保存回读；最后四文件 UI、配置选择级联与真实在线消费。单 writer 串行推进每个局部修改及对应验证，不并行改以上源文件。模型候选复用已授权读取的 designModels；选中后 readModel，不能因未配置的坏模型阻断其他候选或默认把所有模型加入文件。已有稳定 tableName、modelBinding、default 要保持；新增表/视图身份由使用者明确输入，不以来源名猜映射。上游切换时保留已有配置，未应用编辑阻止静默切换；迟到字段结果不覆盖新选择。

本闭环结构化基础配置包括模型绑定、稳定表名、命名 viewId、pageSize、autoLoad/autoCurrentFirst/autoSelectFirst、valueField/labelField；字段候选来自当前正式模型输出。后续完整配置面仍须覆盖过滤、排序、输入、树、聚合、级联及引用维护，不以此第一闭环缩小整页范围。禁止默默丢弃文件已有属性；暂不执行无完整引用证据的视图删除/改名。

保存复用 workspace 写前比对及精确回读，不宣称 CAS。写后确认失败保留草稿和未确认状态，不自动重发；显式读取/核验或放弃本地并接受远端是独立操作。预览走当前目标配置的 loadScenarioDataSet→DataView，展示字段必须消费 h/m/visible，结束销毁预览实例，不回写运行数据，不拿临时预览当持久配置。

生命周期补充裁定：实际 `saveScenarioViews` 当前缺少跨重挂载的写结果未知状态，不能由页面服务私建一份。允许在上列 `ScenarioViewFile` 保留 pending/unknown 与实际 submitted 文本，并由 `ProjectWorkspace.saveScenarioViews` 的真实派发阶段推进；预读冲突不算已派发，写后回读/作用域失败不自动重发。补同 owner 的显式核验：远端等于 submitted 才确认该批提交且保留其后的本地编辑；远端仍等于写前基线才确认该批未生效；其他内容保持冲突。接受远端必须用户显式操作、复查本地修订与当前远端，并经 ScenarioViewConfig 校验；不得用 forceReload 偷偷覆盖 dirty。缺失文件的本地草稿如需整体放弃，必须让仍持旧文件对象的消费者明确失效，不能从缓存删除后让旧对象继续写入。验证加入首次创建/后续保存的未知回执、重挂载后核验、在途后续编辑不被清除；不得扩大到其他文件存储或泛化事务框架。

验证范围：`packages/spark-project-model/tests/scenario/scenario-view-file.test.ts`、`packages/spark-project-model/tests/page-runtime.test.ts`、`tests/runtime/auth-nav/data-space/lowcode-data-space-design.test.ts`、`tests/runtime/page/runtime/page-script-lifetime.test.ts`、`tests/runtime/page/design/data-space-design-four-file.test.ts`、`tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts`。新服务独立用例允许新增 `tests/runtime/auth-nav/data-space/view-design/lowcode-data-space-view-design.test.ts`，避免污染来源/关系测试。先基线 typecheck 和改前字节备份，修改后最小测试，冻结后根及受影响包类型、精确 lint、上述实际受影响套件与页面配置门禁各一次。验收覆盖同模型两视图、保留无关配置、字段/视图候选级联、未保存切换保护、迟到结果、scope/代次失效、缺失/损坏区分、保存冲突/未知、重开和可见/隐藏/脱敏只读预览。真实验证沿既有 admin 测试空间，先保留远端原字节或明确缺失事实，再经 UI 保存精确回读。未完成功能继续留主计划，不冒充全页零回归。

固定夹具的类型传播补充：本轮新增 `$page` 视图配置合同影响 `tests/runtime/page/catalog/data-space-four-file.test.ts` 和 `packages/spark-component/src/tests/runtime/createSandbox.test.ts`。允许同一执行者仅补未配置时显式失败的方法夹具，保存改前字节并运行对应两套；不为旧夹具放宽生产合同，不扩展目录页功能。

本轮审查收口依据：`notes/evidence/sparkproject-appworks-integration/four-file-correction/data-space-view-design/review.md`。在既定文件内补保存/接受远端竞态的修订检查、把页面代次检查传至异步读取后的本地变更前、用现有 PageLocalDraft 保护未应用表单，并核对预览的完整模型绑定。基础配置须区分“保持原值”和“清除显式配置回到默认”，允许当前基础 patch 以显式空值表达清除；保持其他配置属性。已派发写入仍由共享 owner 结算。当前基础选择联动不作为完整配置公共级联或多父运行输入级联已完成的证明。

### 已验收并冻结：无正式主键模型的 DataView 只读消费

本闭环已通过限定验收，结果及真实字节前像见 `notes/evidence/sparkproject-appworks-integration/four-file-correction/keyless-model-dataview/result.md`。3 生产、4 测试文件，assembler 未改；根及两包类型、精确 lint、4 套 220 项通过。主控最终代码线上复验 shif 正式读取→装配→两个 DataView 各 2/2，4 字段只读，复制/跨视图/旧行拒绝且刷新隔离；没有线上数据或配置写入。浏览器已有 7 模型仍可读。此验收使用非持久视图配置，只证明运行底座，不证明上节要求的数据空间视图配置管理。普通表格/行镜像 UI 还须实际验证，不因底座通过而宣称整页完成。

以下保留本闭环实施合同供复核：只有非数据库表、无 PrimaryKeyFields 声明且没有主键字段的模型可表达为空 primaryKey；损坏的已声明主键、数据库表缺少来源主键仍明确失败。查询响应偶然含 id 或主键提示不能提升正式无键模型为可写模型。

生产修改上限：`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`（无键模型投影）、`packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context.ts`（正式绑定、读取能力与无键写入拒绝）、`packages/spark-data/src/data-view.ts`（同次结果本地行与原行关联、无键只读呈现及结果替换清理）；`src/lowcode/data-space/lowcode-data-space-assembler.ts` 只在现有显式 primaryKey 赋值不足时调整。原查询上下文继续持有权限，不能复制凭据、发明主键、增加 owner 或专用页面查询通道。保留有键路径原行为，无键行不参加依赖主键的选中/编辑/删除/子行操作。

合同文档仅修正 `packages/spark-lowcode-api/README.md` 的 readModel 主键段，说明空 primaryKey 的只读含义与坏主键仍拒绝；该段原本宣称结果必为已核对字段名，需与本次合同变化同步，不扩写其他文档。

验证文件上限：`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.test.ts`、`packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts`、`tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts`、`tests/runtime/data-view/dataview-crud-bridge.test.ts`。执行者先读全文件和直接消费者，保存当前字节前像并记录基线 typecheck，添加最小失败用例后修复；如需新增生产文件或扩大数据契约，先回报主控核定，禁止自行扩散。

验收覆盖：无键字典装配/查询、同模型两命名视图隔离、隐藏/脱敏/可见、复制及其他查询行拒绝、重查替换旧行失效、失败重查保留只读、有键别名/重复键原有行为、无键新增及直接 save 零请求、存在普通 id 也不自动获得主键选择。先最小验证，收敛后根及受影响包 typecheck、精确 lint、上述定向套件各一次。线上使用已有 admin 与保留的 shif 模型，实际走 readModel → LowcodeDataSpaceAssembler → DataView.requestData，以只读方式记录行数/权限状态，不记录业务行或凭据；不改后台权限。通过此闭环仍不代表 D07 页面预览或整页交付。

### 最新断点：六类来源创建和重开已验，接续非表模型下游消费

2026-10-08 14:28 当前：D03 其余五类已完成真实页面选择/预览/保存/精确回读/布局追加与整页刷新。测试空间共 7 模型、119 字段/入参；字典 shif 4、JSON TestJSON0819 6、接口 Json转数组 6 输出定义+1 入参、逻辑视图 db_relation_show 25 输出定义+2 入参、数据库视图 View_TblList 47，连同前轮两个数据库表。7 节点重开成立，本次重开 CDP 没有网络失败。详见在线结果新增章节、additional-readback-result.json 与 additional-browser-proof.json。D03 创建语义冻结，不反复重做。

下一局部闭环优先解决 D07 的真实下游阻点：五种非数据库表来源均被当前 DataSpaceDesignApi.readModel 的唯一输出主键条件拒绝，字典虽无 IsPKey 仍已通过正式 runtime.query 返回 2 条数据。这证明通用模型读取与只读消费的边界需要核对；不能为绕过门禁改写来源字段主键或另建 owner。数据库视图不进入 formalDatabaseTable（仅数据库表/表/table）的来源键反查分支。model_source_create 正在只读核 readModel → assembler → bindModelView/DataView 的实际约束，未授权本轮改生产代码；主控依据影响面修订本计划后沿持续授权实施。JSON 新空间查询被服务端 Base_JsonData 数据权限拒绝，保留为独立配置/权限边界，不用 admin 放行；本轮未执行接口或逻辑视图业务调用。创建确认前另出现一次 Network Error，尚未派发保存，重新预览后保存成功，没有重放未知写入。

只读核验已结束，所有执行者冻结：`DataView.ingestQueryResult` 将查询公开行 structuredClone；`fieldAccess` 只经 rowKey 查 owner，而现有 QueryContext 的原行 WeakMap/readFieldAccess 已支持无主键原行读取。`bindFormalModel` 仍要求正式/响应主键匹配。潜在最小生产面为 design/data-space-design-api.ts、runtime/query/data-space-query-context.ts、spark-data/src/data-view.ts、src/lowcode/data-space/lowcode-data-space-assembler.ts，尚未改动；主控已复核前两处主键门禁及 DataView 克隆/权限调用。下一次研读只沿此链核消费者和实际验证范围，重点复用 owner 的原行读取状态、同次查询的本地行关联、无键模型只读及旧键模型回归，不能只加页面专用原行预览绕过模型→多 DataView 的长期要求。PrimaryKeyDelegate 的默认 id 不构成正式主键证据；选中/当前行、结果替换、复制/旧行、隐藏/脱敏和写入边界须一并验证。准确方案需核剩余当前完整文件再落入本主计划，不重新建孤立子计划。

当前结论：D03 数据库表来源在真实四文件页面完成选择/预览 → 正式模型与字段保存 → 布局首次创建及后续追加 → 新页面实例重新读取；用新空间正式查询入口消费 Base_DataSet 成功。测试空间 97DCB03F75AADEAE6B102B062DB71CEA 当前保留两个模型/28 字段：copyTable 11 字段（来源 testAdd 实库不存在，下游失败已保留）、Base_DataSet 17 字段（QYVirtualPlat，正式主键 rowid，查询返回 10/1185）。缺库列表两文件修复已验收冻结；12 项、类型、lint 通过。完整证据、原远端文件备份、精确正式回读和浏览器截图在 `notes/evidence/sparkproject-appworks-integration/four-file-correction/model-source-online-sync/result.md`。一次新页面初始读取失败，显式重试恢复，原因未定位，不称零回归。

此前剩余五类来源创建/重开已在本轮完成；仍需非表模型下游消费、同页 D04 替换/同步、D07 页面预览及其余已列缺口。不得重新研究/实现已冻结的数据库表来源、布局生命周期或完整关系表达式；不为孤立控件另起计划，不用局部通过代替整页交付。没有活动生产 writer；source_semantics 完成只读证据脚本后冻结。以下时间较早的“未上传/未线上写入”属于历史状态，不是当前限制。

2026-10-08 在线验收当前进展（优先于下文历史断点）：工具 script/rule/style 已沿正式上传合同更新并逐份字节回读，共享 pagedata 原本一致；原远端字节备份与结果在 `model-source-online-sync/`。真实浏览器已出现来源新增入口，表来源首条 Base_DataAccountDeveloper 的 dbid/DbName 为可读 null，Reader 在列表映射阶段强制非空导致整页失败。当前最小修复仅涉及 `src/lowcode/data-space/model-source/lowcode-data-space-model-source-reader.ts` 及 `tests/runtime/auth-nav/data-space/model-source/lowcode-data-space-model-source-reader.test.ts`：查询展示保留可读空值和原 total，将数据库身份非空校验移至 prepare 的当前来源重查/身份比对之后、字段查询之前，提示单条来源不可创建；不猜默认库、不过滤掉记录、不放宽字段读取权限。依据本仓正式模型读取 DbId 必填合同、参考 payload 原样规范化空值、后端未配置库身份拒绝 CRUD。先保留两文件当前字节，再最小复现测试与修复，执行该 Reader 套件、类型和精确 lint；主控随后以浏览器验证空库来源被单独拒绝、有效来源预览/保存/刷新重开。继续已有整页实施授权，不重新问答或重跑未变大套。

布局生命周期已通过限定本地验收，见 layout-lifetime-review.md。PageRuntime 统一持有布局原文/草稿/在途/未知，三个文件写入口已共用；同实例真实卸载重挂载、旧 host 结算、恢复后再次编辑保存和外层脏状态保护已验证。最终类型、精确 lint、六文件 202 项及主控 pages/ai/dirs 通过。旧 content-drafts 草案已 superseded；不重派已完成代码，不将此结论扩大为浏览器或整页零回归。

D11 关系新增已通过限定本地验收并冻结，见 relation-create-review.md / relation-create-result.md。真实配置控件点击、完整 Filter、原 DataSet 保存及正式回读、布局边、新 Runtime 重开和中断恢复已验证；最终三文件 175 项、根类型、精确 lint 及主控 pages/ai/dirs 均通过。实际相对预像修改 9 文件，未改 DataView、模型底座、图组件或后端。未部署或线上写入，完整样板页仍未验收；下一步继续 D03 六类来源等同页缺口。不要把下文历史断点当作当前状态，也不要重派已验的关系或布局实现。

D03 六类来源新增已通过限定本地验收，执行者 model_source_create（gpt-6-sol medium）冻结；结果、12 文件清单与检查日志见 model-source-create-result.md / model-source-create-manifest.json，已完成子计划按规程删除。根类型、精确 lint、4 文件 197 项及 sandbox 25 项通过，主控 pages/ai/dirs、hash 与范围检查通过；行为验收包括真实 DOM 选择/取消/保存及新 Runtime 重开、上下文中止后的恢复、部分回执和暂存保护。改前仅 8 文件 SHA，没有字节副本，另 2 旧测试没有改前 hash，不能声称完整批次纯增量审计。query-row-read 前置三文件及六类来源在线只读证据继续有效，不重复实现或研读。

2026-10-08 主控浏览器只读复核：使用已授权企业目录选项和 admin 成功登录，打开原 97DCB03F75AADEAE6B102B062DB71CEA 测试空间；概览加载成功，模型为空，布局文件不存在，在线配置没有“从来源新增模型”入口。在线与本地配置尚未同步，本批没有业务写入或页面上传。下一闭环先核远端现有文件并保留字节备份，更新准确工具/场景测试配置，再核真实浏览器来源选择、保存/回读/重开与缺布局处理；沿现有上传合同，不另造发布通道或改导航身份。随后继续同一完整页 D04 替换/同步、D07 预览、D08/D09/D10、D14/D15 及级联缺口，不把 D03 当整页完成。

新增入口接续有了现有合同依据，见 create-input-contract-review.md：目录页已采用独立命令输入 → 当前 addActionState 复核 → 原 DataView.addRow/saveChanges，不伪造不存在行的 fieldAccess。模型/关系创建后续按同一可复用模式逐用例核语义和字段合同；不能把下文历史“新增权限问题待答复”当永久禁用理由，也不能反推 allowAdd 授予所有字段编辑权。当前不并行改创建入口。

当前断点：多分支祖先表达式目录、可读模型同名拒绝，以及祖先 GetTableField 的无损装配/结构引用维护已通过主控限定本地验收。最终 design 57 项、适配器 15 项、数据包定向 106 项、根/包类型、精确 lint、pages/ai-codegen 通过，见 `expression-review.md`；同一执行者已冻结。此前已存关系编辑/删除、Join 和布局维护结论仍有效，不重派已通过的宿主或关系底座任务。下一步按 D02/D13 核实并恢复图交互与布局显式保存，再继续同页预览等缺口；不把只读图当完成。完整页面仍未签收，新增权限产品问题仍待答复；不推断答案、不删新增范围。

当前图交互七文件已完成限定本地验证，依据 graph-interaction-review.md：单击选择、双击配置、节点拖动及相连自定义折线路径、显式保存/取消和草稿保护已接现有 writer。最终两套测试 64/64、根类型、精确 lint、pages/ai-codegen 通过。主控退回修复了 pending 草稿遗漏、拒绝拖动后的投影、跨页签提示、无 pointsList 的端点及未知扩展坐标误写，失败证据保留。真实浏览器与保存后完整重开验收仍待补；当前在线样板是旧页面且目标无布局文件，见 graph-browser-readiness.md。新增连接、缺失文件创建、自动排列及边手调仍未完成，不据此宣布整图完成，也不重新派发已过的七文件实现。

接续 D13 缺失布局首次创建：原语义已研读，按 layout-create-brief.md 的主控裁定实施只读预览、当前正式投影指纹、确认前重查、显式 createDataSpaceLayout、禁止覆盖模式上传与完整重载。精确范围为本页三文件、现有组件运行服务/上下文、layout 宿主、三行为测试及两现有夹具、脚本 API 文档；不改场景/图组件/后端。后端 exists 后普通 write 不是原子创建，可能另存副文件；保留该风险，不宣称 CAS，不自动清理副文件。所有模型和完整正式关系参与构图，表达式仍留正式元数据；多父字段输入级联保持独立。

主控新增必修验收项：源码确认 PageRuntime.isDirty 只覆盖 DataView，布局草稿/在途/未知状态仍在 Renderer 脚本内，外层关页、配置刷新与项目切换可能放行。证据见 layout-lifetime-review.md。当前创建闭环先冻结，随后按真实消费者修订旧 content-drafts 草案并由同一低阶执行者收口；不将旧 context 拒绝迟到回调当成跨重挂载保存安全，不将本地创建测试通过当成整页可交付。

D13 首次创建现已通过限定本地验收，见 layout-create-review.md：五套合并 202 项，随后补真实新 PageRuntime/Renderer 重开与写后读取失败 2 项定向通过；最后根类型、精确 lint 与主控 pages/ai-codegen 通过。未改后端、未部署或线上写入，非原子竞争与生命周期缺口保持未完成。下一步只收口布局内容的 runtime 生命周期，不重派首次创建或重跑不变的表达式/图几何大套。

主控下游复核发现并已按 `expression-reference-brief.md` 修复 GetTableField 只接受直接父及第三模型引用维护缺口。定义保留与本地执行分开：没有祖先行上下文时仍明确拒绝求值，不猜当前行。正式 Name 已唯一匹配时按正式身份翻译；只有未绑定的外部名撞本地稳定名才拒绝。带点模型名按最后点号识别，避免前缀误改。完整表达式仍不自动产生输入级联；未扩建本地求值上下文。

继续同一整页恢复：关系表提供新增、按 rowid 编辑、删除和取消；复用结构化 Filter 控件和 DataView 编辑状态。关系记录与必要的子模型 Join 改动由同一 DataSet 按明确视图/行提交，逐模型回执后回读；无改动不报保存成功，失败/结果未知禁止直接重复提交。依赖选项来自已核实的正式字典，禁止猜枚举。完整过滤式关系不自动生成前端级联。

页面 writer 范围保持 `config/pages/data-platform/data-space-design/{rule.json,script.js,style.css,pagedata.json}`、`tests/runtime/page/design/data-space-design-four-file.test.ts`；如复用布局显示需调整图控件，先向主控给出真实缺口。主控另核字典与布局窄宿主能力，补准确文件后再派独立 writer，不与页面文件并写。关系变更不能留下重开后无法解析的旧布局；元数据和图文件分别确认，部分成功明确显示。完整画布操作、来源创建、预览等仍在整页范围中，不能以本闭环代替完整页面。

宿主合同现已核实并补范围：`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts` / `.test.ts` 增加正式关系依赖字典只读方法；`packages/spark-component/src/runtime/{app-services.ts,script-context-types.ts}`、`packages/spark-component/src/page/context/buildPageContext.ts`、`packages/spark-component/src/page/renderer/SparkPageRenderer.vue` 桥接受限设计选项 reader 及独立布局 writer；新增 `src/lowcode/data-space/lowcode-data-space-design.ts`、修改现有 `lowcode-data-space-layout.ts` 和 `src/App.vue` 接宿主；测试为 `tests/runtime/auth-nav/data-space/lowcode-data-space-layout.test.ts`、新增同目录 `lowcode-data-space-design.test.ts`、`tests/runtime/page/runtime/page-script-lifetime.test.ts`。必要的包根显式 type 导出仅限上述实际消费者所需，先报主控再补范围。复用 collectDataSpaceQueryPages 与 LowcodeDesignFileUpload，禁止另造保存协议、猜场景或广泛 API 清理。准确语义及验证在 `relation-host-brief.md`。

委派依据为同目录证据中的 `relation-page-brief.md` 与原页 D11/D14 语义。开工根类型检查已通过，日志 `relation-page-typecheck-baseline.log`。首个实质改动后立即运行对应页面最小用例；冻结后集中页面回归、类型、精确 lint 与配置门禁。保留混合工作树，不提交/重置，不写在线数据。

宿主类型检查发现现有 `packages/spark-component/src/tests/runtime/createSandbox.test.ts` 的 PageContext 夹具缺少新增方法，将该文件精确补入影响范围：只补未配置时显式失败的服务方法并运行该套件，不为兼容旧夹具放宽生产页面服务合同。

根级类型检查定位同类 `tests/runtime/page/catalog/data-space-four-file.test.ts` 的 createPageService 夹具缺两方法，按相同原则补范围及目录套件验证。页面 writer 自行修其已授权 design 测试中的相同夹具和新用例类型，不改变产品合同。

过滤校验实际阻点：现 DataSpaceFilterEditor 内部已有正式 codec，但页面不能取得未改历史值的校验结果。补 `src/views/app/control/data-platform/data-space/design/expression/DataSpaceFilterEditor.vue` / `.props.ts` 和 `tests/runtime/page/design/data-space-filter-editor.test.ts`，增加与 contextKey、当前原始 value 绑定的 validation 事件；页面只在匹配当前上下文及值且 valid 时保存，不在 script 重写 parser。该窄组件由独立 writer 修改，页面 writer 接事件，两者不并写同文件。此事件报告 codec 解析结果，不宣称服务器函数可执行。

2026-10-08 已按用户纠正完成本轮底座闭环：运行/序列化关系只保留必填 `filterExpression`，历史字段映射只在输入归一；正式适配保留 AND/OR、非等值、常量、非输出字段和未知函数定义。关系 CRUD、限定名引用维护、删除保护与现有计算列聚合已接通，模型关系仍不产生前端级联。

主控最终根类型、数据包类型、18 个 TS 路径 ESLint、ai-codegen/dirs 通过；数据包 30 文件 647 项、最终宿主 2 文件 48 项通过。首轮类型/代码门禁失败与修复记录均保留。精确证据见 `notes/evidence/sparkproject-appworks-integration/four-file-correction/model-relation-expression-review.md`。下文关系“待修”描述为实施前发现，以本节和审查记录的当前验收为准。

边界仍明确：服务端函数定义保留但不在前端模拟；计算失败沿既有计算列通道成为 undefined，开发环境记录日志，未新增生产 UI 错误展示。同子表多关系的隐式聚合被拒绝，显式关系/命名视图聚合选择仍待实现。未知引用不能安全改写时拒绝结构操作；正式名与稳定表名冲突的关系不装配并返回诊断，原设计表达式保留。

下一整页闭环是关系创建/编辑/删除及子模型 Join 配置，沿现有 DataSet 多视图保存 owner 和精确回读实现；源依赖字典后端服务已经核实，本仓 typed 读取入口尚需补齐。相关事实与最小页面验证已记入 `semantic-data-restoration-map.md` 末尾。多父字段输入级联、命名视图消费、整页与线上验收仍未完成，不把底座测试通过当作样板或全仓零回归。

## 最新层次纠正：参考数据空间不等于本仓 DataSet

2026-10-08 用户明确，sparkproject 数据空间目前只使用模型层，与本仓 DataSet 不完全一致。此前凡将二者整体等同的判断失效；本节替代这些判断，完整集成目标与四文件路线继续有效。详见语义报告 3.1 和 AGENTS.md 0.5。

迁移分层为：参考空间的正式模型/字段/来源/参数/关系合同 → 本仓正式模型装配与 DataTable 绑定 → 本仓场景视图配置 → DataSet/DataView 运行实例。前两项不是对象直接复制；视图与运行能力复用本仓，不能按参考实现重新造一套，也不能倒推原仓已有这些能力。

此前曾暂停扩展，以复核设计器自己的运行 DataSet 与被设计目标的身份、写入边界。该复核已通过，现已恢复并完成下述模型表单及 Filter 编辑的本地验收；没有回滚整个项目或放弃既有结果。该结论仅覆盖已核实的模型元数据路径，不批准新的运行模型。

复核出口：每项标明“正在编辑的设计元数据、设计页自己的 DataView、目标空间消费合同”；核定保存请求所属设计场景、元数据模型及目标记录；Filter/ValueFun/模型入参不能误接成设计器查询过滤或本次调用参数；模型关系不能默认等同视图级联。通过后再由同一低阶执行者按准确边界恢复编码，主控仍负责验收。

复核结论与续工：主控已核 `pagedata.json` 的设计场景/modelBinding、`designSaveEditingRow` 的指定表/视图/行保存，以及 `captureDataSpaceViewQuery` 的运行参数合同；当前编辑器确实在维护设计元数据，结果记于 `semantic-page-restoration-result.md` 的主控层次复核。恢复同一整页的 D05/D06 表单工作：在原八文件范围内补齐输出模式、树请求、缓存、字段排序/分组及其校验、取消、保存回读；复用现有同一编辑链。现有执行者上下文已结束，改用一名新的低阶执行者读取持久 brief 续接，不重新研究整页。Filter/ValueFun 的公共结构化组件接线由主控并行核定，不允许执行者复制原 Vue 面板或另造通用编辑器。线上写入仍未批准。

本页实际阻点补范围：原模型 Filter 使用 SPARK wire JSON（参考 FilterBuilder 默认 storage=wire），现成 FilterExpressionEditor 使用 DataViewFilterTree。由另一执行者在不重叠文件内复用两者：`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts` / `.test.ts` 增加调用既有协议转换的静态解析/序列化入口；`packages/spark-component/src/components/index.ts` 和 `src/index.ts` 显式导出现有 FilterExpressionEditor；新增 `src/views/app/control/data-platform/data-space/design/expression/DataSpaceFilterEditor.vue` / `.props.ts` 只处理序列化值与组件输入输出；新增 `tests/runtime/page/design/data-space-filter-editor.test.ts`。不改通用协议或查询逻辑，不新增包出口路径或别名。公共符号有该窄控件的实际消费者，现有根包出口和 tsconfig 别名继续适用，测试通过根包导入验证。页面接线待当前四文件 writer 交接后由其继续，禁止第二 writer 同时改四文件。验证先 API 定向测试、再真实控件交互、最后页面接线/保存测试和类型检查。

本轮验收修复范围：新增页面交互测试必须通过严格类型检查；包级检查另发现先前 `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts` 使用 DataView 私有 `getRowById` 与对象索引点语法。只修该测试为公开 `rows` 的按正式主键查找及索引访问，不开放私有方法、不改运行逻辑；运行该包定向测试、包级 typecheck 和精确 lint。该项是已有回归验收的修复，不扩建数据运行层。原页面 Filter 模式也须核对直接读取的 Base_DataModel.Type 原值与来源目录归一值的区别，禁止两者混用。

当前验收状态：D05/D06 的模型表单、Filter、ValueFun 与来源入参编辑已完成本地组件到保存回读闭环，使用既有值函数组件与唯一 DataView owner，不把定义塞成本次 queryContext/inputParams。主控根 typecheck、21 路径精确 ESLint、pages-config/ai-codegen/dirs 均通过；本轮页面/事件/关系等 6 套 132 项、值函数/过滤控件 3 套 28 项通过。API 新增测试两处索引语法修正后，由执行者复验包级 typecheck、设计 API 60 项和 lint 通过；失败日志保留。此前 48/59/95 是上一轮范围，不能当当前数字。整页、线上与全仓零回归尚未完成；下一步按下文修正后的模型关系过滤表达式和多父字段输入级联合同推进，准确结果见 semantic-page-restoration-result.md 顶部。

### 最新输入级联纠正：父字段集合驱动目标字段值和选项

用户进一步明确：父字段值改变应驱动级联字段的值及可选项，一个子字段可依赖多个父字段。此前将现有 viewCascades 命名视图查询依赖视为完整输入级联的理解失效，停止按该假设扩展。下面四文件“移除模型自动生成视图级联”仍是有效边界修复，但其测试不证明字段级联已实现；不能为迎合旧测试修补通用级联后冒充达成新语义。

当前核实：DataView 已有 editingFieldChanged 事件和同一行编辑缓冲；字段选项通过 optionDataViewKey 读取；旧 CascadeDelegate 仅订阅视图行/选择事件，缺父字段→子字段值+选项的执行合同，并在 query executor 场景有误判内存路径。接续先形成字段级联的语义与精确影响面：父字段集合及同一行上下文、目标数据字段、选项数据来源和参数映射、子值更新规则、未完整父输入/权限/取消/异步过期/多行多视图隔离，复用现有事件/编辑/查询 owner。不得推定清空/保留/首项等业务默认值，不先建第二状态或保存机制。当前 ValueFun 元数据编辑可独立收尾，不承担这些尚未定稿的运行行为。

### 关系边界修复：稳定模型关系不自动生成视图查询依赖

本节中“仅生成可表达字段映射”的方案已被用户最新纠正替代：模型关系须用完整过滤表达式定义，不能退化为数据库字段关系。保留“模型关系不自动生成视图查询依赖”这一有效边界；适配器对非等值、OR、非字段值关系仅诊断后丢弃的行为不得验收为完整迁移。下一步先核正式 Filter 的读取、表达式承载、序列化、引用维护及实际消费者；保持一个模型对应多个 DataView，不用默认视图或输入级联替代模型关系的消费语义。字段映射可作为特例派生信息，不能成为第二真源。此修订当前为语义/影响面核查，未批准盲改通用求值器。

用户明确本仓关系分两层。实施前曾有不符：LowcodeModelRelationAdapter 自动产生 default 视图级联，LowcodeDataSpaceAssembler 在未显式配置 viewCascades 时使用这些级联。该自动派生已移除；此前允许“可转换则自动生成”的假设失效，不改变整页目标。

此前四文件边界修复范围：`src/lowcode/data-space/lowcode-model-relation-adapter.ts` 移除 viewCascades 产出及 dependencyType 对结构映射的约束；`src/lowcode/data-space/lowcode-data-space-assembler.ts` 只采用场景明确声明的 viewCascades，未声明为无视图查询依赖；`tests/runtime/auth-nav/data-space/lowcode-model-relation-adapter.test.ts` 与 `tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts` 验证分层。保留正式模型关系身份、cascadeDelete，不改后端元数据。其字段映射承载的限制须按上述新合同重审。

现有边界测试覆盖没有视图配置时不自动读取父视图或加过滤、depType 不决定结构关系保留、显式查询依赖与模型关系独立，以及同模型多个 DataView 的显式刷新隔离。执行者两套测试 39 项通过，但其中命名视图用例是父行变化后显式 refresh，不证明自动查询或字段级联。自动查询原用例观察到预期 3 次 HTTP 实际 2 次，原因是 CascadeDelegate 用 crudService 判断远程，在 query executor 路径误走内存分支；此真实缺口继续记录，不能通过改测试宣称已修。全部合法关系表达式无损保留与消费还须单独验证。

#### 关系表达式实施闭环（持续授权下的修订范围）

复杂度：复杂。用户已明确完整过滤表达式及长期利益决策，原字段映射方案在本节被替代；无需再问已确认的产品方向。实施 brief 为 `notes/evidence/sparkproject-appworks-integration/four-file-correction/model-relation-expression-brief.md`，独立低阶 writer 单写，先研读并回报准确落点再实施。当前根类型基线为 semantic-value-function-root-typecheck.log。

设计决策：运行/序列化关系以 `filterExpression: DataViewFilterTree` 为条件唯一真源；旧 parentField/childField/fieldMappings 只在实际既有输入边界归一为等价过滤树，不作为运行关系的并行条件。该窄转换用于保留已存在配置和历史快照，不为未知旧格式扩建迁移框架。明确拒绝互相冲突的两套输入。关系 ID 用于同端点多关系定位；默认聚合消费不能继续取第一条关系。纯模型关系不配置页面当前行、选项源或视图输入联动。过滤树按正式 codec 保留完整结构及未知服务端函数，局部执行只使用已有支持能力，缺少必要上下文或不支持函数须明确失败。

本轮范围涵盖正式适配、关系类型/入口校验及无损往返、关系 CRUD/引用维护和当前聚合消费者。精确文件及验收矩阵见 brief；不修改 viewCascades、输入级联、后端、页面脚本或线上配置。模型关系的创建/编辑页面及多父字段级联继续列为整页未完成项，不能以此底座闭环替代完整交付。先跑每个行为变化对应最小测试；冻结后集中 spark-data 包类型/测试、宿主适配测试、根类型和精确 lint，不循环重复全仓。

### 当前续工：D05/D06 字段值函数与来源入参映射

已核固定版节点面板与模型字段保存链：ValueFun 是单个函数对象的序列化定义，持久到 Base_DataModel_Field；type=inputParams 是接口/视图来源字段分类。普通字段、来源入参和本次预览值不能混同。原页面允许任意文本但其非法文本的运行意义没有合同证据；目标沿当前运行合同提供结构化编辑，损坏/未知原文不因打开或保存别的字段而清空，主动修改必须符合值函数结构。当前不实现客户端求值，也不借此改调用参数。

本次除原四文件和页面测试外，精确补以下复用范围：

- `packages/spark-component/src/components/index.ts`、`packages/spark-component/src/index.ts`：显式导出现有 FilterValueFunctionDialog；不改其表单算法或建立新包路径。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-value-function.ts`：提取现有字段 ValueFun 结构解析；`runtime/query/data-space-query-options.ts` 复用该解析，保留既有查询合同与错误语义；`design/data-space-design-api.ts` 增加供设计编辑器实际使用的解析入口，`design/data-space-design-api.test.ts` 验证空值、函数结构、扩展属性与损坏输入。解析不能套用整棵 Filter wire codec。
- `src/views/app/control/data-platform/data-space/design/expression/data-space-value-function-context.ts`：抽出现有 DataSpaceFilterEditor 的 SystemData 合并、部门函数目录限制，供两个真实控件共用；原 Filter 控件切换到这个函数，行为保持。
- 同目录新增 `DataSpaceValueFunctionEditor.vue` / `.props.ts`：复用已有公共对话框，输入 serialized ValueFun、functionContext、contextKey、disabled；输出单个 `{contextKey,value}` 事件。无 I/O，切换上下文/值/权限后拒绝旧回调。只有确认或显式清空触发变更；损坏/未知原文显示提示并保留，允许用户明确清空或选择有效新函数修正。
- `tests/runtime/page/design/data-space-value-function-editor.test.ts`：真实公共对话框交互，覆盖取消零事件、系统参数/表字段/常量、扩展属性、坏值/未知值不默改、显式清空、无角色目录和上下文过期。
- 主控核出真实常量编辑缺口：现有 textarea 会把新输入全部写成字符串。精确增加 `packages/spark-data/src/query/filter/data-view-filter-contract.ts` 的函数字段 control='json' 与 `packages/spark-component/src/components/containers/filter/value/FilterValueFunctionDialog/FilterValueFunctionDialog.vue` 对该控件的严格 JSON 值编辑，常量定义使用它；不改变已有 text/textarea/select 等行为，不猜测数字或复制一套弹框。非法输入需保留可见文本、提示并阻止确认，不能静默提交上次合法值；null/false/0/空字符串/数组/对象必须保持类型。验证使用新增 ValueFun 真实交互套件及已有 `packages/spark-component/src/tests/filter/filter-expression-editor.test.ts` 回归。

页面仍使用 designFields 当前行和已有 save/cancel 链；正式加载及保存回读增加 type/ValueFun，保存白名单和权限逐字段核验。值函数选项由当前模型及真实关系祖先中可读取的模型注册名、字段名/别名构成，不能泄露隐藏字段；空间参数按原普通字段和来源入参模式的各自合同供给。请求入参编辑不得冒充完整预览或接口实际执行。

低阶执行者分别负责公共控件/API与四文件，文件不重叠；根类型基线复用紧邻开工的通过记录，首个改动立即跑对应最小测试。冻结后统一根/包级 typecheck、精确 lint、页面与控件及 API 定向回归，当前不部署或写线上数据。不得另造计划、扩大到后端、改名、图布局或新运行模型。

本页真实点击另暴露公共事件映射阻点：`SparkComponentRenderer.vue` 将 update:modelValue 转为 onUpdateModelValue，导致已发事件无法到页面处理器。根据持续实施及长期利益授权，精确补 `packages/spark-component/src/components/SparkComponentRenderer.vue`、`tests/ui/component/spark-component-renderer.test.ts`：只修事件到 Vue listener 的名称映射，保留冒号与既有连字符行为；不改数据、权限、生命周期或页面事件合同。独立低阶 writer 先补真实组件发事件的失败用例，再做最小修复及测试/lint；四文件 writer 等待后重跑真实点击链，不得调用 vnode handler 掩盖断链。验证覆盖注册与 global-el 分支、update:modelValue、update:model-value、普通 click/row-click，及本页从选择到保存回读的链路。

## 当前优先事项：原页面业务语义分析

用户于 2026-10-08 要求先按软件开发全流程梳理原页面的功能、数据结构、输入与输出。[数据空间原页面语义分析](./research-data-space-page-semantics.md) 已形成目录、设计器、旁侧配置及下游消费的首轮合同，用户随后明确数据交换中心、配置驱动和公共逻辑标准化，已逐项修正。现在按这套语义恢复完整页面；原参数等旧微切片不单独续接。未证实的服务合同逐项核实，不能借源码存在宣称已完成或跳过功能。

前端只有数据权限：表级新增、行级操作、字段读取/写入/必填等来自当次正式查询；不建立角色模型、角色判断、角色映射或 admin 放行。admin 只表示已授权的测试账号。原源码中的角色机制不构成迁移要求。

**数据空间是前后端数据交换中心**：上接页面功能语义并形成前端数据结构，下接后端多种数据资源，旁接功能标签及授权等配置。整页样板的语义清单必须覆盖三个方向及各维护入口。D3 授权配置可以按实施依赖另页交付，但不能从当前数据空间语义分析中排除；G1 排除的仅是旧前端角色机制，不是功能标签、默认权限、对象策略和授权记录。配置保存、实际查询权限生效分别验收。根 AGENTS.md 0.3/0.5 固化此原则。

**两项核心设计目的**：配置驱动；让前端页面开发流程化、标准化，封装公共的通用逻辑。后续派工按“业务语义 → 数据空间合同 → 页面配置与绑定 → 必要业务编排 → 标准验收”推进，每项标清配置、公共能力和页面业务差异的归属。优先复用当前平台查询、状态、校验、数据权限消费、保存及生命周期能力；真实缺口在完整页面范围内补齐，不逐页复制，也不前置建设假想框架。样板验收同时检查功能等价、配置实际驱动运行、公共逻辑可供后续页面复用，不能仅按四个文件是否齐全验收。根 AGENTS.md 0.4 固化此原则。

每个后续原页面都必须先有同样的语义合同再派工。29 个领域清单不表示页面语义已完成；首份分析仅覆盖数据空间整页业务链，不冒充全仓分析。总范围和既有有效工作保留；原微切片顺序服从本节。

用户进一步明确的三步顺序：

1. **语义梳理**：业务目的、完整操作流程、数据结构、输入输出、异常路径和数据权限。交付可追溯到源码的语义合同，区分原实现事实、真实缺陷与待核合同。
2. **按语义恢复**：基于本仓底座将完整业务闭环恢复为四文件；主控先验业务结果、持久状态和下游消费。已有代码按其是否实现语义选择复用或替换，不以当前做了什么定义完成范围。
3. **对照补齐细节**：逐项对照原页面补齐入口、交互、默认值、校验、提示、异常分支和细节，完成真实页面与受影响回归验收。身份、数据权限、保存和异常核心逻辑必须从第二步就正确，不推迟到第三步。

当前首轮语义分析已形成，主控已复核并修正来源类型、字段初始化、关系命名冲突、布局重建及旁侧配置边界。恢复映射见 `semantic-ui-restoration-map.md` / `semantic-data-restoration-map.md`（位于 `notes/evidence/sparkproject-appworks-integration/four-file-correction/`）；映射中“需补齐”和“合同待证”不算已实现。用户已持续授权实施，最新修正纳入同一总计划，由一名低阶执行者连续负责设计页，主控处理合同差异并验收。

### 当前整页恢复派工

- 依据：主语义报告 C01-C08、D01-D15、S01-S05 与 AGENTS.md 0.2—0.7；完整集成范围不变。旧 `plan-data-space-four-file-pilot.md` 只保留历史已验事实，其按钮级排期不再控制当前任务。
- 首轮修改范围：`config/pages/data-platform/data-space-design/rule.json`、`script.js`、`style.css`、`pagedata.json`；`src/views/app/control/data-platform/data-space/design/graph/DataSpaceDesignGraph.vue` / `.props.ts`；`tests/runtime/page/design/data-space-design-four-file.test.ts`、`data-space-design-graph.test.ts`。修改前逐文件完整读取和反查，保存本轮字节基线；同一执行者负责，其他代理只做独立只读核实。
- 实施顺序：先核当前表单/字段控件与 DataView 编辑合同，在本页恢复已有模型的节点配置、请求配置和字段编辑的完整读改存取消闭环；随后连续接来源建模、前端模型/数组/数据处理、关系图编辑及预览等整页能力。每轮修改立即做对应验证，避免一次堆积未经验证的全部动作。此顺序不缩减 D01-D15，不把中间闭环宣称完整样板。
- 公共逻辑：绑定正式 DataView，复用查询、编辑、权限及 DataSet.saveChanges，不从参数专用脚本复制另一套通用保存/恢复实现；页面只保留真实业务校验与编排。业务编辑必须用结构化表单，不能靠连续 prompt 或 JSON 原文输入代替原页面。
- 当前需主控核实的合同：六类来源的可信目录/字段入口；Name 改名的真实引用影响；关系端点身份；布局 writer；预览调用和旁侧配置生效链。遇到依赖这些合同的实现，先回报准确调用点及最小差距，主控裁定并在本节补精确文件，不猜协议或新建第二 owner；执行者继续同页不依赖该合同的已知工作。
- 验证：开工 typecheck 基线；修改后按真实 PageRuntime/正式 assembler fixture 运行 `pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts tests/runtime/page/design/data-space-design-graph.test.ts` 中覆盖当前变更的用例。冻结后 typecheck、相关 ESLint，主控审查业务正常/取消/字段权限/目标切换/保存回执与重开；整页完成后才集中全量和构建。本轮未批准修改其他模块或线上数据。
- 决策记录：按已确认的产品语义继续实施，不另造逐控件计划或重复提问；代价是若正式合同证明映射错误，须在该业务路径内返工，不能删功能。保留混合工作树，不新建分支、不提交、不整体回滚。

## 执行方式重整（2026-10-08 06:27，优先于后文旧派工顺序）

用户指出当前推进方式迟迟无法交付完整页面，并提出重来。主控认定原拆分方式失效：把完整 Vue 到四文件迁移拆成大量底座/参数微切片，反复复验却未完成样板。已停止当前执行代理；重做迁移与派工方式，保留当前底座、混合工作树与既有有效成果，不执行全仓删除或回滚。

完整范围、四文件形态、当前组件、数据权限无角色、现有 AI 保留等原约束不变。新的交付单位是参考页的完整可用业务闭环：

1. 使用固定参考 Vue 页及其直接依赖，收束一张完整操作对照表；每项标明四文件落点和可观察验收结果。按整页组织实施，不再为每个按钮/字段各建一层计划。
2. 一名低阶执行者负责同一完整页面的转换，先复用本仓已有 DataSet/DataView/组件/真实 API。需要底座改动时必须证明它直接阻断该页，且在该页任务内限范围解决；停止前置建设通用草稿、操作恢复等没有当前必要性的体系。
3. 主控集中验收完整页面：真实打开、全部操作、保存后重开、数据权限与受影响回归。修改中的即时检查只跑对应最小验证；冻结页面后统一运行类型、lint、页面测试，阶段末统一全量/构建，不重复以微切片数量充当交付进度。
4. 同一问题两轮返修仍不收敛，主控直接核实际控制路径并裁决；不在代理之间反复传递猜测。完成整页并留下可复制四文件样板后，再推广其他页面。

当前停止点：参数 script 本地 SHA B8E5735648EF0152D5456FD98F6DC379477F48233D859405FCB1E17593F38659、design 集成测试 SHA 3A940FB554304379A05F24D977E843F445EEFCAED85419D9EB5128A94E02231C；该关闭竞态增量尚未签收，不部署。线上仍为已部署 ABC904D9... 脚本，真实参数原值已恢复 null（pilot-parameters-second-restore.json / second-restore-reopen.json / png）。数据空间完整设计器、正式菜单、其余来源领域仍未完成，不将路线重整当成任务完成。

> 更新：2026-10-08。本文是唯一总路线；[数据空间样板子计划](./plan-data-space-four-file-pilot.md)负责当前切片，不能代替整个集成计划。用户已确认当前底座、当前组件、四文件转换、先完成一个页面、数据权限和低阶模型实施。本文重编这些已确认要求，不把尚未研读的后续领域标为已具备编码条件。

## 任务目标

将固定参考 AppWorks 的有效业务能力转换为本仓四文件页面，先完整交付数据空间目录样板，再按依赖推广，最终完成正式入口替换、操作等价和可复核的零新增回归验收。

来源：`E:/r/sparkproject` 固定提交 `842dec4f11b333df904b9a4e26b6566b0802bab8`。目标：`D:/SPARK_AppWorks` 当前工作树，HEAD `0b6c85d9979205cf733da8b0ba663c63e89ec395`、分支 `feat/agent-workflow-node-contract`；HEAD 不包含当前未提交实现，派工必须另带相关文件基线。

实施方式：低阶模型逐个最小闭环实现，主控决定边界、派工、审查和真实页面验收。采用 subagent-driven-development；只传持久化计划、直接相关源码、验收命令和约束，不传完整聊天。

需求锚点：[四文件研读](./research-appworks-four-file-integration.md)、本计划中的用户约束；源码与实际回执优先于历史研读。历史 [控制面计划](./plan-appworks-control-plane-integration.md) 和 [初始集成计划](./plan-sparkproject-appworks-integration.md) 已 superseded，仅保留范围索引与历史证据，不恢复原生 Vue 业务页实施路线。

## 一、目标形态和全局约束

| 层次 | 实现方式 | 不得替代为 |
| --- | --- | --- |
| 页面结构 | `rule.json` 表达组件树、表格、表单、弹窗、绑定和事件 | 一个组件包住原来的整页 Vue |
| 页面行为 | `script.js` 调用当前 DataSet/DataView 与正式宿主能力，组织当前页交互 | 第二套查询、权限、保存 owner；裸 HTTP 客户端 |
| 页面样式 | `style.css` 随 PageRuntime 实例隔离 | 全局样式污染其他标签 |
| 场景视图 | `pagedata.json` 保存现有模型绑定、命名视图、筛选、排序、分页和级联 | 页面私有的正式模型副本 |
| 专用交互 | 当前可配置组件承载图画布、字段面板、文件/人员选择；业务操作仍由四文件编排 | 搬入整页 Vue 后宣称完成转换 |
| 持久化 | 既有后端 API；业务数据、工具三文件、共享场景分别保存、分别核实回执 | prepareMutation、HTTP 200、内存改变或成功提示冒充保存 |

运行链：正式导航/工具身份 → PageRuntimePool → PageTool + ScenarioViewFile → 正式模型装配 DataSet/DataView → SparkPageRenderer。三工具文件属于 pageId，第四文件属于 scenarioId，可被多页共享；“四文件”不是四份页面私有数据。

- 以当前 SPARK_AppWorks 底座为主，功能和操作等价，UI 使用当前组件与交互。保留蓝图 nodeId、工具/场景身份、有效 URL、参数、设计与发布引用。
- 数据权限以本次查询 owner 返回的表、行、字段权限为准。使用 DataView 的访问/动作状态；不创建角色模型、角色分支或 admin 放行分支。在线全部用 admin；拒绝、隐藏、脱敏通过同一正式管线的响应夹具补验，不要求另找角色账号。
- 当前 AI、蓝图、页面设计和 Agent Workflow 能力继续可用；参考新增 AI 工具和治理写入口不纳入迁移。数据工作流与 Agent Workflow 分开。
- 不改后端源码、数据库结构定义代码，不编迁移脚本。参考能力必须由既有后端合同承接；缺合同明确登记，不以静默降级、假按钮或假数据代替。
- 不自动 commit、push、建分支，不升级依赖、批量格式化或清理其他人的改动。混合工作树按精确文件及改动块保存基线，禁止整体 checkout/stash 覆盖并发工作。

### 兼容性

- 业务页面交付形态改为四文件，宿主壳和基础组件仍采用本仓实现方式；不要求删除全部 Vue 文件。
- 现有记录、模型主键、业务关联键、页面/场景/导航身份和发布指针保持原语义。旧设计、图、树及模板必须保存重开验证，不做未经核实的格式转换。
- 切换入口前先证明目标配置可用；旧入口退出后不留下第二套读写真源。部分文件保存失败按实际回执记录，不能声称全批事务回滚。
- 已知范围调整仅为用户明确的无角色边界和原已确认的 AI 范围；如源操作无法在当前合同下等价承接，记为缺口，不擅自引入破坏性兼容层。

## 二、当前进度：样板尚未整页验收

| 事项 | 当前事实 | 后续动作 |
| --- | --- | --- |
| 错误路线退出 | D1d 新增的原生 lifecycle 增量已定向撤回，保留 C2 导航身份工作 | 不再扩建原生业务页；不声称所有文件字节完全恢复 |
| 四文件加载与目录读取 | 工具文件已保存；__tool 可打开；查询、名称/ID 与应用筛选、分页、应用/创建人显示已验证 | 正式菜单仍需迁换 |
| 新增 | 已真实新增并整页重开回读 | 保留回执与数据身份证据 |
| 编辑 | Name/description 编辑、取消零写、单行 Changed、原 ID 重查与整页重开已通过 | 作为后续页面的已验行为 |
| 删除 | 实现、自动化和在线取消已通过；真实删除未执行 | 已发起特定试验记录的执行时确认，等待答复；不阻断独立研读 |
| 复制 API | 双场景四文件工具入口、实际剪贴板和刷新重进已验；正式菜单未切换 | 证据 pilot-copy-api-online.json / png |
| 查询绑定 | 正式第三场景84/84、当前r-dialog显示1条完整路径；关闭重开/刷新/复制回归通过 | 证据pilot-binding-online.json/png；正式菜单待切换 |
| 设计 | 读取页和只读关系图已签收：6模型/218字段/0关系、6节点布局；主控最终26项及真实fit/平移缩放/切回/重开、布局原文不变通过 | renderer卸载归属已验（主控64项及最终tab1项、在线返回重进）；接续实际内容草稿与参数/图编辑保存，当前不称完整设计器 |
| 正式入口 | config/navigation/vue-pages.json 仍指向 DataSpaceCatalogPage.vue | 完整样板通过后切换，再移除失去消费者的本次原生实现 |
| 工程验证 | 删除切片留存 typecheck、精确 lint、根 192 文件/2281 测试通过；样板 22 项通过 | 对应冻结代码的历史证据，不是全部集成通过 |

新增切片曾完成完整 build；该构建先于编辑/删除，不冒充最新构建。证据汇总：[验证记录](./validation-sparkproject-appworks-integration.md)，明细：[样板证据](./evidence/sparkproject-appworks-integration/four-file-correction/)。本次总计划重编只改文档，不重复运行工程测试。

## 三、全部范围台账：29 个来源领域逐项有去向

来源索引：[reference-inventory.json](./evidence/sparkproject-appworks-integration/reference-inventory.json)。历史静态统计为 297 个 TS/TSX/Vue 文件、116 个 Vue 文件、54 个 owner 文件、59 个类、524 个非 private 方法；不是已完成页面数或用户功能数。

下表“承接”表示实施落点，不代表四文件等价已经验证。29 项包含一项按最新指令排除的旧角色机制，不能宣称“29 项全部迁入”。其他领域若包含角色依赖操作，也必须按同一边界逐操作处理。

| ID | 领域 / 固定参考 owner | 四文件必须交付的操作与验收 | 阶段与现状 |
| --- | --- | --- | --- |
| A1 | 应用管理 / ApplicationManager | 目录、维护、数据库关联、文档任务；应用 A/B 数据和状态隔离 | M1；当前 AppList 可作参照，四文件未验 |
| A2 | 蓝图 / ApplicationFunMan | 树、增改移删、属性、工具/场景绑定、设计/发布引用、原型上传与版本、桌面配置、维度来源 | M1 核心；文件/维度依赖在 M4/M5 收口 |
| A3 | 导航宿主 / DataMenu、navigation-host | 真实 nodeId、有效地址、同路径不同节点、标签选择/恢复、缓存、加载失败和脏页退出 | M0 样板入口，M1 全导航；保留已验 C2 |
| A4 | 企业治理 / EnterpriseRegistManager | 登记、审核、初始化、配置、模块授权变化、密码操作分别核对既有服务回执 | M2；现有平台页仅作参照 |
| A5 | 授权申请 / EnterpriseAppAuthApplication | 提交、我的申请、审核与最终生效状态分别回读 | M2；需验证申请链 |
| D1 | 数据空间目录 / data-set/list | 查询、筛选、分页、关联显示、新增、编辑、删除、复制 API、查询绑定、设计入口 | M0；部分已验，整页未完成 |
| D2 | 模型设计 / data-set/design | 模型/字段/关系、来源同步、输入参数、预览、保存、级联删除、布局读取及确认重建、旧数据往返 | M0；样板设计入口的实质依赖 |
| D3 | 数据空间授权 / data-set/auth | 当前后端实际支持的节点/数据授权配置与回读；运行表/行/字段效果单独验 | M2；prepare 不等于执行，不套角色授权 |
| D4 | 数据库目录 / ServiceManager、DataBaseManage | 连接测试、登记、维护及应用归属 | M3；历史读成功不代表写通过 |
| D5 | 表/视图治理 / AddTable、TableAndView、Register、TableDesign、ViewDesign | 创建、复制、登记、字段/关系设计、同步、回读；既有接口操作专用测试资源 | M3；不改后端结构定义代码 |
| D6 | 字典 / DataDictionary | 类型、配置、源页实际数据维护；保留真实场景及应用归属 | M3；四文件待验 |
| D7 | 编码 / DataCode、DataCodeEdit | 父码、序列、时间片、分类、测试码、初始化、正式分配；区分读取与不可重放分配 | M3；副作用逐项核实 |
| D8 | 逻辑视图 / LogicView、LogicViewDesign | 目录与图设计分开保存，旧图往返、输出字段、预览和分页 | M4；专用执行与画布待验 |
| D9 | 维度来源 / DimensionDesign、DimensionSourceBinding/Commit | 来源身份、绑定、账本/事实、投影版本及真实次序提交；重开一致 | M4；公共 runtime 完整链待研读 |
| D10 | 数据工作流 / DataWorkFlow、DataWorkFlowDesign | 触发表、节点/边、模型/字段/关系级联、输入参数、整图与单节点测试、运行回执 | M4；不替代 Agent Workflow |
| O1 | 组织人员 / TenantOrganization、PersonSelector | 部门树、岗位/人员查询、选择身份、分页完整性、搜索祖先上下文；源仓真实操作 | M2；不虚构 HR CRUD |
| G1 | 参考角色机制 / RoleClassManagement、RoleAndUserManagement、RoleAuthManagement | 明确排除角色分类/角色 CRUD、角色人员绑定、按角色应用/功能授权；不把排除记为实现 | 用户“没有角色概念”优先；相关数据权限入口归 D3/G2 逐项核实 |
| G2 | 导航/用户应用授权 / NavigationPermissionConfig、UserAppAuth | 后端实际支持的节点与应用授权、同路径不同 nodeId 区分、菜单/动作/数据权限各自效果 | M2；不据名称推导本地角色合同 |
| G3 | 脱敏 / DesensitizationRuleConfig | 规则配置与回读、显示、导出/剪贴板/保存边界；掩码不作原值写回 | M2；对后续页面生效 |
| I1 | 文件 / FileManager | 目录、二进制上传、下载、预览、删除回列；应用级无场景命名空间 | M5；支撑 A2 原型和后续模板 |
| I2 | JSON / JsonDataManager | 目录记录与树内容分别保存，旧树格式无损重开 | M5；专用 JsonData 合同待四文件验证 |
| I3 | Excel / ExcelImportConfig、ConfigSet、SheetLayout、TransformRule | 模板、文件、Sheet 布局、转换、参数、执行和实际导入结果 | M5；写入及部分失败待验 |
| I4 | 外部接口 / APIManage | 服务商、账号、公参/headers、输入输出嵌套字段、Body/FormData 调用结果 | M5；不将秘密输出到证据 |
| I5 | 报表 / ReportManage、ReportComp | 目录、数据源/参数、版本分页/维护/激活、模板、设计、预览、输出与重开 | M5；不按最大版本号推断激活版本 |
| W1 | 业务流程设计 / FlowModel、FlowDesign | 节点边、岗位/表单、模板、旧图保存往返；使用当前真实无角色合同 | M6；源角色依赖不能改名假接 |
| W2 | 业务流程运行 / FlowRunPage、Detail、AppendUser、移动页 | 启动/提交、各退回、自动提交判定、已读、追加/撤销、详情和移动交互 | M6；逐动作回读真实状态 |
| S1 | 缓存 / CacheManager | 列表与指定测试对象上的实际缓存动作分别验 | M7；不以目录可读代替执行 |
| S2 | 系统支持 / FlowMonitor、DataRecover、BugManage | 监控、恢复/撤销恢复、问题状态分别验；使用专用试验数据 | M7；不用真实业务记录试探恢复 |
| P1 | 共享支撑 / 表单、图面板、表/字段/人员选择 | 当前组件可配置合同、权限、原查询、取消、未保存保护；随真实需求补缺 | M0–M7；按需复用，不先造平台 |

G1 排除依据已查固定提交：`ui/features/governance/role-management/ui/role-management-page.vue`、`role-user-page.vue`、`role-auth-page.vue`，以及 `data/api/SafetyProtectionManager/` 下同名三个 owner。这些确实管理角色实体，不能混同运行数据权限。上述路径以参考 `apps/appworks/src/` 为根。保留来源记录和已有数据，不迁入该业务模型。

参考占位页 `ui/views/appworks/{field,table}`、`schema/relation`、`system/{menu,role,user}` 及组件演示不按独立生产功能迁入；有效地址归所属功能对账，角色地址遵从上述排除。新发现的真实操作补到所属领域，不能用“占位”删减有效能力。

## 四、执行顺序、依赖和阶段出口

### M0：先把数据空间目录一个页面完整转换成功

交付 D1 全部适用操作及 D2 设计工作台依赖；此阶段未通过前，不派发其他业务页面转换。

- [x] 撤回错误原生生命周期增量，保留既有导航工作。
- [x] 四文件正式装配、读取、筛选、分页、关联名称、实例权限隔离。
- [x] 新增及编辑：业务回执、精确记录回查、整页重开。
- [ ] 删除真实闭环：收到已发出的特定试验记录确认后执行；验证单行 Deleted、ID 筛选保持、重开原 ID 为零。等待不影响独立研读。
- [x] 复制 API：固定设计场景的正式 DataView 全量查询，受治理剪贴板、权限与失效保护通过；真实双场景工具入口复制 6 模型 / 19 常量行、两次只读查询、刷新重进通过。正式菜单声明随 M0 入口切换单独验收。
- [x] 查询绑定：正式7AB DataView完整集合、字段权限、父路径/排序/空结果、循环缺父、身份不一致/截断和失效测试通过；三场景工具入口的当前r-dialog三列展示、关闭重开/刷新和复制回归通过，0业务写。
- [x] 设计读取：目录操作已连接四文件设计页，正式模型/字段/关系/输入参数及布局、只读关系图已签收；无布局不自动重建。
- [ ] 设计编辑：逐类完成模型、字段、关系、来源同步、输入参数及布局操作；先核实当前可配置画布/面板能力，缺项才补组件；一个操作族一个闭环。
- [ ] 设计提交：逐命令接既有后端，落实 preimage、次序、回执、精确回读及部分失败处置；覆盖级联删除和确认重建。prepare 仅作提交前校验。
- [ ] 设计重开：源已有设计加载、修改保存及重开，验证 ID、关联、布局、输入参数与预览；取消不写、失败可见、未知结果不重放。
- [ ] 正式入口切换：确认四文件已持久化且可打开后，更新真实蓝图/工具绑定及导航配置；保留原 URL、nodeId、query、发布引用；验证菜单、直链、刷新、后退、标签返回。
- [ ] 样板清理与整体验收：无消费者后移除本次被替代的整页 Vue 和第二目录 owner；精确处理混合差异。全操作、正式入口、权限及回归通过后才推广。

M0 出口不是“目录能显示”或“增删改通过”。必须留下可模仿的完整四文件页面及设计依赖、正式入口和操作证据。

### M1–M7：按样板推广并闭合依赖

| 阶段 | 顺序与输入 | 本阶段交付 | 通过条件 |
| --- | --- | --- | --- |
| M1 应用与蓝图宿主 | M0 → A1 → A3 全导航 → A2 核心 | 应用管理、蓝图树/属性/绑定/引用四文件；当前导航宿主承接有效页面 | 应用 A/B、同路径不同节点、原链接/标签状态通过；原型与维度依赖 I1/D9，A2 暂不整体勾选 |
| M2 组织与数据授权 | M1 → O1 → A4/A5 → D3/G2/G3，逐项串行 | 组织树/选择、企业与申请、当前数据授权和脱敏配置页 | 配置写回与运行权限效果分别通过；在线 admin，夹具覆盖拒绝；不引入 G1 |
| M3 基础数据资产 | M1/M2 → D4 → D5 → D6/D7 | 数据库、表/视图、字典、编码四文件 | 专用资源实际操作和回读通过；不可重放操作有明确未知结果状态 |
| M4 数据计算设计 | D2/D5/P1 → D8 → D9 → D10；回到 A2 维度绑定 | 逻辑视图、维度来源、数据工作流及必要图组件 | 旧图、次序、版本和执行结果通过；A2 维度依赖关闭 |
| M5 文件与集成 | M1/M2 → I1 → I2/I3/I4/I5；回到 A2 原型/文件/版本 | 文件、JSON、Excel、接口、报表；完成 A2 其余功能 | 文件字节/树/导入结果/接口响应/报表激活分别回读；A2 全项验收 |
| M6 业务流程 | O1/D2/P1/I1 及当前数据授权合同 → W1 → W2 | 四文件流程设计、桌面与移动运行 | 旧流程图可用，每个操作后实例状态一致；不以假映射绕过角色依赖 |
| M7 系统支持与全量收口 | M0–M6 → S1/S2 → 交叉场景回归 | 缓存、监控、恢复、问题管理；全部有效入口闭合 | 覆盖对账、无遗留迁移业务 Vue 入口、全量门禁/构建与在线验收通过 |

P1 贯穿各阶段，按消费者需要实施，不作独立大重构。图引擎、报表引擎在对应页面按需加载；现有能力足够就不新增依赖。以上是串行顺序，仅互不修改文件的只读研读可在必要时并行。

## 五、影响范围和派工文件清单

### 当前样板已确定的精确文件

| 文件 | 职责 / 后续变更 |
| --- | --- |
| `config/pages/data-platform/data-space-catalog/rule.json` | 当前表格与组件树，逐项加入已批准操作入口和弹窗 |
| `config/pages/data-platform/data-space-catalog/script.js` | 查询、编辑、保存编排；复制 API/绑定/设计入口按子片接线 |
| `config/pages/data-platform/data-space-catalog/style.css` | 局部布局与操作状态样式 |
| `config/pages/data-platform/data-space-catalog/pagedata.json` | 场景资产；保留六模型和 default 视图，差异增加已核定视图 |
| `tests/runtime/page/catalog/data-space-four-file.test.ts` | 真实装配器、DataView、脚本上下文、渲染器行为验证 |
| `config/navigation/vue-pages.json` | 正式切换时移除该页 native source 抢占，不能提前造成断路 |
| `src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue` | 正式切换成功且无消费者后移除本次原生整页实现 |
| `src/lowcode/data-space/lowcode-data-space-catalog.ts` | 已证实语义落实统一数据链，无消费者后移除第二目录 owner |
| `tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts` | 迁移有效行为断言，再清理只服务旧 owner 的测试 |

实际身份：应用 `D99A1DCE9894698799101EFD70F8FC76`；样板工具与场景 `90A82E287930A234FEC3E687C94A93EA`。不能把这里 pageId 与 scenarioId 恰好相同推广到所有页面。

### 缺口已定位的源码边界

下列是下一子计划必须研读的边界，不是允许实施者自行全部修改的清单。

| 能力 | 当前真实文件 | 编码前必须确定的接口结果 |
| --- | --- | --- |
| 复制 API / 宿主能力 | `packages/spark-component/src/runtime/app-services.ts`；`packages/spark-component/src/page/context/buildPageContext.ts`；样板 script 与固定设计场景 pagedata | 已验收 `$page.copyText` 与原 owner DataView 查询；后续保护现有消费者及生命周期 |
| 查询绑定 | `packages/spark-lowcode-api/src/platform/project-blueprint/project-blueprint-api.ts`；样板四文件及7AB共享场景 | 已签收，证据 `pilot-binding-result.md`；完成子计划已删除 |
| 四文件读取展示 | `packages/spark-component/src/page/binding/build-page-children.ts`、`page/renderer/SparkPageRenderer.vue` | 纯钩子已签收，证据pilot-render-hook-refresh-result.md；下一业务消费见 `notes/plan-data-space-design-read-page.md` |
| 模型设计提交 | `packages/spark-lowcode-api/src/platform/data-space/design/{data-space-design-api.ts,data-space-design-mutation.ts}` | prepare 对应的既有后端执行/回读/部分失败合同 |
| 场景/运行装配 | `src/lowcode/data-space/{lowcode-data-space-runtime.ts,lowcode-data-space-assembler.ts}`；`packages/spark-project-model/src/page/{page-tool.ts,runtime-page.ts}`；`packages/spark-project-model/src/scenario/{scenario-view-file.ts,scenario-view-config.ts}` | 当前身份、共享场景保存、实例隔离；只为确证缺口修改 |
| 正式导航 | `packages/spark-app/src/router/{dynamic.ts,page-runtime-pool.ts}`；`src/services/project/navigation/project-navigation-guard.ts`；`src/App.vue` | 真实蓝图绑定与调用链最小差异；不恢复废弃 native lifecycle |

### 后续资产布局

保持样板现路径；每个具体页面在子计划中列精确四文件路径、真实 pageId/scenarioId、源页和测试文件后才派工，不预建空目录或虚构 ID。

| 领域 | 目标资产目录范围 |
| --- | --- |
| 应用、蓝图、企业、申请 | `config/pages/application/` 下的领域页面目录 |
| 空间设计和授权 | `config/pages/data-platform/data-space-design/`、`data-space-authorization/` |
| 数据库、表、视图 | `config/pages/data-platform/database/` 下的对应页面目录 |
| 字典、编码 | `config/pages/data-platform/definitions/` 下的对应页面目录 |
| 逻辑视图、维度、数据工作流 | `config/pages/data-platform/computation/` 下的对应页面目录 |
| 组织、数据授权、导航授权、脱敏 | `config/pages/governance/` 下的领域页面目录；不创建 role 目录 |
| 文件、JSON、Excel、接口、报表 | `config/pages/integration/` 下的领域页面目录 |
| 流程设计、运行、移动交互 | `config/pages/workflow/` 下的领域页面目录 |
| 缓存和系统支持 | `config/pages/operations/` 下的领域页面目录 |

三工具文件按页组织；共享 pagedata 部署按 scenarioId 去重，不能多页互相覆盖。遵守单目录文件/子目录数量门禁。专用组件进入现有组件领域；组件、公开服务、依赖和测试文件的精确路径须在子计划审定，不能据本表任意写文件。

## 六、每页转换的统一流程

1. **源码和操作对账**：完整读当前页、固定来源页/owner、调用方、测试和配置；列可见操作、隐藏入口、副作用；确认源角色依赖与当前边界。
2. **逐操作可行性**：记录来源触发点 → 源 owner → 既有后端合同 → 当前承接方法 → 四文件事件/视图 → 数据权限 → 保存/重开断言。状态为“已核合同”“缺前端能力”“缺后端合同”“已验”“按要求排除”；可读接口不是整项通过。
3. **锁定派工范围**：`notes/plan-<具体主题>.md` 列精确生产/测试/配置路径、消费/产出、命令及预期。继承已有授权；真正改变范围或设计前提才修订确认，不重问已回答的问题。
4. **开工基线**：重读当前文件，记录 git 状态、哈希和相关既有差异，typecheck 先通过；并发修改涉及本闭环则重新对齐。
5. **一个行为闭环**：有回归风险的行为先落有效失败用例，最小实现后立即验证；失败在本闭环修复，不扩成其他模块重构。
6. **主控验收**：先检查四文件运行形态，再审权限、身份、查询/保存 owner、失败和取消；测试必须验证实际效果。
7. **部署和入口**：三文件与场景分别比较写前基线、保存回执、字节回读；目标可打开后才切正式绑定。业务保存另查真实记录并整页重开。
8. **退役和记录**：无消费者后移除被替代实现，限定回归通过后关闭操作。知识候选留备注，确认后才写 knowledge；记录耗时、返工、审查和人工干预。子计划全通过后按 AGENTS 保留证据、删除完成计划；总计划到全任务完成前保留。

每页证据至少有：操作覆盖表、四文件/代码哈希、部署回执、菜单/直链验证、请求与回读摘要、取消/拒绝/异常、测试日志。不得记录密码、令牌等秘密。

## 七、验证计划和零新增回归判定

### 每个闭环

1. 开工基线及完成后均先 `pnpm run typecheck`，退出 0。
2. 精确 ESLint，当前样板：`pnpm exec eslint config/pages/data-platform/data-space-catalog/script.js tests/runtime/page/catalog/data-space-four-file.test.ts`；后续子计划列其精确文件。
3. 当前聚焦测试：`pnpm exec vitest run tests/runtime/page/catalog/data-space-four-file.test.ts`。包级改动按现有包 vitest 配置执行，不以根集合替代包测试。
4. 对应门禁：`pnpm run verify:pages-config`、`pnpm run verify:ai-codegen`、`pnpm run verify:dirs`；改 API/公共入口加入相关合同、导出和消费者检查。
5. 在线 admin 证明取消零写、成功、明确失败、精确回读、整页重开。拒绝/隐藏/脱敏用正式查询响应夹具补验，明确标注离线证据。

### 阶段及最终验收

- 阶段源码冻结后，主控执行 `pnpm run lint`、`pnpm run test:run`、受影响包测试；未变版本复用日志，实施者和主控不重复全量。
- 最终冻结版本执行 `pnpm run typecheck`、`pnpm run lint`、`pnpm run test:all`、`pnpm run verify:rules`、`pnpm run build`。失败分类为既有基线、本次引入、外部变化；有未解决的相关回归不能签收。
- 当前 AI 的 `pnpm run verify:page-design`、`pnpm run verify:project-planning`、`pnpm run verify:model-convergence` 纳入最终保护。设计器/流程增加对应行为验收，不以通用测试代替。
- 浏览器覆盖菜单、原直链、刷新/重开、前后退、标签返回、不同应用、同页不同节点/场景、脏页关闭、请求期间离开；既有数据页、蓝图、页面设计与 AI 主链按基线回归。

总任务必须同时满足：

- [ ] 29 个来源领域逐项有去向；G1 及其他明确排除操作留依据，其余有效操作无未解释遗漏。
- [ ] 每个目标业务页由四文件正式加载，无整页 Vue 套壳或 native 抢占；基础组件/宿主不误删。
- [ ] 业务写入、设计文件、共享场景、版本/发布状态各有真实回执和回读，未知结果不报成功。
- [ ] 数据权限、应用/节点/场景身份、隐藏/脱敏、实例隔离和未保存保护通过。
- [ ] 最终工程和实际操作验收无已知新增回归；未解决缺口清零，明确排除项另列。
- [ ] 当前 AI、蓝图、DataSet/渲染保持通过；无计划外后端变更、额外运行时或数据损坏。

“零新增回归”是冻结版本及覆盖范围内的验收结论，不能由测试数量推导，也不能承诺未经执行的场景绝无缺陷。发现失败即重新打开所属闭环，修复复验后再前进。

## 八、风险项与审查重点

| 风险 | 处理决定 | 验证归属 |
| --- | --- | --- |
| 原生 Vue 换壳、完成口径漂移 | 查 rule/script 是否承载业务及正式入口；整页全操作通过才推广 | M0 / 每页 |
| 共享场景被覆盖 | 读当前文本，保留其他模型/视图，按 scenarioId 部署；并发修改验证冲突而非覆盖 | M0 / 场景保存 |
| 写入未知、迟到回执、重复执行 | 保存锁、确认后身份重验、失效拒绝、原 ID 回查；未知结果不重放 | D1/D2、D7、I3、W2 |
| 权限/关联身份错用 | 原查询 owner、主键与业务关联键分开；表/行/字段拒绝和隐藏/脱敏夹具 | 所有页面 / M2 |
| 源角色依赖与当前产品冲突 | 排除角色机制；其余操作核实当前无角色合同，缺失登记，不造替代实体 | G1/D3/G2/W1/W2 |
| 图/维度/流程/报表并非完整可复用 | 核实 payload、次序、回执、旧数据往返；前端缺口补在当前层次 | D2/D8/D9/D10/I5/W1 |
| 部分成功后粗暴回滚 | 逐文件记录已写/已确认；业务保留 journal/preimage；仅在合同支持且目标未变时恢复，不假定事务 | 设计及多步保存 |
| 并发开发、后端账本变化 | 开工/部署前比精确基线；外部变化留证，不重置工作树或改后端凑门禁 | 全阶段 |

长期选择：修真实合同和边界，复用当前底座；不为短期通过添加第二套权限、兼容 runtime、静默兜底或删除有效断言。既有后端无法承接的能力保持未完成，报告具体缺口。

## 九、模型分工、消耗控制和下一步

- 主控负责范围、源码事实、精确子计划、架构/高风险审查、在线验收及总进度；低阶模型 `gpt-6-luna` 实施明确的单个闭环。
- 默认一个写代码实施者；必要的只读对账另派一个低阶代理，禁止同时改同一文件或跑全量测试。
- 派工只带计划路径、精确文件、消费/产出、命令/预期、约束；发现合同缺失返回证据，不自行扩范围。
- 主控集中回报同轮问题；修复先跑受影响用例，只有代码变化、失败或风险需要时重复验证；架构和难解问题由主控处理，不将简单实现全部升模型。
- 进度固定为“阶段 → 领域 → 页面 → 操作 → 证据 → 剩余缺口”，分开统计完成页与已验操作，不再只汇报 CRUD 而省略总任务。
- 下一步仍在 M0：目录复制/绑定、布局读取、四文件设计读取和只读关系图已验。renderer卸载销毁未保存DataView问题已签收；正在审定实际内容草稿与输入参数编辑方案，之后完成模型/字段/关系编辑、提交及正式入口。真实删除只等待已发出的特定确认；M0 完整验收后才开始 M1。

