# @spark-view/spark-data

## 0.5.0

### Minor Changes

- **树架构重构**（`TreeManager` / `DataView` / `DataTable`）
  - `CrudApi extends TreeApi`：7 个树端点（`node/children/path/subtree/search/nested/nestedSearch`）直接平铺到 `CrudApi`，无需 wrapper
  - `treeMode` 移入 `TreeConfig`（`flat | nested`，默认 `flat`），`DataView.treeMode` 改为 getter/setter 代理
  - `TreeManager` 内置 4 个 HTTP 方法：`fetchChildren / fetchPath / expandToNode / fetchNestedSearch`；单向依赖 DataView → TreeManager
  - `DataView` 新增 `loadTreeChildren / loadTreePath / expandTreeToNode / searchTreeNested` 委托方法（懒初始化 `TreeManager`）
- **序列化修复**
  - `DataTable.toData()` 补充 `treeConfig` 写入，`fromTableData()` 补充 `treeConfig` 恢复（default 视图）
  - `DataView.fromData()` 补充 `rows` 恢复（命名视图行数据不再丢失）
- **类型导出补全**
  - `index.ts` 新增 `TreePath`、`NestedTreeNode` 导出
- **工厂方法更新**
  - `SparkData.createTreeManager()` 新增 `treeMode` 参数
  - `SparkData.createDataView()` 新增 `treeConfig` 参数

## 0.4.0

### Minor Changes

- 5894e41: 整理数据包开发体验

  - 优化组件文档和开发体验

## 0.2.0

### Minor Changes

- 整理数据包开发体验

  - 优化组件文档和开发体验
