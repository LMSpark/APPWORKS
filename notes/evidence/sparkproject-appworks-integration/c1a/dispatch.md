# C1a 执行委派

## 授权与范围

用户已批准实施计划并明确要求低阶模型执行、主控派工与验收。当前执行 C1a：页面注册表按需装配和失败呈现。已完成之前的研读确认和八项澄清，不重复询问用户。主计划 `D:/SPARK_AppWorks/notes/plan-appworks-control-plane-integration.md` 状态 implementing；本文件是本轮完整执行切片，避免加载整个历史。

工作目录 D:/SPARK_AppWorks；HEAD 0b6c85d9979205cf733da8b0ba663c63e89ec395；分支 feat/agent-workflow-node-contract；开始时 tracked 无改动、无 Git index/HEAD 锁。主控已运行 typecheck 基线并保留 typecheck-before-result.json。首次修改前确认其 exitCode 为 0。

仅允许修改：
1. src/registries/vue-page-registry.ts
2. src/components/page-loading/PageLoadError.vue（新增）
3. tests/app/config/vue-page-registry.test.ts

允许额外写本目录的执行日志和 report.md，不能改其他代码、配置、依赖、主计划或知识。禁止 commit/push/建分支、并行代理、扩范围、公共测试专用 API、批量格式化。发现超范围需求则给主控报告具体原因和最小建议。

## 现状与依赖

完整读取修改文件当前内容与适用 AGENTS.md。只读调用面：src/main.ts（await buildComponentMap），src/App.vue（router-view 组件消费），packages/spark-app/src/router/dynamic.ts（componentMap 消费），config/navigation/vue-pages.json（既有正式路径和 source），packages/spark-app/src/app/error-handler.ts，src/components/ErrorFallback.vue。无需读其他业务页全部实现。

目前 buildComponentMap 在启动 Promise.all 调用每个 entry.load。页面来源通过 import.meta.glob('../views/**/*.vue')，配置在模块初始化时严格校验。getVuePageEntry 暴露的 entry.load 可供测试 spy；不要为测试增加生产导出。多个配置 path 可指向同一 source（CacheManager、DBMS 等）。旧注册表测试只验证元数据。

全局 error handler 主要记录日志，现有 ErrorFallback 是“应用启动失败”整屏界面。C1a 新增精简页面模块加载错误 UI，保留外层宿主可操作，不复用错误语义。编译扫描仍可能静态加载 views，这属于 C1b，禁止混入 C1a。

## 实现约束与验收

- 用 Vue defineAsyncComponent 创建按 source 复用的包装组件；构建 map 时不执行任何页面 loader，挂载目标后只执行该 loader。两个路径共享包装/模块加载状态，但独立挂载产生独立业务状态。
- 保持 Promise<Record<string, Component>> 返回、既有 config 校验和路径元数据。不保留无 await 的 async 触发 require-await；可用 Promise.resolve().then 保留同步错误转 rejection。
- PageLoadError.vue 采用 script setup、当前样式/Element Plus，显示页面加载失败、错误信息和“重新加载”入口；按钮重新加载当前页面，不加自动重试或通用业务错误吞并。
- 不引入新的 UI 库、可选配置、registry/factory 抽象或全局 runtime。复用包装的缓存仅限本次 map 构建所需，不与业务实例状态混用。
- 遵守严格类型，不用 any、非 as const 类型断言、eslint-disable、机械 interface、公共 helper。注释只补必要契约，别写长文档。
- 新组件目录 1 源文件，父 src/components 当前 4 文件/0 子目录，不超目录门禁。

## 验证顺序

先读 superpowers:test-driven-development 的必要部分并执行：先在现有注册表测试写有意义的行为测试并立即运行，记录 RED 的预期断言失败；不能把无法导入新文件/网络副作用当有效 RED。可先验证 build map 不调用 loader 的断言；生产改动后每次立即运行对应最小测试。

测试至少覆盖：原元数据；构建零加载；挂载一个只加载一个；同 source 别名共享模块且独立组件状态；失败可见、错误传递、重新加载动作。不依赖真实页面所有业务请求；测试通过 spy/mock 边界 loader 返回小 Vue 组件，真实挂载异步包装，不能只测 mock 或内部私有属性。恢复所有 mocks/global 并 unmount。

最小命令：pnpm exec vitest run tests/app/config/vue-page-registry.test.ts --maxWorkers=1 --reporter=dot

GREEN 后：
- pnpm run typecheck
- pnpm exec eslint src/registries/vue-page-registry.ts src/components/page-loading/PageLoadError.vue tests/app/config/vue-page-registry.test.ts
- pnpm exec vitest run tests/runtime/auth-nav/dynamic-router-platform-pages.test.ts tests/runtime/auth-nav/navigation-platform-paths.test.ts tests/auth-nav/dynamic-router-platform-pages.test.ts tests/auth-nav/navigation-platform-paths.test.ts --maxWorkers=1 --reporter=dot
- pnpm run verify:ai-codegen
- pnpm run verify:dirs

长输出重定向到本目录，读末尾并记录命令、exitCode 和结果。主控负责最终 diff、浏览器和必要集成检查；你不要运行全量包测试/全套门禁来重复消费，不在测试已经通过后反复运行。

## 回报

主控验收补充：直接 async route 组件出现 Vue Router warning，采用同步具名路由宿主包裹异步页面，转发 attrs/slots。真实 RouterView 导航测试必须先复现再消除该 warning。仍限三文件，不改变 Component 映射合同。

写 report.md：修改文件/行为；RED/GREEN 命令、退出码和测试数；typecheck/lint/定向回归/门禁；遇到问题及处理；未决事项/潜在风险。最终消息简短，只给状态、文件、关键验证结果和 report 路径。不复制全部日志，不自称全量集成完成。
