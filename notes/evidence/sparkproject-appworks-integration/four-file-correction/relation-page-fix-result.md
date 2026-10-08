# 已存关系生命周期定向返修结果

状态：页面 writer 返修已冻结，待主控总验收；不代表完整设计页验收。

## 已改

- `config/pages/data-platform/data-space-design/script.js`：`designSaveRelation` 只接受当前 Join 编辑器的 `JoinType`、`ForeignKeyFields`、`JoinFilter`、`PId` 草稿；混入其他字段仍拒绝。stage 后且未 dispatch 时，仅在同一查询 owner 下用 `discardPendingChanges([id])` 精确恢复本轮已暂存行，并更新当前快照引用。`designDeleteRelation` 的前置拒绝不再因 `clearJoin` 意图清理他人的编辑草稿；已暂存 Join/关系删除才精确恢复。
- 根类型首验揭示 `DataView.getRowById` 为私有方法；`designRelationSelected` 改用公开 `rows.find` 与 `getPkKey` 按当前主键定位，不改 DataView 合同。对应 11 处新测试调用也已同样替换。
- `tests/runtime/page/design/data-space-design-four-file.test.ts`：补 Join 首次设置与清空、提交前关系 stage 拒绝及精确恢复、删除前预存草稿保留、删除 stage 拒绝恢复、同端点其他关系和其他父归属保护、提交结果未知锁。原真实渲染用例使用 Join 下拉选项选择“右连接”并点击页面保存按钮，核正式模型回读；去除该用例无用调试变量和非 `as const` 数组断言。消息断言只检查注入 `PAGE_RUNTIME_SERVICES.pageService.showMessage` 所收集的警告/错误，同时检查 renderer `onRuntimeError`；不宣称覆盖其他全局提示通道。

## 验证

- Red：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts -t 'saves first Join assignment and clearing'`，原代码 1 failed / 46 skipped，报“子模型存在其他本地修改，拒绝混入关系保存”；原始输出 `relation-page-fix-red.log`。
- 最小 Green：同一用例 1 passed / 46 skipped，`relation-page-fix-green-initial.log`。其他定向用例输出在 `relation-page-fix-targeted.log`、`relation-page-fix-edges.log`、`relation-page-fix-rendered.log`、`relation-page-fix-unknown.log`。
- 公共 API 修正后最小测试 1 passed / 51 skipped，`relation-page-fix-public-api-targeted.log`。
- 最终：`pnpm exec vitest run tests/runtime/page/design/data-space-design-four-file.test.ts`，52 passed / 52，09:34:44 开始、17.12 秒；`relation-page-fix-full.log`。JSDOM 报 `HTMLFormElement.requestSubmit()` 未实现提示，测试退出码 0。
- 最终：`pnpm exec eslint config/pages/data-platform/data-space-design/script.js tests/runtime/page/design/data-space-design-four-file.test.ts --max-warnings=0`，退出码 0；`relation-page-fix-eslint.log` 为空。

## 未决边界

- 关系新增字段权限仍待用户裁定，本返修未触碰新增。
- 根 typecheck 首验失败 11 处私有 API 调用，主控日志 `relation-final-typecheck.log`；本次已修正，复验仍由主控执行。页面配置及代码门禁由主控统一执行。
- 本轮只做离线页面与 DataView 夹具验证，未在线写入或宣称整页验收。
