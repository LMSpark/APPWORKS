# C1c 执行报告：页面手工分组导致的提前加载

## 实施结果

只修改了 `vite.config.ts`：移除 Settings/TenantConfig 的 `pages-config` 手工分组和 Dashboard/CapabilityDemo 的 `pages-data-heavy` 手工分组及对应旧页面分组说明。其他 core/vendor 分组未改，C1a/C1b 文件也未改。

移除第一处后构建虽成功，但中间产物仍在入口 modulepreload 中带入 `pages-data-heavy`（1,296.61 kB），故按主控修订后的闭环删除第二处并再次构建。最终 `dist/index.html` 不含 `pages-config`、`pages-data-heavy` 或目标页面 chunk 的 modulepreload。最终产物为独立 chunk：Settings 13.91 kB、Dashboard 3.52 kB、CapabilityDemo 6.46 kB、TenantConfigPanel 8.39 kB、DBMS 41.61 kB、WorkflowDesigns 116.16 kB。最终构建输出 2912 modules，built in 2.18s。

最终 index 仍 preload 共用 chunk：rolldown runtime、Spark AI、Element Plus 组件、Spark app、PageLoadError、vue-page-registry 和 spark-lowcode-api。目标页面组件 chunk 未列在入口 preload；浏览器冷启动及点击页面验收由主控完成。

## 验证

最终源码版本的门禁均退出 0。每条命令的完整重定向日志和 exitCode JSON 都在本目录：

| 命令 | 结果文件 | 关键结果 |
|---|---|---|
| `pnpm exec vite build` | [vite-build-final-result.json](./vite-build-final-result.json)、[vite-build-final.log](./vite-build-final.log) | exitCode 0；2912 modules；独立页面 chunk；built in 2.18s |
| `pnpm run typecheck` | [typecheck-final-result.json](./typecheck-final-result.json)、[typecheck-final.log](./typecheck-final.log) | exitCode 0 |
| `pnpm exec vitest run tests/app/config/vue-page-registry.test.ts tests/app/config/spark-components-loading.test.ts --maxWorkers=1 --reporter=dot` | [focused-tests-final-result.json](./focused-tests-final-result.json)、[focused-tests-final.log](./focused-tests-final.log) | exitCode 0；2 files、7 tests passed |
| `pnpm run verify:deps` | [verify-deps-final-result.json](./verify-deps-final-result.json)、[verify-deps-final.log](./verify-deps-final.log) | exitCode 0；`dependency catalog: ok` |

## 过程证据与边界

- 修改前入口文件为 [baseline-index.html](./baseline-index.html)：modulepreload 包含 `pages-config-B_FCIesS.js`。移除 pages-config 后、发现 pages-data-heavy 仍提前加载的中间 index 保存在 [intermediate-index-pages-data-heavy.html](./intermediate-index-pages-data-heavy.html)。最终入口文件为 [final-index.html](./final-index.html)。产物对照见 [build-facts.md](./build-facts.md)。
- 第一轮只删除 pages-config 的真实 build 输出及其 result JSON 保存在 [vite-build.log](./vite-build.log) 和 [vite-build-result.json](./vite-build-result.json)，用于保留该中间闭环为何不足的证据。
- 本轮 build/typecheck/tests/deps 均将 stdout/stderr 实际重定向至日志文件，并保存命令、开始/结束时间和退出码 JSON。
- 未改 ESLint ignore 规则。当前项目规则会忽略 `vite.config.ts`，按派工未为该历史文件扩大 lint 清理范围。
- 主控仍负责最终浏览器冷启动与目标页面点击验收；本报告不声称已通过该人工验收。源码已冻结，未提交。
