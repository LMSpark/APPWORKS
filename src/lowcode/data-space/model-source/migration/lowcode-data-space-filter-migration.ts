/**
 * @module app:lowcode/data-space/model-source/migration/lowcode-data-space-filter-migration
 * 职责：在正式wire过滤树上迁移已解析的字段和值函数引用。
 * 边界：不决定引用归属，不遍历常量内部对象，不重新投影未知扩展。
 * AI用途：模型和关系共用无损遍历，各自提供上下文解析。
 */
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {isRecord} from '@spark-appworks/spark-utils'

/** 过滤原文变换；解析前后都使用正式合同，没有变更时逐字保留。 */
export class LowcodeDataSpaceFilterMigration {
  /** 仅遍历过滤组和条件，字段/值函数命名空间由调用方处理。 */
  static rewrite(before: string, field: (value: unknown) => string,
    valueFunction: (value: Record<string, unknown>) => Record<string, unknown>): string {
    DataSpaceDesignApi.parseFilter(before)
    const raw: unknown = JSON.parse(before)
    const visit = (value: unknown): unknown => {
      if (!isRecord(value)) throw new Error('过滤节点无效')
      if (value['Type'] === 'and' || value['Type'] === 'or') {
        if (!Array.isArray(value['Filters'])) throw new Error('过滤组无效')
        return {...value, Filters: value['Filters'].map(visit)}
      }
      if (!isRecord(value['ValueFun'])) throw new Error('值函数无效')
      return {...value, Field: field(value['Field']), ValueFun: valueFunction(value['ValueFun'])}
    }
    const result = visit(raw)
    if (JSON.stringify(raw) === JSON.stringify(result)) return before
    const after = JSON.stringify(result)
    DataSpaceDesignApi.parseFilter(after)
    return after
  }
}
