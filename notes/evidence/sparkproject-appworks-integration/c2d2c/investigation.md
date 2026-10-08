状态：approved

# C2d2c 跨 owner 取消复现（仅调查，不实施修复）

主控发现当前12项测试只断言Router地址/副作用，pending activation 的替身会在释放时把principal写为旧目标APP-B，测试没有检查此状态。实际平台 fence 仅在新选择/login/logout/存储revision变化时失效；新 same-app 导航未发起选择，故不能根据守卫自己的序号证明平台未晚提交。native reset 锁也可能在取消后没有新refresh解除。必须用真实owner验证，不先假定修复形态。

本调查唯一可改文件：tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts。生产C2d2c三文件保持冻结，其他测试不动。复用该文件真实 lowcodeApi/保存fixture session+application；导入实际ProjectNavigationGuard、实际DynamicRouter和MemoryRouter。

复现：当前APP-A/可打开dashboard → guard导航APP-B，真实platform.activateApplication的listApplications用deferred替代网络（保留真正select/commit/API/runtime wrapper） → list尚未返回时，router导航APP-A的新query/hash → 返回只包含正式fixture APP-B的目录，resolveNavigationRootId替身正常返回ROOT-B → 等旧navigation结束。

断言三个联合不变量：新URL仍APP-A、真实lowcodeApi.application.get仍APP-A、合法APP-A系统页实例仍可打开。若任一失败保留准确raw stdout/exitCode及实际值，不更改期望来让测试通过。不要断言console数量代替状态。不测试业务后端、不写业务、不创建额外框架或导出。

完成一轮真实RED后停止，回报根因和精确行，不修生产、不跑全量。主控据此重写本切片的取消契约；保留当前生产有效改动，禁止整文件回滚其他已验收贡献。
