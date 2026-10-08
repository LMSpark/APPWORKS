# C2c 主控收敛（派工前）

状态：draft

依赖 C2a 主控验收，本文不启动第二个写代理。源文件已由主控逐一阅读：App.vue、DynamicRouter、PageRuntimePool、useTabPages、useNavigation、C2a resolver/host、nav-access、project-shell 及现有 page-runtime-tabs 测试。固定参考和旧调研不替代当前源。

## 决定与验收边界

- 用 `router/system-page-identity/` 内的实例 owner 管理 native 调用；不往 router 根平铺新模块，不把 native 包装为 PageRuntime/DataSet。
- 实例按 scope、真实 tenant/project 参数、已解析 nodeId、物理 path、业务 query、hash 识别。query 只排序键，保留数组顺序、null/空字符串；保留键不参与业务身份。页面收到的完整 route snapshot 可保留原 marker/fullPath，必须彼此一致。
- 每实例唯一命名 wrapper 提供冻结的 `routeLocationKey`；冻结 query/params 及其数组、meta，复制 matched 数组而不冻结 Router 内部 record/component。组件保持惰性，不预加载。useRouter 仍是原 Router。
- 关闭标签必须从 KeepAlive include 移除并观察真实 onUnmounted；pool Map 删除不算释放证明。重开已关闭身份创建新实例，其他实例状态保留。cfg PageRuntime 原脏检查、取消导航和配置待刷新完全保留。
- 当前没有 native 通用 dirty/save 接口。本批只证明 native 路由与组件状态隔离，不伪造未保存保护。
- Owner 表成功提交后，按当前 resolver 重新核验存量实例；node/路径/应用/组件/显式 query/蓝图场景或权限模式变化导致旧绑定失效。仅改标题等展示信息不应丢弃仍合法的编辑状态。撤权时即使 URL 不变也须移除当前视图、tab/include 和缓存。当前页面身份及菜单高亮必须同步失效，不能留下旧 meta 高亮。
- 需要一个响应式提交/失效信号供 host、App、useTabPages、useNavigation 共同观察；不得只删除非响应式 Map。不能在 refresh 内盲目 router.replace 当前 URL，避免在 auth beforeEach 刷新时重入导航。
- app/main 既有切应用路径调用 disposePageRuntimes；在该边界保留 cfg dirty 检查，通过后才清理 native。清理与新的 owner 提交之间，旧 currentRoute 不得自动重建 native 实例。logout 需清理 native 而不新增 cfg dirty 拦截，原先 window.location 重载行为保留。
- home 为同路径多节点之一时，标签不可关闭判定须参考真实 home marker；不能继续只用 path.endsWith(home) 把所有同路径节点都视为首页。原 pageId=home/dashboard 政策保留。

## 待形成最终 dispatch

精确候选：C2a resolver/host、同目录新增实例池、dynamic.ts、useTabPages.ts、useNavigation.ts、src/App.vue、新增 tests/runtime/page/runtime/system-page-identity-tabs.test.ts（当前目录只有两个测试）。必要的 cfg 旧回归不改断言。根 App 实际渲染接线与 lifecycle 测试共同验收，不能仅测 pool 工具函数。

最小行为组依次为：冻结调用与状态隔离 → 真实 KeepAlive 关闭/重开 → 无 URL 变化的授权/绑定失效和成功 refresh 保留 → 切应用/logout 清理与 cfg dirty 原行为。每组先 RED、实现后立即 GREEN；最终一次 typecheck/lint/相关 tests，主控组合 build/browser。

成本裁决：此依赖链继续一次单写代理；主控验收。当前应用选择自身的异步竞态另有只读记录，不借 C2c 扩改 platform/select 的 API 合同。
