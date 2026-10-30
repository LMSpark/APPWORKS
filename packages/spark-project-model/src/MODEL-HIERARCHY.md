# 模型层级与生命周期

领域模型以当前源码为准。DTO 是跨边界数据合同，编辑历史、缓存和运行实例由对应 class 持有。

## 项目与节点

`ProjectBlueprint` 组合 `ProjectBlueprintDesign` 和 `ProjectSession`。设计聚合索引蓝图节点与页面工具，编辑会话保存选中节点、活动工具、草稿和脏状态。

正式节点 DTO 为：

```text
nodeId / parentNodeId / projectId / kind
capability
navigation?
dataSpace?
prototype?
source
children?   仅树投影
```

正式 kind 来自 `spark-utils` 的 module/page/embedded/service/content；unknown 保留读入诊断，不能通过正式策划完成。节点身份是 nodeId，工具身份是 pageId，业务场景身份是 scenarioId。多个节点可以指向同一工具，并保留各自的场景与策划上下文。

`capability.description` 是节点短需求；`readProjectPlanningInput()`、`readBlueprintPlanningInputs()` 和 `readPlanningProjection()` 提供策划输入与有效需求投影。`source` 保留实际后端记录，不是第二套推断字段。

## 工具与调用

```mermaid
classDiagram
  ProjectBlueprint *-- ProjectBlueprintDesign
  ProjectBlueprint *-- ProjectSession
  ProjectBlueprintDesign o-- ProjectBlueprintNode
  ProjectBlueprintDesign o-- PageTool
  ProjectWorkspace *-- ProjectBlueprint
  ProjectWorkspace o-- ScenarioViewFile
  ProjectWorkspace o-- DataSet : 正式定义元数据
  PageRuntime --> PageTool
  PageRuntime o-- DataSet
  PageTool *-- PageRuleFile
  PageTool *-- PageTextFile
```

`PageTool` 不继承蓝图节点。`project.openPageDesign(pageId)` 返回工具；它只持有 rule.json、script.js、style.css。`PageRuleFile` 保存 SparkNodeTree 和编辑历史；两个 `PageTextFile` 保存脚本/样式文本和历史。`toDefinition()` 输出工具定义，要求工具已装载。

`PageRuntime` 表达一次调用，持有唯一 instanceId、scenarioIds 和可选 mainScenarioId。即便共用同一工具，每次调用仍装配独立的 DataSet；运行实例不能共享业务数据集。装载失败清理已装配的兄弟场景，销毁拒绝迟到结果并释放本实例的数据。

新页面视图引用为 `scenarioId@modelName@viewId`。模型名称匹配正式 modelBinding.modelName；原生本地模型使用自身 tableName；同场景重名拒绝。局部 `modelName@viewId` 只有明确主场景时可物化；不会把首个场景当主场景。物化会校验本次调用确实声明并装载了引用视图。

## 场景配置

`ScenarioViewConfig` 校验单场景 tables、modelBinding、views 和显式 viewCascades。正式模型提供输出字段，场景配置可补允许的前端校验和计算列；装配核对字段身份及引用，数据权限由当次正式查询返回并在运行时消费。正式字段不等同于物理数据库字段。DataSet → DataTable → columns / 多个 DataView 及数据库与文件的持久边界统一见[数据空间主合同](../../../docs/architecture/DATAFLOW_ARCHITECTURE.md)。

`ScenarioViewFile` 持有原文、savedText 基线、校验后的 value 和撤销历史。动态应用的`ProjectWorkspace.loadScenarioViews({scenarioId})` / `getScenarioViews(scenarioId)`获取正式场景owner，`saveScenarioViews({scenarioId})`执行写前原文比较和写后字节回读；AppWorks四个系统程序场景走仓内资源DataView，开发态保存仍经SPARK data适配，构建态只读，场景历史和工具定义未迁入。业务编辑与取消由正式元数据DataView承载，提交经DataSet，不从文件owner另开通道。身份改变、来源冲突、重复保存和回读不一致明确失败。后端没有CAS，客户端比较不能承诺原子保护；失败不表示已写内容已撤销。

动态场景文件位于 `SysForm/<scenarioId>/pagedata.json`，与 `<appId>/<pageId>` 下的工具文件分离。AppWorks系统程序的四个登记场景改由仓内`config/pages/**/pagedata.json`提供；其余正式业务目标继续通过对应ProjectWorkspace场景owner访问。

## IO、版本与发布

`ProjectWorkspace` 编排蓝图节点 CRUD、场景配置 IO 与跨项目引用；工具文件查询、编辑、历史和保存由应用层适配器绑定至正式 `ProjectToolFile` FileResource DataView/DataSet。包不拥有服务器 URL 或认证策略。`PageContentLoader` 是独立只读缓存类；当前未发现生产调用方。实际应用启动从 `src/main.ts` 注入 `readLowcodePageFile`。缓存清理使相关在途读取失效；旧结果不能回填缓存。

工具工作内容使用裸文件名。快照是后端真实 `N__filename` 文件，列表摘要为 version/fileName/lastModified；没有独立版本表。创建候选号是同文件已有最大编号加一，上传最终路径和字节回读确认成功后才产生已确认事实。编号不能推断发布指针或 current。

发布引用保留在真实记录 `source.VersionId` 的 rule/script/style 分段。运行工具读取明确引用，缺分段拒绝；恢复把指定快照写回工作文件，不切换发布引用。目标工作文件 dirty 时拒绝恢复，保存期间的新编辑保留。

## UI 与 AI 消费

UI 通过 `subscribe` 和 `read*Projection()` 消费 ProjectBlueprint，工作保存经 ProjectWorkspace；场景文件 owner 和运行实例分别承担自身编辑/生命周期。

| 事件 | 内容 |
|---|---|
| blueprint.changed | 蓝图节点、树、草稿和 dirty 变化 |
| selection.changed | 选中节点或活动工具变化 |
| page.file.changed | 工具三文件编辑、保存或撤销变化 |
| runtime.changed | 工具装载状态变化 |

`blueprintDirty` 表示实际蓝图编辑，存在 draft 本身不代表 dirty。工具 dirtyFiles 只覆盖三文件；场景编辑由工作区正式元数据DataView的编辑及待提交状态表达，dirtyScenarioIds也保留内部未决文件状态。saveDirtyScenarioDefinitions/saveAll从已加载DataSet提交修改，不加载未读定义；旧独立文件草稿缺少原生DataSet时明确拒绝。运行业务编辑由 PageRuntime.isDirty 表达。

页面设计 AI 使用 ProjectWorkspace 根，三文件通过 `this.project.openPageDesign(pageId)` 编辑；只有输入明确 scenarioId=T 时才loadScenarioDefinitions取得正式C，按需查询定义DataView并编辑/取消，交付仅提交指定T的定义变更。原文件owner方法不向AI开放。同一工作区和请求代次复用定义DataSet，scope改变或dispose销毁其定义实例，迟到加载拒绝注册。工具文件和场景配置分别返回实际保存结果，不以一次失败宣称全部回滚。

DevSystem完整配置文本由ScenarioDefinitionDocument从五类正式定义DataView投影，文本应用与撤销写回这些视图，预览从同一投影装配独立运行DataSet。完整文档工作区须加载完整定义，普通保存只提交修改。文档的根配置基线与撤销历史不能保存为另一份有效草稿；外部编辑使旧撤销不可用，重新查询或身份改变使文档失效。DataView的listSourceVersions/previewSourceVersion/createSourceVersion按可选来源历史合同执行，快照要求同源视图干净且期间不变；恢复把核对后的历史定义写入DataView再提交。来源适配内部仍复用既有文件存储，不改变工具发布指针。

`SparkPageRenderer` 接收 PageRuntime 与调用 routeSnapshot；脚本 Render 组件、CSS 和状态仅属本实例，关闭 A 不会释放 B。路由/查询决定调用身份，工具 pageId 不充当运行实例 ID。

## 源码定位

| 能力 | 位置 |
|---|---|
| 正式蓝图合同、节点行为 | blueprint/project-blueprint-node.ts |
| 蓝图树投影、工具定位 | blueprint/project-blueprint-tree.ts |
| 节点索引与编辑边界 | blueprint/project-blueprint-index.ts、project-blueprint-edit.ts |
| 设计聚合与编辑会话 | project/project-design.ts、project-session.ts |
| 项目门面与投影 | project/project-blueprint.ts |
| IO 编排 | project/project-workspace.ts |
| 工具定义与运行调用 | page/page-tool.ts、runtime-page.ts |
| 场景配置与编辑历史 | scenario/scenario-view-config.ts、scenario-view-file.ts |
| 工具文件与版本 IO | io/page-file-api.ts、page-content-loader.ts |
