# 场景历史合同只读分析（2026-10-29）

分析基线：`7a014090423db7f0569d840fcf3fd734e09cc47e`。唯一阅读工作树：`C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks`。本报告所有相对源码路径均相对此目录。已读本处 AGENTS.md 0.2—0.7 与唯一台账顶部；没有修改产品、测试、台账、生成物或 Java，没有运行写入验收。既有测试结论来自指定证据文件，并非本轮重跑。末次 git status --short 为空。

## 结论与本片边界

1. 普通目标的 list/preview/create 已有正式链，DevSystem 恢复也已经转成定义 DataView 修改；不用重造文件编辑器或新保存体系。
2. 四个仓内程序场景的历史仍在 gateway 被明确拒绝。现有 repository store 只处理活动 pagedata；配置目录未搜索到 `__pagedata` 或历史文件，不能据此声称远端历史为空。
3. 创建场景快照没有保留上传前 attempt，也没有 unknown 核验接口。响应丢失后 finally 清锁，下一次点击会重新分配版本。这是真缺口。
4. 恢复现在会自动保存（useDevState.ts:966）。本片目标要求恢复只改变定义草稿，之后由明确保存走 DataSet；应删除此自动提交，并同步文案与测试。
5. 真实 UI 目前历史仅在 DevSystem，builtin 项目树尚未恢复。仅完成 gateway 不能验收四场景的 SPA 闭环。本片应在当前可达的目录设计对话框加入空间级共享历史入口，复用原定义 DataView；不能依赖下片项目树或为验收临时拼路由。
6. 动态应用/非白名单目标仍有正式消费者，其远端场景文件与历史适配必须保留。禁止用移除通用 gateway 达成表面合仓。

## 1. 当前合同、消费者及定位

### 1.1 四层入口

| 层 | 源码定位 | 当前职责 |
| --- | --- | --- |
| DataView 公共入口 | packages/spark-data/src/data-view.ts:491-500 | previewSource、listSourceVersions、previewSourceVersion、createSourceVersion |
| 来源生命周期 | packages/spark-data/src/query/data-view-source.ts:38-112 | 绑定身份、同源视图集合、清洁性、异步变更及释放检查；无具体存储 |
| 语义资源 | packages/spark-project-model/src/scenario/scenario-definition-resource.ts:68-103 | history list/preview/create→Workspace；views 枚举同 metadata DataSet、同目标的所有文件定义视图 |
| 通用参数分派 | 同文件:136-156 | forQueries 按 queryContext.dataSpaceId 定位目标资源，历史与来源都转交原 resource |
| 目录设计器转接 | src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts:2680-2699 | session 元空间 executor 已透传 source.history；扩展公共 history 合同时必须同步 |
| 存储编排 | packages/spark-project-model/src/project/project-workspace.ts:361-425 | 真实编号版本列表、校验 preview、清洁活动文件创建及精确回读 |
| 存储网关 | src/lowcode/lowcode-runtime.ts:644-729 | 按 scenarioId 决定仓内或普通远端来源；当前四场景历史未接 |

DataView.sourceLifecycle 每次调用新建 DataViewSource（data-view.ts:513-516），所以 attempt 不可存在临时 DataViewSource 对象内。应由真正持有目标来源的 Workspace/resource 维护，DataView 只提供受身份守卫的读取/核验接口。

### 1.2 活动文件与三种不同的“版本”

- ScenarioViewFile 在 scenario-view-file.ts:26-67 持有活动文件、savedText、persisted、本地 revision、undo/redo；SnapshotHistory 是本地撤销，不是磁盘历史。
- scenario-view-file.ts:88-145 的 submission/status 是活动文件保存的 pending/unknown，不能拿它假扮历史快照提交。history create 不改变活动文件保存基线。
- Workspace 历史是非负安全整数 N 及 `N__pagedata.json`（project-workspace.ts:71-72、361-425）。读取必须兼容 0；当前创建从 max(0,真实版本)+1 开始。它不是 PageTool 发布 VersionId，也不是 DataSet.version 或 config.schemaVersion。
- repository host sourceRevision 是精确文本 SHA-256（repository-scenario-store.ts:182-185），不同于本地 file.revision，不应进 readScope 或导致实例销毁。

### 1.3 普通远端历史

src/lowcode/lowcode-runtime.ts:589-599 将普通目标定位到 `${applicationId}/SysForm/${scenarioId}`，验证执行应用一致。

- listVersions:693-698 使用 lowcodeApi.design.listFileVersions，文件名限定 pagedata.json。
- readVersion:699-705 验安全整数并下载 `N__pagedata.json`，UTF-8 fatal 解码且保留 BOM。
- createVersion:706-728 先列真实版本、分配 N，再读活动文本并比较，上传编号文件，最后列真实目录匹配回执。测试 lowcode-data-space-runtime.test.ts:320-379 证明既有适配器夹具使用 File/list、DownFile 与 nonreplace upload，并保留工作文件；不是当前真实服务验收。
- 四个仓内场景在上述三个入口均调用 assertBuiltinScenarioHistoryUnavailable（定义于:124-128）。应以明确仓内分支替代并删除这个失效守卫，而非允许白名单目标再次走远端。

### 1.4 当前创建快照缺口

Workspace:385-406 捕获 `{scenarioId,scope,file,text,key}`（:409-421），锁 scenarioSaves，读活动基线，调用 createVersion，校验 summary 与精确读回。finally 只清锁，没有 catch/attempt/status。

后果：上传成功但响应丢失，或上传后定义变动/scope 失效/回读失败，无法知晓本次尝试的 N。再次点击走新创建，可能产生第二快照。网关内部才分配版本，公共 create 回调只能在成功返回之后拿到 summary，太晚。

现有工具快照可借鉴语义而不能直接复用类型：src/lowcode/resources/shared/page-tool-files-command.ts:12-30 定义 onAttempt；:475-508 在 upload 前捕获实际编号，:510-522 只读列表+原文核验。该 owner 只允许三文件（:6-10、:43-48），不可把 pagedata 加入 PAGE_TOOL_FILE_NAMES 或伪造工具 pageId 复用。

### 1.5 恢复链与正确复用

- useDevState.ts:917-932 捕获 workspace、document、nodeId、请求 token 和定义 DataView。
- :935-953 通过 DataView 公共历史入口，不由 Vue 调 workspace IO。
- :955-966 恢复先拒绝 dirty，二次读相同版本、比较已展示 previewText、检查中途编辑，再 document.setText；但最后自动 saveScenarioViewText。
- saveScenarioViewText:908-914 只使用 document.dataSet.saveChanges({views:document.viewSelectors})，此链应保留。
- ScenarioDefinitionDocument.open（scenario-definition-document.ts:67-101）显式加载五类完整文件定义，读来源基线，并用主键集合拒绝缺页/筛选/来源变化；getText:140-150 是只读投影；setText/applyText:164-241 预校验完整配置及原查询权限，然后只对原 DataView 做新增/修改/删除；undo/redo:244-260 也只改草稿。
- 完整历史恢复是显式整文件业务命令，允许为它读完整五类定义，不等于普通保存可先核全依赖；不应查询目标业务行、复制数据库模型/字段或全量加载业务数据。
- 根级 schema/版本/提交策略变更被 document:170-172 拒绝。这是现有领域边界，旧快照若跨结构版本应明确诊断，不能为恢复成功而绕过 root 校验。

## 2. 真实 UI 可达性与本片必补入口

### 已有入口

`DevSystem.vue` 挂载 BlueprintWorkspace；`blueprint-workspace/BlueprintWorkspace.vue:8-15` 要有 selectedNode，数据空间 tab 要 readyWorkspaceForView；`DataPlanningPane.vue:12-15` 要已保存场景绑定且非 pending；才挂 `DevDataSetDesigner.vue`。

DevDataSetDesigner.vue:17-31 有 list/create/preview/restore，:75-78 切项目/节点/document 清本地面板、卸载取消迟到展示，:83-111 用 request 代次忽略旧响应。当前数组/preview 文本是展示态，不是活动文件真源。:27、:29 声称恢复工作文件，应改成“恢复到编辑草稿，保存后生效”。“远端历史”改为“场景历史”，避免仓内场景仍写远端。

### 当前目录入口

`src/views/features/data-platform/data-set-management/ui/data-set-list-page.vue:43-46` 在目录弹窗打开设计页，目标由同一 designId 传入；这是主控已验证的 SPA 通路。

`design/ui/data-set-design-page.vue` 已拥有原 session（工作台:14-35），并在:229、:252 挂 DataSpaceViewEditor。`design/views/DataSpaceViewEditor.vue:8-35` 仅有视图保存、取消、unknown 文件核验和采用当前远端，没有历史。session 的 `targetId` 与 `metadataDataSet` 为正式公开对象（lowcode-data-space-view-design.ts:168-170），source.history 已经绑定到这份 DataSet。

### 建议

在设计页空间工作台加“场景历史”标准按钮/对话框，绑定原 metadata DataView 的完整 dataViewKey，不在每个模型内表现整文件历史。将历史展示/创建/核验交互抽成一个窄组件，DevDataSetDesigner 和目录设计页共同消费它；共享实际 DataView/领域命令，不共享一个全局草稿或缓存。标准按钮/对话框实际 props/事件仍需由写者按 ClassModel 目录→概要→指南核验。

- list/preview/create 使用已绑定 source API，可按需打开；不用提前打开完整编辑文档。
- “恢复到草稿”时才按原 metadataDataSet/targetId 打开 ScenarioDefinitionDocument；若已加载默认视图有筛选/缺页，沿现有 completeness 检查明确拒绝或在确认无 pending/dirty 时按正式完整查询合同加载，不可偷清草稿或直接改 rows。
- 该命令先检查同源所有视图（含命名视图）有无其他编辑/unknown；不能只检查一个 document 默认视图，覆盖另一个编辑区。
- 恢复后保持当前原生 session，显示草稿变化，明确提供只保存本次文件定义 selectors 的动作；不能调用无范围 metadataDataSet.saveChanges 顺带提交数据库编辑。现有单模型保存未必提交 layout/relations/cascades，不能以它代替完整历史恢复保存。
- 保存后重新消费、目录/画布更新必须沿原 session 失效/投影刷新合同，保留 scope/generation；不得 location.reload。session 原 adoptDefinitionViews:2584-2610 是接纳当前远端的流程，只可参考刷新责任，不可拿历史文本调用 adoptSource。

本片可以因此在已有目录设计弹窗完成四场景 smoke，不必提前迁 builtin 项目树。普通项目 DevSystem 原入口回归应保留。

## 3. 最小实施方案

### 3.1 历史落盘来源

建议选择仓内独立历史目录，例如 `config/history/scenarios/<scenarioId>/<N>__pagedata.json`，只由同一 manifest resourceId 推导，不让客户端传路径。此目录是不可变历史档案；活动读取只认 manifest 中四份 `config/pages/.../pagedata.json`。

不要把历史放进 `config/pages/**`：当前 repository-scenario-resource.ts:17-20 raw glob 包含该目录全部 JSON；history 不应被活动配置加载/打包误吸纳或触发 import-glob full reload。现有 hotUpdate 仅隔离四个精确活动路径（vite-plugin-repository-scenarios.ts:24-33），不要扩大成整个 config 全局禁用 HMR。新增历史目录真实 add/create 后必须检查 Document=0；若有实际 HMR 问题只按精确登记历史模式处理。

- 开发态 list/read/create 经现有 loopback Vite 宿主，仍由 resource→workspace→gateway→host client 调用。不得 Vue fetch。
- 历史列表从实际文件目录枚举、严格解析 canonical 数字和后缀、校验 safe integer、拒绝重复/歧义。mtime 是历史展示信息，未知用 null，不伪造时间。
- build/preview 继续没有写端点。若交付构建态 list/preview，使用独立明确历史 manifest/glob，只读已打包档案；若本片仅开发历史，明确 capability 不可用且不得远端回退。选择需在本片实现合同中写清，不能把 404 当空历史。
- 仓外既有四场景历史是否需要迁入尚无当前库存证据。不得删除远端历史；需要迁档时通过既有 list/read 逐项验证版本、原文、目标身份，保存独立导入证据，运行态不再回退仓外。不要生成假历史弥补旧档案缺失。

### 3.2 版本分配与 unknown attempt

最小可行设计可沿现有 numeric 版本合同：先真实列表确定候选 N，网关在任何可能写请求之前 onAttempt 交付 `{scenarioId,resourceId,scope,version,fileName,text}`，Workspace 原 owner 冻结捕获。宿主收到显式 N，在同 resource 队列内比活动文件原文并执行独占创建，禁止覆盖或碰撞后自动换 N 重发。并发相同候选允许一个成功、另一个明确 not-applied；用户之后显式新建可重新列表。

若选择服务端独立分配 N，则必须在 POST 前已有稳定 attemptId，并能通过只读 attempt 查询恢复原 N；仅在成功响应里返回 N 不足。两种方案择一，不同时维护第二份分配真源。推荐本片优先前一种，减少持久化双文件日志和多阶段协议。

状态必须独立于活动文件 saveStatus：idle→pending→confirmed/明确未应用/unknown。捕获的是原目标、原作用域、原 file owner、原 N 和原文本，不是当前草稿/最新版本。create 失败在未 dispatch 前可普通失败；写已派发后的超时、丢响应、损坏回执、读回失败、作用域改变均保留 unknown。typed 未应用须匹配该 attempt 的具体身份。

- 再次点击创建遇 unknown 必须拒绝或转原只读核验，不得重新列版本分配并 POST。
- 只读核验读取原 N 的真实目录身份和精确文本；成功只结算快照状态，不 markSaved 活动文件、不清草稿，不发布任何工具引用。
- “列表没看到”“文件当前不存在”“读取失败”“不同文本”不能自动当原请求未执行，尤其网络中断后服务端仍可能在途；保持 unknown/冲突，绝不自动重发。
- 精确版本+文本能证明期望快照产物存在；若产品要求归因于某一网络请求，需服务端持久 attempt 证据，不能凭相同内容宣称请求归因。最小方案以产物确认表达回执。
- pending/unknown 时关闭面板不可清 attempt；同工作区重开仍能核验。切应用/scope 的旧结果不可落新 owner；释放不等于已取消服务端提交。必要的未决提示和离开守卫应通过原 owner 状态，不存凭据或无界全局记录。

### 3.3 公共 DataView 接口

现有 createSourceVersion 会在进入 adapter 前要求所有同源视图干净（data-view-source.ts:85-112）。unknown 后的新编辑仍须保留，因此只读核验不能再套这个“创建”清洁性门禁。

建议最小扩 source.history 的 readonly status/attempt 状态和 verify 能力，并通过 DataView 暴露只读核验；DataView 核实例/绑定/作用域，具体 attempt 由 Workspace/resource 管。不要把状态放每次新建的 DataViewSource。新增入口同步转接 ScenarioDefinitionResource.forQueries、设计器 executor、page-design-operation-guard STORAGE_METHODS（:24-26），防页面可通过代理取得新增原始存储能力。

核验允许当前 DataView 有后续草稿，但必须仍是原来源和作用域；新建快照仍要求全同源视图干净。UI 分开创建/核验条件，不能让当前 canVersion（要求 !pageDataDirty）把 unknown 后核验按钮也禁用。

### 3.4 宿主与并发

复用 store 当前 #withResourceQueue:167-180、#safePath:150-164、安全 UTF-8、resource 白名单及 host client SHA 校验，不另起通用文件 API。history 路径包含新建目录，必须对每级父目录和文件验证 realpath/lstat/symlink/junction，捕获 EEXIST 不能覆盖。创建快照不能使用当前活动文件 rename-replace 算法覆盖同名历史；按只追加设计。

同一资源活动保存与快照创建共享队列，创建时核对指定原活动文本，防从旧基线建快照。写入已经开始后的 IO/cleanup/回读失败保留 unknown；只有真正写入前的校验/冲突/只读拒绝可 not-applied。沿用 plugin 的 loopback listener+peer、Host、POST Origin、JSON 1MiB、禁生产端点规则。GET list/read/verify 必须只读，不能顺便创建目录或补缺文件。

### 3.5 恢复草稿

保留二次读原版本、对比已展示原文、期间编辑/目标切换拒绝，然后 document.setText 写原 DataView。删除 useDevState.ts:966 自动保存，增加 revision/消息并保持 dirty。不得 file.loadText、file.markSaved、workspace.writeText、adoptSource(historyText) 或 restore HTTP 写工作文件。用户显式保存再走 DataSet selectors 及原字段权限、变更校验和真实回读；取消/undo 不触发 HTTP 写。

## 4. 五项既有 dev history 失败：证据与处理

证据：notes/evidence/remaining-catalog-consumers-20261028/baseline-dev-history-ready.txt:11115-11196（3e182b62d 基线 13 pass/5 fail）；outcome.md:27-29 记录本工作树同组失败。此次未重跑，不称新鲜验证。

1. reports confirmed tool files and unknown definitions...：基线:11115-11130，等待 scenario 写始终未发生。
2. lets undispatched scene draft save... 与 cancel... 两项：:11134-11143，期望工具 httpPut 1 次实际 0。
3. previews actual scene snapshot...：:11147-11162，preview 按钮未出现。
4. discards late scene history...：:11166-11189，history-close 不存在。

前三项根因源码证据：test 当前:129 createPageToolFilesIo.read 恒 null、list 恒 []、upload 空函数，但正式 useDevState.savePageToolFile:360-366 已走 PageToolFilesDataView；command:151-167 在真实 DataView refresh 读文件基线，因此报 PAGE_TOOL_FILE_SAVE_MISSING，尚未到测试捕获的旧 pageFiles.saveFileContent/httpPut。应修夹具接正式 IO，保留原“工具 unknown 不吞场景草稿”语义，不更改产品来迎合旧 mock。

后两项测试当前:351-352、371-372 只 stub ElButton，页面实际 RendererButton；证据:11170-11175 为 renderer-button-stub，DOM trigger 未触发原组件 click 路径。修为 RendererButton 可发正确事件的窄 stub，或 mount 真实标准组件；不要删断言。恢复测试:357-358 还期待自动写工作文件，应随本片目标改为“恢复只 dirty/0 写，明确保存后 1 写”。

这五项不能充作本片新功能的有效 RED。先修测试通路，使旧行为被真实执行；再记录新目标与基线不符的 RED。无需把工具 unknown 全流程塞到每个仓内历史测试里。

## 5. 有效 RED 与验收矩阵

### 必须能在本片实现前失败的行为

- 四个登记场景 list/preview 真实来自仓内 host 存储（含 version 0、时间未知、BOM），无任何 /api/File 回退；普通目标继续远端。
- 新建成功响应丢弃：固定原 N 已捕获，第二次操作只 GET/list/read，POST 计数保持 1，活动文件及后续 DataView 草稿不变。
- upload 成功后快照读回故障、回执错目标/错 N/错内容/损坏 JSON→unknown；重开面板核验同 attempt；不同 N 的相同文本不能代替原 N。
- 同源其他命名视图 dirty/mutating/加载中拒绝新快照；unknown 核验允许原来源的新草稿并保留它。源切换/销毁/过期列表和 preview 不能发布到新页面。
- 两个客户端同候选 N 并发：恰好一个创建，另一个 typed not-applied，无历史覆盖、无自动重分配；活动保存并发按同资源队列与原文比较。
- 历史恢复已预览后快照改变/目标错/中途编辑拒绝；合法恢复修改原定义 DataView、工作磁盘 0 写，undo/取消仍 0 写，明确保存后真实回读与重开一致。
- 同一真实目录设计对话框可打开四场景历史，DevSystem 复用入口；0 模型目标或缺文件明确状态，未加载区域不被当删除。
- host 路径注入、非白名单、符号链接/junction、非法 N、非 loopback/Host/Origin/ContentType/超大请求、生产 readonly，GET 不创建任何文件。
- Vite 真实 import-glob 环境创建历史后 Document=0；普通导航/源码仍正常 HMR。不要以源码文本断言或 mock HMR 替代。

### 必要回归

- packages/spark-data/src/tests/crud/query-source.test.ts（已有 history:199-247、unsupported:324-326）；
- packages/spark-project-model/tests/scenario/scenario-view-file.test.ts（Workspace 历史:1395-1434，保留活动文件 unknown 回归）；
- tests/runtime/auth-nav/data-space/view-design/scenario-definition-resource.test.ts（history:300-319、source/identity/保存）；
- tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts（普通目标:320-379、四场景现拒绝:408 起需改成正式分派行为）；
- tests/runtime/auth-nav/repository-scenarios 下 store/host-client/middleware/resource/initial-read；
- tests/app/dev/use-dev-state-page-data-history.test.ts，修明上述五项夹具；
- 目录设计对话框及 DataSpaceViewEditor/新共享历史面板的实际消费者交互；
- page-design-operation-guard 相关代理禁止 raw IO 回归；
- 正式 ClassModel 生成、公开面 typecheck、影响源码 ESLint、verify:rules/build，按本仓成组门禁。新增公开声明后必须正式生成，不手改产物。

### 真实 SPA 验收

在 5273 当前目录→设计对话框选择明确四场景之一，经标准入口列表/创建/预览；记录精确场景/N/文本。用真实响应丢失模拟令创建进入 unknown，再原入口只读核验，证明只一次写、无 Document、无刷新。恢复某历史到草稿，磁盘不变，取消/undo 验证；再次恢复并显式保存，关设计器重开及下游消费同值。切换另一场景不带旧 preview/attempt；历史追加是正式持久产物，烟测清理范围事先确定，不能随意删除用户历史。工作文件烟测改变用原 DataView 恢复；不能靠文件系统回滚冒充业务验收。

## 6. 删除/保留清单

删除或替代：
- assertBuiltinScenarioHistoryUnavailable 及三调用点；替换成四白名单明确本地分支。
- 恢复自动 save（useDevState.ts:966）及宣称立即改工作文件的 UI 文案/测试期望。
- 如共享面板落地，删除 DevDataSetDesigner 中重复历史 list/preview/request/错误逻辑，保留必要宿主身份捕获；不要留转导包装或第二保存链。
- 旧测试的 ElButton 针对性 stub 与 createPageToolFilesIo 空实现；用正式消费者夹具替代。
- 新公共核验 API 增加后，纠正相关公开指南/派生产物与代理黑名单，不能仅实现方法不清过时合同。

必须保留：
- 非登记场景的 scenarioViewPath 与正式 lowcode 文件适配；远端历史是该目标的真实历史，不是 builtin 活动配置回退。
- 现有活动文件 savedText/revision/submission、DataView source adopt（接纳当前来源）、ScenarioDefinitionDocument、DataSet 保存回执与权限。
- 工具三文件历史/发布引用独立领域合同，不能把场景 N 混入工具 VersionId。
- 只读参考布局 SysForm/<id>.json 现存消费者，不能因场景历史迁入顺手删除。
- 原始基线失败证据；修复夹具不改写旧证据、不给失败重新命名成历史全绿。

## 7. 尚需写者/主控核定的窄事项

- 最终历史目录名及构建态是否提供打包只读历史（上文给出两种明确边界，不默认为已有能力）。
- 四场景旧远端历史迁档库存；本轮只读源码未访问正式服务，未核数据量/内容。
- 共享历史面板实际标准组件与完整 DataViewKey：写者必须正式查询 ClassModel，不按本报告猜属性。
- 目录恢复后的五类定义 UI 刷新责任与完整默认视图配置：复用原 session，并针对 loaded/default/named view 有效性写行为反例，避免只恢复到一个不可见 DataView。

本报告是实现建议与源码证据，不是已交付历史能力或真实 SPA 验收结论。
