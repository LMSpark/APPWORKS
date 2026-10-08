# D1c：目录写操作可行性研读

> 只读研读；没有修改生产代码、测试或配置，也没有运行测试、构建、浏览器或后端探测。固定参考只取自 `E:/r/sparkproject` Git 对象 `842dec4f11b333df904b9a4e26b6566b0802bab8`，未读参考工作树。

## 结论

统一 `lowcodeApi.dataSpace.runtime.save` 已能承接 `Base_DataSet` 的 create/update/delete；它强制调用方交付当前 runtime owner 登记的原查询 `context`，并返回逐目标回执及 successor context。目录 owner 目前只投影行值，没有保存原 context，故当前目录没有可安全写回的调用链；最小缺口在现有目录 owner：它须私有持有当前目录查询的原 context（不可经 UI 返回），只从 UI 接收主键和明确可编辑值，并以原查询权限/context构造保存。写权限消费仍需 owner 显式执行，因为 `runtime.save` 本身不调用 `addActionState`、`fieldAccess` 或 `deleteActionState`。

建议下一轮仅做 **create + fresh readback**，限现有三文件：

1. `src/lowcode/data-space/lowcode-data-space-catalog.ts`：目录查询结果内私有持有 context，并以 owner generation/lease 把已发布投影与唯一原 context 绑定；添加单条新增动作，验证当前 scope、generation/lease、当前应用选项、原 context `addActionState()`，用 `context.prepareNewRow` 创建正式主键后调用 runtime.save，并按该主键执行 fresh query 回读、核对提交字段。
2. `src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue`：在当前页面增加最小新增表单/提交状态，将 `sysid` 选项限制为同场景 `applications()` 返回值；提交完成前后使用现有 page revision / owner / scenario 发布闸门。`X-AppId` 是执行请求 scope，不能代替记录所属 `sysid`。
3. `tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts`：补充 owner/runtime 命令、保存成功后真实主键 fresh readback、写权限/失效边界。底层 save/权限行为已有 `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.test.ts` 与 `runtime/tests/data-space-permission-parity.test.ts` 覆盖，无需修改共享 API 包。

若 D1b 对这三个文件的后续改动改变了当前基线，实施前应重新读取并把该切片方案与当前代码对齐；本报告描述本轮读到的状态。

## 参考 CRUD 的实际语义

固定参考 `list.ts` 中 `DataSetCreatePayload` 是 `applicationId, Name, Type: 'datasource', description?`，create 写 `rowid: createSparkGuid()`、`sysid: applicationId`、`Name`、固定 `Type`，且 `description: payload.description || ''`（参考 `list.ts:50-55,210-221`）。update payload 是 `rowid, Name, description?`，只写这三种字段；description 为 `undefined` 时省略该字段，空字符串则实际写空（`list.ts:57-62,223-232`）。delete 只按 rowid 提交（`list.ts:234-239`）。旧页面新增应用必须从 `appRecords` 选择、编辑时应用选择禁用；只读/不可编辑字段按 `useSparkResourceAuth` 和 `createDialogFieldEditable` 控制。删除先 `runConfirmedAction` 显示“确认删除…”，成功后刷新列表；保存成功后关闭对话框并 `fetchData`，它只是 UI 查询刷新，不校验目标行和字段的精确回读（参考 `data-set-list-page.vue:88-115,279-327,430-475,565-607`）。

现 AppWorks 当前目录 owner 在 `lowcode-data-space-catalog.ts:4-9,34-48,52-83` 只投影 `rowid/Name/Type/description/sysid/createuser/createtime` 为字符串；`projectRows` 对 read masked 输出 `••••`、invisible 输出空字符串。现页面 `DataSpaceCatalogPage.vue:117-127,163-188` 用场景与请求 revision 限制异步结果，但尚无 CRUD 控件/保存链路；D1b 当前已增加独立 `sysid` 筛选及同场景应用选项加载（`:13-20,87-103,140-188`）。

原参考使用了独立的旧 API 与 `createSparkGuid`，不能搬用作新的主键合同。当前 `DataSpaceQueryContext.prepareNewRow` 在正式 key field 为空时用 `crypto.getRandomValues` 生成该模型主键，剥掉 `_pk` 和客户端伪造的 `lingma_sys_key/lingma_sys_params`（`data-space-query-context.ts:121-135`）。目录查询快照已由现场证据确认 `Base_DataSet` 正式模型 primary key 是 `rowid`；因此新增传入无 rowid 的业务字段给该方法即可产生真实 rowid，无须手造业务 ID。新增 `sysid` 必须是此蓝图场景 `Base_AppSystemList` 查询产生的应用业务 ID；当前执行应用 `X-AppId` 是另一身份通道，不能拿来代替。只读证据记录本场景应用列表当前只有 1 个选项，不代表平台全局只有一个应用。

## 当前 save / context 合同

最小单目标调用形状（类型由现有 `save` 参数推导，不需新增/导出 API）：

```ts
const identity = { scenarioId, metaName: 'Base_DataSet' }
const [receipt] = await lowcodeApi.dataSpace.runtime.save({ changes: [{
  identity,
  context, // 必须是这次 runtime.query 返回的原对象
  changes: { added: [context.prepareNewRow({ sysid, Name, Type: 'datasource', description: '' })] },
}] })
```

编辑相应为 `changes: { changed: [{ rowid, Name, description }] }`；delete 为 `changes: { deleted: [{ rowid }] }`。运行时 API 的 command 定义为 `changes[]` 每项含 `identity/context/changes`（`data-space-request.ts:26-37`），runtime.save 首先验证 context 在本 runtime WeakMap 中归属同请求 scope 和同 identity；成功后注销旧 context，登记 `receipt.context` successor（`data-space-runtime-api.ts:115-155`）。request 先用原上下文准备 change、封入该原行/新增行凭据，调用 `/api/DataOperation/BatchTableOperateRequestByCRUD`，解析真实动作回执并由 context 校验（`data-space-request.ts:107-160`）。返回数组每项含 `metaName/added/changed/deleted/context/changedFields`。成功后旧 context 不可再作为下一次保存基线；失败不等于已确认保存。真正读回仍应新发 `runtime.query(identity, { filter: DataViewFilter.condition({field:'rowid',operator:'eq',value:rowid}), fields: catalogFields })`，核对唯一 rowid 及业务字段；保存 receipt 只能证明回执行，不是该目录新 query。

注意 API 分层：`DataSpaceQueryContext.prepareSaveChanges` 以原查询基线计算字段差异，变更/删除须恰好找到唯一原行；隐藏凭据不由消费者拼造（`query-context.ts:178-208,326-354`）。但它不会替调用方检查 UI 字段授权。已有真实写调用 `LowcodeProjectBlueprintApi.updateNodeFields` 逐字段检查 `context.fieldAccess(...).write === 'allowed'`，再用同一原 context `runtime.save` 并 fresh-readback 校验（`project-blueprint-api.ts:96-126`）；create/delete 同样先查 `context.allowAdd`/`createChildActionState` 或 `deleteActionState`，再保存并回读/确认消失（`:144-170`）。这是直接可参照的消费者实现，不是共享 API 自动行为。

## 原 context、权限与失效边界

- 目录 owner 应在每次目录 query **开始**时同步递增私有 generation 并清空可写基线；query 完成时仅当 generation 未变且 scope 仍当前，才安装该次原 `DataSpaceQueryContext`。否则旧 A 慢于新 B 时，A 不能覆盖 B 已显示列表的写基线。查询结果带无权限含义的 generation/lease，页面仅在 `canPublish(revision, scenario, owner)` 成功后保存该 lease；每个写方法必须接收并核对该 lease 等于 owner 当前已安装 generation。页面发起新 query、切场景、owner 替换/卸载时清掉已发布 lease/撤销 owner 可写基线。这样写操作使用的原 context 与用户当前看见的列表是同一 query，而不是仅仅“owner 最近一次完成的 query”。应用选项 query 是另一个 metaName，不应递增/覆盖目录 generation。不可把 context、原行、系统凭据或未投影数据塞进 DTO/Vue 行/表单/Pinia。行操作只收 lease、rowid 和表单明确值；update 由 context 原始基线得差异，绝不把 projection、整行原值或 `••••`/空掩码合并回传。
- owner 必须同时校验自身 token/scope（当前 `#scopeToken`）及本页当前 owner/scenario/request revision；页面现有 revision 只保护结果发布，不自动保护写操作。新 query 开始、route/scenario 变化、owner 替换、卸载、异步确认返回后若 revision 已变，都不得写/发布。保存成功后旧 context 已被 runtime 注销；下一次编辑必须使用 fresh query context，不复用旧 context 或 receipt context 作为目录当前权限事实。
- 主键缺失、非 string/空、`context.rowKey(row) !== row.rowid`、重复 rowid：目录当前已经 fail-fast（`lowcode-data-space-catalog.ts:34-39`）；写入口仍要确认 rowid 在当前 owner 最近一次查询结果中恰好一行。无行基线时禁止 edit/delete。runtime owner 的 `SPARK_SAVE_CONTEXT_OWNER`、context `assertIdentity` / scope stale 是第二层 fail-closed。
- 新增按钮必须要求 `context.addActionState() === 'enabled'`；现快照实测 allowAdd=true，但这只是 admin 只读证据，不能将其当写已授权证明。Add 无 row key，`fieldAccess(undefined, field)`按 API 实际合同返回 denied；不能假装能按“新增行权限”逐字段 gate。只能提交明确的最小新增字段，且后端必须通过真实保存授权；任何真实写回前仍需可逆、显式标记的测试资源。
- edit action 检查 `editActionState(rowid) === 'enabled'`；并对每个实际提交字段要求该行 `fieldAccess(rowid, field).write === 'allowed'`。因为 h/m 与 E 写集合独立，`write=allowed` 可同时对应 `read=invisible/masked`；若UI要显示/编辑该值，还须要求 `read === 'visible'`，否则禁止把 UI 的掩码/空占位当真实值提交。readonly/未列入 E 视为不可写；缺失 row 权限由 API 的显式 `missingAuthPolicy` 决定，缺省策略当前为 `allow`，因此页面不能自行假设缺权限默认拒绝或默认具备业务授权。
- delete action 检查 `deleteActionState(rowid) === 'enabled'`，并必须有明确确认；删除后 fresh query 确认目标不存在。旧 context 原权限凭据仅由 save owner 从它自己保存的原查询基线封装，消费者不传令牌。后端仍是最终授权裁决，UI/action-state 检查不可替代它。

## 最小闭环的辨别力验证建议

以 create + fresh readback 为唯一首片，不同时上 edit/delete。当前同场景应用列表只读结果与目录 allowAdd、primary key/access 的管理员现场记录位于 `notes/evidence/sparkproject-appworks-integration/d1a/lookup-feasibility.json`、`c2-review/d1-live-query.json`；它们仅证明可读合同，不证明 restricted user 或 CRUD 成功。

- **RED**：catalog owner 不保留 context/直接投影后无可提交基线；新增候选未经过 `prepareNewRow` 时没有正式 rowid；`addActionState` disabled/hidden、scope token 变更、owner generation/lease 不匹配，页面/场景/请求 revision 失效、应用 `sysid` 不在同场景应用选项时，断言不调用 runtime.save。
- **GREEN**：仅用显式标记测试名称与当前场景真实应用 `sysid`；断言 save 接到同 identity、同 owner 原 context、由 `prepareNewRow` 生成 rowid 的一个 added row，业务提交只有 sysid/Name/Type/description；随后精确按该 rowid fresh query，唯一读回且字段一致才报告成功。保存 receipt 若缺行/rowid/字段不匹配，或读回失败/权限与 scope 失效，都不得显示成功，也不得自动重试未知提交。
- **边界**：不改动/删除任何已有真实记录。仅使用当前读证据不能保证新增测试行能安全清理；正式写回前，主控需安排可逆的专用测试 resource/授权与显式清理窗口（例如同场景可确认可删除的 test row 资源及 owner），或记录真实外部阻塞。当前 field access admin evidence 是全可写，不覆盖受限身份；不要通过改共享 API、授予权限或换 scenario 绕过。

后续 edit-only 切片再验证：原行 Name/description 各自 write allowed；read masked/invisible 时不由 UI 回填隐藏值；description 空值按产品选定语义显式表示（旧 UI 对原 null/undefined 保留 omit、原非空清空则提交 `''`）；更新后用 fresh context 读回。Delete 应单独切片与审批明确的测试行，不应混入此次 create 闭环。

