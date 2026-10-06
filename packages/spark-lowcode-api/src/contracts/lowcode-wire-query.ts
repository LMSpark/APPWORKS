/**
 * lowcode-jdk17 数据查询 wire 字面量（排序方向 / 过滤操作符 / 分组聚合）。
 * 与 `backend-api-contracts/common.ts` 同形（`tools/verify-wire-query-parity.mjs`）。
 * 前端 DataView 使用 spark-data 的 `SortDirection` / `DataViewFilterOperator` / `AggregateType`，
 * 过滤由 API 独占 wire 转换；`AggregateType` 含客户端专用 `join`，不可硬合并。
 */

/** wire 排序方向（Jackson OrderType）。 */
export type OrderType = 'ascending' | 'descending'

/**
 * wire 过滤操作符（Jackson Filter.Operator）。
 * 禁止与 spark-data `DataViewFilterOperator`（`eq`/`contains` 等）同名混用。
 */
export type WireFilterOperator =
  | 'equal'
  | 'notequal'
  | 'greaterthan'
  | 'greaterthanorequal'
  | 'lessthan'
  | 'lessthanorequal'
  | 'isnull'
  | 'isnotnull'
  | 'contains'
  | 'nolike'
  | 'startswith'
  | 'nostartswith'
  | 'endswith'
  | 'notendswith'
  | 'in'
  | 'notin'
  | 'isempty'
  | 'isnotempty'

/**
 * wire 分组聚合函数（Jackson GroupFunType）。
 * 禁止与 spark-data `AggregateType` 混用（后者额外含 `join`）。
 */
export type GroupFunType = 'sum' | 'avg' | 'min' | 'max' | 'count'
