# C2a：系统页身份可打开闭环（dispatch 草稿）

状态：draft

范围以主计划 C2 §2（约 56–68 行）、已验收 C2p1 与当前 C2p2 收敛为准。执行前提：C2p1 路由 staging/generation 已验收，C2p2 读取 revision fence 已验收；C2a 不重复实现这两层。只处理身份解析、菜单 marker、活动节点、home marker；不做标签缓存/关闭/脏状态，不预载业务组件。

## 合同与执行顺序

1. 启动预同步 URL app → DynamicRouter 加载并提交当前路由树 → 现有 auth `beforeEach` 完成未登录/tenant/app 校正 → C2a `beforeResolve` 只处理 system-page identity host → host 选中的懒加载组件首次挂载。跨 app 时先 activate/catalog、refresh（C2p1/2 保证请求与提交身份），随后原 URL replace 再按新树验证 marker。resolver 不重做 session 或授权 API；只接受当前已提交导航树中的节点。
2. 每个 system-page 物理 path + 来源 scope 只注册一个同步 `SystemPageRouteHost` route record；保留全部 owner（`nodeId/title/path/目标显式 query/blueprintScenarioId/惰性 Component`）。system-page 判定沿 DynamicRouter 现条件：page target 且 `itemKind === 'system-page'`，或 page target 命中 `componentMap`；其他 page 仍是 config route。稳定 route name 用 scope 和物理 path 派生，不能继续以“第一个 owner 的 nodeId”决定实际页面。
3. resolver 的唯一入口是全局 `beforeResolve`，在所有 `beforeEach` 成功后按 `to.matched` 的 host route 找当前 tree/scope 候选。marker 必须在 Vue Router parse 后恰好是一个非空 string，并命中该组当前 owner；未知、重复 array、bare/null、空字符串、marker 指向另一 path/scope、marker owner 的显式配置 query 冲突，都写入当前 `to.meta` 的 identity error 状态。守卫让导航进入同步 host 的错误视图，不挂候选业务 Component。成功只写本次 `to.meta.nodeId/title/blueprintScenarioId` 与 resolved 标记，不写共享 route record meta；host 按 `to.meta.nodeId` 从当前候选表取 Component。
4. 无 marker：先把每个 owner 的**显式配置 query**用 Vue Router 同一 `parseQuery` 结果表示；对请求 query 逐项精确比较，null、空字符串和数组（重复键及其顺序）不折叠。配置项值精确命中才计匹配条目分；请求中与 owner 已配置键冲突的 owner 不可选。取最高分 owner，最高分必须唯一；同分、零候选或无可判别差异时 host 显示错误。URL 上未配置的动态 query 不参与分数。`scenarioId` 不按名字特殊处理：仅 target 显式带该 query 时是 canonical 条目；record 的绑定场景另存 `blueprintScenarioId`，禁止从 URL 反推绑定值、也不覆盖动态值。
5. `__sparkNavigationId` 是全局 URL 保留键。C2a 的 `navigateTo(node)` 对已注册 identity-host 的普通 native page 传实际 node.id；直接字符串 `navigateToPath(path)` 不伪造 node 身份，交给唯一/最高分 resolver 判定。cfg/config、ref、iframe/external、system-action、container redirect 不写 marker；原有分支和行为不变。目标 URL 已显式含保留键时菜单导航 fail closed，不能覆盖或追加第二个值。其余 query 和 hash 按目标解析结果完整传入 Router，重复 query、bare/null、empty 与 hash 保持 Vue Router 语义。
6. marker 留在地址栏和全局 `useRoute().query`，C2a 不宣称能令所有业务页 `useRoute()` 自动隐藏它。将来任何单独交付的业务 route-snapshot 投影可排除保留键，但本批不新增全局 composable/公共 route API。C2a 不建立 KeepAlive 实例隔离或编辑快照：非活动缓存页仍可能观察全局 route 改变；这是明确留给 C2c 的风险。
7. 活动菜单 watcher 对 `system-page` 监听 `route.meta` 的 resolved/nodeId：只在 identity resolved 且 nodeId 可在传入的当前 `navRoot` 找到时按节点祖先链高亮，不能再以第一个相同 path 项决定。错误 identity 不高亮 system-page。非 system-page 的 cfg/ref 等保留当前 path 匹配逻辑；不得借此给它们写 marker。
8. home 由 `firstRuntimePagePath` 改为选出实际 landing `RuntimeNavigationItem`。若是 native system-page，lowcode 导航 projection 的 `homePath` 使用该 node 的正式 path、原显式 query/hash 与 node marker；cfg page 不加 marker。旧的唯一路径 bookmark 无 marker 仍由 canonical matcher 兼容。`src/main.ts:216-236` 当前 unknown-path 修正把已含 query/hash 的 `getNavHomePath()` 再串接 `window.location.search/hash`，会生成双 `?` 或错误 hash。修正时用 Router 解析 homeLocation：保留 home marker 和显式配置 query，剔除原未知地址携带的旧 marker；将旧 URL 非冲突动态 query 合入 home query（home 的显式配置键优先），首页显式 hash 优先；首页无 hash 时保留旧 URL hash，再用同一个 resolved location 更新 history 和 Router。已知唯一路径不重定向，保持现有 URL/query/hash。

## 来源边界（不增第二套授权）

- `preAuthNavTree` 的 public system-page 候选来自 `src/registries/vue-page-registry.ts` 的 `scope === 'public'` manifest；只在现有 public tree/scope 中解析。
- tenant runtime tree 中，lowcode 蓝图页面由 `src/lowcode/lowcode-runtime.ts` 按 `publishInMenu && authorizationById.has(nodeId)` 投影；同一 tree 还可能由 `withShellSystemTools()` 附加 `vue-page-registry scope === 'app'` 的本地 AppWorks 工具。二者来源需在候选组织/注释中分清，但 resolver 只消费现有 tree membership，不把本地工具伪称后端蓝图授权，也不新建权限查询/规则。
- platform tree 是 DynamicRouter 的既有 `loadPlatformNavigation` + `/platform` prefix scope；只在该 tree 注册的 path 集内解析。当前 main 禁用 platform navigation，但 DynamicRouter 保留此能力。tenant、public、platform 候选不能合并成全局 path-only owner 列表。

## 最小文件与职责

| 文件 | C2a 变更 |
| --- | --- |
| `packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts`（新增，内部） | 私有候选按 path/scope 收集、显式 query scoring、marker 校验；安装一次 `beforeResolve`，为 destination `to.meta` 写 resolved/error 及选择身份；不 export 到 package barrel。 |
| `packages/spark-app/src/router/system-page-identity/system-page-route-host.vue`（新增，同目录单一组件） | synchronous host；成功渲染选中 Component，失败只渲染身份错误；无效分支绝不触碰/挂载业务 Component。内部 props 只承接 DynamicRouter 的 route meta/候选查询结果。 |
| `packages/spark-app/src/router/dynamic.ts` | C2p1 staging commit 中为 native system-page 物理 path 注册一个 host record；注册完整 owner 集，按来源 tree/scope 分组；refresh 时只随已提交导航树替换候选。config/ref/iframe/平台/public 的现有路由形式不改。 |
| `packages/spark-app/src/navigation/useNavigation.ts` | 节点导航分支向 system-page host target 写 node marker；保留目标 query/hash；不改 cfg/ref/iframe/action；active path 对已解析 meta nodeId 找节点，其他路由维持旧策略。 |
| `packages/spark-app/src/navigation/runtime-navigation.ts` | 扩展已导出的 `RuntimeNavigationItem` 可选 `blueprintScenarioId`（不新增符号/export）。 |
| `src/lowcode/lowcode-runtime.ts` | blueprint record 的 `dataSpace.scenarioId` 单独投影到 `blueprintScenarioId`；chosen native landing item 返回含 marker 的 `homePath`。不把它拼到 target URL。 |
| `src/main.ts` | 只改 `ensureCurrentScopedRouteIsNavigable` 的 fallback Location 合并：直接解析含 query/hash/marker 的 homePath；剔除 unknown old URL marker 并合并非冲突动态参数，不再字符串拼第二个 `?`。现有 auth scope 校正顺序不变。 |
| `tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts` | 在现有 DynamicRouter memory-router 套件验证一个物理 host route、候选 meta、有效页挂载及所有 invalid marker/config-query 错误路径零业务 mount。 |
| `tests/runtime/auth-nav/navigation-platform-paths.test.ts` | 用真实 identity guard/probe 验证同路径节点菜单分别写自身 marker、目标 query/hash 原样保留、active 按经验证 nodeId 区分；确认 cfg/ref/iframe/action 不写 marker，path-only 歧义不首选。 |
| `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` | 验证 `blueprintScenarioId` 与 target query `scenarioId` 独立；重复 native home path 得到选定 landing node marker，query/hash 不变；唯一旧 URL 可继续无 marker。 |

不改 `src/App.vue`、`useTabPages.ts`、`PageRuntimePool`、C2p2 scope API，不加标签/KeepAlive 生命周期测试，不新增测试文件或 package export。`src/main.ts` 当前没有可直接复用的 helper unit harness；unknown-home query merge 必须在浏览器 smoke 里测，不为测试抽一个新公共 helper。

## 真正必需验证

- dynamic router focused test：两个相同物理 path owner 只出现一个 host route；node A/B marker 分别得到 meta A/B；合法节点只挂载对应懒加载 Component 一次；未知/重复/裸/空 marker、跨 path、marker owner 配置 query 冲突、marker 配置键冲突时只显示可见错误、业务 mount counter 为零。无 marker 覆盖 configured query highest score unique、同分拒绝、无 query 唯一路径兼容、null/`''`/重复数组精确语义。
- navigation focused test：真实菜单 `navigateTo(node)` 在同 path 两项分别带对应 marker；query/hash 保持；path API 无 node 身份时 resolver 唯一匹配/歧义错误；同 route path 的 active 仅高亮 `to.meta.nodeId` 对应项。明确验证 cfg/ref/iframe/action 现有路由/交互无 marker。
- projection focused test：target query `scenarioId` 保留且只有显式 target 配置时参与 canonical score；蓝图绑定场景只投影到独立 `blueprintScenarioId`；landing home marker 与被选 node 一致。
- 浏览器 smoke：已知唯一旧 URL 仍打开；同路径菜单能分别打开两节点；无 marker 旧歧义 URL 显示 host 错误；未知/重复/空/跨 path marker 和撤权 marker 不 mount 业务页；应用切换后在新 tree 上重新验证。未知 path fallback 的 homePath 含配置 query/marker 且原 URL 含 query/hash 时不得出现第二个 `?`、重复保留键或丢非冲突参数。
- 本批通过只证明调用身份选择与错误 fail-closed；不证明 native 页面脏状态、标签关闭释放或缓存编辑状态隔离。C2c 必须由独立身份 wrapper 提供 `routeLocationKey` 的冻结 snapshot，并让 App KeepAlive include + 实例名支持逐实例释放；只改 tab.id 不足以让 `useRoute()` 的非活动实例隔离。

## 已收敛的首页 merge 决策

unknown-path fallback 以首页 target 显式 query 为准；旧 URL 只补入首页未出现且非 `__sparkNavigationId` 的动态 query，保留 Vue Router 已解析的 null/空/重复数组值。首页显式 hash 优先；首页无 hash 才保留旧 URL hash。marker 始终属于首页 landing node，不继承旧 URL marker。`scenarioId` 仅在 owner target 显式配置时参与 canonical query 匹配；blueprint `blueprintScenarioId` 继续独立保存。以上均由主控/任务指令确定，无待裁决项。
