# C2d2f 调查结果

状态：调查完成，等待主控裁决边界

仅在批准的 `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` 增加一项真实 MemoryRouter + ProjectNavigationGuard + DynamicRouter + lowcode runtime/platform 联合用例。测试从 APP-A 已注册 native system-page 开始，直接调用真实 `activateLowcodeApplication('APP-B')`；只延迟 `listApplications` 网络响应。平台选择 pending 时完成同 APP-A 的 query 导航，然后释放列表请求并等待真实 activation receipt。

观察结果：外部 APP-B selection **成功提交**，但路由仍是 `/t/fixture-tenant/APP-A/dashboard?view=latest&__sparkNavigationId=dashboard`，实际 store applicationId 为 APP-B，DynamicRouter 导航树归属仍为 APP-A，当前 APP-A 路由仍可解析 native instance `system-page-2`。这证明 main guard 同 app query 导航不会撤销独立外部 activation 的意图；路由和 store 可出现跨入口晚提交不一致。此实验没有调用 App outer service，因此只证明平台/guard共享边界，不声称覆盖 App service 调用链。

定向单测通过：1 passed。原始结果包含 `external-activation-same-query-verbose.stdout.txt` 和配套 result JSON。首轮日志也保留：初次断言错误地要求 query 导航后仍为旧 instanceId，因此因 `system-page-1` 变为 `system-page-2` 而失败；不是生产断言。最终测试按“当前路由仍有合法 native instance”断言并通过。

未修改生产代码，未运行全量、build 或 browser。按 dispatch 停止，交主控确定跨入口公共边界。
