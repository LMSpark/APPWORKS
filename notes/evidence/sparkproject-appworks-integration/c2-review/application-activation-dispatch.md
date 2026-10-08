# 应用激活意图 fencing 候选派工

状态：draft（只读研究结论，未授权实现）

依赖：C2p1/C2p2 已处理导航读取/路由发布竞态；本切片只补应用激活和其调用方提交导航的边界，不改 C2c 正在实施的 11 个文件。

## 源码事实与竞态窗口

- `LowcodeApplicationStore` 是选中应用持久状态 owner：`revision` 在应用身份变化或 `clear()` 时递增；同应用只更新 navigationRootId 不递增。`LowcodeSessionStore.revision` 只在身份/enterprise 引用替换或 clear 时递增，token refresh 的 `performRefresh()` 以 spread 复用 `identity`、`enterprise` 引用，故正常 refresh 不增 revision。位置：`packages/spark-lowcode-api/src/platform/lowcode-application-store.ts:64-103`、`lowcode-session-store.ts:88-126`。
- 平台 API `selectApplication(application)` 在 `lowcode-platform-api.ts:436-439` 先 await `resolveNavigationRootId(application.id)`，然后同步 `application.save(...)`、返回 root id；它没有意图代次/提交前身份检查。`resolveNavigationRootId` 本身只返回唯一导航 root 或抛错，见 423-434 行。
- 应用层 `activateLowcodeApplication(id)` 在 `lowcode-runtime.ts:628-636` 先 await `listApplications()`、查找目标，再 await `selectApplication()`，最后返回 application。两个 await 之间没有选择意图检查。故仅在 `selectApplication` 里开始 generation 不够：较早 A 的 list 可以在较新 B 开始后才返回，再以“新” select 调用覆盖 B。
- 同一个 `LowcodeApplicationStore` revision 可检测激活期间发生的 `application.clear()`（目录/登出/登录）或其他已提交应用变化；`session.revision` 可检测 logout/login/session replacement。它们不能识别“B 已发起但尚未提交”，所以还需要在第一次 await 之前由激活 owner 开始的同步 intent。
- `enterLowcodeApplicationCatalog()` 在 runtime 同步调用 `application.clear()`；platform `login()` 在写新 session 前 clear application；`logout()` 在 finally clear application 和 session。以上 revision 变化可使正在等待的旧激活失效，无需让 token refresh 失效。

## 最小设计

意图 fence 放在负责整段应用选择编排的 `LowcodePlatformApi`，其 `activateApplication(applicationId)`（具体命名由主控裁决）在列目录之前同步递增内部 selection generation，并捕获 session/application revisions。它完成 list → 唯一应用匹配 → 导航 root 查询 → 提交 application context 的整个序列；每个 await 回来后、`application.save` 前均校验 generation 与捕获 revisions，失效时抛可区分的 stale-selection 错误，不保存旧 context。当前 `activateLowcodeApplication` 委托该方法并保留 `Promise<LowcodeApplication>` 返回合同。现有 `selectApplication(application)` 若仍对外保留，也必须进入同一 generation / revision fence；不能留一条未保护的提交入口。

`application.clear()` 无需改成阻塞/异步操作；它先同步增加 application revision，所以任何等候 list/root 的激活在下一个 await continuation 提交前会失效。新 activation 的 generation 在它的首个网络 await 前增加，能挡住“旧 list 后返”。refresh 仅改变 token 和过期时间，store revisions 对其稳定，因此不误伤已发起的选择。真正当前 list/root 请求失败保持原错误向调用者传播；只有确认 generation/revision 已变化时才归类 stale，不能将仍当前的网络失败改写成取消或吞掉。

应用提交完成后仍存在调用方窗口：`App.vue` 的 `switchAndReload` 继续 await 导航刷新，主路由 guard 也继续 await `refreshRoutes`；这段时间可启动另一切换。选中 app store 的 committed revision/generation 要么作为操作结果可让调用方校验，要么由两个 caller owner 各自持有 switch/guard intent，并在每个异步边界后检查。无论采用哪种接缝，旧调用方必须在更新壳状态/返回 success/`router.push` 前拒绝 stale。main beforeEach 内 A、B 两个跨应用导航也要在 await 激活和 await 刷新后确认仍是最新 guard intent；失效返回取消当前导航，稳定网络错误仍显式交给 Router error 流程。

`App.vue.switchAndReload` 目前先 `assertPageRuntimesClean()`，再 `resetSystemPageInstances()`，再选择应用；dirty 检查已在 reset 前。该顺序必须保持，dirty 拒绝时不能清缓存、清 system-page owner 或更换 app。当前它在选择/清理/设置 activeProject 后 catch `reloadNavigation()` 错误只 log 并正常 resolve；必须改为向调用方 reject，并保留当时失败状态供 UI 说明，不能报告成功。C2c dirty/native 规则保持不变。

## 实际调用方及需要封住的位置

| 调用方 | 现状与必要 fence |
| --- | --- |
| `src/main.ts:384-385` 启动 URL 预同步 | 在 SparkApp.start 前 await 激活；失败会中止 startup。无并发 UI 切换窗口；应用 store/session revisions 仍需挡 401/logout/session replacement。 |
| `src/main.ts:490-492` auth `beforeEach` 跨 app URL | await 激活、清理 cfg runtime、await refreshRoutes 后返回原 URL。按 guard 调用序号 fence 两个 await 后的提交/返回，旧 guard 返回取消；当前 activation/refresh 错误不得转换成目标重定向成功。dirty check 先于 reset 的顺序固定。 |
| `src/App.vue:379-398` `switchAndReload` | shell 级同步 app/cache/nav 操作 owner；保持 cfg clean 拒绝在任何 reset 前；引入单调 switch intent，过时阶段不能清理/设置 activeProject/app settings/resolve 成功。reload 错误必须 reject。目录切换的 `clear()` 也使旧激活失效。 |
| `src/App.vue:422-424` home action | 先切目录，切换完成后再 push `/app-list`；处理 switch rejection，不能无声成功/未处理 rejection。 |
| `src/App.vue:679-680` cross-app navigation | await switch 后 push target path；stale/reload failure 必须阻止旧路径 push，并保持错误可见。 |
| `src/views/tenant/AppList.vue:182-187` | await switch 后 toast success、push app home；现无 catch。改为仅当前成功才提示/导航，错误显式显示。 |
| `src/views/platform/PlatformApps.vue:193-210` | 已 catch switch/navigation 错误并显示失败；仍依 shell stale rejection 确保旧调用不进入 push。 |
| `src/views/platform/PlatformTenantManagement.vue:311-318` | await switch 后 push；现无 catch。失败需显示，不能导航。 |
| `src/layout/AppTabBar.vue:66-83` | route 跨项目时 await switch 后 router.push；`perform()` 已捕获并显示错误；switch 拒绝应阻止旧 tab URL。 |
| `src/services/project/project-shell.ts:17-23` | 目前只向调用方暴露 `Promise<void>`；必须改为可在调用方恢复后同步断言当前性的 owner 签发 receipt，或改成由 owner 同步执行路由提交。仅保证最新 `switchAndReload` 才 resolve 不足。 |

关键微任务竞态：A 的 `switchAndReload` 完成最后一次 `isCurrent()`，随后 promise resolve；在调用者 `await` continuation 前排队的 `queueMicrotask` 启动 B 并更新 switch intent；A caller continuation仍会执行旧 `toast.success/router.push`。因此 callee final-check 与 caller side effect 不是原子操作。所有会在 await 后产生外部成功副作用的调用者都必须在恢复后重新向同一 owner 验证同一个 receipt；或消除这条外部 side effect，由 owner 在最终同步 fence 后发起 router 导航。promise 的 resolve/reject 状态本身不构成 receipt。

两个最小接缝供主控裁决：

1. **同步 receipt 校验（建议优先）**：`ProjectSwitchService.switchAndReload` 返回只读 `ProjectSwitchReceipt`（可用闭包 `assertCurrent()`，不暴露可伪造数字）；receipt 捕获 App.vue 的 switch intent 和提交后 app/session identity。每个调用方 `await` 后、成功提示或 `router.push` 前同步调用 `receipt.assertCurrent()`。需改 `project-shell.ts` 返回合同、App.vue service、AppList/PlatformApps/PlatformTenantManagement/AppTabBar、App.vue home/cross-app consumers；并在每个调用方 await 恢复后、成功 toast 与 push 前校验 receipt。若希望 receipt 同时验证 selection owner 提交身份，receipt 由 switch owner基于 selection返回事实创建，不用 caller 自行读 localStorage 拼身份。
2. **owner 内提交导航**：将目标 route 交给 `switchAndNavigate(projectId, route)`（或等价 shell API）；owner 执行 activation/reload，最后一次同步 current-check 后立即调用 `router.push`，由 owner持有所有旧 URL side effect。需改 project-shell/App.vue 和所有调用者，让它们不再 `await switchAndReload(); router.push(...)`；减少 receipt consumer 检查，但把 Router 导航责任并入 App 壳，接口/测试面更大。跨应用 tab、home、AppList、PlatformApps、Tenant management 和 useNavigation path 均须映射成相同目标路由；不能留旧入口。

两方案均须保留 main `beforeEach` 自身的 guard intent fence；它不是 `ProjectSwitchService` caller。其 redirect 由 Router guard返回，必须在 guard恢复后检查同一 guard intent。平台/store fence解决旧请求提交，receipt/owner导航解决提交之后旧调用者 side effect，二者不能互相替代。

**必需 deferred + `queueMicrotask` 行为测试**：用真实 switch owner和真实 consumer continuation（不能只测一个序号 helper）：启动 A，放行 A 完成刷新并到最后同步检查；在 A resolve 后、调用者 await continuation 执行前 queueMicrotask 启动 B；验证 A receipt 在恢复后报 stale，AppList/PlatformApps/Tenant/AppTabBar/home/cross-app 中被覆盖的消费者不显示成功、不 push A URL。第二例保持 B 未发生，A resolve 后 consumer receipt 校验通过并只 push 一次。owner 内导航方案则在同一时序确认 A 的最终 check 与 push 前没有 await 点，B开始后的旧请求不能push A。测试必须验证 Router 调用/mock路径和 toast副作用本身，才能证明闭环。

## 精确最小文件与测试候选

1. `packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts`：整段选择 intent、revision capture/check、最后一次同步 commit；保留 `selectApplication` 的 fence 或让它委托共同 fenced helper。
2. `packages/spark-lowcode-api/src/platform/lowcode-platform-api.test.ts`：新增 deferred HTTP/API 行为测例：旧 A list 晚回而 B 已发起时 A 不得进入 root/save；A root 晚成功和晚失败都不得覆盖 B/已 clear；session 替换/登出失效；当前 list/root 错误透传并保留已选 app；同身份 token refresh 不使 intent 失效；正常单次选择提交应用+root。
3. `src/lowcode/lowcode-runtime.ts`：`activateLowcodeApplication` 委托包层完整选择，不在其外另开未经 owner 校验的 list/select 序列；保留返回 application 的调用合同。
4. `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` 或新 `tests/runtime/auth-nav/application-activation.test.ts`：验证 runtime 转发目标、无效/无权目标失败，不假设选择成功；与平台 API 的真实 deferred tests 分层，避免只 mock activation 导致漏掉 fence。
5. `src/App.vue`：shell switch intent、dirty-before-reset 原序、每次 await 后的 owner 检查；reload failure reject；home/cross-app caller 处理失败和 stale。
6. `src/main.ts`：跨 app guard 入口序号与 await 后检查，stale navigation 取消；startup 预同步当前错误维持启动失败。
7. `src/views/tenant/AppList.vue`、`src/views/platform/PlatformTenantManagement.vue`：补 switch 失败反馈，确保 stale 不提示成功/不 push。`PlatformApps.vue`、`AppTabBar.vue` 已有 catch，先由 shell rejection 行为测试覆盖即可。
8. 最小 caller tests：新增 `tests/app/application-switch.test.ts`（或项目现有 App harness 对应文件）验证 dirty 拒绝发生时 DynamicRouter reset/dispose/activation 均未调用；switch 在提交前因新 intent 失效时 reject；若它已 resolve receipt，在 caller continuation 执行前用 `queueMicrotask` 启动 B，旧 receipt 校验必须 stale，consumer 不得 toast/push；reload 当前失败透传。增加 main guard 既有 `tests/runtime/auth-nav/navigation-platform-paths.test.ts` 的真实 guard 测例：并发 guard A/B 时 A 不返回旧 URL redirect；稳定失败进入 router error 而非误报切换成功。若现有测试 harness 无法驱动 App/main 集成，先由主控裁决新增 harness，不能退化为只测序号 helper。

## 不做项与验证边界

本轮只读研究不改 C2c 当前 11 文件；后续实施候选若需触及 App.vue/main.ts，须待 C2c 冻结验收后作为独立授权切片执行，不与 C2c 并行写入。不改 DataSpace 查询/导航刷新代次机制、不改 token refresh 策略、不添加重试、不吞 backend errors、不引入通用全局错误 handler、不重新安排 tenant/session 认证流程。保留 `LowcodePlatformApi.selectApplication` 当前 `Promise<string>` 返回导航根语义（若添加整段激活门面，返回 app 只供 runtime wrapper 使用）。

实施验收先跑各 deferred 最小 RED/GREEN，再运行 platform-api + lowcode-runtime-navigation + App/main caller focused tests 和相关 typecheck/lint；全量 test/build/browser 由主控决定。当前阶段没有代码实现或用户编码授权。

## 尚待主控裁决

- 新平台门面是否接受新增 `activateApplicationById(id)`（把首个 list await 纳入唯一 owner），还是选择 store-issued intent token 并传过 runtime→platform API。安全要求相同：新意图须在首次 await 之前登记，旧 list/root 成功或失败不得提交。
- receipt 校验还是 owner 内导航由主控选定。receipt 方案必须覆盖每个 await 后成功 toast/push 的 consumer continuation，不能只检查内部 switch。
- main router guard stale 应返回 `false` 还是保留 Router 的取消导航返回；要求是阻止过期 URL 跳转且不吞当前错误，具体返回值按现有 router 行为测试确定。


