# C1b 执行报告：编译扫描页面按需加载

## 修改与行为

- `tools/vite-plugin-spark-components.ts`：增加 `asyncPathPrefixes`（默认空数组），按 root-relative 路径前缀选择异步加载；策略顺序为显式同步、路径前缀、显式异步、体积阈值、默认同步。路径和前缀统一分隔符、去除前导 `./`，前缀补目录分隔符。
- `packages/vite-plugin-spark-catalog/src/scan-config.ts`：集中声明 `ASYNC_PATH_PREFIXES = ['src/views/']`。
- `vite.config.ts`：将集中配置传入插件。
- `tests/app/config/spark-components-loading.test.ts`：通过真实 Vite middleware-mode server 加载 virtual module，覆盖集中配置和 `./`/反斜杠前缀、小页面及嵌套页面、显式同步优先、邻接 `src/views-other`、名称与大小策略、排除、注册名和 `registry.has`；另验证未配置路径前缀时小页面仍默认同步。临时目录由 `mkdtemp` 创建并在测试清理。

## RED → GREEN

- 初次测试启动扫描后触发 Windows watcher 原生断言 `src\\win\\fs-event.c:72`，worker 异常退出（exitCode 1）；属于测试服务器 watcher 环境问题，不计为有效 RED。测试 server 改为 `watch: null` 后重跑。
- 有效 RED：真实 virtual module 中 `src/views/SmallPage.vue` 仍生成静态 import，目标行为断言失败（exitCode 1）。同次输出也显示小页面、嵌套页和 `src/views-other` 均为同步导入。
- 加入策略后 GREEN：测试通过（exitCode 0）。最终参数化测试覆盖真实集中配置及路径规范化，并通过无路径配置默认同步用例（2 tests passed）。

## 最终验证

| 命令 | exitCode | 结果 |
|---|---:|---|
| `pnpm exec vitest run tests/app/config/spark-components-loading.test.ts --maxWorkers=1 --reporter=dot` | 0 | 2 tests passed；真实插件扫描与 virtual module load |
| `pnpm run typecheck` | 0 | `vue-tsc --noEmit --skipLibCheck -p tsconfig.typecheck.json` |
| `pnpm exec eslint tools/vite-plugin-spark-components.ts packages/vite-plugin-spark-catalog/src/scan-config.ts vite.config.ts tests/app/config/spark-components-loading.test.ts` | 0 | 0 errors；ESLint 按现有 ignore 规则忽略插件文件和 `vite.config.ts`，给出 2 条 ignored warnings |
| `pnpm exec vitest run tests/app/config/vue-page-registry.test.ts --maxWorkers=1 --reporter=dot` | 0 | 5 tests passed |
| `pnpm run verify:deps` | 0 | `dependency catalog: ok` |
| `pnpm run verify:dirs` | 0 | `directory limits: ok` |

## 失败处理与边界

- watcher 原生断言仅出现一次；禁用该 middleware-mode 测试 server 的 watcher 后，测试能稳定运行并产生有效 RED/GREEN。
- ESLint 对两项既有 ignore 路径产生警告，目标测试及 scan-config 未报 lint 错误。
- 实施时本代理未运行完整 build、全量测试或浏览器冷启动；主控组合验收正在独立运行并由主控记录。
- 未改动 C1a 文件；未提交或暂存更改。

## 补充证据索引

- [validation-result.json](./validation-result.json) 与 [validation-summary.log](./validation-summary.log) 保存从本会话保留工具结果重建的 focused RED/GREEN 及各门禁命令、exitCode 和关键输出。它们明确标为摘要，不能替代完整原始 stdout/stderr；实施期间未落盘逐命令原始日志。
- 主控组合 build 的原始记录为 [build.log](./build.log) 和 [build-result.json](./build-result.json)：`pnpm run build` exitCode 0；2912 modules transformed，`pages-config-B_FCIesS.js` 1,434.39 kB（gzip 425.07 kB），built in 2.75s。主控另报告 `dist/index.html` modulepreload 引用了该 chunk，且 chunk 仍含 registry、lowcode-runtime、Settings 静态依赖；这是后续 C1c 处理的分包问题，不改变 C1b 行为测试通过这一事实。
- 主控的 root tests 正由主控独立验收并记录；不从正在写入的日志读取或推断结果。
