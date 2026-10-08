# 当前最小闭环交接锚点

更新：2026-10-08 04:51。仅为过程记录，产品事实回源码/实际回执确认。

## 当前授权与路线

- 用户持续授权：gpt-6-luna实施，主控派工/验收；当前底座、四文件、数据权限无角色、先完整M0样板再推广、线上admin、保留当前AI。唯一主路线 notes/plan-appworks-four-file-integration.md，M0尚未整页完成。
- 分支feat/agent-workflow-node-contract、HEAD0b6c85d，混合dirty。不可commit/push/建分支/广泛回退；用各slice preimage。参考固定E:/r/sparkproject@842dec4，不能把dirty参考文件当定版。
- 当前唯一生产/测试写入者 `/root/implement_layout_read`，低阶模型；执行已approved的 notes/plan-data-space-design-canvas-preview.md，8精确文件、只读图。刚派工未交付。preimage graph-preview-before/，报告pilot-graph-preview-result.md。
- `/root/implement_design_read`已冻结，其设计读取页04:25本地+线上签收，完成子计划已删除。
- `/root/preflight_catalog_binding`只读预研D2下一编辑/保存入口（当前API+固定参考模型/字段/关系/参数/布局），仅追加pilot-design-preflight.md，不写生产/测试；结果未回报。

## 本轮已签收

- 隐藏表格原值泄漏：ElementPlus全Comment slot回退row[prop]；FCR隐藏分支改空span。2文件，真实RED->GREEN，实施者118项，主控39项、typecheck/lint/门禁通过；pilot-hidden-cell-result.md、pilot-hidden-cell-root-tests.log。plan已删除。正式权限owner未变。
- 读取页8文件：主控86项，线上后按钮props.label及Name/AsName分列修正，再独立21项。最终typecheck/精确lint/pages-config、ai-codegen985/dirs/diff-check通过；pilot-design-read-page-result.md已accepted-read-slice。
- 设计21项含真实SparkPageRenderer+ElementPlus普通h/m无原值、第二模型dataSetId h/m停止后续请求、跨页501、目标刷新/abort/返回路径/损坏图/参数/关联等。测试页tabs是替身，真实tabs身份此前单独26项已验；在线真实四tab通过。
- 线上6模型/218字段/0关系、无输入参数、布局6节点0边graphVersion1。刷新/返回原query/重进成功；重加载恰好5 GetData+1布局读、零业务写与错误；复制API19行、查询绑定完整1路径仍正常。pilot-design-read-online.json/png，图片已在commentary嵌入。
- 源rule紧凑文本与保存回读不等首次误报：PageRuleFile以正式树序列化，补确定性缺省id/空children。PageTool.getFileText与13156旧/13558修正后回读完全一致，不改owner、不替换显式id。记录pilot-deploy-design-read.json（首次停止）/resume.json/UI修正pilot-deploy-design-read-ui.json。后续rule必须比正式提交文本。
- 之前布局读取/纯渲染hook/tabs身份均已签收，报告分别pilot-layout-read-result.md、pilot-render-hook-refresh-result.md、pilot-tabs-node-identity-result.md；不要重新开已删子计划。

## 画布当前合同

- 根src/views自动扫描按需注册data-space-design-graph；不新依赖、不修改公共注册器、不整页业务Vue包装。8文件包括新增graph/vue+props、3工具、graph test、read test、既有scanner test。
- 源LogicFlow中心坐标232×120，VueFlow左上需转换。原ID/pointsList保留；坏路径显式拒绝，无路径才显示路由；原布局绝不写。正式MetaName/description按fieldAccess visible/h/m投影，布局旧label/properties不得绕过。组件不接raw row/layout。
- 当前真实VueFlow dist 7973–8044：setup useVueFlow(storeId)创建store后自动scope dispose，不能额外onUnmounted重复$destroy。用组件实例uid区分同rule/page重复实例，不能只用模型或Spark node id。
- 只读无需dirty；后续编辑前PageRuntime实例owner必须补，当前仅DataView dirty。无现成beforeunload，不能宣称保护浏览器硬刷新。

## 线上与浏览器

- project D99A1DCE9894698799101EFD70F8FC76，tenant NewApp；8D设计8D1AB14DD8277F3E7017CD38F77B09FD，90A目录90A82E287930A234FEC3E687C94A93EA，7AB蓝图7AB874097A1E8711A42FD845939A6E05。正式菜单仍native，M0完整后才切。
- IAB2/tab9，cua_repl句柄copyPilotTab/copyPilotCdp/copyFs；新上下文先cua.rewriteDocumentation。当前设计工具模型tab，URL含主8D/附90A/dataSpaceId90A/returnTo原目录(主90A附8D与7AB)，04:25已markHandoff。
- 画布部署前基线已fresh-read：pilot-graph-preview-remote-before.json assets三工具；REPL graphRemoteBefore.result.value。长度rule13558/script19349/style686。源本地rule/script最终hash1814E8DE...80DCCB8 / BE74BFAA...978AA25；读取测试715AF1AC...527177F。
- 未来部署用createLowcodeProjectGateways(projectId) + ProjectWorkspace.selectPage(8D)，page.setFileText、getFileText取实际提交文本、savePageFile，fresh-read核实；对照基线防并发，先script/style再rule。只上传工具配置，不写SysForm业务布局。
- `createFiles`网关缺失；已存在工具用selectPage正常。首次缺三文件时setActivePage创建owner的创建语义已真实成功，不需要再试。
- `designExpected` REPL是UI修正前旧值，不可用于新部署；graphRemoteBefore才最新。CDP result envelope须取.result.value；readEvents参数afterSequence；只保留必要URL/方法/查询字段，不打印auth。
- 回目录筛选90A若旧1-1已显示，要等查询按钮恢复/实际请求完成再选行。曾在查询完前选行被新结果清掉，重选后动作正确；不能误称页面故障。
- 待用户确认的不可逆删除试验记录97DCB03F75AADEAE6B102B062DB71CEA仍不得删除，不阻断其他工作。

## 完成口径

- 当前只完成读取切片，D2画布/编辑/提交/旧数据往返与正式入口仍待；全量29领域路线仍implementing。历史192文件2281不是当前全量结果。
- 主控每slice重读diff/独立精准测试/实际UI，再更新master、validation、metrics并删完成子plan。知识候选留报告，不自动写knowledge或外部memory。


## 04:51主控续接（优先于上文历史阶段）

- 只读图已accepted-preview-slice，完成plan-data-space-design-canvas-preview.md已删除。最终8文件SHA详见pilot-graph-preview-result.md；Vue最终0E895972501B5169AACF03DF3805CA2425A573A6E22B74BC2A432AD8B6CCFD38，style540D47B54F54AEC20083D711A4EEEAE57BCCC2BAA6B062870611BC455699631D。rule/script仍C47A...与08F8...。
- 主控最终26项日志pilot-graph-preview-final-root-tests.log，真实browser最终pilot-graph-preview-online.json/png。首次GetData502重试成功；三轮真实RED是height0、隐藏pane fit提前终止、computed DOM guard短路掉reactive依赖。组件关闭fitViewOnInit，在实际非零dimensions/viewportReady/nodeMeasurements/DOM可测量后fit一次。图pane480/flow478，六节点全在视口scale0.626076；用户pan/zoom到1.24799切回保持；整页重开仍fit；交互0 API，最终无错误响应或console error，SysForm7911字符前后完全相同。已嵌入截图。
- 三工具用ProjectWorkspace.savePageFile精确上传并回读，日志pilot-deploy-graph-preview.json；后续高度只更style，日志pilot-deploy-graph-preview-height.json。graphPreviewExpected旧读取页基线已过时；不要重用旧值进行写入。当前浏览器设计图tab，IAB2/tab9/copyPilotTab/copyPilotCdp/copyFs仍用；新上下文先rewriteDocumentation。
- 唯一生产/测试writer `/root/implement_layout_read` 现在执行 notes/plan-page-runtime-renderer-ownership.md（implementing）。5精确文件：SparkPageRenderer.vue、runtime/page/spark-page-renderer-binding.test.ts、runtime/page/runtime/page-runtime-tabs.test.ts、app/dev/dev-preview-tab-loop.test.ts、spark-component/API.md。preimages runtime-ownership-before/；report pilot-runtime-ownership-result.md尚未交付。已报真实DataView.updateEditingValue卸载RED destroyed=true；最小release去dispose后的GREEN在做。主控不与其并行改代码。
- 生命周期已源审：runtime只由pool与DevPreviewTab两类生产创建，均显式dispose，不需ownership flag。renderer只borrow并释放自身controller/subscriptions/registry，外部owner终结；原boundhook必须因controller abort继续STALE。原测试三处假定renderer销毁应改为真实测试owner显式dispose并保留正确销毁断言。新测试证明真DataView dirty而非spy。若remount init覆盖dirty即停回报，不扩大owner改动。DataSet.triggerAutoLoad只对default.autoLoad且Idle发，DataView拒覆盖dirty；当前design命名view autoLoad:false。
- readonly `/root/preflight_catalog_binding` 冻结：完整owner审计在pilot-design-preflight.md末尾；旧report前段错误建议有后段更正，不盲从历史。
- readonly `/root/implement_design_read` 只写draft notes/plan-data-space-field-description-edit.md（未交付）：下一个独立正式字段description编辑候选。inventory在pilot-design-edit-inventory.md，最新77D52437...D49E42。其初荐模型Name重命名被主控否决并反向追踪证实有真实引用：runtime.query Name===metaName、child.PId=parent.Name、关系table label/预览/按名称查找；固定源没有联动，不得当安全单字段编辑。description有实际源入口，身份字段不变，但需原query action/write权限、preimage/精确回读/未知回执不重试。
- 字段description线上需专用试验空间的字段；目录已建的97DC...记录可能无模型/字段，不能为了验证随意改平台90A元数据。fixture建立方式尚未审定，先draft并核正式源/owner，不编IDs或角色；可先完成其他明确依赖，不冒充online通过。
- master/validation/metrics已更新到04:49；M0仍未整页，model/field/relation/params/source sync/layout edit/save/formalnavigation未完成。未来图草稿必须持实际内容在PageRuntime，单dirty bit或组件卸载清理不可接受；当前ownership切片不新增draft API。

## 05:05主控续接（优先于历史阶段）

- renderer ownership已accepted-ownership-slice；主控逐文件前像审查、独立64项通过，发现tab测试编辑发生于切回之后，返工为先编辑后切走/经过native与12calls再返回，最终独立1项通过。真实浏览器目录返回/重进/关系图6节点通过，pilot-runtime-ownership-online.json/png；截图已展示。仅只读线上，不冒充线上dirty测试。完成plan-page-runtime-renderer-ownership.md已删除，master/validation/metrics更新05:00。原renderer取消dispose单行生产改动，其余测试/API。最终tab SHA1C525D233FF4176704313CFBB8C4E4528AF2F9503C92441286C20D23E15A7393。
- 当前无生产/测试writer，三个低阶agent仅写各自draft。/root/preflight_catalog_binding修订plan-page-runtime-content-drafts.md：第一稿把8D/layout域塞project-model、并写host/权限太宽，主控退回仅通用文本内容runtime owner+guarded script窄方法+精确测试/API；实际baseline/current+保存ticket，不能dirty bit map。布局写host另切片；参数直接DataView editing overlay，不造第二owner。ScriptContext.$page强类型fixture反向影响须精确列入。
- /root/implement_design_read修订plan-data-space-input-parameters-edit.md：原稿选框架JsonArrayEditor全局注册，主控收敛与graph同样应用自动扫描窄组件src/views/app/control/data-platform/data-space/design/parameters/DataSpaceParametersEditor.vue及props；仅参数数组控件/32hex WebCrypto rowid，rule/dialog/actions+script权限/save。未知属性默认保留。需核事件真实到script；草稿用真DataView.updateEditingValue，cancel discardEditingRows。尚未批准生产写。
- /root/implement_layout_read只读产出plan-data-view-discard-pending-changes.md：当前unknownsave后dirty无法refresh/close，不能写“离开重开”假恢复。discardEditingRows只清overlay，dirtyTracking.clearDirty只清flag不恢复rows；私有queryResult拥有强baseline，不能用WeakRef snapshot恢复。拟提供明确用户弃本地pending后恢复原查询baseline再fresh query；不是server rollback、不重试反写。精确ids/[]、create/edit/delete/overlay、mutating、staleowner、current/selection、事件须验证。新计划未到。
- 已在线只读确认专用验收空间97DC...CEA models=[]，pilot-design-test-space-probe.json。可用于inputParams；无field fixture故fielddescription候选仍draft不实施，不修改平台90A元数据凑验收。删除该记录仍等特定确认，不得删。
- 浏览器IAB2/tab9仍copyPilotTab/copyPilotCdp/copyFs；已rewriteDocumentation；当前设计关系图（主8D附90A目标90A），数据6nodes。ownershipOnline变量为刚保留的只读回归证据。后续三文件部署必须fresh baseline，所有旧Expected变量均不可靠。

## 05:24主控续接（优先于以上历史）

- discardPendingChanges已accepted-discard-slice；主控独立root21+lowcode-api95=116项通过。最终DataView SHA ECBC0E3B9D5D0D7D0FCD8AA523151C1BDA7062EEEF61545DE26064FE3628677E，runtime test CD58A056C518684C8B3DA7EB481340CAA12F74846D8F8ED2B663431DDDCF0473；见pilot-pending-discard-result.md和两份root-tests日志。root发现并返修树cache不同步、pendingdelete/current同ID重现、取消新增后孤立overlay；全目标先校验后清，单趟baseline分组恢复，0HTTP。完成plan-data-view-discard-pending-changes.md删除，master读取checkbox勾选，validation/metrics更新05:21。
- 唯一生产writer /root/implement_design_read 已派执行plan-data-space-input-parameters-edit.md（implementing）。7文件，preimages parameters-edit-before/，报告pilot-parameters-edit-result.md尚未到。agent预检typecheck通过将留log，当前先参数组件RED/GREEN及真实overlay链；root不并行改source/tests。计划前部过时draft授权/直接editRowById文案已主控纠正：草稿updateEditingValue、DataSet.saveChanges默认一次apply，不自行双apply；remount/unknown恢复完整要求见计划。
- 线上IAB2/tab9/copyPilotTab/copyPilotCdp/copyFs已恢复docs。当前切到目标97DCB03F75AADEAE6B102B062DB71CEA的8D设计页，真实UI显示无输入参数、布局明确不存在；pilot-parameters-ui-before.json。其参数正式preflight原值null/readvisible/writeallowed/actionenabled；线上写前再读。未写参数，未删空间。先前90A页面因HMR等一次显示读取错误，显式重新加载后正常，不据此改正确源码。
- /root/implement_layout_read现在仅只读模型新增预研，追加pilot-design-edit-inventory.md：为后续字段验收建立真正源支持的模型/来源，不改90A元数据、不伪造IDs、不做HTTP写；产物未到。
- /root/preflight_catalog_binding已完成contentdraft建议并冻结。plan-page-runtime-content-drafts.md仍draft：owner必须持实际flight并独立于renderer abort settle；unknown即使current==baseline仍dirty，freshread只能flight后显式协调。当前缺精确files/图consumer/包命令/数据权限与无布局独立确认，root已追加裁决；不得实施。字段description旧draft含无discard/离开重开等已失效描述，只作旧候选，不能直接执行。
- root查在线原值恢复可使用现有正式runtime：packages/spark-app/src/navigation/nav-access.ts导出getDynamicRouter，DynamicRouter公开getPageRuntime/getPageRuntimeById；不要造第二DataSet/saveowner。需从实际当前route或tabs取得instanceId；useTabPages返回tabs需核余下源码。在线配置部署仍ProjectWorkspace，freshremote preimage后保存getFileText正式序列化结果。所有旧REPL Expected值过期。

### 05:30补充：模型来源真实边界
- 在线只读pilot-design-source-models-probe.json：8D有16正式模型，View_TblList=p004、Base_TblField=p010。source-bindings-probe证明Base_TblField可装配、View_TblList报正式主键无法映射。source-key-probe证后者PrimaryKeyFields=null、48fields无IsPKey=1、rowid输出但非主键、tblname重复输出。
- source-query-probe证直接固定8D runtime.query View_TblList的Base_DataSet候选total1但无rowKey、五字段访问全invisible。所以低阶只读picker建议尚不可在线执行，root追加反证；不得raw rows/role/admin/hardcodePK绕过，不改8D元数据。未写任何来源/模型，参数闭环不受影响。
- 参数四文件远端部署前基线已保存pilot-parameters-remote-before.json，REPL parameterRemoteBefore.result.value：script21264/rule14521/style754/pagedata2194。实际写前还要逐项对比fresh remote。
- 现存页面runtime已通过getDynamicRouter公开API找到，pilot-parameters-runtime-owner-before.json：唯一8D实例e06b6aa0-5899-451e-8664-03855a98f065，target97DC，isDirty false，inputParams visible/allowed。只读探针用getPageRuntimeNames中的PageCall_UUID下划线替回短横线再getPageRuntimeById（由源码已核）；不要新建第二owner。此实例ID随重开变，不盲用。

## 2026-10-08 05:40 主控续点

- 输入参数 writer 仍为 implement_design_read，正式 DataSet 单行保存/回读测试已 GREEN；unknown-save 恢复用例失败正精确诊断。当前测试点击恢复入口但尚未点击真实 showConfirm 的消息框确认，已派回先验证此假设，不修改已验 DataView。
- 新真实 wire 证据 pilot-design-source-wire-contract.json：View_TblList primaryKeyField=null、原行有 d/e/h/m、无 system key。无主键只读消费不能靠猜 rowid 或改模型定义。
- implement_layout_read 已交付 draft notes/plan-data-space-query-row-read-access.md，主控修正包级测试命令并追加原行身份/缺省权限/快照隔离验收。范围精确 3 文件，排队等待参数闭环结束，当前禁止第二生产 writer。
- layout content-draft 计划仍未批准；后续 review 必须覆盖 owner flight settle 时新 renderer 的状态订阅/刷新通知，不能仅更新 owner 快照导致挂载 UI 一直 pending。

## 2026-10-08 05:50 当前复核

- 参数执行仍限7文件。unknown恢复真实ElMessageBox确认后GREEN；取消覆盖在收口。首字生成ID丢焦点已RED/GREEN，后发现key碰撞并改为简化受控行策略；legacy删前项导致无ID项错配已修。主控指出只读parse不能继承编辑的严格校验，正在按preimage恢复只读兼容。
- 已验PageRuntime overlay remount保留，保存flight使用真实DataView.mutating。曾新增Render同步写recovery，主控退回后改纯派生投影；最终还需独立审查。
- 下一源行只读权限依赖draft已审，未开工。新的数据库表模型创建draft已落：notes/plan-data-space-table-model-create.md；真实来源wire DataType先校权限再规范到DTO，不能查询DataTypeName或默认varchar绕过。跨remount两阶段状态目前是设计未决项，尚未批准。
- 只读新增授权证据：pilot-model-create-owner-preflight.json，97DC三个真实view均0行且addAction enabled，未执行新增。

## 2026-10-08 06:09 在线参数回读修订

- 参数仍未签收。主控独立42测试后追加scanner最终2项通过；CSS容器宽度修复后实际弹窗不再越界。首次cancel草稿0POST/null/clean，见pilot-parameters-cancel-online.json。
- 05:59两工具script/rule通过ProjectWorkspace部署且精确回读，style/pagedata未改。首次真实UI保存Name/Description/IsBusParam成功，唯一Changed回执200；随后view.refresh按静态config发Filter:null，返回500/1185行，页面拒绝失去目标。证据pilot-parameters-save-readback-red.json。原脚本save回读假设错误，当前线上代码尚待修。
- 主控没有重复提交；点击既有重新加载精确读回成功值，再用该现有DataSet/参数view将inputParams恢复精确null，显式带rowid目标loadFromServer读回；保存savedCount1/failed0/clean。整页重开新runtime仍null，证据pilot-parameters-first-restore.json与first-restore-reopen.json。当前无待恢复业务值。
- implement_design_read唯一writer正在按参数plan06:08补充修script明确目标回读、恢复不先无过滤refresh、真实fixture多记录/严格filter断言；同组件移除ElCheckbox外层label。勿部署直到根验收。只改既有7文件，不能改DataView.refresh语义。
- IAB2/tab9 handles仍copyPilotTab/copyPilotCdp/copyFs，parameterRuntimeLookup公共API字符串可找当前唯一目标owner；新实例id4b546332-faad-4d94-8e45-c35ec0e098ad随重开变化。parameterDraft记录第一次expected历史，不能复用作新写基线。线上新部署script前必须fresh读取比对parameterDeployResult的旧实际文本。
- layout_read仅修model-create draft：refresh不得重放一次性filter，禁止同source tuple重复新增会误伤合法alias需源审；按本次正式生成rowid/DataView/receipt识别操作。仍不准第二writer，row-read依赖排队。

## 2026-10-08 06:23 环境恢复与关闭竞态

- 06:14脚本ABC904D9BF157E258FBFA9C8B28D4D7DD02AFF6FC6E50F9200B2E866F6BBC084通过根独立43测试（pilot-parameters-final-root-tests.log），仅script45316字符部署精确回读（pilot-deploy-parameters-readback-fix.json）。真实保存一写一查，目标精确回读且clean；但dialog.close与Loading期间onClose→busy→open疑似竞态，最后空壳dialog保持显示（pilot-parameters-dialog-close-red.png），仍未签收。
- 本次保存参数ID941D71D3D9D5061FB544AF0939279C05/Name四文件参数验收/Description保存重开后恢复原值/IsBusParam true。06:23已在新授权会话重开验证值一致，再同一正式DataSet恢复null并精确条件回读，saved1/failed0/clean。证据pilot-parameters-second-restore.json。无待恢复业务值。
- 续接时旧agents/浏览器tabs/本地dev服务均已消失。已核5273无监听后重启pnpm dev --host127.0.0.1 --port5273 --strictPort，exec session97681。当前IAB2/tab2，已markHandoff；旧tab1为connectionrefused错误页未再使用。REPL重置后新copyPilotTab/copyPilotCdp/copyFs/parameterRuntimeLookup已恢复，旧parameterDeploy/Expected变量不存在。
- DPAPI文件存在但当前Import-Clixml运行失败，仅记录错误类型不输出凭据；使用用户本轮明确提供的账号登录，须真实选中企业下拉中的领码科技记录（预填标签直接提交报企业不存在），随后admin登录成功。不得保存明文密码。
- 新唯一writer /root/implement_parameter_close，gpt-6-luna medium，fork none。执行参数plan06:19补充；诊断异步close与readback Loading竞态，真实延迟fixture RED/GREEN，限原7文件，不改RendererDialog/DataView。恢复目前已完成，可正常HMR。尚未返回结果。
- model-create draft由旧layout_read补全并冻结，SHA143CCA7181ED85A205AFCD079978216E7C12C1AC71F8CB785780B455F0410704：explicit target loadFromServer、允许同源不同Name、两阶段用正式rowid/receipt识别；完整重启不保证exactly-once/不自动重放，但不阻止合法显式新建。传播范围新增catalog PageContext fixture、packages/spark-component/src/tests/runtime/createSandbox.test.ts、page-script-lifetime及API.md，命令须包级执行component测试。row-read 3文件draft仍排队。
