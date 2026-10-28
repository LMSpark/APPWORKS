# 剩余应用目录消费者：只读合同审计与 RED

日期：2026-10-28
范围：`loadProjectRuntimeSettings` 与 `createLowcodeProjectGateways().projectReferences.listProjects`。只添加测试和证据，不修改产品源码、Java、ClassModel 生成物或唯一台账；未运行包测试。

## 现状与可达性

- `src/services/project/project-settings.ts::loadProjectRuntimeSettings(tenantId, projectId)` 先要求 `lowcodeApi.session.get()?.enterprise.shortName === tenantId`，然后用 `lowcodeApi.platform.listApplications()` 返回的整个目录按 id 找项目，再读目标导航。守卫表达的是租户路由值与当前登录会话企业短名一致；它没有证明目录行属于该企业，也不应被解释为权限授权。实现没有请求 scope 捕获或两个异步读取后的调用者有效性复核。
- 设置服务唯一 UI 引用在 `src/views/tenant/AppProjectSettingsDialog.vue::loadSettings`。`AppList.vue::openSettings` 当前只弹“写入合同未就绪”提示，`settingsTarget` 未赋值；对话框实际不可达。因此这次只能验证服务的公开读取合同，不能声称设置 UI 已验收。`saveProjectRuntimeSettings` 的写入合同不属于本片，不改其范围。
- `src/lowcode/lowcode-runtime.ts::createLowcodeProjectGateways(projectId)` 固定一个工作区 id；其 `projectReferences.listProjects` 目前无参数调用 `listApplications()` 并重映射摘要。下游 `ProjectWorkspace.listReferenceProjects()` 会把当前 projectId 作为 `excludeProjectId`，由 `ProjectReferenceClient` 执行排除和归一化。`listReferenceProjects/listReferenceProjectPages` 只由 `ProjectWorkspace` 和 `useDevState` 暴露；源码检索未发现 Vue 业务页面调用点。保留这些公共合同，不把此片表述成真实引用 UI 迁移。
- gateway 所属工作区须在读取前确认 `readRequestScope().headers['X-AppId'] === normalizedProjectId`，捕获同一 scope token，并在 reader 完成或失败时复核；再将 `assertCurrent` 传给目录 reader。目标列表允许含其他可读应用，但不能让 A 工作区的在途读取在切到 B 后返回旧摘要。

## 正式目录映射和最小重构提案

现有 `src/lowcode/lowcode-application-catalog.ts` 已从固定 `7AB874097A1E8711A42FD845939A6E05` / `Base_AppSystemList` 装配默认 DataView；使用已认证请求 scope、DataView 字段权限、`allPages`、`distinct`、稳定 rowid 排序，并用 `finally` 释放 DataSet。当前 `readLowcodeApplicationById(id, assertCurrent)` 在查询后仅选择唯一、rowid 可读且 id 完全相等的一行；目录不存在、重复身份、查询错误和 stale caller 会失败。

建议所有消费者只通过以下最多两个参数的合同复用目录，不在页面再造查询、授权或缓存：

```ts
projectLowcodeApplication(view: DataView, row: DataRow): LowcodeApplication
readLowcodeApplications(assertCurrent: () => void): Promise<readonly LowcodeApplication[]>
readLowcodeApplicationById(id: string, assertCurrent: () => void): Promise<LowcodeApplication>
```

`projectLowcodeApplication` 是唯一字段权限感知的投影器；全量 reader 仅投影当前 DataView 可读且 rowid 合法的行，并负责查询与 DataSet 生命周期；按 id reader 重用同一投影及唯一身份检查。该 reader 给现有只读项目引用 gateway 返回摘要，不能变成页面控件的手传数组数据源。

映射按主控复核后的正式语义：`name = 可读 AppDesc → 可读 AppName → rowid`；`code = 可读 AppName`；`description = 可读 Memo`。缺失/不可读 Memo 时省略 description，空字符串仍保留；不得用 AppDesc 冒充 description。`isDefault` 仅由可读正式 IsSys 0/1 提供。不得由 URL tenant、登录名、session tenant 或 role 填充 owner/应用归属；正式视图没有返回的 owner 字段继续未知。

设置读取保留 `session.enterprise.shortName === tenantId` 一致性守卫，措辞可明确这是路由与会话不一致；捕获 `readRequestScope().token`，将同一 `assertCurrent` 传给按 id reader，且在目录与导航 await 后复核，异步期间会话/应用/路由 scope 改变时丢弃结果。它不检查或推断应用 owner。导航仍走现有 `readLowcodeRuntimeNavigation(projectId)` 责任方。

## 移除旧 public API 的影响

当前源码生产调用仅余上述两个 `listApplications()` consumer。移除两处后，可以删除 `LowcodePlatformApi.listApplications()` 及其专属 `applicationCatalogQuery`、`normalizeApplications`、`queryItems`、`firstText`、`optionalText`、`optionalIsDefault`。保留 `LOWCODE_APPLICATION_CATALOG_FORM_KEY` 和 `LowcodeApplication` 公共类型，供选择应用上下文与正式 DataView owner 合同使用。

`packages/spark-lowcode-api/src/platform/lowcode-application.test.ts` 的三个旧用例必须迁移成正式 DataView reader/helper 的真实合同测试，而不是删掉：缺省分类/owner 不从 session 推导；canonical 字段为空时旧 alias 归一化语义是否仍适用于正式 DataView（须按模型公开字段核实）；固定 7AB 目录身份与 DataView 请求合同。既有 `lowcode-application-catalog.test.ts` 已覆盖正式 FormKey、AppDesc/AppName 可读映射、不可读字段、精确 rowid、重复 rowid、查询失败和 DataSet 释放；需扩展 Memo 与全量 reader 测试。Store 的旧快照回读/保留、显式 false 与空可选值语义不依赖目录 HTTP reader，应继续保留。

已读取当前生成的 `generated/dts-class-model/files/packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts.json` 与 `lowcode-application.ts.json`，确认旧 `listApplications` 方法公开合同及 `LowcodeApplication` 字段投影确实进入 ClassModel。源码变化后产物必须由主控运行正式生成器刷新；本片未手改生成物。

## RED 证据

命令从仓根执行（根 Vitest 不运行 packages 子包用例）：

```text
pnpm exec vitest run tests/runtime/project/project-settings-formal-catalog.test.ts tests/runtime/auth-nav/lowcode-runtime-navigation.test.ts tests/app/lowcode/resources/application/lowcode-application-catalog.test.ts
```

结果：3 个测试文件，79 个用例；9 个预期新增行为失败，70 个现有用例通过。失败分别证明：设置 consumer 未走正式按 id reader；目录 await 和导航 await 后没有 stale scope 隔离；跨项目引用未走共享目录 reader；工作区 X-AppId 不匹配仍返回列表；旧无 scope 的 `listApplications` 方法仍公开；全量正式 DataView reader 尚不存在且失败路径的 DataSet 释放未能被该 reader 验证。完整原始输出见同目录 [`red.txt`](red.txt)。

## 边界

本片到此停止，等待主控复核后再开放产品源码实施。没有做 UI 写入、真实 SPA 验收、Java 操作、生成、提交或推送。
