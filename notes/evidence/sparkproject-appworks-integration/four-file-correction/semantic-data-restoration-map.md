# 数据空间语义恢复承接图（data）

日期：2026-10-08。范围是整页数据合同在当前 `D:/SPARK_AppWorks` 的最小承接范围；原仓结论见 `semantic-data-analysis.md` 与 `notes/research-data-space-page-semantics.md` C01-C08/D01-D15。本文件不重复证明原实现，不代表已实施或运行验收。

## 判定口径

- **现成可复用**：当前源码已有目标侧能力，调用链/契约可定位；仍需在整页接入时验证。
- **需补齐**：当前底座有稳定 owner 或相邻能力，但四文件/宿主尚未覆盖完整业务路径。
- **合同待证**：源码能说明客户端 wire/DTO 变换，不能证明后端实际规则或回执含义；须用正式接口合同/受控数据验证。
- 数据空间是 SPARK 前后端数据交换中心：上接页面功能语义与前端数据结构，下接后端多种数据资源，旁接功能标签及授权等配置。数据合同必须同时保留数据权限与功能标签配置两个侧向面。前端页面不自行引入角色判断/映射；权限设计 API 中存在的主体类型配置不能直接推导当前页面的角色模型。admin 仅测试账号。
- 业务元数据仍由本页唯一 `DataSet.saveChanges` owner 提交。来源只读和布局文件只可由窄读取/文件宿主能力承担，不另建业务保存 owner。

## 整页读写/预览/布局承接矩阵

| 场景/用例 | 现有承接与真实 owner | 状态及最小缺口 | 精确验证动作（实施阶段执行，本次未运行） |
| --- | --- | --- | --- |
| 目录 C01-C08 | 目录页 `config/pages/data-platform/data-space-catalog/{rule.json,script.js,pagedata.json}`；共享 DataSet/DataView CRUD 与 `LowcodeDataSpaceCatalog` | 现成可复用。整页恢复须沿用目录查询/字段权限，且重新核对绑定范围、正式入口、删除的关联影响 | 当前应用范围下分页/搜索；逐表字段读写权限；新增/编辑/删除后同身份回读；验证入口仍映射旧 Vue 的阶段差异 |
| D01 设计基线读取 | `DataSpaceDesignApi.read()` 聚合空间、模型、字段、关系、输入参数与来源投影；经共享运行请求 owner 查询 | 现成可复用，但需接入设计页完整状态并区分失败、无权、真空数据；读取任何一项失败不能退化为空白设计 | 对模型/字段/关系/参数分别制造空、拒绝、错误；检查失败状态和身份隔离；核保存基线字段权限来自实际查询 |
| D03 六来源候选读取 | 当前设计 API 读取正式设计资源并映射快照；`DataSpaceDesignApi` 未提供六类来源的完整选择/字段发现 API | 需补齐来源只读入口或窄宿主能力，保持 source reads 不承载正式写入。来源 table/view/dict/interface/json/logicView 必须各有身份与字段映射 | 每来源核 source ID、MetaName、分页、字段权限/脱敏、空结果；数据库表 keyless 样例必须可读但不得伪造主键；记录来源 read URL 与 wire |
| D03 普通新增字段 | 源字段适配器 `buildDataModelPayloadFromSource` 使用 `sourceConfig.label` 生成字段标签；`buildInitialFields` 普通新增走通用来源字段转换；接口输出专用路径不是通用初始字段规则 | 需补齐。不得将接口同步分支的 `IsOutput=0` 归纳为所有接口新增的初始值；来源标签不得从字典查询筛选的 `sourceTableMap.dict.type` 取值 | 六来源逐种确认普通新增的初始正式字段 payload；接口普通新增断言实际 IsOutput；核 label 与来源查询筛选值彼此独立 |
| D04 绑定接口后续字段 | `buildBoundSourceNextFields` 调 `buildInterfaceOutputFieldPayloads(IsOutput=0)`，用于绑定来源后取下一批字段 | 现成逻辑可复用，但应限定在此分支；与普通初始创建分开验收 | 对比普通新增与已绑定接口同步两条 payload；核增量同步不会无意覆盖用户字段设置 |
| 字典/JSON 初始模型 | `buildDataModelPayloadFromSource` 以 `sourceConfig.label` 建立模型标签；字典 TypeName/rowid 是来源查询选择条件及来源身份输入 | 现成可复用规则。不得称字典 Type 是数据库模型保存 Type，亦不得以 `Base_TblField` 解释字典或 JSON 字段读取 | 核字典候选条件、模型保存 label、静态字段生成源及 JSON keyless 预览范围；区别来源筛选条件与持久字段 |
| D05-D06 模型/字段合同 | `DataSpaceDesignApi.readModels/readModel`；`DataSet.saveChanges({views})` 是统一写 owner；`prepareDataSpaceDesignMutation` 可做变更规划/校验 | 需补齐 UI 草稿与正式模型/字段 DataView 映射、Added/Changed/Deleted 同批提交及精确回读。不得再增加 model/field 专属 save owner | 改模型名/单字段/多字段/主键和输出；确认一次 owner、真实响应与重读；异常前后端状态区分 partial/unknown |
| 字段 input/value/computed | 设计 DTO 保留 `ValueFun`/`Expression`，runtime wire query 编码字段及值函数；`DataViewFilter` 只为过滤表达式目录提供验证/控件 | 合同待证。字段 `type=inputParams` 是来源接口/逻辑视图入参字段；空间 `inputParams` 是调用定义；本次查询值是第三层。`ValueFun`/`Expression` 求值时点与规则不可由类型名推定 | 逐字段记录读取 DTO、保存 wire、运行请求、响应值；参数定义/字段映射/调用值分别测试；验证取消无写与隐藏字段不泄漏 |
| D06 业务标志与下游 | 设计读映射 `IsBusinessMain`；运行查询 wire 携带 `IsBusinessMain`；源语义报告确认 `IsBusiness/IsBusinessMain` 是流程/主业务模型选择标志。空间参数 `IsBusParam` 已证实作为业务参数展示项 | 现成可保留标记；超出已证实消费者的含义合同待证。三者均非权限。避免单主模型约束，源可有多个 `IsBusinessMain` | 构造零/多 `IsBusinessMain`；核运行请求和消费方选择；查清 `IsBusParam` 的运行下游前只保留原值 |
| D11 模型关系编辑 | `readRelations` + `LowcodeModelRelationAdapter.adapt()` 保留完整过滤表达式并装配 DataSet 资源关系；不生成视图级联，不以 depType 限制表达式保留 | 底座已通过本轮验收；仍需补齐关系写入、子模型 Join 字段同步与回读。表达式保留不证明服务端函数本地执行或 `depType/cascadeDel` 完整运行语义 | 父/子注册名、来源名、稳定表名不同，多关系、复杂 filter、未知 depType；逐项核保存 wire、读取结果及模型关系消费；前端输入级联单独验收 |
| 关系命名缺陷 | 原边 `assignForm` 按 `MetaName||Name` 写 parent/child table；原预览 `topologicalSortModels` 要求模型注册 `Name` | 原实现缺陷：两处不是一致合同。目标以正式关系 ID/真实模型绑定解析端点，不能照搬任一名字约定并假设兼容 | 样例中 Name≠MetaName；证明关系读取由模型 ID 定位，预览及保存都指向同一模型；列明旧数据兼容方案须由接口合同决定 |
| D07 节点预览/正式查询 | `DataSpaceRuntimeApi` + runtime wire/query context；`LowcodeDataSpaceAssembler` 将场景 `modelBinding.modelName` 与正式模型装配为 DataSet/DataView | 需补齐设计草稿到预览的受控投影/测试输入衔接。预览必须走运行查询 owner，不能把 prepare 或本地字段列表当执行业务查询 | 对比模型注册名、来源 MetaName、设计场景 ID 与运行 dataSpaceId；确认实际请求、页树/筛选/输出与权限；证明预览不保存设计 |
| D12 参数正式写入 | 当前 `data-space-design/script.js` 已经用设计 DataView 编辑 `inputParams`，校验字段权限，并调用 `capture.dataSet.saveChanges({views:[...]})` 后精确回读 | 现成可复用，是唯一业务保存 owner 的样板；整页其余元数据路径须汇入相同实例和保存入口 | 编辑/取消/权限变更/未知回执/保存后回读；确保稳定 parameter rowid 与未知扩展属性不丢失 |
| D13 布局文件读/写/缺失重建 | `lowcode-data-space-layout.ts::createReader()` 经 `PageRuntimeServicesCapability.dataSpaceLayout` 和 `LowcodeDesignApi.readTextFile` 读取 `${dataSpaceId}.json`，404 才回 null；当前只证实 reader | 读取现成可复用；写文件和受控缺失重建为需补齐的宿主能力。不能写入 pagedata.json 或借业务 DataSet 保存 | 文件存在/404/损坏/权限拒绝/应用切换；如果补 writer，核限定单路径段、当前 scope、精确写后逐字读回；不得把损坏当缺失 |
| D14 删除模型/关系 | 设计 API 提供 formal mutation/read；DataSet owner 可批量存正式 view 变更；未发现可证明跨表事务的统一事务承诺 | 需补齐影响集合展示、模型字段/关系/处理关联的同 owner 删除及逐资源结果。服务端级联待合同证实 | 删除模型及关联关系/字段/数据处理目标；验证取消零写、拒绝/partial/unknown；同身份重读确认实际保留/删除项 |
| D15 导出调用文本 | 原数据空间目录有复制 API 文本；原设计页交互材料也记载复制 API 动作。当前目标设计页四文件是否有对应入口须按现 rule/script 核实，不等同目录复制能力。 | 原 helper 可作为语义参考；当前目标入口和它导出的草稿/正式快照尚待页面证实。导出不是发布或查询。 | 分别核目录复制与设计页动作；设计页按当前草稿/正式快照对照，主键只取正式字段合同，不沿用 rowid 兜底。 |

## DTO、wire 与权限边界

| 项目 | 当前源码可证 | 目标实施约束 / 待证 |
| --- | --- | --- |
| 数据库标识 | 模型正式保存 wire 是 `DbName`；设计 DTO `databaseName` 是对 wire `DbName` 的补映射/标准投影。来源 `DatabaseName` 是候选源 DTO 命名。 | 写入必须检查实际序列化键和值；不能将 DTO 的 `DatabaseName` 当持久 wire，也不能因字段同名推断后端别名合同。 |
| 模型身份 | 场景表名由 `modelBinding.modelName` 稳定绑定；设计快照区分正式模型 ID、注册 `Name`、来源 `MetaName`。 | 读写/预览/关系三条链分别核身份；不可拿来源名替注册名，或拿模型 ID 替表名。 |
| 保存协议 | `DataSet.saveChanges` 捕获同一 DataSet 场景内多视图更改，按回执校验后接纳；DataView 保存复用被接纳的正式查询 owner。 | page script 是业务编排 owner；不新增 design API 独立 CRUD writer。正式 source reads 可单独只读。跨多个远端资源原子事务未证实。 |
| 表/行/字段数据权限 | runtime query context 和 permission decoder 消费实际查询返回的 `lingma_sys_params`；`DataView.fieldAccess(row, field)` 可判断字段 read/write。目录脚本已有字段读写检查，参数脚本在保存前重核 `inputParams`。 | 每个读写以当前有效查询快照为准；字段隐藏不渲染/不导出，字段禁止写时拒绝，行权限按 DataView/查询结果消费。功能标签不替代数据权限；admin 测试账号无豁免。 |
| 功能标签/旁侧权限配置 | `PermissionApi.design.read(formKey)` 读取标签、`Base_FunctionDetail` 策略、`FunctionNodeAuth` 授权；`runtime.read(formKey)` 返回 `GetFormUserFunction` 的 `childFun`/`allowAdd`。 | 只读能力存在；配置如何关联 DataSpace query/runtime 未证实。标签与配置保留，`PermissionGrantSubjectKind` 的 role/position/user 映射不得作为目标前端合同。追踪 formKey/tagId/FunId/resourceName 到后端决策；区分 allowAdd/authorizedFeatureTags 与查询 `lingma_sys_params`。 |
| keyless 来源 | 六来源候选读取与正式运行主键是不同契约；现有 DataSet/DataView 需要合法运行身份/主键的具体约束须逐模型确认。 | 可只读展示 keyless 来源元数据，不合成 `rowid` 或“首字段”主键；能否预览、能否正式建模列为 source/backend 合同待证，给出明确受限状态。 |

## 最小文件范围与公共接口

以下是整页实施时需检查的最小边界；具体新增公共接口以文件读取和现有导出核验为准，本映射不授权修改。

| 文件 | 当前职责/计划承接 | 状态 |
| --- | --- | --- |
| `config/pages/data-platform/data-space-design/{rule.json,script.js,style.css,pagedata.json}` | 页面完整业务流程/权限提示；组件声明；样式隔离；场景绑定正式模型 | 需补齐整页流程；四文件作为同一个页面单元，不把页面 save owner 下沉到组件 |
| `src/lowcode/data-space/lowcode-data-space-runtime.ts` | `loadScenarioDataSet` 读场景视图 + 正式 model/relations 并装配；`loadLowcodeRuntimeScenario` 核 scope/销毁过期实例 | 现成可复用；需核 D07 草稿预览是否可用现有场景能力 |
| `src/lowcode/data-space/lowcode-data-space-assembler.ts` | 正式模型字段投影与 DataSet/DataView 组装 | 现成可复用；不塞来源选择器或页面状态 |
| `src/lowcode/data-space/lowcode-model-relation-adapter.ts` | 正式关系到完整 DataResourceRelation 过滤表达式；不生成 DataViewCascade | 本轮底座已验收；按注册身份解析，冲突诊断，不猜 depType 或来源别名；见 model-relation-expression-review.md |
| `src/lowcode/data-space/lowcode-data-space-catalog.ts` | 目录搜索分页及创建人显示投影 | 现成可复用；页面权限与宿主应用范围仍须在 page 查询 owner 中 |
| `src/lowcode/data-space/lowcode-data-space-layout.ts` | 当前仅 reader factory，绑定应用/session scope 与 404→null | 需补齐受限 writer/重建宿主 capability（若无其他既有 writer）；与 DataSet 保存分离 |
| `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts` | 正式设计数据只读聚合、模型/字段/关系映射 | 现成可复用读取；source candidates/fields 若确属缺口，增加窄只读能力，不引入正式 writer |
| `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-mutation.ts` | mutation 输入规划/合同校验 | 现成可复用为纯规划；全部持久化仍经 DataSet owner |
| `packages/spark-lowcode-api/src/platform/data-space/runtime/{data-space-runtime-api.ts,protocol/*,query/*,save/*}` | 正式查询 wire、权限、请求和保存回执；实际消费入口 | 现成可复用；缺少后端契约证据的行为标合同待证 |
| `packages/spark-data/src/{dataset.ts,data-view.ts,types.ts}` | DataSet/DataView 状态、授权查询上下文、统一 saveChanges 与 DataView fieldAccess | 现成可复用，不为数据空间复制 CRUD/save |
| `packages/spark-component/src/...` 的 PageRuntime services capability 契约与注册 | 页面宿主 services 注入及 dataSpaceLayout capability 类型 | 需完整反查注册者/调用者；只为布局/来源只读做最窄能力注入 |
| 相关现有测试文件（下节） | 精确合同的测试承接，不代表当前整页通过 | 现成测试需补整页追踪用例；本次不运行 |

## 现有测试与精确验证目标

- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.test.ts`：验证 read projection、DB DTO/wire、参数/字段/关系解析；新增 `DbName`/`DatabaseName` 和来源标签、字段初始 payload、关系 Name≠MetaName 断言。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts` 与 `runtime/tests/data-space-{query,save,permission}-parity.test.ts`：验证正式 query/save wire、请求身份、权限和回执；新增 keyless/输入字段/ValueFun/输出权限边界测试。
- `packages/spark-data/src/tests/identity/scenario-model-identity.test.ts`、`src/tests/crud/commit-mode.test.ts`（实际包路径以 `rg --files` 核验）：验证 model identity、同场景 save owner、拒绝非法跨 owner；不替代 page-level 多视图保存验收。
- `tests/runtime/auth-nav/data-space/lowcode-data-space-layout.test.ts`、`lowcode-model-relation-adapter.test.ts`、`lowcode-runtime-scenario-loader.test.ts`、`lowcode-scenario-assembly.test.ts`：验证 scope/layout read、关系适配、运行装配。补 layout writer 的 scope/path/readback；关系端点用正式 ID；六来源读链分别覆盖。
- `config/pages/data-platform/data-space-design` 需有可追踪页面行为覆盖：D01-D15 的输入→请求→权限→可见结果→正式读回/布局文件读回。覆盖取消零写、部分/未知保存、页面切换过期、hidden/denied 字段、预览零业务写。
- 精确实施验证动作：先静态检查实现只出现一个 page DataSet `saveChanges` owner；再按每个正式 view 核 `Added/Changed/Deleted` 和回执；逐场景检验表/行/字段授权；分别复验六类来源；模型 Name≠MetaName；参数定义≠字段映射≠运行值；数据库 wire `DbName` 与 DTO `DatabaseName`；布局 404/损坏/存在三分支；最后按 D01-D15 自动化并真实页面同身份保存重开。此次未执行任何测试/浏览器。

## 未决合同与遗漏

1. 后端对 keyless 来源是否允许建立模型或预览、各来源读 API 的真实授权响应、来源分页协议：当前目标代码不足以证明，须读取正式请求/服务端 schema 或受控回执。
2. `depType`、`cascadeDel` 的完整服务端运行含义仍须按具体消费者核实；当前 adapter 保留模型过滤关系与删除声明，不自动生成前端级联。
3. `ValueFun`/`Expression` 实际求值时机、`IsBusParam` 除显示外的消费者、`IsBusinessMain` 多标记选择规则：未证实不推断。
4. 功能标签与 `Base_FunctionDetail` / `FunctionNodeAuth` 的配置读 API 已存在，但当前数据空间请求中标签、策略、授权配置与 `lingma_sys_params` 回执的具体组合点未证实；需沿真实调用及后端响应补证，不应因无角色页面而排除配置。
5. 模型/字段/关系跨多 view 或布局文件是否存在服务端事务/补偿；当前实现不证明全资源原子性。
6. 组件 capability 注册/消费的完整反向调用范围，以及现有 source endpoint 的完整全文件合同，在本 map 的本轮窄读取中未复核；实施前应逐文件完整读拟改文件并 `rg` 反查消费者。
7. 关系历史记录若按来源名持久化，是否存在后端归一规则/迁移兼容：待合同确认，不可单凭目标 adapter 重新解释存量。

边界：本文件只为主控修订既有整页计划提供可复核落点；不续接旧微切片，不创建独立接口计划，不改变代码/测试/配置。

## 公共入口（现有 API 能力边界）

- `DataSpaceApi.design` 提供正式设计读取 API；当前可证公开方法为 `readModels(input)`、`readModel(input)`、`readRelations(input)`、`read(input)`。目标页面应通过此 owner 读设计数据，不自行复刻 query wire。
- `DataSpaceApi.runtime` 暴露正式运行 API；`DataSpaceRuntimeApi.save(command)` 走受控运行保存协议，底层 DataSet/DataView 已绑定同一查询 owner。页面普通模型配置保存仍按当前设计 DataView 使用 `DataSet.saveChanges`，不能把 runtime save 和设计配置写混。
- `prepareDataSpaceDesignMutation(...)` 是 mutation 规划/校验入口；单凭返回计划不能宣称写入已发生。保存事实以 DataSet owner 回执和正式查询回读为准。
- `loadScenarioDataSet({scenarioId, designScenarioId?, config, assertCurrent?})` 是正式 model/relations 与场景文件装配入口；`scenarioId` 必须与 config 身份一致；场景表通过 `modelBinding.modelName` 解析注册名，再读正式模型。
- `loadLowcodeRuntimeScenario({projectId, scenarioId})` 负责从项目 gateway 读 scenario view 文件、核 scope，过期时销毁装配实例。它不是设计器草稿保存入口。
- `lowcodeDataSpaceLayout.createReader()` 暴露 `readDataSpaceLayout(dataSpaceId)`；当前只证明 layout 读取及 404 转 null，不证明文件写入接口已存在。
- `PageRuntimeServicesCapability.dataSpaceLayout` 是页面运行时宿主边界；布局写能力若不存在，应先完整查 capability contract、注册者和所有 consumers，避免把底层 `LowcodeDesignApi` 直接塞入页面脚本。
- `LowcodeModelRelationAdapter.adapt(relations, bindings)` 将正式关系的完整过滤表达式装配为 `DataResourceRelation`，不产出 `DataViewCascade`。注册名唯一解析后转换引用；身份冲突须诊断，不猜来源名或稳定表别名。服务端及未知函数定义保留，本地可执行性由实际消费者校验；本轮验证见 `model-relation-expression-review.md`。

## 代码复核顺序交接

1. 实施前完整阅读四个页面文件，确认当前 dirty worktree 是否已变更目标；不得按本 map 的概括直接覆盖现文件。
2. 完整阅读所有拟改的 runtime、catalog、layout、assembler、relation adapter、design/runtime API、DataSet/DataView 与 capability 契约文件。
3. 对上述每个拟改实现文件反查 `rg` 消费者和配置注册点，确认无第二个业务 save owner、没有隐藏页面/组件直接写路径。
4. 对来源读取逐个锁定 endpoint、wire DTO、返回字段、分页、权限上下文及其消费者；若无源码合同，把对应来源能力标为待证，不按来源名字推断。
5. 保留本次四文件之外的运行 API/组件作为依赖，不以修改公共 API 名称或新增兼容别名绕开既有契约。
6. 用同一个查询 owner 构造正式设计表 DataViews；若多个表需要跨视图保存，显式选择 views 并校验每一类回执；不得声称后端多资源事务。
7. 布局 reader/writer 使用相同 captured app/session scope 与单段空间 ID 校验；确认缺失、损坏、拒绝三种状态可区分。
8. 权限验证分两路：数据权限夹具取正式查询回执中的 `lingma_sys_params`，写动作根据目标行/字段 `fieldAccess` 判定；功能标签/旁侧配置夹具追踪 `PermissionApi.design/runtime` 到实际授权决策的调用链。当前目标无前端角色判断，亦不用登录账号名或 admin 特例代替。
9. 关系映射验证必须至少包含模型 ID、注册 Name、来源 MetaName 三者不同的样例，证明全链一致使用真实正式身份。
10. 所有合同测试与页面行为测试完成后，再由主控将 C01-C08/D01-D15 与当前入口和下游逐项追踪；本映射不声称当前实现已达到这些结果。







## 关系编辑准备：依赖字典与设计视图保存 owner（2026-10-08，只读核实）

- **固定参考路径**：已用 `git ls-tree -r --name-only 842dec4f11b333df904b9a4e26b6566b0802bab8` 确认原源文件路径；再按该 SHA `git show` 读取 `apps/appworks/src/data/api/data-set/design/{data-space-design.ts,records.ts}`。源以 `DEPENDENCY_DICT_TABLE = "数据关系依赖"`（`records.ts:41`）调用 `requireRootSparkRuntime().api.dictionary.options(name,{empty:'error',query:{allPages:true}})`，并保留真实 label/value（`data-space-design.ts:615-621`）；没有固定 literal enum 清单，具体项来自正式字典响应。
- **当前仓字典入口结论**：`LowcodeApi` 公开面只有 blueprint/catalog/dataSpace/design/application/realtime/platform/permission/session（`packages/spark-lowcode-api/src/lowcode-api.ts:31-40`），没有 dictionary；`LowcodeCatalogApi.getDatabaseCatalog` / `LowcodeDataSpaceCatalog` 是数据库目录和数据空间目录，非系统字典。`DataSpaceRuntimeApi.query(identity, options)` 可通用查询已知 `{scenarioId,metaName}` 正式注册模型，但字典查询所需的准确场景/模型身份未在当前代码合同中提供。不得把 `数据关系依赖` 字符串当 scenarioId，也不得从固定源包外推当前可调用 API。当前最小缺口是正式字典读取入口/宿主注入及其身份、分页和错误/空集合同；实现前由主控裁定复用哪一正式能力，不另造临时 API。
- **设计 DataView owner 路径**：`LowcodeDataSpaceAssembler` 将每个 modelBinding 解析模型后，对该正式模型 DataTable 的每个 view 执行 `runtime.bindModelView(view, model)`（`src/lowcode/data-space/lowcode-data-space-assembler.ts:54-85`）。实际 PageRuntime 装配入口 `loadScenarioDataSet` 使用 `lowcodeApi.dataSpace.runtime`，读取正式模型/关系再交 assembler（`src/lowcode/data-space/lowcode-data-space-runtime.ts:21-39`）。现有页面测试 fixture 明确用同一 `DataSpaceRuntimeApi` 实例装配 scenario config 下的全部 formal models，包含 `Base_DataModel` 与 `Base_DataModel_Relation`（`tests/runtime/page/design/data-space-design-four-file.test.ts:234-239`）。
- **可复用批量保存确认**：`DataSet.saveChanges({views})` 可按 tableName/viewId/ids 精确选择两行（`packages/spark-data/src/dataset.ts:1374-1455,1746-1786`）。场景视图进入 `DataView.saveQueryViews` 后，要求同一 executor 与 scenarioId、模型绑定不冲突，再一次调用 executor `save({changes:[...]})` 并逐 view 匹配/接受正式 receipt（`packages/spark-data/src/data-view.ts:2020-2063`）；`DataSpaceRuntimeApi.save` 将多模型改动组织成一个 SPARK 请求（`.../runtime/data-space-runtime-api.ts:115-155`）。API 测试已有“同场景两个模型一次请求且分模型回执”证据（`.../runtime/data-space-runtime-api.test.ts:539-552`）。此处没有事务承诺。
- **当前页面最小证明方式**：沿用 `createDesignFixture`/真实 PageRuntime，不建新 owner；分别在 designModels 的子模型目标行和 designRelations 的关系目标行 stage 编辑（新增关系另核正式 rowid），显式一次 `designDataSet.saveChanges({views:[{tableName:'Base_DataModel',viewId:'designModels',ids:[childId]},{tableName:'Base_DataModel_Relation',viewId:'designRelations',ids:[relationId]}]})`。fixture 记录真实 HTTP 请求，断言一次 `/api/DataOperation/BatchTableOperateRequestByCRUD` 且 x-FormKey 为设计场景，payload 两条正式模型命令与各自 Added/Changed/Deleted 行；断言 `viewResults` 分别对应两 view、失败/行数回执齐全，再按同一两个 DataViews 精确回读关系和子模型 Join 字段。fixture 现有 fake save 响应只处理第一条命令，页面用例需把 mock 回执/正式回读夹具调整为保留两模型回应；无需改公共 owner。
- **边界**：该接线仅证明正式关系元数据与子模型查询元数据同一次 DataSet owner 保存；不证明后端原子性、字段/关系删除自动级联、`depType` 具体 dictionary values 或字典结果当前可读。固定参考提交 SHA 为 `842dec4f11b333df904b9a4e26b6566b0802bab8`。

### 依赖字典后端端点复核（更正上一段字典入口判断）

- **固定参考调用合同**：固定提交 `842dec4f11b333df904b9a4e26b6566b0802bab8` 的 `apps/appworks/src/data/api/data-set/design/data-space-design.ts:615-621` 通过 `api.dictionary.options("数据关系依赖", { empty: "error", query: { allPages: true } })` 读字典；`packages/data/spark-api/src/kernel/bind-spark-api.ts` 将其交给 `dataOwnerClient.queryDictionary(metaName, executionOptions)`，`packages/data/spark-api/src/protocol/executor.ts:234` 构造 `queryDictionary` 并复用分页查询执行器。`packages/data/spark-api/src/protocol/resource-api.ts`（固定树中实际路径为 `packages/data/spark-api/src/resource/resource-api.ts`）创建 `Type: "字典"`、`PrimaryKeyFields: ["rowid"]` 的表描述。选项标准化从 label/name 与 value/code 字段族取值；`empty: "error"` 对空字典报错。无显式分页时 options 收集全部页，默认按 `ordIdx` 升序。
- **正式端点已注册，不能再记为“无服务”**：当前仓 `backend-api-contracts/endpoints.ts:430-445` 已声明 `POST /api/DataOperation/GetData`（BasicFunController，TableInput，AjaxResult），但 `backend-api-contracts/lowcode-endpoint-ledger.json` 未收录该端点，台账不完整。只读后端 `E:\lowcode-jdk17\lowcode-mainbody\src\main\java\com\htong\controller\BasicFunController.java:33,228` 注册 `/api/DataOperation/GetData`，接收 `TableInput`，返回 `AjaxResult.success(...)`。`BasicFunServiceImpl.java:1394-1461` 对单表显式 `Type="字典"` 进入字典分支；`DictServiceImpl.java:553-575` 按字典身份解析 `Base_DictType` 后查询 `Base_DictData`，产出 items/count 分页结果。该分支允许不带 `X-FormKey`；formKey 只辅助可选模型别名/默认排序，不是场景身份。
- **当前可达性与最小边界**：因此“没有 dictionary 门面”不代表后端缺少合同。当前 `LowcodeApi` 仍无 typed `dictionary` owner；底层 `lowcodeHttp` 可针对已证实端点发送 `POST /api/DataOperation/GetData`，以 TableInput 显式指定 `Type: "字典"` 和字典名，并沿现有 HTTP 会话认证。固定参考 options 的 `allPages`、`ordIdx` 排序、label/value 映射和空集错误需由上层窄入口承接；本核实未证明当前低层客户端已经提供等价 options API，也未在线请求。该路径无需猜 scenarioId，不应改走 `/GetBaseData`（参考调用按默认 business-main 路由到 GetData）。仍待主控裁定 typed API 的最窄落点及应如何更新缺项台账；不在本次新增 API、推测字典枚举值或扩展业务。

## 依赖字典读取与关系后布局文件维护合同（2026-10-08，只读续核）

### Dependency options 的最窄读取 owner

- **固定参考实际调用链**：固定 SHA `842dec4f11b333df904b9a4e26b6566b0802bab8` 中 `apps/appworks/src/data/api/data-set/design/data-space-design.ts` 的 `readDependencyOptions()` 调 `api.dictionary.options("数据关系依赖", {empty:"error", query:{allPages:true}})`；`packages/data/spark-api/src/kernel/bind-spark-api.ts` 的 `SparkRuntimeDictionaryApi.options()` 默认 `sort:[{field:"ordIdx",direction:"asc"}]`、`singleFlight:true`，显式 page 只读单页，否则在单次执行 scope 里用 `collectSparkQueryPages` 收齐页，最后调用 `normalizeSparkDictionaryOptions`。标签候选优先 `label/txt/Label/Text/name/Name`，值优先 `value/val/Value/code/Code`，默认输出 string，缺标签/值或 `empty:"error"` 时空集均拒绝；原 UI 转成 `{label, value:String(value)}`。没有固定 depType 枚举 literal，必须用正式响应值。
- **字典查询 wire 与实际排序差异**：`createSparkDictionaryQueryHandle()`（固定 SHA `packages/data/spark-api/src/resource/resource-api.ts`）创建 `formKey:""`, `Name:metaName`, `PrimaryKeyFields:"rowid"`, `Type:"字典"`, 默认 `OutputType:"Table"`, `Fields:null`, `inputParams:[]`, `DISTINCT:false`, `IsBusinessMain:1` 的 DataTable；`SparkProtocolExecutor.queryDictionary()` 走 `queryTablePaged`，`IsBusinessMain===1` 选择 `/api/DataOperation/GetData`，不带场景身份。请求表描述包含 `Name`, `OutputType`, `Filter:null`, `inputParams:[]`, `PrimaryKeyFields:"rowid"`, `Type:"字典"`, `DISTINCT:false`, `IsBusinessMain:1`；Fields 因为空被省略，body 外层 `Table:[...]` 并带当前 `{PageParam:{index,size}}`；请求头通过 `createSparkRequestHeaders(formKey:"", context)` 发送空 `x-FormKey` 并合并运行上下文头（非 scenario header）。options 上游确实请求 `ordIdx asc`，转换为 `Field:"ordIdx", OrderType:"ascending", Order:0`；但 `data-table.ts:projectSortFields` 对 `Fields:null` 明确保留所有输出并返回 null，因此最终 serializer 删除 `Fields`，wire 上没有排序投影。也就是说参考代码表达了 ordIdx 升序意图，固定提交当前生成的请求并未实际携带排序；若本页需要可证明的稳定顺序，应在窄读取方法中显式请求包含 ordIdx 的字段投影并保留全量输出语义，或响应端按 ordIdx 明确排序；不能称现状 wire 已保证排序。
- **分页/响应**：固定 `collectSparkQueryPages` (`packages/data/spark-api/src/protocol/pagination.ts`) 默认页大小 1000、累计上限 50,000；每页必须提供合法且稳定的 total，页记录数须等于 `min(pageSize,total-alreadyRead)`，缺页/超限/total变化失败。`applyDataTableQueryResult`（`protocol/data-table.ts`）解包 transport 保存的响应 envelope，读取 `data/Items|items|List|list` 与 `Count|Total|TotalCount`；字典 query 输出 `{rows,total}` 并剥离权限 wire 字段，option normalizer 再做标签/值投影。当前 `LowcodeClient.requestResult()`（`packages/spark-lowcode-api/src/core/lowcode-client.ts`）也能解包标准 `AjaxResult.Code===200`，设计 API 的 `readTable()` 已复用它和 `/api/DataOperation/GetData`，但其 `queryPayload()` 固定 `Type:"数据库表"`, `DbName:"QYVirtualPlat"` 及设计场景 `x-FormKey`，`resultRows()` 要求 `Result.data.Items` 对象数组；不能原样复用作应用级 dictionary query。`DataSpaceRuntimeApi.query`/`readModels`/`readRelations` 是场景注册模型合同，字典无 scenarioId 且无可合法传入的场景模型名，也不是可替代入口。
- **当前最窄 owner 与页面通道**：当前 `DataSpaceDesignApi` 已持有共享 `LowcodeClient`、`HttpClientBase`、`readScope()`；正式读取在 `readModel/readRelations/readFormalRows` 中捕获 scope token，并在请求前后调用 `assertCurrent`（`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:557-660`）。因此最窄数据 owner 是在此 class 加 `readRelationDependencyOptions()`：使用同一已认证 HTTP、无场景 formKey 的 Type=字典查询、专用响应解析、scope 变化即拒绝，并保留 all-pages/maxRows/stable-total 错误约束。当前既有公开 `read*` 不返回系统字典。
- **宿主接线并非已经存在**：当前 `PageRuntimeServicesCapability`（`packages/spark-component/src/runtime/app-services.ts:238-251`）的 `pageService` 只容纳通用 UI `PageServiceCapability`；`dataSpaceLayout` 只有 `scenarioId + createReader()`。`buildPageContext()` 只把 `readDataSpaceLayout()` 包装到 `$page`，并以 AbortSignal、PageRuntime generation 和已装 DataSet 做前后失效保护；`SparkPageRenderer.vue:235` 只传 layout service；`src/App.vue:474` 只注入 `pageService` 和 `dataSpaceLayout`。所以当前 PageService/读方法不能直接让本页脚本拿到 options。精确窄落点是 DataSpaceDesignApi 新 read method + sibling `PageRuntimeServicesCapability` 数据空间设计 options reader + `buildPageContext.ts`/`script-context-types.ts` 的 `$page.readRelationDependencyOptions()` 包装 + `SparkPageRenderer.vue` service 透传 + `src/App.vue` 注入绑定到 `lowcodeApi.dataSpace.design` 的宿主回调。由 API 层捕获/验证请求 scope，由 page wrapper 每次 await 前后验证页面代次；不要将字典 reader 塞入语义不相关的布局 reader，也不要开放通用 dictionary API。

### 关系变更后维护当前布局文件

- **固定原保存语义**：固定 SHA 的 `apps/appworks/src/ui/features/data-platform/data-set-management/design/ui/data-set-design-state.ts:68,196-214` 中 `normalizePersistableGraphData` 先 spread 原图对象、确保 nodes/edges 数组；`persistCurrentDesignGraph` 捕获/应用当前 graph layout，再写 JSON `{...persistableGraph, graphVersion:DESIGN_GRAPH_VERSION}`。`AppWorksDataSpaceDesign.writeGraph()`（`apps/appworks/src/data/api/data-set/design/data-space-design.ts:635-643`）写 `scenarioId=designScenarioId`, `fileName=${dataSpaceId}.json`, `isReplace:true`, `isCrossEnt:false`, `DESIGN_FILE_LOCATION={appType:"designfile",customPath:"SysForm"}`。edge panel `use-data-set-design-edge-panel.ts` 先提交子模型与关系并读回验证，再 `persistCurrentDesignGraph()`；布局写失败时提示“关系已保存并回读确认，但设计图保存未确认”，两者不构成一个事务。保存时必须从既有图快照维护节点、边和扩展属性，不重造图 JSON；关系读回成功而布局失败须报告为部分成功，禁止重复提交关系来补救。
- **当前文件 API 的边界**：`LowcodeDesignApi` (`packages/spark-lowcode-api/src/design/lowcode-design-api.ts`) 有 `readTextFile/readFileBytes/listFiles/removeFile`，没有 `writeTextFile`。但是同包已有 `LowcodeDesignFileUpload.uploadWorkingText()` (`.../lowcode-design-file-upload.ts:40-113`)：`POST /api/File/UploadFile` multipart，字段 `customPath`, `appType:"designfile"`, `isReplace:"true"`, `newName`, `isCrossEnt:"false"`, UTF-8 `file`; 标准 AjaxResult Code 必须 200，Result 必须单条文件信息数组；工作文件路径没有额外要求 `state`，随后 `/api/File/DownFile` byte readback 必须与原文本编码字节完全相同后才返回回执。它不提供 compare-and-swap，也不覆盖跨远端资源原子事务。
- **当前宿主**：`src/lowcode/data-space/lowcode-data-space-layout.ts` 仅创建与当前 `X-AppId`/session token 绑定的 `LowcodeDesignApi` reader，读 `{appType:"designfile",customPath:"SysForm",fileName:"${dataSpaceId}.json"}`；没有 writer。`LowcodeDesignFileUpload` 已由 lowcode API 包导出；`src/lowcode/lowcode-runtime.ts` 已有 `scenarioFileUpload` 私有单例但仅用于项目文件/场景配置路径，未向 page runtime 暴露给 SysForm 图布局的写入口。适宜扩展现有窄 layout host 为同 app/session scope 的 writer，并调用 `LowcodeDesignFileUpload.uploadWorkingText` 做唯一正式写和回读确认；不能把场景视图 pagedata 写入器复用成 SysForm graph writer。
- **需要扩展的精确宿主面**：在 `PageDataSpaceLayoutReader` 或同一 `dataSpaceLayout` 宿主能力中加入 `writeDataSpaceLayout(dataSpaceId, content)`，具体落点 `packages/spark-component/src/runtime/app-services.ts`（能力类型）、`src/lowcode/data-space/lowcode-data-space-layout.ts`（路径校验、scope、上传/readback）、`packages/spark-component/src/page/context/buildPageContext.ts` 与 `packages/spark-component/src/runtime/script-context-types.ts`（`$page` 包装/类型）、`packages/spark-component/src/page/renderer/SparkPageRenderer.vue`（透传现有 capability）、`src/App.vue`（向 PAGE_RUNTIME_SERVICES 注入）。更新 relation save script 时将正式关系/子模型 DataSet 保存与布局文件上传作为两个分别报告的持久边界；写后回读已由 LowcodeDesignFileUpload 对原字节证明。此处不授权完整画布功能迁移，也不证明上传端点有 CAS。
- **本轮只读范围与剩余证明**：未发在线请求、未改代码、未执行测试。仍需在正式页面 fixture 证明 dependency options 真实落到关系 depType options 且字段值来自 `数据关系依赖`；布局 mutation 测试证明以既有文件为底维护节点/边/扩展字段、文件上传回读后重新装配不会因新/删关系拒绝旧 edge；分别断言关系和布局失败的 partial-success 提示/状态。依赖项文字照真实字典回传，不自行造选项值。
