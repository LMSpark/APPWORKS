/**
 * @module @spark-appworks/spark-data:query/data-view-local-query
 * 职责：在资源已读取的记录上执行同一DataView过滤、排序、分页和输出投影。
 * 边界：不读取来源，不维护编辑态，不决定读写授权。
 * AI用途：数组及文件资源适配器共享查询算法，业务页面不实现另一套查询。
 */
import type {DataRow, QueryParams} from '../types'
import {DataViewFilter} from './filter/data-view-filter'
import {DataViewFilterLocal} from './filter/data-view-filter-local'
import {DataViewQuery} from './data-view-query'

/** 已加载资源的查询执行器；结果仍由DataView接纳，行值保持原生类型。 */
export class DataViewLocalQuery {
  /** 本地已读取集合支持的输出模式；SelfRefData读取完整集合，不执行服务器节点查询。 */
  static readonly outputTypes: ReadonlyArray<Readonly<{value: string; label: string}>> = Object.freeze([
    Object.freeze({value: 'Table', label: '列表查询'}),
    Object.freeze({value: 'SelfRefData', label: '完整集合（不分页）'}),
  ])

  /** 使用视图请求快照查询完整来源；主键始终保留，总数在分页之前计算。 */
  static select(input: Readonly<{rows: readonly DataRow[]; fields: ReadonlySet<string>;
    primaryKeys: readonly string[]; params: QueryParams}>): Readonly<{rows: DataRow[]; total: number; output: ReadonlySet<string>}> {
    const {fields, params, primaryKeys} = input
    if (params.tree || params.outputType && !this.outputTypes.some(item => item.value === params.outputType)) {
      throw new Error('本地资源支持Table或完整SelfRefData，不执行服务器节点/关联查询')
    }
    let rows = input.rows.slice()
    if (params.filter) {
      const parsed = DataViewFilter.parse(params.filter)
      if (!parsed.ok) throw new Error('本地资源过滤表达式无效')
      const local = new DataViewFilterLocal(parsed.value.bindInputParams(params.context ?? {}))
      local.validateFields(fields)
      rows = rows.filter(row => local.matches(row))
    }
    if (params.sort) {
      const sort = params.sort.split(',').map(part => {
        const [field, direction] = part.split(':')
        if (!field || !fields.has(field) || direction !== 'asc' && direction !== 'desc') throw new Error('本地资源排序字段或方向无效')
        return {field, direction}
      })
      rows.sort((left, right) => {
        for (const {field, direction} of sort) {
          const a = left[field], b = right[field]
          const compared = typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''))
          if (compared) return direction === 'asc' ? compared : -compared
        }
        return 0
      })
    }
    const total = rows.length, max = params.maxRows ?? 50000
    if (!Number.isSafeInteger(max) || max < 1) throw new Error('本地资源集合上限必须是正整数')
    if (DataViewQuery.isPaginated(params)) {
      const page = params.page ?? 1, size = params.pageSize ?? 20
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1) throw new Error('本地资源分页参数必须是正整数')
      rows = rows.slice((page - 1) * size, page * size)
    } else if (total > max) throw new Error('本地资源完整集合超过配置上限')
    const requested = params.fields ?? (params.projection?.length
      ? params.projection.filter(field => field.output).map(field => field.viewField) : [...fields])
    if (requested.some(field => !fields.has(field))) throw new Error('本地资源输出投影引用未知字段')
    const output = new Set([...requested, ...primaryKeys])
    return {total, output, rows: structuredClone(rows.map(row => Object.fromEntries(Object.entries(row).filter(([field]) => output.has(field)))))}
  }
}
