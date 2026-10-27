# 2026-10-27 ServerManagerment 旧路径诊断

## 判定

停止产品改动，不添加 RED 测试或 registry alias。当前证据不能证明旧导航节点 `BD30E16E34BC2393D9C520C9DF0AE8AA` 的正式目标与本仓 `service-management-page` 是同一身份；反而已有证据表明其项目 scope 不一致：旧节点出现于“数据资产管理”应用 `00BE6ED455CD4BD7B785C61A12A1E67D`，本仓候选页面是 Metadata 项目的入口，已知正式 SPA 页面 owner 属于 `D99A1DCE9894698799101EFD70F8FC76`。不能跨项目只凭相似页面语义及路径名加 alias。

## 证据

1. **参考页面语义。** 参考源码仓 `E:\r\sparkproject`，HEAD `4da550b54210886191385367e82aad25cdf26d5e`，页面 `packages/ui/domain/metadata/src/features/data-platform/database-management/ui/service-management-page.vue` 是“服务器管理”列表，含服务器名称/IP/类型搜索、注册、编辑、删除、密码修改及连接测试。其目录位于 Metadata 域；这证明业务语义相似，不证明它是 00BE 导航节点的正式 target。参考仓没有搜索到该节点 ID 或旧路径的可追溯蓝图/路由配置。
2. **旧节点和项目身份。** 本仓 `notes/evidence/metadata-integration-20261026/b1-sort-live-spa-readonly-20261026.json:122-128` 保存了只读 SPA 观察：从现存“数据资产管理”应用卡片进入后，shell 的 appId 为 `00BE6ED455CD4BD7B785C61A12A1E67D`，目标 `/DataCenter/ServerManagerment.html` 仍 unresolved。`notes/data-space-retirement-ledger.md:1688,1699-1700,1767,1781` 记录同一节点/路径及诊断：节点原始蓝图副本不在仓内，应用设置没有可用只读配置入口；D99A Metadata 项目是另一 app，不能从旧路径推断其 owner。
3. **当前页面注册。** `config/navigation/vue-pages.json:151-159` 将 canonical path `/features/data-platform/database-management/ui/service-management-page` 绑定到 `src/views/features/data-platform/database-management/ui/service-management-page.vue`，描述明确是“Metadata 项目的 lowcode 数据库服务器管理入口”，并设 `hidden: true`。该条目没有 `aliases`；同文件后续 TableAndView 条目有显式 alias，说明旧路径兼容须使用明示合同，不能仅凭同源组件推断。
4. **路由 owner 身份。** `packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts:143-154,249-275` 按导航节点解析正式 owner；node 的 path、navigation ID 和 blueprint scenario identity 会成为 system page owner 元数据。仓内已知 Metadata 正式服务器页导航 ID 为 `78C58A7FE34F2987267A1E8AF10B2990`（见 ledger 1781），不是旧节点 ID。把旧 URL alias 到 canonical Vue 页面会继续沿用 canonical node owner，不能把 00BE 节点变成该 owner，也不能跨过项目 scope。
5. **页面数据 scope。** `src/views/features/data-platform/database-management/ui/service-management-page.vue:201-202` 从运行时 DataSet 的 `scenarioId` 建立 `PageRuntime`，页面没有以旧 URL 选择第二项目/场景的接口；页面身份仍由宿主正式导航节点提供。

## 结论和解锁条件

业务语义上唯一显眼候选是服务器管理页，但“相似”不足以证明目标身份一一对应。当前已知真实导航节点属 00BE，当前 Vue 页面属 D99A Metadata；registry 的 alias 会把路径解析到同一 canonical owner，不能解决项目/节点身份不匹配。故不修改 `vue-pages.json`、路由 owner 或产品实现，不造一个自动化测试去编码未经证实的合同。

要重新评估，需要获得 00BE 导航节点的正式原始配置/部署导航回执，至少确认其目标应为本仓哪个页面、该节点的正式场景/数据空间身份及授权 scope。保持现有失败关闭行为；本轮未登录、未写线上业务、未读或记录密码。
