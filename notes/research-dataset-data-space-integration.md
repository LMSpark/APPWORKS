# DataSet 整合 SPARK 数据空间研读

> 历史研读取证，非现行方案：页面是工具，场景是调用参数；一份 pagedata 对应一个场景，组件有效绑定包含真实 scenarioId。当前交付与验证见 `research-project-blueprint-integration.md` 末节。本文的旧草案、早期单实例现状和合同讨论不能作为默认值、实施入口或兼容依据。

日期：2026-10-06

当前用途：保存研读证据及用户已明确的语义映射，不是实施批准，也不是产品事实源。当前工作树已有计划文件及 P1/P2 改动；下文的早期基线与当前状态须分开阅读，历史验证记录不等于本轮复验。

## 用户已明确的目标与映射

- 先深度分析、形成完整方案、逐项验证；重要内容人工审核通过后才能实施。
- sparkproject 中 SPARK API 的请求上下文，对应本仓 DataSource。
- 场景对应本仓 DataSet。
- 模型对应本仓 DataTable。
- 用户补充：GetData 参数从语义上对应 DataView；场景和模型身份分别由所属 DataSet/DataTable 提供，DataView 负责查询定义，DataSource 消费返回结果与权限。
- 用户使用的 `datasouse` 按本仓实际声明 `DataSource` 核对。
- 不能把本仓当前“物理资源 → DataTable，模型 → DataView”的实现直接当作整合终态。
- 保持本仓主框架不变，不移植或替换为参考仓的整套运行框架。
- 对不上现有结构的可持久化内容先由 JSON 文件承载。
- 持久化已按用户要求完成“全 JSON”和“表＋JSON”源码比较；第 8 项已选择表＋JSON：后端表负责正式场景/模型/字段定义，JSON 负责页面绑定、视图及未匹配配置。
- 分析现有后端源代码，不修改 Java；在后端建立与本仓一致的页面文件结构，可参照本仓历史 Git。
- 数据权限体系完全按 sparkproject，不能另建前端或 JSON 授权规则，也不能用公开查询替代原场景权限。
- 最新优先级：先确定前端契约，以稳定 class 按领域层次组织，避免 interface/type/helper/class 大平层；持久化选择随后进行。
- 用户已确认三类骨架：保留 DataSet / DataTable / DataView，由 DataView 承接 DataSource 和原 SPARK 查询上下文，不新增独立 DataSource class；该确认不批准实施。
- 前端契约问题 1 已确认：页面 tableName 保持稳定，显式绑定后端模型 ID 与查询用 Name。
- 前端契约问题 2 已确认：未保存修改存在时，拒绝刷新、筛选或级联查询替换当前结果；调用方先明确保存或放弃。
- 前端契约问题 3 已确认：拒绝同模型多视图一起保存，要求调用方明确选择一个视图；写入前检查并保留全部未提交修改。
- 前端契约问题 4 已确认：原 SPARK 上下文只保留为 DataView 内部状态，组件和脚本经 DataView 集中权限入口消费。
- 前端契约问题 5 已确认：按页面生成迁移预览，人工审核后逐页切换。
- 前端契约问题 6 已确认：普通查询失败保留上次成功数据，标记旧结果并暂停编辑，查询成功后恢复。
- 前端契约问题 7 已确认：同场景不同模型统一调用一次 SPARK save；要求事务保证时显式报不支持。
- 第 9 项已确认：将必要的原 SPARK 查询/保存/权限实现收进本仓既有 API 包，替换对应旧路径，并验证与参考仓一致；不接入参考仓整套运行宿主。

## 本次取证位置与工作树

- 目标仓库：`D:/SPARK_AppWorks`，分支 `feat/agent-workflow-node-contract`。
- 目标 HEAD：`a7f2cf2e16e43dc1051855dfd87b0dbdf2cc7834`。
- 参考仓库：`E:/r/sparkproject`，HEAD `842dec4f11b333df904b9a4e26b6566b0802bab8`。
- 后端只读仓库：`E:/lowcode-jdk17`，分支 `codex/runtime-application-directory`，HEAD `37770101945b1f8042013066f77a933be2d19d24`；本轮两次 status 均无未提交改动。
- 两仓当前工作树是本次取证依据；HEAD 不代替未提交文件内容。
- 开始前本仓有未跟踪 `notes/plan-remove-get-current-user.md`、`notes/research-architecture-overview.md`，保持原样。
- 参考仓库有 UI 数据源、表单和网格等未提交修改，只读查看，不覆盖、不回滚。
- 早期研读时尚未修改生产源码。2026-10-06 本轮 `git status` 与 diff 已确认工作树包含序列化、场景/模型身份和按模型装配等改动，以及另一任务的未提交修改；全部保留。本轮仅修订研读及方案文档，不据历史记录推定后续阶段已获批准。

## 已核实的源码关系

| 项目 | 当前源码事实 | 证据入口 |
|---|---|---|
| DataSet | 持有 tables、资源关系、视图级联、保存编排、序列化与生命周期；当前工作树已增加 scenarioId，早期无此字段 | `packages/spark-data/src/dataset.ts`；当前 diff 已复核 |
| DataTable | 持有结构、columns、API 配置及多个 DataView；CRUD service 在 table 级共享 | `packages/spark-data/src/data-table.ts`，本文件完整阅读 |
| DataSource | 当前是 UI 消费的数据契约，含 rows、columns、total、选择态、分页和 permissionSnapshot | `packages/spark-data/src/types.ts:1107` |
| DataView | `implements DataSource`，持有查询状态、请求参数、行和权限快照 | `packages/spark-data/src/data-view.ts:219`；本文件 2387 行已完整阅读 |
| 组件数据源 | `DATA_SOURCE` 的实例类型是 DataView | `packages/spark-component/src/core/capability-keys.ts:220` |
| 组件绑定 | DataViewKey 用 `tableName@viewId`，经 DataSet.getView 定位；表标识变化会传播到页面配置与组件引用 | `packages/spark-data/src/core/data-view-key.ts` |
| 当前装配 | （已于 2026-10-06 取代）原为按 resourceId 建 Table、modelId 用作 viewId；现为一模型一表，`tableName=modelId`，单一 `default` 视图，见 `knowledge/page-design.md` | `src/lowcode/data-space/lowcode-data-space-assembler.ts` `modelTable()`；`lowcode-frontend-model-adapter.ts` |
| 旧行为测试 | 早期断言一个资源对应一个 Table、多个模型对应多个 View；当前工作树已有相应测试改动，历史通过数量不能代替当前验证 | `packages/spark-data/src/tests/data-table-responsibilities.test.ts`；`tests/auth-nav/data-space/lowcode-frontend-model-adapter.test.ts` |

### 两种 queryContext 不能直接等同

1. 本仓 `DataView.queryContext` 是后端无关的查询输入记录；`loadFromServer` 将它写入 `loadParams.context`。它只是 DataView 查询定义的一部分，不等于完整 GetData 参数；过滤、排序、投影、分页、树等同样属于 DataView。
2. SPARK API 的 `SparkResourceQueryContext` 是查询结果上下文，含 rows、total、allowAdd、rowKey、增改删动作状态及 fieldAccess。
3. SPARK API 将原始行、协议 DataTable、scenarioId、registration、scope 存于以原上下文对象为键的 WeakMap。重建对象会失去内部身份；执行域校验会拒绝过期 scope。
4. 本仓 `ingestPermissionSnapshot` 当前需要每行携带 `lingma_sys_params`，SPARK API 的公共 rows 则会去掉 wire 系统字段；直接替换返回对象无法满足现有权限登记链。
5. 已确认由 DataView 承接原上下文，并在未保存修改存在时拒绝替换结果；具体公开成员、保存桥接及多视图基线处理仍需形成完整契约。

证据：参考仓 `packages/data/spark-api/src/public/contracts.ts:136`、`resource/query-context.ts`；本仓 `data-view.ts:1337`、`:1583`、`types.ts:1584`。

## 已有设计与运行链路

### 本仓

- `DevDataSetDesigner.vue` 当前经 `project.getDataSetTool()` / `editDataSet()` 编辑 pagedata 内存模型；本文件及 `src/services/project-model-artifacts/page-data-designer.ts` 已完整读取。设计器刷新按钮只重新取得当前内存工具，不代表向后端重读。
- `PageDataSetFile` 管理 pagedata 的 DataSet、撤销重做和序列化。
- 页面绑定携带 formKey、dataSpaceId、modelId；宿主调用 `loadBoundDataSpaceDataSet`。
- 运行装载读取设计快照与平台权限，再由 LowcodeDataSpaceAssembler 建 DataSet。
- 当前运行请求发送模型 Name、物理 MetaName、Type、主键、字段等；设计读取还依赖物理目录。
- 设计读取的资源解析目前显式限制 table/view，其他类型报缺少稳定资源目录身份。
- 已有设计与运行 mutation API 只准备命令；命令中的 journal、readback、compensation 声明不等于已执行持久化或回读。全仓引用搜索尚未找到这两个数据空间命令的执行消费方。

### 参考仓

- 场景资源身份采用 scenarioId + metaName；这里的 metaName 是正式模型 Name，物理来源名另有 sourceName。
- 业务运行查询由后端解析模型，客户端不以前置扫描设计表作为普通业务查询的必要步骤。
- 正式设计读取入口显式区分 designScenarioId 与 dataSpaceId，校验完整分页、归属与主键证据。
- 数据空间设计 class 拥有读取基线、模型/字段/关系保存、布局回读和执行域失效校验；该文件目前只完整读取了若干相关方法区段，剩余部分及依赖尚待研读。
- SPARK API 是私有 workspace 包，并依赖认证、通信、菜单、实时等包；复用方式不能假定为直接增加一条 npm 依赖。

证据入口：本仓 `src/lowcode/data-space/`、`packages/spark-lowcode-api/src/platform/data-space/`、`packages/spark-project-model/src/page/content/dataset-file.ts`；参考仓 `packages/data/spark-api/src/public/data-space.ts`、`src/data-space/runtime-api.ts`、`src/space/data-space-model-api.ts`、`apps/appworks/src/data/api/data-set/design/data-space-design.ts`。

## 后端表与 JSON 的持久化证据

### 已存在的存储边界

| 存储 | 参考仓实际内容 | 本仓对应核查 |
|---|---|---|
| `Base_DataSet` | 数据空间记录，含 rowid、Name、Type、description、inputParams | 场景与 DataSet 对应；场景授权标识与 dataSpaceId 仍须分别保留 |
| `Base_DataModel` | 模型 rowid、dataSetId、Name、MetaName、来源类型、查询/联接/树/CRUD 配置 | 模型与 DataTable 对应；Name 是模型名，MetaName 是物理来源名，两者不得混用 |
| `Base_DataModel_Field` | 模型字段身份、来源名、别名、类型、输出、主键、排序、表达式等 | 核对 DataTable.columns；本仓计算表达式与后端 Expression 不得只凭名称认为等价 |
| `Base_DataModel_Relation` | 父子模型标识、depType、filter、cascadeDel 等 | 核对资源关系与视图级联；一个后端关系不必与两类前端关系一一等价 |
| `designfile / SysForm / {dataSpaceId}.json` | 当前数据空间设计图，含 nodes、edges、graphVersion | 与本仓 DataSet.layout、其他未对齐配置的分配方式尚待方案裁决 |
| `designfile / {projectId}/{pageId} / pagedata.json` | 本仓现有页面 DataSet 文件读取定位 | 属于现有页面文件框架；与正式空间配置的真源、引用和编辑投影关系须明确 |

表字段依据：参考仓 `apps/appworks/src/data/api/data-set/design/contracts.ts`、`records.ts`；JSON 依据同目录 `data-space-design.ts:624`；本仓页面定位依据 `src/lowcode/lowcode-runtime.ts:86`。

### 已核实的读写缺口

1. 本仓 `createLowcodeProjectGateways` 只给 pageFiles 注入 `readPageFile`（`src/lowcode/lowcode-runtime.ts:394`）；`PageFileApi` 保存能力是可选网关，没有提供时显式报错。`ProjectWorkspace.savePageFileFromModel` 先 await 网关成功才 markFileSaved。不能把编辑器可修改等同于后端可保存。
2. 本仓 `LowcodeDesignApi` 只提供文件读取和列表；`LowcodeDesignFileUpload.uploadTextVersion` 固定 `isReplace:false`，是追加文件版本，不能直接当成数据空间 JSON 替换接口使用。
3. 本仓蓝图文件版本只覆盖 rule/script/style，未覆盖 pagedata。保持主框架不变需要核查现有网关的接入边界，不可直接宣称所有文件已具备版本治理。
4. 参考仓 `readGraph` / `writeGraph` 使用 designScenarioId 授权、dataSpaceId 命名文件，写入 `isReplace:true`；不能用同一个 ID 替代两个含义。
5. 参考仓设计页面明确处理“正式表保存成功、图文件保存失败”并显示警告（`use-data-set-design-page.ts:1450`），说明当前调用链没有提供表与 JSON 原子保存的证据。
6. 参考仓 JSON 解析和图 normalize 会保留未知顶层键，但最终 `SchemaGraph.saveGraph()` 从画布 `getGraphRawData()` 重建对象。尚未验证扩展键经画布加载—编辑—保存后可完整保留，不能直接把未匹配配置塞入现有图文件并假定无损。

### 配置与运行态的区别

- 本仓 `ViewMetadata` 已可序列化过滤、排序、分页初值、自动加载、树配置、值/标签字段、提交模式与聚合配置；具体由表还是 JSON 承载仍按语义核对。
- 行选择、请求状态、编辑中的 patch、权限结果和 SPARK API 上下文对象身份属于运行态。后者还依赖 WeakMap；JSON 重建不能恢复授权上下文。这是源码约束，不是删减用户要求。
- 未匹配的持久化配置需要记录归属、格式版本、往返保真及与正式表字段的冲突规则。确切 JSON 文件名和结构尚未批准。

## 后端源码与历史页面文件结构

### 历史证据

历史取证点为本仓提交 `00e67c629`（2026-08-10，切换 lowcode 后端）的父提交 `ab176adc276abbebff38a4a4e1b906e7952766ff`。仅 `git show` / `git ls-tree` 读取，未恢复退役服务端。

- `spark-ai-server/src/main/java/com/spark/ai/config/PagesConfigProperties.java`：根路径默认 `./data/pages-config`。
- `.../storage/FilePageConfigStorage.java`：完整读取；目录由 root / tenantId / projectId / pageId 组成，页面文件落在其下。
- `.../service/PageConfigService.java`：已读文件白名单、版本和创建相关区段；白名单是 rule.json、pagedata.json、script.js、style.css。裸文件是工作内容，`{version}__{filename}` 是版本快照，升版独立触发。旧 file_version 数据库属于退役实现，不能当成当前 lowcode 已提供的能力。
- 历史 `data/pages-config/lmspark/homepage/dataset-demo/` 真实树中存在上述四文件；当前 `packages/spark-project-model/src/page/page-file.ts` 仍声明同样四文件。

### 当前后端的路径与接口事实

已阅读后端根 AGENTS 和排障手册相关 JSON、应用归属、文件章节，并以当前实现核对。根 AGENTS 引用的 `agent-collab/README.md` 在当前工作树不存在；本任务独立只读分析，不委派、不改后端文档。

`lowcode-file/src/main/java/com/htong/service/impl/FileServiceImpl.java` 的完整相关方法与 `FileController` 路由显示：

| 动作 | 现有接口 | 已核实行为 |
|---|---|---|
| 读取文本 | `POST /api/File/content/text` | 返回 AjaxResult 字符串；不存在报错且不创建文件；10 MiB 上限，检查系统探测的 MIME |
| 保存文本 | `POST /api/File/uploadFileByStr` | FileInfo.content 转 UTF-8；递归创建目标父目录；拒绝空字符串 |
| 列目录 | `POST /api/File/list` | 返回 name/lastModified；无 X-AppId 时使用旧目录算法，与 designfile 读写前缀不同 |
| 下载原内容 | `POST /api/File/DownFile` | 以流返回已有文件，convertType=0 时直接读取；可作为四文件读取适配的待验证入口 |
| 删除单文件 | `POST /api/File/RemoveFile` | 独立文件删除；没有在本链路发现整个页面四文件的事务删除 |

`getAppPathByType` 从 `FileProperties` 的 `dev.designFilePath` 获取 designfile 根。携带 `X-AppId` 时，`resolveFileCustomPath` 通过后端可信应用上下文取得 `designOwnerTenant`，前缀为 `DesignFilePaths_{designOwnerTenant}`。自有应用允许写入、授权应用只读；所有权转让冻结期间禁止写入。

因此，与当前前端 `customPath={projectId}/{pageId}` 对照后的页面物理定位公式是：

```text
<dev.designFilePath>/
  DesignFilePaths_<后端解析的设计所有者>/
    <projectId>/
      <pageId>/
        rule.json
        pagedata.json
        script.js
        style.css
        <version>__<filename>   # 版本语义仍待核对
    SysForm/
      <dataSpaceId>.json       # 参考仓现有数据空间图文件
```

此树是源码路径公式与用户要求的对照，不代表已经创建文件或批准版本方案。物理根以部署配置为准，前端不硬编码磁盘路径，不自行选择设计所有者。`projectId` 与目标应用标识是否一致需要在真实绑定上验证。

### 必须进入完整方案的具体差异

1. **应用身份没有自动补齐**：当前 `LowcodeApi` 拦截器只注入 Bearer；页面文件读写入口没有注入 X-AppId。现有应用选择 store 不等于文件请求携带应用上下文。读取授权应用时，需要在保留主框架的前提下接通明确应用身份，并覆盖读/写/list 一致性。
2. **同名版本并不拒绝**：后端 `processFileUpload` 在 `isReplace=false` 且目标存在时生成带时间与随机数的另一个文件名。返回 `fileName` 仍是请求名，实际路径在 `filePath`。本仓上传封装只检查 Result 是对象。已完整读取消费者 `BlueprintWorkspace.vue`：它忽略上传返回值，按请求的版本名回读并比较内容，然后逐文件切换导航版本指针。内容比较是有效校验，但未证明文件身份、并发版本分配或四文件整体提交。
3. **覆盖不等于可回滚**：`isReplace=true` 的实际实现直接 `Files.write`；虽然注释说会备份，方法中没有相应备份步骤，也没有跨文件事务。不能据注释承诺恢复能力。
4. **空文件不兼容**：当前文本和字节上传均拒绝空内容。本仓 `BlueprintWorkspace.saveDelivery` 已把空字符串转成换行再上传，可作为已有语义的取证入口；PageFileApi 网关尚未实现同样契约。页面文件闭环测试会在任一四文件缺失时 fail-fast，不能用缺失文件代替空脚本/样式。完整方案需要明确空内容和换行的往返语义。
5. **四文件读取需要实际验证**：文本读取只接受 `text/*`、`application/json`、`application/xml`。JS 文件可能被部署环境探测为 `application/javascript`；当前源码尚未证明 script.js 经文本接口总可读取。需验证真实部署 MIME，或验证现有下载接口的 UTF-8 解码路径。
6. **页面版本有缺口**：当前 lowcode 蓝图版本仅 rule/script/style；pagedata 仍在主框架四文件中。历史 file_version 不能直接移植，也不能宣称当前四文件版本已完整。
7. **后端实体与参考仓定义有差异**：当前 BaseDataModel Java 映射 `DbName`，参考设计记录归一化为 DatabaseName；BaseDataSet Java 含 sysid/isCheckLogin/DefaultPermission，而参考设计类型并未完整覆盖。须结合通用 CRUD 的原始记录验证字段映射，不能把 Java POJO 当物理表完整 schema。正式数据库元数据尚未查询。
8. **权限设计不应复制为页面配置**：手册与实体区分设计所有者定义、使用租户 Base_DataSet_Config 和运行权限。页面 JSON 不能据默认值自行生成授权；运行权限仍需以后端查询为准。

后端 read/write/list、上传和实体相关源码已作静态核查；尚未运行 Java 测试、访问数据库、调用在线接口或向后端写文件。FileServiceImpl 的无关转换/导出方法尚未全读，本任务无 Java 改动计划。

## 新增的本地只读验证

使用现有 `tsx` 直接运行内存对象探针，无新增测试文件、无网络与持久化写入：

| 项目 | 实际输出 | 判断 |
|---|---|---|
| DataView 自动选择配置往返 | 保存时 autoCurrentFirst/autoSelectFirst 均 omitted；重新创建后均 true | 原值 false 未保留，持久化保真不通过 |
| 远端类型 DataTable 序列化 | `resourceType=database-table` 的 rows 和 `lingma_sys_params` 被写入 toJson | 当前序列化没有排除查询结果及行权限字段；接入正式持久化前必须明确边界 |

最小复现入口：`DataView.applyViewConfig({autoCurrentFirst:false,autoSelectFirst:false}) -> toJson -> DataView.fromJson`；以及合成夹具 `DataSet.fromJson -> view.ingestPermissionSnapshot -> dataSet.toJson`。两次单行 `pnpm exec tsx -e` 均退出 0 并保留上述实际输出；此前多行探针没有输出，未作为验证证据。

这些结果证明当前差异，不能算作目标行为验收通过。不得以本仓原有 53 项绿色测试覆盖上述未被断言的行为。

## 待进一步核实的风险

- 身份方向已确认：稳定页面 tableName＋显式模型 ID/查询 Name。旧装配按物理资源合并模型，迁移时仍需确认已有 DataViewKey 的转换范围与冲突处理。
- 一个模型的多个查询上下文、视图状态、权限快照和编辑基线的隔离与替换。
- 单页面多个场景的 DataSet 持有与寻址；当前 PAGE_DATASET 是单实例入口。
- 输入参数、字段别名、计算字段、分页起点、树和聚合的语义对照。
- 关系适配目前抽取 GetTableField 等值对，递归时未区分 AND/OR；复合字段、多父行级联需核验语义是否保真。
- 当前 runtime 装配返回 diagnostics，但 `src/main.ts` 的装载回调只返回 dataSet；不完整装配的呈现和失败边界需验证。
- 绑定读取在任一身份缺失时返回 null，渲染器 null 分支采用页面数据；需核验部分绑定与无绑定是否被混为一类。
- SPARK API 上下文失效、权限刷新、并发保存、部分失败与写后回读须覆盖，不能把准备命令、前端顺序或本地幂等键当成后端事务证据。
- 持久化已选择表＋JSON；空间 JSON、页面 JSON 的具体分工与保存失败恢复方式仍需精确方案及审核。

上述为研读发现或待验证推论，未授权实施修复。

## 已运行验证及其证明范围

| 命令/范围 | 结果 | 证明范围 |
|---|---|---|
| 本仓 `pnpm run typecheck` | 退出 0 | 修改前类型基线 |
| 根 Vitest：runtime 装配、frontend-model adapter、relation adapter、designer projection、dataset request orchestration、runtime permission snapshot | 6 文件、20 测试通过 | 现有本地逻辑；夹具不证明线上行为 |
| lowcode-api 包 Vitest：data-space design API、runtime API | 2 文件、9 测试通过 | 现有设计读取、请求构造、权限及 prepare 行为 |
| 根 Vitest：data-table responsibilities、data-view-key、data-view-resolver | 3 文件、24 测试通过 | 现有 Table/View 职责与绑定；包含与目标冲突的旧行为断言 |
| lowcode-api 包 Vitest：design file read/list、upload、blueprint file version | 3 文件、13 测试通过 | 前端 FileInfo 请求形状与现有三个文件的版本规则；未覆盖真实后端路径/MIME/同名改名 |
| 参考 spark-api 包 Vitest：query-context-scope | 1 文件、2 测试通过 | 跨应用、租户、会话修订的上下文 scope 校验 |
| 参考 spark-api 包 Vitest：query-permission | 1 文件、33 测试通过 | 查询上下文的权限消费、读写通道、重复身份拒绝及快照隔离；不是本仓已接入的证明 |
| 参考 spark-api 包 Vitest：data-space-model-api、query-scenario-models | 2 文件、74 测试通过 | 参考包现有模型查询、保存、基线与场景路由行为；不证明本仓多视图接入已经成立 |

合计：本仓 66 项现有测试，参考仓 109 项现有测试。另有两项只读序列化探针复现差异，不计为目标行为通过。未运行完整 lint、全量测试、构建或浏览器验收；未调用线上接口、未写入业务数据。没有“整合完成”的结论。

具体命令：

```text
pnpm exec vitest run tests/auth-nav/lowcode-data-space-runtime.test.ts tests/auth-nav/data-space/lowcode-frontend-model-adapter.test.ts tests/auth-nav/data-space/lowcode-model-relation-adapter.test.ts tests/dev/dev-dataset-designer-projection.test.ts packages/spark-data/src/tests/dataset-request-orchestration.test.ts packages/spark-data/src/tests/permission/runtime-permission-snapshot.test.ts
pnpm --filter @spark-appworks/spark-lowcode-api run test:run -- src/platform/data-space/design/data-space-design-api.test.ts src/platform/data-space/runtime/data-space-runtime-api.test.ts
pnpm exec vitest run packages/spark-data/src/tests/data-table-responsibilities.test.ts packages/spark-data/src/tests/data-view-key.test.ts packages/spark-data/src/tests/data-view-resolver.test.ts
pnpm --filter @spark-appworks/spark-lowcode-api run test:run -- src/design/lowcode-design-api.test.ts src/design/lowcode-design-file-upload.test.ts src/platform/project-blueprint/project-blueprint-file-version.test.ts
# 在 E:/r/sparkproject/packages/data/spark-api 中：
pnpm exec vitest run tests/query-context-scope.test.ts --pool=threads --maxWorkers=1
pnpm exec vitest run tests/query-permission.test.ts --pool=threads --maxWorkers=1
pnpm exec vitest run tests/data-space-model-api.test.ts tests/query-scenario-models.test.ts --pool=threads --maxWorkers=1
```

## 全 JSON 与表＋JSON 对比（已选择表＋JSON）

比较对象是场景、模型、字段、关系等设计定义的存储，不把业务数据库、账号或现有权限配置改成 JSON。两条路线都必须满足“数据权限完全按 sparkproject”。文件服务能保存 JSON，不等于查询和权限引擎会解释本仓的 DataSet JSON。

| 维度 | 全 JSON：设计定义不再登记数据空间设计表 | 表＋JSON：保留现有后端运行定义 |
|---|---|---|
| 本仓结构保真 | JSON 可直接表达 DataSet/DataTable/View 配置；仍需修复往返差异和扩展字段丢失 | 前端同样可保留本仓 JSON 结构；正式后端字段和前端扩展必须逐项指定权威来源 |
| 场景＋模型名查询 | 当前后端不从 pagedata.json 装载模型，不能直接替代现有定义 | 可继续使用 SPARK API 的 scenarioId＋模型 Name，由后端解析物理来源 |
| 数据权限完全沿用 sparkproject | 当前 no-Java-change 边界下，移除场景/模型/字段定义会断开现有模型与权限装配 | 保留已有场景定义和租户权限配置，前端消费原查询上下文；仍需接通本仓消费者 |
| 完整路由查询作为替代 | 无 formKey 分支存在，但普通表查询只可按物理元数据公开基线降级读取；不是原场景权限及 CRUD 的等价替代 | 不依赖该降级路径完成整合 |
| 本仓视图级联、布局、未匹配配置 | 可由 JSON 承载 | 可由 JSON 承载，不必为了后端表结构改变本仓主框架 |
| 模型关系 | 前端能消费自己的关系 JSON；后端流程等调用方不会自动改读它 | 后端实际使用的关系继续登记；页面交互级联独立存 JSON，不能从某一关系表机械推导 |
| 保存一致性 | 少了设计表同步，但仍有四文件、并发覆盖及版本指针问题；单文件写入也未提供 CAS 证据 | 增加表与 JSON 的部分成功风险，需要差异预览、写后回读与明确恢复步骤；现有链路无跨表＋文件事务证据 |
| 不改 Java 的当前覆盖 | 可保存/读取前端设计；没有证据支持完整等价的 SPARK 场景运行 | 源码显示具备延续运行语义的基础，尚需前端适配及真实部署验证 |

### 决定对比结果的后端证据

1. `BasicFunServiceImpl.java:1394` 的 GetData 在非字典路径调用 `PermissionUtil.getDataPermissionModel(formKey)`；有 formKey 时按模型 Name 合并权威定义。`mergeModelsPreferName:1783` 在模型列表为空时直接失败；`applyAuthoritativeModel:2075` 从后端模型补齐 Type、DbId、DbName、MetaName、主键及字段。
2. `PermissionUtil.java:458` 先解析可信应用设计所有者和缓存身份；`:504` 读取场景定义，`:517` 读取 Base_DataModel，`:533` 读取 Base_DataModel_Field。`:618` 把发布方 Base_DataSet 定义和使用租户 Base_DataSet_Config 默认权限分开读取。这里没有本仓 pagedata.json 的解释入口。
3. `PermissionUtil.java:84` 的无 formKey 路径把权限基线设为 visible、模型集合留空；`DataPermissionAspect.java:658` 在缺模型权限明细时仅允许物理 IsVisible=1 的公开读取，并应用脱敏。新增、更新、删除另在 `:1105`、`:1301`、`:1426` 校验真实权限/令牌，不由页面 JSON 的按钮或字段属性授权。
4. 后端 Type=JSON 不是“把 DataSet JSON 当场景执行”：`JsonDataServiceImpl.java:740` 先查 Base_JsonData 定位 jsondatapath 文件，`:78` 按 JSON 数据节点转换、过滤；逻辑视图 `ViewDataServiceImpl.java:61` 先查 Base_DataView_List，`:217` 再把其 JSON 节点转成 TableParam。这两者都不是本仓 DataSetMetadata 格式。
5. 普通模型树由 `PermissionUtil.getTableParams:730` 按模型 Name/PId 建立；不能据此推断关系表无用。`WorkflowServiceImpl.java:261` 查询 Base_DataModel_Relation 并在运行节点时判断关系条件；`FlowServiceImpl.java:4899`、`:4959` 在候选人数据查询中读取模型及关系表并沿关系过滤数据。

以上后端文件位于 `E:/lowcode-jdk17`：BasicFun/JSON/View/Workflow/Flow 在 `lowcode-mainbody/src/main/java/com/htong/service/impl/`，PermissionUtil 在 `lowcode-framework/lowcode-anyline/src/main/java/com/htong/util/permission/`，DataPermissionAspect 在同模块 `config/permission/`。结论为源码级证据，未做在线权限矩阵或真实数据库验证。

### 比较后的候选方向

在“Java 不改、数据权限完全按 sparkproject”同时成立时，表＋JSON 是当前有源码支持的完整运行候选；全 JSON 可作为前端设计格式，但不能宣称已经脱离后端设计表仍保持同等权限。

“JSON 作为完整编辑稿，发布时生成后端表记录”仍属于表＋JSON。它可以保持前端契约稳定，但需要另行审核发布转换、旧设计器并发修改、表/文件回读和失败恢复；不能把它包装成运行时无表方案。用户第 8 项已选择正式定义以表为真源、页面绑定/视图/未匹配配置以 JSON 为真源，不选择 JSON 全量定义反向发布覆盖表的路线。

## 前端契约新增取证

- `DataSource` 当前是 `types.ts:1107` 的输出 type，由 DataView 实现；`DATA_SOURCE` 能力实际声明为 `DataView`（`spark-component/src/core/capability-keys.ts:220`）。用户已选择保留这一骨架，由 DataView 承接原 SPARK 上下文。
- 本仓权限消费者 `PermissionChecker.ts` 直接解析业务行上的 `lingma_sys_params`，`PermissionResolver.ts:98` 的 `permissionMode=none` 还会直接放行动作。sparkproject 的公共契约则从 queryContext 消费权限、对缺上下文失败关闭。实现“权限完全按 sparkproject”需要统一这一消费边界，不能只换一个 HTTP 查询函数。
- sparkproject 的 `SparkResourceQueryContext` 保留原上下文身份和查询快照，公共 rows 不带 wire 权限字段；`createSparkQueryPermission` 是现有消费入口。数据源适配不应重新组装五集合来维持第二套权限判定。
- DataTable 的 CrudService 当前为多个 DataView 共享；每次结果上下文不能存成该共享 service 上的“最后一次查询”，否则不同视图的权限与编辑基线会串用。
- sparkproject 批量保存不允许跨场景，也不允许同一批资源 metaName 重复（`data-space-model-api.ts:693`）。用户已确认本仓同模型多个待提交 View 同批保存时拒绝，要求显式选择一个视图。
- sparkproject 公开 save 参数不接收调用方 queryContext；内部按 scope＋场景＋模型维护最多 16 个基线并选择或补查后保存。DataView 保留原上下文用于消费权限，并不等于现有公开 save 能指定这个对象；多视图保存的正式桥接需按源码验证。
- 早期前端契约取证保存在 `notes/research-dataset-frontend-contract.md`，仅供历史追溯；当前合同与审核范围以现行草案为准，不恢复其中已被用户修正的选择。
- 用户已确认旧页面按页生成迁移预览，人工审核后逐页切换；现有资源→Table、模型→View 的引用转换不能按物理表身份猜测。DataSet 内部 renameTable 不能代替页面规则/脚本引用审核。

## 下一步及人工审核

- 复杂度：复杂，涉及数据模型、运行 API、设计模型、组件绑定和持久化。
- 按 AGENTS.md 逐项澄清真实歧义，一问一答；已明确的三层映射不重复提问。
- 已发出本轮源码研读复述确认；用户随后补充“分析后端、Java 不改、建立与本仓一致的页面文件结构”，现已纳入。该补充不视为具体实施方案获批。
- 已完成后端路径、接口、模型权限装配、关系调用方与历史四文件结构的相关源码核查；按最新要求先确定稳定前端 class 契约，再确定持久化真源分配。
- 原单空间方案已撤回，P1/P2 历史实施摘要与本轮复查边界集中于 `research-dataset-handoff-review.md`。当前只从 `plan-scenario-dataview-extension-integration.md` 继续，未批准的新阶段不得以历史实施记录代替审核。
- 方案需逐项列出精确文件、设计决策、验收证据、风险、回滚与人工审核项；批准后每次只实施一个最小闭环并立即验证。
