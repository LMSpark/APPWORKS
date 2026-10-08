# DataView 输入过滤绑定闭环

生产改动仅在 `packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-options.ts`：捕获 DataView 查询时从 `params.context ?? view.queryContext` 递归绑定过滤树中的 `GetInputParam`，改写发往后端的快照为 `GetConstValue`。缺失、`undefined` 或非 JSON 参数在请求前拒绝；`0`、`false`、空字符串和 `null` 保留。原始视图配置不改，接口/逻辑视图的 `inputParams` 仍照传。

新增 `packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-view-input.test.ts`，用真实 DataView 到 owner 捕获的请求检查嵌套过滤、上下文覆盖、边界值、错误拒绝及配置不变；更新 `tests/runtime/auth-nav/data-space/metadata/lowcode-data-space-metadata.test.ts`，检查四个元模型的真实 wire `GetConstValue(formid)` 和原配置不变。新增测试代码没有非 `as const` 类型断言。

验证：owner 测试 8/8，metadata 测试 3/3；`@spark-appworks/spark-lowcode-api` 包 typecheck 通过；上述三文件精确 ESLint 通过。首次 typecheck 揭示索引签名访问约束，已在同一闭环修复并复验。根 typecheck 由主控统一执行，线上真实入口由主控复验，本结果不宣称该验收通过。

生产文件前像见 `preimage-manifest.json`，其 SHA-256 为 `6975E28849C78330A7AFB3D74E08D9B21CBE46FFEC8962079FAF8AD7F8A52C04`；冻结后 SHA-256 为 `F6B17A7D43C187B5F5ED580958110E8346024119C2B54582191379851B4A9C77`。本轮没有改 Vue、rule/script/style、路由或 DataView 定义元模型，也没有提交或上传。
