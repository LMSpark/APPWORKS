# Tenant 应用目录 DataSpace owner 可行性审计（2026-10-28）

## 结论

现有数据空间设计器只能新建并维护归属正式应用的 DataSpace，不能为 tenant/root 建立独立正式 owner。tenant `/app-list` 目前没有正式 `dataSpaceId`，不能仅通过设计页补齐后直接绑定。把 `homepage`、企业名、导航节点或路由路径当作 DataSpace ID，或把某个应用的空间借给 tenant 全局目录，都会臆造身份或错置查询/权限范围。

因此当前不改 `/app-list` consumer，不新增 DataView 包装，不改后端 Java；原目录链先保留，并继续登记为活动数据旁路。将来只有正式服务/元数据合同提供 tenant owner、可读的正式 DataSet `rowid`、该 owner 下的 `SysForm/<id>.json` 文件身份及对应服务端授权/范围后，才能通过 SPARK data DataView 接入并以真实同范围结果替换旧读取链。

## 源码事实

- `src/lowcode/data-space/lowcode-data-space-catalog.ts:50-61,90-102`：数据空间目录装配 `Base_DataSet@catalog`、`Base_AppSystemList@catalogApps`、`Base_UserInfo@catalogUsers`；目录入口要求明确 `projectId` 和正式蓝图 `scenarioId`。
- `src/lowcode/data-space/lowcode-data-space-catalog.ts:132-143,167-200`：新增 DataSpace 通过目录 DataView `addRow` 生成正式 `rowid`，`sysid` 必填且必须指向当前正式 `Base_AppSystemList` 可读行，随后调用 `DataSet.saveChanges`。现有归属字段表达的是应用系统 rowid，不表达 tenant/root owner。
- `src/views/features/data-platform/data-set-management/ui/data-set-list-page.vue:29-37,78-85`：新增表单通过标准视图字段选择所属应用；页面的场景身份来自正式导航/路由 meta。
- `src/lowcode/data-space/lowcode-data-space-runtime.ts:86-105`：`loadLowcodeRuntimeScenario({projectId, scenarioId})` 以当前请求 `X-AppId` 核对 `projectId`，以显式 `scenarioId` 读取 `scenarioViews` pagedata 并装配运行 DataSet；不会从 tenantId 推导 DataSpace ID。
- `src/lowcode/data-space/lowcode-data-space-runtime.ts:142-180`、`src/lowcode/data-space/lowcode-data-space-metadata.ts:35-70`：设计目标 ID 是正式 `Base_DataSet.rowid`，元数据查询按 `dataSetId` 精确过滤并核归属；运行 scope 和被设计 DataSpace 身份分别存在。
- `src/lowcode/data-space/lowcode-data-space-layout.ts:20-29,40-60`：布局文件 owner 绑定当前请求 `X-AppId`，资源路径另以正式 DataSpace ID 标识。
- `config/navigation/vue-pages.json:80-86`、`src/lowcode/lowcode-runtime.ts:101-115`、`src/views/tenant/AppList.vue:137-138,188-227`：静态 tenant `/app-list` 未声明 `dataSpaceId`；只有显式 `blueprintScenarioId` 时才创建 `PageRuntime` 并绑定 `Base_AppSystemList@default`，默认分支仍调用 `lowcodeApi.platform.listApplications()`。
- `src/services/tenant-scope.ts:15`：`APPLICATION_CATALOG_PROJECT_ID='homepage'` 明确是 tenant URL 的目录/工场项目标记；当前源码没有证明它是 `Base_AppSystemList.rowid` 或 `Base_DataSet.sysid`。
- `packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts:442-450` 与 `packages/spark-lowcode-api/src/platform/lowcode-application.ts:43-58,95-114`：旧目录查询固定使用 `x-FormKey` 和 `Filter:null`，随后归一化行；不向调用方暴露查询 owner 所需的 DataView 身份、逐行字段权限上下文或服务端总数回执。
- `packages/spark-data/src/data-view.ts:163-215`：正式 DataView 查询结果要求身份断言、行键、读取/写入访问与动作状态；executor 应提供原查询上下文，权限不能由页面借应用目录返回对象自行推导。

## 边界与后续

- 这是源码合同审计；不等价于运行时服务已具备 tenant owner，也不以 DataView 夹具代替正式授权证据。
- 已有真实 SPA 记录（见 [`tenant-app-catalog-scope-dataview-20261028.md`](tenant-app-catalog-scope-dataview-20261028.md)）证明 tenant 根目录与 D99 `Base_AppSystemList` DataView 查询不是相同范围；不能借用 D99 的一行数据视图来替换 62 个 tenant 目录卡片。
- 下一步应继续沿唯一台账处理有正式 app/project owner 的活跃数据旁路；tenant 全局目录等待服务端/元数据合同明确 owner 与授权范围后再形成 RED、实施和同范围 SPA 验收。
- 本次只读源码审计；没有修改源码、pagedata、数据库模型、Java 或业务数据，也没有运行测试。
