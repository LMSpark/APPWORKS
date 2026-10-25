# B2 关系编辑：下一写者窄实施合同

## 源码事实

- 有效 RED3（`b2-relation-red3.exit=1`）的三项失败均在真实 `TableAndViewPage`、fixture DataSet 与查询后的弹窗上：表单未绑定原 DataView、编辑 `rlname` 没进入原 overlay、打开时没读取既有 overlay。修正过的夹具为同目标关系 RL3；RED1 的异目标夹具错误不作为证据。
- 当前唯一业务记录是 `Base_TblRln@forTable`（`lowcode-database-table-view.ts` 创建 `forTable` 命名视图，`table-and-view-page.vue` 的 `relationKey` 用完整场景键）。字段模型身份是 `Base_TblRln`，不得把操作身份/角色名另造为字段或视图。
- 当前编辑 owner `database-catalog-relation-form-ops.ts` 把八个旧版关系值复制到 `DatabaseCatalogRelationFormDraft`，新增先 `addRow` 再复制、编辑从 `rows` 而非 `getEditingRow` 初始化、保存时整组 `editRowById` 回写。Dialog (`table-relation-dialog.vue`) 以原生 select/input/checkbox 编辑草稿；page 又从 `_Base_TblList@default.rows` 映射 `peerTableOptions`。这些正是要移除的平行状态与手工选项数组。
- 目录表 DataView `default` 是分页视图（`pageSize:20`, `allPages:false`），且随当前数据库级联查询。现 options 只从已加载 `rows` 生成、限定同 db 并排除当前表，故它表示当前页已加载候选，不是跨页/全库表目录。标准 FieldSelect（实际路径 `packages/spark-component/src/components/fields/data-components/choice/FieldSelect/FieldSelect.vue`）支持字段绑定及 `optionDataViewKey`，无匹配选项时显示原值；`useFieldOptions.ts` 从指定 DataView.rows 导出候选，不需要 options 数组。
- 正式关系模型本轮真实编辑字段为九项 `pkdbid/pktbid/pktable/fkdbid/fktbid/fktable/rlname/RelshipExp/IsCascadeDeletion`；`rowid` 是主键。`rlname` 是关系名称（varchar），`RelshipExp` 是完整结构表达式（json）；表达式摘要不得反写为名称。`currentRole` 只是“当前选中的表是主端还是从端”的 UI/领域操作身份，不是数据库列。
- 本仓 `DataView.createEditingCheckpoint(id, fields)` 明确只捕获真实非主键字段；取消 `restore()` 恢复这次交互字段并保留其他编辑覆盖，确认成功 `release()`；在查询身份、行身份/内容或提交状态变化时恢复会拒绝。它也支持稳定的 staged 新增行。新行整体取消仍应 `discardPendingChanges([rowid])`，不能只 restore 后留下空 pending-create。
- 现 `databaseCatalogRelationSaveDraft` 已沿 `DataSet.saveChanges({views:[{tableName,viewId,ids:[rowid]}]})` 精确提交单行；不能改为页面 HTTP/全量 save。`DataView.saveChanges(ids)` 对 query owner 做 capture 和回执接纳；unknown 会置 `hasUnconfirmedSave`，后续保存只核验原 capture。identity/owner 改变会拒绝接纳旧结果。当前 page 的 `act` 仅核 DataSet/db view/actionGeneration；关系操作必须额外绑定打开时的关系 DataView 与选中 table/db 身份，不能在异步结束时拿新的 `selectedTableContext` 拼 refresh 目标。
- 原参考 `use-table-design-dialog.ts` 支持角色切换：将当前表身份移动到新角色端，保留原另一端（若它不是当前表），否则清空对端；切换端点时应清旧结构表达式 `RelshipExp`，关系名称 `rlname` 独立保留。它在新增、编辑均可切换；当前本仓 dialog 编辑时禁用角色。原逻辑的关系端语义是 pk 主端、fk 从端，不是把主从物理含义翻转或把当前表写错端。

## 决策建议（最窄可实施合同）

1. `table-relation-dialog.vue` 改成标准 `RendererForm`，完整 `dataViewKey=Base_TblRln@forTable`（含真实场景 ID），九个真实字段子组件直接绑定该关系 DataView；`rlname` 是独立关系名称字段；`RelshipExp` 用标准 `RendererFilterExpression` 绑定同一关系 DataView 的原字段；页面不再存 relationDraft/整行值。查看/设置值都以 `getEditingRow(rowid)` / DataView editing overlay 为准。角色选择保留为纯 UI 状态，事件调用窄领域操作立即写端点字段，不把 currentRole 伪装成列。
2. 关系新增只通过 `relationView.addRow(data)`（确认该正式 DataView 的 `commitMode` 已是 `staged`） 创建一行，再以返回稳定 rowid 开弹窗；新增角色默认为 child（现 toolbar `beginRelationCreate('child')`），之后可切换。切角色一次更新六个端点身份字段：当前所选物理表及 dbid/name 移至新角色一端；原相反端身份仅在非当前表时保留，否则清空；清空 `RelshipExp` 以移除针对旧端点的条件树，同时保留 `rlname`。PK/FK 名称和 ID 同步，不仅改当前Role标签。编辑初始 role 必须由捕获的当前 tableId 与目标 `getEditingRow` 的 pktbid/fktbid 一致推导；不相交时拒绝打开，不能沿旧 helper 的默认 child 掩盖错误。编辑模式允许角色切换，以保持参考业务已有行为。
3. 对端 FieldSelect 的 `dataViewKey/field` 指向关系 DataView 的相应端 ID (`fktbid` 或 `pktbid`)，选项从正式目录 DataView 读取，使用完整 `optionDataViewKey` 与 DataView 的 label/value field 配置；不得再传映射出来的 options 数组、不得造 `peerId` 草稿。当前选项源有分页，不能声称全库可选。为保留既有“同 db 且排除当前表”语义，若直接绑定 `default` 无法表达排除目标，则在 `_Base_TblList` DataTable 下增加语义明确的正式命名视图（例如 `relationPeers`），同一数据模型/查询 owner，按当前数据库及排除当前 tableId 查询；FieldSelect 只绑定该命名 DataView。它仍是有正式身份的分页 DataView，不是额外模型或页面候选数组；只按当前页范围展示，明确提供已有分页导航后才承诺更多候选。不得悄悄对默认列表改 filter 或全量抓取。
4. 每次打开以目标 rowid 建 `createEditingCheckpoint(rowid, [上述九个可编辑字段])`。编辑取消调用 `restore` 后关闭；非未知且新行取消按 rowid `discardPendingChanges` 并关闭。保存只提交目标 id；只有成功回执且目标/查询身份仍相同才 `release()` checkpoint、关闭并刷新捕获的原 tableId。普通拒绝保留 overlay 和弹窗内容供修改重试；`hasUnconfirmedSave` 时锁定继续编辑/取消/重复提交或目标切换，沿原 DataView 捕获核验，不另发 POST。不要把未知当成功，也不要依不确定回执丢 capture。
5. 记录打开时 `DataSet` 实例、relation DataView、queryContext/查询身份、当前 databaseId/tableId；保存、取消/restore、刷新前校验仍为该身份。目标表/数据库被切换或 DataView 正在 Loading 时阻止切换或拒绝旧 dialog 动作；迟到的查询/保存回执不得写入新目标。checkpoint 的 stale 拒绝是最后保护，不是允许 dialog 先绑定新 target 再调用 restore。

## 必要用例 / 真实缺口

- 页面行为：标准 RendererForm 与字段子组件落在原关系 DataView；peer FieldSelect 指向 `_Base_TblList` 正式命名 view、读取它的 rows 且没有页面 options 数组；可证明选项只覆盖已加载页，同 db、排除当前表。若新增 `relationPeers`，测其过滤上下文/分页身份，不测手写 adapter。
- 角色：新增和既有关系从 master↔child 两向切换；当前表身份在 pk/fk 间移动，另一端保留，缺失/相同对端清空，databaseId/name 一致，清除 `RelshipExp` 但保留 `rlname`；编辑打开时目标行必须包含当前 tableId。
- 回滚/状态：打开编辑前同一行已有 overlay；本弹窗改字段后取消只还原这九字段进入前值，同时保留其他行和范围外编辑。新增取消仅丢本 pending row，别的行仍在。role change、级联与表达式均验证走同 overlay。
- 提交：用真实 DataSet query owner 检查一次仅目标 rowid 被派发；服务拒绝时弹窗与 overlay 保留；unknown 后 `hasUnconfirmedSave` 保持、确认按钮不可重发、同 capture核验后才解除；不补测跨源事务。
- 身份：在 dialog 开启/保存进行中改变表、数据库、DataSet/queryContext或触发查询 Loading；旧回执不关闭/刷新新目标，stale checkpoint 不恢复到新上下文，用户关闭保护不丢 pending/unknown。
- 已知缺口：当前 FieldSelect 的直接选项 DataView接口读取其当前已加载 rows；它没有自动加载/遍历全库的能力。若业务要求跨分页搜索或全库候选，必须另有正式 DataView 分页/搜索交互，不可借 options 数组或 `allPages=true` 猜补。本轮RED3未测试真实权限响应或线上写回，不能以本地页面测试宣称服务端权限/后端成功。


## 字段语义与表达式编辑补充合同

- `rlname` 是表关系名；`RelshipExp` 是 `json` 结构表达式，两者独立。旧 SQL 样式字符串即使看起来像条件，也不能通过 `rlname` 保存后当作表达式成功。切换主从角色或任一端点时仅清除旧 `RelshipExp`，保留 `rlname`；名称是否必填按正式字段约束判断。
- 表单将 `RelshipExp` 绑定到原 `Base_TblRln@forTable` DataView 的标准 `RendererFilterExpression`。其 `columns` 与 `functionContext.relatedFields` 从当前关系行的物理端点身份 `pktbid/fktbid`（须能在 `_Base_TblList.rowid` 找到）及按该物理 `tblid` 按需查询同空间 `Base_TblField` 构建；不以正式模型目录字段定义代替物理字段目录，也不缓存/复制业务行或手工 options。`cond.Field` 使用实际子表名.字段名，`GetTableField.Field` 使用实际主表名.字段名；例如 `<fktable>.<childField>` 与 `<pktable>.<parentField>`，不用 `master.*` / `child.*` 伪限定或本地 DataTable 键。
- `RendererFilterExpression` 的 `format='tree'` 表示原生 `DataViewFilterTree`，不能据此认定它可直读任意服务端 `{Type, Filters}` JSON；`format='spark-json'` 当前只接受 JSON 字符串。虽物理列类型为 json，SPARK DataView 的实际值可能是对象、字符串或 null；实现前必须按正式关系行查询核载荷形态。若服务实际返回 object，则记录为标准组件格式承接缺口；页面不得转换成第二份草稿/保存副本。不得因空列表或 null 推断格式，不新增未经验证的通用格式。
- 表达式完整树验证、端点字段身份核验、查询失败/迟到隔离与 unknown 提交处理仍留在原 DataView / owner 链。checkpoint 覆盖九个真实字段；只提交目标关系 rowid；不把表达式编辑变成第二草稿/保存通道。

## 已建立模型与输出回读

- 正式模型 `D2B9B94A1641BB87E6D3D9251A14D70D` 对应目标空间中的 `Base_TblRln`，共 25 个来源字段；创建与回读证据见 `b2-relation-model-created.json`。
- 后续由原 `Base_DataModel_Field` DataView 保存 11 个 `IsOutput` 字段，正式回读确认总计 13 项输出（默认 `rowid`、`lingma_sys_ent` 加 11 项新增输出），`RelshipExp` 已输出；证据见 `b2-relation-output-saved.json`。
- 这些证据确认模型定义与输出元数据，不证明现有业务关系行的 `RelshipExp` 运行载荷形态或端点字段值；后续只读核验必须使用正式 SPARK data DataView 查询。

## 正式运行载荷形态只读核验

- 经 `lowcodeApi.dataSpace.design.readModel` 回读确认模型 ID `D2B9B94A1641BB87E6D3D9251A14D70D`、业务主键 `rowid`、13 项输出（含 `RelshipExp`）。随后只用 SPARK Data API 对 `Base_TblRln` 查询 `RelshipExp is-not-null AND is-not-empty`，第一页 20 行；服务报告 Count=49、返回20，没有全量抓取，也没有写请求。
- 20/20 行的 `RelshipExp` 运行值均为 JSON 字符串，解析后顶层只有 `Type/Filters`；首屏样本结构路径为 `$` → `Filters[0]` → `ValueFun`，字段引用位于 `Filters[0].Field` 与 `Filters[0].ValueFun.Field`，两者运行类型均为 string。报告保留字段名/结构路径，不保留实际表达式值或完整记录。
- 该回读证明当前首屏非空载荷是字符串化服务表达式，可供 `spark-json` 做后续候选接线核验；它不证明组件能够读回编辑、写回同一服务格式或服务接受编辑结果。仍须以绑定原 DataView 的标准组件行为覆盖一次读取/编辑/取消和提交回执；若组件无法保真承接，应作为标准组件格式缺口处理，不在页面复制转换。
- 原始去敏结果：`b2-relation-runtime-expression-read.json`；只读脚本：`b2-relation-runtime-expression-probe.mjs`。探针通过正式鉴权及请求范围，仅放行登录、应用目录/导航读取、正式模型 readModel 所需元数据读取、目标 DataView GET；仅页面大小20且明确不全页，DataSet/DataView 保存 owner 已设为拒绝。
