# B2 数据库剩余用例：源码对照备忘

范围：只读对照参考仓数据库目录/表视图管理与本仓当前 DataSet/DataView 实现。未调用服务或浏览器，未改产品、测试或台账；下文“持久化”按源码调用形态描述，不等于本次实服验收。

## 用例与当前合同

| 用例 | 原页面与 API 事实 | 本仓当前链与可见结果 | 已确认差距 / 风险 |
|---|---|---|---|
| **登记已有数据库** | 原数据库页按服务器查看未登记数据库，用户多选后调用 registerDataBases(serverId, rows)；API 用 dbOperateData 命令，payload 含 serverId、registerData（参考 E:/r/sparkproject/packages/ui/domain/metadata/src/views/DataBaseManage/DataBaseManage/index.vue:908-954、E:/r/sparkproject/packages/data/metadata/src/api/DataBaseManage/DataBaseManage.ts:199-221）。这是发现并登记服务器上已存在的库，不是新建物理数据库。 | 当前目录 DataSet 装配正式服务器/_base_dbInfo 两个 DataView，并另有只读未登记库名命令；databaseCatalogQueryUnregisteredDbNames 写入 command input 后刷新查询视图（src/lowcode/resources/database/lowcode-database-directory.ts:20-21,52-114、database-catalog-db-view-ops.ts:158-170）。页面工具栏只有“新增数据库、管理、刷新”；“新增数据库”沿 _base_dbInfo DataView addRow + DataSet.saveChanges（src/views/DataBaseManage/DataBaseManage/index.vue:106-115、database-catalog-db-view-ops.ts:71-100,113-155）。 | **登记已有库的写命令和多选 UI 缺失。** 仅查询未登记名称不能完成登记；当前新增 _base_dbInfo 行与旧 dbOperateData 语义不同。不能把新添一行误报成已有库登记，也不能称为创建了物理 DB。实现需以原 DataSet 命令视图承接 serverId + selected records，并在命令后经原目录 DataView 读回核验。 |
| **数据库编辑/删除** | 原页对已登记库提供编辑、删除；源 API 更新/删除 _base_dbInfo（DataBaseManage.ts:239-267）。代码证明这是元数据记录操作；未能据前端源码证明物理库被删除或数据被级联。 | 当前页面没有编辑/删除数据库操作入口，仅“新增数据库、管理、刷新”（src/views/DataBaseManage/DataBaseManage/index.vue:106-115）。已有数据库新增 helper 不等于页面编辑/删除已恢复。 | **页面语义缺失。** 若恢复，编辑应只提交原数据库目录 DataView 的已改行；删除需界定 _base_dbInfo 行、表/视图模型、关系及物理 DB 分别是否受影响。现有 _base_dbInfo remove 不证明安全级联；不应做在线破坏性验收或扩大成全库扫描。 |
| **数据库连接测试** | 原页测试具体数据库连接，传入数据库名、服务器地址/类型/端口/用户名/密码，走 POST /Db/testConnection；源 probeDbConnection 带 dbName（DataBaseManage/index.vue:784-807、DataBaseManage.ts:270-283、db-test-connection.ts）。这是连通性探测，不是保存/注册。 | 当前服务管理页的连接测试通过 DataView 命令输入和只读结果视图，但 attachServerConnectionTestViews payload 是 Type、ServerName、ip_address、UserName、Password、Port，没有数据库名（src/lowcode/resources/database/lowcode-database-dataset-extensions.ts:356-387）。它验证服务器连接，不等价于原数据库级检查。 | **粒度不同，原用例未恢复。** 新增数据库级检查时，凭据应只在本次 DataSet 命令输入中短暂存在，不能写入目录/日志；输入必须带目标 DB 名，结果仅作为本次探测。当前“服务器连接成功”不能证明某个库可用。 |
| **批量注册表/视图** | 原未登记表/视图由当前 databaseId 查询；表输入是 tableName/tableComment/addDefaultFields，视图输入是 viewName/viewComment。接口接受 items[]，一次调用 registerDatabaseTables/Views（TableAndViewRegister.ts:59-78,87-140；resource/register-objects.ts:32-55）。这是把已存在物理对象加入 SPARK 元数据目录，不等于创建物理表/视图。 | 当前 UI 从未登记 DataView 收集多选名，调用 DataSet command owner；结果成功后清选择、刷新子目录（table-and-view-page.vue:666-696）。owner 实际逐项 addRow → saveChanges → refresh catalog，不是原来的单次数组命令（database-catalog-register-view-ops.ts:41-63,65-125）。 | UI 的批量选择已存在，持久语义是**逐项部分成功**：第 k 项失败时此前成功项不会回滚。核心命令 owner 对 unknown 有保护：bindDataSetCommandSubmit 把原提交及 context 保存在 pending；下次 saveChanges 先调用 verify，不调用 submit（packages/spark-data/src/data-set-command/data-set-command-view.ts:111-118,165-205）。表/视图 verify 分别刷新正式目录并按 dbid+tableName 或 dbid+viewName 查找（lowcode-database-dataset-extensions.ts:219-253,261-301）；runRegisterCommand 内部再次调用 saveChanges 的恢复路径是核验，不是自动重发 POST。命令被分类为 unknown 后，第一次 submit 最多实际派发一次注册 POST；DataSet 捕获原提交，后续只调用 verify（packages/spark-data/src/data-set-command/data-set-command-view.ts:111-118,165-205）。但**核验“未找到”不是权威未执行**：目录 default view 使用 pageSize 20、allPages false、PK 升序，表/视图又靠当前数据库选择的 cascade filter；verify 仅调用 catalogView.refresh() 并检查当前 rows，没有精确扩大分页、独立按 captured dbid/name 查询或确认当前查询身份仍等于原目标（lowcode-database-table-view.ts:75-85,125-143；lowcode-database-dataset-extensions.ts:243-251,291-299）。命令 owner 随即先 pending.delete，再把 undefined 解释为 NOT_APPLIED（data-set-command-view.ts:177-180）；若新增对象在当前20行之外，或当前目录上下文已切换，可能错误解除 unknown，允许之后重新派发。需要按 exact dbid/name 做可证明完整的正式 DataView 读回，且仅在读回范围确证不存在时解除 unknown；单页未命中应保持待核验。另有两条实际恢复风险：verify 请求自身失败会令 pending 保留；页面下一次确认被 runRegisterCommand 的 hasUnconfirmedSave 前置检查拒绝，页面没有该命令显式“核验保存结果”入口（database-catalog-register-view-ops.ts:41-60；table-and-view-page.vue:666-696）。批次第 k 项明确失败后，前 k-1 项已经成功，但 UI 只在整个循环成功后清选择并刷新未登记列表；异常时所选整批仍在，重按确认会从第一项重新执行，已成功项可能再次发 POST。当前测试只覆盖单项成功，未覆盖多项部分失败/unknown 和这些恢复路径。下一组需按项保留完成状态/用正式目录读回剔除已完成项，并为 unknown 提供精确核验及页面恢复；不能宣称原 API 的批次原子性。 |
| **编辑表/字段、物理同步边界** | 参考保存 saveTableDesign 将 _Base_TblList 与 Base_TblField 变更交给元数据 API；另有独立 syncTableMetadata 调用 /Table/SyncMetaData/{dbid}/{tableid}（TableDesign.ts:587-645,658-680）。新表 saveAddTable 同样提交表/字段元数据；代码本身不能证明是否由服务 owner 同步执行物理 DDL（AddTable.ts:133-190）。 | 本仓以正式表、字段 DataView 变更经 DataSet 保存；本专题同时有显式同步命令。 | 把 _Base_TblList/Base_TblField 元数据保存、已存在物理表登记、物理元数据同步/DDL 分开验收。当前材料不能证明新建表 metadata save 一定产生物理 DDL；也不能将注册已存在物理表说成 DDL。 |
| **复制/删除表视图** | 参考 copyTable 读取源目录行和字段，剥离部分审计字段，再保存新的 _Base_TblList + Base_TblField（TableAndView.ts:248-302）；delete API 仅移除 _Base_TblList 或 _Base_ViewList 行（229-246）。未见复制业务行或显式物理 drop 的前端调用。 | 当前复制要求源表在当前 DB、目标名唯一、字段已加载；向原 DataView 暂存新表/字段，同次 DataSet.saveChanges 后刷新核验（database-catalog-copy-view-ops.ts:52-111）。删除仅 view.removeRow + DataSet.saveChanges 当前 _Base_TblList/_Base_ViewList 目标行，之后刷新（database-catalog-object-view-ops.ts:18-30；页面 table-and-view-page.vue:651-663）。 | 当前/参考前端均不能据此宣称复制物理数据或删除物理对象。删除表的字段、关系和其他引用是否由服务级联，源码/现有证据不足；必须沿实际删除命令和读回确认，不在本组做全空间预查或物理破坏 smoke。复制后若要作为可运行业务表，应验证目录行、字段和实际目标消费；本次静态代码仅证明元数据行复制。 |
| **旧 /DataBaseManage/TableAndView URL/宿主身份** | 原入口明确以 /DataBaseManage/TableAndView?databaseId=... 导航（参考 DataBaseManage/index.vue:780-789）。 | 本仓当前数据库目录跳 canonical route /features/data-platform/database-management/table-and-view/ui/table-and-view-page，携带正式 databaseId 并以真实导航节点导航（src/views/DataBaseManage/DataBaseManage/index.vue:195-230）；动态路由当前由页面注册表构造并 addRoute(route)，未见 route alias 字段/解析层（packages/spark-app/src/router/dynamic.ts:680-762）。 | **旧路径未形成别名合同。** 不能用 wrapper 伪造 system-page nodeId，也不能把旧 URL 直接声明成兼容。若按迁移原则必须保留原 URL，应由路由层明确支持 alias 并让 alias 命中同一 canonical host/正式节点身份；否则旧 URL 仍是待裁决差距。不要借本专题硬编码导航节点。 |

## 现有覆盖与证据边界

- 页面/owner 夹具覆盖单个表、视图注册及成功回读（tests/runtime/page/database/table-and-view-page.test.ts:732-801、database-catalog-table-view-ops.test.ts:80-103）；通用 spark-data command 测试覆盖 unknown capture 后只 verify（packages/spark-data/src/tests/dataset/data-set-command-submit.test.ts:76-106）。没有数据库注册 adapter 的专用 unknown POST计数/单页未命中测试，也没有多项中途失败后重按确认的页面恢复测试。源码证实自动恢复不重发 POST；但默认目录单页核验可能把“未显示”误判为“未执行”，而批次/UI仍有上文恢复缺口。服务器测试覆盖的是 registerServer 及服务器级连接检查，不是旧数据库级测试（tests/runtime/page/database/database-server-catalog.test.ts:66-127）。
- 数据库目录测试覆盖目录创建及未登记名称查询，不覆盖 dbOperateData 登记、目录 edit/delete 或 DB-specific connection test（tests/runtime/page/database/database-directory-page.test.ts）。
- 之前的只读导航/目录烟测只证明当前正式导航和页面读链，不证明上表中的未实现写操作。当前没有本报告范围内的服务端 DDL、物理 drop、连接凭据持久化或别名命中验收。

## 建议的下一组与验收边界

1. **优先恢复数据库目录生命周期里目前缺失的用户动作**：已有库登记（选服务器、查询未登记清单、多选、命令提交、目录读回）、对已登记记录的编辑/删除入口、数据库级连接探测。三者共用目录 DataSet/DataView 与原命令资源；但删除的服务级联语义未证实，应先有明确的逐行变更/回读合同后再做真实删除。DB-specific probe 只测连接，不写目录，不保存密码。
2. **单列批量表/视图注册可靠性验收**：保持 DataSet command DataView 路径，明确分项成功/失败/unknown 和回读核销；至少验证“两项第一项成功、第二项失败”后 UI 不丢失失败项、不整批盲重试，目录确实只登记已成功项。若产品要求一次数组命令/批次原子性，当前逐项 DataView owner 与该合同冲突，需主控先裁定语义再改，不可从原 API 接受数组推定服务具原子事务。
3. **复制/删除/物理同步与旧路径另作明确边界**：先区分目录元数据 CRUD、源物理对象注册、显式同步和真实 DDL；目标空间只验证可读的精确结果，不在本只读范围推断跨资源事务。旧 URL alias 需路由层/页面身份合同，不以组件 wrapper 替代。

所有恢复动作仍须沿本仓 SPARK data API/DataSet 保存或命令 DataView，不恢复参考仓业务层 API 旁路。上面确认的是源码差异；服务端具体 DDL、级联、批次回执和 URL alias 行为都需相应真实回执才能升级为已证实合同。

## Java 参考源码补充：数据库目录写入的实际副作用

只读追踪参考仓 API 和本地 Java 源码；没有请求服务、写数据库或运行 Java。下列结论是源码合同线索，不证明当前部署版本完全一致。

### 1. 登记已存在物理数据库：目录登记，不创建数据库

- 参考前端 `registerDataBases` 将 `serverId` 和 `registerData` 封装到 `dbOperateData`，走 `metadataSparkApiClient.create`（`E:/r/sparkproject/packages/data/metadata/src/api/DataBaseManage/DataBaseManage.ts:199-221`）。这与普通 `_base_dbInfo` 新增分支是不同操作。
- Java 明确公开 `POST /api/Db/registerDB/{serverId}`，请求体是物理数据库名字符串数组；注释称只将已存在库登记到 `_base_dbInfo`，不创建物理数据库，且新记录默认 `PRIVATE`（`E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/controller/DbInfoController.java:140-182`）。服务用所选服务器凭据查物理库名，再逐项校验保留名、重复及实际存在性；每项事务成功后新增 `_base_dbInfo` 行，并把服务器上的用户名、加密密码、主机、端口写入该目录记录（`.../service/impl/DbInfoServiceIImpl.java:145-209`）。这不是物理 DDL。
- 两个源码形态并未对齐：本地 `DbInfoServiceIImpl.OperateDBData(OperateData)` 只消费单条 `addData/editData/delData`，会分发到普通目录 CRUD（同文件 `:453-484`）；单独的 `OperateDBData` DTO 虽声明 `serverId/registerData`（`.../vo/meta/OperateDBData.java:14-30`），但在本地代码搜索中未找到它被该 CRUD 路径使用。故参考前端的 `dbOperateData` 请求不能仅凭名称认定会命中 Java `/registerDB/{serverId}`。实施前应从当前已部署正式合同确认实际 SPARK data 命令映射与回执结构；不要把未对齐的 Java 源码推断成已验证服务协议。
- 源码还有逐项结果的不一致风险：`registerDB` 对名称不存在/重复等校验错误放入结果 map 并继续；写入异常则先回滚当前项、填入错误后抛出 `SystemException`（`.../DbInfoServiceIImpl.java:159-209`）。因此注释所说的“每库分别返回”不能覆盖异常路径；此前成功提交的项可能已持久化。实际客户端必须按服务回执辨认部分成功，不能整批自动重试。

### 2. `_base_dbInfo` 新增：会尝试创建物理数据库

- `BasicFunServiceImpl` 将 `_base_dbInfo` 系统表路由到 `dbInfoService.OperateDBData`（`E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/service/impl/BasicFunServiceImpl.java:680-694,822-838`）。其 `addDBData` 先拒绝已登记或物理上已存在的同名库，之后复制服务器连接信息写入目录行，并调用 `DBUtil.ensureDatabaseExists(...)` 创建物理库（`.../DbInfoServiceIImpl.java:487-551`）。方法注释也明确“数据库不存在，要新建数据库”。
- 该服务方法带 `@AutoCommit`，源码注释称物理创建失败会回滚元数据写入；这是事务/物理库交错的源码描述，不等于已证明所有驱动的补偿行为。成功响应会清空返回对象中的 `Password` 和 `UserId`，但持久化前仍将服务器存储凭据写到数据库目录对象；运行时解密服务器密码后用于物理连接（同文件 `:529-551`）。因此本仓当前“新增数据库”通过 `_base_dbInfo` DataView 保存的行为不能描述为单纯插入目录记录；真实执行前必须明确用户是在物理建库还是认领已有库。
- 连接测试是另一独立动作：`DbInfoController.testConnection` 注释说明请求凭据即时使用、不保存配置，`dbName` 可选以区分仅测服务器或同时检查目标库（`.../controller/DbInfoController.java:26-52`）。不能把“连接测试成功”当作创建/登记回执。

### 3. 编辑与删除：目录字段更新/受限移除，不见物理 DROP

- `updateDBData` 只更新 `Remark` 和可选 `visibility_scope`，按 `Id + EnterpriseId` 定位目录记录；没有更新服务器凭据，也没有数据库物理变更调用（`.../DbInfoServiceIImpl.java:554-595`）。
- `deleteDBData` 先按 `Id + EnterpriseId` 读取，再通过 `assertDatabaseHasNoActiveChildren` 检查 `_Base_TblList` 与 `_Base_ViewList` 的有效子行，非空时拒绝删除；通过检查后只删除 `_base_dbInfo` 记录并清缓存（`.../DbInfoServiceIImpl.java:601-645`）。此方法没有 `DBUtil.dropDatabase`，也没有直接检查/删除 `Base_TblRln`。所以源码支持“受子目录守卫的连接目录记录删除”，不支持“删除物理数据库”或“级联清理所有关系”；有效表/视图存在时应拒绝，历史关系记录的处理没有在此路径得到证明。

### 对下一目录生命周期组的合同与验收边界

1. 把操作明确分成“登记已存在物理库”“创建新物理库”“编辑目录信息”“删除目录连接”“连接探测”。尤其当前 UI 的“新增数据库”若沿 `_base_dbInfo` add/save，后端源码显示它会尝试物理建库；不要用这个入口登记已经存在的库。保持业务调用沿 SPARK DataSet/DataView 或其命令 DataView，不能从页面另开原始 HTTP 请求。
2. 登记已有库应先确认部署中的真实命令/路由、请求 DTO、每项回执、unknown capture 与精确目录读回。若运行服务实际采用现有 `dbOperateData` 命令，应通过正式 DataSet 命令视图提交并用正式目录 DataView 核验；不得仅因本地 Java 有 `/registerDB/{serverId}` 就改造或直调它。多项部分成功须保留逐项状态，重试前先 readback 已成功项。
3. 对创建、删除物理对象的真实验收设单独边界：本轮没有执行任何物理建库/删除。部署前至少核对目标服务器、数据库名、数据库是否已存在、是否有目录子对象及返回形态；没有精确目标与明确操作授权时不进行真实物理建库或删除。连接探测不能保存明文密码或把临时凭据加入目录行。
4. 删除入口需按源码守卫表现为：有有效表/视图时拒绝且目录不变；无有效表/视图时才可评估目录行删除。关系记录是否随表/视图删除及其历史孤儿状态仍属待核实，不宣称存在完整级联；本组不扩大为权限专题或全空间预扫描。

待部署只读核验项：对照实际服务版本确认 `dbOperateData` 的正式执行路由；读取新增/登记后的 `_base_dbInfo` 精确行（脱敏）；只读核验有效子表/视图下删除的拒绝结果；核对是否存在关系引用及实际失败提示。不要为证明物理副作用在线创建或删除数据库；物理操作只在另有明确目标与授权时单独安排。






## Java 参考源码：表登记的逐项结果与物理字段边界（非实服证明）

仅只读检查 E:/lowcode-jdk17 源码；未启动、编译、部署 Java 或请求服务。以下是代码路径推断，必须与当前实际服务回执区分。

- TableFieldController.registerTable 收到数组后直接返回 AjaxResult.success(tableFieldService.registerTable(dbId, data))。OpenAPI 描述明确：这是把已存在物理表登记到 _Base_TblList 并读取现有字段写入 Base_TblField；它不会创建物理表；hasDefaultFields=1 会补平台默认物理字段；各表独立事务并分别返回结果（E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/controller/TableFieldController.java:146-200）。
- TableFieldServiceImpl.registerTable 对每个请求表分别开启、提交/回滚事务（lines 1313-1357）：表不存在/已注册写入相应 resultMap 项；成功写“注册成功”；catch 后回滚该表并写“注册失败+异常”。方法最后返回 resultMap（1237-1369）。所以源码合同不是整批原子：同数组项可各自成功/失败，失败项状态位于 Result 内，外层 Controller 仍走 AjaxResult.success。表登记与物理建表是两回事。
- hasDefaultFields=1 确实有物理 DDL 副作用：注册服务先从物理表读已有字段，给缺失的默认字段构造 MetaTbField，然后调用 MetaDataService.addFields；该方法创建物理 Column 并执行 service.ddl().save(table)，再写 Base_TblField 元数据，metadata 添加失败时会尝试补偿删除本批物理列（TableFieldServiceImpl.java:1327-1348、MetaDataServiceImpl.java:354-428；默认字段集合见 TableFieldServiceImpl.java:735-775）。这是“补字段”的物理 schema 变更，不是创建物理表；每项独立事务的服务说明与上述默认字段 DDL 不应被误述为跨来源事务已实服验证。
- 本仓 table-register adapter 发 POST 时已把 addDefaultFields 映射成 hasDefaultFields 0/1（src/lowcode/resources/database/lowcode-database-dataset-extensions.ts:225-234），但 commandAjaxResult 只看外层 Code 是否 0/200 并返回 Result（同文件:123-128）；调用点不读取该返回值就构造 accepted row（230-242）。若实际服务按 Java 源码返回 Code=200、Result 中某个 tableName 状态为“表不存在/表已注册/注册失败…”，本仓会把该单项当成功继续；随后虽 refresh 目录，registerTableItem 只查 loadingError、不核对请求表名是否已进入目录（database-catalog-register-view-ops.ts:65-83）。这是明确的实现/参考合同不匹配，需用真实服务回执确认后修正：按单项读取 Result 状态，只有该表明确“注册成功”才接纳；非成功作为命令失败保留未完成状态。若运行服务的 Result 结构与参考源码不同，应以实际回执重新定解析合同。
- 本仓把 UI 多选循环拆成每个表一次 POST（database-catalog-register-view-ops.ts:104-114）。这比原批量数组更容易逐项记录，但当前 UI 只在全循环成功后清选项、刷新子目录（table-and-view-page.vue:666-696）；某项失败时之前成功项仍在原选中集合。若用户重确认会再次提交先前成功项。未知回执的 owner 再次 saveChanges 是原 capture verify（前文已核），并不自动重发；但目录核验分页/当前筛选未找到可能不构成权威未执行。部分成功恢复仍须单独解决，不能靠“每项事务”推成整批已完成或失败。
- **Base_TblRln 普通行 CRUD 不走表/字段 DDL 分支**：SysTable 枚举包含 _Base_TblList、Base_TblField 等固定系统表，但没有 Base_TblRln（E:/lowcode-jdk17/lowcode-framework/lowcode-common-data/src/main/java/com/htong/constant/SysTable.java:6-34）。BasicFunServiceImpl 对注册为 SysTable 的内置目录才 dispatch 到 tableFieldService.operateTable/operateField；其余 CRUD 路由到普通 operateRows（E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/service/impl/BasicFunServiceImpl.java:642-677，另一个批量分支 822-847）。因此本关系编辑专题对 Base_TblRln 的 DataView 行增改删，是既有数据记录 CRUD；源码中没有因此触发 operateTable/operateField 或自动物理 schema DDL 的路线。物理 DDL 另由注册默认字段/表字段设计等相应服务明确执行。此项仅界定 Java 源码责任边界，不证明当前服务部署版本或真实写入成功。
