# B2 目录当前行取消回滚补充报告

日期：2026-10-25。本报告补齐 b2-entry-followup-report.md 没有涵盖的上一冻结后 B2 目录页面修复，并记录本轮标准 RendererTable 取消回滚；不覆盖首轮或前一轮报告/hash。目录页面修复和当前行修复均已落入当前工作树，源码现冻结给主控复审。当前行子轮只改标准组件取消回滚和必要测试类型。未改关系产品实现、唯一台账、Java/服务或生成产物；未提交、推送或运行正式 ClassModel 生成。

## 上一冻结后已落地的目录闭环修复

- **按 databaseId 首次进入即查询两个正式子目录。** 唯一命中后将正式数据库行设置为当前行和单选目标；PageRuntime/DataView 装配完成后显式刷新表、视图 DataView，保留原级联 query owner 与正式数据库参数。不再要求用户重复点击已预选数据库才触发子查询。
- **字段查询由当前活动页签的父选择决定。** activeFieldParentSelected 分别检查表页签的物理表选择和视图页签的逻辑视图选择；字段区域显示和 refreshFields 共用该判断。只切到视图页签、没有选中视图时，不显示或刷新视图字段 DataView。选择数据库后清空子选择，不对空表/视图父级发送字段请求；选中合法父行后才刷新对应字段视图。
- **数据库列表改为业务单选，并在原生当前行同步前拦截替换。** 数据库 DataView 局部使用 selectionDelimiter 为空字符串，RendererTable 不再显示无业务用途的多选 checkbox。onCurrentChange 在 DataView 单选默认动作之前对表、视图和两类字段视图调用 assertResultReplacementAllowed；数据库行点击命令同样先完整预检四视图，再依次 clearAll 四个旧结果、设置正式数据库当前行/选择并查询其表/视图。拒绝时保留原数据库、子目录、字段结果和草稿；不靠 busy/disabled 代替 DataView 替换保护。
- **异步结果按原实例及选择代次隔离。** 切库、选表、选视图和释放页面都更新 selectionGeneration；await 之后错误/提示/后续动作仅在原 DataSet 仍活动且 generation 一致时发布。DataView 的原 currentLoadRequestId 负责丢弃旧查询回执；页面没有加缓存或复制行状态。目录页的 loadUnregisteredNames 以及创建/保存操作也校验原 DataSet、server/database DataView 与 actionGeneration，迟到提示不会写入替代页面实例。
- **新增数据库继续使用当前正式服务器上下文。** databaseCatalogDbCanCreate 要求服务器 DataView 查询已 Loaded、无错误/变更/未确认保存、恰好单选一条正式服务器行，且当次 ServerName/Type 字段可读并是标量值；新增后 await 再核服务器 ID 和行实例仍相同，不满足则丢弃本次 pending row。未猜默认数据库类型，也未缩窄正式 Type 枚举。服务器字段组合的真实权限回执仍以正式环境验收为准；单测覆盖 queryState 失败和 unreadable field guard。

## RED 与夹具失败口径

| 修前证据 | 实际失败 | 口径 |
| --- | --- | --- |
| b2-entry-db-route-child-query-red3.log/.exit | 3 failed / 35 skipped（38 tests）：正式 databaseId 初次进入没有表/视图查询；route target 变化没有重新查询子 DataView；数据库选择但未选表时仍发字段查询。 | 三项都是页面真实 RED；修复后目录页回归及表/视图页套件覆盖对应行为。 |
| b2-entry-db-field-parent-red.log/.exit | 1 failed / 37 skipped（38 tests）；同一测试里数据库切换两次发现空父字段查询（query count 1 而期望 0；切到第二库时 count 增至 3 而期望保持 2）。 | 真实 RED，核出活动页签父选择门控不完整。改为按当前 tab 检查相应表/视图父行后，切 tab 无父视图不会显示/刷新字段区。 |
| b2-entry-db-atomic-late-red5.log/.exit | 2 failed / 40 skipped（42 tests）：真实 RendererTable 点击新数据库时，字段存在 DataView editing draft 仍把数据库选择从 DB1 改为 DB2；真实未知保存回执场景也改了数据库选择并清掉表选择。未知场景经正式 DataSet.saveChanges/原 query owner 形成 hasUnconfirmedSave，没有覆写 getter；不再提交的断言保留，原 capture 可由原入口核验。 | 两个有效 RED。修复是四视图完整替换预检，拒绝时保留全部旧选择/结果/草稿。 |
| b2-entry-db-unknown-red1.log/.exit | 1 failed / 41 skipped（42 tests）：同一真实未知保存场景，数据库 selection 从 DB1 变 DB2、表 selection 从 T1 变空；没有额外 CRUD 写入。 | 有效未知提交 RED，但与 atomic-late-red5 的未知子用例是同一契约，不重复计数。日志中的 DataView DATA_VIEW_UNCONFIRMED_SAVE 是拒绝替换证据，不是测试框架错误。 |
| b2-entry-db-atomic-green2.log/.exit | 1 failed / 7 passed（43 tests）：DataView 选择/草稿保持断言通过，唯一失败是取消后 Element Plus DOM 的 current-row 高亮仍留在被点击的 DB2。 | 有效的原生 UI RED；对应本报告 RendererTable 修复。之后真实标准 RendererTable 套件 14/14 通过。 |

上述 RED 中，atomic-late-red5 与 unknown-red1 都来自真实页面/RendererTable 和正式 DataSet capture 链。route/field-parent RED 则是同一页面公开查询 owner 的请求计数与父选择反例。另有独立组件试验夹具错误：b2-renderer-current-change-red1/red2/red4 的 bodyRows 为空或 dataSource 配错；red3/red5 在无终态运行后中断；均不能算产品 RED。b2-renderer-current-change-stale-reset-red1 也只因断言切换到单行 X1 后仍读取第二 DOM 行而失败，DataView currentRow/selection 断言此前已通过。

## 修复

Element Plus 在 `current-change` 事件发给 RendererTable 前已经更新原生当前行。之前业务回调将事件取消后，DataView.currentRow 保持旧值，但原生表格高亮仍停在用户刚点的新行。本轮在 `RendererTable.handleCurrentChange` 消费现有 `InteractionControl.cancel`：取消时等待 Vue 更新，再从当前绑定的 DataView 读取 currentRow 并用组件内部 `nativeTableRef.setCurrentRow` 恢复原生高亮。恢复期间用内部标记忽略 Element Plus 同步发出的自身 `current-change`，不新增公开 API，也不触碰页面 native ref 或创建选择副本。未取消的事件仍沿原 systemDefault 更新 DataView。

标准表格测试复用 `renderer-table-auto-columns.test.ts` 的完整 PageRuntime、DataView 和真实 Element Plus 夹具，覆盖取消后恢复旧行、取消后恢复 null、允许选择正常同步，以及异步取消期间绑定切换后仅按新绑定 DataView 恢复。测试只针对用户点击的 O2 断言回调一次；不限制正常 programmatic current-row 同步产生的回调次数。

## 验证

| 检查 | 命令 / 日志 | 结果 |
| --- | --- | --- |
| RendererTable 整套回归 | `pnpm exec vitest run tests/ui/renderer/data-table/renderer-table-auto-columns.test.ts --pool=threads --testTimeout=30000 --hookTimeout=30000`；`b2-renderer-current-change-suite-final2.log/.exit` | 退出 0；1 file，14/14 passed。 |
| 数据库目录页回归 | `pnpm exec vitest run tests/runtime/page/database/database-directory-page.test.ts --pool=threads --testTimeout=30000 --hookTimeout=30000`；`b2-entry-directory-followup-suite-final.log/.exit` | 退出 0；1 file，19/19 passed。 |
| 表/视图页面受影响回归 | `pnpm exec vitest run tests/runtime/page/database/table-and-view-page.test.ts --pool=threads --testTimeout=30000 --hookTimeout=30000`；`b2-entry-page-followup-suite-final.log/.exit` | 退出 1；44 tests 中 41 passed、3 failed。3 项均为原关系 RED3（关系表单绑定、overlay 编辑写回、既有 editing value），关系代码和断言均未触碰。此运行后仅在该测试文件为 6 个既有 row 参数补 `DataRow` 类型，未改运行行为；最终全量 typecheck 已通过。 |
| TypeScript | `pnpm run typecheck`；`b2-entry-followup-typecheck-final2.log/.exit` | 退出 0。前一轮 `b2-entry-followup-typecheck-final.log/.exit` 退出 2，报告了本轮 mock 的测试类型错误和页面测试中 6 个隐式 any；已用公开 `DataRow` 类型注解及正确 mock 类型修复，最终日志为全量通过。 |
| Scoped ESLint | `pnpm exec eslint packages/spark-component/src/components/containers/data-views/RendererTable/RendererTable.vue tests/ui/renderer/data-table/renderer-table-auto-columns.test.ts tests/runtime/page/database/table-and-view-page.test.ts tests/runtime/page/database/database-directory-page.test.ts src/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue src/lowcode/resources/database/lowcode-database-table-view.ts src/lowcode/resources/database/lowcode-database-directory.ts`；`b2-entry-followup-scopedlint-final.log/.exit` | 退出 0。 |
| Diff whitespace | `git diff --check`；`b2-entry-current-row-diff-check.log/.exit` | 退出 0；输出只有 LF/CRLF 提示，没有 whitespace error。 |

## 试跑口径

- 较早的独立组件夹具 `b2-renderer-current-change-red1` 至 `red5` 有 fixture 错误或无终态的运行；它们不是产品失败证据，均保留原始日志/中断记录。本轮切换到仓内真实 RendererTable fixture。
- `b2-renderer-current-change-fixture-check2.log` 和 `b2-renderer-current-change-focused-green1.log` 曾在扩展 fixture 时 CPU 持续增长、无终态；只中断了本 agent 持有的对应 Vitest job，日志原样保留。不要将其记为产品 RED。
- 修前/修中组件 fixture 曾因未显式设置 `highlightCurrentRow` 而没有 DOM `current-row`，另有回调总次数断言把 programmatic current-row 同步误计为用户点击。修正后只核旧行/null视觉回滚、允许选择和 O2 用户点击取消；最终标准组件套件 14/14。
- `b2-renderer-current-change-stale-reset-red1.log` 的失败来自测试在切换到仅含 X1 的新 DataView 后还访问第二个 DOM 行，断言错误；DataView selection/currentRow 断言在此前已通过。修正后异步绑定用例通过，没有形成 stale-reset 产品 RED。独立静态 review 的 reset 推测本轮没有扩展实现，也没有据此宣称已验证。

前一轮目录导航、autoQuery、canonicalName 排序等结论与证据继续以 `b2-entry-followup-report.md` 为准。新增完整 SHA256 冻结清单见 `b2-entry-current-row-freeze-sha256.txt`；它重新计算前一轮清单中现存文件，并覆盖本轮改动的 RendererTable 和相关测试。正式 ClassModel 生成、SPA 烟测及工程门禁由主控继续安排。
