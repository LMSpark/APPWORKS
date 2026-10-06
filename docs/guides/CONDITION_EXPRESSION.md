# 条件表达式（DataViewFilter / computeExpression）

`filterExpression` 筛选行，`computeExpression` 逐行计算派生列。二者保持独立职责。

## 1. 唯一公开过滤合同

前端组件、脚本、视图 JSON 与查询输入统一消费 `DataViewFilterTree`。状态与校验由不可变 class `DataViewFilter` 承接，定义位于 `packages/spark-data/src/query/filter/`。

```json
{
  "logic": "and",
  "filters": [
    { "field": "status", "operator": "eq", "value": "open" },
    { "field": "amount", "operator": "gte", "value": { "Type": "GetTableField", "Field": "threshold" } }
  ]
}
```

条件为 `{field, operator, value?}`，分组为 `{logic: 'and' | 'or', filters}`。旧 `op/children`、否定节点和 `kind: 'field'` 方言不再提供类型或兼容转换。

公开操作符共 18 项：

| 类别 | 操作符 |
|---|---|
| 比较 | `eq`、`ne`、`gt`、`gte`、`lt`、`lte` |
| 空值 | `is-null`、`is-not-null`、`is-empty`、`is-not-empty` |
| 文本 | `contains`、`not-contains`、`starts-with`、`not-starts-with`、`ends-with`、`not-ends-with` |
| 集合 | `in`、`not-in` |

范围控件直接生成 `gte/lte` 的 AND 分组，无公开 `between` 方言。完整目录以 `data-view-filter-catalog.ts` 为准。

非一元条件必须有显式 JSON 值；`''`、空白、`null`、`[]`、`0`、`false` 均保留。值函数使用 `{Type, ...}`，完整 JSON 载荷保留。普通字符串不插值：`$[...]` 等文本只是常量。清空由明确的 `undefined` 表示；解析失败不能清空已有过滤，也不能丢弃坏子节点后执行部分约束。

## 2. DataView 与执行边界

DataView 私有持有已应用的 `DataViewFilter`，`filterExpression` 返回冻结树。脚本赋值、`setFilter` 与 `configure` 统一解析并保护未保存修改。`setFilter` 对静态视图执行本地筛选，对远端视图刷新；`executeFilter` 可重复执行相同条件。配置赋值本身不发远端请求。

`DataSet.resolveCascadeFilter` 从参与级联的父行生成常量 `eq/in`。自动 `viewCascades` 生成和触发机制保留；远端请求把级联约束与当前过滤按 AND 合并。

静态求值由内部 `DataViewFilterLocal` 执行：

- 只支持常量、`GetConstValue` 与当前行 `GetTableField`。
- 整树先检查服务端函数，即使位于短路分支也拒绝；不在前端模拟服务端上下文。
- 条件字段和当前行引用必须存在，不猜限定表名或别名。
- 数字按数值比较，其余标量沿用 JS 字符串比较；集合与文本使用本地 JS 语义。
- `is-null` 为 null/undefined；`is-empty` 为字面量空字符串，空白文本不 trim。
- 空 AND 为真、空 OR 为假；远端保留原分组，不据本地结果简化。

远端只由 SPARK API 的 `runtime/protocol/data-space-filter.ts` 编解码公开树与后端 wire。宿主 assembler 不再维护过滤操作符或字段转换。值函数透传；数据源如何执行由后端负责，不推断 SQL、排序规则或不同来源的空值语义。正式后端过滤定义仍由同一 API 解码入口读取。

## 3. computeExpression（计算列表达式）

实现位于 `packages/spark-data/src/strategies/computed-column-delegate.ts`。

## 3.1 执行模型

`computeExpression` 是“逐行求值”，用于派生列。

- 纯表达式：自动包装 `return (...)`。
- 多语句函数体：要求表达式自己写 `return`。
- 求值上下文：`with(__row) { ... }`，行字段可直接引用。
- 可读取 `ctx`（通过 `setComputedContext` 注入）。

## 3.2 支持能力

- 算术、字符串拼接、三元表达式。
- 多语句 `if/else`、循环、函数定义。
- 链式计算列（列依赖列）。
- 子表聚合函数（依赖关系配置）：
  - `$sum/$count/$avg/$min/$max/$list/$join`

## 3.3 错误与降级策略

- 编译失败：该列跳过，不中断其他计算列。
- 运行时报错：该列写入 `undefined`，其他列继续。
- 表达式长度有上限（防止超长注入）。

## 3.4 与 DataViewFilter 的边界

- `computeExpression` 负责“算值”。
- `filterExpression` 负责“筛行”。
- 视图聚合 `aggregates` 负责“整列汇总”。

三者互补，不互相替代。

---

## 4. 参考实现与验证

- 公开合同与值对象：`packages/spark-data/src/query/filter/`。
- 实际视图与级联：`packages/spark-data/src/data-view.ts`、`dataset.ts`。
- 唯一 wire codec：`packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-filter.ts`。
- 控件条件生成：`packages/spark-component/src/components/containers/runtime/container-filter.ts`。
- 完整树及值函数编辑：`packages/spark-component/src/components/containers/filter/`，实际入口 `FilterExpressionEditor` 由 `RendererFilter` 消费。
- 本地效果、不可变状态与脏保护：`packages/spark-data/src/tests/data-view-filter-expression.test.ts`。
- 真实宿主请求组装：`tests/auth-nav/lowcode-data-space-runtime.test.ts`。

`RendererFilter` 从同一 DataView 读取已应用过滤，编辑器接收实际 columns 与明确的 `filterFunctionContext`，不从页面表名猜后端模型名称。递归 AND/OR、常量和完整 JSON、值函数共用 DataViewFilter 校验。缺字段/缺值、坏 JSON 和未完成组保留草稿并阻止应用；只有明确清空才提交 undefined。未修改的后端扩展函数保真保留，修改时要求相应编辑定义。

应用经 DataView.executeFilter。未保存修改导致拒绝时，弹框保留新草稿并显示错误，原过滤与编辑值保留；普通输入面板也返回失败状态、显示错误，不把日志记录当成功。运行 DataView 实例切换后旧编辑器卸载，不能将旧草稿应用到新实例。

组件挂载与实际 DataView 验证位于 `packages/spark-component/src/tests/filter/filter-expression-editor.test.ts`。场景设计器、场景文件装载及完整 SPARK 查询/保存接线仍须由对应消费者与运行证据证明，不能用过滤编辑测试替代。
