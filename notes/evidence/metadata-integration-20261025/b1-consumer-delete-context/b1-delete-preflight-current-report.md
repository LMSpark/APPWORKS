# B1 字典删除引用完整性：当前源码核查

**核查基线**：`codex/ai-data-entry` @ `fe003c69da209edf488b29431e764181995ec465`（按任务指定）；保留字典 `327D74EC0ABC4196AA75C56D944B8201` 当前 7 条。此报告只读分析源码与现有测试；未发服务请求，未读本地 Java 来推断运行服务能力，未修改产品、测试或台账。

## 结论

当前删除闭环完整覆盖的是**此字典定义行及其 `typeid` 子条目**，并检查本次 DataView 查询返回的行是否允许删除。它没有执行或证明跨数据空间的正式模型引用完整性检查。已存在的正式模型查询链只能按调用方指定的一个 `dataSpaceId` 读取 `Base_DataModel`，所以一个空间内零命中只能说明该空间可见范围内未命中；不能据此认定字典全局无引用。字典删除 UI 目前没有目标 `dataSpaceId` 清单或全局引用目录，也没有调用上述模型目录链。

在不增加新服务合同、不做全局拉取的约束下，现有 SPARK data 资源能可靠做的最小前置检查是：对**已明确列出的每一个候选消费者空间**，以该空间正式元数据 DataView 查询 `Base_DataModel`，精确过滤 `Type = '字典' AND DbId = 字典 rowid`；确认查询完成、行数与 total 完整、关键身份字段可读且每一行 `dataSetId` 与该空间一致。任一命中足以认定有引用并阻止删除。所有空间都没有可证明完整的清单时，零命中不能成为“无引用”证据；安全结论应是“引用状态未完全核实”，而非拒删/准删的全局结论。当前源码没有把这个检查接入字典删除流程。

## 当前删除链与范围

- `DictionaryWorkspace` 构造时只绑定 `_Base_DictType@default` 和 `_Base_DictData@default`；定义按 `rowid = dictionaryId` 查询，条目按 `typeid = dictionaryId` 查询，两视图设 `allPages: true`、`commitMode: staged`（`packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.ts:45-61`）。
- `load()` 先读定义，再读条目；读取失败即停止，成功后再校验目标身份（同文件 `101-123`）。这里的 allPages 只覆盖上述两个过滤范围，不包括 `Base_DataModel` 或其它消费者数据。
- UI 只有在 `loadEditor`、PageRuntime 加载和 `owner.load()` 全部结束后才设 `ready=true`（`src/views/features/data-platform/structured-config/data-dictionary/model/use-dictionary-workspace.ts:136-170`）。删除按钮受 `workspace.canRemoveDefinition` 控制；确认后调用 `removeDefinition()` 再 `saveDesign()`（`.../ui/dictionary-setting.vue:15-19,39,61-63`）。
- `canRemoveDefinition` 要求定义恰为目标的一行、条目 `rows.length === total`，并逐行检查定义及条目的 `deleteActionState`（`dictionary-workspace.ts:305-313`）。`removeDefinition()` 再检查无 pending、条目已完整、当前查询许可，先暂存全部条目删除再暂存定义删除（`316-328`）。提交通过同一 `DataView.saveQueryViews([{view: entries}, {view: definition}])`，检查所有回执成功（`330-347`）。这些权限判断只回答当前查询对所返回目标行的删除许可；不回答是否存在其它模型引用，也不证明服务端会阻止或级联引用。
- 一个可留给实施者决定的边界：`removeDefinition()` 依赖 `assertEditable()`、scope 与 rows/total 检查，但没有像条目追加路径 `assertEntryAppendContext()` 那样显式要求两视图 `requestState === Loaded`、无 loadingError、无 refreshPending（`dictionary-workspace.ts:360-363,436-446`）。正常 UI 的 `ready` 门槛保证先完成 `owner.load()`；不过直接调用公开 Workspace API 时，仅靠本方法的行数条件可能无法区分“已完整读到零条目”和“条目视图仍 Idle 且 total 为 0”。这是源码静态可见的防护不对称，未运行验证，建议作为最小反例覆盖，不推断已发生线上误删。

## 正式字典引用与其它消费者

1. **正式模型注册是 ID 引用的主要消费者。** 字典模型来源装配结果写 `Type: spec.label`、`MetaName: current.name`、`DbId: current.dbid`（`src/lowcode/data-space/model-source/lowcode-data-space-model-source-reader.ts:198-200`；字典源为 `_Base_DictType`、名称字段 `TypeName`，`.../lowcode-data-space-source-catalog.ts:62`）。当前正式模型投影把 `Base_DataModel.Name` 作为正式模型名，把 `MetaName` 投影成来源名、`DbId` 投影成来源 ID、`Type` 投影成来源类型（`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:162-183`）。因此删除引用查询应匹配 `Type='字典'` 与 `DbId=<dictionary rowid>`，不能用模型 `Name` 或来源 `MetaName` 替代 ID 检查。
2. **固定名称消费者。** API 头部配置通过 `TypeName='接口公共头部信息使用类型'` 找唯一字典，再按其 rowid 查询条目（`src/lowcode/resources/external-api/lowcode-api-provider.ts:30-46`；API 页面把 `_Base_DictData@default` 作为选项视图，`src/views/features/integration/api-management/ui/api-config-page.vue:93-98,151`）。方案设计还按 `Type='字典'`、`Name='数据关系依赖'` 读取固定资源（`packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts:627-658`）。这类名称型消费者不是通用外键目录：它们说明同名资源删除会破坏固定功能，但无法发现未知或按 ID 配置的消费者。若 B1 的正式名称不是这些固定名称，不因这些硬编码调用就判定 B1 已被引用。
3. **本次字典工作区本身的定义/条目维护**也是 `_Base_DictType`、`_Base_DictData` 的消费者，但它只负责资源编辑，不提供其它模型引用枚举。

## 现有正式查询的可证明边界

- `LowcodeDataSpaceRuntime` 装配数据空间元数据时显式接收单一 `dataSpaceId`，把它放入元数据 DataView 的 `queryContext`，再加载 `Base_DataSet`、`Base_DataModel`（`src/lowcode/data-space/lowcode-data-space-runtime.ts:145-175`）。`LowcodeDataSpaceMetadata` 要求 `Base_DataModel` 的 `dataSetId` 过滤仍引用 `GetInputParam(dataSpaceId)`，并核对返回行均属于该目标；完整读取时要求 `RequestState.Loaded` 及 `rows.length === total`（`src/lowcode/data-space/lowcode-data-space-metadata.ts:25-86`）。正式目录的 `readModels()` 也明确以 `dataSetId = dataSpaceId` 限定模型列表（`data-space-design-api.ts:400-426`）；`readModel()` 再按空间和正式 `Name` 精确读取单模型（`434-470`）。
- 因此，在给定空间内可以用现有正式 `Base_DataModel` DataView 做精确的 `Type + DbId` 条件查询；报告结果至少要保留目标空间 ID、过滤条件、DataView Loaded 状态、`rows/total`、关键字段可见性及返回行 scope 校验。任一命中是可靠的正向阻断证据。
- 但目前设计器元数据链要求单个目标空间，没有全空间发现/列举调用；字典维护场景也不提供消费者空间清单。不能移除 `dataSetId` 过滤、拉全量 Base_DataModel、依赖未加载缓存、用名称搜寻替代 ID 引用检查，或凭一个空间的零命中宣称全局无引用。字段不可读、分页/总数不完整、scope 不确定或请求失败均为“未核实”，不能视作零引用。
- 当前源码也无法证明数据库模型删除/字典删除的实际后端引用约束、级联或原子性；没有在线接口证据，本报告不作服务能力断言。删除数据自身仍是跨两资源的同一 owner 批次和回读核验，不等于与其它来源具有跨来源事务。

## 已有覆盖与建议的最小验收范围

现有 workspace 单测基于 `DictionaryHttp`/内存 DataSet 夹具；删除用例覆盖子条目与定义的提交顺序、取消暂存、某行禁止删除、失败后不重发及不确定回执回读（`packages/spark-lowcode-api/src/platform/resources/dictionary/dictionary-workspace.test.ts:548-567,732-740,791-830`）。UI workflow 用例覆盖某子行无删除权时禁用资源删除，以及确认后两模型一同提交（`tests/runtime/page/dictionary/dictionary-workflow.test.ts:721-736`）。这些夹具不建 `Base_DataModel` 引用、不模拟多个 `dataSpaceId`，没有引用完整性前置检查，也不是实际服务验收。

如果主控后续批准实现/验收，建议范围仅限：

1. **正向引用反例**：在一个正式目标空间放一条 `Type='字典', DbId=<目标字典 rowid>` 的模型注册；该空间精确查询命中时必须阻断资源删除。改动只通过正式 SPARK data DataView 完成，检查不读取业务条目值。
2. **范围反例**：目标空间 A 查询零命中，但已知空间 B 存在上述引用。结果只能表述“A 范围未命中”，不能显示全局无引用，也不能准许声称完整性已核清。该用例证明当前单空间边界。
3. **不可判定反例**：关键字段不可见、DataView 未 Loaded、`rows !== total`、请求失败、返回 `dataSetId` 错位时不得把结果折算为无引用。
4. **API 状态反例**：直接构造/注入 workspace，使 definition 已有目标行但 entries 保持 Idle 且 rows/total 都为 0；公开删除 API 应拒绝或调用方不得暴露此路径。正常 UI 已有加载就绪门槛，别把此用例误报成现行 UI 可以绕过。
5. **名称消费者反例**：如果待删字典恰为固定名称 `接口公共头部信息使用类型` 或 `数据关系依赖`，需把固定消费者作为具体已知引用处理；其它字典名不应被这些硬编码名称调用误判命中。

**可执行方案边界**：在现有合同下，能执行的是“按每个明确给定消费者空间做 SPARK data 精确正向检查”。如果没有可信且完整的消费者空间清单，就不存在可由现有前端代码完成的全局无引用证明。不要加全空间扫描或新 API 协议；由主控决定是否先补齐既有空间清单的可信来源/检查策略，或将全局引用状态保持为未核实并暂缓该对象删除。当前保留字典及其 7 条记录没有在本核查中被操作。
