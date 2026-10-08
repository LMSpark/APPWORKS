# C2p1：导航刷新发布隔离

主计划 `notes/plan-appworks-control-plane-integration.md` 已 implementing。用户授权低阶模型执行、主控验收与长期利益决策。本任务只改：

1. `packages/spark-app/src/router/dynamic.ts`
2. `tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts`

另可写本目录日志/report。禁止改其他源码、依赖/配置/门禁，不提交、不建分支、不派子代理。原 C1 已验收冻结。实现前完整重读这两个文件及下面只读消费面。

## 事实与约束

DynamicRouter.registerRoutes 先 await 主树再直接写全局，平台树后读；refresh 一开始 clear registeredRoutes，旧/新调用共享集合；旧调用成功和 catch fallback 可覆盖新树。getNavTree 使用 _tenantNavTree/_platformNavTree，单写 _navTree=preAuth 不能保证真回退。registerCrossProjectRefHostRoute 的 existing 分支早 return，refresh 清集合后遗漏 host，使清理误删。

只读：`packages/spark-app/src/router/__tests__/dynamic-auth-fallback.test.ts`、`src/services/project/project-shell.ts`（reloadAndSyncNavigation 会同步 refresh 返回树）、`packages/spark-app/src/navigation/nav-access.ts`、`src/main.ts` 的 register/refresh 消费、`packages/spark-app/src/router/page-runtime-pool.ts`。保持 config runtime、dirty、路由命名、ref/iframe、公有 API/返回类型和按需组件加载。

## 最小方案

- 实例私有单调 registration generation，首次 register 与 refresh 共用同一局部 staging→同步 commit 路径，不在等待期间改任何树/路由集合。
- 等待主导航及启用的平台导航之后，只由最新代次提交。**不要 await/import 任何页面组件**。没有 resolveComponents 需求。
- commit 时捕获当前已注册路径，重新注册目标树的新路由与全局树状态，之后移除不再存在的旧路径；所有提交同步完成。跨引用 host 复用时也记入本代注册集合。保留 cfg runtime 实例，不清池。
- 旧成功绝不提交其 nav；旧 refresh 仅返回当前已提交树（允许最新仍 pending 时返回现有树，不能发布旧请求带回的新结果）。旧失败向该 caller 原样 reject，不 fallback，不清理，不动全局；既有调用方按失败处理，不同步其旧树。
- 最新 401 且有 preAuth：成功回退 preAuth。最新 refresh 一般失败：回退 preAuth 并 rethrow。最新 register 一般失败：保留现有显式 throw 合同。回退提交必须将 tenant/platform 清空并移除旧授权路由，getNavTree 实际返回 preAuth；无 preAuth 的一般失败保留已提交树并抛出，不能产生半套新树。
- 原方法可做必要私有拆分，删除被替代的 loadAndRegister* 仅为完成此闭环；不顺手清格式、WeakMap 或无关规则。不新增导出、泛型框架、interface/断言。

## RED/GREEN 和门禁

先同一真实 memory router + deferred loaders 增加行为用例，立即运行该测试文件保存有效 RED。覆写需在当前文件完成，测试断言行为不是内部函数名：

1. 已有基线 C，刷新 A/B，先 B 完成再 A 成功：树、route metadata/path 和 registered 清理仅是 B，无 A 残留；旧 refresh 返回 B。
2. A 的旧 401 / 一般错误晚于 B 成功：拒绝但不出现 preAuth，不移除/覆盖 B。
3. A 成功而 B 仍 pending：不发布 A，B 后完成才发布 B。
4. 首次 register pending 时另一次 refresh 胜出，首次旧结果不覆盖。
5. 主导航完成但平台读取 pending 时不发布半套；平台旧结果不得覆盖新树。
6. 当前 401 / 非401 refresh 失败的 fallback 合同，getNavTree 真是 preAuth，旧授权路由不存留；跨引用 host 在顺序 refresh 后仍存在。

可以复用本文件 fixture，不新增无消费者公共 helper。不要清空测试质量来凑 GREEN。生产首改后立即最小测试，失败收敛当前闭环。

完成依次执行：

```powershell
pnpm exec vitest run tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts --maxWorkers=1 --reporter=dot
pnpm run typecheck
pnpm exec eslint packages/spark-app/src/router/dynamic.ts tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts
pnpm exec vitest run tests/runtime/auth-nav tests/auth-nav --maxWorkers=2 --reporter=dot
```

包目录 `packages/spark-app`：`pnpm exec vitest run src/router/__tests__/dynamic-auth-fallback.test.ts --maxWorkers=1 --reporter=dot`。
根目录 `pnpm run verify:ai-codegen`、`pnpm run verify:dirs`。

命令原始输出重定向本目录，并保存 command/cwd/time/exitCode JSON；不要只有摘要。主控负责组合 build/browser，无需重复。源码冻结后报告实际 diff、用例数、失败迭代与限界。如需超范围立即报告主控，勿自行扩大。

## 主控审查补充：同步路由注册异常也要闭合

真实 Vue Router 对 `/foo/:id(` 会在 addRoute 同步抛错，已由执行者复现。不能把 commit 放在异常控制之外，也不能只对网络失败证明“无半套”。精确文件不变，增加该路径的有效 RED。

执行选择：在 commit 前保存上一已提交的私有树引用、已注册路径集合，以及这些受管平铺路由的可重注册快照；这些路由均由本类建立，当前没有 children/alias/redirect/beforeEnter 业务逻辑，快照须保留实际 name/path/components/props/meta（阅读 Vue Router 类型收窄，禁断言/any）。不要重新加载/深拷贝 cfg runtime 或业务组件，不创建第二路由器，不预载页面。

若同步 commit 抛错，先移除本次已添加的受管路由，恢复旧受管路由、追踪集合和树引用，再向外抛原错误。只处理本类受管路由，外部静态路由不受影响。外层 latest refresh 的既有 preAuth fallback 在恢复后执行，才能完整移除旧授权路由；latest register 无 fallback 保留恢复后的旧状态。完整回滚不新增可失败异步步骤。若 Vue Router Raw/Normalized 类型无法用已知字段合法恢复，则停止报告，不能加类型断言兜底。

补验证：已有 baseline 和静态外部路由；新树先含合法 new-page 再含不完整正则的坏路由。无 preAuth 的 register/refresh 失败后，baseline route（含 props/meta/component）完整保留、new-page 不残留、外部静态路由仍在；有 preAuth 的 latest refresh 同步失败后只有预认证受管树，旧与新授权路由均消失，原错误 reject。其余 async latest 竞态和 cfg runtime 不变。
