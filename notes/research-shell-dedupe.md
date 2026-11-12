# 研读：壳层工具与迁入页去重

## 用户决定（2026-11-13）
- 范围只做去重：壳层工具与迁入页按功能只留一套。
- 以迁入页（参考原路径、PageRuntime/DataView、标准组件）为准，旧页独有能力并入后删除旧页。
- `/dev` 拆分：蓝图编辑全部归迁入的项目蓝图页；`/dev` 只保留四文件页面设计，改名“页面设计工具”。
- 缓存按语义合并：后端缓存归迁入缓存管理页；浏览器本机页面缓存归壳层系统设置；路由/导航刷新并入设置页已有“重载导航”。

## 配对事实
| 旧页 | 迁入页 / 承接方 | 事实 |
| --- | --- | --- |
| `/apps` `PlatformApps.vue` | `/app-list` + `application-manager-page` | 与 `/app-list` 读同一 `catalogApps` 视图；新建/删除恒抛错，无可用写能力 |
| `/app-list` 的 `blueprintScenarioId` 分支 | `application-manager-page` | 无导航记录指向 `vue:/app-list`，分支不可达且重复迁入应用管理 |
| `/cache-manager` `CacheManager.vue` | 设置页 + `cache-management-page` | 只管 localStorage `spark_page_`/`spark_file_`；刷新导航与设置页“重载导航”重复（`reloadAndSyncNavigation` 内含 `refreshRoutes`） |
| `/dev` 蓝图编辑部分 | `application-function-page` | 树增删拖放、基本信息、导航、数据空间、原型与历史、宿主均已迁入；独有：策划文档导入、节点估算、BeginGroup、导航目标候选 |
| `/dev` 页面设计部分 | 保留在 `/dev` | 三文件编辑/版本/预览、AI 编辑、创建并绑定工具、打开运行页面；参考仓无对应 |

不属于重复：`/workflow-designs`（Agent workflow）与迁入数据流程；`/tenants`、`/settings`、`/about` 无迁入对应页。

## 约束
- 迁入蓝图页使用独立 `useDevState()` 实例；`useDevState.ts` 两侧共用，保留原位。
- 蓝图节点 `NavigationUrl=vue:/features/application/application-function-management/ui/application-function-page` 在 `appworks-system.json` 未发布，去重后须发布为蓝图编辑唯一入口。
- `runtimeLanding` 无业务页时回落 `/dev`，路径保持。
