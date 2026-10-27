# 平台应用目录 DataView 迁移审计（2026-10-27）

## 结论

**当前不可安全实施代码切片。** 可确认 direct GetData 旁路，也确认至少一个其它场景的 `Base_AppSystemList` 模型绑定；但尚无正式合同证明平台应用目录路由对应的 DataSet 场景 ID、该路由应消费的 DataView、租户/项目/认证 scope 投影和权限语义。用现有数据空间目录场景的模型/视图替代会猜场景身份；把 `listApplications()` 包装成 DataView 则仍是原 GetData 资源适配器的伪装。按要求不改产品代码，不写测试、不做 RED/GREEN。

## 基线与调用链

- 仓库基线：`316b7fd937b09c8d64e169ff85efe9f42f1bbf1a`。审计开始时工作树无变更。
- `packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts::listApplications()` 发 `POST /api/DataOperation/GetData`，`x-FormKey=LOWCODE_APPLICATION_CATALOG_FORM_KEY`，传 `applicationCatalogQuery()` 后调用 `normalizeApplications()`。
- 调用者：`src/views/tenant/AppList.vue`、`src/views/platform/PlatformApps.vue`、`src/services/project/project-settings.ts`、`src/lowcode/lowcode-runtime.ts`（含 `createLowcodeProjectGateways` 中的目录读取）。
- 上述路由/服务中没有建立 `PageRuntime` 或解析正式 `scenarioId@modelName@viewId` 的目录 DataView。项目设置读取先核验当前 session enterprise 与 tenantId 一致，再用目录结果匹配 projectId；PlatformApps 从当前 session 得出租户并仅在未选时设为选中，但目录查询本身不从该选项构造 DataView 输入。

## 正式合同核验

- `config/pages/data-platform/data-space-catalog/pagedata.json` 有 `Base_AppSystemList` 的 `modelBinding.modelId=acb04903-043f-4c99-9a57-a8e9bc95ce72`、`modelName=Base_AppSystemList`，视图 `default` 与 `catalogApps`。这是数据空间目录场景自己的 pagedata 绑定；文件没有证明它属于 `/app-list` 等平台应用目录执行路由，也没有给出可直接复用的正式目录 DataView owner。
- `LOWCODE_APPLICATION_CATALOG_FORM_KEY` 在 `packages/spark-lowcode-api/src/platform/lowcode-application.ts` 中是目录 API 使用的固定 FormKey。它自身并不证明等于某个 `Base_DataSet.rowid`，也不证明正式模型身份或 `scenarioId`。应用目录 pagedata 的可见绑定位于另一个场景；禁止由 FormKey、模型名或页面路径推导/拼造二者关系。
- SPARK DataView 与标准组件确有正式合同：`PageRuntime` 通过显式 `scenarioIds`/`loadScenario` 加载 DataSet；标准组件按 `dataViewKey` 消费运行时视图。但基础设施存在不能替代本业务所缺的正式身份、scope 和权限合同。
- 本轮未找到该平台目录 DataView 的正式行/字段权限投影、租户/项目过滤配置、绑定读取回执或 owner 生命周期证明。`normalizeApplications()` 与调用方映射只证明原 API 结果规范化，不证明可移植为 DataView 查询。

## 业务语义与安全边界

目录列表用于租户应用展示、项目选择/切换及项目设置读取。候选迁移必须先界定每个消费者是否共享同一个正式目录范围，特别是用户选择的 tenant 与认证企业、当前 project/application scope、旧异步结果失效条件。当前代码有若干消费者分支，并没有单一、已核实的共享查询 owner。目录读取权限必须来自正式查询权限投影；不得根据应用列表可见性在前端合成字段权限。项目选择/激活涉及切换身份与导航根解析，不能把读取列表的 DataView 当作切换命令或其回执。

因此无法按要求写覆盖“无场景、旧异步结果、切租户/身份失效”的真实 DataView 测试：前两者的目标路由场景及查询 owner 未定义，异步/认证围栏也需依托最终 owner 生命周期。先增加假身份与局部保护测试会固化猜测，并不能验证正式权限或标准组件运行绑定。

## 文件与验证

- 产品实现触及文件：无。
- 新增本报告：`notes/evidence/data-space/app-catalog-dataview-20261027-report.md`。
- 测试：未运行。没有 RED/GREEN 命令或输出路径；TDD 实施前置条件未满足，不以 mock 造出场景合同。
- ESLint、typecheck：未运行；本轮结论是合同阻断、未进行实现。
- 线上/SPA：本报告未执行 SPA 或线上查询，不能据此宣称服务支持目录 DataView、正式权限可用或列表行为已验证。

## 解锁条件

取得并核验平台目录路由的正式 DataSet 场景身份与 pagedata（模型 ID、模型名、DataView ID），明确该目录对各消费者的租户/认证/项目范围及变更时 owner/请求失效规则，并取得正式查询返回的行/字段权限与读回证据。之后才能选择单个消费者，按标准组件绑定 `scenarioId@modelName@viewId`，先添加 RED 测试再实现最小切片；项目切换/激活命令保持独立语义。
