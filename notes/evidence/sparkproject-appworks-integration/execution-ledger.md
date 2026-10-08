# 执行账本 — notes/plan-appworks-control-plane-integration.md

用户授权低阶模型实施、主控派工与验收，并按长期利益处理问题。当前使用已有开发分支，不新建分支或提交。

## 派工与成本约束

- 实现模型：gpt-6-luna，单个精确闭环；主控承担设计判断、规格审查、代码审查及验收。
- 仅传持久化任务切片，不传聊天历史。一次只有一个实现代理写代码，不另起重复审查代理。
- 执行者跑最小验证和范围内门禁，主控复核输出并补跨界验证；没有新变化或疑点时不重复全套测试。
- 常规修复交回原执行者；同类失败连续两次先由主控诊断，必要时才升级模型，避免低成本模型长循环反而更贵。
- 不为通过而降低门禁或加临时兼容层。已确认架构边界内的实现选择由主控决断并留证；改变后端/存量地址/AI 范围仍先修订计划。

## 实施前关联检查

| 检查 | 结论 |
| --- | --- |
| C1a 自身 | 三文件范围覆盖异步装配、可见错误与测试；新增组件已在审核方案中 |
| C1a → C1b | 前者输出组件映射，后者处理另一路静态扫描；不能以 C1a 通过替代首屏按需加载总验收 |
| C1a → C2 | 包装组件复用 source，业务调用身份由 C2 处理；不得将 source 缓存当业务实例缓存 |
| 主计划与流程 | 用户本轮为开工授权，已先 approved 再 implementing；后续任务须收敛文件后才派工 |

## C1a

- 基线：0b6c85d；tracked 干净；typecheck-before 日志见 c1a/。
- 状态：主控已验收；精确 brief 为 c1a/dispatch.md。
- 验收责任：主控，未验收前不得标 complete。

### C1a 发现与决定

- 初版行为测试 4 项通过后，主控浏览器在首页复现 Vue Router 的 defineAsyncComponent 路由警告。
- 决定：同一三文件范围内，将异步页面置于同步路由宿主内部；按 source 共享模块加载状态，保留独立实例与错误 UI，并增加真实 RouterView 导航测试。理由：维持 Component 映射合同和路由生命周期，不屏蔽警告、不扩大 DynamicRouter 公共 API。代价是每页一层轻量宿主，需实测 attrs、缓存和独立状态；若验证显示影响身份生命周期，再回到接口方案而非压制问题。
- 初版 VTU 直接挂载异步根的测试探针失败已由执行者改为宿主探针收敛，最终仍须在真实路由下验收。

### C1a 验收结果

- 主控逐文件复核实际 diff、RED/GREEN 与门禁输出；5 项行为测试、36 项路由回归、typecheck、定向 lint、ai-codegen、dirs 均通过。
- 浏览器重新加载首页、选择已授权企业并登录、应用列表、进入元数据管理的 DBMS 服务器概览均通过；未再出现 defineAsyncComponent 路由警告。27 条既有 system-page 未映射警告仍存在，属后续集成，未当成通过。
- 日志、浏览器摘要和截图位于 c1a/。没有新增业务写入。源代码没有 beforeRoute* 选项守卫，现有系统页缓存不按组件名 include，因此同步宿主未破坏该现有消费；跨节点调用隔离仍归 C2。

## C1b

- 状态：已由主控验收；完整约束见 c1b/dispatch.md。C1b 与补充 C1c/C1d 联合完成生产按需加载验收。
- 主控已经完整读取插件、scan-config、vite 配置及直接消费面；保留显式同步优先、目录边界、排除与原名称/大小规则。
- 主控负责组合 build 与冷启动网络验收。构建中 CodeMirror 的其他静态消费不在本轮改动范围。

### C1b–C1d 联合验收

- C1b 根回归原始日志：187 个文件 / 2118 项测试通过。C1b 执行者早期定向输出仅为重建摘要，已明确标识，未冒充原始日志。
- C1c 真实产物显示手工页面 chunk 将共享启动依赖带回入口；删除两组页面分块后目标页面保持独立，所有 core/vendor 分组不变。
- C1d 有效 RED 复现两个 getter namespace 默认导出失败；修正可信包边界属性访问。无效测试入口和 Vitest mock Proxy 的过程错误保留，未改通用 guards。
- 主控最终 `pnpm run build` exit 0；spark-app 包 12 文件 / 80 项测试通过；本轮 typecheck、定向 lint、971 文件 ai-codegen、目录门禁均通过。
- 生产 preview 5274 禁缓存冷启动共 19 个 script 请求，无 Settings/Dashboard/CapabilityDemo/DBMS/WorkflowDesigns 及 editor/jsoneditor chunk；首页无 warn/error。登录并进入元数据管理后仅增量加载 DBMS chunk，页面显示 4 个连接，0 error。27 条原有未映射 system-page 警告仍待后续领域补齐。
- 完整证据与截图见 c1d/browser-acceptance.json、dbms-production.png、build.log、spark-app-tests.log。没有业务写入，不能替代后续 CRUD/权限回读验收。

## C2p1

- 状态：主控已验收两文件闭环。路由刷新先隔离迟到结果，之后再接节点身份。
- 不采纳只读报告的预加载全部候选组件建议，会抵消 C1；只等待导航数据，组件保持惰性。
- 路由代次不等同完整身份隔离；session/application 读取代次与正式目标应用分别处理，后续单独闭环。

### C2p1 验收结果

- 主控审查指出旧失败测试 route name 拼写和过期主导航仍发平台请求；均在同一闭环修正并验证。
- 主控进一步要求真实 malformed-regex 路由验证同步 addRoute 失败；执行者先获得有效 RED，再用受管平铺路由快照恢复完整旧状态，refresh 随后执行 preAuth fallback。非碰撞的外部静态路由、原组件/props/meta 及 cfg runtime 合同保留。
- 最终目标26/26，根 auth-nav14文件/120项，包fallback3/3；typecheck、定向lint、ai-codegen971、dirs 通过。主控 `pnpm run build` exit0。
- 生产深链 reload→目录→进入元数据管理通过，4连接、0error。54条告警仅为两轮导航各27条原有未映射系统页，无新增类别。证据 c2p1/browser-acceptance.json、dbms-after-refresh.png。

## C2p2

- 状态：主控已验收两文件；证据和哈希见 c2p2/。
- 核对读取期间身份和应用根的代次，保留业务目标与执行应用分离；不能绕过底层 scope-required，不能返回空导航掩盖失效。
- 复用 readRequestScope().token 并核对 navigationRootId，在外层 await 恢复后和错误出口直接检查。主控指出 async helper 留有微任务间隙；新增 deferred/queueMicrotask 反例，移除外层检查时两例真实失败，恢复后20项通过；测试不依赖getter内部调用次数。
- 最终typecheck、两文件lint、auth-nav132、ai-codegen971、dirs通过。主控根测试187文件/2143项通过，覆盖本轮C1–C2p2当前源；不以C1b较早2118项代替。
- 开发5273 DBMS深链重载显示4连接、0error，27既有未映射警告无新增类别。当前切片不单独重复production build，待C2a组合；C2p1已有production验收。

## C2a

- 状态：主控已收敛12文件精确dispatch，派原低阶模型依次做system host解析、菜单、projection/home闭环。一次写代理，不并行推进其他领域。
- 单一公开保留键常量有根宿主与包内实际消费者；不引入第二套授权、预加载、业务场景推断或cfg实例伪装。身份失败可见且零业务mount。
- 主控验收保留旧URL/query/hash、候选表与路由rollback同步、旧回归；标签/原生编辑缓存隔离仍待C2c，不在本轮提前宣称。

### C2a 主控验收

- 状态：13 文件闭环已验收，冻结 hash 见 c2a/accepted-files.json。真实范围新增包 Vitest Vue 插件；原失败 suite 3/3、包12文件/80项通过，未改依赖或 lockfile。
- 根回归187文件/2156项通过；该轮运行中仅有 private 字段按生成规则更名为 systemPages，后续原suite、root/package typecheck、定向lint、973文件ai-codegen、dirs以及完整build覆盖最终代码。没有因该命名变化重复全套测试。
- 主控完整 pnpm run build exit0，实际生产5274验证：旧唯一地址可打开；同path的「表和视图管理」「数据表和视图」两个菜单携不同真实marker、标题和高亮正确；错误path marker、无marker多owner均显示明确错误且无业务heading。
- 未知URL回首页保留 keep=1&keep=2、bare、blank=、hash，旧marker被首页真实owner替换。浏览器0 error，135条为五轮各27条既有未映射告警，另1条为预期未知路径恢复告警。证据 c2a/browser-acceptance.json 及生产截图。
- 全部29项、真实保存回读和受限用户仍未验收，不把C2a宿主身份验收当作完整集成或native缓存隔离。

## C2c

- 状态：主控正在收敛实例池、App KeepAlive、tab、菜单与切域生命周期的精确派工。前置C2a已验收。权限模式是当前owner已有permissionMode，不新增无来源字段。

### C2c 首轮复审

- 11 文件切片已派唯一低阶写代理实施；首轮尚未验收。实际 App 基础用例通过后，主控发现 snapshot 浅冻结影响原 route、组件 name 不足以辨认绑定、独立 host 绕过实例快照、refresh/reset/rollback 与 home/single tab 边界未闭合。已按 `c2c/controller-review.md` 退回逐项行为 RED/GREEN；源码冻结前不运行最终全量构建。
- 同时发现 C2a 对缺省 itemKind 的报告措辞超出实际条件表达式；C2c 补真实缺省 page 行为回归，不能用旧报告替代当前源码证据。

### D1 只读可行性补证（尚未实施）

- `c2-review/d1-live-query.json`：当前授权导航的目录节点/蓝图场景 `90A82E287930A234FEC3E687C94A93EA` 可查询 Base_DataSet，总数 1184，前两页各 5 条且 key 不重复，名称包含 OR rowid 精确查询命中实际样本。正式模型 readModel 确认主键 rowid，目录所需字段可输出。证据不保留业务字段值、账号密码或 token。
- 仅读取，无业务写入。管理员样本字段均 visible，不证明受限用户。页面须消费原 context.rowKey/fieldAccess；rows 不会自动遮罩。runtime 对合法唯一行缺 auth 的既有默认 allow 不在 D1 私改；缺失/重复 key 为 invisible/denied。
- D1 draft 继续收敛，未启动第二个生产写代理。固定参考无业务绑定时不附 sysid；不能从执行 app 推导业务筛选。

### C2c 主控最终验收

- 11 文件已冻结验收，accepted-files.json 记录实际 SHA256；其余 C1/C2a 文件逐项 hash 无漂移。首次复审问题已收敛修正，最终 scoped 4文件/27项、根188文件/2167项、宿主包12文件/80项全通过；root/package typecheck、生产文件lint、975文件生成门禁、dirs与完整build exit0。
- malformed addRoute 事务失败分别验证合法缓存保留和已reset的锁态保留。独立只读审查未发现额外回归；主控补验最后 pool projection/事务用例后签署。
- 最新生产5274：两个真实授权node共用物理path，B选中服务器27数据库，A独立未选中；真实tab点击回B恢复状态；reloadNavigation保留缓存；关闭B后tab移除，再打开B为全新未选中状态，最终4连接。进入目标通过源码已有 __sparkDev.router.push，关闭/返回用真实UI。0 console error。
- c2c/browser-acceptance.json 记录方法与边界，production-cache-preserved.png 为刷新后缓存截图。AX差分一次不含旧文字导致 contains=false，截图证实仍选中；不得把差分缺文字误报为状态丢失。
- 无业务写入或真实权限修改。受限用户、29项完整操作与保存回读仍未完成；C2d应用切换迟到提交及调用方成功副作用继续独立闭环。

## C2d1 应用选择 owner

- 状态：主控已验收4文件，accepted-files.json及controller-hash-check.json记录当前与先前C2c11文件无漂移。
- 平台从list之前启动selection意图；select/activate共享代次，root await前冻结7标量应用快照。登录/登出开始失效未完成选择；normal token refresh保留当前性；输入变化/旧请求不串配app/root。当前list/root错误透传，旧错误显式失效。
- 主控退回首版outer failure缺检查、runtime测试被内层提前截获两点。修订后真实root失败外层RED及临时移除runtime检查的RED均保留；恢复后平台31、runtime26、root/package typecheck、定向lint、ai-codegen975通过，原目录门禁通过且无新增源文件目录。
- 只验收owner和wrapper局部，无重复根全量/build/browser。C2d2a将贯通catalog与app receipt；C2d2b/c再封闭shell和main caller，完整切应用仍未签署。

## C2d2a 目录与receipt传递

- 状态：5文件已验收。目录通过同平台owner递增意图、clear、签发期待空app的receipt；新app即使尚未save也会使其失效。正常token refresh不失效，index公开type有runtime实际消费者；两个runtime wrapper返回平台同一个receipt，保留外层assert。
- 平台35/35、runtime28/28、root/package typecheck、定向lint、ai-codegen975、dirs通过；hash已核对。根全量/build/browser留组合完成后一次验收。
- 主控额外运行冻结API包全量：18文件/579项通过，c2d2a/package-all.stdout.log及result.json保留。后续如API未改，不重复这套全量。
- 主控研究caller时额外识别reset与已有refresh重叠窗口：reset当前未撤销旧registration，旧成功或fallback可提前commit解锁。C2d2b批准10文件，先复现并修正该最小窗口，再推进shell投影与六处consumer；不能把C2c单独测试结果外推到此未覆盖组合。

### C2d2b 主控接受 / C2d2c 派工

2026-10-07：C2d2b 10文件完成并通过hash复核，7文件52项、typecheck、定向lint、ai976、dirs exit0。包括reset使既有refresh失效、App组合receipt、navigation投影与6caller恢复点。TabBar验证已使用真实composable，不保留fake-tabs测试；AppList真实取消无成功提示。其余27个已验收文件无漂移。批准 C2d2c/dispatch.md 精确3文件，接续同一低阶唯一写代理。组合根/宿主包测试和build/browser在3文件冻结后统一进行，未变的API包沿用18/579项接受结果。

### C2d2c 联合验收退回 → C2d2d

C2d2c 12项守卫测试与门禁通过不构成实际选择全链通过。主控追查发现fake activation替身虽更新principal，但用例只看URL。改在真实lowcode-runtime-navigation测试中联合实际LowcodeApi/runtime/Guard/DynamicRouter复现：APP-B目录查询pending时导航APP-A新query，释放旧目录后URL为APP-A、store变APP-B、native instance=null。有效RED exit1见 c2d2c/real-cross-owner-red.stdout.log。生产三文件未回退，C2d2c计划superseded，批准C2d2d7文件修正取消提交边界与reset时机。重新改动平台后需要重跑API包全量，不再沿用579作为当前结果。D1a仍draft，未编码。

### C2d2d 工程通过 / 生产组合退回

七文件主控复核，39个累计文件hash一致。平台39、runtime31、guard14、前片52项定向通过；主控root190/2212、API18/583、宿主12/80、两个包typecheck和完整build全部exit0，原始日志在c2d2d。两项真实平台/guard交叉窗口与错误owner单次fail-fast通过。wrong-owner调查曾因循环导致OOM，缺wrapper结果元数据已如实注明，不补造。

生产5274冷启动DBMS4连接；实际菜单进入应用目录。进入现有隔离测试应用返回“应用导航根节点应唯一，实际0个”，真实sessionStorage与URL仍原app，但App服务提前reset使原页消失，组合拒收。c2d2d/browser-rejection.json与截图保留。另验证真实UI应用工场主页→homepage/app-list且application=null→元数据管理成功回正式首页与4连接；该成功路径不能掩盖失败路径。

### C2d2e 两文件工程修正

实际App+DynamicRouter失败激活测试先RED（pending时instance消失）后GREEN。只把App reset移到有效receipt之后；原错误/URL/store/实例保持。5文件81项、root typecheck、两文件lint、ai978、dirs通过；主控复核两文件hash，accepted-files.json为工程接受，生产需最终构建再验。没有改测试应用的缺失导航数据。

### C2d2f 跨入口未提交选择

真实只替身网络的调查表明：直接调用实际runtime外部B选择pending，main守卫同A query已完成，释放旧目录仍成功commit B，URL/tree仍A。先以characterization GREEN记录现状，不能计入正确性通过；不声称覆盖App outer service。批准c2d2f/dispatch.md五文件修复：已有LowcodePlatformApi owner提供cancelPendingApplicationSelection，guard每次入口撤销未提交选择；已提交receipt正常导航不得失效。唯一低阶writer执行中。主控尚未运行本片新全量/build；D1a继续等待。

### C2d 组合验收通过，派发 D1a

C2d2f五文件已冻结并主控复核，pending在同步提交边界结清，失败finally仅清当前fence；真实store.save后排队微任务cancel不会误撤已签发receipt。平台44、相关5文件83项，root/API typecheck、lint、ai978、dirs通过。主控最终root190/2215、API18/588、完整build通过，未变宿主包复用12/80。累计39文件hash一致。临时提交边界RED无独立stdout，报告如实标注，不伪造。

生产5274最新构建完成真实验证：无导航根的既有测试应用选择失败后，原AppList仍显示且可点击，0身份错误；应用→目录homepage且真实session application=null；用1.5秒网络延迟，实际点击元数据“进入应用”，再通过已暴露__sparkDev.router推动新目录query，旧请求明确stale拒绝、最新地址保留、实际app仍null；恢复延迟0后再次真实点击能成功进入元数据正式首页，显示成功提示和4连接。0 console error。无业务写入；既有元数据部分可见性提示保留。证据 c2d2f/browser-acceptance.json及三张production截图。

本验收只签署C1/C2所述宿主加载、身份、缓存、选择与取消范围，不是29项完整集成/受限用户/业务写回通过。主控批准 d1a/dispatch.md 四文件正式只读目录闭环，转入D1可见功能。

### D1a 正式目录只读闭环验收

四文件已主控接受，见 d1a/accepted-files.json。17项目录测试、registry此前5项、typecheck、限定lint、dirs/pages/ai981门禁通过。主控复审补了仅scope变化而route/scenario/revision不变的成功/失败，以及masked/invisible rowid真实DOM；unmount测试只证明无未处理异常，不夸称能直接观察已销毁组件内部状态。

生产首次验收发现真实wire没有Fields，sort被省略。原因是既有查询协议在未显式fields时保留默认输出；不能合成仅排序列截断其余输出。由同一低阶writer补固定七字段，实际DataSpaceQueryTable封包测试有效RED/GREEN。主控只读带七字段探测确认真实倒序；第二次完整build通过。此前39文件hash无漂移。

生产最终：正式授权URL冷启动10行/total1184，实际createtime倒序；第二页10行与第一页不重叠；ID搜索1行且正确、无匹配空状态、重置、20条页大小、切到服务器页后实际点击目录标签保留20条状态；7次真实GetData全有七Fields和descending，0 console error。证据 d1a/browser-acceptance.json、production-catalog.png、sort-rejection.json、controller-build-final.log。没有业务写入；管理员结果不等于受限身份，D1 CRUD/设计/绑定等未完成。

下一片 D1b 为应用选项与所属应用筛选/名称，3原文件范围；Base_AppSystemList与平台应用目录不等价，按当前正式场景查询，保留原context字段权限。主控已形成精确brief，依现授权批准串行实施。

### D1b 应用筛选验收

3文件已接受，d1b/accepted-files.json。24项目录+5项registry=29通过，type/lint及既有ai981/dirs通过，主控完整build通过。复审将测试4位置参数改具名options，补仅scope变化的应用选项pending success/failure真实DOM；页面不暴露内部执行域术语。

生产从正式场景取得1个业务应用“元数据管理”；筛选后1184→68条、所属列名称正确、第二页保留sysid过滤；实际目录tab返回保留应用与第2页；清除/重置回1184/第1页、重置清名称；真实HTTP验证Base_AppSystemList与Base_DataSet各自查询，0console error。d1b/browser-acceptance.json和production-filter.png保留。原preview tab4在验收前失效，新独立tab5经已有授权账号登录；企业必须从真实下拉选择，预填文字本身不是有效选择。用户tab3保留，未动其文件管理页面。

写入前发现原生SystemPageIdentityPool尚无dirty生命周期，现useTabPages仅保护PageRuntime配置页；C2旧dirty测试也是cfg，不当成native覆盖。readonly review_d1_crud正在独立研读最小原生生命周期方案，CRUD研读已完成，尚未写入或派发CRUD。先补D1c创建人安全解析的独立只读闭环。

### D1c 首轮生产拒收（修正中）

3文件31目录+5registry=36定向、type/lint/ai981/dirs通过；主控根191/2246与build exit0，39个既有文件hash一致。但生产目录报用户主键错误，不接受。本场景真实用户 formal primaryKey=ID；关联字段正式ROWID，wire输出rowid，且两种ID值不同。原前稿把关联键当权限索引的前提失效；此前只读lookup探测未证明二者相等。正式模型和不含个人值的响应形状证据在 d1c/creator-contract-rejection.json，截图 production-rejection.png。

主控批准 d1c/creator-correction.md，仅原3文件；同一低阶writer按真实context先RED后修，分开正式ID权限定位与ROWID/rowid业务关联，并对两种拼写同时消费h/m以防权限绕过。下一轮仍须主控生产复验，首轮全量不等于最终修正版本通过。

下一create+fresh readback方案仍只读准备；主控选择普通关页/切应用保护草稿，撤权/退出强制取消旧提交资格，不保留失效授权。已发现clean预检→await activate窗口允许新草稿进入，create草案必须解决该过渡竞态，尚未派发生产实施。

### D1c 修正后验收通过

accepted-files.json保留最终3hash。用户正式主键ID与业务ROWID/输出rowid分开，双拼写都消费原context权限；缺失/歧义仅未解析，冲突键显式错误。主控再退回过全带双键的夹具，最终常规行只有实际rowid、ID不同，参数化8种单拼写/h/m组合覆盖，原权限ID不出projection。最终46定向、type/lint/ai981/dirs、主控根191/2256和完整build全部exit0。API与宿主包未变，39hash一致复用既有包检查，不重复执行。

生产修正版首屏10行/1184；创建人2行有名称、8行归属于同1个未解析ID，数量提示1；实际DOM与响应按关联键逐行匹配，wire仅查询本页去重ID，明确ID/ROWID/UserName三字段。所属应用筛选68条，10行创建人均有名称，第二页与真实目录标签返回保留筛选/页码/名称；重置回1184与1个未解析提示，0console error。证据 d1c/browser-acceptance.json、production-creators.png；首轮拒收不删除。未发业务写，admin不证明受限身份。

主控现批准 notes/plan-data-space-create-lifecycle.md，13文件单一新增业务闭环，含必要原生生命周期/过渡锁。低阶writer按依赖串行RED/GREEN，主控不并行派第二生产writer。

### 在线验收身份更新

用户回答“都用 admin”。后续所有在线验证使用既有授权admin；不再等待受限账号。原权限h/m/拒绝自动化测试保留，结果与管理员真实浏览器证据分别记录，不虚称真实受限账号通过。整体集成范围未缩减。
