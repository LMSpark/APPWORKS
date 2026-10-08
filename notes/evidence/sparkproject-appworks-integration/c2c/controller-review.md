# C2c 主控复审

状态：implementing，首轮未验收。2026-10-07。

首轮实际 App 挂载的 4 个测试有通过证据，但不能证明下列合同。保持一个低阶写代理；暂停最终大门禁，逐项做局部 RED/GREEN，完成后主控重新审查。

1. 路由快照：query/params/meta 必须复制后冻结；不能冻结原 route 数组或嵌套 meta，matched 只复制数组。wrapper markRaw。以实际 useRoute 观察冻结快照与原 route 独立，useRouter 保持正常。
2. 绑定比较：组件必须比较真实引用，不能用 name 区分；同名/匿名不同组件都不得继续复用。删除无用 router 参数、无消费者公共 type 和非 as const 断言，复用中央 marker 常量。
3. 独立 host：SystemPageRouteHost 应渲染相同 pool 的 instance.view；不能绕过快照直接挂业务 component。
4. 刷新/事务：原 node 同 ID 但 binding 改变时当前调用显式失效；title 变化保留。旧 node 撤权不能选同路径其他 node，含 markerless 已选调用。失败路由事务不得作为新 owner 成功 commit 解锁 reset，也不得先销毁再假装恢复实例。
5. Tabs：真实 homePath marker/已验证 owner 决定首页，不按同路径第一个节点；single 模式导航须释放旧 native；reset 同步清当前身份、高亮与 tab，禁止退化成 route.path 假 tab。实际 closeTab/取消导航/重新打开都须挂真实 App 验证，不能只直接调用 pool.close。
6. C2a 保留项：DynamicRouter 识别 target.routeKind=page 且 componentMap 命中的页面，包含缺省 itemKind；此次检查发现当前表达式仍限制显式 itemKind，需加真实行为回归并记录修正，不能以旧报告措辞充当证据。
7. 边界行为：不同 tenant/project/scope/node、query 数组顺序/null/空值/hash 隔离；App switch 的 cfg clean 拒绝不得提前 reset；logout reset 不新增 cfg guard；reset 到成功新提交间不能重建旧实例。

所有修正和回归测试仍在 c2c/dispatch.md 的 11 文件范围内。全量构建与浏览器验收等待源文件冻结后执行。

## 第二轮复审

当前九项测试通过报告尚不够验收，新增三项具体退回：

- home 用例的 pageId=dashboard 本身触发旧不可关闭规则，未证明 home marker。新用例需同路径两个非 home/dashboard pageId，homePath 的 marker 指向第二节点，仅第二不可关闭。当前实现仍按路径唯一节点判断，会把该真正 landing 设为可关闭。native 改用身份；cfg/非 identity 首页保留原路径不可关闭合同。
- reset 后不导航只证明首次清理。locked 期间导航到旧 host 的不同 query，beforeResolve 仍会写回 resolved/title，进而生成 route.path 假标签及高亮。要求 locked 守卫显式失败、identity host 无有效实例时不生成 tab。现有 reset 用例 stub AppTabBar 后断言找不到 tab 是无效证据，需实际标签栏与导航 active 观察。
- single 模式尚无实际 App 卸载证据，注册失败后 reset 锁/旧合法实例保持也未测。增加精确行为测试，不以函数名称或已有四/九项通过数替代覆盖。

执行代理已确认依此顺序逐项 RED/GREEN，主控等待第二轮修复后再做完整冻结验收。
