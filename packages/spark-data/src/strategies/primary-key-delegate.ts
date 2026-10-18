/**
 * @module @spark-appworks/spark-data:strategies/primary-key-delegate
 * 职责：提供 spark-data 数据管线中的 primary key delegate 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * PrimaryKeyDelegate — 主键管理委托
 *
 * 封装 DataView 中所有主键相关的状态和逻辑：
 * - 单列主键 / 多列合成主键（_pk）
 * - `_pk` 统一计算列：无论单列还是多列主键，所有行均自动计算 `_pk` 字段
 * - 主键值强转（coercePkValue）
 * - 主键生成器（PrimaryKeyGenerator）
 *
 * DataView 通过构造函数注入轻量回调持有对 DataView 资源和本次结果身份的引用，
 * 避免循环依赖和双向耦合。
 *
 * ## `_pk` 统一计算列
 *
 * 所有 PK 配置（单列 / 多列 / 默认 'id'）均注册 `_pk` 计算列，由
 * `ensurePkColumn()` 统一管理。`getPkKey(row)` 优先读取预计算的 `row._pk`，
 * 避免每次调用时的类型强转开销。
 *
 * - 单列 PK：`_pk = coercePkValue(row[field], col)` — 预计算 + 类型强转
 * - 多列 PK：`_pk = fields.map(f => String(row[f])).join('+')` — 拼接字符串
 * - `primaryKey` getter 仍返回逻辑字段名（供级联、事件元数据等使用）
 * - `_pk` 是保留字段名，业务表不应使用
 */

import type { DataRow, DataColumn } from '../types'
import type { PrimaryKeyGenerator, PrimaryKeyGeneratorConfig } from '../core/primary-key-generator'
import { createPrimaryKeyGenerator } from '../core/primary-key-generator'
import { isSameRow } from '../core/utils'

function dataRowFromPartial(row: Partial<DataRow>): DataRow {
  return { ...row }
}

// ─────────────────────────────────────────────
// 模块级工具函数
// ─────────────────────────────────────────────

/** 数字类列类型集合——主键值需要强转为 number */
const NUMERIC_TYPES: ReadonlySet<string> = new Set([
  'number', 'int', 'integer', 'decimal', 'float', 'double',
])

/**
 * 根据 DataColumn 的 type 强转主键值为 Map/Set 可用的 `string | number`。
 *
 * 策略（按列 type 分支）：
 * - **数字类** → `Number(value)`（NaN → undefined）
 * - **布尔类** → `1` / `0`
 * - **日期类** → ISO 字符串
 * - **字符串/枚举/其他** → `String(value)`
 * - **无列定义** → 保持原 string/number，其他 `String(value)`
 */
function coercePkValue(
  value: unknown,
  col: DataColumn | undefined,
): string | number | undefined {
  if (value === null || value === undefined) return undefined

  if (col !== undefined) {
    if (NUMERIC_TYPES.has(col.type)) {
      const n = Number(value)
      return isNaN(n) ? undefined : n
    }
    if (col.type === 'boolean' || col.type === 'bool') {
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition -- value 可为 0/''/'false' 等空值
      return value ? 1 : 0
    }
    if (col.type === 'date' || col.type === 'datetime' || col.type === 'time') {
      if (value instanceof Date) return value.toISOString()
      return String(value)
    }
    return String(value)
  }

  if (typeof value === 'string' || typeof value === 'number') return value
  return String(value)
}

/** Primary Key Delegate 的语义模型。 */
export class PrimaryKeyDelegate {
  /** 显式覆盖的主键字段名（undefined = 从 DataTable 列定义推导） */
  private _primaryKeyOverride?: string | undefined

  /**
   * 自动合成的 _pk 计算列所用字段（幺等守卫）。
   * 存了就不重复注册；字段变化时自动失效重生。
   */
  private _syntheticPkFields: string[] | undefined

  /** 单列 PK 时 _pk 计算列绑定的源字段名（幺等守卫） */
  private _singlePkField: string | undefined

  /** _pk 计算列是否已注册（用于 getPkKey 快速路径判断） */
  private _pkColumnRegistered = false

  /** 主键生成器（可选，用于自动生成新记录的主键） */
  private _primaryKeyGenerator?: PrimaryKeyGenerator | undefined

  /**
   * @param _getColumns        获取当前 DataTable 的列定义（用于推导主键）
   * @param _getColumnMap      获取列名→列定义 Map（用于 _coercePkValue O(1) 查找）
   * @param _getRows           获取当前行数组（用于主键生成器 / 补计算触发点）
   * @param _registerComputed  向 ComputedColumnDelegate 注册计算列（用于合成 _pk）
   * @param _getResultPrimaryKey 当前查询结果的行身份；空字符串表示无主键结果，undefined沿用配置。
   */
  constructor(
    private readonly _getColumns: () => DataColumn[],
    private readonly _getColumnMap: () => Map<string, DataColumn> | undefined,
    private readonly _getRows: () => DataRow[],
    private readonly _registerComputed: (name: string, fn: (row: DataRow) => unknown) => void,
    private readonly _getResultPrimaryKey?: () => string | undefined,
  ) {}

  // ─────────────────────────────────────────────
  // _pk 统一计算列
  // ─────────────────────────────────────────────

  /**
   * 统一注册 `_pk` 计算列——无论单列还是多列主键。
   *
   * 调用时机：
   * - `dataTable` setter（列定义变更时）
   * - `primaryKey` setter（显式覆盖时）
   *
   * 幺等：字段列表不变时跳过重新注册。
   * 补计算（`_computedDelegate.apply(rows)`）由调用方负责。
   */
  ensurePkColumn(): void {
    const fields = this._resolveRawPkFields()

    if (fields.length === 1) {
      const field = fields[0]
      if (field !== undefined) this._ensureSinglePkColumn(field)
    } else {
      this._ensureCompositePkColumn(fields)
    }
  }

  /**
   * 推导实际的主键字段列表（不触发 _pk 注册副作用）。
   *
   * 优先级：本次查询结果身份 > 显式覆盖 > isPrimaryKey 列 > 默认 'id'
   */
  private _resolveRawPkFields(): string[] {
    const resultKey = this._getResultPrimaryKey?.()
    if (resultKey !== undefined) return [resultKey]
    if (this._primaryKeyOverride !== undefined) return [this._primaryKeyOverride]
    const cols = this._getColumns()
    if (cols.length > 0) {
      const pkCols = cols.filter(c => c.isPrimaryKey)
      if (pkCols.length >= 1) return pkCols.map(c => c.name)
    }
    return ['id']
  }

  /**
   * 单列 PK：注册 `_pk = coercePkValue(row[field], col)`。
   * 幺等：字段名不变时跳过。
   */
  private _ensureSinglePkColumn(field: string): void {
    if (this._singlePkField === field) return
    this._singlePkField = field
    this._syntheticPkFields = undefined // 清除多列状态

    const getColumnMap = this._getColumnMap
    this._registerComputed('_pk', (row: DataRow) => {
      if (field === '') return undefined
      const value = row[field]
      if (value === undefined || value === null) return undefined
      return coercePkValue(value, getColumnMap()?.get(field))
    })
    this._pkColumnRegistered = true
  }

  /**
   * 多列 PK：注册 `_pk = fields.map(f => String(row[f])).join('+')`。
   *
   * 幺等：字段列表不变时跳过。
  * 与历史多列合成主键逻辑一致。
   */
  private _ensureCompositePkColumn(fields: string[]): void {
    if (this._syntheticPkFields?.join('\x01') === fields.join('\x01')) return
    this._syntheticPkFields = fields
    this._singlePkField = undefined // 清除单列状态

    this._registerComputed('_pk', (row) =>
      fields.map(f => String(row[f] ?? '')).join('+'),
    )
    this._pkColumnRegistered = true
  }

  /** 当前合成主键字段列表（用于 DataView 在主键列更新后补计算） */
  get syntheticPkFields(): string[] | undefined {
    return this._syntheticPkFields
  }

  /**
   * 返回 `_pk` 列的元数据（DataColumn）。
   *
   * 类型推导规则：
   * - 单列 PK 且有列定义 → 继承源列 type
   * - 多列 PK / 无列定义 → `'string'`
   */
  getPkColumnMeta(): DataColumn {
    const fields = this._resolveRawPkFields()
    if (fields.length === 1) {
      const field = fields[0]
      if (field !== undefined) {
        const col = this._getColumnMap()?.get(field)
        return { name: '_pk', type: col?.type ?? 'string', isComputed: true }
      }
    }
    return { name: '_pk', type: 'string', isComputed: true }
  }

  // ─────────────────────────────────────────────
  // 主键字段名
  // ─────────────────────────────────────────────

  /** 显式覆盖值（供外部读取，用于 dataTable setter 中的守卫判断） */
  get primaryKeyOverride(): string | undefined {
    return this._primaryKeyOverride
  }

  /**
   * 主键字段名（逻辑名称，用于级联、事件元数据等外部消费）。
   *
   * 解析优先级：
   * 1. 本次查询结果身份（空字符串表示无主键只读结果，不改配置）
   * 2. 显式覆盖值（通过 `primaryKey = 'xxx'` 设置）
   * 3. DataTable 列定义中 `isPrimaryKey: true` 的列名（单列返回列名，多列返回 `'_pk'`）
   * 4. 回退默认值 `'id'`
   *
   * 注意：此 getter 是纯函数（无副作用），不再触发计算列注册。
   * `_pk` 计算列由 `ensurePkColumn()` 统一管理。
   */
  get primaryKey(): string {
    const resultKey = this._getResultPrimaryKey?.()
    if (resultKey !== undefined) return resultKey
    if (this._primaryKeyOverride !== undefined) return this._primaryKeyOverride

    const cols = this._getColumns()
    if (cols.length > 0) {
      const pkCols = cols.filter(c => c.isPrimaryKey)
      if (pkCols.length === 1) {
        const col = pkCols[0]
        if (col) return col.name
      }
      if (pkCols.length > 1) return '_pk'
    }
    return 'id'
  }

  set primaryKey(value: string) {
    this._primaryKeyOverride = value
  }

  /**
   * 清除显式覆盖，恢复从 DataTable 列定义自动推导主键。
   * 同时清除 `_pk` 计算列注册状态，下次 `ensurePkColumn()` 时重新注册。
   *
   * @example
   * view.primaryKey = 'uuid'  // 显式覆盖
   * view.resetPrimaryKey()    // 恢复列推导
   */
  resetPrimaryKey(): void {
    this._primaryKeyOverride = undefined
    this._syntheticPkFields = undefined
    this._singlePkField = undefined
    this._pkColumnRegistered = false
  }

  /**
   * 实际生效的主键字段名列表（不含合成列 `_pk`）。
   *
   * - 多列自动合成时返回原始字段列表（`_syntheticPkFields`）
   * - 否则返回 `[primaryKey]`
   *
   * @internal 供委托（`LocalMutationDelegate` 等）校验/遍历真实字段
   */
  get effectivePkFields(): string[] {
    if (this.primaryKey === '') return []
    return this._syntheticPkFields ?? [this.primaryKey]
  }

  // ─────────────────────────────────────────────
  // 主键值解析
  // ─────────────────────────────────────────────

  /**
   * 获取行的主键值（标量）。
   *
   * **快速路径**：若 `_pk` 计算列已注册（`ensurePkColumn()` 已调用），
   * 直接读取预计算的 `row._pk`——O(1) 字段读取，无类型强转。
   *
   * **未注册路径**：若 `_pk` 尚未注册（非托管行 / 初始化前调用），
   * 回退到 `row[primaryKey]` + `coercePkValue` 运行时强转。
   *
   * 所有内部 Map/Set/`===` 比较均使用此方法。
   */
  getPkKey(row: DataRow): string | number | undefined {
    if (this.primaryKey === '') return undefined
    // 快速路径：_pk 计算列已注册，值已预计算
    if (this._pkColumnRegistered) {
      const pk = row['_pk']
      if (typeof pk === 'string' || typeof pk === 'number') return pk
      if (pk !== undefined && pk !== null) {
        throw new Error(`Invalid computed primary key type: ${typeof pk}`)
      }
      // _pk 存在但为 undefined/null → 主键值缺失
      if ('_pk' in row) return undefined
    }

    // 未注册路径：非托管行 / _pk 尚未注册
    const field = this.primaryKey
    const value = row[field]
    if (value === undefined || value === null) return undefined
    return coercePkValue(value, this._getColumnMap()?.get(field))
  }

  /**
   * 从行数据构建服务端 PK payload（用于 CRUD HTTP 请求）。
   *
   * 对于自动合成 _pk 的多列主键，返回原始字段的 Record：
   *   `{ orderId: 1, productId: 10 }`
   * 对于单列主键，返回单字段 Record：
   *   `{ id: 42 }`
   *
   * @internal 供 saveChanges / CrudDelegate 等构建服务端请求使用
   */
  buildServerPk(row: DataRow): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const f of this.effectivePkFields) result[f] = row[f]
    return result
  }

  /**
   * 检查两行是否有相同的主键。
   *
   * 优先使用 `_pk`（预计算）进行比较，否则回退到 `isSameRow`。
   */
  isSamePrimaryKey(row1: DataRow, row2: DataRow): boolean {
    if (this._pkColumnRegistered) {
      const pk1 = row1['_pk']
      const pk2 = row2['_pk']
      if (pk1 !== undefined && pk1 !== null && pk2 !== undefined && pk2 !== null) {
        return pk1 === pk2
      }
    }
    return isSameRow(row1, row2, this.primaryKey)
  }

  // ─────────────────────────────────────────────
  // 主键生成器
  // ─────────────────────────────────────────────

  /**
   * 配置主键生成器
   *
   * @param config 主键生成器配置
   *
   * @example
   * ```ts
   * // UUID生成器
   * view.setPrimaryKeyGenerator({ strategy: 'uuid', fields: 'id' })
   * // 自增ID
   * view.setPrimaryKeyGenerator({ strategy: 'auto-increment', fields: 'id', startValue: 1000 })
   * ```
   */
  setPrimaryKeyGenerator(config: PrimaryKeyGeneratorConfig): void {
    this._primaryKeyGenerator = createPrimaryKeyGenerator(config)
  }

  /** 移除主键生成器 */
  removePrimaryKeyGenerator(): void {
    this._primaryKeyGenerator = undefined
  }

  /**
   * 为新记录生成主键值
   *
   * @throws 如果未配置主键生成器
   */
  generatePrimaryKey(row: Partial<DataRow>): DataRow {
    if (!this._primaryKeyGenerator) {
      throw new Error('未配置主键生成器，请先调用 setPrimaryKeyGenerator()')
    }
    const pkValue = this._primaryKeyGenerator.generate(row, this._getRows())
    return dataRowFromPartial({ ...row, [this.primaryKey]: pkValue })
  }

  /**
   * 为新记录生成主键值（如果配置了生成器且行中缺少主键）
   *
   * @param row 部分数据行
   * @returns 包含主键的数据行（如果需要生成）或原始数据（如果已有主键）
   */
  ensurePrimaryKey(row: Partial<DataRow>): DataRow {
    if (!this._primaryKeyGenerator) {
      return dataRowFromPartial(row)
    }
    const fields = this.effectivePkFields
    const hasPrimaryKey = fields.every(field => {
      const value = row[field]
      return value !== undefined && value !== null
    })
    if (hasPrimaryKey) {
      return dataRowFromPartial(row)
    }
    return this.generatePrimaryKey(row)
  }

  /** 获取主键生成器配置 */
  getPrimaryKeyGeneratorConfig(): Readonly<PrimaryKeyGeneratorConfig> | undefined {
    return this._primaryKeyGenerator?.getConfig()
  }
}
