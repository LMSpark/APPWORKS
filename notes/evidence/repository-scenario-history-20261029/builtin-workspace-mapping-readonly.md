# builtin 项目树与工具三文件正式映射：只读预研

日期：2026-10-29。基线：7a014090423db7f0569d840fcf3fd734e09cc47e（短号 7a0140904）。所有源码结论取此提交；历史切片正在其他工作者处修改，本报告不依赖其未完成代码。唯一仓库：C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。下文路径相对此仓根，行号属于基线。未运行 UI、测试、服务或远端文件接口；没有产品、测试、台账写入。正式源码与待核推断分开，以下顺序仅为依赖建议，不是已冻结新计划。

## 1. 结论与责任边界

1. builtin manifest 目前只有应用、导航资源和四个场景资源，完全没有工具三文件清单。导航 26 节点包含 8 个 Model、18 个 Navitem；18 叶全部为 vue:，没有 cfg:。这些叶应保留节点身份、原 URL 和原生 Vue 注册表的真实映射，不能为满足工具结构伪造 rule/script/style。
2. 有两条不同的项目树读取链。跨项目引用树 loadProjectBlueprint 明确拒绝 builtin；DevSystem 主树却仍由 BlueprintWorkspaceDataView 查询数据库 Base_NavigationInfo。仅解除前者错误不能恢复主树的仓内来源，亦不能将静态导航伪装为数据库授权查询结果。
3. 已存在的三文件 PageTool、DataView 保存、版本回读、发布指针与运行池可复用，但 builtin 来源尚无正式工具声明/适配。远端版本列表 ProjectToolVersion 还绕过 builtin 文件读取守卫，必须一并梳理。
4. 普通 cfg 目标存在单段 pageId 与 project/page 路径的静态冲突。必须澄清身份映射后再扩展；原生 Vue 路由不能因此转成 cfg。
5. 当前仓内目录三文件只查到测试消费；远端动态应用的三文件及蓝图 owner 仍有正式消费者，不能整体删除。仓内完整资产与远端实际清单是否相同，尚无实时证据。

## 2. manifest、导航与原生页面

### 2.1 正式声明

- config/applications/appworks.json:5-10：应用 D99A1DCE9894698799101EFD70F8FC76，source=repository，导航 config/navigation/appworks-system.json。
- 同文件:12-35：仅四场景，设计 8D1AB14DD8277F3E7017CD38F77B09FD、目录 90A82E287930A234FEC3E687C94A93EA、字典 69B79AB779DF4C12A5595DACDF3283F1、项目蓝图 7AB874097A1E8711A42FD845939A6E05。它们各自只指向 pagedata.json，不声明工具 rule/script/style。
- src/registries/builtin-application-registry.ts:3-6、15-29、36-55：实际类型/校验/解析与上述范围相同，没有 tool descriptor。
- src/lowcode/resources/shared/builtin-system-navigation.ts:5-18、33-44、46-83、90-106：导航是 repository DataView 文本资源，校验根/闭合父链/循环；叶要求 vue:/、publishInMenu=true、conid 非空。当前合同不能直接加入 cfg 叶。
- src/lowcode/lowcode-runtime.ts:327-360：builtin 菜单发布仍须与后端当次授权按节点 ID、target URL、formKey/conid 一致，且父链可见；仓内导航不是新的授权源。

### 2.2 当前 18 个叶的源映射

下表 ID 是导航节点 ID，必须保留同 URL 下不同节点的身份。具体 URL 来自 config/navigation/appworks-system.json，源由 config/navigation/vue-pages.json 和 src/registries/vue-page-registry.ts:87-110、174-199 解析。以下源均在 src/views/ 下。

| 节点 ID | 标题 | 原生源相对 src/views/ |
|---|---|---|
|78C58A7FE34F2987267A1E8AF10B2990|服务器管理|features/data-platform/database-management/ui/service-management-page.vue|
|348D1C50B204C779AABBE2489C5E2FDF|缓存管理|tenant/CacheManager.vue|
|A133D679691178F192D7E9DA06829506|数据编码|features/data-platform/structured-config/data-code/ui/data-code-list-page.vue|
|0C70F74793F9E858B71E0DBDEC784D57|应用系统列表|tenant/AppList.vue|
|FFDEF2AED3E19A38C0FCDDC748CF939B|JSON数据管理|features/data-platform/semi-structured/json-data/ui/json-data-page.vue|
|36B01771C627B9BF5CD493DC75B996A1|电子表格导入导出配置|features/data-platform/semi-structured/excel-import/ui/excel-import-list-page.vue|
|28F30060CD75BA684B28EEF07732CB72|数据表和视图|features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue|
|62DB03B06A489600FFF86F3640D5C0E7|数据库管理|DataBaseManage/DataBaseManage/index.vue|
|EDB0E34486FFB903E896E5C281230961|数据字典|features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue|
|8CBB62EBC873A38DB9E6EEF177AFC731|外部服务管理|features/integration/api-management/ui/api-management-page.vue|
|A8FB2B2B161125A16FD15ED9581CD15B|表和视图管理|features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue|
|EB720370EF06A5A656838F87E0716D6B|逻辑视图|features/data-platform/structured-config/logic-view/ui/logic-view-list-page.vue|
|BBA48156BAF054754E038C3A4FCBCD65|逻辑视图管理|features/data-platform/structured-config/logic-view/ui/logic-view-list-page.vue|
|A2D63AB2AAEF156E7727094A23AEA433|PDF效验管理|features/data-platform/semi-structured/pdf-inspect/ui/pdf-inspect-list-page.vue|
|5E9676B1E38860B023921F48FB4370DE|数据工作流|features/data-platform/structured-config/workflow-definition/ui/workflow-definition-page.vue|
|E0BB79BA59101F76628F1448D6351B4E|数据工作流|features/data-platform/structured-config/workflow-definition/ui/workflow-definition-page.vue|
|CB52B21B26AD20AADDC4498613C3078D|字典管理|features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue|
|90A82E287930A234FEC3E687C94A93EA|数据空间管理|features/data-platform/data-set-management/ui/data-set-list-page.vue|

注册表还包括隐藏编辑页（空间设计、字典数据、数据编码编辑、逻辑视图设计、工作流设计、Excel/PDF编辑等）、/dev 和 shell tools。它们不能自动升格为导航叶或三文件工具。vue-page-registry.ts:25-45 声明 hidden/shellTool/scope/source；:62、87-110 绑定实际 views 模块；:152-170 对外提供选项。lowcode-runtime.ts:300-317 shell tools 有自己的生成身份，并非上述业务节点清单。

映射有源文件，只证明页面可被注册，不证明完整业务闭环已完成。亦不能把全部叶的 conid 改成四个内部场景之一：data-set-list-page.vue:82、217-220，service-management-page.vue:75、192 起，data-dictionary-list-page.vue:60、135-144 都消费宿主 blueprintScenarioId/正式 DataSet；tenant/AppList.vue:116 有自身 fallback。实例身份、数据查询身份和文件位置须分别保留。

## 3. 两条项目树及当前依赖缺口

### 3.1 DevSystem 主树仍依赖正式数据库

src/views/app/dev-system/useDevState.ts:248-269 创建项目蓝图 PageRuntime（7AB、目录90A、字典69），获得真实 DataSet 并创建 BlueprintWorkspaceDataView 与 PageToolFilesDataView；:466-475 主树 owner.loadProjectTree 后 ingestBlueprintTree；:1234-1269 的 ensure/loadBlueprint 没有 builtin 仓内分支。

src/services/project/blueprint-workspace-dataview.ts:111-134 要求 7AB DataSet、Base_NavigationInfo 正式 modelBinding，使用 staged DataView；:208-219 loadProjectTree；:1260-1275 按 SysId 查询当前项目，allPages、完整性与可见字段检查；:1039-1084 从授权可见行/草稿投影正式树，校验父链；:1188-1240 保存仍通过 DataSet 和回读核验。

这不是简单的 JSON 树控件。它还承担节点草稿、规划、导航字段、创建/删除、未知提交、发布指针等业务。静态导航只有 id/parent/title/order/conid/kind/url/publish，没有 html 原型、规划描述、VersionId、任务/交付字段，不能补空值后冒称完全等价。config/pages/application/project-blueprint/pagedata.json 当前同时含 Base_NavigationInfo、Base_AppSystemList、Base_Navigation_Desc_Version、Base_Navigation_DataRelation 和 ProjectToolVersion 等不同资源；“仓内 pagedata”不等于这些业务记录已仓内化。

### 3.2 被明确拒绝的是另一个引用入口

src/lowcode/lowcode-runtime.ts:546-579 readLowcodeProjectBlueprintEditorTree 对 builtin 抛 BUILTIN_BLUEPRINT_SOURCE_UNAVAILABLE，对普通项目读 lowcodeApi.blueprint.readRecords；:761 装入 projectReferences.loadProjectBlueprint。这与上面的主树 owner 并不相同。后续若建立正式 builtin tree projection，须逐一核对主树、项目引用、工具目录/依赖扫描消费者，不能只解一个 guard。

### 3.3 主工作区实际消费者

- DevSystem.vue:55-79：ProjectBlueprintTree + BlueprintWorkspace，选中节点驱动编辑。
- blueprint-workspace/BlueprintWorkspace.vue:8-19：基本信息、原型/描述版本、数据规划、导航配置、导航宿主、任务/交付等。各工作区有独立数据责任，静态导航投影不自动提供其完整可写能力。
- useDevState.ts:1311-1315、1486-1507：只有 config-files 页面才打开 PageTool；原生 Vue 清理活动文件上下文。这是应保留的正确边界。
- packages/spark-project-model/src/blueprint/project-blueprint-node.ts:43、59-64 与 project-blueprint-tree.ts:15-19、40-45：正式区分 config-files/system-page/link/none。原生页的 summary ID 用于展示，不是三文件身份。
- packages/spark-project-model/src/page-tool/project-tool-resource.ts:64-83：工具目录必须接受正式 blueprintTreeProjection，只挑真正 cfg 工具，保留 source.VersionId；:86-99 文件查询调用 workspace 读取。数据空间设计页仍使用它做工具依赖消费，不能删掉整个资源。设计页真实 PageRuntime/owner 校验见 data-set-design-page.vue:1371-1394。

## 4. 三文件真实来源、操作与发布边界

### 4.1 仓内资产与仓外来源

生产目录发现 config/pages/data-platform/data-space-catalog/{rule.json,script.js,style.css}。精确路径消费仅查到 tests/runtime/page/catalog/data-space-four-file.test.ts:23 等测试；没有生产代码明确装载这三个文件。rule.json:16、21、89、107、130、144 等使用 RenderCatalogActions/Search/App/Creator/Paging/Bindings 等特定渲染器，不能当作已接通的标准目录工具。

backend-api-contracts/characterization-fixtures/pages-config/lmspark/ 下有多组工具文件，tests/support/fixtures/ 与 notes/evidence/.../four-file-correction/ 也有；前者是接口特征夹具，后两者是测试或历史证据，均不能被默认纳入活动工具源。仓外原项目的真实文件全集/所在本地目录未在本任务访问；远端实际文件是否存在亦未请求，因此不宣称迁移资产已齐。

普通目标当前正式仓外来源是 Lowcode 文件服务：appType=designfile，customPath 理论为 applicationId/pageId。lowcode-runtime.ts:109-121、601-619；packages/spark-lowcode-api/src/design/lowcode-design-api.ts:93-120 为 /api/File/DownFile 和 /api/File/content/text，:124-139 为 /api/File/list，:149-163 按实际 N__fileName 筛快照。HTTP 合同只给逻辑存储路径，不能推断服务器物理磁盘目录。

### 4.2 公共对象链及普通保存

- packages/spark-project-model/src/page/page-file.ts:17-23：三文件固定 rule.json/script.js/style.css，pagedata 不属于工具私有第四份状态。
- page/page-tool.ts:17、33-50：持有三个文件的草稿、hydrate/markSaved、撤销重做、dirty 和 definition；不生成 Vue 的虚构三文件。
- project-workspace.ts:141 注入读取器；:459-472 打开/预览（版本预览不覆盖工作缓存）；:476-502 原文冲突检查、持久写入、回读；:597-624 三文件并发读取且防 dirty/stale。
- useDevState.ts:360 起 savePageToolFile 经 PageToolFilesDataView/DataSet 执行；:322-326 创建快照也走文件命令视图，不能新增页面直接 upload 旁路。
- packages/spark-project-model/src/page-tool/project-tool-resource.ts:110 起限制可写工作版本，:145 起提交捕获变更，发布版本只读。
- lowcode-runtime.ts:622-642 gateway 保存；:767-812 createPageToolFilesIo 包含 list/read/upload/restore/listVersions/uploadVersion/readVersion/remove，全部 builtin guard。只替换读取器并不能恢复写入、创建/删除、历史与发布。
- 远端上传 LowcodeDesignFileUpload:52-61 区分工作文件覆盖与版本禁止覆盖；:68-99 捕获 scope、上传、回执实际文件名和字节回读。三个文件/数据库之间无原子事务。

### 4.3 创建、版本、发布和运行

useDevState.ts:1584-1613 创建子页面时先通过文件 DataView 创建三文件，再保存真实导航行，失败走补偿/未知结果处理；不能把静态导航树直接接上这些写操作而绕过真实 owner。

DevFileEditor.vue:218-240 的“版本列表”确实通过 7AB ProjectToolVersion DataView 查询，非死代码。src/lowcode/resources/shared/project-tool-version-resource.ts:33、41-60 直接调用 lowcodeApi.design.listFileVersions，路径 applicationId/pageId；:101-105 校验正式 file resource。src/lowcode/data-space/lowcode-data-space-runtime.ts:117-144（特别 :127-128）给所有应用安装资源 registry，而 agent-workflow-file-resource.ts:50-59 注册该资源。因此版本目录目前绕过 lowcode-runtime 的 builtin guard。补来源须覆盖这一正式 DataView 适配，不能把业务文件 AgentWorkflowFiles 一起删掉。

DeliveryPane.vue:8-18 提供三个 DevFileEditor 和预览；BlueprintWorkspace.vue:171-226 发布要求导航字段正式可写且无脏数据，逐个上传快照→核本地文本未变→保存对应 VersionId 与 NavigationUrl→回读，记录已尝试/已确认文件及引用。中途失败可能部分完成，不能宣传一键事务发布。原生 Vue 没有 activePageId 时不应开放三文件交付。

src/main.ts:421 注入 readLowcodePageFile；packages/spark-app/src/router/page-runtime-pool.ts:54-100 对 config-page 使用 projectId/nodeId/pageId/query/hash 标识实例，读取已发布三文件指针，检查导航绑定、scope/generation，hydrate 后 markLoaded；:102-104 场景另载。这是正式运行消费者，不能只让 DevSystem 预览读仓内文件而线上仍读远端。

### 4.4 现存 cfg 身份矛盾（静态证据已成立，实际影响尚未 UI 验证）

1. useDevState.ts:1598 新建 NavigationUrl=cfg:${pageId}。
2. BlueprintWorkspace.vue:192-197 将 cfg 后缀原样当 customPath，同时要求其第一段为 projectId 且至少两段；所以该新建格式无法通过这里的路径校验。
3. 若值为 cfg:project/page，lowcode-runtime.ts:252-254 将整个后缀当 pageId；project-blueprint-tree.ts:12、40-43 同样不剥离项目段。
4. lowcode-runtime.ts:601-611 的 toolFilePath 又要求 pageId 为单段，才拼 project/page；project-tool-version-resource.ts:41-48 亦为单段校验。

这不是 builtin 专属能力缺口，应先明确同一个正式工具 ID、URL target 与 storage locator 如何解析，避免在新的 manifest 再建一套互不一致的映射。不得通过允许任意斜杠或默默 fallback 到首个项目来“修好”。

## 5. 最小恢复依赖顺序（待评审建议，不冻结实施）

A. 先确定 builtin 项目树的真实业务范围与字段真源：仓内导航可做只读正式树/原生页面映射；若本片还要求编辑基本信息、规划、原型、发布等，必须逐项明确缺失字段的存储与 DataView 语义，不能用现存 DB owner 默默回读成 builtin 程序真源，也不能伪造授权字段。保持原生页 URL/节点 ID/场景身份。

B. 在已有项目节点领域对象上接来源合适的正式树 projection，分别验证主树、项目引用树、工具目录/依赖消费者；原生页可选中、定位源码/运行页面，三文件交付维持不适用。不存在 cfg 工具时返回真实空工具目录，不能拒绝整个 native 树，也不能生成占位三文件。

C. 对真正要纳入 builtin 的工具先列经过确认的工具身份与三个真实文件资源，核原消费者/全部文件内容；再决定仓内目录和 manifest 合同。现有目录 triple 是否保留为工具须先完成语义判断，不能凭目录名直接启用。

D. 同一来源适配覆盖读取、普通 DataSet 保存、创建删除、快照/版本目录/恢复、发布指针、运行池；保持 PageTool 内唯一草稿、请求 scope/generation、释放后晚回执隔离。跨应用参数必须同时改变树、DataView、文件 locator 与 runtime，不允许旧 pending 结果套到新身份。普通动态项目继续正式远端链。

E. 最后才切入口并验证真正 SPA：builtin 主树原生映射、原生无文件下载；已确认 cfg 工具编辑/取消/保存重开/发布运行；版本目录与正文同源；未知/部分成功、跨项目和释放；普通应用不回归。上述是未来验收面，本次未执行。

## 6. 删除与保留边界

明确应消除的旁路/错误路径：
- builtin 程序树若以仓内声明为真源，不能仍借 DB 主树或 projectReferences 的普通远端 fallback 假装已统一；来源切换时删除被替代的 builtin 分支，不删除普通项目 owner。
- ProjectToolVersion 直接远端列表在 builtin 情况下的旁路，须由与正文相同来源承担；保留普通项目合法版本能力。
- 任何把 vue: 页面投影成 cfg 三文件、复制一份场景配置进工具文件、或以测试资产证明生产接线的新增路径均不应存在。
- 目录遗留 triple 与专用 RenderCatalog* 脚本若确认被当前原生目录完全替代，应连对应活动测试/说明一起收口，不能双入口并存。本次尚未完成三文件逐项语义对照，故这是删除候选，不是可立即机械删除的结论。

明确保留的正式消费者：普通应用 lowcode blueprint/DataView、普通 cfg 文件服务、发布 VersionId 与实际快照读取、ProjectToolResource 给目录设计器的依赖分析、AgentWorkflowFiles 业务文件资源、原生 Vue 注册表/原 URL/隐藏设计页、真实服务端授权返回。历史证据和 characterization 夹具应标注范围，不因未参与活动运行就一刀切删除。

## 7. 尚待核实

- builtin 主树要“正式展示与映射”还是同时涵盖原型/规划等完整编辑；缺失字段是否有经确认仓内真源。当前导航清单不足以承接全编辑面。
- 仓外真实工具清单、版本与发布引用、逐文件内容及原页面操作语义；本次未访问外仓/接口，无法确认应迁入的数量。
- cfg 身份矛盾的全部现存存量格式与真实 UI 行为；需精确合同测试，不以放宽路径校验替代身份方案。
- builtin 工具存储是否需要生产宿主写能力、发布指针由谁保存；Vite 开发存储不能自动证明生产支持。场景历史切片结果待主控确认，不在此预研复用未完成状态。
