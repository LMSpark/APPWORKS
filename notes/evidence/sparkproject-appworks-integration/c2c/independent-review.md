# C2c 独立只读验收

状态：未发现可复现生产回归。检查范围仅为 dispatch/controller-review/report/sha256-final、其列出的11文件及直接调用 nav-access 接缝；未改代码/测试，未跑全量门禁或 build。

- sha256-final.json 的 11 个目标源码/测试哈希均与当前工作树一致。
- C2c C1a itemKind 缺省回归有真实覆盖：测试 setup 的 `system-node` 没有 itemKind、路径命中 `componentMap`，`dynamic.ts:563,571-583` 以 `target.routeKind === 'page'` 和组件映射注册 host/owner；旧显式 system-page 仍保留 unmapped 行为分支。
- 冻结 route 快照实现复制并冻结 query/params/meta 纯对象与数组，只复制 matched 数组；不冻结 matched 内 RouteRecord。wrapper 用 `markRaw` 并 provide routeLocationKey，业务页面继续获得正常 `useRouter()`。真实 App 测试分别检查 frozen query/array、matched 与 record 未冻结、原 query array 变更不影响快照。
- tab close 的实际 App/KeepAlive 测试覆盖取消导航时实例保留、成功关闭一次 unmount、重新打开产生新 instance；single 模式测试覆盖 inactive native unmount。dirty guard 在 `useTabPages.ts:78-88,134-160` 仍只对 cfg runtime 检查；native 单独关闭池实例。项目切换先 assert cfg clean 再 reset（`App.vue:379-390`；main URL 切换同序 `main.ts:487-494`）；logout reset 后仍走既有 API/finally location replace（`App.vue:431-436`）。
- reset 设置 resolver locked 并清池/清当前 meta；随后身份 host 导航在 `resolver.ts:136-140` 显式写 error，不能用不同 query 重建旧实例。测试挂真实 App、AppTabBar、NavHeaderBar，检查 reset 后 tab/highlight 清除及旧 host 新 query 仍拒绝（新测试 345-383 行）。owner refresh 按既选 nodeId 与 binding 校验，撤权不 fallback 到同路径另一个 owner；标题更改保留当前状态。刷新提交后 revision 驱动 host/App/tab/nav。
- home tab 通过 homePath marker 与 resolver 已验证 nodeId 比较；同路径 landing marker 指向 report 的测试确认 landing 可关闭而 report 不可关闭（`useTabPages.ts:44-75`; 测试 314-342 行）。cfg/非 identity tab 仍走旧路径规则，pageId home/dashboard 保护保留。
- 看过报告所述包级 26 项 focused 证据与最终源测试。实际 App 测试真实挂 App 的 RouterView/KeepAlive/标签栏，仅 stub 周边 layout/UI；断言 onUnmounted 与导航取消，因此不是只测 pool 或简化 KeepAlive host。

未发现足以阻断验收的问题。logout 测试 mock 了 pending logout Promise，未观测 finally 中的 location.replace；该路径代码仍保持原调用且本轮新增逻辑只在 reset 前置，属于该行为未被此测试直接断言，不是本次看到的代码回归。其余组合 build/browser 与全量门禁由主控执行。

