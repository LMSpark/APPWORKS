# Cross-application catalog lookup evidence (2026-10-28)

- `vitest-red.log`: raw RED against the old product source, 36 prior tests passed and 9 new catalog/lifecycle cases failed.
- `vitest-green.log`: after migration, the navigation suite passed all 45 tests.
- `typecheck.log`: repository `vue-tsc --noEmit --skipLibCheck -p tsconfig.typecheck.json` exited 0 with no diagnostics.
- `eslint.log` and `diff-check.log`: scoped lint and `git diff --check` passed.
- New fixtures use real DataSet/DataView query execution; duplicate rowid test proves both rows survive DataView query and navigation rejects ambiguity. No ClassModel generation performed.

## 主控复核

- 独立运行导航、目录装配、PlatformApps、AppList、应用切换五个测试文件：78/78 通过（21:36:01，18.70s）。两个改动源码/测试文件定向 ESLint 通过。
- 名称 trim 延续原 normalizeApplications/firstText 合同；只读取当前 DataView 允许的字段。不可读目标与不存在目标统一拒绝，不泄露不可读身份。
- 先接管返回 DataSet 后进入身份校验，finally 销毁；保留原导航根与蓝图/授权链。没有修改应用激活 API 或它的旧目录读取，本片不表示完整应用切换已统一。
- 当前 main.ts 调用导航不传显式目标；唯一传入目标的 project-settings 消费由只读提示隔离。本片没有真实 SPA 分支执行证据，上批普通进入应用烟测不作为本片证明。
- 实施者未生成产物；主控已运行正式 ClassModel 生成（981 文件、2016 symbols）及 lowcode 合同生成（611 endpoints、211 consumers），产物未手改。
- 最终 verify:rules 与 build:fe 均 exit 0。ClassModel 门禁另含 49/49 测试通过；保留既有 AI model spec 2 warnings/1 info 和 CodeMirror 动态导入构建告警。未写线上业务/元数据，未改 Java。
