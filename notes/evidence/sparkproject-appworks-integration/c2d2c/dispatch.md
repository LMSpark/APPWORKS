状态：superseded

# C2d2c 直接URL导航守卫

前置C2d2b已通过主控源码/哈希/52项局部回归验收，主控现批准。此预案只收敛main内直接URL切应用的异步副作用，复用已有选择receipt；不新增平台错误类型或current-receipt getter。

## 影响范围（3文件）

1. src/main.ts：把当前认证beforeEach交给实际guard owner，启动URL预同步也消费返回receipt。
2. 新建 src/services/project/navigation/project-navigation-guard.ts：ProjectNavigationGuard 持有每Router安装实例的调用序号，承接现有认证分支和切应用流程。
3. 新建 tests/runtime/auth-nav/application/project-navigation-guard.test.ts：真实Memory Router驱动真实guard。

新增owner用于保存守卫调用序号并直接供main消费，使真实路由行为可验证；不为了测试导出main内部函数，不模拟main代码字符串，不启动完整主应用来搭巨型mock。src/services根已7目录，归入既有project/navigation子领域。类路径ProjectNavigation→project/navigation。

## 原合同与接线

完整阅读main现有beforeEach、startup、isPlatformWorkspacePath/normalizeRoutePath及tenant-scope helpers。当前公共/未登录/平台域/错误租户纠正/query/hash分支必须逐项保持。

guard构造参数为一个具名options：publicPaths、publicHomePath、isPlatformWorkspacePath。前两个仍由main当前registry/preAuthNavTree派生，第三个传现有main私有判定函数，不复制或移动被其他main恢复流程使用的normalizeRoutePath。guard内部直接使用当前app runtime及tenant-scope正式函数，无第二套HTTP/权限。

main的beforeMount仅创建一个guard实例并router.beforeEach(to=>guard.resolve(to))；实例不能每次回调新建。resolve每次进入先递增自己的序号，即使该次是无await的同app/query/hash导航。这样A激活后等待refresh时，B导航至已选同app仍能取消A旧redirect，无须额外平台getter。

跨app分支保持顺序：cfg clean→native reset（C2d2b已使旧registration失效）→目录/app选择得到receipt→await恢复后检查本guard序号、receipt→dispose cfg→await refreshRoutes→再检查序号、receipt→返回原to.path/query/hash的replace redirect。不得用from.path/to.path相等判定意图。

过时guard序号返回false，仅取消它自身。若本guard仍最新但平台receipt被其他尚未导航的App选择撤销，则沿现有Error拒绝，由Router错误流显式报告，绝不返回旧redirect；不能catch所有错误一律false。当前网络/目录/路由注册错误保持原错误并进入router.onError。该裁决避免为隐藏一个失效错误而扩公共错误协议。读取receipt的assert只用于验证，不从用户query制造scope。

startup同租户URL预同步在await激活恢复后检查receipt，再进入SparkApp.start；目录同步receipt同样检查。已有启动失败UI及错误日志保持。

## 必要行为与顺序

先抽取等价guard并跑基础分支，再逐点加入序号/receipt与RED/GREEN，main接线最后验证，不能以手写等效guard测试冒充。

- 未登录tenant/platform路径回publicHome，允许public工具；登录平台workspace及非tenant路径回当前home；错误tenant保留query/hash纠正，当前scope直达不重复activate/refresh。
- 真实MemoryRouter：A跨app已激活且refresh deferred；B导航到同已选app不同query/hash，B先完成；A释放后不redirect，B currentRoute保持。同path不同query也覆盖。
- A在activate等待，B成为最新guard，A晚完成不能dispose/refresh/redirect；dirty拒绝发生在reset/activate前。
- 当前错误对象原样传到Router onError；平台另一起选择仅发起未save时，旧receipt不能通过最后redirect检查。
- 正常跨app/cat选择只刷新一次并以原query/hash恢复；native/cfg既有生命周期回归通过。

## 验证

新真实guard测试→root typecheck→两个production文件lint→ai-codegen/dirs。随后主控执行组合root、spark-app测试与完整build/生产browser一次验收；未再修改的spark-lowcode-api沿用C2d2a已接受18/579项结果（同时覆盖C2d1/2a/2b/2c）。不要子代理重复全量。

不动平台API、App切换consumer、后端、配置或依赖。超范围先主控重定范围。完成report/hash并冻结；不commit/push/建分支。

## 主控吸收只读复核

接线位置保持 main.beforeMount 原位置：bootstrap 的权限 beforeEach 已先安装，系统页 owner 解析仍在 beforeResolve，不提前注册改变权限顺序。跨 app await 放在局部 try/catch；catch 中若该 guard 序号已过时则返回 false，否则原错误继续抛出。只取消自己的过时导航，不吞仍当前的网络错误。测试成功和拒绝两种晚到结果。

启动预同步保留 main 原位置，应用/目录两分支都直接取得 receipt 并在此调用者恢复后 assertCurrent，再允许进入 SparkApp.start。不要为测试这个直连接线增添新公共 API、第二套启动服务或源码字符串测试。其正常路径由最终生产冷启动覆盖，异常传播由源码检查及现有启动 fallback 合同核对；报告不宣称未执行的启动并发行为测试。三文件范围不变。


替代：C2d2d/dispatch.md。真实联合测试证明 guard 取消未到达平台 commit，不能按原12项局部结果验收；保留有效代码由新切片继续修正。
