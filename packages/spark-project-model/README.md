# spark-project-model

`ProjectModel` = 设计 + 编辑会话根 class。模型 = class + API（事件）；谁 `new` 谁负责生命周期。

## 出口

| 包路径 | 内容 |
|---|---|
| `@spark-appworks/spark-project-model` | ProjectModel、ProjectWorkspace、导航/page 类型、compiler、运行态 PageContentLoader/createRuntimePageNode、version/reference 类型 |

## 目录

```text
src/
  index.ts          唯一公开入口
  project/          ProjectModel、ProjectBlueprintDesign、ProjectSession、ProjectWorkspace
  blueprint/        ProjectBlueprintNode、节点类型、树投影/查找/规范化、蓝图编辑草稿
  page/             ConfigPageNode、四文件模型、compile-files、canonicalize-page-data、runtime-page
  io/               HTTP、blueprint/page-file/reference 远端 client
```

## 三消费层

| 层 | 创建 |
|---|---|
| spark-app 运行态 | `new PageContentLoader` + `createRuntimePageNode` |
| DevSystem / AI | `new ProjectWorkspace` 或 APP `getAppProjectWorkspace(scope)` |
| 纯内存 | `new ProjectModel({ projectId })` |

存储真源：lowcode 蓝图记录 + 四文件（rule / pagedata / script / style）。
