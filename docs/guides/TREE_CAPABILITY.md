# 树能力总览

> 面向当前仓库真实实现的树能力说明。
>
> **状态（2026-08）**：原 AppWorks Java `NavigationController` / `ProjectNavigationTreeService` 已退役。
> 业务树数据仍走 DataSet / DataView / `TreeManager`（`spark-data`）；项目蓝图树读写走 `spark-project-model` + lowcode 文件/数据接口（见 `@spark-appworks/spark-lowcode-api`）。
> 下文若仍出现旧 Java 服务名，仅作历史分层对照，**不是**当前可调用后端。
>
> 目标不是介绍一个 demo，而是把 SPARK 现阶段已经落地的树能力，包括前端容器、数据层、页面配置动作、权限和测试矩阵，收口成一份可直接执行的文档。

## 1. 设计目标

SPARK 的树能力遵循 5 个原则：

1. 配置优先，尽量零脚本。
2. 统一数据入口，树数据必须通过 DataSet 和 DataView 流转。
3. treeMode 是前后端共同契约，不靠页面脚本猜测结构。
4. 树操作优先沉到框架能力，而不是散落在 script.js。
5. 项目蓝图结构以 `ProjectBlueprintTreeData` 为领域合同；运行菜单只是蓝图的权限投影，不再由本仓 Java 导航服务提供。

当前推荐理解方式：

- DataView 负责“树数据视图”和远程编排。
- TreeManager 负责“树缓存”和内存树算法。
- RendererTree 负责“零代码 UI 容器”和节点交互。
- `ProjectModel` / `ProjectWorkspace` 负责项目蓝图树编辑真源；物理读写经 lowcode API。

---

## 2. 分层架构

完整调用链如下：

```text
rule.json / pagedata.json
  ↓
SparkPageRenderer
  ↓ provide(PAGE_DATASET, dataSet)
r-tree
  ↓ dataViewKey + dataMember + dataField -> DataView
RendererTree
  ↓ provide(DATA_SOURCE, view)
DataView
  ↓ 懒初始化 / 委托
TreeManager
  ↓（业务表树）HTTP / DataOperation
  或（项目蓝图）ProjectWorkspace / lowcode API
```

职责拆分：

| 层 | 核心对象 | 职责 |
|---|---|---|
| 页面配置层 | rule.json / pagedata.json | 声明树数据源、节点内容、toolbar/actions、treeMode |
| 渲染层 | RendererTree | 渲染 el-tree、节点动作、选中同步、展开定位、拖拽移动 |
| 视图层 | DataView | 对外暴露树接口、维护 rows/currentRow/selectedRows、同步远程结果 |
| 树算法层 | TreeManager | 缓存节点、构建嵌套树、路径补齐、搜索、局部子树、移动节点 |
| 项目蓝图层 | ProjectModel / ProjectWorkspace | 蓝图树编辑真源；经 lowcode 读写，不再经本仓 Java NavigationController |

---

## 3. 核心契约

### 3.1 treeMode

treeMode 是树能力的核心契约字段，定义在 TreeConfig 内，而不是散落在组件私有属性里。

支持值：

- flat
- nested

语义：

- flat：后端返回平铺节点，前端可用 TreeManager 重建 children。
- nested：后端明确返回嵌套 children 结构。

当前约定：

- treeMode 默认是 flat。
- DataView.treeMode 是对 view.treeConfig.treeMode 的代理。
- 后端导航接口接受 treeMode 作为查询信号。
- RendererTree 即使拿到 flat rows，也能在前端自动重建嵌套结构。

### 3.2 TreeConfig

常用字段：

```ts
{
  idField: 'id',
  parentIdField: 'parentId',
  textField: 'name',
  treeMode: 'flat' | 'nested'
}
```

推荐最小配置：

```json
{
  "treeConfig": {
    "idField": "id",
    "parentIdField": "parentId",
    "textField": "name",
    "treeMode": "flat"
  }
}
```

### 3.3 主键约束

树容器的选中、展开、拖拽移动、按 ID 定位，都依赖稳定主键。

要求：

- 节点主键必须是 string 或 number。
- RendererTree 默认优先取 props.nodeKey。
- 未显式传入时，回退到 DataView.primaryKey，再回退到 treeConfig.idField。
- 行级操作必须按主键而不是按数组下标定位。

---

## 4. 数据层能力

## 4.1 DataView 暴露的树远程入口

当前树能力不只是一组 TreeManager 本地方法，DataView 已经承担了树视图编排入口。

推荐关注这 7 个方法中的 5 个远程入口：

1. loadFromServer()
2. loadTreeNested()
3. loadTreeChildren(parentId, limit?)
4. loadTreePath(targetId)
5. expandTreeToNode(targetId)
6. moveTreeNode(nodeId, newParentId, index?)
7. searchTreeNested(keyword, limit?)

其中：

- loadFromServer：首屏加载，treeMode 作为 query signal 传给 list/nested 接口。
- loadTreeNested：显式请求嵌套结果。
- loadTreeChildren：请求某个父节点的直接子节点。
- loadTreePath：请求目标节点祖先链。
- expandTreeToNode：先查 path，再按缺口补 subtree。
- moveTreeNode：调用后端 move 接口并同步本地 rows。
- searchTreeNested：统一走导航搜索接口，返回树搜索结果。

### 4.2 TreeManager 提供的 7 个本地接口

TreeManager 是树算法和树缓存核心，当前稳定的本地接口为：

1. getNode(id)
2. getChildren(parentId)
3. getRoots()
4. getNodePath(nodeId)
5. searchNodes(keyword)
6. buildNestedTree(rootId?)
7. buildSubTree(rootId)

适用场景：

- 平铺数据转嵌套 children。
- 仅在内存中计算路径、子树和搜索结果。
- 当后端返回 flat rows 时，为 RendererTree 提供稳定嵌套结构。

### 4.3 DataView 与 TreeManager 的分工

不要把两者混为一谈：

| 能力 | DataView | TreeManager |
|---|---|---|
| 首屏加载 | 是 | 否 |
| 节点 children 远程请求 | 是 | 内部委托 |
| 路径补齐 | 是 | 内部执行 |
| 本地树构建 | 同步 rows | 是 |
| 选中当前行 | 是 | 否 |
| 汇总 UI rows | 是 | 否 |
| 节点缓存算法 | 否 | 是 |

实践原则：

- UI 层优先调用 DataView。
- 只有纯树算法或测试时，才直接操作 TreeManager。

---

## 5. RendererTree 能力

RendererTree 是当前树容器主入口，定位不是“一个普通 Vue 组件”，而是零代码树编排容器。

它当前承担的能力包括：

1. 消费 PAGE_DATASET 并根据 dataViewKey + dataMember + dataField 自动解析 DataView。
2. provide(DATA_SOURCE) 给子树节点内容组件。
3. 接收平铺 rows，并在需要时自动重建嵌套 treeData。
4. 同步当前选中节点到 DataView.currentRow。
5. 支持 expandToKey、currentKey、expandLevel 等声明式输入。
6. 支持 toolbar 和 actions dock 分区。
7. 支持节点级 builtinAction。
8. 支持拖拽 drop 后自动调用 moveTreeNode。

### 5.1 RendererTree 对外 API

当前稳定 API：

```ts
type RendererTreeApi = {
  getDataSource(): DataView | null
  getTreeData(): DataRow[]
  getNativeTree(): unknown
  getCurrentNode(): DataRow | null
  setCurrentKey(key: string | number): void
  expandToNode(key: string | number): Promise<void>
  filter(keyword: string): void
  getCheckedKeys(): Array<string | number>
  setCheckedKeys(keys: Array<string | number>): void
  appendNode(parentKey: string | number | null, nodeData: DataRow): void
  insertBefore(refKey: string | number, nodeData: DataRow): void
  insertAfter(refKey: string | number, nodeData: DataRow): void
  updateNode(key: string | number, patch: Partial<DataRow>): boolean
  removeNode(key: string | number): boolean
  getAllowAppend(): boolean
  getAllowDelete(): boolean
}
```

### 5.2 展开与定位

RendererTree 支持 3 种常见展开模式：

1. expandLevel：初始化按层级展开。
2. currentKey：初始化选中节点。
3. expandToKey：初始化展开路径并定位到目标节点。

推荐理解：

- expandLevel 适合本地已有整棵树的页面。
- expandToKey 适合远程懒加载树，通过 path + subtree 补齐链路。

### 5.3 节点拖拽移动

RendererTree 现在已经内建 node-drop -> moveTreeNode 接线。

行为：

- inner：新父节点为 dropNode 本身。
- before / after：新父节点回退到 dropNode.parentId。
- index 当前统一传 -1，由后端决定插入位置或后续再增强精确排序。

这意味着树移动已经是框架能力，不应再在 script.js 自己拼接口。

---

## 6. 零代码动作系统

树节点动作已接入 builtin-actions，而不是写死在单页脚本。

当前内置动作包括：

- append-row
- prompt-append
- prompt-edit
- move-row
- move-current
- refresh
- delete-row
- delete-current
- delete-selected
- patch-row
- patch-current
- patch-selected
- message-row
- message-current

树场景最关键的是：

- move-row
- move-current
- delete-row
- prompt-append
- prompt-edit

### 6.1 toolbar 与节点 actions

RendererTree 支持按 dock 分区：

- toolbar：树顶部或侧边工具栏
- actions：节点尾部动作区

推荐模式：

```json
{
  "type": "r-tree",
  "props": {
    "dataViewKey": "NavigationNodes@default",
    "nodeKey": "id"
  },
  "children": [
    {
      "type": "r-button",
      "dock": "toolbar",
      "props": {
        "builtinAction": "refresh",
        "label": "刷新树"
      }
    },
    {
      "type": "r-button",
      "dock": "actions",
      "props": {
        "builtinAction": "move-row",
        "label": "移动"
      }
    },
    {
      "type": "r-button",
      "dock": "actions",
      "props": {
        "builtinAction": "delete-row",
        "label": "删除"
      }
    }
  ]
}
```

### 6.2 旧式 allowAppend / allowDelete

RendererTree 仍兼容旧式：

- allowAppend
- allowDelete

但当前更推荐 dock=actions + builtinAction 的声明式写法。

原因：

- 能统一权限判断。
- 能统一按钮样式和禁用逻辑。
- 能避免树页面继续沉淀脚本特例。

---

## 7. 权限接入

树能力直接复用统一权限体系，完整权限模型、字段语义、默认值与动作判定统一以 [PERMISSION_SYSTEM.md](../architecture/PERMISSION_SYSTEM.md) 为准，本文件不再重复定义权限 DTO。

树场景只补充树专属落点：

- `create-child`：节点级新增子节点动作，复用统一动作权限链
- `delete`：节点级删除动作，复用统一动作权限链
- `edit`：节点级编辑入口，语义仍由统一权限体系推导

结果：

- 节点级新增子节点可以被统一权限体系收口
- 树上删除和编辑动作不需要页面脚本自行判断
- `dock=actions` / `builtinAction` 与其他容器保持同一套权限口径

---

## 8. 后端导航树 API

当前生产树接口以导航节点为核心，而不是另起一套 tree 专属路径。

基础路径：

```text
/api/tenants/{tenantId}/projects/{projectId}/navigation
```

### 8.1 整树读写

| Method | Path | 用途 |
|---|---|---|
| GET | /navigation | 获取导航配置 |
| PUT | /navigation | 保存导航配置 |

### 8.2 节点级树接口

| Method | Path | 用途 |
|---|---|---|
| GET | /navigation/nodes | 平铺列表或 nested 列表 |
| GET | /navigation/nodes/path/{id} | 获取祖先路径 |
| POST | /navigation/nodes/subtree | 获取 fromId -> toId 区间子树 |
| GET | /navigation/nodes/search | 搜索节点 |
| POST | /navigation/nodes | 新增节点 |
| PUT | /navigation/nodes/{id} | 更新节点 |
| DELETE | /navigation/nodes/{id} | 删除节点 |
| PUT | /navigation/nodes/{id}/move | 移动节点 |
| GET | /navigation/raw | 获取原始平铺行 |
| POST | /navigation/link-probe | 探测链接是否可嵌入 |

### 8.3 treeMode 在后端的作用

后端控制器会验证 treeMode，仅接受已知值。

使用方式：

- GET /navigation/nodes?treeMode=flat
- GET /navigation/nodes?treeMode=nested
- GET /navigation/nodes/search?keyword=xxx&treeMode=flat

当前行为：

- parentId 非空时，优先走 children 查询。
- treeMode=nested 时，返回嵌套节点。
- 默认仍以 flat 语义为主，便于 DataView + TreeManager 统一编排。

---

## 9. 推荐页面配置写法

### 9.1 pagedata.json

说明：pagedata.json 中推荐写短资源路径；页面运行时会补 `/api` baseURL，并按当前 tenant/project 路由上下文自动补作用域前缀。

```json
{
  "dataSetName": "NavDS",
  "tables": {
    "NavigationNodes": {
      "tableName": "NavigationNodes",
      "columns": [
        { "name": "id", "type": "string" },
        { "name": "parentId", "type": "string" },
        { "name": "name", "type": "string" }
      ],
      "api": {
        "list": { "url": "/navigation/nodes", "method": "GET" },
        "nested": { "url": "/navigation/nodes", "method": "GET" },
        "children": { "url": "/navigation/nodes", "method": "GET" },
        "path": { "url": "/navigation/nodes/path/{id}", "method": "GET" },
        "subtree": { "url": "/navigation/nodes/subtree", "method": "POST" },
        "move": { "url": "/navigation/nodes/{id}/move", "method": "PUT" },
        "nestedSearch": { "url": "/navigation/nodes/search", "method": "GET" }
      },
      "views": {
        "default": {
          "treeConfig": {
            "idField": "id",
            "parentIdField": "parentId",
            "textField": "name",
            "treeMode": "flat"
          }
        }
      }
    }
  }
}
```

### 9.2 rule.json

```json
[
  {
    "type": "r-tree",
    "props": {
      "dataViewKey": "NavigationNodes@default",
      "nodeKey": "id",
      "highlightCurrent": true,
      "draggable": true,
      "expandLevel": 2
    },
    "children": [
      {
        "type": "r-button",
        "dock": "toolbar",
        "props": {
          "builtinAction": "refresh",
          "label": "刷新"
        }
      },
      {
        "type": "TreeNodeSummary"
      },
      {
        "type": "r-button",
        "dock": "actions",
        "props": {
          "builtinAction": "prompt-append",
          "permAction": "create-child",
          "label": "新增子节点"
        }
      },
      {
        "type": "r-button",
        "dock": "actions",
        "props": {
          "builtinAction": "delete-row",
          "permAction": "delete",
          "label": "删除"
        }
      }
    ]
  }
]
```

### 9.3 推荐实践

优先级建议：

1. 优先用 r-tree + dataViewKey + dataMember + dataField。
2. 优先在 pagedata.json 配 treeConfig 和 api。
3. 优先用 dock=toolbar / actions + builtinAction。
4. 只有确实无法表达的业务分支，才进入 script.js。

---

## 10. 典型交互链路

### 10.1 首屏加载

```text
r-tree mounted
  ↓
解析 dataViewKey + dataMember + dataField -> DataView
  ↓
view.loadFromServer()
  ↓
GET /navigation/nodes?treeMode=flat|nested
  ↓
rows 写回 DataView
  ↓
RendererTree 输出 treeData
```

### 10.2 展开到指定节点

```text
treeApi.expandToNode(id)
  ↓
view.loadTreePath(id)
  ↓
view.expandTreeToNode(id)
  ↓
必要时 POST /navigation/nodes/subtree
  ↓
补齐 rows + 展开祖先链 + 选中当前节点
```

### 10.3 节点拖拽移动

```text
el-tree node-drop
  ↓
RendererTree.handleNodeDrop
  ↓
view.moveTreeNode(nodeId, newParentId, -1)
  ↓
PUT /navigation/nodes/{id}/move
  ↓
返回 moved node
  ↓
本地 rows / cache 同步
```

---

## 11. 测试矩阵

当前树能力至少由两类测试兜底。

### 11.1 数据层 4+7 测试

文件：

- packages/spark-data/src/tests/dataset-tree-4-plus-7.test.ts

覆盖内容：

- 首屏 list / nested 请求
- children 请求
- path 请求
- expandToNode 的 path + subtree 编排
- moveTreeNode 远程移动
- searchTreeNested 搜索
- TreeManager 7 个本地方法

### 11.2 渲染层测试

重点验证：

- RendererTree 点击节点同步 currentRow
- expandToNode 联动
- 通过 ID 初始化 currentKey
- node-drop 零代码 move
- 权限控制的树动作可见性和禁用逻辑

建议回归时至少执行：

```bash
pnpm run test -- -t "tree"
npx vitest run packages/spark-data/src/tests/dataset-tree-4-plus-7.test.ts --reporter verbose
npx vitest run tests/renderer-list-section.test.ts tests/renderer-layout-containers.test.ts --reporter verbose
```

---

## 12. 常见误区

### 误区 1：树页必须靠 script.js 编排

不是。当前主路径应为：

- pagedata.json 提供 api + treeConfig
- rule.json 声明 r-tree 与动作
- RendererTree / DataView / TreeManager 承担主流程

### 误区 2：treeMode 只是前端私有选项

不是。treeMode 已经是前后端共同契约，后端控制器会识别它。

### 误区 3：平铺 rows 不能直接喂给 r-tree

不是。只要 treeConfig 完整，RendererTree 会在前端重建嵌套结构。

同样地，树表场景也不需要在 rows 中手工维护 children。只要绑定到 r-table 的 DataView 存在 treeConfig，RendererTable 会把平铺 rows 重建为树表数据，并在未显式声明时自动补 rowKey 和 treeProps。

### 误区 4：移动节点必须页面自己发请求

不是。当前拖拽和 builtinAction 都可以收口到 moveTreeNode。

### 误区 5：新增子节点只看 allowCreate

不够。树场景的节点级创建走统一动作权限链，具体字段与默认值统一以 [PERMISSION_SYSTEM.md](../architecture/PERMISSION_SYSTEM.md) 为准。

---

## 13. 当前结论

SPARK 的树能力已经不再是“demo + script.js 拼接”，而是具备以下特征的稳定框架能力：

1. 前后端通过 treeMode 对齐。
2. DataView 负责树远程编排。
3. TreeManager 负责树缓存与本地算法。
4. RendererTree 负责零代码树 UI。
5. builtinAction 负责树动作收口。
6. 树节点动作已经接入统一权限体系。
7. 后端导航 CRUD / path / subtree / search / move 已成体系。

如果后续继续扩展树能力，优先顺序建议是：

1. 继续把节点级编辑、新增、删除统一沉到 builtinAction。
2. 在 move 接口上补充更精确的排序 index 语义。
3. 增强 search 结果的高亮与回显，但仍保持 DataView 驱动。
4. 让更多树页面回归零脚本配置，而不是恢复 script.js 主流程。
