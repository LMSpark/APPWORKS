# D1d 生命周期增量撤回范围（待主控批准）

生成目的：只界定用户纠正为“四文件页面”后的 D1d 原生生命周期增量回退边界。本文件不执行回退。此前已验收的 C2 路由身份、owner 解析、页面缓存、应用切换 receipt/cancel 行为和既有测试必须保留。

## 证据边界

- notes/evidence/sparkproject-appworks-integration/d1c/prior-hash-check.json 记录 D1d 开工前 39 个宿主文件 hash。下表目标 hash 即 D1d 之前的宿主状态。
- C2 accepted 清单确认 system-page-identity-pool.ts、system-page-identity-resolver.ts、system-page-route-host.vue、dynamic.ts、useTabPages.ts、App.vue 和两个指定测试文件已有 C2 实现。不得删除这些文件或整份测试。
- c2c/accepted-files.json 保留 pool/resolver/route-host/dynamic/useTabPages/App/native-tabs test 的 C2 hash；c2d2d/accepted-files.json 与 c2d2f/accepted-files.json 保留项目导航 guard 与其测试。
- four-file-correction/snapshot-manifest.json 和 source-snapshot/ 是当前 D1d 后的留存快照，不是 D1d 开工前副本。不得将它当作回退目标。
- 快照里的 TypeScript/Vue 原文以 `.txt` 后缀保存，避免被项目 lint 当作现行源码；原始相对路径仍为 manifest 的 path，存档位置为 snapshotPath。15 项 SHA256 均保持原值。
- 下表恢复目标是 hash 与功能边界，不代表本文件含有旧文件字节。批准后须按符号/区块逆向 D1d 改动，并以目标 hash 核验；若无法精确恢复，先找回原始字节，不可猜测或覆盖。

## 文件级范围

| 文件 | D1d 增量需撤回 | 需保留的 C2/既有内容 | D1d 前目标 hash |
|---|---|---|---|
| packages/spark-app/src/router/system-page-identity/system-page-identity-lifecycle.ts | D1d 新增 lifecycle class/provider/hook；批准后删除，并清除唯一 D1d root export/consumer。 | 不适用。 | D1d 新文件；当前快照 SHA256 A7A59D692C8599E34CA68D878842BBD80E03BA0726AF1F1459880489424D846A。 |
| packages/spark-app/src/router/system-page-identity/system-page-identity-pool.ts | 移除 lifecycle 字段/provider、dirty/submitting/transition token gate、transition acquire/release、reset/reconcile abort/dispose 和生命周期聚合。恢复 C2 pool entry 与 wrapper 语义。 | 保留 C2 实例身份、route snapshot provider、实例缓存/复用、close/reset/reconcile/revision 原逻辑。不能删除该文件。 | CB58798C401E221FFC25F0BC26F157858F979A4BF0488BAD47A66E2543B3C992 |
| packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts | 移除 D1d lifecycle assert/transition facade 及其转接。 | 保留 C2 owner 注册/解析、路由身份及 query 匹配、reconcile 逻辑。不能删除该文件。 | CDA0B36D752665431C49125C6EA10259DF56A6F80489515CAFBABBEB4592567A |
| packages/spark-app/src/router/system-page-identity/system-page-route-host.vue | 无 D1d 撤回项。 | C2 已验收 route host，原样保留；不能删除或重写。 | BB4C6573DFDEFBD4090D667A78B38A1043D4207F847BBD918E320E2FB517AE9A |
| packages/spark-app/src/router/dynamic.ts | 移除 D1d native lifecycle 聚合门面及 acquireSystemPageTransition、native clean/no-work lifecycle 接口；恢复 App/guard 可见的 pre-D1d clean/reset API 语义。 | 保留 C2 dynamic route identity host、native owner registration、系统页实例 get/close/reset、cfg runtime 行为及此前 D1c 已验收调整。不得按 Git HEAD 整文件 checkout。 | C33A961C88966AD8312B89134371B170C15776670C536D82A16E11AA05BD4119 |
| packages/spark-app/src/navigation/useTabPages.ts | 移除 native lifecycle clean/no-work/transition 集成、候选 transition tokens、single-navigation transition map 和 D1d native tab 特判。 | 保留 C2 native tab identity、主页归属、实例缓存/关闭行为和原 cfg runtime close/single/multi 语义。 | F402EC34F3FA516413E789489C3468E6FD12586039454F02C58CED312C71D362 |
| packages/spark-app/src/index.ts | 删除唯一 D1d export useSystemPageIdentityLifecycle。 | 保留 D1c/C2 已有公共导出，包括 SYSTEM_PAGE_NAVIGATION_ID_QUERY（若在目标 hash 中存在）。 | BCAEE40F54E29C4FF6CA2E944A13AD9D09545C4998CB5CBB296783E41389406D |
| src/App.vue | 移除 D1d 的 native pool 引用、应用切换 scope transition acquire/release、logout lifecycle reset、App teardown pool reset。仅移除 D1d 加入的部分。 | 保留 C2 最近验收的应用切换 receipt/latest-intent/失败留原页、目录选择、logout 原有强制 reset、native view KeepAlive、卸载既有 listener 与 UI 行为。不得整文件退回更早 C2a。 | 3A95148F56DA351927F0D0CF5B89E83D356BE5BCF48E86CB179593197573ACB6 |
| src/services/project/navigation/project-navigation-guard.ts | 移除 D1d acquireSystemPageTransition 生命周期锁及 finally release。 | 保留 C2 receipt 校验、latest-intent、取消旧导航、错误传播及授权撤回语义。 | 7F61E2BA51E4576EA32F956CF3087E1483C97F822E170A62C9358D3FD96F57E1 |
| tests/runtime/page/runtime/system-page-identity-tabs.test.ts | 不删整文件。去掉 D1d 新增 lifecycle provider/isolation、transition/disabled、App lock、single transition lock、生命周期 teardown/reconcile coverage；恢复 D1d 前 C2 test 内容。 | 保留 C2 accepted 的 system-page identity route、App KeepAlive、close/reconcile、reset、导航保留语义测试。 | B76D4106CAB4DE86AA35B442811508091954DA0426A0BB2F0BAA52E8A54559A9 |
| tests/runtime/auth-nav/application/project-navigation-guard.test.ts | 不删整文件。移除 D1d 新加的两项“activation 中 native providers 被锁”和“新 guard selection + 独立 transition token”测试及 D1d-only imports/fixture helper。 | 保留 C2d2d/f 的 guard receipt、stale/cancel/failure/refresh、dirty cfg gate 等测试。 | 07088C73B374E58E633213306523116A56E57C531619BB80DE7C1EC7F650A75B |

目标 hash 来自 D1d 开工前 prior-hash-check.json。当前 typecheck 报错的 identity-tabs:416/417 与 611 属停止前新增/改动的测试区域；恢复该测试文件至目标 hash即可回到 D1d 前状态，不要为旧方向修测试。最后添加的 dirty+submitting reconcile 断言未验证。

## 非本次撤回范围

- D1c 计划里的目录 owner、页面、catalog 测试和配置不在本撤回清单；不删除它们，也不顺手进入四文件实现。
- system-page-route-host.vue 是 C2 accepted 内容，留存原样。
- system-page-identity-pool.ts 与 system-page-identity-resolver.ts 也是 C2 文件；仅移除 D1d lifecycle delta，不能删文件。
- 未列入本表的早前工作树改动不属 D1d 生命周期撤回目标。

## 批准后恢复顺序建议

1. 先将两个测试文件恢复到表列 D1d 前 hash，确认 C2 原测试完整；不单独修复 D1d 新测试类型错误。
2. 在 dynamic/useTabPages/resolver/pool/App/guard/index 中只逆转本表 D1d lifecycle hunk。优先使用 D1d 前精确字节/证据恢复，确认目标 hash；保留所有 C2 行为。
3. 在消费者与测试不再引用后删除唯一新增文件 system-page-identity-lifecycle.ts。route-host 保持 hash 不变。
4. 对照 d1c/prior-hash-check.json 与 C2 accepted files 复核；任何文件无法达到目标 hash或发现 C2 语义依赖 D1d 增量，立即停止并报告，不做近似回退。
