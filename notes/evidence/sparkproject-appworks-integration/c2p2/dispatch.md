# C2p2：导航读取的执行身份快照（已派工，主控验收中）

只改 `src/lowcode/lowcode-runtime.ts`（readLowcodeRuntimeNavigation 范围）及 `tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts`；另可写本目录证据。不新增公开 API/依赖/配置/其他代码，不提交，不派子代理。必须等主控明确派工才实施。

## 源码事实

完整读上述文件，再只读 LowcodeApi.readRequestScope、LowcodeSessionStore、LowcodeApplicationStore、LowcodeProjectBlueprintApi.readRecords/readNavigationAuthorization、DataSpaceRuntimeApi.query、project-settings.ts 的 loadProjectRuntimeSettings。

records 经 dataSpace query 有 scope fence，authorization 只经 LowcodeClient request；records 先完成、授权后完成，中间换身份/应用时 assembly 仍可能使用旧组合。显式 projectId 是被管理目标，与执行应用不同可以合法；不写新默认应用或临时切应用。catalog 无 app 是本地早返回，不能调用 readRequestScope。stores 的 revision 可读，application.save 同 id 更改 navigationRootId 不递增 revision，故还需核对根身份；session 正常 refresh 沿用 identity/enterprise 引用，revision 不变。

## 方案

保留 catalog 快路径。对实际远端读取，在开始时捕获 session/application revision 与 current application id/enterprise/root 的值快照；每个 await 后核对，失败也在当前边界核对。执行域改变时抛 `SPARK_EXECUTION_SCOPE_STALE`，不得发后续步骤、组装或返回旧导航。scope 未变时保留原请求错误。必要私有局部闭包可以使用，不导出新 helper/contract，不记录 token/密码。合法显式跨应用目标不需等于 selected app；只是本次执行身份不能在读取中变化。

开始与核对可用现有 session/application get/revision/isAuthenticated；不能从头到尾强行要求 app 必选而破坏 catalog。实际异步读取已有底层认证要求，过期/失效应显式失败，合法 token refresh 不能误判 stale。

## 行为验证

用真实低层 stores、vi.spyOn 现有 API 方法和 deferred 网络边界；不 mock 整个 lowcode-runtime 模块。隔离/还原会话和应用状态，所有 mock afterEach 还原，不向证据保存真实账号数据。

- 有效 RED：records 已完成、authorization 等待；切应用后授权返回必须 reject stale。
- session clear/重登录、应用 A→B→A（最终同 ID 但 revision 变化）、同应用导航根更改，均不得返回旧结果。
- 显式目标 B、当前执行 A 且稳定：向 B 读取 records/auth，结果 projectId B，不改 current A。
- listApplications 或 resolveNavigationRootId 等待期间失效后，后续读取不发生。
- 同身份 token refresh（保持 identity/enterprise 引用）、稳定当前应用正常返回。
- 无 app、无显式目标 catalog 早返回，不发网络、不调用 readRequestScope。
- 同域请求错误原样传播；换域后晚失败显式 stale，不回空导航。

首改测试立即最小 RED，再生产局部变更后最小 GREEN。完成 typecheck、两文件 ESLint、根 auth-nav 回归、verify:ai-codegen、verify:dirs。日志重定向保留命令/时间/cwd/exitCode JSON。主控负责组合验证，执行者不全量 build。源码冻结后报告。

## 主控边界复核

内部 async helper 检查后仍可能在外层 await 恢复前切域，故目录、根解析及 Promise.all 外层恢复后须直接检查，最终错误出口也检查。已有 readRequestScope().token 可作为统一身份快照，另核对 navigationRootId；catalog 仍先返回。测试用 deferred promise 的完成及微任务排序触发，不依赖 application.get 内部调用次数；临时移除对应外层检查应真实 RED，恢复后 GREEN。
