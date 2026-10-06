# 树能力总览

业务树通过 DataView 和 TreeManager 流转；项目蓝图树通过 ProjectBlueprint/ProjectWorkspace 编辑。正式节点是 nodeId/parentNodeId/projectId/kind/capability，运行菜单只是授权投影。平台端点由实际模型与 gateway 提供，不在本仓建立导航后端。

## 数据与渲染边界

```text
ScenarioViewFile -> ScenarioViewConfig + 正式模型 -> 场景 DataSet
PageRuntime.resolveView(#scenarioId@table@view)
 -> RendererTree -> DATA_SOURCE / DATA_ROW -> 节点内容与动作
 -> DataView -> TreeManager
```

rule.json 声明 r-tree、绑定与动作；场景 pagedata.json 声明命名视图和 treeConfig。工具不持业务数据，容器不从全局页面选择首个 DataSet。

## treeConfig 与定位

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

字段必须属于正式模型输出。flat 表示平铺行，nested 表示嵌套结构；配置不证明后端支持某种远程树端点。稳定 string/number 主键用于选中、展开、定位与移动，不使用数组下标。

RendererTree 支持 currentKey、expandLevel、expandToKey。平铺行可经 TreeManager 构建嵌套 children；树表也由绑定视图的 treeConfig 形成树数据。

## 数据层能力

DataView 保持 rows/currentRow/selectedRows 与查询代次，提供 loadFromServer、loadTreeNested、loadTreeChildren、loadTreePath、expandTreeToNode、moveTreeNode、searchTreeNested。具体远程能力依赖正式查询执行器或明确配置的 API；方法存在不表示平台已实现 path/subtree/move 端点。

TreeManager 负责节点缓存与本地算法：getNode、getChildren、getRoots、getNodePath、searchNodes、buildNestedTree、buildSubTree。UI 优先调用 DataView，纯内存算法才直接消费 TreeManager。

正式场景查询由 DataSpaceRuntimeApi 和原 query context 持有，Name 请求与 AsName 输出映射由 API 完成。不存在从菜单目录推断模型字段或补造业务主键的步骤。

## 容器与动作

RendererTree 提供 DATA_SOURCE 给节点内容，节点作用域同时提供 DATA_ROW；点击同步 DataView.currentRow。toolbar 与 actions dock 分开声明，内置动作通过统一 action-executor 执行。

```json
{
  "type": "r-tree",
  "props": { "dataViewKey": "#SCENE@Nodes@default", "nodeKey": "id" },
  "children": [
    { "type": "r-button", "dock": "toolbar", "props": { "action": "refresh", "label": "刷新" } },
    { "type": "r-button", "dock": "actions", "props": { "action": "delete-row", "label": "删除" } }
  ]
}
```

真实场景 ID 和模型来自已装载配置；示例中的 SCENE/Nodes 需替换为实际身份。局部 Nodes@default 仅在调用明确 mainScenarioId 时使用。

节点移动、新增和删除必须消费对应动作状态。新增子行由当前父行 c 单独判断，不等同于模型 allowAdd；字段写入受 E 白名单约束，R 必填限于 E，h/m 联合模型与真实行。完整合同见 [权限体系](../architecture/PERMISSION_SYSTEM.md)。

dirty 阻止覆盖与配置刷新，stale 暂停编辑；清除或恢复需要明确丢弃编辑。请求失败不把本地编辑当作成功提交。

## 蓝图树与业务树

蓝图 CRUD 沿 LowcodeProjectBlueprintApi -> 共享 DataSpaceRuntimeApi query/save，私有原上下文持有凭据。source 是后端行的消费投影，不承担授权。蓝图字段映射、导航授权和业务树模型不是同一合同，不能把业务树的 API 统一写成导航路径。

## 验证

```bash
pnpm exec vitest run packages/spark-data/src/tests/dataset-tree-4-plus-7.test.ts
pnpm exec vitest run tests/renderer/renderer-list-section.test.ts tests/renderer/renderer-layout-containers.test.ts
```

聚焦回归包括平铺重建、children/path 编排、缓存、currentRow 同步、动作权限与失败。模拟端点测试不等于真实后端已注册对应端点；生产验收需实际模型和请求证据。
