# C1c 修改前证据

- 当前 HEAD：`0b6c85d9979205cf733da8b0ba663c63e89ec395`。工作树有先前 C1a/C1b 修改和证据，均按派工保留；未见其他对 `vite.config.ts` 的改动。
- 修改前 `vite.config.ts` 的手工分组将 `views/tenant/Settings` 与 `views/tenant/TenantConfig` 返回为 `pages-config`。
- 原始页面文件已复制到 [baseline-index.html](./baseline-index.html)。该文件的 modulepreload 含 `/js/pages-config-B_FCIesS.js`，CSS 含 `/css/pages-config-CD4BtL1i.css`。
- 主控首轮构建的原始证据在 `../c1b/build.log` 和 `../c1b/build-result.json`：build exitCode 0；`pages-config-B_FCIesS.js` 为 1,434.39 kB（gzip 425.07 kB）。该 chunk 收入静态共享依赖是本轮只移除 Settings 手工分组的依据。
- 已完整阅读 `src/views/tenant/Settings.vue`。其直接 imports 包含 `@/registries/vue-page-registry`、`@/lowcode/lowcode-runtime`、`@/services/project/project-shell`、`@spark-appworks/spark-app`、`@spark-appworks/spark-component` 和 `package.json`；页面本身由 vue-page-registry 按需加载。
