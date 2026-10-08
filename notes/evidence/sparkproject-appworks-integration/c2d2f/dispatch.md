状态：approved

# C2d2f 撤销跨入口的未提交应用选择

用户已授权主控裁决；依据本目录真实调查，批准此最小平台生命周期闭环。调查当前是描述现状的 characterization GREEN，不能当成修复通过。先将该用例改为所需不变量（外部 B 拒绝、URL/store/navOwner 都 A）运行有效 RED，再修生产。

## 选择与边界

应用选择唯一 owner 已是 LowcodePlatformApi.applicationSelectionIntent。新增 `cancelPendingApplicationSelection(): void`，只撤销还没有成功提交的选择，不清空/回滚已选应用，不撤销已成功提交的 receipt，不发请求。main 每次新的路由守卫入口调用它，使来自 App 服务等其它入口的旧在途选择也不能晚写 store。guard 的 AbortController 保留：它还控制自身平台提交后继续 refresh/redirect 的生命周期；两者职责不同。不要增加第三个全局路由选择事实源、代理 registry 或专用错误类型。

已提交的 receipt 必须在正常 caller router.push 后仍有效，不能将每次 route entry 都无条件递增平台 intent。平台需要区分当前选择正在等待与已提交；选择完成/失败时清除所属 pending 标记，旧操作结束不能清掉后起选择。登录/登出/目录选择继续保持原有共享意图行为。

本片证明未提交选择被后续路由撤销；不把它外推为 App outer service 所有提交后副作用的跨入口并发证明。普通同 app 路由和 query/hash 不能重新请求应用目录，只调用无 I/O 的撤销方法。

## 精确范围（5文件）

1. packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts：在现有 selection owner 内跟踪当前未提交选择，新增上述公开方法。select/activate 的成功、失败、非法输入出口均正确结清本次 pending；create receipt 成功意味着已提交。现有 signal/intent/session/app revision 不变量、无signal签名与返回合同保留。内部 helper 可以收束 cleanup，不另造公共 getter/type。
2. packages/spark-lowcode-api/src/platform/lowcode-platform-api.test.ts：未提交 list/root 可撤销且不保存；无 pending 与成功提交后撤销为 no-op、合法已提交 receipt 保持；先前失败/取消操作晚结束不能清掉后来的 pending选择。覆盖 select 与 activate 共享生命周期、目录/login/logout 原行为回归。
3. src/services/project/navigation/project-navigation-guard.ts：每次 resolve 入口、任何 public/sameapp分支返回之前，通过已存在 lowcodeApi.platform 调用撤销 pending。保留自身 abortcontroller 与现有时机，不直接操作 application store。
4. tests/runtime/auth-nav/application/project-navigation-guard.test.ts：仅补 lowcode 模块 test double 的此真实方法、必要入口行为断言；不以这层mock代替真实联合证明。
5. tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts：调查用例转实际期望的 RED/GREEN；保留真实 lowcode API/runtime/Guard/DynamicRouter。增加“已完成平台激活后正常router导航不使receipt失效”的联合用例，保护 UI caller 既有完成检查，不伪造 receipt。真实 outcome 的错误需捕获，不产生 unhandled reject。

不改 App、main、六caller、动态路由或 runtime wrapper；不增加包导出类型/依赖/后端修改。公共方法有 guard 真实消费者，放在已有拥有选择状态的类内。

## 验证与成本

一步 RED→最小平台改变→平台针对性GREEN→guard接线→调查用例GREEN。然后平台文件全量、runtime/guard/App切换/identity/navsync分组、root/package typecheck、五文件lint、ai-codegen/dirs。主控最终再做API包全量（本片确有变化）、组合root、完整build和生产浏览器。子代理不做全量或build，不重复旧RED，不加高代价的多线程全量。

先重读现文件，若 pending/commit 边界无法按这5文件内清晰实现则回报，不自己扩展设计。提供报告和5文件冻结hash；D1a继续未派。
