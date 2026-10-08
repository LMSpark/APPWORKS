# C2c：原生 system-page 实例隔离与释放

状态：implementing

## 目标和前置

依赖已验收 C2a：一个 scope/path host、由 resolver 根据当前授权 owner 解析的 `to.meta` 身份、保留 URL node marker、可见拒绝态。C2c 将已解析 owner/component 包成每调用独立的原生实例，冻结 Vue Router route snapshot，接入 tab 与 KeepAlive 真释放，并在 owner 撤权/变更、应用切域及 logout 时同步失效。native 不进入 `PageRuntime`，本切片不提供 native dirty/save 保护。

C2a `dynamic.ts` 的私有 owner 字段已裁决名为 `systemPages`；C2c 的 pool 归属 resolver/identity 子目录，不在 router 根目录另建模块。C2c 不修改 cfg `PageRuntimePool` 算法，不改切换、登录 API 合同，也不在 refresh 中用 `router.replace` 重入 auth。

## 身份、快照和生命周期合同

实例 key 按 scope、解析后 tenant/project 参数、已授权 `nodeId`、物理 path、业务 query、hash 识别。query 仅排序键，重复值数组顺序保留；null、空字符串、单值和数组不折叠。保留键 `__sparkNavigationId` 不参与业务 key；被冻结给页面的 snapshot 可保留实际 marker 和原 `fullPath`，params/query/meta/数组冻结，`matched` 复制新数组但不冻结 Router 的 route record/component。不要伪造与 query/marker 不一致的 `fullPath`。页面使用原 `useRouter()`，`useRoute()` 通过 wrapper 子树的 Vue Router `routeLocationKey` 注入该实例快照。

组件惰性加载，pool 只为 C2a 已解析成功的 owner 建 wrapper，不预载。唯一命名 wrapper 的 name 用作 KeepAlive include 项，`instanceId` 用作 Vue key 与 tab.id。同一 canonical 调用复用开放实例；关闭后再次打开分配新实例，其他 instance state 不受影响。owner binding fingerprint 另校验 component、显式 target query、blueprint scenario、应用/path/scope 与实际授权归属：这些失效时不复用旧实例；只改 title 等展示字段不清理仍合法的编辑状态。若 query/path/component/binding变化导致旧 key 不再匹配，新实例使用当前 owner 建立。

## 最小 DynamicRouter 接缝

`DynamicRouter` 私有持有 C2a `systemPages` resolver；resolver 集中持有已提交 owner table、响应式 revision/有效状态及 native instance pool。给 App、tab、导航暴露最小实例操作，不新增 package 根导出或第二份授权表：

- `getSystemPageInstance(route)`：仅当当前已提交 scope/tree 中存在与 route 已验证 meta 相符的 owner 时返回 `{ instanceId, componentName, view }`；否则 undefined。只允许在 owner 已提交且 scope 解锁时创建/返回实例。
- `getSystemPageInstanceById(instanceId)`：只读查询当前有效实例的 tab 投影/owner 身份；已撤权、已关闭、reset 之后未重建均返回 undefined。
- `closeSystemPageInstance(instanceId)`：同步撤销指定可复用实例并驱动 tab/include 移除；下一次 Vue patch 后必须观察真实卸载。无需强制等待 onUnmounted 才删除 Map，不因此改变 setMode 的同步返回合同。
- `resetSystemPageInstances()`：立即使现有 native entries 不可见/不可复用、发出 revision，等待新的当前 scope owner table 成功提交后才允许创建新实例。reset 到提交之间，旧 `currentRoute` 或旧 `meta` 不得自动重建实例。reset 不调用 cfg dirty API。
- `systemPageRevision`（只读响应式信号）：成功 owner commit、reconcile、reset、close/invalidate 均递增。App、tab、host、菜单 active 只观察这一份信号；不能只删非响应式 Map。

公开方法签名可依包现有 DynamicRouter 类风格定型，但保持以上最小信息与同步失效语义。系统页返回的类型与 cfg `getPageRuntime/getPageRuntimeView` 保持可区分；cfg 调用点与返回类型不变。

## 小步执行顺序（每组先 RED，改完立即 GREEN）

1. **调用 key 与 route snapshot**：先在新测试中固定 resolver 接受 C2a selected owner 的 seam。新增同目录 `system-page-identity-pool.ts`，实现规范化实例 key、owner fingerprint、冻结 snapshot wrapper 和创建/读取/销毁单项实例；改 resolver/host/dynamic 接线。RED/GREEN 证明同 path 同场景同 node 的 query-key 顺序无关、数组顺序/hash/node/scope/app 不同隔离；保留 marker/fullPath 语义；同一实例内 `useRoute()` 冻结而 `useRouter()` 正常导航；route matched 是复制数组，不能 freeze Vue Router 内部对象。
2. **Tab 与 KeepAlive close/reopen**：先断言当前 root App 真实路径下两个 native 调用状态互相隔离、切换再回来状态保留；关闭目标后组件 `onUnmounted` 恰好一次、其 include name/tab/pool entry 清除；重开产生新 instanceId，其余实例保持。更新 `useTabPages.ts` 接入 native instanceId/name/lookup/close；更新 `App.vue` 使有效 native wrapper 与 cfg runtime 一起受 include 管理、key 使用实例 ID，identity error/unmapped 仍交给 C2a host。active close 仍先导航至其他 tab，导航取消保留原实例；只有真的卸载后 release。cfg 原有 dirty 检查、close/cancel 与 `runtimeName` 契约不改变。
3. **成功 owner refresh、撤权和菜单状态**：先断言相同 URL 不变但当前 owner 从授权树移除时，当前 native view 立即不渲染、wrapper 实际 unmount、tab/include/pool 去除且 active menu highlight 清空；不能等待下一次 router navigation 或靠 `router.replace` 触发守卫。成功提交新 owner table 时 resolver reconcile：仍授权且 binding 相同的 inactive/edit instance 保留；node/path/app/component/显式 query/blueprintScenarioId/可判定授权归属变化的旧实例销毁；仅 title 改动保留状态。无 URL marker 的系统页当前 route 撤权也要按 `to.meta.nodeId` 清理。更新 resolver、dynamic、App、useTabPages、useNavigation 共读 revision；host 对无有效 owner 显示 C2a 错误界面，不挂业务 component。
4. **scope reset、logout、home marker 与 cfg 零回归**：RED/GREEN 覆盖 App 已有 project switch 边界：先调用既有 `assertPageRuntimesClean()`，拒绝时 native/cfg 状态都不提前释放；检查通过后 reset native，再切应用/刷新。logout 只 reset native、不新加 cfg dirty 拦截，并保留原 window.location reload。新的 owner 尚未提交前，旧 currentRoute 调用 getter 不得重建；新 scope owner 提交后只为新 scope route 创建。首页同 path 多节点按实际 home marker/node 身份识别，非 landing owner 可关闭，不再用 `path.endsWith(home)` 将所有同路径 tab 标成不可关闭；保留 `pageId=home/dashboard` 原政策。完整保留 cfg 既有方法/dirty/reload 类型与行为。

## 精确文件范围（11，含主控调用方核验补充）

1. `packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts` — 持有 reactive owner revision、提交/撤销/reconcile 与 pool 所需协调，不在 refresh 内触发 Router 导航重入。
2. `packages/spark-app/src/router/system-page-identity/system-page-route-host.vue` — 观察 C2a 当前 owner 有效状态；C2c 已被 App wrapper 接管时仍对 invalid/unmapped/撤权显示 host 错误，不挂载旧业务组件。
3. `packages/spark-app/src/router/system-page-identity/system-page-identity-pool.ts`（新增） — 唯一命名 per-instance wrapper，canonical identity/fingerprint、冻结 routeLocationKey snapshot、pool 生命周期。
4. `packages/spark-app/src/router/dynamic.ts` — `systemPages` 接入、上述最小实例读取/按 id 查询/关闭/reset/revision 方法；cfg 现有方法和签名不变。
5. `packages/spark-app/src/navigation/useTabPages.ts` — native tab 以 instanceId/name 表示，close 在导航成功和真实 KeepAlive exclude/unmount 后释放；home 识别比较实际 marker owner。
6. `packages/spark-app/src/navigation/useNavigation.ts` — active native identity 订阅同一 revision；owner 失效时清掉过期高亮，不把 cfg path 规则改成 identity 规则。
7. `src/App.vue` — native wrapper 进入有 include 的 KeepAlive、按 instanceId key；project switch 保留 cfg clean guard 后 reset native；logout 清 native且不增 cfg guard。
8. `tests/runtime/page/runtime/system-page-identity-tabs.test.ts`（新增） — 必须覆盖真实 root App/RouterView/KeepAlive 接线及 unmount，不只测 pool 工具。
9. `src/main.ts` — 仅认证守卫跨应用分支，在既有 cfg clean guard 通过后、activate/catalog 切换之前 reset native；防止只处理 App 按钮而遗漏直接 URL 切应用。既有 disposePageRuntimes、refresh、重导航顺序和 API 合同保留。
10. `tests/runtime/auth-nav/navigation-platform-paths.test.ts` — 仅补齐 nav-access mock 的 getDynamicRouter（默认 null）；保持 C2a 行为断言，不重写测试以避错。
11. `tests/auth-nav/navigation-platform-paths.test.ts` — 同样仅补齐该 mock 新的真实依赖。

不改 `PageRuntimePool`、lowcode/auth 请求 API、main 其他启动逻辑、vue-pages/config、native Vue 页面或 router 全局通用层。

## 最小行为测试与最终验证

单一新测试文件按上述 4 个 RED/GREEN 行为组分段推进。测试的 App 集成部分须挂实际 `src/App.vue` 的 route-view/KeepAlive 逻辑（边界服务可 mock），由 native fixture 用 `useRoute()` 读取 nodeId/query/fullPath、用 local ref 证明隔离，`onUnmounted` 计数证明真实释放。不得用另造的简化 KeepAlive host 测试代替 App 接线。

最终 focused：`pnpm exec vitest run tests/runtime/page/runtime/system-page-identity-tabs.test.ts tests/runtime/page/runtime/page-runtime-tabs.test.ts --maxWorkers=1 --reporter=dot`。随后 `pnpm run typecheck`，对本批实际改动的 7 个生产文件 scoped ESLint；另运行已有 spark-app package tests/gates（无需重跑无关全套测试）。主控负责根 build/browser。验收中专门复查原 cfg dirty/取消导航、app switch 前检查、logout 原跳转均未改变。

## 主控最终裁决（无待澄清项）

C2a 当前源码的 SystemPageIdentityOwner 已有 `permissionMode?: RuntimeNavigationItem['permissionMode']`，createOwner 也真实复制该字段；纳入绑定比较即可，不新增权限字段或第二份授权。行/字段权限仍由后端查询结果决定，这个字段不替代完整权限验证。

刷新时必须锁定原来已经选中的 nodeId，不能把同路径原 owner 撤销后自动换成剩下的另一个 owner。无 marker 的当前调用也一样：仍合法的既选 owner 可保留；被撤销或绑定失效则可见错误，等待重新选择。新的 Router 导航仍走 C2a 的全部候选唯一/评分规则。不能因为缓存复用而信任 URL marker，getInstance/恢复快照需再次核对当前 owner、路径、scope/project 与显式 query。reset 后新 owner 提交前不创建；跨项目旧 URL/meta 不能借新表恢复。

`replaceOwners` 在路由事务成功后做同步 reconciliation，并更新当前 route 自有 meta；冻结实例 snapshot 不修改。revision 驱动 App/host/tab/nav 重新观察，避免 currentRoute shallowRef 下单改 meta 无法触发 watch。事务失败前不得提前 dispose 合法实例；只有最终成功提交才失效，新表校验/失效动作不引入可部分失败的异步事务。

close 的同步撤销与 Vue patch 卸载共同构成验收，不要求先卸载后释放的双阶段协议；文中较早“卸载后 release”均以此为准。setMode、cfg close/dispose 的原签名和顺序保留。onUnmounted 恰好一次必须通过真实 App 行为测试观察。

主控核验两处 nav-access mock 只提供 refreshRoutes；useNavigation 新增 getDynamicRouter 依赖时须按第10/11文件补齐，不能为规避测试 mock 反而改变生产归属。配置根现有 Vue plugin 已可加载实际 App；测试可 stub layout、UI 宿主、SSE、低代码会话边界，不能 stub 掉 RouterView、KeepAlive 或本轮 identity/tab/Nav 实现。

主控已验收 C2a 根187文件/2156项、包12文件/80项、完整build与生产browser。用户已授权主控裁决与低阶模型实施，不重复开工询问。只单写本闭环；开工前改为 implementing、重读每个当前文件，逐组 RED/GREEN，记录真实日志/exitCode；不 commit/push/建分支，不新增依赖，不操作真实业务写入。
