# B1 按字典 ID 的全局引用合同核查

**基线**：`C:\Users\lgf22\.codex\worktrees\ai-data-entry\SPARK_AppWorks`，`a176ae2f56ccd507f34d7e36d4489bba28422c94`。只读源码研究；未发网络/服务请求，未删除或保存记录，未修改 Java、产品、测试或唯一台账。

## 结论

没有发现专用的“按字典 rowid 查全局引用”API、字典删除前置引用校验、或字典表上的已确认外键约束。正式 API 合同有通用 `GetData(TableInput)` 查询和批量 CRUD，但没有把“全局引用检查”定义成其契约能力；字典删除服务实现只删定义和子条目。

同时，Java `GetData` 的当前源码注释明确描述了一种较宽的**查询授权范围**：对 `APPLICATION_DESIGN` 表，查询按“当前企业自有应用 + 当前企业有效授权且发布商应用仍已发布”的权威设计并集执行，Filter 再收窄。因而可研究一个**精确过滤 Base_DataModel 的正式 DataView 查询**，它有望覆盖当前企业这个服务端授权并集中的字典模型引用，不必拉整表。这个范围跨多个数据空间，但不是跨租户或全实例的全局目录；而且它目前不是字典删除流程的合同，也未在线验证为已部署行为。不要把它表述为“全局无引用证明”。

## 协议、适配层与范围证据

### 1. 正式 TypeScript backend-api-contracts：仅有通用读写协议

- `backend-api-contracts/endpoints.ts:418-428` 定义 `data.batchCrud`，路径 `/api/DataOperation/BatchTableOperateRequestByCRUD`，按表提交 added/changed/deleted；不是字典专用删除/引用校验 endpoint。
- `backend-api-contracts/endpoints.ts:429-450` 定义 `data.GetData` 等通用 `TableInput` 查询入口。`backend-api-contracts/common.ts:326-403` 的 `BaseCondition`/`TableParam`/`TableInput` 可表达过滤、资源 `Type`、`DbId`、分页等常规查询字段，但未定义引用完整性语义、全局范围参数或“无引用”回执。
- `backend-api-contracts/README.md` 说明契约按 Java Controller/DTO/Jackson 源码整理，多个返回值为 `AjaxResult<unknown>`。在 `endpoints.ts` 中没有 `DictController` 或 dictionary-reference endpoint。另一个 `lowcode-endpoint-ledger.json:2263-2271` 仅记载源代码中的传统 `DELETE /api/Dict/{Name}/DeleteDict` 路由，标记为 `source-characterized`；它不是当前 `endpoints.ts` 中受类型约束的业务合同，也没有引用检查结果字段。

### 2. SPARK data 查询/资源适配：可承载精确过滤，不自行赋予全局语义

- `packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-request-config.ts:14-25` 的默认读端点是 `/api/DataOperation/GetData`，查询 endpoint 通过正式 DataTable 配置解析。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table.ts:164-183` 把正式模型 `Name`、Filter、字段投影、分页编码为 `TableInput`。筛选是对模型查询，不存在隐藏的引用索引或 delete-preflight 操作。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-resource.ts:45-97` 支持 `allPages`、`maxRows`（默认 50,000），要求分页返回 count，并在完成收集后才交付快照；超限/缺少 count/不完整会报错。这可供验证“结果完整”，但完整性仍相对于服务端给出的授权范围与查询过滤。
- 正式元数据页 `config/pages/data-platform/data-space-design/pagedata.json:695-729` 中 `Base_DataModel` 的 `default`、`modelOptions`、`apiInfoModels`、`designModels` 均有 `dataSetId = GetInputParam(dataSpaceId)` 范围过滤。`src/lowcode/data-space/lowcode-data-space-metadata.ts:39-70,75-85` 强制该过滤、Loaded、rows/total 完整和返回归属一致。所以设计器当前已封装的读取明确是**单一数据空间**；不能将该 DataView 的默认读数误称全局。
- 表层支持正式命名临时视图：`packages/spark-data/src/data-table.ts:249-267,418-445` 有 `getOrCreateView/addView/destroyView`。研究上可隔离预检查询与设计器 default 视图：仅在临时 DataView 上设 `AND(Type eq '字典', DbId eq <dictionaryRowid>)`，输出身份字段，allPages 查询后销毁临时视图。实际走不走到后端的扩展授权范围仍须按当前服务契约核实；本报告未执行请求。

### 3. Java 源码：通用查询存在当前企业设计闭包，未定义跨租户全局索引

- `E:\lowcode-jdk17\lowcode-mainbody\src\main\java\com\htong\controller\BasicFunController.java:228-261` 的 `GetData` 注释规定：请求经 `TableInput`；`X-FormKey` 提供模型/权限上下文；数据库表/视图若为 `APPLICATION_DESIGN`，查询范围为当前企业自有应用与有效授权、仍发布的发布商权威设计并集，Filter 在该范围内继续收窄（251）。此接口文本是源代码合同证据，不是在线服务证明，也不覆盖别的企业/租户。
- `...\service\impl\BasicFunServiceImpl.java:1325-1360,1375-1401` 显示 GetData 对普通数据库表按 FormKey 权限模型解析；`字典`显式查询另走字典公开读取分支。`GetTableData` 在 `2434-2468` 以解析表和 Filter 执行分页查询。`Base_DataModel` 作为模型表的实际服务可读性、行/字段权限、总数语义需要在受控验收中观察，不应由这段静态代码推定生产账户一定能看到所有引用。
- 同一 Java Controller 对通用 `BatchTableOperateRequestByCRUD` 的描述（`BasicFunController.java:141-160`）涉及目标权限、行身份和 CRUD；没有引用检查合同。执行逻辑在 `BasicFunServiceImpl.java:746-830` 逐表处理并对工作失败 rollback；没有出现字典 `DbId` 引用完整性验证。
- 传统字典接口也没有该保护：`E:\lowcode-jdk17\lowcode-mainbody\src\main\java\com\htong\controller\DictController.java:65-75` 映射 `DeleteDict` 并调用服务；`...\service\impl\DictServiceImpl.java:96-110` 按 rowId 删除 `Base_DictType` 后按 typeId 删除 `Base_DictData`，未先查询 `Base_DataModel`。此处仅代表所读源码行为，不据此声称当前部署服务一定等同。

### 4. Java 内部应用依赖图：按单个应用闭包解析，不是字典删除接口

- `E:\lowcode-jdk17\lowcode-mainbody\src\main\java\com\htong\application\ownership\ApplicationResourceGraphResolver.java:295-327` 先按 appId 找其数据空间 ID，再查询这些空间下的 `Base_DataModel`。
- `...\ApplicationResourceGraphResolver.java:329-334,432-500` 从这些模型的 Type/DbId/MetaName 找到该应用引用的字典资源，缺引用或重复名称时阻断所有权转让计划；其查找有稳定 ID 优先语义，但输入仍限于一个 app 的数据空间闭包。
- 该 resolver 只由所有权转让服务使用。`E:\lowcode-jdk17\lowcode-mainbody\src\main\java\com\htong\application\ownership\ApplicationOwnershipTransferController.java:19-24` 的 `/plan` 会生成并保存不可变转让计划；它不是只读字典引用 API，不应被字典删除流程调用或借作引用查询。`backend-api-contracts/lowcode-endpoint-ledger.json:1804-1867` 有该专用转让 controller 的 source ledger，但当前正式 `endpoints.ts` 未提供可复用的字典引用 query endpoint。
- `EnterpriseServiceImpl` 的类似解析器同样由其应用设计依赖流程调用：`E:\lowcode-jdk17\lowcode-mainbody\src\main\java\com\htong\service\impl\EnterpriseServiceImpl.java:2505-2529,2538-2562`，按传入的 `dataSetIds` 查询模型和字典，并非任意字典 ID 的全局查询协议。

## 可实施边界与最小可验证查询

**可考虑的最小候选查询**：使用当前正式 `Base_DataModel` DataTable 的临时命名 DataView（保留当前用户和可信 `X-FormKey` 作用域），过滤 `Type='字典' AND DbId=<目标字典rowid>`，请求可读字段 `rowid, Name, Type, DbId, MetaName, dataSetId`，以 SPARK data 的正式 `loadFromServer({allPages:true})` 收齐结果。任何匹配行都是正向引用证据，应阻断待删动作；保留读回的空间 ID、模型 ID/Name、来源 MetaName，供具体消费者处理。

**接受该方案作为当前企业范围预检前，最少需一次受控只读验收**（本任务未执行）：

1. 在不同 dataSpaceId 的两个当前企业/有效授权权威设计空间各有一条引用模型，`DbId` 均为目标字典 ID；从一处可信 `X-FormKey` 执行上述精确 query，核响应是否能返回两个空间的匹配行，且 `rows === total`、关键字段可读。
2. 添加一个 `DbId` 不同但模型名/MetaName 相同的模型；过滤仍不得命中它，证明比较的是稳定字典 ID。
3. 在查询权限外的租户或非授权/未发布设计中放反例（仅用安全专用夹具/授权测试数据）；它不得假装已被查询。由此明确“全局”的边界是服务端当前企业可读设计闭包，不覆盖该权限外集合。
4. 分页/超限、无 total、隐藏 DbId 或失效 scope 均须产生“引用状态未知/查询失败”，不能折算为无引用。

**重要限制**：官方元数据 DataView 默认过滤和 `LowcodeDataSpaceMetadata` 断言是单空间；要扩到多空间，必须使用真实 SPARK data DataView 查询并依赖实际 `GetData` 公开权限语义，而非去掉过滤后声称普通视图仍完整。Java 注释所述授权并集尚无本轮在线证据；若受控读取证明其范围不足/字段受限，则现有合同仍无法作全局完整性判断。无论候选查询通过与否，都不能宣称跨租户/全安装无引用。不要用 `/api/Dict/.../DeleteDict` 绕过 SPARK data；不要按单空间空结果允许全局删除；也不要因范围未明就永久一概禁删。
