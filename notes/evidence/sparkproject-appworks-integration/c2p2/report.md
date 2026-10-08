# C2p2 执行身份快照闭环报告

## 结果

`readLowcodeRuntimeNavigation` 现在把本次请求的 `readRequestScope().token` 和当前 `navigationRootId` 作为执行快照。目录、导航根和两路蓝图/授权读取的 helper 会在请求成功或失败后检查快照；各外层 `await` 恢复后立即再次检查，最终组装前也检查一次。scope 已变化时抛 `SPARK_EXECUTION_SCOPE_STALE`，阻止后续读取、旧结果组装和旧错误覆盖；scope 稳定时保留原请求错误。

catalog 无选中应用时仍本地早返回，不调用 `readRequestScope`。显式目标应用 B 仍与选中执行应用 A 分离；稳定情况下 records、authorization 使用 B，且不改变 A。测试覆盖 session 重置、A→B→A、同应用导航根变化、目标解析等待、身份 token refresh、稳定请求错误与 catalog 快路径。

## TDD 与门禁

所有命令均在 `D:\SPARK_AppWorks` 执行。每个 `.result.json` 保存命令、cwd、开始/结束时间、exit code 与对应日志文件名；日志保存工具实际输出。首次 RED 和边界 RED 是预期的失败验证。

| 阶段 | 命令 | 结果 | 证据 |
|---|---|---:|---|
| 初始 RED | `pnpm exec vitest run tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts --maxWorkers=1 --reporter=dot` | exit 1；旧实现对切应用用例返回已装配的 APP-A 导航，而非 stale 错误 | `focused-red.log`, `focused-red.result.json` |
| 初始 GREEN | 同上 | exit 0；9 tests passed | `focused-green.log`, `focused-green.result.json` |
| 扩展测试 GREEN | 同上 | exit 0；18 tests passed | `focused-green-final.log`, `focused-green-final.result.json` |
| 微任务边界 RED | 同上 | exit 1；两用例均失败：目录返回后仍发起根查询；并行读取结束后仍组装旧 APP-A 导航 | `boundary-red.log`, `boundary-red.result.json` |
| 可复现的外层边界 RED | 同上（临时移除目录 await 后与 Promise.all 后的外层复核） | exit 1；不依赖 store getter 调用计数，分别观测到越过失效边界的后续根查询和旧导航返回 | `boundary-red-without-outer-checks.log`, `boundary-red-without-outer-checks.result.json` |
| 微任务边界 GREEN | 同上 | exit 0；20 tests passed | `boundary-green.log`, `boundary-green.result.json` |
| 测试稳定性 GREEN | 同上 | exit 0；20 tests passed；边界测试改为 deferred resolve 后 queueMicrotask 切域 | `focused-final-after-test-hardening.log`, `focused-final-after-test-hardening.result.json` |
| 类型检查 | `pnpm run typecheck` | exit 0 | `typecheck-final.log`, `typecheck-final.result.json` |
| 两文件 ESLint | `pnpm exec eslint src/lowcode/lowcode-runtime.ts tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` | exit 0，无输出 | `eslint-final.log`, `eslint-final.result.json` |
| 测试稳定性 ESLint | 同上 | exit 0，无输出 | `eslint-after-test-hardening.log`, `eslint-after-test-hardening.result.json` |
| auth-nav 回归 | `pnpm exec vitest run tests/runtime/auth-nav tests/auth-nav --maxWorkers=2 --reporter=dot` | exit 0；14 files、132 tests passed | `auth-nav-regression-final.log`, `auth-nav-regression-final.result.json` |
| AI 代码规则 | `pnpm run verify:ai-codegen` | exit 0；971 files checked | `verify-ai-codegen-final.log`, `verify-ai-codegen-final.result.json` |
| 目录限制 | `pnpm run verify:dirs` | exit 0；directory limits ok | `verify-dirs-final.log`, `verify-dirs-final.result.json` |

边界 RED/GREEN 后，依据主控预审进一步移除了测试对 `application.get` 调用次数的依赖。新的 RED 明确在临时删除外层 await 复核时失败，恢复已审生产检查后 20 项测试通过。

另有一次仅由 PowerShell 参数 splatting 引发的门禁启动错误：`pnpm @array` 把 `run` 误作 recursive exec 命令，exit 1，未运行 typecheck。原始输出和结果留在 `typecheck.log` 与 `typecheck.result.json`；之后使用明确命令 `pnpm run typecheck` 重跑并通过。该启动错误不计入代码门禁结果。

## 修改范围

- `src/lowcode/lowcode-runtime.ts`：仅调整 `readLowcodeRuntimeNavigation` 的执行域快照和异步边界核对。
- `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts`：真实 lowcode stores、spy 与 deferred 请求覆盖身份/应用切换时序。

未运行全量 build；按派工由主控执行组合 build 与浏览器验收。生产源码已冻结。
