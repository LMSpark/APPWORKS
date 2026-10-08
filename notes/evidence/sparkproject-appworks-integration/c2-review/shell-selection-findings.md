# C2d2 shell selection findings

状态：findings（只读复核；不含实现授权）

## 1. 同一个当前性事实：selection owner receipt 是必要底座，shell/guard 各有局部序号

C2d1 `dispatch.md` 已裁决平台 `activateApplication(id)` 从首个 await 前启动 selection intent，并返回可同步 `assertCurrent()` 的 app/root receipt；但它同时规定 `activateLowcodeApplication()` 仍返回 `Promise<LowcodeApplication>`、消费后丢掉 receipt。按现有调用路径，这不足以供 `App.vue` / `main.ts` 在后续 awaits 后检查。C2d2 必须修改 runtime wrapper 的返回合同（当前调用方都只 await、不消费返回值），把平台 receipt 传给壳层。未触发 activation 的同应用 URL guard 当前没有异步等待或后续提交副作用，不需要额外平台 current-receipt getter；其进入时增加的 guard 序号足以使正在等待的旧跨应用 A guard 失效。

目录意图不能只用 `application.clear()`：它会同步增加 application revision，足以让旧 activation 的捕获 revision 失效；但不会增加平台 selection intent。要让目录操作也有可传递 receipt，并使它能被其后的 B intent 在 B 尚未 save 时立刻失效，须由平台同一 owner 提供同步目录选择方法（例如 `enterApplicationCatalog()`）：先启动新 selection intent，再 clear app，签发 catalog receipt。若 B 是应用激活，平台在 B 第一个 await 前增加 generation，A 的 app receipt 与 catalog receipt 都立即 stale；不需要等 B 写 application store。单靠提交后的 application revision 比较会漏掉“B 已开始但尚未提交”。

当前 `LowcodeApplicationStore.revision` 确实在 `clear()` 增长，且换 app/enterprise 时增长；同 app navigationRootId 变化不增长（`lowcode-application-store.ts:64-103`），所以平台 receipt 还需按 C2d1 裁决校验 committed application id/root。`LowcodeSessionStore.revision` 对 `performRefresh()` spread 且复用 identity/enterprise 的普通 token refresh 稳定（`lowcode-session-store.ts:88-126`），不应改用 access token 字符串 fence。

最小身份链：平台 owner 的一个 activation/catalog intent generation + 捕获 session/application revision + committed id/root；`activateLowcodeApplication` 和 `enterLowcodeApplicationCatalog` 传递 owner receipt；App shell 自己的 switch intent 只负责它之后的壳副作用；main guard 每次进入增加自身 guard intent。平台 receipt 与调用者局部意图互补，不能只留其中一种。

## 2. refresh await 后的提交点

- `src/services/project/project-shell.ts:138-141`：`reloadAndSyncNavigation()` 在 `await refreshRoutes()` 后立刻 `syncCommittedNavigation(navTree)`。切应用调用必须在这一恢复点、壳投影之前 `assertCurrent`；建议把 assertion 作为可选调用参数传入，切换路径提供 receipt，现有手动无参数调用维持行为/合同。只在 `App.vue` wrapper await 后校验太晚，因为此处已投影。
- `src/App.vue:379-398`：`switchAndReload` 在激活返回后会 dispose runtime、写 `activeProjectId`/settings，再 await `reloadNavigation()`。激活 await 后先校验 selection receipt，再允许这些副作用；reload 后再校验 switch intent+receipt，才允许成功 resolve。现在 `reloadNavigation():Promise<void>`（566-568）仅 await `reloadAndSyncNavigation`，真正导航投影在上述 project-shell 内；不要把 fence 加到所有手动刷新路径。
- `src/main.ts:460-495`：guard 在 `await activateLowcodeApplication` 后 dispose/refresh，在 `await refreshRoutes()` 后返回 redirect。前一恢复点校验 selection receipt+guard序号，后一恢复点再校验，两处过期都 `return false`。startup URL 预同步 384-385 没有 Router redirect caller，但仍依平台 activation receipt 拒绝已过时提交。

候选切片必须显式包含 `src/services/project/project-shell.ts`、`src/App.vue`、`src/main.ts` 及相关调用者/测试。C2d1 四文件当前进行中；C2d2 写入应等其冻结验收后单独实施。

## 3. Router guard：同 app B 仍能让 A 过期

A 激活 app B 后在刷新导航时 await；此时 B 导航进入同一个已提交 app B。`main.ts` 的 `urlScope.projectId !== projectId` 条件为 false，B 不会再调用 activation，因此平台 app receipt 仍可能有效；A 若只检查 selection receipt，仍可返回旧 `{path:to.path, query, hash, replace:true}`。必须在 auth `beforeEach` 一进入就递增 guard invocation 序号；A 在每个 await 恢复后检查“本次仍是最新 guard”并校验 owner receipt。仅比较 `to.path` 不够：同路径但 query/hash 不同的导航也有不同意图。

过期 A 返回 `false` 取消 A 自己的导航；不要返回旧 redirect、吞掉当前网络错误或取消较新的 B。Vue Router 对并发导航有单独 navigation 状态（本仓锁定 `vue-router@5.1.0`）；当前测试可用 `createMemoryHistory/createRouter` 实际驱动 guard，应证明旧 guard false 后 B 仍到达目标、A 不重定向。真实行为测试放入现有 `tests/runtime/auth-nav/navigation-platform-paths.test.ts` 或同目录新 guard test；不以手写 `to.path` 比较替代 Router 验收。本轮未运行测试，故这项是明确的实现验证要求。

## 4. await 后调用方副作用必须在 receipt 校验之后

- `AppList.vue:182-187`：切换后 `ElMessage.success` 和 push；当前无 catch。校验 receipt 后才 toast/push，catch 显示错误。
- `PlatformApps.vue:193-210`：已有 catch，但切换 await 后仍要校验 receipt 再 push；失败继续显示。
- `PlatformTenantManagement.vue:311-318`：切换后 push、当前无 catch；校验后 push，并显示 rejection。
- `AppTabBar.vue:66-83`：跨 app 切换后 push；`perform()` 已统一 catch。校验 receipt 后 push，stale 交既有可见 error。
- `App.vue:422-424` home 与 679-680 cross-app：then/await 后 push，home 当前无 catch；检查 receipt 后再导航，catch 显式显示/记录可见错误。
- `main.ts` 不用 shell receipt 代替 guard fence；用 owner receipt+guard 序号在 await 激活/refresh 两处校验。

单次 await 后的同步顺序必须是 `receipt.assertCurrent()` → success toast/同步调用 router.push；两步之间不能再 await。若 side effect 前还有别的 await，就在最后一个 await 之后重新断言。callee 最新时 resolve 不够，B 可在 callee final-check 后、caller await continuation 前的微任务启动。

## 5. 最小 deferred 行为闭环

1. **owner**：在 `packages/spark-lowcode-api/src/platform/lowcode-platform-api.test.ts` 用 deferred list/root 覆盖 A→B，旧成功/失败不能 save；B intent 未 save 前 A receipt 已 stale；catalog clear 形成新 owner receipt、旧 receipt 立即 stale；session replace/logout 失效、token refresh 不失效。runtime wrapper 测试在 `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` 断言 receipt 传递（不能只断言返回 application）。
2. **shell caller**：复用 `tests/runtime/page/runtime/system-page-identity-tabs.test.ts` 的 `mountApp`、真实 `App.vue`、`createMemoryHistory/createRouter`、DynamicRouter 与注入的 `ProjectSwitchService` harness；该测试多数场景 stub 了 AppTabBar/NavHeaderBar，C2d2 consumer 测试应保留真实 Router、按需不 stub 真实 AppTabBar/NavHeaderBar，并 mock/defer 导航刷新。A 通过内部最终 fence，resolve receipt；排一个 `queueMicrotask` 启动 B，再恢复 A caller continuation；断言 A receipt check 失败，不 toast、不 push，B 成功路径仅 push B。另测 dirty 拒绝时 assertPageRuntimesClean 先于 reset，reload 当前错误 visible/reject。`project-shell.ts` 的可选 assertion 测试：手动无参 reload 行为不变；带 receipt 的 refresh 晚回时不 sync 旧 nav。
3. **main guard**：真实 createMemoryHistory Router，A guard defer 在 refresh；B 进入相同 store app（所以不触发 activation），先完成；A 恢复后 false，B route 保持、旧 A redirect 不运行。再覆盖 stale activation；当前网络错误仍进入 Router error 流程。

三段逐一通过只能报告对应闭环完成；owner+shell 不等于 main guard完成，不能提前宣称端到端应用切换安全。

