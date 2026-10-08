# D1c：原生系统页写表单生命周期可行性

> 只读复核。未实施、未运行测试/构建，也未访问后端。复用同目录 crud-feasibility.md 的目录写合同，本报告只查 tab/pool/App lifecycle。

## 结论

PageRuntime 不能承载原生系统页表单状态：PageRuntimePool.getPageRuntime 只为 route.meta.type === 'config-page' 创建 PageRuntime（packages/spark-app/src/router/page-runtime-pool.ts:53-67）；native page 由 SystemPageIdentityPool 包装并提供 route snapshot（system-page-identity-pool.ts:89-120），不装配 PageTool/DataSet。伪造 PageRuntime 会改变 cfg 运行语义，且现有保护只认识它。

最小可复用架构是：在原生 identity pool 的每个实例上保存有限的 dirty 与 submitting 状态；由 pool wrapper 提供一个窄的原生页 lifecycle capability，新增表单通过 inject 更新这两项；DynamicRouter 只增加针对 native instances 的汇总/保护入口，useTabPages 仍按当前 cfg/native 分支判断。不要把 isDirty callback 泛化到所有壳页，也不改 PageRuntime。

该 injection capability 有真实 consumer（数据空间原生页）和 pool/provider，因此可作为有限的 spark-app 根导出；不用新增 subpath。当前 packages/spark-app/package.json 仅导出 "."，根入口别名已在 tsconfig.json:44、vite.config.ts:93、vitest.config.ts:30 配好。变更根 src/index.ts 导出后，仍应同步该包的 public-import 冒烟/契约测试，确认宿主可从 @spark-appworks/spark-app 导入此 capability；不能让宿主反向深导入 package src。本轮未发现单独命名为 spark-app import smoke 的测试文件。

## 当前真实生命周期调用链

- **native 实例**：SystemPageIdentityPool.get 按身份返回已缓存 SystemPageInstance，新建 wrapper 时只 provide(routeLocationKey, snapshot)；内部 entry 持 owner/key/fingerprint/view，没 dirty/busy 状态。close 直接删 entry；reset 清空 Map；reconcile 对 owner/组件/fingerprint 不再匹配者直接删 entry（system-page-identity-pool.ts:17-31,89-120,123-159）。
- **tab close**：AppTabBar.vue:83-118 调 useTabPages 的 closeTab/closeOthers/closeAll，action failure 已显示 ElMessage。useTabPages.ts:81-90 的 assertClean 明确对 tab.systemPage 不查 runtime；:142-160 close 前检查后导航再 release，release 调 closeSystemPageInstance。因此加 pool/native gate 到同一个 tab close 流程即可，不需改 AppTabBar 按钮编排。
- **KeepAlive 普通切 tab**：App.vue:96-104,219-234 活动 managed view 按实例 ID 渲染；useTabPages.toTab 把 native componentName 加入 runtimeNames，多 tab KeepAlive 保留实例。switchTo 只导航，不检查 dirty（useTabPages.ts:156-158）。必须保持此行为，草稿因临时切到另一标签而继续留存。
- **应用切换**：App.vue:379-401 的 projectSwitchService.switchAndReload 在切换/激活应用前只调用 dynamic.assertPageRuntimesClean()，之后直接 resetSystemPageInstances() 和 disposePageRuntimes()。另一真实路径 ProjectNavigationGuard.resolve 跨 project 时也只在 activateLowcodeApplication 前查 cfg runtime，随后 reset native pool/销毁 cfg runtime（src/services/project/navigation/project-navigation-guard.ts:59-74）。两处都要在任何 app selection side effect 之前一起核对 native dirty/submitting；保留既有 PageRuntime 语义。
- **撤权/导航刷新**：DynamicRouter.commitNavigation 在新导航 owner 建立期间调用 systemPages.replaceOwners(nextSystemPageOwners)（dynamic.ts:439-500）；resolver 先替换 owner，再 pool.reconcile，失配实例会静默删除（system-page-identity-resolver.ts:167-188）。这条路径不经过 tab close 或 assertPageRuntimesClean，授权节点撤除/绑定变化会无声丢草稿。
- **reset/logout/销毁**：App.vue 项目切换与退出分别直接调用 resetSystemPageInstances()（:395,445-449）；现有 identity-tabs 测试已证 logout reset 不被 cfg dirty gate 阻止（tests/runtime/page/runtime/system-page-identity-tabs.test.ts:349-376）。SystemPageIdentityPool.reset 自身也无保护。App onUnmounted 只移除 listener（App.vue:619-625），无 DynamicRouter/native pool dispose；目前没有更高层原生表单销毁 gate。

## 状态传递和竞态约束

- 表单本身持有其原始值/dirty 判定（数据空间 CRUD 报告定义），原生 pool entry 只保存两个可观察布尔值：unsaved draft、mutation/save in flight；任一为 true 就不能关闭或 reset。pool wrapper 为该 native instance 提供 capability，child page 注入后只报告状态，pool 不读 Vue 表单、不持 callback 到业务 owner，也不把 context、表单值或权限凭据存进壳。
- dirty 应随新增/编辑草稿和回滚/成功回读更新；保存启动先标 busy，完成或失败之后再基于仍存留的草稿状态更新。close/switch/reset 一律在 async navigation 或 app scope 更改前同步检查 dirty/busy，避免“先换 scope、后发现脏”。检查不等于取消已经发出的后端请求，所以 busy 在真实 promise settle 前必须保持 true。
- closeInstance 和 resetInstances 也应在 pool/resolver 边界防御性拒绝 dirty/busy，防止非 useTabPages 调用绕开 gate；reconcile 至少必须识别将被移除/替换的 dirty 实例，不能现状般静默删。resolver 应先完成删除集合预检，再原子提交新 owners，避免当前 #owners = owners 后 reconcile 若抛错留下半更新身份。
- 普通 multi-tab switchTo 不 gate（KeepAlive保留）；single 模式自动释放其它 tab 已走 assertClean，需纳入 native；单个/其它/全部关闭同样由 assertClean + pool close 双层 gate。

## 撤权与销毁的真实产品边界

关闭脏表单/切换应用的规则清晰：拒绝动作，提示先保存或明确放弃；已有 PageRuntime 文案亦如此。退出登录、shell 被卸载与后端撤权/导航节点撤除则不等价于普通 close：保留仍可渲染/可写的原页面会违背新授权，直接 reconcile/reset 又会静默丢草稿且可能让延迟提交继续使用旧页面状态。现代码没有 quarantine/显式 discard 流程。最小安全要求是撤销其提交资格并阻断隐式 reset；如何让失去授权的未保存表单告知/显式放弃并清理，不可用“复用 PageRuntime”解决。是否为撤权/退出提供确认放弃，或在新 owner 生效时立刻销毁草稿，是唯一真实产品选择点；主控可按授权优先裁决。不能让一个被撤权实例继续完成晚到写提交。

## 精确实施与测试候选

限定于新增目录表单生命周期，建议的直接源范围：

- packages/spark-app/src/router/system-page-identity/system-page-identity-pool.ts：entry 私有状态；wrapper 的 instance-bound provider；close/reset/reconcile 的状态预检。
- packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts、packages/spark-app/src/router/dynamic.ts：暴露原生实例 clean gate、确保 owner reconcile/reset 原子受保护；不改变 assertPageRuntimesClean 的既有含义。
- packages/spark-app/src/navigation/useTabPages.ts：按 native instance ID 查询/断言 native clean；close/closeOthers/closeAll/single-mode release 都拦截，普通 multi-tab switch 保留。
- packages/spark-app/src/index.ts：只导出有实际 consumer 的 lifecycle injection key/type，不加兼容别名；根入口已有 package export/tsconfig/Vite/Vitest alias，需同步 root import smoke 覆盖。
- src/views/app/control/data-platform/data-space/catalog/DataSpaceCatalogPage.vue 与 src/lowcode/data-space/lowcode-data-space-catalog.ts：表单 owner 持草稿判定和保存进行态，通过注入 capability 报告；禁止只靠组件卸载钩子或 UI disabled 属性。
- src/App.vue、src/services/project/navigation/project-navigation-guard.ts：切换 scope 前检查 cfg 和 native；退出/logout 的 reset 不得默默绕过 pending native 状态。AppTabBar 无需新协议/状态，只显示已有 action error。

测试优先增补已有两个测试文件，不新建框架：tests/runtime/page/runtime/system-page-identity-tabs.test.ts 使用真实 DynamicRouter/IdentityResolver/native fixture 与实际 App project-switch 注入，覆盖原生 dirty/submitting 阻断 app switch/logout reset、干净后 reset；tests/page/runtime/page-runtime-tabs.test.ts 的实际 useTabPages fixture 切到真实 registered native identity，而非 plain route，覆盖 close/closeOthers/closeAll 和 single-mode gate、普通 multi-tab switch 保留同一 native instance/草稿。另在身份测试验证 owner reconcile 删除/替换脏实例时的选定撤权策略与没有晚提交；只有真实 pool provider + 原生 fixture 才能证明机制工作。

既有 system-page-identity-tabs.test.ts:349-376 的 app-switch dirty 案例只 spy assertPageRuntimesClean() 并抛 dirty cfg page，不会产生 dirty native form，不能当 native form 受保护证据。page-runtime-tabs.test.ts:7-70 也只 spy cfg PageRuntime.isDirty。C2c 旧 mock cfg 测试同理，不足以验证原生目录表单。
