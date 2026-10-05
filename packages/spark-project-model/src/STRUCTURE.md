# src 目录约定

```text
blueprint/            ProjectBlueprintNode、kinds、tree、index、edit（节点工具包，不依赖 page / io）
page/                 ConfigPageNode、四文件、compile-files、canonicalize-page-data、content/*、runtime-page
project/              ProjectModel、ProjectBlueprintDesign、ProjectSession、ProjectWorkspace
io/                   HTTP、ProjectBlueprintClient、PageFileApi、PageContentLoader、ProjectReferenceClient
```

心智模型（五层口诀、三轴、L0 项目设置）见 [MODEL-HIERARCHY.md §0](./MODEL-HIERARCHY.md#0-心智模型五层口诀与三轴)。

## 依赖方向

按源码 import 统计的实际方向：

```text
blueprint           （叶子：同包内不依赖其它目录，仅依赖 spark-utils / spark-data）
page                → blueprint；对 io 仅有类型引用（runtime-page.ts → PageContentLoader）
io                  → blueprint, page
project             → blueprint, page
project-workspace   → { project, blueprint, page, io }（io 只允许经由 project-workspace.ts 进入 project/）
```

**约束：**
- `blueprint` 不得依赖 `page` / `io` / `project`。
- `page` 不得对 `io` 产生值引用，只允许 `import type`。
- `project/` 内只有 `project-workspace.ts` 可以依赖 `io`。

配置页节点实例化在 `page/instantiate-project-node.ts`：`page → blueprint`，由 `project-design` 调用。

## 消费层

| 层 | 创建 |
|---|---|
| spark-app 运行态 | `PageContentLoader` + `createRuntimePageNode` |
| DevSystem / AI | `new ProjectWorkspace` |
| 纯内存 | `new ProjectModel({ projectId })` |

存储真源：lowcode 蓝图记录 + 四文件（rule / pagedata / script / style）。
