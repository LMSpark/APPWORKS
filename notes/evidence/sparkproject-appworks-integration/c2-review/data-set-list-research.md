# D1 正式数据空间目录：只读接线研究

状态：研究结论（非实现声明）

## 结论

D1 当前不能签署为已实现。锁定参考 `E:/r/sparkproject` Git 对象 `842dec4f11b333df904b9a4e26b6566b0802bab8` 有完整目录 UI/owner；当前 AppWorks 树没有对应的 DataSet 列表页或 `AppWorksDataSpaceCatalog` owner，`config/navigation/vue-pages.json` 也没有正式路径 `/features/data-platform/data-set-management/ui/data-set-list-page` 的 Vue 映射。主计划记录的“浏览器入口映射错误”与源码相符。

当前 API 有通用、受 scope/query-context 约束的列表读写能力，可作为 D1 候选底座；它尚未被一个当前 D1 UI/owner 接线，也没有经此路径进行真实后端 D1 CRUD 与回读。最低风险路线是新增应用层目录 owner 复用 `lowcodeApi.dataSpace.runtime.query/save`，不是复制参考 host 或直接拼 HTTP。能否对 `Base_DataSet` 执行 CRUD，必须以当前正式 scenario、请求 scope、原查询上下文的授权能力及测试资源上的保存回执和回读确认；API 泛型存在不等于目标模型/用户当前有权写。

brief 指定的 `service-correspondence.json` 当前未找到；实际存在 `service-routes.json`，它不替代源码/API 核实。`reference-inventory.json` 用于定位，以下结论以固定 Git 对象或当前源码为准。`knowledge/README.md` 已读；本次仅记一项性研究，不改知识库。

## 固定参考：真实 UI 操作与 owner

参考页面 `apps/appworks/src/ui/features/data-platform/data-set-management/ui/data-set-list-page.vue`；owner `apps/appworks/src/data/api/data-set/list.ts` 中 `AppWorksDataSpaceCatalog`。页面用 `useSparkDeliveredPageContext().scenarioId` 作为目录模型查询身份，捕获 `getSparkVueApplicationRuntime().execution.capture()`；owner 的 `#run` 在每个请求前后检查执行域。不要把 `DATA_SPACE_DESIGN_FORM_KEY`、当前 query 的动态 `scenarioId` 或被选应用 ID 相互替代。

| 源 UI 操作 | 固定参考 owner/模型 | 当前可承接入口与缺口 |
| --- | --- | --- |
| 搜索、筛选、分页 | `catalog.query({pageNo,pageSize,name,sysid})`；模型 `Base_DataSet`；名称 contains，rowid 精确匹配，sysid 精确应用过滤，按 `createtime desc` 分页；返回原 queryContext | `lowcodeApi.dataSpace.runtime.query({scenarioId,metaName:'Base_DataSet'}, {filter,sort,page})`；能承接服务端筛选/排序/分页并返回 `DataSpaceQueryContext`，但没有目录专用 owner/UI。分页结果必须有后端总数；缺失会显式失败，不能用当前页行数冒充总数。 |
| 创建者显示、应用选择 | `#hydrateCreateUserNames` 查询 `Base_UserInfo`（ROWID→UserName）；`applications()` 查询 `Base_AppSystemList`（rowid、AppDesc/AppName 等） | runtime 通用 query 可在同一已选应用请求 scope 与有效 scenario 下按正式 model Name 查询；当前没有 D1 映射/组合逻辑。应用 selector 只能呈现后端允许的应用范围，`sysid` 条件或 UI 选项本身不是跨应用授权。 |
| 新建 | `create` 向 `Base_DataSet` 写 rowid（GUID）、sysid、Name、Type=`datasource`、description；form 要求正式 applicationId | `DataSpaceRuntimeApi.save` 是现有写入口，但必须从当前 owner 的 `Base_DataSet` 查询拿到当前 `DataSpaceQueryContext`，检查 add 权限和真实主键，再带原上下文提交。尚未证明目标 scenario 返回可新增权限/rowid 主键或服务端接受该动作。 |
| 编辑 | `update` 以 `rowid` 更新 Name/description；编辑时 applicationId 锁定；按 `canEditRow/canEditField` 禁用无权操作 | 同一 runtime query context 有 `editActionState(rowKey)` 与 `fieldAccess(rowKey,field)`；`save` 只接受该 runtime owner 原查询上下文。限定字段、rowid、sysid 不可由 UI 伪造；需确认后端授权和实际回执。 |
| 删除 | `runConfirmedAction` 二次确认后以唯一 rowid 删除；删除当前页最后一行时退一页，再重新查询 | 同一 runtime context 有 `deleteActionState`；`save` 接受原行 deleted change 并检查上下文/回执行。执行后必须按 rowid 再读确认不存在；仅收到响应或显示成功消息不算闭环。 |
| 打开设计 | `handleDesign(row)` 以 rowid 打开 DataSetDesign；本属 D2 | 当前 `lowcodeApi.dataSpace.design.read({dataSpaceId,catalogFormKeys})` 可按 rowid 读设计快照；D1 UI 到实际 D2 编辑器的入口/保存闭环未确认，本研究不把“能读快照”称为设计已接通。 |
| 复制 API | `AppWorksDataSpaceDesign.readApiInfo()`，使用固定设计场景 `8D1AB14DD8277F3E7017CD38F77B09FD` | 当前 D1 UI/API 信息复制入口未接通。不要借目录查询 scene 替代固定 design formKey，也不在 D1 列表闭环内开发 D2 文本生成。 |
| 查询绑定 | `handleQueryBinding` 使用 Blueprint scene `7AB874097A1E8711A42FD845939A6E05`，按 `Base_NavigationInfo.conid=dataSpaceId` 找节点，再向上读父项形成路径；该按钮是查询绑定，不是编辑授权 | 当前 `lowcodeApi.blueprint.readRecords(projectId)` 可读当前项目蓝图；`LowcodeProjectBlueprintApi` 没有参考的 `readDataSpaceBindings` 等价专用方法。是否可由 `dataSpace.scenarioId/conid` 投影可靠构造绑定路径需要单独核对；本研究不增加新 API 或假称已接通。 |
| 授权 | 列表页没有“授权”按钮；有“查询绑定”。独立 DataSet Auth 页面在参考 UI 另一路径 | 当前 `lowcodeApi.permission.runtime.read(formKey)` 读取功能标签/allowAdd；`permission.design.read(formKey)` 读取标签、数据对象策略和授权快照，`prepareMutation()` 只产生准备命令不执行写入。D3 不等于 D1 行级操作授权，也不属于本次目录闭环。 |

参考页 application binding 由 `useApplicationScopeBinding()` 决定：有唯一 host boundAppId 时隐藏应用选择、搜索和创建都锁定该应用；无该绑定时显示应用筛选/选择，新建必须明确选应用。这个 UX 必须保留其“应用归属”语义，但不能把它当权限执行。页面对列表、提交、binding 分别用 revision 与 `isPageCurrent` 丢弃旧结果；切应用会清空旧行/queryContext/dialog 并使待处理请求失效。当前 D1 重建应复用本仓请求 scope/代次语义，不允许旧应用的迟到响应覆盖新列表。

## 当前真实 API 合同

- `packages/spark-lowcode-api/src/lowcode-api.ts` 组合 `dataSpace.design` 与 `dataSpace.runtime`。`readRequestScope()` 要求有效登录 session、租户和明确选中应用；输出 tenant headers、`X-AppId` 及含 session/application revision 的 token。无选中应用时会抛 `SPARK_EXECUTION_SCOPE_REQUIRED`，不能通过空查询返回“空目录”。请求身份由此 scope 注入；列表 query 的 `sysid` 过滤不可绕过它。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/data-space-runtime-api.ts`：`query(identity,options)` 的身份是 `{scenarioId,metaName}`，结果是 `DataSpaceQueryContext`（rows/total/allowAdd 与行/字段动作状态）；上下文和查询权限基线由 runtime 私有持有。`DataSpaceRuntimeApi.save({changes})` 校验上下文属于同一 owner/scope，再由 `DataSpaceRequest` 保存和确认动作回执；旧 context 不能重复充当成功保存后的新基线。
- `packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-request.ts`：读请求 `POST /api/DataOperation/GetData`，写请求 `POST /api/DataOperation/BatchTableOperateRequestByCRUD`；请求带 tenant/app scope header 和 `x-FormKey: scenarioId`。写操作核对非空真实动作、模型/场景同批约束及实际 receipt；失败不自动重试。目标 D1 数据必须以有效原查询上下文送进 `dataSpace.runtime.save`，不直接复刻旧 `api.create/update/remove` HTTP 行为。
- `packages/spark-lowcode-api/src/platform/data-space/design/data-space-design-api.ts`：`read(input)` 是以 dataSpaceId 读 `Base_DataSet/Base_DataModel/Base_DataModel_Field/Base_DataModel_Relation` 的设计快照；固定 design FormKey 是 `DATA_SPACE_DESIGN_FORM_KEY`。`prepareMutation` 仅返回有 idempotencyKey、preimage、journal/readback/compensation 要求的设计变更命令，不执行写入。它不是 D1 catalog list/CRUD API。
- `src/lowcode/data-space/lowcode-data-space-runtime.ts` 的 `loadScenarioDataSet` 校验 view config 的 scenarioId，一并读取正式 model/relations，再装配 `DataSet`；不存在文件或绑定缺失会显式失败。它是运行场景装配，不是建空 DataSet 或 D1 列表兜底。
- `packages/spark-lowcode-api/src/platform/permission/runtime/permission-runtime-api.ts` 通过 `/api/Function/GetFormUserFunction` 读取功能权限；`permission.design` 是设计态读/prepare。当前 D1 UI 应优先消费 `Base_DataSet` 查询 context 的真实 allowAdd、行/字段权限，不可把 feature grant、按钮隐藏或 reference `useSparkResourceAuth` 直接移植为服务端授权结论。

参考记录模型：`DataSetRecord` 字段含 `rowid`、`Name`、`Type`、`description`、`createuser/createUserId`、`createtime`、`sysid`；`rowid` 是表行身份，`sysid` 是应用归属。应用 options 的 `rowid` 才是 applicationId。不要以 Name、场景 ID、模型 Name 或动态查询参数代替 rowid/sysid。

## 最小可打开列表闭环（不等于 D1 完成）

1. 新增宿主页候选 `src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue`，用正式路径 `/features/data-platform/data-set-management/ui/data-set-list-page` 接入当前身份 host，并在 `config/navigation/vue-pages.json` 注册实际 source/scope（禁止只加菜单路径却没有 componentMap 映射）。必要的应用层目录 owner 建议单独放 `src/lowcode/data-space/lowcode-data-space-catalog.ts`，只编排 `lowcodeApi.dataSpace.runtime`；不新增 package HTTP 路由、不重复实现保存协议。
2. owner 只实现经正式 scenario + 当前请求 scope 的 `Base_DataSet` 分页查询；服务端查询保留 Name/rowid、sysid 条件和 createtime 降序，消费 `DataSpaceQueryContext.rows/total` 与权限状态。只在后端实际提供允许范围时显示应用 options/全应用搜索；缺 scenario、未选应用、缺总数或 query 失败呈明确配置/错误态，不映射成空列表。用 C1/C2 允许的实际授权身份验证无数据与无权限状态。
3. 搜索/分页/返回列表稳定，打开有效 rowid 的下一步 D2 页面（若该页面/绑定仍未接好则明确显示不可用）；未实现的新增、编辑、删除、复制 API、查询绑定/授权入口显式禁用或标记待接，不做 no-op、不弹成功、不造空场景/DataSet。至少完成 route 实际映射、server paging/search、切应用迟到 query 不污染当前视图的读用闭环，报告中只称“列表可打开/可读”。

## 后续 CRUD 闭环前置

- 在当前授权 scenario 与所选应用 scope 下，读回 `Base_DataSet` model contract、唯一 `rowid` primaryKey、后端 queryContext `allowAdd` 和 row/field access；任何一项缺失，停止写入并显式报缺配置/权限，不从 `_pk` 或样本推测主键。
- 新建沿用参考字段语义：必须有确定 `sysid`、Name、`Type=datasource`、description；只有当前 model key/context 允许时才用 `prepareNewRow`/明确唯一键。编辑只提交被授权且实际变化字段，`sysid` 不在编辑 payload；删除使用原始 queryContext 的唯一 `rowid` 并先确认。
- `save` 成功后用新查询/按 rowid 再读；创建/更新逐字段比较 `sysid/Name/Type/description` 与预期，删除确认该 rowid 不存在并校验总数/页回退。回读失败表述为“请求已提交但未确认”，不得自动重试。创建人名称可由 `Base_UserInfo` 同 scope 查询作投影，不得覆盖原 createuser 身份字段。
- D1 当前按钮闭环不得声称 D2 设计保存或 D3 授权管理完成。D2 必须另验 data-space design snapshot/prepare 执行与回读，D3 必须验证权限 mutation 的真实执行和受限身份效果。

## 精确后续候选与研究边界

- 必需读闭环：新增 `src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue`、`src/lowcode/data-space/lowcode-data-space-catalog.ts`，修改 `config/navigation/vue-pages.json`；新增/补齐 `tests/runtime/auth-nav/data-space/lowcode-data-space-catalog.test.ts` 覆盖 query filter/sort/page、scope 无效/迟到结果、context permission 与错误可见。若当前系统 host 要求额外 Vue page registry loader，只按真实当前调用链纳入，不提前改 DynamicRouter。
- 完整 D1 CRUD 再在同一 owner/page 上逐个闭环 query-context permission、create/update/delete、receipt+readback；低层 `DataSpaceRuntimeApi` 现有模拟测试不是 D1 真实后端联调证据。应用 selector、创建人 hydration、API info、binding dialog 都按实际消费单独加入，不把 owner 过早变成通用 directory 框架。
- 固定参考只读取锁定 Git 对象，不读取参考工作树变化；本任务没有调用后端写接口、没有改源码/测试/配置、没有执行测试。本报告的结论是研究与派工依据；D1 列表、CRUD、保存重开仍未实现/未验收。
