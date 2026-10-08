# D1d 撤回执行结果

已按主控批准的 D1d 符号/区块范围撤回 native lifecycle 方向；保留 C2 系统页身份、路由解析、缓存、App receipt/cancel、guard stale-selection 与原有测试行为。未开始四文件实现，没有触碰目录 owner/page/scenario/config/backend，也未执行 git checkout。

## 撤回内容

- 删除 D1d-only 的 packages/spark-app/src/router/system-page-identity/system-page-identity-lifecycle.ts。
- pool、resolver、dynamic、index、App、project-navigation-guard.ts 移除 D1d lifecycle/provider/transition 门面与消费；各自 C2 owner/route/cache/reset/receipt 逻辑仍在。
- useTabPages.ts 移除 D1d close/single-navigation transition、native clean/no-work 检查，恢复原来的 C2 dirty preflight、导航和释放顺序。
- system-page-identity-tabs.test.ts 删除独立 LifecyclePage/TabsDriver fixture 与新增 lifecycle/transition/teardown tests；保留原 C2 tests。恢复“reconciles revoked owners...”使用普通 page fixture、count=1 的行为断言，撤去 D1d dirty/submitting/abort assertion。
- project-navigation-guard.test.ts 删除 D1d 两项 pending activation lifecycle tests 及专用 fixture；保留 C2 guard 行为 tests。
- system-page-route-host.vue 未改，保留 C2 route host 原样。

## Hash

目标值来自 d1c/prior-hash-check.json；当前值为本轮撤回后的 SHA256。

| 文件 | D1d 前目标 hash | 当前 hash | 结果 |
|---|---|---|---|
| packages/spark-app/src/index.ts | BCAEE40F54E29C4FF6CA2E944A13AD9D09545C4998CB5CBB296783E41389406D | BCAEE40F54E29C4FF6CA2E944A13AD9D09545C4998CB5CBB296783E41389406D | exact |
| packages/spark-app/src/router/system-page-identity/system-page-identity-pool.ts | CB58798C401E221FFC25F0BC26F157858F979A4BF0488BAD47A66E2543B3C992 | CB58798C401E221FFC25F0BC26F157858F979A4BF0488BAD47A66E2543B3C992 | exact |
| packages/spark-app/src/router/system-page-identity/system-page-identity-resolver.ts | CDA0B36D752665431C49125C6EA10259DF56A6F80489515CAFBABBEB4592567A | CDA0B36D752665431C49125C6EA10259DF56A6F80489515CAFBABBEB4592567A | exact |
| packages/spark-app/src/router/system-page-identity/system-page-route-host.vue | BB4C6573DFDEFBD4090D667A78B38A1043D4207F847BBD918E320E2FB517AE9A | BB4C6573DFDEFBD4090D667A78B38A1043D4207F847BBD918E320E2FB517AE9A | unchanged exact |
| packages/spark-app/src/router/dynamic.ts | C33A961C88966AD8312B89134371B170C15776670C536D82A16E11AA05BD4119 | C33A961C88966AD8312B89134371B170C15776670C536D82A16E11AA05BD4119 | exact |
| src/App.vue | 3A95148F56DA351927F0D0CF5B89E83D356BE5BCF48E86CB179593197573ACB6 | 3A95148F56DA351927F0D0CF5B89E83D356BE5BCF48E86CB179593197573ACB6 | exact |
| src/services/project/navigation/project-navigation-guard.ts | 7F61E2BA51E4576EA32F956CF3087E1483C97F822E170A62C9358D3FD96F57E1 | 7F61E2BA51E4576EA32F956CF3087E1483C97F822E170A62C9358D3FD96F57E1 | exact |
| packages/spark-app/src/navigation/useTabPages.ts | F402EC34F3FA516413E789489C3468E6FD12586039454F02C58CED312C71D362 | 47DCEEE348AC4890EC8A18917CE8F3D74BD2201524D614BAA9C8A60801D5DD4A | non-byte-exact; diff shows only removed D1d lifecycle/transition blocks plus restoration of the prior active-tab clean check |
| tests/runtime/page/runtime/system-page-identity-tabs.test.ts | B76D4106CAB4DE86AA35B442811508091954DA0426A0BB2F0BAA52E8A54559A9 | 9FEDB388AC967622C298C9937D3E0EFB59AFBA5415BD45D22A9C5FBDB4A60500 | non-byte-exact; existing C2 tests retained, D1d tests removed, reconcile test restored to page/count behavior |
| tests/runtime/auth-nav/application/project-navigation-guard.test.ts | 07088C73B374E58E633213306523116A56E57C531619BB80DE7C1EC7f650a75b | 6E5B247223A6559C482E1565C2CEFBAD32391468ABF8CF74B6FC3340155EA4E9 | non-byte-exact; C2 guard suite retained, D1d lifecycle tests removed |

三个文件（useTabPages 与两个测试）当前 hash 与 D1d 前目标 hash 不同；原始前置文件字节未留存。本轮按可见 D1d edit 块反向修改并以 diff 和测试验收，没有声称字节完全还原。route-host 与六个宿主入口的 hash 精确回到 D1d 前目标。

## 验证

- pnpm run typecheck：exit 0。
- pnpm exec vitest run tests/runtime/page/runtime/system-page-identity-tabs.test.ts tests/runtime/auth-nav/application/project-navigation-guard.test.ts tests/page/runtime/page-runtime-tabs.test.ts tests/runtime/page/runtime/page-runtime-tabs.test.ts：4 files passed，29 tests passed。
- 未运行 root/package 全量 tests、build、browser 或 backend 请求。

