/**
 * @module @spark-appworks/spark-data:query/data-view-filter-lookup
 * 职责：按视图配置将文本筛选转换为辅助视图的正式值集合过滤。
 * 边界：复用queryOptionRows的完整查询与权限，不持有缓存、选中集合或HTTP入口。
 * AI用途：姓名等辅助字段筛选配置在queryConfig.filterLookups，页面只消费标准过滤API。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import type {DataView} from '../data-view'
import type {DataViewFilterLookupConfig as Lookup} from '../types'
import {parseDataViewKey, resolveDataViewKey} from '../core/data-view-key'
import type {DataViewFilterTree} from './filter/data-view-filter-contract'

/** 一级辅助筛选的定义校验与执行；保留原条件树和AND/OR语义。 */
export class DataViewFilterLookup {
  /** 捕获不可变配置，拒绝重复目标、未知属性及非完整绑定。 */
  static parse(input: unknown, path: string): readonly Lookup[] {
    if (!Array.isArray(input)) throw new TypeError(`${path} 必须是数组`)
    const fields = new Set<string>()
    return Object.freeze(input.map(item => {
      const keys = ['field', 'sourceViewKey', 'matchField', 'valueField'] as const
      if (!isRecord(item) || Object.keys(item).some(key => !keys.some(allowed => allowed === key))
        || keys.some(key => typeof item[key] !== 'string' || !item[key].trim())) throw new TypeError(`${path} 查找配置无效`)
      const field = String(item['field'])
      const sourceViewKey = String(item['sourceViewKey'])
      if (!parseDataViewKey(sourceViewKey)?.scope) throw new TypeError(`${path} 必须使用完整视图键`)
      if (fields.has(field)) throw new TypeError(`${path} 重复字段 ${field}`)
      fields.add(field)
      return Object.freeze({field, sourceViewKey, matchField: String(item['matchField']), valueField: String(item['valueField'])})
    }))
  }

  /** 完整查询辅助值后替换contains叶节点；失败拒绝目标请求，空值集保持恒假。 */
  static async resolve(view: DataView, filter: DataViewFilterTree | undefined): Promise<DataViewFilterTree | undefined> {
    const lookups = view.queryConfig.filterLookups
    if (!filter || !lookups?.length) return filter
    const visit = async (node: DataViewFilterTree): Promise<DataViewFilterTree> => {
      if ('logic' in node) return {...node, filters: await Promise.all(node.filters.map(visit))}
      const lookup = lookups.find(item => item.field === node.field)
      if (!lookup || node.operator !== 'contains') return node
      if (!view.columns.some(column => column.name === node.field && !column.computeExpression && !column.isComputed)) {
        throw new Error(`DATA_VIEW_FILTER_LOOKUP_FIELD: ${node.field} 不是正式输出字段`)
      }
      if (typeof node.value !== 'string') throw new Error(`DATA_VIEW_FILTER_LOOKUP_VALUE: ${node.field} 需要文本输入`)
      const source = resolveDataViewKey(lookup.sourceViewKey, view.dataSet)
      if (!source || source === view || source.queryConfig.filterLookups?.length
        || source.dataSet?.getParentCascades(source.tableName, source.viewId).length) {
        throw new Error(`DATA_VIEW_FILTER_LOOKUP_SOURCE: 需要同空间内无递归查找及查询级联依赖的来源视图 ${lookup.sourceViewKey}`)
      }
      const rows = await source.queryOptionRows({fields: [...new Set([lookup.valueField, lookup.matchField])],
        filter: {field: lookup.matchField, operator: 'contains', value: node.value.trim()}})
      const values: Array<string | number | boolean> = []
      for (const value of new Set(rows.map(row => row[lookup.valueField]))) {
        if (value === null) continue
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
          throw new Error(`DATA_VIEW_FILTER_LOOKUP_VALUE: ${lookup.valueField} 不是原生标量`)
        }
        values.push(value)
      }
      return values.length ? {field: node.field, operator: 'in', value: values}
        : {logic: 'and', filters: [{field: node.field, operator: 'is-null'}, {field: node.field, operator: 'is-not-null'}]}
    }
    return visit(filter)
  }
}
