# B2 “管理”跳转与正式系统页身份合同

范围：只读核对 `b2-entry-implementation-brief.md`、B2预检末节及当前 DynamicRouter / SystemPageIdentityResolver / useNavigation / registry / 测试；没有改产品、台账或调用浏览器/服务。

## 裁决

**旧 `/DataBaseManage/TableAndView?databaseId=...` 可以继续使用现有 system-page identity 的正式 nodeId/DataSpace 身份，但当前 `vue-pages.json` 静态注册表本身不能创建这条 alias 路由，也不能仅靠新增旧 URL 注册项自动复用身份。** 需要在已有 system-page host owner 创建/路由注册链中为现有正式表视图节点注册一个精确旧路径 alias；alias owner 使用同一个真实导航节点的 `nodeId/pageId/blueprintScenarioId/scope/component`，只以 `/DataBaseManage/TableAndView` 作为另一条实际 route path。不能生成新的 synthetic node ID，也不能将 A8 的 DataSpace ID写作 `databaseId`。

`databaseId` 是从数据库目录 DataView 选中的 `_base_dbInfo` **业务行主键**，应由 `view.getPkKey(row)` 得到；A8 `A8FB...` 是 DataSet/DataSpace 身份，绝不能硬塞进该 query 或代替页面绑定身份。新页面仍使用当前正式导航宿主提供的场景 ID；请求入口 query 只定位该场景内哪一条数据库行。

## 源码依据

- `src/registries/vue-page-registry.ts:50-75,95-128` 把 `vue-pages.json` 转成 `path → component` registry；`buildComponentMap()`（约 95–128 行）为每个 registry path 导出组件映射。该表没有 `routeAliases` 语义，也不单独注册 Router route。
- `DynamicRouter.registerRoutesFromNav()`（`packages/spark-app/src/router/dynamic.ts:528-589,693-715`）只从当前 RuntimeNavigation 节点建立 route。静态组件需 `componentMap.get(normalized node path)` 命中；之后才以实际 node 构造正式 `SystemPageIdentityOwner`，并登记 `systemPageIdentityHost` route。`registerRoutes()` 在提交 navigation 时替换 owner 集（同文件约 440–486 行）。因此给 registry 加旧 path 只会提供组件键，若远程导航中没有该旧 path 节点，它不会生成可导航/有身份的 alias route。
- owner 创建（`system-page-identity-resolver.ts:231-249`）把正式节点的 id、pageId、`blueprintScenarioId` 与 `scope` 存入身份；`SystemPageIdentityPool` 的 route key包含 node/path/route query/hash/scope/tenant/project，query 是实例身份的一部分。`routeLocationKey` 快照由 host 提供，组件内 `useRoute()` 可读取该实例冻结 query。
- `SystemPageIdentityResolver.resolveOwner()`（约 68–99 行）带 `__sparkNavigationId` 时要求 marker 唯一命中正式 nodeId，并校验正式节点显式 query；无 marker 时按 path/scope/query 选最高匹配分数，0 个失败，多候选并列失败。正式目标节点 `path` 不固定 `databaseId` 时，alias URL 可额外携带不同 `databaseId`，但 alias 仍必须有唯一 owner；不应因同 path 多入口自动任选。
- `useNavigation.navigateToPath(path)`（`useNavigation.ts:512–575,599+`）按真实 route 表路由；对 system-page 路由会按正式 route name 保持 query。公开 `navigateTo(node)` 会在实际导航 node 的目标 path 上附加受保护 marker（约 663–675 行）；它没有 `path + arbitrary query + identityNodeId` 的公开参数。因此最小 alias 路由应以唯一既有正式 owner 支持 `navigateToPath(oldPathWithDatabaseId)`，或者补一条窄的 identity-aware alias 导航 API；不能在业务页面自己伪造保留 `__sparkNavigationId`。
- 当前 registry (`config/navigation/vue-pages.json:171-177`) 只注册 feature path `/features/data-platform/database-management/table-and-view/ui/table-and-view-page`。B2 brief 的正式节点也使用该 feature path；原 `/DataBaseManage/TableAndView` 不是现有注册 route。即使把旧 URL 增加到 registry，仍需 alias route/owner 规则。

## 最窄落点与身份流

1. 保持当前正式表视图 RuntimeNavigation 节点 path 不变，保留其真实 nodeId 和 blueprint DataSpace 绑定，避免改坏已有导航合同。由该正式 owner 解析出同一目标页面组件。
2. 仅为本业务声明固定兼容路径 `/DataBaseManage/TableAndView`。在 DynamicRouter/system-page host 路由层增加明示 alias 解析：从当前已解析的正式表视图 owner 投影 alias route，owner 身份仍取该正式节点，route path 使用 alias；至少要求恰好一个当前 scope 下的正式 owner 候选，非唯一、无 owner 或身份状态 error 时拒绝而不 fallback。不要把“任意 `vue-pages.json` alias 都自动创建 host”做成第二套身份源。
3. 数据库主列表选择已加载的 `_base_dbInfo` DataRow，取实际 PK，按旧 query 形式跳到 alias：`/DataBaseManage/TableAndView?databaseId=<selected-row-pk>`。alias 无 marker 时只有在 Resolver 能由真实 path/scope 唯一选中该 formal owner 时才可行；若需标记，调用一个基于 resolver 已有正式 owner 的受控导航 API，将正式节点 ID 作为身份而不由页面拼 marker。
4. TableAndView host 收到路由冻结的 `databaseId`，在已绑定正式目录 DataView 中精确匹配 PK；查不到、重复、ID 不合法或加载期间 route/scope 变化即失败/废弃旧结果，不去查全量其它 workspace、其它 DataSpace 或 URL 中的 A8 ID。不同 `databaseId` 是不同 page instance query key，应只看到各自选中数据库。

该边界不需要修改目标正式节点 ID，不需要给 `databaseId` 伪造 blueprintScenarioId，也不要求把 A8 ID写入导航 URL。

## 已有测试/缺口

`tests/runtime/page/runtime/system-page-identity-tabs.test.ts` 已证明系统页 host 对 query 的冻结快照、query key顺序规范化、不同 query 值/租户/作用域拆成不同实例，并有 route guard/导航配置变动后旧实例不能继续复活的覆盖（约 165–250、263 行后）。`tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` 与 `navigation-platform-paths.test.ts` 覆盖实际 system-page 导航会附 marker、query保留及 page/node身份校验。它们证明复用既有身份链可行，但未覆盖“一个正式节点多一个旧路径 alias”。

实施前必须对 alias 路由新增真正 RED：无静态伪造导航 ID；旧 URL 能从一个真实 formal owner 创建 route 并保持其 nodeId/DataSpace；动态 databaseId 随冻结 route snapshot 到页且两行选择隔离为不同 instance；无 owner、重复 owner、身份 error、非法/不存在 database row 全部失败；原正式 feature path 和其他同名 path 仍按旧规则工作。registry 单测/组件手工 provide 假 route identity 不足以证明运行时合同。

## 不能成立的快捷路径

- 只在 `vue-pages.json` 增加 `/DataBaseManage/TableAndView` 项：没有对应 navigation node 时不会生成 system-page host route。
- 保留当前 formal node 新 path，再以普通 `router.addRoute` 给旧 path 填页面组件：绕过 SystemPageIdentityResolver，失去正式 owner、冻结路由与按查询实例隔离。
- 用生成的 `appworks-tool-*` shell tool 项当 alias：其 nodeId 是本地合成工具身份，没有该正式 blueprintScenarioId，违反原系统页身份/数据空间边界。
- 在业务页面硬编码 nodeId、直接拼 `__sparkNavigationId`、把 DataSpace A8写入 `databaseId`：都不是当前页面的实际 owner/数据库行身份。

## Alias 复核：复用 canonical host，而非复制 owner

进一步核 Vue Router alias 与当前 system-page meta：**路由层理论上能让 alias 复用 canonical route record**。`DynamicRouter` 已给正式节点注册的 canonical `SystemPageRouteHost` 同时配置 `systemPageIdentityHost=true`、固定 `systemPageIdentityPath=<canonical routePath>` 与 scope（`dynamic.ts:693-700`; 生成 meta 在 resolver `hostRouteMeta`）。若在该 canonical route record 上声明 Vue Router `alias`，alias matcher应保留该 canonical route record 的组件和 meta；beforeResolve 会继续按 canonical `systemPageIdentityPath` 找同一个正式 owner，`getSystemPageInstance` 再按该正式 nodeId 读取，不需第二个 owner或新 nodeId。`SystemPageIdentityPool` 的 key仍含本次实际 route path/query，因此 alias 与 canonical URL、以及不同 `databaseId` 可各自隔离实例。这个组合没有被当前路由测试直接证明，alias meta/刷新移除须加集成断言后才可作为实施事实。

当前实现链没有已用的显式 alias contract：`vue-pages.json` schema只认 `path/title/source/...`，`buildComponentMap` 只产 path→component，`DynamicRouter` 的 host route object未声明 `alias`；同源码被两个 registry path 引用也会被当作两个 page paths，而不是 `aliasOf`。所以“registry新增旧 URL”或“找到同组件就自动 alias”都不安全。若现在要满足旧 URL，可在 registry 的正式页面条目增加显式有限 alias并将其传入 canonical host route 的 Vue Router `alias` 字段；不创建额外 route owner，也不更改当前正式导航节点 path。应拒绝 alias 与另一正式 route path 冲突。测试 canonical 与 alias route 都解析为同一个 systemPageIdentityPath/正式 nodeId/blueprintScenarioId，`databaseId` 查询快照分别隔离，route refresh后 alias 随 canonical owner撤销/重建。

## 本批与旧URL的范围选择

brief 所说“实际正式表视图节点 path 为 feature path”比参考仓旧 URL 更直接地代表当前 SPA 导航合同。**如果本批不能同时实现并验证显式 router alias，最窄可交付链应先从数据库 DataView 选中行，用 `view.getPkKey(row)`，通过现有 `useNav().navigateToPath('/features/data-platform/database-management/table-and-view/ui/table-and-view-page?databaseId=<row-pk>')` 进入该唯一 formal system-page route；当前 `navigateByPath` 会按正式 route name推送并保留参数，identity resolver可在单个路径 owner时按唯一 owner处理无 marker URL，route snapshot/页面池按 databaseId隔离。`databaseId` 绝不传 A8 DataSpace ID。旧 `/DataBaseManage/TableAndView` 单列为待恢复的显式 compatibility alias，不要为它复制 SystemPageRouteHost、捏造 nodeId/身份、修改当前后端/蓝图导航 path 或扩大重建 system-page host。

如果外部契约明确要求本批必须直达旧 URL，则应先按上段只加并验证 canonical route alias；它只是实际现有正式 owner 的 URL 映射。若动态路由目前没有可靠办法表达/测试该 alias，就报告为 route-owner integration blocker，先不要假装普通静态 Vue route 已满足 system-page identity。

所需行为测试应使用真实 DynamicRouter/Resolver、实际导航节点夹具及 `vue-pages` componentMap，禁止手写 `systemPageIdentityHost/meta` 伪装 host：1) current feature path与旧 alias均落到同一 canonical meta/正式 node；2) 管理query精确带业务行PK，A8不出现在 query；3) 同一 node不同 databaseId有不同 page instance和冻结 route query，切回同值复用；4) missing/ambiguous owner与冲突alias失败；5) route refresh/owner移除后alias不残留、旧实例不会绑定新节点。现有 `system-page-identity-tabs.test.ts` 已覆盖 query/key/route snapshot 机制，可作窄补测试落点；现有 `navigation-platform-paths` 验证 navigator 给正式节点加入 marker，但它没有带动态 databaseId alias用例。
