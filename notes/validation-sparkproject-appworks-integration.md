# AppWorks 集成可行性与回归验证账本

## 最新验证：节点位置导入通过局部验收，根回归有3项失败（2026-10-09）

三个生产路径及一个既有测试实现旧模型ID到原生tableName的位置映射；最终会话38项、类型/精确Lint/AI1027通过。真实旧图7节点位置本地装配成功，136次读、0写，草稿已还原、远端三文件未变。完整根211套件中210通过/1失败，2786项通过/3失败，456.26秒。三个旧页面用例单独复验及本轮源码前像隔离对照均超原5000ms；首次另有一次重开渲染断言失败。未改阈值/断言，未将对照失败等同于根门禁通过。当前源码哈希与冻结记录一致，完整验收仍未通过。

用户要求的DataView.value旧字符串兼容经当前源码及既有用例复核，保留valueField/selectionDelimiter、显式selection-string回写，普通字符串不猜测拆分。本轮没有重新改其接口。完整证据：[result.md](./evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/legacy-table-positions/result.md)。下一步先定位3个页面用例的时序，再按整体矩阵推进；无Java/UI改动或在线写入。

## 最新线上验收：多父输入与子字段字符串调整（2026-10-09）

实际元数据查询确认可写非主键字段，临时本地草稿经真实选项查询从含无效 token 的字符串保留2/1/0项；保持选择数组不变、改变第二父字段值，选项7/4并反向调整子值；等值不重查。取消编辑、独立数据库回读及两个文件未变均确认。110读、0线上写入、退出0；无生产源码或测试变更，未重复完整回归。证据：[result.md](./evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/live-field-value/result.md)。

此链路解决上一轮目标业务模型不适合作为可写字段载体的验收障碍；实际使用的是元数据空间，不修改权限或正式模型。临时配置未发布、测试子值未提交数据库，不能把运行验证和既有文件/接口夹具证据拼成一个已经发生的线上全流程。全目标继续。

## 最新线上验收：命名视图和值级联保存重开（2026-10-09）

授权测试目标临时增加同表两个命名视图及 query 值级联，经会话保存、独立字节核验、新 ProjectWorkspace 重开和正式查询，两次得到精确 1/2/1/0 条选择结果；原生值数组、旧竖线字符串和指针不触发重查均成立。178 次读取、2 次上传（候选及恢复）、业务 CRUD 0；恢复原文及元空间未变均已核验。当前远端不保留临时验收视图。

首个 shif 字段候选无正式主键，上传前停止；另核到 TestJSON0819 数据权限不足、copyTable 数据库不存在。未伪造键或改权限；可写子字段清理的线上证明仍缺。源码无修改，没有重复全仓回归。证据：[result.md](./evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/persisted-value-cascade/result.md)。上一目标轮为 progress，本轮新增真实持久化证据；全目标继续。

## 最新局部验收：元数据模型选择到字段选项（2026-10-09）

仓内pagedata新增2个原生命名视图及1条值级联，既有元数据行为测试覆盖单/多/空选择、指针等值、完整元数据视图和实例隔离。实际元数据入口消费最终配置，经58次只读请求验证4/11/7/0条字段及目标归属；写入0，两个远端文件未变。新视图没有发布到远端pagedata，也未恢复设计器UI。

类型、精确Lint、pages-config、diff-check通过；相关4套件99项通过，最终根211套件2773项全部通过389.73秒；两源文件哈希一致，无阈值或断言放宽。证据：[result.md](./evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/metadata-model-field-cascade/result.md)。整体目标仍在实施。

## 最新局部验收：级联定义完整返回与数据隔离（2026-10-09）

两生产+一既有测试修复纯数据被误作 API 代理、根数据属性及读取引用污染。真实 DataSetCrudTool 创建→完整读取→本地副本编辑不改实例→正式更新→ScenarioViewFile 本地保存重开通过；selection-string 和旧视图字符串编码保留。相关19套件221项，最终根211套件2772项全部通过（387.61秒，maxWorkers=1）；类型、精确Lint、AI1026、guide结构及限定diff-check通过。三文件及生成物最终哈希复核。全仓语义门禁仍有313项，前后相同；不宣称整体零回归。

证据：[result.md](./evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/class-model-result-data/result.md)。无Java、线上写入或业务设计页修改；下文DTO为空是历史失败，现已解决，线上旧配置迁移及完整集成仍待验收。

## 最新局部验收：ClassModel 级联更新参数（2026-10-09）

五生产+一既有测试（其中一新内部类）修复交叉/联合、Partial、只读必填的声明投影及纯内存声明解析。真实 DataSetCrudTool 的创建→按cascadeId更新→核对实例→ScenarioViewFile本地文件重开通过，字符串值格式及valueField/selectionDelimiter保持。类型、六路径Lint、AI1026、guide结构门禁、限定diff-check通过；最终根211套件2771项全部通过，384.52秒，maxWorkers=1，六最终哈希一致。首次maxWorkers=2为2770通过/1原5000ms超时；同用例单独4.16秒通过，未改阈值/断言，完整复验无并行编译。语义缺口总数2290、阻断类别313均未增加，但全仓语义门禁仍不通过。

证据：[result.md](./evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/class-model-alias-schema/result.md)。无Java/线上写入/业务设计页变更。DTO整对象返回、线上旧配置和整体集成仍未完成；下文参数丢失为历史失败记录，已由本项解决。

## 最新局部验收：ClassModel脚本参数引用（2026-10-09）

五路径（三生产、两既有测试）参数引用修复验收通过。类型、Lint、AI1025、guide结构门禁通过；相关18套件201项，最终根211套件2769项全部通过，196.68秒。首次根一个设计页5000ms超时、原阈值单独通过及独立全量通过均保留。真实脚本创建/读取字符串格式级联、ScenarioViewFile本地文件往返通过。`updateCascade`交叉类型投影丢失选择器、DTO整对象返回序列化及语义门禁债务仍未解决，整体不记完成。证据：[runtime-result.md](./evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/class-model-value-cascade/runtime-result.md)。

## 最新核查：字符串兼容复验与ClassModel真实执行（2026-10-09）

字符串兼容5套件149项通过（7.35秒），上一轮14路径哈希全部保持一致；本轮只刷新生成物并记录证据，没有修改运行源码。原生数组、普通字符串、显式选中值字符串的读写及保存后重新读取均在被测范围内。

ClassModel增量生成成功，guide结构门禁通过；真实脚本createCascade失败于参数schema的`$ref`未解析。全仓语义门禁也未通过（旧生成物167门禁缺口，刷新后313）。两项失败独立保留，不能把字符串运行测试通过扩大成配置执行通过或整体零回归。下一最小闭环须核实ClassModel schema引用传递后修订精确范围。证据：[class-model-value-cascade/result.md](./evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/class-model-value-cascade/result.md)。

## 最新局部验收：共用选项字段值级联（2026-10-09）

遵循“暂不恢复业务界面、先搭原生DataSet”及字符串持久化兼容指令，主控完成已有共用选项控件的数据绑定。按目标字段消费独立选项，字符串回填/写回保留valueField/selectionDelimiter；native类型、权限、树层级、配置失效、迟到响应、跨空间隔离和卸载有行为验证。14路径最终哈希一致，类型/Lint/AI/diff-check通过；最终根211套件2766项通过，186.87秒。首轮默认并发4失败及原阈值单独5项通过均保留，最终使用前一轮相同maxWorkers=2，未更改测试阈值或断言。

证据：[field-cascade-components/result.md](./evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/field-cascade-components/result.md)。仅此数据/组件闭环通过，无Java修改、线上写入、业务设计页恢复或代理。ClassModel/设计器及线上旧级联配置、完整AppWorks集成仍在实施；下文为历史记录，不能覆盖当前方向或冒充整体零回归。

## 当前实施验收：数据空间四文件样板（2026-10-07）

当前执行 [数据空间四文件样板计划](./plan-data-space-four-file-pilot.md)，状态 implementing；原生页 lifecycle 路线已 superseded 并撤回其增量。历史 D1a/D1c 是 Vue 页的限定验收，不能当作 rule.json/script.js/style.css/pagedata.json 的验收；下文历史“四文件”表述在本次纠偏中明确作废。

权限口径由用户明确：数据权限，没有角色概念。只消费后端结果中的表/行/字段权限，admin 仅为登录验收账号。不再把另找受限角色账号列为阻塞条件；允许、拒绝、隐藏、脱敏分别用真实 owner 管线下的权限响应验证。

- 四资产位于 `config/pages/data-platform/data-space-catalog/`。正式工具路由经 PageRuntime/SparkPageRenderer 运行；保存后四文件逐字节回读一致。共享场景原六模型与 default 视图保留。
- 真实列表、名称/ID 搜索、应用 AND 过滤、分页、标签、取消输入已通过。新增记录 `97DCB03F75AADEAE6B102B062DB71CEA`，整页重开后按同 ID 回读成功；保留记录不自动删除。当前浏览器没有 console error，未发现 rowkey DOM 属性泄露。
- 新增闭环冻结版本：typecheck、聚焦 3 项、根 192 文件/2262 项、数据空间 API 3 文件/150 项均通过；根 lint、ai-codegen（982 文件）、dirs、pages-config 通过；完整 build 退出 0（2 包构建/6 包缓存，前端构建通过，保留非阻断打包警告）。此处全量/构建先于现有行编辑，不冒充编辑后复跑。不同测试集合不简单相加为唯一用例数。
- 首轮根 lint 被 11 个证据源码快照触发；将快照改为文本存档后通过，15 项内容哈希保持不变。没有修改 lint 配置或生产文件来绕过检查。全工作树 diff-check 的 AppList.vue 历史行尾问题不属本样板改动；本轮数据空间改动的限定 diff-check 通过。
- 现有行编辑已通过：只编辑当前行 Name/description，按后端行/字段权限输入；最终 typecheck、精确 lint、聚焦 14/14 通过。主控两轮审查后独立复跑测试并真实部署，四文件字节回读一致。取消零写；编辑仅一次保存、一行 Changed，Added/Deleted 为 0；改名退出当前筛选显示成功，再按原 ID 查询、整页重开，名称 `四文件编辑验收-20261007` 与描述正确保留，应用/类型/创建人不变。没有角色/admin 授权分支。证据 `pilot-edit-result.md`、`pilot-edit-review-tests.log`、`pilot-edit-cancel.json`、`pilot-edit-saved.json`、`pilot-edited-reopened.json/png`。
- 当前行删除已实现并部署（2026-10-08）：d 权限、确认身份核对、原 owner 单行 Deleted 回执、未知结果锁、末页退页及陈旧回读错误已定向复审；样板 22 项，主控根回归 192 文件/2281 项、typecheck、精确 lint 通过。取消删除在线证明 0 保存请求、原行仍在及三个操作恢复可用。真实不可撤销删除仍待用户执行时确认，未执行实际删除、未宣称删除后重开回读通过。见 `pilot-delete-result.md`、`pilot-delete-review.md`、`pilot-delete-root-tests.log`、`pilot-delete-cancel.json`、`pilot-delete-confirm.png`。
- 参考页的真实删除回读、设计、复制 API、查询绑定与正式菜单切换尚未完成，完整页面及全部29项能力均不记为完成或零回归。[剩余操作核对](./evidence/sparkproject-appworks-integration/four-file-correction/pilot-remaining-operations.md)已落盘。
- 当前证据目录：[four-file-correction](./evidence/sparkproject-appworks-integration/four-file-correction/)，关键证据 `pilot-created-reopened.json`、`pilot-deploy-layout.json`、`pilot-final-ui.png` 和对应命令日志。

## 历史实施验收：D1c（2026-10-07）

C1/C2、D1a/b/c 当时已完成各自限定范围验收；后续原生 lifecycle 计划已废弃。下列历史结果不代表当前完整四文件迁移已通过。

- 最终根191文件/2256测试、D1c定向46测试通过；typecheck、限定lint、ai981/目录门禁、完整build通过。
- D1c首轮全量191/2246通过仍被生产浏览器拒收，用户主键ID与业务ROWID/输出rowid被混淆。修正后按两层权限消费并补单拼写h/m测试，最终生产页面逐行名称匹配响应，未解析按不同创建人计数，应用筛选和真实tab返回状态正确，0console error。
- 39个先前文件hash相同，API18/588、宿主12/80复用对应未变版本结果。本次未调用业务写接口、未改后端、未提交Git。
- 最终证据：[D1c目录](./evidence/sparkproject-appworks-integration/d1c/)、[执行账本](./evidence/sparkproject-appworks-integration/execution-ledger.md)。生产截图 `d1c/production-creators.png`；首轮失败截图与日志保留。

## 开工前基线：0b6c85d（2026-10-07，历史）

对应方案：[AppWorks 控制面完整集成计划](./plan-appworks-control-plane-integration.md)。以下为开工前工程基线；下文历史章节原样保留，不作为当前操作验收通过数。

- 目标 HEAD `0b6c85d9979205cf733da8b0ba663c63e89ec395`；参考固定提交不变。
- 本次开始/结束 tracked 工作树均干净，只新增或修改任务 notes。没有产品、测试或配置代码修改，没有业务数据写入。
- 原始输出和结果 JSON：[本次证据目录](./evidence/sparkproject-appworks-integration/baseline-0b6c85d/)。

| 检查 | 新结果 |
| --- | --- |
| typecheck、lint | 均退出 0 |
| 根测试 | 186 文件 / 2112 项通过 |
| 包级测试 | 113 文件 / 1691 项通过；7 包，和根集合有重叠 |
| 完整 pnpm run build | 包与前端构建退出 0；不同于历史的直接 Vite 构建 |
| verify:rules | 14 个入口完成、退出 0；含 class-model 的 4 文件/49 项测试及新增目录检查 |
| verify:page-design | 4 文件/53 项通过，离线 |
| verify:project-planning | 2 文件/11 项通过，离线 |
| verify:model-convergence | 6 文件/67 项通过，离线 |
| 服务路由对照 | 固定源 17 条 service 路由与当前后端账本的方法/规范路径全部唯一匹配；非在线执行验收 |
| 浏览器 | 正式企业选项登录成功、应用目录渲染；数据空间原地址继续明确报缺映射，截图已刷新 |

本次 AI 离线脚本的用例选择与历史不同，按当前脚本实际结果记录，不把数量减少解释为回归。build 有 Settings 与 CodeMirror 动静态导入、第三方注解、大 chunk 警告；verify:ai-model 有 DataViewFilter、ScenarioViewConfig 两个 fromJson 相关 warning，均已保留日志。当前结果是零测试失败，不是零警告或完整集成零回归。

### 新证据驱动的计划迭代

| 核验项 | 结论 / 修订 |
| --- | --- |
| PageRuntimePool | 只承接 config-page；系统页身份仍需独立解决。保留 12 实例、dirty 关闭、query 规范化、绑定失效等现有测试 |
| 场景与三文件注入 | 沿用 PageFileReader / loadScenario；PageContentLoader 仍为 ProjectWorkspace 内部能力，不恢复旧路由装配 |
| 系统页缓存 | 新增 App.vue 的 route.fullPath 缓存键影响面，与标签/path、注册/nodeId 一起规划 |
| 页面加载错误 | 原两文件 C1a 不足以证明失败可见；新增 PageLoadError，将首个可审核闭环明确为三文件 |
| 目录与测试迁移 | UI 规划 app/control；更新命令为当前路径，保留仍在使用的两处 auth-nav 测试 |
| 后端合同 | 17 条路径匹配，verify:lowcode-contracts 587 endpoints / 150 consumers 通过；仍不推断 payload/权限/副作用通过 |
| 真实入口 | 最新浏览器复现数据空间缺映射；历史 7 组重复路径和模型读取统计保持历史证据，不冒充本轮重新读取全量导航 |

29 项的当前可行性、必过操作与依赖在新计划逐行列出。未完成的真实权限、保存回读、维度提交、旧图往返、流程状态、报表运行等仍待验。原方案已 superseded；完整迁入零回归仍是实施阶段的完成条件。

---

## 以下为 9c225cad 历史取证

验证日期：2026-10-07。对应 [总体方案](./plan-sparkproject-appworks-integration.md)，状态仍为 draft。

本轮按用户要求先落盘、验证并修订方案。仅修改过程记录；没有实施产品功能、修改测试/配置、提交业务写入或变更权限。登录使用用户指定测试账号，凭据不进入本文或证据文件。

## 证据基线

- 参考提交：`842dec4f11b333df904b9a4e26b6566b0802bab8`。
- 目标 HEAD：`9c225cad78ddca2ac9e80fdb00782d90f3391590`，分支 `feat/agent-workflow-node-contract`；验证包含当时已有的并发工作树修改，不等同干净提交。
- 原始输出及脱敏清单：[证据目录](./evidence/sparkproject-appworks-integration/)。测试结果只覆盖运行时刻代码，不证明尚未实施的功能。

## 工程结果

| 检查 | 本轮结果 | 证据与边界 |
| --- | --- | --- |
| `pnpm run typecheck` | 退出码 0 | `typecheck.log` |
| `pnpm run lint` | 退出码 0 | `lint.log` |
| 根 Vitest | 180 文件 / 2079 项通过，退出码 0 | `root-tests.log` |
| 包级 Vitest | 113 文件 / 1690 项通过，退出码 0 | `package-tests.log`；7 个包有 test:run，不能与根测试简单相加为唯一用例数 |
| 8 项架构/API 门禁 | 全部退出码 0 | `gates.json` 及独立日志 |
| `pnpm run verify:page-design` | 7 文件 / 64 项通过，退出码 0 | `verify-page-design.log`、`ai-gates.json`；离线测试，不调用 LLM |
| `pnpm run verify:project-planning` | 5 文件 / 21 项通过，退出码 0 | `verify-project-planning.log`、`ai-gates.json`；不证明在线 AI 调用成功 |
| Vite 生产打包 | 退出码 0，存在加载警告 | `build.log`、`build-manifest.json`；直接 `vite build`，不等同完整 `pnpm build` |

8 项门禁：verify:arch、verify:deps、verify:pages-config、verify:ai-codegen、verify:project-blueprint-ssot、verify:wire-query-parity、verify:ajax-result-parity、verify:lowcode-contracts。

## 本轮已证实、必须修订的方案项

1. **仅改注册表不足以让所有系统页按需加载。** 浏览器在登录页启动时已请求 16 个注册页面模块；网络缓冲有截断，不能将事件数当完整请求总数。生产构建提示 Settings.vue 同时被页面注册表动态导入、被 `virtual:spark-components` 静态导入。组件扫描策略须另建闭环，不能把原两文件 C1 宣称为整体按需加载已完成。
2. **同路径不同节点是实际数据。** 测试租户“元数据管理”的授权导航共 51 个节点，其中 39 个有目标、32 个不同路径；7 组路径复用。现有注册表覆盖其中 5 个路径 / 6 个节点，其余 27 个路径 / 33 个节点未映射。注册不等于操作齐全。`live-navigation.json` 保留节点、目标及场景证据。
3. **场景不能统一强制补默认值。** 文件管理节点的场景为空；导航授权的两个节点共用路径及场景但 nodeId 不同。页面调用身份须保留真实节点，按操作声明应用级或场景级需求。
4. **接口分三类。** 正式模型查询/保存、前端内建 `spark.*` 能力、application service 的 resource/intent 分别有协议；原方案对第三类列举不足。`service-operations.json` 已保留实际调用清单。
5. **“全部能力”必须落实为操作清单。** 固定参考的 297 个源文件中有 116 个 Vue；AST 提取 54 个 owner 文件、59 个类、524 个非 private/# 方法入口。这不是 524 个用户功能，仍须与 UI 消费者、公共依赖和后台协议逐一对应。`reference-inventory.json` 有固定提交、文件哈希及方法位置。

## 已取得的真实环境证据

- 登录成功；测试租户企业显示领码科技，实际 tenant 标识为 NewApp。企业中文名不能代替登录合同所需 shortName。
- 应用目录 GetData 成功，真实响应为 `Result.data.Items`，80 行 / 总数 80。早期探测按名称筛选得到空候选只是筛选局限，浏览器实际成功打开“元数据管理”。
- `GetNavigationMenus` 成功，应用 ID `D99A1DCE9894698799101EFD70F8FC76`。已保存去除认证信息的节点投影，未保存 token、密码或请求认证头。
- 服务器管理页面渲染真实连接记录；页面明确只读，注册服务器禁用。该证据说明当前读取可用及治理缺口存在，不是迁入写入验收。
- 点击真实授权“数据空间管理”菜单，出现 `SYSTEM PAGE MAPPING ERROR`，pageId 与授权节点一致。截图：[系统页映射缺口](./evidence/sparkproject-appworks-integration/system-page-mapping-error.jpg)。这是已有缺口，不是本轮文档造成的回归。
- 使用上述导航的真实场景，按当前 `DataSpaceQueryTable` wire 合同只读查询：`Base_DataSet` 返回 Code 200、总数 68、首批 5 行；`_Base_DictType` 返回 Code 200、总数 4、4 行；均按当前目标应用过滤。`live-model-reads.json` 保存请求结构和统计，不保存业务行内容。这证明后端目录读取与当前协议能够衔接，不代表 UI、字段权限或写入已完成。
- 本轮尚无业务保存回读、受限身份、双目标应用隔离、图往返或报表运行证据。这些项不得记为通过。

探测过程更正：独立命令初次请求重复拼接 Bearer 前缀导致 401；对照 `LowcodePlatformApi.stripBearer` 修正后两个查询成功，前次错误保留在证据中，不归为产品鉴权缺陷。应用目录早期探测带有旧式 Type/PrimaryKeyFields 附加项，其成功不能作为当前纯模型 wire 的等价证明；后续两个查询采用当前最小封包，单独留证。

## 29 个范围项的可行性分级

下表逐项核对总体方案的范围，不将静态映射冒充完整验收。符号口径：**读取可行**＝已取得本项相关真实读取；**条件可行**＝已有当前承接点和来源合同，实施/运行待验；**关键链待验证**＝核心等价条件未证实，不能承诺完整迁入无需改变前提。所有项均尚未完成完整操作验收。

| 项目 | 当前证据 / 承接点 | 结论与下一必过关口 |
| --- | --- | --- |
| A1 应用 | 真实目录 80 行；当前 AppList | 读取可行；维护/关联/文档任务与目标应用隔离待验 |
| A2 蓝图 | 当前 blueprint API 和 DevSystem；参考原型/桌面/来源操作已索引 | 条件可行；补原型版本/桌面等逐按钮链，保持 ID/发布指针；来源提交随 D9 |
| A3 导航宿主 | 真实授权导航；7 组重复目标 | 关键链待验证；注册/菜单/标签/恢复同时保留 nodeId，不能按首个路径选择 |
| A4 企业 | 当前租户管理；来源企业初始化和模块授权方法 | 条件可行；接口参数、初始化副作用及实际权限回读待验 |
| A5 授权申请 | 来源申请/我的申请/审批 owner；真实导航有入口 | 条件可行；请求状态与实际授权分开回读，不能用申请成功替代获权 |
| D1 数据空间目录 | Base_DataSet 当前 wire 查询 200、68 总数；本地入口缺映射 | 读取可行；目录 CRUD 接真实原查询与应用归属，保存重开待验 |
| D2 正式模型设计 | 当前 design 读取；参考字段/关系/来源/布局 owner | 关键链待验证；prepare 与执行分开，级联保存和缺失布局确认链待验 |
| D3 数据空间授权 | 当前 permission/design 读取与 prepare；参考授权 owner | 条件可行；正式授权执行和受限用户结果待验 |
| D4 数据库目录 | DBMS 真实连接列表，只读且注册禁用 | 读取可行；连接测试/登记/维护须逐接口落地，不将禁用入口记完成 |
| D5 表/视图 | 当前 DBMS 读链；参考复制/设计/登记/同步合同 | 条件可行；区分记录维护与物理结构操作，专用测试资源和字段回读待验 |
| D6 字典 | _Base_DictType 当前 wire 查询 200、4 行 | 读取可行；子设计场景由入口真实提供，目录归属/字段投影/保存回读待验 |
| D7 编码 | 参考规则/父码/序列及 designer.code 两个服务意图 | 条件可行；测试码、初始化及正式分配副作用分开验收，不自动重放 |
| D8 逻辑视图 | 来源图与 ViewData 三个专用端点 | 关键链待验证；图格式往返、设计/预览响应及页面引擎消费待验 |
| D9 维度来源 | 三个来源 owner；公共 dimension runtime 共 2272 行尚未全读 | 关键链待验证；来源身份/投影版本/账本/提交完整链尚不能签署可行 |
| D10 数据工作流 | 来源图 owner；整图/单节点测试服务已追到真实端点 | 关键链待验证；级联设计、执行域、后端测试与原图无损待验 |
| O1 组织人员 | 来源查询/人员选择；当前树/表/对话框可承接 | 条件可行；原始分页、祖先上下文和选择身份待验，不扩成未经证实的 HR CRUD |
| G1 角色授权 | 角色分类/用户/授权三 owner | 条件可行；授权编辑与权限消费分层，需受限用户验证实际效果 |
| G2 导航/用户应用 | 两个授权节点共用同路径/同场景但不同 ID | 关键链待验证；必须以节点作为身份，不能只按 scenarioId 去重 |
| G3 脱敏 | 来源规则 owner；当前权限消费 | 条件可行；显示掩码、导出/剪贴板及保存原值边界待验 |
| I1 文件 | 当前 design 文件域；来源文件 owner；实际导航无场景 | 条件可行；应用级命名空间、二进制与下载/删除回列待验，不能补伪场景 |
| I2 JSON | 来源 JsonData 读取/保存合同；当前 JSON 展示组件 | 条件可行；元记录与树内容分开确认，旧树协议无损待验 |
| I3 Excel | 来源模板/布局/转换规则；服务端 import/export/convert 合同 | 关键链待验证；布局、文件、转换与结果回读链待验；不默认迁全部共享工作簿能力 |
| I4 外部接口 | 三个嵌套设计 owner；专用 Body/FormData 执行 | 条件可行；账号/headers/公参/输入输出字段与结果过滤完整合同待验 |
| I5 报表 | 73 个包内资产已定位；明确脚本顺序；版本激活及 ReportHost 生命周期 | 关键链待验证；目标宿主资源路径/授权/模板及数据源/未保存保护/输出待验 |
| W1 流程模型 | 来源模型/设计 owner；依赖正式模型、角色、组织 | 关键链待验证；旧图/表单配置/模板文件无损及后端确认待验 |
| W2 流程运行 | 来源5类运行服务端点及参与人动作；移动页面 | 关键链待验证；真实专用测试实例的提交/退回/已读/追加/撤销/详情待验 |
| S1 缓存 | 当前 CacheManager 注册，来源 owner | 条件可行；缓存动作只对明确验收对象测试，注册存在不等于操作已验 |
| S2 系统支持 | 来源监控/恢复/问题 owner；含撤销恢复 | 条件可行；只读监控与可逆测试记录恢复分别验收，不操作实际业务实例 |
| P1 共享组件 | 53 个来源文件直接消费参考 Vue runtime；已有当前组件体系 | 关键链待验证；权限、原 query context、生命周期和图/报表适配不可只改 import |

表中 4 项“读取可行”仅说明局部读取成功，其余结论是带条件的工程路线。完整范围不缩减；后续优先解除 A3/G2/P1/D2 的基础约束，再进入依赖它们的领域闭环。

## 方案迭代记录

| 新证据 | 方案修正 | 再验证要求 |
| --- | --- | --- |
| 登录首屏模块请求 + Settings 静态导入构建警告 | C1 拆为 C1a 注册表和 C1b 组件扫描，不继续声称两文件能解决全链 | 生成模块测试 + 冷启动生产浏览器 + 打开页面后的增量请求 |
| 真实重复路径和空场景 | 保留 nodeId，区分应用级/场景级要求 | 同路径异场景、同场景异节点、空场景文件管理三类样本 |
| owner 显式 application service 调用 | 接口模型由两类补为三类，增加 17 条服务路由证据 | 每个实际调用参数/回执/副作用独立核验 |
| 54 个 owner 方法索引 | 增补原型/桌面、报表激活、执行测试、流程退回和撤销恢复 | 补 UI→方法→请求→回读账本，静态索引不能作为通过数 |
| 报表资产73个已存在 | 资源风险由“存在性未知”收敛为“目标加载/授权/运行待验” | 保留脚本顺序、失败重试及未保存保护；不迁无关 OCR 资源 |
| 两个模型目录读取成功 | D1/D6 无需先假设后端改造即可读取 | 写入仍必须持有当前原 context，并保存回读 |

未执行完整 `pnpm build` 的原因是其清理/生成步骤会触及正在由其他任务更新的包产物；本轮用独立 outDir 的直接 Vite 构建验证前端打包。最终集成发布门禁仍保留完整 build，不能免除。

## 零回归的判定

零回归是实施验收目标，不能由文档修改或已有测试通过推出。每个最小闭环必须满足：固定修改前基线 → 同输入/身份/数据的修改后对照 → 原用例零新增失败 → 所迁操作浏览器及后端回读通过 → 受影响现有蓝图/DataSet/页面/AI 链路通过。所有未验证或阻塞项归零后才能报告完整集成通过。

当前结论：已有工程基线通过；完整集成未实施，零回归尚未达成。继续以此账本记录计划修订和逐项核验证据，不把源码存在、prepare 命令生成或成功提示计为真实保存成功。

## 开工后增量验收：C1 页面按需加载

2026-10-07 用户已授权低阶模型实施、主控验收。以上“未实施/未执行完整 build”描述属于前期方案验证记录；本节记录之后的实际变化，完整控制面仍未完成。

- 注册表改为同步路由宿主内惰性页面；虚拟组件扫描按规范化 views 目录异步加载；取消抵消惰性边界的两个手工页面分块。别名只共享模块加载，不共享页面业务实例。
- 生产浏览器发现插件 namespace getter 被 descriptor.value 错误读取；可信包导入边界修正，通用读取工具不变，有真实 RED/GREEN。
- 主控最终完整 `pnpm run build` exit 0，实际重建受影响 spark-app 包与前端，其余未变化包使用项目既有缓存。spark-app 12 文件/80 测试通过；typecheck、定向 lint、ai-codegen971、dirs 通过。C1b 时根回归187文件/2118测试通过（早于插件变更，插件以包级测试补验）。
- 生产5274禁缓存首页：19脚本请求，未请求 Settings、Dashboard、CapabilityDemo、DBMS、WorkflowDesigns 和 editor/jsoneditor；无 warn/error。完成授权登录、进入元数据管理后，新增 DBMS 一条脚本，连接列表4项，0error。
- 27条既有未映射系统页警告仍存在，写回、受限身份与29项完整操作验收仍未通过；不得因此宣称全量零回归。

证据：[C1验收账本](./evidence/sparkproject-appworks-integration/execution-ledger.md)、[生产浏览器摘要](./evidence/sparkproject-appworks-integration/c1d/browser-acceptance.json)、[生产截图](./evidence/sparkproject-appworks-integration/c1d/dbms-production.png)。下一闭环为导航异步发布隔离 C2p1；其最终状态以账本为准。

## C2p1、C2p2 与 C2a 增量验收

已完成导航刷新迟到结果隔离、lowcode导航读取身份检查及系统页owner身份/菜单/首页恢复。最终C2a根187文件/2156项、包12文件/80项通过，typecheck/定向lint/生成与目录门禁通过，完整build exit0。13文件hash与各命令原始证据见 c2a/。

生产浏览器旧唯一地址兼容；两个同路径真实节点分别保留marker/标题/高亮；错误身份、歧义旧地址拒绝渲染业务页；未知路径返回首页保留重复query、裸值、空值和hash。浏览器0error，原未映射系统页仍27类节点。C2c缓存与编辑实例生命周期、29项完整操作、业务保存回读和受限身份未签署。精确边界见执行账本，不宣称全量零回归。

## C2c 增量验收

上述 C2c 待验状态已被本节替代。原生实例池、冻结路由快照、真实 App KeepAlive/tab、刷新/撤权/reset/关闭/single/home 及事务失败保护已通过实际行为测试。最终根188文件/2167项、宿主包12文件/80项，root/package typecheck、定向lint、ai-codegen975、dirs和完整build通过。11文件及先前未触及闭环的hash复核一致。

生产5274两个真实同path节点状态独立；切回标签及刷新导航保留选中服务器；关闭重开为新实例，最终显示4连接、0error。截图及方法在 c2c/browser-acceptance.json。浏览器未写业务数据，真实受限身份和全部29项操作仍待验，不能签署完整集成零回归。

## C2d 选择与调用方增量（组合验收前）

C2d1 与 C2d2a 平台/运行时选择receipt已接受；API包18文件579项通过。C2d2b 壳层与六处caller、reset失效旧refresh已主控验收：7文件52项、typecheck、定向lint、ai976、dirs通过，10文件hash一致。main直接URL守卫由C2d2c三文件切片实施中，尚未签署C2d全链；生产浏览器仍为C2c构建。不得用这些局部结果替代后续组合回归/新构建/生产浏览器。

## C2d 最终组合验收

上述组合待验状态已被后续d/e/f修订替代。冻结累计39文件hash一致；根190文件2215项、API包18文件588项、未变宿主包12文件80项均通过；root/package typecheck、限定lint、ai978、dirs、完整build通过。未重复未改动宿主包全量。详情及原始输出见c2d2f。

最新生产5274：无导航根的既有测试应用选择失败后原目录仍可操作；目录homepage的真实application为空；1.5秒延迟下实际AppList触发切应用，后续目录query导航使旧选择stale拒绝，最新地址及空application保留；网络设置恢复后正常进入元数据管理，成功提示和4连接可见，0 console error。截图和方法在c2d2f/browser-acceptance.json。生产首次失败现场仍保留c2d2d/browser-rejection.json，不能删除失败记录掩盖返工。

真实受限用户、业务保存回读与29项完整能力仍未验收。D1a正式只读目录是下一片，禁止将C1/C2工程与浏览器通过外推为完整集成零回归。
# D1a 最新验收补记

正式数据空间目录四文件已接受，清单为 evidence/sparkproject-appworks-integration/d1a/accepted-files.json。目录17项、此前registry5项、typecheck、定向lint、dirs/pages/ai981与最终完整build通过。真实浏览器发现并修正sort缺失：七列显式Fields之后生产请求和列表都按createtime降序；不是仅mock参数通过。

生产真实验收含冷启动10行/总数1184、两页无重复、ID精确搜索、无结果状态、重置、20条分页和实际标签返回保留。7次GetData均有七Fields和descending，console error为0。详见同目录browser-acceptance.json与production-catalog.png。只签署该只读范围，未验收受限用户及写操作，不宣称整体零回归。


## M0 复制 API 与脚本视图响应验收（2026-10-08 01:52）

- gpt-6-luna 实施两个串行复制闭环，独立审查后主控验收；正式 DataView 读取两个设计模型，禁止直接 HTTP/业务宿主旁路。样板原 CRUD 和复制共49项，剪贴板与生命周期另有真实测试。
- 在线保存仅设计共享 pagedata 和目录 script；五资产逐字节回读一致。双场景工具入口查询并普通选行，复制得到6个模型、19行常量，Base_UserInfo 主键为 ID；两次 GetData、零业务保存，刷新重进再次成功。证据 pilot-deploy-copy-api.json、pilot-copy-api-online.json / png。
- 普通选行不重绘的真实失败已先保留，后在 SparkPageRenderer 复用实例级 onAnyViewChange 修正；后建视图、同 runtime reload 释放、两实例隔离验证通过。主控独立复跑3文件70项，typecheck、精确lint和门禁由执行记录支持。
- 刷新后初始化尚未结束时立刻点查询，输入保留但结果仍初始化列表；已登记单独闭环，不掩盖该问题。
- 查询绑定只完成正式7AB场景的只读可行性验证84/84行、目标1条绑定；UI、D2设计依赖、正式菜单切换、实际删除回读和M1–M7仍未完成。当前不宣称全页或完整集成零回归。

## M0 初始化查询竞争关闭（2026-10-08 02:03）

上节首载期间立即查询问题已修复：保留输入、禁用未准备好的数据操作，finally释放。主控51项与真实浏览器pending/恢复后1条筛选通过，0console error；仅script部署且五资产回读一致。详情pilot-catalog-initial-query-result.md与pilot-initial-query-online.json/png。接续查询绑定，整页M0及全量集成仍未完成。

## M0 查询绑定签收（2026-10-08 02:38）

低阶模型完成五文件；主控差异审查后独立72项通过。新增7AB场景及目录三文件已保存，6资产逐字节回读一致；真实r-dialog显示84/84集合中的1条完整绑定，关闭重开/刷新通过，复制API仍19行一致；4次只读GetData、0业务写、0console error。证据pilot-binding-result.md、pilot-binding-root-tests.log、pilot-deploy-bindings.json、pilot-binding-online.json/png。实际根FunName为软件工坊[AppWorks]，源路径投影正确。D2布局读取子计划进入implementing，M0未整页完成。

## M0 布局读取能力签收（2026-10-08 02:57）

实施者134项通过，主控独立45项及preimage差异审查通过。整页刷新后受限owner读取SysForm/<90A>.json得7911字符、6节点/0边。首次bare import碰到旧HMR模块的404已通过请求body定位，未修改正确locator。详见pilot-layout-read-result.md和pilot-layout-read-host-online.json。下一闭环补既有同步beforeRender的页面刷新接线，再装配四文件设计页；不声称D2/M0已完成。

## M0 同步渲染钩子签收（2026-10-08 03:09）

真实双hook先复现递归更新；2生产文件接专用只读调用器后通过。额外同工具双实例隔离及旧hook失效通过，主控独立84项；typecheck/精确lint/门禁通过。详见pilot-render-hook-refresh-result.md。下一步按plan-data-space-design-read-page.md实施8D四文件读取页与目录设计入口。

## M0 标签身份依赖签收（2026-10-08 03:38）
两文件修复把面板身份保留在SparkNode.id并统一name回退。主控独立26项通过；精确lint与门禁通过。typecheck曾被当前设计页草稿三错阻挡，设计页执行者修复并复验通过后才结项。真实设计页首次目标/模型/字段显示通过；完整页面边界与线上仍待验。证据pilot-tabs-node-identity-result.md、pilot-tabs-node-identity-root-tests.log。

## M0 隐藏字段单元格依赖签收（2026-10-08 04:09）
真实Element Plus在隐藏槽全Comment时回退row[prop]，两文件局部修复后真实隐藏/脱敏DOM无原值。主控审查并独立39项通过，实施者扩大118项及typecheck/精确lint/门禁通过。证据pilot-hidden-cell-result.md和pilot-hidden-cell-root-tests.log。读取页恢复边界收口；尚未部署。

## M0 设计读取切片签收（2026-10-08 04:25）
八文件闭环，主控独立86项，线上反馈按钮label与Name/AsName修正后再次独立21项。最终typecheck/精确lint/pages-config/ai-codegen985/dirs/diff-check通过。六资产正式保存回读成功；实际6模型218字段0关系、6节点布局、无输入参数。重加载严格5项业务读取+布局读，返回/整页刷新/再进入、复制API19行、查询绑定1条完整路径通过；0console error，读取路径0业务写/布局上传。首次rule误报按PageTool正式序列化输出核实，见pilot-deploy-design-read-resume.json和pilot-deploy-design-read-ui.json。在线证据pilot-design-read-online.json/png。下一步只读画布，整页D2/M0仍未完成。

## M0 只读关系图签收（2026-10-08 04:49）

八文件范围。首次线上查询502重试成功；浏览器发现高度0、隐藏pane过早fit、computed短路丢响应依赖三项，逐项修正后真实6节点全部显示。主控最终3文件26项通过；最终typecheck/精确lint通过，页面配置/代码/目录门禁此前通过。自动扫描注册真实生效；平移缩放/切回视口保留/整页重开通过，交互0 API，重开0错误，原布局7911字符逐字节不变。证据pilot-graph-preview-result.md、pilot-graph-preview-final-root-tests.log、pilot-graph-preview-online.json/png及deploy回执。只读图子计划删除；下一步renderer生命周期owner。编辑保存/正式入口及整体M0仍未完成。

## M0 页面运行实例生命周期签收（2026-10-08 05:00）

renderer释放仅中止本次脚本/订阅/渲染资源，实例由pool或DevPreviewTab创建者最终dispose。真实DataView卸载RED转GREEN；主控独立64项，tab测试改为切走前真实编辑后再独立1项。旧hook失效、同DataView重挂载、12调用切回保留、dirty close拒绝、明确discard再close、预览刷新/卸载销毁均通过。typecheck/精确lint/代码/目录门禁通过。线上目录返回与重新进入、6节点图只读回归通过，证据pilot-runtime-ownership-result.md及online.json/png。完成子计划删除；图内容草稿/编辑/保存仍待。

## M0 本地待保存变更丢弃依赖签收（2026-10-08 05:21）

DataView.discardPendingChanges 从同一强 query baseline 恢复指定 pending 行，并同步树与选择状态，0 query/0 save；原 owner fresh query 由调用方显式发起。主控独立根21项+包95项通过，typecheck/精确lint/代码/目录门禁由实施者通过；三项真实返修RED/GREEN已留存。证据pilot-pending-discard-result.md及两份root-tests日志。未知保存可能已提交，显式放弃仅清本地；fresh query失败时baseline保留但stale/禁写。完成子计划删除，下一闭环输入参数7文件；M0未整页完成。
