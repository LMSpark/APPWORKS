# C1d 执行报告：Vue 插件模块 getter 导出边界

## 修改与结果

- `packages/spark-app/src/shell/plugins/presets.ts`：在可信包模块边界由 `isRecord` 窄化后直接读取 `module['default']`，让动态 import namespace 的 getter 正常求值；`isVuePlugin` 也直接读取 `install`，兼容 getter。保留默认导出优先、模块自身为 Plugin 的回退及非法值报错。移除不再使用的 `readProperty` import。
- `packages/spark-app/src/shell/plugins/__tests__/presets.test.ts`：只经公开 `registerBuiltinPlugins` 和全局 registry loader 验证两个内置插件。Getter 默认导出 fixture 通过真实动态 import namespace 加载；覆盖 Plugin 的 getter `install`、非法默认导出、注册名及 defaultOptions。每个测试前后清理全局 registry。

## RED → GREEN

- 派工原命令从仓库 root 运行时，root Vitest `include` 不覆盖 `packages/**/src/shell/plugins/__tests__`，exitCode 1 / `No test files found`。尝试加包级 config 但仍从 root 传 root-relative filter，也因 config root 不同未找到测试。两次命令结果保存在 `red.log` 与 `red-effective.log`，都不是有效 RED。
- 有效 RED 使用包目录当前已存在的 Vitest config：`pnpm exec vitest run src/shell/plugins/__tests__/presets.test.ts --maxWorkers=1 --reporter=dot`，working directory `packages/spark-app`。结果 2 个 getter loader 测试失败，均抛出“未提供有效的 Vue Plugin 默认导出”；注册信息和非法默认导出用例通过。命令和原始输出在 [red-effective2-result.json](./red-effective2-result.json)、[red-effective2.log](./red-effective2.log)。
- 修复过程的非法 fixture 遇到 Vitest mock 对未声明 `install` named export 的 Proxy 错误，其保留的失败日志为 `green-attempt2.log`（`green.log` 记录的是后续 4/4 通过）。将 mock 的 `install` named export 固定为 `undefined` 后，默认导出和 `install` getter fixture 均保留；最终测试通过 4/4。无生产 catch、反射或通用 guard 变更。

## 最终验证

以下所有命令均已重定向保存原始输出，并各有结果 JSON：

| 命令 | exitCode | 结果文件 |
|---|---:|---|
| `pnpm exec vitest run src/shell/plugins/__tests__/presets.test.ts --maxWorkers=1 --reporter=dot`（cwd `packages/spark-app`） | 0 | [green-final-result.json](./green-final-result.json)、[green-final.log](./green-final.log)，4 tests passed |
| `pnpm run typecheck` | 0 | [typecheck-result.json](./typecheck-result.json)、[typecheck.log](./typecheck.log) |
| `pnpm exec eslint packages/spark-app/src/shell/plugins/presets.ts packages/spark-app/src/shell/plugins/__tests__/presets.test.ts` | 0 | [eslint-result.json](./eslint-result.json)、[eslint.log](./eslint.log) |
| `pnpm exec vitest run src/shell/plugins/__tests__/registry.test.ts --maxWorkers=1 --reporter=dot`（cwd `packages/spark-app`） | 0 | [registry-test-result.json](./registry-test-result.json)、[registry-test.log](./registry-test.log)，19 tests passed |
| `pnpm run verify:ai-codegen` | 0 | [verify-ai-codegen-result.json](./verify-ai-codegen-result.json)、[verify-ai-codegen.log](./verify-ai-codegen.log)，971 files checked |
| `pnpm run verify:dirs` | 0 | [verify-dirs-result.json](./verify-dirs-result.json)、[verify-dirs.log](./verify-dirs.log)，directory limits ok |

主控负责最终完整 build 与浏览器验收，本代理没有重复运行。源码已冻结；只改派工指定两个文件，未提交。
