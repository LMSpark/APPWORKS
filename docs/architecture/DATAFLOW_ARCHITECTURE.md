# SPARK 数据流架构

> 当前数据流从项目需求开始，经 `ProjectModel.design` 与 `ConfigPageNode` 进入稳定渲染运行时。四文件、navigation API 和 Vue 组件都是投影或消费层，不是理念入口。

## 主链路

```text
项目需求
  -> ProjectModel.design (ProjectDesign)
  -> ConfigPageNode（page；嵌套子页 = hidden + 无 path）
  -> PageNodeRenderConfig
  -> SparkPageRenderer
  -> DataSet / SparkNodeTree / script / style
  -> UI
```

## 项目节点

**存储真源**是 DB navigation 平铺行；**领域模型**由 `ProjectDesign` 持有 `nodesById` 与 `NavigationIndex`。`root`、`children`、导航树是为 UI、路由和策划遍历生成的投影，不必与表结构同构。

```text
flat node
  id
  pid
  title
  description
  nodeKind
  path
  icon
  ...
```

父子规则：

```text
项目 => 子模块 || 页面
子模块 => 子模块 || 页面
页面 => 嵌套子页（page + hidden，无 path）
```

## 页面节点

配置页节点 class：

```text
ConfigPageNode
  nodeKind = page（嵌套：hidden + 无 path；legacy sub-page 读写时迁移）
  design: PageDesign (rule / dataSet / script / style)
  runtime: PageRuntime
```

导航元数据属于 `ProjectNode` 基类；`ConfigPageNode` 只扩展页面内容与运行投影。嵌套子页不是第二套 class。系统页面走 `system-page` nodeKind，只保存节点事实和组件路径，不承载四文件。

## 功能约束

每个节点的 `description` 是用户需求。生成某个页面时，父级和本级描述共同形成约束：

```text
effectiveUserRequirement =
  project.description
  + parent module descriptions
  + parent page descriptions
  + current node.description
```

消费层统一读取 `ProjectEditor.readSnapshot().pageFeatures`，不要自行拼约束链。

## 运行态

```mermaid
sequenceDiagram
  participant Router as Router
  participant Factory as PageNodeFactory
  participant Node as PageNode
  participant Renderer as SparkPageRenderer
  participant Data as DataSet
  participant Tree as SparkNodeTree

  Router->>Factory: create(pageId)
  Factory-->>Router: PageNodeLike
  Router->>Renderer: pageNode
  Renderer->>Node: load()
  Node-->>Renderer: toRenderConfig()
  Renderer->>Data: init DataSet
  Renderer->>Tree: build children from rule
```

运行态边界：

- Router 只创建 `PageNodeLike`。
- Renderer 只消费 `PageNodeRenderConfig`。
- Loader、compiler、file-api、版本和导航 client 不进入 App/Renderer。
- 缺少必需四文件或配置非法时 fail-fast。

## 设计态

```text
DevSystem
  -> createProjectEditor()
  -> ProjectEditor
      -> ProjectModel.design
      -> ConfigPageNode
      -> 后端 DB + file
```

DevSystem 是消费层。它可以传入 HTTP、API path、认证头，但不能直接绕过 `ProjectEditor` 操作 DB 节点、页面文件、版本或跨项目引用。

## AI

```text
AI Host
  -> readWorkflowDefinition(...)
  -> activatePageDesignAgentWorkflow()
  -> ProjectEditor.project
  -> ProjectModel.openPageDesign(pageId)
  -> ConfigPageNode
  -> 配置页节点子模型
```

AI 写入先进入内存 PageNode 并标 dirty。DevSystem 保存、版本、路由刷新和发布由显式用户动作触发；自动化 runner 可在运行结束后保存 dirty 四文件。

## DataSet / DataView

页面数据分两轴，禁止混成单一真源：

| 轴 | 真源 | 用途 |
|----|------|------|
| 设计 / AI | 四文件 `pagedata.json` → `ConfigPageNode.dataSet` | 设计器、生成器、无绑定预览 |
| 运行 | 平台 DataSpace 设计 + `PermissionRuntimeSnapshot` → `LowcodeDataSpaceAssembler` → `DataSet` | 有 `PageDataSpaceBinding`（formKey+dataSpaceId+modelId）的配置页 |

有绑定的运行态：`SparkPageRenderer` 经宿主 `loadRuntimeDataSet`（`loadBoundDataSpaceDataSet`）装载；**禁止**再把 `pagedata.json` 当运行数据真源。无绑定时仍可用四文件 hydrate（设计轴）。

组件读取必须走：

```text
dataViewKey + dataMember + dataField
```

`dataViewKey` 只定位视图：

```text
Users@grid
#scope@Users@grid
```

不要使用旧的成员拼接键、点号数据路径、`pageData` 或 `$data` 旁路。

## 不变约束

1. `spark-project-model` 保持纯模型。
2. 存储真源分层：平台导航/权限/DataSpace 在 QYAPI；页面布局/脚本/样式/设计草稿在四文件；领域模型可用树与索引，树是投影。
3. 嵌套子页与顶层配置页同属 `ConfigPageNode`（`page` + `hidden` + 无 path）。
4. 系统页面是 `system-page` nodeKind，不反向决定数据结构。
5. 四文件是页面内容投影，落盘锚点明确即可；运行业务数据不由 pagedata 独占。
6. DataSet 管线：设计轴 `pagedata.json -> DataSet`；运行轴（有绑定）`DataSpace+Permission -> DataSet -> DataViewKey -> DataView -> UI`。
