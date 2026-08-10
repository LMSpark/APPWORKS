# TreeTable Demo

最小树表格示例，目标是演示：

- `r-table` 承接 Element Plus `el-table` 的树形表格能力
- 数据通过 `rows[].children` 提供嵌套结构
- `row-key`、`tree-props`、`default-expand-all` 等原生表格属性直接透传

## 为什么不用 r-tree

`r-tree` 适合“节点模板”场景：左动作 / 节点正文 / 右动作。

`treetable` 需要的是：

- 标准表头
- 多列对齐
- 行级树展开

这类需求应该用 `r-table`，而不是在 `r-tree` 的节点正文里模拟多列。

## 最小规则

```json
{
  "type": "r-table",
  "props": {
    "dataViewKey": "OrgRows@default",
    "row-key": "id",
    "default-expand-all": true,
    "tree-props": {
      "children": "children"
    }
  }
}
```