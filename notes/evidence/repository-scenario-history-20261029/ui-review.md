# 场景历史共享 UI 最终只读复审（2026-10-29）

最新结论：四项修复静态 PASS，包括失效 unknown / 新 owner 的 status；不含 UI/真实持久化验收。初审需修、hydration 撤回与两轮窄复核经过保留在下文；以最后一节及其 SHA 为最终审查身份。相对基线 3531bf09f，审查当前未提交源码；单写者仍在补测试，后续代码变化不自动消除以下结论。所有相对路径均以 C:/Users/lgf22/.codex/worktrees/ai-data-entry/SPARK_AppWorks 为根。本轮未修改产品、测试、台账、生成物，未运行服务/UI/测试，未提交。遵循 requesting-code-review/code-reviewer.md 的具体触发、严重度、边界和证据结构。

## Must-fix

### P2 — 无活动场景文件被错误当成未决历史写入

定位：src/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue:1390-1393。
调用链：ScenarioDefinitionResource.source.history.status（packages/spark-project-model/src/scenario/scenario-definition-resource.ts:83-87）→ProjectWorkspace.getScenarioVersionStatus（project-workspace.ts:423-428）→scenarioVersionContext（:551-556）。后者在 scenarioFiles 没有 owner 时抛“场景视图文件尚未加载”。页面把任何异常变成 pending=true。

具体触发：正式空间尚无 pagedata 文件，或重新打开时远端已删除活动文件；没有创建过历史 attempt，状态读取仍抛出，页面即认为有未知写入。影响包括 isPending 的布局/编辑入口（:1019、1086、1092）、hasPending/dialog close（:1412）、系统离开守卫（:1415）和再次 load（:1420）。已有无文件布局用例在 tests/runtime/page/design/native/data-space-design-page.test.ts:2395；同文件:351-352 覆盖远端定义删除重开。此处未运行它们，不宣称测试 RED。

修复方向：从真实 owner 读取是否确实有当前 pending/unknown；缺文件、未装载、缺历史能力与未知写入分开。不得吞掉真正未知 attempt，也不得把所有异常一律认作有写入。

### P2 — Dev 恢复遗漏同源命名视图草稿及未决保存

定位：src/views/app/dev-system/useDevState.ts:978-987，尤其:980。

hasChanges 仅检查 document.isDirty；Document.isDirty（scenario-definition-document.ts:109）仅覆盖 document.viewSelectors 的五个 default。ScenarioHistoryPanel 的 draftDirty 同样来自 Dev pageDataDirty。存在真实同源命名视图，例如 DataResourceRelationDefinition.graph，formal resource.source.views（scenario-definition-resource.ts:108 起）已经枚举全部同源文件视图。

具体触发：graph/另一命名定义视图留有 add/edit/delete 或未决保存，同时五个 default 干净；Dev 恢复会通过并改写五个 default，留下相互冲突的两份同源草稿。应在预览等待前后及写草稿前核同一来源的所有视图、身份与 pending/unknown，而非只核 document 默认五项。新测试 tests/app/dev/use-dev-state-page-data-history.test.ts:207-224 已使用真实 graph.addRow，不是测试专用旁路；未执行。

修复方向：复用正式来源视图集合/相应同源守卫，并保持恢复仅 setText 草稿，显式 DataSet.saveChanges 五 selectors 的保存边界。

### P2 — 已失效 scope 的历史 attempt 永久被新 scope 的离开守卫认领

定位：packages/spark-project-model/src/project/project-workspace.ts:178-180、249、583-593。

getter 无条件扫描所有 records；currentScenarioScope 换 token 时销毁定义 DataSet、清空 file owner，却保留记录。正式触发：A scope 创建 unknown→同 App 打开 B scope→loadScenarioViews 触发当前 scope 更新。B getter 仍 true，但 B verify（:433-436）找不到 A key；回 A 重新加载又会因 owner 不同拒绝。dispose 也拒绝。useDevState.ts:189-190、827、872、1513 消费此 getter，使已不可核验的旧记录继续阻塞新的节点/owner 生命周期。

最小边界：getter 仅认领当前 readScope token 且仍为 scenarioFiles 中同一 file owner 的 pending/unknown；token 改变但 cache 尚未清空时也不能算新 scope 的 attempt。正常同 scope 有效 owner 的离开继续阻挡。旧 record 保留 unknown 事实，不标作撤销/成功；强制外部 scope 失效后允许释放旧 workspace 内存，不新增全局永久 cache 或持久化凭据。旧面板已有 assertScope/assertSourceView 失效机制，可提示“原请求已失效、结果未确认”；不用把旧 attempt 重挂新 scope 或发新核验。主控已接收此边界。

建议 RED：同 scope 有效 owner 仍拒绝释放；token 改变尚未调用 load 的 getter、调用 load 清 owner 后的 getter与 dispose，都不被失效记录全局锁死。

### P2 — 共享窄组件没有给标准子组件绑定真正的定义视图

定位：src/views/features/data-platform/data-set-management/design/history/ScenarioHistoryPanel.vue:39-54、64-73（整段只有 DataView prop，没有 useSparkComponent / DATA_SOURCE / dataViewKey）。

目录宿主 data-set-design-page.vue:1479 仅提供 PAGE_RUNTIME；面板内部 RendererButton 的正式绑定链在 packages/spark-component/src/components/containers/layout/action/RendererButton/RendererButton.vue:78-81 继承 DATA_SOURCE。传给 Panel 的 view prop 仅供 TS 调 API，并未成为标准子组件上下文。因此目录内按钮继承祖先目录视图或无定义视图，Dev 因外层已提供 DATA_SOURCE 才恰好正确。不能以按钮点击方法最终用了 DataView 代替标准组件的明确绑定。

修复方向：窄组件用已有 Spark component context 提供传入的真实定义 DataView，切换和释放按已有上下文合同；或用正式完整 key 精确绑定。列表是历史 DTO 投影，无需为了形式另造数据表/历史草稿真源。应使用真实 RendererButton 的继承行为补验，现有按钮 stub 只能证明事件转发，不能证明绑定。未将此认定为已发生越权写入。

## 已核正确的部分

- 共享面板 list/preview/create/verify 调用传入 DataView 正式 source API，不直接调用文件 IO；list/preview 不主动打开 Document。
- 两宿主恢复已去掉旧自动保存，现为 document.setText 草稿；明确保存沿 DataSet.saveChanges({views:document.viewSelectors})，五 selectors 仍来自正式 Document。目录保存后 refresh 会刷新 session 投影。Undo/redo 使用 Document 原实现，未另建本地 JSON 真源。
- 关闭共享面板不清 Workspace 的 unknown；重新打开读取 status。Dev 的节点/document 变化关闭面板，目录 load 关闭面板，正常未决操作存在宿主守卫。释放不宣称取消上传。
- 旧 Dev 专属历史列表/预览/创建逻辑已由共享面板替代，普通远端 source 接口仍保留；本轮未发现新增 fallback 到远端或另套 file 保存。
- savePendingPageFiles 新增于 useDevState.ts:379-383，而不是 PageToolFilesDataView 类。await fileOwner.savePageFiles 后向原 ProjectBlueprint 发 page.file.changed（project-blueprint.ts:468、599-606）；订阅方 useDevState.ts:555-558 只刷新 revision/bindings。此路径没有再次上传，没有以事件替代真实保存确认。枚举全部 dirty 页会额外发投影失效事件，但目前没有证据证明改变持久状态或造成第二次保存。

## 明确未判/建议项

- Panel:64 监听 open/view 但 busy 时 load 返回；:73 current 未比较捕获 view。组件若保留实例换 view，旧列表/预览可能落入新面板；:94 create 后 list 的 await 之后还缺第二次 current 检查。这是组件复用风险，但当前 Dev watch 关面板、目录 load 重建/关闭，未找到正常宿主可达跨目标复用实例路径，故不以已发生串目标写列 must-fix。建议后续捕获 view 并在 watch 失效请求代次，补 prop-switch 测试。
- 未运行当前新增测试，也不引用写者的“全绿”作为独立证据。主控的测试日志/真实入口检查属于主控证据；本报告静态结论不替代真实 SPA 创建、unknown 核验、恢复、保存重开的验收。
- 本轮不重复 core/host 已通过的独立合同复审，仅审本轮新 getter 的生命周期影响。未审后端/Java，也未创建历史文件。
- 当前 writer 正在修复上述问题；以下 SHA 锚定本次读取源码，不代表后续补丁也已通过审查。

## 更正：撤回目录 fresh overview hydration P2

复核日期仍为 2026-10-29。初审断言“正常 fresh overview 首次恢复必然因 Document.open 按需加载而拒绝”不成立，已从 must-fix 撤回。当前 must-fix 为其余四项；未复核其后续修复状态。

遗漏的真实初始化链：LowcodeDataSpaceDesignSession.refresh（src/lowcode/data-space/view-design/lowcode-data-space-view-design.ts:2439-2446）通过 viewMetadata.reset、relationMetadata.reset、cascadeMetadata.reset 加载 DataViewDefinition、DataTableBindingDefinition、DataResourceRelationDefinition、DataViewCascadeDefinition 四个默认视图；页面 load（data-set-design-page.vue:1499-1501）无条件创建 DataSpaceLayoutEdit 并 await initialize，其 src/views/features/data-platform/data-set-management/design/graph/data-space-layout-edit.ts:85-105，尤其 :91 会 refresh DataSpaceLayoutDefinition 默认视图。正常页面初始化完成时，五个默认定义视图均已查询，后续 Document.open 不会因为补齐未加载视图而改变其 rows。deferDefinition 只延迟目标运行结构的装配，不能据此推断页面默认元数据定义视图仍未查询。

写者报告 fresh overview 用例恢复成功且 0 写，GREEN 与完整调用链一致；不是该缺陷的 RED，本审查者没有独立运行该测试。不得手工 clear rows/reset requestState 伪造正常页面前提。初始化途中或查询失败后重试仍可能产生基线变化，但本轮没有具体正常 UI 操作证据，不据此维持严重度，也不要求为了这个静态设想改变产品。

此更正不影响 Dev 同源 named graph 真实草稿遗漏；该项已有主控/写者实际 RED 佐证，证据归其运行记录。本审查遗漏完整 layout owner 初始化链，前述错误结论由审查者负责，已通知主控与写者。
## 审查身份（SHA-256）

| 文件 | SHA-256 |
| --- | --- |
| ScenarioHistoryPanel.vue | 5A6627F21956CEA0EE7DB2DD7937F7354598723157F7AC07B5DC643E1A76FECF |
| data-set-design-page.vue | 30E119D1F5DB90EEF72B71A0E093AAF5288622025A3313607EA285C3FAB27E99 |
| DevDataSetDesigner.vue | 0DB9367BA814ACB21B3F817876D6F0A9E766A6E3CC1D7B32D344534D5F5E7EB3 |
| useDevState.ts | 919254A199B0D80658B4E0D8D62B4331D2BA7BF8ED248E268903EACCAA326678 |
| project-workspace.ts | E6CCA17B7C45B2371725E4E9DB712AFB25A7672E1E44F5BF37643D1F13617CE7 |
| scenario-definition-resource.ts | 37CE7FE9EED675B5BE2B47A69710E9A044DECAB4E5A861A2F1E842CC7ADEBD46 |
| scenario-definition-document.ts | 37A1710861C08C0325538A94DA69CB203E9F5CD0E39A6EC3726ADEC6D601AA96 |
| tests/app/dev/use-dev-state-page-data-history.test.ts | F557AAB8DEBB70DE5EF143F35350A00FDEB879B986C2BA22881E63D2A1D5A0CA |
| tests/runtime/page/design/native/data-space-design-page.test.ts | B1B463807A0EE3EA09E832E5276BEBB31A09C53E304EA575D4B6E12AA7DA1526 |


## 窄复核更新一：三项闭环，一项仍需修

只读复核当前修复源码与新增测试，未重跑整体分析，也未运行测试/UI/服务。保留前文初审和 hydration 撤回经过；以下为最新状态。

1. **Dev 同源命名视图：静态通过。** useDevState.ts:870-875 按正式 ScenarioDefinitionRecords 五种资源及 target scenarioId 枚举每张表的全部 view；:877-892 比较 rows/编辑覆盖/定义/queryContext/资源/未决状态和对象引用身份；:1008-1023 在预览前检查 dirty/unknown，等待后检查 fingerprint 与目标，setText 后检查身份。旧 default-only 缺口已闭环，不改变显式五 selectors 保存语义。初始 document install 订阅当前同源视图事件（:851-859）；新增动态视图仍由操作时枚举核查。
2. **Workspace getter / Dev owner 保留：静态通过。** project-workspace.ts:178-184 读取当前 token 并要求 map 中当前同一个 file owner，仅其 pending/unknown 计入 getter。token 已变但 cache 尚未清理也不会认领旧记录；useDevState.ts:189-199 原 bundle 保留因此只跟随当前有效 attempt。同 scope 原有效 unknown 仍被守卫；失效未知事实没有伪装为确认或撤销，没有新增全局缓存/凭据持久化。
3. **Panel 标准绑定：静态通过。** ScenarioHistoryPanel.vue:56-57 建立自身 Spark context，并 watch view 提供 DATA_SOURCE；:68 卸载移除。正式 sparkProvide 是对本 context.capabilities map.set（spark-utils/src/capability/core.ts:80-81），因此后续绑定直接替换本地 key，不遗留原 view；sparkRemove 删除本地 key，不释放外部共享 DataSet。新增 use-dev-state-page-data-history.test.ts:295-308 使用 useSparkConsume 实际读取上下文，证明初始提供的是原 view；它未独立覆盖 prop 切换，未把其当成切换测试证据。早先 Panel 迟到复用建议仍不是本轮 must-fix。
4. **缺文件 / 旧记录 status：尚未闭环（P2），集中两条触发。** 当前 getScenarioVersionStatus（project-workspace.ts:427-442）的 no-file 分支仍有全 scope 扫描和 record 存在即 OWNER_CHANGED；有 file 分支也对已完成旧 owner 抛异常。目录 isPending:1393 仍把状态异常变成未决写入。
   - 创建历史已 confirmed（或 typed not-applied）后，活动文件被删除并以同 scope 重开，或确认采用远端删除后重新出现活动文件并重建 owner：旧完成 record 导致 OWNER_CHANGED，目录误锁。完成记录不应冒充当前 pending/unknown。
   - A scope 有 unknown，外部转到 B scope 且 B 目标活动文件不存在：getter 已 false，但 status:432-433 全 scope 扫描 A 后抛“尚未加载”，目录又误锁。新 scope 无当前 owner/attempt 应 idle；不得为旧测试的“尚未加载”断言重引跨 scope 识别。

有效原 owner unknown 的 verify 仍须校验原 scope/file/编号/原文，不能因修 status 而重挂未知 attempt 或允许重发。主控已要求这两条正式触发先 RED 后修复；本报告不把尚未运行的测试当成验证证据。

此次窄复核 SHA-256：

| 文件 | SHA-256 |
| --- | --- |
| ScenarioHistoryPanel.vue | AD64890B9925C4F2F80C44655EC09C6FE839F5D98BFA13D4FEF7C99D8A5D4F37 |
| useDevState.ts | 25FF1C4DD170ECFF37AAE43E300E8DBEC79A0B2FF741515759FFADD901FCA5CE |
| project-workspace.ts | 089635445ABB96081120942DE5D1928D4EEF114605B84AC21268D79729956819 |
| use-dev-state-page-data-history.test.ts | A9D0A9B04A1F6FF23C33777FFE300282E6EC85F5B05CF72A2CF51897598C98E0 |
| scenario-view-file.test.ts | FF3B95CFCA3A3FAECAC1B8CC1A71A2BE6B08DEADF9AF304F1997FC487CEEC3C6 |


## 窄复核更新二：曾签静态 PASS，已因下述失效 unknown 路径撤回

最新源码已核，未发现本轮四项修复中仍需阻断的实际问题。没有运行测试、UI或服务；写者测试通过自述不替代主控独立验证。

- Dev 同源全部命名视图恢复守卫、Workspace 当前有效 scope/file getter与 Dev bundle 保留、Panel 正式 DATA_SOURCE 绑定及释放，沿用“窄复核更新一”的三个静态通过结论。
- status 最后一项已闭环：project-workspace.ts:431-433 无当前 file 返回 idle，不再跨 scope 扫描 unknown；:435-440 对旧 owner 的 confirmed/not-applied 返回 idle；:442-443 对同 owner 原 pending/unknown 保留原状态。verify:451-456 对无 attempt/已完成旧 owner返回 ATTEMPT_NONE，对未决旧 owner保留 OWNER_CHANGED，不会重挂原未知 attempt 或发送创建。有效同 scope/file 的原 unknown 仍可走现有精确只读核验，getter仍阻挡正常离开。
- 对应正式反例测试 scenario-view-file.test.ts:1611-1626 使用 create confirmed→setRemote(null)→adoptScenarioViews→缺文件读idle→setRemote(真实文本)→loadScenarioViews→新file读idle，前提是真实owner生命周期，没有手改内部map。新scope无owner的状态断言亦已改idle。此轮只阅读测试；主控负责独立执行。
- 补核目录事件错误：data-set-design-page.vue:49-50 删除树slot的 @click.stop，改正式 on-click 回调；:732-735 的 selectDirectoryNode 按 event ?? rowOrEvent 识别真实 Event、调用 stopPropagation 后选择节点。RendererButton.vue:213 原合同为有行时 (row,event)，无行时 (event)。此修复落在错误消费者，不更改公共按钮语义；不存在把行对象交给 Vue.stop 的原错误。

边界仍成立：hydration P2 已撤回，不能重列；Panel 保留实例换 view 的迟到风险仍为未证明正常宿主触发的建议，不升级为本轮 must-fix。历史 host/core 的其他既有审查不在本轮重复；真实 SPA 创建、unknown、恢复、显式保存重开和整体回归仍以主控证据为准。

最终 SHA-256（修复源码审查身份）：

| 文件 | SHA-256 |
| --- | --- |
| ScenarioHistoryPanel.vue | AD64890B9925C4F2F80C44655EC09C6FE839F5D98BFA13D4FEF7C99D8A5D4F37 |
| data-set-design-page.vue | 35008AF23ED59EF25EE0ACC6BA5D7CE683FFFAA1FB60BEC30C2BAC2CD2615799 |
| DevDataSetDesigner.vue | 0DB9367BA814ACB21B3F817876D6F0A9E766A6E3CC1D7B32D344534D5F5E7EB3 |
| useDevState.ts | 25FF1C4DD170ECFF37AAE43E300E8DBEC79A0B2FF741515759FFADD901FCA5CE |
| project-workspace.ts | 671E42FBC42A5A13B065CF84C4D228C854330875D093CEF39FCA03140E1F6377 |
| use-dev-state-page-data-history.test.ts | A9D0A9B04A1F6FF23C33777FFE300282E6EC85F5B05CF72A2CF51897598C98E0 |
| scenario-view-file.test.ts | 73B9DFE638C1920C5F4EAE41904E0AF4C8F74969BF102CF8C6666C7E3F8CFBAF |
| data-space-design-page.test.ts | C49E4326E4A68216755BCFFCC0C5C86BBCED76FD0A09FFAE202CE62023933649 |

## 窄复核更新三：撤回更新二的 PASS，旧 unknown / 新 owner status 仍需修

主控指出更新二仅闭环 confirmed，不能将失效 unknown 的状态读取异常当作正确的防串用。审查者补核确认正式调用链可达：DataViewSource.adopt（packages/spark-data/src/query/data-view-source.ts:178-215）检查当前视图与草稿/请求，不以历史 unknown 为阻断；Workspace.adoptScenarioViews（project-workspace.ts:396-411）仅检查仍在提交的 scenarioSaves，unknown 后其 finally 已清锁。用户按正式来源采用确认不存在的远端原文 null，可以删除旧 file owner；文件随后重新出现并 load，会建立新的 owner，而旧 unknown 记录仍在原 scope key。

getScenarioVersionStatus:435-437 此时抛 OWNER_CHANGED，目录 isPending:1393 把它当当前未知写入，尽管 hasPendingScenarioVersionAttempt 已 false。正常 source adoption 的目标核验不能改变“status只描述当前有效owner”的约定。

修复边界：status 在无当前file或 record.context.file !== currentfile 时统一 idle，不改旧unknown事实；verify 仍可报 OWNER_CHANGED 且不能将旧attempt套给新owner；create 对旧unknown的保守拒绝是独立写操作边界，不能让查询status导致所有关闭/布局/新scope操作锁死。以真实 unknown→adopt(null)→remote重现→load→status idle 的测试补验，不手改内部map。其余三项通过、事件消费者修复通过以及hydration撤回不变。更新二 SHA代表被审版本，不代表最终通过版本。

## 最终结论（更新四）：四项静态 PASS，最后 owner 分支已闭环

对写者最后补丁再次窄读：project-workspace.ts:431-437 对无file及 record.context.file !== 当前file 一律返回 idle，不再区分旧记录是否 unknown；不修改旧record。:439-440 同有效owner返回原状态。因此同scope有效unknown仍保留，失效owner未知事实不会被新视图认领为当前pending。

verify:448-453 仍对未决旧owner报 OWNER_CHANGED，对完成旧owner报 ATTEMPT_NONE；create 仍保留 UNKNOWN 保守拒绝，未新增请求或重发。这与只读当前状态、只读原attempt核验、写入创建三种边界相符。

新增 scenario-view-file.test.ts:1633-1652 是真实 unknown→adopt(null)→remote重现→load 的正式链，断言 status idle、getter false、verify OWNER_CHANGED、create UNKNOWN、createVersion仅一次及dispose可执行，覆盖了更新三指出的漏洞。写者报告198/198属于写者证据；本审查仍未运行测试。

其余三项及目录事件消费者修复的静态通过结论不变；hydration撤回与中间过早PASS撤回均保留。最终可给主控静态 PASS，后续全回归及真实 SPA 验收由主控独立完成。

最终有效源码 SHA-256（替代更新二相同文件的旧hash）：

| 文件 | SHA-256 |
| --- | --- |
| project-workspace.ts | 31C99F65574B6F8F844B3EE39DED70FF745E9A85E4C3CFCCFA697E42A60F4F58 |
| scenario-view-file.test.ts | 8C437150B9DE1CE31B4475D09EDCCB93A5A05282D6A956244DC19EBE168765CE |
| data-set-design-page.vue | 35008AF23ED59EF25EE0ACC6BA5D7CE683FFFAA1FB60BEC30C2BAC2CD2615799 |
| useDevState.ts | 25FF1C4DD170ECFF37AAE43E300E8DBEC79A0B2FF741515759FFADD901FCA5CE |
| ScenarioHistoryPanel.vue | AD64890B9925C4F2F80C44655EC09C6FE839F5D98BFA13D4FEF7C99D8A5D4F37 |
