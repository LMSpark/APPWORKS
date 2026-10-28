# Tenant 应用目录与 D99 Base_AppSystemList 作用域对照

- 时间：2026-10-28；NewApp 本地 SPARK SPA，同一已认证账号 `王涛`。
- Tenant 目录入口：`/t/NewApp/homepage/app-list?__sparkNavigationId=appworks-tenant-app-list`。只读访问后按当前 AX 页面中的应用卡片 heading 计数为 62；该页面来自 `config/navigation/vue-pages.json` 的 tenant scope `/app-list`。`src/views/tenant/AppList.vue::loadProjects()` 在没有 `blueprintScenarioId` 时仍走 `lowcodeApi.platform.listApplications()`。
- 正式 DataSpace 入口：D99 `/t/NewApp/D99A1DCE9894698799101EFD70F8FC76/features/data-platform/data-set-management/ui/data-set-list-page?__sparkNavigationId=90A82E287930A234FEC3E687C94A93EA`；目录查到归属“元数据管理”的“功能管理”，DataSpace ID `7AB874097A1E8711A42FD845939A6E05`。
- 设计器现状：空间 24 个模型、12 张数据库表、11 个字典、1 个文件资源、0 条关系；主业务模型 `Base_NavigationInfo`。`Base_DataModel` 与 `Base_AppSystemList` 的命名视图页均没有已选/已配置视图。本次没有配置或保存视图。
- 只读查询：在该空间打开正式 `Base_AppSystemList` 模型的“预览”，按默认单表查询执行后返回 `Loaded`、行数 `1`、总数 `1`。展开唯一行可见 `publisher_ent=NewApp`、`AppDesc=元数据管理`、`rowid=D99A1DCE9894698799101EFD70F8FC76`、`AppName=DataSchemaManage`、`WebUrl=/apps/appworks`、`isSass=1`。该正式模型查询范围与 homepage 62 个应用项不等价。
- 结论：不能将 D99 这条 `Base_AppSystemList` DataView 直接借给 tenant homepage；差异不是单纯缺少视图定义，服务端查询回包范围本身不同。要迁移 homepage，必须为 tenant 应用目录找到服务端承认、返回相同范围且带正式权限语义的 SPARK data DataView/resource owner。不能过滤/补行、复制 `listApplications()` 结果到页面数组，不能在前端重建授权。
- 边界：本次只读 SPA 页面与标准设计器模型预览；未改/启动/部署 Java，未新建/修改/删除 DataSpace、模型、视图、条目、应用或布局。

