# 数据空间设计整页恢复：新一轮迭代计划与唯一实施台账

> 执行方式：新会话由主模型直接实施，使用 superpowers:executing-plans。用户已要求细化并逐项落地、移交新会话；不要重新进行通用八题审批，不委派低阶模型。本计划替换旧E62执行顺序，历史“下一步”不再指导实施。

**目标**：完整恢复参考仓数据空间设计页的业务语义与1:1界面，以本仓标准组件和SPARK data完成配置、查询、编辑、取消、保存、独立重开和运行消费。不是重建另一套设计器。
**架构**：URL输入目标T；设计器的元数据空间C从正式配置装配为DataSet，组件绑定C的DataView维护T。数据库保存空间/模型/字段，pagedata保存本仓绑定/视图/原生关系/级联/布局，均从DataSet提交，由内部资源适配各自确认结果。
**技术栈**：Vue、TypeScript、spark-data、spark-component、spark-project-model、spark-lowcode-api、Vitest；公共声明经正式编译生成ClassModel。
**依据**：[产品链路合同](../docs/architecture/DATAFLOW_ARCHITECTURE.md) 2.5.312，第0章、1.2对象合同、0.7全链验收；根AGENTS.md。
**状态**：2026-10-17恢复后第3轮核查，同一L/S条件连续三轮持续且无安全可推进项；update_goal已返回blocked（updatedAt=1792168133）。I1—I6已发现源码反例完成对应离线修复与影响检查，I7跨消费者及当前生产构建已核；B01—B25仍缺浏览器L及实际服务S证据，尤其真实配置/保存重开、后端聚合与嵌套合同、1:1视觉及宿主运行。当前无已证实未修源码反例或运行中的检查；等待正式准入恢复或服务事实，不重跑无变检查、不绕过原拒绝。用户原目标和全部范围保留，未标complete。

**Cursor 接续（2026-10-17，覆盖 Codex I7/CUA 门禁叙事）**

- 全链路重梳与 Live Pilot：[research-data-space-chain-reset-2026-10-17.md](research-data-space-chain-reset-2026-10-17.md)；只读审计：设计链 [explore 数据空间设计链审计](7a8c3616-2538-4cb8-8d59-c7c729ace4f7)（§9）、嵌套/聚合 [explore 嵌套与聚合运行时审计](40378259-1917-4668-a959-74131ca3ebd4)（§10，合同 ~823）。
- **L（Cursor）**：`localhost:5273` 与设计器 URL 可开；缺的是 **登录 + B01/B02 Network 证据**，不以 CUA 零标签页作为唯一阻塞。
- **下一动作（用户拍板前）**：定 git 基线 → Live Pilot 五步（research §5）→ 通过后再按 research §9.3 五条锚点改码。
- **编码仍停**：在未完成 Live Pilot 步 1—3 前，不铺开 §9.3 绑定/来源替换大改；B11—B22 仍须先 S 样本。

## E62 当前实施卡

- 持续循环约定（2026-10-15用户明确）：读取当前阶段及依赖 → 核完整业务语义和差距 → 修改正确责任层 → 必要行为、持久化及回归验收 → 失败则本轮修复再验 → 就地更新输入输出、证据和未闭合段 → 自动进入下一项/阶段。以现有I0—I7为边界，不另起并行总计划，不以阶段通过或总结作为结束点；已通过且无变的检查不重复执行。外部缺证登记后继续独立可做项；仅全任务验收完成、用户明确暂停/取消，或所有剩余工作均确被外部条件阻塞且无安全可推进项时结束，届时写明阻塞及已尝试证据，不绕过浏览器限制或猜后端协议。

- 当前断点（2026-10-16全面诊断收尾审计）：前轮正式模型scope、级联发布、预览owner及宿主清理等生产源码hash无变，沿i7-model-binding-scope-verification及i7-cascade-preview-verification保留原范围。本轮补核场景宿主、字典、接口/配置/服务商消费者，修正接口页面测试缺VXE插件及同文件3处等值字符串风格；当前生产构建和543静态引用检查通过，见[i7-scope-consumer-build-verification.json](evidence/data-space-config-storage/i7-scope-consumer-build-verification.json)。没有新增产品行为改动。已逐项复审B01—B25，L/S仍未解除且当前无已证实待修源码反例或活动作业；同一外部条件已连续三个目标轮存在。下一动作须先取得原业务页面的正式准入恢复或实际服务合同，再按B01/B02/B23和相应S项继续；完整目标未完成，不把静态构建/夹具改作成功标准。
- 当前基线：分支feat/agent-workflow-node-contract，HEAD f3a361e5112c4b94e2527fc68bf5f640a9f17863；大量既有修改和未跟踪文件在原工作区，HEAD不代表已实施内容。
- 本轮实际修改：仅tests/runtime/page/api-provider/api-interface.test.ts的测试宿主插件及3处等值模板字符串；改前快照归i7-scope-consumer-before。当前生产构建输出至新cache目录，原dist保留。前轮生产源码及证据不覆盖，保留原dirty内容及index.lock，不进行Git写操作。
- 历史已验：查询输出/后端聚合接线489项、数组关联6项等仅证明各自日志范围；不能累计为整页完成。最近两个数组Vue和测试的hash仍与最后验证一致。
- 前后端地址核定（2026-10-16用户纠偏）：后端为远程https://spark.lingmacn.com；已对照.env.local及Vite开发模式loadEnv的实际解析值，开发态/api沿现有proxy指向此网关。本地127.0.0.1:5273仅是本仓前端入口；上一轮启动只恢复前端，远程后端健康与实际接口尚未实测，未改网关或启动本地Java。
- 远程连接层续验（2026-10-16 13:55上海时间）：spark.lingmacn.com的DNS、TCP443、TLS1.3握手及默认主机名/证书链验证通过，见[i7-remote-gateway-transport.json](evidence/data-space-config-storage/i7-remote-gateway-transport.json)。未发送HTTP、凭据或业务数据；正式lowcodeHttp与GetData路径仍经/api代理，无地址改动。历史2026-10-12的56次查询响应含1次502，不能代表当前服务状态；HTTP登录/查询/保存及原浏览器准入仍待实际验证。
- 外部限制（2026-10-16已专项诊断）：当前内置浏览器已通过正式接口打开公开官方文档，不能再表述为浏览器整体不可用。旧事件输入http却报不支持协议，原会话站点允许配置已有5273，同秒日志另有标签页路由缺失；具体被策略检查的URL仍未知。当前5273原为零监听，现已按原dev命令恢复。上述结果不等于原目标安全拒绝已解除；没有重试业务目标或改策略，详见[i7-browser-diagnosis](evidence/data-space-config-storage/i7-browser-diagnosis.md)。
- 深入调试新断点（2026-10-16用户要求定位）：已从原应用日志确认2026-10-13 18:43:05 UTC同一个设计器URL出现ERR_CONNECTION_REFUSED，继而成为data:text/html错误页；原门禁在18:50:47报告不支持协议。现行CUA的getTab按URL找已有标签页后自动读取AX状态，读取前后校验当前URL，data会被拒；机制与现场一致，原门禁实际URL仍未留存，不能越界宣称已完整复现。另核恢复后的placeholder会话身份、原ownerRoutePath、后续route capture及最终无route，保留全过程而非只取失败。已更新I7专项证据和报告，本轮再次确认5273/PID37892监听，未修改工具/策略/业务源码，未重试受拒目标。下一动作先沿产品正常流程恢复原HTTP页面与当前会话关联，不再泛查CORS或盲加allow；L仍需正式恢复及业务验收，S未变。
- 本次人工恢复后的连续审计：第1轮深入调试取得同目标连接拒绝及data错误页的新证据，改变L的恢复方向，分类为进展，未解除L/S。第2轮正式cua.getState返回当前IAB与MCP Apps均无标签页，get_goal为active（updatedAt=1792133136）；逐项复核B01—B25的当前缺证，仍需正式业务访问/实际服务合同，没有新增具体源码反例或可等待的验收作业，分类为无进展。第3轮正式cua.getState仍无标签页，未收到正式恢复结果或新的实际服务合同；同一阻断持续且无安全可推进项，update_goal已返回blocked（updatedAt=1792133206）。未重试受拒页面、未更改策略、未重复运行无变测试。保留完整目标和B01—B25范围，不把前端监听或新诊断当作整页完成。接续条件为原HTTP设计器页面与当前会话的正常关联及正式获准访问，或足以推进相应S项的实际服务合同/新具体源码反例。
- 下一动作：I7/L须取得产品侧实际被策略检查的URL、有效规则及正式恢复结果；旧来源已有allow，不能假定再授权即修复。已核当前正式浏览器能力仅visibility/viewport，没有站点权限恢复或故障反馈接口；[最小诊断报告](evidence/data-space-config-storage/i7-browser-support-report.md)已本地备妥，未外发。没有修改业务CORS或放宽策略。L获实际证据后优先B01/B02核正式C与隔离目标保存重开，再验B23；S到位后沿B11/B12及B18—B22接入后端迁移。当前已知源码反例沿既有离线证据，新反例直接继续对应I/B项。
- 更新规则：每项只维护输入、变化、源码路径、验证、尚缺证据、下一动作；状态可为未核/实施中/离线通过/实页通过/服务缺口。仅“实页通过且相关运行/持久化证据齐全”可核销完整业务项。

- 活动目标阻塞审计（2026-10-16）：目标创建时间为06:08:20 UTC；保守只计创建后的连续轮次，创建前历史拒绝不计入阈值。第1轮完成生产构建与静态产物检查，属进展，但L/S仍未解除。第2轮只读核验IAB与MCP Apps均无标签页、当前会话保存来源仅learn.chatgpt.com，无目标准入恢复或实际服务合同的新证据，属无进展，未等待可完成该依赖的运行作业。第3轮再次通过正式cua.getState及Browser.capabilities.list确认零标签页、能力仍仅visibility/viewport；来源文件不变，没有正式恢复接口或新的S证据。空标签页和allow缺项本身不证明禁止，阻断判断依据仍是原明确安全拒绝及缺少恢复证据。B01—B25未闭合段不变，无新的具体源码反例或安全可推进项；没有重复构建/测试、重试业务目标或改变策略。三轮同一条件持续，本轮update_goal已返回blocked（updatedAt=1792131275）。完整目标与原范围保留，未标complete；恢复依赖是原浏览器准入的正式解除结果或能推进相应S项的实际服务合同/新具体反例，不能以重复日志代替进展。

- 恢复后审计第1轮：get_goal返回active、updatedAt=1792131399，按新一轮计数；cua.getState仍为零标签页。本轮转向已有合法服务证据，核出历史聚合验证的确切边界：e62-group-live-field-comparison.json显示先更新Base_DataModel_Field.ValueFun为带GroupTableName/GroupField/Field的COUNT，并把Type.Group改为1；e62-group-live-query.json的正式GetData请求没有ValueFun覆盖；e62-group-live-result.json返回1098/96/3。这证明历史模型级统计，不能证明当前视图级临时聚合覆盖或aggregateResult/选择/子表等价迁移。新增证据区分记入I2/B18，L与S均未解除，未修改共享模型或尝试远程请求；目标未完成。

- 恢复后审计第2轮：get_goal仍返回active；正式cua.getState仍无标签页，会话来源配置不变，三份聚合原始证据文件仍为2026-10-12 UTC留存版本。没有收到正式准入恢复或请求级聚合执行证据。上一轮属于收窄证据适用范围的研读进展，未解除同一L/S依赖；本轮无新的功能进展或运行作业可等待，未改源码、未重复构建/测试。保留active；若第3轮同一阻断仍在且无安全可推进项，再标blocked，不能以改共享模型、凭本地Java或夹具替代真实服务合同。

- 恢复后审计第3轮：正式cua.getState仍无标签页，Browser.capabilities.list仍仅visibility/viewport，会话来源配置未变；没有新的准入解除、请求级聚合服务证据或具体源码反例。同一L/S阻断在恢复后三轮持续，已穷尽当前有依据的独立动作；本轮无进展，未重复测试或访问受拒目标。update_goal已再次返回blocked（updatedAt=1792131698）；完整目标未完成，原实现、证据和B01—B25缺口保留。

- 后续自动续做通知核查：get_goal返回active、updatedAt=1792131864，但通知没有新增人工恢复说明、准入结果或服务证据；会话来源配置未变。本轮仍无进展，沿已满足的三轮阻塞审计重新标blocked，不把自动续做通知本身当作外部依赖已恢复，也不据此无限重置计数。完整目标未完成；未重跑构建/测试、未改生产代码或策略。

## 固定约束与判定标准

1. 数据空间=DataSet，模型=DataTable，字段与多个DataView归模型；组件按“数据空间ID@正式模型名称@视图名称”绑定。参考元模型/前端模型合并，请求设置归视图。
2. 所有业务读写、取消和提交走SPARK data。已有owner只作数据层存储适配，不提供业务第二入口；按捕获变更提交，未加载数据不当成空或删除。
3. 模型关系用完整过滤表达式；输入级联是多个父值驱动子选项视图并影响子值。选择主键数组与持久字符串兼容必须保留，不混用SQL join或depType。
4. 原导航URL与页面目录层级保留；全部业务控件用标准组件和子组件协议。缺组件先补已有标准能力，公开声明变化才编译刷新ClassModel。
5. 本阶段不新增功能授权接线；功能标签独立于DataView，既有数据权限守卫不变，不建立前端角色或admin放行。
6. 后端使用实际服务，本地Java仓只读参考。聚合走后端值函数并由消费视图配置，单行计算可留在DataTable；不得拉全明细/用已加载行代替业务聚合。
7. 不提交、不推送、不重置、不批量清理工作区、不启动本地Java；不自动修改生产存量、孤立记录或蓝图URL。新建隔离验收数据须保留身份及清理条件。
8. 优先复用现有接口；真实缺口先在所属I项写清语义与影响，再修改owner。本轮恢复复审补充只读未确认提交状态及来源上下文查询合同，已从源码正式生成ClassModel，不另起总计划。
9. 不用源码存在、枚举支持、测试数量或“未发现缺失”宣称完成。事实分为参考语义、本仓实现、离线证据、实际服务证据、界面证据。
10. 同一问题诊断必须给出反例、责任函数和下一验证动作；已通过且源码无变的组不重复跑。服务未知记缺口，不生成猜测协议。

## 审查重点及归属

2026-10-17恢复后审计第3轮：前两轮均无进展，本轮起始get_goal为active（updatedAt=1792168105）。当前生产hash变化0、相关生产目录基线后更新0、证据新增0；正式cua.getState仍为IAB与MCP Apps各0标签页。空标签页不作为安全拒绝的独立证明；原明确拒绝尚无正式恢复证据，实际服务合同也未补齐。没有具体待修源码反例或可等待的活动作业，三轮同一L/S阻塞持续且无安全可推进项，update_goal已返回blocked（updatedAt=1792168133）。本轮无进展，未重跑测试/构建、未访问受拒目标或修改策略；保留完整B01—B25范围，停止重复检查，接续仍需正式访问恢复或足以推进对应S项的新服务事实。

2026-10-17恢复后审计第2轮：上一轮无进展；本轮get_goal仍active（updatedAt=1792168049）。再次核最后生产hash变化0、相关生产目录基线后更新0、证据新增0；正式cua.getState仍为IAB与MCP Apps各0标签页。未收到原准入恢复、实际服务合同或新源码反例，没有已确认在运行的验收作业可等待。原安全拒绝及L/S缺证持续，本轮无进展，未重复已过测试/构建或重试目标。按恢复后轮次保留active；若第3轮同条件持续且无独立动作，再标blocked，不以自动续做代替依赖恢复。

2026-10-17恢复后审计第1轮：上一目标轮只复核未变状态并标blocked，分类为无进展。当前get_goal已恢复active（updatedAt=1792167983），本次审计从第1轮计数；不沿用上次三轮直接标blocked。核对当前工作区：最后验证的生产hash变化0，数据空间及spark-data/spark-lowcode-api生产目录在基线之后更新文件0，证据目录新增文件0。正式cua.getState仍为IAB与MCP Apps各0标签页，没有原目标访问恢复的证据。当前没有新的实际服务合同、具体源码反例或已确认运行中的验收作业，仍不能推进B01—B25的L/S未闭合段。本轮未重跑测试/构建、未重试受拒目标或改策略；保持active，完整目标和接续条件不变。

恢复后审计第3轮：前两轮均无进展；本轮get_goal起始为active（updatedAt=1792140917）。以i7-scope-consumer-build-verification的checkedAt为界复核，生产hash变化0、新证据文件0；正式cua.getState仍为IAB与MCP Apps各0标签页。重新对照原拒绝及最小诊断报告：同目标连接拒绝和data错误页有日志证据，错误页导致协议拒绝是有机制依据的解释，但原策略实际输入URL仍未知；不能误称已完整复现或归为CORS。没有正式恢复、新服务合同、新源码反例或可等待的验收作业。恢复后三轮同一L/S条件持续且无独立动作，update_goal已返回blocked（updatedAt=1792141112）。未改产品代码、未重复测试/构建、未重试受拒目标、未改策略；完整范围不变。

恢复后审计第2轮：上一轮无进展；get_goal仍active（updatedAt=1792140864）。再次核生产hash无变、新证据文件0，正式cua.getState仍为IAB与MCP Apps各0标签页，原准入恢复及实际服务合同没有新增证据。无已确认在运行的验收作业或新源码反例可推进，本轮无进展；未重复测试/构建、未访问受拒目标或变更策略。保留active；若恢复后第3轮同一外部条件持续且仍无独立动作，则按阈值标blocked，完整范围不变。

恢复后审计第1轮（get_goal updatedAt=1792140742）：上一轮跨消费者/测试环境修正及生产构建属于进展，本轮只读核当前状态。原生产源码hash与最后证据一致；以2026-10-16T08:12:40.7075704Z为界，在数据空间生产目录及spark-data/lowcode API范围没有更新源码，在既有证据目录没有新增服务/浏览器证据（排除上一轮审计收尾文件）。首个日期筛选因PowerShell JSON已转DateTime而Parse失败，不用其结果；改为直接DateTime转换、失败即停、限量输出后确认两个计数均为0。正式cua.getState仍为IAB/MCP Apps各0标签页，没有原准入恢复。没有重跑测试/构建、访问业务目标或改策略；本轮分类为无进展，无作业可等待，L/S同一阻断未解除。按恢复后的新审计保留active，不能引用恢复前轮次直接标blocked；下一动作仍须正式访问恢复或实际服务合同/新的具体源码反例。

I7跨消费者与最终缺证审计（2026-10-16）：上一目标轮为实质进展，3个源码/测试hash与i7-model-binding-scope-verification均一致。正式bindModelView生产调用只有LowcodeDataSpaceAssembler；字典、服务商及场景宿主均经同一装配器，未发现需要独立身份旁路。扩展场景loader、字典目录/工作流、宿主与接口/配置/服务商消费检查：首组86通过，宿主beforeAll动态导入超过10秒而39项未运行；按仓内既有30秒钩子约定重跑宿主组，47项通过。第二组服务商/配置通过，但接口真实页面测试漏装主宿主已启用的VXE，vxe-column未解析后触发slot row为空；只修测试插件接线，不改生产组件。真实VXE挂载需约6秒，原5秒测试时限不足，显式30秒后接口8项通过；两处超时不是产品反例。测试文件3处既有prefer-template已按同值模板修正，显式lint通过。没有重复运行此前无变的包960项和预览179项。

当前源码已走原前端构建链（ClassModel完整性→Vite）至新的node_modules/.cache/i7-scope-production-build-20261016，保留原dist和旧构建产物。构建退出0，4.91秒；静态检查1044文件/98 JS/52 CSS、543引用无缺失且无非字面量动态导入，复制ClassModel完整；日志i7-scope-production-build及i7-scope-production-inspection.json。保留已有VueUse注释、CodeMirror静/动态混用及大块告警，不以拆包掩盖验收缺证。此为静态构建验证，不执行页面、不发送HTTP、不宣称实页成功。

完整验收再审：逐项读取B01—B25缺失项，仍分别缺实际C/T、远程来源/保存/重开、后端嵌套/聚合合同及1:1视觉/宿主运行证据。正式cua.getState当前仍为IAB(2)及MCP Apps(1)各0标签页，没有原目标准入恢复证据；未重试受拒目标。最近三个目标轮的L/S依赖持续：预览发布/释放修复轮、正式模型scope修复轮、本轮跨消费者/构建核验均有进展，但均未解除原浏览器拒绝或取得实际服务合同。本轮可执行检查已结束，没有已证实待修源码反例或仍在运行的验收作业；不得循环重复测试当进展，也不能把B01—B25改成夹具验收。下一动作需要原HTTP页面与当前会话通过产品正常流程恢复准入，或相应S项实际服务证据；完整目标未完成，满足连续三轮同一外部阻断且当前已无独立可推进项后据实标blocked。

I2/I5请求身份续审（2026-10-16）：上一目标轮为实质进展，本轮5个源码/测试hash均与i7-cascade-preview-verification一致。原设计会话守卫会在显式preview入口核scope，但标准组件直接持有DataView；新增模型/命名×已查询/尚未查询4反例，切换scope后旧view.refresh均成功且多发1次请求（i7-preview-scope-red）。沿调用链确认正式bindModelView只登记model，executeQuery按当前readScope发请求，数组owner已有绑定scope守卫；普通直接runtime.query允许当前身份发起新的显式查询，不能混为旧正式模型投影。修复归原DataSpaceRuntimeApi的正式模型绑定：在既有DataTable→model记录中同时捕获scope，旧绑定查询或重新绑定均检查原scope；同表派生视图继承，独立新表可在新scope查询。不新增页面请求层或权限规则，不改变未绑定正式模型的显式查询合同。已读正式bindModelView/executeQuery/query指南（i7-preview-scope-contracts.json），改前3文件保存在i7-preview-scope-before。先补真实应用往返、派生/新视图及新表恢复测试，再改原owner；L/S仍缺证。

请求身份复核修正：包测试须在packages/spark-lowcode-api目录运行；根配置和仅切config的两次no-test不计验证，第三次缺少DataSpaceDesignApi值导入是测试错误。修正后的i7-model-binding-scope-red-corrected证实原/派生/新增同表视图3项真实应用往返后仍成功；修复后这3项通过，fresh DataTable仍能查询。DataView.refresh按正式requestData合同用requestState/loadingError报告查询失败，并非必然reject；修复后4预览已无额外请求，原expect(Error)须修正为Failed与SCOPE_STALE，再以改前源码复验。完整API包初跑958通过/1失败，失败为旧测试仍要求同DataSet不同来源owner一律拒绝；当前正式合同已按来源分组，先核改前源码同样失败，再同步该陈旧测试到独立来源真实回执，不改公共保存逻辑来迁就旧断言。

本项离线闭合：改前对照在finally恢复候选源码；i7-preview-scope-red-corrected仍4失败，状态仍Loaded且多发请求；i7-existing-owner-test-baseline证实旧来源测试同样失败。改后预览/范围/会话3文件179通过。陈旧测试改为两来源分别派发并核各自回执，增加第二来源失败时第一来源已确认、第二来源保留dirty的断言；API全包24文件960通过。包typecheck发现新增fresh测试缺少必需tableName，补齐后包typecheck及最终API119项通过，此项不计产品缺陷。根typecheck、最终三路径lint、正式ClassModel生成通过；生成仍880文件/1821符号/1459索引及2219既有semantic gaps，新bindModelView身份说明已核正式产物。普通token刷新保持session revision已有实际刷新测试与源码依据，未改认证或权限算法。合同更新2.5.312，日志及hash归i7-model-binding-scope-verification；未访问远程业务HTTP、重试浏览器、改Java、提交或推送，L/S与整页验收仍未完成。

I2/I5预览失效可见性续审：目录/预览owner修复后5文件274项、typecheck、显式lint及正式ClassModel生成通过。模型owner原反例需先loadModelFields，修正夹具后基线为命名2失败/模型2通过，不能把原缺字段夹具错误计成模型缺陷。随后挂载真实预览组件，查询成功后关闭原会话，模型/命名两种弹窗都继续显示旧表格、Loaded状态与查询按钮且没有提示（i7-preview-expired-ui-red-corrected）；前次red仅为折叠JSON不直接显示R1的测试假设错误，不计产品证据。根因是disposed为非响应式属性，DataView销毁先移除事件，Vue没有收到生命周期通知。已核PageRuntime只有内容变更订阅，不冒用内容事件；在原预览owner增加窄onDispose合同，Vue在装配后立即订阅，释放时撤下运行上下文、旧结果与控件并提示重开，异步目录返回不得重新发布。原owner及Vue基线保存在i7-cascade-publication-before，正式预览成员指南见i7-preview-owner-contract-before；待行为、在途失效、关闭释放及正式生成验证。

本轮收尾证据：模型/命名两种预览×定义草稿/会话关闭四种实际标准组件交互通过，目录尚未返回时立即提示失效且迟到结果不恢复控件；旧DataView禁止查询、取消订阅/重复释放/释放后订阅均沿同一owner合同。i7-preview-lifecycle-final-regression为3文件138项；i7-preview-lifecycle-contract-regression为原装配API与ClassModel产物门禁3文件62项；此前i7-preview-owner-lifecycle-final为5文件274项，二者不累加。最终typecheck与5路径lint通过；正式生成880文件/1821符号/1459索引，2219项既有semantic gaps不宣称清零；新onDispose及openPreview订阅参数已从正式产物核对并留i7-preview-owner-contract-final.json。产品合同2.5.311及357文件文档检查通过。未提交、推送、改Java、访问远程业务HTTP或重试受拒浏览器；L/S和整页验收未完成。

I5级联目录异步发布续审（2026-10-16）：上一目标轮为实质进展；本轮先核8个源码/测试hash均与i7-context-iteration-verification一致，再查正式loadCascadeFields/loadViewFields指南及原读取→投影→候选DataTable→字段级联链。发现loadCascadeFields只在setViewFieldOptions之后核快照，目录返回与调用方恢复之间的投影编辑会先发布旧字段再报过期。新增真实会话反例在同步project返回时排入编辑微任务：OrdersAlias删除parentId投影后，旧调用拒绝但候选仍含可写parentId；另一模型目录保留，重试返回仅rowid，零文件写入。失败证据i7-cascade-publication-red，改前两文件快照i7-cascade-publication-before，指南i7-cascade-publication-contracts.json。修复仅在原loadCascadeFields发布前后复用同一视图/文件快照检查，不增缓存或保存入口；验证覆盖并发不同端点、同模型共享读取、失效、重试及预览实际消费。

该发布修复在3文件129项回归通过（i7-cascade-publication-regression）。预览续审发现命名预览只订阅文件变化，原元数据草稿或会话关闭不会释放已经交给组件的DataView；即便preview.refresh入口能报错，旧DataView.refresh仍可发出第二次查询。两反例i7-named-preview-lifecycle-red已证实。复用模型预览的既有失效守卫与DataSet.onAnyViewChange承接动态元数据视图，删除逐视图手工订阅；由于DataSet.destroy先解除订阅且DataView.destroy不发cleared，会话须显式释放自己交付的预览生命周期订阅。新增的集合仅为关闭回调，不存查询/业务数据或草稿。命名装配owner按模型装配现有subscribe参数合同接入同一生命周期，两个入口共用；公共签名更新须正式ClassModel生成。下一验证包括命名/模型预览的草稿失效与关闭、旧DataView禁止再次查询、并行预览隔离、正常字段请求草稿与命名配置保存重开。

I1/I2异步装配接纳复审（2026-10-16，用户要求全面诊断并循环修复）：系统页宿主按路由快照隔离实例，不能仅因页面watch写法猜测跨目标串写。沿真实会话进一步发现assembleDefinition在acceptDefinition前核代次，但acceptDefinition等待关系default/graph刷新后直接发布候选；待复现“关系回读完成但调用尚未返回→共享文件改变→新代次装配完成→旧调用返回”是否使旧投影覆盖新定义。若成立，修复限定src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts的原接纳路径，在最后异步边界后复用同一owner/代次/原文及编辑守卫，旧候选释放且不得动新结果；不新增查询/草稿/公共API或后端协议。验证落在tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-design-session.test.ts的真实DataView回读交错、候选销毁与最新运行消费，再按实际影响执行会话/关系/视图组、typecheck及显式lint。改前保存当前两文件，原dirty工作区及index.lock保留，不进行Git写操作。L/S仍独立缺证，本项不是已完成声明。

本项反例已证实：default/graph两处回读等待与文件改变、新装配、后续视图编辑的6种交错均失败，i7-assembly-acceptance-red-boundaries.log保留pageSize从31回退10、新投影被覆盖、旧候选未释放；default等待后旧端点还将新关系fresh清空。修复需同时覆盖原lowcode-data-space-relation-metadata.ts的reset：跨default回读后先核捕获文件revision/text再发布端点；原会话acceptDefinition跨完整关系回读后再核owner/代次/原文及编辑状态，然后发布投影。三文件基线已保存i7-assembly-acceptance-before。typecheck基线通过；正式ClassModel链已生成880文件/1821符号/1459索引，已按目录、概要和成员说明核loadDefinition/refresh/dispose及关系reset/resetGraph，查询记录i7-assembly-acceptance-contracts.json。仅改原内部实现，不新增公共签名，未以夹具推断远程服务合同。

接纳修复后6项反例通过，typecheck及三路径lint通过，正式ClassModel再次生成通过。六文件影响回归265通过/1失败，失败归I4标准关系表单：从旧数据库关系新增原生关系时DataView.currentRow已是NEW_FROM_SOURCE，实际挂载且isConnected=true的输入框仍为旧标识；单测隔离同样失败，非旧wrapper误报。i7-relation-binding-trace.log保存数据与DOM对应。沿标准容器同步发现row-mirror-sync通过toRaw读写隐藏原行引用，Vue计算值可能缓存旧身份；下一步先以同值不同身份的原行替换、清空及嵌套镜像复现，再在该公共owner修复响应式通知，保留非枚举原行身份和序列化边界，不在业务页加key/强制重挂。正式目录/概要已核row-mirror-sync、container-form-detail与FieldValueBindingProps；内部函数未投影为ClassModel模型，依据现行源码JSDoc和实际调用，不能把空models误当作缺能力。补组件反例、真实关系表单读写/取消及关联标准容器回归；尚未宣称此项修复。

行镜像两项反例已复现并修复为经Vue代理读写非枚举Symbol，实际关系新增用例通过并补核旧行未改/新行已改。扩大115项回归109通过/6失败：原文件快照对照确认5项空当前行仍渲染为既有问题（i7-row-mirror-baseline-comparison），另1项JSON连续编辑因contextData编辑覆盖对象每次重建令captureWriteGuard失效。继续在原useActiveFieldRow按行主键切换及rowsChanged/cleared更新写入代次，避免把同一行的编辑覆盖新对象当换行；查询替换、行切换和销毁仍拒绝旧异步写入。useFieldPermission只修复已有绑定缺当前行时的空控件显示，不新增授权规则或放宽既有查询/写入守卫；无DataView的显式本地控件与非行数据成员保持原合同。相应基线与行为测试必须通过后才记录离线完成。

上述关联修复已通过21项定向反例及11文件184项完整影响组（i7-context-final-regression），typecheck、8路径lint及正式ClassModel生成均通过；原5项空行反例、JSON连续写入/异步目标变化/旧事件、关系新建/修复/保存取消、字段权限、统计诊断一并覆盖。继续沿I4异步画布链核出loadGraphRelations在最后resetGraph等待后未重验owner/代次/文件；新文件的新画布已加载或会话已销毁，旧调用仍返回成功，两反例见i7-graph-readback-red。修复限定原方法，等待前后复用同一捕获身份检查，旧失败不得清新代次画布；不新增数据链，修复后重验会话/关系影响组。

本轮最终结果：画布两个反例包含于5文件238项通过日志i7-assembly-graph-final-regression；最后新增修改的typecheck、两路径lint、正式ClassModel生成通过，结合先前8路径lint覆盖本轮8个源码/测试文件。ClassModel仍880文件/1821符号/1459索引、2219既有语义缺口，生成成功不代表缺口归零。docs/architecture/DATAFLOW_ARCHITECTURE.md更新为2.5.310，357文件文档治理及显式路径diff-check通过。i7-context-iteration-verification.json记录每个改前/改后hash及日志范围。未提交、推送、启动/修改Java或访问远程业务HTTP，未重试受拒浏览器目标；没有浏览器实页、远端写入/重开或后端聚合新证据，整页任务继续保留未完成。

紧接I4失败清理复审又取得反例：loadRelationDefinitions的旧reset在新转换完成后返回失败，catch无条件useResolvedRelations(file, undefined)，误删新缓存；当前工作区仍宣称ready，下一次正式定义DataView刷新却从完整关系变成空列表。文件version变化与同文件来源filter变化两种交错均已复现（i7-legacy-relation-cleanup-red-source）；前次red-both中的来源分支仅为测试夹具方法名错误，不计产品证据。修复限定原会话：独立关系读取携带调用代次，接纳及错误清理均核该代次/文件/会话；过期失败不动新结果。坏定义修复分支reset返回后也须核当前身份。新增调用代次只控制既有缓存生命周期，不是数据或草稿真源。

此续项最终结果：i7-legacy-relation-cleanup-green为5文件240项通过；i7-legacy-relation-cleanup-consumers为关系编辑、关系/字段迁移、级联元数据和字段选项4文件100项通过。新增调用代次未扩大查询、编辑、提交或取消范围；新关系完整过滤在下一次DataView查询仍保留，零文件写入。最后typecheck、两显式路径lint、正式ClassModel通过，最终hash已刷新同一i7-context-iteration-verification.json，前一238项记录仅为当时范围。L/S及完整整页验收状态不变。

I1/I3/I5恢复范围接续（2026-10-16，实施中）：逐项核空间参数、模型/字段、来源同步/替换、数组、模型/字段删除及改名的捕获→提交→未知核验→保留后续/其他草稿→显式取消/刷新→切换/关闭→独立重开。视图/关系/级联/布局沿上一轮已验且无变的证据，不重跑。模型及字段页面的联合核验在前一项await后重新读取后项pending，再调用reload(true)，可能把等待期间的新编辑当作本次已同意放弃的修改；先用真实标准核验按钮和原DataView查询复现。单owner reload中的点击时明确discard不自动判为缺陷。若反例成立，将同步确认/放弃与异步回读在原owner处分开，由页面先准备全部本次目标、再依次回读；不复制草稿、不绕过原查询覆盖守卫。每个业务区域用既有用例及当前hash对照记录覆盖，缺少的交错行为补验，实际服务与视觉仍另记未闭合。

本轮反例与归属：联合核验4种交错确实丢草稿（i7-workspace-recovery-red）；原模型/字段/来源入参owner新增同步prepareReload/prepareReloadBatch后，页面先准备再回读，9项组件及269项owner影响测试通过。继续核出空间参数原提交已回读但新编辑仍待存时自动关窗/提示全部完成（i7-parameter-recovery-red）；修复仅归原页面收尾，按owner.pending保留窗口并提示。数组第一次核验被后续编辑挡住后，第二次discardOwned只在dirtyTracking有变化时检查编辑覆盖，导致仅编辑态的新标题丢失；i7-array-recovery-interleave保留失败，改为无条件检查原目标编辑覆盖，再按已暂存快照校验，原提交清理不得扩大为放弃新编辑。

- 首屏只读空间/模型，字段或旧关系default仍Idle，不能靠预载全目录使测试通过：I1、I3。
- 两个同名模型在不同空间、两个命名视图、URL切换和旧异步响应不能串身份：I1、I2、I5。
- 保存中继续编辑、DB成功但文件失败、结果未知、回读失败不能误报全部成功或重放：I1、I3、I7。
- 旧配置的未知成员、值字符串、后端关系、脱敏规则ID不得因转换或检查误删：I2、I3、I4。
- 仅一页明细、选中集合变化、关联子表未加载时统计必须仍由正确后端范围执行：I2；不支持的等价迁移保留原文并明确阻止误当已支持。

## 迭代顺序与依赖

I0 → I1 → I2 → I3 → I4 → I5 → I6 → I7。I1—I6的在线证据可在工具允许时补验；线上受阻不停止明确可做的源码修改。I7必须获得真实服务和界面证据，才允许完整交付。
每项均按“语义核定→方案差异→关联修改→业务验收”完成，禁止把一个按钮或一条测试另立阶段。已有实现逐项验证复用，不为满足计划重写。

| 项 | 交付的完整业务能力 | 关联旧断点 | 当前判定 |
| --- | --- | --- | --- |
| I0 | 可接续工作区、证据与单一执行者 | L9/L10 | 已接收，主模型实施 |
| I1 | 正式元数据装配、普通编辑保存与重开链 | L1/L2/L3/L8/L9/L10 | 请求配置复审缺口已修复；真实C、线上持久化及部分成功整页状态待验 |
| I2 | 多视图请求、过滤/树/值函数/聚合及预览运行 | L5/L7/L8/L9 | 两命名视图标准交互及重开查询离线通过；旧聚合及服务证据未闭合 |
| I3 | 六类来源、字段/数组及结构操作完整生命周期 | L1/L4/L7/L10 | 六来源贯穿与结构命令离线通过；实际来源读写能力待验 |
| I4 | 原生模型关系和多父输入级联的配置及运行 | L2/L3/L4/L8 | 转换、保存重开和组合运行离线通过，实际服务/视觉待验 |
| I5 | 参考整页布局、入口、标准组件及交互等价 | L8/L9 | 源码对应不等于1:1通过 |
| I6 | 自描述、共享配置与剩余文件编辑旁路统一 | L3/L5/L10 | 统一链、自描述、按需加载及最终门禁离线通过；实际服务待验 |
| I7 | 真实服务、视觉与完整影响面验收交付 | L9/L10 | 未完成 |
| 暂缓 | 新的数据权限/功能授权专题 | L6 | 用户明确暂缓，不删已有配置与守卫 |

### I0：移交基线与执行所有权

输入：当前工作区、产品合同、历史验证、冻结参考仓。
输出：独立交接文件、基线清单、新会话接收证据；不复制聊天全文。

- [x] 核定项目目录、分支、HEAD及正式合同版本。
- [x] 用本计划替换旧E62顶部多个相互叠加的“当前组”；旧台账原文归档保留。
- [x] 保存移交涉及路径的hash与工作区状态清单：e62-iteration-handoff-baseline.json记录718条工作区状态、9个关键文件hash、2个参考文件hash及27个已核实测试路径；HEAD不能代替未提交实现。
- [x] 本项目local新会话已收到结构化交接；按交接约定持有后续生产文件和台账写入，原会话仅确认移交。
- [x] 新会话已读取AGENTS、交接、基线及合同相关章节，开始I1源码与测试链核查；未重试被拒浏览器目标。

### I1：把设计器普通数据链作为首个完整业务交付项

输入/输出：URL只给T；openDesignSession(T,{deferDefinition:true})返回消费正式C的会话。普通修改经绑定DataView记录，DataSet.saveChanges按来源确认回执；全部成功才返回汇总，抛错时已确认视图与未确认视图保留各自状态；独立会话消费实际保存配置。
主要源码：
- src/lowcode/data-space/lowcode-data-space-metadata.ts
- src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts：openDesignSession、loadModelFields、loadViewFields、loadDefinition。
- packages/spark-project-model/src/scenario/scenario-definition-resource.ts、scenario-definition-records.ts。
- src/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue。
测试入口：tests/runtime/auth-nav/data-space/metadata/chain/data-space-chain.test.ts；tests/runtime/auth-nav/data-space/view-design/scenario-definition-resource.test.ts；tests/runtime/page/design/native/data-space-model-workspace-save.test.ts。

2026-10-15接收执行记录：chain测试的open辅助函数每次调用loadDefinition，workspace-save默认夹具也完整加载；这些通过记录不能单独证明deferDefinition首屏链。先补真实入口不装配T的标准组件编辑/取消/保存与独立运行消费断言，再按失败定位owner。编译基线正在执行，日志i1-typecheck-baseline.log。I1产出的定义视图由I2请求配置和I6共享编辑消费；沿现有API承接，无需新增接口。执行约束优先于技能默认模板：保留当前未提交工作区与本唯一台账，不新建并行台账、不提交、不委派。

I1差异方案（同日）：延迟首屏的原生/旧关系两种配置及模型字段签名保存已通过；旧格式按合同补读关系并非缺陷。新增“DB确认、文件回执丢失”贯穿反例在派发前失败：DataSet汇集不同资源视图后，DataView.saveQueryViews强制所有executor相同。修复归公共DataView保存owner：先捕获并校验全批身份/列/重复记录，再按原executor串行分组提交，各组独立接纳真实回执；后组未知不能给前组记录失败或重放前组。保留同场景/同运行实例、原查询上下文和重复记录守卫，禁止跨源事务。影响范围限data-view.ts、既有query-save-validation及chain/workspace-save测试、保存合同文档与正式生成的ClassModel；无新增公共签名。增加跨owner预检、同owner批次、部分回执、新编辑与跨实例反例。i1-mixed-receipt.log保留修复前失败。

I1复审修正（同日，离线修复通过）：监督探针已复现前组等待时修改后组api/crudConfig，会用旧变更配新端点/超时提交，失败证据i1-request-capture-red.log，监督探针artifacts/e62-supervision由监督方维护，本执行者未修改。captureQuerySave已捕获完整请求配置；HttpEndpoint数据深拷贝，CrudOperationConfig平面策略复制并保留函数引用。对象替换和嵌套修改两反例由红转绿，后续显式保存才使用新配置；三来源中间失败断言通过。DataSet.saveChanges旧“同一owner一次保存”JSDoc已纠正。保存校验/原查询来源/请求配置共68项通过；chain/定义资源/workspace-save共61项通过，含新I2用例；监督探针、typecheck、显式lint、正式ClassModel生成及49项产物校验通过。日志与源码hash归i1-i2-review-verification.json。

部分成功可见状态边界：三来源测试凭executor调用观测证明最后一组未派发；失败组和未派发组目前都是dirty加同一个mutatingError，公共状态不能单独区分二者。DataSpaceViewEditor提交的是文件定义组，通过file.saveStatus显示未知与核验；参数/布局独立命令及模型改名等复合命令按各自阶段显示。贯穿测试只证明真实适配的文件未知与DB确认/未派发数据状态，不证明实际整页所有部分成功状态可区分；此界面验收仍未完成。本次不新增通用返回协议或扩大重构。

I1/I5恢复复审差异方案（2026-10-15接续）：实际跨来源入口为模型改名（正式记录→场景定义→工具文件）及DevSystem共享工作区全部保存；不虚构设计器三来源总保存按钮。先用真实标准按钮、原DataSet与来源适配重现未知回执后核验、未派发独立草稿保存/取消、等待期间新编辑保留。已读到DevDataSetDesigner将输入错误与I/O错误混用并禁用保存；useDevSystem丢弃saveAll Promise且useDevState无整批错误反馈/忙碌保护。先补反例再修原责任层；数据层未知核验必须保留原提交身份和新编辑，不以清草稿或业务层直调文件owner解锁。随后核模型改名的可见分阶段状态及八区保存/取消/关闭矩阵。普通mutatingError相同尚不单独判定底层缺陷。

已重现两项失败：i7-recovery-ui-red.log真实标准保存按钮被I/O错误禁用；i7-recovery-new-edit-red.log原提交未知且期间有新编辑时，DataSet先应用新编辑，资源拒绝混批，原提交无法核验。修复方案：查询owner可明确报告原上下文有未确认提交（不从任意异常推断未知）；DataView仅为该类来源保留已捕获的不可变提交，DataSet恢复轮只核验这些原提交，不应用/提交新增编辑及未派发独立视图。仍由原owner回读确认，复用原回执接纳保留后续编辑；未应用则保留草稿供显式重试。DevSystem分离输入与操作错误，显示当前待核验及剩余修改并保留核验入口；更新生成合同和针对性测试。该捕获是原请求快照，不是新草稿或第二保存通道。

共享工作区反向失败边界继续核查：三文件的savePageFileFromModel在失败后只保留dirty，下次直接再次写入；与其后的场景定义保存组合时存在前组回执丢失重放风险。先补三文件owner反例；仅在原ProjectWorkspace保存责任方捕获未确认原提交并先回读，确认后只更新原保存基线、保留新编辑。原文不符区分未应用与冲突，不静默覆盖；明确重载才采用远端。全部保存串行捕获目标，失败后未派发的定义仍可独立保存/取消。此项不改三文件的领域归属，不另建草稿或提交通道。

I6消费者复审：pageDesign交付目前仅以Promise fulfilled标saved，核验确认后仍有新编辑时会误报交付完成。新增反例后改为同时核原工具/正式定义视图是否仍dirty或有原未知提交；剩余修改保留dirty并给出明确未完成原因，不能自动继续保存后来产生的编辑。范围限既有交付责任方，不改AI执行协议或扩大文件保存范围。

I1/I5/I7公共动作复审差异方案（2026-10-15）：监督反例已在本会话独立复现，i7-action-recovery-red.log证明正式定义43丢回执、后编辑58、原DataSet核验仅1次写入后，executeSaveDataSet仍发success。修复限原公共动作：提交前捕获本次目标视图及ids范围，回执后查询这些视图原生hasUnconfirmedSave、dirtyTracking、hasEditingChanges；范围内仍有修改则明确待存，不采用successMessage、不自动补交，范围外草稿不影响本次完成提示。无新草稿、存储入口或权限规则。正式测试覆盖原来源核验、已应用/未应用修改、未选视图/行、默认视图选择及标准按钮的取消后未知核验和错误呈现；按钮是否需改以实测为准。沿现有公共动作测试组织，不另立总计划，保留监督反例和原日志。

I1/I7取消后查询身份复审差异方案（2026-10-15继续）：DataView.assertResultReplacementAllowed与refreshBlocked目前只核dirty/editing，尚未核原来源hasUnconfirmedSave。待验证的反例是原定义43提交未知→本地discard→refresh/resetState/clearAll或已登记刷新；这些入口可能替换/清空原查询身份或将其置为失败，使原DataSet失去核验能力。先沿真实ScenarioDefinitionResource补反例，确认后在公共结果替换/延期刷新守卫补未知状态，保留原权限与提交捕获，不在页面加锁或清除未知。不影响明确来源preview/adopt命令，须同时核其原owner清除未知与刷新顺序。公开方法说明若变化，按正式链刷新ClassModel；不访问被拒目标。

上述反例6项已实际失败（i7-refresh-unknown-red、i7-refresh-cascade-red），包括级联错误将原查询置Failed。原DataView补未确认状态后，取消不再解除原查询保护；核验后剩余取消差异仍保留，处理完才刷新。新增7项生命周期用例，spark-data全包与正式定义/标准保存动作合跑44文件1001项通过；来源显式采用原测试仍通过。typecheck、2路径lint、正式ClassModel生成及49项门禁通过。下一独立核对转I5原生视图编辑器的保存消息，不复跑无变数据组。

- [ ] 当前线上真实C内容尚未重新读取；源码与夹具已核空间/模型/字段归DB、五类定义归pagedata，装配身份C和目标输入T分离。不能用仓内引导配置冒充当前部署配置。
- [x] chain直接使用延迟入口，原生/旧关系分别核字段default Idle、按模型读取、标准FieldJson/字段子组件编辑取消、DataSet保存及新实例查询；workspace-save以overviewOnly+deferDefinition核模型和字段联合签名提交重开。
- [x] 跨owner拒绝反例已在原DataView.saveQueryViews修复；先预检全批，再按原owner分组；未新增页面提交器，不查询未加载目录。
- [x] 本轮离线核未改兄弟配置与未加载字段、保存期间新编辑、DB先/文件先两种顺序及文件未知核验；已确认DB不重放，已确认视图无失败标记。
- [x] 进入I2；线上仍缺当前C原文、实际DB与pagedata提交/回读、独立重开及整页视觉。工具拒绝边界保持，不绕过。

本轮投影核定：`LowcodeDataSpaceViewMetadata`的DataViewFieldOption为已读取模型/视图的可释放字段候选；ViewControls及其bindings承载创建命令输入和候选；RelationControls/tableOptions承载修复文本及端点候选；DesignNavigation承载页面区域导航。这些由TS建static-data表，不是正式模型、定义副本或持久化对象。其余来源选择、数组/字段创建、布局迁移及预览输入投影分别归I3/I4/I5，不因本组检查就认定全部自描述已完成。

验证：编译基线与最终typecheck通过；显式4路径eslint通过；spark-data全包42文件919项通过；I1及定义持久化5文件135项通过；ClassModel正式生成成功，16个已有payload刷新（包括现有源码的过期投影），无手改；verify:class-model含49项通过；verify:docs 353文件通过；显式diff --check通过。日志及hash见i1-verification.json。自审对比i1-data-view-before.txt确认生产代码差异限保存方法；同owner批次、身份/字段校验与每组接纳前的原查询守卫保留。新跨owner行为无实际服务验证，不标整页完成。

验收命令：
~~~text
pnpm exec vitest run tests/runtime/auth-nav/data-space/metadata/chain/data-space-chain.test.ts tests/runtime/auth-nav/data-space/view-design/scenario-definition-resource.test.ts tests/runtime/page/design/native/data-space-model-workspace-save.test.ts
~~~
完成条件：操作输入、查询范围、变更集、各来源回执、独立重开结果可逐项对照；在线缺证时只标离线通过。

I1未闭合项复核（2026-10-16完整业务映射）：仅“当前正式C读取及实际来源回执”仍未验，不能从仓内pagedata推断线上C。入口`openLowcodeDataSpaceDesignSession`→`LowcodeDataSpaceViewDesign.openDesignSession(T,{deferDefinition:true})`消费正式C，`loadModelFields/loadViewFields/loadDefinition`分别承接概览后按需读取；空间参数由`LowcodeDataSpaceInputParameterEdit`与标准参数窗口绑定Base_DataSet。普通修改从原DataView到DataSet，文件经ScenarioDefinitionResource，数据库经正式查询owner；实际消费者为模型/字段窗口、参数窗口、独立PageRuntime。chain的`edits formal query output from a deferred...first screen`、两种提交顺序与独立重开，及workspace-save/metadata/参数窗口现有证据支持本仓实现；最近恢复组已复核，不重跑。分类为**已实现且离线验证，缺部署C/真实持久化验收**，对应I7 B01、B02、B16，不新增权限前置。

### I2：多DataView请求、过滤编辑器、预览及后端聚合

B18实际服务证据复核（2026-10-16恢复后第1轮）：[字段前后对照](evidence/data-space-config-storage/e62-group-live-field-comparison.json)显示2026-10-13统计先修改共享模型字段的ValueFun与Group；[正式查询](evidence/data-space-config-storage/e62-group-live-query.json)只有输出/分组字段，没有请求级ValueFun；[真实响应](evidence/data-space-config-storage/e62-group-live-result.json)为SpaceName=1098/96/3的三组计数。因此历史成功不能承接本阶段“共享模型不变、聚合归消费视图”的迁移依据。下一项S验收明确为：模型值函数保持原值时，由单次消费视图请求承载聚合函数，取得对应请求/响应、空集合和过滤范围结果，并核兄弟明细视图不变。原生aggregateResult输出键、选择身份及父子结果映射仍分别验收；不把模型级成功扩称请求覆盖或完整迁移。此次只核合法留存证据，无生产修改、远程请求或重复测试。

本轮门禁收尾（2026-10-16）：最终typecheck、19个变更路径中的显式TS/Vue lint、ClassModel正式生成及49项校验、文档355文件和显式diff检查通过。生成目录及DataView只读能力/诊断成员指南已核；880文件、1821符号、1459索引，既有2219条semantic gaps不宣称清零。源码、生成物和日志hash见i7-child-aggregate-verification.json。未访问被拒目标、未读凭据、未改/启动Java、未线上写入、未提交推送。历史失败/通过记录分别保留，完整服务及整页验收仍未完成。

2026-10-16 B20—B22边界接续方案（已实施并离线验证）：真实DataSpaceRuntimeApi传输夹具确认子表Count=300、仅一条amount=5时，父行$sum为5；未加载子表时sum/count/avg为0、list/join为空，组合公式仍把局部值作为结果。证据i7-child-aggregate-confirmed-red；首轮静态数组夹具缺resourceType的准备错误另存red，不当产品缺陷。沿原计算列委托及查询owner能力停止远程父/子参与的本地跨行计算，保留公式及明细，显式只读诊断经标准容器/显示/字段消费，不提高数据可读写权限。try/catch不能吞错后返回0；单行计算、纯本地数组、配置调整和重开分别验。无新后端协议，无自动转换或删除配置。改前快照i7-child-aggregate-before，前组B18证据保持历史范围。

2026-10-16 B18接续方案（已实施并离线验证）：监督反例使用真实DataSet→正式模型→DataSpaceRuntimeApi，仅替换传输，返回Count=300、当前页revenue=3且未请求GetGroupData；aggregateResult却为3。沿原DataViewQueryExecutor表达是否允许本地视图汇总，正式远程owner禁止旧aggregates执行，纯本地及正式静态数组保持原行为。DataView公开只读aggregateError，两个汇总成员在不可执行时明确拒绝读取；旧配置原样序列化，普通明细查询/编辑/权限和服务端fieldProjection统计不受影响。公共组件运行状态及元信息栏消费诊断、停止显示汇总；form/detail上下文不得回退到当前明细，显式成员显示同一诊断。设计器提示明确原配置已停算，显式移除可取消，并沿原DataSet保存重开。范围为spark-data、原正式适配、标准组件公共消费与既有设计器提示；不新增业务草稿或服务协议。先加远程当前页/选择/运行重配/本地隔离反例，再验标准组件和定义保存重开；只运行受影响测试、类型/lint/正式ClassModel及文档门禁。监督探针不修改；改动前快照归i7-aggregate-boundary-before。完整B18—B22后端迁移及B11/B12仍未完成。

当前页面主链：沿正式生成产物manifest定位FieldText/FieldNumber/FieldJson、RendererTabs、RendererFilterExpression，核props成员及LayoutDataContextProps继承指南，并对照DataSpaceViewEditor的实际输入、选择事件与DataView写回。FieldJson的form/native维护原queryConfig；过滤编辑器应用才写回原定义、取消保留原配置；创建控件绑定ViewControls，正式视图归DataViewDefinition。新增贯穿用例以标准控件创建同模型east/west两命名视图，分别配置Table、allPages=false、过滤region及pageSize=1/2；保存后用标准Tabs切回east，取消过滤草稿不写入。设计期间T定义未装配、全量字段default Idle且无业务Choices查询；独立会话读取保存配置，east首/次页为OPT-E/OPT-LOW，west保持OPT-W及第1页，默认视图过滤不变。单测与61项相关链合跑通过（i2-named-views-first.log、i1-i2-chain-regression.log）；使用真实组件与数据链、仅替换传输和存储，未证明实际服务与视觉。无I2生产修改，无新组件或页面专用状态。

2026-10-16 B18—B19边界验证：正式查询组36项通过；标准消费者最终2文件10项通过（含新增8项），表格、详情、选择汇总、显示/字段和布局均显式呈现错误，不回退到当前明细；单行doubleRevenue和显式字段值保持原优先级。设计器针对1项通过、302项未重复跑：取消移除恢复配置，保存其他属性后独立重开仍停算，只有显式移除保存后解除诊断；DB无写入。影响回归4文件167项、组件5文件44项通过，选项包装能力传播后37项再验通过，各组有重叠。最终typecheck、显式lint、正式ClassModel生成及49项校验通过；文档355文件通过（首轮仅改前快照的文件命名不合规，改为txt保留内容后通过）。明细与后端fieldProjection、静态数组行为不变。修改前快照、源码/生成物hash及红绿日志归i7-aggregate-boundary-verification.json；未在线验收，不声称完整迁移。

2026-10-16 B20—B22验证记录：15项正式远程父子边界用例覆盖七种函数、未加载/当前页、别名/注释/try-catch、纯本地、普通字符串、配置重建、明细编辑取消及依赖公式/本地汇总传播。原数据层全包42文件929项通过（i7-child-aggregate-data-complete）；正式查询与保存重开3文件60项通过（persistence-query-final），关系原生定义30项通过保留在native-final混合日志中，该日志另1项失败不得称整组通过。旧计算期望已改为保留原公式且诊断，关系配置仍准确重开。标准消费者及基础字段最终2文件34项通过（consumers-complete），实际表格/详情/显示/字段/布局均先显示诊断，修正公式后可见12、再次修正可见15；同主键副本不获得原行计算读取能力。最终镜像修复后的原生配置9项通过（identity-native）：取消恢复原文、其他列保存不删除旧公式、独立重开停算、显式移除后重开解除，原DB无写入。

本组失败证据与责任边界：confirmed-red是实际0/分页5/空串错误；consumers-red及visible-recovery记录诊断缺失、恢复后空白。原DataView重编译后再重算，发送行/配置事件；原行镜像以不可序列化引用保存身份，公共字段仍沿原私有计算读取校验，未放宽权限。derived-confirmed-red证明本地后续公式将失败变0，现已传播原诊断。初始数组缺resourceType、数组pageSize=1却期待完整12、删除不可变modelBinding、保存后继续操作已卸载JSON组件，均为测试准备错误；已分别修正且保留日志。原回读失败夹具仅mock失败返回而未设置loadingError，补足原状态合同后通过；普通Vue输入首次被toRaw去掉响应式的回归已修复，基础字段20项最终通过。各检查存在重叠，不累计为独立验收总数；类型/lint/正式ClassModel与文档结果、源码快照/hash归i7-child-aggregate-verification.json，不作为真实服务或整页视觉证据。

2026-10-15接续核定：64项命名/模型预览测试通过，32项安全聚合请求测试通过；I1贯穿链在真实标准子组件取消/保存后重开统计视图，响应由传输夹具计算，兄弟视图明细清空不影响后端范围结果。spark-data本轮全包已覆盖query-input-cascade及data-view-events，不重复跑无变组。以下是源码语义与迁移差距，绝非实际服务验收。

| 旧类/输入范围 | 实际消费者 | 已确认请求合同 | 保留/迁移结论及未闭合段 |
| --- | --- | --- | --- |
| view.aggregates的sum/count/avg/min/max：旧AggregateDelegate取本次rows | aggregateResult；DataViewMetaBar、容器contextDataMember及显示组件 | 正式字段fieldProjection可用Sum/Count/Avg/Min/Max，规范为GetGroupData；仅数据库表/视图Table及叶Join安全覆盖 | 2.5.308正式远程owner已停止旧本地执行，读取汇总抛aggregateError，标准组件呈现诊断；旧配置原样保留。新统计视图不自动映射旧任意key/summary成员，完整迁移未完成 |
| selectionAggregateResult：旧实现取当前selectedRows，不是全部查询行 | 同一元信息栏、表单/详情等汇总成员绑定 | 可配置正式过滤输入；没有已证明的“选中集合身份+原过滤+授权+统计回执”完整接线 | 2.5.308与旧全行汇总一起停算并诊断，选择及明细编辑继续；不把选择缓存当统计真源，不伪造汇总行主键。存量保留，后端身份及结果成员迁移未完成 |
| $sum/$count/$avg/$min/$max：关系匹配后取子表default.rows | ComputedColumnDelegate按父行计算列，再被原DataView字段绑定消费 | 单个正式字段的请求级聚合已支持；完整父子filterExpression、逐父行结果关联尚未承接 | 2.5.309已在实际调用处禁止远程父/子本地统计，computedAggregateError明确诊断，失败字段不产出值。原文保留，后端父子范围与结果映射未确认 |
| aggregates.join及$list/$join | 任意输出key或计算列；数组/字符串结果 | 安全目录仅MAX/MIN/AVERAGE/SUM/COUNT，无已确认LIST/JOINSTR接法 | 远程本地执行已停，原文保留；纯本地来源保持原行为。未确认等价函数、顺序/空值/重复/分隔符合同，不猜JOINSTR |
| 包含聚合的任意JS组合公式 | DataColumn.computeExpression，可能结合ctx和本行字段 | GetExpData字符串与前端JS不是同一表达式协议；未证明递归函数执行 | 注入聚合函数的组合、别名和try/catch均核同一远程边界，诊断沿依赖字段传播；本地公式及旧汇总不能把失败包装为0。任意JS后端迁移仍不做文本替换、不改永久模型ValueFun |
| 本行普通computeExpression，例如minimum*2 | 同一DataTable的各DataView列 | 前端只处理已返回本行值，既有字段可读守卫 | 保留；贯穿测试已核doubleMinimum，不混为跨行聚合 |

查询/缓存边界：DataSpaceQueryTable保持Join返回JSON对象行，仅叶节点显式ChildTables=[]，没有嵌套Join运行证据；SelfRefData不发PageParam并核集合完整性；HierarchyData/Navigation不能因枚举可选就视作所有来源已支持。DataSpaceQueryCache按scope/场景/模型/端点/配置/参数持有当前JS会话缓存，scope变化清除；旧RequestComplete文本不自动执行或转换。当前没有足够实际服务证据直接核销旧聚合迁移，I2保持未完成。

输入/输出：同一模型两个独立命名视图，分别保存查询模式、完整过滤树、排序分页、树参数、调用值、缓存、完成事件及输出投影；新实例和预览从同一配置查询。
主要源码：
- design/views/DataSpaceViewEditor.vue、design/views/preview/DataSpaceQueryPreview.vue（均在src/views/features/data-platform/data-set-management下）。
- src/lowcode/data-space/view-design/preview/lowcode-data-space-query-preview.ts。
- packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-aggregation.ts、data-space-query-context.ts。
- packages/spark-data/src/strategies/aggregate-delegate.ts、computed-column-delegate.ts；仅在本项明确消费合同后修改。
- packages/spark-component/src/components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.vue与value/FilterValueFunctionDialog/FilterValueFunctionDialog.vue。

- [ ] 按实际getdata语义核DataTable查询端点与参考Table/Join/SelfRefData/HierarchyData/Navigation；Join按返回JSON对象树消费，SelfRef不分页，Navigation按实际逻辑视图资源能力判定。
- [ ] 验证过滤树、嵌套值函数、取消/应用、字段目录失效；参数/查询方式更改后排序、过滤、翻页继续使用同一DataView配置。兄弟视图保持独立。
- [ ] 核缓存仅当前JS会话复用，刷新/退出/身份变化清除；完成函数接本仓事件链。旧RequestComplete文本无可证语义时保留，不能eval或按名称自动迁移。
- [ ] 为旧view.aggregates、selectionAggregateResult、子表公式逐类填写“输入范围→消费者→实际后端值函数→新配置→存量保留/显式迁移”表。单行计算保留；任意输出名、选择身份、父子过滤、join/list等不具备等价合同的项明确服务缺口，不能静默转换。
- [ ] 在已确认合同的项实施迁移并删除被替代的本地统计入口；不永久改写共享模型ValueFun。验证只有一页或本地明细清空时，后端结果仍正确。
- [ ] 重开命名视图后通过真实标准组件改配置并运行，分别记录夹具结果与实际服务结果。

验收命令：
~~~text
pnpm exec vitest run tests/runtime/page/design/native/query-preview/data-space-query-preview.test.ts tests/runtime/page/design/native/query-preview/data-space-model-preview-scope.test.ts tests/runtime/auth-nav/data-space/metadata/chain/data-space-chain.test.ts packages/spark-data/src/tests/query-input-cascade.test.ts packages/spark-data/src/tests/data-view/data-view-events.test.ts
pnpm --filter @spark-appworks/spark-lowcode-api exec vitest run src/platform/data-space/runtime/tests/data-space-view-aggregation.test.ts
~~~
完成条件：请求配置保存、重开、标准交互、实际服务结果一致；旧聚合逐类有结论，不能笼统写“暂不迁移”或“全部支持”。

I2未闭合项逐项归类（2026-10-16；不因旧勾选状态推断未实现）：

| 原检查项 | 实际消费者、当前实现与已有证据 | 本次判定 |
| --- | --- | --- |
| 查询端点及五种输出 | DataSpaceViewEditor写DataViewDefinition；QueryPreview→LowcodeDataSpaceQueryPreview→DataSpaceQueryTable/GetData。query-parity对五种意图有线协议断言，Join仅明确叶ChildTables=[]，SelfRef不分页；结构结果通过FieldJson保留，顶层标量经RendererTable字段子组件显示 | Table及叶Join接线已实现待在线；嵌套Join/Hierarchy/Navigation到子视图身份、权限、根分页的消费仍有缺口，必须先取得实际结构合同，见B10—B12，不能用平面夹具核销 |
| 过滤、值函数、参数、排序分页 | 标准RendererFilterExpression/FilterValueFunctionDialog负责编辑应用/取消；DataViewQuery、来源mapped/direct与公共级联持续传递上下文。chain两个east/west命名视图与query-preview/source-input测试验证独立默认、类型、重开、翻页/排序和关闭释放 | 现有正式表达式子集离线已验，见B09；任意嵌套函数/JS并无已确认执行协议，归B22，不把JSON可存当执行 |
| 缓存与完成函数 | DataSpaceQueryCache仅内存、scope变更invalidate，page模式以DataSet持有；DataView.refresh及保存清结果缓存。SparkPageRenderer订阅DataSet.requestCompleted，按onRequestComplete调用本页声明函数并传view/dataViewKey/signal，缺函数诊断，不eval旧文本 | e62-query-cache-verification及spark-page-renderer-binding现有证据；当前原生配置链已实现，实际浏览器释放/登录态验收B13。DB旧RequestComplete语义无法自动迁移，不新增执行规则 |
| 旧聚合分类表 | 本项已有5类旧跨行输入及本行普通计算的消费者/范围表；远程view.aggregates及子表公式均停算并诊断，纯本地与单行计算保留 | 分类及已证实错误边界修复已完成；完整后端迁移未完成。各类服务范围、结果身份与消费者映射仍分别取得实际合同后验收 |
| 已确认查询级统计 | fieldProjection→DataSpaceQueryAggregation→GetGroupData由本次视图配置驱动，模型ValueFun不永久改写；chain已有本地明细清空后仍按服务夹具范围返回统计 | 新统计视图链已实现；实际授权范围/结果键及旧消费者迁移仍缺，见B18。现有简写可发请求不足以自动替代旧summary成员 |
| 独立重开并运行 | chain实际标准控件创建east/west，保存后新实例查询；QueryPreview以完整目标/正式模型/视图键提供独立PageRuntime并在配置变化/关闭时释放 | 已有i2命名视图、预览及I1 chain记录，未重复执行；实际服务/视口仍见B09、B23 |

本轮额外核对的实现位置：`runtime/query/data-space-query-cache.ts`、`runtime/protocol/data-space-query-table.ts`、`SparkPageRenderer.vue`的requestCompleted订阅、`LowcodeDataSpaceQueryPreview.query/bindInputs/dispose`。本项正式支持的本行计算与过滤不因旧聚合待迁移而停用；没有建立新后端白名单或臆造协议。

### I3：资源到字段、数组和结构命令

本次结果：六类来源已用实际reader、模型创建、DataSet提交、独立重开和命名视图消费贯通，6项通过（i3-source-chain-fourth.log），包括API/逻辑视图输入及字典标题/数值编码。前三次失败分别为夹具重复物理来源、错误回包主键/字典字段名与超限pageSize，均按源码正式合同纠正，未修改生产逻辑。仅模拟传输和文件存储，不证明实际后端CRUD/别名；来源变更及全部结构命令仍须按项核证。链、模型创建、数组表头及级联组合138项通过，关系组8项因测试未展开下拉失败，另在I4记录。

I3结构命令复核：13文件514项通过（i3-structure-final.log），覆盖来源替换/同步、注册名、删除、来源参数、数组条目/改名/引用、主键和字段新增删除。下表记录当前读取/提交责任；未修改这些生产命令，仅核现有实现及回归，不把本地传输夹具当成服务能力。

| 命令 | 实际读取范围及输入 | 实际提交与异常边界 |
| --- | --- | --- |
| 来源同步 | 当前模型和所属字段，选定资源的真实reader输出 | 仅明确新增/更新字段；无映射或重复映射拒绝；取消不写入 |
| 来源替换 | 所属字段，加持有Filter的模型字段、旧关系、来源入参及定义实际引用；sourceSync/sourceReplace独立命名视图 | 显式映射和移除确认形成DB差异，成功后对应文件定义差异从DataSet提交；未知结果回读，不重放已确认批次 |
| 模型改名/删除 | ModelDependencies读取模型目录、旧关系和ValueFun非空记录，按Filter/JoinFilter/值函数/关系引用收集modelIds，再查询这些模型字段；全字段default保持未预载 | 改名只改结构化正式身份引用，常量、参数、物理限定名及不透明表达式不猜改；删除只提交所列模型/字段/关系及文件布局差异，孤立记录不自动清理 |
| 字段输出/主键/新增删除 | 当前modelFields与命令明确依赖；普通属性编辑不触发引用全扫描 | 按原DataView记录本次字段修改，物理来源字段与本地计算字段区分；联合主键、重复输出及已引用字段删除核验，保留其他编辑工作区 |
| 数组表头/条目/改名 | 当前数组所属正式字段、数组items及受影响的结构引用 | 表头、条目沿原DataView提交；同时改名按稳定字段ID处理，选中主键数组/字符串兼容保留；DB/file部分成功与未知结果分别核验 |

六来源读模型合同分别为表/库视图的Base_TblField、字典已保存设计的六业务字段、接口/逻辑视图的Base_TblField及_Base_ParamList、JSON节点记录。真实服务的资源可写性、别名结果、接口和逻辑视图输入执行仍未核；不根据metadata新增成功推断目标业务资源CRUD，也不因未知而凭前端猜测禁止某来源。

本次实施输入与方案：原model-create夹具mock prepare且createdModels存在简化投影，不能证明来源到运行全链。扩展既有chain传输夹具支持显式元数据新增回执，按六类正式来源种入最小目录及字段，字典另种正式设计空间；用原openLowcodeDataSpaceDesignSession、LowcodeDataSpaceModelSourceReader、DataSet保存及正式装配独立重开。只替换HTTP与文件存储，不mock prepare/readModel/assembler。先看反例，生产缺口归原责任方；不新增API或另造业务数据链。

接续定位（仅源码核定，未验收）：LowcodeDataSpaceSourceCatalog的六类来源分别是View_TblList、_Base_DictType、Base_DataServiceInterface、Base_JsonData、Base_DataViewList、View_ViewList；LowcodeDataSpaceModelSourceReader.prepare精确重读所选身份。表/数据库视图/接口/逻辑视图从Base_TblField带回字段，接口/逻辑视图另读_Base_ParamList；字典从独立正式设计空间读取六业务字段标题与编码类型，JSON采用六项记录节点合同。source-reader测试覆盖这些准备语义，而model-create与source-edit中存在mock prepare，不能仅拼接两组通过记录声称六来源贯穿完成。下一实现/验收点是实际reader→原DataView创建→独立重开命名视图消费；非表资源CRUD及后端别名输出仍需逐类核真实合同，当前不宣称已支持或已拒绝。

输入/输出：六类资源（表、数据库视图、字典、外部接口、JSON、逻辑视图）带回字段，形成一个DataTable；选择/同步/替换/改名/删除及数组表头修改分别产生明确变更集。
主要源码：src/lowcode/data-space/model-source/下的lowcode-data-space-model-create.ts、lowcode-data-space-model-source-edit.ts、lowcode-data-space-field-edit.ts、array、rename、removal、field-create、field-output；对应design/model/source与ui/node-panel/fields、数组窗口。

- [ ] 为六类资源核来源字段、输入参数、主键、输出别名、可查询与可写能力；别名由后端返回，前端不另重命名。字段来自资源；本地新增计算字段与修改物理字段区分。
- [ ] 用“选资源→字段带回→模型字段保存→命名视图→标准组件查询/编辑/取消→独立重开”验证每种来源；不支持CRUD的资源明确拒绝，不套数据库表接口。
- [ ] 来源同步/替换、字段输出/主键变化、模型/字段改名与删除各列精确读取集合和提交集合；修复仍强制全目录的命令，普通属性保存不做引用扫描。
- [ ] 核ValueFun/过滤/原生表达式引用；Expression是脱敏规则ID。旧不透明表达式、入参类型变化及自定义端点必须有可确认迁移，不按字符串碰撞改写。
- [ ] 数组新增/编辑、表头新增删除主键、行编辑保存取消、联合修改走现有DataView；核无关草稿、来源变化、部分成功、未知结果及重开。
- [ ] 存量孤立记录与正常删除链分开；保留诊断，禁止自动隐藏、猜测重挂或批量删除。

按实际变更运行以下已有测试组：
~~~text
pnpm exec vitest run tests/runtime/page/design/native/data-space-model-create.test.ts tests/runtime/page/design/native/data-space-model-source-edit.test.ts tests/runtime/page/design/native/data-space-model-rename.test.ts tests/runtime/page/design/native/data-space-model-remove.test.ts tests/runtime/page/design/native/data-space-array-create.test.ts tests/runtime/page/design/native/data-space-array-items.test.ts tests/runtime/page/design/native/data-space-array-headers.test.ts tests/runtime/page/design/native/data-space-array-rename.test.ts
~~~
完成条件：六类资源各有可执行能力结论；结构操作的读取/提交/回读/取消同时闭合，不只证明保存按钮可用。

I3完整来源映射（2026-10-16；六类“定义创建”与六类“业务CRUD”分别判断）：

| 来源 | 当前选择/带回输入 | 实际消费及离线证据 | 尚缺 |
| --- | --- | --- | --- |
| 数据库表 | View_TblList选择唯一rowid，Base_TblField按tblid带回字段/主键 | SourceCatalog.selected→ModelSourceReader.prepare精确重读→ModelCreate原DataView新增→装配DataTable；chain真实reader六来源用例包含本类，命名视图查询 | 真实字段输出别名、目标业务CRUD与回执B03 |
| 数据库视图 | View_ViewList、dbid/DbName，Base_TblField | 同上；来源替换到库视图及重开已有真实标准控件测试 | 具体视图可写能力与实际回执B04，元数据可新增不证明业务可写 |
| 字典 | _Base_DictType，独立已保存字典设计给出六业务字段、标题与dictionaryType | ModelSourceReader.dictionaryFields→原创建链→命名视图；数值编码/标题六来源贯穿已验 | 实际字典设计/记录的归属、值类型、CRUD结果B05 |
| 外部接口 | Base_DataServiceInterface及ProviderID，Base_TblField输出、_Base_ParamList输入 | prepare保留参数身份/类型；SourceInputEdit维护ValueFun，预览direct与运行mapped分开；六来源链及source-input组已有证据 | 实际调用参数、错误返回、输出别名、写操作是否受支持B06；不因前端枚举猜可写或禁写 |
| JSON | Base_JsonData唯一身份，既有六项节点字段合同 | 真实reader→正式模型/字段→重开命名视图链已验 | 实际节点查询形态、唯一键及修改/删除语义B07 |
| 逻辑视图 | Base_DataViewList，Base_TblField与_Base_ParamList | 逻辑来源装配与mapped/direct平面查询链已验；资源内部设计与命名DataView不是同一配置 | 实际内部OutputType/ChildTables、根分页与子结果身份/权限B08、B12；嵌套子视图消费未实现，不能仅以行内JSON保存称完成 |

原I3其余未勾项：来源同步/替换、输出/主键、结构改名删除的读取/提交集合已在上表前的命令矩阵核定，沿ModelDependencies与原owner读取明确依赖；13文件514项结构证据及后续恢复修复有效范围直接引用。ValueFun/过滤/结构引用由原迁移/删除引用责任方处理，Expression按脱敏规则ID；不透明表达式、原生JS和旧目标操作名称不猜改。数组表头/条目/改名从ArrayEdit及原DataView提交，现有88项相关证据；孤立记录由工作台unplaced分支显示原因，不隐藏或自动清理。上述属于**本仓实现及离线证据已具备，缺实际业务数据与服务操作验收**（B14、B15）；旧不透明协议属于待确认合同，不能据此制造前端替代规则。

### I4：稳定模型关系与多父值级联

本次结果：关系编辑测试的chooseBound须先展开实际ElSelect再点击已挂载选项；现有标准FieldSelect为persistent=false，直接搜索未展开的ElOption不是实际用户路径。修正测试交互后30项通过（i4-relation-editor-green.log），覆盖创建、旧转换、完整过滤、取消、远端冲突和未知结果；生产代码未改。chain已覆盖两类关系保存后在新实例组合运行，未加载无关字段；均为离线证据，非实际页面视觉/服务验收。

I4最终组合回归4文件124项通过（i4-relation-combination-final.log）。原生v2关系工作区不读旧库；旧格式先核完整空间来源再转换，后端原关系记录保留。关系保存/取消只操作关系定义；级联保存/取消只操作级联定义，不互相推导。级联组实际覆盖两个父值、重开后查询、选中主键数组与旧字符串、子值修正、不同视图/关系并行草稿、迟到响应与scope/dispose、未加载级联保留。实际服务数据范围、真实组件视觉和用户整页交互仍为缺证。

输入/输出：先识别旧/本仓格式，旧关系明确读取并转换成resourceRelations；viewCascades独立配置；保存后新实例恢复两类关系及交互。
主要源码：src/lowcode/data-space/lowcode-model-relation-adapter.ts；view-design/lowcode-data-space-relation-metadata.ts、lowcode-data-space-cascade-metadata.ts；design/ui/edge-panel/data-set-design-edge-panel.vue、design/ui/cascades/DataSpaceCascadeEditor.vue；packages/spark-data/src/strategies/cascade。

- [ ] 对照参考关系画布的创建、端点、双击、编辑、删除和取消；关系编辑接完整过滤表达式，不退回字段对。
- [ ] 旧关系转换前核来源完整性，保存本仓结构并保留后端原记录；未完成转换不得宣称原生结构已落地。
- [ ] 多个父字段值共同驱动子选项视图；列表值为选中主键数组，指针行只影响值构成；重新查询选项后处理子字段值。
- [ ] 验证DataView.value字符串兼容、默认立即/显式过滤器控制、旧异步响应、目标切换、字段候选按空间→模型→视图级联。
- [ ] 保存、取消、独立重开和标准组件交互使用同一配置；不由稳定关系自动生成输入级联。

验收命令：
~~~text
pnpm exec vitest run tests/runtime/page/design/native/data-space-relation-editor.test.ts tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-relation-persistence.test.ts tests/runtime/auth-nav/data-space/view-design/lowcode-data-space-cascade-metadata.test.ts packages/spark-data/src/tests/dataset/field-cascade.test.ts tests/runtime/auth-nav/data-space/metadata/chain/data-space-chain.test.ts
~~~
完成条件：两类关系分别配置、提交、重开并实际驱动下游；组合场景与无关模型未加载同时成立。

I4未闭合项复核（2026-10-16）：五项原检查均有当前消费者。关系画布创建/端点/双击编辑/删除→edge-panel→DataResourceRelationDefinition完整filterExpression；旧格式由LowcodeModelRelationAdapter在完整来源可核后转换，保留Base_DataModel_Relation；多父值→DataViewCascadeDefinition→spark-data cascade→子选项DataView及valuePolicy，默认立即/显式过滤由原DataView控制。i4-relation-combination-final的124项、chain组合用例与后续关系/级联恢复证据分别覆盖配置、原生字符串/选择数组、迟到响应、作用域、独立重开及无关模型未加载。本轮未改这些源码，不复跑；分类为**已有实现及离线贯穿，缺实际来源范围/子值处理及参考交互验收**，见B17、B23。稳定模型关系不自动变成输入级联，也不被解释为SQL join。

### I5：参考整页与标准组件完整还原

I5完整页面映射接续（2026-10-16）：冻结参考实际目录为`E:/r/sparkproject-master-c52ea6af/packages/ui/domain/metadata/src/features/data-platform/data-set-management`，主页面与node-panel的SHA256仍分别为`2f19409e…6ebb6`和`116c2a35…fd11c`，与移交基线一致。参考概览/图例/画布及工具栏对应当前主页面、DataSpaceWorkbench与RendererGraph；860输入参数、980来源选择、1280节点详情对应当前标准RendererDialog；来源、合并模型字段、命名视图请求、数据处理分别对应ModelSource、FieldEditor、ViewEditor与TableConfiguration；模型/视图预览对应QueryPreview及其独立PageRuntime。参考“元模型/前端模型”按既定合同合一，请求归命名视图，不能重新拆成两份定义；旧数据处理目标模型名只读保留，当前DataTable.api/crudConfig有自己的输入/输出合同，不能声称它自动执行旧目标模型。

原I5前四个未勾项的源码/离线对应已有：完整八区入口见本项矩阵，数据容器及字段按dataViewKey/dataMember/field消费原DataView；本轮限定业务目录检索未发现直接el控件或el-table-column，不把此文本检查单独当绑定证明，实际绑定仍引用chain和标准组件集成用例。新增公共组件能力及声明以前轮正式生成记录为准，本轮未改声明，不重复编译。第五项**同视口视觉/滚动遮挡/禁用/操作顺序仍未验收**；B23列出实际逐区动作。此结论没有把源码布局对应升级为1:1通过，也没有用参考存量错误作为目标规则。

输入：冻结参考页面/调用链及原截图；输出：按本仓归属调整后的完整等价页面，保留导航URL和文件层级。
主要源码：src/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue、data-set-design-page.css、node-panel、edge-panel；design/parameters、model/source、views/preview；标准RendererGraph及过滤/JSON组件。

- [ ] 将本台账下方八区矩阵逐项落实到参考入口、当前入口、交互结果；模型与请求归属按已确认语义调整，不能要求照搬已否定的两套模型。
- [ ] 补齐概览、图例、节点/连线、主工具栏、模型选择器、输入参数、数组/字段、预览、数据处理、保存/取消/关闭与异常提示。
- [ ] 只补有明确缺口的标准组件；全部数据容器和字段绑定真实DataView，不手写el-table-column、业务候选数组或第二套编辑对象。
- [ ] 公开属性变化先正式编译生成ClassModel，再查目录/概要/指南后接页面；不以旧ClassModel认定不存在能力。
- [ ] 在合法可用的浏览器中按参考截图同视口核布局、弹窗、滚动、遮挡、禁用、交互顺序；源码/CSS对应只标静态核对，不标视觉通过。

验收命令：
~~~text
pnpm exec vitest run tests/runtime/page/design/native/data-space-design-page.test.ts tests/runtime/page/design/native/data-space-workbench.test.ts tests/ui/renderer/renderer-graph.test.ts tests/ui/renderer/filter-expression-inline.test.ts
~~~
完成条件：八区每项有可见结果及交互证据，核心流程不靠页面直接调用后端或手改草稿完成。

2026-10-15恢复复审（真实组件离线证据，尚非视觉验收）：重新读冻结参考页主画布、1280详情、860参数/980来源窗口及取消/确认入口；按实际业务分区核以下保存/关闭/异常链，而非沿330项数量推断覆盖。

| 区域 | 当前实际入口及失败/关闭核对 | 行为证据 |
| --- | --- | --- |
| 入口/概览 | 唯一T入口，装配失败保留错误，未决提交不能通过重新打开解除；无文件仍可进入设计 | data-space-design-page.test.ts入口/作用域用例，原正式C/T装配链；服务内容及视口仍待验 |
| 画布/工具栏 | save-layout、cancel-layout、verify-layout及远端预览/采用；未决布局阻止切换，保存只确认布局来源 | 同文件layout保存、取消、未知、漂移及独立重开用例；RendererGraph原组件组证据不作视觉结论 |
| 模型/字段 | save-model-workspace、改名预览/确认/核验、close-definition；未决操作关闭/切换受守卫 | 新增两个真实模型改名DB/file失败边界通过：阶段文案、禁重复提交/关闭、接续、一次DB/一次file及新会话绑定；原字段/来源写未知用例通过 |
| 多视图请求 | save-views、discard-view-edits、reload-view-directory；无效字段保留纠正，回执确认但目录回读失败只重读 | 同文件invalid native edits、confirmed save with failed directory readback、unknown view file save及命名视图重开测试通过 |
| 数据处理 | DataTable.api/crudConfig窄工作区，discard-table-api、保存及请求配置核验 | protect API drafts跨模型/URL、invalid endpoint、取消、未知提交与独立重开用例通过；不证明任意后端端点合同 |
| 来源/参数 | 来源查询/预览失败保持980窗口，可取消未提交预览；参数行内校验及860窗口取消/确认，未知禁关闭 | source dialog recoverable after query/preview failures、cancel incomplete parameter edits、explicit readback without replay、source save in flight阻止关闭通过 |
| 两类关系 | 原生关系与输入级联各自绑定定义视图，取消不写，未知仅核验；拒绝无效引用不丢原配置 | 同文件relation保存/取消及query cascade unknown用例，加既有I4组合证据；当前改动未声称新的线上关系合同 |
| 保存/运行 | 共享工作区工具→场景定义；定义编辑器核验按钮；AI交付按真实剩余修改判定 | i7-recovery-consumers：已确认工具不重放、场景未知期间新编辑保留；工具未知后未派发场景能用真实标准按钮独立保存或撤销。模型改名新会话重开通过，实际服务及整页视觉未验 |

复审发现并修复了错误状态禁用恢复、保存前混入后续编辑、工具未知重写、全部保存缺错误反馈以及AI将剩余草稿误报saved；没有把相同mutatingError本身判成缺陷，也没有增加设计器三来源总保存按钮。最后的影响面检查和产物记录见I7接续记录。

I5原生视图保存反馈接续方案：DataSpaceViewEditor.commitDefinitions只按回执和目录延期选择成功文案，属性保存期间经同一DataView产生后续编辑时可能仍声称“已保存并回读确认”。先在既有真实标准控件测试中仅延迟文件存储回执，分别核普通确认和未知核验后的剩余编辑、按钮与独立重开，再判定修改。若复现，复用现有localDirty/绑定视图状态提示待存，不加草稿/保存协议，不自动再存；结构目录延期继续由requestRefresh承接。该消息属于原生页面消费回执的责任，不更改DataSet成功含义。

I5原生视图反馈实施结果：普通保存/未知核验两项均先在消息断言失败，实际原捕获47已落文件、后续58保留且只有一次写入。commitDefinitions复用localDirty优先提示本轮已确认但仍有修改；两个完整生命周期在第二次显式保存后分别独立重开47/58通过（i7-view-feedback-second.log）。初次绿色运行中的两项5秒超时保留原日志；只把这两项两次保存/重开用例设为15秒，没有放宽全组。7项定向运行中的另5项已通过，整页影响面回归在验。

I4/I5关系与级联反馈接续方案：继续沿实际消费者核对，两个编辑器的普通save和verify也仅按原回执设置全部成功消息。先复用上述存储回执延迟夹具，在实际关系/级联定义DataView保存中写入后续修改，验证写入次数、待存状态、再次保存和独立重开；仅复现后调整现有localDirty消息分支，不新增状态、保存通道或后台协议。此检查不以源码文本命中直接认定缺陷。

I4/I5关系与级联反馈结果：级联两个反例先失败；关系初次用例只单击画布，尚未进入编辑器，改为正式双击入口后普通/未知两个消息反例均复现。四处回执消息复用现有localDirty；新4项及相关10项通过（i7-edge-cascade-feedback-green.log），该组另1项旧多父级联用例5秒超时，不记整组通过。整页3文件回归298项通过、5项5秒超时；最后输出停顿时准备终止对应worker，但进程身份核验发现已经自然退出，未结束其他进程。只重验这些长操作用例，不重跑已通过无变组。

I5画布布局接续方案：沿消费者发现DataSpaceLayoutEdit在save/verify确认后调用reset，而reset无条件discardPendingChanges，可能清除同一正式布局DataView的后续修改。先延迟真实存储回执验证原坐标捕获、新坐标、未知核验及独立重开；若复现，区分显式取消与已确认提交的收尾，仅释放命令状态并保留DataView后续变更及可继续保存的基线。页面按真实pending反馈；不建第二份布局草稿或自动补交。

I5画布实施结果：owner两项及实际画布两项反例均证实确认后新坐标丢失（i7-layout-later-red及ui-red）。save/verify改为reset(false)，保留DataView修改并将命令基线更新至本轮确认文件；显式取消/采用远端仍沿原路径。owner整文件46项通过，普通画布/未知核验/冲突采用/排序/独立重开6项通过；后续补普通与未知重建入口，页面、重建与新节点绑定影响组45项通过（i7-layout-final-ui）。后续坐标仍显示，save/cancel按钮可用，再次显式保存才产生第二次写入，取消回到已确认坐标。源码范围为布局owner与原页面，不改变字段权限或资源提交协议。

I1/I5 2026-10-16接续方案：继续核工作区refresh/adoptViews的分步重读。LowcodeDataSpaceDefinitionDraft.reset在调用原DataView.refresh前自动discardPendingChanges；外层仅在异步链开始核干净，两个定义视图依次重读之间可能出现新编辑。先用真实session/DataSet，仅在第一份定义实际查询完成后延迟其返回，向下一份定义写入编辑或暂存；分别验证刷新与明确采用远端的精确取消范围。若复现，由原DataView覆盖守卫拒绝重读，移除业务层自动取消；显式采用仍只由adoptSource处理用户选定草稿，不添加第二份状态或查询协议。随后验保留修改的显式保存/重开与取消恢复，更新当前编号事实。

I1/I5接续实施事实：4项真实session反例分别覆盖refresh/adopt × 编辑覆盖/已暂存；均先在businessCategory新值丢失断言失败（i7-reset-scope-red）。生产代码只删除DefinitionDraft.reset中的自动discard并更新方法说明，复用已有DataView守卫，不追加页面状态。4文件225项通过，含保留草稿后的显式保存、独立重开和取消再刷新。真实视图编辑器从预览→采用远端→另一绑定新编辑→提示拒绝覆盖→再次保存→独立重开贯通，远端pageSize=44与新businessCategory同时保留，只有显式保存写入一次；该页面影响组11项通过。工作流组实际匹配4文件78项通过；最初命令含不存在的model-source.test.ts过滤项，没有据此宣称它运行，来源结构另用真实model-source-edit.test.ts路径复验。

本组最终影响面：模型来源替换/创建/删除、数组改名及字段删除5文件322项通过；typecheck和3个显式源码/测试路径lint通过。正式ClassModel生成880文件/1821符号/1459索引，49项门禁通过，既有2219条semantic gaps未扩大为本组完成声明。已核生成的DefinitionDraft.reset说明明确“不取消新编辑”。证据目录保存修改前3份快照、反例及各组输出；旧全包和整页日志不重复算作本组新验证。

I1/I3/I5 2026-10-16后续恢复矩阵（本轮实际审查，不替代线上验收）：

| 业务区域 | 本次输入/回读/取消责任核对及实际结论 | 行为证据与边界 |
| --- | --- | --- |
| 空间参数 | InputParameterEdit.save/reload仅原目标读写，显式discard发生在首次await前；原提交回读后新编辑仍pending，parameterAction原先关窗及成功消息失真，现保留窗口并提示待存 | 新save/verify两个真实标准入口反例先失败，后续显式保存及独立重开通过；metadata原测试含未知、不重放、权限/作用域、并发与回读失败；本轮231项来源/参数组及35项页面影响组 |
| 模型/字段/来源入参联合核验 | FieldEditor.run及ModelEditor.run在前项回读后计算后项pending并discard，4种编辑/暂存交错丢失。原三个owner增加同步prepareReload/prepareReloadBatch，页面先捕获全部本次目标、准备明确取消范围，再顺序执行只读回读；后续草稿由原DataView拒绝覆盖。按钮文案覆盖本工作区入参pending | 4项真实按钮先红后绿；9项定向恢复、269项6文件owner/字段删除影响组通过。显式第二次选择可放弃刚才保留的草稿，核验不重放，后续新保存和独立重开通过 |
| 来源同步/替换 | ModelSourceEdit.verify对映射/依赖模型已有逐目标原快照与编辑覆盖检查；新增/删除字段原先只查dirtyTracking，首次回读后编辑覆盖可能被重复核验清除。现两类目标均检查hasEditingChanges后再核原暂存；未修改原同步/替换持久合同 | 新增字段编辑态反例先失败；新增/删除×编辑/暂存4项通过，包含部分删除仍存、显式采用及重开。166项来源整文件与参数65项同组通过。两个初次删除夹具分别误用了仅替换可用入口、遗漏omitDeleteWrite，失败日志保留且不算产品反例 |
| 数组条目/表头/改名 | ArrayEdit.discardOwned原先只有dirtyTracking存在才检查编辑覆盖；第一次核验被新草稿挡住后，第二次会清除仅编辑态标题。现无条件查原目标编辑覆盖，已暂存仍对原捕获快照；明确discard不改 | 新两种交错中编辑态先失败，修复后数组headers/items/rename/field-references 4文件88项通过，核验只读、显式取消后确认与独立重开；原partial、缺删除回执、异空间和旧配置保留用例仍通过 |
| 模型/字段删除 | ModelRemove.assertClean在discardOwned前拒绝编辑/新增/修改草稿，仅允许本命令原删除；清理后清空原staged集合。FieldRemove.confirm接纳回执即清staged，verify清理只执行一次，再由原source查询覆盖守卫和依赖视图检查保护后续草稿；没有发现上述重复清理路径，不机械删除合法取消 | 模型删除本轮无修改，沿i7-reset-scope-structures已有unknown/其他编辑器草稿/范围改变/布局接续/重开证据；字段删除受联合准备影响已包含本轮269项，含unknown、真实回执后失败重读、仍存记录及页面恢复弹窗 |
| 模型改名 | 原命令捕获原模型/引用，discardOwned校验目标编辑与快照并清原pendingRows；DB与文件独立核验，工具文件后续编辑保护已在前轮修复。本轮未改该owner或工具适配 | 沿i7-reset-scope-workflows已有取消、丢DB/file回执、后续工具编辑、并发引用/场景、独立重开证据；只复核当前责任函数，无新增反例，不重跑无变组 |
| 切换/关闭/其他定义区 | 原session身份、原查询上下文与dispose守卫继续生效，页面脏状态来自原DataView。空间参数本次不再因原提交确认而关窗；其余视图/关系/级联/布局沿上一轮证据 | 本轮页面35项含参数错误/取消、来源参数、联合核验和异目标/unmount；前轮八区矩阵继续适用其离线范围，不能据此宣称参考视口1:1或实际C已验 |

本轮验证：新交错用例共12项，页面、owner与来源/数组组有重叠，不能累加成整页覆盖数量。typecheck、11个显式路径lint通过；正式ClassModel编译880文件/1821符号/1459索引，已读生成prepareReload成员与说明，49项门禁通过，2219条历史semantic gaps仍保留。原视图/关系/级联/布局未改不复跑。实际服务、线上取消/部分成功与未知核验、视觉、T=C及旧聚合迁移仍是I7/I2未闭合项。

### I6：自描述与共享配置的最后一段统一

本次差异方案：实际旁路为page-design-agent-run-provider/ai-runner的load/saveScenarioViews、workflow-binding的setText指引及DevSystem/useDevState、DevDataSetDesigner的原文编辑/撤销/恢复。缺口是ProjectWorkspace尚无持有正式C DataSet的宿主入口；新增loadScenarioDefinitions/getScenarioDefinitions，宿主注入按T装配C及五类文件资源的加载器，沿现有ScenarioDefinitionResource完成数据层存储。按工作区与请求scope复用同一DataSet，切换失效并销毁；不创建表、伪造模型或添加第二份草稿。AI先改从此DataSet查询/编辑/提交选中的定义视图，原文件方法从AI可调用面拒绝；随后迁移DevSystem手动编辑、撤销、历史恢复，不能只改提示词。公开声明变化须正式编译刷新ClassModel并补指南及范围测试。工具三文件交付保持原责任方，文件未知结果仍由原资源适配核验。

I6初始组已验：正式C工作区装配、同目标复用、延迟定义查询、T=C自描述及独立重开通过（i6-chain-ai-second.log中的chain16项）；缓存返回遇scope变化的反例已修复，迟到DataSet销毁。AI交付、共享手动/受限AI DataView编辑、手动不自动提交、未知文件回执不重放及scope生命周期21项通过（i6-ai-lifetime-green.log）；另外操作门面/runner7项在i6-chain-ai-regression.log通过。测试曾误用不存在的getEffectiveRowById及无Orders绑定的布局，均已按DataView.getEditingRow/真实表引用修正，不算生产缺陷。该组typecheck、14路径lint、正式ClassModel生成及49项门禁通过；后续DevSystem实施及最终结果见本项下文，实际服务未核销。

DevSystem接续方案边界：整份配置编辑是明确命令，读取五类定义视图仅为此工作区消费，不扩大普通保存的读取集合。原文展示和撤销历史应从同一DataView的有效行派生，文本应用转换成已有定义资源差异；不可把有效文本再作为第二份可保存草稿。根级schemaVersion/version/saveChanges仍按3.3合同保留，旧关系转换不能由改数字绕过。远端历史列表/预览/创建属于来源能力，当前DataViewSource只有preview/adopt；需在同一来源合同补可选历史操作与异步身份/dirty保护，由ScenarioDefinitionResource接原存储，恢复则把已预览定义写入DataView后DataSet提交，删除业务层restoreScenarioVersion直写。先补来源历史行为测试，再改DevSystem消费者和标准组件接线，不另造历史表或新后端协议。

I6新增实施事实：DataViewSource补可选list/preview/create历史合同，创建快照核同源全部视图干净、请求身份及期间任何变更；ScenarioDefinitionResource转接内部存储历史。ScenarioDefinitionDocument从五类正式定义视图投影完整配置，文本应用/撤销只修改这些视图；根级不可变属性与完整读取检查防误删。DevSystem/useDevState的编辑、保存、撤销和历史恢复已移除文件直写，DevPreviewTab也从定义视图生成预览配置。工作区saveAll漏存DataView与dispose未释放反例先失败，随后修复；saveDirtyScenarioDefinitions统一保存已加载修改，DevSystem删除重复提交循环。resetAppProjectWorkspace调用dispose，迟到加载拒绝注册。来源29项、定义资源含文档49项先通过；最新资源52项通过，覆盖外部修改使旧撤销失效、重新查询失效、未知保存先核验再确认；工作区/资源/DevSystem与三文件5组72项通过（i6-workspace-dev-regression.log），类型检查通过。真实标准按钮测试发现撤销可用性刷新晚于视图事件，增加文本命令完成事件后复验，不能用浅挂载通过掩盖实际交互。当前日志i6-document-ui-regression.log保留此失败。

I6组件与指南对应：正式生成i6-dev-classmodel后，从manifest定位RendererButton与SparkJsonEditor，核RButtonProps的label/dataViewKey/disabled/loading/buttonType、SparkJsonEditor Props的modelValue/readOnly/height/mode及源码JSDoc。操作控件改为RendererButton，继承当前正式DataViewDefinition上下文；完整配置使用ScenarioDefinitionTextEditor窄结构交互，显式绑定document所属五类定义视图，内部复用基础JSON编辑器，不伪造根文本字段或宣称其为通用标准字段组件。历史原文只读pre显示，不参与保存。最终公开声明生成与门禁尚待最新变更后执行。

I6后续修正及验证：真实标准按钮的撤销刷新问题修复后，文本/预览12项通过（i6-preview-shared.log）；来源历史、DevSystem与门面4文件116项通过（i6-history-final.log），含变化预览、跨目标快照、等待期间新编辑拒绝恢复、原DataSet未知核验后才确认新文件。工作区旧restoreScenarioVersion及宿主scenarioViews.restoreVersion直写已删除，原相关测试迁移到定义恢复链，工具三文件版本行为保留。快照底层list/read等待期间的定义守卫缺口由红转绿（i6-history-gateway-red.log → i6-history-final.log）；守卫传到实际上传前后，不只在外层await前后检查。项目模型4文件228项通过（i6-project-model-third.log），少4项是被替代的直写恢复测试已移除，不是覆盖隐藏失败。AI/来源/生命周期等9文件128项通过（i6-integration-final.log）。正式生成880文件、49项ClassModel门禁通过，公开新增方法及已删除恢复方法同步派生；文档353项通过。DevSystem按需加载反例另发现选中节点即打开完整文档，已改为进入数据规划时挂载并加载，控制器测试同步显式打开；最终类型/lint/相关回归在验。

I6请求配置核定：DataSpaceRequestConfig复用FormalTableRequestConfig，查询使用api.list或正式GetData，提交使用活动create/update/delete端点或正式BatchTableOperateRequestByCRUD；端点/超时不一致同批拒绝，不覆盖运行身份请求头。旧addApi/updateApi/deleteApi保存的模型名不转换成URL。I5整页测试已覆盖标准字段修改api与timeout、取消、保存后重开及实际前端发出的请求；这证明前端合同，不证明任意自定义后端地址支持正式协议。

I6收敛结果：按需加载修复后3文件30项通过（i6-dev-lazy-second.log）；只有数据规划实际挂载或预览时才加载定义，选节点不预读，切换释放投影保留工作区DataSet修改。T=C贯穿用例扩大到模型crudConfig、命名视图、级联端点及布局同批保存；独立新工作区读取新配置，选择新命名视图的模型后实际查询所属字段，默认全字段视图仍Idle；再独立打开C读回布局（i6-self-description-complete.log，仅1项通过、15项未执行，不冒充整组重跑）。最终typecheck、33路径lint与显式diff --check通过；文档及生成产物说明与源码一致。所有通过只属离线；I6完整线上自描述仍不勾销。

输入/输出：设计器A设计自身C后，A与普通业务页一样由保存的C装配运行；AI/DevSystem修改同一场景时也沿SPARK data编辑/取消/保存。
主要源码：
- src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts、packages/spark-project-model/src/page/runtime-page.ts、scenario/scenario-definition-resource.ts。
- src/services/page-design/page-design-agent-workflow-binding.ts：已改正式DataSet/DataView指引；原文owner从AI面拒绝。
- src/services/page-design/page-design-agent-run-provider.ts：已按目标T选择修改视图，DataSet提交。
- src/views/app/dev-system/useDevState.ts、DevDataSetDesigner.vue、DevPreviewTab.vue及definition/ScenarioDefinitionTextEditor.vue：共享定义编辑、标准按钮、历史恢复与预览。

- [ ] 用T=C维护设计器所消费的绑定、命名视图、级联和布局，保存后独立打开A，证明消费新配置；普通页面B消费自己的C遵循同机制。
- [ ] 核DataTable.api/crudConfig输入输出与当前实际适配；旧addApi/updateApi/deleteApi仅保存的模型名不自动转URL。
- [x] 上述已知旁路及DevSystem入口的源码/离线链已核共享草稿、撤销、历史恢复及交付范围；本次补未知恢复及AI残余草稿回执。实际服务验收归I7。
- [x] 对应生成指南及错误说法已更新；正式ClassModel刷新并校验，未建设新的AI生成器；三文件仅修复本轮真实跨来源保存失败的核验责任。
- [ ] 验证两个页面/多空间共享配置、同名模型隔离、取消只影响本次草稿、跨来源部分成功和未知结果；工具三文件与场景共享文件不混写。

验收命令：
~~~text
pnpm exec vitest run tests/runtime/auth-nav/data-space/metadata/chain/data-space-chain.test.ts tests/app/services/page-design-agent-run-provider.test.ts tests/runtime/page/runtime/page-scenario-inputs.test.ts tests/runtime/page/runtime/system-page-dirty.test.ts
~~~
完成条件：设计器自洽与相关场景编辑消费者实际遵循同一SPARK data链，旁路缺口有逐项证据，不能只修改提示词宣称完成。

I6未闭合项复核（2026-10-16）：T=C的源码链已由chain `saves the designer own C...fresh designer and page runtimes`覆盖，实际修改模型crudConfig、命名视图、级联与布局后在新宿主消费，不能据此说明部署C已升级。api/crudConfig由TableConfiguration绑定ModelBindingDefinition，装配后FormalTableRequestConfig/DataSpaceRequestConfig给实际查询及CRUD owner；旧addApi/updateApi/deleteApi保存模型名称，未自动映射成URL。共享工作区由ProjectWorkspace.loadScenarioDefinitions/getScenarioDefinitions复用同一正式DataSet，ScenarioDefinitionDocument文本/撤销只是其投影；DevSystem、AI交付、来源历史与预览已接该链。i6-self-description-complete、i6-history-final、i6-integration-final及后续工具/定义未知恢复记录分别支持这些行为，本轮不重复执行。三个未勾项分类均为**当前原生合同已实现且离线验证，缺实际自描述/多宿主共享/端点执行验收**，对应B16、B24、B25；旧模型定向操作自动迁移仍不支持，必须另有实际执行合同才能改变现有保留策略。

### I7：整阶段验收与交付

2026-10-16生产构建接续（构建及静态产物检查通过，整阶段未完成）：B14模型改名/删除的原owner及页面恢复边界复核未发现新的具体反例，现有真实标准控件和来源测试已覆盖本次所查路径，不重复运行。本轮按原build:fe的ClassModel完整性检查→Vite生产构建链验证，只将outDir设为仓内未存在的node_modules/.cache/i7-production-build-20261016以保留原dist，不访问业务页面、不改变发布地址。Vite8.0.16转换3112模块，4.09秒构建完成、退出0；产物1044文件，含98个JS及52个CSS。通过TypeScript AST核JS静态/字面量动态导入、JSDOM只解析index入口及CSS url，共543引用无缺失、无非字面量动态import；复制后的ClassModel完整性检查通过。前组33项源码/生成产物hash一致（排除台账）。日志i7-production-classmodel.log、i7-production-build.log，明细[验证清单](evidence/data-space-config-storage/i7-production-build-verification.json)。构建告警为VueUse纯注释2处、CodeMirror静/动态混用4处和spark-app约1578kB大块；未为消除告警修改依赖或拆包。本次无生产修改、不重复无变行为测试，构建及引用完整性不证明浏览器初始化、实际服务或持久化，B01—B25原未闭合段不变。后续仍需L/S事实或新的具体源码反例，不能将产物另开服务访问作为浏览器限制的替代通道。

2026-10-16浏览器限制专项诊断（用户要求研究恢复方案）：输入为原始工具拒绝、原会话调用上下文、对应应用日志、当前正式浏览器API和OpenAI官方文档。已确认当前公开文档页可打开/读取、旧变量失效与同秒路由缺失、旧站点允许配置已含5273；尚未取得旧策略实际检查的URL，不能宣称根因是CORS或未授权。修复独立环境问题：原5273零监听，使用原配置启动Vite并核回环监听；未访问原受限目标、未改安全策略或业务代码。具体判断、受支持恢复步骤、用户需核查的确切来源与B01/B02接续条件均在[i7-browser-diagnosis](evidence/data-space-config-storage/i7-browser-diagnosis.md)；L仍未核销，但不再把空清单/历史拒绝等同于浏览器整体不可用。公开页通过、端口就绪、原目标获准及业务验收是四项不同证据。

2026-10-16继续深入调试：输入为原会话最后成功调用、原日志18:43—18:50片段及当前CUA/Browser包源码。输出[i7-browser-url-state-trace.json](evidence/data-space-config-storage/i7-browser-url-state-trace.json)，19条限定日志与4个源码hash/片段。已证实同目标HTTP连接拒绝后加载data错误页；当前getTab自动AX读取按当前URL校验，能解释后续协议拒绝，原门禁实际参数仍缺。原16:01绑定成功、16:14最后观察成功与18:43恢复后新browserTabId已区分；占位会话身份与ownerRoutePath不一致，其后有route capture，最终getInfo仍失败。旧runtime cfb32733c877621e已不在当前安装目录，不能以现行源码冒充旧版实测。没有执行内部API、修改工具、发送业务HTTP或重新访问受拒页面。系统端口复核127.0.0.1:5273/PID37892仍监听；前端连接故障已具备修复条件，剩余为产品正式重建页面/会话及准入结果，完整I7仍未完成。

本次诊断记录验证：错误页内嵌目标与原受拒调用URL逐字匹配；4个只读源码文件hash及全部提取片段与原文件一致。verify:docs通过357份文档，日志i7-browser-url-state-docs.log；限定路径git diff --check通过。未改业务代码，未重复运行无变业务测试，未将文档或静态追踪通过当作浏览器恢复。

浏览器诊断验证：文档356文件、台账diff及诊断空白检查通过；前轮33项源码/产物hash仍一致（排除已更新台账），未复跑无变业务测试，清单见[i7-browser-diagnostic-verification.json](evidence/data-space-config-storage/i7-browser-diagnostic-verification.json)。原目标权限状态已向用户提出具体核查，等待产品侧信息，不以公开页通过自动推定解除。

远程网关续验：本轮沿原地址完成仅DNS/TCP/TLS诊断，默认校验证书通过，原前端进程仍在运行；请求接线已核至LowcodeRuntime的正式HTTP实例及DataSpaceDesignApi的GetData路径。未发现可据实修改的地址缺陷，未将历史502误报为当前故障，也未复跑无变业务测试。原目标安全拒绝的实际URL和产品侧准入仍无新增证据，下一动作沿上方I7/L方案；本次连接层结果单独留存，不核销B01/B02或S服务合同。

自主恢复续查：当前Browser.capabilities.list实际只返回visibility、viewport；可用工具无浏览器来源权限恢复或应用反馈发送接口。未将普通插件审批接口误当来源授权，没有复制会话allow记录、修改策略或重试业务目标。i7-browser-support-report.md记录原调用ID、版本、协议错误与路由关联、已验连接层和待工具方核查的实际URL，仅本地保存。此次新增证据收窄的是自主恢复能力边界，不是证明根因或解除L；不再将“用户泛查设置”写成必然有效的修复。文档357文件及台账diff/证据空白检查通过，日志i7-browser-recovery-capability-docs.log；本轮未改业务代码，未复跑无变业务测试。

恢复复审前的离线事实：spark-data全包42文件927项、项目模型4文件228项及当时门禁通过，范围与源码hash见[i3-i7-offline-verification.json](evidence/data-space-config-storage/i3-i7-offline-verification.json)；不作为本次后续改动的最终证明。

本次恢复复审的输入、输出及验证：

- 输入为原DataSet返回/异常、真实模型改名链、DevSystem全部保存与标准场景按钮、AI交付；没有虚构新的总保存业务入口。源码变化及正式编译产物见[i7-recovery-verification.json](evidence/data-space-config-storage/i7-recovery-verification.json)。
- 修复前反例保留i7-recovery-ui-red、new-edit-red、discard-red、context-red、tool-recovery-red、tool-unknown-adopt-red、rename-recovery-ui-red、ai-recovery-red。分别证明真实按钮不能恢复、新编辑混批、取消后未知丢失、其他草稿误归原提交、工具重复写入、未知绕过历史恢复、阶段提示缺失及AI误报saved。
- 数据层最终针对组2文件77项通过（i7-recovery-data-final）；spark-data全包42文件929项通过（i7-recovery-spark-data，随后静态返回映射与lint修正由77项针对组补验）。恢复捕获只在owner明确持有原上下文时生效，原DB命令回读语义不改。
- 原生整页/模型改名/工作区3文件336项通过；贯穿链原16项15项通过、1项旧期望要求核验同时提交未派发来源。按新合同改为两轮显式提交后DB/file两用例2项通过、14项未重复跑（i7-recovery-native-chain及i7-recovery-chain-second）。没有把有失败的原日志冒充整组通过。
- 项目模型与真实共享消费者6文件254项通过（i7-recovery-workspace-final）；包含工具未知后场景草稿用真实标准按钮独立保存/撤销、已确认工具不重写、保存期间新编辑、冲突与显式采用。AI交付3文件27项通过（i7-ai-recovery-second）；旧runner夹具仅mock成功却不接纳保存基线，已改用原保存方法接纳，未放宽生产判断。
- 类型检查与26个显式源码/测试路径lint通过；正式ClassModel生成880文件/1821符号/1459索引，4文件49项门禁通过；既有2219条semantic gaps未宣称全清。查询过manifest目录及DataView、ProjectWorkspace、PageTool与RendererButton成员/指南；新状态只读，不建立新草稿。文档353文件及显式路径diff检查通过，Git换行提示保留在日志。证据清单记录49个源码/文档/生成文件hash及22份日志；初始718条修改路径仍在当前757条状态中，此对照不等于所有文件内容未变。
- 本轮没有访问被拒目标、未改/启动Java、未改线上数据、未提交推送；各检查有重叠，不能累计宣称独立覆盖总数。

标准保存动作接续复审（独立于前组证据）：

- 已复现监督原反例，日志i7-action-recovery-red；原监督artifacts未修改。正式元数据配置→ScenarioDefinitionResource→DataSet→executeSaveDataSet，只替换传输/存储，先证明写入一次、远端43、本地58仍编辑，再断言通知失败。修复后原监督反例1项通过（i7-action-supervision-green）。
- 生产改动仅action-data.ts的executeSaveDataSet：调用前复制本次views/ids并捕获实例，成功回执后读取原视图hasUnconfirmedSave、dirtyTracking.hasPendingChanges及hasEditingChanges；范围内仍待存则warning，不使用successMessage。无新保存入口，无自动后续提交。default、具名视图、全部视图与指定行按原DataSet合同判定。
- 新正式测试save-dataset-recovery.test.ts的10项通过（i7-action-scope-final）：编辑/已暂存两态、范围外行和非默认视图、全数据集未派发视图、显式具名视图、applyEditingRows=false、普通提交等待期间新编辑、等待期间选择变化、标准按钮本地discard后未知核验。按钮实际可点击，原错误通知可见，恢复后原mutatingError清除；无需修改按钮或权限规则。按钮最初测试曾碰到旧测试helper不支持完整键及子wrapper不能unmount，已改为真实PageRuntime和根挂载；后续红日志只剩真实错误成功提示。
- 公共动作/声明式事件/CRUD桥/事务夹具/原查询权限/按钮影响组6文件84项通过（i7-action-regression-final）；随后测试仅将私有getRowById误调用改为公开rows与getPkKey，10项再验通过，最终typecheck通过。显式2路径lint通过；公共声明未改，保留上组正式ClassModel而非无意义重建。最终文档与diff结果归[i7-action-verification.json](evidence/data-space-config-storage/i7-action-verification.json)。
- 复核标准按钮与声明式事件均路由至同一executeSaveDataSet，没有第二条save-dataset实现；本轮已证实的公共动作缺口已闭合。其他页面直接保存是各自已有命令，不能凭文本命中认定同样缺陷，也不能将本轮通过扩称整页验收。I7下列服务/视觉及I2聚合合同缺证仍保留。

原查询保护与原生消费者接续复审（本轮）：

- I1已复现并修复取消本地草稿后refresh/clear/reset/rejectCascade破坏未知提交原查询，以及requestRefresh提前执行。7项真实定义资源生命周期用例加入；44文件1001项通过（i7-refresh-data-regression），原采用远端合同仍通过。DataView类型/显式lint及正式ClassModel生成、49项门禁通过，派生DataView说明已核对；其余业务文件无公开声明变化。
- I5原生视图、关系、级联六条反馈反例已修复；每项均证明只确认第一份捕获，后续编辑保留，第二次显式保存及独立重开正确。初次关系用例未双击进入编辑器不算产品反例，改正入口后的red单独保留。初次视图两项超时后仅为该双保存/双重开用例设置15秒时限。
- 原生整页/模型工作区/工作台3文件回归298项通过、5项旧长流程5秒超时（i7-refresh-native-regression）。隔离仍有3项超时；只对这5项使用命令级15秒时限，全部通过（i7-native-slow-verification），未改变业务断言或全仓配置。关系/级联组14项通过、1项同一多父级联超时，也由该5项复验覆盖。没有将失败日志写成整组通过。
- 布局owner与真实画布确认反例证实后续坐标被收尾取消，现已修复；46项owner、6项原画布及最终45项页面/重建/新节点影响组通过，各组重叠不累加。最后类型检查先发现新测试两处可选关系访问及一处索引语法错误，按类型合同修正后typecheck通过（i7-refresh-typecheck-final）；最终10个显式源码/测试路径lint通过。
- 本轮文档353项通过；10份修改前快照分别与当前文件执行no-index diff检查，另核定跟踪的源码、合同、台账和ClassModel差异，只有既有Git换行提示，无空白错误。源码/文档/派生产物hash与31份日志归[i7-refresh-view-verification.json](evidence/data-space-config-storage/i7-refresh-view-verification.json)；i7-action-verification与i7-recovery-verification保留为历史范围。没有读取凭据、重试被拒页面、修改/启动Java、线上写入或提交推送。浏览器拒绝原始记录已核对：工具报告URL策略阻止并禁止替代通道；已请求工具侧解除限制的确认，不能以用户开发授权替代恢复证据。

2026-10-16分步重读接续证据：生产修改、5项新增行为测试、正式派生产物、产品合同及当前台账的hash见[i7-reset-scope-verification.json](evidence/data-space-config-storage/i7-reset-scope-verification.json)。前轮证据是历史hash，不能要求它与本次改动后的文件仍一致。已完成的定义链、实际组件、工作流与结构命令回归范围见I1/I5；实际服务、旧聚合等价合同与参考视觉缺口不变。

2026-10-16业务区域恢复接续证据：[i7-workspace-recovery-verification.json](evidence/data-space-config-storage/i7-workspace-recovery-verification.json)记录本轮8个生产文件/3个测试文件修改前快照、当前源码/派生产物/文档hash、失败与通过日志。来源删除夹具的两次准备错误分别保留在green/validated命名日志中，最终source-parameter-regression才是完整来源通过证据，不能仅据日志名判断通过。未改模型删除/改名沿前轮明确范围，不把它们计为本次新执行；浏览器拒绝未解除，未读凭据、未重试被拒目标、未改或启动Java、未线上写入、未提交推送。

完整业务覆盖接续（2026-10-16）：已检查I1—I6全部未勾项，并在各项就地补齐参考语义、真实消费者、当前实现、历史验证和未闭合段。下面25组是本台账原范围的验收断点，不是新计划；B14、B17中的不同命令分别记录结果，不能一项成功代表整组通过。本轮仅改台账与证据，没有新生产修改，也没有复跑上轮8个文件/12项交错用例；独立复核126项hash一致仅覆盖那一轮。

解除条件定义：**L**为原受限工具的访问限制确已解除，且实际运行服务、授权身份和可审计的隔离目标可用；不能以换浏览器、CDP、原始HTTP或新会话绕过原拒绝。**S**为取得实际部署服务对应的明确合同及可核请求/响应证据，包含版本、身份、过滤、结果及失败语义；本地Java源码或自行编造的夹具不足以代替。已有合法留存的服务证据可先解除对应S项，无需等待视觉。L和S是依赖事实，不是要求用户再次批准已授权开发。

| 编号 / 业务操作 | 当前实现、证据归属及分类 | 缺少的具体证据；离线为何不能补足 | 合法解除条件与首个验收/实施动作 |
| --- | --- | --- | --- |
| B01 正式C启动并设计单目标T | I1 deferred入口及目标守卫已有组件/chain证据；缺部署验收 | 当前部署C原文、正式元数据模型绑定、URL的T、首屏实际读取范围；仓内文件和夹具不代表线上C版本 | L；先读实际C及隔离T，记录C/T身份，验证无视图配置的T可进入、字段default未预载；再切换T确认旧响应与草稿不会串入 |
| B02 空间参数编辑、取消、保存与重开 | I1参数owner及标准窗口已实现；上轮新编辑不误关窗已验 | 实际Base_DataSet参数原值、类型、写回回执、新实例读取及依赖视图调用值；本地回执无法证明远端持久化 | L+B01；在隔离T增改一个有类型的参数，分别取消与保存，重开并由绑定视图使用该值；保留原提交核验后仍有新编辑的界面状态 |
| B03 数据库表来源、别名及业务CRUD | I3真实SourceCatalog/Reader→ModelCreate→重开查询已有贯穿；业务CRUD缺服务验收 | View_TblList/Base_TblField真实字段、主键和别名回包；目标表新增/修改/删除的实际提交策略、回执与重查；元数据可新增不等于业务写入成功 | L+B01；选一个可审计测试表，带回并保存模型，命名视图按别名读；以标准组件分别取消/提交单行，核回执及新实例结果 |
| B04 数据库视图来源及可写性 | I3库身份、字段读取和替换接线已有离线证据；具体视图能力未知 | View_ViewList身份及实际来源是否可写、哪些操作支持、拒绝如何返回；不能按资源名称推断全部可写或全部只读 | L+S；先核目标测试视图的能力与查询输出，再只验证已确认支持的写操作及正式拒绝路径，不套数据库表假回执 |
| B05 字典设计与六字段业务数据 | I3读取独立已保存设计、标题/编码类型、六字段模型创建已验 | 实际字典设计归属、数值/文本编码回包、六字段条目CRUD及引用消费；夹具无法证明部署设计与数据一致 | L+B01；选择已有隔离字典设计，模型带回后在数据视图编辑/取消/保存条目并重开，确认条目保存没有夹带标题或编码设计修改 |
| B06 外部接口参数、输出与失败 | I3接口ProviderID、字段、_Base_ParamList及mapped/direct接线已有证据；执行能力待验 | 实际接口参数类型/映射、别名输出、空值和失败回包，以及是否存在获支持的写操作；前端枚举与平面响应不能证明这些合同 | S后L；先固定一个已确认接口及非敏感参数，分别以预览direct和保存后mapped调用核等价结果；用正式失败响应核错误状态，写能力仅依实际合同验证 |
| B07 JSON来源的节点身份与编辑 | I3六项节点字段和真实reader贯穿已验；实际节点CRUD待验 | Base_JsonData对应资源的根/子节点形态、稳定唯一键、修改与删除范围、重开结果；内存六字段夹具不足以证明真实节点归属 | L+S；读取隔离JSON资源及一条节点身份，以正式视图做单节点取消/保存/删除并重查，确认相邻节点和未加载内容保留 |
| B08 逻辑视图平面来源与输入 | I3来源装配、字段/参数及mapped/direct平面查询已验；内部执行合同待验 | 实际Base_DataViewList设计、内部OutputType/ChildTables、输入合并和空/失败结果；外层queryConfig不等于资源内部设计 | S后L；先核一个已保存平面逻辑视图的内部定义和响应，再通过命名视图传参、保存、重开消费；嵌套部分单独依B12处理 |
| B09 两命名视图的过滤、参数、排序分页 | I2 east/west真实标准控件保存/重开及独立查询已有证据；缺服务验收 | 两视图的实际请求、类型化输入、过滤树和值函数、排序/翻页后的同一配置及结果；夹具按期望计算不能证明后端解释一致 | L+B03；创建两个不同过滤/pageSize的视图，分别取消/应用过滤、排序翻页并独立重开，记录兄弟视图未被改动；任意嵌套函数不在此项冒充已支持 |
| B10 SelfRef查询树 | I2树字段、方向、节点参数及不发PageParam已离线核；缺实际树验收 | 真实节点键、父键、起点与方向、完整性/总数和权限返回；有限夹具不证明实际树无截断，旧selfType=all也不能自动等价 | S后L；固定可核父子链和起点，以真实请求确认无PageParam及方向，再由绑定视图展示并重开；如服务语义不符，沿原树适配修复 |
| B11 Join叶节点与嵌套结果 | I2叶Join显式ChildTables=[]已接；合同保留历史叶查询记录，当前版本及嵌套未验；嵌套消费者有实现缺口 | 实际嵌套ChildTables结构、数组挂载名、子记录身份/权限和分页范围；叶请求成功不证明子视图消费，FieldJson保留对象不等于绑定子DataView | S后L；先核当前叶Join结果，再取得最小父子响应合同；据此在公共查询/结果链接入子视图身份与标准绑定，验证独立重开，不能从稳定关系猜SQL子表 |
| B12 HierarchyData/Navigation及主从一次输出 | I2/I3外层模式可保存/派发，行内结构可保留；根分页及子视图消费未完成 | 资源内部OutputType、ChildTables、Items或子表名挂载、根集合分页/total、子模型字段与查询权限；平面id响应不能确定这些语义 | S；取得实际部署的最小主从定义与带权限响应，先设计原查询owner如何登记根/子身份，再补spark-data消费及标准组件绑定；L后验证真实根分页和子结果，不逐页拼装或推导级联 |
| B13 缓存、刷新与完成函数 | I2 DataSpaceQueryCache及SparkPageRenderer原生onRequestComplete已实现并有测试；旧DB文本未自动迁移 | 实际浏览器同JS会话/页面销毁/身份变更后的请求次数与缓存清理、完成函数参数及释放；源码测试不能证明宿主真实生命周期。旧RequestComplete没有可证的文本执行语义 | L；用已声明原生函数观察query/refresh/save/离开/切换身份，再核旧异步结果被释放；仅在另有S时考虑旧文本显式迁移，保留原文、不eval |
| B14 来源同步/替换、字段结构、模型改名/删除 | I3每命令读取/提交集合及514项结构组、后续恢复已有证据；缺逐命令服务验收 | 同步差异与新增/删除集合；替换映射及参数；字段输出/联合主键/引用；模型改名的DB→文件→工具阶段；删除正常级联与历史孤立记录。内存数据不能证明实际引用完整或每次级联成功 | L+隔离数据；分别执行同步取消/确认、显式替换、字段改名/主键变更、模型改名和删除，逐项保留查询/差异/回执/重开；普通属性保存不扫描全目录，孤立记录仅诊断、不自动清理 |
| B15 数组表头、条目与同时改名 | I3四类数组及上轮重复核验保留后续编辑已有证据；缺服务验收 | 表头/条目的真实稳定字段ID、联合主键、引用迁移、DB/file回执、取消与新实例内容；仅缓存中的字符串/数组兼容不足以证明持久结果 | L；隔离数组依次改表头与条目、取消、联合保存及同时改名，独立重开；发生未知时核验原提交并保留后来编辑，不自动再写 |
| B16 独立来源回执与实际CRUD端点 | I1/I6分组捕获、api/crudConfig、原未知核验及分阶段反馈已离线验；缺实际端点/部分结果验收 | 正式查询和create/update/delete或Batch端点、配置捕获、DB确认/file未知各自回执及未派发草稿的可见状态；mutatingError相同不能证明已区分阶段。旧addApi等为目标模型名，没有跨目标等价合同 | L+S；先核隔离目标的实际端点配置，再在可审计受控条件记录一轮来源分别成功/未确认的全过程及独立重开；不对生产人为制造故障。旧模型名仅保留核对，不能当URL或用旧授权写另一模型 |
| B17 原生模型关系与多父输入级联 | I4完整filterExpression和独立DataViewCascadeDefinition，两类各有组合/重开证据；缺实际运行与交互验收 | 关系保存/转换后的正式身份、旧DB记录仍在；多父值的类型、子选项实际过滤范围与子值策略；离线迟到响应和选择字符串兼容不证明实际来源结果 | L；先独立创建/取消/保存完整关系并重开，再用两个父值改变子选项查询并核子值保留/清除；分别保留结果，不把关系自动当级联或SQL join |
| B18 旧view.aggregates全范围汇总 | I2正式远程旧本地算法已停止，API拒读并由标准组件显示诊断；保留原配置，离线边界与重开已验；后端消费者迁移未完成 | 正式过滤/授权下全范围统计、任意输出key与独立汇总成员映射、空集合及分页语义。现有fieldProjection/GetGroupData不能自动替代summary对象 | 完整迁移需S，先核一项SUM/COUNT的实际完整范围和结果身份，把获支持子类接回原消费者，再验当前页缺明细仍正确 |
| B19 选择集合统计 | I2正式远程selectionAggregateResult已与旧全行汇总一起拒读并诊断，普通选择/编辑保留；后端选择身份及结果成员迁移未实现 | 选中主键集合与原过滤/授权如何一起提交、越页选择/取消选择、无主键汇总行的处理及服务结果成员；选中行内容不是后端统计真源 | 停算诊断离线已验；迁移依S，核明确选中身份过滤及回包后接入原查询/汇总成员，验证跨页选择和取消，无身份时明确拒绝，不伪造主键 |
| B20 逐父行的子表统计 | I2远程父/子进入原聚合解析器时停止本地统计，原公式及关系保存重开保留；标准组件明确诊断，单行与纯本地数组保留；后端范围/结果关联未实现 | 完整父子filterExpression、多父行各自过滤/授权、结果到父行稳定身份映射；单字段GetGroupData不能证明复杂关系等价 | 停算边界离线已验；完整迁移依S，先用两个父行和未加载子表核实际按父范围结果，再接入原消费者，不把未加载当零 |
| B21 LIST/JOIN类聚合 | I2 aggregates.join、$list/$join的远程本地执行已停止，原文与诊断保留；尚无等价后端接法 | 服务函数、数组或字符串类型、顺序/空值/重复值/分隔符及授权范围；五种数值聚合目录不能推导这些合同 | S；取得至少覆盖空值/重复/顺序的实际执行合同后逐类接入并验证原消费者；未确认前保留原文与不支持说明，不猜JOINSTR |
| B22 任意JS聚合公式与嵌套值函数 | I2原注入聚合函数的组合、别名、try/catch及后续字段默认0已核停算传播；普通字符串/本行公式保留。任意JS与嵌套值函数的等价执行仍未知 | 执行位置、函数组合/分组、空集合、除零、ctx/字段引用及错误语义；GetExpData字符串、过滤值函数对象、前端JS并非同一语言 | S；按具体表达式逐节点核实际函数与结果，再实施有证明的迁移；不能文本替换成SQL，不永久改共享模型ValueFun，停算不等于任意JS已迁移 |
| B23 参考八区布局与操作顺序 | I5冻结参考路径/hash及当前八区消费者已对照；缺当前1:1视觉验收 | 相同视口的概览/图例/工具栏、节点与关系双击、模型字段/多视图/数据处理、来源980px/参数860px/详情1280px弹窗、滚动遮挡及保存取消关闭状态；DOM/单测不证明真实尺寸和可达性 | L；按下方八区矩阵在相同视口逐入口操作并留成对截图/状态，核文案、默认值和操作顺序；差距归既有标准组件/页面责任层，不能只换按钮即关闭 |
| B24 T=C在线自描述 | I6 chain已保存C配置并由fresh designer/page消费；缺实际部署验收 | 实际C中模型crudConfig、视图、级联、布局的保存回执；新设计器与业务页B真正读取新C而非旧实例；夹具不证明部署C已升级 | L+B01+B16；在可恢复、可审计的C配置范围做一次明确变更，保留DB/file各自结果并全新打开设计器及B消费；原会话缓存不能作为成功依据 |
| B25 多宿主共享、历史与AI交付 | I6 ProjectWorkspace/ScenarioDefinitionDocument投影、DevSystem/AI/历史/预览已接同一DataSet并有离线证据；缺实际宿主验收 | 同项目多宿主是否实际复用配置，两个空间同名模型是否串身份，撤销/历史采用和未知恢复后的剩余草稿是否仍可见，交付回执是否真实反映持久结果 | L+B16；打开实际共享工作区与独立运行页，分别编辑/撤销/保存定义并检查完整绑定；以已有合法历史做受控恢复，核AI交付在仍有待存内容时不报完成，不扩大恢复范围 |

阶段结论（经监督反例修正）：完整任务仍未完成。B18—B22已证实的错误本地结果及可恢复诊断已独立修复，不能把原错误执行全部归为外部阻塞；停止错误算法与完成后端迁移分别验收。B11/B12嵌套消费及B18—B22完整等价迁移仍需要实际服务合同，其余B项依真实服务、持久化、宿主和视觉证据核销。本轮进一步证实并处理下游默认0、字段恢复与标准镜像原行身份问题；当前未留下已知反例待服务解除才能修。新具体反例到达时沿对应I/B项继续，不把本轮结论推广为全源码没有缺陷。

本轮证据见[i7-business-coverage-verification.json](evidence/data-space-config-storage/i7-business-coverage-verification.json)，保留当前映射位置、参考hash、所引用的历史验证及本轮文档检查。限制未解除时不重试被拒目标、不重复无变测试；S证据或新的具体源码反例到达时可直接接续相应I/B项，不必等全部外部条件一起满足。

- [x] 检查I1—I6每项状态，缺实际服务/视觉证据的项不得勾为完整完成；不把权限专题暂缓混入“已实现”。本轮仅关闭覆盖映射工作，不关闭业务验收。
- [ ] 合法访问条件恢复后，在实际服务完成目标空间范围、六类资源能力、命名视图查询、保存/取消、未知/部分结果、独立重开和T=C自描述；记录真实请求结果，脱敏凭据。
- [ ] 逐项对照参考整页截图和操作链，修复发现的问题，并只重跑实际影响范围。
- [ ] 按最终改动执行typecheck、显式路径lint、文档/相关合同门禁；公共声明变化执行生成链及ClassModel门禁；整页、数据层、组件与项目模型按影响包覆盖，不能用低风险用例数量替代。
- [ ] 输出“需求→实现→离线结果→服务结果→界面结果→遗留”的完整矩阵。只有全部本阶段要求满足才完成；服务能力缺口保持未完成并给出确切接口依据。
- [ ] 按阶段7归档本轮证据并更新接续入口；提交推送须用户另行明确要求。

通用命令（按变化选择，不要求每次全跑）：
~~~text
pnpm run typecheck
pnpm exec eslint <本轮明确修改的TS/Vue路径> --max-warnings=0
pnpm run verify:docs
git diff --check -- <本轮明确路径>
pnpm run generate:class-model-surface
pnpm run verify:class-model
~~~

## 成本、阻塞与移交规则

- 同一时间只有一个会话写生产文件；用户要求的新会话接手后，原会话只确认移交结果。
- 所有I项在本文件就地更新，不另建平行总计划；历史证据只作定位，执行前核对应源码是否变化。
- 首次浏览器连接失败只记对应在线子项；不持续轮询，不把无标签页直接推为应用故障。明确安全拒绝不能绕过，改会话也不是解除策略。
- 同时检查还有哪些已授权且不依赖该工具的源码任务；仅在所有可推进工作确实受阻且满足目标规则时登记blocked。
- 对后端等价性未知的旧配置，先做源码/真实服务合同核定；没有依据就保留原文和明确缺口，不推给用户猜实现。
- 每次实际修改前保存对应路径基线；验证失败先区分生产、测试、环境，不全仓回滚，不复写并发工作。
- 不报告“零回归”直到实际影响面的完整证据成立。



## 参考页整阶段验收矩阵

冻结参考源码：E:/r/sparkproject-master-c52ea6af/packages/ui/domain/metadata/src/features/data-platform/data-set-management/。对应e62-reference-master-*截图和DOM保留历史采集范围；不是当前本仓已通过的证明。

| 业务区 | 参考入口与本仓对应 | 离线结果与尚缺证据 |
| --- | --- | --- |
| 入口与概览 | 参考design-workbench的标题/副标题、主业务表、模型/关系统计；本仓同相对路径页面的RendererDetail、DisplayText及工作台投影。保持原URL，单目标T、无文件可设计 | i5-page-validation的概览与workbench组通过；真实服务数据、同视口排版/溢出未验 |
| 画布与工具栏 | 参考SchemaGraph的类型统计、图例、节点双击与1280px详情；本仓RendererGraph绑定节点/边/布局DataView，保留新增、居中、全图、对齐、缩放、参数、复制API、删除、保存/取消 | i5-page-validation含Graph动作与页面交互；图例、拖拽落点、遮挡和弹窗尺寸视觉未验 |
| 模型与字段 | 参考node-panel的元模型/前端模型按产品归属合为DataTable；本仓DataSpaceModelFields、源选择、计算/数组/输出工作区，标准字段子组件绑定正式视图 | I3结构514项及I5整页组通过；未以参考的两套模型定义重复建模；真实数据与整页操作顺序待验 |
| 多视图请求 | 参考请求分区对应DataSpaceViewEditor及DataSpaceQueryPreview；一个模型多个DataView，标准过滤/树/参数/缓存/完成事件配置，过滤排序翻页沿同一查询 | I2两命名视图及重开查询通过；旧聚合迁移和实际后端查询模式仍有明确缺口 |
| 数据处理 | 参考数据处理入口对应DataTable.api/crudConfig编辑；旧模型名只作待核原配置，不猜成URL | I5标准控件保存/取消/重开及前端请求字段通过；任意自定义端点服务协议未验 |
| 来源与参数 | 参考980px来源弹窗、六类Tabs与筛选分页、860px输入参数窗口；本仓来源及参数窄工作区复用标准Table/Form/Field组件 | 六来源真实reader贯穿6项、来源参数及替换组通过；实际CRUD与接口入参执行、弹窗视觉未验 |
| 两类关系 | 参考edge-panel和关系画布；本仓完整filterExpression关系编辑、独立DataSpaceCascadeEditor，多父输入/子值约束，不照搬depType | I4组合124项及贯穿链通过；原生转换保留旧库、字符串/数组值兼容已核，服务与视觉待验 |
| 保存与运行 | 原入口和保存/取消/关闭路径对应C的定义DataView及DataSet；T运行另装配独立实例，AI/DevSystem共享定义而非文件草稿 | I1回执边界、I6自描述/共享草稿/历史/预览均有离线证据；真实DB与文件分别提交/回读、实际重开及T=C在线链未验 |

参考页已证实的缺陷不照搬：ReportID大小写导致的系统字段识别错误、遗留孤立记录等要保留原因与范围，不能通过隐藏或自动删除伪造正确。

## 原任务范围保留索引

下列编号保留完整目标，具体当前行为只读产品合同；早期“已验/待办”详情已归入历史，不自动作为当前状态。

| 编号 | 范围 |
| --- | --- |
| DS-01/02 | 页面作为工具、多空间调用、完整视图绑定及身份隔离 |
| DS-03/04 | 元数据空间参数、正式模型/字段与原生装配 |
| DS-05/06/07 | 多视图、稳定模型关系、前端值级联的配置与持久化 |
| DS-08/09 | 参数与值函数、DataTable查询/CRUD配置的实际消费 |
| DS-10/14 | 既有数据权限消费；功能授权专题暂缓，不混入DataView |
| DS-11/12/13 | 值级联、过滤/排序/分页/树/聚合、编辑/校验/提交回执 |
| DS-15 | 原生对象能力与资源承接缺口，ClassModel由源码正式生成 |
| DS-16/17/18 | 设计器整页、旧入口迁移退役、完整页面与线上闭环验收 |

## 证据与历史边界

- 上组旧入口清理前26路径快照与hash：[manifest](evidence/data-space-config-storage/e62-retire-owner-before/manifest.json)。该组源码差异、各次失败及最终结果归同前缀；[20份历史记录索引](evidence/data-space-config-storage/e62-retire-owner-notes-index.json)保留原路径与归档对应关系。
- 上组单视图入口清理：[2.5.247验收](evidence/data-space-config-storage/e62-native-view-chain-verification.json)，740个不同用例有通过记录；合跑两处导入超时另行复验通过，不代表整页稳定。
- 上组整文入口清理：[2.5.246验收](evidence/data-space-config-storage/e62-native-test-chain-verification.json)，623项范围内通过。
- 本次收敛前完整台账：[历史原文](evidence/data-space-config-storage/e62-retire-owner-ledger-history.txt)。其中旧API、暂停和“下一动作”均是历史描述，不再指导生成代码；不能从历史记录重新恢复已删除逻辑。

结束或压缩上下文前就地更新本E62卡的实际修改、验证、未闭合段与下一动作；不要再把多轮“当前组”不断叠加在顶部。
