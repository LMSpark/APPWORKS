# C1c 修复设置页手工分包造成的提前加载

用户已授权实施、低阶执行和主控按长期利益决断。主控现把组合构建发现的可复现问题补入主计划。只修改 D:/SPARK_AppWorks/vite.config.ts 的 pages-config 手工分组，其他 C1a/C1b 改动保持。禁止改依赖、业务代码、其他 chunk 分组、测试/配置文件、提交/分支。

主控二次产物验收补充：只移除 pages-config 后，Settings 已独立，但 `pages-data-heavy` 仍被首屏 preload，Dashboard/CapabilityDemo 的页面手工分组存在同一依赖闭包问题。因此本闭环精确范围更新为移除 **pages-config 与 pages-data-heavy 两处页面分组及过时的页面分组说明**，其他 vendor/core 分组仍不动。改第二处前保存现有产物 index 摘要作为中间失败证据；立即再次 build，然后对 Dashboard、CapabilityDemo、Settings、DBMS、WorkflowDesigns 统一做静态入口/冷启动验收。这个补充优先于后文只删一个分支的最初范围。

## 依据

- 主控 build exit0 但 dist/index.html 静态 modulepreload pages-config-B_FCIesS.js；内含 Settings 以及 registry/lowcode-runtime。
- src/views/tenant/Settings.vue 静态导入 vue-page-registry 和 lowcode-runtime；后者也静态导入 registry，而启动 main 静态消费 lowcode-runtime。当前 manualChunks 将 Settings 放入 pages-config 时将共享模块卷入，启动经共享依赖带上 Settings。
- C1a 已零主动 loader、C1b 已 views 动态 import。仅移除这条 pages-config 页面手工分组，让打包器按真实动态边界拆分；不借改名/增加 chunk 隐藏提前请求。

## 工作和验证

先完整重读 vite.config.ts，完整阅读 Settings.vue 和其直接依赖导入区域，git status/HEAD 确认无并发改动。主控已保留 ../c1b/build.log 和 build-result.json（首个组合构建）；请在本目录保存原 dist/index.html 和产物名/对应文本特征的简短事实，不复制整大 bundle。

只删除返回 pages-config 的 if 分支及其对应注释（~4行），随后立即运行 `pnpm exec vite build` 保存原始日志及 result JSON。观察产物 index.html 不再 preload pages-config，Settings 独立 chunk 存在；若首屏仍提前加载设置页，报告真实链条，不扩大修改。

GREEN 后 `pnpm run typecheck`；`pnpm exec vitest run tests/app/config/vue-page-registry.test.ts tests/app/config/spark-components-loading.test.ts --maxWorkers=1 --reporter=dot`；`pnpm run verify:deps`。这些日志每项均重定向至本目录并保存退出码，不以报告文字替代命令输出。

root ESLint 现有规则忽略 vite.config.ts，报告该覆盖边界，不改 ignore、不对该历史文件大范围清理。主控负责最后浏览器冷启动/点击目标验收和是否需要最终完整 build。完成后本目录 report.md，明确源码已冻结。
