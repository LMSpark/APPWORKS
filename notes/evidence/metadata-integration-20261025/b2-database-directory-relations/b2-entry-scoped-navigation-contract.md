# B2 数据库入口：按当前宿主分支消歧合同

## 当前事实

- 正式只读探针结果 `b2-database-navigation-probe-v3-result.json` 在固定 APP `D99A1DCE9894698799101EFD70F8FC76` 下返回两个同路径、同为 `system-page`、均 visible/enabled 的正式节点：`A8FB2B2B161125A16FD15ED9581CD15B` 的 `idPath=[A0FA2BA0CF0C82B40DF6A319A3D5831D, A8FB2B2B161125A16FD15ED9581CD15B]`；`28F30060CD75BA684B28EEF07732CB72` 的 `idPath=[A73BFB70B8EA48FA84C4D8F3CD4F20BD, 62DA8FCF193CDF0CBA4464726E76338C, 55A2B31E13461FF55D7495D6CC4EE7FB, 28F30060CD75BA684B28EEF07732CB72]`。授权 GET 与两个分页 `Base_NavigationInfo` 读取均成功，0 blocked；这证明是当前数据中跨分支重复，不是 slash 规范或 HMR 假说。运行态身份不能以“第一条匹配”或硬编码节点 ID 处理。
- 目录页 `src/views/DataBaseManage/DataBaseManage/index.vue:148-184` 目前全树按 path 查找并要求总计唯一，再用 `navigateToPath`；即使找到一个有效候选，也没有把节点身份传入导航。该页已从正式选中数据库行取主键，并把 `databaseId` 加进 path。
- `useNavigation` 已公开 `activePath`、`navigateTo(node)` 和 `navigateToPath(path)`。路由观察器在系统页身份已解析时，按 `route.meta.nodeId` 找活动路径（`packages/spark-app/src/navigation/useNavigation.ts:197-206,228-244`）；该路径第一个节点被现有实现定义为模块/根的直接子节点（同文件约316行）。所以页面可由当前系统页 `route.meta.nodeId` 验证 `nav.activePath.value` 的末节点，再以首节点 ID 确定当前模块分支，无须猜菜单项。
- `navigateToPath` 只传路径；但 `navigateTo(node)` 对 route-kind page 会调用 `navigateByPath(target.path, node.id)`（`useNavigation.ts:587-600,653`）。该路径进入现有 `pushNamedRoute`，从路径提取 query，并由框架注入保留身份键 `__sparkNavigationId=node.id`（约450-472行）。`SystemPageIdentityResolver.resolveOwner` 按 marker 精确匹配当前候选 owner，再检查 owner 的显式 query（`system-page-identity-resolver.ts:68-83`）。不应由业务页自行拼该保留键。
- 表视图页已将 `databaseId` 作为正式路由 query 消费，拒绝非唯一/空值并在加载后核对目标数据库目录精确命中（`src/views/features/data-platform/database-management/table-and-view/ui/table-and-view-page.vue:213-217,1104-1124`）。系统页实例池的键包含 route query（`packages/spark-app/src/router/page-runtime-pool.ts:65`；身份池规范键也保留除身份marker以外的 query，`system-page-identity-pool.ts:68-72`），因此不同 databaseId 有独立调用参数身份，不需改 DataView 或另造页面状态。

## 最窄可实施合同

1. `openTableView` 先要求当前 route 是 `systemPageIdentityHost` 且 `systemPageIdentityState === 'resolved'`，`route.meta.nodeId` 为非空字符串；要求 `nav.activePath.value` 非空且末节点 ID 等于该 nodeId。缺失/不一致即拒绝导航，不能退回路径搜索。
2. 以 `nav.activePath.value[0]` 作为当前模块分支（本仓 `useNavigation` 已定义为根直接子节点）。在当前 `getNavTree()` 中必须唯一找到该分支 ID；仅在此分支内递归查与目标 canonical path 完全相等的节点。先对分支内全部同路径节点计数：数量不是 1 一律拒绝；唯一节点还必须是 route/page 目标，并且自身及整条祖先链均未 hidden/disabled。这样跨模块同路径不互相阻断；同模块重复仍失败关闭。
3. 对唯一真实节点保留其全部属性及原 `id`，只构造浅拷贝并将 `path` 更新为现有 `appendDatabaseId(node.path, selectedDatabaseId)`；随后调用 `nav.navigateTo(nodeCopy)`。不要调用 `navigateToPath`，不要仅传 path，不要自行写 `__sparkNavigationId`、复制 node 或制造替代身份。
4. 不需要增加 `navigateTo(path, query)` API。现有 `navigateTo(node)` 已同时保留正式节点身份并解析 path 中的 query；精确 ID marker 最终由现有 router/identity resolver 对当前 runtime owners 核验，数据库参数由目标页面及 PageRuntime query key 消费。若 owner 在跳转时已从当前 runtime 撤销，resolver 的 marker 精确匹配会失败关闭；不得绕过它重用同路径的另一 owner。

## 最小验证

- 实际导航树含探针中的跨模块重复路径：当前目录系统页身份在 A0FA2BA0CF0C82B40DF6A319A3D5831D 分支时，唯一选择同分支 A8FB2B2B161125A16FD15ED9581CD15B 节点；在 A73BFB70B8EA48FA84C4D8F3CD4F20BD 分支时对应选择 28F30060CD75BA684B28EEF07732CB72；测试用动态 fixture ID，不把这两个在线 ID 写入产品规则。
- 当前分支内两个同 path 项、route.meta 身份缺失/未解析、activePath 末节点与 route.meta.nodeId 不一致、分支无法唯一定位、唯一目标 hidden/disabled 或祖先不可用时，全部拒绝且不导航。
- 成功跳转使用 `navigateTo(nodeCopy)`；路由 query 保留 `databaseId`，身份 marker 由导航层加入且等于所选 node.id；system page resolver 只解析该 owner，DataSet/视图按 databaseId 正式读取。含原目标 path query/hash 的反例确认追加数据库参数不丢配置；不直接断言或自行写保留marker。

**裁决：**当前导航层已具备最窄能力，不需要扩展 `navigateTo`。需要修的是目录页的候选选择及调用路径：以当前宿主身份取得 activePath 的模块分支，唯一定位正式 RuntimeNavigationItem，然后沿 `navigateTo(node)` 传入同一节点身份与数据库 query。全程不改后端 URL/蓝图，不引入固定节点 ID或路径别名。
