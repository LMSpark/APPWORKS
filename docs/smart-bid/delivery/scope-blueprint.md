# 产品、能力与契约层

> 本文件由分层建设方案按职责拆分；实施状态与实服证据只以[唯一迁移台账](../../../notes/data-space-retirement-ledger.md)为准。

## 一、产品层 · 工作入口与验收目标

| 事项 | 归属及适用范围 |
|---|---|
| 租户 | 一个租户就是一家企业。平台按租户提供服务，隔离该企业的数据。 |
| 企业资源 | 宿主企业管理原件、版本及用途授权。跨企业取用须指定接收企业、项目及用途。 |
| 项目 | 项目负责人记录本轮实际选用的版本、资源占用和投标成果。 |

| 工作入口 | 主要使用者与产品结果 | 交给能力层的边界 |
|---|---|---|
| 平台运营工作区 | 运营负责人按租户交付公共能力、定位任务和服务异常 | 平台管理租户状态、公共版本的发布范围及服务记录。企业内容由来源企业决定使用范围 |
| 企业工作区 | 企业有权人指定谁能代表企业投标、哪版企业资源可供谁使用，企业主管协调本企业跨项目的占用 | 代表授权交经办人，资源使用授权和协调决定交项目负责人。企业有权人作出投标决策，由“项目与投标决策”按轮次登记 |
| 项目工作区 | 项目负责人逐项对照应递交清单、企业批准的版本及实际递交记录，追到差异及接手人 | 项目引用正式来源和企业决定，形成自己的基线、响应与制成的文件。文件接收事实取自接收方 |

产品负责人把使用者、结果和外部事实来源交六个分支。每项结果由一个节点主责，多入口引用同一决定。归属冲突或无人接手时，由产品负责人裁定。

责任人用于明确企业责任，不把每个动作限定为人工。授权AI可作业务决定并执行；节点16承担事后审计及纠正关联，审计待办不自动阻断后续。

<a id="blueprint-delivery"></a>

### 蓝图交付标准

沿用[平台蓝图](../overall-solution.md#bid-project-blueprint)的六分支和 21 个节点。每项交付只在原节点登记，下面的交接字段不另建运行时资源目录。

| 交付项 | 唯一出具方及最低内容 | 接收与验收 |
|---|---|---|
| 能力身份 | 产品负责人交本方案节点号、蓝图真实节点引用、能力含义及主责。 | 场景负责人核对应；可细分交付子节点，仍归原能力验收。不把节点号当 scenarioId。 |
| 交付形态 | 蓝图维护人依 metadata 合同选 module、page、embedded、service 或 content。 | UI-only 不造模型；input/action-only 不伪造记录集；service 表示无页面能力，不指新增服务进程。 |
| 场景与资源 | 配置负责人交公共 owner 已核的场景绑定、已注册资源及字段合同。 | 数据开发人只消费本动作所需绑定；无关节点未交不阻断它。所需绑定缺失，停对应资源调用。 |
| 业务对象 | 原事实主责交企业资源、投标主体、标段轮次、内容修订或原操作的适用身份。 | 函数按对象种类核范围；蓝图节点、菜单项、内容节点和 ClassModel 实例互不替代。 |
| 动作与代码 | 业务负责人交动作定义，开发人交实现符号、输入输出校验器、注册绑定及代码版本。 | 按[动作实现标准](../contracts/implementation-interfaces.md#bid-action-implementation)接收；类型声明、已有函数与实际可调用分别留据。 |
| 流程与退回 | 场景负责人交触发、开工输入、可并行项、条件项、原结果查询及接手人。 | 沿 61 个动作引用判本次路径。事后凭据不成为首次开工条件，缺证不能变成不适用。 |
| 验收与状态 | 原责任人交用例、代码范围、运行环境、实得结果和仍缺的凭据。 | 产品交付负责人按范围登记待建、待验或已验；设计态交付状态不等于业务批准或蓝图发布。 |

蓝图配置复用 [metadata owner](E:/r/sparkproject/packages/data/metadata/src/api/ApplicationFunMan/project-blueprint.ts)。新增或调整设计节点先核既有载体，不由投标应用猜测资源身份。

不可变发布、归档及并发发布属于[可选生命周期能力](E:/r/sparkproject/docs/spark-project-blueprint-lifecycle-handoff.md)。未验证真实端口时保留设计结果，不宣称已发布，也不阻断无此依赖的设计与只读验证。

**从蓝图走到一次实际调用**

| 步骤 | 交接及检查 |
|---|---|
| 设计交接 | 蓝图维护人 → 场景负责人：真实节点引用、能力和必要绑定。运行入口另取授权菜单，前端不从蓝图生成菜单或补权限。 |
| 运行绑定 | 可信宿主 → 业务函数：当前场景绑定及本次业务对象。路径或标题变化不改变资源身份；缺当前绑定不得复用另一页或旧会话的绑定。 |
| 执行交接 | 业务函数 → SPARK API 或已注册函数：确定输入与当前权限，原结果按原请求回读。跨功能由 app/widgets 组装或注入端口。 |
| 结果交接 | 验证人 → 下一业务动作：原结果、验证范围及缺项。采用交编制域，外部办理交原经办人，AI 不另写一套正式状态。 |

注册核验是设计与实施交接，不是给每个页面新增一套元数据就绪查询。运行时继续由原公共 owner 和后端核绑定及权限。

支撑节点按原支撑记录交服务函数；没有对应动作的，不补造编号。输入、结果、权限、执行效果和恢复证据仍按同一交接标准核验。

## 二、能力层 · 21 个节点逐项交接

**节点号**对应[平台蓝图](../overall-solution.md#bid-project-blueprint)的六个分支。**阶段**表示节点首次交付。同一注册模型的不同动作可以由不同节点主办。

本文件的节点 01–21 表示能力归属；动作 01–61 查业务规格，任务 01–15 查第一阶段任务书。交接时同时注明编号种类、具体事项和版本。

**输出与取用**按节点列契约，粗体为输出。一个节点可出具多组事实，每个注册动作的结果只归一组。所有受限读写均核当前请求权限。

**主办动作**链接[业务规格的注册动作](../contracts/action-index.md#bid-action-sequence)，**支撑**链接出具人、消费时点与恢复条件。接手方引用原对象及版本，只登记本方决定。

| 编号 · 蓝图分支／能力节点 | 主责人与输入 | 交付物、接收人与核验 | 输出契约及直接取用 | 首次交付阶段 | 主办动作或支撑记录 |
|---|---|---|---|---|---|
| <a id="bid-node-01"></a>01 · 平台运营／租户生命周期 | 租户运营负责人依据服务约定及企业身份开通、停用或办理退出 | 企业管理员、运维按生效时点核可用范围。退出时指定接收人按清单接走在途事项 | **身份与授权**。退出交接取协作与复验、办理与运行记录。按批准的范围导出时取来源与选用、项目与成果 | 1 | 支撑 · [支撑记录与恢复条件](scope-blueprint.md#support-01) |
| <a id="bid-node-02"></a>02 · 平台运营／公共能力发布 | 平台发布负责人核来源方准予发布的版本、范围和目标企业的服务状态 | 目标企业管理员接发布、换版或撤下记录，按时点查适用范围 | **目录与发布**、来源与选用、身份与授权 | 2 | 支撑 · [支撑记录与恢复条件](scope-blueprint.md#support-02) |
| <a id="bid-node-03"></a>03 · 平台运营／服务运行与恢复 | 运维负责人提供原操作查询入口，中断后核恢复点、企业当前服务状态与权限 | 运营接服务恢复记录，有查询权限的经办人接在途清单并按原批次查证 | **办理与运行记录**。恢复取身份与授权、协作与复验。涉及材料用途取来源与选用 | 1 | 支撑 · [支撑记录与恢复条件](scope-blueprint.md#support-03) |
| <a id="bid-node-04"></a>04 · 企业资源与授权／投标主体与代表授权 | 企业有权人确认投标法人、代表、委托事项、范围和期限 | 项目负责人接主体依据，经办人接代表授权，按办理时点核人与事项 | **身份与授权**。核主体原件和委托材料取来源与选用，核本项目代表事项取项目与成果 | 1 | 主办 · [09](../contracts/actions/project-source.md#bid-action-09)、[27](../contracts/actions/project-source.md#bid-action-27)、[55](../contracts/actions/delivery-lifecycle.md#bid-action-55) |
| <a id="bid-node-05"></a>05 · 企业资源与授权／资源使用授权 | 来源企业的有权人取已登记的资源版本，指定可用方、项目、用途和期限 | 项目负责人接使用决定，用资源版本和办理时点核准用范围或撤销授权记录 | **来源与选用**。核取用人取身份与授权，查申请项目或受限资源调配取项目与成果 | 1 | 主办 · [17](../contracts/actions/project-source.md#bid-action-17)、[56](../contracts/actions/delivery-lifecycle.md#bid-action-56) |
| <a id="bid-node-06"></a>06 · 企业资源与授权／跨项目资源协调 | 宿主企业主管核本企业资源的需求、可用范围和有效占用 | 各项目负责人按各自获准范围接收调配结果，冲突交主管重核 | **项目与成果**、来源与选用、身份与授权 | 2 | 支撑 · [支撑记录与恢复条件](scope-blueprint.md#support-06) |
| <a id="bid-node-07"></a>07 · 项目执行／项目与投标决策 | 项目负责人先登记本轮标段、主体及企业投标决策，再引用已核要求和获准资源确定基线 | 编制团队接范围、分工及基线；移交各方接实据与未决，按原任务签收 | **项目与成果**；取身份与授权、来源与选用，移交另取协作与复验、办理与运行记录 | 1 | 主办 · [08](../contracts/actions/project-source.md#bid-action-08)、[18](../contracts/actions/project-source.md#bid-action-18)、[19](../contracts/actions/project-source.md#bid-action-19)、[20](../contracts/actions/project-source.md#bid-action-20)、[22](../contracts/actions/project-source.md#bid-action-22)、[59](../contracts/actions/delivery-lifecycle.md#bid-action-59) |
| <a id="bid-node-08"></a>08 · 项目执行／招标依据 | 分析负责人核正式原件、变更及原位；后续通知另核所指事项、允许范围和期限 | 响应人接逐项要求，交付人接阶段义务；后续来件沿原原件和选版链核据 | **来源与选用**。取项目与成果。<br>查变更影响取协作与复验、办理与运行记录。采用 AI 抽取或查原试次取调用与验证。 | 1 | 主办 · [12](../contracts/actions/project-source.md#bid-action-12)、[13](../contracts/actions/project-source.md#bid-action-13)、[14](../contracts/actions/project-source.md#bid-action-14)、[15](../contracts/actions/project-source.md#bid-action-15)、[16](../contracts/actions/project-source.md#bid-action-16)、[21](../contracts/actions/project-source.md#bid-action-21)、[23](../contracts/actions/project-source.md#bid-action-23)、[24](../contracts/actions/project-source.md#bid-action-24)、[57](../contracts/actions/delivery-lifecycle.md#bid-action-57) |
| <a id="bid-node-09"></a>09 · 项目执行／响应与承诺 | 响应负责人按基线逐项组织答复，引用可用证明和有权方的批准 | 编制人按项目内册节点或独立响应接已核答复、规范值、单位、来源及批准范围，再映射本版表栏。 | **项目与成果**。取来源与选用、身份与授权。<br>分派取协作与复验，担保取办理与运行记录，指南取目录与发布，AI 拟答取调用与验证。 | 1 | 主办 · [25](../contracts/actions/project-source.md#bid-action-25)、[26](../contracts/actions/response-authoring.md#bid-action-26)、[28](../contracts/actions/response-authoring.md#bid-action-28)、[29](../contracts/actions/response-authoring.md#bid-action-29)、[30](../contracts/actions/response-authoring.md#bid-action-30)、[31](../contracts/actions/response-authoring.md#bid-action-31)、[34](../contracts/actions/response-authoring.md#bid-action-34)、[35](../contracts/actions/project-source.md#bid-action-35)、[36](../contracts/actions/response-authoring.md#bid-action-36)、[37](../contracts/actions/response-authoring.md#bid-action-37) |
| <a id="bid-node-10"></a>10 · 项目执行／编制与审定 | 编制负责人把已采用答复映射到同一项目修订的实际页栏，独立附件或平台栏按义务定位。审核人审定该版实件或批准字段。 | 交付负责人接审定范围、版本和填报位置。<br>同一报价跨册时逐册核实填值及批准版本，单册换模板重核成件，独立平台栏核字段位置及批准值。 | **项目与成果**。取来源与选用、身份与授权。<br>核阻断取协作与复验，核制作原请求、签后件或提交态取办理与运行记录，公共版本或受控候选取目录与发布、调用与验证。 | 1 | 主办 · [32](../contracts/actions/response-authoring.md#bid-action-32)、[33](../contracts/actions/response-authoring.md#bid-action-33)、[38](../contracts/actions/response-authoring.md#bid-action-38)、[39](../contracts/actions/response-authoring.md#bid-action-39)、[40](../contracts/actions/delivery-lifecycle.md#bid-action-40)、[41](../contracts/actions/delivery-lifecycle.md#bid-action-41)、[42](../contracts/actions/delivery-lifecycle.md#bid-action-42)、[45](../contracts/actions/response-authoring.md#bid-action-45) |
| <a id="bid-node-11"></a>11 · 项目执行／交付、递交与对账 | 交付负责人核经审定的文件或独立栏、代表权及阻断项，经办人登记原操作、实发包或字段与渠道凭据 | 项目负责人及归档人分接放行、送达、截止及阶段结果；结果与包内证据分别可查 | **办理与运行记录**，冻结交付清单另归 **项目与成果**。取来源与选用、身份与授权、协作与复验 | 1 | 主办 · [46](../contracts/actions/delivery-lifecycle.md#bid-action-46)、[47](../contracts/actions/delivery-lifecycle.md#bid-action-47)、[48](../contracts/actions/delivery-lifecycle.md#bid-action-48)、[49](../contracts/actions/delivery-lifecycle.md#bid-action-49)、[50](../contracts/actions/delivery-lifecycle.md#bid-action-50)、[51](../contracts/actions/delivery-lifecycle.md#bid-action-51)、[52](../contracts/actions/delivery-lifecycle.md#bid-action-52)、[53](../contracts/actions/delivery-lifecycle.md#bid-action-53)、[54](../contracts/actions/delivery-lifecycle.md#bid-action-54)、[58](../contracts/actions/delivery-lifecycle.md#bid-action-58) |
| <a id="bid-node-12"></a>12 · 资源与知识／资源版本与出处 | 登记人接来源方交出的原件、出处和版本 | 分析人、企业资源持有人及项目团队共用同一引用，能重开原版或定位缺件 | **来源与选用**。按标段核目录及领取范围取项目与成果 | 1 | 主办 · [10](../contracts/actions/project-source.md#bid-action-10)、[11](../contracts/actions/project-source.md#bid-action-11) |
| <a id="bid-node-13"></a>13 · 资源与知识／知识目录与指南 | 知识维护人按业务问题编排路径，引用准用来源、适用条件和取材方法 | 获准人员按同版指南查到原件，模型负责人接可绑定动作的业务位置 | **目录与发布**、来源与选用、身份与授权 | 2 | 支撑 · [支撑记录与恢复条件](scope-blueprint.md#support-13) |
| <a id="bid-node-14"></a>14 · 协作与控制／任务与成果交接 | 域负责人指定任务、责任人、期限和预期成果，交回时引用实际版本 | 下一责任人核目标和成果版本，登记接收或退回，批准引用由业务域提供 | **协作与复验**、项目与成果 | 1 | 支撑 · [支撑记录与恢复条件](scope-blueprint.md#support-14) |
| <a id="bid-node-15"></a>15 · 协作与控制／权限消费 | 场景负责人按服务端对当前请求的最终权限落实访问范围 | 各工作区和动作执行方取得本次允许的读写范围及判定依据。代表企业办理仍引用企业出具的具体委托 | **身份与授权** | 1 | 支撑 · [支撑记录与恢复条件](scope-blueprint.md#support-15) |
| <a id="bid-node-16"></a>16 · 协作与控制／问题复验与审计关联 | 业务复核人按问题指向的原件、成果或办理事实核修订与新增证据 | 原责任人接退回项，放行人接复验结论。记录可回查目标版本、处置人和销项依据 | **协作与复验**。按问题对象取来源与选用、项目与成果、办理与运行记录、调用与验证。改派复核人时取身份与授权 | 1 | 主办 · [43](../contracts/actions/response-authoring.md#bid-action-43)、[44](../contracts/actions/response-authoring.md#bid-action-44) |
| <a id="bid-node-17"></a>17 · AI 编排与验证／模型注册与发现 | 模型负责人交注册定义，知识维护人绑定目录条目，AI 按业务问题查指南并提议选用 | 运行负责人接唯一匹配的实例和函数版本，能反查目录与适用条件 | **目录与发布**，单次选择另归 **调用与验证**。取身份与授权、项目与成果 | 3 | 主办 · [01](../contracts/actions/knowledge-ai.md#bid-action-01)、[02](../contracts/actions/knowledge-ai.md#bid-action-02) |
| <a id="bid-node-18"></a>18 · AI 编排与验证／动作执行 | 运行负责人收固定输入，核实例、函数版本及派发时有效的授权 | 输入记录负责人接实际发送记录，验证负责人接同一试次的实际返回或未决记录 | **调用与验证**。取目录与发布、身份与授权、来源与选用。<br>核业务对象取项目与成果，核承办人取协作与复验，核原操作取办理与运行记录。 | 3 | 主办 · [04](../contracts/actions/knowledge-ai.md#bid-action-04) |
| <a id="bid-node-19"></a>19 · AI 编排与验证／输入回读 | 输入记录负责人按已选动作在派发前固定输入，派发后核实际送入函数的值 | 运行负责人接固定输入，验证负责人接同一试次的回读结果及可核范围 | **调用与验证**。取目录与发布、来源与选用、项目与成果、身份与授权，中断后定位取办理与运行记录 | 3 | 主办 · [03](../contracts/actions/knowledge-ai.md#bid-action-03)、[05](../contracts/actions/knowledge-ai.md#bid-action-05) |
| <a id="bid-node-20"></a>20 · AI 编排与验证／验证与退回 | 验证负责人按动作判据、实际发送的输入、返回与独立依据核验 | 调用域负责人接可采用范围或退回点。采用时将试次引用写入原业务成果，缺证项交原责任域补证复验 | **调用与验证**、目录与发布、身份与授权、来源与选用、项目与成果、协作与复验，核办理事实时取办理与运行记录 | 3 | 主办 · [06](../contracts/actions/knowledge-ai.md#bid-action-06)、[07](../contracts/actions/knowledge-ai.md#bid-action-07) |
| <a id="bid-node-21"></a>21 · 资源与知识／配置编审与启用 | 配置发布负责人接各责任域的候选、审阅及闭包，核本作用域启停权限 | 运行、解析、制件及复核人接同版配置和影响记录；公共分发另交02，函数定义另交17 | **目录与发布**；取身份与授权、来源与选用、项目与成果、协作与复验；影响已办事项及AI时才取其运行、验证记录 | 2 | 主办 · [60](../contracts/actions/delivery-lifecycle.md#bid-action-60)、[61](../contracts/actions/delivery-lifecycle.md#bid-action-61) |

各节点负责人向领域架构师交输入出处、输出、接收人及核验方法。消费者各试一笔正常返回与缺项返回，指出下一步和补证人。

跨域记录的凭据及决定人见[七组契约反查表](scope-blueprint.md#contract-register)。缺来源、决定人或接收人的节点，退原主责人补齐。

<a id="support-records"></a>

### 七个支撑节点的记录取用与恢复

消费动作引用出具人的记录、版本、对象、用途和办理时点。迟回凭据另记获知时间，已签署或发送的对象保留原办理事实。

发生变更时沿实际引用找到待办及已用成果。旧版仍有效时留核对依据，效力未查清时暂停受影响部分放行。

| 支撑节点／出具人 | 记录及交接 | 消费动作及使用时点 | 停办、接手及恢复依据 |
|---|---|---|---|
| <a id="support-01"></a>[租户生命周期](scope-blueprint.md#bid-node-01)<br>租户运营负责人 | 出具企业服务状态、范围和生效时间，交管理员、权限消费节点和运维。项目负责人在原任务登记退出接收人。 | [20](../contracts/actions/project-source.md#bid-action-20) 建立范围时取服务状态。[01](../contracts/actions/knowledge-ai.md#bid-action-01) 至 [61](../contracts/actions/delivery-lifecycle.md#bid-action-61) 的受限请求按当时服务范围验权。<br>[04](../contracts/actions/knowledge-ai.md#bid-action-04) 派发、[51](../contracts/actions/delivery-lifecycle.md#bid-action-51) 发送及 [52](../contracts/actions/delivery-lifecycle.md#bid-action-52) 恢复查询各查当时状态。 | 停用时运行负责人停新作业、挂起未发队列。项目负责人跟踪原批次至企业接收人签收。<br>恢复凭现行服务状态及本次权限。退出后凭留存件或获准渠道补查，迟回凭据交 [53](../contracts/actions/delivery-lifecycle.md#bid-action-53)、[54](../contracts/actions/delivery-lifecycle.md#bid-action-54)。 |
| <a id="support-02"></a>[公共能力发布](scope-blueprint.md#bid-node-02)<br>平台发布负责人 | 引用来源方准予分发的版本，登记企业范围及生效、撤下时间。企业管理员核范围，知识维护人负责指南原版。 | [01](../contracts/actions/knowledge-ai.md#bid-action-01) 展示及 [02](../contracts/actions/knowledge-ai.md#bid-action-02) 按注册名读同版动作指南时核企业。[03](../contracts/actions/knowledge-ai.md#bid-action-03) 取片段留发布引用，[04](../contracts/actions/knowledge-ai.md#bid-action-04) 派发前复核。<br>[33](../contracts/actions/response-authoring.md#bid-action-33) 取公共模板、[36](../contracts/actions/response-authoring.md#bid-action-36) 取公共指南均核分发范围。企业自有资料查企业记录。 | 范围收窄时管理员通知编制、响应及运行负责人，暂停相应取用和待发试次。[39](../contracts/actions/response-authoring.md#bid-action-39) 采用前复核已派发结果。<br>仅停新分发的，已准用结果可留据沿用。用途已终止的暂停采用。发布重新有效或获准替代后回 [01](../contracts/actions/knowledge-ai.md#bid-action-01)、[02](../contracts/actions/knowledge-ai.md#bid-action-02)，输入改变再办 [03](../contracts/actions/knowledge-ai.md#bid-action-03)。 |
| <a id="support-03"></a>[服务运行与恢复](scope-blueprint.md#bid-node-03)<br>运维负责人 | 出具中断范围、最后可证步骤、原试次或原操作线索及恢复时间。经办人留办理记录，签署工具、纸件或接收方提供原凭据。 | [04](../contracts/actions/knowledge-ai.md#bid-action-04) 派发、[46](../contracts/actions/delivery-lifecycle.md#bid-action-46) 签署、[51](../contracts/actions/delivery-lifecycle.md#bid-action-51) 发送前核任务状态。恢复时 [05](../contracts/actions/knowledge-ai.md#bid-action-05)、[06](../contracts/actions/knowledge-ai.md#bid-action-06) 查原试次，[46](../contracts/actions/delivery-lifecycle.md#bid-action-46) 查原签署。<br>[52](../contracts/actions/delivery-lifecycle.md#bid-action-52) 查原递交或撤回，[53](../contracts/actions/delivery-lifecycle.md#bid-action-53)、[54](../contracts/actions/delivery-lifecycle.md#bid-action-54) 收渠道补证。 | 运维挂起作业，凭独立于故障备份的现行服务状态、权限及所需委托或用途授权交还。<br>签署经办人查工具或纸件，交 [47](../contracts/actions/delivery-lifecycle.md#bid-action-47) 核签后对象。渠道证据交对账人。确证未发且当次条件满足才续发，未决由项目负责人跟踪。 |
| <a id="support-06"></a>[跨项目资源协调](scope-blueprint.md#bid-node-06)<br>宿主企业主管 | 出具分配、调整或释放决定，记录资源、限额、时段、项目及生效时间。来源企业授权用途，项目只接本项目决定。 | [17](../contracts/actions/project-source.md#bid-action-17) 取受限资源核分配，[25](../contracts/actions/project-source.md#bid-action-25) 核拟任时段，[22](../contracts/actions/project-source.md#bid-action-22) 纳入基线。[19](../contracts/actions/project-source.md#bid-action-19) 退出列待释放占用，由主管核义务和释放时点。<br>无占用限制的材料凭原用途授权取用。 | 主管将变更分别通知占用及接收项目。冲突范围暂停 [35](../contracts/actions/project-source.md#bid-action-35) 资格确认、[45](../contracts/actions/response-authoring.md#bid-action-45) 审定和 [51](../contracts/actions/delivery-lifecycle.md#bid-action-51) 递交，已发交 [52](../contracts/actions/delivery-lifecycle.md#bid-action-52)、[54](../contracts/actions/delivery-lifecycle.md#bid-action-54) 查原批次。<br>项目负责人核现行分配或释放决定及本项目用途授权，从首次受影响的 [17](../contracts/actions/project-source.md#bid-action-17)、[25](../contracts/actions/project-source.md#bid-action-25) 或 [22](../contracts/actions/project-source.md#bid-action-22) 重核，再复验依赖成果。 |
| <a id="support-13"></a>[知识目录与指南](scope-blueprint.md#bid-node-13)<br>知识维护人 | 编审路径、指南、来源与条件，登记条目和注册定义的绑定。模型负责人出具函数定义、版本和验证规则。 | [01](../contracts/actions/knowledge-ai.md#bid-action-01) 定位指南，[02](../contracts/actions/knowledge-ai.md#bid-action-02) 核定义与实例，[03](../contracts/actions/knowledge-ai.md#bid-action-03) 记材料版本，[04](../contracts/actions/knowledge-ai.md#bid-action-04) 核绑定，[06](../contracts/actions/knowledge-ai.md#bid-action-06) 凭规则及独立证据验返回，[07](../contracts/actions/knowledge-ai.md#bid-action-07) 定退回点。<br>[36](../contracts/actions/response-authoring.md#bid-action-36) 人工据指南起草，登记所用指南和实际来源。 | 换版按旧引用通知使用者和运行负责人。知识维护人修路径或引用，模型负责人补定义或规则，来源企业核用途。<br>运行负责人核有效指南、可重开的准用来源及绑定。路径或绑定变化回 [01](../contracts/actions/knowledge-ai.md#bid-action-01)、[02](../contracts/actions/knowledge-ai.md#bid-action-02)，入参变化回 [03](../contracts/actions/knowledge-ai.md#bid-action-03)，仅判据变且原试次完整交 [06](../contracts/actions/knowledge-ai.md#bid-action-06)。 |
| <a id="support-14"></a>[任务与成果交接](scope-blueprint.md#bid-node-14)<br>域负责人、协作负责人 | 域负责人分派，协作负责人在原事项登记目标版本、承办人、期限及改派。接收人签收或退回。整改引 43，查询引原操作或待核义务。 | [34](../contracts/actions/response-authoring.md#bid-action-34) 分派后领任务。[36](../contracts/actions/response-authoring.md#bid-action-36) 作答、[44](../contracts/actions/response-authoring.md#bid-action-44) 复验及 [52](../contracts/actions/delivery-lifecycle.md#bid-action-52) 补查均核目标。[51](../contracts/actions/delivery-lifecycle.md#bid-action-51) 发前核承办人和原发起权。<br>[54](../contracts/actions/delivery-lifecycle.md#bid-action-54) 移交未决清单时登记责任人及下次查询时间。 | 退回、逾期、换版或失权时挂起受影响任务。分派人跟踪新承办人核目标、权限及在途记录并签收，停发旧指令。<br>已有或疑有外部操作先查原结果。[44](../contracts/actions/response-authoring.md#bid-action-44) 凭整改证据复验同一问题，由业务审核人另行决定放行范围。 |
| <a id="support-15"></a>[权限消费](scope-blueprint.md#bid-node-15)<br>场景负责人 | 落实服务端当前请求的权限决定并留可追溯引用。企业有权人另出代表委托，来源企业另出材料用途授权。 | [01](../contracts/actions/knowledge-ai.md#bid-action-01) 至 [61](../contracts/actions/delivery-lifecycle.md#bid-action-61) 的受限读写核本人、企业、对象和用途。[03](../contracts/actions/knowledge-ai.md#bid-action-03) 固定、[04](../contracts/actions/knowledge-ai.md#bid-action-04) 派发、[05](../contracts/actions/knowledge-ai.md#bid-action-05) 回读、[39](../contracts/actions/response-authoring.md#bid-action-39) 采用各查当次权限。<br>[45](../contracts/actions/response-authoring.md#bid-action-45) 审定、[46](../contracts/actions/delivery-lifecycle.md#bid-action-46) 签署、[51](../contracts/actions/delivery-lifecycle.md#bid-action-51) 发送、[52](../contracts/actions/delivery-lifecycle.md#bid-action-52) 查询各查当次权限。[27](../contracts/actions/project-source.md#bid-action-27) 独立确认具体代表事项。 | 收权后停在下一次受影响的读写或派发。项目负责人可改派，场景负责人核实际经办人的当前权限及所需委托、用途授权。<br>历史动作核当时凭据，现时查阅核本次权限。 |

**支撑验收**逐节点取一笔变动或中断记录，正查引用动作及在途事项。再从恢复动作反查原记录、现行依据与接手人。

旧版沿用须核所问时点的效力，缺证须核受影响动作已暂停。原任务留责任人、下次查询或升级时间及交接状态。

签收查任务交接，服务恢复查运维观察，销项查业务复验，送达查指定接收方。各方只对自己出具的事实负责。

## 三、对象与契约层 · 固定各节点交换的事实

<a id="contract-register"></a>

| 判定步骤 | 经办要求 |
|---|---|
| 登记 | 有权方登记事实。银行、商务审批或交易平台已有原始记录时，经办人留原件或可回查凭据。 |
| 引用 | 接手人保留原记录、版本及适用范围，只登记本环节的决定或独立观察。 |
| 比对 | 对齐企业、标段、对象或操作、事项和所问时点。分别记事件生效及本方获知时间。 |
| 裁定 | 同一事项凭据相斥时，由下表的事实责任人核生效、撤销或替代关系。未核清的范围暂停放行。 |

| 契约组／首次启用 | 记录及出具人 | 消费时点和冲突裁定 | 沿用、退回及未决责任 |
|---|---|---|---|
| <a id="bid-contract-01"></a>**身份与授权**／一 | 平台记服务状态，企业有权人出代表委托，服务端判本次访问。[09](../contracts/actions/project-source.md#bid-action-09) 核主体，[27](../contracts/actions/project-source.md#bid-action-27) 按事项、对象及时点核委托。 | 读取、派发核访问，签署、递交、撤回另核代表权。可读但无委托时暂停代办，由企业授权负责人向委托方核实。 | 先后不明时，授权负责人补生效依据，经办人补办理时间。已办核当时凭据，撤权停新动作。<br>项目负责人向有权接手人交接，重核访问、委托和办理窗口。 |
| <a id="bid-contract-02"></a>**来源与选用**／一 | 登记人固定原版和出处，分析人核正式条项与变更。来源企业出用途决定，[56](../contracts/actions/delivery-lifecycle.md#bid-action-56)登记，[17](../contracts/actions/project-source.md#bid-action-17)核取用；[22](../contracts/actions/project-source.md#bid-action-22)记项目选版。 | 确定条款、取材或选版时核范围。指南或基线与原文相抵触，分析人核正式原件、替换关系和生效条件。用途争议交来源企业。 | [23](../contracts/actions/project-source.md#bid-action-23) 查旧字段依赖及新增义务。旧版适用可沿用，新依据同值须记比对结论。改变取值或授权退首次使用处。<br>项目负责人收影响清单，已发送的交对账人核原批次。 |
| <a id="bid-contract-03"></a>**项目与成果**／一 | [22](../contracts/actions/project-source.md#bid-action-22) 记项目基线与选版。商务有权人原处批准报价，[29](../contracts/actions/response-authoring.md#bid-action-29) 读取、[30](../contracts/actions/response-authoring.md#bid-action-30) 记准用事实版本。<br>[39](../contracts/actions/response-authoring.md#bid-action-39) 由有权人采用修订，[45](../contracts/actions/response-authoring.md#bid-action-45) 由审核人审定，[48](../contracts/actions/delivery-lifecycle.md#bid-action-48) 由交付负责人冻结清单。 | 编制取批准值，[42](../contracts/actions/delivery-lifecycle.md#bid-action-42) 读实际位置。不符时商务核原批准，编制核所制文件，审核人判重审范围。已提交的同批值由对账人据实件或提交态核实。 | 范围、输入、用途及批准均适用可沿用。换版由项目负责人定基线，内容或关键字段变更交编制修订、审核人重审。<br>仅改派且成果未变，接手人核权限和版本后续办。 |
| <a id="bid-contract-04"></a>**协作与复验**／一 | [34](../contracts/actions/response-authoring.md#bid-action-34) 分到条款及责任位置，协作负责人记签收、改派。[43](../contracts/actions/response-authoring.md#bid-action-43) 在同一目标立问题，[44](../contracts/actions/response-authoring.md#bid-action-44) 凭改后版本及独立证据复验。 | 领任务核现承办人。[45](../contracts/actions/response-authoring.md#bid-action-45) 审定、[48](../contracts/actions/delivery-lifecycle.md#bid-action-48) 冻结及 [51](../contracts/actions/delivery-lifecycle.md#bid-action-51) 发送各查适用阻断项。旧版已销项而新版有差异，由复核人重核受影响位置。 | 仅改派沿用原问题、目标及获准结果，停发旧指令。目标变化在原事项记新目标，退受影响部分复验。<br>分派人跟到签收。跨域无人接，项目负责人指派并定下次升级时间。 |
| <a id="bid-contract-05"></a>**办理与运行记录**／一 | 签署、封装、发送各记原操作与实际对象。[52](../contracts/actions/delivery-lifecycle.md#bid-action-52) 查原操作，[53](../contracts/actions/delivery-lifecycle.md#bid-action-53) 归集接收方事件，[54](../contracts/actions/delivery-lifecycle.md#bid-action-54) 按本标规则记截止组合。运维登记中断、恢复观察。 | 文件核冻结清单及同批成员，独立栏核获准值及同次实际字段。已发但渠道未确认，分别记发送事实与接收待核。<br>接收核指定渠道凭据，截止核规则及事件生效时间。渠道凭据冲突交指定接收方。 | 原批次保留供查历史，迟回凭据注明获知时间。有查询权的经办人查原操作，未决停重发。对账人仅修订有新证据的结论，项目负责人跟踪未决义务。 |
| <a id="bid-contract-06"></a>**目录与发布**／二 | 知识维护人编审指南、登记绑定，模型负责人登记定义、版本和验证规则。发布负责人据来源方准许的分发范围登记发布版本；节点21登记业务配置的启停与作用域指针。 | 查目录、直接选函数、取公共模板均核分发范围，派发前核绑定。目录可见而原件未授权时暂停取材，知识维护人核路径，来源企业定用途。 | 仅停新分发，业务域可核据沿用已获准成果。用途失效停采用。路径或绑定退 [01](../contracts/actions/knowledge-ai.md#bid-action-01)、[02](../contracts/actions/knowledge-ai.md#bid-action-02)，输入改变退 [03](../contracts/actions/knowledge-ai.md#bid-action-03)。发布范围不明交发布负责人。 |
| <a id="bid-contract-07"></a>**调用与验证**／三 | 运行负责人记试次和函数版本，输入记录负责人固定待发值并回读实发。原返回归对应试次，验证人逐字段核来源、依赖与范围。<br>业务有权人把采用决定记入业务成果。签署及送达归办理记录。 | [06](../contracts/actions/knowledge-ai.md#bid-action-06) 验原调用。AI 抽取交 16 核定，混编交 [37](../contracts/actions/response-authoring.md#bid-action-37) 核选用内容，38 复用对应证据，[39](../contracts/actions/response-authoring.md#bid-action-39) 采用另核权限与业务选择。<br>缺业务批准交业务有权人，工具成功而渠道未决由经办人查原操作。 | 输入、返回及判据仍适用可沿用验证。仅判据变且原试次完整，验证人重做 [06](../contracts/actions/knowledge-ai.md#bid-action-06)。入参或绑定变化另开关联试次。<br>迟回归原试次。[07](../contracts/actions/knowledge-ai.md#bid-action-07) 指出退回点，调用域负责人跟踪受影响成果。 |

事实准用统一按[原版本与本次使用](../contracts/business-data.md#bid-source-use)核范围、依赖和时限。材料许可、举证资格与AI依赖分别判断；历史已办不等于当前可用。

节点12交[受控字段原版](../contracts/resources-models.md#bid-controlled-field)，05交用途决定，09交事实及原核定引用，10接固定解析。页05、06、10–13及18复用同一记录。

**契约反查**分“出”和“取”。“出”含原件核读产生的结果，“取”列其余直接引用。组内再次取用见动作输入，连续编号含两端。

“身份与授权”适用于全部受限请求。表内只列直接引用。“目录与发布”“调用与验证”按实际启用的分支取用。

动作输入条件是依赖定义的原处，反向清单据此生成；实际变更影响另核原请求所用版本。接收方摘要不作完整消费者清单，避免重复维护和漏派，见[引用规则](../contracts/resources-models.md#bid-reference-timing)。

| 契约组 | 能力节点（第二节编号） | 注册动作（业务规格编号） |
|---|---|---|
| [身份与授权](scope-blueprint.md#bid-contract-01) | 出 [01](scope-blueprint.md#bid-node-01)、[04](scope-blueprint.md#bid-node-04)、[15](scope-blueprint.md#bid-node-15)<br>取 [02](scope-blueprint.md#bid-node-02)–[03](scope-blueprint.md#bid-node-03)、[05](scope-blueprint.md#bid-node-05)–[07](scope-blueprint.md#bid-node-07)、[09](scope-blueprint.md#bid-node-09)–[11](scope-blueprint.md#bid-node-11)、[13](scope-blueprint.md#bid-node-13)、[16](scope-blueprint.md#bid-node-16)–[21](scope-blueprint.md#bid-node-21) | 出 [09](../contracts/actions/project-source.md#bid-action-09)、[27](../contracts/actions/project-source.md#bid-action-27)、[55](../contracts/actions/delivery-lifecycle.md#bid-action-55)<br>取 [01](../contracts/actions/knowledge-ai.md#bid-action-01)–[05](../contracts/actions/knowledge-ai.md#bid-action-05)、[17](../contracts/actions/project-source.md#bid-action-17)–[20](../contracts/actions/project-source.md#bid-action-20)、[22](../contracts/actions/project-source.md#bid-action-22)、[25](../contracts/actions/project-source.md#bid-action-25)、[29](../contracts/actions/response-authoring.md#bid-action-29)–[31](../contracts/actions/response-authoring.md#bid-action-31)、[35](../contracts/actions/project-source.md#bid-action-35)、[39](../contracts/actions/response-authoring.md#bid-action-39)、[44](../contracts/actions/response-authoring.md#bid-action-44)–[47](../contracts/actions/delivery-lifecycle.md#bid-action-47)、[51](../contracts/actions/delivery-lifecycle.md#bid-action-51)–[52](../contracts/actions/delivery-lifecycle.md#bid-action-52)、[56](../contracts/actions/delivery-lifecycle.md#bid-action-56)–[61](../contracts/actions/delivery-lifecycle.md#bid-action-61) |
| [来源与选用](scope-blueprint.md#bid-contract-02) | 出 [05](scope-blueprint.md#bid-node-05)、[08](scope-blueprint.md#bid-node-08)、[12](scope-blueprint.md#bid-node-12)<br>取 [01](scope-blueprint.md#bid-node-01)–[04](scope-blueprint.md#bid-node-04)、[06](scope-blueprint.md#bid-node-06)–[07](scope-blueprint.md#bid-node-07)、[09](scope-blueprint.md#bid-node-09)–[11](scope-blueprint.md#bid-node-11)、[13](scope-blueprint.md#bid-node-13)、[16](scope-blueprint.md#bid-node-16)、[18](scope-blueprint.md#bid-node-18)–[21](scope-blueprint.md#bid-node-21) | 出 [10](../contracts/actions/project-source.md#bid-action-10)–[17](../contracts/actions/project-source.md#bid-action-17)、[21](../contracts/actions/project-source.md#bid-action-21)、[23](../contracts/actions/project-source.md#bid-action-23)–[24](../contracts/actions/project-source.md#bid-action-24)、[56](../contracts/actions/delivery-lifecycle.md#bid-action-56)–[57](../contracts/actions/delivery-lifecycle.md#bid-action-57)<br>取 [03](../contracts/actions/knowledge-ai.md#bid-action-03)–[04](../contracts/actions/knowledge-ai.md#bid-action-04)、[06](../contracts/actions/knowledge-ai.md#bid-action-06)–[09](../contracts/actions/project-source.md#bid-action-09)、[18](../contracts/actions/project-source.md#bid-action-18)–[19](../contracts/actions/project-source.md#bid-action-19)、[22](../contracts/actions/project-source.md#bid-action-22)、[25](../contracts/actions/project-source.md#bid-action-25)–[28](../contracts/actions/response-authoring.md#bid-action-28)、[30](../contracts/actions/response-authoring.md#bid-action-30)–[51](../contracts/actions/delivery-lifecycle.md#bid-action-51)、[54](../contracts/actions/delivery-lifecycle.md#bid-action-54)–[55](../contracts/actions/delivery-lifecycle.md#bid-action-55)、[58](../contracts/actions/delivery-lifecycle.md#bid-action-58)–[61](../contracts/actions/delivery-lifecycle.md#bid-action-61) |
| [项目与成果](scope-blueprint.md#bid-contract-03) | 出 [06](scope-blueprint.md#bid-node-06)–[07](scope-blueprint.md#bid-node-07)、[09](scope-blueprint.md#bid-node-09)–[11](scope-blueprint.md#bid-node-11)<br>取 [01](scope-blueprint.md#bid-node-01)、[04](scope-blueprint.md#bid-node-04)–[05](scope-blueprint.md#bid-node-05)、[08](scope-blueprint.md#bid-node-08)、[12](scope-blueprint.md#bid-node-12)、[14](scope-blueprint.md#bid-node-14)、[16](scope-blueprint.md#bid-node-16)–[21](scope-blueprint.md#bid-node-21) | 出 [08](../contracts/actions/project-source.md#bid-action-08)、[18](../contracts/actions/project-source.md#bid-action-18)–[20](../contracts/actions/project-source.md#bid-action-20)、[22](../contracts/actions/project-source.md#bid-action-22)、[25](../contracts/actions/project-source.md#bid-action-25)–[26](../contracts/actions/response-authoring.md#bid-action-26)、[28](../contracts/actions/response-authoring.md#bid-action-28)–[42](../contracts/actions/delivery-lifecycle.md#bid-action-42)、[45](../contracts/actions/response-authoring.md#bid-action-45)、[48](../contracts/actions/delivery-lifecycle.md#bid-action-48)、[59](../contracts/actions/delivery-lifecycle.md#bid-action-59)<br>取 [02](../contracts/actions/knowledge-ai.md#bid-action-02)–[04](../contracts/actions/knowledge-ai.md#bid-action-04)、[06](../contracts/actions/knowledge-ai.md#bid-action-06)–[07](../contracts/actions/knowledge-ai.md#bid-action-07)、[10](../contracts/actions/project-source.md#bid-action-10)、[13](../contracts/actions/project-source.md#bid-action-13)、[17](../contracts/actions/project-source.md#bid-action-17)、[23](../contracts/actions/project-source.md#bid-action-23)–[24](../contracts/actions/project-source.md#bid-action-24)、[27](../contracts/actions/project-source.md#bid-action-27)、[43](../contracts/actions/response-authoring.md#bid-action-43)–[44](../contracts/actions/response-authoring.md#bid-action-44)、[46](../contracts/actions/delivery-lifecycle.md#bid-action-46)–[47](../contracts/actions/delivery-lifecycle.md#bid-action-47)、[49](../contracts/actions/delivery-lifecycle.md#bid-action-49)–[58](../contracts/actions/delivery-lifecycle.md#bid-action-58)、[60](../contracts/actions/delivery-lifecycle.md#bid-action-60)–[61](../contracts/actions/delivery-lifecycle.md#bid-action-61) |
| [协作与复验](scope-blueprint.md#bid-contract-04) | 出 [14](scope-blueprint.md#bid-node-14)、[16](scope-blueprint.md#bid-node-16)<br>取 [01](scope-blueprint.md#bid-node-01)、[03](scope-blueprint.md#bid-node-03)、[07](scope-blueprint.md#bid-node-07)–[11](scope-blueprint.md#bid-node-11)、[18](scope-blueprint.md#bid-node-18)、[20](scope-blueprint.md#bid-node-20)–[21](scope-blueprint.md#bid-node-21) | 出 [43](../contracts/actions/response-authoring.md#bid-action-43)–[44](../contracts/actions/response-authoring.md#bid-action-44)<br>取 [04](../contracts/actions/knowledge-ai.md#bid-action-04)、[07](../contracts/actions/knowledge-ai.md#bid-action-07)、[23](../contracts/actions/project-source.md#bid-action-23)、[29](../contracts/actions/response-authoring.md#bid-action-29)、[34](../contracts/actions/response-authoring.md#bid-action-34)、[36](../contracts/actions/response-authoring.md#bid-action-36)、[45](../contracts/actions/response-authoring.md#bid-action-45)–[46](../contracts/actions/delivery-lifecycle.md#bid-action-46)、[48](../contracts/actions/delivery-lifecycle.md#bid-action-48)、[51](../contracts/actions/delivery-lifecycle.md#bid-action-51)–[54](../contracts/actions/delivery-lifecycle.md#bid-action-54)、[59](../contracts/actions/delivery-lifecycle.md#bid-action-59)–[61](../contracts/actions/delivery-lifecycle.md#bid-action-61) |
| [办理与运行记录](scope-blueprint.md#bid-contract-05) | 出 [03](scope-blueprint.md#bid-node-03)、[11](scope-blueprint.md#bid-node-11)<br>取 [01](scope-blueprint.md#bid-node-01)、[07](scope-blueprint.md#bid-node-07)–[10](scope-blueprint.md#bid-node-10)、[16](scope-blueprint.md#bid-node-16)、[18](scope-blueprint.md#bid-node-18)–[21](scope-blueprint.md#bid-node-21) | 出 [46](../contracts/actions/delivery-lifecycle.md#bid-action-46)–[47](../contracts/actions/delivery-lifecycle.md#bid-action-47)、[49](../contracts/actions/delivery-lifecycle.md#bid-action-49)–[54](../contracts/actions/delivery-lifecycle.md#bid-action-54)、[58](../contracts/actions/delivery-lifecycle.md#bid-action-58)<br>取 [04](../contracts/actions/knowledge-ai.md#bid-action-04)–[07](../contracts/actions/knowledge-ai.md#bid-action-07)、[13](../contracts/actions/project-source.md#bid-action-13)、[20](../contracts/actions/project-source.md#bid-action-20)、[23](../contracts/actions/project-source.md#bid-action-23)、[26](../contracts/actions/response-authoring.md#bid-action-26)、[40](../contracts/actions/delivery-lifecycle.md#bid-action-40)–[44](../contracts/actions/response-authoring.md#bid-action-44)、[48](../contracts/actions/delivery-lifecycle.md#bid-action-48)、[57](../contracts/actions/delivery-lifecycle.md#bid-action-57)、[59](../contracts/actions/delivery-lifecycle.md#bid-action-59)、[61](../contracts/actions/delivery-lifecycle.md#bid-action-61) |
| [目录与发布](scope-blueprint.md#bid-contract-06) | 出 [02](scope-blueprint.md#bid-node-02)、[13](scope-blueprint.md#bid-node-13)、[17](scope-blueprint.md#bid-node-17)、[21](scope-blueprint.md#bid-node-21)<br>取 [08](scope-blueprint.md#bid-node-08)–[10](scope-blueprint.md#bid-node-10)、[16](scope-blueprint.md#bid-node-16)、[18](scope-blueprint.md#bid-node-18)–[20](scope-blueprint.md#bid-node-20) | 出 [60](../contracts/actions/delivery-lifecycle.md#bid-action-60)–[61](../contracts/actions/delivery-lifecycle.md#bid-action-61)<br>取 [01](../contracts/actions/knowledge-ai.md#bid-action-01)–[04](../contracts/actions/knowledge-ai.md#bid-action-04)、[06](../contracts/actions/knowledge-ai.md#bid-action-06)、[15](../contracts/actions/project-source.md#bid-action-15)–[16](../contracts/actions/project-source.md#bid-action-16)、[33](../contracts/actions/response-authoring.md#bid-action-33)、[36](../contracts/actions/response-authoring.md#bid-action-36)–[37](../contracts/actions/response-authoring.md#bid-action-37)、[39](../contracts/actions/response-authoring.md#bid-action-39)–[40](../contracts/actions/delivery-lifecycle.md#bid-action-40)、[43](../contracts/actions/response-authoring.md#bid-action-43)–[44](../contracts/actions/response-authoring.md#bid-action-44) |
| [调用与验证](scope-blueprint.md#bid-contract-07) | 出 [17](scope-blueprint.md#bid-node-17)–[20](scope-blueprint.md#bid-node-20)<br>取 [08](scope-blueprint.md#bid-node-08)–[10](scope-blueprint.md#bid-node-10)、[16](scope-blueprint.md#bid-node-16)、[21](scope-blueprint.md#bid-node-21) | 出 [01](../contracts/actions/knowledge-ai.md#bid-action-01)–[07](../contracts/actions/knowledge-ai.md#bid-action-07)<br>取 [15](../contracts/actions/project-source.md#bid-action-15)–[16](../contracts/actions/project-source.md#bid-action-16)、[23](../contracts/actions/project-source.md#bid-action-23)、[36](../contracts/actions/response-authoring.md#bid-action-36)–[39](../contracts/actions/response-authoring.md#bid-action-39)、[43](../contracts/actions/response-authoring.md#bid-action-43)–[44](../contracts/actions/response-authoring.md#bid-action-44)、[60](../contracts/actions/delivery-lifecycle.md#bid-action-60)–[61](../contracts/actions/delivery-lifecycle.md#bid-action-61) |




| 交给场景负责人 | 可核结果 |
|---|---|
| 沿用与冲突 | 每组各取一笔沿用及冲突或缺证样本。原记录正查引用成果，当前结论反查决定人、原据、范围及生效和获知时间。 |
| 未决交接 | 保留已证事实。缺证部分挂回原义务、问题或操作，记缺项、取证人及下次查询或升级时间，由原有权人定案。 |
| 跟踪签收 | 项目负责人跟踪放行事项。仅涉公共发布、资源调配或模型定义的，由相应节点负责人跟踪。 |
