# B2 目录第一批后续修复：独立复审

## 结论

**本修复轮无新增阻断发现。** 对照 `b2-entry-followup-freeze-sha256.txt` 的 27 个现存文件均逐一重算并匹配；复审以这组冻结源码/测试为准。实现报告列出的 12/12 聚焦通过及真实导航单测可支持本轮修正。宽套件仍有 3 个关系 RED3，故不能把此结论扩写成整个 B2 已完成或全绿。

## Spec 复核

- **新增目标与失败时保留草稿：符合。** `databaseCatalogDbSaveEdit` 在提交前检查正式 `Name` 字段 `fieldAccess(...).write === 'allowed'`；computed/read-only 时拒绝，不调用 DataSet save。UI `saveEdit` 只有操作成功才替换 `edit.value`，`act` 捕获异常后维持编辑状态。对应测试确认 Name 拒绝、pending create 仍在原 DataView、无 CRUD 请求；RendererForm 成功例则实际绑定标准表单，输入写入 DataView，调用选中行 `DataSet.saveChanges` 并在回执/刷新后才关窗。
- **系统页 dirty source：符合。** 两个原生页均直接把 DataView editing、dirty tracking、mutating/unknown 状态纳入 `useSystemPageDirtySource`。表视图页测试经真实 `DynamicRouter` owner，暂存编辑使实例 `isDirty`，`closeSystemPageInstance` 拒绝；discard 后可关闭。目录页另测普通 DataView 编辑及未确认 save 使宿主保持 dirty。组件没有复制业务行或自建关闭状态。
- **输出字段排序：符合。** `lowcode-database-table-view.ts` 从 `DataSpaceDesignApi.resolveOutputFields` 取 canonical output 名；只有正式 `ordIdx` 输出存在时加入该 alias 排序，并用 `model.primaryKey` 稳定排序。测试覆盖 ordIdx 不输出时不得引用非输出字段，且 canonical alias 和正式主键排序；未放宽 DataView 引用校验。
- **首次 autoQuery 身份：符合。** 数据库 DataView 在装配时与标准 filter 同为 `autoQuery:true`。测试在首次 load 后、RendererForm/filter 挂载前读取 queryConfig，并与标准过滤所用配置比较；RendererForm 成功测试未插入测试专用 refresh。
- **按分支导航和数据库参数：符合。** 当前目录页要求 system-page 身份已解析、`route.meta.nodeId` 与真实 `nav.activePath` 末端一致，再在 `activePath[0]` 的唯一模块分支验证源节点、候选及完整 ancestor 可用性。分支内相同目标路径不唯一则拒绝；跨模块重复不影响当前分支的唯一真实节点。以该节点浅拷贝仅追加所选正式数据库主键 query，再走 `nav.navigateTo(node)`。测试使用真实 `useNavigation` 和 `DynamicRouter`/SystemPageIdentity owner，核对 router 的身份 marker、route `nodeId`、`blueprintScenarioId`、`databaseId` 及独立实例；不是只断言 stub 的导航调用。该测试对 `getNavTree` 的模块导出有 mock，但其返回的 `items` 与 DynamicRouter `loadNavigation` 使用同一数组；导航上下文、router 和身份解析仍为实际实现。

## Quality / 已知范围

- 最终 focused 用例报告为 12/12 通过。宽套件为 188/191；3 项是原有关系 RED3：关系表单绑定、relation overlay 编辑写回、既有编辑值恢复。相同签名也存在于本轮早期 suite，且本轮没有改关系实现或这些断言。它们仍是 B2 未闭合项，须由关系任务解决，不能从总体 B2 验收中剔除；本复审不将其归因于本轮目录入口修复。
- 最终 typecheck/scoped ESLint 均退出 0。作者说明第一次 typecheck 失败日志被同名成功输出覆盖，故其具体首错无法独立复核；该证据口径在实施报告中已如实披露，不影响当前冻结文件 hash 与最后成功状态。
- 报告提及的服务/页面 smoke 和正式 ClassModel 生成不在此轮 fixture 证据内；不据此宣称真实 SPA 可达或生成产物已刷新。主控随后生成的产物不属于本次已审源码/测试 hash。

## 已核主要证据

- 冻结 hash：`b2-entry-followup-freeze-sha256.txt`，27/27 现存项匹配。
- 最终说明：`b2-entry-followup-report.md`。
- 有效 RED：`b2-entry-followup-red3.log` 与 `b2-entry-nav-query-sort-red.log`，均为修复前证据。
- 最终聚焦与宽套件：`b2-entry-followup-focused-final.log/.exit`、`b2-entry-followup-suite-final.log/.exit`。
- 独立真实导航用例原始日志：`b2-entry-real-nav-check.log`。
