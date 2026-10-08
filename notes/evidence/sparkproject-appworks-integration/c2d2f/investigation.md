状态：approved

# 跨入口应用选择与路由意图联合核对

C2d2e 先完成，不并行写代码。主控代码复核识别未证明窗口：App switchAndReload 的 activateLowcodeApplication 不传导航 signal；main guard 仅 abort 自己上次 resolve 的 controller。同 app 的新 query/hash 导航在 owner 已匹配时不触发新平台选择，因此理论上无法使独立 App 服务已在途的选择失效。需要用真实平台证明或否定，不能只用两个 guard 调用测试替代。

## 精确调查范围

仅 tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts 增加一个实际 LowcodeApi/runtime/ProjectNavigationGuard/DynamicRouter/MemoryRouter 联合行为测试。复用 C2d2d 的真实 APP-A 导航和实例夹具；先成功路由 APP-A，直接调用实际 activateLowcodeApplication(APP-B) 模拟 App 服务内的待完成选择（不调用 App outer service，因此只能证明共享平台/guard窗口，报告必须注明）。只延迟 listApplications 网络返回，root 以真实平台所需 mock 返回。

开始 B 选择并确认目录 pending 后，router.push 到同 APP-A 新 query/hash，待该导航完成才释放 B 目录。捕获 B outcome 避免未处理 reject。联合断言最新URL仍A、真实store仍A、当前native instance仍合法；记录 B 是否已成功提交。不得mock平台 activate/当前store/guard/pool，不能人为写store制造RED。

只有测试和调查证据可改，不修改生产、其它测试或包导出。不跑全量/build。若 RED，保留测试和原输出回报主控，由主控确定公共边界后批准修复；若 GREEN，记录真实原因即停止调查。C2d2e 已冻结，主控批准本调查并派发，不提前修改生产。
