# non-data-components

这里存放字段层的桥接 / 包装 Vue 组件。

判定标准：

1. 组件主要负责把字段上下文映射到不同容器语义中
2. 组件不代表具体业务字段类型
3. 组件更像字段层基础设施，而不是字段业务组件

当前组件：

1. `FieldContextRenderer`
2. `TreeNodeSummary`