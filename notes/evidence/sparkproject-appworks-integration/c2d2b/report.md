# C2d2b 实施回报

状态：冻结待主控审查。dispatch 保持 implementing，等待主控验收后更新。

## 已完成

- `DynamicRouter.resetSystemPageInstances()` 使现有路由注册代次失效；真实 deferred refresh 用例证明 reset 后的旧成功和旧失败都不能提交 owner/unlock，只有新的成功刷新能恢复。
- `ProjectSwitchService` 返回平台现有 selection receipt。App 在 dirty guard 通过后才启动本地意图与 native reset；activation await、导航刷新完成后继续核验组合 receipt，刷新失败原错透传。
- `reloadAndSyncNavigation` 在请求前、请求成功后投影前及失败出口检查可选 receipt；手动无参刷新合同保留。
- App home/cross-app、AppList、PlatformApps、PlatformTenantManagement、AppTabBar 六处真实 caller 都在 switch await 后检查 receipt。AppList 只有 Router 成功且 receipt 仍有效才提示成功；其余缺失的页面错误处理已补齐。
- 新测试实际 mount App、页面 consumer 和 AppTabBar；TabBar 使用真实 `useTabPages` 与 Router，覆盖 stale receipt 后不跳转并保留当前路由和可见标签。

## 验证

- 7 个定向测试文件：52 tests passed。真实 RED/GREEN 和最终输出位于本目录；最终汇总见 `final-focused-tests.stdout.log` 与 `final-focused-tests.result.json`。
- `pnpm run typecheck`：通过（`final-typecheck.*`）。
- 六个 app production 文件、package DynamicRouter、三份目标测试的定向 ESLint：通过（`final-lint.*`）。
- `pnpm run verify:ai-codegen`：通过，976 files checked（`final-ai-codegen.*`）。
- `pnpm run verify:dirs`：通过（`final-dirs.*`）。
- 10 个精确范围文件的 SHA-256：`frozen-files.sha256.json`。

## 边界

未运行根全量测试、根/package build 或 browser 验收，依 dispatch 留给主控组合验收；未改 main、后端、业务数据、依赖或 dispatch 外的生产/测试文件。工作树原有 C1–C2d1 改动保留，未 commit/push/建分支。
