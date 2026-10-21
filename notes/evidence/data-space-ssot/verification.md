# 数据空间文档与首轮 SSOT 验收

日期：2026-10-09。基线：f3a361e5112c4b94e2527fc68bf5f640a9f17863。范围：[计划](../../plan-data-space-ssot.md)中的文档及获批首轮正式请求配置校验收敛。

后续状态：本文保留首轮验收时的事实；下述 21 处既有测试类型错误已在另行获批的六文件清理中修复，当前结果见[测试合同验收](../data-space-test-contracts/verification.md)。

## 结果

| 检查 | 结果 |
| --- | --- |
| 首个诊断一致性测试 | 修改前失败：文件层没有 SPARK_SAVE_CONFIG_HEADERS；统一后通过，同时保留 tables.Orders.api.list 路径和原草稿 |
| 新纯配置测试 | 24 通过：捕获后源对象变化不污染请求；端点等价、JSON、凭据头、策略限制 |
| 场景文件定向 | 81 通过 |
| 正式查询保存接线定向 | 34 通过，覆盖配置保存/重开/请求、作用域、批次冲突和非法配置零请求 |
| 根 test:run --maxWorkers=2 | 213 文件、2852 测试通过，退出 0，见 [root-tests.log](root-tests.log) |
| spark-data test:run | 34 文件、752 测试通过，见 [data-tests.log](data-tests.log) |
| spark-project-model test:run | 4 文件、125 测试通过，见 [model-tests.log](model-tests.log) |
| spark-lowcode-api test:run | 19 文件、660 测试通过，见 [api-tests.log](api-tests.log) |
| 根 typecheck | 修改前、最终修改后均退出 0，最终见 [root-typecheck.log](root-typecheck.log) |
| project-model typecheck | 退出 0，见 [model-typecheck.log](model-typecheck.log) |
| 根 lint | 退出 0 |
| verify:arch / verify:ai-codegen / verify:dirs | 通过；新增子目录超限已通过复用 core、tests/crud 解决 |
| verify:class-model | 通过，含 4 文件 / 49 测试，见 [class-model.log](class-model.log) |
| 文档门禁、链接与锚点 | 通过；原 CRLF 文件按 cr-at-eol 执行 diff --check，无额外空白问题 |
| 文档示例 | 当前源码下 ScenarioViewConfig 接受主文档 JSON 和完整树配置；原生局部 DataSet 示例执行并销毁成功 |

定向/包级与根测试有重叠，不将数字相加。根测试有既有 esbuild/oxc 提示和 jsdom requestSubmit 未实现输出，未导致测试失败。文档临时 Vite 校验中依赖预扫描提示缺少应用虚拟模块，三个指定源码示例仍执行成功；没有将该检查冒充应用启动验收。

## 包级类型检查的既有失败

对同一 TypeScript 编译器和同一包 tsconfig，使用 Git HEAD 的修改文件内容覆盖 compiler host，再与当前文件比较。未切换分支、未回退工作树；新增文件从基线 rootNames 排除。完整逐条诊断见 [typecheck-comparison.json](typecheck-comparison.json)。

| 既有文件 | 数量与位置 |
| --- | --- |
| packages/spark-data/src/tests/cascade-computed-tree.test.ts | 1：123，级联联合类型未收窄 |
| packages/spark-data/src/tests/cascade-event-filter.test.ts | 1：58，旧 dependencyType 类型 |
| packages/spark-data/src/tests/data-view/computed-query.test.ts | 12：11、88、117、282、344、388、411、445、448、458、473、481；稀疏权限夹具、只读类型及可选值 |
| packages/spark-data/src/tests/dataset/dataset-crud-tool.test.ts | 1：463，级联联合类型未收窄 |
| packages/spark-data/src/tests/dataset/dataset-json-prompt-validation.test.ts | 4：615—618，级联联合类型未收窄 |
| packages/spark-lowcode-api/src/platform/data-space/runtime/tests/data-space-model-alias.test.ts | 2：109 的 undefined 行、288 的隐式 any；正式命令输出见 [api-typecheck.log](api-typecheck.log) |

基线与当前分别为 19→19、0→0、2→2；诊断逐项相同，新增 0。**包级类型检查尚未全绿**；本轮未修改这些旧测试，不将它们隐藏为“所有门禁通过”。

## 交付边界

- 主文档记录完整数据空间主线，区分当前事实和未接通能力；历史调研/验收不被覆盖成新事实。
- 生产变更限定纯请求配置 SSOT；公开 api/crudConfig 签名、原查询权限、端点默认值、批次保护、值级联与字符串兼容保留。
- 本人进行差异复核，无独立代理审查；未发现本轮新增未解决缺陷。
- 未重新验证在线数据空间整页，未修改 Java、数据库、场景远端文件，未提交推送。fromJson 兼容、旧关系映射入口及视图属性清单等后续队列保留，不宣称全仓清零或线上零回归。
