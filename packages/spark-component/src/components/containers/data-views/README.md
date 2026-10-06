# data-views

这里存放直接依赖 DataSet / DataView 的容器 Vue 组件。

判定标准：

1. 组件内部会消费 `PAGE_RUNTIME`、`DATA_SOURCE` 或围绕 DataView 做主流程编排
2. 组件的核心职责是渲染数据、切换当前行、维护选中态、提供上下文数据
3. 即便组件也带布局能力，只要“数据编排”是主职责，仍归这里

当前典型组件：

1. `RendererTable`
2. `RendererForm`
3. `RendererDetail`
4. `RendererTree`
5. `RendererList`
6. `RendererVirtualCard`

说明：

1. `r-column-group` 是 `FieldContextRenderer` 的表格列投影节点，由 `RendererTable` 在列区投影为 `el-table-column`。
2. 不保留没有真实组件实现的 `RendererRowFragment/` 空壳目录。
