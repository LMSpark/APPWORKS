/**
 * 计算列深度测试 — 纯配置驱动
 *
 * 所有计算列均通过 DataColumn.computeExpression 列配置声明。
 * 编译归 DataTable（set dataTable 触发），求值归 DataView（行操作自动触发）。
 *
 * 全部测试共享一个 makeTestDS 工厂：Orders（父）→ Items（子），
 * 调用方只传入需要测试的计算列 + 可选行数据覆盖。
 *
 * 覆盖范围：
 *  1. 基础表达式        2. 多语句函数体      3. 链式计算列
 *  4. ctx 上下文        5. 动态行操作        6. 聚合函数
 *  7. 混合表达式        8. 聚合动态编辑      9. stripComputedColumns
 * 10. 运行时错误降级   11. 边界条件         12. 字符串内函数定义
 * 13. aggregateResult 列级聚合
 */

import { describe, it, expect, vi } from 'vitest'
import { DataSet } from '@spark-appworks/spark-data'
import { DataTable } from '../data-table'
import type { DataRow, AggregateColumnConfig } from '@spark-appworks/spark-data'
import { requireNumber } from './test-type-helpers'
import { ResourceRelationDefinition } from '../resource-relation/resource-relation-definition'
import { DataViewFilter } from '../query/filter/data-view-filter'

// ─────────────────────────────────────────────────────────────────────────────
// 共享工具
// ─────────────────────────────────────────────────────────────────────────────

/** 读取行字段（绕过 noPropertyAccessFromIndexSignature） */
const f = (row: DataRow | undefined, field: string): unknown => row?.[field]
const nf = (row: DataRow | undefined, field: string): number => requireNumber(f(row, field), `Expected ${field} to be a number`)

/**
 * 默认测试数据（Orders + Items 主子关系）
 *
 *   Order 1 ── Item A(100), B(200), C(50)  → sum=350, count=3, avg≈116.67, min=50, max=200
 *   Order 2 ── Item X(80)                  → sum=80,  count=1
 *   Order 3 ── (无子行)                     → sum=0,   count=0
 */
const DEFAULT_ORDERS: DataRow[] = [
  { id: 1, price: 100, qty: 6, score: 95, firstName: '张', lastName: '三', amount: 1500, n: 5, w: 65, h: 1.75, a: 5, b: 6, x: 4, obj: null, items: 'apple, banana, cherry' },
  { id: 2, price: 50,  qty: 2, score: 72, firstName: '李', lastName: '四', amount: 300,  n: 0, w: 90, h: 1.70, a: 3, b: 7, x: 8, obj: null, items: 'x, y' },
  { id: 3, price: 0,   qty: 99, score: 45, firstName: '王', lastName: '五', amount: 800,  n: 1, w: 50, h: 1.60, a: 0, b: 0, x: 0, obj: null, items: '' },
]

const DEFAULT_ITEMS: DataRow[] = [
  { id: 101, orderId: 1, name: 'A', amount: 100 },
  { id: 102, orderId: 1, name: 'B', amount: 200 },
  { id: 103, orderId: 1, name: 'C', amount: 50 },
  { id: 104, orderId: 2, name: 'X', amount: 80 },
]

/**
 * 构建 Orders → Items 主子 DataSet。
 *
 * @param computedCols Orders 表追加的额外列（仅列定义 + 计算表达式）
 * @param orderRows    自定义 Orders 行数据（默认 DEFAULT_ORDERS）
 * @param itemRows     自定义 Items 行数据（默认 DEFAULT_ITEMS）
 * @param aggregateMap 视图级聚合配置（如 `{ price: { type: 'sum' }, score: { type: 'avg' } }`）
 */
function makeTestDS(
  computedCols: Array<{ name: string; type?: string; computeExpression?: string }> = [],
  orderRows?: DataRow[],
  itemRows?: DataRow[],
  aggregateMap?: Record<string, AggregateColumnConfig>,
) {
  const aggregates: Record<string, AggregateColumnConfig> = {
    ...aggregateMap,
  }

  const ds = DataSet.fromJson({
    dataSetName: 'TestDS',
    tables: {
      Orders: {
        tableName: 'Orders',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'price', type: 'number' },
          { name: 'qty', type: 'number' },
          { name: 'score', type: 'number' },
          { name: 'firstName', type: 'string' },
          { name: 'lastName', type: 'string' },
          { name: 'amount', type: 'number' },
          { name: 'n', type: 'number' },
          { name: 'w', type: 'number' },
          { name: 'h', type: 'number' },
          { name: 'a', type: 'number' },
          { name: 'b', type: 'number' },
          { name: 'x', type: 'number' },
          { name: 'obj', type: 'string' },
          { name: 'items', type: 'string' },
          ...computedCols.map(c => ({
            name: c.name,
            type: c.type ?? 'string',
            ...(c.computeExpression ? { computeExpression: c.computeExpression } : {}),
          })),
        ],
        views: {
          default: {
            rows: orderRows ?? DEFAULT_ORDERS,
            ...(Object.keys(aggregates).length > 0 ? { aggregates } : {}),
          },
        },
      },
      Items: {
        tableName: 'Items',
        columns: [
          { name: 'id', type: 'number', isPrimaryKey: true },
          { name: 'orderId', type: 'number' },
          { name: 'name', type: 'string' },
          { name: 'amount', type: 'number' },
        ],
        views: {
          default: {
            rows: itemRows ?? DEFAULT_ITEMS,
          },
        },
      },
    },
    resourceRelations: [{
      parentTable: 'Orders',
      childTable: 'Items',
      childField: 'orderId',
    }],
  })
  return {
    ds,
    orders: ds.getView('Orders', 'default')!,
    items: ds.getView('Items', 'default')!,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 基础表达式
// ─────────────────────────────────────────────────────────────────────────────
describe('基础表达式', () => {
  it('算术：price * qty', () => {
    const { orders } = makeTestDS([{ name: 'total', type: 'number', computeExpression: 'price * qty' }])
    expect(f(orders.rows[0], 'total')).toBe(600)  // 100 * 6
    expect(f(orders.rows[1], 'total')).toBe(100)  // 50 * 2
  })

  it('字符串拼接：firstName + lastName', () => {
    const { orders } = makeTestDS([{ name: 'fullName', computeExpression: "firstName + ' ' + lastName" }])
    expect(f(orders.rows[0], 'fullName')).toBe('张 三')
  })

  it('三元条件：score >= 60', () => {
    const { orders } = makeTestDS([{ name: 'result', computeExpression: "score >= 60 ? '及格' : '不及格'" }])
    expect(f(orders.rows[0], 'result')).toBe('及格')    // 95
    expect(f(orders.rows[2], 'result')).toBe('不及格')  // 45
  })

  it('字段值为 0 / null 时表达式正常处理', () => {
    const { orders } = makeTestDS(
      [{ name: 'total', type: 'number', computeExpression: 'price * qty' }],
      [{ id: 1, price: 0, qty: 99 }, { id: 2, price: null, qty: 3 }],
    )
    expect(f(orders.rows[0], 'total')).toBe(0)   // 0 * 99
    expect(f(orders.rows[1], 'total')).toBe(0)   // null * 3 = 0（JS 强转）
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. 多语句函数体（支持任意 JS 逻辑）
// ─────────────────────────────────────────────────────────────────────────────
describe('多语句函数体', () => {
  it('if/else 分支', () => {
    const { orders } = makeTestDS([{
      name: 'grade',
      computeExpression: `
        if (score >= 90) return 'A';
        else if (score >= 80) return 'B';
        else if (score >= 60) return 'C';
        else return 'D';
      `,
    }])
    expect(f(orders.rows[0], 'grade')).toBe('A')  // 95
    expect(f(orders.rows[1], 'grade')).toBe('C')  // 72
    expect(f(orders.rows[2], 'grade')).toBe('D')  // 45
  })

  it('变量声明 + 折扣计算', () => {
    const { orders } = makeTestDS([{
      name: 'finalPrice', type: 'number',
      computeExpression: `
        var subtotal = price * qty;
        var discount = subtotal > 500 ? 0.9 : 1.0;
        return subtotal * discount;
      `,
    }])
    // row1: 600 * 0.9 = 540; row2: 100 * 1.0 = 100
    expect(f(orders.rows[0], 'finalPrice')).toBe(540)
    expect(f(orders.rows[1], 'finalPrice')).toBe(100)
  })

  it('for 循环累加（阶乘）', () => {
    const { orders } = makeTestDS([{
      name: 'factorial', type: 'number',
      computeExpression: `
        var result = 1;
        for (var i = 2; i <= n; i++) result *= i;
        return result;
      `,
    }])
    expect(f(orders.rows[0], 'factorial')).toBe(120) // 5!
    expect(f(orders.rows[1], 'factorial')).toBe(1)   // 0!
    expect(f(orders.rows[2], 'factorial')).toBe(1)   // 1!
  })

  it('函数体 + ctx 联合', () => {
    const { orders } = makeTestDS([{
      name: 'tier',
      computeExpression: `
        var threshold = ctx.vipThreshold || 1000;
        if (amount >= threshold) return 'VIP';
        return '普通';
      `,
    }])
    orders.setComputedContext({ vipThreshold: 1000 })
    expect(f(orders.rows[0], 'tier')).toBe('VIP')  // 1500
    expect(f(orders.rows[1], 'tier')).toBe('普通') // 300
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. 链式计算列
// ─────────────────────────────────────────────────────────────────────────────
describe('链式计算列', () => {
  it('subtotal → tax（两级链）', () => {
    const { orders } = makeTestDS([
      { name: 'subtotal', type: 'number', computeExpression: 'price * qty' },
      { name: 'tax', type: 'number', computeExpression: 'subtotal * 0.1' },
    ])
    expect(f(orders.rows[0], 'subtotal')).toBe(600)
    expect(nf(orders.rows[0], 'tax')).toBeCloseTo(60)
  })

  it('subtotal → tax → grandTotal（三级链）', () => {
    const { orders } = makeTestDS([
      { name: 'subtotal', type: 'number', computeExpression: 'price * qty' },
      { name: 'tax', type: 'number', computeExpression: 'subtotal * 0.08' },
      { name: 'grandTotal', type: 'number', computeExpression: 'subtotal + tax' },
    ])
    expect(f(orders.rows[0], 'subtotal')).toBe(600)
    expect(nf(orders.rows[0], 'tax')).toBeCloseTo(48)
    expect(nf(orders.rows[0], 'grandTotal')).toBeCloseTo(648)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. ctx 上下文 — setComputedContext 动态切换
// ─────────────────────────────────────────────────────────────────────────────
describe('ctx 上下文', () => {
  it('ctx.taxRate 驱动税率计算', () => {
    const { orders } = makeTestDS([{ name: 'tax', type: 'number', computeExpression: 'amount * ctx.taxRate' }])
    orders.setComputedContext({ taxRate: 0.1 })
    expect(nf(orders.rows[0], 'tax')).toBeCloseTo(150) // 1500 * 0.1
  })

  it('setComputedContext 切换后自动重算', () => {
    const { orders } = makeTestDS([{ name: 'tax', type: 'number', computeExpression: 'amount * ctx.taxRate' }])
    orders.setComputedContext({ taxRate: 0.05 })
    expect(nf(orders.rows[0], 'tax')).toBeCloseTo(75)   // 1500 * 0.05

    orders.setComputedContext({ taxRate: 0.15 })
    expect(nf(orders.rows[0], 'tax')).toBeCloseTo(225)  // 1500 * 0.15
  })

  it('ctx 多字段联合计算', () => {
    const { orders } = makeTestDS([{
      name: 'final', type: 'number',
      computeExpression: 'amount * (1 - ctx.discount) * (1 + ctx.taxRate)',
    }])
    orders.setComputedContext({ discount: 0.2, taxRate: 0.08 })
    // 1500 * 0.8 * 1.08 = 1296
    expect(nf(orders.rows[0], 'final')).toBeCloseTo(1296)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. 动态行操作自动求值
// ─────────────────────────────────────────────────────────────────────────────
describe('动态行操作自动求值', () => {
  const TOTAL_COL = [{ name: 'total', type: 'number', computeExpression: 'price * qty' }]

  it('replaceRows — 全量替换后自动求值', () => {
    const { orders } = makeTestDS(TOTAL_COL, [])
    orders.replaceRows([{ id: 1, price: 8, qty: 5 }])
    expect(f(orders.rows[0], 'total')).toBe(40)
  })

  it('appendRow — 新行自动带计算列值', () => {
    const { orders } = makeTestDS(TOTAL_COL, [{ id: 1, price: 10, qty: 2 }])
    orders.appendRow({ id: 2, price: 7, qty: 3 })
    expect(f(orders.rows[1], 'total')).toBe(21)
  })

  it('updateRowById — 源字段变更后计算列自动重算', () => {
    const { orders } = makeTestDS(TOTAL_COL, [{ id: 1, price: 10, qty: 3 }])
    expect(f(orders.rows[0], 'total')).toBe(30)

    orders.updateRowById(1, { price: 20 })
    expect(f(orders.rows[0], 'total')).toBe(60)

    orders.updateRowById(1, { qty: 1 })
    expect(f(orders.rows[0], 'total')).toBe(20)
  })

  it('replaceRows — 批量替换全部自动求值', () => {
    const { orders } = makeTestDS([{ name: 'sq', type: 'number', computeExpression: 'x * x' }], [])
    orders.replaceRows([{ id: 1, x: 3 }, { id: 2, x: 4 }, { id: 3, x: 5 }])
    expect(orders.rows.map(r => r['sq'])).toEqual([9, 16, 25])
  })

  it('editRowById — 编辑后计算列动态重算', async () => {
    const { orders } = makeTestDS(TOTAL_COL, [{ id: 1, price: 5, qty: 4 }])
    expect(f(orders.rows[0], 'total')).toBe(20)

    await orders.editRowById(1, { price: 10 })
    expect(f(orders.rows[0], 'total')).toBe(40)
  })

  it('updateFromServer — 服务端响应后自动求值', () => {
    const { orders } = makeTestDS([{ name: 'half', type: 'number', computeExpression: 'n / 2' }], [])
    orders.updateFromServer({ rows: [{ id: 1, n: 10 }, { id: 2, n: 20 }] })
    expect(f(orders.rows[0], 'half')).toBe(5)
    expect(f(orders.rows[1], 'half')).toBe(10)
  })

  it('多次连续 updateRowById — 每次都反映最新值', () => {
    const { orders } = makeTestDS(TOTAL_COL, [{ id: 1, price: 10, qty: 2 }])

    orders.updateRowById(1, { price: 20 })
    expect(f(orders.rows[0], 'total')).toBe(40)

    orders.updateRowById(1, { qty: 5 })
    expect(f(orders.rows[0], 'total')).toBe(100)

    orders.updateRowById(1, { price: 1, qty: 1 })
    expect(f(orders.rows[0], 'total')).toBe(1)
  })

  it('recomputeColumns — 直接修改行后手动重算', () => {
    const { orders } = makeTestDS(TOTAL_COL, [{ id: 1, price: 8, qty: 5 }])
    expect(f(orders.rows[0], 'total')).toBe(40)

    orders.rows[0]!['price'] = 10
    orders.recomputeColumns()
    expect(f(orders.rows[0], 'total')).toBe(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. 聚合函数 — DataSet 关联
// ─────────────────────────────────────────────────────────────────────────────
describe('聚合函数', () => {
  it('consumes nested relation filters in computed aggregation and recomputes after relation update', () => {
    const {ds, orders} = makeTestDS([{name: 'total', type: 'number', computeExpression: "$sum('Items', 'amount')"}])
    expect(f(orders.rows[0], 'total')).toBe(350)
    ds.updateResourceRelation({parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId'}, {
      filterExpression: DataViewFilter.group({logic: 'and', filters: [
        DataViewFilter.condition({field: 'Items.orderId', operator: 'eq', value: {Type: 'GetTableField', Field: 'Orders.id'}}).toJSON(),
        DataViewFilter.group({logic: 'or', filters: [
          DataViewFilter.condition({field: 'Items.amount', operator: 'gt', value: {Type: 'GetConstValue', Value: 100}}).toJSON(),
          DataViewFilter.condition({field: 'Items.amount', operator: 'eq', value: {Type: 'GetConstValue', Value: 50}}).toJSON(),
        ]}).toJSON(),
      ]}).toJSON(),
    })
    expect(f(orders.rows[0], 'total')).toBe(250)
  })

  it('validates unsupported relation functions even when the child view has no rows', () => {
    const filter = DataViewFilter.condition({field: 'Items.orderId', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'Orders'}}).toJSON()
    expect(() => ResourceRelationDefinition.createMatcher({expression: filter, parentTable: 'Orders', childTable: 'Items', parent: {id: 1}, parentFields: new Set(['id']), childFields: new Set(['orderId'])}))
      .toThrow(/静态视图无法执行值函数 GetRefData/)
  })

  it('keeps legacy field-mapping null keys unassociated while explicit filter trees retain null equality', () => {
    const legacy = ResourceRelationDefinition.normalize({parentTable: 'Orders', childTable: 'Items', childField: 'orderId'}, {
      Orders: {columns: [{name: 'id', isPrimaryKey: true}]}, Items: {columns: [{name: 'orderId'}]},
    })
    const legacyMatches = ResourceRelationDefinition.createMatcher({expression: legacy.filterExpression!, parentTable: 'Orders', childTable: 'Items', parent: {id: null}, parentFields: new Set(['id']), childFields: new Set(['orderId'])})
    expect(legacyMatches({orderId: null})).toBe(false)

    const explicit = DataViewFilter.condition({field: 'orderId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}).toJSON()
    const explicitMatches = ResourceRelationDefinition.createMatcher({expression: explicit, parentTable: 'Orders', childTable: 'Items', parent: {id: null}, parentFields: new Set(['id']), childFields: new Set(['orderId'])})
    expect(explicitMatches({orderId: null})).toBe(true)
  })

  it('validates qualified parent and child references before rows can short-circuit diagnostics', () => {
    const expression = DataViewFilter.condition({field: 'Items.orderId', operator: 'eq', value: {Type: 'GetTableField', Field: 'Orders.id'}}).toJSON()
    expect(() => ResourceRelationDefinition.createMatcher({expression, parentTable: 'Orders', childTable: 'Items', parent: {}, parentFields: new Set(['id']), childFields: new Set(['orderId'])}))
      .toThrow(/父行缺少字段 "id"/)
    const matches = ResourceRelationDefinition.createMatcher({expression, parentTable: 'Orders', childTable: 'Items', parent: {id: null}, parentFields: new Set(['id']), childFields: new Set(['orderId'])})
    expect(() => matches({})).toThrow(/子行缺少字段 "orderId"/)
    expect(matches({orderId: null})).toBe(true)
  })

  it('rejects ancestor GetTableField without a row context and leaves computed aggregates unset', () => {
    const {ds, orders} = makeTestDS([{name: 'total', type: 'number', computeExpression: "$sum('Items', 'amount')"}])
    const expression = DataViewFilter.condition({field: 'Items.orderId', operator: 'eq', value: {Type: 'GetTableField', Field: 'Ancestor.id'}}).toJSON()
    ds.updateResourceRelation({parentTable: 'Orders', childTable: 'Items', parentField: 'id', childField: 'orderId'}, {filterExpression: expression})
    expect(() => ResourceRelationDefinition.createMatcher({expression, parentTable: 'Orders', childTable: 'Items',
      parent: {id: 1}, parentFields: new Set(['id']), childFields: new Set(['orderId'])}))
      .toThrow(/关系过滤字段限定名不匹配: Ancestor.id/)
    expect(f(orders.rows[0], 'total')).toBeUndefined()
    expect(f(orders.rows[1], 'total')).toBeUndefined()
  })

  it('$sum — 累计子行字段', () => {
    const { orders } = makeTestDS([{ name: 'total', type: 'number', computeExpression: "$sum('Items', 'amount')" }])
    expect(f(orders.rows[0], 'total')).toBe(350) // 100+200+50
    expect(f(orders.rows[1], 'total')).toBe(80)
  })

  it('$count — 子行数量', () => {
    const { orders } = makeTestDS([{ name: 'cnt', type: 'number', computeExpression: "$count('Items')" }])
    expect(f(orders.rows[0], 'cnt')).toBe(3)
    expect(f(orders.rows[1], 'cnt')).toBe(1)
  })

  it('$avg — 子行均值', () => {
    const { orders } = makeTestDS([{ name: 'avg', type: 'number', computeExpression: "$avg('Items', 'amount')" }])
    expect(nf(orders.rows[0], 'avg')).toBeCloseTo(116.67, 1)
  })

  it('$min / $max — 子行极值', () => {
    const { orders } = makeTestDS([
      { name: 'mn', type: 'number', computeExpression: "$min('Items', 'amount')" },
      { name: 'mx', type: 'number', computeExpression: "$max('Items', 'amount')" },
    ])
    expect(f(orders.rows[0], 'mn')).toBe(50)
    expect(f(orders.rows[0], 'mx')).toBe(200)
  })

  it('$list — 子行字段数组', () => {
    const { orders } = makeTestDS([{ name: 'names', computeExpression: "$list('Items', 'name')" }])
    expect(f(orders.rows[0], 'names')).toEqual(['A', 'B', 'C'])
    expect(f(orders.rows[1], 'names')).toEqual(['X'])
  })

  it('$join — 默认分隔符', () => {
    const { orders } = makeTestDS([{ name: 'joined', computeExpression: "$join('Items', 'name')" }])
    expect(f(orders.rows[0], 'joined')).toBe('A, B, C')
  })

  it('$join — 自定义分隔符', () => {
    const { orders } = makeTestDS([{ name: 'tags', computeExpression: "$join('Items', 'name', ' | ')" }])
    expect(f(orders.rows[0], 'tags')).toBe('A | B | C')
  })

  it('子行为空时聚合边界值正确', () => {
    const { orders } = makeTestDS(
      [
        { name: 'total', type: 'number', computeExpression: "$sum('Items', 'amount')" },
        { name: 'cnt',   type: 'number', computeExpression: "$count('Items')" },
        { name: 'avg',   type: 'number', computeExpression: "$avg('Items', 'amount')" },
        { name: 'mn',    type: 'number', computeExpression: "$min('Items', 'amount')" },
        { name: 'mx',    type: 'number', computeExpression: "$max('Items', 'amount')" },
        { name: 'lst',   computeExpression: "$list('Items', 'amount')" },
        { name: 'jn',    computeExpression: "$join('Items', 'amount')" },
      ],
      undefined,
      [],  // 空子行
    )
    expect(f(orders.rows[0], 'total')).toBe(0)
    expect(f(orders.rows[0], 'cnt')).toBe(0)
    expect(f(orders.rows[0], 'avg')).toBe(0)
    expect(f(orders.rows[0], 'mn')).toBeUndefined()
    expect(f(orders.rows[0], 'mx')).toBeUndefined()
    expect(f(orders.rows[0], 'lst')).toEqual([])
    expect(f(orders.rows[0], 'jn')).toBe('')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. 混合表达式 — 算术 + 聚合 + ctx 组合
// ─────────────────────────────────────────────────────────────────────────────
describe('混合表达式', () => {
  it('聚合 + 算术：$sum * 1.08', () => {
    const { orders } = makeTestDS([{ name: 'taxTotal', type: 'number', computeExpression: "$sum('Items', 'amount') * 1.08" }])
    expect(nf(orders.rows[0], 'taxTotal')).toBeCloseTo(378)   // 350 * 1.08
    expect(nf(orders.rows[1], 'taxTotal')).toBeCloseTo(86.4)  // 80 * 1.08
  })

  it('聚合 + ctx：$sum * ctx.taxRate', () => {
    const { orders } = makeTestDS([{ name: 'tax', type: 'number', computeExpression: "$sum('Items', 'amount') * ctx.taxRate" }])
    orders.setComputedContext({ taxRate: 0.1 })
    expect(nf(orders.rows[0], 'tax')).toBeCloseTo(35)  // 350 * 0.1

    orders.setComputedContext({ taxRate: 0.2 })
    expect(nf(orders.rows[0], 'tax')).toBeCloseTo(70)  // 350 * 0.2
  })

  it('聚合 + 三元：$count > 0 ? $avg : 0', () => {
    const { orders } = makeTestDS([{
      name: 'safeAvg', type: 'number',
      computeExpression: "$count('Items') > 0 ? $avg('Items', 'amount') : 0",
    }])
    expect(nf(orders.rows[0], 'safeAvg')).toBeCloseTo(116.67, 1)
  })

  it('聚合 + 字符串拼接', () => {
    const { orders } = makeTestDS([{
      name: 'summary',
      computeExpression: "'订单' + id + '：' + $count('Items') + '项，合计' + $sum('Items', 'amount')",
    }])
    expect(f(orders.rows[0], 'summary')).toBe('订单1：3项，合计350')
    expect(f(orders.rows[1], 'summary')).toBe('订单2：1项，合计80')
  })

  it('链式 + 聚合 + ctx', () => {
    const { orders } = makeTestDS([
      { name: 'subtotal', type: 'number', computeExpression: "$sum('Items', 'amount')" },
      { name: 'tax', type: 'number', computeExpression: 'subtotal * ctx.taxRate' },
      { name: 'grandTotal', type: 'number', computeExpression: 'subtotal + tax' },
    ])
    orders.setComputedContext({ taxRate: 0.1 })
    expect(f(orders.rows[0], 'subtotal')).toBe(350)
    expect(nf(orders.rows[0], 'tax')).toBeCloseTo(35)
    expect(nf(orders.rows[0], 'grandTotal')).toBeCloseTo(385)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. 聚合 — 子表行编辑后 recomputeColumns
// ─────────────────────────────────────────────────────────────────────────────
describe('聚合动态行编辑', () => {
  const AGG_COLS = [
    { name: 'total', type: 'number', computeExpression: "$sum('Items', 'amount')" },
    { name: 'cnt',   type: 'number', computeExpression: "$count('Items')" },
  ]

  it('fromJson 后聚合即已求值', () => {
    const { orders } = makeTestDS(AGG_COLS)
    expect(f(orders.rows[0], 'total')).toBe(350)
    expect(f(orders.rows[0], 'cnt')).toBe(3)
    expect(f(orders.rows[1], 'total')).toBe(80)
    expect(f(orders.rows[1], 'cnt')).toBe(1)
  })

  it('子表 appendRow → recomputeColumns → 聚合更新', () => {
    const { orders, items } = makeTestDS(AGG_COLS)
    items.appendRow({ id: 200, orderId: 1, amount: 50 })

    orders.recomputeColumns()
    expect(f(orders.rows[0], 'total')).toBe(400) // 350 + 50
    expect(f(orders.rows[0], 'cnt')).toBe(4)
    expect(f(orders.rows[1], 'total')).toBe(80)  // unchanged
  })

  it('子表 updateRowById → recomputeColumns → 聚合更新', () => {
    const { orders, items } = makeTestDS(AGG_COLS)
    items.updateRowById(101, { amount: 500 })

    orders.recomputeColumns()
    expect(f(orders.rows[0], 'total')).toBe(750) // 500+200+50
    expect(f(orders.rows[0], 'cnt')).toBe(3)
  })

  it('子表 replaceRows → recomputeColumns → 聚合更新', () => {
    const { orders, items } = makeTestDS(AGG_COLS)
    items.replaceRows([
      { id: 101, orderId: 1, amount: 7 },
      { id: 102, orderId: 1, amount: 3 },
      { id: 103, orderId: 2, amount: 50 },
      { id: 104, orderId: 2, amount: 50 },
    ])

    orders.recomputeColumns()
    expect(f(orders.rows[0], 'total')).toBe(10)
    expect(f(orders.rows[1], 'total')).toBe(100)
  })

  it('子表删除行 → recomputeColumns → 聚合缩减', () => {
    const { orders, items } = makeTestDS(AGG_COLS)
    items.replaceRows(items.rows.filter(r => r['id'] !== 101))

    orders.recomputeColumns()
    expect(f(orders.rows[0], 'total')).toBe(250) // 200+50
    expect(f(orders.rows[0], 'cnt')).toBe(2)
  })

  it('父表 appendRow — 新父行聚合基于当前子表快照', () => {
    const { orders, items } = makeTestDS(AGG_COLS)
    items.appendRow({ id: 200, orderId: 4, amount: 42 })
    orders.appendRow({ id: 4 })

    expect(f(orders.rows[3], 'total')).toBe(42)
    expect(f(orders.rows[3], 'cnt')).toBe(1)
  })

  it('父表 updateRowById — 聚合值不受非关联字段更新影响', () => {
    const { orders } = makeTestDS(AGG_COLS)
    orders.updateRowById(1, { note: 'updated' })

    expect(f(orders.rows[0], 'total')).toBe(350)
    expect(f(orders.rows[0], 'cnt')).toBe(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. CRUD 提交前剥离（内部由 CrudDelegate 调用）
// ─────────────────────────────────────────────────────────────────────────────
describe('stripComputedColumns', () => {
  it('剥离计算字段，返回浅拷贝', () => {
    const { orders } = makeTestDS([{ name: 'total', type: 'number', computeExpression: 'price * qty' }])
    const row = { id: 1, price: 10, qty: 5, total: 50 }
    const stripped = orders.stripComputedColumns(row)
    expect('total' in stripped).toBe(false)
    expect(stripped['price']).toBe(10)
    expect(stripped['qty']).toBe(5)
  })

  it('仅含 _pk 计算列时，不含 _pk 的行返回剥离结果（_pk 始终注册为计算列）', () => {
    const { orders } = makeTestDS([])
    const row = { id: 1, name: 'A' }
    const stripped = orders.stripComputedColumns(row)
    expect(stripped).toStrictEqual({ id: 1, name: 'A' })
    // _pk 始终注册为计算列，strip 总会过滤
  })

  it('strip 不影响原始行对象', () => {
    const { orders } = makeTestDS([{ name: 'tag', computeExpression: "'#' + x" }])
    const row = { id: 1, x: 10, tag: '#10' }
    orders.stripComputedColumns(row)
    expect(row['tag']).toBe('#10')
  })

  it('聚合计算列也被正确剥离', () => {
    const { orders } = makeTestDS([{ name: 'total', type: 'number', computeExpression: "$sum('Items', 'amount')" }])
    const stripped = orders.stripComputedColumns(orders.rows[0]!)
    expect('total' in stripped).toBe(false)
    expect(stripped['id']).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. 运行时错误降级
// ─────────────────────────────────────────────────────────────────────────────
describe('运行时错误降级', () => {
  it('表达式求值抛出时写入 undefined，不影响其他计算列', () => {
    const { orders } = makeTestDS(
      [
        { name: 'broken', computeExpression: 'obj.x.y' },
        { name: 'safe', computeExpression: "id + '!'" },
      ],
      [{ id: 1, obj: null }],
    )
    expect(f(orders.rows[0], 'broken')).toBeUndefined()
    expect(f(orders.rows[0], 'safe')).toBe('1!')
  })

  it('编译失败的列跳过，其余计算列正常工作', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { orders } = makeTestDS(
      [
        { name: 'good', type: 'number', computeExpression: 'x + 1' },
        { name: 'bad', type: 'number', computeExpression: '??invalid!!' },
        { name: 'also_good', type: 'number', computeExpression: 'x * 2' },
      ],
      [{ id: 1, x: 4 }],
    )
    expect(f(orders.rows[0], 'good')).toBe(5)
    expect(f(orders.rows[0], 'also_good')).toBe(8)
    expect(orders.computedColumnNames.has('bad')).toBe(false)
    warnSpy.mockRestore()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. 边界条件
// ─────────────────────────────────────────────────────────────────────────────
describe('边界条件', () => {
  it('DataSet.fromJson 自动编译 + 求值（无需手动触发）', () => {
    const { orders } = makeTestDS([{ name: 'total', type: 'number', computeExpression: 'price * qty' }])
    expect(f(orders.rows[0], 'total')).toBe(600) // 100*6
    expect(f(orders.rows[1], 'total')).toBe(100) // 50*2
  })

  it('DataTable attach 时自动注册计算列（空 rows 安全）', () => {
    const table = new DataTable('T', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'price', type: 'number' },
      { name: 'total', type: 'number', computeExpression: 'price * 2' },
    ])
    const view = table.getOrCreateView('default')
    expect(view.computedColumnNames.has('total')).toBe(true)
    expect(view.rows.length).toBe(0)
  })

  it('编译缓存命中 — 相同 ctx 不重编译', () => {
    const { orders } = makeTestDS([{ name: 'result', type: 'number', computeExpression: 'x + ctx.offset' }])
    orders.setComputedContext({ offset: 10 })
    expect(f(orders.rows[0], 'result')).toBe(14)  // x=4 + 10

    // 再次设置相同 ctx → 不应重编译，结果仍正确
    orders.setComputedContext({ offset: 10 })
    expect(f(orders.rows[0], 'result')).toBe(14)
  })

  it('新增 DataTable 后 replaceRows 自动触发计算', () => {
    const table = new DataTable('T', [
      { name: 'id', type: 'number', isPrimaryKey: true },
      { name: 'a', type: 'number' },
      { name: 'b', type: 'number' },
      { name: 'sum', type: 'number', computeExpression: 'a + b' },
    ])
    const view = table.getOrCreateView('default')
    view.replaceRows([{ id: 1, a: 3, b: 7 }])
    expect(f(view.rows[0], 'sum')).toBe(10)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 12. 字符串内函数定义（表达式支持任意 JS 逻辑）
// ─────────────────────────────────────────────────────────────────────────────
describe('字符串内函数定义', () => {
  it('基础函数定义 + 调用', () => {
    const { orders } = makeTestDS(
      [{ name: 'sum', type: 'number', computeExpression: 'function add(x,y){ return x+y; }; return add(a, b);' }],
    )
    expect(f(orders.rows[0], 'sum')).toBe(11) // a=5, b=6
  })

  it('工具函数 + 格式化', () => {
    const { orders } = makeTestDS([{
      name: 'formatted',
      computeExpression: `
        function fmt(n) { return '￥' + n.toFixed(2); }
        var total = price * qty;
        return fmt(total);
      `,
    }])
    expect(f(orders.rows[0], 'formatted')).toBe('￥600.00') // 100*6
  })

  it('递归函数（斐波那契）', () => {
    const { orders } = makeTestDS([{
      name: 'fib', type: 'number',
      computeExpression: `
        function fib(x) {
          if (x <= 1) return x;
          return fib(x - 1) + fib(x - 2);
        }
        return fib(n);
      `,
    }])
    expect(f(orders.rows[0], 'fib')).toBe(5) // fib(5)
    expect(f(orders.rows[1], 'fib')).toBe(0) // fib(0)
    expect(f(orders.rows[2], 'fib')).toBe(1) // fib(1)
  })

  it('函数引用 ctx 上下文', () => {
    const { orders } = makeTestDS([{
      name: 'tax', type: 'number',
      computeExpression: `
        function calcTax(val, rate) { return val * rate; }
        return calcTax(amount, ctx.taxRate);
      `,
    }])
    orders.setComputedContext({ taxRate: 0.13 })
    expect(nf(orders.rows[0], 'tax')).toBeCloseTo(195) // 1500*0.13
  })

  it('数组处理函数', () => {
    const { orders } = makeTestDS([{
      name: 'parsed',
      computeExpression: `
        function parse(str) {
          var arr = str.split(',');
          return arr.map(function(s){ return s.trim().toUpperCase(); }).join(' | ');
        }
        return parse(items);
      `,
    }])
    expect(f(orders.rows[0], 'parsed')).toBe('APPLE | BANANA | CHERRY')
  })

  it('多个函数定义协作（BMI 分类）', () => {
    const { orders } = makeTestDS([{
      name: 'bmi',
      computeExpression: `
        function calcBMI(weight, height) { return weight / (height * height); }
        function classify(bmi) {
          if (bmi < 18.5) return '偏瘦';
          if (bmi < 24) return '正常';
          if (bmi < 28) return '偏胖';
          return '肥胖';
        }
        return classify(calcBMI(w, h));
      `,
    }])
    expect(f(orders.rows[0], 'bmi')).toBe('正常')  // 65/1.75²≈21.2
    expect(f(orders.rows[1], 'bmi')).toBe('肥胖')  // 90/1.70²≈31.1
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 13. aggregateResult — 列级聚合
// ─────────────────────────────────────────────────────────────────────────────
describe('aggregateResult 列级聚合', () => {
  it('sum — 所有行求和', () => {
    const { orders } = makeTestDS([], undefined, undefined, { price: { type: 'sum' } })
    expect(orders.aggregateResult['price']).toBe(150)  // 100+50+0
  })

  it('count — 非 null/undefined 值计数', () => {
    const { orders } = makeTestDS([],
      [{ id: 1, score: 95 }, { id: 2, score: null }, { id: 3, score: 45 }],
      undefined, { score: { type: 'count' } },
    )
    expect(orders.aggregateResult['score']).toBe(2)  // null 不计
  })

  it('avg — 算术平均', () => {
    const { orders } = makeTestDS([], undefined, undefined, { price: { type: 'avg' } })
    expect(orders.aggregateResult['price']).toBe(50)  // (100+50+0)/3
  })

  it('min / max — 极值', () => {
    const { orders } = makeTestDS([], undefined, undefined, { price: { type: 'min' }, qty: { type: 'max' } })
    expect(orders.aggregateResult['price']).toBe(0)
    expect(orders.aggregateResult['qty']).toBe(99)
  })

  it('空行时聚合边界值正确', () => {
    const { orders } = makeTestDS([], [], undefined,
      { price: { type: 'sum' }, qty: { type: 'avg' }, score: { type: 'min' } },
    )
    expect(orders.aggregateResult['price']).toBe(0)          // sum 空集 = 0
    expect(orders.aggregateResult['qty']).toBe(0)             // avg 空集 = 0
    expect(orders.aggregateResult['score']).toBeUndefined()   // min 空集 = undefined
  })

  it('多列混合聚合类型', () => {
    const { orders } = makeTestDS([], undefined, undefined,
      { amount: { type: 'sum' }, score: { type: 'avg' }, price: { type: 'min' }, qty: { type: 'max' }, firstName: { type: 'count' } },
    )
    expect(orders.aggregateResult['amount']).toBe(2600)          // 1500+300+800
    expect(orders.aggregateResult['score']).toBeCloseTo(70.67, 1) // (95+72+45)/3
    expect(orders.aggregateResult['price']).toBe(0)
    expect(orders.aggregateResult['qty']).toBe(99)
    expect(orders.aggregateResult['firstName']).toBe(3)           // 张、李、王
  })

  it('无 aggregate 列时 aggregateResult 为空对象', () => {
    const { orders } = makeTestDS([])
    expect(orders.aggregateResult).toEqual({})
  })

  // 计算列 + 视图聚合组合（列定义与聚合配置独立声明）

  it('计算列 sum — 先逐行求值再整列聚合', () => {
    const { orders } = makeTestDS([
      { name: 'total', type: 'number', computeExpression: 'price * qty' },
    ], undefined, undefined, { total: { type: 'sum' } })
    expect(f(orders.rows[0], 'total')).toBe(600)  // 100*6
    expect(f(orders.rows[1], 'total')).toBe(100)  // 50*2
    expect(f(orders.rows[2], 'total')).toBe(0)    // 0*99
    expect(orders.aggregateResult['total']).toBe(700)   // 600+100+0
  })

  it('计算列 avg — 复杂表达式后聚合', () => {
    const { orders } = makeTestDS([
      { name: 'unitPrice', type: 'number', computeExpression: 'amount / (qty || 1)' },
    ], undefined, undefined, { unitPrice: { type: 'avg' } })
    // row1: 1500/6=250, row2: 300/2=150, row3: 800/99≈8.08
    expect(requireNumber(orders.aggregateResult['unitPrice'], 'Expected unitPrice aggregate to be a number')).toBeCloseTo(136.03, 1)
  })

  it('计算列 min/max — 三元 + 聚合', () => {
    const { orders } = makeTestDS([
      { name: 'grade', type: 'number', computeExpression: "score >= 60 ? 1 : 0" },
    ], undefined, undefined, { grade: { type: 'sum' } })
    // row1: 95>=60→1, row2: 72>=60→1, row3: 45<60→0
    expect(orders.aggregateResult['grade']).toBe(2)
  })

  it('计算列 + 基础列同时聚合', () => {
    const { orders } = makeTestDS(
      [{ name: 'total', type: 'number', computeExpression: 'price * qty' }],
      undefined, undefined, { total: { type: 'sum' }, amount: { type: 'sum' }, score: { type: 'avg' } },
    )
    expect(orders.aggregateResult['total']).toBe(700)            // 计算列聚合
    expect(orders.aggregateResult['amount']).toBe(2600)          // 基础列聚合
    expect(orders.aggregateResult['score']).toBeCloseTo(70.67, 1)
  })

  it('链式计算列 + aggregate', () => {
    const { orders } = makeTestDS([
      { name: 'subtotal', type: 'number', computeExpression: 'price * qty' },
      { name: 'tax', type: 'number', computeExpression: 'subtotal * 0.1' },
    ], undefined, undefined, { subtotal: { type: 'sum' }, tax: { type: 'sum' } })
    // subtotal: 600+100+0=700; tax: 60+10+0=70
    expect(orders.aggregateResult['subtotal']).toBe(700)
    expect(requireNumber(orders.aggregateResult['tax'], 'Expected tax aggregate to be a number')).toBeCloseTo(70)
  })

  it('函数体计算列 + aggregate', () => {
    const { orders } = makeTestDS([{
      name: 'tier', type: 'number',
      computeExpression: 'if (amount >= 1000) return 3; if (amount >= 500) return 2; return 1;',
    }], undefined, undefined, { tier: { type: 'sum' } })
    // row1: 1500→3, row2: 300→1, row3: 800→2 → sum=6
    expect(orders.aggregateResult['tier']).toBe(6)
  })

  // 动态操作后 aggregateResult 自动更新

  it('appendRow 后 aggregateResult 自动更新', () => {
    const { orders } = makeTestDS(
      [{ name: 'total', type: 'number', computeExpression: 'price * qty' }],
      [{ id: 1, price: 10, qty: 5 }],
      undefined, { total: { type: 'sum' } },
    )
    expect(orders.aggregateResult['total']).toBe(50)

    orders.appendRow({ id: 2, price: 20, qty: 3 })
    expect(orders.aggregateResult['total']).toBe(110)  // 50+60
  })

  it('updateRowById 后 aggregateResult 自动更新', () => {
    const { orders } = makeTestDS([], undefined, undefined, { amount: { type: 'sum' } })
    expect(orders.aggregateResult['amount']).toBe(2600)

    orders.updateRowById(1, { amount: 100 })
    expect(orders.aggregateResult['amount']).toBe(1200)  // 100+300+800
  })

  it('deleteRowById 后 aggregateResult 自动更新', () => {
    const { orders } = makeTestDS([], undefined, undefined, { amount: { type: 'sum' } })
    expect(orders.aggregateResult['amount']).toBe(2600)

    orders.deleteRowById(1)
    expect(orders.aggregateResult['amount']).toBe(1100)  // 300+800
  })

  it('replaceRows 后 aggregateResult 自动更新', () => {
    const { orders } = makeTestDS(
      [{ name: 'total', type: 'number', computeExpression: 'price * qty' }],
      [{ id: 1, price: 10, qty: 5 }],
      undefined, { total: { type: 'sum' }, score: { type: 'max' } },
    )
    expect(orders.aggregateResult['total']).toBe(50)

    orders.replaceRows([
      { id: 1, price: 10, qty: 2, score: 60 },
      { id: 2, price: 20, qty: 3, score: 95 },
    ])
    expect(orders.aggregateResult['total']).toBe(80)   // 20+60
    expect(orders.aggregateResult['score']).toBe(95)
  })

  it('setComputedContext 后计算列聚合自动重算', () => {
    const { orders } = makeTestDS([
      { name: 'tax', type: 'number', computeExpression: 'amount * ctx.taxRate' },
    ], undefined, undefined, { tax: { type: 'sum' } })
    orders.setComputedContext({ taxRate: 0.1 })
    // 1500*0.1 + 300*0.1 + 800*0.1 = 260
    expect(requireNumber(orders.aggregateResult['tax'], 'Expected tax aggregate to be a number')).toBeCloseTo(260)

    orders.setComputedContext({ taxRate: 0.2 })
    expect(requireNumber(orders.aggregateResult['tax'], 'Expected tax aggregate to be a number')).toBeCloseTo(520)
  })

  it('子表聚合 + 列级聚合联合', () => {
    const { orders } = makeTestDS([
      { name: 'itemTotal', type: 'number', computeExpression: "$sum('Items', 'amount')" },
    ], undefined, undefined, { itemTotal: { type: 'sum' } })
    // row1: 350, row2: 80, row3: 0 → sum=430
    expect(orders.aggregateResult['itemTotal']).toBe(430)
  })

  // join 聚合

  it('join — 基础列字符串拼接', () => {
    const { orders } = makeTestDS([], undefined, undefined, { firstName: { type: 'join' } })
    expect(orders.aggregateResult['firstName']).toBe('张, 李, 王')
  })

  it('join — 跳过 null/undefined/空串', () => {
    const { orders } = makeTestDS([],
      [{ id: 1, firstName: 'A' }, { id: 2, firstName: null }, { id: 3, firstName: '' }, { id: 4, firstName: 'B' }],
      undefined, { firstName: { type: 'join' } },
    )
    expect(orders.aggregateResult['firstName']).toBe('A, B')
  })

  it('join — 空行时返回空字符串', () => {
    const { orders } = makeTestDS([], [], undefined, { firstName: { type: 'join' } })
    expect(orders.aggregateResult['firstName']).toBe('')
  })

  it('join — 计算列 + join 联合', () => {
    const { orders } = makeTestDS([
      { name: 'fullName', type: 'string', computeExpression: "firstName + lastName" },
    ], undefined, undefined, { fullName: { type: 'join' } })
    expect(orders.aggregateResult['fullName']).toBe('张三, 李四, 王五')
  })

  // selectionAggregateResult — 选中行聚合

  it('selectionAggregateResult — 清空选中后为空对象', () => {
    const { orders } = makeTestDS([], undefined, undefined, { price: { type: 'sum' } })
    orders.selection.clearSelectedRows()
    expect(orders.selectionAggregateResult).toEqual({})
  })

  it('selectionAggregateResult — 选中部分行后仅聚合选中行', () => {
    const { orders } = makeTestDS([], undefined, undefined, { price: { type: 'sum' }, score: { type: 'avg' } })
    // 选中 row1(price=100,score=95) + row3(price=0,score=45)
    orders.selection.setSelectedRows([orders.rows[0]!, orders.rows[2]!])
    expect(orders.selectionAggregateResult['price']).toBe(100)           // 100+0
    expect(orders.selectionAggregateResult['score']).toBeCloseTo(70)     // (95+45)/2
  })

  it('selectionAggregateResult — 选中全部行等于 aggregateResult', () => {
    const { orders } = makeTestDS([], undefined, undefined, { amount: { type: 'sum' } })
    orders.selection.setSelectedRows([...orders.rows])
    expect(orders.selectionAggregateResult['amount']).toBe(orders.aggregateResult['amount'])
  })

  it('selectionAggregateResult — 切换选中后自动重算', () => {
    const { orders } = makeTestDS([], undefined, undefined, { amount: { type: 'sum' } })
    orders.selection.setSelectedRows([orders.rows[0]!])               // row1: 1500
    expect(orders.selectionAggregateResult['amount']).toBe(1500)

    orders.selection.setSelectedRows([orders.rows[1]!, orders.rows[2]!]) // row2: 300, row3: 800
    expect(orders.selectionAggregateResult['amount']).toBe(1100)

    orders.selection.clearSelectedRows()
    expect(orders.selectionAggregateResult).toEqual({})
  })

  it('selectionAggregateResult — 计算列 + aggregate 选中聚合', () => {
    const { orders } = makeTestDS([
      { name: 'total', type: 'number', computeExpression: 'price * qty' },
    ], undefined, undefined, { total: { type: 'sum' } })
    // row1: total=600, row2: total=100, row3: total=0
    orders.selection.setSelectedRows([orders.rows[0]!, orders.rows[1]!])
    expect(orders.selectionAggregateResult['total']).toBe(700)   // 600+100
  })

  it('selectionAggregateResult — 行数据变更后自动重算', () => {
    const { orders } = makeTestDS([], undefined, undefined, { amount: { type: 'sum' } })
    orders.selection.setSelectedRows([orders.rows[0]!])             // row1: 1500
    expect(orders.selectionAggregateResult['amount']).toBe(1500)

    orders.updateRowById(1, { amount: 200 })
    expect(orders.selectionAggregateResult['amount']).toBe(200)
  })

  it('selectionAggregateResult — join 聚合选中行', () => {
    const { orders } = makeTestDS([], undefined, undefined, { firstName: { type: 'join' } })
    orders.selection.setSelectedRows([orders.rows[0]!, orders.rows[2]!])  // 张, 王
    expect(orders.selectionAggregateResult['firstName']).toBe('张, 王')
  })
})
