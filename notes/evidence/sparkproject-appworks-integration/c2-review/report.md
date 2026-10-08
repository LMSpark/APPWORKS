# C2 系统页身份合同研读报告

范围：只读当前宿主源码，并以固定参考提交 `842dec4f11b333df904b9a4e26b6566b0802bab8` 对照。未运行测试；未改代码；未触碰 C1b 四个文件。`navigation-coverage.json` 仅用作单应用样本，不作产品合同 SSOT。

## 结论

系统页的授权节点身份目前在导航投影中是 `RuntimeNavigationItem.id`，但注册为 `system-page` 路由时没有落到路由 meta，也没有从 `navigateTo(node)` 传到路由。`DynamicRouter` 每个规范 path 只留一个 route；导航跳转再按首个同 path 路由名跳转。因此共享 Vue 组件/路径的不同授权节点既不能稳定恢复，也不能被标签和页面代码区分。`_navRouteMap` 只在注册时写入 `WeakMap<RuntimeNavigationItem,string>`，没有消费者。

推荐将 **节点身份** 与 **场景及调用参数** 分开：保留现有 path、业务 query 和 hash，在 URL 加一个保留的节点标识 query（参考仓已采用 `__sparkNavigationId`）；导航菜单发起时写入，直接 URL/刷新时从当前授权导航树重新验证 nodeId、路径和作用域。它是可书签、可刷新事实；浏览器 `history.state` 可做导航优化，但不能作为身份来源。无标识 URL 只有在当前作用域下 path/query 能唯一解析时才接受；多 owner 时拒绝并要求回到授权菜单选择；标识无效、撤权、节点/path 不匹配、跨应用/租户时 fail closed，不回退到首项。

这保持 pathname 与既有业务 query/hash 的值和重复值语义，但会引入一个保留 query key，仍需主控确认是否允许该内部 URL 扩展。该键必须作为系统身份字段从业务 query 投影中排除，且遇到原目标已占用该保留键应显式冲突；否则 marker 会意外进入页面业务请求。不要让 `scenarioId` 充当 nodeId：样本有同路径同场景而 nodeId 不同（导航权限配置），且文件管理没有场景。

## 当前合同与数据流

- `packages/spark-app/src/navigation/runtime-navigation.ts:16-66`：导航 item 的 `id` 是现有节点身份载体；类型没有单独的场景字段。
- `src/lowcode/lowcode-runtime.ts:152-184`：`cfg:` 节点将记录的 `dataSpace.scenarioId` 投影为 `/__page/{nodeId}?scenarioId=...`；`vue:` 节点投影目标自身完整 path/query/hash，不会从 `dataSpace.scenarioId` 自动附加场景。`buildRuntimeNavigationItem` 在 `:190-218` 保留 `id: record.nodeId`，但没有传 `record.dataSpace.scenarioId`。
- 蓝图菜单输入已经过授权筛选：`:273-298` 仅保留 `publishInMenu` 且 `authorizationById` 含该 nodeId 的记录。`withShellSystemTools` 还会追加本地页面清单中的 app-scope 工具项（`:241-267`），它们属于本地页面 manifest 边界，不能误称为后端蓝图授权记录。解析 marker 时必须同时尊重对应来源和活动路由树/作用域；当前壳路由身份没有沿用蓝图节点身份。
- `packages/spark-app/src/router/dynamic.ts:432-528`：从 item 计算 route；按 routePath 检查 `registeredRoutes`，重复 path 直接跳过第二个 route（跨项目引用有特殊覆盖规则）。`:582-641` 的 native `system-page` / `invalid-system-page` meta 没有 nodeId，`:646` 只写 `_navRouteMap`；全文件 `rg` 未发现 `_navRouteMap` 读取点。配置页 route meta 在 `:623-631` 有 nodeId。
- 异步切域是另一个关键边界：`DynamicRouter.loadAndRegisterFromNav():389-400` 在 `await _loadNavigation()` 返回后直接覆盖 `_tenantNavTree` 并注册；`refreshRoutes():666-695` 无请求代次检查。`readLowcodeRuntimeNavigation():300-330` 并发等待 records 和 authorization，但未在返回前复核 selected application/request scope。`src/main.ts:450-495` 和 `App.vue:370-378` 会切换应用并刷新。快切 A→B 时，迟到的 A 导航结果目前有机会晚于 B 写入 router/tree；C2b 必须在候选身份解析和导航树发布前比较请求代次、当前选中 application 及 request scope，旧请求结果应丢弃，不能把旧 nodeId 当当前授权身份。
- `packages/spark-app/src/navigation/useNavigation.ts:188-230`：active menu watcher 只监听 `route.path`，DFS 用第一个规范化匹配项返回；query、hash 和 item.id 均不参与。
- `useNavigation.ts:432-545,552-629`：`navigateByPath` 对 system-page 通过 `router.getRoutes().find(...)` 选择第一个 path route，再按 name 跳转；`navigateTo(node)` 的普通叶子最终只传 `target.path`，丢弃被点击 item.id。`pushNamedRoute` 保留输入 path 的 query/hash，但不能解决同路径 owner。
- `packages/spark-app/src/router/page-runtime-pool.ts:43-70`：池只接收 `meta.type === 'config-page'`；key 是 `[projectId, meta.nodeId, tool.pageId, normalized query, hash]`。它的独立 DataSet、脏检查、关闭合同均属于 PageRuntime，不适用于 native system page。
- `packages/spark-app/src/navigation/useTabPages.ts:28-48,73-111`：runtime 页以 instanceId 为 tab id；其他页以 route.path 为 id。`fullPath` 仅保存为导航地址，两个同 path 的系统页会合并成一个 tab。只会释放带 `runtimeName` 的 config runtime。
- `src/App.vue:96-103,222-224`：配置页用 PageRuntime 包装组件和 runtime instanceId；native 页直接用 RouterView Component，keep-alive key 是 `route.fullPath`。查询不同的 native 调用现可分 cache key，但相同 URL 的不同 node 不行。关闭 native tab 没有让 KeepAlive 删除其缓存项的路径。
- `src/App.vue:300-354,370-378,422-427` 与 `src/main.ts:450-495`：壳按 URL path 核验已登录租户/项目；项目切换前检查、释放 PageRuntime 并刷新导航。main guard 在租户/项目纠正时保留 query/hash（`:470-491`）；启动时 `ensureCurrentScopedRouteIsNavigable`（`:214-236`）只按 path 判断是否 known，不能验证 node marker。App 的子组件跨项目切换也有一条相同生命周期。此清理只覆盖 PageRuntime，native 页面 cache 没有显式失效合同。logout 清 workspace 后整页 location 替换。
- `tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts` 覆盖 cfg 路由不装场景、显式 scenario query、调用参数规范、配置池 dirty/refresh；末项测试验证 native system page 与 iframe 分流，但没有重复 native path/node 身份断言。`tests/runtime/auth-nav/navigation-platform-paths.test.ts` 覆盖 query/hash、跨项目 ref 同 path 的命名路由优先；没有 system-page 多 owner 选择测试。`tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` 覆盖 cfg 用 dataSpace 场景构造调用 query、Vue target 原样保留自身 query/hash。页面 tab 测试在 `tests/runtime/page/runtime/page-runtime-tabs.test.ts` 及 `tests/page/runtime/page-runtime-tabs.test.ts`，只覆盖 config runtime 的多实例与取消导航。

## 场景与 query 的区别

参考固定提交的 `packages/ui/base/vue/src/navigation/authorized-route-registration.ts` 为每个授权节点保留独立 route name/meta；授权 route meta 同时含 `nodeId` 与可选 `scenarioId`（wire `conid`），见 `packages/ui/base/vue/src/navigation/authorized-route-tree.ts` 中 `SparkAuthorizedRouteMeta`、节点构造以及 `registerSparkAuthorizedRouteExecutions`。同文件的 URL 恢复器用 query key `__sparkNavigationId` 验证 nodeId、path、canonical query；对多 owner 以蓝图 target 中显式配置的 query 作匹配，不能唯一时拒绝恢复。`packages/ui/runtime/vue/src/delivered-page-context.ts` 只把已解析授权 route meta 投影为不可变 nodeId/scenarioId；它的 try/catch 失败返回 null，随后 getter 会 fail closed，不能复制成静默默认节点。

当前 AppWorks 有三种不能混为一谈的值：

1. `nodeId`：被授权/点击的蓝图节点身份；必须按当前 tenant+application 授权树验证。
2. `dataSpace.scenarioId`：该蓝图节点绑定的场景。cfg 投影目前将它预填为 query `scenarioId`，而 Vue 系统页投影不带它。
3. URL query `scenarioId` / `additionalScenarioIds`：当前 route 调用参数。配置页 PageRuntime 把它们当本次数据集调用，允许多个 scene，并按 query 构造池实例。

因此不能从 URL query 反写/推断节点绑定场景，也不能把 dataSpace 场景悄悄覆盖动态调用 query。建议系统页上下文分别提供已验证的 `nodeId`、可选 `blueprintScenarioId` 和原样 `route.query/hash`；系统页自行声明具体动作消费哪一个场景来源。若同名 `scenarioId` 同时承载绑定场景和可变调用场景，冲突时必须显式拒绝或由调用方明确选择优先级，当前源码没有系统页规则可判定唯一优先级。

样本证据：`navigation-coverage.json` 一应用含 39 个目标节点与 7 组重复 target；重复 target 有同 path 同场景不同节点的导航权限配置对（`3074...` 与 `1364...` 均绑定 `3074...`），也有多个 path 对应两个不同 node/scenario。文件管理 `EDF7...` 场景为空。样本说明 nodeId 不能用 path 或 scenarioId 替代，不代表所有部署导航。

## 最小闭环拆分

### C2a：路由保留所有权并解析调用身份

主控已裁决：用参考实现的 `__sparkNavigationId` 作保留 URL 身份；保留 pathname、现有业务 query/hash 值；蓝图场景独立于动态 query，不做覆盖；native dirty 按具体页面合同后续接入，C2a 不宣称支持。

**结论：菜单 marker 接线必须纳入 C2a。** 若只加候选表和 `beforeResolve`，同路径有多个 owner 的 URL 在未带 marker 时将按要求进入可见失败态；而当前 `navigateTo(node)` 只把 `node.path` 传给 path 导航。侧栏/顶栏点击重复路径的第二个节点也会失败，C2a 不成闭环。把 `navigateTo(node)` 的 marker 写入与候选解析放在同一批；字符串 `navigateToPath(path)` 不携 node 身份，唯一路径可继续直达，歧义路径显示失败并要求调用方传节点。

### C2a 精确闭环

| 文件 | 最小改动 |
| --- | --- |
| `packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts`（新增，内部） | 小型有状态 resolver：按已注册物理 `route.path` + 路由作用域维护全部 system-page owner；挂一个 `router.beforeResolve`；校验 URL marker（恰好一次、非空、属于该 path/scope 的候选）、无 marker 时先按显式 canonical query 过滤，再要求恰好一个候选；成功写入本次 `to.meta.nodeId/title/blueprintScenarioId` 与 resolved 状态，失败写入可见错误状态。候选表按来源树隔离（public/tenant/platform/local），导航刷新时先准备新索引，再与新导航树/路由集合原子替换；执行应用、tenant 或刷新代次失配时丢弃迟到结果。类只供 DynamicRouter 私用，不进 package barrel。 |
| `packages/spark-app/src/router/system-page-identity/system-page-route-host.vue`（新增，内部） | 唯一的 system-page Router record component。只渲染 route `props` 回调按已选 nodeId 从 resolver owner 表交付的 Vue component；失败/缺失组件状态渲染明确错误内容。这样无效 marker 在进入业务页面组件前被拦住，也不需增加错误 URL 或覆盖用户 query。 |
| `packages/spark-app/src/router/dynamic.ts` | system-page 每个物理 path 仍只注册一个 record，component 改为上面的 host。向私有 resolver 注册该 path 的全部候选与组件；只在 system-page 分支处理，不改变 config/ref/iframe/public/platform 路由。`_navRouteMap` 仍可删，但仅当此次方案批准删它；不为它新增消费者。 |
| `packages/spark-app/src/navigation/useNavigation.ts` | `navigateTo(node)` 对普通 system-page 节点按 node.id 写入 `__sparkNavigationId`，保留目标和当前导航行为的业务 query、重复值、裸 key、空值及 hash；目标已含保留键时 fail closed。node-id marker 只用于 system-page，不加到 ref/iframe/action/config 路由。`navigateToPath(path)` 不推断 nodeId。 |
| `packages/spark-app/src/navigation/runtime-navigation.ts`、`src/lowcode/lowcode-runtime.ts` | 给现有导出的 `RuntimeNavigationItem` 增加可选、明确命名的 `blueprintScenarioId`；lowcode 投影仅从 `record.dataSpace.scenarioId` 赋值。resolver 选择节点后把它写到 route meta 的同名字段；URL `scenarioId` 原样属于动态 query，绝不反写或覆盖蓝图字段。`RuntimeNavigationItem` 已由 `packages/spark-app/src/index.ts` 导出，本次只扩展现有 type，不新增 export/barrel/helper。 |
| `src/main.ts` | 保留现有 auth `beforeEach` 的作用域校正顺序和 query/hash 转发；启动的 `ensureCurrentScopedRouteIsNavigable` 继续只纠正未知 path，但当 homePath 自带重复 path 的 landing marker 时按 URL merge，不把原地址旧 node marker 再追加。main guard 将用户送往 homePath 时同样保留该 landing marker。不得在 main 再实现一套候选/授权解析。 |
| `tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts`、`tests/runtime/auth-nav/navigation-platform-paths.test.ts`、`tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` | 修改既有测试文件，不新建测试平层。覆盖重复 path 双 owner 注册为一个 Router record、点击两个节点分别写 marker/选择对的 meta、marker 缺失时多候选错误可见且业务组件未 mount、唯一 owner 的旧 URL 可进入、marker 重复/空/未授权/跨 scope/path 不匹配 fail closed、原 query/hash 与 blueprint scene 分离，以及 cfg/ref/iframe/public/platform 路由行为不变。 |

#### 解析顺序及 metadata 合同

1. resolver 在 DynamicRouter 构造时注册唯一的 `beforeResolve`，在第一次 router navigation 之前已安装；后续 refresh 只原子替换候选索引，不重复挂 hook。路由记录保存“物理 path”与只供 resolver 的候选列表键；候选项按当前 `useStaticComponent` 判定（`system-page` 或 componentMap 命中的 page）收集 `RuntimeNavigationItem` 和实际静态 Vue component。即使记录组件缺失的 `system-page` owner 也保留，选择后由 host 显示既有显式无页面组件错误，不把它当作另一节点。
2. `beforeResolve(to)` 只处理 identity-host route。先按 matched route record 的模板 path 及来源 scope 取候选，再处理 marker。marker 多次、空值、候选不含该 nodeId、path 不符或来源 scope 不符均标为 identity error；不得取第一项。
3. 无 marker 时先仅用蓝图 target 中显式配置的 canonical query 缩小同 path owner；动态 query（包括 scenarioId）不参与 owner 推断。候选恰为一项才恢复；仍为零项或多项均进入可见错误态。对同路径菜单点击，C2a 写 marker，因此不依赖 query 猜测；marker 仍须属于当前候选。无 marker 的唯一可解析旧 URL 兼容。
4. 成功时只修改本次导航的 `to.meta`，不改共享 route record meta：写 `type='system-page'`、选中 `nodeId/title/blueprintScenarioId` 和 identity resolved 状态。route record 的 props 回调再以本次 route meta 的 nodeId 查询该 route path 的候选 owner，并把对应 Component 交给 host；Component 不塞进共享 route meta。错误时 host 仅渲染错误视图，不挂载候选业务组件。
5. `__sparkNavigationId` 是路由系统字段：从传给业务页的 query 投影中移除；和目标自带同名键冲突时显式错误。其余 URL query/hash 不解析为身份或 blueprint scene。业务同名 `scenarioId` 可依旧变化，蓝图值从独立 meta 字段消费。
6. resolver 候选表必须在完整导航树/组件装载后再发布。`readLowcodeRuntimeNavigation` 请求开始时绑定 application+request scope，返回时 scope 不符即丢弃；DynamicRouter 对每次 refresh 编号，只允许最新代次原子替换树与候选表。tenant/project `beforeEach` 校正完成后，`beforeResolve` 才按新 scope 解析；跨项目 redirect 保留的 marker 若不属于新树则出错误视图。

#### 启动纠正与应用切换顺序

- 启动先由 `src/main.ts:366-377` 按 URL tenant/project 选择 lowcode application；`DynamicRouter.registerRoutes()` 再加载对应候选、注册 host route、安装 `beforeResolve`；之后启动中的 current-URL 导航通过现有认证 `beforeEach`，再经 `beforeResolve` 身份解析，最后才挂载 host/业务组件。
- `ensureCurrentScopedRouteIsNavigable()` 当前只按 path 认 known（`:214-236`）。保持它只负责未知路径的首页纠正；它不得据 `route.resolve().meta` 替代 identity resolver。纠正后若 homePath 是重复 owner，必须让 homePath 带它所选 node 的 marker，或在用户回到菜单选择；不允许“第一个 path owner”隐式成为授权身份。推荐由 `firstRuntimePagePath` 同时确定 landing item，并仅在 landing path 有多个 system-page owner 时给 `homePath` 增加该 item 的 marker；同步保留 homePath 原有 query/hash。当前 startup fallback 还会把原 URL 的 search/hash 追加到 homePath；若 homePath 自带 marker，修正位置必须按 URL 解析/合并并移除旧 URL marker，避免重复或把旧节点身份粘到新首页。该 case 加 projection 与启动纠正测试。
- 应用切换仍由现有 main `beforeEach` 先 `activateLowcodeApplication`、`refreshRoutes`、再对目标 URL replace；C2a 的 scope/代次 fence 让新路由表发布后才解析 marker。App 内 `switchAndReload` 同样 refresh 后再导航。拒绝上一个应用候选集命中的 nodeId。
- `beforeResolve` 属于独立守卫阶段，始终在所有 global `beforeEach` 成功之后运行，所以不依赖它与 main guard 的注册先后；守卫失败不能 `return true` 后让原业务路由组件继续挂载。

#### 最小验证

在 `tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts` 使用真实 memory router/host组件断言业务子组件没有 mount；在 navigation test 断言菜单节点 marker 与重复 query/hash 保留；在 lowcode projection test 断言 `blueprintScenarioId` 与 query `scenarioId` 分列及重复 home owner marker。先跑以上定向三文件测试，再 typecheck；C2a 不依赖 C2c 标签/close/cache 语义。浏览器需验初始深链、重复路径菜单切换、旧歧义 URL 错误视图、marker 撤权后错误视图、切应用后旧 node 被拒绝。 |

### C2b：节点导航、active 状态与刷新恢复

修改候选：

- `packages/spark-app/src/navigation/useNavigation.ts`：点击节点传 node.id；只在同一当前授权导航树中可选 node；保留原业务 query 重复值、裸 key、空值与 hash，marker 重复/冲突时 fail closed。相同 path 路由不得按数组首项选中。
- `packages/spark-app/src/router/dynamic.ts`、`src/lowcode/lowcode-runtime.ts` 与 `src/main.ts`：路由加载/refresh 后用最新租户应用导航树重新验证 marker；当前地址 marker 指向已撤权或 path/应用不匹配的节点时拒绝；导航读请求开始时捕获 application/request scope，返回时不匹配即标 stale；DynamicRouter 仅接受最新 refresh generation 的返回，不保留迟到的旧 app 候选集合。main 启动已注册路径检查要加入身份验证，不能只以 path known 放行带无效 marker 的 URL。
- `packages/spark-app/src/navigation/useNavigation.ts` 的 active path 投影：marker 有效时按 nodeId 高亮；无 marker 时只对可唯一解析的 URL 高亮；多候选不得全亮/首亮。
- 可复用 `tests/runtime/auth-nav/navigation-platform-paths.test.ts` 与 dynamic router 测试增加：点击重复 path 两节点、marker URL 直入/刷新、query/hash 原值保留、marker 被删/重复/无效/跨授权树时拒绝；以可控 deferred promise 模拟 A、B 两次导航读取逆序完成，证明迟到 A 不覆盖 B；现有 public/tenant/platform/ref/iframe 路径用回归断言保护。

验收重点：无 marker 旧 URL 先按显式 canonical query 过滤后唯一才兼容；剩余歧义或零候选均显示选择失败/引导，不能暗选；marker 是可刷新身份事实，nodeId 只有命中当前授权树才接受。

### C2c：标签身份、实例 cache 与生命周期

修改候选：

- `packages/spark-app/src/navigation/useTabPages.ts`：native system page id 含已解析 nodeId 与调用 query/hash，关闭时走 owner release；不要依赖 route.path。
- `packages/spark-app/src/router/dynamic.ts`：若通过独立 system-page wrapper 管理 KeepAlive，则只建立服务本需求的 system-page 实例映射，按身份提供 view/name 并支持显式 dispose；不要扩张 `PageRuntimePool` 接受伪 PageTool。
- `src/App.vue`：native 页面从直接 `Component` 改由上述 identity wrapper/cache 管理；KeepAlive 收到可关闭的 identity instance names，使释放某一 tab 能去除对应 cache。App 模式/应用上下文切换时销毁系统页实例并保留 dirty close 决策。
- `tests/runtime/page/runtime/page-runtime-tabs.test.ts`（及根路径对应测试如仍被 root 配置执行）增加：同 component 同 path 两 node 独立 state、query 不同实例、close 后重新打开为新实例、dirty/cancel 行为、单标签策略、跨项目清理；验证配置页 pool 原有 dirty/save/refresh 行为未变。

当前 native 系统页没有通用 `isDirty`/保存/放弃合同；PageRuntime 的 dirty 检查只管 cfg 页面。按主控裁决，C2c 保持 cfg 既有 dirty 合同；native 页是否可脏、何时确认关闭，后续逐页按实际保存能力接入。本批不得宣称所有 system page dirty-safe，也不把它们塞入 PageRuntime。

## 主控裁决记录

| 争点 | 主控决定 | 本方案约束 |
| --- | --- | --- |
| URL 身份 | 沿用 `__sparkNavigationId` 保留 query | 原业务 query/hash 值保留；保留键从业务 query 投影中剔除；冲突显式拒绝 |
| 蓝图场景与动态 query | 两者独立，不覆盖 | `blueprintScenarioId` 只从 blueprint dataSpace 来；route query `scenarioId` 保持调用参数 |
| dirty | cfg 保持现有合同；native 后续按真实保存能力逐页接入 | C2a/C2c 不声明 native dirty-safe，不模拟 PageRuntime |

## 验证命令建议

每个闭环第一次改动后先跑对应一个定向测试；完成 C2 后再按 `knowledge/testing.md` 次序验证 typecheck、lint、定向路由/标签测试。候选命令：

```powershell
pnpm exec vitest run tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts --maxWorkers=1 --reporter=dot
pnpm exec vitest run tests/runtime/auth-nav/navigation-platform-paths.test.ts --maxWorkers=1 --reporter=dot
pnpm exec vitest run tests/runtime/page/runtime/page-runtime-tabs.test.ts --maxWorkers=1 --reporter=dot
pnpm run typecheck
pnpm exec eslint packages/spark-app/src/router/dynamic.ts packages/spark-app/src/navigation/useNavigation.ts packages/spark-app/src/navigation/useTabPages.ts src/lowcode/lowcode-runtime.ts src/App.vue tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts tests/runtime/auth-nav/navigation-platform-paths.test.ts tests/runtime/page/runtime/page-runtime-tabs.test.ts
```

另需浏览器检查无 marker 唯一路由、同 path 双节点、刷新恢复、撤权 marker、切租户/应用、关闭重开；不以 typecheck 或单测替代该路由/缓存行为证据。按用户边界不运行全量测试或门禁。

## C2p：导航刷新代次 fence（C2a 前置最小闭环候选）

### 源码事实与影响边界

- `packages/spark-app/src/router/dynamic.ts:359-400,666-695`：`registerRoutes()` 加载主树后马上写 `_tenantNavTree/_navTree` 并注册；平台树还会再 `await` 一次。`refreshRoutes()` 在异步加载前清空共享 `registeredRoutes`，失败时无条件可能注册 `preAuthNavTree`，成功时按本次共享集合清理旧路由。没有 refresh generation。A 请求慢、B 请求快的逆序情况下，A 成功可在 B 之后覆盖 tree/routes；A 失败也可在 B 成功后把 pre-auth 路由/`_navTree` 写回。两者都会污染 C2a 供 `beforeResolve` 验证 marker 的候选授权树。
- `src/main.ts:366-377,450-495`：启动在 SparkApp 初始化前按地址栏切到 URL app；已登录跨应用 `beforeEach` 先切应用、释放 cfg runtime，再 `refreshRoutes()`，最后 replace 同 path/query/hash。`packages/spark-app/src/app/start.ts:301-320` 创建 DynamicRouter 并 `await registerRoutes()`，之后才继续 Bootstrap；`src/main.ts:489` 在 beforeMount 才执行 `ensureCurrentScopedRouteIsNavigable`。因此初次装载也必须经过同一代次与候选提交路径，不能只保护后续 refresh。
- `src/App.vue:370-380,556-557` 与 `src/services/project/project-shell.ts:138-141`：项目切换后经 `reloadAndSyncNavigation()` 调 `refreshRoutes()`，随后把返回树同步进壳；A 旧请求若返回旧树，即使 router 被 B 保住，也会把侧栏壳同步回 A。旧成功应返回当前已提交 `_navTree`（不另发旧树）；旧失败可以向该调用方 reject，但不能 fallback、删路由或改任何 tree/route 集合。
- `src/lowcode/lowcode-runtime.ts:300-330`：`readLowcodeRuntimeNavigation()` 在函数开始读取当前 application context；无显式 projectId 且 context 为 null 时直接返回 catalog tree。否则读取 records + authorization。`activateLowcodeApplication()` 在 `:575-582` 通过 platform 查询后 `selectApplication()`；`enterLowcodeApplicationCatalog()` 在 `:585-587` 清 application store。`LowcodeApi.readRequestScope()` (`packages/spark-lowcode-api/src/lowcode-api.ts:88-105`) 要求 session 和非空 application；其 token 含 session/application revision。两个 store revision 分别在 `lowcode-session-store.ts:88-124`、`lowcode-application-store.ts:64-103` 递增。
- 不可把 `readLowcodeRuntimeNavigation(projectId)` 改为“projectId 必须等于 selected app”：`src/services/project/project-settings.ts:101-115` 的 `loadProjectRuntimeSettings(tenantId, projectId)` 先验证企业 session、查 applications，再显式对传入 projectId 调它读取详情和导航，语义是按指定应用读项目设置。scope revision fence 若放在低层读函数，只能比较请求期间身份代次变化，不能把显式目标与当前选择作同一性校验。目录分支必须保留现有早返回，不能调用 `readRequestScope()`；它没有选中 app，后者会抛 `SPARK_EXECUTION_SCOPE_REQUIRED`。
- `tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts:120-147` 已覆盖顺序 refresh、配置绑定刷新和 native 路由分流；`packages/spark-app/src/router/__tests__/dynamic-auth-fallback.test.ts:35-84` 定义当前 401 / pre-auth fallback 行为；`tests/app/dev/navigation-sync.test.ts:73-81` 证明 reload 后只同步一次。`tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` 应保护 no-app catalog 快路径和显式目标的项目设置读取语义。当前没有逆序成功/失败回归用例。

### 建议的最小实施切片

C2p 应在 C2a identity host/resolver 前合并。最小安全闭环只需 `packages/spark-app/src/router/dynamic.ts` 与现有 DynamicRouter 测试；不改 `lowcode-runtime.ts`，也不新增 export、公共 API 或独立 service。原因是 main/App 已在作用域切换后启动新 refresh，DynamicRouter 的 latest-generation fence 足以阻止迟到 loader 结果发布；低层硬性 selected-app 比较会破坏显式跨应用 project-settings 读取。

1. `packages/spark-app/src/router/dynamic.ts`：给 `DynamicRouter` 增加实例私有单调 generation。初次 `registerRoutes()` 与每次 `refreshRoutes()` 都取得代次；读取主树、可选平台树、解析/装载候选 async components 全部完成后，在唯一提交点检查仍是最新代次，之后才改 `_tenantNavTree/_platformNavTree/_navTree`、候选索引、`registeredRoutes` 和 Router routes。实现时保留“新 route 就绪后再删旧 route”的现有顺序；旧请求在提交前直接退出，绝不能触碰共享集合。不能让先清 `registeredRoutes` 的旧调用与新调用共用可变 staging set。
2. `DynamicRouter.refreshRoutes()`：捕获该代次开始时旧 route path 集合的局部快照；只由赢得提交权的代次完成 remove-old。catch 先检查代次：旧失败只 reject 给自己的 caller，不注册 preAuth fallback；最新失败保留当前既有 fallback + rethrow 行为。特别是最新 401 在 `registerRoutes()` 内走现有 preAuth fallback；不要再由外层失败分支用旧状态回滚新代次。旧成功 resolve 为当前 `_navTree`，以保证 `reloadAndSyncNavigation()` 的旧调用最多重复同步新树，不同步旧结果。
3. `src/lowcode/lowcode-runtime.ts`：本闭环不改此文件。已核实 `readRequestScope()` 的 app-required 语义、session/application revision 可读性及 catalog early-return，作为排除错误低层 fence 的依据。若将来要在该 loader 内加 scope fence，必须单独证明其适用于显式跨应用 settings，并保持无选中 app 的 catalog 快路径不调用 `readRequestScope()`。
4. 在 `tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts` 用 deferred promise 做最小 RED：A/B 两次 refresh，先 resolve B、后 resolve A，断言最终 `_navTree`、Router 的 path/component/meta 和 registered route 清理均为 B；另做 A reject after B success，断言旧失败不改 B tree/routes、pre-auth fallback 不出现。另测 B 失败仍按既有 contract fallback/reject。测试共享同一 DynamicRouter，避免只测无关低层队列。
5. 本切片不改 `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts`；它们可作为 C2a 后续回归位置，不为未改低层代码堆叠测试。C2p RED 与回归都应落在同一个 DynamicRouter 测试文件，另运行现有 `dynamic-auth-fallback.test.ts` 作为 401 fallback 兼容证据。

### resolveComponents、启动和 marker 的先后

主控更正：`router.resolve()` 只匹配地址，当前 DynamicRouter 没有 `resolveComponents`。预加载全部候选组件的建议不采纳，会抵消 C1 已验收的懒加载。C2p 仅等待导航数据；由同步路由宿主在实际打开页面后加载组件。获胜代次同步注册新记录后再删除旧记录，不等待全部业务组件。

顺序依赖：启动 URL 的 app 预同步 → 首次 navigation load 与路由记录提交 → 原 auth `beforeEach` → C2a `beforeResolve` marker 对当前树授权 → 按需加载与 mount。应用切换仍是 auth `beforeEach` 中 activate/catalog → refresh 的顺序；refresh 最新代次提交完后 guard 返回 replace 原 path/query/hash，再运行 identity resolve。C2p 不将身份验证提前到 auth scope correction 之前。

### C2a 同路径菜单闭环裁决

仅上 C2a resolver/host 会让无 marker 的多 owner URL按合同进入可见错误态；当前 `useNavigation.navigateTo(node)` 不传 node 身份（报告 C2a §闭环已核实），所以同路径菜单项本身也会全部撞上该错误态。故 C2a 必须连同菜单 marker 写入同批：按具体 node 写 `__sparkNavigationId` 并原样保留该目标的业务 query/hash；不能把接线延期到 C2b。`navigateToPath(path)` 没有 node 身份时只允许唯一恢复；多 owner 时显式失败。启动/应用切换后的目标 URL marker 由新代次候选树再验证，旧 app marker 不可延续成当前 node 身份。

### canonical query 规则统一

对无 marker 的多 owner path，仅允许用蓝图目标明示配置的 canonical query 键和值缩小 owner 候选（数组按原重复项/顺序语义精确比较；null、空字符串、缺省、重复数组不可归一化成同一个值）。未在目标显式配置的动态 query 不参与 owner 打分；若 `scenarioId` 本就在目标中配置，则遵循同一显式参数合同，不能仅按参数名排除。主控已重读固定参考：匹配候选按显式配置条目数取最高分，再要求唯一；非配置 query 原值保留，不从动态参数推断蓝图绑定场景。零个或多个等分候选均拒绝。带 marker 也须验证当前候选、path、显式 canonical query；marker 不越过授权。

### 主控对 C2p 的验收边界修正

前文“generation 足够”的结论仅适用于 DynamicRouter 新旧请求发布顺序，不足以证明整个身份隔离。records query 已有 scope fence，但授权 HTTP 后返回没有装配层 fence；C2p2 将核对读取期间的 session/application revision 和根身份，保留显式跨应用目标读取。精确范围以主计划及 c2p1/c2p2 dispatch 为准。


