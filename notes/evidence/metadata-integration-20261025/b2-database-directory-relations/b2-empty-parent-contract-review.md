# B2 空父级联合同复核

## 结论

发现一个真实、局部的查询生命周期缺口：目录页的数据库被预选时没有显式装载子目录；手动选择数据库后，页面又在尚未选择表/视图时刷新字段视图。空选择沿既有合同会成为 `IN []`，而不是“父未就绪”。Round2 的 `Base_TblField` 回执因此返回跨表结果（Count 23240，当前页 20）。修复应限于目录页的装配与父选择切换；不要改全局空数组级联语义。

## 源码与证据

- `src/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue:1104-1126` 按正式 `databaseId` 唯一命中后 `db.setSelectedRows(matches)`，再建立运行时；但在 `current.load()` 后没有调用 `refreshChildren()`。目录资源声明的级联均为 `autoLoad:false`，所以预选父行不会自动加载表/视图。
- 同文件 `:979-992` 的 `refreshChildren()` 显式刷新表和视图；`refreshFields()` 无父选择检查，直接刷新当前字段视图。`:995-1009` 的 `chooseDatabase()` 清空表/视图选择后调用两者，导致无表/视图仍发字段查询。
- `src/lowcode/resources/database/lowcode-database-table-view.ts:124-160` 的 `db→tables/views`、`table/view→fields` 绑定只有 `filterBindings`，且全部 `autoLoad:false`；没有空选择门控。
- `packages/spark-data/src/strategies/cascade/cascade-value-binding.ts:20-31` 在父视图 Loaded 时读取 DataMember.Value；未指定字段时实际读 `getSelectedValues()`。空选择是 `[]`。`packages/spark-data/src/dataset.ts:815-839` 将其解析成有效 `in []` 过滤。
- 这是有意支持的公共语义：`packages/spark-data/src/tests/cascade-event-filter.test.ts:42-50,85-101` 明确要求空选择产生 `IN []` 并可查询。不能把 `[]` 全局改成 null/未就绪，否则会破坏已有消费者。
- Round2 `node_modules/.cache/metadata-integration-20261025/b2-entry-spa-round2.json` 记载正式 A8 + 精确 `databaseId` 已命中并选中，初始无子查询；再次点选后表/视图查询正确按该 `dbid` 过滤，而字段查询的 `tblid IN []` 回执为 Count 23240 / 20 rows。问题不是导航身份或数据库过滤器。

## 最窄建议

1. 正式数据库目标唯一命中、DataView/宿主装配完成后，显式调用一次 `refreshChildren()`；保留 `autoLoad:false`，不要靠自动级联或重复点击触发首次查询。
2. `chooseDatabase()` 先对将被清空/替换的表、视图以及两个字段 DataView 调用公开 `assertResultReplacementAllowed()` 做完整预检；任一失败时不得先改选择或部分清空。通过后，用 `clearAll()` 清空表、视图、两个字段视图，再设置新数据库选择并刷新表/视图。删除“无表/视图仍 `refreshFields()`”这一步。
3. `refreshFields()` 仅由表/视图有效选择触发。切换对象类型或清除当前对象时，按同样的替换预检清理旧字段视图；没有父对象时不发字段请求。
4. 不增加页面缓存或第二份行状态。`DataView.clearAll()` (`packages/spark-data/src/data-view.ts:3212-3226`) 复用原替换守卫；`resetStateInternal()` (`:3230-3248`) 增加 `currentLoadRequestId` 并清空结果。旧请求迟到时 `loadFromServer()` (`:1839-1866`) 因 request id 已变而丢弃回执。未确认保存/脏编辑时 `assertResultReplacementAllowed()` (`:2130`附近) 拒绝替换，符合未知与编辑保护。
5. 不扩展 cascade schema 的 `when`：现有 `when` 只表达父字段与固定值相等（`packages/spark-data/src/types.ts:944-952`、`query-cascade-inputs.ts:18-22,64-70`），不表达“选择行数大于零”；目录页本身知道当前选中对象，守卫应放在这里。

## 必要失败用例

- 以正式 `databaseId` 直接打开，唯一数据库预选后自动且仅一次查询表和视图，两个请求均带精确 `dbid`；未选表/视图时不请求字段。
- 选择数据库但未选物理表/视图，不得发 `Base_TblField` 查询，也不得保留先前字段行；显式选择表后字段查询才带其正式主键。
- 已加载数据库 A 的表/字段后切换 B：先清空旧表、视图、两种字段结果，后续请求仅包含 B 的身份；不得先出现“B 选择 + A 字段”状态。
- A 的表或字段请求未返回时切换到 B，再让 A 回执最后到达；DataView 行、选择和页面展示不得回到 A，B 的结果仍有效。
- 字段 DataView 有普通未保存修改或未确认提交时尝试切库：替换预检应拒绝，且数据库/表/视图选择和现有草稿不发生部分变化；未知提交不能因清理被丢弃。

## 范围说明

`b2-relation-model-live-read.json` 的 `Base_TblRln` Count=0 只说明本次目标空间的关系查询为空，是本空间烟测缺口；不能据此推断服务全局没有关系记录，也与本次空父字段查询问题分开处理。



## RendererTable 选择事件顺序补核

- 当前目录 `defaultView()` (`src/lowcode/resources/database/lowcode-database-table-view.ts:73-82`) 未设置 `selectionDelimiter`；DataView 默认 `','` (`packages/spark-data/src/data-view.ts:815`)，故本页 `RendererTable` 的 `isMultiSelect` 为 true，并渲染内置 checkbox (`RendererTable.vue:46`)。
- 普通行点击时，Element Plus 先 `commit('setCurrentRow', row)` 再 emit `row-click` (`node_modules/element-plus/es/components/table/src/table-body/events-helper.mjs:25-27`)。RendererTable 的 `current-change` 默认先把 currentRow 写回 DataView (`zero-code.ts:117-123`)；但当前是多选模式，SelectionDelegate 不因此改 selectedRows (`packages/spark-data/src/strategies/selection-delegate.ts:190-200`)。所以真实当前配置下，普通行点击在 `chooseDatabase()` 之前只改 currentRow，不改数据库 cascade 使用的选择值；业务 handler 内的 `setSelectedRows([row])` 仍须移到替换预检之后。
- checkbox 是另一条真实路径：Element Plus checkbox `onChange` 提交 row selection，且点击 `stopPropagation` (`node_modules/element-plus/es/components/table/src/config.mjs:53-59`)，所以它先触发 RendererTable `selection-change` 而不会触发 `onRowClick`。`zero-code.ts:134-140` 默认处理将选择写进 DataView；当前数据库表没有传 `onSelectionChange`。这允许勾选/清空/多选数据库而绕过 `chooseDatabase()` 的替换预检和子目录刷新，留下父选择与当前子目录不一致。当前组件没有公开 `selectable`/禁用 checkbox 行的 prop。
- RendererTable 的 `onCurrentChange` 与 `onSelectionChange` 都沿已有可取消交互合同（`useEventDefaults.ts:150-177`、`interactionControl.ts:37-47`），但取消 selection-change 后原生 checkbox 如何与 DataView 反向复位并无页面可用的直接 `nativeTableRef`；不能只 `cancel=true` 就宣称 UI/数据选择一致。

### 最小修订边界

数据库目录的业务目标是单个数据库（`chooseDatabase` 总是选一个，级联绑定也只按一个 `dbid`）。本页仅对数据库 default DataView 配置 `selectionDelimiter: ''`，移除多选 checkbox；不要改公共 RendererTable API。复用 `onCurrentChange` 可取消 handler，在 DataView 单选默认同步之前预检所有将被替换的表/视图/字段视图；失败时取消默认行为。`chooseDatabase` 仍在自身任何 selection/clear/query 副作用之前重复同一预检，作为直接调用入口的守卫；失败同步取消其 row-click 默认行为。需实测取消时 DataView 选择/当前行和原生高亮一致，否则不能把 cancellable event 当完整 UI 回滚合同。若不移除 checkbox，则必须让 selection-change 路径也进入同一单目标领域流程并在拒绝时可靠恢复原生选择，不能遗漏勾选/清空/多选路径。

建议新增的页面/RendererTable 集成反例：dirty 与 unknown 保存状态下点击另一数据库，DataView selected/current target、子视图行和草稿均不变且无新子查询；clean 状态点击后仅选择目标库并只查询该库下表/视图；数据库视图不显示多选 checkbox（或若保留，勾选/清空/多选都由测试证明经过同一预检/回滚）；模拟原生 current-change 在 row-click 前发生，断言拒绝时没有 DataView selection mutation、旧高亮可恢复。另保持标准刷新/过滤沿用原 DataView 的 `refresh/assertResultReplacementAllowed`；页面 inert/disabled 只能辅助呈现，不能替代该守卫。
