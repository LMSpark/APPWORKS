# src 目录约定

```text
navigation/           ProjectNode、kinds、tree、index、edit（节点工具包，不依赖 page）
page/                 ConfigPageNode、四文件、compile-files、canonicalize-page-data、content/*
project/              ProjectModel、ProjectBlueprintDesign、ProjectSession、ProjectWorkspace
io/                   HTTP、NavigationClient、PageFileApi、PageContentLoader、ProjectReferenceClient
```

心智模型（五层口诀、三轴、L0 项目设置）见 [MODEL-HIERARCHY.md §0](./MODEL-HIERARCHY.md#0-心智模型五层口诀与三轴)。

## 依赖方向

```text
navigation          （纯领域，仅依赖 spark-utils / spark-data）
page                → navigation, spark-data
project             → { navigation, page }
io                  → { navigation, page }
project-workspace   → { project, navigation, page, io }
```

**禁止：**
- `navigation → page` / `navigation → io`
- `page → io`
- `project` / `navigation` / `page` → `io`

配置页节点实例化在 `page/instantiate-project-node.ts`：`page → navigation-kinds`，由 `project-design` 调用。

## 消费层

| 层 | 创建 |
|---|---|
| spark-app 运行态 | `PageContentLoader` + `createRuntimePageNode` |
| DevSystem / AI | `new ProjectWorkspace` |
| 纯内存 | `new ProjectModel({ projectId })` |

存储真源：DB navigation + 四文件（rule / pagedata / script / style）。
