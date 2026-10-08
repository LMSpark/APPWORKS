# 原生 DataSet 合同逐项核对

本表承接 `research-data-space-data-chain.md`，回答每个原生属性的语义、持久来源和实际消费情况。属于研读，不是新增代码方案；继续由主控处理，不使用代理、不改 Java、不恢复界面。

## 核查方法与边界

直接读取当前 `packages/spark-data/src/types.ts` 的 TypeScript AST，展开 TableMetadata 的组合类型，得到 DataSetMetadata 10 项、TableMetadata 9 项、DataColumn 16 项、ViewMetadata 18 项，共 **53 项**。另提取端点、操作、策略、投影、树、关系、级联、布局的子合同。

原始清单、关键源码 SHA256 及只读内存核验结果保存于 `notes/evidence/sparkproject-appworks-integration/four-file-correction/metadata-dataset/semantic-contract.json`。内存核验直接导入当前 TS 源码，无网络请求、无后端执行。其后字段投影与主键依赖增加了线上只读接口比较，记录在同目录 projection-query；只证明该查询合同的实测行为，不代表已核对全部线上 Java 部署代码。

“已接入”指核到配置和消费者连接；完整业务验收仍需保存、重开、查询/操作、异常恢复的证据。“缺口”保留在完整目标中；“运行派生/调用身份”不应为了凑字段覆盖再写一份持久数据。

## DataSetMetadata（10 项）

| 属性 | 语义及归属 | 当前实际链路 |
| --- | --- | --- |
| `schemaVersion` | 前端定义格式标记；pagedata | 校验、装配、原生序列化已接入；数字标记不等于已有自动格式迁移 |
| `dataSetName` | 空间名称；正式 DB | readSpaceDefinition → Assembler；文件不复制名称 |
| `scenarioId` | 空间身份；DB身份与文件引用必须一致 | 装配、查询、保存、页面绑定均使用；不等于元数据查询参数 formid |
| `tables` | 模型集合；DB定义 + 文件绑定/配置 | 当前文件表都必须有正式 modelBinding；不能表达纯本地静态表 |
| `resourceRelations` | 稳定模型关系；DB | 过滤表达式适配与原生消费者已接入；有无法解析时的诊断路径 |
| `viewCascades` | 前端运行依赖；pagedata | field 已改为跨视图通用值绑定、原生/字符串子值处理；统一 CRUD 与保存重开已接通，旧 query 行依赖和组件消费仍待迁移 |
| `version` | 原生数据快照版本；pagedata | 能还原，原生快照功能使用；不能当作数据库提交或文件写入的服务端乐观锁 |
| `pageId` | 原生可选页面归属 | 共享场景文件不接受；具体页面身份由 PageRuntime.call.pageId 持有，不将共享空间绑死到一个页面 |
| `saveChanges` | 空间保存协调默认策略；pagedata | 正式场景仅 perView；transaction 显式拒绝，类型范围大于已实现协议 |
| `layout` | 原生布局定义；pagedata | tablePositions 可还原；旧图文件 graphVersion/nodes/edges 不是同一合同，迁移未完成 |

## TableMetadata（9 项）

| 属性 | 语义及归属 | 当前实际链路 |
| --- | --- | --- |
| `resourceType` | 模型来源类别；DB | 通过集中 wire codec 装配；文件不能重定义；JSON/文件来源不等于 native static-data |
| `resourceId` | 来源资源名；DB MetaName | 装配自 FormalModel.sourceName；请求仍按正式模型 Name 定位，不靠此值绕过模型 |
| `modelBinding` | 正式模型 ID + Name；pagedata 引用 DB | 两者联合核验；DataTable 绑定身份不能在脚本中随意改绑 |
| `businessCategory` | 前端业务分类；pagedata | 校验、装配已接入；不据此推导关系、权限或后端主表标志 |
| `tableName` | 前端稳定表名 | 来自 pagedata.tables 的键；原生实例持有，不再重复存另一个可冲突名称 |
| `columns` | 正式输出列 + 允许的前端扩展 | DB输出字段装配后叠加文件校验/本地计算；不能重定义正式字段 |
| `api` | 每种操作对应的端点；pagedata | 正式模型目前只接 create/update/delete 的 SPARK 兼容提交；其余完整矩阵见下节 |
| `crudConfig` | 操作调用策略；pagedata | timeout、retryCount=0、validateData=true 已接；不含权限放行策略 |
| `views` | 模型的命名视图集合；pagedata | 必须包含 default，允许多命名视图；同表视图共享表配置，各自拥有结果与编辑状态 |

## DataColumn（16 项）

| 属性 | 语义及归属 | 当前实际链路 |
| --- | --- | --- |
| `name` | 输出字段规范名 | 正式列来自 DB，文件规则引用该名；本地计算列由文件命名并拒绝与正式列碰撞 |
| `type` | 字段值类型 | 正式列来自 DB；本地计算列由文件声明，不能用文件覆盖正式列类型 |
| `label` | 字段标题 | 正式列来自正式描述/规范名；本地计算列允许文件标题，正式列标题覆盖未开放 |
| `allowDBNull` | 原生列空值描述 | 前端校验存在必填回退消费者；正式输出装配无可靠来源，文件不接受，未闭合 |
| `defaultValue` | 默认值声明 | 原生类型存在；当前新增链未见按此属性初始化，正式装配/文件不支持；不是“加白名单”就能完成 |
| `isPrimaryKey` | 正式主键语义 | 来自正式模型；查询上下文核验主键，不能从任意 id 同名猜测 |
| `autoIncrement` | 自增声明 | 原生类型存在，当前新增链未见该属性消费者；不能替代正式主键生成合同 |
| `isComputed` | 框架生成列标记，如 _pk | 运行派生，序列化排除；不是用户计算表达式开关 |
| `required` | 前端必填约束 | 文件可持久；校验与正式保存已消费；不能扩大服务端写权限 |
| `minLength`, `maxLength` | 字符串长度约束 | 文件校验/装配/正式保存前校验已接入 |
| `min`, `max` | 数值范围约束 | 文件校验/装配/正式保存前校验已接入 |
| `pattern`, `patternMessage` | 正则约束和失败信息 | 文件校验/装配/正式保存前校验已接入 |
| `computeExpression` | 前端本地计算定义 | 文件持久、装配、按可读输入计算；不重定义后端表达式，不进入正式输出请求或写入 payload |

DB 源表字段的 nullable/defaultValue 不自动等价于正式模型输出列：输出可能来自别名、计算、聚合或多资源。当前差距必须从来源和业务语义解决，不能直接复制物理字段属性。

## ViewMetadata（18 项）

| 属性 | 语义及归属 | 当前实际链路 |
| --- | --- | --- |
| `tableName`, `viewId` | 视图归属和身份 | 从 tables/views 键推导，原生实例/序列化持有；文件不重复接受这两个嵌套属性 |
| `fieldProjection` | 本视图输出字段定义 | 文件能保存，装配受正式输出合同约束；正式绑定视图现使用 REQUEST 并保留正式主键，不改显示列；限定线上查询及签名保存链已验，见下文 |
| `queryContext` | 查询输入上下文 | 文件可保存配置值；每次调用显式注入运行值。URL值不应反向成为永久默认配置 |
| `rows` | 当前查询结果，或 static-data 的内联定义行 | 正式远端结果不写文件；当前正式场景配置不支持静态表/内联行，属于缺口 |
| `filterExpression` | 查询范围条件 | 文件持久；GetInputParam 从本次上下文绑定，映射正式字段后发送；不是授权条件替代品 |
| `sortExpression` | 查询排序 | 文件持久，loadFromServer 序列化后映射正式字段；不能据前端顺序猜后端字段 |
| `autoCurrentFirst`, `autoSelectFirst` | 加载后的初始当前行/选中策略 | 文件持久，结果加载后由选择委托执行；布尔 false 需要保留 |
| `page`, `pageSize` | 初始分页配置和本次分页状态 | 初始值来自文件；运行改变后查询刷新，不因此直接保存场景定义 |
| `treeConfig` | 树的本地组织与服务端树行为配置 | 文件可持久、原生可还原；本地树与通用树端点有消费者，正式模型树查询未全部接通 |
| `valueField`, `labelField`, `selectionDelimiter` | 当前选择值和标签的表达方式 | 文件持久；选择委托与 field 级联共用编码，支持明确配置的复合选中字符串，不推断普通字符串 |
| `autoLoad` | 是否启动时自动查询 | 文件可持久；renderer 在 __init__ 后调用 triggerAutoLoad，现遍历全部命名视图；父 requestData 等待及正式模型父行变化查询已验证，见 named-view-autoload/result.md |
| `commitMode` | 视图变化的提交时机 | 文件可持久；普通 CRUD 有 immediate/staged，正式查询绑定始终走显式 saveChanges，不因 immediate 自动提交 |
| `aggregates` | 视图结果/选中结果的汇总定义 | 文件可持久，原生基于已加载行计算；不等于服务端跨全部分页的聚合 |

## 关键子合同

### 表级操作与调用策略

原生 CrudApi 共17个顶层操作键：create、retrieve、update、delete、transaction、list、batch、import、export，以及 node、children、path、subtree、move、search、nested、nestedSearch。

- create/update/delete：当前正式链仅接受符合 SPARK 请求/回执协议的端点。表配置影响投递位置，原查询权限、身份与回执校验仍保留。同批不同端点/超时拒绝，分批部分成功恢复未完成。
- retrieve/list：通用 CrudService 有消费者，但正式 DataView 查询绑定走 GetData，不通过其 list 配置。文件当前拒绝，不应列为已支持。
- batch/import/export：通用 CRUD 委托存在，不等于正式场景的配置、权限、持久/回执链已接通。
- transaction：原生非正式场景有执行结构，正式场景明确拒绝；不能用“一次请求”冒充跨模型原子事务。
- 八个树端点：原生 TreeManager 使用表的 api，正式 pagedata 当前不接受这些键；须核正式模型管线适配，不能绕回独立无基线请求。

HttpEndpoint 的 url/method/headers/params 当前以受限 SPARK 形式接入；pathParams/baseURL 未接入。不能把不接受任意协议误写成不能扩展协议，也不能把已有 HTTP 类型当作已具备任意协议适配。

CrudOperationConfig 五项：timeout 已接；retryCount 当前仅允许0；validateData 当前仅允许true；transformRequest/transformResponse 是函数合同，不能直接写入 JSON。通用 CrudService 目前找到转换函数消费者只在 list，buildRequestConfig 只传 timeout；因此类型注释不是所有操作的实际执行保证。DataTable 注释中“权限跳过”的旧说法也不在当前类型合同中，不能据此新增权限绕过。

### 字段投影：输出范围与行身份分别处理

已核到的事实：

1. DataView.columns 根据 fieldProjection.output 生成前端列；查询捕获也据其生成 Fields。
2. 正式 Assembler 要求投影匹配正式字段身份/类型/主键，不允许自行改写后端表达式、值函数、分组、distinct。投影有16个原生字段，不意味着正式链可任意配置所有字段。
3. 修复前，仅传 Fields 的封包没有 OutputFieldMode。现正式绑定视图主动传 REQUEST；直接查询未指定模式仍保留后端缺省行为。
4. 本地 Java GetData 的 resolveOutputFieldMode 在缺省时为 MODEL；只有 REQUEST 才按请求字段与正式可输出字段求交集。请求 IsOutput 不能扩大权限。
5. 当前查询上下文对结果行去除凭据字段，不再按请求投影统一删减业务字段。

线上只读比较已补齐接口行为证据：同一目标的 Fields=rowid 请求，模式省略和 MODEL 均返回12个输出字段，REQUEST 只返回 rowid；另以 REQUEST 分别取 Name、rowid+Name，前者丢失行身份、按主键检查字段读取不可用且编辑禁用，后者恢复。结果在 `projection-query/online-result.json`、`projection-query/online-permission-result.json`，五次查询均无业务或配置写入。探针在传输边界设置模式，未修改正式查询实现，也未执行保存。

修复后的正式 DataView 请求按字段投影/本次字段子集发出 REQUEST，并补齐正式主键依赖，不改变显示列。真实原生装配的只读线上查询已确认 Name + rowid 输出、Name 单显示列以及正常权限/编辑状态；签名保存与回执通过 HTTP 边界夹具验证。证据见 `projection-query/result.md`。模型白名单和数据权限仍由后端执行，没有把投影当成授权，也没有扩大为任意字段/表达式支持。

修订实现时须先明确投影的语义：返回字段集合、页面可见列、权限范围分别是什么；保留正式主键及原查询保存凭据，不能为了收窄字段破坏编辑/回执闭环。

### 树配置：保存成功不代表正式树查询生效

TreeConfig 共8项：idField、parentIdField、textField、depthLimit、lazy、treeMode、serverPaginationMode、filterMode。当前都可在文件保存；DataView 本地树组织和 TreeManager 有各自消费者。

正式 captureDataSpaceViewQuery 只有本次显式传入 `tree:{keyField,parentField,nodeId,...}` 才形成 SelfRefData 查询。它允许 treeMode/viewConfig 进入，但不会据此把完整 treeConfig 转成服务器树参数。内存核验 nested 与 flat 的正式封包相同，证明这两个配置值没有在此入口改变请求；不意味着本地显示行为相同。

loadTreeNested/loadTreeChildren 则通过 TreeManager 的另一条路径，不能在正式模型场景中仅凭方法存在就宣布其查询权限/保存基线兼容。root分页、保留祖先等配置也要逐消费者核对，当前不列为完整支持。

### 模型关系与前端依赖

DataResourceRelation 的 relationId、sourceRelationId、parentTable、childTable、filterExpression 由正式关系适配；cascadeDelete 被带入原生对象。relationName/cascadeUpdate 未在当前正式装配中看到来源。

在 spark-data 生产代码的限定搜索中，cascadeUpdate/cascadeDelete 仅有声明与归一化保存，未见按这两个标志执行自动更新/删除的消费者。不能因此推断后端完全没有级联行为，也不能宣称前端已自动执行。完整过滤表达式匹配/聚合是另一项已存在的消费。

query 分支的源视图、目标视图、filterBindings、dependencyType、autoLoad 仍表达旧行式查询依赖，后续须替换。field 分支已移除 rowMode：tableName/viewId/targetField 定位子值，parents 明确跨视图通用值及查询参数，optionsView 只引用原生视图，valueFormat 明确 native/selection-string，valuePolicy 处理新选项约束后的子值。指针只在绑定层用于取写值；两个分支当前共处 viewCascades 不代表最终统一执行迁移已完成。

DataMember.Value 的字段值/选中主键数组入口已被 field 运行链消费，已有 DataView.value 字符串序列化兼容保留。原生 DataSet/DataSetCrudTool 已统一维护两种当前定义，字段配置先校验后替换，支持撤销重做，并经所属文件保存重开；见 value-cascade-crud。旧 query 的行依赖执行尚未切换，不把 field 和 CRUD 闭环宣称为完整级联迁移。

## 对下一步的约束

本轮完成的是53项原生属性的归属核对，并补出投影、自动加载、树查询、关系标志四个此前不能按“已持久即已实现”处理的事实。原始总计划中的 api/crudConfig 状态应更新为“部分接通”，不是继续写“完全未接通”。

后续实施应从完整业务样板要求确定查询与返回合同，然后验证编辑/提交与两类持久来源的闭环。尤其先解决“视图到底查询并交给页面什么”，再决定字段投影、树配置和操作 API 的实现边界。不得继续通过仅增加配置白名单宣称完整表达已完成。
