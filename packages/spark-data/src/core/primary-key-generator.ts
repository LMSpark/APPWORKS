/**
 * @module @spark-appworks/spark-data:core/primary-key-generator
 * 职责：提供 spark-data 数据管线中的 primary key generator 能力，支撑 DataSet、DataTable、DataView、树或 CRUD 状态协作。
 * 边界：保持框架无关，只维护数据模型和操作协议，不导入 Vue、Element Plus 或应用路由。
 * AI用途：处理页面数据绑定、DataViewKey、行状态、树结构或 CRUD 行为时，用本模块确认数据层语义。
 */
/**
 * 主键生成器 — 支持多种客户端主键生成策略
 *
 * 策略一览：
 * - `uuid`（推荐）— UUID v4，全局唯一，无状态
 * - `auto-increment` — 自增整数，简单场景 / 测试用
 * - `timestamp` — 时间戳 + 自增后缀，趋势递增
 * - `custom` — 自定义生成函数
 */

import type { DataRow } from '../types'

// ─────────────────────────────────────────────
// 类型定义
// ─────────────────────────────────────────────

/** timestamp 策略乘数（防止同毫秒碑撞，留出 4 位自增后缀空间） */
const TIMESTAMP_MULTIPLIER = 10_000

/**
 * 主键生成策略类型
 */
export type PrimaryKeyStrategy =
  | 'auto-increment'    // 自增整数
  | 'uuid'              // UUID v4（推荐）
  | 'timestamp'         // 时间戳 + 自增后缀
  | 'custom'            // 自定义生成器

/**
 * 主键生成器配置
 */
export type PrimaryKeyGeneratorConfig = {
  /** 生成策略 */
  strategy: PrimaryKeyStrategy
  /** 主键字段名 */
  fields: string
  /** 自定义生成函数（strategy='custom' 时必需） */
  generator?: (row: Partial<DataRow>, existingRows: DataRow[]) => string | number | Record<string, string | number>
  /** 自增起始值（strategy='auto-increment' 时，默认 1） */
  startValue?: number}

// ─────────────────────────────────────────────
// UUID 生成器
// ─────────────────────────────────────────────

/**
 * 生成 UUID v4
 * @returns UUID 字符串（格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx）
 */
function generateUUID(): string {
  // 优先使用原生 crypto.randomUUID()（浏览器 + Node.js 19+）
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  // 兜底方案
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ─────────────────────────────────────────────
// 主键生成器类
// ─────────────────────────────────────────────

/**
 * 主键生成器
 *
 * 支持多种生成策略，可为新记录自动生成主键值。
 */
export class PrimaryKeyGenerator {
  private config: PrimaryKeyGeneratorConfig
  private autoIncrementCounter: number

    /** 创建 Primary Key Generator 实例。 */
constructor(config: PrimaryKeyGeneratorConfig) {
    this.config = config
    this.autoIncrementCounter = config.startValue ?? 1
  }

  /**
   * 为新记录生成主键值
   *
   * @param row - 部分数据行（可能已包含部分字段值）
   * @param existingRows - 已存在的行数据（用于自增计算）
   * @returns 主键值
   */
  generate(
    row: Partial<DataRow>,
    existingRows: DataRow[] = []
  ): string | number {
    const { strategy } = this.config
    const field = this.config.fields

    switch (strategy) {
      case 'auto-increment':
        return this.generateAutoIncrement(existingRows, field)

      case 'uuid':
        return generateUUID()

      case 'timestamp':
        // 附加自增后缀防止同毫秒碰撞（batch 场景）
        return Date.now() * TIMESTAMP_MULTIPLIER + (this.autoIncrementCounter++)

      case 'custom': {
        if (!this.config.generator) {
          throw new Error('自定义生成器函数未提供')
        }
        const result = this.config.generator(row, existingRows)
        // 如果返回对象，提取对应字段
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (typeof result === 'object' && result !== null) {
          return result[field] ?? this.autoIncrementCounter++
        }
        return result
      }

      default:
        throw new Error(`不支持的主键生成策略: ${strategy}`)
    }
  }

  /**
   * 生成自增 ID
   */
  private generateAutoIncrement(existingRows: DataRow[], field: string): number {
    if (existingRows.length === 0) {
      return this.autoIncrementCounter++
    }

    // 查找现有数据中的最大值
    let maxValue = this.autoIncrementCounter - 1
    for (const row of existingRows) {
      const value = row[field]
      if (typeof value === 'number' && value > maxValue) {
        maxValue = value
      }
    }

    const nextValue = maxValue + 1
    this.autoIncrementCounter = nextValue + 1
    return nextValue
  }

  /** 重置自增计数器 */
  resetAutoIncrement(value: number): void {
    this.autoIncrementCounter = value
  }

  /** 获取当前配置 */
  getConfig(): Readonly<PrimaryKeyGeneratorConfig> {
    return { ...this.config }
  }
}

// ─────────────────────────────────────────────
// 工厂函数
// ─────────────────────────────────────────────

/** 创建主键生成器 */
export function createPrimaryKeyGenerator(
  config: PrimaryKeyGeneratorConfig
): PrimaryKeyGenerator {
  return new PrimaryKeyGenerator(config)
}
