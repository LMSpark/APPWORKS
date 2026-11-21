# 61 动作与递交核验索引

> 动作编号、九项递交核验与验收来源单列；详细动作卡位于 [actions/](actions/README.md)。

## 12. 注册动作与递交核验

<a id="bid-action-sequence"></a>

### 注册动作编号

每个编号链接到输入、输出、主办页面、权限、换版退回、契约及缺证接手人。页面实际函数按[接线标准](implementation-interfaces.md#bid-operation-binding)交付。按[四种引用时点](resources-models.md#bid-reference-timing)核本次应有凭据与后续补证。

业务目录用于查模型，主责节点负责结果。动作按输入及适用条件办理。首期任务书的 01 至 15 是建设任务编号。

55、56登记原委托和用途决定；57–59接后续通知、阶段结果与移交。编号不是执行顺序，仍由任务06交范围、09办用途、11定基线。

| 动作编号 | 主责能力节点 | 业务目录 | 注册模型与动作 |
|---|---|---|---|
| [01](actions/knowledge-ai.md#bid-action-01) | 模型注册与发现 | 企业知识／复用 | `KnowledgeGuide.查指南` |
| [02](actions/knowledge-ai.md#bid-action-02) | 模型注册与发现 | AI 作业／验证 | `ActionContract.读动作指南` |
| [03](actions/knowledge-ai.md#bid-action-03) | 输入回读 | AI 作业／验证 | `ContextManifest.冻结本步输入` |
| [04](actions/knowledge-ai.md#bid-action-04) | 动作执行 | AI 作业／验证 | `GenerationRun.执行一步` |
| [05](actions/knowledge-ai.md#bid-action-05) | 输入回读 | AI 作业／验证 | `ContextManifest.回读本步输入` |
| [06](actions/knowledge-ai.md#bid-action-06) | 验证与退回 | AI 作业／验证 | `ActionVerification.验证返回` |
| [07](actions/knowledge-ai.md#bid-action-07) | 验证与退回 | AI 作业／验证 | `GenerationRun.退回一步` |
| [08](actions/project-source.md#bid-action-08) | 项目与投标决策 | 参加投标／项目与主体 | `TenderLot.定位标段` |
| [09](actions/project-source.md#bid-action-09) | 投标主体与代表授权 | 参加投标／项目与主体 | `BidSubject.识别企业` |
| [10](actions/project-source.md#bid-action-10) | 资源版本与出处 | 招标依据／原件与变更 | `TenderFileRegister.核领取清单` |
| [11](actions/project-source.md#bid-action-11) | 资源版本与出处 | 招标依据／原件与变更 | `TenderFileVersion.固定原件` |
| [12](actions/project-source.md#bid-action-12) | 招标依据 | 招标依据／原件与变更 | `TenderFileVersion.读原件位置` |
| [13](actions/project-source.md#bid-action-13) | 招标依据 | 招标依据／原件与变更 | `PrebidInquiry.核澄清进展` |
| [14](actions/project-source.md#bid-action-14) | 招标依据 | 招标依据／原件与变更 | `TenderAddendum.对照变更` |
| [15](actions/project-source.md#bid-action-15) | 招标依据 | 招标依据／原件与变更 | `TenderRecord.提取事项` |
| [16](actions/project-source.md#bid-action-16) | 招标依据 | 招标依据／原件与变更 | `TenderRecord.核定事项` |
| [17](actions/project-source.md#bid-action-17) | 资源使用授权 | 资格／证明 | `ResourceVersion.取适用材料` |
| [18](actions/project-source.md#bid-action-18) | 项目与投标决策 | 参加投标／项目与主体 | `ProjectSubject.核成员组合` |
| [19](actions/project-source.md#bid-action-19) | 项目与投标决策 | 参加投标／项目与主体 | `ParticipationDecision.登记投标决策` |
| [20](actions/project-source.md#bid-action-20) | 项目与投标决策 | 参加投标／项目与主体 | `ContentProject.绑定编制范围` |
| [21](actions/project-source.md#bid-action-21) | 招标依据 | 招标依据／原件与变更 | `Requirement.确定条款` |
| [22](actions/project-source.md#bid-action-22) | 项目与投标决策 | 招标依据／原件与变更 | `Baseline.冻结依据` |
| [23](actions/project-source.md#bid-action-23) | 招标依据 | 招标依据／原件与变更 | `TenderAddendum.追查变更引用` |
| [24](actions/project-source.md#bid-action-24) | 招标依据 | 招标依据／原件与变更 | `SubmissionObligation.列出应递交事项` |
| [25](actions/project-source.md#bid-action-25) | 响应与承诺 | 资格／证明 | `Person.核拟任人` |
| [26](actions/response-authoring.md#bid-action-26) | 响应与承诺 | 商务／投标担保 | `BidSecurity.核担保办理` |
| [27](actions/project-source.md#bid-action-27) | 投标主体与代表授权 | 参加投标／对外授权 | `AuthorityGrant.核代表权限` |
| [28](actions/response-authoring.md#bid-action-28) | 响应与承诺 | 报价／编制核价 | `PriceSheet.复算报价` |
| [29](actions/response-authoring.md#bid-action-29) | 响应与承诺 | 报价／编制核价 | `ApprovedPrice.读取批准价` |
| [30](actions/response-authoring.md#bid-action-30) | 响应与承诺 | 响应／承诺与偏离 | `FactVersion.登记批准使用的事实` |
| [31](actions/response-authoring.md#bid-action-31) | 响应与承诺 | 响应／承诺与偏离 | `FactVersion.读取批准使用的事实` |
| [32](actions/response-authoring.md#bid-action-32) | 编制与审定 | 编制／分册、采用与审核 | `BidVolume.策划分册` |
| [33](actions/response-authoring.md#bid-action-33) | 编制与审定 | 编制／分册、采用与审核 | `DocumentTemplate.匹配原表` |
| [34](actions/response-authoring.md#bid-action-34) | 响应与承诺 | 响应／承诺与偏离 | `ResponseAssignment.分派答复` |
| [35](actions/project-source.md#bid-action-35) | 响应与承诺 | 资格／证明 | `QualificationReview.核所选证明` |
| [36](actions/response-authoring.md#bid-action-36) | 响应与承诺 | 响应／承诺与偏离 | `Response.编拟响应` |
| [37](actions/response-authoring.md#bid-action-37) | 响应与承诺 | 响应／承诺与偏离 | `Response.核对答复` |
| [38](actions/response-authoring.md#bid-action-38) | 编制与审定 | 编制／分册、采用与审核 | `ContentRevision.生成候选` |
| [39](actions/response-authoring.md#bid-action-39) | 编制与审定 | 编制／分册、采用与审核 | `ContentAdoption.采用变更` |
| [40](actions/delivery-lifecycle.md#bid-action-40) | 编制与审定 | 交付／制作、签署与封装 | `ProducedFile.生成待核件` |
| [41](actions/delivery-lifecycle.md#bid-action-41) | 编制与审定 | 交付／制作、签署与封装 | `ProducedFile.登记制作完成的文件` |
| [42](actions/delivery-lifecycle.md#bid-action-42) | 编制与审定 | 交付／制作、签署与封装 | `AnswerLocation.回读填报内容` |
| [43](actions/response-authoring.md#bid-action-43) | 问题复验与审计关联 | 编制／分册、采用与审核 | `CheckFinding.登记问题` |
| [44](actions/response-authoring.md#bid-action-44) | 问题复验与审计关联 | 编制／分册、采用与审核 | `CheckFinding.复验问题` |
| [45](actions/response-authoring.md#bid-action-45) | 编制与审定 | 编制／分册、采用与审核 | `Approval.核审核覆盖` |
| [46](actions/delivery-lifecycle.md#bid-action-46) | 交付、递交与对账 | 交付／制作、签署与封装 | `SignatureRecord.办理签署` |
| [47](actions/delivery-lifecycle.md#bid-action-47) | 交付、递交与对账 | 交付／制作、签署与封装 | `SignatureRecord.核签署覆盖` |
| [48](actions/delivery-lifecycle.md#bid-action-48) | 交付、递交与对账 | 交付／制作、签署与封装 | `DeliveryManifest.冻结交付清单` |
| [49](actions/delivery-lifecycle.md#bid-action-49) | 交付、递交与对账 | 交付／制作、签署与封装 | `SubmissionPackage.封装递交文件` |
| [50](actions/delivery-lifecycle.md#bid-action-50) | 交付、递交与对账 | 交付／制作、签署与封装 | `SubmissionPackage.核对包内文件` |
| [51](actions/delivery-lifecycle.md#bid-action-51) | 交付、递交与对账 | 递交／发送、回执与截止对账 | `SubmissionAttempt.办理递交或撤回` |
| [52](actions/delivery-lifecycle.md#bid-action-52) | 交付、递交与对账 | 递交／发送、回执与截止对账 | `SubmissionAttempt.查本次办理` |
| [53](actions/delivery-lifecycle.md#bid-action-53) | 交付、递交与对账 | 递交／发送、回执与截止对账 | `ChannelReceipt.核接收凭据` |
| [54](actions/delivery-lifecycle.md#bid-action-54) | 交付、递交与对账 | 递交／发送、回执与截止对账 | `SubmissionReconciliation.核截止组合` |
| [55](actions/delivery-lifecycle.md#bid-action-55) | 投标主体与代表授权 | 企业资源／代表授权 | `AuthorityGrant.登记代表委托` |
| [56](actions/delivery-lifecycle.md#bid-action-56) | 资源使用授权 | 企业资源／资料用途 | `ResourceUseDecision.登记资料使用决定` |
| [57](actions/delivery-lifecycle.md#bid-action-57) | 招标依据 | 项目后续／通知与答复 | `TenderFollowup.登记后续事项` |
| [58](actions/delivery-lifecycle.md#bid-action-58) | 交付、递交与对账 | 项目后续／结果跟踪 | `TenderOutcome.核阶段结果` |
| [59](actions/delivery-lifecycle.md#bid-action-59) | 项目与投标决策 | 项目后续／移交与归档 | `BidHandoff.核本轮移交` |
| [60](actions/delivery-lifecycle.md#bid-action-60) | 配置编审与启用 | 业务配置／启用 | `ConfigurationRelease.启用业务配置` |
| [61](actions/delivery-lifecycle.md#bid-action-61) | 配置编审与启用 | 业务配置／停用 | `ConfigurationRelease.停用业务配置` |

<a id="bid-amendment-acceptance"></a>

### 九项递交核验

每次写明项目、轮次、标段、主体、问题与核验时点，引用原件页栏或渠道事件。公开反查限于正式披露范围，缺企业记录则内部状态待核。[判定与换版](resources-models.md#bid-branch-rules)

| 结论或办理方式 | 判据与责任 |
|---|---|
| 通过／不通过 | 达到本行证据条件记通过。核实违反明确条件，或有权机构作出否定认定，记不通过。缺件或证据冲突未决记待核实。 |
| 不适用 | 分析负责人核原文，相应事实责任人核本次条件，再由项目负责人登记不适用范围和依据。 |
| 准备与恢复 | 01、02 查目录和动作定义，03 固定输入，04 执行，05 回读实发输入，06 独立验证。错用输入时，07 退到最早受影响的动作。 |
| 企业与公开核查 | 企业办理用 51 执行获授权动作。公开反查从 52 读既有记录。原始资料页码见第 13 节。 |

| 核验问题与动作 | 通过所需证据 | 停点与交接 |
|---|---|---|
| 1．正式修改适用哪个包、哪一行？08–16、21–22 | 核项目、包、发布者及正式版本顺序，13 区分提问和正式答复。15、16 核原位，再对条款范围、新旧行及报价原表位置。 | 缺替换附件、适用范围或行对应，资料经办人补原件。资料员交 23 查影响，企业用 22 冻结依据。公开反查由 16 交 24。 |
| 1．案例 | 都灵 59804 号澄清覆盖 Bando 1 的 08-01，5 月 18 日图纸更正只涉 06-01 至 06-08。 | 仅凭发布日期不能选定某一包。 |
| 2．重算还是沿用？17、23–26、28、32–37 | 沿变动字段查依赖，按新旧应递交清单认领新增项。改数量重算行和合计，只改限价先核原价，实际改价再重算。 | 改规格或名称复核适配、承诺和原表，只延期重核时效。25 人员、26 担保、35 资格按实际影响复核。 |
| 2．交接与案例 | 沿用列原输入、批准范围和仍适用依据。成都 286 项由 2 个改 26 个，限价 531 改 35 元，再次改名可复用同输入乘法，仍须换表。 | 缺适配或原价依据交技术、商务。23 交各责任册，32–34 分派具体行栏，改答复交 36–39。可留已核算式，受影响行、册、汇总待审。 |
| 3．新件是否获准？18–20、27、29–31、38–50 | 18–20 定主体和编制范围，核本次授权、批准价及采用版。文件取实填、应有签署和包内成员，独立栏取批准值与填报责任，均须对拟交版。 | 缺批准、签署或对应则停相应环节。交付负责人将获准包或平台任务交 51。缺证交 43，44 按原问题复验。 |
| 3．公开核查 | 成都披露件实报单价 16 元，内部批准价仍待核实。 | 内部放行待核时，公开只读核查可继续第 4–9 项。 |
| 4．旧件是否撤回？24、27、51–53 | 以适用变更规则、原递交标识或声明，配平台撤回事件或接收方正式认定。表单同时办撤旧及交新，分别判效力。 | 撤回意向、领取回执或无可辨旧批次，只记待核。项目号与原递交号混填须回查原笔。53 交 54，合并表单另核第 5 项。 |
| 4．案例 | Nisko 一份变更表明确撤回 22 日旧件，采购人事后确认。都灵另有 21:12:04 撤回事件。 | 保留每个项目的事件和所指旧批次。 |
| 5．新件是否按时送达？24、51–53 | 新操作与同包、主体、渠道、接收方时间配对，据适用时区及截止认定。分别注明原始凭据、平台事件或采购人事后记载。 | 缺接收、结果或可比时间，渠道经办人补证。落款、开标时间及旧回执不能补成新接收时间。53 将新批、事件和时间交 54。 |
| 5．案例 | Nisko 08:29:23 送达，截止 10:00。都灵 6 月 4 日 21:15:58 重提交，早于 6 月 7 日 09:00。 | 各依本轮适用时间判断。 |
| 6．截止时哪一笔有效？23–24、52–54 | 逐笔对账截止前已核的提交、撤回、替换及补充，依本标规则确定有效组合，核是否还须开标确认。记录当时可知范围。 | 缺原操作关联、接收或后续撤换，列候选批次和未决项。已撤原件不能因新件失败恢复。54 交投标负责人、归档人及第 8 项。 |
| 6．案例 | 成都缺同次回执，截止包待核。都灵成功重提对应有效新报价 ID `1622834158143`、登记号 `0917078`。 | 若规则要求开标确认，先记待确认，取得第 7 项凭据后再记复核。 |
| 7．开标且可评吗？52–54 | 核项目规则、同一报价身份、组织方记录、评审主体处置。分列解密结果、实际开启对象、准入或排除的范围、凭据和时间。 | 只见标段开始只记场次。明示宣读记企业及宣读值。同额多版依[开标版本核验](delivery-interfaces.md#bid-same-price-opening)，可评另据处置。问单项评分转[分项评分反查](delivery-interfaces.md#bid-score-evidence)。 |
| 7．案例与移交 | 都灵 10:56:49 是该标段开始开经济标，另由委员会记录证明宣读 GREEN TECHNO 的 12% 并准入。 | 54 将逐企业开标和准入处置交评审跟踪人，归档人保留第 6 项历史判定。 |
| 7．Nisko 排除 | 文件按时送达。原递交标识错填、无法解密。采购人开标后认定新件为未提交，旧件已撤，企业无可评包。 | 保留及时接收，止于外层文件，停止向包内追价。 |
| 8．实际报价行属于哪份件？41–42、50、52、54 | 文件由 41 定实件、50 核同批成员、42 读页行及表头。平台原生栏经 52→42，核主体、标段、唯一当次报价标识及字段。 | 两路用第 6 项确定截止归属。缺成员或平台对应，只证可读件。仅有公开件则写“披露件实际填报”。 |
| 8．案例与移交 | 成都披露件第 23 页可读第 286 行。都灵 `0917078` 实填 12.00000%，Nisko 只定位外层 ZIP。 | 遮去都灵第 8 页，登记号至字段待核。换成另一企业 6.11000%，退 42 重新定位。42 将值、单位和出处交 28 复算、归属交 54 归档。 |
| 9．哪版行、算得对吗？12、14、21、28、33、42、06 | 取能区别版本的字段逐版比对，按本标计价规则独立复算。分别报版本、算术和已核范围。唯一相符注明区别字段，多版相容保留候选。 | 无一相符列冲突，关键字段不可读记待核。采购限价不可补作单价。商务复核人接版本及算术差异，企业改稿退第 2 项，历史结论交归档人。 |
| 9．谁实际选了哪版 | 从制作工具导入或实际采用记录连到产出。AI 字段从 39 选取经 38、37（适用时）查 06 字段结论，再配 04 原返回、05 实发及 02 实例和函数。 | 缺企业调用凭据，保留公开件行值和可证版本范围，企业取材待核。 |
| 9．复算案例 | 成都“硒鼓171”区分末版，单看 26 个不够。26 × 16＝416 元，16 ≤ 35。 | 都灵 12% 覆盖澄清或修改明确的清扫范围，333,775.08 × 0.88＋48,373.20＝342,095.27040 欧元。单项清扫价格待核。 |

#### 用同一行正查、反查

| 方向 | 执行顺序 | 只可据何种证据下结论 |
|---|---|---|
| 正查至制件 | 招标分析人以 12、14、16、21 核原件和修改，项目负责人 22 入基线。商务核价人以 28、29 核计算与批准，响应负责人以 30、31、34 按分工交拟答。 | 正文报价经 36、37 核实。采用、制件、实读、审定据 39、41、42、45 的同版记录。原生计价附件或独立平台栏走对应的批准、放行及实填路径。 |
| 正查至接收 | 按要求以 46、47 办签验签，48–50 冻结、封装及核包，51 按当次授权办。52、53 交原操作及接收方凭据，54 核截止效力。 | 第 6 项有效批次与第 8 项同次报价位置均已证，才可称“投标截止时有效的文件包的实际投标报价”。 |
| 反查至依据 | 对账人从 54 有效批次取原操作、回执。文件逐项配 50 同批成员，独立栏配当次提交记录，42 读实值，再据实际制作或填报来源查批准和原文。 | 主张开启或可评另核第 7 项，主张符合某版或金额正确另核第 9 项。AI 字段按第 9 项查原调用，公开资料未能覆盖的环节记待核。 |
| 补证及复验 | 43 登记未证事项、目标版和责任人，44 据新证复验同一事项。 | 成都披露页证 416 元，截止包待核。遮去都灵第 8 页，第 4 页仍证宣读 12%，平台字段归属待核。Nisko 正式处置保留及时接收事实。 |

<a id="acceptance-sources"></a>

## 13. 验收依据与原始资料

### 企业协作验收

| 联验条件 | 应核实的结果 |
|---|---|
| 两个企业联合投标，另一企业独立投同一标段 | 成员只可共享指定用途和版本的资料。分别测试目录、搜索、计数、AI 取材和导出。竞争企业看不到联合体私有资料及办理记录 |
| 同一人员拟用于两个标段，一标修改资格条件 | 来源企业核调配与授权，项目负责人仅退回受影响的资格响应、材料、签署和文件。未受影响标段保留批准及沿用依据 |
| 材料授权撤销，分别在封装后和发送后恢复 | 尚未递交的范围暂停放行。已发起的批次保留当时授权并查询原操作。仅恢复查阅权限不能恢复对外递交。备份、旧回执或迟回任务触发同笔新增发送次数为零 |
| 后到回执载明更早接收时间，两批均可能按时 | 交换到达顺序，截止结论须一致。只证收到两批，替换目标、包内版本和截止效力分别待核实。 |
| 核两批次归属 | 补齐替换生效、后续事件及成员证据后逐项更新。移去成员关联，仅撤回材料版本结论。 |

### 公开资料与核验范围

公开资料支持的结论按行记载。涉及企业内部授权、批准或未公开的交易平台操作时，由持有方按权限提供原始记录。

| 核验事项 | 取证范围 | 发布方原始资料 |
|---|---|---|
| <a id="source-7"></a>质保承诺 | 核对响应时限、处理结果和免费服务范围，对照原表与评审标准分别核最低要求及评分条件。 | [招标文件，第五章](https://yllhj.beijing.gov.cn/zwgk/zfcg/cgjg/202606/P020260611412701162679.pdf#page=38) · [投标书及原表](https://yllhj.beijing.gov.cn/zwgk/zfcg/cgjg/202606/P020260611412701162679.pdf#page=61) · [评标标准](https://yllhj.beijing.gov.cn/zwgk/zfcg/cgjg/202606/P020260611412701162679.pdf#page=34) |
| <a id="source-8"></a>开标、担保与评审 | 投标时可以核对的资格和价格，以当时已取得的材料为限。开标、低价说明、评标修正和合同移交分别查看有权方记录。 | [招标公告及附件入口](https://jtw.beijing.gov.cn/xxgk/ztbxx/202603/t20260331_4571346.html) · [前附表，PDF 第 11 页](https://jtw.beijing.gov.cn/xxgk/ztbxx/202603/P020260331645363535652.pdf#page=11) · [有效期条款，PDF 第 21 页](https://jtw.beijing.gov.cn/xxgk/ztbxx/202603/P020260331645363535652.pdf#page=21) · [须知，PDF 第 22 页](https://jtw.beijing.gov.cn/xxgk/ztbxx/202603/P020260331645363535652.pdf#page=22) |
| 开标、担保与评审 · 资格、授权和报价 | 资格、授权和报价 | [评审条件，PDF 第 37 页](https://jtw.beijing.gov.cn/xxgk/ztbxx/202603/P020260331645363535652.pdf#page=37) · [授权格式，PDF 第 62 页](https://jtw.beijing.gov.cn/xxgk/ztbxx/202603/P020260331645363535652.pdf#page=62) · [报价口径，PDF 第 10 页](https://jtw.beijing.gov.cn/xxgk/ztbxx/202603/P020260331645363535652.pdf#page=10) · [第一信封投标函，PDF 第 61 页](https://jtw.beijing.gov.cn/xxgk/ztbxx/202603/P020260331645363535652.pdf#page=61) |
| 开标、担保与评审 · 开标与推荐 | 开标与推荐 | [开标程序，PDF 第 25 页](https://jtw.beijing.gov.cn/xxgk/ztbxx/202603/P020260331645363535652.pdf#page=25) · [候选人公示，六（二）评标情况](https://ggzyfw.beijing.gov.cn/jyxxzbhxrgs/20260424/5508363.html) · [南通项目公告及评标办法](https://jsggzy.jszwfw.gov.cn/jyxx/003001/003001001/20260810/70c2324b-7a81-4108-bfcb-be4b39d66828.html) |
| 开标、担保与评审 · 采购及开标报价表 | 采购及开标报价表 | [采购文件，第二章十一、十二](https://www.jiangjin.gov.cn/jz/zszrmzf_69064/zwgk_81486/zfxxgkml/jczwgkjj1115/ggzyjy/202504/t20250414_14518876.html) · [开标一览表和分项表](https://yllhj.beijing.gov.cn/zwgk/zfcg/cgjg/202606/P020260611412701162679.pdf#page=64) · [符合性审查](https://yllhj.beijing.gov.cn/zwgk/zfcg/cgjg/202606/P020260611412701162679.pdf#page=27) |
| 开标、担保与评审 · 报价修正与审查 | 报价修正与审查 | [北京项目第四章 2.3、2.4](https://yllhj.beijing.gov.cn/zwgk/zfcg/cgjg/202606/P020260611412701162679.pdf#page=30) · [财政部令第 87 号第五十一、五十九条](https://www.mof.gov.cn/gp/xxgkml/tfs/201707/t20170718_2652766.htm) · [金财投处〔2024〕第 7 号，事项一、四](https://czj.huaian.gov.cn/xxgk2/jdgl/art/o/17251200/17276594842454VOHVQrI.html) |
| 开标、担保与评审 · 清单、合同与评标程序 | 清单、合同与评标程序 | [本次投标清单选择](https://jyzx.yunfu.gov.cn/api/stamperAddress/articleFiles/2022/12/29/120463fe79b243398bbfccf6734a96a1.pdf#page=13) · [本标签约合同价条款](https://jyzx.yunfu.gov.cn/api/stamperAddress/articleFiles/2022/12/29/120463fe79b243398bbfccf6734a96a1.pdf#page=44) · [交通运输部评标工作细则第二十五、二十六条](https://xxgk.mot.gov.cn/xzgfxwj/202212/t20221207_3720514.html) |
| 开标、担保与评审 · 低价与预算 | 低价与预算 | [财政部财库〔2026〕2 号](https://jx.mof.gov.cn/xxgk/tongzhitonggao/202601/t20260123_3982540.htm) · [项目预算，印刷页 2](https://yllhj.beijing.gov.cn/zwgk/zfcg/cgjg/202606/P020260611412701162679.pdf#page=3) · [价格审查与修正规则，印刷页 28–29](https://yllhj.beijing.gov.cn/zwgk/zfcg/cgjg/202606/P020260611412701162679.pdf#page=29) |
| 开标、担保与评审 · 合同与正式处置 | 合同与正式处置 | [签章合同](https://yllhj.beijing.gov.cn/zwgk/zfcg/cght/202607/P020260702383709839348.pdf#page=1) · [浠水县财政局投诉处理结果，事项二](https://www.ccgp-hubei.gov.cn/notice/202609/jdxxgg_49849292ca4943d6b475d31ca5d47734.html) · [福建省财政厅投诉处理信息公告，事项三](https://www.ccgp.gov.cn/jdjc/jdcf/202511/t20251106_25642594.htm) · [汕尾市财政局投诉处理结果公告第十号](https://www.shanwei.gov.cn/swczj/yaowen/tzgg/content/post_1275224.html) |
| <a id="source-10"></a>相邻标段与联合体 | 核对各标段的成员要求、人员限制及推荐顺序。属于另一标段的协议或截图退回核对。 | [江苏省公共资源交易网招标公告，第 2、3、5、9 节](https://jsggzy.jszwfw.gov.cn/jyxx/003002/003002001/20260901/6540e19127734573b0fdd74e01ef6c3c.html) · [01 评标公示](https://jsggzy.jszwfw.gov.cn/jyxx/003002/003002003/20260929/857c3291a4d34789b4b733eb95361432.html) · [02 评标公示](https://jsggzy.jszwfw.gov.cn/jyxx/003002/003002003/20260929/f30107de1bf740ebb2498cd12d9bac2b.html) · [01 中标公告](https://jsggzy.jszwfw.gov.cn/jyxx/003002/003002004/20261009/9f5d91bcdc214eb183fc334e8e3d3253.html) · [02 中标公告](https://jsggzy.jszwfw.gov.cn/jyxx/003002/003002004/20261009/51071e3f65604466b255b9146c032d1f.html) |
| <a id="source-12"></a>SX 标段的工期 | 分别核实原公告、正式修改、投标函天数栏和交易平台实际填报值。回执仅覆盖其所指的文件或办理事项。 | [SX 标段原公告](https://gcjyzx.zhangzhou.gov.cn/gcxx/001001/001001001/20250820/80d12160-e99e-464c-8eba-d4dcb38a87bc.html) · [第 1 号补遗第一部分第 2 项（2）](https://gcjyzx.zhangzhou.gov.cn/gcxx/001001/001001002/20250827/b6872e19-5c0b-46c5-bd8e-c8d7384e5f93.html) |
| <a id="source-13"></a>综合档案室采购更正 | 更正一项要求后，按各项的技术证明、纸质递交要求和期限分别复核。 | [原公开招标公告](https://www.ccgp.gov.cn/cggg/zygg/gkzb/202610/t20261016_27507704.htm) · [正式更正公告，两项修改及递交条件](https://www.ccgp.gov.cn/cggg/zygg/gzgg/202610/t20261029_27586854.htm) |
| <a id="source-14"></a>古雷 A2 工伤保险费 | 两次正式文件分别核费率、计取范围、章节及报表。计算结果相同仍须核查报价行、批准和递交版本。 | [招标文件正文](https://gcjyzx.zhangzhou.gov.cn/zzggzy/50bbe8f8-4e1d-42ed-9033-b57f2b389c8c/c282cd5d-7561-4c6c-b5a4-4dc860fe07c3/%E6%8B%9B%E6%A0%87%E6%96%87%E4%BB%B6%E6%AD%A3%E6%96%87.pdf#page=34) · [2025-12-19《招标答疑纪要》](https://gcjyzx.zhangzhou.gov.cn/gcxx/001001/001001002/20251219/699ab496-fb7c-469f-a0bf-6a372b705aca.html) · [2025-12-24《补充通知》](https://gcjyzx.zhangzhou.gov.cn/gcxx/001001/001001002/20251224/23ecdca4-6e25-4035-bc7e-68ad8b1be2fb.html) |
| 古雷 A2 工伤保险费 · 交易及开标 | 交易及开标 | [本标段交易进度和评标公示](https://gcjyzx.zhangzhou.gov.cn/gcxx/001001/001001005/20260129/05d21932-ed1c-42f1-ab3c-ca753aae4c2c.html?gonggaoguid=a959408f-9608-4905-a147-0929d063d998) · [第二信封开标一览表第 8 行](https://gcjyzx.zhangzhou.gov.cn/gcxx/001001/001001004/20260127/a959408f-9608-4905-a147-0929d063d998J085.html?gonggaoguid=a959408f-9608-4905-a147-0929d063d998) |
| <a id="source-15"></a>展览路街道家具报价 | 按项目、采购包、企业、表头和披露页定位实际报价。内部批准和截止时的归属另取相应记录。 | [8 月 17 日招标公告](http://www.ccgp-beijing.gov.cn/xxgg/qjxxgg/qjzbgg/2026/8/e9da6f5b2f514849a3410698a259709e.htm) · [原采购需求，第 7 页](http://www.ccgp-beijing.gov.cn/content_file/xxgg/qjxxgg/qjzbgg/2026/8/11be784b421e480aa9a1e0ab701da7c8.pdf#page=7) · [9 月 3 日正式更正](http://www.ccgp-beijing.gov.cn/xxgg/qjxxgg/qjgzgg/2026/9/4dc0e346a919459a8684fee97e998e47.htm) · [随结果公布的招标文件](http://www.ccgp-beijing.gov.cn/content_file/xxgg/qjxxgg/qjzbggs/2026/9/c40cc55395714af081ec75298c9f9a85.pdf#page=37) |
| 展览路街道家具报价 · 结果和报价 | 结果和报价 | [中标结果公告](http://www.ccgp-beijing.gov.cn/xxgg/qjxxgg/qjzbggs/2026/9/aee0bfa314074a7fae79e33bff7b7f2b.htm) · [投标分项报价表，第 2 页第 12 行](http://www.ccgp-beijing.gov.cn/content_file/xxgg/qjxxgg/qjzbggs/2026/9/0dbf89a6d8db4efda0281302cdfc92ed.pdf#page=2) · [报价表末页](http://www.ccgp-beijing.gov.cn/content_file/xxgg/qjxxgg/qjzbggs/2026/9/0dbf89a6d8db4efda0281302cdfc92ed.pdf#page=6) |
| <a id="source-16"></a>成都办公耗材报价 | 披露表第 286 项的数量为 26，单价为 16 元，合价为 416 元。逐字段反查第三次更正及附件。截止时的批次归属还须有同次递交凭据。 | [首次询价公告](https://www.ccgp.gov.cn/cggg/dfgg/xjgg/202604/t20260413_26398100.htm) · [耗材清单及最高限价，第 10 页](https://gpx.ccgp-sichuan.gov.cn/gpx-bid-file/ZF_JGBM_000008/zone/2024/12/15/project/gpx-template/8a69c1019d7f7819019d84ecda960c70.pdf?accessCode=0b9cd45ac39945bf1dc03a0427f9d5bc#page=10) |
| 成都办公耗材报价 · 三次更正及附件 | 三次更正及附件 | [第一次更正，第七项](https://ggzyjy.sc.gov.cn/jyxx/002002/002002002/20260415/8a69d4ef9d7f78fd019d9054634365cf.html) · [第二次更正](https://www.ccgp.gov.cn/cggg/dfgg/gzgg/202604/t20260420_26430386.htm) · [第三次更正](https://www.ccgp.gov.cn/cggg/dfgg/gzgg/202604/t20260423_26447470.htm) · [更正前后对照附件](https://gpx.ccgp-sichuan.gov.cn/gpx-bid-file/ZF_JGBM_000008/zone/2024/12/15/project/gpx-template/8a69f7489da62aa3019db90493dd6967.pdf?accessCode=9e633498f4a2e83e43006a738c1d46bd) |
| 成都办公耗材报价 · 结果及实际报价 | 结果及实际报价 | [成交公告随附的采购文件集](https://gpx.ccgp-sichuan.gov.cn/gpx-bid-file/ZF_JGBM_000008/510101/2026/4/10/8a69ce659d72b37d019d75c980f47207/gpms-procurement/8a69ce789db59265019db85c81d634e6.zip?accessCode=47bdac3c66b2107d425ed41ad2ed7d1f) · [成交结果公告](https://www.ccgp-sichuan.gov.cn/maincms-web/article?type=notice&id=1a7454cc-8b01-423f-a079-6925d88dca19) · [四川金亿轩商贸有限公司报价明细表，第 23 页](https://gpx.ccgp-sichuan.gov.cn/gpx-bid-file/ZF_JGBM_000008/zone/2024/12/15/project/gpx-template/8a69c2639dc53b21019ddd66267559a9.pdf?accessCode=aa420e90aadad87f5252899823db6408#page=23) |
| <a id="source-17"></a>Nisko 与都灵电子递交 | Nisko 项目保存按时接收事实，另记采购人对文件可读性和旧文件撤回的认定。都灵项目按企业、平台事件及开标记录将有效新报价与同次平台栏的 12.00000% 对应。 | [第一次正式变更](https://bip-v1-files.idcom-jst.pl/sites/46599/wiadomosci/647428/files/zmiana_swz_z_22092022.zip) · [文件接收记录，第 1 页](https://bip-v1-files.idcom-jst.pl/sites/46599/wiadomosci/652718/files/informacja_z_czynnosci_otwarcia_ofert_str.pdf#page=1) · [第二次正式澄清或者修改文件](https://bip-v1-files.idcom-jst.pl/sites/46599/wiadomosci/647428/files/zmiana_swz_z_23092022.zip) · [原采购文件、报价表模板与工程量清单](https://bip-v1-files.idcom-jst.pl/sites/46599/wiadomosci/647428/files/56_instalacja_komputerowa_w_szkolach.zip) |
| Nisko 与都灵电子递交 · Nisko 开标和处置 | Nisko 开标和处置 | [开标报告，第 1–2 页](https://bip-v1-files.idcom-jst.pl/sites/46599/wiadomosci/652718/files/informacja_z_czynnosci_otwarcia_ofert_str.pdf) · [开标报告，第 1 页](https://bip-v1-files.idcom-jst.pl/sites/46599/wiadomosci/652718/files/informacja_z_czynnosci_otwarcia_ofert_str.pdf#page=1) · [开标报告，第 2 页](https://bip-v1-files.idcom-jst.pl/sites/46599/wiadomosci/652718/files/informacja_z_czynnosci_otwarcia_ofert_str.pdf#page=2) |
| Nisko 与都灵电子递交 · 都灵规则与配置 | 都灵规则与配置 | [招标与开标规则，第 3–4 页](https://www.cittametropolitana.torino.it/sites/default/files/pagina/ra3/documenti/servizi/appalti/esiti/2021/pdf/328/328_Verbale_I_seduta_lotto_08-01.pdf#page=3) · [平台配置及实际投标报价，第 7–8 页](https://www.cittametropolitana.torino.it/sites/default/files/pagina/ra3/documenti/servizi/appalti/esiti/2021/pdf/328/328_Verbale_I_seduta_lotto_08-01.pdf#page=7) |
| Nisko 与都灵电子递交 · 都灵澄清原件 | 都灵澄清原件 | [平台原件目录，选 59804_2021_05_31_Precisazione_Capitolato.pdf，第 1 页](https://www.sintel.regione.lombardia.it/eprocdata/auctionDetail.xhtml?id=139758268) |
| Nisko 与都灵电子递交 · 都灵截止及开标 | 都灵截止及开标 | [开标记录，第 2 页](https://www.cittametropolitana.torino.it/sites/default/files/pagina/ra3/documenti/servizi/appalti/esiti/2021/pdf/328/328_Verbale_I_seduta_lotto_08-01.pdf#page=2) · [平台事件，第 10–11 页](https://www.cittametropolitana.torino.it/sites/default/files/pagina/ra3/documenti/servizi/appalti/esiti/2021/pdf/328/328_Verbale_I_seduta_lotto_08-01.pdf#page=10) · [截止及新件登记，第 7–8 页](https://www.cittametropolitana.torino.it/sites/default/files/pagina/ra3/documenti/servizi/appalti/esiti/2021/pdf/328/328_Verbale_I_seduta_lotto_08-01.pdf#page=8) · [开标纪要，第 4 页](https://www.cittametropolitana.torino.it/sites/default/files/pagina/ra3/documenti/servizi/appalti/esiti/2021/pdf/328/328_Verbale_I_seduta_lotto_08-01.pdf#page=4) |
| Nisko 与都灵电子递交 · 都灵报价和汇总 | 都灵报价和汇总 | [平台报价行，第 8 页](https://www.cittametropolitana.torino.it/sites/default/files/pagina/ra3/documenti/servizi/appalti/esiti/2021/pdf/328/328_Verbale_I_seduta_lotto_08-01.pdf#page=8) · [基数、报价及总额，第 7–8 页](https://www.cittametropolitana.torino.it/sites/default/files/pagina/ra3/documenti/servizi/appalti/esiti/2021/pdf/328/328_Verbale_I_seduta_lotto_08-01.pdf#page=7) |
