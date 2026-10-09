状态：implementing

# 数据空间元数据 DataSet

## 当前执行方式

用户要求的整体语义已在 `notes/research-data-space-data-chain.md` 落盘并复述，覆盖业务目的、双来源持久化、单目标元数据入口、原生装配、查询、两类关系、权限、编辑提交及异常恢复。沿原持续实施授权，本轮已验证正式视图字段输出与行身份闭环，完整 DataSet 目标保持。已有 table-submit 修改保留，其局部证据见 `notes/evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/table-submit/result.md`。

现场只读证据确认字段投影与正式主键依赖断点，详见 research-data-space-native-contract.md 的字段投影节。下面限定此次实施范围；不以字段投影一项替代定义编辑、持久化、完整查询保存和整页验收。

用户最新指令停止使用低阶模型。后续由主控直接研读、实施和验收，不再委派子代理；下文低阶 writer/reviewer 的已验记录仅描述历史，不构成继续委派的授权。已有只读核查只作线索，关键结论仍由主控对当前源码核实。任务目标、无 Java 改动和暂不做界面的边界保持不变。

## 任务目标

按用户“先不搞界面，按仓内 dataset 结构把数据空间对应的 dataset 搭起来”的明确实施指令，建立无界面的真实元数据 DataSet：唯一业务输入是被设计空间 ID，输出仓内 DataSet/DataTable/columns/DataView 实例及正式数据。沿此前持续授权实施，不重新发起已回答的范围问卷。

## 当前语义修订：通用值驱动级联

### 已验收：表级列表查询配置

本轮结果：修改套件34项（新增17项）、API包19套件660项通过；最终根212套件2827项全部通过，388.08秒。基线/最终类型、七文件Lint、AI1028、架构/依赖/目录、ClassModel bundle及更新后的合同检查通过。冻结8路径包含6生产、1测试、1生成清单；后端端点清单内容不变。证据 `metadata-dataset/table-query/result.md`。接口边界验证不冒充线上自定义端点已存在；整个计划继续implementing。

上一轮树字段投影已形成代码及回归证据，判定progress。沿完整DataSet配置与现有api/crudConfig持续实施授权，本轮接通原生api.list和crudConfig.timeout的正式查询消费。原生CrudService.list明确读取api.list；正式查询owner却固定GetData且未传timeout，文件又拒绝list，属于实际断链。仍使用SPARK查询封包、正式模型身份、原权限/分页/保存基线；端点配置不是任意协议转换，也不把retrieve、树端点等剩余项删出完整目标。

精确范围：`packages/spark-lowcode-api/src/platform/data-space/runtime/save/data-space-save-config.ts`迁为`protocol/data-space-request-config.ts`，将已有端点/策略验证复用于查询与保存，避免另造重复验证类；`data-space-runtime-api.ts`原owner捕获表级查询配置；`query/data-space-query-cache.ts`将实际端点/头/参数/超时纳入在途请求键；`query/data-space-query-resource.ts`将同一捕获配置传给全部分页；`protocol/data-space-request.ts`按配置投递，保留身份头、retry=0、cache=false和完整响应校验；`packages/spark-project-model/src/scenario/scenario-view-config.ts`允许原生list键；`tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-submit.test.ts`验证真实文件保存、新Workspace重开、装配、查询及签名保存。生成清单只在正式检查判定过期时刷新。

决策：list和保存端点均承接当前SPARK协议，暂仍POST、站内无模板路径。超时应用于每个实际分页请求；不把总扫描时长伪装成单请求timeout。api.list缺省使用原GetData，清除配置后重开恢复默认。配置在异步排队之前捕获，运行中改表配置不改变旧分页请求；下一次查询消费新配置。相同查询但端点、头、参数或超时不同不能合并在途结果；等价配置仍合并。新增配置不改变数据权限判断及业务/元数据身份，也不能覆盖运行身份请求头。

验证：基线typecheck；先观察默认查询超时缺失与list文件被拒绝的RED，再完成上述链路并立即复验。补默认恢复、多命名视图共享表配置、全分页一致、在途修改、等价/不同配置隔离、请求失败后的stale/禁写、非法配置请求前拒绝。最终类型、精确Lint、相关查询/保存/场景持久套件和门禁；冻结源码后一次根回归。没有Java、UI、线上写入或新提交。

### 已验收：树视图投影保留结构依赖

本轮结果：只修改1个正式查询生产方法并新增21项行为用例，原生TreeConfig保持既有8项结构。相关6套件69项、包级原查询/保存2套件111项通过；最终根212套件2810项全部通过，418.18秒。最终类型、精确Lint、AI规则1028文件、合同587端点/153消费者检查通过。代码冻结哈希复核及日志见 `metadata-dataset/tree-projection/result.md`。没有线上树查询/文件上传、Java或界面变更；不将本地树取数修复记为全部服务端树能力完成，完整计划继续implementing。

2026-10-09，上一轮页面/门禁恢复判定progress。沿原生DataSet完整性授权，主控核当前正式请求仅补模型主键；树视图只投影标题时未返回父键，TreeManager把子节点当根。treeMode属于本地组织，不凭它推测SelfRefData的根节点或查询方向。先恢复这条已存在的正式查询→本地树消费链，完整服务端树分页/懒加载等仍独立核合同；不改Java、UI或引入树端点旁路。

精确实现范围：`packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts`，在原executeQuery内捕获当前树的结构及正式文本字段、按正式Name补齐REQUEST字段并去重，返回后按原上下文readFieldAccess核验，再交原DataView发布；新增 `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-tree-query.test.ts`，经ScenarioViewFile、真实Assembler/DataView/TreeManager及正式HTTP协议边界验证。没有新公共API或包出口。生成的消费清单若因行号失配，仅用既有generate:lowcode-contracts刷新，不手改生成物。

裁决：配置明确的idField/parentIdField/textField以正式输出名解析；默认id保持原生id，不猜模型主键。未显式指定父/文本字段且正式模型无parentId/name时，保留现有根级/ID显示回退；有这些正式默认字段则补齐。明确的本地计算文本仍由已有计算机制负责，不把计算字段发给后端；计算列不得用作远端结构字段。补齐字段不修改显示投影或文件，不以请求字段扩大授权。结构与正式文本字段未返回或当次权限不是visible时，拒绝发布新树；DataView已有Failed/stale机制保留原结果供查看、禁止写入。空结果合法，不借文件或旧查询权限补读。

验证：类型基线和源码前像；先写树层级失败用例，观察原实现两根错误，再最小修正；补显式调用fields、正式别名、文本字段、单/多视图隔离、配置重新装配、隐藏/脱敏/缺列/查询失败后旧结果只读、无效引用请求前拒绝、空结果。原组件/分页/字段投影保持，普通无树视图回归。定向类型/Lint/API规则与现有查询保存/树组件套件；源码冻结后一次完整根回归。本轮HTTP边界夹具不冒充线上树查询验收。

### 已验收：三个完整页面流程的等待与清理边界

本轮最终：完整页面102项、根211套件2789项全部通过（458.84秒）。类型/Lint及全部verify子项分段核验通过，AI模型规范保留2条非阻断警告。两次总verify失败分别由旧证据命名和过期消费者清单引起，已修复并续跑剩余项；没有将总命令失败写成退出0。11份文档仅改名且正文哈希不变，生成器同步153个消费者、587个后端端点内容不变。代码变动仅测试生命周期/3项15000ms预算、Lint证据目录排除及生成清单；完整方案仍implementing，详见 `metadata-dataset/page-flow-verification/result.md`。

2026-10-09，接续用户“继续”，主控直接处理前轮根回归失败，范围仅 `tests/runtime/page/design/data-space-design-four-file.test.ts` 中命名视图创建重开、关系创建重开、关系编辑删除三条用例。不改生产代码、UI、数据合同、组件替身或断言，不重跑已验线上值级联。

已核：原5000ms失败并非查询挂起；逐次await计时显示首次命名视图流程在第三次挂载末尾约5.3秒，关系创建独立流程约6秒，超时后旧异步函数仍继续执行并清理全局stubs。15秒诊断上限下三条原用例完整通过，合计25.47秒。保留原表格替身的对照未改善，放弃该路径，不修改组件覆盖范围。两个关系用例的wrapper只在成功尾部卸载，异常finally未卸载，需修正。

方案：仅上述三条完整交互流程声明15000ms上限，根配置和其余用例保持5000ms；关系创建重开以实际关系渲染断言等待，代替固定两次flush；两个关系用例在finally卸载最后挂载实例，成功路径不重复卸载。首次修改后立即运行原三用例（不带CLI超时覆盖），再运行该文件102用例、类型、精确Lint、AI规则；最终冻结后根回归一次。保留原红日志、计时和诊断日志。该测试上限是流程预算修正，不宣称修复产品性能或整体已完成。

### 当前门禁修复：归档证据不作为当前源码参与 Lint

已核提交前 `artifacts/git-delivery/verify.log` 的243个报错路径全部在 `notes/evidence/`，均为历史源码快照不属于 parserOptions.project 的解析错误。当前 typecheck 工程只包含正式源码、测试及合同目录。追加精确范围仅 `eslint.config.js` 的 global ignores：排除 `notes/evidence/**`；不放宽源码/测试规则，不忽略整个 notes，不修改或删除证据。修改前保存配置前像和原失败摘要；修改后运行完整 `pnpm run lint` 及类型/AI规则验证。此为恢复门禁的检查范围修正，不是产品能力交付，不重启已完成语义设计。

文档门禁续修：完整 verify 已确认类型和 Lint 通过，随后被11个已有证据文件名阻断。只重命名这些 Markdown，11组精确旧/新路径见 `metadata-dataset/page-flow-verification/evidence-paths.json`；正文保持逐字节一致，以重命名前后SHA256核验。同步三处实际引用：`notes/plan-data-space-create-lifecycle.md`、`notes/evidence/sparkproject-appworks-integration/d1c/create-planning-brief.md`、`notes/evidence/sparkproject-appworks-integration/four-file-correction/query-row-read-preimage/20261008-124341-452/manifest.json`。不改文档治理规则或历史证据结论。根回归期间只执行路径/记录操作，结束后重新执行 verify；若后续发现独立问题再按结果限定范围，不盲改门禁。

合同清单续修：文档及ClassModel门禁已过，verify:lowcode-contracts 报 appworks-consumer-ledger.json 过期。完整核读既有生成器后，仅运行 `pnpm run generate:lowcode-contracts` 同步 `backend-api-contracts/appworks-consumer-ledger.json` 和 `backend-api-contracts/lowcode-endpoint-ledger.json`；生成前保存两文件，生成后核差分。Java仅作为只读源码扫描输入，不改Java或请求合同；静态引用清单不证明运行请求成功。生成后从 verify:lowcode-contracts 继续剩余规则，已通过的类型/Lint/运行根测试不因清单行号变化重复执行。源码和测试哈希继续冻结。

### 当前实现已局部验证：旧布局节点位置导入原生 DataSet

后续回归验收已完成：本轮定位并修正旧页面测试的等待、清理和流程预算后，根211/2789通过，四个布局源路径未改。以下2786通过/3失败是上一轮保留事实，不再是当前阻塞；节点位置的线上证据仍限只读本地候选，未扩成整图迁移。

2026-10-09 验收状态：三个生产路径加一个既有测试已实现；最终会话38项通过、类型/精确Lint/AI1027通过。线上136读0写，真实7节点映射成功且本地草稿还原、两个pagedata及旧图未变。完整根测试2786通过/3失败（旧设计页两超时、一重开渲染）；同3项原条件复验及本轮修改前源码的隔离对照均超5000ms，未改测试阈值或生产UI。四源哈希保持。未宣称全量通过，当前先保留失败证据，不盲目重跑或扩大代码修改；后续须定位三个旧页面用例时序。证据 `metadata-dataset/legacy-table-positions/result.md`。整体仍 implementing，无活跃测试进程。

2026-10-09，沿本计划 layout 完整性项推进，复杂度中等偏复杂（3生产路径、1既有测试）；上一轮 live-field-value 为 progress。已核旧 SysForm/<id>.json 的节点 id 是正式模型 ID，原生 pagedata.layout.tablePositions 的键是稳定 tableName；节点坐标与模型关系分别归属，不能直接复制图 JSON。

限定实现：在单目标 LowcodeDataSpaceDesignSession 提供显式 stageLegacyTablePositions({expectedText,expectedLayoutText})，宿主注入既有只读布局 reader。先核当前文件/投影/保存状态，读取同一 targetId 的旧原文并比对预览原文，按当前原生表的 modelBinding 唯一映射坐标，补充缺失位置；已有相同坐标幂等，冲突、未知/重复模型、无效坐标、缺文件或过期会话均失败且不改草稿。候选继续走 stageDefinition 装配校验，再由调用方 saveViews 保存，保留未知结果恢复机制。

精确范围：`src/lowcode/data-space/view-design/lowcode-data-space-view-layout.ts`（新内部转换类，唯一消费者为设计会话）；同目录 `lowcode-data-space-view-design.ts`（命令及生命周期）；`src/lowcode/data-space/lowcode-data-space-design.ts`（已有 reader 注入）；`tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-design-session.test.ts`（真实 owner/装配/保存重开、异常及并发行为）。不改旧图文件、数据库关系、Java或UI，不新增自动读时迁移；旧图连线路径/扩展仍完整留在原文件，本闭环只导入节点位置，不声明整份旧布局迁移完成。

验证：typecheck 基线；先增加失败用例，首个生产改动立即最小复验；补格式/冲突/身份/幂等/源改变/异步过期及保存重开用例；最终类型、精确Lint、AI门禁和相关回归，冻结后根测试 maxWorkers=1。保存源前像与哈希。实际线上只读核现有旧布局，若合法可在本地会话试导入，不上传。

### 已验闭环：真实选项查询反向调整子字段字符串

2026-10-09，主控直接验证，未改源码或线上数据。元数据 DataSet 的 Base_DataSet.default.Name 经真实查询权限确认为可读写，可作为临时本地字符串草稿载体；无需创建测试模型或修改权限。父主键数组驱动实际字段选项 11/7/0，子值保留 2/1/0 个有效 token；第二父字段值独立变化时，选项7/4、子值保留或清空；等值不重查。取消恢复原值、独立数据库回读未变、两个远端文件未变；110次读、0写，退出0。证据 `metadata-dataset/live-field-value/result.md`。

临时级联只在验证实例中创建，未发布为正式配置，没有将测试子值提交数据库；本轮不声称已经验完线上 field 配置保存及业务提交组合闭环。上一轮“缺合适测试模型”的判断只适用于目标自身业务模型，元数据层的可写值运行验收已补齐。保留整体完整性矩阵、设计器UI暂停和无Java变更边界，整体仍 implementing。

### 已验闭环：真实文件重开后的命名视图和值级联

最终结果：预验证和真实保存重开均通过，178 次读取、2 次上传（候选与恢复），独立字节回读确认原文完全恢复，元空间未变；没有业务 CRUD。证据 `metadata-dataset/persisted-value-cascade/result.md`。这关闭了真实 query 值级联/命名视图文件往返证据缺口，field 可写子值线上清理仍缺有效测试模型，整体保持 implementing。

2026-10-09，补齐线上证据，不修改生产源码、测试或 Java。已授权测试目标 `97DCB03F75AADEAE6B102B062DB71CEA` 的 shif 可读且字段只读；TestJSON0819 返回资源权限不足，copyTable 返回数据库 testAdd 不存在。不得改变权限或正式模型以凑验收。

首个 shif 字段级联候选已在上传前停止：该正式模型无主键，setSelectedRows 无法建立原生选中集合，不能伪造主键或修改正式模型以凑通过。失败脚本、候选和零写入报告留存 field-preflight；可写子值清理的线上验收仍未完成。

继续验两类来源的真实文件重开：仅在该目标原有 Base_DataSet 模型下临时增加 selection/options 两个命名视图及 query 值级联，候选范围显式限两个已知空间 ID。使用正式 rowid 主键，验证原生值数组和 DataView.value 的竖线字符串同时成立，1/2/另1/0 选择返回精确对应记录，只换指针不查询、default 不加载。先在会话草稿装配查询验通，再由既有 ScenarioViewFile/ProjectWorkspace owner 保存，独立字节回读、新工作区重开和正式查询。配置保存前留原文及哈希；保存结果未知先 verify，不重传；最后仅在远端仍等于本次候选时通过同一 owner 恢复原文并独立回读。任一并发差异停止恢复，不覆盖外部更改。元空间文件不写，业务 CRUD 零请求。证据仅落 `metadata-dataset/persisted-value-cascade/`；生产源无变动，不重复全仓回归。此证据覆盖真实命名视图及 query 值级联，不替代 field 子值写回或完整目标。

### 已验最小闭环：元数据模型选择到字段选项

最终验收：一配置+一既有测试完成，相关4套件99项通过；基线/最终typecheck、精确Lint、pages-config、diff-check通过；最终根211套件2773项全部通过389.73秒，源哈希一致。真实元数据入口消费最终仓内配置，58次只读请求、线上写入0；单/多/换选/空选择分别返回4/11/7/0条正确归属字段。元空间现为4表12视图，目标定义仍为7表。此配置未发布远端pagedata，不等同于暂停中的设计器页面已接线。证据 `metadata-dataset/metadata-model-field-cascade/result.md`；整体保持 implementing。

2026-10-09，implementing，主控沿“配置设计也要级联”和原生 DataSet 持续实施授权执行。真实只读探针确认：当前元空间/测试目标的远端 pagedata 均合法且无旧 viewCascades；1→2→1→0 个所选模型经原生值绑定得到4→11→7→0条所属字段，字符串 value 与主键数组各保其义。证据 `metadata-dataset/value-cascade-online/online-result.json`，线上写入0。范围结论限这两个已授权空间，不推广为全平台无旧配置。

精确生产范围为 `config/pages/data-platform/data-space-design/pagedata.json`：在 Base_DataModel 下新增 modelOptions，在 Base_DataModel_Field 下新增 modelFieldOptions，均为 autoLoad=false、autoCurrentFirst=false、autoSelectFirst=false 的原生命名视图，复用 formid 范围过滤、稳定rowid排序、现有500分页；选择值使用正式rowid，展示字段为Name。通过唯一 query 级联 model-field-options 将父选中主键数组映射到子 dataModelId 过滤，未配置sourceField，清空选择清空子结果。旧 default/design*/apiInfo* 的全量语义保持，不改暂停中的页面脚本或界面。父选择变化触发原查询 owner，数据权限、过期请求与字符串格式沿既有能力，不新增运行时代码或Java。

验证文件仅既有 `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-metadata.test.ts`：补真实正式字段夹具 Name/dataModelId，使用真实 loader/assembler/DataView/请求 codec 和HTTP边界响应；验证新视图惰性、单/多/空选择、换指针不改变选择值不重查、scope过滤与model过滤同时存在，原全量视图及独立实例不受影响。类型基线；先红例再JSON配置，首次配置修改立即最小回归；定向元数据/目录与设计会话回归、精确Lint/JSON解析/diff-check、最终类型。冻结后完整根回归；线上以仓内最终配置读取并复验同一链路，不把运行时临时候选当落地。新远端持久化不在本轮，无旧配置记录则不制造迁移数据。整体目标及未完成完整性矩阵保持。

### 当前子闭环：ClassModel 值级联合同与可执行配置

2026-10-09 最新局部验收：完整 DTO 返回和引用隔离已通过。两处生产代码与一个既有测试覆盖同步/异步、数组、递归、根属性和受控子 API；真实 DataSetCrudTool 创建/完整读取/更新、修改读取副本而实例不变、ScenarioViewFile 本地保存重开通过。保留 selection-string、valueField、selectionDelimiter。类型/Lint/AI1026/guide结构/diff-check通过；相关19套件221项，最终根211套件2772项通过387.61秒，三文件及生成物哈希复核。语义缺口仍2290、阻断类别313；整体计划保持 implementing。证据 `metadata-dataset/class-model-result-data/result.md`。下面原 `{}`、根属性和引用污染描述均是已解决的实施前/迭代中事实；线上旧配置及整体目标仍待完成。

结果数据隔离补充：真实 DataSet.getCascade 返回内部配置引用；取消纯数据代理后直接修改返回值会绕过 updateCascade。已在本轮既有测试复现。仍限本轮三个文件，在 native-script-context 的非 API 数据返回及属性读取边界复用 deepClone，为普通对象和数组提供独立可编辑副本；异步结果在兑现后处理。保留原始值类型，不做 JSON 降级或字符串拆分；不可克隆的数据显式失败，class/API 对象仍受既有代理控制。验证顶层、嵌套、数组、异步与属性修改不污染实例，正式 updateCascade 仍可应用并持久化。此变更不改变 DataView.value 的既有字符串合同。

2026-10-09 结果数据子闭环实施记录（已验收，主控，持续授权）：实施前生成物下真实脚本 `return await this.getCascade(...)` 返回 `{}`，而实例持有完整定义。已完整核读 surface→runtime metadata→native proxy→sandbox→coerceJsonValue；根因是数据声明也被注册为 result API，空目标代理被枚举为空对象。本轮精确范围仅 `packages/spark-ai/src/class-model/class-model/dts-surface-to-runtime-api.ts` 与既有 `packages/spark-ai/src/class-model/tests/dts-surface-to-runtime-api.test.ts`。按源码模型识别可调用对象：class 实例、声明实例方法或属性/声明关系可达 API 的模型继续使用受控代理；纯数据类型/接口/枚举保留数据结构，不将其注册成属性或返回值 API。不转发业务实例原始 ownKeys，不绕过方法参数校验，不改公共JSON规整器、业务DTO、Java或线上数据。测试沿真实声明→bundle→loader→script，覆盖同步/异步对象、数组、嵌套返回、根数据属性、递归DTO及真正子API参数拒绝；实际 DataSetCrudTool 创建/更新/查询完整定义和 ScenarioViewFile 本地重开另留证据。先前像/typecheck/红例，首次生产修改即最小复验；之后 script/ClassModel/持久化回归、typecheck/精确Lint/AI/生成门禁，再以独立根回归验收。证据 `metadata-dataset/class-model-result-data`。

同一闭环的实际失败补充：上述映射修正后同步/异步方法返回已通过，`return this.state` 仍为空。createAiApiScriptContext 将已提供的根实例人为放进未 settled 的 Promise，首个数据属性被套上根 API 代理。精确增加 `packages/spark-ai/src/agent/native-runtime/native-script-context.ts`：根上下文直接使用已有 createResolvedApiSurface 保持已知实例的同步语义，删除只被原根调用的 createApiProxy 薄包装；真实异步子对象继续现有 Promise 代理。先保留该路径前像，沿当前失败用例立即复验，同时补跑已有链式调用、callback、参数校验及拒绝传播测试。最终为2生产+1既有测试，不扩展其它数据/页面/保存入口。

最新局部验收：交叉/联合/Partial 参数投影已修通，五生产+一既有测试（含一新内部编译类）。磁盘及纯内存声明都经实际生成/加载/脚本执行验收；真实 DataSetCrudTool 按 cascadeId 更新 selection-string 定义、实际实例核对及 ScenarioViewFile 本地文件重开通过。最终根 211 套件 2771 项通过，384.52 秒，maxWorkers=1；前一轮 2770 通过/1 原 5000ms 超时及单独4.16秒通过记录保留，未改阈值或断言。类型/Lint/AI1026/guide结构/diff-check通过，六文件最终哈希一致；语义缺口前后均2290、门禁类别均313。证据 `metadata-dataset/class-model-alias-schema/result.md`。当前此断点已解决，下文对丢失cascadeId的描述是修复前事实。下一独立断点为原生脚本DTO整对象返回序列化；整体、线上旧配置及设计器仍未完成，计划保持 implementing。

2026-10-09 当前生成器子闭环（implementing，沿持续授权）：修复类型别名的交叉、联合、Partial 与 readonly 必填语义，使既有字符串兼容配置能通过真实脚本更新。精确生产范围：新增 `packages/spark-ai/src/class-model/class-model/schema/class-model-declaration-schema.ts`（用已有 TypeScript checker 解析声明数据形状，保留命名引用，不制造业务 schema）；`declaration/project-from-declarations.ts`（投影接入同一 Program checker，保留完整别名 schema）；`bundle/build-dts-class-model-bundle.ts`（共享编译 Program，根 schema 引用转换）；`schema/class-model-to-json-schema.ts`（完整别名 schema 不再被局部成员关系合并覆盖）；`bundle/dts-class-model-bundle-loader.ts`（加载根 schema 中可达引用）。测试仅扩展既有 `packages/spark-ai/src/class-model/tests/dts-surface-to-runtime-api.test.ts`，经实际声明→bundle→loader→native script 检查按 ID/端点更新、Partial、必填、非法输入不调用 owner；新编译投影按实际形状验证，不修改 DataSet 业务签名放宽约束。生成物沿原生成命令刷新。验证顺序：typecheck 基线与文件前像、最小失败用例、生产修改后立即复验、ClassModel 受影响套件、真实 DataSetCrudTool 更新和本地文件重开、最终 typecheck/Lint/AI 门禁；根测试单独运行，避免并行编译干扰。保留既有字符串持久化和全部未提交工作，无新依赖、Java、线上写入或业务设计页变化。证据目录 `metadata-dataset/class-model-alias-schema`。

参数引用子闭环已验：三生产文件（含一个新增内部类）+两既有测试，未修改预留的loader；类型/Lint/AI1025/结构门禁通过，相关18套件201项及最终根211套件2769项通过（196.68秒）。首次根一个既有5000ms超时保留，原阈值单独通过且独立全量复验通过；五文件最终哈希一致。真实脚本可创建并读取selection-string级联，其ScenarioViewFile本地往返保持views与格式；旧rowMode拒绝且无重复未处理Promise拒绝。证据 class-model-value-cascade/runtime-result.md。

下一最小闭环仍在本总目标：`updateCascade`真实脚本失败于生成参数丢失cascadeId，当前schema只有updates；源参数为DataViewCascadeSelector与updates的交叉类型。projectTypeAliasDeclaration有成员时丢弃完整objectSchema并回落到成员缓存投影，是已定位断点。需继续核型别别名根schema引用、Partial及readonly/required语义后列精确生成器范围，不能直接放宽字段校验。另有DTO结果代理返回整对象为空的问题须独立修复；本轮通过明确读取valueFormat及检查实际实例证明创建，不冒充DTO序列化已完整。全仓语义门禁、线上旧配置和设计器/整体集成仍未完成。

2026-10-09 后续最小闭环（implementing，持续授权，主控）：修复真实脚本参数引用的运行上下文。精确源码范围为 `packages/spark-ai/src/class-model/class-model/schema/class-model-runtime-schema.ts`（新增内部类，按生成声明收集参数引用的定义闭包，引用保持可校验且递归安全）、`packages/spark-ai/src/class-model/class-model/dts-surface-to-runtime-api.ts`（给构造/动作参数附上所需定义）、`packages/spark-ai/src/class-model/class-model/bundle/dts-class-model-bundle-loader.ts`（将声明自身schema引用纳入已加载闭包）、`packages/spark-ai/src/agent/native-runtime/native-script-context.ts`（引用参数的对象识别；消除只用于同步缓存的Promise分支产生重复未处理拒绝，原失败继续返回脚本）。测试范围为既有 `packages/spark-ai/src/class-model/tests/dts-surface-to-runtime-api.test.ts` 与 `packages/spark-ai/src/tests/script-runtime/ai-api-script-context.test.ts`；测试经实际声明→bundle→loader→执行器证明合法参数可调用、非法/缺失参数拒绝、递归/跨分片引用和错误路径。当前真实 DataSetCrudTool + ScenarioViewFile 复现作为集成证据，不手写替代生产schema、不引入依赖或修改公共业务API。开始前 typecheck/路径前像；先最小红例，首个生产改动立即复验；之后针对脚本及ClassModel套件、原生保存测试、typecheck、精确Lint/AI门禁。生成物刷新沿原范围。生成器中的其他声明投影缺陷与全仓语义债务单独记录，不静默放宽运行校验。

状态 implementing，主控直接推进。当前源码的 DataViewCascade 已为 query/field 联合，但 generated/dts-class-model 中的 types、DataSetCrudTool、DataMember 仍是旧行依赖合同；读取生成物不能得到已实现的通用值与字段级联。先用仓内原生成器刷新当前源码投影，禁止手改 shard 或另造配置模型。已有生成物基线及增量计划保存在 metadata-dataset/class-model-value-cascade。

第一步范围仅为 generated/dts-class-model 的 manifest、shards、semantic-gaps 和 .dts-manifest 自动生成物；运行 scripts/generate-dts-class-model.mjs --incremental，生成器因当前工作树源变动重投影的依赖输出允许保留，不改其他生产源码。原生成物已过时，78变更/30新入口/47移除的增量计划是当前事实，不把只生成一个JSON视为完成。先核原生生成、bundle/schema门禁、实际 loader/knowledge guide 可达字段与动作，再经 schema 校验与 DataSetCrudTool 调用验证新值定义、原格式持久化及旧行字段拒绝。若生成揭示源合同或生成器缺陷，先根据实际报告扩展精确源码范围，再修改。

生成构建不改变业务模型/Java/在线数据，也不恢复设计页；配置编辑的端到端场景保存沿既有 ScenarioViewFile/Workspace owner 核验。按变化选择针对性验证，未改变运行代码时不机械重复根回归；最终证据须标明生成范围、源/生成物哈希、真实 schema/guide 消费结果与仍待事项。上一轮完整211/2766验收为未变运行码基线。

实测进度：增量生成成功，1361 个模型；guide JSON Schema 结构门禁通过，真实 loader 与 modelGuide/createCascade action guide 已读到 field/valueFormat/parents/optionsView/valuePolicy。不能将结构校验当作可执行验收：executeDtsNativeScript → DataSetCrudTool.createCascade 实测失败，错误为 `can't resolve reference #/$defs/DataSetCrudToolCreateCascadeParams from id #`；失败前未创建级联，源码实现本轮未修改。需另一个最小闭环研读并修订 ClassModel 到执行器的 schema 引用范围，不能用手工展开级联 JSON 绕过公共合同。全仓语义门禁基线已有167项 module/model/constructor 缺口，刷新后313项；本次相关 DataViewFieldCascade 等源声明缺少说明，尚未补齐，不能声称全仓门禁通过。

字符串兼容单独复验：上一轮14个文件最终哈希仍一致；当前5套件149项全部通过（7.35秒），包含原生级联、配置CRUD、ScenarioViewFile、正式请求载荷保存后重新读取和渲染组件回填写回。此结果证明本地被测字符串/原生值合同，不代表线上旧配置已迁移、脚本配置执行已通或整体零回归。详细结果和失败复现保存在 class-model-value-cascade/result.md。

### 已验子闭环：普通选项组件消费值级联与原格式写回

本子闭环验收通过，整体仍 implementing。最终14路径（11生产、1新增测试、2API文档，含1生产新文件）；前后typecheck、12路径Lint、AI1024和限定diff-check通过。新增15项组件行为通过，最终根211套件2766项通过186.87秒，14最终哈希一致。首轮默认并发4失败已保留，单独5项及最终maxWorkers=2全套通过，未改5000ms阈值/断言。证据 field-cascade-components/result.md 与 verification.json。只接通已有共用选项控件，未恢复业务设计页、修改Java、线上写入或委派代理；ClassModel/设计器、线上旧配置核查及完整集成仍待完成。

实施依据：主控沿持续实施与字符串兼容授权直接执行。研读发现 useFieldOptions 只读共享 optionsView.rows；useOptionField 的多选 coerce 不接受保存字符串；CheckboxGroup 又绕过统一 fieldValue 直接读行；定义重建缺少组件可消费的配置通知。已使已有控件使用同一 DataSet 中目标字段的独立级联结果，并在交互写回时继续原字段格式。

精确范围：packages/spark-component/src/components/fields/options/useFieldOptions.ts（自动解析字段定义、绑定独立选项/格式和可用状态）；新增同目录 useFieldCascadeOptions.ts（按 DATA_SOURCE+field 识别定义，监听原 DataSet 状态/父输入，初始化只核验、卸载释放、行上下文与指针不符时不串用）；同目录 option-source.ts（树投影支持独立结果行，不污染共享 TreeManager）；context/useFieldPermission.ts（在既有权限写边界提供可选源值转换）；data-components/composables/state/useOptionFieldState.ts（错误投影与共用控制值）；data-components/choice/FieldCheckboxGroup/FieldCheckboxGroup.vue（消费统一控制值，避免绕过格式和权限）；non-data-components/FieldContextRenderer.vue（form 展示查询错误）；packages/spark-data/src/index.ts（显式导出已有 DataViewSelectionValue，真实消费者为公共组件，不增子路径/别名）；strategies/cascade/field-cascade-binding.ts（树选项同时读取已声明的结构字段并保持权限检查）；dataset.ts（关系配置重建完成通知既有 configChanged）；packages/spark-data/API.md 与 packages/spark-component/API.md（当前合同）；新增 tests/ui/field/choice/field-cascade-options.test.ts（真实 DataSet/查询权限上下文+渲染控件验收）。共13路径，11既有+2新文件，无第三套查询/保存 owner。

配置以已有 DataSet 字段级联及 optionsView facets 为准；显式组件选项源/值字段/分隔符与定义冲突时明确诊断，不覆盖定义。未配置级联的组件保持原逻辑。selection-string 只按显式格式解码，选项值采用同一 valueField token，单/多值按控件输入形状适配，用户选择后编码写入原字段；native 值保留类型。普通原生字符串不按分隔符猜测拆分。加载/失败/目标未绑定时不给旧选项，失败通过表单错误显示；子字段权限仍由原 DataView 决定。

验证：typecheck基线、精确前像；先用真实选项源共享行与目标独立结果不一致、多选字符串回填/写回的失败用例定位；首个生产修改立即最小复验；再验证父值变化、选项影响子值、两个绑定隔离、过期/失败/隐藏字段、空值/分隔符/业务值非主键、单选/多选/复选/树选项、定义替换和卸载释放；既有选项组件/原生级联/持久化回归，类型、精确Lint、AI门禁与根回归。Tree path 多层数组不能静默压成选中字符串；仅支持原合同可明确表达的值，非法结构显式失败。包出口仍是现有“.”，路径别名不变，通过跨包实际导入测试验证新增类出口。
本闭环范围修订：实时修改 optionsView 的 valueField/labelField/selectionDelimiter/treeConfig 时，原运行状态未失效，Vue 缓存也未读取配置通知。继续落实本节配置生命周期，不改变父值语义；增加第14路径 packages/spark-data/src/strategies/cascade/field-cascade-runtime.ts，消费已有 configChanged，仅使受影响选项状态失效，组件再通过原 refresh 入口核验，不执行父值变化的写策略。已有组件文件随配置通知重读 facets。先保留新增路径前像、写失败渲染用例；修复后立即验证新用例，再执行类型、Lint、AI及根回归。精确范围现为12既有+2新文件，无新API/保存owner/线上写入。

### 已验子闭环：删除 query 的行依赖合同并使用原生值绑定

本子闭环验收通过，整体保持 implementing。26路径（11生产、12既有测试、2配置、1API；1生产新文件）；前后typecheck、23路径Lint、AI1022通过；最终根210套件2751项通过（197.14秒），26最终哈希一致。首次根回归遗漏的两份事务配置已修正，原5秒超时项未改阈值复跑及最终全套均通过。证据 query-value-cascade/result.md。待接普通选项组件、ClassModel/设计器，线上旧配置尚未核查；无Java/UI修改、线上写入或代理。主控沿既有通用值语义实施授权，已核旧 query 三个断点：dependencyType 选择行事件、getParentRows 选择父行、resolveCascadeFilter 从父行读取原值。这会漏掉编辑覆盖、等值换指针仍重查，并把 allRows/pagedRows 当输入语义。仓内三个 pagedata 样板的 viewCascades 均为空，无需伪造线上迁移。

目标：query 与 field 均消费同一 DataMember.Value 取值边界。query 的 filterBindings 是值到目标查询条件的绑定：sourceField 明确字段则读字段原生值，省略则读选中主键数组；标量生成 eq，数组生成 in（包括空数组），普通字符串不拆分。多个绑定/多个父输入共同约束目标查询；模型关系保持原有完整表达式。删除 query 的 dependencyType 和 getParentRows，不保留旧行语义兼容路径，旧配置明确失败。query 和 field 的区别仅为输出目标（视图结果与独立字段选项/子值），不再存在两套父输入语义。

精确生产范围：packages/spark-data/src/types.ts、index.ts（移除 DependencyType，源字段可省略）；core/utils.ts（删无其他消费者的 getParentRows）；dataset.ts（严格拒绝旧配置、值过滤、引用守卫）；data-view.ts（移除父行参数、完整多父/自身过滤、静态及远程请求、过期响应失效）；dataset-crud-tool.ts（选中主键绑定的重命名/删除引用）；strategies/cascade-delegate.ts（按值快照响应全部信号，生命周期）；新增 strategies/cascade/cascade-value-binding.ts（shared 原生值读取、就绪和等值比较，实际被 query/field 消费）；既有 strategies/cascade/field-cascade-binding.ts、field-cascade-runtime.ts（复用共享值边界）；packages/spark-project-model/src/scenario/scenario-view-config.ts（场景配置同一语义）；packages/spark-data/API.md（当前合同）。不修改 Java/页面组件。

直接测试范围：spark-data/src/tests 下 cascade-event-filter.test.ts、cascade-computed-tree.test.ts、data-view/data-view-events.test.ts、crud/commit-mode.test.ts，dataset 下 dataset-crud-tool.test.ts、dataset-structure-crud.test.ts、dataset-request-orchestration.test.ts、dataset-relation-rebuild.test.ts、dataset-json-prompt-validation.test.ts；packages/spark-project-model/tests/scenario/scenario-view-file.test.ts；tests/runtime/auth-nav/lowcode-data-space-runtime.test.ts、data-space/metadata/lowcode-data-space-persistence.test.ts。既有行模式测试必须改为显式字段/选择值场景，不以去掉断言掩盖语义差异。其他真实直接消费者若出现，先修订范围。

验证：当前 typecheck 基线和精确前像；红例覆盖编辑字段、等值指针、选择主键数组、空数组、多父过滤、迟到响应与失效；首个源修改即最小回归；旧配置拒绝、原生字段级联/字符串保存重开/正式多视图编排；最终类型、精确Lint、AI门禁及根回归。旧 query 配置为明确破坏性修订，不静默推测 allRows/pagedRows 的业务输入；线上配置未实测的迁移保持待验收。证据目录 metadata-dataset/query-value-cascade。

直接消费者补充（全量回归核到后先修订范围）：backend-api-contracts/characterization-fixtures/pages-config/lmspark/homepage/tx-editing-rows/pagedata.json 与 tx-transaction-commit/pagedata.json 仍有 query dependencyType=currentRow。保留显式 sourceField=id 的字段值输入和原模型关系，仅移除已废弃属性；不把它们加入历史不可解析白名单。两路径先保存精确前像，修改后验证 tests/runtime/page/page-data-serialization-roundtrip.test.ts 与 transaction-config-pages.test.ts，再根回归。其他 cascade-demo/dataset-demo/smart-load 是原先已知拒绝的历史夹具，不恢复旧解析路径。页面渲染测试的5秒超时先在相同阈值单独复查，不改测试/配置超时来掩盖问题。
### 已验子闭环：值级联的统一配置 CRUD 与保存重开

本轮已验收，整体状态仍 implementing，沿原持续实施授权由主控执行。DataSetCrudTool 列表/读写原先排除 field，本轮已补齐统一配置入口；接续旧 query 行依赖替换及普通组件接入。证据 value-cascade-crud/result.md：前后typecheck、六路径Lint、AI1021通过；定向5套件141项通过；最终根210套件2748项通过（193.20秒），七路径最终哈希一致。没有线上写入、Java/UI恢复或代理委派。

精确七路径：packages/spark-data/src/types.ts（以 cascadeId 定位两种现有定义，联合更新/返回合同）；packages/spark-data/src/dataset.ts（统一 get/add/update/remove，唯一定位和提交前图/引用校验，拒绝跨类型混写）；packages/spark-data/src/dataset-crud-tool.ts（两种级联统一 CRUD、显式类型过滤、成功后才记录历史）；既有 tests/dataset/dataset-crud-tool.test.ts、tests/dataset/dataset-structure-crud.test.ts（行为、失败原子性、撤销重做）；tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-persistence.test.ts（用真实 CRUD 创建/更新/删除配置，经 pagedata 所属文件保存重开，保持字符串签名提交测试）；packages/spark-data/API.md（直接合同说明）。不新增源码文件或导出类型，不修改 Java/UI/普通组件。

定位以 cascadeId 为主，既有 query 端点选择仍支持，但多命中明确报错，不取第一条；ID 加端点必须同时匹配。字段定义继续使用现有唯一严格解析器；更新不可切换 kind 或夹带另一类型字段，失败不得修改原定义/运行实例/历史。selection-string 配置及原生 valueField/selectionDelimiter 经 CRUD 和文件往返保持不变；只将 viewCascades 配置写回文件，不保存整份运行 DataSet。

验证：保留七路径精确前像并通过 typecheck 基线；先用新增失败用例证明标准入口缺失，首次生产修改立即跑最小用例；完整 CRUD/原生字段级联/场景保存/元数据持久化回归；最终 typecheck、六 TS 路径 lint、AI 门禁、受影响原生与根回归。证据目录 metadata-dataset/value-cascade-crud。风险为联合返回类型影响直接调用方（已反查只有上述测试）及失败重建损坏运行状态（验证前不替换配置，失败用例检查实例和历史）。

### 已验子闭环：替换字段级联的行端点并接通子值格式兼容

局部验收通过，整体计划仍 implementing。精确13路径（8生产、4既有测试、1API文档，含2个生产新文件），前后typecheck、12路径lint、AI1021、原生21、相关54套件1072及最终根210套件2743项通过；13最终哈希复核一致。证据 value-cascade-runtime/result.md。线上零写入，未恢复UI/修改Java/委派代理。上一轮只有文档补充，本轮已直接替换 field 执行链。

本轮直接替换已有 field 分支，不增加第三套级联。父输入声明 tableName/viewId/可选field/parameter，field 缺省读取选中主键数组；删除 rowMode 和运行地址 rowId，旧地址明确拒绝。目标仍为明确的字段值绑定，由绑定层定位指针和编辑覆盖。按最终值比较触发，指针变化但值相同不重查；指针改变仍使旧目标写入失效。跨视图、多父值、空数组、取消编辑、迟到结果和权限均有真实原生实例验证。

选项值/标签/分隔符从选项 DataView 的 valueField/labelField/selectionDelimiter 读取，移除级联里的重复字段配置。目标显式声明 valueFormat=native 或 selection-string；未配置格式与旧 rowMode 均报错，不能静默猜测。native 标量保持类型，native 多值保持数组；selection-string 复用现有选中字符串的编码规则。retain 不改值，clear 使用显式清空值，retain-valid 保留仍有效的多选项、无有效项时采用显式清空值。手动初次刷新只核验；父输入改变后自动执行值策略。子值实际改变经现有编辑事件继续下游，旧响应、用户中途改值、取消编辑和权限禁止时不得覆盖目标。

精确影响文件：packages/spark-data/src/types.ts（上述合同）；strategies/cascade/field-cascade-definition.ts（严格配置/跨视图引用/依赖图）；strategies/cascade/field-cascade-runtime.ts（值快照调度/新选项约束/生命周期）；新增 strategies/cascade/field-cascade-binding.ts（原生值读取与目标指针/权限写入边界）；新增 strategies/selection/data-view-selection-value.ts（内部共享字符串编解码，实际消费者为 selection-delegate 与级联）；strategies/selection-delegate.ts（复用相同编解码，保留原有顺序/匹配行为）；dataset-crud-tool.ts（跨表父输入重命名及删除引用检查）；既有 tests/dataset/field-cascade.test.ts、tests/dataset/dataset-crud-tool.test.ts、packages/spark-project-model/tests/scenario/scenario-view-file.test.ts、tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-persistence.test.ts（迁移配置与行为回归）；packages/spark-data/API.md（本次合同）。如类型检查发现其他真实直接消费者，先补入范围再修改。

验证：typecheck基线与精确前像；先写值语义/字符串往返红例，首次源修改即跑字段级联用例；随后全部字段级联、选择、场景保存重开、元数据持久化、CRUD引用测试，再typecheck、精确路径lint、AI门禁。此闭环不修改Java/设计UI，不宣称共享选项组件接入完成。旧 query 分支的 dependencyType 移除、统一配置CRUD和页面消费仍属同一总目标，下一闭环继续替换，不能把保留旧 query 当成最终方案。

直接影响补充：packages/spark-data/src/dataset.ts 的 removeTable 必须检查新增的跨表父输入引用，防止删除仍参与绑定的模型；只补此引用守卫并用既有 CRUD 测试核验，未扩展其余 DataSet 行为。

用户补充持久化兼容：保留 DataView.value 的现有字符串 getter/setter、valueField 和 selectionDelimiter，不改保存格式；级联值经统一绑定读取原生值，避免猜测拆分字符串。

兼容必须覆盖子值回写，不能只保留 getter/setter：已声明按选中值字符串保存的字段，经选项重新查询和显式值策略处理后，仍按原 valueField/selectionDelimiter 写回字符串；原生数组保持数组，普通字段字符串保持本值。不能仅因值是字符串或含逗号就判定为多选编码，也不能只把主键 join 后冒充 valueField 对应的业务值。序列化适配位于绑定/持久化边界，级联依赖仍是通用值，不恢复当前行依赖类型。

本闭环已验证：字符串回填选择、父值改变、新选项按配置调整子值、保持原格式签名提交、依据实际载荷更新测试存储后独立读取。覆盖自定义分隔符、单选、空值、前导零、数字0、valueField 与主键不同、普通含分隔符字符串，以及失败/旧响应不改子值。此结论由新的 HTTP/文件边界集成和最终根2743项支持，不复用旧绑定入口212项冒充回写验收。原生DataView.value公共格式不变，内部编解码已被原选择委托和级联绑定复用。

接续：统一配置 CRUD 已由上节补齐；继续替换旧 query 分支的行依赖与相应配置/请求编排，再接普通选项组件消费和整体页面验收。禁止以 query/field 长期并存结束总目标，也不能把字段独立选项状态宣称为共享 optionsView.rows 已更新。待沉淀的隐含规则暂留此处：首次未加载与正式空选择不同；输入失效后恢复需要重新查询，但等值直接换指针不重查。尚未写入 knowledge。

### 已验子闭环：原生值绑定入口与序列化兼容

局部验收通过：1生产+1既有测试+API合同文档；typecheck前后、两路径lint、AI1019通过，最小16项及相关15套件212项通过。DataView.value/SelectionDelegate未修改。证据 native-value-binding/result.md；未重复根全套，不将此结果当作值触发、选项反向调整或全部级联迁移已完成。

沿已确认语义直接实施，主控执行。精确范围：`packages/spark-data/src/core/data-view-key.ts` 在现有 DataMember/resolveDataViewMember/resolveDataViewMemberBinding/diagnoseDataViewMember 合同增加 Value；有 dataField 时用指针定位并取编辑覆盖后的实际字段值，无 dataField 时取选中行主键值数组。检查当次字段读取权限，返回独立值快照，数组不经过字符串转换，错误显式诊断。`packages/spark-data/src/tests/data-view/data-view-key.test.ts` 补正式权限边界夹具、字段值/数组/空值/指针/编辑覆盖/复制隔离及旧 DataView.value 字符串读写兼容；`packages/spark-data/API.md` 记录绑定值与序列化值的不同消费语义。只改1生产、1既有测试和本次直接合同文档，不改 DataView.value 实现、不增加第二套保存 owner。

验证：typecheck基线；新绑定行为红例；首个生产修改立即复验；最终typecheck、两TS路径lint、DataViewKey/选择与组件绑定/场景回归、AI门禁。证据 metadata-dataset/native-value-binding。此子闭环建立后立即进入级联配置及运行消费替换；不以绑定入口通过宣称整个级联迁移或下游反向调整已完成。旧级联行语义仍是明确待移除项。

用户最新确认覆盖下节旧前提：当前行只作为构成值的指针，不参与级联关系定义。字段提供本身的值；tablegrid 提供选中行主键值数组。完整链路为“多个输入值 → 子选项查询 → 选项结果影响子字段值 → 子值变化继续下游”。值相同不重复触发，保留原生类型；取值和写值定位、权限、编辑覆盖属于绑定层，级联不持有当前行依赖类型。

下节按 editing-row 扩展 CRUD 的未完成实现已停止，六个本轮修改文件已按精确前像恢复，七路径哈希一致；未撤销此前命名视图等已验收改动。源码、差分与实验日志保存在 field-cascade-config/superseded/ 和 superseded.patch，不能复用为新语义验收。此前全套通过只证明恢复基线，不证明通用值级联已实现。

接续研读与实施顺序：先收敛值构成/值变化/写值合同（DataView、SelectionDelegate、data-view-key、字段绑定和 RendererTable），再替换级联定义/配置校验/执行订阅，最后接通配置维护与文件保存重开。不能只删 rowMode 字段、换名称或增加第三条并存级联分支。改源前须完成新的精确影响清单及对应行为红例。验收必须包含：字段标量；表格多个选中主键数组与空数组；指针移动值未变不重查；值改变重查；新选项保留/调整子值及继续下游；多输入、跨绑定隔离、权限、迟到响应；保存重开。暂不修改Java或恢复设计界面。

## 已取代闭环：父字段值驱动子字段选项视图的配置维护

状态：superseded；由上节通用值合同替代。下文仅保留尝试范围，禁止据此继续编码。

状态：implementing。用户已明确纠正语义并要求修正，沿持续授权由主控执行。真实断点是 DataSetCrudTool 的 list/get/create/update/delete 只支持查询视图对，原生 DataSet 的 update/remove 同样排除 field；底层 field runtime 已从当前编辑行读取多个父字段值。

精确范围：
- `packages/spark-data/src/types.ts`：字段级联首次声明明确实际值语义；级联选择器增加 kind=field + cascadeId，更新合同覆盖两种独立语义。
- `packages/spark-data/src/dataset.ts`：字段级联按稳定身份更新/删除；候选配置先整体校验引用、重复与循环，再替换并重建订阅；拒绝 kind 切换，失败不污染已有配置和运行状态。
- `packages/spark-data/src/dataset-crud-tool.ts`：现有级联 CRUD 覆盖 field，列表不再隐去它；查询级联保留明确 query 过滤；复用 DataSet 与字段定义校验，不另造保存或查询 owner。
- `packages/spark-data/src/tests/dataset/dataset-crud-tool.test.ts`：多父字段配置的创建、读取、修改、删除、撤销重做；拒绝错误引用/循环/混合语义并保持历史；纠正排除 field 的旧断言。
- `packages/spark-data/src/tests/dataset/dataset-structure-crud.test.ts`：查询级联返回联合类型后按对象断言保持原行为检查。
- `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-persistence.test.ts`：通过工具配置、正式文件 owner 保存、独立工作区重开，读取父字段编辑值查询子选项，验证多个父值、同行隔离、选项视图状态不污染、模型关系独立、修改删除重开后生效。
- `packages/spark-data/API.md`：纠正旧文档将输入级联等同两个视图的描述，明确 field 示例、值策略和 query 的独立用途。

实施前保留七路径当前前像；刚结束的 typecheck/根2730通过作为冻结基线，源哈希复核。先增字段配置红例，首次源修改立即单文件复验；再完成正式持久化集成。最终 typecheck、七路径中六个TS路径lint、级联/结构/元数据/场景文件聚焦及根全套；只有验证涉及的原生配置链，不恢复设计界面或宣称字段组件已消费行级选项。UI组件目前仍只读共享optionDataView.rows，其接入是独立差距，不能冒充本轮已完成。无Java、无代理、无线上写入。证据留 metadata-dataset/field-cascade-config。

## 已验闭环：命名视图自动查询与父依赖

验收：四路径最终哈希已复核；最小12项、聚焦10套件113项、根210套件2730项全部通过，前后typecheck、四路径lint、AI1019通过。无线上写入，证据为 named-view-autoload/result.md。用户最新指令优先纠正字段级联配置入口，不能把视图查询依赖当成字段输入级联。

状态：implementing；沿完整DataSet及持续实施授权，主控执行，无Java/UI/代理。上一闭环根210套件2726项已通过，当前只推进配置保存重开后真实命名视图查询这一业务闭环。

源码事实：triggerAutoLoad仅访问default；requestData能够复用本视图的在途Promise，但父依赖入口只等待Idle父视图；CascadeDelegate仅按crudService判断内存来源，正式模型通过query executor取数时会被误判。实现前以HTTP边界延迟响应逐一复现，不以类型存在或mock调用次数替代业务结果。

精确范围（3生产、1既有集成测试）：
- `packages/spark-data/src/dataset.ts`：triggerAutoLoad遍历模型全部视图，仅启动明确autoLoad且Idle的视图，保留非阻塞入口和失败诊断，诊断包含viewId。
- `packages/spark-data/src/data-view.ts`：父依赖等待复用父requestData在途请求，父已完成不重复加载；保持未满足依赖不查询、销毁后不回填的现有合同，不增加对外API。
- `packages/spark-data/src/strategies/cascade-delegate.ts`：正式modelBinding与普通CRUD共同区分远端视图；正式模型父行切换仍走现有refresh/query owner，内存视图继续按现有本地级联处理。
- `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-persistence.test.ts`：扩展既有HTTP边界夹具支持受控异步响应；保存自动加载配置、新工作区重新装配，以父先/子先两种表顺序验证命名视图、独立视图、autoLoad=false、不重复启动、父结果前不查子、正式过滤、切换父行再查询及配置不受运行结果污染；补失败与销毁边界。

顺序：先typecheck基线与四路径前像；新增业务红例后每个生产修改立即运行该集成文件，按实际失败逐个收敛三个断点；不额外清理或改接口。最终typecheck先过，再四路径lint、元数据持久化/装配、原生请求编排/级联与renderer回归、AI规则扫描和根全套。使用真实DataView/Assembler/Workspace/Runtime、仅传输与文件存储为夹具；本轮无需线上写入。证据留metadata-dataset/named-view-autoload。若暴露范围外问题，先修订本节，不散射修改。

## 已验闭环：回归合同与原生数据职责对齐

状态：implementing；沿已授权的全量回归修复继续，由主控执行。语义梳理已完成，当前先收敛两项已复现的根套件失败，不改生产行为。

根因：场景文件已允许正式字段的前端校验及本地计算列，原测试仍拒绝空 columns；页面测试在 DataSet 创建前全局监听 onAnyViewChange，额外计入两套 DataSet 自有字段级联订阅。源码显示该订阅随 DataSet 生命周期释放，renderer 刷新/卸载应只释放自己持有的订阅。

精确范围与顺序（两个闭环串行实施，每次修改后立即最小验证）：
1. `tests/app/dev/dev-dataset-designer-projection.test.ts`：接受前端规则和空扩展，保留命名视图；明确拒绝文件覆盖正式字段类型/主键等结构，并确认失败不污染当前草稿和保存基线。
2. `tests/runtime/page/spark-page-renderer-binding.test.ts`：先装载 externally owned PageRuntime，再计数 renderer 注册；保留刷新四次注册/两次释放、卸载四次释放的精确断言，补刷新后实际 DataView 变化可见及外部 runtime 继续存活的行为验证。不会将原四次预期简单改为六次。

验证：根 typecheck 基线、原两文件失败复现；每项改动后单文件测试；随后 typecheck、精确两路径 ESLint、两文件与场景文件/装配/字段级联相关套件、verify:ai-codegen、根完整 test:run。只改测试，不重跑未受影响的 API/线上写入验收。证据存于 metadata-dataset/regression-contract；保留前像与最终差分，不回退其他未提交改动。完整 DataSet 能力缺口继续保留，不以测试通过替代完整业务交付。

验收结果：两项原失败复现后，串行修正并分别通过1项/21项最小测试；相关5套件123项、根全套210套件2726项全部通过。前后根typecheck、两路径lint、AI扫描1019通过，生产源码改动0。没有将订阅断言4改成6，也未放开正式字段结构覆盖。证据为 regression-contract/result.md、原始日志、两份前像与最终差分；上一闭环的根两失败现在已收敛，但全目标仍 implementing。

下一语义闭环：命名视图 autoLoad 从配置到启动查询的完整消费。已定位 dataset.ts 的 triggerAutoLoad 仅访问default，而 renderer 在初始化脚本后调用它；DataView.requestData 承担父依赖编排。实施前须核验父请求已在Preparing/Loading时的等待、两视图并发、重复启动和失败状态，不能直接扩大遍历后宣称级联正确。当前尚未修改这些生产路径，精确范围和行为红例在下一轮确定。

## 已验闭环：数据库定义变更后的文件修复与重开

状态：implementing；沿持续实施授权，主控直接执行。上一轮语义研读是进展：确认了已保存 DB 与旧 pagedata 失配会阻断会话修复。本轮以完整定义编辑/保存/重开为验收对象，不修改 UI、Java 或数据库保存合同。

局部验收已通过，整体计划保持 implementing：同一空间字段别名经签名保存，旧文件失配后可诊断/修复，文件保存或 unknown 核验后，新实例按新字段查询和签名提交均通过 HTTP/文件边界集成；线上零写入验证恢复 7 模型，远端文件原文不变。三路径类型/lint/AI 门禁、根聚焦147与API540通过。根全套2724通过、2失败，独立重跑仍为同两项：场景 columns 空数组拒绝断言、页面刷新订阅次数4/6；尚未修复，不宣称零回归。详见 definition-recovery/result.md 与其三路径前后哈希。下一闭环先核这两项的真实合同，不直接改弱断言。暂不扩大 UI/Java 范围。

问题与根因：会话将目标定义投影成功作为进入编辑的前提；refresh 先销毁旧投影，装配失败后 stageDefinition/stageView 又要求有效投影；初次打开失败释放元数据。一个字段的正式输出别名发生变化，就可能使持久文件中的列引用失效，无法从同一会话修正。

实施范围（1 生产、1 既有测试、1 新集成测试）：
- `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts`：保留装配失败原因为明确可读的 `definitionError`；读取不可用投影仍抛出该原因。文件已成功加载且当前 scope/owner/修订有效时，允许返回带失败诊断的会话，以便修复。文件读取/解析失败和身份失效仍拒绝打开。refresh 仍抛错；仅已记录装配失败的会话可通过完整候选验证修复文件，不能跳过模型、引用或保存前验证。直接修改有效投影仍拒绝；文件变更、dispose 及迟到结果保持现有保护。
- `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-design-session.test.ts`：拆分损坏文件与错绑定两类原测试预期，补修复、错误清除、未修复禁止保存、作用域失效和迟到失败检查。
- `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-definition-recovery.test.ts`：新增传输/文件存储边界夹具，保留真实 DataView、DataSpaceRuntimeApi、DataSpaceDesignApi、Assembler、ProjectWorkspace 和 Session。验证元数据记录编辑与签名保存，正式定义重读引发旧文件失配，候选修复和文件保存、新工作区重开、目标视图查询及再次签名提交；附带文件写后响应丢失核验，不能重复数据库或文件写入。

兼容性与裁决：成功/缺文件会话不变；合法 JSON 但正式定义无法装配时，open 返回可处理会话及显式错误，definitionDataSet 不返回伪空成功。装配网络失败也按原始错误明确表达“投影不可用”，不假称配置非法或提供空替代。数据库仍使用原生 saveChanges；保存后显式 refresh，不新增 save-all 原子事务或自动重试。原会话条款中的“其他失败一律清理抛错”只在装配失败场景被本节替代。

验证顺序：先根 `pnpm run typecheck` 基线并留当前文件前像；新恢复行为先红后绿，首个生产修改后立即复验。随后根 typecheck、精确三路径 ESLint、metadata/view-design/scenario assembly 与场景文件相关测试，API runtime/design 相关套件、`pnpm run verify:ai-codegen`，以及根 `pnpm run test:run --testTimeout=15000 --maxWorkers=2` 全套检查并记录任何失败，不扩大修复无关问题。再以已授权账号和已存在目标做只读验证：从正式文件加载，在独立探针工作区制造无效列引用，打开带错误的会话并通过 stageDefinition 恢复原文，核对远端文件前后原文相同；登录后仅允许 GetData 与文件读取端点，禁止线上提交。证据置于 metadata-dataset/definition-recovery。无效候选、两类 dirty、失败诊断、实际请求/回执、重开结果及资源释放均需断言。

## 已验闭环：正式 DataView 的字段输出与行身份

问题：DataView 配置和调用字段子集已进入 Fields，但实际请求缺少后端已有 OutputFieldMode=REQUEST，因此返回全部模型输出。线上只请求 Name 又会遗漏正式 rowid，使按主键检查的权限和编辑失效。

语义与步骤：
1. 正式模型绑定的 DataView 查询使用请求字段范围；额外保留正式主键供行身份、权限和提交使用，不把它强行加入视图显示列或改写持久投影。按现有正式输出名→模型字段 Name 映射，不能猜 id/rowid，也不能扩大后端可输出字段或权限。
2. 无正式主键模型保持原只读语义；未绑定正式模型的查询及直接 runtime.query 缺省模式保持原合同。增加可选 outputFieldMode 表达后端已有 MODEL/REQUEST，非法值在 I/O 前失败。
3. 保留实际原查询基线和保存 owner；通过真实 DataView 查询→编辑→原签名提交→正式回执验证。多命名视图及其配置互不污染。

精确影响文件（5生产＋2既有测试）：
- packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-contract.ts：增加可选查询输出模式。
- packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-wire-contract.ts：内部封包携带已有后端 OutputFieldMode。
- packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-options.ts：校验和传递模式。
- packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table.ts：在请求根显式输出模式，缺省不增加字段。
- packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts：正式绑定视图选择 REQUEST，映射输出并补齐唯一正式主键依赖。
- packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-model-alias.test.ts：传输边界按实际模式返回字段，验投影/别名主键/权限/签名保存/回执/无主键/多视图及直接查询兼容。
- packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts：回归发现原字段去重测试把省略正式主键当成预期；只改其精确请求断言为 salary 一次＋rowid 一次＋REQUEST，保留不重复字段及不改写输出别名的检查。此处测试影响面在修改前补入计划，原失败记录保留。

兼容与风险：raw query 缺省不变，无新增公共符号、文件格式或 Java 修改。字段子集可能暴露此前借全字段结果掩盖的缺失依赖；由当前业务验收暴露并明确处理，不静默退回全部字段。排序、树、本地计算的依赖须核现有调用，不扩大本轮配置范围。此前未提交修改全部保留，七份 before 前像只用于本轮局部回退，禁止整文件回退到 Git HEAD。

验证：开工 pnpm run typecheck 留基线；TDD 先以实际投影→权限→保存行为用例失败，再改实现并立即复验。完成后根 typecheck 先通过，七文件 eslint --max-warnings=0；API 包 runtime/tests 及 data-space-runtime-api.test.ts、design/data-space-design-api.test.ts；根 metadata、lowcode-scenario-assembly、computed-query、field-cascade 相关套件；verify:ai-codegen。最后通过只读线上原生装配视图验证实际返回及权限，禁止探针篡改 OutputFieldMode 充当实现通过。证据统一留 projection-query；线上业务/配置写入为零，真实保存由 HTTP 边界夹具验收。

## 已核实的语义

字段输出闭环验收：五生产＋两测试，七份前后哈希及精确差分留 projection-query。新用例先红后绿；API8套件540、根7套件102共642项通过，最终根typecheck、精确七文件lint、AI扫描1018文件及diff检查通过。线上真实ScenarioViewConfig→loadScenarioDataSet→DataView查询返回Name＋正式rowid，显示列仍只有Name，权限和编辑状态正常；本次fields覆盖及默认完整输出互不污染。单ID入口仍完整返回1空间/7模型/119字段/0关系。线上零业务/配置写入，保存回执由HTTP边界夹具验收；无代理/Java/UI/Git交付操作。详见 projection-query/result.md。待沉淀约束是显示列、请求输出与保存身份分离，未写knowledge。完整定义维护、其余原生缺口及AppWorks整页目标继续，不因局部通过删掉总计划。

用户已明确持久化方向：**pagedata.json + 现有数据库表，共同完整表达仓内 DataSet，暂不修改 Java。** 四个既有数据库元模型缺少 DataView 定义，须由 pagedata 的 `tables[tableName].views[viewId]` 补齐，并由元数据空间统一提供维护所需的定义。四表各自用于查询记录的 DataView 不能冒充已补齐目标 DataView 定义层；该层未验证前不得宣布元数据空间完整。

DataView 元模型字段范围已按 `packages/spark-data/src/types.ts:608` 核定：身份为目标空间、正式 modelId、稳定 tableName、viewId；配置为 fieldProjection、queryContext、filterExpression、sortExpression、autoCurrentFirst、autoSelectFirst、page、pageSize、treeConfig、valueField、labelField、selectionDelimiter、autoLoad、commitMode、aggregates。复杂配置保留原生结构，不降成六个基础属性。rows、当前选择、编辑缓冲及查询权限凭据不属于视图定义。相同 viewId 可存在于不同模型/绑定表中，不能只以 viewId 当整个空间的唯一键。

持久化选择已解决，不再等待用户确认：数据库继续负责已存在的空间、模型、字段和模型关系，pagedata 经 ScenarioViewFile/ProjectWorkspace 负责每个模型绑定下的命名 DataView 和前端配置。前端组合两类来源，按本仓 DataSet/DataTable/ViewMetadata 装配；修改时按所属来源分发，分别核对正式回执与回读，不承诺文件与数据库原子事务。不能伪造后端 modelBinding、创建不存在的 Base_DataView 表，或把无权限来源的静态 rows 当正式可写结果。暂不修改 Java，遇到缺口先按前端现有正式 owner 和真实合同解决。

当前已实际验通：四个数据库元模型 → 原生四个 DataTable / 十个命名查询 DataView；单目标 formid 输入返回 1 个空间、7 个模型、119 个字段、0 条目标模型关系。另以元空间自身 ID 加载独立实例验证隔离。随后为测试目标实际建立了缺失的 pagedata，独立字节回读及新工作区重开确认，数据库与文件共同恢复 7 个原生 DataTable / 7 个 default DataView。现已接通单目标无 UI 定义维护会话，同一入口提供正式元数据与目标原生 DataSet，目标 DataView 仍归属各 DataTable；编辑、保存、重开及未知保存恢复通过现有文件 owner。下表所列原生配置缺项仍未完成，不能据此宣布完整 DataSet 设计交付。

- 元数据空间身份是已有 DATA_SPACE_DESIGN_FORM_KEY；被设计空间 ID 是其参数值，两者不能互换。
- 在线 Base_DataSet 中该元空间已有参数 `formid`。保留此合同，不发明新的后端参数名。
- 四个正式元模型为 Base_DataSet、Base_DataModel、Base_DataModel_Field、Base_DataModel_Relation；正式绑定与字段来自后端。在线证据见 `notes/evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/contract.json`。
- 对应视图的范围：Base_DataSet.rowid = GetInputParam(formid)；其他三个模型 dataSetId = GetInputParam(formid)。DataView.queryContext 沿现有查询 owner 转换为 wire inputParams。
- 稳定模型关系由正式 readRelations 装配为 resourceRelations；当前元空间实际只有空间到模型的一条关系。viewCascades 是另一层，不凭此关系生成，不宣称已实现字段输入级联。
- 被设计空间的多 DataView 定义继续属于其 ScenarioViewFile，不发明 Base_DataView 表；本轮产物是设计器消费元数据的 DataSet，不是被设计业务空间的运行 DataSet。

## 已冻结局部实施：DataTable 操作与提交配置

已实现的局部范围（主控直接实施）：正式模型的 api.create/update/delete 配置决定提交端点；端点须接受原有 SPARK CrudModel 与动作回执协议，HTTP POST，不把普通 REST 行请求或事务端点混入。允许以 / 开头的站内绝对路径、端点 headers/params；运行身份头不可覆盖。缺省操作沿现有端点，显式配置参与选择。一次保存的所有活动操作须解析到相同端点及超时，否则发送前失败；分端点部分成功协调仍属缺口。crudConfig 接通 timeout，并验证 retryCount=0、validateData=true；其他策略明确拒绝，不能保存为无效配置。函数持久化和其他 api 操作仍保留完整目标。未采用尚未确认的新名称、未加别名。

精确七文件：packages/spark-project-model/src/scenario/scenario-view-config.ts（JSON 形状校验）；src/lowcode/data-space/lowcode-data-space-assembler.ts（配置复制入 DataTable）；packages/spark-data/src/data-view.ts（从实际提交表传递 tableConfig 值）；packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts（同步捕获配置并交原保存 owner）；同目录 protocol/data-space-request.ts（固定协议请求）；同目录 save/data-space-save-config.ts（内部配置值/校验，无公共导出）；tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-submit.test.ts（真实 Workspace 保存/重开→Assembler→正式查询→配置提交验证）。传输使用 HTTP 边界夹具，无线上写入，未验证的业务接口不能视为兼容 SPARK 协议。

用户再次明确 DataTable 配置提交方法，并要求理解 api/crudConfig。以原生类型为准：api 声明各 CRUD/批量/事务/树操作的端点映射，crudConfig 声明调用策略；同表多个 DataView 共享。DataView 的编辑状态与 commitMode、DataSet 的聚合保存协调不替代表级配置。

最终传递合同：DataSpaceQueryCache 会共享相同在途查询上下文，不能用 context→单个 DataTable 映射推断配置来源；完整 DataTable 又会产生循环引用。故由实际提交 DataView 传 tableConfig（仅 api/crudConfig 值），runtime 同步捕获独立值后进入异步队列。原场景、模型、基线校验继续使用既有 identity/context，配置不是身份依据。两次错误路径及原失败用例均保留，未改弱既有测试。

验证记录：根回归174/174、API回归208/208，共9套件382用例；最终根typecheck、精确七文件lint通过；规则扫描1018文件通过，最后去除冗余判断后又验17项聚焦用例及类型/lint。七份冻结哈希复核匹配。仅主控自审，不声称本轮独立代理审查。具体边界、失败历史及日志见 table-submit/result.md。

当前动作已切换为整体语义研读，暂不继续扩展该局部实现。后续依据 research-data-space-data-chain.md 修订闭环；完整操作矩阵、原生配置持久化及恢复缺口仍保留，不用支持子集宣称全部完成。历史“维持 api/crudConfig 全部拒绝、下一步只补 timeout”的建议不采纳。

## 已验实施项：正式 DataTable 资源语义装配

依据native resourceId的外部资源名称合同和已核正式dispatch，使用DB MetaName（FormalModel.sourceName）表达资源名；实际来源系统、provider和记录ID仍由正式模型owner定位，不增加目录查询或自造全局ID。wire类型到native类型由现有codec集中描述，保留数据库视图与逻辑视图区别；JSON/file保持扩展远端类别，绝非static-data。file仅支持已有元数据表达，不宣称后端查询实现。

精确八文件及门禁见 `.superpowers/sdd/plan-data-space-metadata-dataset/table-resource-brief.md`。三处生产变更仅codec、DesignApi纯语义方法和Assembler；不改readModel I/O、DTO、Java、UI或线上数据。保持旧wire函数结果；两处测试将错误的native类型夹具改成真实DB类型。验证须证明文件保存重开后资源属性来自最新DB定义，而正式请求仍使用模型绑定；不得把资源名误作查询模型Name。

验收：API90、装配/持久化15、运行层65、页面167，共九个不同套件337项通过；最终根typecheck、精确八文件lint、AI扫描1016文件及独立审查通过，主控八份冻结哈希匹配。真实单ID入口返回1空间/7模型/119字段，目标覆盖字典、接口、逻辑视图、数据库视图、JSON和数据库表，7个native表的资源类型/来源名/模型绑定全部与正式元数据一致，每表default视图仍归属原表。线上只读，零写入，两个DataSet释放已验。根首个探针对原生序列化误要求不含rows键，源码实际返回rows:[]；修正探针后确认两个实例全部远端视图序列化行数为0，源实现未因此改动。原失败和最终通过证据均保留于 `metadata-dataset/table-resource/`。

## 已验实施项：DataTable 业务分类文件持久化

沿已授权完整 DataSet 计划完成局部闭环：`pagedata.tables[tableName].businessCategory` 经现有文件 owner 和装配器恢复原生表属性。该属性是前端建模分类，DB 无已证同义合同，不等于 IsBusinessMain，也不生成关系或权限。

精确五文件、方案与验证命令见 `.superpowers/sdd/plan-data-space-metadata-dataset/table-category-brief.md`。只改 ScenarioViewConfig 校验和 Assembler 传播两处生产断点，补文件/装配/真实会话保存重开测试；复用 stageDefinition 和 stageView，不新增 UI 或公共 API。允许非空扩展字符串；缺省不推导，删除即清除，非法配置原子拒绝。兼容已有未配置文件，资源类型和身份继续由正式 DB 来源决定，本轮不发明映射。风险是视图编辑丢失分类或原生投影绕过文件真源，分别以保存重开和投影护栏验证。Java/线上写入均为零。

验收：三个聚焦套件104/104、两套相关回归16/16，精确五文件lint、最终根typecheck、AI codegen和独立审查通过；主控核对五份最终哈希。真实ProjectWorkspace/ScenarioViewFile/Assembler链在传输边界夹具中完成设置、保存、新owner重开和删除无残留。证据 `metadata-dataset/table-category/result.md`。本轮未做线上写入，不据此宣称资源映射或完整DataSet/AppWorks已完成。

## 已验实施项：正式空间名称装配

数据库 Base_DataSet.Name 现为原生 dataSetName 的正式来源，scenarioId 保持运行身份。轻量 readSpaceDefinition 经既有 runtime.query 精确读取 rowid/Name，验证唯一行、服务端总数、目标身份、读取权限和请求scope。loader 与正式模型/关系共同装配，pagedata不复制Name。元空间名称与目标formid各归其身份；inputParams仍由元数据DataView承载声明，queryContext只传运行值。

本轮真实查询先否定了“显式投影就能得到Name”的前提：元模型Name.IsOutput=0。五文件曾精确回退并保留前像，随后通过现有DataView+DataSet.saveChanges仅将正式字段8349CC5F4D3D473A961886A3AFCC1C18的IsOutput改为1。唯一更新回执、独立新DataSet回读、正式模型及同元空间名称查询均通过，线上元配置写入共1次；不改Java、权限、其他字段或业务数据。此后才恢复十二路径源实现，完整过程见space-name-output-brief.md和space-definition/result.md。

十二文件为3生产+9既有测试，单一低阶writer。API包74、五套聚焦38通过；root大套两套101通过，设计页102在修正旧fixture cascadeDel:boolean→真实int后隔离重跑通过（命令超时15秒，不改生产校验或测试断言）。315项对应套件现均通过，原194pass/9fail结果保留。精确lint、root类型、AI门禁通过；独立审查及单行夹具补审通过。十二份前后SHA与420行精确差分已核。详细路径和检查命令见space-definition-brief.md。

真实新入口零写验收：目标ID返回1空间/7模型/119字段/0关系，定义恢复7表/7个default视图；元空间名“数据空间设计”、目标名“四文件编辑验收-20261007”均等于各自正式记录，inputParams载体及formid保留，释放时两份DataSet均销毁。文件保存/新工作区重开测试证明正式名称改变无需修改pagedata。

下一步继续下方原生完整性矩阵：DataTable资源语义、正式字段扩展来源、api/crudConfig、static-data和旧布局等尚未完成。不得把可选属性机械都映射为DB已有字段；先按实际消费者核清归属，再做一个最小闭环。UI/Java仍暂停，完整AppWorks迁移目标保留。

## 已验实施项：正式保存消费原生字段校验

当前核源证明，pagedata列规则已恢复DataValidator，但正式DataView.saveQueryViews绕过普通CrudDelegate校验。按原查询唯一基线，新增校验完整输入、更新只校验实际变化字段、删除不做字段值校验；模型和字段权限仍来自正式查询，保存授权继续由既有后端强校验负责，不改变签名封包或按E/R静默裁剪。DataSet须在任何编辑应用之前对全部活动目标预检，校验失败保留原rows/overlay/dirty且零保存HTTP；实际统一保存入口再核待发状态。已有validate整行自定义回调语义不变，正式增量入口只消费配置列规则。

精确范围和验证在 `.superpowers/sdd/plan-data-space-metadata-dataset/query-save-validation-brief.md`：validation.ts、data-view.ts、dataset.ts、新query-save-validation.test.ts及既有lowcode-data-space-persistence.test.ts五文件。低阶唯一writer先红绿、再真实保存文件/新工作区重开/实际模型查询保存；主控集中类型与回归、独立审查。无Java/UI/新数据库表/新保存通道/线上业务写入。沿持续授权执行，完整持久化矩阵保持，未缩小原任务。

验收通过：五文件前后哈希及精确差分在 metadata-dataset/query-save-validation。先红后绿，四套聚焦59/59、精确lint、根类型及AI门禁通过；主控根范围7套274/274，另用spark-lowcode-api包级配置执行根include遗漏的data-space-runtime-api.test.ts 98/98。独立query-save-validation-review.md通过。主控在冻结前修正捕获阶段提前清理reverted dirty的顺序及隐藏字段夹具，前置只读预检后原成功捕获行为保留；没有扩大五文件。真实文件保存/fresh workspace/正式查询/非法输入零保存HTTP/修正后实际批量接口与回执已验，传输边界为夹具，无线上业务写入。整行自定义回调仍由原validate消费，列预检不重建授权。

空间名称与声明载体后续已按上方名称闭环核实；模型资源映射等仍见完整性清单。UI和Java维持暂停，整体计划保持implementing。

## 已验实施项：字段输入级联定义、运行与持久重开

沿持续实施授权推进真实父字段值→目标值及选项。精确14文件范围、配置形状、值策略、生命周期与验证写入 `.superpowers/sdd/plan-data-space-metadata-dataset/field-cascade-brief.md`；该文件是本轮委派范围的组成部分。生产涉及原生types/index/dataset/dataset-crud-tool/data-view/cascade-delegate、两个新cascade子目录owner、ScenarioViewConfig及必要assembler透传；测试为新field-cascade、既有dataset-crud-tool、scenario-view-file和lowcode-data-space-persistence。只有低阶单writer可修改。

唯一viewCascades联合query/field；保留旧查询行为，字段分支明确同一目标DataView编辑行及多个父字段到参数绑定，引用命名optionsView。retain/clear/retain-valid显式选择，后两者必须指定clearValue；初次显式加载不写原值，父值改变才按策略及实际写权限写编辑缓冲。计算/主键不能作为自动写目标。状态按view/row/field隔离，现有queryOptionRows取得完整选项；晚响应、用户期间主动改目标、取消编辑/重查/销毁均有处理。环、重复、未投影/隐藏输入、失效引用明确拒绝。跨视图行定位及复合目标值没有本轮合同，不猜测，仍列后续能力边界。

维护路径必须同步覆盖字段/表重命名、被引用列/视图/表删除、旧query CRUD与field并存；通过现有文件owner保存、新workspace重开及实际父值编辑验证下游消费，不能只证明JSON可解析。字段定义与运行状态分离，不写业务rows/权限/选项结果。先最小红绿，后聚焦四套+精确lint，冻结后root类型/AI/相关回归和独立审查。无UI、Java、数据库表新增或新保存通道；完整原生覆盖矩阵继续有效。

验收完成：原14路径中13个实际修改，assembler原样透传无需修改。独立探针发现父值改回原值后取消仍被迟到响应写回，已通过两条原生取消入口的显式 editingDiscarded 事件修复，指定行及零patch取消均使待处理代次失效。普通 editingChanged 保持原义，回调错误有脱离业务值的诊断。四套聚焦113/113、主控既有影响回归206/206、事件/取消/保存补充回归105/105、精确lint、最终根typecheck、AI codegen及独立探针1/1通过；测试只读索引的末次单行修正另跑保存重开1/1和文件lint，未重复无关测试。所有14路径SHA与前像已核，精确差分 field-cascade/field-cascade-final.patch。

真实Workspace/ScenarioViewFile保存、新工作区重开、Assembler及DataSpaceRuntimeApi串联的持久化证据采用传输边界夹具；本轮线上请求/写入为0，未接界面、未改Java。端点为同一编辑行的标量父值和目标值，跨视图定位、复合值及设计器配置级联界面未完成。详见 metadata-dataset/field-cascade/result.md 与 field-cascade-review.md。后续仍按下方完整性清单推进；正式query-save的前端校验门禁是已知待补项，先核当前保存owner与DataValidator合同，再划定下一最小闭环，不重跑已接受能力。

## 已验前提：字段输入级联的独立选项查询

现有 viewCascades 只监听查询结果，不满足多父字段当前值驱动目标字段值与选项。沿已授权实施，先补一个必要前提：命名选项 DataView 能按不同编辑行的父值独立查询，不能覆盖共享 rows/queryContext。

本轮精确三个文件：packages/spark-data/src/data-view.ts、packages/spark-data/src/tests/data-view/computed-query.test.ts、packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-model-alias.test.ts。在 DataView 增 queryOptionRows 的窄入口：显式输出字段和独立参数覆盖，原正式 query executor 身份不变，未注册的临时视图复用投影/计算/字段权限；完整读取后只返回可读标量选项行。隐藏/脱敏、缺字段、不完整结果、过期源明确失败；finally 释放临时视图，源编辑/选择/数据与其他行的请求不串用。静态/REST/嵌套对象选项不假装已支持。

实际消费方是下一闭环的原生字段输入级联 owner；配置仍在唯一 viewCascades 域区分查询/字段分支，目标写值策略必须显式。当前不改 UI、file schema、Java、数据库，也不另加权限映射（已核后端权限使用正式输出名）。细则与确定性并发/生命周期验收见 .superpowers/sdd/plan-data-space-metadata-dataset/input-options-brief.md。先最小红绿，后两套聚焦和精确 lint，冻结后 root 类型、受影响回归及独立审查。此项不表示字段输入级联、完整 DataSet 或整页迁移完成。

验收结果：独立查询已在上述三文件完成。公开表挂载会重写共享 _pk 元数据，因此临时视图采用同类内私有挂载，源表列/命名视图保持原引用；计算 ctx 独立复制且只接受准确可比的 JSON。独立审查复现合法 __proto__ 输出丢失，原 writer 改为定义自有字段并通过原失败探针；临时树模式显式 flat，源 nested 配置保持不变。最终聚焦44/44、主控相关回归182/182、精确lint、最终根typecheck/AI及独立审查通过。根首次类型检查的可选 filter 错误已局部修复。证据 input-options/result.md；本轮没有线上请求或写入。

下一闭环仍须落地真正的字段输入级联配置和 owner：以目标 DataView/行/字段隔离状态，从 editingFieldChanged 读取多父字段当前值，消费已验 queryOptionRows，再按显式值策略及字段写权限更新目标编辑缓冲；处理迟到结果、取消编辑、空间释放及循环依赖；经现有 pagedata owner 保存/重开恢复配置。仅完成查询前提不等于这些行为已存在。跨视图行定位与自动默认值不得猜测；尚无新用户答复时沿无隐式清空/首选的原则推进独立工作。

## 影响范围

1. `config/pages/data-platform/data-space-design/pagedata.json`：四个已有 DataTable 的所有 DataView 增加参数化范围过滤；保留现有 modelBinding、命名视图及配置，不存正式字段副本和运行数据。
2. `src/lowcode/data-space/lowcode-data-space-runtime.ts`：增加明确元数据入口 `loadLowcodeDataSpaceMetadata(dataSpaceId)`；复用本文件 loadScenarioDataSet 和既有装配器，绑定 formid 查询上下文，并经 DataView 正式 owner 完整读取四个 default 视图。输出 DataSet，生命周期归调用方。空/非法输入在 I/O 前拒绝；失败、缺失目标、跨目标返回和过期 scope 销毁候选并抛错。不涉及界面或路由。
3. `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-metadata.test.ts`：配置合同、四表装配、单参数到 wire、完整分页、返回目标范围、无目标文件依赖、两个调用隔离及失败清理。
4. `notes/evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/`：源前像、验证日志、线上只读实测与结构摘要。线上使用真实正式字段和数据，不上传配置或写业务记录。

## 两类持久源的完整性清单

“完整”以本仓 `DataSetMetadata → TableMetadata → DataColumn / ViewMetadata` 的定义与实际消费者为准，不能把当前 ScenarioViewConfig 的白名单当成目标能力上限，也不能把 DataSet.toJson 的整份结果回存 pagedata。

| 原生层次 | 持久化归属与装配规则 | 当前状态 / 后续验收 |
| --- | --- | --- |
| 空间身份、名称、输入参数声明 | 数据库空间记录是真源；pagedata.scenarioId 只作身份校验。调用参数值绑定当前实例 | 单目标formid、正式Name→dataSetName、名称变更重开及独立身份已验。参数声明保留Base_DataSet.inputParams，现有designParameters DataView编辑/保存/回读，运行值走queryContext；原生没有额外声明字段，不重复造结构 |
| DataTable 身份与资源映射 | 数据库模型是真源；pagedata 使用稳定 tableName 和 modelBinding 引用，补前端业务分类 | businessCategory文件闭环已验。resourceType按正式Type原标签、resourceId按正式MetaName来源名装配，六类真实来源核验通过；逻辑视图和数据库视图区分保留，DbId/provider/目录ID继续归正式owner。两处page夹具改回真实源类型；file只有元数据表示，后端查询未证且当前GetData无分支 |
| columns 正式字段 | 数据库字段定义；按正式输出名和字段 ID 还原 | 目前仅还原 name/type/label/isPrimaryKey；空值、默认值、自增等属性须核真实来源后补映射，不在文件重定义同一正式字段 |
| columns 前端校验、计算配置 | 无数据库同义合同的前端配置由 pagedata 补足，并引用已有字段身份；不扩大数据权限 | 七项校验及本地computeExpression的保存/新工作区重开/原生消费已验。正式query-save已在整批编辑应用前和实际保存前消费列规则：新增完整输入、更新真实delta、删除跳过，失败保留草稿。计算列不覆盖正式字段、不进入正式查询/提交，读取当前可见输入且只读。真实空间临时配置恢复已验，未在线保存公式；校验不是新增授权 |
| 每个模型的多个 DataView | pagedata.tables[tableName].views[viewId] 按原生 ViewMetadata 保存；数据库不新增 Base_DataView 表 | 真实 owner/装配器组合验证已通过：多模型同名视图、编辑、保存及新工作区重开。单目标维护会话已接通；线上已读回 7 个模型各自的 default。更丰富配置的持久重开证据来自传输边界夹具，不冒充线上多视图保存 |
| 稳定模型关系 resourceRelations | 数据库关系保留完整过滤表达式；装配后仍属于 DataSet | 已有适配与回归；不得在 pagedata 再保存关系真源副本 |
| 前端关系 | pagedata 负责显式前端配置，模型关系独立 | query/field 均消费通用值绑定；字段实际值或选中主键数组→查询过滤/独立选项→显式子值策略，指针只构成值。跨视图、多输入、复合选中值字符串、权限和异步取消、保存重开已验。旧dependencyType/rowMode拒绝；已核两个远端空间均无旧级联。元数据模型选择到字段选项本轮已接仓内配置并真实只读验证，设计器UI整体仍未恢复 |
| schemaVersion、saveChanges 等空间配置 | 前端序列化格式和提交策略由 pagedata 表达，依原生类型校验；运行期身份由宿主提供 | schemaVersion、version、saveChanges 已验文件保存/重开/原生消费；版本标记保留 3，缺省为原生 2，业务 version 与文件修订独立。SPARK 场景仅支持 perView，事务配置提前拒绝，不伪造事务保证；共享场景不绑定 pageId |
| DataTable.api / crudConfig | 表级操作端点映射与运行策略，由 pagedata 保存前端定义，多 DataView 共享；执行层承接协议适配与正式权限/回执 | list查询及create/update/delete的SPARK兼容端点已接通，timeout同时用于各页查询和保存；捕获配置/在途隔离/重开恢复及原权限保存链已验。其余操作、函数持久化、跨端点恢复仍是缺口，不能将部分配置可执行宣称为完整原生能力。详见table-query/result.md、table-submit/result.md与research-data-space-native-contract.md |
| layout | pagedata 保存原生 layout.tablePositions，按稳定 tableName 引用 | 原生位置配置已验持久重开、实例隔离及清除。旧图节点可经会话命令按正式模型ID导入tableName位置，已验冲突、作用域失效及真实7节点只读映射；旧边路径和扩展仍保留原图文件，不双写、不宣称整图迁移 |
| 静态配置数据与运行数据 | 原生 static-data 的定义数据须有明确资源归属；数据库查询 rows 不写文件 | 当前 ScenarioViewConfig 只支持正式模型绑定；静态表是额外待核项。当前行、选择、编辑缓冲、权限凭据和聚合结果永不写入 pagedata |

依据：`packages/spark-data/src/types.ts`、`packages/spark-project-model/src/scenario/scenario-view-config.ts`、`src/lowcode/data-space/lowcode-data-space-assembler.ts`、`src/lowcode/data-space/lowcode-data-space-layout.ts`。以上未实现项是完成清单，不代表本轮一次扩改所有类型和保存路径。

整体语义研读补充：`notes/research-data-space-native-contract.md` 对四层定义53项属性逐项核源，另列投影、树、API等子合同；结果在 `metadata-dataset/semantic-contract.json`。只读内存核验确认 named autoLoad 不被默认启动入口消费、treeMode 单独改变不改变正式封包；字段投影请求未带 OutputFieldMode，而本地 Java 缺省 MODEL，存在返回范围合同差距。模型关系级联增删改标志也不能仅因可序列化而算执行完成。下一份实施修订先对齐查询/返回语义，暂不新增代码；完整目标不缩减。

下一轮映射的已核事实：只读后端 `BaseDataModelField.java` 及本轮正式字段合同，当前模型字段不存在 nullable/defaultValue/autoIncrement 或前端 required/pattern/computeExpression 配置；不能凭字段相似名补默认值。底层资源目录另有 nullable/defaultValue，但它不是任意正式输出字段的一对一替代。资源类型已有唯一 wire codec `data-space-resource-type-wire.ts`；后端 JSON/文件资源仍走正式查询，不能为了匹配 native 类型把它们归为内联 static-data。此轮会话接入不顺手修改这些映射。

2026-10-08补核：当前GetData分发含数据库表/数据库视图、字典、接口、JSON、逻辑视图，未见文件分支；上段“文件资源仍走正式查询”不能作为文件来源已支持的证据，文件来源合同仍待确认。原生列的属性名是allowDBNull，其现有消费者仅必填校验（显式required优先）；defaultValue/autoIncrement在限定spark-data/正式新增路径中未见运行消费者。不能将“有类型字段”“可持久化”“有执行行为”混为一谈。只读来源证据分别在 `table-semantics-impact.md`、`column-runtime-ownership.md`（同任务sdd目录）。

## 已验闭环：两类来源恢复真实 DataView

在继续扩展元数据空间前，先验已有文件 owner 与正式模型装配器能否真正组合；当前 view-design 测试的 assemble 是 mock，不能证明这个组合。

- 精确新增 `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-persistence.test.ts`，仅补跨 owner 集成验证，不改 UI、Java、查询权限或增加公共 API。
- 使用真实 ProjectWorkspace、ScenarioViewFile、LowcodeDataSpaceViewDesign、LowcodeDataSpaceAssembler、DataSpaceRuntimeApi。仅文件存储与正式模型传输边界使用夹具；不得 mock assemble 或 DataSet。
- 两个正式模型均配置同名命名视图，验证身份按所属模型隔离；覆盖原生视图配置字段、完整表达式、独立查询上下文及 default。
- 经现有 stage/save 保存后释放工作区，以新工作区重读，再装配原生 DataSet/DataTable/DataView。字段来自正式模型，文件仅含绑定和视图配置；正式字段变更重开可见，文件无列副本；关系与显式查询级联保持独立。
- 验证目标文件缺失与损坏分别报错，错误绑定拒绝装配；不得把缺失或错误转换为空 DataView 成功。
- 先执行该测试的最小验证，再执行精确 lint 和根 typecheck；只有发现真实生产缺陷时才在明确局部范围修正。

此组合验证本身不等于目标 DataView 定义维护入口；下述会话已复用同一 ScenarioViewFile 草稿真源、版本和保存 owner 接通该入口。文件内容不注入正式数据库查询行、不伪造 modelBinding、不借 static rows 绕过数据权限。读、改、保存、重开和目标运行装配使用同一份文件定义。

## 已验实施项：单目标定义维护会话

裁决：不把文件视图定义硬塞成第五个后端元模型。单目标设计会话组合两种原生结果：`metadataDataSet` 保持已验证的四表正式元数据与查询权限；`definitionDataSet` 从目标 ScenarioViewFile 和正式模型装配，视图仍属于原生 DataTable.views。文件是唯一前端配置草稿，definitionDataSet 只是当前文件修订的运行投影；不能把投影中的可变运行状态反向当保存真源。这个选择不更改 spark-data 查询身份或后端权限合同。

精确范围：

1. `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts`：复用现有 ViewDesign 增单目标会话及生命周期；现有 open/create/stage/save 合同保留。会话仅有一个 targetId，统一加载元数据、文件和定义 DataSet；提供目标内 stage/create/save/refresh/dispose 操作，视图修改仍委托当前 owner。方法输入不允许切换 targetId。文件变更、撤销或重载使旧投影失效并销毁；refresh 必须核 owner、文本/修订、scope 和会话存活，迟到候选销毁。缺失文件允许返回 metadata + 缺失定义状态，其他失败清理并抛错；缺失状态可沿显式 create 建立第一份文件。
2. `src/lowcode/data-space/lowcode-data-space-design.ts`：明确导出 `openLowcodeDataSpaceDesignSession(targetId)` 作为当前无 UI 消费入口。使用已有应用 workspace 与捕获的请求 scope，接入已验 loadLowcodeDataSpaceMetadata。已有 createReader/page capability 不扩张，禁止循环引用、另造 workspace 缓存或改变目标业务身份。
3. `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-design-session.test.ts`：真实 ViewDesign/ProjectWorkspace/Assembler 组合验证，传输与模型边界可夹具。覆盖单输入、多模型/多视图归属、stage→save→新工作区重开、同名视图隔离、显式新建缺失文件、损坏/错绑定不伪装缺失、scope/owner/修订变化及dispose后的迟到结果、外部草稿变更导致旧投影失效和资源释放。

验证顺序：当前根 typecheck 基线；首改后立即跑该会话套件；通过后精确 lint、已有 view-design 与 persistence 套件及根 typecheck。主控独立核差分和实测同一个已授权目标ID的会话入口。线上只读，消费上一轮已保存的 pagedata，不再重复上传。

验收边界：此项完成后，目标 DataView 定义有统一无 UI 维护入口，但不等于旧页面已改接，也不消除上表中的列配置、空间配置和多父字段级联缺项。数据库变更与文件变更继续分别保存与确认；不引入跨源原子提交承诺。

本轮验收修正（仍限上述三文件）：独立审查确认 scope 变化时仅抛错不足以释放已接受的 DataSet；在检测到 scope/owner 失效时销毁旧投影，并在 scope 失效时释放元数据。补充候选实际产生后才释放 gate 的确定性测试，断言已接受/迟到 DataSet 均销毁。主控同时要求会话暴露已有文件 owner 的 `verifyViews/previewRemoteViews/adoptViews`，使未知保存和冲突能在同一目标会话内恢复，不重放未知写入；直接改原生投影必须在 stage/save 前报明确错误，不能被当成已保存配置后静默丢弃。新方法仍调用现有 verify/previewRemote/adopt，不增加存储通道或修改 Java。

验收结果：同一低阶执行者完成上述修正，独立低阶审查的规格/质量复核通过。三套聚焦测试 20 项通过；最后扩大快照护栏后会话套件 11/11 及精确 lint 通过，主控最终根 typecheck 通过。主控真实单 ID 入口读取返回 1 空间 / 7 模型 / 119 字段及 7 个目标原生 DataTable，各有 default DataView；释放会话后两份 DataSet 均已销毁。该轮线上写入为 0，未查询目标业务数据。证据见 `notes/evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/session/result.md`。下一实施点应从上表未覆盖的原生配置归属选取，不重做本轮已验链路，且继续暂停界面。

## 已验实施项：计算列的查询消费前提

依据 `.superpowers/sdd/plan-data-space-metadata-dataset/computed-binding-audit.md` 与原生计算消费者，先完成一个运行闭环，再开放文件配置。此项属于完整 columns.computeExpression 持久化的必要前提，不改 Java 或界面。

精确范围：`packages/spark-data/src/strategies/computed-column-delegate.ts`、`packages/spark-data/src/data-view.ts`、`packages/spark-data/src/resource-relation/resource-relation-definition.ts`、新增 `packages/spark-data/src/tests/data-view/computed-query.test.ts`。原生未绑定的本地计算、ctx、聚合与框架 `_pk` 保持合同；正式模型绑定视图中的配置计算使用独立输入副本，字段读取消费当前查询字段权限。隐藏/脱敏/没有投影的源字段不能参与本地计算；访问失败导致本次计算结果不可读，不能产出部分聚合结果或借后续计算泄露。模型关系匹配和子行聚合也须走相同读取边界。关系 matcher 已收集实际引用字段，改为只读取这些字段，避免枚举无关隐藏字段及当前计算列；保留过滤表达式逻辑。计算结果只读且维持现有提交剥离，不把未知字段默认可见当后端授权。此处限制针对查询数据输入，同 realm 的 JS 执行器不是不可信代码安全沙箱。

计算配置与框架注册分开管理，删除或替换表达式不能残留旧函数，`_pk` 不受影响；正式视图有投影时仍保留本地计算列。求值不得修改正式源字段及子行；新查询、失效权限和编辑缓冲重算不能沿用上一查询的计算可见性。绑定视图的无效表达式须明确失败；未绑定原生行为保持现有测试合同。

验证：先根 typecheck 基线；低阶单 writer 完整读取精确文件与调用方后，先新增失败用例并运行，再修改运行路径。最小套件覆盖可见/隐藏/脱敏字段、链式计算、表达式写入、子表聚合和关系字段权限、投影、无主键查询、配置替换及 `_pk`。通过后运行原生 computed-columns/cascade-computed-tree 和已有 query-owner/字段权限测试、精确 lint、根 typecheck，主控独立审查。无线上写入。

验收：低阶 writer 和独立 reviewer 经一轮正式审查修正后通过。新增聚焦 21/21，原生计算/树/查询 owner 回归 138/138；主控独立权限/别名/关系/CRUD 回归 87/87，精确 lint、根 typecheck、AI codegen 通过。真实单目标会话中，在已查询 Base_DataSet 上临时建立本地计算列，消费实际 ReportID 可见权限，确认计算正确、只读、提交剥离；清除后恢复原查询行，原文件未变、额外查询及线上写入均为 0，所有 DataSet 已释放。证据 `metadata-dataset/computed-runtime/result.md`；不等于计算列持久化已完成。

计算列持久化的后继九文件闭环已按下节完成；运行前提的四文件证据单独保留，不将两轮差分混合归因。

## 已验实施项：原生 DataSet 顶层文件配置

沿完整性矩阵与持续授权补齐文件所属的空间级配置。当前 `ScenarioViewConfig` 顶层白名单只有 scenarioId/tables/viewCascades，装配器不转交原生 schemaVersion/version/saveChanges/layout；真实 DataSet 已有对应序列化与运行消费者。此轮只补该入口，不改 Java、UI、数据库定义或旧图文件。

精确四文件：
1. `packages/spark-project-model/src/scenario/scenario-view-config.ts`：允许并校验 schemaVersion（可省略，显式值为正安全整数，按原生合同保留包含 3 的标记）、version（可省略的非负安全整数）、layout.tablePositions（已声明 tableName → 有限数值 x/y）、saveChanges（当前场景可用的 perView 策略）。继续拒绝文件自定 dataSetName、pageId、resourceRelations 和运行数据。version 不与文件 revision、历史文件版本或数据库乐观锁混淆。
2. `src/lowcode/data-space/lowcode-data-space-assembler.ts`：明确转交这四项已校验原生配置，不扩散整个 JSON；数据空间身份及 DB 模型装配不变。保持缺省项缺省，原生 schemaVersion 缺省为 2。DataSet 对 layout/saveChanges 直接保留引用，因此装配时独立克隆这两个对象，保证不可变文件与可变运行实例、两个实例彼此隔离。
3. `packages/spark-project-model/tests/scenario/scenario-view-file.test.ts`：合法原生形状、无效版本/坐标/未知表/额外键拒绝，非法 setText 不改变文本/历史。
4. `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-persistence.test.ts`：真实 owner 保存→新 workspace 重开→原生装配/序列化，验证 version 与文件修订独立、布局通过既有 stageView 编辑仍保留、清除配置后无残留；从恢复后的 DataSet.saveChanges() 触发既有 SPARK 保存 owner，不能仅断言字段赋值。

长期边界：DataSet.assertScenarioSaveTargets 已对 scenarioId 明确拒绝 transaction，故场景配置在进入原草稿前即拒绝 transaction 模式或 transaction endpoint；不制造 REST 事务通道，不宣称新增事务能力。共享场景不持久化 pageId。新原生布局存在于 pagedata；本轮不读取/双写/覆盖 `SysForm/<id>.json` 的 graphVersion/nodes/edges，旧布局迁移及冲突核对仍是后续独立项。数据空间名称/输入声明和表资源语义的真实来源映射仍待核合同，不改作文件真源。

验证：复用上一轮结束后源码未变的最终根类型基线（computed-persistence/root-final-typecheck.log）；开工先确认四文件前像与工作树，最小红测试→最小实现→绿，再完成真实保存链用例。四文件精确 lint，聚焦两套及已有原生 metadata-schema/scenario-model-identity/commit-mode 受影响回归；最终根类型与代码门禁集中一次。独立只读审查最终差分；无线上写入，不为相同 owner 的纯配置传递重复登录和大范围查询。此次线上意义由前轮真实双来源入口证据支撑，不能把新增配置的夹具持久化说成线上保存。

验收：四文件已冻结，低阶单 writer 两套聚焦 82/82，主控原生元数据/场景保存身份/CRUD/单目标维护会话 105/105 通过；独立源码审查通过。主控类型检查发现新增测试两处索引签名点访问，原 writer 改为括号访问，最小用例及最终根类型通过；四文件精确 lint、AI codegen 通过。最终前像/源码哈希和差分已核；证据 `metadata-dataset/dataset-config/result.md`。保存重开和实际 DataSet.saveChanges 由真实 owner 配合传输边界夹具验证，没有线上配置保存。schemaVersion 不是格式迁移实现，version 不是新增数据库并发锁。

下一语义依据：`.superpowers/sdd/plan-data-space-metadata-dataset/input-cascade-audit.md` 已定位 `editingFieldChanged`/编辑行 overlay 与选项 DataView owner。现有 viewCascades 只消费查询行而非编辑字段，缺少目标字段赋值、值更新策略与选项同代刷新；不得把多父视图过滤当作用户要求的多父字段级联完成。后续需在原生数据空间中显式表达这些配置，复用现有编辑/查询权限及生命周期，不先改页面。

## 已验实施项：本地计算列文件持久化与正式模型装配

延续用户持续实施授权，运行前提已验收，本轮落实同一个计算列从文件定义到查询消费的闭环。`tables[tableName].columns` 中不带表达式的条目继续是正式字段的前端校验补充；带 `computeExpression` 的条目为本地计算列，必须显式 name/type，允许 label 和既有七项校验规则，不带 DB 字段身份、主键或权限属性。名称不能覆盖正式输出或框架控制字段；模型后续出现同名正式输出时重装配拒绝，不静默覆盖。表达式语法由已验原生编译器预检，不复制一套 JS 编译规则。

精确范围：

1. `packages/spark-project-model/src/scenario/scenario-view-config.ts`：原生 columns 支持本地表达式条目，校验结构、非空表达式及类型，保留正式字段补充配置限制。
2. `src/lowcode/data-space/lowcode-data-space-assembler.ts`：正式输出继续从数据库恢复，追加独立本地列，拒绝重名；视图的远端查询字段引用不得指向本地计算列；真实装配承担公式编译预检。
3. `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts`：已有 stageView 可保留本地列，仍在修改草稿前拒绝正式规则失效或计算列冲突；本地 label/value/aggregates 引用按真实消费者允许计算列，远端排序/过滤/树身份/投影只用正式字段。继续复用既有 save/stageDefinition owner，不另加保存通道。
4. `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-options.ts`：默认远端查询排除 computeExpression；显式请求本地字段、排序或投影明确失败，不静默丢弃需求。
5. `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts`：绑定正式模型时拒绝本地表达式覆盖正式输出；保留规范输出到 wire Name 映射和原保存 owner。查询过滤的本地列引用在 I/O 前拒绝。
6. `packages/spark-project-model/tests/scenario/scenario-view-file.test.ts`：形状、控制字段、空/非法配置、编辑历史原子性。
7. `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-persistence.test.ts`：真实 owner 保存、新工作区重开、装配、正式查询、本地计算与实际保存 payload 剥离；多模型同名本地列隔离、公式清除、数据库变化及同名冲突。
8. `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-design-session.test.ts`：stageDefinition 语法/冲突失败不改旧草稿，stageView 保留与引用校验，保存重开。
9. `packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-model-alias.test.ts`：原生绑定冲突、无/有投影的正式 wire 字段和显式本地字段请求拒绝；不伪造 fieldId。

验证：已启动根 typecheck 基线；低阶唯一 writer 先保留九文件前像，先最小红测试，再实现并立即复验，之后四个改动测试及原生 computed-query 回归、精确 lint、typecheck 和 AI codegen。使用真实 Workspace/ScenarioViewFile/Assembler/Runtime，只有传输边界夹具。主控审查真实差分、另跑受影响回归，线上只读验证临时本地配置及恢复；本轮不向远端保存任意计算公式，不修改 UI 或 Java。新增字段定义是原生 DataColumn 的已存在能力，不构造后端字段或数据权限。

已核 brief：`.superpowers/sdd/plan-data-space-metadata-dataset/computed-persistence-brief.md`。超出九文件须先回报，不回退已验运行前提，也不动混合工作树其他改动。

验收：低阶单 writer 完成，独立审查发现原生视图投影可遮住同名本地列，修正为绑定时检查完整 DataTable.columns；最小红绿及独立探针通过。最终聚焦 125/125、主控受影响回归 215/215、九文件 lint、根 typecheck、AI codegen 通过。真实 Workspace/ScenarioViewFile/Assembler/Runtime 加传输边界夹具证明保存→新工作区重开→正式查询→本地计算→实际提交剥离。线上单目标临时 stageDefinition 恢复原生计算列，正式字段不变，同名候选失败不改草稿，随后精确恢复原文件并销毁所有 DataSet；线上写入为 0。证据 `metadata-dataset/computed-persistence/result.md`，独立最终审查 `.superpowers/sdd/plan-data-space-metadata-dataset/computed-persistence-review-final.md`。未宣称线上公式保存或完整 DataSet 全部交付。

后续仍按上方完整性矩阵推进。只读核源已留 `.superpowers/sdd/plan-data-space-metadata-dataset/space-source-audit.md`：空间名称/声明参数有既有数据库读取 owner，但原生 DataSet 没有参数声明属性；模型 sourceId 并不等于原生 resourceId，businessMain 也未证明等价于 businessCategory。不得凭相似字段名补映射或编造原生字段。下一闭环须从这些实际合同中确定精确范围，再派单一 writer；UI/Java 保持当前暂停方向。

## 已验实施项：原生字段前端校验配置持久化

已读合同：`DataColumn` 的 required/minLength/maxLength/min/max/pattern/patternMessage 由现有 DataValidator 与 extractColumnRules 消费；当前 ScenarioViewConfig 禁止整个 columns，装配器仅还原数据库字段，导致这些配置无法保存。用原生 `tables[tableName].columns` 数组表达局部前端配置：每项仅含 `name`（正式输出字段名）和上述校验属性；按模型绑定和规范输出名解析，已有数据库 type/label/isPrimaryKey 不复制或覆盖。allowDBNull/defaultValue/autoIncrement 尚需核来源与实际创建/写入消费者，不因本轮暂不开放就认定数据库已有其完整合同。未知/重复字段拒绝装配，失效引用不静默丢弃。去除一项或属性即去除对应前端约束。

计算表达式仍是完整持久化目标的一部分。本字段校验实施时发现的查询原值读取与编译降级问题，已由上节运行前提闭环修正；不能据此直接视为文件配置已支持 computeExpression。本字段校验项只打通七项原生规则，不修改 Java。

精确改动范围：

1. `packages/spark-project-model/src/scenario/scenario-view-config.ts`：允许上述原生 columns 局部配置；拒绝数据库属性、计算表达式和运行/权限字段。校验数组、唯一精确 name、布尔值、非负安全整数长度、有限数值范围、上下界和有效正则，保留 false/0/空字符串；字段引用交给正式装配器。
2. `src/lowcode/data-space/lowcode-data-space-assembler.ts`：把局部校验配置补入唯一匹配的正式输出列，原字段类型、名称、标签和主键保持数据库定义；配置缺省时维持既有行为；未知/重复/已不输出的字段明确失败。
3. `src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts`：在单目标会话增加 `stageDefinition({expectedText,text})`，复用同一文件编辑/保存 owner。替换完整配置前用独立候选文件及真实 assembler 验证，候选 DataSet 无论成功失败均释放；应用 scope、会话代次、原文件身份/修订/文本变化则拒绝应用。校验失败保留原草稿/历史/已接受投影；成功写回原文件并更新原生投影。该入口以后供空间/字段配置统一消费，不为每个属性造一套保存 API。已有 stageView/saveViews 保留。
4. `packages/spark-project-model/tests/scenario/scenario-view-file.test.ts`：更新仅针对 columns 整体禁用的旧预期，保留正式定义拒绝；验证局部属性、非法配置与编辑历史原子性。
5. `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-persistence.test.ts`：真实 owner 保存、新工作区重开、正式装配与下游原生校验规则消费；多模型同名字段隔离，清除前端配置后恢复，数据库字段变更仍可见、失效引用明确失败。禁止 mock assembler。
6. `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-design-session.test.ts`：单目标 stageDefinition 成功/保存/重开，失败不污染草稿，异步候选期间文本/owner/scope/dispose 变化清理且拒绝覆盖。

验证：基线根 typecheck；首次实改立即运行对应最小套件；通过后三个修改套件与已有 view-design 套件集中回归、精确六文件 lint、最终根 typecheck。使用真实 owner/assembler 和边界夹具，不向线上测试空间添加任意业务校验规则；本轮无线上写入。低阶单 writer 实施，独立规格/质量审查及主控验收。沿持续授权执行，保留所有原文件字节和范围 diff，不触碰其他 dirty、界面或 Java。

独立复审修正（仍限六文件）：既有 stageView 也必须在写入草稿前核所保留 columns 的正式输出引用，不能等 refresh 才发现失效；输入校验失败保留原文本和已接受投影。装配器所有已核调用方均传 ScenarioViewConfig，将其输入收束为这个现有不可变类并做运行时实例检查，移除“结构接口先 stringify 再校验”的重复入口；避免 undefined/非 JSON 属性被序列化静默清洗。此为现有真源类的边界收束，不新造配置 DTO。补真实 owner 的失效字段编辑与运行时伪造配置拒绝测试；受影响运行装配套件纳入回归。

本项验收：最终四套 101/101、另三套受影响运行装配回归 43/43、精确六文件 lint、根 typecheck、AI codegen 门禁通过；独立审查两项 P2 修复后定向复审通过。真实单 ID 会话使用数据库输出 `shif.val` 临时装配 required 规则，原生消费者生效且类型/标签/主键保持正式定义；随后还原原始文本并销毁各代 DataSet，线上写入 0。数值边界、长度、正则、清除规则和新工作区重开通过真实 owner 加传输边界夹具验证。候选验证失败不改旧草稿；setText 成功后的刷新若失败，保留新草稿与失效投影，不谎称回滚。证据在 `metadata-dataset/columns/result.md`。原生配置清单仍有未实现项，计划保持 implementing。

### 已授权测试空间的实际文件闭环

线上只读 `online-persistence-result.json` 已确认测试目标 `97DCB03F75AADEAE6B102B062DB71CEA` 缺少 pagedata。沿用户“搭起来”及当前两类持久源方向，在此测试目标执行一次明确创建：从正式 readModels 获取现有绑定，用正式模型 Name 作为稳定表名，每个模型建立原生必需的 `views.default: {}`，沿当前装配器默认规则解释，不杜撰额外业务视图、参数或级联。先完整校验并装配候选，再由 ProjectWorkspace.createScenarioViews/saveScenarioViews 建立文件并逐字节回读；保存前如已出现远端文件，停止创建，不覆盖。记录文件原状态为缺失、候选 SHA256、保存确认及新工作区重开结果；不修改任何数据库记录、导航、UI、Java 或发布指针。若正式模型自身校验失败，保留错误事实，不修改源记录来凑通过。

执行结果：一次上传后，Node 验收传输的 Buffer/ArrayBuffer 差异使原 save 未能确认；保留该失败，不重放上传。仅在证据脚本修正二进制传输表示，独立只读对照提交 SHA256 完成文本和原字节核验、新工作区重开与正式装配，见 `online-persistence-verification-result.json`。七个模型中三个没有正式输出字段，本轮未改源字段，也未声称这些业务查询已验通。

## 技术方案

1. 保存两份生产文件当前字节，根类型基线先通过。
2. 配置表达范围：仅在已有视图中增加 GetInputParam(formid) 过滤。旧脚本设置过滤时仍走原已有覆盖路径，本轮不修改旧脚本。
3. 新入口校验目标 ID，捕获当前应用请求 scope。读取本仓同一场景视图配置，复用 loadScenarioDataSet 得到正式 DataSet，再将 queryContext.formid 绑定给每个视图。
4. 按既有 `loadFromServer({allPages:true})` 完整读四个 default 视图；检查 CrudResult.success 和作用域。目标空间记录必须唯一且属于目标；子记录须属于相同 dataSetId。错误不转换成空成功。分页及权限都交给原 DataView/查询 owner，不手工拼接 rows。
5. 调用方得到原生 DataSet，可以使用其 DataTable.columns、多个命名 views、resourceRelations、viewCascades、原查询数据权限与 DataSet.saveChanges。本轮不执行保存，不新造 DTO 树、缓存或保存通道。

## 兼容性

不动页面、导航、旧工具入口，不改变公共 spark-data 合同，不写后端元数据，不依赖目标空间已有 pagedata.json。新入口使用元空间的共享配置源；不把目标 ID 填到 DataSet.scenarioId。既有 loadScenarioDataSet/loadLowcodeRuntimeScenario 调用合同保持不变。

## 验证计划

- 根 `pnpm run typecheck` 基线及最终各一次。
- 首次实改后先运行配置/入口针对性验证，不并行扩改。
- 精确 lint 新入口与测试；定向 vitest 新套件、原 lowcode-data-space-runtime、旧设计页数据合同，完成后不无因重复。
- 线上只读：通过同一入口输入已授权测试空间 ID，核四个真实 DataTable、正式 columns、所有视图 formid、正式模型关系与独立 viewCascades，完整读取目标记录/模型/字段/关系，检查跨目标泄漏。保留计数、身份和结构，不保存凭据及业务明文。

## 风险项

### 真实查询暴露的输入绑定缺口及本轮必要修正

线上执行已复现 `DATA_SPACE_METADATA_TARGET`。后端只读源码 `GetInputParam.java#getValue` 在未设置 map 时返回参数名；`TableParam.inputParams` 用于接口来源，`ViewDataServiceImpl` 绑定输入仅在逻辑视图路径执行。物理数据库元模型不能直接使用尚未绑定的 GetInputParam。这不是目标数据缺失，也不能通过改成无过滤全表查询掩盖。

按用户持续授权及“遇到问题按长期利益选择”，在共享 DataView 查询边界一次解决，保持页面配置参数化：

- 精确增加生产范围 `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-options.ts`。captureDataSpaceViewQuery 取 `params.context ?? view.queryContext` 后，对查询过滤树的 GetInputParam 按 ParamName 绑定为 GetConstValue；递归 AND/OR，保持原定义不变。缺参/undefined/非JSON值明确拒绝；0/false/空字符串/null 是合法显式值。其他值函数保持原义。inputParams 继续传给后端接口来源。
- 测试范围增加 `packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-view-input.test.ts`，并更新本轮元数据入口套件的 wire 断言。验证实际 DataView→原 owner→请求 payload，不能只测字符串替换。
- 最小红绿验证该测试，再复验元数据入口和既有 runtime 套件、精确 lint 与受影响包类型。此修正完成后立即复跑真实入口；与 DataView 元模型的持久化选择无依赖。

稳定线上复验后已越过参数过滤，进一步暴露正式模型 `items` 字段被请求自动附加 `AsName: items` 后遭后端拒绝。`BasicFunServiceImpl.mergeFields/captureResponseFieldAlias` 已核实：模型定义决定输出名，请求 AsName 属于额外返回别名，且在“与模型输出相同”判断前即校验保留名。新增最小修正范围为 `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts` 的 executeQuery 字段映射：已绑定正式模型的请求仅用正式源 Name，不重复声明其正式输出别名；未绑定模型的显式查询别名合同保持原样。测试在既有 `runtime/tests/data-space-model-alias.test.ts` 证明 items 正式字段和原有异名输出均不被丢失；同步 `runtime/data-space-runtime-api.test.ts` 的受影响 wire 断言。不得通过删掉 items 或降级为无字段请求绕过。

- GetInputParam 的实际远端执行需线上验证，不能只靠 mock 声称成功。
- DataView.loadFromServer 返回失败结果而非总抛错，入口必须检查 success。
- 原默认视图未使用 formid；必须只通过新入口执行参数化查询，旧脚本的实际显式过滤路径做回归验证。
- 原生 DataSet 的多 DataView 不等于元数据已包含目标视图配置记录；目标视图文件现有 owner 保留，后续按实际合同纳入，不伪造后端表。



