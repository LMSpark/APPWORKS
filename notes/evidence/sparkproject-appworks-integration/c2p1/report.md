# C2p1 执行报告：导航刷新发布隔离

## 结果

完成范围限定为 `packages/spark-app/src/router/dynamic.ts`、`tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts` 与本目录证据。没有改动 C1a–d、下层 API、配置或依赖；没有提交或建分支。DynamicRouter 的首次注册与刷新现共用实例内递增代次和局部加载，只有仍为最新的一代会同步提交租户/平台导航和路由。旧成功返回当前已提交树，旧失败原样拒绝且不动全局状态。最新 401 会实际切换到 preAuth 树；最新刷新一般失败先切换到 preAuth 再拒绝，普通注册失败不回退。跨项目引用 host 在复用时继续登记为受管路由。

同步 `router.addRoute()` 异常也纳入闭环：提交前保存受管路由的实际 `name`、`path`、`components`、`props`、`meta`，以及导航树引用、路由追踪集合和 WeakMap。同步提交失败时移除部分新受管路由并恢复快照；无 preAuth 时维持旧树，刷新且有 preAuth 时再执行回退并拒绝原错误。没有加载页面组件或创建第二个 Router。测试中的外部静态路由在失败后保留。

## 修改

- `packages/spark-app/src/router/dynamic.ts`：增加注册代次；用局部导航结果统一加载与同步提交；同步主树加载完成后若已过期，不再请求平台树；提交失败恢复旧受管路由与树引用；host 复用时记回本代路由集合。
- `tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts`：增加并发提交、旧成功/失败、首次注册竞争、平台导航延迟、失败回退与保留、host 复用和真实 malformed-regex `addRoute` 同步异常恢复场景。

## 验证

各命令的完整 stdout/stderr 与 `command`、`cwd`、时间和 `exitCode` JSON 均保存在本目录。最终源码版本的结果如下：

| 门禁 | 结果 | 证据 |
|---|---:|---|
| 目标测试 `pnpm exec vitest run tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts --maxWorkers=1 --reporter=dot` | 26/26 通过 | `green-sync-route-rollback.log`、`green-sync-route-rollback.result.json` |
| `pnpm run typecheck` | exit 0 | `typecheck-sync-restore.log`、`typecheck-sync-restore.result.json` |
| 定向 ESLint（两个修改文件） | exit 0 | `eslint-sync-restore.log`、`eslint-sync-restore.result.json` |
| `pnpm exec vitest run tests/runtime/auth-nav tests/auth-nav --maxWorkers=2 --reporter=dot` | 14 files、120 tests 通过 | `auth-nav-tests-sync-restore.log`、`auth-nav-tests-sync-restore.result.json` |
| 包内 `dynamic-auth-fallback.test.ts` | 3/3 通过 | `package-auth-fallback-sync-restore.log`、`package-auth-fallback-sync-restore.result.json` |
| `pnpm run verify:ai-codegen` | 971 files passed | `verify-ai-codegen-sync-restore.log`、`verify-ai-codegen-sync-restore.result.json` |
| `pnpm run verify:dirs` | directory limits ok | `verify-dirs-sync-restore.log`、`verify-dirs-sync-restore.result.json` |

### RED/GREEN 记录

- `red-concurrent-refresh-valid.log` 是首次有效异步 RED：1 项失败、13 项通过，旧请求覆盖新树；之前的 `red-concurrent-refresh.log` 因夹具缺少正式 `tool` 目标、在行为断言前失败，不计入有效 RED。
- `red-publication-behaviors.log` 展示旧请求竞争、半提交、fallback 和 host 丢失。该轮也暴露两处测试预期问题（401 register 原本应成功回退；平台 route name 预期拼错）；更正后 `green-fallback-contract.log` 为 23/23 通过。
- 主控补充同步异常要求后，`red-sync-route-rollback.log` 的两个新增场景都失败（baseline 被新树覆盖、preAuth 未生效），24 项其余通过；`green-sync-route-rollback.log` 最终 26/26 通过。
- `pnpm run typecheck` 曾在 `typecheck.log` 因新引入 nullable narrowing 报错，改为捕获本次事务对应的 preAuth 树引用后，立即目标测试通过，并由 `typecheck-sync-restore.log` exit 0。

## 边界与后续验收

- Vue Router 的同步异常已用真实 `createRouter({ history: createMemoryHistory(), routes: [] })` 复现：`addRoute({ path: '/foo/:id(', name: 'bad', component: {} })` 抛出 `ERR (2)/"id": Unfinished custom RegExp for param "id"`。提交快照恢复用例覆盖该路径。
- 快照按切片已知事实保存本类注册的平铺路由；本类生成记录没有 children、alias、redirect 或 beforeEnter 逻辑。若受管记录缺少 name 或 components，快照阶段会在提交前显式报错，不使用类型断言或兜底。
- 组合 build 与浏览器验收由主控负责，本执行层未运行。
