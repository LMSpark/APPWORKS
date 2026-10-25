# B2 当前行 / 空父查询修复独立复核

日期：2026-10-25。仅静态复核冻结文件及已保存日志；未运行测试、服务或浏览器，也未修改产品/测试。

## 冻结完整性

独立按 `b2-entry-current-row-freeze-sha256.txt` 重新计算全部 29 个文件 SHA-256：29/29 匹配，无冻结后文件漂移。

## Spec 结论

未发现本轮范围内的阻断问题。

- **预选数据库与首次子查询**：`LowcodeDatabaseTableView.loadCatalog()` 按正式 DataView 主键添加 databaseId filter 并刷新 DB view；页面校验返回恰好一行后以 `setCurrentRow()` 预选。该 DB DataView 配置 `selectionDelimiter: ''`，单选同步把目标作为选中值。宿主及 PageRuntime 装配完成后，仅当 databaseId 存在时执行一次 `refreshChildren()`。测试分别核精确 filter、首次表视图查询以及指定主键不可唯一命中的失败路径。
- **切库预检与清理**：`guardDatabaseCurrentChange` 和 `chooseDatabase` 都调用完整的 `assertDatabaseSelectionReplaceable()`；它先对表、视图及两个字段 DataView 全部执行公开 `assertResultReplacementAllowed()`，之后才逐个 `clearAll()`，再选新数据库和刷新子目录。单库模型关闭 checkbox 多选路径；当前行取消时由标准 RendererTable 恢复 DataView 所属视图的 native 高亮。真实 row-click 用例证明脏字段草稿时数据库选择、表选择、字段数据和视觉高亮都保留，且无额外 DB 查询。
- **dirty / unknown 保持**：替换守卫明确拒绝 pending dirty/editing 和 `hasUnconfirmedSave`。Unknown 用例让字段保存请求发出后连接中断，确认切库不清目标/重试 POST，并通过 DataSet 原捕获重入得到成功核验；写请求计数未增加。
- **无父字段查询**：`refreshFields()` 仅在当前类型父 DataView 恰有一个 selected value 时刷新。测试覆盖无表的数据库选择、切换数据库后旧字段清空且不发 parentless 查询、切换到无选中视图的 tab 不刷新字段；直接选择表后才请求字段。
- **旧回执隔离**：DataView 的 `clearAll()` 复用替换守卫和结果清理/请求代次失效；保存的集成测试分别延迟旧数据库子查询、旧表字段查询到切库完成之后再释放，并断言旧结果不回到表格或 DataView。
- **无第二业务数据链**：页面读查询仍由正式 DataView `refresh()` 完成，清理/选择经 DataView，普通保存继续 DataSet/DataView；组件取消回滚仅同步其当前绑定视图状态，没有页面行缓存或额外 HTTP 查询器。

## Quality 与验证口径

- RendererTable 使用真实 Element Plus + PageRuntime/DataView 夹具。当前行覆盖旧行、null、允许默认同步，以及异步取消期间切至不同数据集行（O1/O2 → X1）并验证新绑定 X1 的高亮恢复。O2 用户点击次数按事件过滤断言为 1，没有把普通 programmatic current-row 同步的回调计数定成通用合同。已保存最终日志为 14/14；目录页 19/19；全量 typecheck 与 scoped lint exit 0。
- 表/视图页最终已保存运行记录为 41/44，3 项仍是报告所记既有关系 RED3（关系表单绑定、overlay 编辑写回、既有 editing value）；本轮当前行/查询修复没有修改关系实现。它们仍是下一关系组的未解决项，不能计作全套通过或归因到本修复。
- 之前静态提出的 ElementPlus stale-reset 风险在差异行集成用例（新视图 X1 与旧视图 O1/O2 不同）下未复现；不据该推测要求扩大改造。

## Findings

本次无新增阻断或非阻断发现。关系 RED3 保留原归属；未对其作本轮修复结论。
