# 阶段 B：数据库资源当前合同核定

基线：`1f888531293a8677533173dfde97a243e5934acb`。本报告只读静态核定；没有发服务请求、没有改产品/测试/台账/Java。数据库平台在唯一台账阶段 B 范围为服务器维护、数据库/表/视图发现登记、字段/关系/复制/同步/设计/预览/删除（`notes/data-space-retirement-ledger.md:810-815`）；页面存在不代表闭环，阶段退出要求实际服务结果、失败/部分成功/未知、重开与下游核对（同文件 `:868-899`）。

## 结论与建议的最小下一组

建议下一实施组聚焦**“已有物理表、尚未登记到目录的单表闭环”**：在一个已选服务器/数据库内发现该表名；通过现有正式入口登记目录资源；沿正式目录 DataViews 核对/编辑表头与字段定义；需要时按已核清合同同步物理字段元数据；对同一物理表做有界 GetData 预览。这里“已有物理表”与“目录中未登记”是两个不同状态，绝不把目录登记当作建表。此组覆盖来源发现、正式模型注册、设计、同步及下游读取，避免只验按钮；不把“复制目录记录”说成物理复制，也不把删除混入本组。

**当前没有批准注册、同步或设计保存。** 只读阶段可先用授权范围内的现有数据库目录 DataViews 与物理表预览，确认实际目标、请求/响应/Loaded 状态和可用字段；仅凭目录或预览不能证明注册、同步/设计保存副作用、失败/未知处置、重开后的持久结果或业务下游。后续是否开放写操作由主控基于这份只读结果另行决定，不把未发生的批准写入报告。`backend-api-contracts` 多数响应类型仍是 `AjaxResult<unknown>`，它本身不能证明当前部署行为（`backend-api-contracts/endpoints.ts:642-664,717-752`）。

## 当前链路及边界

### 装配、范围与视图

- 页面从路由/导航解析一个正式数据空间身份；装配五个正式模型 `_base_dbInfo`、`_Base_TblList`、`_Base_ViewList`、`Base_TblField`、`Base_serverInfo`，再以同一 DataSet 增装选项、关系、工作流、注册/同步/预览命令视图（`src/lowcode/resources/database/lowcode-database-table-view.ts:47-67,88-104,214-260`）。服务器→数据库、数据库→表/视图、对象→字段均为 `autoLoad:false` 级联（`:111-151`）；服务器目录先 refresh，当前有行时选择首行再查库（`:273-287`）。
- Hub 有 `full` 与 `serverOnly` 分档；合同明确当前 FormKey 可能仅有 `Base_serverInfo`、完整五表缺失，页面据此阻断目录，不用本地拼装假目录（`src/lowcode/resources/database/database-catalog-scenario.ts:129-132,282-313`; UI `src/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue:9-13`）。这是加载范围/正式模型可用性门槛，不是服务端有无业务能力的证明。
- 页面列表和编辑控件普遍绑定 `data-view-key`：数据库列表、表/视图目录、字段、表/视图设计表单、关系、预览均用 DataView/Renderer（`src/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue:14-40,67-90`; `table-design-dialog.vue:6-60`; `view-design-dialog.vue:6-29`）。目录配置把字段表格视图限制到 `tblid`，按需加载（`lowcode-database-table-view.ts:138-151`）。

### 可追踪的消费与提交范围

- 目录编辑以 staged DataView 的变更提交。字段单独保存只提交字段 view；设计保存仅收集明确传入且当前 loaded/dirty 的字段、对象及关系 view，并在成功后各自 refresh（`src/lowcode/resources/database/database-catalog-field-view-ops.ts:14-24,36-50,60-84`）。因此并非全空间扫描；具体按钮操作是否包含所需 view，要沿页面对应传参验收。
- 注册数据库与编辑数据库通过目录 DataView；注册物理表/视图则是命令 DataView，`DataSet.saveChanges` 进入内部 resource adapter，再 POST 对应服务端命令，结果未知时刷新正式目录核验而不重放（`src/lowcode/resources/database/database-catalog-db-view-ops.ts:71-109,113-147`; `database-catalog-register-view-ops.ts:36-62`; `src/lowcode/resources/database/lowcode-database-dataset-extensions.ts:203-253,261-301`）。这是“页面走 SPARK data、owner 内部适配 HTTP”的现状，不是页面直连；但仍须按每条真实提交结果验收。
- 当前表预览在内部 query owner 使用 `/api/DataOperation/GetData`，构造 `Type='数据库表'`、DbName/DbId、物理表名、主键与由目录字段产生的 Fields，再将响应投影到只读结果 DataView（`src/lowcode/resources/database/database-catalog-preview-view-ops.ts:141-165,188-235`）。它是明确的下游消费样本，但仅是有界预览，不能证明任意业务模型消费。
- 数据库设计对话框的字段和表头绑定原目录 DataView；关系编辑则先 `view.addRow` 并设 current/selected，再将字段投影到独立 `DatabaseCatalogRelationFormDraft`，保存时再写回 DataView（`src/lowcode/resources/database/database-catalog-relation-form-ops.ts:57-76,86-108,110-120`）。这有一段本地 draft 与 DataView 双状态，取消/连续编辑时应核查 draft 是否丢弃且没有漏写/重放；不能仅因最终通过 DataSet 保存就称没有独立草稿。
- 目录删除当前是目标行 DataView `removeRow` + 该视图/ID 的 `saveChanges` + refresh，删除前只看当前行权限状态（`src/lowcode/resources/database/database-catalog-object-view-ops.ts:11-29`）。它没有前端全局引用扫描合同；不据此承诺后端级联、引用保护或无引用。
- 当前“复制表”是从已加载的目录行和字段行生成新的 `_Base_TblList` + `Base_TblField` 记录，并同次 DataSet 提交（`src/lowcode/resources/database/database-catalog-copy-view-ops.ts:62-111`）。代码没有创建物理数据库表/复制业务行的调用，故语义只能称目录定义复制；须用反例确认界面不会误导为物理复制。
- **字段设计保存不能推定零 DDL。** 本地页面的字段/表头编辑经 `DataSet.saveChanges` 发出系统模型 CRUD（`table-and-view-page.vue:842-854`; Java参考 `BasicFunController.java:141-162` → `BasicFunServiceImpl.java:822-844` 将 `BASE_TB_FIELD` 转给 `tableFieldService.operateField`）。该 owner 对新增字段调用 `MetaDataService.addField`（`E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/service/impl/TableFieldServiceImpl.java:611-659`），编辑调用 `editField`（`:568-599`）；后者对结构变化执行 `service.ddl().alter(table)`，并把字段 `cnname` 纳入 physical-change 比较（`E:/lowcode-jdk17/lowcode-framework/lowcode-anyline/src/main/java/com/htong/service/MetaDataServiceImpl.java:561-595,966-973`）。物理删除则走 `MetaDataService.delField`（TableFieldService `:532-564`）。因此字段名/类型/长度/空值/唯一/默认值及 `cnname` 注释修改、新增/删除字段都不能当作纯元数据维护。
- 表设计头部当前只呈现 `tbldesc`、`Expression`、`IsVisible`（`src/lowcode/resources/database/database-catalog-object-design-metadata.ts:39-43`）；Java `operateTable` 中名称改动调用 `MetaDataService.editTable`，表说明/表达式等进入元数据更新（`E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/service/impl/TableFieldServiceImpl.java:261-315`）。服务实现需进一步区分具体字段改动的 DDL；仅对照当前 UI 头字段和 Java源码，不把展示标签“中文名”直接等同字段底层物理字段注释。

### 未闭合项与合同冲突

- 参考仓真实调用链是老的独立 API 及本地状态：`use-table-and-view-page.ts` 持有 `SparkResourceQueryContext`、直接 fetch 数据库/表/视图列表并调用 `copyTable/deleteTable/deleteView`（`E:/r/sparkproject/packages/ui/domain/metadata/src/features/data-platform/database-management/table-and-view/ui/use-table-and-view-page.ts:1-3,52-65,217-220,365-436,555-630`）；表设计通过 `getTableFields/saveTableDesign/syncTableMetadata/saveTableRelation`（`.../use-table-design-dialog.ts:16,633-686,901-963,1185-1235`）。它可证明参考业务有哪些操作，不能证明当前数据层统一或服务现状。
- `SyncMetaData` 的权威源码映射已进一步核实：Java controller 明确路由 `{POST, GET}`，并写明 POST 推荐、GET 仅兼容旧客户端；该操作以物理结构为准更新 `_Base_TblList/Base_TblField` 字段元数据并清理缓存，属于写操作，且限定当前租户为表所有者（`E:/lowcode-jdk17/lowcode-mainbody/src/main/java/com/htong/controller/TableFieldController.java:78-115`）。本仓适配器使用 POST、空对象 body，method 与 controller 推荐方式一致（`src/lowcode/resources/database/lowcode-database-dataset-extensions.ts:194-197,304-335`）；参考仓公开 API 经 `spark-api` 的 create 命令也映射 POST（`E:/r/sparkproject/packages/data/metadata/src/api/DataBaseManage/TableDesign.ts:658-679`; executor `E:/r/sparkproject/packages/data/spark-api/src/protocol/executor.ts:1052-1067`）。
- 有差距的是**派生合同/旧调用材料**：`backend-api-contracts/endpoints.ts:717-726` 只登记 GET；参考只读 Java Feign `E:/lowcode-jdk17/lowcode-mcp-server/src/main/java/com/htong/feign/main/TableFieldFeign.java:23-28` 也只保留 GET 兼容入口；仓内 `lowcode-endpoint-ledger.json:4412-4420` 从 controller 探测只列 POST 一条，未表达双 method（但 POST 方向正确）。所以源码级 method 合同已清楚，不应再称无法判断或以真实写请求作为协议探针。当前部署服务是否与该 controller 源码一致仍未知，待主控批准后才做真实写验收；不双试。
- 表/视图注册命令端点使用 `AjaxResult<unknown>`，请求只记 `Record<string,unknown>[]`（`backend-api-contracts/endpoints.ts:741-752,781-792`）；服务端实际字段、部分成功语义、表字段是否注册后自动生成，静态合同不充分。服务注册也只列 `ServerInfo → AjaxResult<unknown>`（`:642-664`）。
- 后续如果主控开放设计写操作，须按字段属性逐项核 Java metadata write owner/handler。参考代码明确 `cnname` 会驱动物理列 comment DDL，结构字段及新增/删除字段会触发物理操作；不能用“只改描述即可保证零 DDL”的验收假设。还须核当前服务是否对应源码版本、是否存在本地/真实补偿差异、物理结构与目录回读是否一致；当前源码不能替代部署验证。
- 设计/维护入口目前都是 Vue 系统页与对话框，并未按“原理 + 方案设计 + 数据维护”形成完整资源专题三段。方案设计/DataView目录维护的一部分可见；业务数据维护在物理表预览仅只读，有无正式业务 CRUD 闭环未由此链证明，不应顺手扩成批量维护。

## 当前可执行只读探针与后续边界

1. 仅选授权范围内**已登记、可读**的数据库/表作为探针目标；通过现有页面/DataView读取服务器、数据库、表、字段目录，不扫全空间。记录请求 scope、目标身份、查询状态、实际返回的完整性线索与错误。若目录视图未 Loaded、分页不完整或权限不明，不推断“没有对象”。
2. 用同一已登记目标调用页面现有有界 GetData 预览，只读核对真实 request descriptor、页码/页大小、返回行列/总数及 DataView requestState；空页、权限拒绝、字段裁剪、服务错误均作为反例，不能把当前页无数据解释成底层全表为空。
3. 本轮只读探针为零注册、零同步、零设计保存、零删除、零业务行写入。注册未登记物理表、字段同步、设计保存和未知结果恢复均是后续独立授权的真实写验收项；在主控尚未批准前不执行。若以后批准，先按 controller 推荐的 POST合同和 owner 的正式 DataView 流程执行，不把请求当猜协议的探针。字段设计验收需包含清晰的物理 DDL 预期/观测，不假定只保存描述或只变元数据。
4. 即使只读探针通过，也只证明这次授权范围下目标目录和 GetData 读路径；不证明写路径、元数据/物理 DDL 边界、未加载对象、跨应用/租户/权限全集、删除引用完整性或业务页下游。

## 不可由本报告证明

真实服务端是否接受同步 method、注册/同步的原子性、目录模型是否完整/分页、字段权限/权限过滤、删除级联与引用约束、跨角色/应用全集、物理 DDL/数据是否发生、未知回执后是否稳定可读，以及设计定义的业务下游消费者。参考仓/Java只能作语义与协议源码对照，当前部署能力必须由授权范围内正式 SPARK data 单资源读写验收确认。
