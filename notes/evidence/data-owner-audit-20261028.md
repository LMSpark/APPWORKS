# 当前数据 owner 绕行只读源码审计（2026-10-28）

范围：SPARK_AppWorks 当前工作树；只读搜索与源码复核。没有改代码、调用真实写接口或修改后端 Java。

## 平台应用目录

listApplications 的生产调用点共五处：

- src/views/tenant/AppList.vue:159：仅当路由没有 blueprintScenarioId 时使用 direct fallback；loadScenarioProjects 在 :188-211 已通过 PageRuntime → DataSet → Base_AppSystemList@default 读取正式 DataView。
- src/views/platform/PlatformApps.vue:141：应用管理列表。
- src/services/project/project-settings.ts:110：读取项目设置前解析应用。
- src/lowcode/lowcode-runtime.ts:354：启动跨应用导航时查询显式目标应用。
- src/lowcode/lowcode-runtime.ts:597：ProjectReferences.listProjects 工具调用者。

底层查询实现位于 packages/spark-lowcode-api/src/platform/lowcode-application.ts 与 lowcode-platform-api.ts：固定查询 Base_AppSystemList，固定 FormKey，Filter:null，GetData 返回值不包含 DataView 行/字段权限上下文。

真实 SPA 范围证据仍为：root /app-list 返回 61 行、没有 X-AppId；D99 正式 DataView 返回 1 行。90A8 Base_AppSystemList@catalogApps 也返回当前应用 1 行；90A8 Base_DataSet@navHostDataSpaceOptions 的 sysid=homepage 预览返回 0 行。上述查询无法证明 root 全局目录的 DataSet owner。

## 独立导航根读取

packages/spark-lowcode-api/src/platform/lowcode-platform-api.ts:453 的 resolveNavigationRootId() 固定 FormKey 调 GetData，消费应用切换/启动导航所需的根身份。它与 listApplications 是不同查询语义，应分开核 owner、scope、权限和 DataView 结果。

## 数据库物理对象预览

src/lowcode/resources/database/database-catalog-preview-view-ops.ts:160,263 的物理表/视图预览经 DataView executor 调 GetData，消费动态物理资源身份 dbId/tableName。页面外层已绑定 DataView，但 executor 本地解析 Items/Count 并合成只读 fieldAccess；尚未取得服务端正式数据权限/分页合同，不能以外层绑定宣称完全统一。

## Workflow 文件资源分类

WorkflowDesigns 当前从 AgentWorkflowFileResource 的 DataView owner 读取目录和正文。executor 使用 listFiles/readTextFile 是文件存储适配；页面没有另建查询 owner。现存真实缺口是正式目录查询的 [1003] 文件夹路径不存在，参见 data-space-workflow-directory-live-20261028.json。

## 迁移顺序

1. 先建立 root homepage 的正式 DataSet owner、服务端 scope、行/字段权限与可维护入口，再迁移应用目录消费者。
2. 补齐物理表/视图资源身份、服务端授权和分页执行合同。
3. 独立统一导航根读取。
4. 修复 Workflow 正式目录路径读取。

在上述合同未成立前，不删除现有业务入口、不借用其他项目 DataSet、不合成授权结果。
