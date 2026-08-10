# 条件表达式分析（FilterExpression / computeExpression）

本文面向 SPARK 数据层与后端对接，澄清两套常被混用的“条件表达式”能力：

- `filterExpression`：用于筛选行（条件树，支持逻辑组合）。
- `computeExpression`：用于逐行计算派生列（JavaScript 表达式/函数体）。

核心结论：二者职责不同，执行位置也不同。不要把 `computeExpression` 当过滤器，也不要把 `filterExpression` 当计算列。

---

## 1. FilterExpression 语法模型

类型定义位于 `packages/spark-data/src/types.ts`。

```ts
export type FilterOperator =
  | '==' | '!=' | '>' | '>=' | '<' | '<='
  | 'in' | 'not in' | 'like' | 'not like'
  | 'is null' | 'is not null'
  | 'between' | 'not between'
  | 'startsWith' | 'endsWith' | 'contains'

export type FilterFieldRef = {
  kind: 'field'
  field: string
}

export type FilterValueExpression =
  | string
  | number
  | boolean
  | null
  | FilterFieldRef
  | FilterValueExpression[]

export type FilterExpression =
  | { field: string; op: FilterOperator; value: FilterValueExpression }
  | { type: 'and' | 'or'; children: FilterExpression[] }
  | { type: '!condition'; field: string; op: FilterOperator; value: FilterValueExpression }
  | { type: '!and' | '!or'; children: FilterExpression[] }
```

### 1.1 节点类型

- 条件节点：`{ field, op, value }`
- 逻辑节点：`{ type: 'and' | 'or', children }`
- 否定条件：`{ type: '!condition', ... }`
- 否定逻辑：`{ type: '!and' | '!or', children }`

### 1.2 结构化字段引用

`value` 可用结构化引用：

```json
{ "kind": "field", "field": "threshold" }
```

语义是“把某字段作为比较值来源”，但前端本地执行与后端远端执行的解释方式不同（见第 2 节与第 3 节）。

---

## 2. 前端（spark-data）中的 FilterExpression 语义

实现入口在 `packages/spark-data/src/data-view.ts`。

## 2.1 执行时机

- 静态本地过滤：`filterExpression` 在 `DataView` 行集合上逐行匹配。
- 远端请求过滤：`requestData()` 会把 `filterExpression` 作为 `params.filter` 透传给后端（由后端编译/执行）。

此外，远端请求还会把父子关系条件与用户过滤合并成 `and`，避免漏掉级联约束。

## 2.2 本地匹配规则

本地匹配函数 `_matchesFilterCondition()` 支持：

- 比较：`== != > >= < <=`
- 集合：`in / not in`
- 字符串：`like / not like / contains / startsWith / endsWith`
- 空值：`is null / is not null`
- 区间：`between / not between`

逻辑匹配函数 `_matchesFilterExpression()` 支持：

- `and / or`
- `!condition / !and / !or`

## 2.3 本地字段引用解析

在本地过滤中，`{ kind: 'field', field: 'x' }` 语义是“从当前行读取 `x` 再比较”。

示例（来自测试）：

```json
{
  "field": "amount",
  "op": ">=",
  "value": { "kind": "field", "field": "threshold" }
}
```

会按当前行做 `row.amount >= row.threshold`。

## 2.4 本地空值/字符串细节

- `is null`：本地定义为 `null || undefined || ''`。
- `is not null`：本地定义为非 `null/undefined/''`。
- `compareFilterScalar`：数字按数值比较，其他按字符串 `localeCompare`。

这意味着本地 `is null` 会把空字符串当空值，而 SQL 语义通常不这么处理（见第 3.4 节）。

## 2.5 fail-fast 规则

前端在校验和执行阶段会快速失败：

- 字段名为空：抛错。
- `value` 非法（既不是标量/数组，也不是合法结构化 ref）：抛错。
- 结构化 ref 指向不存在字段：抛错。
- 旧协议占位符（`$[...]`、`$parent[...]`）已移除，检测到即抛错。

---

## 3. 远端 FilterExpression 边界

AppWorks 不再拥有 SQL 编译后端。远端过滤必须由 lowcode 已有接口明确接受并解释；前端不得根据本地求值行为推断数据库方言或 SQL 编译结果。

## 3.1 关键原则

如果 lowcode 端点声明支持结构化过滤，适配层必须把 AST 原样转换为该端点的公开合同，不得把表达式拼成 SQL 文本。

即：

- 前端本地：`field ref` 是按当前行取值。
- 后端远端：`field ref` 必须编译成 SQL 列/表达式引用。

示例：

```json
{ "field": "amount", "op": ">=", "value": { "kind": "field", "field": "threshold" } }
```

远端实现应保留“字段引用另一个字段”的语义：

`amount >= threshold`

## 3.2 字段白名单映射

字段必须来自数据空间前端模型允许引用的数据资源字段；字段映射和最终鉴权由 lowcode 后端决定，前端不维护 SQL 字段白名单。

## 3.3 SQL 编译策略

- 仅发送 lowcode 合同明确支持的操作符。
- `in/not in/between/not between` 仍需在前端完成数组形状校验。
- `and/or` 与否定节点保持 AST 层级，不降级为字符串条件。
- 缺少远端 capability 或响应不能证明语义一致时 fail-fast。

空 children 语义：

- `and([])` 在本地为真。
- `or([])` 在本地为假。
- 远端是否接受空 children 必须由端点 characterization 证明，不能推断。

## 3.4 与前端语义的关键差异

- 本地 `is null` 把空字符串当空值；远端空值语义由 lowcode 合同决定。
- 本地字符串比较走 JS；远端排序规则和大小写行为由目标数据源决定。
- 本地 `field ref` 是“当前行取值”；远端必须保留字段引用语义，不能发送本地当前值冒充字段引用。

如果同一过滤条件在本地与远端结果不同，优先检查这三类差异。

---

## 4. computeExpression（计算列表达式）

实现位于 `packages/spark-data/src/strategies/computed-column-delegate.ts`。

## 4.1 执行模型

`computeExpression` 是“逐行求值”，用于派生列。

- 纯表达式：自动包装 `return (...)`。
- 多语句函数体：要求表达式自己写 `return`。
- 求值上下文：`with(__row) { ... }`，行字段可直接引用。
- 可读取 `ctx`（通过 `setComputedContext` 注入）。

## 4.2 支持能力

- 算术、字符串拼接、三元表达式。
- 多语句 `if/else`、循环、函数定义。
- 链式计算列（列依赖列）。
- 子表聚合函数（依赖关系配置）：
  - `$sum/$count/$avg/$min/$max/$list/$join`

## 4.3 错误与降级策略

- 编译失败：该列跳过，不中断其他计算列。
- 运行时报错：该列写入 `undefined`，其他列继续。
- 表达式长度有上限（防止超长注入）。

## 4.4 与 FilterExpression 的边界

- `computeExpression` 负责“算值”。
- `filterExpression` 负责“筛行”。
- 视图聚合 `aggregates` 负责“整列汇总”。

三者互补，不互相替代。

---

## 5. 常见误区与建议

- 误区：把 SQL 写进 `computeExpression`（如 `DATEDIFF(...)`）。
  - 建议：`computeExpression` 只写 JavaScript。

- 误区：在远端过滤里沿用前端“按当前行取值”心智。
  - 建议：远端必须走 AST -> SQL 编译，`field ref` 解析为列/表达式。

- 误区：继续使用 `$[...]` / `$parent[...]` 字符串占位。
  - 建议：统一改为结构化字段引用 `{ kind: 'field', field: '...' }`。

- 误区：把空字符串当成 SQL NULL。
  - 建议：设计过滤条件时显式区分 `''` 和 `NULL`。

---

## 6. 快速对照

| 维度 | filterExpression | computeExpression |
|---|---|---|
| 目标 | 筛选行 | 计算列值 |
| 位置 | DataView 过滤 / 远端透传 | DataView 逐行计算 |
| 表达式形态 | 条件树 AST（JSON） | JS 字符串 |
| 字段引用 | `value: {kind:'field',field}` | 行字段直接写变量名 |
| 逻辑组合 | `and/or/!and/!or/!condition` | JS 逻辑语法 |
| 失败策略 | 非法结构直接抛错 | 单列失败降级为 `undefined` |

---

## 7. 最小示例

### 7.1 前端本地过滤

```json
{
  "filterExpression": {
    "type": "and",
    "children": [
      { "field": "status", "op": "==", "value": "open" },
      { "field": "amount", "op": ">=", "value": { "kind": "field", "field": "threshold" } }
    ]
  }
}
```

### 7.2 计算列

```json
{
  "columns": [
    { "name": "amount", "type": "number" },
    { "name": "tax", "type": "number", "computeExpression": "amount * ctx.taxRate" }
  ]
}
```

---

## 8. 参考实现与测试

- 前端类型：`packages/spark-data/src/types.ts`
- 前端过滤执行：`packages/spark-data/src/data-view.ts`
- 计算列委托：`packages/spark-data/src/strategies/computed-column-delegate.ts`
- 前端过滤测试：`packages/spark-data/src/tests/data-view-filter-expression.test.ts`
- 计算列测试：`packages/spark-data/src/tests/computed-columns.test.ts`
- lowcode 端点账本：`backend-api-contracts/lowcode-endpoint-ledger.json`
- AppWorks 消费者账本：`backend-api-contracts/appworks-consumer-ledger.json`
