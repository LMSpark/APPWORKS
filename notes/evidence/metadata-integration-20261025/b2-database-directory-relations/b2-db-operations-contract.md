# B2 数据库主列表剩余操作合同核对

范围：按 `b2-entry-implementation-brief.md` 只读核对数据库主列表的批量注册、编辑/删除、连接测试，以及当前 SPARK data 适配。未调用服务/浏览器，未改产品、测试、Java 或台账。

## 结论

数据库主列表后续仍有三个独立业务闭环，不应把当前单行注册当成完整交付：

1. **批量注册数据库**：参考页有“明确选服务器 → 查询未注册/已注册库 → 多选未注册项 → 一次批量注册命令 → 按结果更新列表”的业务路径。当前 SPARK data 已有未注册库 DataView 读取与单行 `_base_dbInfo` 新增；没有数据库批量注册 command view/submit owner。因此当前“有未注册名查询”不能视作完成了注册提交。
2. **编辑/删除数据库**：参考页在 `_base_dbInfo` 上分别执行更新和删除；当前页面操作 helper 只支持 add 模式，没有数据库 edit/delete 命令。DataSet/DataView 通用 staged `saveChanges` 可作为唯一写入承接，但须以真实视图主键、字段/行权限及本次差异提交，并核删除结果；不能退回页面 API client。
3. **对已有数据库记录测试连接**：参考页面传入所选 DB 的主机、端口、账号、密码、类型和 `dbName`；当前可复用的连接测试 DataView 属于服务器注册表单，输入无 `dbName`，不会测试列表中的具体数据库。需要独立的只读 SPARK data 命令视图把数据库行输入投影到已有连接测试 owner；当前没有这条数据库记录消费链。真实服务是否接受 DB 测试负载、回执仍需主控正式验收。

上述均为源代码合同差距；本轮没有调用这些写/测试操作。当前存在的 `databaseCatalogRegisterTables/Views` 是物理表/视图注册，不是数据库批量注册（`src/lowcode/resources/database/database-catalog-register-view-ops.ts:104-125`）。本次检查时目标原生落点 `src/views/DataBaseManage/DataBaseManage/index.vue` 尚不存在；现有数据库单行新增 helper 属于旧 TableAndView 路径，不能冒充新主列表。此前 B2 formal probe 只证明模型/字段/来源元数据可读，不能证明批量注册、数据库 update/delete 或连接测试的部署端行为。

## 逐用例对照

| 用例 | 参考仓真实 owner 与输入/回执 | 当前 SPARK data 实现 | 直接缺口与最窄归属 |
| --- | --- | --- | --- |
| 批量注册数据库 | `DataBaseManage.ts:162-178` 查询指定 `serverId` 的未注册库；`:183-188` 查询该服务器已注册库。`registerDataBases()` 在 `:202-221` 调 `metadataSparkApiClient.create({metaName: SPARK_BUILTIN_META.dbOperateData}, [{editData:'', addData:'', serverId, registerData: rows}])`，读取 `Type/Message` 回执。页面显式选服务器、在未注册列表勾选名称、提交并按回执刷新（`DataBaseManage/index.vue:234-256,676-731,912-967`）。 | `lowcode-database-dataset-extensions.ts:39-58` 将未注册库 GET 端点作为只读 `DataView` command resource；`database-catalog-db-view-ops.ts:150-159` 通过该 view 刷新读取名称。当前 `_base_dbInfo` 单行新增经原正式 view + `DataSet.saveChanges`（`:71-94,106-147`）。当前未发现 `dbOperateData`、`registerDataBases` 或对应批量 command submit binding（`src/lowcode/resources/database` 与 `packages/spark-lowcode-api/src` 搜索无匹配）。 | 批量查询已有，批量**提交**缺失；单行新增是另一条语义，不能替代服务器关联批量注册。最窄 owner 是该数据库 DataSet 的 command input/result DataView 与 spark-data command submit adapter，在取得现有 built-in `dbOperateData` 正式 adapter/回执合同后，承接同一批 `registerData` 命令；不在 UI 直调 legacy client/HTTP，不发明新 endpoint。批次的部分成功/未知回执必须按真实结果合同确定，当前代码没有证据可承诺原子批量。 |
| 编辑数据库 | 参考 `updateDataBase()` 要求 `Id`，提交 `serverId/Name/SchemaName/Remark` 至正式 `_base_dbInfo` update owner（`DataBaseManage.ts:41-48,242-255`）；UI编辑读当前行、校验对话框并完成后重查列表（`DataBaseManage/index.vue:768-787,839-867`）。 | 现有 DB view 是 staged；唯一 DB 行 helper 的 edit state 类型 `mode:'add'`，保存用 `addActionState()` 及 `createFields`（`database-catalog-db-view-ops.ts:14-23,113-147`），无 edit action/字段更新流程。底层 `DataSet.saveChanges` 是现有统一保存 owner。 | 缺 `_base_dbInfo` 行级编辑流程、编辑字段/权限校验和改后回读确认；最窄归属是现有 DB DataView 对同一行的 `beginEdit/cancel/save` helper，保留字段权限并由 `DataSet.saveChanges({views:[{tableName,viewId,ids:[pk]}]})` 提交。不要复制参考仓直接 `metadataSparkApiClient.update` 的页面调用。 |
| 删除数据库 | 参考 `deleteDataBase(id)` 只接收数据库 `Id`，经 `_base_dbInfo` remove owner 删除；主列表以确认对话框包裹并成功后刷新（`DataBaseManage.ts:261-267`; `DataBaseManage/index.vue:118-125,813-837`）。此调用路径本身没有显示前端级联/完整引用扫描。 | 当前 `database-catalog-db-view-ops.ts` 无 database delete action；DB model DataView 可从正式模型装配，通用 DataSet 保存接收目标 view/id。服务器删除 helper 是另一个模型（`database-server-view-ops.ts:218-230`），不能拿来代表 DB 删除。 | 缺数据库行删除的权限/身份/未知结果处理与重新读取验收；窄归属是原 `_base_dbInfo` DataView `removeRow(pk)` + scoped `DataSet.saveChanges`。参考前端没有给出完整性语义；不得增加全空间引用扫描或声称级联。服务实际删除/引用约束须单独按正式回执核定。 |
| 对已有数据库测试连接 | `DataBaseManage/index.vue:789-810` 按数据库行传 `ServerName/ip_address/Port/UserId/Password/Type/dbName=row.Name`；`DataBaseManage.ts:80-89,273-284` 组装参数；`db-test-connection.ts:20-35` 通过 `SPARK_BUILTIN_META.dbTestConnection` 的 `metadataSparkApiClient.query` 输入六个字段并读结果，`isDbConnectionOk` 只认 `Code===200 && Result===true`（`:37-42`）。文件注释标示此 built-in 对应 `/Db/testConnection`，但该参考源码不是部署服务证明。 | 当前 `attachServerConnectionTestViews` 的输入 DataView 只有 `Type/ServerName/ip_address/UserName/Password/Port`；其只读结果 view 经 `/api/Db/testConnection` 读布尔 `ok`（`lowcode-database-dataset-extensions.ts:359-387`）。`databaseServerTestConnection` 限定 `mode:'add'` 且从服务器注册命令 view 读取，不接收 DB name（`database-server-view-ops.ts:232-249`）。`LowcodeDatabaseTableView` 所装命令没有 DB 级测试 view。 | 缺“当前数据库行 → 测试输入 → result view → 结果提示”的 DataView 闭环。最窄复用是数据库页当前 DataSet 中窄输入/结果命令视图，沿现有服务器连接测试 command-view 结构和源码可见 `/Db/testConnection` 路径接入；字段须含 `dbName` 并绑定所选数据库行，页面不持有密码提交器、不直调 HTTP。既有服务器测试只证明服务器注册场景负载，不证明 DB 级负载或正式 built-in 的部署映射；须实服验收服务是否消费 `dbName` 及回执结构。 |

## 主键和权限边界

- 参考 DB API 使用 `Id`（`DataBaseManage.ts:24-48,227-267`）；当前正式数据空间 API 用 `Base_DataModel_Field` 加 `View_TblList/Base_TblField` 校验数据库表来源的实际主键，并把它投影为 `DataSpaceFormalModel.primaryKey`（`data-space-design-api.ts:162-183,474-515,677-740`）。当前目录 DataView 默认排序依赖 `model.primaryKey`（`lowcode-database-table-view.ts:75-83`）。
- 已存 `b2-database-entry-probe-result.json` 证实 `_base_dbInfo` 的 30 个字段和来源核验成功，但摘要没有保存实际 `primaryKey` 名称；字段名同时出现 `Id`、`rowid`，不能凭名称判定哪个是源表主键。数据库新增 helper 当前硬编码要求 `created.rowid`（`database-catalog-db-view-ops.ts:87-93`）；这是需对齐正式 `DataView.getPkKey()`/有效模型主键的直接检查点。不能改用参考 `Id` 或测试夹具中的 `rowid` 先验猜测。
- 更新、删除、批量注册、连接测试都不得绕过 DataView/正式执行 scope/字段权限。数据库删除不得套用服务器删除代码，也不得新增全量依赖扫描；任何业务删除限制只认现存正式命令/服务回执。

## 部署证据界限与建议下一组

已部署只读证据证明 `数据库管理` 正式空间有 `Base_serverInfo` 与 `_base_dbInfo` 两个正式模型；`_base_dbInfo` 有 `Id`、`Name`、`SchemaName`、`Remark`、连接信息等 30 个字段，正式来源与唯一主键检查通过（具体 key 未存于该摘要）。这只证明定义/字段读取与来源映射，不证明任何写命令或连接探测端点的运行结果。源码搜索确认当前本仓有 DB 新增、未注册数据库查询、服务器注册连接测试、表/视图注册命令；没有数据库批量注册、编辑/删除 helper 或已有数据库行连接测试 view。

最小后续实施组应沿数据库主列表完整动作闭环组织：在正式 DataSet 身份与服务器显式选择成立后，完成批量注册 command submit 与真实多项回执；补同一 DB view 的编辑、删除、取消/未知提交状态和主键核验；再补现有 DB 行连接测试 DataView 输入和回执。每项分别做实服验收，尤其确认 `dbOperateData` built-in 的成功/部分失败形状、`_base_dbInfo` update/delete 的实际回执及删除约束、`/Db/testConnection` 对 `dbName` 的实际消费；这些均不可由本地 Java、参考 JSDoc、Generic DataSet tests 或现有服务器注册的实服验收替代。
