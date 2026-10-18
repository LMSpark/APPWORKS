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

1. 页面结构由 `children` 中的标准子组件表达。字段子组件按父容器在表格、表单、详情中渲染；`DataView.columns` 是数据字段元信息。`autoColumns` 只是在没有显式 children 时自动生成这些子组件，不建立另一套页面列定义。
2. 表单自动路径按基础值类型生成文本、数字、开关、日期子组件；复合、枚举及未知类型只展示且禁用修改，编辑须显式配置 children。业务显式选择的组件不会被模型字段类型替换。
3. `r-column-group` 仅表达子组件分组，表格内部投影为 `el-table-column`；不能用没有 children 的分组替代普通字段子组件。
4. 不保留没有真实组件实现的 `RendererRowFragment/` 空壳目录。
