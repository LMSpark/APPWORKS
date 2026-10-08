# C2c：原生 system-page 多实例、route snapshot 与缓存释放

状态：draft（只读方案）

## 目标和前置接口

C2c 建立原生 system-page 的标签实例生命周期；严格依赖 C2a 已落地并验收的选择结果：`route.meta.nodeId/title/blueprintScenarioId` 只在当前导航通过身份守卫后有效，保留 URL marker `__sparkNavigationId`；owner 必须仍属于已提交、当前授权 scope/tree。C2c 不读写 C2a 正在修改的源码，也不假定其最终内部 API。开工前按最终 C2a 实现重新核对接线，复用既有 DynamicRouter/host 内部 owner 能力，不新建第二套授权判断。

缓存身份取 `(scope, authorized nodeId, canonical business query, hash)`。scope 至少区分 public/platform 或 tenantId + projectId；应用切换不能只按 path / projectId 识别。nodeId 只取已授权解析后的 route meta，不直接信任 marker/query。业务 query 从已解析 route.query 规范化：只排序 query 键，重复值数组顺序保持；null 与空字符串、单值与数组保持可区分；保留键 `__sparkNavigationId` 不参与 cache identity，但 frozen business snapshot 保留 URL 原始 query/marker、params/hash/fullPath 语义。Hash 作为身份一部分。这样 marker 文本变化但最终同一授权节点和业务调用可复用实例；不同节点或 query/hash 调用不互相覆盖。

每个身份最多一个 wrapper/view 实例。wrapper 以该身份的唯一 `instanceId` 命名，渲染 C2a 选出的懒加载 native Component，并在其子树 `provide(routeLocationKey, frozenRouteSnapshot)`；后代 `useRoute()` 因而读取该实例创建时的 location，而非随后切换到其他标签的全局 route。snapshot 深冻结 meta/params/query（数组也冻结），`useRouter()` 仍使用原 Router 注入，页面主动 push/replace 正常导航；新 location 会选择/激活对应实例，不修改旧实例 snapshot。

## 当前合同与 dirty 边界

当前 `useTabPages.toTab()` 只以配置页 `PageRuntime.instanceId` 区分实例，其他页面 `id=route.path`；所以同 native path 的 query/node 不同调用合并成一个 tab。App 的 native `<KeepAlive>` 没有 `include`，用 `route.fullPath` 做 key；关闭普通 native tab 不会调用 native view disposer。`runtimeNames` / dirty 检查 / closePageRuntime 都只枚举带 `runtimeName` 的配置页 PageRuntime。

配置页有可用合同：`PageRuntime.isDirty`、`dispose()`、`PageRuntimePool.closePageRuntime/assertPageRuntimesClean/disposePageRuntimes`，`useTabPages` 关闭/单页模式/应用切换会检查并释放它们。native registry 只将 `src/views/**/*.vue` 作为懒加载组件，没有共同 dirty/save capability、注册式守卫或 shell 可调用的 save API。个别页面有自己的局部 dirty 状态和保存动作（例如 WorkflowDesigns），不能据此当成全体 native 合同。C2c 不伪造 `PageTool`/空 `DataSet`，不接入 config PageRuntime，也不声称 native tab close、租户切换或撤权会阻止丢弃 native 页未保存编辑。切域/撤权必须优先销毁旧授权数据；若未来需要保护 native dirty，另立有消费者的 page capability 合同后实施。

## 可实施拆分

1. 新增 `packages/spark-app/src/router/system-page-instance-pool.ts`（内部）：由 DynamicRouter 持有，接收 C2a 本次解析出的有效 node、Component 与 normalized route，计算 canonical identity、生成唯一命名 wrapper、冻结 route snapshot、查询/关闭/释放实例。wrapper 通过 Vue Router 导出的 `routeLocationKey` 提供实例快照。权限检查不在 pool 重复实现；pool 只接受 C2a 认证过的选择，并提供按当前 committed tree reconciliation 的内部入口。
2. `packages/spark-app/src/router/dynamic.ts`：在现有 `PageRuntimePool` 旁持有 native instance pool；暴露 App/useTabPages 必须消费的最小 DynamicRouter 方法（例如按 route 取 native view/instance，按 instanceId 关闭，按已提交导航树 reconcile）。访问仅在 C2a identity resolved 时返回 native instance；error/unmapped 仍由 C2a host 显示。route 更新不能把共享 route record meta 当实例身份。导航刷新成功提交新授权树时，按 `(scope,nodeId,仍然有效的 owner/component)` 校验既存 native entries；被撤权、删除或 owner 不再匹配的条目立即失效。当前 route 即使 fullPath 未变化也必须失效，不能只删非响应式 Map。
3. `packages/spark-app/src/navigation/useTabPages.ts`：native tab id 改用 pool `instanceId`，path/name/title/fullPath 仍为标签展示和重开地址；`runtimeName` 扩为所有需由 App KeepAlive include 管理的实例组件名，或增加等价单一 managed-view 标识。native close/closeOthers/closeAll/single mode 都先按现有行为导航离开 active 实例，再从 include 名单移除并释放 pool entry。普通路由行为、配置页 dirty 断言与释放顺序不变。
4. `src/App.vue`：route-view 对 C2a 解析成功的 native system-page 优先取得 pool wrapper view，进入有 `:include` 的 KeepAlive，`:key` 为 pool instanceId，`:include` 包含每个打开 tab 的唯一组件名。C2a identity error/unmapped 路由仍渲染既有 host/error；cfg 路由继续 `PageRuntime` 分支。关闭必须实际让 include 移除且 wrapper unmount；不能仅更新 `tabs` 或 pool Map。
5. scope/auth lifecycle：应用切换开始时，在切换 session/catalog 的边界先从渲染与 include 中移除旧 scope native 实例，然后释放 pool entries；新 tree 加载后只保留匹配新 scope 且仍被授权 node 的实例（若 scope 已切则为零）。授权树刷新/撤权即使 route.fullPath 未变，也重验当前 native owner，撤权实例不再 render，当前身份回到 C2a 的 visible error/reselect 或其既有安全 fallback。session/logout 同样强制清掉所有 tenant/app 实例。配置页继续先按现有 `assertPageRuntimesClean` 拒绝切换；native 编辑态无通用保护接口，清理可能丢弃其页面私有未保存状态，不能声称已受保护。

## 目标文件与最小行为测试

首批实现文件限定为新增 instance pool、`packages/spark-app/src/router/dynamic.ts`、`packages/spark-app/src/navigation/useTabPages.ts`、`src/App.vue` 及相关既有 runtime/auth-nav 测试；不改 native 页面来补协议、不改 `MODULE_CONTEXT`、不修改 C2a 身份语义。应用切换/撤权如需一个既有提交通知 seam，应接在 DynamicRouter 成功提交当前 tree 的位置，不能从 `navigation-coverage.json` 另造授权数据源。

- **pool + frozen route 行为**：同 path、同 scope 的两个已解析 nodeId（query/hash 相同）得到不同 instanceId/state；同 node/query 不同 query 键顺序得到同一实例；marker 不使同业务调用重复建实例；重复值数组顺序变化、null/empty、hash 变化生成不同身份；键名只排序、数组顺序不排序。组件 `useRoute()` 分别仍读各自 frozen meta/nodeId/query/hash/fullPath，切换全局 Router 后 inactive 实例不变；`useRouter().push()` 仍触发普通导航。
- **KeepAlive + close**：App 级真实 view harness 挂载两个 native wrappers，切走再回来保留各自内存状态；关闭一个 tab 必须观察到它的 `onUnmounted` 恰好一次、pool entry 删除，另一个状态保留；重开关闭的身份得到新实例。单页模式只释放被关闭的 native view，原配置页 dirty close/切换失败测试仍通过。
- **撤权/切域**：在同一路由下替换为不含原 node 的已提交 tree，断言响应式刷新后 native component 立即不再渲染、wrapper unmounted、tab/include/pool entry 清除；当前地址不能凭旧 meta/marker 恢复授权。切 tenant/app/session 后不残留旧身份数据，即使 URL path 相同；切回同 app 也按现授权树重新打开。配置 PageRuntime dirty 时跨 app 操作仍按旧合同拒绝；native 编辑态不作未保存保护断言。
- **真实浏览器样本**：`navigation-coverage.json` 历史样本中，`/features/data-platform/database-management/table-and-view/ui/table-and-view-page` 对应 `A8FB2B2B161125A16FD15ED9581CD15B`「表和视图管理」及 `28F30060CD75BA684B28EEF07732CB72`「数据表和视图」，两者都映射 DBMS。该 JSON 仅为历史样本，不是授权 SSOT；浏览器验收前从现场当前导航树核实两个节点仍同时获授权、目标/path/component 未变。若不成立，换用现场重复 owner，不硬编码历史样本。

## 与 C2a 的依赖顺序和风险

先通过 C2a 确认固定 host 对每次导航在 `to.meta` 写真实、唯一且 scope/path 正确的身份，菜单 marker、旧 URL query scoring、授权失败 host 已工作；再加实例身份和缓存。C2c 只依赖行为：“selected owner/component + resolved nodeId/title/blueprintScenarioId + current committed scope tree”。若 C2a 最终仅缓存 host component、不向应用层提供选中 Component/有效身份查询，C2c 应在批准范围内补最小 DynamicRouter 内部接缝；不得绕过 host 直接按 URL marker 找组件。

C2c 只保证 native route 上下文隔离、生命周期和授权缓存清理；不承诺 native dirty/save。历史样本只能帮助构造验证路径，不能替代当前授权事实。
