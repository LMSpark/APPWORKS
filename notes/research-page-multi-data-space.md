# 页面多数据空间整合研读

状态：历史研读记录；下面的未批准状态与旧方案指针仅描述当时的过程，不再作为执行依据。当前交付与验证见 research-project-blueprint-integration.md 末节，正式多场景合同以源码和产品文档为准。

## 用户最新要求与有效决定

最新统一语义：本仓项目模型以 sparkproject 的项目蓝图为基础；页面是工具，场景是页面的参数。页面工具定义、一次打开的运行实例和场景配置分别拥有身份；单场景 pagedata 补充视图/级联，组件有效绑定包含本次参数解析出的真实场景 ID。同一工具可使用不同场景，不能把页面标识当场景或把一次调用参数固化为工具的唯一空间。蓝图研读见 `research-project-blueprint-integration.md`。

用户追加硬约束：代码、测试、文档、AI 生成物同步清理，删除被替代的旧逻辑，不向后兼容，不保留薄包装转发，按 SSOT 收束。完整清理与验收清单在现行方案维护，研读文件仅作证据；一次性人工审核迁移不成为运行兼容层。

2026-10-06 用户纠正：本仓现状一个页面只有一个数据空间，实际 sparkproject 一个页面可以有多个数据空间，必须按 sparkproject 统一。这是当前目标，不是可推迟的扩展。

保持本仓主框架与 DataSet / DataTable / DataView 三类；DataSet 对应一个场景，DataTable 对应模型，DataView 对应 GetData 查询定义并拥有内部 SPARK 结果上下文。权限完全沿用 sparkproject。保存同场景一次 SPARK save；跨场景不能伪装成同一批或承诺跨场景事务。

先前九项决定中不与最新纠正冲突的部分继续有效。追加决定及本次修正：

1. 运行身份只读，改绑定先明确保存/放弃未保存修改，再重建整页运行数据；旧请求及权限失效。
2. 先前确认绑定表 columns 是设计显示快照、正式定义从后端取得；此后用户进一步纠正 pagedata 与 sparkproject 冲突，空间存在数据库表中、使用场景 ID。因此撤回“每份完整 DataSetMetadata 置入 pagedata 集合”的推论；显示快照不得成为空间持久化真源或运行加载前提。
3. 早先确认过 `#dataSetName@tableName@viewId`。用户最新明确“所以组件绑定要包含场景 ID”，故该项修正为组件完整绑定包含 scenarioId + tableName + viewId，dataSetName 不替代场景身份。沿用字符串形状的候选为 `#scenarioId@tableName@viewId`，待整体方案审核；不自动选第一个空间。二段局部引用只在场景已明确的内部上下文成立。

用户随后再次强调“sparkproject 的运行时，支持多个数据空间”。本次整合必须覆盖同一 runtime 同时持有/访问多个场景，不能只扩展设计器列表，不能增加全局可切换的 currentScenarioId。

持久化仍采用后端表＋JSON；不改 Java；页面迁移先预览、人工审核、逐页切换。模型 ID/查询 Name 与页面稳定 tableName 分开。新问题只问真实新增歧义，不重复九项答复。

用户最新纠正：“pagedata.json sparkproject 矛盾，sparkproject 是存在数据库表里的，用的是场景ID”。有效链路应为页面引用场景 ID → 后端正式空间定义 → 内存 DataSet/Table/View。JSON 仅承接后端无对应项的配置，不能因本仓 PageDataSetFile 目前持有完整 DataSet 就反向规定持久化结构。旧稿 JSON 容纳层问题随前提失效撤回，不再等待该题批准；运行命名集合本身不等于同形 JSON 持久化。

用户随后明确：“pagedata.json 可以简化，按本仓的 dataview 补充，按本仓的关系定义重写”。最新进一步限定：“pagedata.json 实际要新增的就是多个 dataview 和 viewCascades，一个 pagedata.json 对应一个场景”。因此此前把多个场景放入单文件 dataSets，以及将 resourceRelations 一并列为 JSON 新增内容的推论均撤回。正式空间定义仍在后端；页面多场景由绑定与运行集合组织，每份文件补充一个场景的视图和级联。此方向不等于授权实施。用户提醒过历史改动，已核对当前分支可达的实现，见文末。

本次当前源码复核：参考 `data-space/runtime-api.ts:122-170` 按 dataSetId 查询 Base_DataModel/Field 并输出 scenarioId=dataSpaceId；参考 page-data-source.ts:95-104 先 readModel 再以该 ID 查询。目标 `lowcode-data-space-runtime.ts` 已声明绑定页不以 pagedata 为运行真源。后端 BasicFunServiceImpl.java:1405-1427 使用请求 FormKey 取得正式权限/模型再按 Name 合并。只核对本地源码，未联网或写数据库，未重新运行与本次文档修订无关的历史测试。

用户最新明确：“应用、租户是请求时考虑的，不在数据层考虑。”因此下文原 API scope/缓存/认证取证均属于请求/API 层的实现边界，不构成 DataSet/Table/View 新增应用、租户字段、校验或监听逻辑的依据。数据层只提供场景、模型和查询定义；宿主与请求层提供当前应用/租户，处理请求有效性与隔离。组件的场景 ID 寻址与请求层执行 scope 分开。

用户再次纠正：数据空间对应多种数据源，不只是物理表。该范围现已明确，无需再次询问是否支持非数据库来源。DataTable 始终对应模型，不能将当前适配器仅支持数据库来源当作目标限制；“表＋JSON”只描述配置持久化，不描述业务数据来源。集合合同仍待审核，本次纠正不是上一轮集合/API 草案的批准。

## 已核对的单实例入口

- `packages/spark-project-model/src/page/config-page.ts`：`PageDataSpaceBinding` 为单一三元组；`PageNodeRenderConfig.data` 为一个 DataSet。
- `packages/spark-project-model/src/page/content/dataset-file.ts`：PageDataSetFile 持有一个 DataSet；编辑、撤销重做、保存依赖它的序列化。
- `packages/spark-component/src/page/renderer/SparkPageRenderer.vue`：宿主回调仅收一个 binding；绑定页替换 data；PAGE_DATASET 注入一个 DataSet；crudTool 当前也绑定运行 ds，不能未经处理用于只读运行身份后的设计修改。
- `packages/spark-component/src/page/renderer/usePageDataSet.ts`：只释放引用以保护 PageNode 拥有的数据；没有区分宿主新建运行实例的销毁责任。
- `packages/spark-app/src/start.ts`、`router/dynamic.ts`、`src/main.ts`：传递单一 `(binding) => Promise<DataSet>` 回调。
- `src/lowcode/data-space/lowcode-data-space-runtime.ts`：一次读取一个 dataSpaceId，组装一个 DataSet。
- `packages/spark-data/src/core/data-view-key.ts:239`：有 `#scope@tableName@viewId` 解析，但 resolveDataViewKey 忽略 scope，直接调用传入 DataSet.getView；成员解析、诊断同样忽略 scope，`:474 getDataViewIdentity` 也只返回 table.view。全仓静态搜索未找到 descriptor.scope 的实际注册/选集消费者，不能认定已支持跨空间或跨页查找。

## 参考仓运行事实

参考根目录 `E:/r/sparkproject`：

- `packages/data/spark-api/src/public/resource-identity.ts:5-11` 明确同一 Vue 的不同调用可使用多个 scenarioId；平台不维护页面全局场景，不从授权路由树替调用方猜场景。
- `packages/data/spark-api/src/space/data-space-model-api.ts:305-317`：资源缓存键含执行 scope、scenarioId、metaName；查询飞行键再含查询选项。共享 API 实例并不把各场景合并成一个授权/缓存桶。
- 同文件 `:468-487`：每次按 identity.scenarioId 取得资源并查询；`:693-700` 在 I/O 前拒绝跨场景 save 和同批重复 metaName。
- `packages/data/spark-api/src/resource/query-context.ts:7-20`：上下文私有状态含场景、registration、scope；原上下文对象身份不能用 JSON 重建。
- `apps/smart-bid-demo/src/pages/dayou/material-recognition/index.vue:19-22,43-49,91,113`：一个页面 runtime 显式按资源选择项目范围、清单导入、材料识别三个场景；不是切换全局运行场景。
- `packages/data/spark-api/src/public/data-space.ts` 的 SparkDataSpaceReadInput 区分 designScenarioId（读设计表所用场景）与 dataSpaceId（后续业务查询所用场景）；`data-space/runtime-api.ts:167` 返回 scenarioId=dataSpaceId。不能把旧蓝图的 formKey、dataSpaceId、modelId 不经核对自动当作每个新 DataSet 的身份。

参考应用页面并非全是正确范例：material-recognition `:292` 把两个场景放进一次 save，页面测试 `dayou-navigation-host-project-chain.test.ts:1265-1269` 用 mock 接受了它；真实 API 的拒绝条件与之冲突。因此这里只用该页面证明多场景查询意图，不以其 mock 保存成功证明跨场景保存受支持，也不在本任务修参考应用。

## 本轮额外验证

- `%TEMP%/spark-dataset-review-scope.mts`，`pnpm exec tsx --tsconfig tsconfig.json <probe>` 退出 0：`foreignScopeResolvesLocalView:true`、`scopeIdentitiesCollide:true`。对传入 A 数据集查询 `#B@Orders@default` 实际取回 A 的视图，且 A/B 的 getDataViewIdentity 相同。只用合成内存数据。
- 在参考仓 `packages/data/spark-api` 运行 `pnpm exec vitest run tests/data-space-model-api.test.ts -t 'rejects multiple scenarioIds inside one save request before I/O' --pool=threads --maxWorkers=1 --reporter=dot`：1 项通过、58 项未运行。断言跨场景保存被拒且 onQuery/onSave 均未调用。不是参考仓全量测试，不是在线验收。

## 影响面反查

页面数据装载之外还包含：DataViewKey 的 key/member/capability/diagnostic 解析；字段 options、display、Tree、Button、action 数据入口；脚本 `$dataSet/$refreshData`；PageDataSetFile 的编辑与 undo/redo；ProjectModel.editDataSet；DevDataSetDesigner；page-design AI 工作流提示/工具入口。只把 PageDataSpaceBinding 改成数组不足以完成目标。

运行层需持有多个明确场景对应的 DataSet 并管理查找与释放；具体 class/API 尚待完整研读和人工审核。曾提议的命名集合 JSON 序列化已撤回，不能据运行集合存在推导文件结构。唯一现行草案为 `plan-scenario-dataview-extension-integration.md`。

## 接手复查补充

详见 `research-dataset-handoff-review.md` 的 F1—F7。新增已复现：destroy 后迟到查询仍回填一行；本轮只读探针，无网络。已有绿色检查来自前一轮，本轮未重跑全套。

尚未改任何生产或测试源码。旧计划已标 superseded，不能据旧单空间方案继续开工。

## 下一步取证

1. 审核页面集合与 JSON 容纳层合同；已确认的 #数据集@表@视图不重复询问。
2. 按合同继续把 API 原实现移植、设计器多数据集选择和后端保存细化到各自完整源文件及最小验证闭环。当前只完成影响定位的消费者不得标作完整研读或已具备编码条件。
3. 将旧计划的 P3—P8 全部重新对齐多空间边界后再申请具体实施批准。

## 原 API 接入边界复核（集合合同等待审核期间）

本节为源码取证，不是原实现移植完成，也不是新增实施批准。完整读取了本仓 `data-space-runtime-api.ts`、`data-space-runtime-mutation.ts`、`core/lowcode-client.ts`、`lowcode-api.ts`、`lowcode-session-store.ts`、`lowcode-application-store.ts`，并核对参考实现的查询、传输、上下文及 scope 相关方法。参考 `protocol/executor.ts` 和宿主 runtime 仅按相关区段研读，不能标成整文件完成。

### 两个入口的依赖范围

以参考 `space/data-space-model-api.ts` 和 `public/query-permission.ts` 为根，用本仓 TypeScript 编译器 AST 读取 import/export 声明，排除纯类型引用后，静态运行依赖闭包为 19 个参考包内文件：

| 原领域 | 包内文件（相对 `E:/r/sparkproject/packages/data/spark-api/src/`） | 需要保留的语义 |
|---|---|---|
| 模型 API | `space/data-space-model-api.ts` | 多空间缓存、查询基线、并发队列、保存预检查与回执处理 |
| 上下文与资源 | `resource/resource-api.ts`、`resource/query-context.ts`、`resource/registration.ts`、`resource/tree-query.ts` | 原对象身份、原行快照、资源注册、树查询和执行域校验 |
| 协议 | `protocol/data-table.ts`、`protocol/permissions.ts`、`protocol/pagination.ts`、`protocol/save-result.ts`、`protocol/save-action-order.ts`、`protocol/filters.ts`、`protocol/guid.ts` | 请求/结果模型、稀疏权限、完整分页、保存回执、动作顺序 |
| 查询和缓存支撑 | `kernel/public-query.ts`、`kernel/resource-cache.ts`、`kernel/wire-contract.ts`、`internal/value.ts`、`mutation/guards.ts` | 公共查询转换、资源缓存、场景头、稳定缓存键、空变更防护 |
| 消费面 | `public/query-permission.ts`、`public/filter-builder.ts` | 字段/动作消费、查询过滤构造 |

该统计是**文件级依赖定位**，不是最终逐函数移植清单；类型契约、执行器相关方法、宿主传输和会话边界尚须另计。不能用“19 文件”断言全部复制这些文件即可运行。唯一命中的外部运行依赖为 `protocol/data-table.ts` 使用 `@spark-template/core` 的 `ApiError/getApiCode/getApiMessage/isSuccessCode`；具体实现已在 `packages/platform/core/src/api.ts` 核对。没有理由为了这四个语义导入整套参考宿主。

### 传输适配必须覆盖的差异

1. 本仓 `DataSpaceRuntimeApi.queryPayload` 按前端设计快照提交物理 MetaName、Type、PrimaryKeyFields、Fields；参考 `data-space-model-api.ts` 的 protocolTarget 设 `omitWireType:true`，按场景＋模型 Name 执行，由后端解析正式定义。新路径须替换旧路径，不能仍从页面 columns 快照生成权威模型。
2. 本仓 `LowcodeClient.requestResult` 只接受数字 Code=200 并剥离 Result；参考执行器的查询/保存传输请求要求保留响应 envelope、接受该操作的 0/200 成功码，再由原协议实现处理。新 SPARK 传输不能直接复用这个有损解包入口，也不应全局改变其他 lowcode API 的响应契约。
3. 本仓 `HttpClientBase` 已有 `meta.rawEnvelope`、`signal` 和逐请求 `retry`。原查询/保存支撑可以继续使用现有 HTTP 客户端，通过明确配置保留响应；写入禁止继承可导致未知结果自动重放的重试设置。具体错误响应与业务码映射须用对照向量确认，不能只比较成功 rows。
4. 参考 `runtime/transport/context.ts` 与 `tenant-transport.ts` 在最终传输边界固定当前租户的 `tenant-id / visit-tenant-id / x-FirstFolder`，拒绝调用方覆盖；场景来自每次资源身份，应用来自当前宿主。页面 JSON 不能提供任意认证头。
5. 本仓当前 `LowcodeApi` 只给 `DataSpaceApi` 传 HTTP；会话与应用 store 不提供执行域代次。参考 `create-spark-runtime.ts:618-635` 使用正式执行域和执行生命周期作为查询 scope。此差异仅在宿主与请求/API 层内部接线，不给 DataSet/Table/View 增加应用、租户、会话或 scope 注入入口；不能依赖内核可选 provider 的 `'default'` 回退来代替请求隔离。
6. 普通 access-token 轮换与重新登录必须区分：参考源码明确保持同一 tenant＋APP＋sessionRevision 的在途查询身份，重新登录即使用户相同也退休旧执行域。这是原请求/API 层语义；数据层不解析这些值。不能把 token 字符串放入诊断，也不能让每次 refresh 都错误清空有效编辑上下文。认证业务流程保留本仓，请求边界的精确接线方案仍需研读并审查。

### 请求/API 层的增补验收项

- 同租户、同应用、同用户重新登录后，由请求/API 层拒绝旧上下文及排队保存；仅普通 token 轮换时，不无故把相同执行域的请求判作另一场景。数据 class 不感知应用/租户。
- 场景来自数据层的明确绑定，应用与租户由请求层在发送时提供；页面查询输入不能覆盖请求层身份，并发 A/B 场景请求与各自请求上下文匹配。
- 0/200 正常 envelope、错误 envelope、空查询元数据、部分或缺失保存回执、取消与迟到响应逐项对照；未知写入结果不自动重试。
- 明确原实现到目标文件/成员的映射，权限与保存测试向量逐项登记，尚未覆盖的分支不能宣称等价。

本次新增证据均为本地静态读取，没有在线请求。方案中的 JSON 示例通过 JSON 解析与集合键/dataSetName 一致性检查。接手时 24 个非 notes 修改/新增文件 SHA-256 再比对：变化 0、新增 0、移除 0。本轮仅修改研读和方案记录。

## 多来源复查与验证

### 当前源码确认

- 后端 `E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/service/impl/BasicFunServiceImpl.java:1444-1470` 的 GetData switch 分别处理数据库表、数据库视图、字典、接口、JSON、视图。`:2075` 的权威合并从模型带回 Type/MetaName/DbId 等，业务查询按场景＋Name定位，不要求调用方按物理表预判来源。
- 同文件 `:623-685`：该 CRUD 路径的裸模型 Name 经 `findCrudModelByName` 解析，只有 Type=数据库表通过；`:838` 是批量保存对这一解析器的调用。这是该后端路径的局部约束，不能据此在前端按查询来源类型拒绝模型保存。用户随后明确，模型 addApi / updateApi / deleteApi 的写入目标由后端处理，见下方责任边界。
- 同文件 `:1410` 的显式字典分支是后端公共基础能力，`:1481` 对字典固定 allowAdd=false。保持原 SPARK 规则，不因统一 DataView 而另造统一的授权假设。
- 后端 BaseDataModel 的 Type 注释列出文件，但上述 GetData switch 没有文件分支；参考 `resource/registration.ts` 的 SPARK_RESOURCE_TYPES 也未列文件。文件入口需要继续核查，不能把声明存在当作运行已实现。
- 本仓 `data-space-resource-type-wire.ts` 将“数据库视图”和“视图”都 parse 为 view，再 encode 为“视图”；`lowcode-frontend-model-adapter.ts:48` 又把 interface/json/file 一律映射 third-party-api。确有来源语义损失，修复时应明确字段合同，不按标签重新猜路由。
- 本仓 `design/data-space-design-api.ts:308-315` 对非 table/view 直接报“尚无稳定资源目录身份”，`modelFields` 又要求非计算字段存在资源字段目录。因此读设计必须修正来源条件，不能仅扩展 renderer 集合。
- 参考 `data-space/runtime-api.ts` 只对数据库表补查物理来源主键；`formal-contract.ts:45-90` 对其他来源保留 sourceType，并按正式模型字段验证主键。该正式合同仍有有效输出键要求，不能直接宣称支持所有无键/非表格响应。参考 `resource/resource-api.ts:666` 另有保留非表格结果的 invokeInterface 路径，后续需对照其消费者，不能强制转换任意响应为 rows。

### 新执行的只读验证

1. `%TEMP%/spark-dataset-review-source-kinds.mts` 复用既有设计 API 测试的纯内存 HTTP 夹具，不发网络请求；`pnpm exec tsx --tsconfig tsconfig.json <probe>` 退出 0：
   - 数据库表读回 2 模型；字典、接口、JSON、文件均被当前 design.read 拒绝，错误明确为各自类型缺少稳定资源目录身份。
   - interface/json/file 三者均被 adapter 标成 third-party-api。
   - 数据库视图 parse→encode 变为视图；视图 parse→encode 仍是视图。
   - 该探针证明当前限制和类型损失，不证明后端所有非数据库来源均能在线查询。
2. 参考仓 `packages/data/spark-api` 执行 `pnpm exec vitest run tests/query-scenario-models.test.ts -t 'resolves type from the named model|queries later models without a registry snapshot' --pool=threads --maxWorkers=1 --reporter=dot`：2 项通过、13 项未运行。断言字典模型与表模型可以同处一场景；查询使用 Name＋场景头，不发 Type/PrimaryKeyFields、不预读模型目录。仍为 fixture 验证，不是在线验收。

本次只修订方案/研读文件并运行内存探针和既有测试；不修改 Java、前端生产代码、测试源码或后端文件。

## 模型写入目标的责任边界（用户已确认）

用户说明模型包含储存表定义，并明确：“后端直接按 addApi / updateApi / deleteApi 定义搞定，前端不做考虑，我只是告诉你。”这是职责说明，不是新增前端路由或后端实施要求。

- 前端按原场景、原模型身份提交修改，继续消费原 SPARK 权限与保存回执；不解析操作目标、不选择储存表、不重映射目标模型或字段，也不按查询来源类型增加保存拒绝规则。
- 参考仓 `apps/appworks/src/data/api/data-set/design/contracts.ts` 和 `model.ts` 保留三个操作定义；设计器保存 owner/target 模型及目标字段是设计元数据持久化，不能混同业务保存路由。
- 参考仓 `packages/data/spark-api/src/space/model-definition.ts` 的 describeSparkDataSpaceModelApis 将三项定义投影为 crudTargets，源码标注用于元数据工具；本轮检索未发现运行时消费。其存在不构成本仓新增公开 crudTargets 或前端执行逻辑的理由。
- `%TEMP%/spark-dataset-review-storage-targets.mts` 纯内存探针退出 0：参考元数据描述保留接口模型的三个目标值，本仓当前设计快照未保留这些值。该结果只证明元数据投影差异，不要求前端为业务保存补读或执行这些定义。
- 本轮未验证后端在线按这些定义执行写入，不把用户指定的责任归属表述为已通过在线验收。保持不改 Java；撤销此前草案中“非数据库模型在前端整批拒绝保存”及“专用写入待前端设计”的推论。

## 后端页面四文件持久化续查

本节只补齐 G 的源码与验证依据。应用/租户始终归请求层，DataSet/Table/View 不参与文件所有者目录计算。未改 Java、生产或测试源码，未写部署目录或在线业务数据。

### 文件结构与入口

1. 当前 `packages/spark-project-model/src/page/page-file.ts:19` 的 PAGE_NODE_FILE_NAMES 明确四文件为 rule.json、pagedata.json、script.js、style.css。以此为本仓白名单；知识记录中 dataSet.json/script.ts 的旧描述不是当前文件名。
2. Git 提交 `ab176adc276abbebff38a4a4e1b906e7952766ff` 的实际树为 `spark-ai-server/data/pages-config/lmspark/homepage/dataset-demo/`，四文件均存在。历史 FilePageConfigStorage 的 pageDir 为 root/tenantId/projectId/pageId。只复查历史，没有恢复退役后端。
3. 当前 `src/lowcode/lowcode-runtime.ts:86-93` 使用 `designfile` 和 `<projectId>/<pageId>`；`:390-394` 的页面网关仍只提供读取。后端 `FileServiceImpl.resolveFileCustomPath:382-424` 在请求层解析可信应用所有者，得到 `DesignFilePaths_<owner>/<projectId>/<pageId>`。前端不拼接 owner，数据模型不增加应用/租户字段。
4. `FileServiceImpl.getFileContentAsString:115-174` 的文本接口检查 MIME；若 script.js 被部署 OS 识别为 application/javascript，当前白名单会拒绝。`downFile:177-239` 在 convertType=0 时直接输出已有文件原字节，不使用该文本白名单。页面读取可候选统一使用 DownFile 再按 UTF-8 解码，缺文件仍明确失败。
5. `uploadFile(String...):918-924` 与 byte[] 重载均拒绝空内容；multipart 重载 `:829-906` 只要求存在文件项，直接将该项字节交给 processFileUpload。因此 multipart 是保留空 script/style 的可验证候选，不能直接将空串改成换行后宣称原样保存。FileController `:218-243` 提供 POST /api/File/UploadFile，表单含 customPath/appType/isReplace/newName/isCrossEnt。
6. `processFileUpload:990-1015` 使用 Files.write 覆盖，无原子替换/自动备份证据；isReplace=false 遇重名会改用唯一文件名。现有 LowcodeDesignFileUpload.uploadTextVersion 固定 false，只用于追加版本，不能直接当工作文件保存器。

### 保存确认缺口

真实类内存探针复现了保存 A 期间编辑 B、A 回执后 B 被清 dirty，覆盖 script.js 和 pagedata.json。详见复查记录 F9。候选修正须把“实际提交且确认的文本”传到保存基线；仅跳过 markSaved 或粗暴重载回读文本，都不足以兼顾后续编辑与 undo/redo。

四文件并行 Promise.all 位于 ProjectWorkspace.saveDirtyPageFiles:263-270；单项成功即可先清 dirty，后续另一项失败不会回滚前者。因此必须展示逐文件结果，不能把失败说成全部未保存，也不能把批量请求叫作事务。

### 本轮验证

- 本仓临时探针 `%TEMP%/spark-dataset-review-page-save.mts`：最终退出 0，两个文件均确认发送文本不同于当前文本，却被清为非 dirty。无网络请求。
- 后端命令：`mvn -pl lowcode-file -am -Dtest=FileServiceImplContentTextTest,FileServiceImplDownloadTest -Dsurefire.failIfNoSpecifiedTests=false test -q`，退出 0。Surefire XML 确认 7 项、0 failure、0 error、0 skipped：4 项文本/应用目录权限测试，3 项下载测试（缺失不创建、已有空文件、原始字节）。测试使用临时测试目录和模拟请求，不是部署端点验收。
- 另尝试 `%TEMP%/spark-dataset-file-roundtrip.jsh` 直接调用已编译类验证 multipart 空文件；临时执行环境未取得有效结果，日志未出现断言完成标记。此项不计通过，不以 JShell 的退出码代替断言。multipart 空文件、四文件 HTTP 往返及实际部署 MIME 仍待端到端验证。
- 复查 Git 历史和当前白名单确认四文件名称一致。后端测试后 git status 仍干净，未改 Java；本仓在研读期间由外部提交推进至 `76d06b821`，此前成果被保留，本 agent 未执行提交。

本节已补齐页面文件目录、传输入口和保存回执的设计依据；正式场景/模型/字段定义的设计写回执行方仍未完成精确移植方案，不能把页面 JSON 保存通过等同于表＋JSON 全链路完成。

## 正式定义保存链续查

### 读取与写入身份

参考 `E:/r/sparkproject/apps/appworks/src/data/api/data-set/design/data-space-design.ts:266-365`：正式基线从 Base_DataSet、Base_DataModel、Base_DataModel_Field、Base_DataModel_Relation 读取。查询 API 的 scenarioId 为 designScenarioId；dataSpaceId 用于记录 ID 或 dataSetId 筛选。readRecord 校验唯一记录，模型/关系 allPages 后核对 total，readFields 使用 collectSparkQueryPages 按 rowid 排序读全。readFrontModelFields 是另一个刻意筛选的展示入口，不能取代 readFields。

本仓 `design/data-space-design-api.ts:383-418` 只做四次单页读取，且输出为丢弃部分属性与字段类别的投影。真实类内存探针已确认它仍能作为 prepareMutation 的整份恢复前像；详见复查报告 F10。参考的完整正式基线和页面 columns 显示快照必须区分。

### 已核对的保存入口

| 参考文件/入口 | 实际目标与边界 |
|---|---|
| `data-set/list.ts:210-239` create/update/remove | 设计场景的 Base_DataSet；create 在设计管理请求载荷中设置 sysid。该后端正式归属字段不构成本仓 DataSet 或 pagedata 增加 applicationId 的理由；本次不搬应用目录/用户补名 UI |
| `design/data-space-design.ts:754` saveInputParams | 更新 Base_DataSet.inputParams；序列化 Name/Description/IsBusParam/rowid |
| `:769` saveModel | buildDataModelSaveRecord 后保存 Base_DataModel；新增与更新分开；本地构造 ID 与真实持久化回执仍需核对 |
| `:791` syncModelFields | buildFieldCrudPayload 对比前后字段，向 Base_DataModel_Field 发 added/changed/deleted；无差异不写 |
| `:815` saveRelations | 一批 Base_DataModel 与 Base_DataModel_Relation 修改；同设计场景，不由批量形式推定事务 |
| `:963` deleteModelCascade | 删除指定模型、所属字段及两端引用的关系；真实删除仍需完整基线和影响预览 |
| `:623-643` readGraph/writeGraph | appType=designfile、customPath=SysForm、fileName=`<dataSpaceId>.json`。不是 `<projectId>/SysForm`；后端解析所有者目录 |

`design/model.ts:198-240` 的字段差异器按 type+Name 去重并使用 rowid 比较；没有出现在 nextFields 的已有记录会产生 deleted。`services/source-record.ts:206-236` 的快照构造保留 description、allowAIAdd、type 等允许编辑属性，并区分未提供和显式值。因此不能把只含输出字段的页面 columns 直接送入该差异器，更不能忽略 inputParams 类别。

`design/records.ts:25` 的 SysForm 常量，经 `spark-api/src/files/runtime-api.ts`、`application/application-builtin-capabilities.ts:598`、`protocol/executor.ts:641` 传到请求 body；readTextFile 只将 applicationId 分离到请求头，不添加项目路径。主方案此前写入的项目目录前缀已纠正。

参考 UI `use-data-set-design-page.ts:1450-1478` 在正式保存后另行保存图；图失败只提示部分成功。其模型删除入口另有根据 addApi/updateApi/deleteApi 计算隐藏目标的逻辑；用户已明确前端不考虑这些操作目标，本方案不移植该 UI 行为，不增加 Java 改动。

### 设计要求与验证边界

原保存编排由本仓现有 DataSpaceDesignApi 承接；需要的模型/字段/关系差异构造收在现有 design mutation 文件内部，避免 helper 公共面扩散。私有完整基线用于差异预览、写前变化核对、逐项回读和恢复记录；显示快照只用于设计呈现。应用/租户不进入三类数据对象或页面配置，原权限语义不重写。

本轮参考仓命令：`pnpm exec vitest run tests/data/data-space-design-baseline.test.ts tests/data/data-set-field-pagination.test.ts tests/data/api/data-model-field-changes.test.ts --pool=threads --maxWorkers=1 --reporter=dot`，工作目录 `E:/r/sparkproject/apps/appworks`，退出 0，3 文件 16 项通过。其中字段分页测试覆盖 1001 条，字段差异测试覆盖无变化零写入及未编辑正式属性保留；均为 mock 测试，不是后台写回验收。

本仓 F10 临时探针也退出 0，确认缺页及属性丢失被接受；无网络写入。已补 G3 的入口、目标表、文件归属和执行顺序，尚待 F 接入确定私有基线生命周期和执行成员，不能据此标记整个方案完成。参考原 design 大文件本轮按相关方法研读，未声明所有来源初始化/UI 行为均完整读完。

### 接口结果形状补查

参考 `spark-api/src/protocol/data-table.ts:84-137` 的 resultData/resultItems 会处理若干明确封包，支持数组、Items/List 等集合，也将普通对象作为一行；空查询封包与 count-only 对象有单独规则。`:620` 的 applyDataTableQueryResult 同时登记原结果及后端权限。因此“对象不是表格数组”不能成为本仓额外拒绝模型查询的理由，移植需保留原解析向量，而不是重写更窄规则。

另一路 `resource/resource-api.ts:670` 的 invokeInterface 只允许接口类型，委托 `protocol/executor.ts:540` 直接请求 GetData、preserveResponseEnvelope=true，不建立行查询上下文。它保留原始响应，和 query 的对象单行规范化不是同一合同。当前本仓 DataSource（`spark-data/src/types.ts:1117`）仍为行/列消费面，不应把 raw 响应伪造为有 queryContext 权限的行结果，也不因多来源就无消费者地扩增公共类型。

参考包本轮执行 `pnpm exec vitest run tests/resource-api.test.ts -t 'invokes an interface resource without exposing the GetData envelope' --pool=threads --maxWorkers=1 --reporter=dot`，退出 0，1 项通过、34 项未运行；断言接口目标/输入参数和结果保持。该测试模拟执行端，仅证明门面的原始结果透传，不证明线上接口形状或表格解析的全部分支。本轮没有因此新增原始结果前端入口。

续作断点（经用户最新纠正更新）：一份 pagedata 对应一个场景，新增多个 DataView 与 viewCascades；页面可同时引用多个场景，禁止回到单文件 dataSets 包装，也不新增 resourceRelations JSON 真源。下一步补齐单场景文件定位/共享归属的证据和审核项，并继续 F 的原实现迁入、查询输入/显式投影接线、静态本地数据迁移及 G3 执行成员。应用/租户只在请求层、操作目标只在后端。

## pagedata 精简、关系复用与 Git 历史复核

### 现有合同与真实消费者

- `packages/spark-data/src/types.ts:702-779` 的 ViewMetadata 已定义过滤、排序、分页、自动加载/选择、树、值/标签、分隔符、聚合和提交模式；DataView.queryContext 是查询输入，不能与原 SPARK 结果 queryContext 混用。
- `types.ts:883-918` 的 DataResourceRelation 表达表字段关系；`:961-980` 的 DataViewCascade 明确父/子表及视图 ID、filterBindings、触发类型和自动加载。文档与实现都要求分开消费；不再合并第三种关系。
- `dataset.ts:817-852` 分别构建索引；addCascade 对表/视图和过滤字段做校验。`strategies/cascade-delegate.ts` 根据 dependencyType 订阅事件；`dataset.ts:752` 按 filterBindings 生成目标过滤。现有索引在单 DataSet 内，不自带跨空间寻址。
- `strategies/computed-column-delegate.ts:28-64` 使用 resourceRelations.fieldMappings 匹配子行，但固定读取 childTable 的 default 视图，并为每个 childTable 保留第一条关系；不能据类型存在就声称任意命名视图、多关系聚合已支持。
- `types.ts:904-912` 明确 condition 仅预留；源码反查未发现 cascadeUpdate/cascadeDelete 在 spark-data 内执行跨模型写入的消费路径。页面配置不能据标记制造后端操作能力。
- `src/lowcode/data-space/lowcode-model-relation-adapter.ts:125-239` 当前对一条后端关系同时生成两类前端关系，parent/childViewId 固定 default，autoLoad 固定 true；未知 depType 会使两类输出均缺失。该策略是旧适配行为，不能作为本次页面显式关系合同。
- `metadata.ts:25-53` 要求完整表 metadata 具有 columns 和 views.default；`page/page-file.ts`、`compile-files.ts`、`canonicalize-page-data.ts` 当前直接解析/规范化为 DataSet，PageDataSetFile 也持有完整 DataSet。这证明简化文件需要在已有页面领域 class 内区分页面配置与装配后的内存模型，不能只删 JSON 列定义而不改解析链。
- DataView.toJson 当前输出 rows、分页及完整已持有投影；本次页面序列化必须只提取页面拥有的配置，不能把后端装配内容和当前运行结果再抄回文件。既有本地静态初值须单列迁移，不混同远端结果。

### 历史改动已经存在

| 当前分支可达提交 | 日期 | 已核对的实际改动 |
|---|---|---|
| `3955aab57f38fab9f2a205dfbda7b0b07be7697f` | 2026-08-10 | `feat(spark-data): wire lowcode data-space into runtime`：引入 DataViewFieldProjection/查询输入，TableRelation→DataResourceRelation、ViewDependency→DataViewCascade，删除合并的 DataRelation；dataset 内分别建立资源关系和级联索引；新增 lowcode 装配适配器 |
| `0f2a6afedca6a126ad473849ee981b5a84a1b1ce` | 2026-04-17 | `refactor(spark-ai): canonicalize pages-config pagedata schema`：规范化页面夹具，例如 master-detail 将外层 dataset 包装移除，保留当时的 tables/views/default、tableRelations 结构 |

`git merge-base --is-ancestor` 对上述两个提交返回 0；当前源码仍有独立索引与两类关系。`git log --all` 还出现内容相同的历史副本（如 46abd4d87），该副本不是当前 HEAD 祖先；不能只凭 --all 搜索把它当当前分支路径。此处引用已核对可达的提交，不恢复整个旧版本。

结论：已有关系引擎应复用。本次调整集中于场景引用、pagedata 精简及页面显式关系装配；重写的是接入和配置策略，而不是重新发明关系、事件或聚合基础。用户所指“以前改过”的具体一次未强行认定，但上述两次均与当前话题直接相关。

### 本轮验证

```text
pnpm exec vitest run packages/spark-data/src/tests/dataset-relation-rebuild.test.ts packages/spark-data/src/tests/cascade-event-filter.test.ts packages/spark-data/src/tests/cascade-computed-tree.test.ts packages/spark-data/src/tests/serialization/view-config-roundtrip.test.ts --maxWorkers=1 --reporter=dot
```

退出 0：4 文件、16 项通过，覆盖现有关系索引重建、事件过滤、计算字段级联和视图配置往返。存在构建配置提示（esbuild/oxc 同设时采用 oxc），不影响本次断言结果。未把这些测试表述为新简化文件已实现，也未运行新后端写入。

上一稿 JSON 示例曾经解析验证：两个场景引用明确，级联端点存在，没有 columns/api/crudConfig/resourceType/resourceId。用户后来明确一文件一场景，该示例已失效；当时的 JSON 语法检查不证明它符合最新合同，更不是生产解析器验收。

本轮仅更新现行草案和研读记录，运行已有测试及只读 Git 查证；没有修改生产/测试源码、Java、数据库或实际页面文件。

## 单场景文件边界修正

用户明确一份 pagedata.json 对应一个场景，新增多 DataView 与 viewCascades。当前产品入口再次核对：

- `page/page-file.ts:34-39` 按 pageId 生成四文件路径；`:117-128` 空文件生成 DataSet，序列化完整 DataSet.toJson。
- `page/content/dataset-file.ts` 的 value、setText/loadText、getTool/editTool、undo/redo 均持有或重建完整 DataSet。
- `page/config-page.ts` 的 ConfigPageNode 持有一个 PageDataSetFile，toRenderConfig 传单一 dataSpaceBinding 和 data；不会因为文件内容改薄就自动支持页面多场景。
- `src/lowcode/data-space/lowcode-data-space-runtime.ts` 仍按一个 binding 读取权限/正式设计并装配一个 DataSet；它已声明不能把绑定页 pagedata 当正式定义真源。
- 文件 IO 反查指向 `io/page-content-loader.ts:103` 的 projectId + pageFilePath 和 `src/lowcode/lowcode-runtime.ts` 的页面文件网关；现有路径证据不能证明场景文件该共享还是按页面隔离。该决定需明确后才可写后端文件。

新稿只给单场景内容示例，保留模型关联信息以组织命名视图，不复制正式模型定义。不因这一纠正改写 Java、业务源码或现有页面文件。旧计划已标 superseded；resourceRelations 的现有运行机制仍可复用，但其适配问题与新增 viewCascades 文件合同分别处理。

### 组件显式场景绑定补查

用户追加要求组件绑定包含场景 ID，已写入当前草案并替换旧的纯 dataSetName 寻址结论。只确认三元组语义，不把候选字符串编码视为代码开工批准。

- `core/data-view-key.ts:212-247` 当前 parseDataViewKey 可解析 #scope，但 resolveDataViewKey 仅使用传入的单一 DataSet，忽略 scope。`:259-307` 的成员解析同样如此。
- 同文件 `:390-471` 的两种诊断只检查当前 DataSet 的表/视图；`:474-476` 的 getDataViewIdentity 只拼 tableName.viewId。场景绑定必须同时覆盖解析、成员、诊断和身份比较，不能只改字符串样例。
- `components/containers/data-views/view-data-source.ts:111-146` 消费单一 PAGE_DATASET，并在显式键未解析时继续使用继承源。多场景合同下显式无效场景不能回落到父级其他场景；没有独立绑定的子组件继续消费已确定场景的 DataView。
- `components/fields/options/useFieldOptions.ts:79-122` 的选项源和成员读取也使用单一 PAGE_DATASET，需要跟随统一绑定解析。

本轮源码静态复核，未实施或宣称当前组件已支持场景寻址。原有应用/租户请求层归属、单文件单场景、viewCascades 场景内作用域保持不变。

## DataView 查询输入到原 SPARK 的接线复核

当前 `lowcode-data-space-assembler.ts:162-176` 的 runtimeQuery 仅传 model/formKey/filter/sort/page/pageSize，丢弃 params.context、projection 和 viewConfig；modelTable 还把初始 page 设为 0。DataView.loadFromServer 已将 queryContext 和 fieldProjection 传到 CRUD（data-view.ts:1368-1381），缺口位于接入适配。

内存 HTTP 夹具探针 `%TEMP%/spark-dataset-review-query-input.mts` 使用当前真实 LowcodeDataSpaceAssembler / DataSpaceRuntimeApi / DataView；复用现有 runtime 测试构造，没有网络或后端写入。执行 `pnpm exec tsx --tsconfig tsconfig.json <probe>` 退出 0，实测：

```json
{"initialPage":0,"loadSuccess":true,"requestedProjectionCount":1,"sentProjectionCount":2,"sentInputParams":[],"sentFilter":{"Type":"cond","Field":"id","Operator":"equal","ValueFun":{"Type":"GetConstValue","Value":7}},"page":{"index":1,"size":20},"fixtureRequests":1,"networkRequests":0}
```

输入明确传了三个 inputParams（false、0、空字符串）、单字段 projection，以及 `!condition id == 7`。实际仍发送两字段、空 inputParams、正向 equal，证明当前适配会静默丢失输入/投影并反转用户要求的过滤含义。探针 page=1 是显式参数；initialPage=0 是装配默认，两个数不矛盾。这是缺口复现，不是修复验收。

参考实现证据：

- `spark-api/src/kernel/public-query.ts` 将 inputParams 的 name/value 转为 Name/Value；字段转为明确输出描述；过滤支持 AND/OR 与标准操作符，公共合同没有原生 between 或 NOT group。这只说明本仓旧方言的迁移差异，不能据此把 SPARK 完整过滤能力缩减为本仓旧 mapper 子集；完整来源补查见本文末节。
- `protocol/pagination.ts:60-74` 的 requireSparkQueryPage 要求 index 为正整数，size 为 1..1000；不传 page 与显式 pageSize=0 不是同一语义。DataView 自身默认 page=1，不能继续继承旧装配器的 0。
- `protocol/data-table.ts:174-201` 的 projectSortFields 在字段为空（全部输出）时返回 null，避免仅排序字段导致空业务列；确定的服务端排序需要有效显式字段。不能在分页后做本地排序冒充全局排序。
- `BasicFunServiceImpl.java:2075-2091, 2130-2234` 的模型合并以后端字段为权威；默认 OutputFieldMode=MODEL，REQUEST 才在模型允许输出字段内收窄。请求字段可以影响排序、分组、响应别名和允许的聚合；不能承诺任意页面投影表达式会覆盖正式模型。当前参考公共查询合同未暴露 OutputFieldMode，后续须核对执行器再决定已有投影能力如何使用。
- 本仓本地过滤把 like 作为 contains、is null 包含空字符串；字段引用在本地求值时取当前被匹配行，而类型注释写父/上下文行。当前远程适配把它转 GetTableField。不能仅凭注释把它改成父行值；viewCascades 已另行解析父行常量，两者需区分。
- treeMode=flat/nested 是本仓组织形态；原 SPARK tree 是带 nodeId/keyField/parentField 的服务器节点查询。缺少节点时不能直接把 nested 翻译成 SelfRefData。

本轮参考仓既有测试：public-query.test.ts + data-table-page.test.ts 2 文件 76 项通过；query-scenario-models.test.ts -t forwards 4 项通过、11 项跳过，验证原 API 空字符串/false/0 输入和按场景/模型直接查询。这些是 mock/协议验证，不是线上验收。

用户随后扩展任务：本仓项目模型以 sparkproject 的项目蓝图模型为基础，以后统一使用项目蓝图语义。已进入两仓蓝图源模型及调用链研读；本节证据保留，查询输入接线仍要纳入完整方案，不能因新增范围漏掉。未修改任何产品源码。

## 方案补齐阶段续查

用户已审核通过场景配置共享路径 `designfile/SysForm/<scenarioId>/pagedata.json`；这替代前文“路径未定”的状态，不改既有图路径。已通过调用 scenarioId 补全工具局部键，组件消费完整 `#scenarioId@tableName@viewId`；无参数不推断。当前计划仍为 draft，未批准 Java / 前端代码或后端写入。

补读参考 executor 的 headers / queryTable / queryTablePaged / executeTableQuery / validateSavePayload / saveTables 与 data-space-model-api 的 client 依赖，确认最小查询 / 保存只需该执行闭包，不需要把菜单、企业目录、Excel、文件注册等整套 executor 移入。本仓 HttpClientBase 可作为注入边界，但必须保留原业务封包及 0/200 语义，不先走现有 Result-only 解包。API 内部迁入文件和原 source→目标责任已列入现行计划。

继续核对资源关系消费者：LowcodeModelRelationAdapter.collectFieldPairs 递归 children / Filters 时未检查组合 Type，后续同时生成 resourceRelations 与 default→default / autoLoad=true 的 viewCascades。ComputedColumnAggregateResolver 对每个 childTable 只留首条关系，并读取 default 视图，以 fieldMappings.every 做 AND 等值匹配；DataSet.getSaveChangesTableOrder 对环中的剩余节点按原顺序补入。这些源码事实不支持将任意后端关系等价转为前端关系或默认级联。计划已改为可证明的只读关系投影、明确歧义诊断和只消费显式 viewCascades；该改动尚未实施。

仍需闭合的运行验证点：原 SPARK 场景查询不依赖元数据预查询，其 GetData 响应的字段 / 主键描述是可选回显；本仓当前页面装配另读正式设计表及权限接口。不能以接口存在推定普通业务身份可读全套设计元数据，也不能假设每次 GetData 返回完整 schema。需核对实际运行角色下的正式定义装载权限及响应，维持后端定义真源，不以行字段猜正式字段，不伪造管理场景或提升权限。旧无关 getCurrentUser 权限前置按 F6 删除。

本轮现状基线及未改源码证明见 research-project-blueprint-integration.md 末尾。现行计划新增了分阶段执行、严格文件解析、逐项保存回读、迁移冲突和清理验收；这些是待审核方案，不是产品已实现能力。

## 完整过滤表表达式补查

用户要求“SPARK API 有完整的过滤表表达式，同步到本仓”。本轮只读源代码、运行现有测试和仓外探针、修订 notes；不修改生产/测试代码或 Java。方案仍 draft，前述架构语义批准不等于此次新合同或代码已批准。

### 原实现与本仓差异

参考仓 HEAD `842dec4f11b333df904b9a4e26b6566b0802bab8`；工作树存在其他 UI 修改，本轮未改动。取证直接读当前文件，未把 HEAD 当作这些未提交文件的完整快照。

| 源码 | 已核对事实 |
|---|---|
| `E:/r/sparkproject/packages/data/spark-api/src/public/filter-builder.ts:72-159,261-410` | 完整 18 项公开运算符；公开树 field/operator/value、logic/filters；解析对象或 JSON，可解码已有 wire。递归损坏子节点导致整树无效，不丢约束后继续。字段、操作符、嵌套层级和条数可校验；非一元条件的空字符串/null/空数组会报 value-required |
| `E:/r/sparkproject/packages/data/spark-api/src/kernel/public-query.ts:79-151` | 一次映射完整 operatorMap；非空 Type 且非过滤节点形状的函数对象直接作为 ValueFun，其他值包 GetConstValue；保留 false/0/空字符串。inputParams 另行映射，不在浏览器计算函数 |
| `E:/r/sparkproject/packages/data/spark-api/src/protocol/filter-builder.ts`、`protocol/filters.ts` | wire 树的校验/构造与常量/函数入口；不能与 public 实现一起复制为本仓两份正式前端定义 |
| `E:/r/sparkproject/packages/ui/domain/spark-api-ui/src/value-functions.ts:75-277` | 默认目录为 13 类动态函数，另有 GetConstValue；引用表/字段、分组、系统数据、表达式、关联字段、输入/公共参数、对象数组、账号/认证、用户宿主、流程人员。函数可按上下文启用并扩展；该目录不是后端函数全集 |
| `E:/r/sparkproject/packages/ui/domain/spark-api-ui/src/FilterBuilder.vue`、`FilterGroupEditor.vue`、`filter-editor.ts` | 递归组、类型化值编辑、函数对话、JSON/对象、字段诊断。FilterBuilder 默认 storage=wire，但公开输入已有 canonical；UI 内另有 operatorMap，迁入时应归并 API codec。editorNodeToFilter 会过滤无字段节点和空组；normalizeEditorCondition 会改变不再允许的运算符，需要避免未确认的语义变化 |
| `E:/lowcode-jdk17/lowcode-framework/lowcode-data-operation/src/main/java/com/htong/condition/QueryCondition.java`、`enums/Operator.java` | 正式查询条件是 Field/Operator/ValueFun，实际 18 项枚举；没有本仓 between/NOT 节点。不能根据被标 Deprecated 的旧 QDFilter/vo.ValueFun 判断现行能力 |
| `E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/config/JacksonConfig.java:35-60` | 后端注册远多于 ConstantValue/GetTableField 的函数子类，含 GetExpData/GetInputParam/SystemData 等；只看 ValueFun 基类的 Schema 描述会误判为两种。类型注册证明反序列化入口，不证明所有来源/业务上下文都能执行每种函数 |
| `E:/lowcode-jdk17/lowcode-framework/lowcode-common-data/src/main/java/com/htong/util/db/common/SqlConditionBuilder.java:78-156` | 该 SQL 消费者区分 IS NULL 与空字符串，IN/NOT IN 空集合有专门结果。此处只证明该路径，不代表所有后端数据来源语义已做运行验证 |
| `D:/SPARK_AppWorks/packages/spark-data/src/types.ts:511-594`、`data-view.ts:501-688` | 本仓独立 op/type/children/否定方言；值类型只接受标量、数组和 kind=field，其他函数对象拒绝。本地 is null 包含空字符串，like 作为包含；GetTableField 的服务端字段引用和 viewCascades 的父行常量不得混为一谈 |
| `D:/SPARK_AppWorks/src/lowcode/data-space/lowcode-data-space-assembler.ts:75-141` | 只有局部操作符表；filterValue 对未知对象包 GetConstValue，不能保留完整函数语义；字段必须 source=resource 并映射物理资源列，限定模型/关系字段也被旧入口缩窄 |
| `D:/SPARK_AppWorks/packages/spark-component/src/components/containers/runtime/container-filter.ts`、`spark-data/src/dataset.ts:754-800` | 组件另维护 operator 集合，范围控件产生 between；级联输出旧 op/type 树。同步必须同时切换这些生产者，不能只在网络前临时桥接 |
| `D:/SPARK_AppWorks/src/services/project-model-artifacts/page-data-designer.ts`、`docs/guides/CONDITION_EXPRESSION.md` | 设计 Schema/说明仍消费旧视图过滤；需随真实模型更新，不提前把草案写成产品已实现行为 |

### 本轮验证及限度

参考 API 包内：`pnpm exec vitest run tests/filter-parser.test.ts tests/filter-group.test.ts tests/public-query.test.ts --reporter=dot`，退出 0，3 文件 19 项通过。

参考 UI 包内：`pnpm exec vitest run tests/filter-builder.test.ts --reporter=dot`，退出 0，1 文件 8 项通过；测试 stub 缺少 el-checkbox 注册产生 Vue 警告，未验证真实浏览器完整交互。

本仓根：`pnpm exec vitest run packages/spark-data/src/tests/data-view-filter-expression.test.ts packages/spark-data/src/tests/cascade-event-filter.test.ts tests/page/use-filter-panel.test.ts --reporter=dot`，退出 0，3 文件 21 项通过；现有 esbuild/oxc 配置提示仍在。这些是旧实现基线，不证明目标新合同已实现。

仓外探针 `%TEMP%/spark-full-filter-contract-probe.mts` 使用原 public/filter-builder、kernel/public-query 和默认函数目录，验证全部 18 个运算符 public→wire→public、13 类动态函数的嵌套 JSON/wire 载荷保真（含扩展属性内 false/0/空字符串）、损坏子树拒绝、旧 op 方言拒绝；输出 networkRequests=0。首次 Windows ESM 绝对路径导入失败，改用 file:/// URL 后退出 0，未修改参考源文件。探针同时证明 `eq ''` 的 parser 报错而直接 wire 转换保留空字符串：不能拿其中一条路径的结果替代另一条。

尚未证明：每一种函数在实际 GetData 部署、数据来源、角色/流程上下文中的执行结果；完整交互式编辑器和本仓新 API 路径尚未实现。没有把 13 类 UI 函数目录当后端能力白名单，没有把接口 wire 解析当旧本仓配置兼容。

本轮结论与唯一目标方案位于 `plan-scenario-dataview-extension-integration.md` 的“完整过滤表表达式同步”。用户随后已通过 DataViewFilter 承接、前端和 JSON 统一 SPARK 公开树、API 独占 wire 转换以及旧方言退出；仅确认合同，未批准代码。继续补齐空值/编辑诊断、方法和依赖，再完成整体调用链和元数据读取权限复查，提交完整方案实施审核；不重问这些已通过的决定。

补读参考 `ValueFunctionDialog.vue:217-257`：已有函数 Type 不在 availableDefinitions 时，resetDrafts/syncDefinitionDrafts 会选择目录首项；confirm 会提交当前新函数。迁入时应保留未知或因上下文暂不可用的原函数，显示缺少定义/选项，不能因打开弹框就默认换成首项。该风险已包含在现行方案“不能自动换为另一函数”的要求中，后续 UI 行为测试需覆盖。

### 正式字段装载的后续定位

本轮还全文补读参考 `packages/data/spark-api/src/data-space/runtime-api.ts`、`data-space/formal-contract.ts`、`public/data-space.ts`。参考已存在根持有的 SparkRuntimeDataSpaceApi.readModel/readContract：显式接收 designScenarioId 与 dataSpaceId，通过原 query 查询 Base_DataModel/Base_DataModel_Field，验证唯一模型、字段归属和完整分页；数据库表主键另从 View_TblList/Base_TblField 回读并核对正式输出。readContract 明确面向授权的设计读取，不是普通业务查询入口；assertCurrent 是执行失效守卫，不是授予权限。

因此后续应优先核对/复用这套真实 owner，而非保留本仓固定 DATA_SPACE_DESIGN_FORM_KEY + 全物理目录装配。仍未闭合的是：本仓宿主如何提供可信的 designScenarioId、实际运行角色是否可读所需正式元数据、以及既有正式关系装载如何单独保留。新 reader 的存在不自动消除这三项限制，也不能把 designScenarioId 伪装为用户业务 scenarioId。未进行网络或角色权限试验。

后端 `BasicFunController.GetData` 文档与 `BasicFunServiceImpl` 定位再次确认：GetData 正式模型查询由 X-FormKey+Name 解析，默认输出模型定义；Result 的说明是数据/新增权限/主键/令牌，并未承诺完整字段定义回显。前端字段过滤 ValueFun 透传与输出字段 ValueFun 可覆盖范围不同（后者只允许安全聚合），不能以本次“完整过滤”扩张输出字段覆盖权限。

### 元数据装载与动作调用链补查

继续核对 `runtime-api.ts`、`formal-contract.ts` 和 `public/data-space.ts` 全文，以及 `space/data-space-model-api.ts:175-202,477-527`：正式 reader 要求有效输出主键，直接业务 query 不执行相同的设计主键 preflight；后者可以返回尚无 keyField 的结果。不能把两者宣称为同一前置条件，也不能拿直接查询的行名推断当作正式字段定义。参考 `data-space-runtime-api.test.ts:260-269` 明确验证“选中模型无合法键拒绝”和“全合同包含坏模型拒绝”，而选定一个好模型时不受未选坏模型影响。

参考 `page-renderer.ts:131-163` 明确从 props 接收 designScenarioId/dataSpaceId，并在内容、绑定和 execution 变化时失效；当前工作树的 page-data-source.ts 是他人未提交版本，仅定向读其前 175 行，不能把它当作固定 HEAD 的完整实现。参考设计页 `use-data-set-design-page.ts:54-72` 由宿主显式传设计场景；data-set-list-page.vue:195 和 data-set-design-page.vue:251 使用已存在的设计场景常量。目标设计 API 使用同一注册值，但当前 read 拉四表加整个物理 catalog；`src/main.ts:406` 才是 loadRuntimeDataSet 的实际注入点，已补入方案影响清单。

正式关系并不由 readModel/readContract 返回；参考 `data-space-design.ts:326-364` 分别持有 readModels/readFields/readRelations，关系读按 dataSetId 筛选并验证完整基线。方案据此把运行按引用模型读取与设计全合同读取分开，采用原正式 reader 的主键约束，并把不满足约束的真实模型列为迁移审核项。实际角色是否具备读取权限仍未运行验证，不能借当前有 reader 类就宣称部署可用。

参考包目录运行 `pnpm exec vitest run tests/data-space-runtime-api.test.ts tests/data-space-model-api.test.ts --reporter=dot`，退出 0，2 文件 100 项通过。输出含认证 mock 日志，测试使用 Axios adapter，不向真实后端验证角色能力。

过滤补充表已写入唯一方案“过滤空值与草稿的具体合同”，包括显式空值与缺值、空组、无效草稿、清空动作和不可用函数。已提交单项人工问题；没有把尚未回答的规则记为批准。已通过的公开树与 DataViewFilter 名称/责任不再重复询问。

本轮完整读完 action-types.ts、action-data.ts、action-executor.ts、executor-helpers.ts，并补读 node-to-descriptor.ts、useActionButtonRuntime.ts、RendererButton.props.ts 和 RendererButton.vue。关键传播点如下：

- action-types 的 getDataSet 无场景参数；executeSaveDataSet 与保存权限检查分别再次取单 DataSet。保存动作没有 scenarioId，无法表达多场景的保存目标。
- executor-helpers.resolveActionDataCapabilities 显式键仍交给单 DataSet resolver；action-executor.resolveNavigateRow 在缺少显式行时遍历首个有 currentRow 的视图。后者必须随“不选第一个空间/视图”退出。
- RendererButton 的禁用判断和点击前置只取祖先 DATA_SOURCE；即使 descriptor 指向另一完整键，UI 权限与实际执行也可能不是同一视图。页面级 save 按钮没有祖先视图时会直接返回。
- node-to-descriptor.readSaveDataSetViews 跳过坏 selector，若全坏或空数组则返回 undefined；executeSaveDataSet 不传 views 意味着保存全部。这是范围被扩大的真实风险，不能保留过滤坏项的写法。
- executeRefresh 只按旧 api.list 判可刷新，刷新返回值不检查；executeClearRows 直接 replaceRows；数据动作多数返回 void，CRUD 失败但未抛错后仍可进入 then。这些路径需要与批准的脏保护、原 API 回执和失败停止规则一致。
- 行动作默认 idField='id'，追加还根据已载入行生成 max+1/row-timestamp；SPARK 正式主键与新增身份不能由按钮再推断。所有写权限、字段显示和消息掩码都仍直接调用旧 PermissionChecker，应按既定 DataView 集中消费边界一起切换。

目标根运行 `pnpm exec vitest run tests/component/zero-code-events.test.ts tests/data-view/dataview-crud-bridge.test.ts tests/page/transaction-config-pages.test.ts --reporter=dot`，退出 0，3 文件 43 项通过。现有 esbuild/oxc 提示及 el-pagination/loading stub 警告保留；旧事务测试通过不证明 SPARK 事务能力，必须替换旧断言与夹具。未改源码或测试，未执行真实保存。

### 页面实例与渲染消费链复核

已全文核对 SparkPageRenderer.vue、useRendererSetup.ts、usePageDataSet.ts、useCssScope.ts、scopeCSS.ts、SparkComponentRenderer.vue、buildPageContext.ts、context/types.ts、page-component-registry.ts；路由侧全文核对 dynamic.ts、route-helpers.ts、cross-project-ref-page.ts、runtime-navigation.ts、runtime-target.ts、useTabPages.ts、nav-types.ts、start.ts、App.vue、AppTabBar.vue、runtime-page.ts、PageContentLoader、page-cache.ts、page-cache-access.ts、CacheManager.vue。SSE 只读取事件合同和尾部归一逻辑，未宣称整个服务复核。以下是现状证据，目标行为只在唯一现行方案维护：

- DynamicRouter:582–603 在注册 route 时固定 createRuntimePageNode/props；registeredRoutes 以路径去重。useTabPages 按 route.path 合并标签，App.vue:91 的 KeepAlive max=10 与配置页路径渲染键会将调用状态和工具路径混用。
- SparkPageRenderer:334–380 将 Render 函数注册到 app 全局，以函数名/camelName 取既有 fnRef 并覆盖；SparkComponentRenderer 从 appContext.components 解析 Render。现有 PageComponentRegistry 仅登记本页实例/API，可作为局部定义的实际 owner，不必再设全局函数表。
- renderer:512 的加载键只含 pageId/对象身份/revision；runLoad 的序号仅在新 load 时增加。renderer:732 起 nextTick、异步 __init__、自动查询与选择不在同一 isStale 保护内；卸载只解绑 DOM，迟到候选 DataSet 没有销毁链。
- buildPageContext 的计时器直接转发 window，未登记释放；其 route 由 renderer 引用全局 useRoute，缓存页脚本会观察到另一个激活页。usePageDataSet.clear 仅清引用，不负责 destroy；这不能作为新实例生命周期 owner。
- CSS 容器与 scopeCSS 都以 pageId 作用域；同工具不同实例无法因此隔离。现有 CSS 正则对 at-rule 的能力有限，本轮不能声称替换标识就解决通用 CSS 解析问题。
- 跨项目页另建 PageContentLoader，createRuntimePageNode 未传业务绑定，h(SparkPageRenderer) 未传 loadRuntimeDataSet；不能把当前跳转测试通过当成跨项目正式数据空间已经接通。
- App.vue:500 清 pageId 缓存并为当前页增加 revision，未检查运行 dirty。SSE FileChangeEvent 归一仅保留 pageId/file/timestamp，未见足以保证 SysForm 场景配置跨客户端广播的合同；不能在“不改 Java”下承诺新增服务端通知。
- PageContentLoader 是实际文本缓存 owner，page-cache + page-cache-access 另包逐方法转发及旧四文件 localStorage 清理。缓存管理页同时展示 spark_page_/spark_file_，但清理调用页面句柄；新计划必须对齐实际缓存范围，不能误清别的文件缓存。清缓存后迟到读再次填入也需用失效代次保护。

根运行 `pnpm exec vitest run tests/page/spark-page-renderer-binding.test.ts tests/page/page-components-access.test.ts tests/auth-nav/dynamic-router-platform-pages.test.ts tests/auth-nav/cross-project-ref-page.test.ts packages/spark-app/src/tests/route-helpers.test.ts packages/spark-component/src/tests/createSandbox.test.ts --reporter=dot`，退出 0，6 文件 54 项通过。esbuild/oxc 提示、预期脚本语法/初始化/事件异常及路由降级日志保留；这些是现有行为基线，未验证目标多实例隔离。当前全局 Render 热更新断言须随实施替换，不能为保持旧测试而保留全局分支。

### 夹具与 AI 生成物盘点

全文读取 page-data-serialization-roundtrip.test.ts：它保留三个 LEGACY_UNPARSEABLE 夹具白名单，在逐文件用例内遇到这些样本直接 return。新方案不能继续把跳过记为往返通过。只读枚举 `backend-api-contracts/characterization-fixtures/pages-config` 的 27 个 pagedata，逐一 JSON 解析与顶层字段盘点，全部未提供 scenarioId；精确目录已写入唯一方案。未全文解释所有夹具内容，未为其虚构正式场景/模型，未改测试或资产。

读取 generate-dts-class-model.mjs 前 165 行与 manifest 头部：实际输出根是 generated/dts-class-model，files 按原源路径追加 .json。定位到旧 project-model、config-page、dataset-file、runtime-page、page-cache/access 等 shard。生成物应由源 class 重建并检查 obsolete shard 清理，本轮未运行生成或改生成器；不能把局部入口阅读称为生成器全量审计。

### 路由参数与缓存机制的方案验证

补读 useNavigation.ts、buildPageService.ts、runtime-target.ts、nav-access.ts 全文以及 use-navigation-actions.test.ts 全文。useNavigation.setContextValue 仅复制 string query，pushNamedRoute/navigateToRefNode 不带原 query，跨应用 self 分支只传 pathname 的内部路径；buildPageService.stringifyQueryParams 用 String(value)，会把额外场景数组改成逗号串。它们是调用参数的真实生产链，必须与 DataView 定位一起切换。当前 system-action 与区域投影测试仍有独立业务意义，不应因配置页合同变化删除。

只读 Node 内存探针（stdin 执行，未写产品/测试文件）使用当前 Vue 3.5.38、jsdom：按 instanceId 建立每实例一个 KeepAlive、激活时才渲染其页面。依次打开 11 个实例，没有卸载；重新激活 i0 没有重挂且本地草稿保留；移除不活跃 i5 仅卸载 i5；激活 i1 后移除 i0 只卸载 i0；临时切到无配置实例的原生路由再回来没有重挂；根卸载后全部 11 实例各销毁一次。输出 opened=11、destroyedExactlyOnce=11、activations=14、deactivations=14，退出 0。此探针只证明 Vue 机制可用，不证明 PageRuntime 集成、保存或权限已实现。

另一个 stdin 内存探针使用 Vue Router 5.1.0：scenarioId 单值、additionalScenarioIds 重复 query 数组、显式空字符串及文本 0/false 经 resolve→fullPath→resolve 完整往返；重复 scenarioId 被保留为数组，可以在新契约拒绝。退出 0，未部署探针身份，未修改路由。唯一方案据此补齐拟议配置页节点宿主 / 明确工具宿主 URL、保留参数、实例索引和参数变更边界；它们仍需人工审核，不将方案草案称为既有行为。

随后根运行 `pnpm exec vitest run packages/spark-app/src/tests/use-navigation-actions.test.ts --reporter=dot`，退出 0，1 文件 2 项通过；与本轮渲染/路由 6 文件 54 项合计 7 文件 56 项。最终 git status 仍仅 notes 变更，git diff --check 通过（仅 CRLF 提示）；现行未跟踪计划另验 draft、JSON 示例、冲突标记和尾部空白均通过。没有进行真实后端读写或产品实现验证。

### 过滤合同的包级依赖复核

全文读取 data/lowcode-api/project-model/component 的 package.json，data/API 的 Vite、TypeScript 开发/构建配置以及 API Vitest 配置；读取根 alias 和 pnpm-lock API importer。当前 data 与 API 仅声明 utils，project-model 声明 data/utils。只读 Node 探针从 workspace manifests 构建 dependencies 图，并定向静态扫描 data/utils/API/项目模型/组件/App 源 import/export；当前 data/utils 无反向 API/UI/项目模型引用，在声明图中加入 API→data 没有循环。该结论不是动态加载或产物包验证。

发现原方案精确清单遗漏了 API tsconfig.json、tsconfig.build.json、vitest.config.ts 与 pnpm-lock.yaml，已加入唯一计划。API 包开发 paths 目前只有自身/contracts/utils，构建 paths 只有 utils/dist，不能依赖根 alias 证明包独立解析新过滤合同。Vite 已外部化裸包，不需要为此次新增依赖修改其实现。build-packages 与 sort-packages-by-dependency 已全文读取：--only 会扩展 dependencies 闭包；当前 --only spark-lowcode-api --dry-run 输出 utils→API，退出 0，符合尚未实施 API→data 的事实。未来该顺序必须包含 data。没有安装依赖、构建包或改锁文件。
