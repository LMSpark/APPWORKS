# spark-project-model

`ProjectBlueprint` = 设计 + 编辑会话根 class。模型 = class + API（事件）；谁 `new` 谁负责生命周期。

## 出口

| 包路径 | 内容 |
|---|---|
| `@spark-appworks/spark-project-model` | ProjectBlueprint、ProjectWorkspace、正式蓝图 DTO、PageTool、PageRuntime、ScenarioViewConfig/ScenarioViewFile、PageContentLoader、version/reference 类型 |

## 目录

```text
src/
  index.ts          唯一公开入口
  project/          ProjectBlueprint、ProjectBlueprintDesign、ProjectSession、ProjectWorkspace
  blueprint/        ProjectBlueprintNode、节点类型、树投影/查找/规范化、蓝图编辑草稿
  page/             PageTool 三文件及其内容模型、PageRuntime
  scenario/         ScenarioViewConfig、ScenarioViewFile
  io/               HTTP、blueprint/page-file/reference 远端 client
```

## 三消费层

| 层 | 创建 |
|---|---|
| spark-app 运行态 | `PageTool` + `new PageRuntime({ tool, scenarioIds, loadScenario, ... })` |
| DevSystem / AI | `new ProjectWorkspace` 或 APP `getAppProjectWorkspace(scope)` |
| 纯内存 | `new ProjectBlueprint({ projectId })` |

存储真源：lowcode 蓝图记录、工具三文件（rule.json / script.js / style.css）与独立场景视图文件（SysForm/<scenarioId>/pagedata.json）。

蓝图正式节点种类统一为 `module/page/embedded/service/content`，使用 `spark-utils` 唯一种类表。编辑草稿允许 `unknown` 诊断；`completeProjectPlanning` 拒绝缺失或非正式种类，不按路径、层级或 children 猜测。

蓝图重载按节点 ID 复用节点实例，页面工具 ID 不决定节点身份。两个节点指向同一工具时，策划投影分别保留它们及各自的场景绑定。

`PageContentLoader` 清除文件、页面或全部缓存时，同时使对应的在途读取失效；旧结果以 `PAGE_FILE_READ_STALE` 明确失败，不回填缓存或覆盖工作区内容。失效读取的结束不影响清除后新发起的读取，定向清除不影响其他文件。注入的项目身份改变也会拒绝旧响应；应用、租户和登录身份的完整失效通知仍由请求层和宿主接线负责。

`ScenarioViewConfig` 按现有完整 `DataViewFieldProjection` 合同校验场景投影：字段标识、来源、字段引用、字符串值、布尔值、非负整数排序/分组和排序方向均须有效；未知字段类型保留原字符串，不猜测。配置中的 false、0 和空字符串原样保留。无效配置在更换内容或编辑历史前拒绝；正式模型字段是否存在仍由运行装配核对。

`ProjectWorkspace` 的 `loadScenarioViews({ scenarioId })` / `getScenarioViews(scenarioId)` 持有单场景共享的 `ScenarioViewFile`，独立于页面文件和运行 DataSet。场景 gateway 提供文本读写与请求层生成的不透明代次，缺少能力明确失败；缓存和并发装载按明确场景共享，身份变化拒绝旧响应，未保存编辑阻止重载。

`saveScenarioViews({ scenarioId })` 比较远端原文与文件唯一的 `savedText` 基线，提交捕获的文本并回读一致后才标记保存。等待期间的新编辑保留；并发保存、远端冲突或回读不一致明确失败。该检查没有后端 CAS，不承诺原子保护，也不把失败当作后端写入已撤销。宿主网关已接到 `designfile / <appId>/SysForm/<scenarioId>/pagedata.json`；应用必须与当前请求匹配，租户目录和授权沿用现有后端规则。场景配置按明确 scenarioId 消费；页面工具不持有 DataSet 或场景编辑历史。

工作区页面文件保存也以捕获的提交文本确认基线，等待期间的新编辑不会被清除；撤销回已提交内容后恢复干净状态。写入失败不更新基线，普通保存不自动创建版本。宿主已注入工具三文件工作保存与文件名快照恢复，路径为 `<appId>/<pageId>`，读写均校验工作区应用身份。恢复将 `N__文件名` 原UTF-8内容写回裸工作文件，保留BOM和换行；不改变快照或蓝图发布指针。目标文件未保存时拒绝恢复，恢复期间的新编辑不被回读覆盖。版本列表/创建/删除通过实际后端文件能力执行，列表摘要为 version/fileName/lastModified。创建候选号使用同文件现有最大编号加一；编号不表示发布或 current。运行工具读取明确发布引用，缺分段失败关闭。场景配置保存不能走工具目录。

正式蓝图数据为 nodeId/parentNodeId/projectId/kind/capability/navigation?/dataSpace?/prototype?/source，children 只是树投影。源 VersionId 的 rule/script/style 表示发布引用，裸文件表示工作内容。

`PageRuntime` 持有一次调用的 instanceId、scenarioIds 和可选 mainScenarioId；多个调用可使用同一 PageTool，但不能共享运行 DataSet。视图绑定使用 #scenarioId@table@view，局部 table@view 必须有明确主场景。装载期间销毁会清理迟到数据，脚本上下文与回执受代次和销毁边界约束。
