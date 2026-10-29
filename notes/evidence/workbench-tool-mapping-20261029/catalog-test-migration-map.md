# 三文件旧测试：精确迁移表（收敛版）

基点HEAD 4c5f937c726bca92220684451289c6478213e2a8，唯一工作树 C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks。只读检查；未写测试/产品/台账、未运行测试。两份目标文件当前SHA与初审一致：OLD=DDF6EA8D1A89F079F27B15601D344CE855ECCB5F90CEFF1537C85FEAD6C520D8；CAT=1AF6A4346ACE2D4FE2ECBA67061E334F89378B87ABDF7048A0102C04C73257B8。

路径约定（全部仓内相对路径）：
- OLD：tests/runtime/page/catalog/data-space-four-file.test.ts
- CAT：tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts（包含owner与mounted page两层）
- DEV：tests/app/dev/dev-state-page-file-closed-loop.test.ts
- API：tests/runtime/page/design/native/data-space-design-page.test.ts
- CHAIN：tests/runtime/auth-nav/data-space/metadata/chain/data-space-chain.test.ts

标记：复用=已有实际断言可承接；补=缺该具体业务断言，迁当前责任层；退役=旧UI机制/旧合同不迁。不是看到测试标题相似就算覆盖。下面标题逐字来自OLD，行号为旧测试起点。

## 1. describe('blueprint tree DataView move draft')，OLD 530–839

这整个describe不属于工具三文件退役内容。目标建议为**新独立** tests/app/services/project/blueprint-workspace-dataview.test.ts（路径建议，当前没有该文件），抽取真实DataSet/query/save最小fixture；不得依赖config/pages旧rule/script/style继续存活。15条业务测试可保留原结构，去掉catalog运行壳。DEV虽有创建/混合批次/绑定/删除等相邻测试，不能冒充以下移动语义等价。

| OLD行 / it标题 | 已有等价断言 / 精确迁入项 |
|---|---|
| 531 keeps the formal currentRow pointer aligned with selected node identity and its edit overlay through cancel | 补 owner currentRow===row、两节点切换、编辑覆盖、cancel清覆盖且0保存；DEV普通字段保存不是此指针对齐断言。可与下行组成一个选中字段组合。 |
| 553 keeps field read and write decisions on the selected formal row | 补当前行读/写独立、隐藏字段拒绝update、无dirty/0写；与531共享fixture，不需额外mounted UI。 |
| 567 preflights every affected row, rejects unauthorized siblings without partial edits, and detects descendant cycles | 补任一受影响兄弟无权、循环两分支，0patch/0save，不能仅检查移动节点权限。 |
| 585 rejects a move when any returned tree row hides its parent or ordering field | 补树结构/顺序字段不可读拒绝，归入567的预检参数矩阵。 |
| 595 stages a permitted move in the DataView, supports cancel, and saves only affected ids with readback | 补move只暂存、cancel恢复；save精确四个受影响IDs、根不提交、正式读回及dirty清除。 |
| 616 applies multiple AI leaf moves and the explicit sibling reorder as one exact DataView save | 补多leaf+显式兄弟reorder单次保存及精确patch/ID；DEV混合create/update不是move/reorder。 |
| 695 keeps partial move receipts pending through Save All readback and refuses cancel | 补原move批次部分回执保留，cancel拒绝，Save All核原ID，不能改成create批次例。 |
| 728 keeps the selected detail row when a different tree node is dragged | 补非选中行移动不改变详情currentRow；与595组合。 |
| 740 fences an in-flight old selection when a new selection arrives during a request | 补deferred原正式query，新的load选择后旧结果不能恢复旧currentRow；保留真实owner而非mock select方法。 |
| 767 fails closed when a returned row references a parent missing from the DataView projection | 补闭包不完整拒绝；归树完整性参数组。 |
| 779 maps the synthetic tree root drop target to the formal root parent identity | 补合成根到正式prowid=000000映射，且保存正式值；不能因builtin单根而删除dynamic多根业务。 |
| 788 rejects project tree moves when the DataView total does not match the rows received | 补Count与rows不一致拒绝；归完整性组。 |
| 799 relies on the formal all-pages owner to reject a missing backend total | 补真正传输Count缺失，不伪造已装配DataView.total；与788相同组但不同输入。 |
| 810 preserves capability code when the formal DataView exposes and authorizes funCode | 补正式输出/权限允许funCode投影原值；可合531字段组合。 |
| 820 keeps an unknown DataView receipt fenced until its original ids are read back and rejects stale project scope | 补原IDs核验+scope失效拒绝，归695回执组；不可只断言status文字。 |

最小组织：6个业务组（选中字段、移动预检、单移动保存、批量move/reorder回执、迟到选择、完整性/根映射），保留全部上述行为，不要求15个测试名原封不动。最安全是先完整迁出15条，再按精确共同setup合并；不是先删除再追忆。

## 2. describe('data-space four-file page')：删除生命周期

CAT当前完全没有deleteSelected用例；其它数据库目录、文件删除是不同owner。目标全部CAT，用native真实owner + 必要mounted确认入口。新版deleteSelected先执行Base_DataModel catalogDeleteCheck查询，fixture须驱动它：模型非空拒绝、零删除、不连带删除场景文件；不能mock删除方法。

| OLD行 / it标题 | 等价 / 最小新增组合 |
|---|---|
| 1787 deletes only the authorized current row through the original save owner | 补D1：d权限拒绝零写 + 允许时只提交原ID delete payload，不能夹带add/change或权限私有数据。 |
| 1822 cancels a delete without staging and rejects a row that changes during confirmation | 补D2：mounted取消零stage/save；确认期间切选拒绝原确认被新行借用。 |
| 1857 blocks query re-entry during confirmation and stops if the page context becomes stale | D2参数：scope/宿主释放后拒绝；保留“不得删除错误目标”，不复制旧脚本锁或要求所有query永久禁止。 |
| 1895 rejects the confirmed target after an external DataView query replaces its row | D2参数：同ID新row实例替换也应拒绝旧确认；不能只测ID变。 |
| 1921 keeps an unknown delete locked with a safe persistent message and does not resend | 补D3：原pendingDelete ID保留，选中其它行后重复删除/新增/编辑不重发，实际写次数1；安全提示不泄漏隐藏ID。 |
| 1959 reports refresh failure separately after a confirmed deletion | 补D4：已确认写+读失败≠unknown；重试只读，不重发delete。 |
| 1978 reports read-back inconsistency when a successful delete refresh still returns the target ID | D4参数：正式回读仍含原ID，不报删除成功。 |
| 1999 uses query PageParam and Count to delete the last row of a later page and returns one page | 补D5：第2页最后行删除后Count/PageParam/页码/原过滤一致；不检查旧分页render函数。 |

5组足够。若新owner在这些真实例上RED，交root判最小业务修复，不修改产品迎合旧mock。

## 3. 绑定查询

| OLD行 / it标题 | 现有等价断言 → 缺口 / 目标CAT |
|---|---|
| 875 offers a query-bindings action for the current readable catalog row | 复用CAT295–304真正派生view/范围、349–364实际clicked row入口，394–402标准表绑定与释放。 |
| 909 reads every blueprint page in ascending rowid order and rejects a truncated second page | 补B1：旧502行跨第1/2页且末页截断；CAT315–318只count:false，不能替代。用正式allPages transport驱动，路径不可假空/部分成功。 |
| 943 shows an empty state for a complete result with no matching data-space binding | 复用CAT306–308：空binding rows且不查ancestor。 |
| 957 fails closed when the blueprint scene or directory identity is unavailable | 部分复用CAT221–225目录身份失效、470–477入口配置失败；补B2缺正式blueprint view时queryBindings失败/不呈现空成功，不迁旧独立blueprint场景参数。 |
| 976 does not show a partial tree when any required blueprint field is hidden or masked | CAT310只有prowid hidden；补B2所需输出字段hidden/masked参数矩阵（按现owner查询字段，不盲搬conid）。 |
| 997 rejects missing parents, cycles, and omitted conid values without presenting paths | 缺父/循环复用CAT310–313；**退役omitted conid输出**：当前派生query按conid服务端过滤，返回无需conid，CAT288–302明确如此。 |
| 1024 rejects wrong-application and duplicate or missing blueprint identities without a partial path | wrong-app复用CAT310；补B2 duplicate/missing rowid、PK错配，无部分path。 |
| 1058 fails explicitly when the original query owner cannot provide a total row count | 复用CAT315–318总数缺失拒绝。 |
| 1069 clears a closed in-flight query and ignores its late result | 复用CAT320–326及365–373关闭后迟到不发布/不保留busy。 |
| 1100 does not retain a successful path after query-owner scope revocation | 补B3成功后scope撤销，bindingPath失效；CAT221只是designTarget，不能替代。 |
| 1115 hides a successful path when the declared blueprint view result is replaced | 补B3刷新当前binding或ancestor派生owner后旧path失效；CAT328只刷新catalog行。旧“原blueprint source view”已不直接持结果，不搬错误owner。 |
| 1133 rejects a pending result after the directory target row changes or refreshes | 补B3 hold真实派生查询，切选/同ID目录refresh；CAT320仅close。 |
| 1166 opens the configured r-dialog from the page and closes after showing the resolved path | 标准绑定/关闭复用CAT394–402；退役旧r-dialog配置树形状。 |

新增3组：B1真正多页；B2身份/权限/缺正式view；B3已完成与在途结果的owner失效。并不重写已覆盖的基础路径/空结果/close。

## 4. 新增与编辑

| OLD行 / it标题 | 现有等价断言 → 缺口 / CAT |
|---|---|
| 1725 cancels before append and saves the generated row identity and datasource payload | CAT236–247保存生成ID及正式creator/time、取消无server/dirty；CAT375–383真实绑定字段。退役“prompt取消必须从未append”的旧流程时点，新标准表单可先暂存后cancel。 |
| 1766 keeps a masked creator masked and does not resend a save with unknown outcome | creator权限CAT190/453；unknown编辑CAT265–270严格writes=1及385–392 UI只读核验。新增与编辑共原commit通道，可复用该机制；若要新增回执特例，仅加一个create未知回读原ID参数，不复制全套UI。 |
| 2037 renders an edit action only for rows authorized by the query result | CAT280–283同时禁用且直接beginEdit拒绝，不只检查按钮。 |
| 2059 stages and saves only changed editable business fields for the selected row | CAT230–234、255–258：正式值读回、不改Type/sysid、非法字段零写；保留。 |
| 2080 keeps unread writable values out of prompt defaults and honors field write permission independently | 补E1标准绑定输入而非prompt：不显示隐藏旧值，获准字段显式输入只提交该字段；scope/权限来自原row。 |
| 2097 submits an explicit empty value for an unread writable description whose original value is null | E1参数：原null→显式''应出patch；不把“空”等同未修改，不复制prompt default断言。 |
| 2112 rejects an empty value when the backend marks a writable description as required | E1参数：真实R/E字段权限required拒绝且0save，不能用前端自造必填属性替代。 |
| 2124 does not write when the edit prompt is cancelled or all submitted values are unchanged | CAT255–258无改动0save；410–420真实绑定cancel后原值；无需再测prompt。 |
| 2144 rejects stale rows after a query and blocks query re-entry while an edit is pending | 补E2待编辑时同ID外部refresh替换row后save拒绝且0写；CAT260标题虽query/scope，实际只更token。旧query函数重入锁不必原样搬。 |
| 2165 rejects the captured row when the current row changes during a prompt | E2参数切选后旧草稿不得写新行；无需prompt实现。 |
| 2185 stops an edit when buildPageContext invalidates the script during a prompt | scope前写拒绝复用CAT260–263；mounted宿主切换释放的可达操作作为E2参数，无旧buildPageContext。 |
| 2203 does not resend an edit when the save outcome is unknown | CAT265–270实际server writes=1而save入口2次（第二次核验）；385–392 UI无确定按钮、核验一次。完全复用。 |
| 2227 keeps the active filter and reports success when the edited row leaves the refreshed result | 补E3编辑后该行不满足原过滤，仍报告真实成功且filter不丢；CAT444仅正常分页filter不能证明保存回读语义。 |

新增3组E1/E2/E3，新增unknown原ID可作为已有265参数，不另复制普通增改全流程。

## 5. 复制 API：以当前正式信息合同替代旧文本模板

| OLD行 / it标题 | 现有等价断言 → 精确缺口 / 去向 |
|---|---|
| 1314 renders a copy API action for a readable current catalog row | 复用CAT349–364当前行操作，403–408复制session结果；stub只证明委派。 |
| 1319 copies the source API text after the view owner collects every authorized page | 正式身份/命名view键/主键/零写复用API3336–3358，CHAIN176–190证明deferred字段不需先加载工作区；真正超过页容量的元数据完整收集还需A1放CHAIN真实transport，不要求原文本样式。 |
| 1371 copies only the dataset header when both design queries return no rows | 补A1真实零模型结果：当前API文本保留正确DataSetId且模型清单空、0写；不要求旧“只有header”格式。 |
| 1386 matches source API primary-key fallback for type and name whitespace | **退役旧猜rowid回退**；当前API3237–3245正式空PK保留、3267–3276正式alias PK且缺file不猜键更准确。不得为旧断言改产品。 |
| 1399 rejects model API output when required field %s is hidden | 补A1元数据输出所需正式字段不可读，readApiInfo拒绝/0写；按当前消费字段列矩阵，不盲搬旧数据库列名。 |
| 1411 rejects masked field metadata and foreign model ownership without copying | CHAIN158–173已测字段Name masked +临时view释放；API3279–3288已测queryContext跨空间及dirty拒绝。补A1行级foreign model/field归属、实际所需PK字段masked，不能用queryContext例替代逐行owner。 |
| 1433 rejects field API output when required field %s is hidden | 同A1矩阵，放正式session/CHAIN层共享，不在catalog复制全部fixture。 |
| 1447 reports an undeclared design scenario and does not query or copy | CAT332–338委派session失败并dispose，473–477当前入口缺正式配置明确失败；旧额外design scenario调用参数已封装退役。可在A2失败参数确认clipboard0次。 |
| 1459 does not query design data when the catalog row ID is hidden | CAT190/453仅列表安全；补A2当前catalog读不可见目标不openDesign/不clipboard（直接入口也拒绝）。 |
| 1470 does not copy or notify after the captured row changes during a design query | CAT340–344清selectedRows、原session.dispose已有；补A2切到另一真实row的参数即可，不重建整场景。 |
| 1491 does not copy or notify after the page is invalidated during a design query | 补A2 catalog mounted宿主切换/释放，hold session完成后clipboard0/无成功。API3323–3333是另一个宿主，不能替代。 |
| 1513 does not copy or notify after the query owner scope changes | API3291–3306真实session scope已覆盖；catalog自身迟到scope作为A2参数，验证原owner与操作消息。 |
| 1535 rejects a model view refresh that replaces the captured query result during field loading | 复用API3291–3301真实metadata reload发生于定义read pending后，clipboard0且changed；不复制旧API字段加载阶段实现。 |
| 1561 rejects a catalog refresh that replaces the captured directory row during field loading | 补A2同ID目录refresh，CAT340仅取消选择不够。 |
| 1585 does not copy or notify after the PageRuntime is disposed during a design query | API3323–3333已保留session使用端释放证据；catalog mounted释放归A2，不再单独旧PageRuntime脚本fixture。 |
| 1607 shows clipboard rejection and releases the copy lock for retry | API3309–3320设计页已测；CAT403仅立即成功。补A3 catalog剪贴板拒绝→无假成功→可重试；0写。 |
| 1624 does not report success when the design model result is replaced during clipboard writing | **不逐字迁**：当前catalog.readApiInfo finally已dispose临时session，再开始clipboard，旧持久design owner不再存在。有效语义改A3：clipboard pending期间catalog owner/行/运行实例失效后不能发旧成功，不要求给已释放metadata owner保永久监听。 |
| 1649 does not report success when the design owner scope changes during clipboard writing | A3当前真实scope变化：复制已发不能声称撤销，但迟到成功不可挂新上下文；不能只测定义读取pending。 |

新增3组：A1正式API完整性/权限（CHAIN或API session层）；A2目录读取前及读取中identity；A3目录clipboard尾部。A1可复用现有fixture和参数化矩阵；API当前正式身份/空PK/alias/失效绑定/零写均不重做。

## 6. 其余退役/已有覆盖

| OLD行 / it标题 | 处理 |
|---|---|
| 841 opens the native designer with one verified target and the tenant-scoped return path | CAT434–442目录内对话框唯一目标替代；旧独立设计route/return URL是过期流程不迁。 |
| 1217 disables search while page initialization is pending | CAT421–432切route迟到无发布 +当前绑定loading边界；不复制旧脚本init锁。若需补，仅CAT mounted慢初始化不能错误写目标，不检查旧函数。 |
| 1299 releases the initialization guard after an application-option failure | CAT463–469应用选项独立重试，不锁列表，已覆盖当前更精确行为。 |
| 1671 loads all four assets, validates scenario config, assembles a PageRuntime, and renders the list shell | 三文件退役后删除整例；保留CAT120/127/434/473的正式场景/标准绑定/缺配置失败。pagedata仍保留，不因“三文件”测试名删共享场景。 |

## 实施最小包与删除门槛

1. 先把15条蓝图owner行为迁出；此项是保全现有正式消费者，不扩大UI。
2. CAT新增D1–D5、B1–B3、E1–E3、A2–A3；CHAIN/API补A1。编号是本报告内测试组合，不是新总计划；一组合可由少量it.each覆盖，不要求原58条重写或每字段单文件。
3. 冻结新路径后，删除OLD以及专属script/render fixture。对每个“复用”保留目标断言位置；对“退役”保留上表原因。若更底层已有同输入/断言可证明，引用具体测试减少新增；不能拿别种资源同名按钮或普通保存green抵消目录delete/late/权限边界。
4. “补”表示当前未找到等价覆盖，不自动等于产品bug。先用真实当前宿主/owner制造业务触发；若RED是fixture装配不完整、旧route参数或不存在prop报错，不能当产品证据。

收敛修正：初报告对OLD1383未明确“主键猜测回退已过期”、对1624未充分区分临时session释放。此表明确二者不照搬，避免误保留错误旧合同。
