# C2d2c preflight review（只读）

结论：三文件切片能覆盖当前 main 的两个切应用入口，但需要把以下源代码边界变成明确的行为验收。此文件只复核，不改生产/测试代码，不代表 C2d2c 已实现或已验收。

## 源码核实与缺口

- `src/main.ts` 的启动 URL 预同步位于 `SparkApp.start()` 之前；应用路径用 `await activateLowcodeApplication()`，目录路径同步调用 `enterLowcodeApplicationCatalog()`。前者内部已对平台 receipt 调 `assertCurrent()`，后者返回 receipt。C2d2c 必须在启动继续到 `SparkApp.start()` 前对两种返回凭据都再做显式当前性验证；启动失败仍由 `startApp` catch 进入既有 `mountStartupError`。
- 守卫实际注册顺序是 `packages/spark-app/src/app/bootstrap.ts` 先调 `setupRouterGuards()`，再执行 `main.ts` 的 `beforeMount`，因此 SPARK 权限 `beforeEach` 先于 main 的租户/认证守卫。C2d2c 替换 main 守卫时应保持在原 `beforeMount` 接线位置；不能提前到动态路由注册之前或改写权限守卫。系统页身份解析在 `beforeResolve`，排在这些 `beforeEach` 之后。启动时 `beforeMount` 结束后才 `router.isReady()` 并 mount。
- `setupRouterGuards()` 已安装 `router.onError()`，当前会记录原始路由错误；main 没有另一个错误处理器。跨应用选择、导航刷新当前失败应继续以原错误拒绝并进入该错误通道；不要将错误吞成 `false` 或替换成泛化错误。启动预同步错误仍由启动 fallback 处理，不能误按运行期路由错误处理。
- `enterLowcodeApplicationCatalog()` 会返回平台签发 receipt；catalog 的身份在 `principal.applicationId === null` 时仍是 null，路径 sentinel 才是 `/t/{tenant}/homepage`。当前守卫以 `applicationId ?? APPLICATION_CATALOG_PROJECT_ID` 比较 URL；保持“执行身份 null、URL sentinel homepage”两层语义，不要把 `homepage` 写成已选应用 ID。验收需覆盖启动在目录 URL、目录切回应用、以及已是目录时同应用路径不重复激活/刷新。
- 每次守卫入口都必须同步递增 owner 序号，包括同 app 的路径、query 或 hash 导航，以及会立即返回的 public/platform 分支。当前跨 app A 等待选择或 `refreshRoutes()` 时，同 app B 的新 query/hash 导航必须使 A 在每个 await 恢复点停止；B 的 `currentRoute`、query、hash 保持最终值，A 不得 dispose/refresh 后再 redirect。仅在跨 app 分支递增会漏掉此竞争。
- 对 stale 失败也需在行为测试中界定：若 A 的选择/刷新在 B 已成为最新守卫后拒绝，不能让 A 覆盖或取消 B 已完成的导航；若失败属于仍最新的守卫，则须保留同一个错误对象进入 `router.onError`。当前派工明确“过时守卫返回 false、当前错误原样传播”，实现和测试应将这两条区分，而不能用无条件 catch 吞错误。
- 原守卫合同包括：未登录 tenant/platform 路径回 public home、public path 放行；登录后 public utility 保留直达、platform 和非 tenant path 回当前 home；租户不匹配时改当前 tenant 但保留 query/hash；current scope 不重复切换；dirty 检查先于 native reset/应用选择；成功切域 refresh 后按原 `to.path/query/hash` replace。建议以这些现有分支逐项断言，而不是只测跨 app happy path。

## 最小验收补充

1. 新 `ProjectNavigationGuard` 的真实 MemoryRouter 测试保留上述路由分支与顺序；至少加入“跨 app A 的 refresh deferred，同 app B 的不同 query/hash 完成，再释放 A”的实际竞争，并断言 A 不再 redirect、B 的 query/hash 精确留存。另测同 path 不同 query，以证明守卫序号每次入口递增。
2. 分别覆盖跨 app A 等待 activate 和等待 refresh 时，B 成为最新守卫；A 晚成功不再执行后续副作用。dirty 拒绝时断言 reset、选择和 refresh 均未调用。
3. 当前守卫中的 activate / refresh 拒绝时，断言 `router.onError` 接到原错误对象；stale 守卫错误不能改变较新成功导航。catalog 的同步 receipt 也必须被校验，catalog 与应用切换均只在有效 receipt 下刷新并恢复原 query/hash。
4. 明确启动预同步的 catalog receipt 当前不是被消费的值；对主应用选择和 catalog 两支做最小测试/可测试接线，证明 receipt 过时不会进入 `SparkApp.start()`。不要把启动 fallback 与运行期 `router.onError` 混为一条断言。

当前相关测试中，`tests/runtime/auth-nav/navigation-platform-paths.test.ts` 验证导航 composable/marker 行为，不是 main 认证守卫；`tests/runtime/auth-nav/auth-state-guard.test.ts` 只验证会话存在性；`tests/runtime/auth-nav/tenant-scope.test.ts` 覆盖路径辅助函数。此次范围新增的 `tests/runtime/auth-nav/application/project-navigation-guard.test.ts` 是 main 守卫分支与并发合同的直接验收点，不能由这些既有测试替代。
