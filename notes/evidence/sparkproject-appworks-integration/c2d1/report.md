# C2d1 冻结报告

状态：冻结待主控复审

仅在 dispatch 限定的 4 个代码/测试文件内完成应用选择 list→root→save 隔离。`selectApplication` 在首次 root await 前复制并冻结输入对象 7 个标量字段，阻止调用方后续修改破坏 application/root 配对。两个公开入口在 commit helper 成功返回后检查 receipt；失败返回时重新检查原 fence，若错误仍有效则原样透传，若已有更新意图则转为 stale。runtime wrapper 在 platform facade 完成后、外层 await 恢复前发生 scope 变更时再次检查 receipt。登录/登出在网络等待期间也同步撤销未完成选择。

## 本轮复审修正与证据

- `outer-failure-red.*`：两个入口的旧行为均以原始 root 错误结束，未观察到 await 恢复前启动的新意图；加入 catch fence 复核后，`outer-failure-green.*` 2/2 通过。
- `runtime-wrapper-red.*`：临时移除 wrapper receipt 检查后，新测试实际返回 APP-B 而非 stale；恢复实现后 `runtime-wrapper-green.*` 通过。测试将真实 `platform.activateApplication` 绑定为 original，仅在 receipt 返回后排入 scope 变更 microtask。
- 新增 mixed entry（select↔activate）、当前/已过时目录错误，以及 login/logout 网络请求未结束时 root pending 的行为覆盖。
- activate 的成功外层 await 测试等待 `resolveNavigationRootId` 确实启动后才 resolve deferred。

## 最终验证

| 检查 | 结果 | 证据 |
|---|---|---|
| 平台 API 定向测试 | 31/31 通过 | `platform-review-final.stdout.log`、`.result.json` |
| runtime 导航定向测试 | 26/26 通过 | `runtime-review-final.stdout.log`、`.result.json` |
| 根 typecheck | exit 0 | `root-typecheck-review-final.*` |
| spark-lowcode-api package typecheck | exit 0 | `package-typecheck-review-final.*` |
| 定向 ESLint（两个 production 文件，max-warnings=0） | exit 0 | `production-lint-review-final.*` |
| ai-codegen 规则门禁 | exit 0，扫描 975 文件 | `ai-codegen-review.*` |

之前记录的第一轮真实 RED/GREEN 日志保留在本目录。根全量、build、browser 按 dispatch 未运行，留给主控验收；目录 normalizer 已按 rowid 去重，本切片没有声称检查 backend 原始重复行。最终4文件 SHA-256 见 `sha256-final.json`。保留了工作区既有 C1–C2c 修改；未 commit、push、建分支或引入依赖。
