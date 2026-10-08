# C2c 实施记录

状态：冻结待主控复审

## 实施

完成原生 system-page per-instance pool、冻结 route snapshot、DynamicRouter实例接缝、真实 App RouterView/KeepAlive与tab生命周期、owner刷新/撤权、project reset/logout与single模式接线。home marker决定同path native owner中的不可关闭首页；cfg旧home路径与`pageId=home/dashboard`合同保留。reset/事务失败期间阻止旧native实例与假tab恢复。native不进入PageRuntime，也不参与cfg dirty/save保护。

复审修正包含：锁态路由导航明确error，真实TabBar/NavHeaderBar验证reset后tab/highlight清除；single模式真实App卸载inactive native；失败refresh保护合法缓存。测试`afterEach`回收所有App wrapper并恢复mock，避免失败断言污染后续用例。Pool `get`复用和`getById`均只返回`instanceId/componentName/view`，owner/key/fingerprint只保留内部entry；删除无消费者`values()`。

新增 malformed `/broken/:id(` commit测试，实际经过`commitNavigation`同步`addRoute`失败与rollback：未reset时既有native缓存保留；reset后同类commit失败仍locked，旧host重新导航不可恢复实例。该测试与保留的C2p1坏路径一致。

## 最新验证

- RED/GREEN局部：`commit-path-red.stdout.log`显示复用分支曾泄漏`fingerprint/key/owner`；malformed commit行为测试同时运行并通过。仅修复复用返回投影后，`commit-path-green`两项通过。
- focused Vitest：4 suites / 27 tests通过，exit 0。完整stdout和结果JSON：`final-focused.stdout.log`、`final-focused.result.json`。
- `pnpm run typecheck`：通过，exit 0；`final-typecheck.stdout.log`、`final-typecheck.result.json`。
- Pool scoped ESLint `--max-warnings=0`：通过，exit 0；`final-pool-lint.stdout.log`、`final-pool-lint.result.json`。
- 上轮首次复审RED的single计数受失败用例遗留wrapper污染，已由afterEach修复测试清理并在`review-red`报告中说明，不作为production RED。
- 未运行包级gates、根build或browser，等待主控复审。

11个批准源码/测试文件的最新SHA-256见`sha256-final.json`。C1–C2a既有改动保留；未commit、push或建分支。
