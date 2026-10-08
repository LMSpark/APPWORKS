# C2a：系统页身份 host 与菜单闭环

状态：implementing

主控已验收 C2p2（根187文件/2143项、20项身份测试、开发浏览器深链通过）。用户授权低阶模型实施且由主控裁决；本文件是主控批准后的精确闭环。只改下列12文件和本目录证据，不提交/推送/建分支，不派子代理，不覆盖C1/C2p1/C2p2已验收内容。先完整重读当前文件与直接消费；每一个子点首次实质修改后立即最小验证。每轮日志保存真实stdout和command/cwd/时间/exitCode JSON，源码冻结后报告。

## 任务目标

在已验收 C2p1 staging/generation、C2p2 revision fence 上，完成 system-page 同物理路径多节点的可验证身份选择闭环：菜单带真实 node marker，守卫按当前已提交且已授权导航树解析身份，host 成功仅挂载选中懒加载组件，失败可见且零业务 mount；首页恢复同步携带 landing 身份。本切片不含标签缓存关闭、脏状态或 route snapshot 隔离。

## 实施顺序与合同

1. **Host 与解析器**：增加内部 `system-page-identity/` 领域目录，按 `(当前 scope, 物理 routePath)` 只注册一个固定命名的同步 host route。route record 不写共享的 `nodeId/title` 作为当前身份；owner 表按 scope/path 保存真实 node、title、显式 target query、独立 `blueprintScenarioId` 和惰性 Component。`DynamicRouter` 只安装一次 `beforeResolve`（排在现有 auth `beforeEach` 之后），依据本次目标匹配的 host 和当前已提交树解析 owner，只向 `to.meta` 写 `nodeId/title/blueprintScenarioId` 与 resolved/error 状态。

   有 marker 时要求 Vue Router parse 后恰为单个非空 string，且唯一命中当前 scope/path owner；未知、重复数组、裸/null、空值、跨 path/scope、marker owner 的显式 query 冲突均拒绝。无 marker 时按 target 显式配置 query 的精确匹配条目分选唯一最高分 owner；请求中与候选显式键冲突者排除，未配置的动态键不计分；平分、零候选拒绝。null、空字符串、重复数组保留 Vue Router parseQuery 语义。`scenarioId` 只在 target 显式配置时参与匹配；蓝图绑定场景独立存为 `blueprintScenarioId`，不互相推导或覆盖。

   host 成功才按已验证 `to.meta.nodeId` 渲染对应 Component；失败显示说明“从导航菜单重新选择”的可见错误，并且业务组件零 mount。只处理 componentMap 命中的有效 native system-page。既有 unmapped `system-page` 保持 `InvalidSystemPage` 与警告合同。组件保持 lazy，不预加载。

2. **Owner 表事务接入**：在现有 DynamicRouter staging/rollback 中，候选 owner 表与 route snapshot 一起提交；注册/提交失败时两者一起恢复，不能出现旧路由配新 owner。refresh 不重复注册守卫。保留 C2p1 的 generation 与旧成功/旧失败 fence。

3. **保留键与菜单身份**：在 `runtime-navigation.ts` 定义 `SYSTEM_PAGE_NAVIGATION_ID_QUERY = '__sparkNavigationId'`，由 `index.ts` 显式导出；根 lowcode-runtime、main、包内使用同一常量。菜单 `navigateTo(node)` 对有效 native identity-host leaf 写该 node 的真实 id，并保留其他 query/hash；`navigateToPath(path)` 没有 node 身份，不伪造 marker，交由唯一/最高分规则解析。cfg/ref/iframe/external/action/container redirect 不写 marker；若目标自身显式用了保留键，菜单导航 fail closed。组节点选择首个实际 leaf 后递归 `navigateTo(leaf)`；显式 redirect 字符串不冒充 owner。active system-page 从已验证 `route.meta.nodeId` 在当前 navRoot 找节点并高亮；错误身份不高亮。非 system-page 维持现有 path 规则。

4. **场景和首页投影**：`RuntimeNavigationItem.blueprintScenarioId` 保存蓝图 `dataSpace.scenarioId`，不得写入 target query。选出真实 landing item；仅 native system-page 的 `homePath` 附加真实 node marker，保留显式 query/hash；cfg landing 不加 marker。未知路径回首页时以首页显式 query/hash 优先：合并旧 URL 未冲突动态 query，但丢弃旧 `__sparkNavigationId`；首页有 hash 用首页 hash，否则保留旧 hash。用同一 Router-resolved location 更新 history 和 router，避免拼接第二个 `?`；已知 URL 不重定向，保留原唯一旧 URL。

5. **来源与授权边界**：resolver 只消费当前 scope 的已提交 nav tree，不增第二套授权。public 候选来自 public manifest；tenant 树内蓝图 membership 仍由 `publishInMenu && authorizationById.has(nodeId)` 决定，另有本地 AppWorks 工具 manifest 项（不得称为后端授权）；platform 候选只来自既有 platform tree/prefix。不同 scope 不合并成 path-only owner 表。跨应用切换先由现有 auth/app activation 与刷新提交新树，再对原 URL marker 重新解析。marker 留在全局地址栏和 `useRoute().query`；本切片不承诺所有消费者自动隐藏它。

## 精确文件范围（13，含主控验收补充）

1. `packages/spark-app/src/navigation/runtime-navigation.ts` — 保留键常量、`blueprintScenarioId` 字段。
2. `packages/spark-app/src/index.ts` — 显式导出常量；现有包 exports/alias 已覆盖根入口，不改配置。
3. `packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts` — 新增内部解析与一次性守卫接线。
4. `packages/spark-app/src/router/system-page-identity/system-page-route-host.vue` — 新增同步 host 与可见错误界面。
5. `packages/spark-app/src/router/dynamic.ts` — 固定 host 注册、完整 owner staging/rollback、单次守卫安装。
6. `packages/spark-app/src/navigation/useNavigation.ts` — 菜单 marker、组 leaf 递归、meta 驱动 active。
7. `src/lowcode/lowcode-runtime.ts` — scenario 独立投影、landing node marker。
8. `src/main.ts` — home fallback query/hash merge。
9. `tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts` — host/解析/事务行为。
10. `tests/auth-nav/dynamic-router-platform-pages.test.ts` — system-page 断言改为固定 path + 实际导航 `route.meta`；cfg/ref 名称断言原样保留。
11. `tests/runtime/auth-nav/navigation-platform-paths.test.ts` — 菜单/active/无 marker 分支。
12. `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts` — projection 与从包根导入常量的 export smoke。
13. `packages/spark-app/vitest.config.ts` — 与现有 package vite.config.ts/root vitest.config.ts 一样启用已安装的 `@vitejs/plugin-vue`；既有包测试必须真实转换新增 SFC，不 mock 掉 host、不删除测试、不新增依赖或修改 lockfile。

主控裁决：包测试原先未直接导入 SFC，C2a 使 dynamic-auth-fallback 真实经过 Vue host 后暴露配置缺口。已完整读取两个 Vitest 配置、package vite.config.ts 和 package.json；构建已用相同 Vue 插件且根依赖已存在。只扩展上述一个测试配置，先复用 spark-app-final.log 的真实失败，再运行原失败 suite、完整包测试、该配置 lint/typecheck 及计划中 ai-codegen/dirs 门禁。成本是测试启动多一次必要 SFC transform；不以根测试通过替代包级回归。

## RED/GREEN 与门禁

每个子项先只增加对应最小失败行为断言，再实现并立即跑该 focused test；禁止先堆完所有实现再集中测。之后统一跑 typecheck、lint、auth-nav + spark-app tests/gates。主控负责全量根测试、build 与浏览器 smoke。

- Host/解析/owner rollback：`pnpm exec vitest run tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts tests/auth-nav/dynamic-router-platform-pages.test.ts --maxWorkers=1 --reporter=dot`。覆盖一个固定物理 host、meta 身份切换、有效组件单次 mount；错误 marker/query 与 staging 失败恢复时业务 mount=0 且 owner/route 同步回滚；无 marker 唯一/最高分、平分拒绝、null/空/重复数组语义；unmapped warning/`InvalidSystemPage` 不变。调整系统页旧 `nav-dashboard` name 断言为固定 path 与真实 resolved meta，保留 cfg/ref name。
- 菜单/活动节点：`pnpm exec vitest run tests/runtime/auth-nav/navigation-platform-paths.test.ts --maxWorkers=1 --reporter=dot`。验证同路径菜单分别写真实 marker、query/hash 原样保留、组 leaf 递归、path-only 不伪造身份、active 依 meta；cfg/ref/iframe/action/redirect 不带 marker。
- Projection/export：`pnpm exec vitest run tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts --maxWorkers=1 --reporter=dot`。验证蓝图场景与 target `scenarioId` 分离、landing marker/query/hash，并从 `@spark-appworks/spark-app` 根入口导入常量。
- 最终：`pnpm run typecheck`；对上述 8 个生产文件运行项目 ESLint；`pnpm --filter @spark-appworks/spark-app test:run`；重跑上述 auth-nav focused suites及项目既有 gates。浏览器 smoke（由主控执行）：同路径菜单切换、旧唯一 URL、撤权/跨 app marker、未知路径首页 merge，无错误 mount 或 URL 参数丢失。

## 风险与后续边界

主控预审补充：canonical query 的所有显式键必须存在且精确匹配；缺少键也是拒绝，marker 分支同样适用。完整匹配后的分数为配置 query 条目数（重复值逐项计数），不能只数键。target 自身占用保留键显式拒绝。解析器为 `SystemPageIdentityResolver` class，私有 owner 状态及 guard 生命周期，静态 per-Router 唯一工厂，不保留同名函数对象 type 或旧 factory 别名。以上属于原两个新增文件的精确实现约束。

主控反查兼容补充：host 选中 owner 后保留原 `pageId/icon/description/permissionMode` 到本次 `to.meta`；`pageId` 仍由 `resolveNavRoutePageId` 计算，不把首个 owner 值放共享 route record。身份错误时清除这些值。`useTabPages` 当前仍消费 pageId 决定 home/dashboard 不可关以及 icon 标签展示，不能在宿主改造中丢失。配置 target 的 query 只取首个 hash 前部分；`/shared#details?mode=A` 中问号不得被当成 query。以上用真实 Router 的双 owner 元数据与 hash 行为测试核验。

应用范围补充：tenant owner 保留已提交 `RuntimeNavigation.projectId`（若有）。若目标路由也含 projectId 参数且不等，则当前树的 marker 不能命中另一个应用，应显示身份错误。正常主入口 auth beforeEach 先切应用和刷新后再走本守卫；catalog 未声明 projectId 时不猜默认值。租户身份仍由现有 main auth 校正，不新增无来源 tenant 配置。public/platform 及无 projectId 参数宿主保留原合同。

菜单反查补充：原生宿主由实际 `target.routeKind === 'page' && componentMap` 命中决定，包含显式 `page` 及缺省 itemKind；不能只检查 `system-page`。菜单把可选 nodeId 传给内部路径导航，在 Vue Router 实际选中的当前 scope identity host 分支添加 marker，禁止按去前缀后的 path 全局找任意 host。保留无 nodeId 的字符串导航既有公共精确路由优先级及 cross-ref 行为。保留键冲突在实际 identity host 分支显式抛错，不静默 return，也不改变 cfg 参数合同。用当前真实 Router 同时存在 public/tenant/platform 同物理路径的测试证明选择范围。

本闭环不建立多编辑实例隔离，不证明 native dirty/save 能力，也不实现标签实例释放。非活动 KeepAlive 页面直接 `useRoute()` 仍可能观察全局 URL；C2c 需在独立实例 wrapper 中 provide 冻结的 `routeLocationKey` snapshot，同时处理 App KeepAlive include/实例名释放，不能只改 tab.id。C2a 错误 host 和本批测试不得表述为上述问题已闭合。

首页 query/hash 优先级、`scenarioId` 与蓝图绑定场景分离及 scope 来源已由主控裁决，本 dispatch 无待裁决项。执行中若当前源码与上述 staging/守卫顺序不符，应停在当前子项回报主控，不扩出本文件范围。
