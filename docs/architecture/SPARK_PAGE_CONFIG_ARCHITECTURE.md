# spark-project-model 架构

> `spark-project-model` 是 SPARK 的软件设计模型包，不引入 Vue、Vue Router、Element Plus 或应用层 service。总览见 [system-architecture.md](system-architecture.md)。

权威细节以包内文档与源码 JSDoc 为准：

- [`packages/spark-project-model/README.md`](../../packages/spark-project-model/README.md)
- [`packages/spark-project-model/src/MODEL-HIERARCHY.md`](../../packages/spark-project-model/src/MODEL-HIERARCHY.md)
- [`packages/spark-project-model/src/STRUCTURE.md`](../../packages/spark-project-model/src/STRUCTURE.md)

## 治理顺序

```text
理念 > 逻辑 > AI 生成代码规则 > SSOT || SOLID > 该删则删 || 该合则合 || 该拆则拆 > 迁移便利
```

## 核心模型

**设计即编辑**；**模型 = class + API（事件）**；谁 `new` 谁负责生命周期。

```text
ProjectModel
├── design: ProjectBlueprintDesign   # 平铺 nodesById + 配置页 Map，树是投影
├── session: ProjectSession          # 选中节点 / 活动页 / 蓝图 dirty，不落盘
└── ProjectBlueprintNode             # 非配置页节点
    └── ConfigPageNode               # rule / dataSet / script / style 四个子模型

ProjectWorkspace                     # 持有 .project + IO 编排
PageContentLoader                    # 运行态四文件加载
```

- `ProjectBlueprintIndex` 提供节点索引；`ProjectBlueprintTreeNodeData` / `ProjectBlueprintTreeData` 是可序列化的数据形状，用于 API 载荷、落盘映射与 UI 投影。
- 两条节点轴：`nodeKind`（运行交付，`RuntimeNavigationItemKind`）与 `blueprintKind`（策划业务，`ProjectBlueprintNodeKind`），均定义在 `spark-utils`，且互相分离。
- `ConfigPageNode` 的四个子模型：`PageRuleFile`（`rule.json`）、`PageDataSetFile`（`pagedata.json`）、`PageTextFile`（`script.js`、`style.css`）。
- `ProjectBlueprintImplGate`（`closed` / `open`）：pageDesign 是否允许进入实现阶段的人工闸门，缺省 `closed`；运行态壳不读取。

## 存储

| 真源 | 形状 |
|---|---|
| lowcode 平台 | `Base_NavigationInfo` 平铺蓝图记录（经 `spark-lowcode-api` 读取，宿主适配后进入 `ProjectModel`） |
| 页面文件 | `rule.json`、`pagedata.json`、`script.js`、`style.css` |

蓝图节点还可以用 `NavigationUrl` 的 `cfg:<customPath>` 与 `VersionId` 指向版本化的设计文件（文件名形如 `{n}__rule.json`），这部分协议由 `spark-lowcode-api` 的 `project-blueprint-file-version` 与 `lowcode-design-file-upload` 承载，不在本包内。

## 三个消费层

| 层 | 创建方式 |
|---|---|
| spark-app 运行态 | `new PageContentLoader` + `createRuntimePageNode`，得到只读的 `PageNodeLike` |
| DevSystem / AI | `new ProjectWorkspace`，宿主用 `getAppProjectBlueprintWorkspace(scope)`（编辑）或 `getAppProjectWorkspace(scope)`（已提交） |
| 纯内存 | `new ProjectModel({ projectId })` |

## 公共入口

```ts
import {
  ProjectModel,
  ProjectWorkspace,
  PageContentLoader,
  createRuntimePageNode,
  type PageNodeLike,
} from '@spark-appworks/spark-project-model'
```

`ConfigPageNode`、`ProjectBlueprintNode`、`ProjectBlueprintDesign` 不从包入口导出。需要配置页时走 `ProjectModel.openPageDesign(pageId)`，需要运行态页面时走 `createRuntimePageNode`。包外不要 deep import `src/project/*`、`src/blueprint/*`、`src/page/*`、`src/io/*`。

## 源码目录

```text
src/
├── index.ts
├── blueprint/   节点类、kind、树、索引、编辑草稿
├── page/        ConfigPageNode、四文件模型、compile-files、canonicalize-page-data、运行态页面
├── project/     ProjectModel、ProjectBlueprintDesign、ProjectSession、ProjectWorkspace
└── io/          蓝图与页面文件的网关客户端、PageContentLoader
```

目录之间的实际依赖方向（按源码 import 统计）：

```text
blueprint   叶子：不依赖同包其它目录
page        -> blueprint；对 io 仅有类型引用（runtime-page.ts）
io          -> blueprint, page
project     -> blueprint, page；仅 project-workspace.ts 依赖 io
```

页面节点的实例化入口在 `page/instantiate-project-node.ts`，由 `project-design` 调用；`blueprint/` 不引用 `page/`。

## 验证

```bash
pnpm --filter @spark-appworks/spark-project-model run typecheck
pnpm --filter @spark-appworks/spark-project-model run test:run
```
