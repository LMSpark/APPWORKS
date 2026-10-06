# src 目录约定

```text
blueprint/  ProjectBlueprintNode、正式分组 DTO、索引、树投影和编辑草稿
page/       PageTool、三文件内容模型、PageRuntime
scenario/   ScenarioViewConfig、ScenarioViewFile
project/    ProjectBlueprint、ProjectBlueprintDesign、ProjectSession、ProjectWorkspace
io/         蓝图/页面/引用 gateway、PageFileApi、PageContentLoader
```

领域身份与生命周期见 [MODEL-HIERARCHY.md](./MODEL-HIERARCHY.md)。

## 依赖方向

- `blueprint/` 保存正式蓝图合同、索引和纯投影，不依赖 IO。
- `page/` 的工具定义和一次调用生命周期依赖 `spark-data` / `spark-utils`，不执行 HTTP。
- `scenario/` 校验和编辑场景视图文本，独立于页面工具和运行 DataSet。
- `io/` 消费蓝图与页面合同；实际传输由宿主注入。
- `project/` 组合蓝图、页面工具和编辑会话；`ProjectWorkspace` 负责 IO 编排和场景文件 owner。

## 消费层

| 层 | 创建及职责 |
|---|---|
| spark-app 运行态 | 每次调用创建 `PageRuntime`，注入工具装载、明确场景装配和路由快照 |
| DevSystem / AI | `new ProjectWorkspace`，使用 `project` 编辑蓝图和工具，独立编辑场景配置 |
| 纯内存 | `new ProjectBlueprint({ projectId })` |

存储分别为正式蓝图记录、工具三文件和 `SysForm/<scenarioId>/pagedata.json` 场景视图配置。运行 DataSet 不落入工具定义。
