状态：implementing

## 当前阻断

预检确认 D3 当前正式模型目录只有 9 个模型：`WorkingDraft`、`Baseline`、`Requirement`、`RevisionSnapshot`、`ContentRevision`、`FactVersion`、`ContentNodeVersion`、`TenderRecord`、`ContentProject`。`KnowledgeGuide` 的知识只由 ClassModel 提供；`ContextManifest/GenerationRun` 是 Agent 参数与运行结果，不加入 D3 数据模型。独立 Dataset 文件生成已接通。

Agent 派发已统一走 Spark AI SSE，旧 claim/agent task 已删除；Dataset 文件合约不能扩展 command/logical-view 字段。Page18 只接受调用方保存并显式传回的派发参数，不使用 AI turn/messages、相近数据库表或页面专属假 DataView owner 替代。

## 当前实施修正：上下文是参数

- `ContextManifest` 不是 D3 数据模型。冻结上下文作为 `SmartBidOperationCommand.inputs` 参数进入 ClassModel Agent；远端 SSE 消息包含同一 canonical command envelope。
- `GenerationRun` 不是 D3 数据模型。一次运行由 Spark AI 的真实 `sessionId/turnId` 和本次 PageRuntime 原 DataView/command owner receipt 表达。
- 删除 Page18 `ContextManifest/GenerationRun` reader、named view assembly、旧 DataView 恢复和 rework 旁路。
- Page09 的 `GenerationRun` 试次/条款读取同样改为 `operationAttempts/operationEvidence` 参数；保留其他正式 D3 业务 DataView。
- Page18 原试次核验只接受调用方传入的派发参数对象，严格校验 operation/request identity、SSE state 与输入 digest；不重发、不从不存在的模型查询。
- 保留业务副作用的唯一 owner：Agent 工具仍执行当前 PageRuntime 的 DataView/file/command owner。

## 2026-11-23 ClassModel 知识与 SSE 收口

- `KnowledgeGuide` 只保留为 ClassModel 动作模型，知识目录由 `model_query`、动作指南由 `model_action_guide` 返回；原试次通过冻结 digest 经同一入口重读。
- Page16/18 已删除 KnowledgeGuide DataView/dispatch claim/旧 operation-route agent task 路径。
- SmartBid 标准 action、Page18、Page19 统一经 `SmartBidAgentDispatcher` 调用 spark-ai；真实 `/api/ai/turns` ACK 后只返回真实 session/turn，断流不重发并标识 `SSE_UNKNOWN`。
- 验证通过：根 typecheck、SmartBid 141 文件 885/885、低码契约、page-thin、目标 lint、ClassModel 生成、Dataset/AI smoke 9/9、`git diff --check`。

## 2026-11-23 实服补证

- 平台全局确有 `bid_knowledge_asset`、`bid_work_run`、`bid_task_run` 三个真实数据库模型；可读样本分别为 99、14、766 条。
- 这三表的字段语义不等于 `KnowledgeGuide`、`ContextManifest`、`GenerationRun`：例如运行准备表只有 `order/run/project/digest/run_json`，不能替代原冻结、实发、原返回、返工证据合同；知识资产表是证照材料，不是操作指南目录。因此未重命名冒充，也未保留这些试挂模型。
- 曾通过正式数据空间设计器将三表挂入 D3、精确读回后确认不匹配；随后逐一删除模型及从属字段，并回读 D3 恢复为原 9 个模型。
- 后端 `DataSet` 根目录已存在大量 `<scenarioId>.dataset.json`，证明文件形态/目录合同存在；D3 文件仍 404。
- D3 模型正式保存请求实际只发 `POST /api/DataOperation/BatchTableOperateRequestByCRUD`（Base_DataModel 变更），返回普通 CRUD receipt；没有 `.dataset.json` 生成请求/文件写请求，保存后 D3 文件仍 404。
- 参考仓最终证实：设计器前端在正式 metadata 保存成功后通过文件 API 上传 Plan；不是后端 CRUD 自动生成。与当前部署 D3 只发 CRUD、未生成文件的现象一致。

## 2026-11-23 通用接线实施

- spark-data 已增加严格 `spark.runtimeDataSetPlan` parser/compiler：直接解析 models/modelFields/views/viewFields/relations/inputParams/dependencies/GetDependValue。
- `DataView` query cascade 支持 Dataset Plan 的 `emptyResult/omit/asNull`；自动级联在 spark-data 内执行。
- Lowcode assembler 在独立 Plan 装配时逐项核对正式 model/field/output/canonical identity，并以正式 metadata primaryKey 覆盖 Plan 中误标的租户 `lingma_sys_ent`。
- v2 publication manifest 只保存 Dataset locator、SHA-256 和 Plan contentHash；不嵌入 Plan 文本、不创建 Dataset 版本。运行时从后端 `DataSet/<scenarioId>.dataset.json` 直接读取并核 SHA/contentHash。
- 实服只读冷装配通过：
  - `3836594F6E4F4DCDB642266C1148AEEC`：4 个正式表、4 个 DataView、主键均归一为业务 `id`。
  - `3074BAF05FB59C2E0CB879C126A49989`：13 个正式表、17 个视图身份、2 条 GetDependValue cascade。
- 页面发布器在独立 Dataset 文件存在时生成 v2 manifest；接通前 D3 不切运行链。保存直出接通后可读取文件，但仅切具备完整 owner 的页面。
- 83 项相关测试、spark-data/root typecheck、目标 ESLint、docs 与 diff-check 通过。

## 2026-11-23 保存直出接通

- 在 `DataSet.saveChanges` 增加唯一保存完成钩子；数据空间设计 session 将 metadata/file-definition 保存确认后导入同一次正式 Plan 发布链。
- spark-data 新增 builder：从 Base_DataSet/Base_DataModel/Base_DataModel_Field/Base_DataModel_Relation 的正式回读行和已保存 ScenarioViewConfig 生成 `spark.runtimeDataSetPlan`。
- `Name` 是运行模型注册名，`MetaName` 只作为物理来源名；纠正初版反转后 D3 Plan 与正式 readModel/页面 DataViewKey 身份一致。
- 独立 Plan 文件由 SPARK data `FileResource DataView` owner 写 `DataSet/<scenarioId>.dataset.json`，采用 working replacement，无版本号、无 Plan 文本嵌入，并在同一 save owner 内精确回读。
- D3 实服已生成并回读：9 个正式模型、188 个 modelFields、33 个 views、669 个 viewFields，contentHash `fnv1a:a412107b`。
- 正式资源类型不限定数据库表：builder 保留 Type，runtime 通过现有 `DataSpaceDesignApi.resolveTableResource()` 承接数据库表/数据库视图/逻辑视图/字典/接口/JSON/文件/数组；无 `modelBinding` 的 page-local file/command owner 不伪装成正式 Plan 模型。
- D3 cold-assemble 通过：WorkingDraft/ContentProject/ContentRevision/ContentNodeVersion/RevisionSnapshot 的关键五个 view 全部存在；仍只有 0 条模型关系、0 条 query cascade。
- 379 项设计页、40 项 lowcode 装配、7 项 Plan builder/parser/compiler 测试通过；根 typecheck、目标 lint、lowcode contracts、page-thin、ClassModel 生成及 diff-check 通过。

## 2026-11-23 参考集成端复核与语义补齐

- 参考集成 tip `7c728cfaf` 证明导航宿主管理与蓝图共用同一数据空间设计器；不是两套导出。资源目录新增平台接口 `base_platform_api_resource`，保存 `MetaName=资源ID`、`DbName=module_code`，由 `route_spec/output_path` 生成输出与输入字段；当前本仓尚未接入该来源目录，不能用旧 `Base_DataServiceInterface` 冒充。
- 本仓 Plan `viewFields[].id` 已改为独立视图字段身份；compiler 使用 `modelFields` 重新解析 `resourceFieldId`，不再把视图字段 ID 当正式模型字段 ID。
- 独立 Plan 装配已复用正式数组模型 `items`，通过原 `DataViewArrayQuery` owner 查询；不是把数组 JSON 写入 Plan，也不在 Plan 中保存 rows。
- 结构未变化时复用旧文本，避免 `savedAt` 单独改变 publication SHA；parser 严格拒绝重复 viewField identity。
- Plan v1 无 pagination/allPages 字段；builder 对无法无损表达的 `pagination:none/allPages:true` fail-closed，不静默降级为 paged。D3 当前已生成文件保持可运行 proof，但下一次含不兼容查询语义的保存会明确阻断，不能增加 Plan 兼容字段。
- `平台接口` 已加入正式资源 wire/原生 owner 映射，独立 Plan 可装配为 `third-party-api`；未把平台接口与外部接口、数据库来源混同，也未伪造 route_spec。
- 平台接口来源数据层已可直接查询 `base_platform_api_resource`：仅消费 enabled=1、按资源 ID 精确回读，完整校验 display/module/route_spec/output_path，并从 route_spec 生成输出字段及 inputParams。此路径仍由 SPARK data-space query owner 承接，不在页面读取 route_spec。
- Page16/18 命名视图已改为 Plan-v1 可表达语义：目录在 reader 显式 allPages，原试次使用 pageSize=2 的 bounded page；不再把 `allPages/pagination:none` 写进独立 Plan，也不降低多行拒绝。
- 纠正 Agent 架构：派发不是“前端 command claim → Agent SSE”。所有 SmartBid 页面动作统一经 `spark-ai ClassModelAgentAdapter + AiAgentHost`，由低码 SSE bridge 执行；`/api/ai/turns` 正式 ACK 的真实 sessionId/turnId 是受理 proof。
- 已删除 `createSmartBidRuntimeClaimOwner`。SSE ACK 后超时/断流返回明确 `SSE_UNKNOWN` 并保留真实 ACK，不自动重发；前端本地 turnId 只用于 isolation，不冒充后端 turn。
- Agent 内部工具副作用仍通过当前 PageRuntime 的原 DataView command/其他正式 owner 保存并回读。SSE 只编排与传输，不替代业务持久化。
- `createSmartBidPageActionSubmit`、Page18、Page19/标准动作入口已统一使用同一 `createSmartBidAgentDispatcher`；生产源码不再直接绕过 Spark AI 调 runtime action owner。
- Page16/18 不再寻找 `KnowledgeGuide` 数据 owner；知识已转为 ClassModel。`ContextManifest/GenerationRun` 也不映射为 D3 模型：前者是 command inputs，后者是 SSE ACK + 当前 PageRuntime owner receipt。
- 2026-11-23 实服平台接口只读复核：AI/SSE 资源已证明，包括 turn create/status/messages/tool-executions；但这些接口不自动提供业务参数合同或 owner receipt，因此派发结果显式携带 canonical parameters/inputDigest/session/turn/receipt，回查直接验证该参数，不从接口猜装模型。
- 本轮最终验证：SmartBid 139 文件 884/884、参数化 Page18 定向 13/13、Dataset/AI smoke 9/9；root typecheck、目标 lint、lowcode contracts、page-thin、docs、ClassModel、diff-check 通过。

## 任务目标

将 SmartBid D3 场景第四文件从 `pagedata.json` 切换为独立 `DataSet/<scenarioId>.dataset.json`，严格使用参考仓 `spark.runtimeDataSetPlan` 文件合约，并由本仓 `packages/spark-data` 原生装配、查询、级联、命令与保存。

## 阶段与业务语义

- 本阶段只迁移 `D3BBA1F0780056C837AC35E9825CAD5A`，不切换其余动态场景或仓内系统场景。
- D3 Dataset Plan 包含完整 `models/modelFields/views/viewFields/relations/linkage/inputParams`，运行 rows、权限凭据、草稿和临时结果不写入文件。
- 数据空间设计保存时沿 SPARK data FileResource owner 生成 `DataSet/<scenarioId>.dataset.json`；运行只读取、校验、发布和装配，不创建/列举 Dataset 版本。
- 每次 D3 PageRuntime 只读取独立 Dataset Plan；spark-data 直接消费 `views[].dependencies` 与 Filter `GetDependValue`。
- Page16/18 的目录、Agent dispatch、原试次读取等必须先登记为正式模型及命名视图，再由 Plan 的 models/views 描述。独立 Dataset 合约不增加 command 字段，也不通过页面专属 host 替代正式模型。
- 新文件精确回读、正式 DataSet 装配、D3 级联与 Page16/18/19 smoke 通过后，删除 D3 的 pagedata 运行读取，历史旧文件仅保留审计证据，不作为运行 fallback。
- Page12/14 子节点权限阻断、Page15 多节点发布及其它 pageId pointer 不在本阶段被重建或绕过。

## 影响范围

- `packages/spark-data/src/runtime-data-set-plan/`（新领域目录）
  - 直接复制独立 Dataset 文件 schemaVersion/kind/types。
  - 严格解析、校验 contentHash/source/scenarioId、models、fields、views、dependencies 与 relation identity。
  - 提供原生 `DataSet.fromRuntimePlan` 装配入口；文件合同不转换为 pagedata JSON。
- `packages/spark-data/src/types.ts`、`dataset.ts`、`strategies/cascade/`
  - 增加 runtime Plan dependency 元数据及 GetDependValue 过滤物化。
  - `emptyValueMode` 直接由 DataView query/cascade lifecycle 执行。
  - 不恢复旧 `viewCascades` 兼容转换，也不新增页面级级联 owner。
- `packages/spark-project-model/src/scenario/`
  - 只负责项目模型、发布来源与 Dataset Plan 文件资源身份；解析和运行逻辑归 spark-data。
  - 替换 D3 对 `ScenarioViewConfig/ScenarioViewFile` 的发布读取入口；不保留双合同。
- `packages/spark-project-model/src/project/`
  - Dataset Plan 的工作文件、mtime/contentHash 读取与 publication 文件来源。
  - publication manifest 从 pagedata snapshot 改为 Dataset Plan 身份与哈希。
- `packages/spark-data/`
  - 原生解析 Plan 的 models/views/dependencies/GetDependValue。
  - 将设计态 `DependKey/SourceDataViewId/SourceField/EmptyValueMode` 直接落到 DataView query cascade。
  - command/logical-view/file resource 仍走现有 DataView source 生命周期和权限。
- `src/lowcode/lowcode-runtime.ts`
  - D3 场景文件读取改为 `DataSet/<scenarioId>.dataset.json`；删除 D3 pagedata 运行分支。
  - 不增加 Dataset writeText、createVersion/listVersions；保存入口继续由后端数据空间设计服务生成文件。
- `src/lowcode/data-space/lowcode-data-space-runtime.ts`
  - D3 通过新的 Dataset Plan contract 装配，不从 pagedata 生成 `ScenarioViewConfig`。
- `src/lowcode/data-space/lowcode-data-space-assembler.ts`
  - D3 输入改为 spark-data RuntimeDataSetPlan；普通场景继续消费 ScenarioViewConfig。
  - Plan 中模型名称、modelId 与正式 backend metadata 逐项比对后绑定 query/save owner。
- `src/views/features/application/smart-bid/**`
  - Page16/18 `rule.json` 绑定新 Plan 中的正式 DataView。
  - 只有 D3 正式模型 owner 证实后才删除 `content-operation-target`、`knowledge-directory-script-host`、`smart-bid-page-call` 中的对应分派；缺失即标 blocked，不用假模型代替。
- `config/pages/**` 与 repository glob
  - D3 不来自仓内静态场景；首批不迁移其它系统 pagedata。
- 测试
  - Plan parser/roundtrip、spark-data dependencies/GetDependValue/empty mode、lowcode D3 runtime、publication、Page16/18 renderer 与 stale/fail-closed 路径。
- `notes/data-space-retirement-ledger.md`
  - 记录 D3 新文件名、hash、版本切换、旧 pagedata 删除结论及 smoke proof。

## 技术方案

1. **正式模型预检（实施前硬门）**
   - 重新读取 D3 的 Base_DataModel/Base_DataModel_Field/Base_DataModel_DataView 与关系。
   - Page16 目录已走 ClassModel 知识；Page18 Agent dispatch 走 Spark AI SSE ACK，不找 command/claim view。仅为 ContextManifest/GenerationRun dispatch-read/rework 找正式模型 ID、视图 ID 和唯一 primary key。
   - Page16 目录已走 ClassModel 知识；Page18 Agent dispatch 走 Spark AI SSE ACK，不找 command/claim view；上下文进入 command.inputs，原试次读取只校验显式派发参数，不再寻找 ContextManifest/GenerationRun DataView。
   - 任一动作没有正式 model/view owner，立即 `blocked`；独立 Plan 不新增 command 字段，不回退页面 host。
2. **复制独立文件合约**
   - 在 spark-data 增加严格 `spark.runtimeDataSetPlan` 类型和 parser，JSON 顶层、字段名、schemaVersion 与参考仓一致。
   - Plan 由 D3 正式 metadata 生成，`contentHash` 为稳定结构指纹，`savedAt` 为保存时刻。
3. **spark-data 原生运行**
   - `DataSet.fromRuntimePlan` 建立 DataTable/DataView。
   - `view.dependencies` 保存 source view/field/DependKey/EmptyValueMode；Filter 中 GetDependValue 只在 spark-data query path 物化。
   - 标量保留运算符，数组且 eq 升级 in；空值分别实现 emptyResult/omit/asNull；旧异步结果按 DataView generation 失效。
   - 页面规则只使用 `scenarioId@model.metaName@view.id`，不持有 metaName/URL/rows。
4. **D3 文件 owner**
   - 工作文件固定为 `DataSet/D3BBA1F0780056C837AC35E9825CAD5A.dataset.json`。
   - metadata 保存确认后由 SPARK data FileResource DataView working replacement 写入并精确回读；不创建 Dataset 文件版本。
   - publication manifest v2 嵌入该 Dataset Plan 的不可变 text/sha256/sourceRevision，不引用 pagedata，也不创建 N__dataset 快照。
5. **运行 publication 切换**
   - page-runtime-pool 对 D3 manifest v2 调用 Dataset Plan；其它旧场景仍按原 schema1。
   - D3 中任何文件丢失、sha 不一致、正式 metadata 不匹配或模型 resource owner 缺失都 fail-closed。
6. **D3 数据空间设计切换**
   - D3 设计仍调用原正式 metadata DataSet 保存，保存完成钩子从正式回读和当前 saved ScenarioViewConfig 生成完整 Plan；不手工重写 modelFields 真源。
   - 旧 `SysForm/D3/pagedata.json` 不再提供运行配置。
7. **Page16/18 验证**
   - 目录/dispatch/read/rework 都从新 Plan 中的正式 DataView 执行。
   - 删除被替代的 SmartBid 页面 host 分派；rule 只声明标准动作和结果呈现。
8. **切换与删除**
   - 新 Dataset 文件、manifest、D3 page pointer 分别精确回读。
   - Page16/18/19 冷开及查询 smoke 成功后删除 D3 pagedata runtime 读取。
   - 远端旧 pagedata 文件保留只读审计；不删除历史，不在运行时 fallback。

## 兼容性

- 本批只切 D3；其它场景继续使用现有 pagedata 入口。
- D3 的旧 publication manifest 不再作为新 PageRuntime 输入；重新发布使用 Dataset proof。
- 其它 D3 三文件 pageId/导航节点保持不变，Page12/14 权限阻断不受影响。
- 这是有意的 D3 第四文件协议替换，不提供运行回退兼容；失败时保留旧 pointer/旧文件事实并停止切换，不自动同时读取两套。
- 参考仓 Vue Provider/Host 不进入本仓；只复用文件合约。

## 验证计划

- 开始编码前：`git status --short`、确认 D3 关联文件当前内容、运行 `pnpm run typecheck` 记录基线。
- 类型检查：`pnpm run typecheck`。
- Lint：改动文件目标 ESLint；若影响公共包，运行该包既有 lint 命令。
- spark-project-model：Scenario/Dataset Plan parser、roundtrip、stale/contentHash、publication receipt 测试。
- spark-data：query cascade 标量/数组、多父、empty mode、late result、selection release 与 command source 测试。
- lowcode：D3 装配与非 D3 pagedata 回归，确保改动只切 D3。
- SmartBid：Page16/18 config、page runtime、published route、old host 已不可达、Page19 不回归。
- 合同门禁：`pnpm run verify:lowcode-contracts`、`pnpm run verify:class-model`、`pnpm run verify:docs`、`pnpm run verify:page-thin`。
- 浏览器烟测：D3 新 Dataset 文件 exact readback，Page16/18/19 关闭重开，正式 query/command proof。
- `git diff --check`。

## 风险项

- 参考 Plan 会完整复制模型/字段投影，而本仓正式模型仍在数据库；Plan 必须在装配时与当次正式 metadata 一致，不能手工编辑为第二数据库真源。
- 参考 Plan 不自动承接 SmartBid 复杂 Agent owner；缺少正式 command/logical-view owner 时必须阻断并登记，而非保留 TS 页面 host。
- 独立文件与 publication manifest 不同于旧 pagedata snapshot；必须防止旧 manifest 被新 loader 当作可运行 proof。
- D3 正式模型可能比现有九模型更多；生成 Plan 前必须重新读取正式模型与视图，不能用旧 manifest 中九表静态硬编码。
- 线上保存与旧 pointer 切换不构成跨来源事务；文件、manifest、蓝图 pointer 分别回读。
