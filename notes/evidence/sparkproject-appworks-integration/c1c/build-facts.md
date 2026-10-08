# C1c 构建产物事实

## 修改前

- `baseline-index.html` modulepreload: `rolldown-runtime-Cyuzqnbw.js`, `element-plus-components-a-i-v7DIwDjy.js`, `element-plus-components-j-r-CnIl9utZ.js`, `pages-config-B_FCIesS.js`。
- 首轮构建 `../c1b/build.log` 将 `pages-config-B_FCIesS.js` 报为 1,434.39 kB（gzip 425.07 kB）。

## 移除 Settings/TenantConfig 手工 chunk 后

- 新 `dist/index.html` 的 modulepreload 不包含 `pages-config` 或 `Settings` chunk。
- Settings 产物独立为 `dist/js/Settings-DGplqP0P.js`（13.91 kB，gzip 4.44 kB）；Vite 也输出 `dist/js/vue-page-registry-t0nmxhCm.js`（15.63 kB）及 `dist/js/spark-lowcode-api-DzFmavxG.js`（104.97 kB）。
- 新入口仍 preload `pages-data-heavy-CwKOCmBI.js`（1,296.61 kB）。`vite.config.ts` 的这轮改动没有触碰该既有手工分组；这项可能提前加载应结合主控冷启动链路单独判断。
- 原始完整构建 stdout/stderr 在 `vite-build.log`，命令与 exitCode 在 `vite-build-result.json`。本摘要不复制大型 bundle。

## 移除第二处页面手工分组后的最终构建

- 修改前的中间失败入口副本为 [intermediate-index-pages-data-heavy.html](./intermediate-index-pages-data-heavy.html)，含 `pages-data-heavy-CwKOCmBI.js` modulepreload。
- 最终入口副本 [final-index.html](./final-index.html) 不含 `pages-config`、`pages-data-heavy`、Settings、Dashboard、CapabilityDemo、TenantConfigPanel、DBMS 或 WorkflowDesigns chunk 的 modulepreload。它仍显式 preload `vue-page-registry`、`spark-lowcode-api` 及若干公共运行时/vendor chunk。
- 最终独立页面 chunk：Dashboard 3.52 kB、Settings 13.91 kB、CapabilityDemo 6.46 kB、TenantConfigPanel 8.39 kB、DBMS 41.61 kB、WorkflowDesigns 116.16 kB。完整 build 记录见 `vite-build-final.log`，exitCode 见 `vite-build-final-result.json`。
