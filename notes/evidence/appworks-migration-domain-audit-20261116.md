# AppWorks 迁移源码证据附录（2026-11-16）

本文件为当前源码、固定参考和历史证据边界的只读审计记录，供[当前项目核对报告](../research-appworks-migration-current-state.md)引用；唯一实施计划在[迁移台账](../data-space-retirement-ledger.md#appworks-full-migration-20261116)。以下验收条目为领域证据要求，不是并行总计划。

## 应用、蓝图、审批、治理及工作台

只读迁移审计：application / workflow（审批）/ governance / 工作台宿主
审计基线：D:/SPARK_AppWorks HEAD b9c14db6b10c52fcd8554b9eea319a4c979e633c。
参考基线：E:/r/sparkproject commit 1147b00ee53a1476d4ee715c61368b453a215192:apps/appworks；所有参考源码均 git show 读取，未切换工作树。
日期：2026-11-16。仅读源码、测试和已保存证据；本次未运行服务烟测、未写正式数据、未重跑测试、未修改生产文件或唯一台账。

引用约定：C: 为本仓相对路径；R: 为上述固定 commit 的 apps/appworks/ 相对路径。行号均来自本次读取，不把 notes 中历史结论当当前实现事实。

一、覆盖边界与总判断
1. 深入核对 application 应用管理、企业入驻/授权、申请三页、项目蓝图/导航宿主；workflow 审批模型/设计/办理/待办及数据调用链；governance 原生页面和功能标签残留；四文件开发工作台的实际入口。
2. 未深入覆盖另一个 data-platform/structured-config/workflow-definition（数据处理流程）和 Agent workflow 的完整设计/发布业务，它们不能与本报告的审批流程混称同一完成项；全20业务包的机器清单由主控另一审计分工提供，范围不得缩减为本报告三领域。
3. 应用域已有较完整 DataView CRUD 和回执处理；审批流程已有入口和局部运行实现，但复杂设计/办理语义、统一数据入口及实服主键/SPA验收未闭环；治理维护页缺失属后续权限专题，不能照搬参考前端角色模型，也不能丢掉功能标签与授权配置。
4. 当前本领域仍主要为原生 Vue+TS+场景 pagedata；它们是四文件化前的实现阶段，不是“工具 rule/script/style + 场景 pagedata”迁移已完成。保留原URL与完整语义，不能通过包装整页Vue宣称完成。

二、应用管理：可复用主链与未交付项
已实现：
- C:src/views/features/application/application-manager/ui/application-manager-page.vue:74-131 标准页头/表格/操作；新增编辑/停止后删除、应用链接与进入应用、项目管理、默认应用、关联数据库入口均存在。
- C:src/views/features/application/application-manager/model/application-manager-model.ts:246-270 新建先主表、再数据库/负责人/导航根，编辑同阶段保存主表与负责人；saveChangesInPhases 处理已确认主表后的伴随失败。
- 同文件:295-315 删除前读关联与导航子项，先关联后主表。负责人关系中的 RoleIdField 是后台记录范围，不能解释为前端角色授权。
- C:tests/runtime/application/application-manager/application-manager-page.test.ts:199/242/270/316/326/340/353/369/378/417 已有分页刷新、CRUD分阶段、未知结果、禁止含子蓝图删除、切换应用、默认应用、文档回执等夹具测试。
缺口/区分：
- C:application-manager-page.vue:74/78/130 导出与报价管理只提示“尚未交付”。R:src/ui/features/application/application-manager/ui/application-manager-page.vue:659 的导出同样 showNotImplemented；R:.../application-manager-list.vue:72 的报价同样 notImplemented。两者是参考原有未交付产品能力，不应误报为本次漏迁，但完整计划要保留待交付项。
- 文档生成只拿提交回执，不能完成“下载可用文件”的闭环：C:src/views/features/application/application-function-management/ui/use-application-function-page.ts:416-426 明示生成状态未知；C:src/lowcode/resources/application/project-blueprint-document.ts:13-18 仅包装 lowcodeApi.blueprint.submitDocument，没有 DataView/DataSet 命令绑定。移动到 resources 目录尚未满足统一数据入口。
依赖/验收任务：
- 应用CRUD及关联删除需独立目标应用、实际保存回读、部分失败恢复、取消及切换身份验收；本次只看到夹具，不提供当前实服CRUD签收。
- 文档提交先接入同数据链的命令资源，按实际服务已有合同验证任务/产物状态、文件可打开及内容覆盖；不能伪造新服务协议，不能将 submitted 作为 generated。
- 导出和报价各立真实用例/数据范围/交付物合同后实施，不能用点击提示作为完成。

三、企业入驻：审核/密码/配置已有，授权状态机缩减仍存在
已实现：
- C:src/views/features/application/enterprise-regist-manager/ui/enterprise-regist-manager-page.vue:86-147 提供授权、审核、密码与配置；配置按目标企业加载专用视图。
- C:.../enterprise-audit-dialog.vue:63-74 本行CheckState权限；:89-122 审核通过由命令DataView saveChanges并支持原捕获核验；:131-136 驳回写CheckState。
- C:packages/spark-lowcode-api/src/platform/resources/system/enterprise-initialization-resource.ts:34-102 将 initEnt 适配到 bindCommandSubmit，按同DataSet回读企业状态；:91 真正HTTP只在适配内部且 retry:0。该链与审批workflow直调不同，不能误判成全部命令都未统一。
- C:.../enterprise-password-dialog.vue:38-49/66-79 原行super_admin_pwd + 临时确认DataView；C:.../enterprise-config-dialog.vue:11-31 用valuePath维护 ent_config 成员，含登录策略/密码/验证码/默认应用/LoginToken。
- C:packages/spark-lowcode-api/src/platform/resources/system/tests/enterprise-initialization.test.ts:51-82 覆盖一次派发、未知回执只核验、明确拒绝、捕获后身份变化。默认应用另见 C:tests/app/services/project/enterprise-landing.test.ts:91-168。
确认缺口：
- C:src/views/features/application/enterprise-regist-manager/ui/enterprise-app-auth-dialog.vue:97-98 仅 authorized==='1' 判断生效，:215-250 授权/撤销仅改authorized，新增不写operator；:70-74 仅显示状态、时间、说明。
- C:config/pages/application/enterprise-regist-manager/pagedata.json:80-92 只查询 authorized/authorized_at/operator/description，计算二态文本；虽:48/56 已登记状态/申请类型字典，界面未消费完整七态与request_type。
- 对比 R:src/ui/features/application/enterprise-regist-manager/ui/enterprise-regist-manager-page.vue:367/393/416/456/479/519，参考有授权初始化、批准、拒绝、失败重试、撤销原因、重新授权；R:.../enterprise-app-auth-dialog.vue:85/90 有发起方式、说明/失败原因，:19 使用展开模块授权。
- 当前主从模块区 C:enterprise-app-auth-dialog.vue:13-19 替代参考展开行，属可见交互偏差；应用二态与缺少审批/初始化失败状态则为业务语义缺口，不仅是样式偏差。
- 全tests检索未找到 enterprise-regist-manager-page/enterprise-audit-dialog/enterprise-app-auth-dialog 的独立挂载用例。初始化资源测试不能替代入驻整页集成。
依赖/验收任务：
- 按实际服务确认初始化状态机、撤销原因、操作者与时间的持久合同，用语义资源适配承接；不在前端造状态机或新后端接口。补入驻全页集成：待审→通过/拒绝、未知结果、密码双确认、JSON成员不覆盖、授权全状态/取消/失败/模块授权。
- 旧台账提到2026-11-13授权/配置等烟测及撤销说明不持久化、默认应用登录异常；本次未找到同轮原始响应证据且未重测，故只能列“待重新取证”，不能沿用为当前成功或当前失败事实。审核通过需明确可用目标，不能在本审计中执行。

四、企业应用授权三页：本企业申请→发布企业审核→服务初始化
已实现：
- C:src/views/features/application/enterprise-app-auth-application/ui/my-app-auth-request-page.vue 查询本企业REQUEST、按状态取消/重新申请；申请弹窗复用 apply-app-auth-content.vue；审核列表仅来源本企业PENDING REQUEST。
- C:config/pages/application/enterprise-app-auth/my-requests/pagedata.json:13-17 与 review/pagedata.json:12-22 体现固定范围和只提交当前状态/操作者/评论。
- C:src/views/features/application/enterprise-app-auth-application/ui/enterprise-app-auth-application-audit-dialog.vue:82/106-107 校验状态可写并写INITIALIZING或REJECTED与operator。
- C:tests/runtime/application/enterprise-app-auth/enterprise-app-auth-pages.test.ts:114/133/140/158/167/189/213/229 覆盖范围、无企业拒绝查询、权限、取消/重申、外部已发布候选、未知保存、审核。真实PageRuntime+HTTP夹具，非实服写入。
缺口/任务：
- 申请提交→服务初始化→ACTIVE/FAILED→实际应用可达及授权范围变化，仍需实服完整闭环证据；测试“写INITIALIZING”不能证明后台初始化完成。
- 跨发布企业和申请企业至少两个授权上下文验证，保留后端授权权威；禁止以用户名/admin或角色模拟放行。

五、项目蓝图与导航宿主：主要编辑能力已接通，页面设计/交付宿主断开
已实现：
- C:config/navigation/vue-pages.json:251-258 正式原路径注册项目蓝图；C:src/views/features/application/application-function-management/ui/application-function-page.vue:9-12 只有基本信息/导航配置/数据空间/需求原型四tab。
- 同Vue:33-39 树新增与AI生成；:88-105 正式DataView字段；:112-131 桌面/核验/数据空间影响/设计/维度来源；:145-183 原型保存预览与版本。
- C:.../use-application-function-page.ts:186-199 将owner、runtime、项目和正式完整视图键核为同一上下文；:257-279 弹窗输入用同DataSet临时DataView。
- C:.../blueprint-navigation/use-blueprint-nav-host.ts:112-117/122/144/178 为导航宿主单行DataSet保存/增改删；C:src/views/features/application/data-menu/ui/data-menu-page.vue:14-32/156-166 为宿主管理CRUD与内容设计。
- C:tests/app/features/application/application-function-management/application-function-page-entry.test.ts:337-539 覆盖项目身份/惰性树/字段绑定；:594-834 AI确认/取消/晚结果、原型版本、绑定保存回读/影响；:994-1034 导航配置核验及文档提交回执。导航宿主/桌面完整整页流程的覆盖仍需核验，不可由这些局部测试推定。
当前宿主可达性缺口：
- C:.../page-design/page-design-pane.vue:3/19-57 有AI编辑、创建绑定工具、三文件交付和预览UI，但全 src 检索没有外部 import/挂载该组件；usePageDesign也未在其模块外调用。
- C:.../blueprint-planning/ProjectPlanningDocumentImportDialog.vue:3/8-38 有DOCX导入UI，但全src只有自身和 useDevState 内方法定义，没有外部挂载。
- C:.../blueprint-state/useDevState.ts:1697/1751/1759 有建工具/保存编排，并不证明入口可点；目前注册的蓝图主模板不含页面设计、交付或规划文档导入。
- 全src/config查询 DevSystem 与 /dev 未找到运行入口/组件；config/navigation/vue-pages.json:251 是项目蓝图，:415-420 是独立 Agent workflow 设计稿页 /workflow-designs。不得把底座类、useDevState、三文件编辑器或 /workflow-designs 当作20包工作台已可达。
- 此项相对“完整20包工作台/四文件目标”列宿主恢复任务；本次参考 application-function-page 的四tab也没有上述三文件工作台，故不虚称是该参考页自身必有的第五tab。
后续任务/验收：
- 在保持蓝图原URL/真实节点身份的宿主中恢复工作台入口链，逐包登记实际可点击入口→业务输入→场景DataView→工具rule/script/style→保存回读→预览→正式运行消费；不得仅登记文件或工具类存在。
- 分开验收20包每个闭环，不以平台模板或一个样板覆盖20包。
- 项目蓝图节点/宿主两处数据空间功能授权入口保留后续任务：C:data-menu-page.vue:4 明示暂缓；R:application-function-page.vue:419/848-867 与 R:data-menu-list.vue:79 有相应入口。当前不新增权限专题，不因暂缓删掉功能标签配置需求。

六、审批工作流：入口/图/查询已迁入，但设计语义明显未完整迁移
已有：
- C:config/navigation/vue-pages.json:424-490 注册模型列表、设计、详情、PC/移动办理、业务详情、PC/移动待办。C:src/lowcode/resources/system/workflow/manage/flow-runtime-client.ts:15-17/43-65 保留参考运行URL并带监控导航身份。
- C:src/views/features/workflow/flow-model/design/ui/flow-design-page.vue:18-30 RendererGraph绑定节点与边DataView，支持拖动/连线/选择，节点/边/表单/节点功能标签区域已挂载。
- C:src/views/features/workflow/flow-workbench/model/use-flow-workbench-todo.ts:19-46 四tab待处理/已处理/传阅分享/我发起，按当前用户注入查询上下文；命名视图合同见 C:config/pages/workflow/flow-workbench/pagedata.json。
已证实设计缺口：
- C:.../node-panel/flow-design-node-panel.vue:43-47 仅TITLE/NODETYPE/MEMO；R:src/ui/features/workflow/flow-model/design/ui/node-panel/flow-design-node-panel.vue:10-106 有候选人设置、输出类型、输入方式、提示文本、审批按钮、办理设置、提醒对象/内容。参考候选人内部角色分支不应照搬，须按本仓无前端角色合同重新分解正式候选资源。
- C:.../edge-panel/flow-design-edge-panel.vue:43-48 只有父子ID/TITLE/MEMO；R:.../edge-panel/flow-design-edge-panel.vue:80-168 有撤回条件、表单/字段、自动提交/时间单位、条件编辑器，当前没有等价配置UI。
- C:.../form-panel/flow-design-form-panel.vue:6-24 仅五字段表；R:.../flow-design-page.vue:39-42/57-89/124-274 有新增编辑删除保存、业务表主键字段、宽高、表单/导航选择与字段选择。当前不能完整配置工作表单关联。
- C:.../node-panel/flow-design-node-auth-panel.vue:44/62-68 是FunctionNodeAuth与_Base_FunctionNode的局部功能标签授权维护，不能替代候选办理人配置或全部治理功能。
任务：先逐项恢复模型→节点输入输出/候选人→关系条件/退回/自动流转→业务表单→保存重开→实际实例运行的完整语义；标准组件不足回组件层补齐。节点授权维护是既有能力，后续治理专题不得扩成前端角色模型。

七、审批保存/办理：统一数据入口与关键业务回调仍有断链
设计保存现状/风险：
- C:src/lowcode/resources/system/workflow/manage/flow-design/flow-design-save.ts:51 同步表，:65-70 直接 uploadWorkingText(EJ2.json)，:72-78 更新DesignJson并 dataSet.saveChanges，:81-89 再直调用表单关联HTTP。
- C:.../flow-design-form-relation.ts:26 遍历全部view.rows，:48-50 有任何行即提交，:68-75 直POST SaveFlowAndFormRelation；不是仅提交本次变更，清空表后 body.length===0 则直接return(:69)。是否服务需要空数组表达删除，需对专用协议核实后验证，不能先宣称删除链完成。
- 保存文件、数据库、关联命令三个边界无同一DataView命令捕获/未知核验闭环；需统一到SPARK data资源适配，保留各来源分别确认，不承诺跨来源事务。
运行现状/缺口：
- C:src/views/features/workflow/flow-runtime/run-page/ui/use-flow-run-page.ts:82 创建HTTP客户端；C:src/lowcode/resources/system/workflow/manage/flow-run-page/flow-run-page-client.ts:75/92/116/132/150/165/179/194 分别直接访问选项、提交、退回、强制退回、退回发起人、自动判定、撤回、历史。页面转调helper不是SPARK data命令资源。
- C:use-flow-run-page.ts:153 每次只提交一个NodeId且 ExecUserList:[]；:154-163 不传通知渠道。R:src/ui/features/workflow/flow-runtime/run-page/ui/flow-run-page.vue:190-214 有节点/办理人选择，:240 通知渠道，:592 共享分支；当前未等价恢复。
- C:.../model/flow-run-business-tab.ts:69-72 声明flowSubmit/End/Failed/Succeeded；全src审批域仅定义后三者，未调用。C:use-flow-run-page.ts:205-215 只调用flowSubmit，退回/强制退回/退回发起人也直接发命令。R:flow-run-page.vue:749-761/865-868 在操作前、失败、成功调用完整业务页回调。可能导致业务数据/流程结果不同步，须作为核心闭环恢复，不是文案细节。
- C:flow-run-page.vue:19-25/37/45/54/60 仍使用el-tabs、原生radio、el-input和本地ref输入，未按标准组件DataView输入合同；先补标准能力，再改业务。
- C:flow-run-page-mobile.vue:6-8 直接包PC页，只CSS单列；参考移动页为独立业务页/操作面板/方向/人员/通知布局（R:flow-run-page-mobile.vue:19/82/122/210）。当前仅复用可加载，不等于1:1移动体验验收。workbench-todo-mobile同样只包PC面板。源注释的“占位”有历史残留，结论依据实际模板，不依据注释。
验收任务：
- 正式业务表单保存成功后才发起/提交；完整多节点和人员选择、通知、退回/撤回/加签/共享，事件前后回调与失败取消；网络未知结果只能核验原动作，不盲重放。相同实例连点、切换用户/应用/步骤、晚回包都需实测与回归。
- 设计保存必须覆盖文件成功而DB失败、DB成功而关联失败、删除最后表单关系、保存重开不丢布局/条件等反例。

八、审批实服验收证据：当前仍是 blocked
- C:notes/evidence/workflow-formal-pk-probe-20261116.json:2-59 是2026-11-16保存的原始probe，ready:false，六项：flowModelList.Base_UserInfo；flowDesign.WFM_WORKFORM；flowWorkbench.WFOBJ_FLOW_Waiting、WFOBJ_FLOW_RELATIONLINE_STEP、WFOBJ_FLOW、WFOBJ_FLOW_FORM。
- C:notes/evidence/workflow-smoke-r16-20261116.json:53-64 四个SPA项均fail：工作台四tab、设计节点授权保存重开、办理提交/退回、详情到办理；:77 signoffStatus=blocked。:10-16 GetStepHistory HTTP200只证明该查询返回，不代表流程闭环。
- 同证据:7 的14 gaps是旧摘要，:24/32 的6 gaps及上述probe更具体；当前报告采用六项并注明需主控live刷新，避免把相互不一致历史摘要当现状。
- C:tests/runtime/page/structured-config/workflow/flow-design/flow-design-save.test.ts:5/8/54/70 mock文件上下文/表同步，只验上传与saveChanges调用/失败；flow-design-page-mount.test.ts:10-43 mock各面板；flow-run-page-mount.test.ts:10-40 mock runtime/路由业务页/加签，:139 只验标题和页头。局部测试通过不证明上述真实UI和实服写入。
- 先按实际D99场景确认六模型主键元数据与表源映射，不能伪造PK或改本地Java。通过后重跑正式主键/四SPA闭环并保存请求回执与重开结果；不能把此轮全仓测试通过写成R16签收。

九、governance：整体原生维护页尚缺，按后续专题保留
- 固定参考树有 R:src/ui/features/governance/navigation-permission/ui/navigation-permission-page.vue；role-management/ui/{role-management-page,role-auth-page,role-user-page}.vue；user-app-authorization/ui/user-app-authorization-page.vue；desensitization-rule/ui/desensitization-rule-page.vue。当前src/views/features/governance目录不存在，src/config没有对应治理URL注册/替代页面检索命中。
- R:navigation-permission-page.vue:47-139 提供授权编辑/功能操作选项/数据权限tab；R:user-app-authorization-page.vue:13/34-40 按sysId+userId显示默认和具体权限；R:desensitization-rule-page.vue:17/37-42/64-133 提供脱敏规则CRUD、分类/正则/模板/样例。
- C:src/lowcode/resources/shared/navigation-authorization-resource.ts:14-32/52-62/82 是只读正式菜单授权响应DataView，写操作隐藏(:105)，不是治理维护能力。
- C:workflow/.../flow-design-node-auth-panel.vue:62 局部功能标签字段不等于全导航授权与标签配置完成。
- 参考role页面与navigation-permission composable的大量role判断/候选状态，不得机械移植成前端角色系统。后续从数据空间默认权限+功能标签+授权机制重新核定；保留功能标签及配置需求，消费后端正式查询结果。
- 按用户当前阶段要求，新增权限接入/授权专题验收列后续，不作为本轮其它业务恢复前置；既有查询保存守卫不改。脱敏规则及用户应用授权UI也在后续治理范围逐项核定，不以目录缺失直接推动本轮写入。


## 数据平台、集成、组织与运维

2026-11-16 领域迁移只读审计草稿（供主控合并唯一台账，不是第二份总计划）

审计坐标与边界
- 当前仓 D:/SPARK_AppWorks，HEAD b9c14db6b10c52fcd8554b9eea319a4c979e633c。
- 固定参考：E:/r/sparkproject 的 1147b00ee53a1476d4ee715c61368b453a215192:apps/appworks；全程 git show/git ls-tree，只读，不切换参考仓。
- 本文“参考路径”统一相对 apps/appworks/src/ui；“当前路径”相对 D:/SPARK_AppWorks。
- 已读唯一台账 N1 第 4–15、17–18 包及 N3 分类；本分工覆盖数据平台全域、API/报表、组织三页、系统四页，另核 AI Agent Workflow。第 1–3、16、19–20 包主体由其他分工覆盖，维度→蓝图、监控→审批等交界仅记录接缝。
- 本轮没有改生产代码、生成物或台账，没有 git 写操作，没有启动测试或实服写操作。下面测试路径是可复用覆盖与后续验收入口，不宣称本轮重跑。主控最终门禁 565 文件/9,973 项是另一份当前证据，不能替代真实业务验收。
- 证据等级分开：A 当前源码与固定参考已对照；H 唯一台账历史服务/浏览器证据（未本轮重验）；L 主控本轮 live 只读快照；P 尚待执行的验收。没有新证据时不将 H 的失败/未知核销，也不把 H 的局部成功扩大为全包通过。

第 4 包：数据空间目录与设计（A：主链已恢复；完整业务签收仍开放）
当前链：src/views/features/data-platform/data-set-management/ui/data-set-list-page.vue；design/ui/data-set-design-page.vue；src/lowcode/data-space/lowcode-data-space-runtime.ts；同一元数据 DataSet 和 file/pagedata 资源适配。设计页有模型图/目录、模型与字段编辑、来源变更、请求/命名视图、原生关系与级联、参数、布局、改名及删除等窄命令。本轮关系错误可见性与字段 revision 循环已随当前 HEAD 修复，不另列未修复项。
当前确切边界：design/views/DataSpaceViewEditor.vue:55 明示后端聚合支持数据库表/视图的单表或关联查询，不支持树查询；src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts:2294 对字段结构草稿预览明确拒绝。这是服务能力边界，不能以前端全量拉取补统计或伪造未保存结构预览。
历史旁路纠偏：10月台账的 fileBindingSubmissionUnconfirmed / parameterBaseline / historyDefinitionSnapshot 三符号在当前设计页已搜索不到；不得照抄成当前仍存在的三项旁路。也不能仅由消失断言所有未知结果和取消行为已签收。
依赖/计划：复核正式元数据 DB + pagedata 各自提交、实际回执、独立回读及下游消费；按本次修改提交，未加载视图不参与删除。原生 resourceRelations 与后端 Base_DataModel_Relation 不混同；输入级联与模型关系分验。远端旧配置、旧聚合和局部绑定迁移范围需显式登记。
P 验收：单目标空间进入→分层按需加载→各类来源建模/字段/视图/关系保存→关闭重开→实际业务查询消费；取消零写、未知不重发、换应用/空间旧请求失效；改名和删除核引用与部分成功。需要矩阵，不能单个页面打开代替。
测试入口：tests/runtime/page/design/native/；其中 relation/data-space-relation-editor.test.ts、fields/data-space-field-batch.test.ts、fields/data-space-field-edit.test.ts、fields/data-space-field-remove.test.ts；packages/spark-lowcode-api/src/platform/data-space/runtime/tests/results/ 聚合/关联/嵌套合同。

第 5 包：服务器、数据库、表/视图（A：主操作已接；预览身份仍需正式服务证据）
参考：features/data-platform/database-management/ui/service-management-page.vue；table-and-view/ui/table-and-view-page.vue；views/DataBaseManage/DataBaseManage/index.vue。
当前：service-management-page.vue:3–4 注册走 DatabaseServerRegister 命令视图，编辑/删除走 Base_serverInfo；table-and-view/ui/table-and-view-page.vue:586–639 有注册、新增表、表设计、复制、删除、视图设计等，:670 有元数据同步。不能误写“只迁目录”。
协议：src/lowcode/resources/database/dataset-extensions.ts:127–129 未注册库/表/视图列表；:322 /api/Db/registerServer；:388 /api/Table/registerTable/{dbid}；:458 /api/View/registerView/{dbid}；:520 /api/Table/SyncMetaData/{dbid}/{tableid}；:761/:833 testConnection。需区分登记元数据和真实DDL，删除何种记录不能凭按钮名称推断。
待核合同：catalog/table/preview-view-ops.ts:125 缺主键回退 rowid；:175–247 手工 Table 描述调用 GetData，视图 PrimaryKeyFields 固定 rowid；:133–160 按返回字段与行生成只读可见性。当前已经通过 DataView service-query 执行器（:347），不是页面直调旁路，但这不证明正式模型身份/授权协议及任意视图稳定主键已成立。应核实际服务合同；不据静态源码直接声称可越权。
P 验收：服务器测连/登记/编辑/删除；数据库登记/关联；表新增/复制/登记/同步、字段与关系保存、视图设计；每项明确物理对象和元数据的结果，独立回读、取消、未知、引用拒绝；预览分页/主键/字段拒绝与真实服务回包单列。
测试入口：tests/runtime/page/database/directory-page.test.ts；server/service-management-page.test.ts；catalog/table-and-view-page.test.ts、preview-view-ops.test.ts、relation-view-ops.test.ts；该目录相关登记与同步用例。

第 6 包：字典（A：设计与业务条目分离；整资源删除明确禁用）
当前：features/data-platform/structured-config/data-dictionary/ui/data-dictionary-list-page.vue、dictionary-setting.vue、model/use-dictionary-workspace.ts → LowcodeDictionary → packages/spark-lowcode-api/src/platform/resources/structured-config/dictionary/workspace.ts。
缺口：dictionary-setting.vue:16–20 告知全局引用范围未核，不允许删除；workspace.ts:321 canRemoveDefinition 固定 false。不是按钮级漏接，不能直接放开；需核数据库、配置、代码消费者及条目完整清理合同。
已实现边界：定义名称/编码类型/六字段标题与业务条目分别保存；不能把设计保存混入条目保存。
P 验收：新增方案、设计变更对既有值的校验、条目 CRUD、重开、下游选择/值标签消费；整资源删除先引用拒绝，再独占对象完整删除/回读/未知恢复。AI录入只计候选采用与本次合法可写字段，不因对话框存在算可运行。
测试入口：tests/runtime/page/dictionary/dictionary-catalog.test.ts、dictionary-workflow.test.ts；packages/spark-lowcode-api/src/platform/resources/structured-config/dictionary/workspace.test.ts、workspace-loading.test.ts。

第 7 包：维度中心与来源（A：六工作区与规则整组编辑已实现；导航和统计仍有差距）
参考 dimension-definition/ui/dimension-design-page.vue:549 mapping_count、:561 打开节点、:576–600 事件锚点数。
当前同路径 dimension-design-page.vue:24–70 六工作区按需访问；:191–211 来源/映射/事件/规则/维度/已有字典映射/分类列；:213 规则编辑/删除。当前无“打开节点”动作；计数没有恢复为后端统计，现用选中查看明细。不能复制参考前端 counts Map 算业务统计。
来源接缝：src/lowcode/resources/structured-config/dimension-source/{binding-editor,event-editor,commit-policy-editor}.ts。commit-policy-editor.ts:3–7 只保存 status=0 草稿版本，不启用、不核物理约束或后端并发。不能把“来源提交协议已存”说成正式维度提交/计算消费者已完成。
依赖/计划：跟蓝图分工对齐来源 applicationId + nodeId + dataSpace 阶段的正式导航；复用原项目 owner，处理脏态与跨应用目标；后端明确定义映射数/锚点数范围；正式维度消费者、版本/启停及并发事实单独核实。
H：台账 9284–9289 有分类/规则子项实服写回样本；9389–9400 有六工作区级联的浏览器夹具证据，明确不是认证实服。旧“规则分记录保存”已被整组编辑取代，不重复列缺口。
P 验收：六区读取、选择清空、迟到响应、规则整组新增/编辑/删除、引用拒绝；来源→事件→规则→正式结果消费者；准确回到蓝图；协议草稿与启用合同分列。
测试入口：tests/runtime/application/dimension/dimension-design-page.test.ts 及同目录规则编辑/删除/工作区测试；src/lowcode/resources/structured-config/dimension-source 对应现有规则与蓝图测试由主控合并。

第 8 包：数据编码（A：设计/分段/规则/初始化/示例已接；整方案删除缺失）
参考 data-code/ui/data-code-list-page.vue:61/276 有删除；当前同名页:7–10 仅新增、设计、刷新，无整方案删除。
当前编辑器 data-code-editor-page.vue:16–17 示例+刷新；:120 初始化；:133 日期/父编码/顺序号/分类四种弹窗路由。固定字符串由 code-segment-editor.vue:56–57 直接编辑 ParameterName，所以 :134“该类型规则尚未恢复”不能一概当所有固定串缺失。分段删除已实现（code-segment-editor.vue:10/90），不等于主方案删除。
协议：data-code/example-client.ts:20 /api/Codeing/TestGetCodeString；initialization-client.ts:20 CodeInitDataList；assignment-resource.ts:63 GetCodeString/{业务行}/{规则}。assignment-resource.ts 顶注与 verify 明确：领码不能用于核验，派发无可信回执保留未知，服务尚无原领码查询合同。
关键依赖：Base_CodeNodeDesign、Base_CodeSerialPerform、Base_CodeAndBusInfo、父编码 RefCodeId 及下游业务用码；分类/顺序号为共享配置，不能随主方案级联删除。实际业务创建须先有已确认业务行，再领码，再独立写回；目前 BusinessCodeAssignment 已被 Excel 新增消费，数据工作流尚未接（见第10包）。
H：台账 9320–9329 编码目录为空和引用/取消只读烟测，不证明方案持久化；历史领码冲突见 N3，保持原样本边界。
P 验收：完整设计新建/编辑/重开、各分段、日期/父码/分类/序号、初始化与真实样例；真实业务行领码/回写；未知不重领；整方案引用拒绝、清理和独立回读。
测试入口：tests/runtime/page/structured-config/data-code/；packages/spark-lowcode-api/src/platform/resources/structured-config/data-code/tests/{assignment-resource,initialization-contract,example-contract}.test.ts。

第 9 包：逻辑视图（A：编辑与简单发布已接；复杂发布、目录删除/改名未完）
参考 logic-view/ui/logic-view-list-page.vue:56/400 删除，:99/:383 编辑名称；design-page 支持字段分组/去重/值函数、联表与输出预览。
当前 logic-view-list-page.vue:7–10 无删除；:20 现有名称不可改。设计内容不是只能看：已有参数、来源、字段、过滤、连接和预览相关组件。
明确受限：src/lowcode/resources/structured-config/logic-view/output/publication-plan.ts:22 仅单根，:24 仅 Table 且无 ChildTables，:25 来源 table/dict/interface/json，:39 拒 Group/DISTINCT，:45 拒 ValueFun/Expression/Value 计算输出，:52 空输出拒绝。这属于输出发布能力限制，不能笼统说设计编辑不支持，也不能用前端推导SQL补齐。
协议：packages/spark-lowcode-api/src/platform/resources/structured-config/logic-view/design-client.ts:52 GetView、:71 SaveView；目录名与设计文件定位相关，改名/删除需处理 DB、文件、输出字段与消费者。
H：N3 和台账 4782–4908 保留 sys_edit SaveView 成功回执后独立回读仍基线的原未知/未验收记录；禁止重放、猜恢复，其他样本成功不能结清。9325 有 db_relation_show 只读打开，不能替代写闭环。
P 验收：简单与复杂设计分矩阵，保存→独立GetView→重开→正式执行输出；多根/子表/联表/聚合/去重/计算字段由后端结果类型/身份承接；目录改名/删除保护全部引用与原未知意图。
测试入口：tests/runtime/page/structured-config/logic-view/，尤其 logic-view-list.test.ts；现有 output、参数、来源、节点、过滤相关文件只证明其覆盖范围。

第 10 包：数据工作流（A：已有流设计/节点测试可用；目录新增和删除缺失）
参考 workflow-definition/ui/workflow-definition-page.vue:16/585 新增、:59/632 删除、:145/758 AI Cron。
当前同页:89–104 工具栏含新增但 createFlow 固定报“暂不能创建工作流：业务编码生成能力尚未确认”；无整流删除。Cron 为文本输入，没有参考 AI Cron 入口。
已实现：design/ui/workflow-design-page.vue:24–31 补齐缺失开始/结束、:33 测试、:36 新增节点、:41–43 独立布局；node-panel/workflow-design-node-panel.vue:228 query/copy/add/edit/delete/merge 六操作；来源创建、换源、合并来源、字段、连线、测试等已有领域实现。不可把历史“仅query节点”继续写为当前事实。
协议：packages/spark-lowcode-api/src/platform/resources/structured-config/workflow/workflow-execution-resource.ts:86 runSingleNodeTest / runWorkflowTest；定义/节点/连线 DB + 布局文件分别持久化；运行可有真实业务副作用。目录新建需接已确认业务行→领码合同，不是先无业务行领码。
H：N3 工作流 merge 输出及 INNER/RIGHT/FULL 的已部署样本失败未被本轮重验，不能因前端配置与测试通过宣称后端已支持；也不扩大为六类节点全部不可用。
P 验收：目录新建/删除完整生命期；各节点输入映射、来源与输出、连线条件、取消/未知/重开；隔离测试流执行并核真实下游结果；缺边界补齐与已有输入同步；自动触发的表操作/Cron须服务现场验证。
测试入口：tests/runtime/page/structured-config/workflow/（source、trigger、节点/merge/copy等）；trigger/workflow-execution-runtime.test.ts、workflow-execution-contract.test.ts；packages/spark-lowcode-api/src/platform/resources/structured-config/workflow/workflow-execution-resource.test.ts。

第 11 包：JSON 与文件（A：两条数据链已分清；JSON整资源删除缺失）
JSON参考 semi-structured/json-data/ui/json-data-page.vue:104/308 有删除；当前同页:85–87 rowActions 只有编辑文件。当前已有新增、导入JSON、目录行内编辑/保存/取消、内容FieldJson保存；不能把缺删除写成整个JSON编辑未接。
JSON协议：src/lowcode/resources/semi-structured/json-data/document-resource.ts:60–61 使用 jsondatapath 文件区，文件新建/覆盖分别经数据层上传；页面对文件已确认而目录未确认有明确状态。计划需补目录+文件+所有消费者的删除语义，部分成功保持事实，不承诺跨源事务。
FileManager：src/views/FileDataManager/FileManager/index.vue:3–4 与 src/lowcode/resources/semi-structured/file-data/file-data-resource.ts:3–5；列表、单文件上传、删除均DataView，/api/File/list、UploadFile、DownFile、RemoveFile；上传原字节核验。当前三列文件名/路径/时间，无参考大小列，因为既有列表协议没大小；不是通过猜值补列。
H：台账9291–9296 有 filedata 独占文本上传/字节核验/删除样本；旧 infra.file-manager /infra/file/page 实服不可达，因此迁到既有 /api/File。该样本不证明所有文件来源/设计文件双端的完整范围。
P 验收：JSON新建文件+目录两阶段、修改、取消、部分成功恢复、删除引用拒绝/清理/下游；FileManager二进制类型/重复名/失败/删除、无关文件保留；文件大小与空态文案按服务/组件合同补齐。
测试入口：tests/runtime/page/semi-structured/json-data-page.test.ts、json-document-file.test.ts；file-data资源及 packages/spark-lowcode-api/src/design/lowcode-binary-file-upload.test.ts。

第 12 包：Excel（A：设计与模板上传链丰富；整方案删除及运行交付未签收）
参考 excel-import/ui/excel-import-list-page.vue:20/577 示例、:88/719 整方案删除、:175/657 清空模板路径。
当前同页:91–99 工具栏/行操作只有新增、打开设计、刷新、复制KEY、设计、编辑；无整方案删除和示例入口。当前模板选择/上传/发布与原文件核验已有多阶段命令；不能误说没有上传。设计器 excel-import-editor-page.vue:111–115 的删除是所选配置子树，明确保留方案/兄弟配置/模板/业务数据，不等于整方案删除。
已实现链：方案新建→已存行领码→编码写回；模板独立上传确认→templatePath写回；设计器来源/字段、引用、转换、排序、分组布局、入导出方式经正式DataView。src/lowcode/resources/semi-structured/excel-import/catalog/{creation,template}.ts 是不同命令阶段。
H：N3 多组布局样本失败；正式Excel导入/账本/归档及模板运行消费缺证，仍应保留。配置可保存不证明真实文件按该配置成功导入/导出。
P 验收：整方案删除先核设计子项/模板是否共享/领码使用/消费者；模板更换与清空的无关文件保留；各布局类型、多组与转换的实际导入/导出、目标业务行和归档回读；未知领码/上传/路径发布各阶段不重放。
测试入口：tests/runtime/page/semi-structured/excel-import/（catalog、layout、transform、configuration-removal、formal-editor等）；packages/spark-lowcode-api/src/platform/resources/semi-structured/excel-import/template-upload-resource.test.ts。

第 13 包：PDF（A：本仓新增规则目录/编辑，不是完整识别产品）
固定参考原生Vue中未找到PDF页，唯一台账N1明确是本仓特有范围，不能因无原页面删包。
当前 semi-structured/pdf-inspect/ui/pdf-inspect-list-page.vue:7–8 只有打开设计/刷新；pdf-inspect-editor-page.vue:12–19 名称/描述/rule_config JSON保存/取消；resource.ts:8–20 仅装配 Base_FileInspectConfig 所在正式场景。
本轮在src和lowcode-api按pdf-inspect/Base_FileInspectConfig/PDF识别检索，没有找到同链的上传识别调用和结果消费。结论限于当前已查链：只能证明规则编辑；创建/删除、识别输入/执行/结构化输出/失败重试需先核业务与服务合同。
H：台账9855旧00BE应用直链跳ServerManagerment不能当D99 AppWorks结果；D99导航由主控L证据确认。
P 验收：先锁识别模型、文件归属、规则版本与实际服务入口，再恢复规则完整生命周期、上传→识别→结果确认→下游数据消费。没有部署合同就明确阻塞，不能新造后端端点。
测试入口：tests/runtime/page/semi-structured/pdf-inspect-formal-editor.test.ts；tests/runtime/page/structured-config/catalog/formal-topic-pages.test.ts。

第 14 包：外部 API 与 live 集成增量（A：主要设计链已接；真实调用/重设输出待签收）
当前 integration/api-management/ui/{api-management-page,api-config-page,api-interface-list-page}.vue 与 interface-list/*；配置四页签按需读、接口左栏/编辑/调用输出/输出内容；DataView保存。新建暂存、公共参数对话框与参考外观不同属已裁决差异；输入参数禁止删/名称创建后不可改、公共参数删除拒绝来自现有规则，不为1:1机械放开。
执行协议：packages/spark-lowcode-api/src/platform/resources/integration/registered-interface-call-resource.ts:66/70 Body/FormData，:101 由命令资源POST派发；src/lowcode/resources/integration/api-management/model-rules.ts:74/91 破坏性输出修改核跨空间消费者。不是页面直调第三方API。
当前差距与数据问题：AI添加的allowAIAdd实际可用性须核本次正式查询；H记录曾名称/URL均false，不能仅有AI按钮算可生成；存量参数类型为空/坏值函数/失效认证引用保留并提示。接口调用可能有外部副作用，真实验证需隔离对象/明确结果；输出重设后同名保留及引用拒绝要服务回读。
H：台账末尾批2第2部分只读打开通义千问2接口，没按调用/重设；旧N3输出父类型校验失败样本不能由112项夹具覆盖核销。
L 增量：本轮正式快照 appworks-migration-blueprint-20261116.json（blueprintIncrementMetadata / publishedNavigation）有mp-open四页（channels/catalog/my-miniapp/application），当前未注册。主控已核4个场景Base_DataSet归属、11个Base_DataModel；模型包括base_enterprise_channel_account、base_channel_operator_account、base_channel_miniapp_template/application、base_channel_account_application、base_channel_miniapp_deployment、Base_AppSystemList。PrimaryKeyFields=null仅是该响应字段为空，未查字段级/运行主键，不断言物理主键缺失。
P 增量计划：取得来源页面/官方业务合同，拆直播挂载、模板管理、小程序管理、申请审批；核第三方账号归属、发布/审批状态机与调用副作用；按正式DataView/命令资源恢复、注册原live URL。不能从表名猜全套流程。
测试入口：tests/runtime/page/api-provider/{api-pages,api-model-rules,api-scenarios}.test.ts；packages/spark-lowcode-api/src/platform/resources/integration/tests/registered-interface-call.test.ts。

第 15 包：报表（A：管理已接；设计/模板/预览运行确实缺失）
参考 integration/report/ui/report-management-list.vue:61设计、:70合并报表模板上传、:72预览。
当前 report-management-page.vue:4 明确设计/预览/模板未承接；:128–136 actions只有编辑、删除、历史版本、模型。report-version-dialog只版本新增/改名/删/启动，不是报表引擎设计。
已实现：Base_ReportInfo+Base_Report新建、版本按RptID过滤、切换启用版本、绑定模型、级联删除与未知回执治理。参考未过滤版本/新增漏RptID/删除遗留版本的缺陷已纠正，不能为1:1恢复缺陷。
关键依赖：参考 @spark-template/report-ui ReportHost；现引擎承接尚缺。合并报表模板路径designfile/Report/<versionId>.docx，需要覆盖、企业路径、回读、未知结果与实际引擎消费；不能照搬Excel不覆盖上传。
H：台账9298–9317有报表头/版本/模型实服CRUD，报表设计/渲染/导出不在其验收内。名称回退到ID可能是被删模型/当前可见范围，需数据问题单列。
P 验收：引擎设计→保存模板/配置→版本切换→正确DataSet输入→渲染/预览/导出；合并/看板各自行为、模板上传覆盖/未知/重开；管理CRUD回归和原版本保留。
测试入口：tests/runtime/application/report/report-management-page.test.ts、report-create-dialog.test.ts、feature-record-dialog.test.ts。

第 17 包：组织、岗位、人员（A：正式只读投影，不安排维护CRUD）
当前 organization/organization-structure/ui/organization-structure-page.vue:3–4；job-management/ui/job-management-page.vue:3–4；user-management/ui/user-management-page.vue:3–4。三页均useFeaturePageRuntime + 正式DataView查询/重置/刷新/分页；人员导航身份与读取的机构场景分开（user-management-page.vue:29–35）。
边界：当前租户正式投影与下游选择是业务目标，无跨租户切换。N1明确维护CRUD不适用，不能虚列缺少增删改。后端投影范围、人员多任职/机构层级与下游办理人选择等必须在其消费者验收，不建前端角色模型。
P 验收：实际租户数据、姓名/机构筛选、分页/空结果/不可读字段、正式ID和显示名、导航场景与消费场景身份、下游选择正确。没有查到当前明确整页缺失，但不据文件存在宣称整包已交付。
测试入口：tests/runtime/organization/{organization-structure,job-management,user-management}/*-page.test.ts。

第 18 包：系统运维（A：BUG/缓存/恢复/监控已接；字段与live日志仍待补）
BUG：system/bug-manage/ui/bug-manage-page.vue:3–4 恢复查询与详情编辑，HandleDate正式模型缺失没有乱替换；处理人历史姓名/ID混用属数据质量。H台账9253–9259仅只读详情/取消，独占写回/回读仍要核。
缓存：system/cache-management/ui/cache-management-page.vue:3–4，类型→条目分页及单键删除经CacheDeleteRequest；当前页搜索不是全服务端全文搜索，原删除身份/未知命令需保持。页面不是原CacheManager旁路。
恢复：system/data-recovery/ui/data-recovery-page.vue:125–138 原来源身份只接受唯一rowid或id，元数据未标来源主键；缺/并存拒绝是明确合同缺口，不猜。恢复操作新增Base_TableData_Recovery、撤销改status，仍需核实际业务行结果。H台账9261–9267有恢复+撤销闭环样本，不等于所有物理表均能恢复。
监控：system/flow-monitor/ui/flow-monitor-page.vue:69–95 已有办理和运行详情路由，不能沿旧台账说详情没接。详情/办理状态与副作用验收归第16包，需跨页一起验收；用户姓名回退原ID不伪造。
L 增量：system/log-viewer/ui/log-viewer-page 为live蓝图节点，当前未注册且conid为空；不能猜场景或退首个场景。取得正式日志查询/字段/分页/范围/导出等合同后再恢复。
P 验收：BUG实际编辑/回读；缓存独占键删除与未知核验；多主键/无主键恢复拒绝、恢复/撤销回到业务数据；监控筛选→同一wfid/flowid详情/办理→状态回读；日志明确身份后按范围查询与输出。
测试入口：tests/ui/cache/cache-management-page.test.ts；packages/spark-lowcode-api/src/platform/resources/system/tests/{cache-page-read-adapter,cache-delete-command,data-recovery-page-read-adapter}.test.ts；监控/审批路由测试由第16包分工合并。

AI Agent Workflow（与第10数据工作流、第16审批流程区分）
当前 src/views/app/WorkflowDesigns.vue:44–45 已有新建、整目录删除；:687/730 通过DataSet保存首次发布命令/已有definition；场景config/pages/shared/agent-workflow-files/pagedata.json。文件owner在资源层，不把类名owner自动判为第二数据链。
明确标准化差距：:71 ClassModel根输入和 :130–133 新增节点表单仍v-model本地状态，没有字段DataView绑定；当前文件顶注“发布不创建文件”已落后于实际首次发布实现。前者应在所属页面收敛，后者改注释；不要沿旧注释重新实现首发。
H：台账9014起首发命令与9041整删有本地合同证据，明确真实服务尚未验收范围；保留原未确认命令，勿重建意图重放。
P 验收：新建首稿→节点/连线/变量/能力/子图→保存→重开→首次发布→既有Definition更新→实际Agent运行消费→整目录删除与引用保护；每个文件和命令分别确认，无跨源事务承诺。
测试入口：tests/ui/views/workflow-designs.test.ts；tests/runtime/auth-nav/workflow/{agent-workflow-creation,agent-workflow-deletion,agent-workflow-publication,agent-workflow-file-resource,agent-workflow-design-resource}.test.ts；tests/app/services/workflow-designs.test.ts。


## 外部依赖与审批嵌入上下文补核

十一、补充：AppWorks 外部包真实依赖与本仓承接（2026-11-16，只沿实际引用）
核查方法：fixed apps/appworks/package.json:14-30 声明17个@spark-template依赖；git grep固定commit中apps/appworks对workflow-ui/business-table-ui/organization-ui的实际import，再读这些符号的包导出/入口和本仓调用者。未把未使用包全量扫描或列为必须照搬的引擎。

11.1 workflow-ui：声明依赖，无AppWorks实际导入证据
- R:apps/appworks/package.json:30（此行路径相对参考仓根，以下包路径亦同）声明@spark-template/workflow-ui；对fixed apps/appworks全树搜索该包名只命中该声明，SparkWorkflowRunPage/SparkWorkflowDetail/SparkWorkflowWorkbench/useSparkWorkflowBusinessContext也无AppWorks命中。
- 该包在 packages/ui/domain/workflow；其 src/index.ts:1-4 导出上述三组件和业务上下文，:5-18导出DataSource/Hooks/Outcome等类型。不能据package.json把它视为AppWorks已在用的审批引擎，也不能因本仓没有同名包就追加整包迁移。
- 参考AppWorks审批实际依赖自己的 R:src/ui/composables/flow/businessPageRuntime.ts、runtimeContext.ts、runPageActions/Submission/History/State/Lifecycle等及 data/api/FlowManage/*。本仓责任方是 src/views/features/workflow + src/lowcode/resources/system/workflow/manage；应迁移被这些调用链实际消费的语义，底层查询/保存归spark-data、公共交互归spark-component，不能以“workflow-ui可替代”跳过。

11.2 审批业务表单宿主不属于business-table-ui；本仓仍有上下文断口
- 参考 R:src/ui/features/workflow/flow-runtime/run-page/ui/flow-run-page.vue:444-451 导入AppWorks自身createFlowBusinessTabBuilder/createFlowBusinessPageCallbacks/createFlowRouteRenderer，:459-462传getFallbackProps=selectFlowBusinessPageProps(flowRuntimeContext)。
- R:src/ui/composables/flow/businessPageRuntime.ts:210-218 明确为脱离RouterView的嵌入业务页provide(routeLocationKey, embeddedRoute)和flowBusinessEmbedKey，:249同步加载路由；:268-275传flow上下文和query并注册mounted/updated/unmounted暴露回调。R:runtimeContext.ts:2-13 的flowid/flowobjid/stepid/workFormId/pageParam/busRowid属于实际业务页输入。
- C:src/views/features/workflow/flow-runtime/run-page/ui/flow-run-route-renderer.vue:45-51只把route.query映射props，:54-77加载组件，没有给嵌入子树provide其业务路由；:25虽声明fallbackProps，但C:flow-run-page.vue:22-23调用未传；C:src/lowcode/resources/system/workflow/manage/flow-run-page/flow-run-page-runtime.ts:62-68直接用存量FormParams，:82的缺省参数仅flowobjid/formkey。
- 这说明当前源码未保留参考的完整嵌入路由与流程上下文合同；使用useRoute()而非props的业务页及缺少FormParams的表单存在断链风险。本次未运行该反例，须新增真实业务子组件集成验证后修复，不能把标题/路由URL正常视为表单已正确装载。
- 现有C:tests/runtime/page/structured-config/workflow/flow-run-page/flow-run-page-mount.test.ts:34把业务route renderer mock掉，不能覆盖该断口。建议验收：两个业务页签分别用useRoute/props读取正式目标及rowid，切换页签/实例后不串身份；缺业务参数时不能误读办理外层路由；flowSubmitEnd/Failed/Succeeded与原数据保存结果闭环。

11.3 organization-ui：真实跨域复用的人员选择，已有标准承接但语义未齐
- 参考包 packages/ui/domain/organization/src/index.ts:1-3 导出MobilePersonPicker/OrganizationPicker/PersonPicker；AppWorks实际使用PersonPicker：应用负责人 application-manager-form-dialog.vue:121、加签 flow-append-user.vue:87、节点候选 use-flow-design-node-panel.ts:9、PC办理 flow-run-page.vue:437、治理 navigation-permission-page.vue:402/role-user-page.vue:191；移动办理 flow-run-page-mobile.vue:430 使用MobilePersonPicker。
- 实际适配器 R:src/ui/features/organization/person-selector/ui/person-data-source.ts:8/13 引OrganizationDataSource和AppWorksPersonDirectory；:82起loadOrganizations提供树/搜索祖先路径，:102起resolveOrganizations恢复选中机构，:113起loadPeople区分未分配/部门及下级/关键词并去重。契约不是简单用户下拉列表。
- 组件当前参考合同 packages/ui/domain/organization/src/PersonPicker.vue:335-374 包括单/多选、maxCount、禁用只读、排序、组织/人员搜索、含下级、未分配、指定scope（空数组也限制为无候选）、组织分支根、excludeIds；移动包提供相应触控入口。角色选择不是这些通用人员交互的必需前提。
- 本仓已有正式标准责任方：C:packages/spark-component/src/components/fields/data-components/picker/FieldUserPicker/FieldUserPicker.vue:11-18→createPickerPreset；C:.../fields/createPickerPreset.ts:59-78支持optionDataViewKey/值标签字段/单多选/搜索；C:.../FieldEntityPicker/FieldEntityPicker.vue:50/83消费useOptionFieldState/useEntityPickerState。C:src/views/features/application/application-manager/ui/application-manager-form-dialog.vue:51-52已用r-user-picker绑定负责人字段及正式用户候选DataView。
- 不可误报“本仓完全没有人员选择器”；但当前r-user-picker是通用实体选项弹窗，尚未见其实现上述组织树分支/含下级/未分配/组织搜索/移动选择语义。应按真实审批用例补标准组件，而非另造页面私有PersonPicker或导入参考宿主。
- 审批加签未复用该标准能力：C:src/views/features/workflow/flow-append-user/ui/flow-append-user.vue:63-78仍el-select+手工options；use-flow-append-user.ts:101-112把用户DataView复制成数组，:148-166手工候选与默认选择；:185直接客户端提交。PC/移动办理另有本报告第七节ExecUserList恒空缺口。
- 验收：候选为空不得放宽为全部用户；服务allowChange/minNum/maxNum与排除已办人语义；组织范围/搜索/多选/取消/选择重开/身份切换；保存值来自同DataView，当前不可读用户不暴露；PC与移动均可完成真实办理。后续治理页复用同一责任方，禁止借人员组件恢复前端角色授权。

11.4 business-table-ui：表/视图/字典和字段选择，不是业务表单运行引擎
- 参考包 packages/ui/optional/business-table；src/contracts.ts:43-59 的BusinessTableSelectorValue包含appId/dbId/tableId/tableName/textField/valueField/queryType(Table|Dict|View)，:65起DataSource提供加载应用/数据库/表/视图/字典/字段与反向定位。
- AppWorks适配 R:src/runtime/business-table.ts:6-80 由AppWorksBusinessTableCatalog提供上述读取和按ID/名称恢复。实际UI消费者：编码 data-code-editor-page.vue:14/147、code-class-edit-dialog.vue:65；Excel excel-import-editor-page.vue:89/285/328、excel-import-sheet-layout-lookup-dialog.vue:313；治理 role-management-page.vue:277。审批模型列表只复用同AppWorks catalog的应用目录，不通过此包加载运行表单。
- 本仓已有按业务承接：C:src/views/features/data-platform/structured-config/data-code/ui/code-reference-table-dialog.vue:22-40/61-64 用正式应用→数据库→_Base_TblList→Base_TblField视图及标准FieldSelect/RendererTable；Excel目标 src/views/features/data-platform/semi-structured/excel-import/ui/excel-import-target-dialog.vue:12-21/39-40 同链；Excel引用 excel-import-reference-dialog.vue:8起明确表/视图/字典选择。数据源及级联归本仓lowcode resources和spark-data，交互归spark-component。
- 不能把business-table-ui未原包迁入标成能力全缺。需逐消费者核缺口：参考Excel物理目标入口允许['Table','View']（R:excel-import-editor-page.vue:94），当前target-dialog只呈现_Base_TblList，视图目标未见等价入口；此为需核服务写入语义后处理的差距，不能仅补一个选项绕过视图可写合同。引用选择已有三类，不应与目标选择混为一项。
- 既有C:tests/runtime/page/structured-config/data-code/source-picker/{scenario,reference-selection}.test.ts覆盖部分场景/选择；完整计划补跨应用/数据库切换清除旧字段、按保存身份反查、Table/View/Dict类型差异、权限/取消/不可见引用不猜配，避免丢掉外部选择器原本承担的语义。

## 报表外部引擎补核

以下R路径相对固定参考仓根（不是apps/appworks根），本次通过git show读取。

- R:`apps/appworks/src/ui/views/ReportManage/ReportDesign/index.vue:3-10`实际挂载ReportHost，传reportId/mode/dataSource/runtimeLoader；`:18-23`分别导入report-ui及本应用runtime/report。路由按自身matched记录限定实例，design/preview有独立模式。当前应承接到`src/views/ReportManage/ReportDesign/index.vue`与`ReportViewer/index.vue`，不产生重复views层。
- R:`apps/appworks/src/runtime/report.ts:2-13`使用ReportDataSource和createStimulsoftReportRuntimeLoader；`:25-35`从环境配置授权值、BASE_URL下Report资源及中文本地化。这里只记录配置责任，不保存授权值。`:53-99`设计加载正式设计快照和模板，捕获并核对执行域/取消；后续预览分支读取报表正式绑定及模板，不能只移植可见页面。
- R:`packages/ui/optional/report/src/ReportHost.vue:11-23`定义数据源、运行时、预览数据及未保存离开保护；`:37-41`定义loaded/saved/error/status事件；`:47-52`有运行实例、取消、加载代次和销毁状态；`:78-99`有保存/离开保护。当前源码未找到同名报表引擎宿主，这些责任需要映射当前标准组件和PageRuntime，不能原样引入旧vue-runtime。
- R:`packages/ui/optional/report/src/stimulsoft/runtime-loader.ts:53-74`按design模式装载引擎；`:80-91`设计态由模型/字段/关系快照构造模拟数据；`:93-110`挂载设计器；`:111`起通过context.onSave回调保存。设计模拟数据不能用于证明正式授权预览/导出，实际查询和模板提交应由当前资源DataView承担。
- 完整验收须覆盖引擎资产可加载、模板/模型版本与正式报表ID一致、编辑保存/重开、离开/取消/切实例释放、正式数据预览及可打开导出产物。授权与资产可用性是待确认依赖，本轮未部署资源或运行报表。该包还包含工作簿/PDF等模块，但本次没有据此追加整包搬迁或声称PDF执行链已经具备。
