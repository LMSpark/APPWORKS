# C2d2f 修复报告

状态：五文件冻结，等待主控验收

## 修复闭环

- `LowcodePlatformApi` 在现有 application-selection intent owner 内跟踪唯一未提交选择，并新增 `cancelPendingApplicationSelection()`。取消仅在该 owner 仍处于 pending 时递增意图代次；没有 pending 时为 no-op，因此不会撤销已提交 receipt。select/activate/catalog 在同步成功签发 receipt 后立即结清 pending；各入口 `finally` 只清理仍归属本 fence 的 pending，登录/登出继续递增意图并清除 pending。
- `ProjectNavigationGuard.resolve()` 每次入口先调用该平台取消方法，再按既有 AbortController 管理自身导航后续生命周期。普通 same-app query/hash 无平台请求。
- 将调查用例改成修复不变量：待提交 APP-B 应 stale reject；URL、store、nav owner 仍 APP-A 且当前路由仍有合法 native instance。增加已提交 receipt 经 ordinary same-app query 仍有效的真实联合测试。
- 增加 platform 单测覆盖 list/root pending cancel、取消不改原选择、已提交 receipt cancellation no-op、旧操作迟到 cleanup 不清除新 pending owner，以及 store save 后 receipt 创建到 public await 恢复间的微任务取消边界。

## 验证结果

- 有效 RED：`repair-red.stdout.txt` 显示原始跨入口 outcome：外部 APP-B selection committed，URL/nav owner 仍 APP-A，store APP-B。
- GREEN 联合回归：5 个测试文件、83 项通过，包含 C2d2e App switch、system-page identity tabs、navigation sync、guard 与 lowcode runtime。
- Lowcode platform API 定向文件全量：44 项通过。
- Receipt 提交边界微任务测试：RED 后 GREEN；最终 GREEN 输出和 command metadata 已保存为 `committed-receipt-green.*`。临时移除同步 pending finish 时 RED 的控制台工具输出未单独落盘，未伪造其 stdout 文件。
- Root typecheck、spark-lowcode-api package typecheck、5 文件 ESLint、ai-codegen（978 files）、dirs 全通过。
- 每条最终门禁均有原始 stdout 和包含 command/cwd/start/end/exitCode 的 JSON。没有运行 root/package 全量之外的额外测试、build 或 browser。

## 冻结文件 SHA256

| 文件 | SHA256 |
|---|---|
| `packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts` | `71FE63F2B343FEBDC975C83D42F998A6C486C13EF4D2F3D44E9E90D6024E9AE2` |
| `packages/spark-lowcode-api/src/platform/lowcode-platform-api.test.ts` | `FF40113595ECCEB18AF7AC2CD3D833113E8E5DF5F2E60E4DF73EBCE63494DF67` |
| `src/services/project/navigation/project-navigation-guard.ts` | `7F61E2BA51E4576EA32F956CF3087E1483C97F822E170A62C9358D3FD96F57E1` |
| `tests/runtime/auth-nav/application/project-navigation-guard.test.ts` | `07088C73B374E58E633213306523116A56E57C531619BB80DE7C1EC7F650A75B` |
| `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` | `F6ACAB5F4E3960CCDBE8B3949853CCE6311541194700C395CA992A484EE2B3BD` |

只改 dispatch 规定的五个代码/测试文件；未改 App、main、其他 caller 或业务数据，未 commit/push/建分支。既有工作树变更保留。
