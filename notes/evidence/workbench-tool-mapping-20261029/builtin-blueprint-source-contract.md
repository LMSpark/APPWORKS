# builtin 主树下一切片：窄来源与业务合同说明（按 85 节点现场证据修订）

日期：2026-10-29。源码基线 a5e7670dba902a477aa37e23511f5774f2a65808。唯一只读工作树 C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。沿已有映射/cfg报告接续；没有运行测试、UI、服务或远端请求，没有写仓库。本报告是可实施边界，不是新总计划或全部工作台完成声明。

**纠偏记录：本报告初稿把仓内 26 节点误当完整设计树，该建议现明确撤回。** 主控随后通过真实 DevSystem 正式 DataView 取证得到完整 85 节点。不得以“只读恢复”缩减为 26 节点、删除另外 59 个节点或把未知能力隐藏成不存在。以下为替换后的有效合同；初稿不再作为实施依据。

## 1. 新证据与单一真源裁决

现场来源为主控读取的 authenticated DevSystem DataView GetData 响应，不是本审查者独立请求：notes/evidence/workbench-tool-mapping-20261029/builtin-blueprint-live-inventory.json（查询 SysId=D99…，5 页 20/20/20/20/5，每页 Code=200/Count=85；UI 84 树项除根、41 页面），以及 builtin-blueprint-business-records.json（28 个白名单业务字段，排除权限签名/认证资料）。两者是迁移证据，不是活动配置或权限真源。

本次离线独立核得：85 唯一记录，14 Model + 71 Navitem，1 根、无孤立父节点；42 vue 目标、43 空目标、cfg 0；53 行 IsShowAtNav=1，memo 3 行非空、htmlDesc 全空。Model “流程监控” E328FBBF518141973C575D612CD75151 也带 Vue URL；它仍须保留 Model，不能按 URL 改 kind，因此 42 Vue URL 不等于 42 page。

与 config/navigation/appworks-system.json 的 26 节点逐项比较：26 全在 85 内，已存在的 parentId/prowid、title/FunName、order/FunOrderValue、conid、kind/conType、url/NavigationUrl 均无差异。这证明现有 26 是完整设计记录的明确发布范围投影；不是证实另外 59 应发布，也不是证明旧 DB 全部业务正确。builtin-blueprint-not-in-published-navigation.json 保留差额身份。当前可达范围仍为原 26 节点/18 叶，结合真实 GetNavigationMenus 授权后形成菜单；不按 IsShowAtNav=1 的 53 行或 Vue 注册存在扩大范围。

## 2. 最小正式来源设计：复用一个 manifest resource 与同一文件

### 2.1 推荐的物理/协议落点

保留 config/applications/appworks.json:8–10 的 navigationResource 身份 repository:navigation:appworks-system 与路径 config/navigation/appworks-system.json，不机械新增第三份配置。将该文件和 config/schemas/system-navigation.schema.json 从只含 26 投影节点的 V1 升为完整应用蓝图源合同（可用 schemaVersion 2）：

- `records`：迁入 85 条 28 字段业务原值，一条节点一份；保留 null、空字符串、数值、原 name 与 FunName、conType、父链、版本原值。拒绝非白名单认证/签名字段，禁止从 evidence 自动推权限。不能规范化成领域树后再存导致原值丢失。
- `publishedNodeIds`：仅保存现有 26 的身份选择（包括根/组），无 title/url/conid/order 的第二份副本。推荐显式 26 ID 集合以最小保持现状；若只存 18 叶并派生祖先，必须测试得到完全相同 26 集合，不能扩大。本片无需两种形式并存。
- 根身份继续 navigationRootId；协议名称可保留既有 system-navigation 并明确其“完整设计记录 + 发布投影”新语义，或随 schema 命名收敛，但不能用兼容 fallback 留第二份 nodes 真源。

一个解析结果同时产生：完整设计记录 DataView/85 树；已选 26 的 BuiltinSystemNavigation。readBuiltinSystemNavigation 的对外投影形状可以保持，runtime:322–367 继续原授权过滤。读取必须来自同一个已验证 sourceRevision；无需新建永久缓存。可在一次 owner 查询内保留只读 parsed snapshot，其生命周期属于原 DataSet，不另建全局草稿。

### 2.2 校验和删重复字段

完整 records 校验应用、唯一 rowid、根/闭合父链/循环、业务字段类型和原 kind；允许完整设计源中的空目标、Model+URL、未发布项。不能把现有 builtin-system-navigation.ts:90–106 的“所有 Navitem 必须 Vue+publish+conid、Model 不得目标”直接套全部 85。完整记录与发布投影分层校验：选中 ID 必须真实存在且不重复，选择保持父链；投影层继续验证原18叶的注册、URL、conid及当前发布语义，失败明确报错，不兜底扩名单。

投影映射只读派生：rowid→id、prowid→parentId、FunName→title、FunOrderValue→order、conType→kind、NavigationUrl→url、conid→conid；当前18叶的 publishInMenu 在明确选择且原 IsShowAtNav 对应的约束下产生。组不因原记录含额外字段而伪造页面目标。原来的 26 `nodes` 字段实体必须删除，schema/解析器/测试只认单一新源；不要留 records 与 nodes 双写、DB 回退或读取旧版本优先。

切换时 builtin 主树停止读旧 DB Base_NavigationInfo 为程序真源；**不删除远端业务记录**。普通动态应用 DB owner、独立业务模型与数据权限继续保留。迁入后的业务字段暂以只读资源展示；在线编辑/保存完整蓝图是尚未实现能力，不能称本片已经合仓全编辑。

### 2.3 7AB DataView/owner 复用

7AB874097A1E8711A42FD845939A6E05 是蓝图元数据 DataSet 身份，D99…是应用身份，rowid 是节点身份；不可混用。当前 7AB pagedata 的 Base_NavigationInfo modelBinding=7AB…p000，Base_AppSystemList=7AB…p001，仍是正式 DB 模型，不改成文件假绑定。

repository-scenario-resource.ts:21–33、44–65、68–106 的 RepositoryNavigation 当前只是独立临时 DataSet 中 id/text/sourceRevision 一行文本，读后 destroy。可复用 readRepositoryNavigationText、bindQueryExecutor、DataViewLocalQuery.select、assertIdentity 和只读动作合同，但还没有 7AB 的完整节点 DataView。

最小扩展为现有 7AB 配置增加一个明确 file 语义表/视图（例如 RepositoryBlueprintNode@default，无 modelBinding），精确指向既有导航资源的 records 投影。字段使用这 28 个有证据的业务字段；与 DB 同名字段仅为明确语义映射，不是假装 DB 查询授权。资源执行器消费同一 parser，按公共查询能力处理过滤/排序/分页，返回完整性与只读访问；页面不手传数组。

BlueprintWorkspaceDataView.ts:111–134、1303–1307 当前固定 DB view/modelBinding，须增加窄的来源定位：普通目标保留原检查；builtin 验同一7AB DataSet、精确file资源、同 view instance、manifest项目身份、无modelBinding。其 loadProjectTree:208–219、queryProjectRows:1260–1275、treeProjection:1039–1084、load/currentRow:164–204/1278–1289 可复用。字段 key 从 owner.view 建完整绑定，不能把 builtin 行塞进 Base_NavigationInfo。新增来源选择必须由统一创建/装配责任承接，不能四个消费者各写分支。

只读源给真实存在/返回业务字段 readonly，全部新增/编辑/删除/创建子节点不可用且无提交器；这些是本地程序资源能力，非 DB 权限签名。完整蓝图数据可读不自动授予运行菜单/业务记录/文件写权限。现有运行授权由 GetNavigationMenus 决定，不从完整树自行推导。scope/应用/DataSet/view 及释放迟到守卫沿原 owner 生命周期保留。
## 3. 必须同时接通的真实消费者（不能只解一个 guard）

| 消费者 | 当前证据与最小处理 |
| --- | --- |
| Dev 主树、节点选择和保存 owner | useDevState.ts:251–284 建 7AB runtime 并构造 BlueprintWorkspaceDataView；:477–483 loadProjectTree→ingest；:492 刷 projection。使用统一来源选择，builtin 不再查询 DB 主树；保留 bundle 租约/scope/释放。 |
| 节点详情及标准字段 | BlueprintWorkspace.vue:95–106 校验同 runtime/DataSet/currentRow；:128–135 load 选中行。NodeBasicInfo.vue:77、NodeStateConfig.vue:28 写死 DB binding，需要指向当前 owner 的完整 key；不能只换树数据、详情仍读 DB。 |
| 节点操作/树控件 | ProjectBlueprintTree.vue:17 新增根、:28 导入策划文档、:70 新增子、:73–80 删除；:132–140 拖动只判断非根，未检查来源。只读切片须使这些入口呈现不可用，且真正命令仍由 owner capability 拒绝；不以按钮禁用代替数据层守卫。search/expand/select 可保留。 |
| 工作区原型/导航宿主/发布 | BlueprintWorkspace.vue:14–19 有独立 BlueprintReadonlyInfo 查询、估算、Delivery/Release。迁入28字段可以只读呈现估算/原型正文原值；独立原型版本、导航宿主关系未迁入时不挂载远端查询或假空结果。无cfg节点保持无 activePageId 的三文件交付禁用边界。 |
| 有界面项目策划 AI | useDevState.ts:1257–1266 将 owner 传给规划并 saveBlueprintAfterRun。必须在只读来源无法提交时禁用修改/导入，避免先运行昂贵 AI 才报保存错；底层 owner 写守卫仍保留。 |
| 无界面项目策划和页面设计 AI | project-planning-agent-run-provider.ts:172–192；page-design-agent-run-provider.ts:238–258 均自行建 7AB owner。二者须同一来源规则：可读上下文来自仓内；builtin 原生 Vue 不能作为可编辑 cfg 工具。project-planning-agent-workflow-binding.ts:362/414/455–466 的实际修改经 owner，必须保持拒绝只读写入。 |
| 目录设计器的工具依赖 | data-set-design-page.vue:1459–1462 也自行建 BlueprintWorkspaceDataView 并传 blueprintTreeProjection；lowcode-data-space-runtime.ts:172 注册 ProjectToolResource。project-tool-resource.ts:64–83 只挑 cfg；builtin 完整85当前cfg=0，应得到真实空工具目录而非整树拒绝，也不得伪造三个工具文件。 |
| 跨项目引用 | lowcode-runtime.ts:540–544 当前 builtin guard 后普通 readRecords；ProjectReferenceClient.loadProjectBlueprint 是另一条入口。只能在同一仓内来源 projection 接好后替换 guard，临时 runtime/DataSet 必须释放，当前 scope 与被引用项目 ID 分开校验；普通项目保留原读取。 |
| 运行菜单/页面路由 | lowcode-runtime.ts:322–367 保留 GetNavigationMenus 的节点 ID/URL/conid 精确匹配及父链可见；不从开发树生成“全部可运行”菜单。Vue registry/原 URL/节点身份照旧，无工具文件下载。 |
| 目录绑定查询 | LowcodeDataSpaceCatalog.queryBindings:250–279 当前从目录 DataSet 的 Base_NavigationInfo 查询所选记录 sysid，属于独立 DB 业务绑定查询。不能因本片恢复 Dev 主树全局替换所有同名模型；若需要把 builtin 程序绑定也迁到声明，须按目标应用显式复用同来源节点资源，并维持原读范围/闭合父链，不把此消费者悄悄认作已完成。 |

以上已覆盖生产代码中直接构造 BlueprintWorkspaceDataView 的四处（Dev、目录设计、两个 headless provider），及主树、跨项目引用、工具目录、运行菜单。普通应用 DB 更新/规划/发布及文件适配仍为真实消费者，不删整个 owner 或资源。

## 4. 85 原值的可见能力与真正缺失资源

纠正初稿：memo、htmlDesc、估算、负责人、status、VersionId、导航布局等并非都“缺来源”；主控的新业务原值证据已包含它们。迁入 records 后可以按只读资源呈现真实值，区别 null/空字符串/零，不捏造默认。name 是程序名称、FunName 是标题，不能合并字段丢失其差异。53 个发布标志只能如实呈现设计值，不能替代当前发布 ID 选择或正式运行授权。

- 基本信息、估算、导航属性、原型 HTML：按真实迁入值只读展示；htmlDesc 85条均空只证明本次原型正文为空，不证明不存在原型历史。memo三条非空必须保留。readonly UI不可自动提供修改/保存假入口。
- 原型版本 Base_Navigation_Desc_Version、导航宿主 Base_Navigation_DataRelation：不是这85记录中的字段集；尚无仓内资源迁入证据。不能挂载旧DB查询悄悄续作builtin真源，也不能显示假空列表。明确“独立版本/关系资源未迁入，当前不可用”。
- 数据空间 conid 为原值，已有绑定场景/真实DB模型和字段查询继续独立确认，不按空目标删除节点，不按字段有值宣称设计可编辑。
- 任务：BlueprintWorkspace.vue:18 当前明确“参考实现暂无对应任务资源”，本轮没有证据补齐，不造任务对象。
- 41 page 是原kind/目标联合领域投影，不是把71 Navitem都当可运行页。无目标节点仍完整保留并提示尚无运行目标；Model+Vue维持原kind，不替其纠错。未登记/未获授权/未选发布的页面分别诊断，不能删记录。
- cfg为0，所以当前builtin完整85也没有真正工具三文件交付目标。PageTool/VersionId三文件交付保持不适用；有原VersionId字段也不能在无cfg时推导一个工具。原生源码部署能力未在页面侧实现，不能把只读树称发布闭环。
- 只读树入口须避免 root新增/删除/拖动/AI导入/保存操作承诺可用；直接API仍受只读source拒绝。对未来完整蓝图编辑明确未完成，不能以readonly片替代用户整体目标。
## 5. 唯一真实三文件集合及删除结论

当前 config/pages 下实际只有 data-platform/data-space-catalog/{rule.json,script.js,style.css} 这一组工具三文件。生产 manifest 只指同目录 pagedata.json（appworks.json:23）；导航仍指原生 data-set-list-page.vue。明确装载三文件的是 tests/runtime/page/catalog/data-space-four-file.test.ts:23、404–406、429、1673–1692；未找到生产装载器把这组文件接到 builtin 工具身份。raw JSON glob 包含 rule 文件不等于它被注册为可消费资源，manifest/source identity 仍不允许任意文件。

| 旧脚本业务语义 | 当前原生正式承接（非仅同名按钮） |
| --- | --- |
| 初始化目录、应用、当前页创建人（script:172–195） | LowcodeDataSpaceCatalog:50–102 绑定视图、加载及 validateQueryResult 中按当前页 creator IDs 查询；native 页:217–220 装同 PageRuntime。 |
| 名称或 ID + 应用筛选、分页（:197–248、695–710、793起） | data-set-list-page.vue:12 RendererTable、:136–143 标准 OR/app filter；catalog.test:165–175、444–451 对正式 query/filter/page 行为有测试。 |
| 新增、编辑、取消及未知保存（:249–438） | LowcodeDataSpaceCatalog:117–206 原 DataView 编辑与 DataSet.saveChanges、unknown/readback；native:16–33 绑定字段、核验入口。tests:236–283、375–392、410起保留相应语义。 |
| 删除及目标身份（:439起） | catalog:208–239 真实模型检查及只保存目标行；native:35–40 确认，非直接删除 JSON。 |
| 绑定路径查询、关闭、迟到结果（:35–170、712起） | catalog:250–295 派生 bound/ancestors DataView、完整性/字段可读/父链校验与释放；native:47–50 标准表；tests:295–329、394起。 |
| 复制 API（:502–634） | catalog:297–306 复用原设计 session.readApiInfo、目标检查/finally dispose；native:177–183 复制；设计 session:view-design.ts:2059起验证正式元数据/dirty/权限。tests:332–347、403起。无需保留旧脚本一份格式和查询算法。 |
| 打开设计（:636–657） | native:43–46 和 :193起只传选中 dataSpace ID 的设计对话框。旧 :651 跳独立 data-space-design URL，已不符合当前目录内对话框/节点实例合同，不应照搬。 |
| 应用/创建人可读、遮罩、无法解析提示（:744–792） | catalog:309–343，native:124–132，tests:178–205、453起。 |
| 手写控件和视觉 | rule:16/21/89/107/130/144 专用 RenderCatalog*；style 全部 catalog-* 专属。native 标准组件已承担相同操作的展示，旧 h(input/select/button/table) 不是须保留的公共标准能力。 |

据此可收口删除这三个活动资产，以及只为它们装载/执行的旧 data-space-four-file.test.ts；其中仍有价值但原生测试未覆盖的通用行为应移入现有原生/数据层测试后再删，不能为了少失败删业务断言。保留同目录 pagedata.json、四场景 manifest/历史、原生目录与设计页、LowcodeDataSpaceCatalog、普通 cfg PageTool/RuntimePool、工具版本 DataView/文件服务。历史 evidence 可留但标历史；纠正任何仍将 triple 描述为活动生产目录的说明。这里证明当前语义已承接与旧资产无生产接线，未重新做所有原生目录动作的现场验收。

## 6. 下一切片的有效 RED 与最小验收

1. 真实 builtin Dev owner 路径，远端DB主树stub为空或放冲突值：仍从同一仓内records得到85唯一节点/14 Model/71 Navitem、完整父链、所有28字段原值，UI84树项/41页面语义不丢失，builtin DB树查询0。不能以26节点期望骗过验收，不能直接ingest预造数组替代正式资源。
2. 同一源的发布projection完全等于原26字段投影（同18叶），53 IsShowAtNav、其他Vue注册存在都不扩名单；无效/重复发布ID、父链缺失明确拒绝。runtime继续测试真实授权缺叶/父、URL/conid mismatch。保存一份节点字段源，不存在配置双写。
3. mounted主树选原26内节点、额外59内有目标/无目标节点、Model+Vue“流程监控”，均保留kind和原值；标准组件绑定同一7AB file DataView/currentRow；写入口/直接命令不可写，独立版本/关系资源明确未迁入而不偷偷读旧DB。
4. 目录设计ProjectToolCatalog以完整85 projection得到真实空cfg目录；跨项目引用返回同85而非BUILTIN guard；两个headless provider同源，不能把Vue送三文件读取。普通动态项目原权限/保存/发布/file消费者保持原回归。
5. 作用域变更、释放与迟到加载不串目标；主控现场使用完整85树验证search/select/details、无目标诊断、原生页映射和运行权限，0 builtin DB主树请求/业务写入，Document=0。再抽普通动态项目回归。此验收仅完成完整来源与只读消费，不宣称完整工作台编辑/规划/发布完成。
## 7. 主控为旧 cfg 格式应取得的真实远端清单

只需有边界的授权只读清单，不抓凭据、不读全业务数据、不自动迁移或写记录。

A. 以正式 7AB Base_AppSystemList 当前可读结果确认目标应用集合及 ID；优先当前 builtin 旧来源与至少一个实际使用 cfg 的动态应用。对每应用，经原 7AB Base_NavigationInfo DataView/正式 query 获取完整授权可读的 rowid、SysId、prowid、conType、name/FunName、NavigationUrl、VersionId、conid；保留 total、页完整性、字段不可读/缺失诊断，不把 masked/未查询解释为无配置。GetNavigationMenus 只含运行授权发布项，不能替代此库存。

B. 逐原始 cfg URL 分类：单段、精确当前 applicationId/单段、其他前缀/层级、多余 query/hash、编码分隔符、/__page/遗留；原文保真，不 slice 最后一段。对候选工具 ID 记录 nodeId 与 app/page 的关联；不同节点同工具、不同场景调用必须保留。

C. 仅对已确认目标应用/候选目录调用 lowcodeApi.design.listFiles({appType:'designfile',folderPath:...})（lowcode-design-api.ts:124–139），取得真实 entry 文件名、大小/时间等返回字段和三工作文件/各 N__文件。listFileVersions :149–163 可按具体文件过滤；不要把 parser 的单段拒绝当远端目录不存在。对于二段旧值，须记录候选“旧发布 locator”与当前 app/page 目录是否实际对应；不做读取失败→换目录的运行 fallback。

D. 按记录 VersionId 指定的三个快照及必要工作文件，用只读 readTextFile :108–120 核存在、内容 hash、rule 的真实结构/工具身份线索，不需要把大段内容塞报告。缺文件/不可读/不存在要区别记录。不得以时间戳或同名目录单独证明迁移关系；“cfg:APP/tool”是已知旧发布产物需要记录与真实文件对应证据。

E. 给出仅包含应用/node/原 cfg/规范候选工具 ID/真实 locator/三文件及版本存在性/hash/不可读原因的清单。只有它才能决定：本系统已发布的 app 前缀是可明确迁移的旧 locator，还是存在真实层级工具合同。若仍含歧义，统一解析明确诊断，不静默兼容、试两种路径或批量改 DB。此前 cfg 报告的 RED A（新建 cfg:tool 可发布且只改 VersionId）不依赖此远端调查，可先核；旧格式行为须在清单后裁决。

## 8. 当前缺口与证据身份

D99当前85记录cfg=0，因此它不能证明普通动态项目的旧cfg格式全部可删除。第7节清单仍须针对实际cfg消费者取得；当前已取得D99完整记录，可以不重复请求。不得由“完整蓝图已迁入”顺带删除普通工具能力或远端历史资产。

本轮只静态核已有源与主控现场证据，未执行RED/现场操作。85旧业务原值不是业务正确性判决：Model+Vue、空目标、发布标志与实际可达差异均先保真与诊断，不擅自纠正DB。readonly源边界不能被解释为整体目标缩小。目录绑定查询的builtin程序来源仍需明确接同源或登记剩余，不能因主树成功漏记。

业务原值证据 SHA-256：944E98C5C86749394425B38137958081EF71BAE82A8C90AD1B6F875274FC8885（builtin-blueprint-business-records.json）。本报告没有将证据写成active config，没有保留权限签名或认证信息。
