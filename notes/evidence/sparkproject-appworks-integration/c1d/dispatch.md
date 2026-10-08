# C1d UI 插件模块导出边界

用户授权低阶模型实施、主控决断。主控已补入主计划；只改以下两文件：
1. packages/spark-app/src/shell/plugins/presets.ts
2. packages/spark-app/src/shell/plugins/__tests__/presets.test.ts（新增）

不得改 guards、registry、依赖或其他 C1 代码，不新增公开 API，不提交/建分支。只额外写本目录日志和报告。

## 已确认事实

主控完整读 presets、registry、registry.test.ts 和 guards 的 readProperty 实现。生产 preview 首页 console 有两个错误：element-plus / vxe-table 未提供有效的 Vue Plugin 默认导出。presets requireDefaultPlugin 用 readProperty(module,'default')；utils readProperty 为 Object.getOwnPropertyDescriptor(...).value，不执行 getter。Rolldown 将 dynamic import namespace 变成 getter exports，因此默认导出被误读成 undefined。HEAD 已有同样读取方式，属于本次生产验收发现的旧缺陷；不能通过改通用安全读取合同解决。

## 最小修正

完整重读当前 presets.ts；在可信包模块边界通过 isRecord 窄化后正常读取 module['default']，保持原默认导出/模块本身两种已有合法 Plugin 形态和无效时 throw。isVuePlugin 中 install 若也为 getter 应按 Vue Plugin 对象合同正常读取验证。不允许 any/断言/反射绕行/禁用 lint；不用新 helper 导出。必要一行注释解释 namespace getter。

## 验证与证据

用公开 registerBuiltinPlugins + getGlobalPluginRegistry().get(id).loader() 测试，不导出 requireDefaultPlugin。通过 vi.mock 的 getter module fixture 证明原实现失败（真实默认 getter，不是自己直接测试 fixture）；覆盖两个内置 loader 合法 getter Plugin、非法默认导出拒绝。验证注册名/defaultOptions 保持；全局 registry 和 mocks 清理避免污染 registry.test。如 mock proxy 把 getter变data导致无效 RED，报告，不能把人为 throw 当有效 RED。

先新增测试并立即 `pnpm exec vitest run packages/spark-app/src/shell/plugins/__tests__/presets.test.ts --maxWorkers=1 --reporter=dot` 保存 red.log + result.json；生产修改后立即同命令 GREEN。首次读/改以及每次改后遵守最小验证。

GREEN 后依次：pnpm run typecheck；`pnpm exec eslint packages/spark-app/src/shell/plugins/presets.ts packages/spark-app/src/shell/plugins/__tests__/presets.test.ts`；`pnpm exec vitest run packages/spark-app/src/shell/plugins/__tests__/registry.test.ts --maxWorkers=1 --reporter=dot`；`pnpm run verify:ai-codegen`；`pnpm run verify:dirs`。所有命令原始输出重定向至本目录，记录真实退出码。主控负责最终完整 build 与浏览器验收，你不重复运行。

完成本目录 report.md，声明源码冻结。出现超范围问题报告主控，不扩大修改。
