# 页面多数据空间整合研读

状态：运行多空间和寻址方向已确认；页面集合合同待审核，未批准代码实施。

## 用户最新要求与有效决定

2026-10-06 用户纠正：本仓现状一个页面只有一个数据空间，实际 sparkproject 一个页面可以有多个数据空间，必须按 sparkproject 统一。这是当前目标，不是可推迟的扩展。

保持本仓主框架与 DataSet / DataTable / DataView 三类；DataSet 对应一个场景，DataTable 对应模型，DataView 对应 GetData 查询定义并拥有内部 SPARK 结果上下文。权限完全沿用 sparkproject。保存同场景一次 SPARK save；跨场景不能伪装成同一批或承诺跨场景事务。

先前九项决定继续有效。追加三项已确认：

1. 运行身份只读，改绑定先明确保存/放弃未保存修改，再重建整页运行数据；旧请求及权限失效。
2. 每份 DataSet 保留现有 JSON 内部结构；绑定表 columns 是设计显示快照，运行正式定义从后端取得并校验冲突。页面如何容纳多份配置尚待方案，不能把“保留结构”理解成禁止多空间。
3. 已确认复用 `#dataSetName@tableName@viewId`：页面集合按稳定 dataSetName 寻址；不自动选第一个空间。二段写法仅用于已显式绑定某个 DataSet 的局部上下文。

用户随后再次强调“sparkproject 的运行时，支持多个数据空间”。本次整合必须覆盖同一 runtime 同时持有/访问多个场景，不能只扩展设计器列表，不能增加全局可切换的 currentScenarioId。

持久化仍采用后端表＋JSON；不改 Java；页面迁移先预览、人工审核、逐页切换。模型 ID/查询 Name 与页面稳定 tableName 分开。新问题只问真实新增歧义，不重复九项答复。

用户最新明确：“应用、租户是请求时考虑的，不在数据层考虑。”因此下文原 API scope/缓存/认证取证均属于请求/API 层的实现边界，不构成 DataSet/Table/View 新增应用、租户字段、校验或监听逻辑的依据。数据层只提供场景、模型和查询定义；宿主与请求层提供当前应用/租户，处理请求有效性与隔离。页面名称寻址 `#dataSetName` 与请求 scope 分开。

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

候选持有方式是一个有状态的 DataSetCollection，复用现有 DataSet/Table/View，负责命名注册、生命周期、JSON 集合与查找；不把它伪装成某个场景 DataSet，也不继承 DataSet。精确合同见 `plan-page-multi-data-space-integration.md`，新增 class/API 尚待人工审核。

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
