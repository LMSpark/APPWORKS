# 当前主控断点

**最高优先级纠偏：2026-10-07 用户明确“本仓页面要转成4文件，需要把原来的VUE转成本仓的4文件”。当前 native Vue 集成方向被否定。主控已承认偏差，停止 implement_d1d；旧 control-plane 和 create-lifecycle 两计划均 superseded。新总计划为 notes/plan-appworks-four-file-integration.md（draft），事实锚点 notes/research-appworks-four-file-integration.md。不得沿下面历史指令继续做 native lifecycle。**

执行者已确认停止，无当前生产写者，未进入 catalog 新增。本轮最终聚焦测试尚有未复验修改，历史19/19不代表当前源通过。原计划路径/数据验证证据可复用为业务事实核对，但不算四文件迁移完成。当前四文件是 PageTool 三文件 + 按 scenarioId 保存的 pagedata.json，走 PageRuntime/DataSet/DataView/SparkPageRenderer。不能回生旧页内数据定义或以整页Vue包装伪装配置页。

未做生产回撤；执行者无开工文件备份，D1d 增量与既有未提交C2改动交错。已将15个相关当前源文件及hash、tracked diff和git状态留存 four-file-correction/。后续先按新计划审计精确撤回范围，禁止整文件checkout覆盖既有工作；再做首个真实四文件试点，admin和低阶实施分工不变。以下是纠偏前历史断点。

**最新用户决定：在线验收“都用 admin”。不再等待或询问受限账号，保留权限h/m/拒绝自动化测试，真实浏览器证据明确为管理员身份。原八项第7项身份策略以此覆盖，其余范围不变。**

2026-10-07。用户授权低阶模型实施、主控派工验收与长期利益裁决；8项边界已确认，不重问。整个29能力仍未完成，不宣称全局零回归。HEAD 0b6c85d9979205cf733da8b0ba663c63e89ec395，branch feat/agent-workflow-node-contract；固定参考 Git 842dec4f11b333df904b9a4e26b6566b0802bab8，不读参考 dirty worktree。没有commit/push/建分支/业务写入/memory或knowledge写入。

## 当前唯一写者

`/root/implement_d1d`，新建 fork none，gpt-6-luna medium。按 `notes/plan-data-space-create-lifecycle.md`（implementing，13文件范围）先做宿主前置 lifecycle/provider/transition/App/guard/tabs 及2测试，完成后须冻结回报主控，不能自行进入 catalog create。新文件 lifecycle，pool/resolver/dynamic/useTabPages/index/App/guard，2测试 system-page-identity-tabs 与 project-navigation-guard。其余agent全部已完成/idle。

主控复核方案已纳入真实竞态：clean后 await activate 时旧页还可开草稿，因此整池编辑锁必须在activation之前，覆盖新实例；每次独立token，旧finally不解锁新锁。普通close精确候选全量预检+锁，不能脏A阻止关干净B，也不能批量半释放；普通multi保留草稿。logout/reconcile/绑定变化/unmount强制dispose+abort，旧授权不能因dirty保留。已送后端写无法承诺回滚。root只导出有目录真consumer的hook，不伪造PageRuntime，不把业务context装进壳。

前置闭环主控验收后才继续同plan的catalog原context/generation/lease、create单次save+精确回读、unknown只读重核与真表单consumer。别保留最终无消费者的hook。不可越过父计划新增edit/delete/后端/依赖/治理/AI。执行者先focused RED/GREEN，再限定门禁；主控源码冻结后才全量/build/browser。当前主控无运行测试/build。

### D1d 首轮复审（正在修复，未接受）

Writer已首轮宿主实现+32聚焦通过，但主控 d1d/lifecycle-controller-review.md 四项暂拒：真实App/guard连续选择不能被旧transition当dirty拒绝；hook必须有响应式只读可编辑状态（首稿普通Set无法驱动UI）；close释放前全候选复检，single导航await要同样锁/取消恢复；补dirty/submitting撤权/绑定abort、批量close原子性、延迟close+取消保留真实fixture。Writer确认在原范围补有效RED/GREEN，暂不重跑全量门禁，不动catalog。

App teardown需捕获本App DynamicRouter，不能旧卸载经全局getter清新壳；首稿已做。原tests/page/runtime/page-runtime-tabs.test.ts和tests/runtime/page/runtime/page-runtime-tabs.test.ts均真实owner，主控已全读；仅加入最终focused命令复验，不修改两文件。还没跑新D1d build/browser/根全量。

### 用户询问进度后的复核

主控现场发现 resolver.assertNoWork 丢失 instanceIds，dynamic 虽传候选但底层实际检查整池；执行者已补透传并报告 identity 19/19。close/setMode 已要求解锁后再对全候选 assertClean，避免响应式同步回调造成半释放；single 导航锁已由 URL 字符串改为 normalized to 对象身份，防止同目标重叠导航覆盖 token。以上仍待冻结源码和有效测试验收，不当作最终通过。

Writer 正在补真实批量 closeOthers/closeAll、dirty/submitting 撤权与绑定失效 abort、A late success/failure 参数化；guard 新测试非 as const 断言已指出须以类型标注/收窄修复。继续只一位低阶 writer，不跑重复根全量。已向用户明确当前是生命周期技术验收卡点，账号无阻塞；正式新建尚未实现或真实写回。

## 最新已验收：D1c

`d1c/accepted-files.json`：owner 5D9025AA7ACF94399E72546305255BA37D692A7C6A1B237EF78BED1C0D970E88；page 7204A3CD7CCB0A49117891050348CB7297CCB66996F7F58055171EC79A31CFF3；test 0A020643907334835B0680DD665F0BCA8B598C2A338703B177E8C7FE78C4969E。

- 实际 Base_UserInfo 正式主键是 ID，关联正式 ROWID，wire 输出 rowid；ID和业务关联不同。第一轮把ROWID当主键，虽然root191/2246+build过，真实浏览器报错而被拒收。`creator-contract-rejection.json` 含正式 readModel/去值响应证据，`production-rejection.png`保留。
- 修正要求权限通过 context.rowKey 的ID，关联只接已证实ROWID/rowid，任何一拼写h/m不关联，UserName自身h/m继续消费。双键冲突显式错误，重复业务关联只未解析，不任意选人；ID不出projection。
- 主控第二次发现所有测试夹具带双键，退回改常规为只有rowid、ID不同，补8种单拼写×权限拼写×h/m参数化。最终2文件46定向；type/lint/ai981/dirs；主控root191/2256、buildexit0。`controller-final-root-tests.log`、`controller-corrected-build.log`；API/host未变39hash全部一致，复用API18/588、host12/80，无重复包全量。
- 生产5274：首屏10/1184，2行解析姓名，8行属于同1个未解析人，提示1；DOM逐行匹配真实响应，wire只本页去重IDs，Fields ID/ROWID/UserName；元数据应用筛选68，第二页与真实目录tab返回保留状态；重置1184/未解析提示1，0consoleerror。`browser-acceptance.json`、`production-creators.png`。管理员只读，不等于受限身份/业务写回通过。

## 当前目录与早期闭环

D1a场景/node=90A82E287930A234FEC3E687C94A93EA，Base_DataSet正式key rowid，固定七字段；必须显式fields才能保留sort wire；不要改共享默认字段投影。URL query scenarioId不是蓝图scenario。owner绑定scope，Vue revision/scope/current owner fences。D1b Base_AppSystemList同scenario allPages提供safe应用value/label，原rows/total先核再权限过滤。业务sysid不能代替executionapp。该场景实际只1选项，平台全局目录不同合同。

C1/C2宿主加载/原生身份/KeepAlive/选择取消已接受，旧dirty保护仅cfg，不能当native。日志/精确hash看 execution-ledger.md 和 c2d2f/controller-all-hash-check.json。39hash在D1c开始再次确认全true。主计划、研读及validation顶部已更新，不再是draft未实施。

## 浏览器与进程

- CUA browser2。compact后先 `await cua.rewriteDocumentation()`，不要重选browser。`productionTab`=tab5，own preview5274，最终D1目录全部应用/第1页/size10，有目录与服务器两tabs，当前为已验收D1c build。`productionCdp`同tab5；缓存正常无限速；本轮已markHandoff（下轮需再mark）。
- 用户tab3开发5273目前文件管理，未改UI；`acceptanceCdp`只做过低风险正式readModel读验证（用已有授权会话），不提取凭据。旧tab4已失效，不复用。自己的preview exec46398仍运行，用户dev PID17412勿停。root sessions1208/32830均已结束，build已结束。
- CUA variables `evidenceFs`, d1cCorrectedStart, d1cFirstProof, d1cFilteredProof, d1cPage2Proof, d1cReturnProof, d1cResetProof, d1cErrors=[]；d1cCorrectedList/Users保存实际响应供内部验证，绝不打印系统凭据/headers或用户值。最终JSON只保存计数/布尔/元字段。
- formal D1 URL `http://127.0.0.1:5274/t/NewApp/D99A1DCE9894698799101EFD70F8FC76/features/data-platform/data-set-management/ui/data-set-list-page?__sparkNavigationId=90A82E287930A234FEC3E687C94A93EA`；服务器page path database-management/ui/service-management-page，marker78C58A7FE34F2987267A1E8AF10B2990。
- 若登录过期复用授权DPAPI凭据 C:/Users/lgf22/AppData/Local/SPARK_AppWorks/credentials/newapp-test-admin.clixml，不输出密码/token。实际企业下拉要选领码科技，预填文字不等于有效option。

## 成本与最终答复

只一个低阶生产writer。主控验收有实据再宣称通过，失败保留证据；无新理由不重复全量。继续有意义进度每60秒以内。最终如报告browser工作嵌入 `d1c/production-creators.png` 或更新截图，不称29项全完成。memory用过 MEMORY.md:47与428-429，最终一个末尾memorycitation块（rollout_ids可空）；不更新memory。已读skills与knowledge记录见历史checkpoint，不需重读。

