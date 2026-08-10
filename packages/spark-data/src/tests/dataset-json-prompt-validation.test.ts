/**
 * 根测试层 DataSet JSON 提示词验证测试
 *
 * 将 LLM 可见的数据案例语义
 * 用 DataSet.fromJson() 实例化，自动验证：
 *  1. 能成功实例化（不抛出错误）
 *  2. 视图（DataView）行数据正确
 *  3. 内存级联正确（setCurrentRow → 子视图过滤）
 *  4. 计算列正确（单行表达式 / 多语句 / 子表聚合函数）
 *  5. 视图聚合（aggregateResult）正确
 *
 * 本文件是数据语义质量门：任何 LLM 可见数据案例修改必须保证此文件全部通过。
 * 它属于仓库级 AI 质量门，不属于 packages/spark-data 的运行时职责。
 */

import { afterEach, describe, it, expect } from 'vitest'
import { DataSet } from '@spark-appworks/spark-data'
import type { DataRow } from '@spark-appworks/spark-data'

/** 读取行字段（绕过 noPropertyAccessFromIndexSignature） */
const f = (row: DataRow | undefined | null, field: string): unknown => row?.[field]

function numberField(value: unknown): number {
  if (typeof value === 'number') return value
  throw new Error('Expected numeric field value')
}

function stringField(value: unknown): string {
  if (typeof value === 'string') return value
  throw new Error('Expected string field value')
}

function arrayField(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  throw new Error('Expected array field value')
}

const flushDataViewDebouncers = () => new Promise<void>(resolve => setTimeout(resolve, 32))

afterEach(async () => {
  await flushDataViewDebouncers()
})

// ─────────────────────────────────────────────────────────────────────────────
// 共享工具
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 从提示词 fixture 实例化 DataSet。
 */
function fromPromptJson(json: Record<string, unknown>): DataSet {
  return DataSet.fromJson(json)
}

function viewCascade(
  id: string,
  parentTable: string,
  childTable: string,
  childField: string,
  parentField = 'id',
): Record<string, unknown> {
  return {
    cascadeId: id,
    parentTable,
    parentViewId: 'default',
    childTable,
    childViewId: 'default',
    filterBindings: [{ sourceField: parentField, targetField: childField }],
    dependencyType: 'currentRow',
    autoLoad: true,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 案例 A：图书馆管理（简单两表 + 主从关系）
// ─────────────────────────────────────────────────────────────────────────────

const CASE_A_JSON = {
    dataSetName: 'LibraryDataSet',
    tables: {
      Readers: {
        columns: [
          { name: 'id',     type: 'number', isPrimaryKey: true, label: '读者ID'   },
          { name: 'name',   type: 'string',                     label: '姓名'     },
          { name: 'cardNo', type: 'string',                     label: '借阅卡号' },
          { name: 'phone',  type: 'string',                     label: '手机号'   },
          { name: 'status', type: 'string',                     label: '状态'     },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: '张三', cardNo: 'LIB-001', phone: '13800001001', status: 'active'    },
              { id: 2, name: '李四', cardNo: 'LIB-002', phone: '13800001002', status: 'active'    },
              { id: 3, name: '王五', cardNo: 'LIB-003', phone: '13800001003', status: 'suspended' },
            ],
          },
        },
      },
      BorrowRecords: {
        columns: [
          { name: 'id',         type: 'number', isPrimaryKey: true, label: '记录ID'   },
          { name: 'readerId',   type: 'number',                     label: '读者ID'   },
          { name: 'bookTitle',  type: 'string',                     label: '书名'     },
          { name: 'borrowDate', type: 'date',                       label: '借阅日期' },
          { name: 'dueDate',    type: 'date',                       label: '应还日期' },
          { name: 'returnDate', type: 'date',   allowDBNull: true,  label: '实还日期' },
          { name: 'status',     type: 'string',                     label: '借阅状态' },
        ],
        views: {
          default: {
            rows: [
              { id: 1001, readerId: 1, bookTitle: 'JavaScript高级程序设计', borrowDate: '2024-03-01', dueDate: '2024-03-31', returnDate: '2024-03-20', status: 'returned' },
              { id: 1002, readerId: 1, bookTitle: 'Vue.js设计与实现',       borrowDate: '2024-04-01', dueDate: '2024-04-30', returnDate: null,         status: 'borrowed' },
              { id: 1003, readerId: 2, bookTitle: '算法导论',               borrowDate: '2024-04-05', dueDate: '2024-05-05', returnDate: '2024-04-28', status: 'returned' },
              { id: 1004, readerId: 3, bookTitle: '三体',                   borrowDate: '2024-02-10', dueDate: '2024-03-10', returnDate: null,         status: 'overdue'  },
            ],
          },
        },
      },
    },
    resourceRelations: [
      {
        relationName:   'ReaderBorrowRecords',
        parentTable:    'Readers',
        childTable:     'BorrowRecords',
        childField:     'readerId',
        cascadeDelete:  true,
      },
    ],
    viewCascades: [
      viewCascade('ReaderBorrowRecords', 'Readers', 'BorrowRecords', 'readerId'),
    ],
}

describe('PROMPT 验证 — 案例 A: 图书馆管理', () => {
  it('A-1: fromJson 成功实例化 DataSet', () => {
    expect(() => fromPromptJson(CASE_A_JSON)).not.toThrow()
    const ds = fromPromptJson(CASE_A_JSON)
    expect(ds.dataSetName).toBe('LibraryDataSet')
  })

  it('A-2: 两张表都存在且视图行数正确', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    const readers = ds.getView('Readers')!
    const borrows = ds.getView('BorrowRecords')!
    expect(readers).not.toBeNull()
    expect(borrows).not.toBeNull()
    expect(readers.rows).toHaveLength(3)
    expect(borrows.rows).toHaveLength(4)
  })

  it('A-3: 主键推导正确（isPrimaryKey: true）', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    expect(ds.getView('Readers')!.primaryKey).toBe('id')
    expect(ds.getView('BorrowRecords')!.primaryKey).toBe('id')
  })

  it('A-4: 内存级联 — 选中读者 1 → BorrowRecords 显示 2 条', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    const readers = ds.getView('Readers')!
    const borrows = ds.getView('BorrowRecords')!

    readers.selection.setCurrentRow(readers.rows[0]!) // 张三 id=1
    expect(borrows.rows).toHaveLength(2)
    expect(borrows.rows.every(r => f(r, 'readerId') === 1)).toBe(true)
  })

  it('A-5: 内存级联 — 切换到读者 2 → BorrowRecords 显示 1 条', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    const readers = ds.getView('Readers')!
    const borrows = ds.getView('BorrowRecords')!

    readers.selection.setCurrentRow(readers.rows[0]!)
    readers.selection.setCurrentRow(readers.rows[1]!) // 李四 id=2
    expect(borrows.rows).toHaveLength(1)
    expect(f(borrows.rows[0], 'readerId')).toBe(2)
  })

  it('A-6: 内存级联 — 切换到读者 3 → BorrowRecords 显示 1 条（overdue）', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    const readers = ds.getView('Readers')!
    const borrows = ds.getView('BorrowRecords')!

    readers.selection.setCurrentRow(readers.rows[2]!) // 王五 id=3
    expect(borrows.rows).toHaveLength(1)
    expect(f(borrows.rows[0], 'status')).toBe('overdue')
  })

  it('A-7: 内存级联 — setCurrentRow(null) → BorrowRecords 清空', () => {
    const ds = fromPromptJson(CASE_A_JSON)
    const readers = ds.getView('Readers')!
    const borrows = ds.getView('BorrowRecords')!

    readers.selection.setCurrentRow(readers.rows[0]!)
    expect(borrows.rows).toHaveLength(2)
    readers.selection.setCurrentRow(null)
    expect(borrows.rows).toHaveLength(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 案例 B：电商订单管理（计算列 + 聚合）
// ─────────────────────────────────────────────────────────────────────────────

const CASE_B_JSON = {
    dataSetName: 'EcommerceOrderDataSet',
    tables: {
      Orders: {
        columns: [
          { name: 'id',           type: 'number', isPrimaryKey: true, label: '订单ID'   },
          { name: 'orderNo',      type: 'string',                     label: '订单号'   },
          { name: 'customerName', type: 'string',                     label: '客户姓名' },
          { name: 'orderDate',    type: 'date',                       label: '下单日期' },
          { name: 'status',       type: 'string',                     label: '订单状态' },
          { name: 'itemCount',    type: 'number', label: '商品件数',
            computeExpression: "$count('OrderItems')" },
          { name: 'totalAmount',  type: 'number', label: '订单总额',
            computeExpression: "$sum('OrderItems', 'subtotal')" },
        ],
        views: {
          default: {
            rows: [
              { id: 1, orderNo: 'ORD-2024001', customerName: '张三', orderDate: '2024-04-01', status: 'completed' },
              { id: 2, orderNo: 'ORD-2024002', customerName: '李四', orderDate: '2024-04-05', status: 'pending'   },
              { id: 3, orderNo: 'ORD-2024003', customerName: '王五', orderDate: '2024-04-10', status: 'shipped'   },
            ],
          },
        },
      },
      OrderItems: {
        columns: [
          { name: 'id',          type: 'number', isPrimaryKey: true, label: '明细ID'   },
          { name: 'orderId',     type: 'number',                     label: '订单ID'   },
          { name: 'productName', type: 'string',                     label: '商品名称' },
          { name: 'quantity',    type: 'number',                     label: '数量'     },
          { name: 'unitPrice',   type: 'number',                     label: '单价'     },
          { name: 'subtotal',    type: 'number', label: '小计',
            computeExpression: 'quantity * unitPrice' },
        ],
        views: {
          default: {
            rows: [
              { id: 1001, orderId: 1, productName: '无线鼠标',   quantity: 2, unitPrice: 99.99  },
              { id: 1002, orderId: 1, productName: '机械键盘',   quantity: 1, unitPrice: 299.00 },
              { id: 1003, orderId: 2, productName: 'USB集线器',  quantity: 3, unitPrice: 59.00  },
              { id: 1004, orderId: 3, productName: '显示器支架', quantity: 1, unitPrice: 189.00 },
              { id: 1005, orderId: 3, productName: '鼠标垫',     quantity: 2, unitPrice: 35.00  },
            ],
            aggregates: {
              quantity: { type: 'sum', label: '总数量'   },
              subtotal: { type: 'sum', label: '合计金额' },
            },
          },
        },
      },
    },
    resourceRelations: [
      {
        relationName:   'OrderItems',
        parentTable:    'Orders',
        childTable:     'OrderItems',
        childField:     'orderId',
        cascadeDelete:  true,
      },
    ],
    viewCascades: [
      viewCascade('OrderItems', 'Orders', 'OrderItems', 'orderId'),
    ],
}

describe('PROMPT 验证 — 案例 B: 电商订单管理', () => {
  it('B-1: fromJson 成功实例化 DataSet', () => {
    expect(() => fromPromptJson(CASE_B_JSON)).not.toThrow()
  })

  it('B-2: 计算列 subtotal = quantity * unitPrice', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const items = ds.getView('OrderItems')!
    // items[0]: 2 * 99.99 = 199.98
    expect(numberField(f(items.rows[0], 'subtotal'))).toBeCloseTo(199.98, 2)
    // items[1]: 1 * 299.00 = 299.00
    expect(numberField(f(items.rows[1], 'subtotal'))).toBeCloseTo(299.00, 2)
    // items[2]: 3 * 59.00 = 177.00
    expect(numberField(f(items.rows[2], 'subtotal'))).toBeCloseTo(177.00, 2)
    // items[3]: 1 * 189.00 = 189.00
    expect(numberField(f(items.rows[3], 'subtotal'))).toBeCloseTo(189.00, 2)
    // items[4]: 2 * 35.00 = 70.00
    expect(numberField(f(items.rows[4], 'subtotal'))).toBeCloseTo(70.00, 2)
  })

  it('B-3: 子表聚合 itemCount = $count(\'OrderItems\')', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const orders = ds.getView('Orders')!
    // 订单1: 2 件 (1001, 1002)
    expect(f(orders.rows[0], 'itemCount')).toBe(2)
    // 订单2: 1 件 (1003)
    expect(f(orders.rows[1], 'itemCount')).toBe(1)
    // 订单3: 2 件 (1004, 1005)
    expect(f(orders.rows[2], 'itemCount')).toBe(2)
  })

  it('B-4: 子表聚合 totalAmount = $sum(\'OrderItems\', \'subtotal\')', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const orders = ds.getView('Orders')!
    // 订单1: 199.98 + 299.00 = 498.98
    expect(numberField(f(orders.rows[0], 'totalAmount'))).toBeCloseTo(498.98, 1)
    // 订单2: 177.00
    expect(numberField(f(orders.rows[1], 'totalAmount'))).toBeCloseTo(177.00, 2)
    // 订单3: 189.00 + 70.00 = 259.00
    expect(numberField(f(orders.rows[2], 'totalAmount'))).toBeCloseTo(259.00, 2)
  })

  it('B-5: 内存级联 — 选中订单 1 → OrderItems 显示 2 条', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const orders = ds.getView('Orders')!
    const items  = ds.getView('OrderItems')!

    orders.selection.setCurrentRow(orders.rows[0]!) // 订单 id=1
    expect(items.rows).toHaveLength(2)
    expect(items.rows.every(r => f(r, 'orderId') === 1)).toBe(true)
  })

  it('B-6: 内存级联后 aggregateResult 聚合只计算过滤后的行', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const orders = ds.getView('Orders')!
    const items  = ds.getView('OrderItems')!

    orders.selection.setCurrentRow(orders.rows[0]!) // 订单1: 2 件
    // 级联后只有 2 行，aggregateResult 仅汇总这 2 行
    expect(items.aggregateResult).not.toBeNull()
    expect(numberField(f(items.aggregateResult, 'quantity'))).toBeCloseTo(3, 2)  // 2+1
    expect(numberField(f(items.aggregateResult, 'subtotal'))).toBeCloseTo(498.98, 1) // 199.98+299
  })

  it('B-7: 切换到订单 2 → OrderItems 级联 1 条，汇总更新', () => {
    const ds = fromPromptJson(CASE_B_JSON)
    const orders = ds.getView('Orders')!
    const items  = ds.getView('OrderItems')!

    orders.selection.setCurrentRow(orders.rows[0]!)
    orders.selection.setCurrentRow(orders.rows[1]!) // 订单 id=2
    expect(items.rows).toHaveLength(1)
    expect(f(items.rows[0], 'orderId')).toBe(2)
    expect(numberField(f(items.aggregateResult, 'subtotal'))).toBeCloseTo(177.00, 2) // 3*59
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 示例 9：学生成绩管理（$avg + 多语句 + aggregates）
// ─────────────────────────────────────────────────────────────────────────────

const EXAMPLE_9_JSON = {
    dataSetName: 'StudentGradeDataSet',
    tables: {
      Students: {
        columns: [
          { name: 'id',        type: 'number', isPrimaryKey: true, label: '学号' },
          { name: 'name',      type: 'string',                     label: '姓名' },
          { name: 'className', type: 'string',                     label: '班级' },
          { name: 'gradeAvg',  type: 'number',                     label: '平均分',
            computeExpression: "$avg('Grades', 'score')" },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: '张三', className: '高一(1)班' },
              { id: 2, name: '李四', className: '高一(1)班' },
              { id: 3, name: '王五', className: '高一(2)班' },
            ],
          },
        },
      },
      Grades: {
        columns: [
          { name: 'id',        type: 'number', isPrimaryKey: true, label: '成绩ID' },
          { name: 'studentId', type: 'number',                     label: '学号'   },
          { name: 'subject',   type: 'string',                     label: '科目'   },
          { name: 'score',     type: 'number',                     label: '分数'   },
          { name: 'grade',     type: 'string',                     label: '等级',
            computeExpression: "if (score >= 90) return 'A'; if (score >= 75) return 'B'; if (score >= 60) return 'C'; return 'D';" },
        ],
        views: {
          default: {
            rows: [
              { id: 1001, studentId: 1, subject: '数学', score: 95 },
              { id: 1002, studentId: 1, subject: '语文', score: 82 },
              { id: 1003, studentId: 2, subject: '数学', score: 76 },
              { id: 1004, studentId: 2, subject: '语文', score: 68 },
              { id: 1005, studentId: 3, subject: '数学', score: 55 },
              { id: 1006, studentId: 3, subject: '语文', score: 70 },
            ],
            aggregates: {
              score: { type: 'avg',   label: '平均分' },
              id:    { type: 'count', label: '科目数' },
            },
          },
        },
      },
    },
    resourceRelations: [
      {
        relationName:   'StudentGrades',
        parentTable:    'Students',
        childTable:     'Grades',
        childField:     'studentId',
      },
    ],
    viewCascades: [
      viewCascade('StudentGrades', 'Students', 'Grades', 'studentId'),
    ],
}

describe('PROMPT 验证 — 示例 9: 学生成绩管理', () => {
  it('E9-1: fromJson 成功实例化 DataSet', () => {
    expect(() => fromPromptJson(EXAMPLE_9_JSON)).not.toThrow()
  })

  it('E9-2: 子表聚合 gradeAvg = $avg(\'Grades\', \'score\')', () => {
    const ds = fromPromptJson(EXAMPLE_9_JSON)
    const students = ds.getView('Students')!
    // 张三: (95+82)/2 = 88.5
    expect(numberField(f(students.rows[0], 'gradeAvg'))).toBeCloseTo(88.5, 1)
    // 李四: (76+68)/2 = 72.0
    expect(numberField(f(students.rows[1], 'gradeAvg'))).toBeCloseTo(72.0, 1)
    // 王五: (55+70)/2 = 62.5
    expect(numberField(f(students.rows[2], 'gradeAvg'))).toBeCloseTo(62.5, 1)
  })

  it('E9-3: 多语句计算列 grade — 各分支正确', () => {
    const ds = fromPromptJson(EXAMPLE_9_JSON)
    const grades = ds.getView('Grades')!
    // score=95 → A
    expect(f(grades.rows[0], 'grade')).toBe('A')
    // score=82 → B
    expect(f(grades.rows[1], 'grade')).toBe('B')
    // score=76 → B
    expect(f(grades.rows[2], 'grade')).toBe('B')
    // score=68 → C
    expect(f(grades.rows[3], 'grade')).toBe('C')
    // score=55 → D
    expect(f(grades.rows[4], 'grade')).toBe('D')
    // score=70 → C
    expect(f(grades.rows[5], 'grade')).toBe('C')
  })

  it('E9-4: 视图聚合 aggregateResult（全部 6 行）', () => {
    const ds = fromPromptJson(EXAMPLE_9_JSON)
    const grades = ds.getView('Grades')!
    expect(grades.aggregateResult).not.toBeNull()
    // avg(95,82,76,68,55,70) = 446/6 ≈ 74.33
    expect(numberField(f(grades.aggregateResult, 'score'))).toBeCloseTo(74.33, 1)
    // count = 6
    expect(f(grades.aggregateResult, 'id')).toBe(6)
  })

  it('E9-5: 内存级联 — 选中张三 → Grades 显示 2 条（数学+语文）', () => {
    const ds = fromPromptJson(EXAMPLE_9_JSON)
    const students = ds.getView('Students')!
    const grades   = ds.getView('Grades')!

    students.selection.setCurrentRow(students.rows[0]!) // 张三 id=1
    expect(grades.rows).toHaveLength(2)
    expect(grades.rows.every(r => f(r, 'studentId') === 1)).toBe(true)
  })

  it('E9-6: 级联后 aggregateResult 只汇总过滤行', () => {
    const ds = fromPromptJson(EXAMPLE_9_JSON)
    const students = ds.getView('Students')!
    const grades   = ds.getView('Grades')!

    students.selection.setCurrentRow(students.rows[0]!) // 张三：95, 82
    expect(f(grades.aggregateResult, 'id')).toBe(2)           // count=2
    expect(numberField(f(grades.aggregateResult, 'score'))).toBeCloseTo(88.5, 1) // avg(95,82)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 案例 C：HR 部门管理（API + 多语句 + $count + 视图聚合）
// ─────────────────────────────────────────────────────────────────────────────

const CASE_C_JSON = {
    dataSetName: 'HRDataSet',
    tables: {
      Departments: {
        columns: [
          { name: 'id',        type: 'number', isPrimaryKey: true, label: '部门ID'   },
          { name: 'name',      type: 'string',                     label: '部门名称' },
          { name: 'managerId', type: 'number', allowDBNull: true,  label: '主管ID'   },
          { name: 'headcount', type: 'number',                     label: '人数',
            computeExpression: "$count('Employees')" },
        ],
        api: '/api/departments',
        views: {
          default: {
            rows: [
              { id: 1, name: '技术部', managerId: 101  },
              { id: 2, name: '产品部', managerId: 201  },
              { id: 3, name: '市场部', managerId: null  },
            ],
            autoLoad: true,
          },
        },
      },
      Employees: {
        columns: [
          { name: 'id',       type: 'number', isPrimaryKey: true, label: '员工ID'   },
          { name: 'deptId',   type: 'number',                     label: '部门ID'   },
          { name: 'name',     type: 'string',                     label: '姓名'     },
          { name: 'gender',   type: 'string',                     label: '性别'     },
          { name: 'position', type: 'string',                     label: '职位'     },
          { name: 'salary',   type: 'number',                     label: '薪资'     },
          { name: 'hireDate', type: 'date',                       label: '入职日期' },
          { name: 'level',    type: 'string',                     label: '薪资等级',
            computeExpression: "if (salary >= 30000) return 'S'; if (salary >= 20000) return 'A'; if (salary >= 10000) return 'B'; return 'C';" },
        ],
        api: '/api/employees',
        views: {
          default: {
            rows: [
              { id: 101, deptId: 1, name: '张工', gender: '男', position: '高级工程师', salary: 28000, hireDate: '2020-03-15' },
              { id: 102, deptId: 1, name: '李工', gender: '女', position: '工程师',     salary: 18000, hireDate: '2021-07-01' },
              { id: 201, deptId: 2, name: '王总', gender: '男', position: '产品总监',   salary: 35000, hireDate: '2019-05-20' },
              { id: 202, deptId: 2, name: '赵妹', gender: '女', position: '产品经理',   salary: 22000, hireDate: '2022-01-10' },
              { id: 301, deptId: 3, name: '孙明', gender: '男', position: '市场专员',   salary: 9500,  hireDate: '2023-06-01' },
            ],
            autoLoad: false,
            aggregates: {
              salary: { type: 'avg',   label: '平均薪资' },
              id:     { type: 'count', label: '人数'     },
            },
          },
        },
      },
    },
    resourceRelations: [
      {
        relationName:   'DeptEmployees',
        parentTable:    'Departments',
        childTable:     'Employees',
        childField:     'deptId',
      },
    ],
    viewCascades: [
      viewCascade('DeptEmployees', 'Departments', 'Employees', 'deptId'),
    ],
}

describe('PROMPT 验证 — 案例 C: HR 部门管理', () => {
  it('C-1: fromJson 成功实例化（含 api + autoLoad 配置）', () => {
    expect(() => fromPromptJson(CASE_C_JSON)).not.toThrow()
  })

  it('C-2: 多语句计算列 level — 薪资等级', () => {
    const ds = fromPromptJson(CASE_C_JSON)
    const employees = ds.getView('Employees')!
    // salary=28000: ≥20000 but <30000 → A
    expect(f(employees.rows[0], 'level')).toBe('A')
    // salary=18000: ≥10000 but <20000 → B
    expect(f(employees.rows[1], 'level')).toBe('B')
    // salary=35000: ≥30000 → S
    expect(f(employees.rows[2], 'level')).toBe('S')
    // salary=22000: ≥20000 but <30000 → A
    expect(f(employees.rows[3], 'level')).toBe('A')
    // salary=9500: <10000 → C
    expect(f(employees.rows[4], 'level')).toBe('C')
  })

  it('C-3: 子表聚合 headcount = $count(\'Employees\')', () => {
    const ds = fromPromptJson(CASE_C_JSON)
    const depts = ds.getView('Departments')!
    // 技术部: 101, 102 → 2
    expect(f(depts.rows[0], 'headcount')).toBe(2)
    // 产品部: 201, 202 → 2
    expect(f(depts.rows[1], 'headcount')).toBe(2)
    // 市场部: 301 → 1
    expect(f(depts.rows[2], 'headcount')).toBe(1)
  })

  it('C-4: 初始 aggregateResult（全 5 名员工）', () => {
    const ds = fromPromptJson(CASE_C_JSON)
    const employees = ds.getView('Employees')!
    // avg salary: (28000+18000+35000+22000+9500)/5 = 112500/5 = 22500
    expect(numberField(f(employees.aggregateResult, 'salary'))).toBeCloseTo(22500, 0)
    // count = 5
    expect(f(employees.aggregateResult, 'id')).toBe(5)
  })

  // 注：Employees 配置了 api: '/api/employees'，级联触发的是 HTTP 请求而非内存过滤。
  // 需要 mock loadFromServer 才能验证级联行为，此处仅验证结构正确性。
  // API 级联行为的测试见 dataset-request-orchestration.test.ts。
  it('C-5: DataSet 含 api 配置时显式 DataView cascade 能正常读取', () => {
    const ds = fromPromptJson(CASE_C_JSON)
    const rel = ds.viewCascades?.[0]
    expect(rel?.parentTable).toBe('Departments')
    expect(rel?.childTable).toBe('Employees')
    expect(rel?.parentViewId).toBe('default')
    expect(rel?.childViewId).toBe('default')
    // 有 API 的子表 crudService 存在（cascade 走网络路径）
    const employees = ds.getView('Employees')!
    expect(employees.crudService).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 案例 G：仓库库存管理
// 验证 v1.9 提示词修正的所有新特性：
//   - integer / decimal 类型
//   - 复合主键（多列 isPrimaryKey: true → 自动合成 _pk）
//   - $list 聚合函数
//   - aggregates field 覆盖（输出名 ≠ 源字段名）
//   - aggregates separator（join 分隔符）
//   - parentField（父视图匹配字段）
// ─────────────────────────────────────────────────────────────────────────────

const CASE_G_JSON = {
    dataSetName: 'WarehouseInventoryDataSet',
    tables: {
      Warehouses: {
        columns: [
          { name: 'id',            type: 'integer', isPrimaryKey: true, label: '仓库ID'   },
          { name: 'name',          type: 'varchar',                     label: '仓库名称' },
          { name: 'city',          type: 'varchar',                     label: '所在城市' },
          // $sum 子表聚合：聚合 StockItems.totalValue
          { name: 'totalStockValue', type: 'decimal', label: '库存总值',
            computeExpression: "$sum('StockItems', 'totalValue')" },
          // $list → 返回产品编码数组（unknown[]）
          { name: 'productCodes',  type: 'array',                       label: '产品编码列表',
            computeExpression: "$list('StockItems', 'productCode')" },
          // $join → 返回产品名称拼接字符串
          { name: 'productNames',  type: 'string',                      label: '产品名称拼接',
            computeExpression: "$join('StockItems', 'productName', ' / ')" },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: '北京仓', city: '北京' },
              { id: 2, name: '上海仓', city: '上海' },
            ],
          },
        },
      },
      StockItems: {
        columns: [
          // 复合主键：两列同时标记 isPrimaryKey → 框架自动合成 _pk 计算列
          { name: 'warehouseId',  type: 'integer', isPrimaryKey: true, label: '仓库ID'   },
          { name: 'productCode',  type: 'varchar', isPrimaryKey: true, label: '产品编码' },
          { name: 'productName',  type: 'varchar',                     label: '产品名称' },
          { name: 'quantity',     type: 'integer',                     label: '库存数量' },
          { name: 'unitPrice',    type: 'decimal',                     label: '单价'     },
          // 计算列：数量 * 单价
          { name: 'totalValue',   type: 'decimal',                     label: '库存价值',
            computeExpression: 'quantity * unitPrice' },
        ],
        views: {
          default: {
            rows: [
              { warehouseId: 1, productCode: 'P001', productName: '笔记本电脑', quantity: 10,  unitPrice: 5999.99 },
              { warehouseId: 1, productCode: 'P002', productName: '无线鼠标',   quantity: 50,  unitPrice: 99.50   },
              { warehouseId: 2, productCode: 'P001', productName: '笔记本电脑', quantity: 5,   unitPrice: 5999.99 },
              { warehouseId: 2, productCode: 'P003', productName: '机械键盘',   quantity: 20,  unitPrice: 299.00  },
            ],
            aggregates: {
              // field 覆盖：输出键 totalVal，源字段 totalValue
              totalVal:    { type: 'sum',  field: 'totalValue', label: '库存总值'  },
              // separator：join 类型使用自定义分隔符
              productList: { type: 'join', field: 'productName', separator: ' | ', label: '产品列表' },
            },
          },
        },
      },
    },
    resourceRelations: [
      {
        relationName:   'WarehouseStock',
        parentTable:    'Warehouses',
        parentField:    'id',
        childTable:     'StockItems',
        childField:     'warehouseId',
      },
    ],
    viewCascades: [
      viewCascade('WarehouseStock', 'Warehouses', 'StockItems', 'warehouseId', 'id'),
    ],
}

describe('PROMPT 验证 — 案例 G: 仓库库存管理（v1.9 新特性）', () => {
  it('G-1: fromJson 成功实例化', () => {
    expect(() => fromPromptJson(CASE_G_JSON)).not.toThrow()
  })

  it('G-2: integer / decimal / varchar 类型被框架接受，rows 加载正确', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    expect(ds.getView('Warehouses')!.rows).toHaveLength(2)
    expect(ds.getView('StockItems')!.rows).toHaveLength(4)
  })

  it('G-3: 复合主键 → primaryKey 变为 _pk，_pk 值已自动填充', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const items = ds.getView('StockItems')!
    // 多列 isPrimaryKey 时框架注入 _pk 计算列（字段名合并）
    expect(items.primaryKey).toBe('_pk')
    // 每行都有 _pk 值
    expect(items.rows.every(r => r['_pk'] !== undefined)).toBe(true)
    // 前两行 warehouseId=1 但 productCode 不同，_pk 应不同
    expect(items.rows[0]!['_pk']).not.toBe(items.rows[1]!['_pk'])
  })

  it('G-4: 计算列 totalValue = quantity * unitPrice（decimal 精度）', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const items = ds.getView('StockItems')!
    // P001@仓库1: 10 * 5999.99 = 59999.9
    expect(numberField(f(items.rows[0], 'totalValue'))).toBeCloseTo(59999.9, 1)
    // P002@仓库1: 50 * 99.50 = 4975
    expect(numberField(f(items.rows[1], 'totalValue'))).toBeCloseTo(4975, 1)
    // P001@仓库2: 5 * 5999.99 = 29999.95
    expect(numberField(f(items.rows[2], 'totalValue'))).toBeCloseTo(29999.95, 1)
    // P003@仓库2: 20 * 299.00 = 5980
    expect(numberField(f(items.rows[3], 'totalValue'))).toBeCloseTo(5980, 1)
  })

  it('G-5: $join 计算列 productNames 在 Warehouses 上正确聚合（级联前基于全量行）', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const warehouses = ds.getView('Warehouses')!
    // 仓库1的 productNames: 笔记本电脑 / 无线鼠标（按 rows 顺序）
    expect(f(warehouses.rows[0], 'productNames')).toBe('笔记本电脑 / 无线鼠标')
    // 仓库2的 productNames: 笔记本电脑 / 机械键盘
    expect(f(warehouses.rows[1], 'productNames')).toBe('笔记本电脑 / 机械键盘')
  })

  it('G-6: $sum 计算列 totalStockValue 在 Warehouses 上正确', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const warehouses = ds.getView('Warehouses')!
    // 仓库1: 59999.9 + 4975 = 64974.9
    expect(numberField(f(warehouses.rows[0], 'totalStockValue'))).toBeCloseTo(64974.9, 0)
    // 仓库2: 29999.95 + 5980 = 35979.95
    expect(numberField(f(warehouses.rows[1], 'totalStockValue'))).toBeCloseTo(35979.95, 0)
  })

  it('G-7: aggregates field 覆盖 — totalVal.field = totalValue', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const items = ds.getView('StockItems')!
    // aggregateResult 输出键是 totalVal（不是 totalValue）
    // 全部 4 行: 59999.9 + 4975 + 29999.95 + 5980 = 100954.85
    expect(numberField(f(items.aggregateResult, 'totalVal'))).toBeCloseTo(100954.85, 0)
    // 原字段名 totalValue 不应出现在 aggregateResult 中（键名覆盖）
    expect(f(items.aggregateResult, 'totalValue')).toBeUndefined()
  })

  it('G-8: aggregates separator — productList 使用 " | " 分隔', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const items = ds.getView('StockItems')!
    // 全部 4 行产品名用 " | " 拼接
    expect(f(items.aggregateResult, 'productList')).toBe('笔记本电脑 | 无线鼠标 | 笔记本电脑 | 机械键盘')
  })

  it('G-9: 内存级联（parentField 显式声明）— 选中仓库 1 → StockItems 显示 2 条', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const warehouses = ds.getView('Warehouses')!
    const items      = ds.getView('StockItems')!

    warehouses.selection.setCurrentRow(warehouses.rows[0]!) // 北京仓 id=1
    expect(items.rows).toHaveLength(2)
    expect(items.rows.every(r => f(r, 'warehouseId') === 1)).toBe(true)
  })

  it('G-10: 级联后 aggregates 只汇总过滤行（field 覆盖 + separator 均有效）', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const warehouses = ds.getView('Warehouses')!
    const items      = ds.getView('StockItems')!

    warehouses.selection.setCurrentRow(warehouses.rows[0]!) // 北京仓：2 条
    // totalVal = 59999.9 + 4975 = 64974.9
    expect(numberField(f(items.aggregateResult, 'totalVal'))).toBeCloseTo(64974.9, 0)
    // productList separator
    expect(f(items.aggregateResult, 'productList')).toBe('笔记本电脑 | 无线鼠标')
  })

  it('G-11: $list 计算列 productCodes 返回产品编码数组', () => {
    const ds = fromPromptJson(CASE_G_JSON)
    const warehouses = ds.getView('Warehouses')!
    // 仓库1（北京仓）: P001, P002
    const codes1 = arrayField(f(warehouses.rows[0], 'productCodes'))
    expect(Array.isArray(codes1)).toBe(true)
    expect(codes1).toHaveLength(2)
    expect(codes1).toContain('P001')
    expect(codes1).toContain('P002')
    // 仓库2（上海仓）: P001, P003
    const codes2 = arrayField(f(warehouses.rows[1], 'productCodes'))
    expect(Array.isArray(codes2)).toBe(true)
    expect(codes2).toHaveLength(2)
    expect(codes2).toContain('P001')
    expect(codes2).toContain('P003')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Case H：仓库库存管理（外部 AI 按 v1.9 提示词生成，结构验证基准）
// 场景：Warehouses(1:N)Inventories，Warehouses(1:N)Inbounds，两条 relation
// 覆盖：number/string/date 类型、多分支 computeExpression、aggregates 直接键名
// ─────────────────────────────────────────────────────────────────────────────
const CASE_H_JSON = {
    dataSetName: 'WarehouseStockDataSet',
    tables: {
      Warehouses: {
        columns: [
          { name: 'id',      type: 'number', isPrimaryKey: true, label: '仓库ID'   },
          { name: 'name',    type: 'string',                     label: '仓库名称' },
          { name: 'city',    type: 'string',                     label: '城市'     },
          { name: 'manager', type: 'string',                     label: '负责人'   },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: '华东仓', city: '上海', manager: '张伟' },
              { id: 2, name: '华南仓', city: '广州', manager: '李强' },
              { id: 3, name: '华北仓', city: '北京', manager: '王芳' },
            ],
          },
        },
      },
      Inventories: {
        columns: [
          { name: 'id',          type: 'number', isPrimaryKey: true, label: '库存ID'         },
          { name: 'warehouseId', type: 'number',                     label: '仓库ID'         },
          { name: 'productName', type: 'string',                     label: '商品名称'       },
          { name: 'sku',         type: 'string',                     label: 'SKU编号'        },
          { name: 'quantity',    type: 'number',                     label: '当前库存数量'   },
          { name: 'unit',        type: 'string',                     label: '单位'           },
          { name: 'minQuantity', type: 'number',                     label: '最低库存预警值' },
          {
            name:              'status',
            type:              'string',
            label:             '库存状态',
            computeExpression: "if (quantity <= minQuantity) return '预警'; return '正常';",
          },
        ],
        views: {
          default: {
            rows: [
              { id: 101, warehouseId: 1, productName: '智能手机',   sku: 'PHN-001', quantity: 50,  unit: '件', minQuantity: 20 },
              { id: 102, warehouseId: 1, productName: '笔记本电脑', sku: 'NTB-002', quantity: 8,   unit: '件', minQuantity: 10 },
              { id: 103, warehouseId: 2, productName: '平板电脑',   sku: 'TAB-003', quantity: 30,  unit: '件', minQuantity: 15 },
              { id: 104, warehouseId: 2, productName: '充电器',     sku: 'CHG-004', quantity: 5,   unit: '箱', minQuantity: 5  },
              { id: 105, warehouseId: 3, productName: '耳机',       sku: 'HPH-005', quantity: 100, unit: '件', minQuantity: 30 },
            ],
          },
        },
      },
      Inbounds: {
        columns: [
          { name: 'id',          type: 'number', isPrimaryKey: true, label: '入库ID'   },
          { name: 'warehouseId', type: 'number',                     label: '仓库ID'   },
          { name: 'productName', type: 'string',                     label: '商品名称' },
          { name: 'inQuantity',  type: 'number',                     label: '入库数量' },
          { name: 'inDate',      type: 'date',                       label: '入库日期' },
          { name: 'supplier',    type: 'string',                     label: '供应商'   },
        ],
        views: {
          default: {
            rows: [
              { id: 101, warehouseId: 1, productName: '智能手机',   inQuantity: 100, inDate: '2024-03-01', supplier: '华为供应链' },
              { id: 102, warehouseId: 1, productName: '笔记本电脑', inQuantity: 30,  inDate: '2024-03-05', supplier: '联想科技'   },
              { id: 103, warehouseId: 2, productName: '平板电脑',   inQuantity: 50,  inDate: '2024-03-03', supplier: '苹果授权商' },
              { id: 104, warehouseId: 3, productName: '耳机',       inQuantity: 200, inDate: '2024-03-10', supplier: '索尼代理'   },
            ],
            aggregates: {
              inQuantity: { type: 'sum', label: '入库总数量' },
            },
          },
        },
      },
    },
    resourceRelations: [
      {
        relationName:   'WarehouseInventories',
        parentTable:    'Warehouses',
        childTable:     'Inventories',
        childField:     'warehouseId',
      },
      {
        relationName:   'WarehouseInbounds',
        parentTable:    'Warehouses',
        childTable:     'Inbounds',
        childField:     'warehouseId',
      },
    ],
    viewCascades: [
      viewCascade('WarehouseInventories', 'Warehouses', 'Inventories', 'warehouseId'),
      viewCascade('WarehouseInbounds', 'Warehouses', 'Inbounds', 'warehouseId'),
    ],
}

describe('Case H：外部AI生成 - 仓库库存管理（v1.9 结构验证）', () => {
  it('H-1: fromJson 成功实例化，三张表均存在', () => {
    const ds = fromPromptJson(CASE_H_JSON)
    expect(ds).toBeTruthy()
    expect(ds.getTable('Warehouses')).toBeTruthy()
    expect(ds.getTable('Inventories')).toBeTruthy()
    expect(ds.getTable('Inbounds')).toBeTruthy()
  })

  it('H-2: 各表行数正确（Warehouses=3, Inventories=5, Inbounds=4）', () => {
    const ds = fromPromptJson(CASE_H_JSON)
    expect(ds.getView('Warehouses')!.rows).toHaveLength(3)
    expect(ds.getView('Inventories')!.rows).toHaveLength(5)
    expect(ds.getView('Inbounds')!.rows).toHaveLength(4)
  })

  it('H-3: 计算列 status 正确区分正常/预警', () => {
    const ds = fromPromptJson(CASE_H_JSON)
    const rows = ds.getView('Inventories')!.rows
    // quantity=50 > minQuantity=20 → 正常
    expect(f(rows[0], 'status')).toBe('正常')
    // quantity=8 <= minQuantity=10 → 预警
    expect(f(rows[1], 'status')).toBe('预警')
    // quantity=30 > minQuantity=15 → 正常
    expect(f(rows[2], 'status')).toBe('正常')
    // quantity=100 > minQuantity=30 → 正常
    expect(f(rows[4], 'status')).toBe('正常')
  })

  it('H-4: status 边界值 quantity===minQuantity → 预警', () => {
    const ds = fromPromptJson(CASE_H_JSON)
    const rows = ds.getView('Inventories')!.rows
    // id=104: quantity=5, minQuantity=5 → 5<=5 → 预警
    expect(f(rows[3], 'status')).toBe('预警')
  })

  it('H-5: 两条 DataView cascade 均保持独立身份', () => {
    const ds = fromPromptJson(CASE_H_JSON)
    const relations = ds.viewCascades ?? []
    const names = relations.map(r => r.cascadeId)
    expect(names).toContain('WarehouseInventories')
    expect(names).toContain('WarehouseInbounds')
  })

  it('H-6: 级联 WarehouseInventories - 选华东仓(id=1) 得 2 条库存', () => {
    const ds = fromPromptJson(CASE_H_JSON)
    const warehouses  = ds.getView('Warehouses')!
    const inventories = ds.getView('Inventories')!
    warehouses.selection.setCurrentRow(warehouses.rows[0]!) // 华东仓 id=1
    expect(inventories.rows).toHaveLength(2)
    expect(inventories.rows.every(r => f(r, 'warehouseId') === 1)).toBe(true)
  })

  it('H-7: 级联 WarehouseInbounds - 选华南仓(id=2) 得 1 条入库', () => {
    const ds = fromPromptJson(CASE_H_JSON)
    const warehouses = ds.getView('Warehouses')!
    const inbounds   = ds.getView('Inbounds')!
    warehouses.selection.setCurrentRow(warehouses.rows[1]!) // 华南仓 id=2
    expect(inbounds.rows).toHaveLength(1)
    expect(f(inbounds.rows[0], 'warehouseId')).toBe(2)
    expect(f(inbounds.rows[0], 'productName')).toBe('平板电脑')
  })

  it('H-8: aggregates inQuantity sum 全量行 = 380', () => {
    const ds = fromPromptJson(CASE_H_JSON)
    // 100 + 30 + 50 + 200 = 380
    expect(f(ds.getView('Inbounds')!.aggregateResult, 'inQuantity')).toBe(380)
  })

  it('H-9: 级联后 aggregates 只汇总过滤行 - 华东仓入库总量 = 130', () => {
    const ds = fromPromptJson(CASE_H_JSON)
    const warehouses = ds.getView('Warehouses')!
    const inbounds   = ds.getView('Inbounds')!
    warehouses.selection.setCurrentRow(warehouses.rows[0]!) // 华东仓 id=1
    // 100 + 30 = 130
    expect(f(inbounds.aggregateResult, 'inQuantity')).toBe(130)
  })

  it('H-10: 华北仓(id=3) 级联 - Inventories 1条，Inbounds 1条', () => {
    const ds = fromPromptJson(CASE_H_JSON)
    const warehouses  = ds.getView('Warehouses')!
    const inventories = ds.getView('Inventories')!
    const inbounds    = ds.getView('Inbounds')!
    warehouses.selection.setCurrentRow(warehouses.rows[2]!) // 华北仓 id=3
    expect(inventories.rows).toHaveLength(1)
    expect(f(inventories.rows[0], 'productName')).toBe('耳机')
    expect(inbounds.rows).toHaveLength(1)
    expect(f(inbounds.rows[0], 'inQuantity')).toBe(200)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Case I：物业管理系统（标准提示词模板自测）
// 三级层次：Communities → Buildings → RepairOrders
// 覆盖：三级 ID 编号、多层 $count/$sum/$join、多分支 computeExpression、aggregates
// ─────────────────────────────────────────────────────────────────────────────
const CASE_I_JSON = {
    dataSetName: 'PropertyManagementDataSet',
    tables: {
      Communities: {
        columns: [
          { name: 'id',            type: 'number', isPrimaryKey: true, label: '小区ID'     },
          { name: 'name',          type: 'string',                     label: '小区名称'   },
          { name: 'address',       type: 'string',                     label: '地址'       },
          { name: 'manager',       type: 'string',                     label: '物业经理'   },
          { name: 'buildingCount', type: 'number',                     label: '楼栋数',
            computeExpression: "$count('Buildings')" },
          { name: 'totalUnits',    type: 'number',                     label: '总户数',
            computeExpression: "$sum('Buildings', 'unitCount')" },
        ],
        views: {
          default: {
            rows: [
              { id: 1, name: '翠湖花园',   address: '翠湖路100号', manager: '张经理' },
              { id: 2, name: '金色阳光城', address: '阳光大道88号', manager: '王经理' },
              { id: 3, name: '碧水湾',     address: '滨江路66号',  manager: '李经理' },
            ],
          },
        },
      },
      Buildings: {
        columns: [
          { name: 'id',          type: 'number', isPrimaryKey: true, label: '楼栋ID'   },
          { name: 'communityId', type: 'number',                     label: '小区ID'   },
          { name: 'buildingNo',  type: 'string',                     label: '楼栋号'   },
          { name: 'floorCount',  type: 'number',                     label: '楼层数'   },
          { name: 'unitCount',   type: 'number',                     label: '户数'     },
          { name: 'repairCount', type: 'number',                     label: '报修数',
            computeExpression: "$count('RepairOrders')" },
          { name: 'repairTypes', type: 'string',                     label: '报修类型列表',
            computeExpression: "$join('RepairOrders', 'repairType', ' / ')" },
        ],
        views: {
          default: {
            rows: [
              { id: 101, communityId: 1, buildingNo: '1栋',  floorCount: 18, unitCount: 72 },
              { id: 102, communityId: 1, buildingNo: '2栋',  floorCount: 22, unitCount: 88 },
              { id: 103, communityId: 2, buildingNo: 'A栋', floorCount: 30, unitCount: 120 },
              { id: 104, communityId: 3, buildingNo: '1栋',  floorCount: 12, unitCount: 48 },
            ],
          },
        },
      },
      RepairOrders: {
        columns: [
          { name: 'id',          type: 'number', isPrimaryKey: true, label: '工单ID'   },
          { name: 'buildingId',  type: 'number',                     label: '楼栋ID'   },
          { name: 'reporter',    type: 'string',                     label: '报修人'   },
          { name: 'phone',       type: 'string',                     label: '联系电话' },
          { name: 'repairType',  type: 'string',                     label: '报修类型' },
          { name: 'description', type: 'string',                     label: '问题描述' },
          { name: 'reportDate',  type: 'date',                       label: '报修日期' },
          { name: 'priority',    type: 'number',                     label: '优先级'   },
          { name: 'status',      type: 'string',                     label: '状态',
            computeExpression: "if (priority >= 3) return '紧急'; if (priority === 2) return '一般'; return '低优先';" },
        ],
        views: {
          default: {
            rows: [
              { id: 1001, buildingId: 101, reporter: '张三', phone: '13800001001', repairType: '水管漏水',   description: '厨房水管漏水严重',   reportDate: '2024-03-01', priority: 3 },
              { id: 1002, buildingId: 101, reporter: '李四', phone: '13800001002', repairType: '电梯故障',   description: '电梯停在5楼不动',    reportDate: '2024-03-03', priority: 3 },
              { id: 1003, buildingId: 102, reporter: '王五', phone: '13800001003', repairType: '门禁损坏',   description: '单元门禁刷卡无反应', reportDate: '2024-03-05', priority: 2 },
              { id: 1004, buildingId: 103, reporter: '赵六', phone: '13800001004', repairType: '墙面脱落',   description: '走廊墙面涂料脱落',   reportDate: '2024-03-08', priority: 1 },
              { id: 1005, buildingId: 104, reporter: '孙七', phone: '13800001005', repairType: '水管漏水',   description: '卫生间水管渗水',     reportDate: '2024-03-10', priority: 2 },
            ],
            aggregates: {
              id:       { type: 'count', label: '报修总数' },
              typeList: { type: 'join',  field: 'repairType', separator: ' | ', label: '报修类型汇总' },
            },
          },
        },
      },
    },
    resourceRelations: [
      {
        relationName:   'CommunityBuildings',
        parentTable:    'Communities',
        childTable:     'Buildings',
        childField:     'communityId',
      },
      {
        relationName:   'BuildingRepairOrders',
        parentTable:    'Buildings',
        childTable:     'RepairOrders',
        childField:     'buildingId',
      },
    ],
    viewCascades: [
      viewCascade('CommunityBuildings', 'Communities', 'Buildings', 'communityId'),
      viewCascade('BuildingRepairOrders', 'Buildings', 'RepairOrders', 'buildingId'),
    ],
}

describe('Case I：标准提示词模板自测 - 物业管理系统（三级层次）', () => {
  it('I-1: fromJson 成功实例化，三张表均存在', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    expect(ds).toBeTruthy()
    expect(ds.getTable('Communities')).toBeTruthy()
    expect(ds.getTable('Buildings')).toBeTruthy()
    expect(ds.getTable('RepairOrders')).toBeTruthy()
  })

  it('I-2: 行数验证 Communities=3, Buildings=4, RepairOrders=5', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    expect(ds.getView('Communities')!.rows).toHaveLength(3)
    expect(ds.getView('Buildings')!.rows).toHaveLength(4)
    expect(ds.getView('RepairOrders')!.rows).toHaveLength(5)
  })

  it('I-3: 三级 ID 编号：顶级 1-3，二级 101-104，三级 1001-1005', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const cIds = ds.getView('Communities')!.rows.map(r => f(r, 'id'))
    const bIds = ds.getView('Buildings')!.rows.map(r => f(r, 'id'))
    const rIds = ds.getView('RepairOrders')!.rows.map(r => f(r, 'id'))
    expect(cIds).toEqual([1, 2, 3])
    expect(bIds).toEqual([101, 102, 103, 104])
    expect(rIds).toEqual([1001, 1002, 1003, 1004, 1005])
  })

  it('I-4: 计算列 status 多分支 - 紧急/一般/低优先', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const rows = ds.getView('RepairOrders')!.rows
    // priority=3 → 紧急
    expect(f(rows[0], 'status')).toBe('紧急')
    expect(f(rows[1], 'status')).toBe('紧急')
    // priority=2 → 一般
    expect(f(rows[2], 'status')).toBe('一般')
    // priority=1 → 低优先
    expect(f(rows[3], 'status')).toBe('低优先')
    // priority=2 → 一般
    expect(f(rows[4], 'status')).toBe('一般')
  })

  it('I-5: 两条 DataView cascade 均保持独立身份', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const names = (ds.viewCascades ?? []).map(r => r.cascadeId)
    expect(names).toContain('CommunityBuildings')
    expect(names).toContain('BuildingRepairOrders')
  })

  it('I-6: 一级级联 - 选翠湖花园(id=1) → Buildings 显示 2 栋', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const communities = ds.getView('Communities')!
    const buildings   = ds.getView('Buildings')!
    communities.selection.setCurrentRow(communities.rows[0]!) // 翠湖花园 id=1
    expect(buildings.rows).toHaveLength(2)
    expect(buildings.rows.every(r => f(r, 'communityId') === 1)).toBe(true)
  })

  it('I-7: 二级级联 - 选1栋(id=101) → RepairOrders 显示 2 条工单', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const communities   = ds.getView('Communities')!
    const buildings     = ds.getView('Buildings')!
    const repairOrders  = ds.getView('RepairOrders')!
    communities.selection.setCurrentRow(communities.rows[0]!) // 翠湖花园
    buildings.selection.setCurrentRow(buildings.rows[0]!)     // 1栋 id=101
    expect(repairOrders.rows).toHaveLength(2)
    expect(repairOrders.rows.every(r => f(r, 'buildingId') === 101)).toBe(true)
  })

  it('I-8: $count 计算列 - 翠湖花园 buildingCount=2', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const communities = ds.getView('Communities')!
    expect(f(communities.rows[0], 'buildingCount')).toBe(2)
    expect(f(communities.rows[1], 'buildingCount')).toBe(1) // 金色阳光城 1栋
    expect(f(communities.rows[2], 'buildingCount')).toBe(1) // 碧水湾 1栋
  })

  it('I-9: $sum 计算列 - 翠湖花园 totalUnits=72+88=160', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const communities = ds.getView('Communities')!
    expect(f(communities.rows[0], 'totalUnits')).toBe(160)  // 72+88
    expect(f(communities.rows[1], 'totalUnits')).toBe(120)  // A栋 120
    expect(f(communities.rows[2], 'totalUnits')).toBe(48)   // 1栋 48
  })

  it('I-10: $count 二级计算列 - 1栋(id=101) repairCount=2', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const communities = ds.getView('Communities')!
    const buildings   = ds.getView('Buildings')!
    communities.selection.setCurrentRow(communities.rows[0]!) // 翠湖花园
    // 级联后 Buildings 只有 id=101, 102
    expect(f(buildings.rows[0], 'repairCount')).toBe(2) // 1栋: 1001, 1002
    expect(f(buildings.rows[1], 'repairCount')).toBe(1) // 2栋: 1003
  })

  it('I-11: $join 二级计算列 - 1栋(id=101) repairTypes', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const communities = ds.getView('Communities')!
    const buildings   = ds.getView('Buildings')!
    communities.selection.setCurrentRow(communities.rows[0]!)
    expect(f(buildings.rows[0], 'repairTypes')).toBe('水管漏水 / 电梯故障')
  })

  it('I-12: aggregates count 全量 = 5', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    expect(f(ds.getView('RepairOrders')!.aggregateResult, 'id')).toBe(5)
  })

  it('I-13: aggregates join (field 覆盖) 全量', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const typeList = stringField(f(ds.getView('RepairOrders')!.aggregateResult, 'typeList'))
    expect(typeList).toContain('水管漏水')
    expect(typeList).toContain('电梯故障')
    expect(typeList).toContain('门禁损坏')
    expect(typeList).toContain('墙面脱落')
    expect(typeList.split(' | ')).toHaveLength(5)
  })

  it('I-14: 级联后 aggregates 只汇总过滤行', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const communities  = ds.getView('Communities')!
    const buildings    = ds.getView('Buildings')!
    const repairOrders = ds.getView('RepairOrders')!
    communities.selection.setCurrentRow(communities.rows[0]!) // 翠湖花园
    buildings.selection.setCurrentRow(buildings.rows[0]!)     // 1栋 101
    // 过滤后只有 1001, 1002
    expect(f(repairOrders.aggregateResult, 'id')).toBe(2)
    const typeList = stringField(f(repairOrders.aggregateResult, 'typeList'))
    expect(typeList).toBe('水管漏水 | 电梯故障')
  })

  it('I-15: 切换到碧水湾(id=3) → Buildings 1条，RepairOrders 1条', () => {
    const ds = fromPromptJson(CASE_I_JSON)
    const communities  = ds.getView('Communities')!
    const buildings    = ds.getView('Buildings')!
    const repairOrders = ds.getView('RepairOrders')!
    communities.selection.setCurrentRow(communities.rows[2]!) // 碧水湾 id=3
    expect(buildings.rows).toHaveLength(1)
    expect(f(buildings.rows[0], 'buildingNo')).toBe('1栋')
    buildings.selection.setCurrentRow(buildings.rows[0]!) // 碧水湾1栋 id=104
    expect(repairOrders.rows).toHaveLength(1)
    expect(f(repairOrders.rows[0], 'reporter')).toBe('孙七')
  })
})
