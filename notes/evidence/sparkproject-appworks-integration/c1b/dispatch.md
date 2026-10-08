# C1b 编译扫描页面按需加载

## 授权与范围

用户授权低阶模型实施，主控派工与验收并按长期利益决断。总体八项前提已确认；主计划 notes/plan-appworks-control-plane-integration.md 为 implementing。本文件是完整执行切片，不需加载聊天历史或全部计划。

在 D:/SPARK_AppWorks 工作；HEAD 应为 0b6c85d9979205cf733da8b0ba663c63e89ec395。当前已有 C1a 的 registry、PageLoadError 与测试改动，均保留。不得重置/暂存他人改动；不要 commit/push/建分支。仅修改以下四文件：

1. tools/vite-plugin-spark-components.ts
2. packages/vite-plugin-spark-catalog/src/scan-config.ts
3. vite.config.ts
4. tests/app/config/spark-components-loading.test.ts（新增）

可写本目录日志/result JSON/report.md。禁止其他文件、依赖、公共 barrel、类型断言/any/eslint-disable、公共测试 helper 和额外代理。

## 源码研读与实现

修改前完整读四文件当前内容和 AGENTS.md；只读相关 tests/vitest-setup.ts、vitest.config.ts、packages/vite-plugin-spark-catalog/src/index.ts、utils.ts、knowledge/vue-frontend.md、knowledge/monorepo-dependencies.md。C1a registry 当前不调用 loader，但 virtual:spark-components 仍按文件名/大小将小 views 静态导入，必须切断这个独立链条。

- 插件 options 新增 asyncPathPrefixes?: string[]，默认 []；集中 scan-config 声明 ASYNC_PATH_PREFIXES=['src/views/'] as const，vite.config 直接导入传参。
- ComponentAnalyzer.determineStrategy 增加 root-relative path（总位置参数仍 <=3）。文件与前缀统一反斜杠到 /，去前导 ./，补目录末尾 /，确保 views-other 不误中。输入语义是相对 root 的目录前缀，不是 glob；不引入匹配依赖或通用抽象。
- 判定顺序：显式 syncComponents > asyncPathPrefixes > 原 asyncComponents > 原 sizeThreshold > sync。既有扫描列表/排除/注册名称/has guard 不变。
- 不扩公共 barrel，vite.config 已直接消费 scan-config。保持原有风格，只增必要契约注释，不顺手清理旧 logger 的 any 等历史问题。
- 每次实质修改后立即对应最小验证。重读后发现前提变化给主控报告，别硬套。

## 验证

C1a 最终 typecheck 已通过，基线见 ../c1a/typecheck-after-result.json；不重复基线全套。

先写真实插件输出的行为测试并运行 RED；可从“当前配置的 views 小组件仍被静态导入”得到有效失败，不用缺导出/编译报错作 RED。通过 createServer({configFile:false,root:临时目录,plugins:[sparkComponentsPlugin(...)]...}) 运行真实 Vite hooks，取得 virtual module load 结果；用无端口 middleware/test server，关闭 watcher/server 并清理本测试临时目录。不要 mock 插件内部或暴露 analyzer。

临时 SFC 夹具覆盖：小页面及嵌套页面动态导入；显式同步核心优先；src/views-other 邻目录同步；非页面默认与原名称/大小策略；排除不变；注册名和 registry.has 不变；前缀 ./ 和反斜杠规范化。断言生成的真实 import/registration 语义而非配置字符串。

先运行：pnpm exec vitest run tests/app/config/spark-components-loading.test.ts --maxWorkers=1 --reporter=dot

GREEN 后仅运行：
- pnpm run typecheck
- pnpm exec eslint tools/vite-plugin-spark-components.ts packages/vite-plugin-spark-catalog/src/scan-config.ts vite.config.ts tests/app/config/spark-components-loading.test.ts
- pnpm exec vitest run tests/app/config/vue-page-registry.test.ts --maxWorkers=1 --reporter=dot
- pnpm run verify:deps
- pnpm run verify:dirs

先从 package.json 核实 verify:deps 实际命令名，不存在则报告并采用现有依赖门禁名。保留命令、exitCode、日志，不跑完整 build/全套测试；主控负责组合 build 和真实冷启动。

## 回报

report.md：文件/行为、有效 RED 和 GREEN、各门禁退出码、失败处理、已知限制。两次同类失败及时交主控诊断，控制消耗。完成消息只给结论和报告路径，不称整个 AppWorks 已完成。
