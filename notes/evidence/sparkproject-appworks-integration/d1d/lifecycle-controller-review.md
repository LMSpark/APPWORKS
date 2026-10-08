# D1d 前置首轮主控复审：暂不接受

仍在原13文件范围修复，先最小RED/GREEN，暂不重复全量门禁/构建。主控未改生产文件。

1. **真实并发选择被锁拒绝。** 当前 lifecycle.assertClean 检查 transitioning，DynamicRouter.assertPageRuntimesClean→pool.assertClean 被 App/guard 实际调用。因此第一个选择pending时，第二个选择在取得独立token之前即抛错；直接连续调用acquireTransition的测试绕开真实clean gate，不能证明最新选择可接管。clean应仅表示无dirty/submitting，不能把旧过渡锁当脏；普通close若需拒绝无关过渡可单独在close边界处理。补真实App和guard的A pending→B进入→A晚settle（success/failure）用例，既有 C2 latest-intent/receipt/cancel 不可退化。
2. **编辑状态不是响应式且消费者无法读取。** #transitions 是普通Set，consumer只给signal/report/assert；正式计划明确需要响应式可编辑状态供目录fieldset/新增按钮使用。加一个窄只读响应式getter（跟踪reactive transition count/disposed，不能暴露mutable refs/set），验证真实hook fixture的disabled属性随acquire/release/dispose更新；不以捕获reportDirty异常替代“页面不能接受输入”的证明。领域assert仍保留，不能只靠disabled。
3. **关闭缺最终全量预检，single异步窗口无锁。** close当前 releaseTransition 后逐个release，没有再次全部assert，违背批准方案。锁解除可能同步唤起消费者，须最终候选全量预检后再释放；先复验真实批量close的dirty/submitting原子性。single beforeEach目前只assert，后续await导航期间仍能开草稿，然后route已提交才watch报错；须把single自动释放纳入同一过渡生命周期，覆盖取消/失败释放，不引入其它测试文件。普通multi切换不锁。
4. **补实际生命周期缺口覆盖。** 当前新增测试主要reset，不足以证明dirty+submitting时reconcile撤权/绑定替换会abort且旧consumer不能再报告工作；以及closeOthers/closeAll对所有候选先检查（含保存中）、延迟navigate期间候选锁而目标仍正常渲染、取消关闭保留原实例并恢复编辑。优先在既有真实App/useTabPages fixture覆盖，不new框架、不mock assertClean内部。

以有效最小失败用例定位后修复，完成后回报每项证据与源码hash，再跑一轮相关type/lint/门禁即可。catalog owner/page/test暂不动；公开hook最终必须由随后真实目录表单消费。
