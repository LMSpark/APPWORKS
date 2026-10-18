/**
 * @module @spark-appworks/spark-data:query/data-view-query
 * 职责：统一视图查询配置的校验和不可变快照，供持久化、DataView及API适配器共用。
 * 边界：不保存查询结果或权限，不发送HTTP；线协议字段名由适配器转换。
 * AI用途：配置DataView.queryConfig后调用refresh，过滤、排序及翻页沿用同一配置。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import type {QueryParams, ViewMetadata} from '../types'
import {DataViewFilterLookup} from './data-view-filter-lookup'

/** 查询模式与读取范围的唯一配置解析器；省略属性保持责任方既定默认值。 */
export class DataViewQuery {
  /** 校验原生完成函数名；仅保存标识符，不解析或执行脚本，空字符串禁用。 */
  static parseCompletionHandler(value: unknown, path = 'onRequestComplete'): string {
    if (typeof value !== 'string' || value !== '' && !/^[A-Za-z_$][\w$]*$/.test(value)) {
      throw new TypeError(`${path} 必须是页面脚本函数名或空字符串，不能包含脚本体或调用表达式`)
    }
    return value
  }
  /**
   * 查询结果是否按页消费；SelfRef按完整节点集合消费，allPages按完整查询集合消费。
   * @param config 当前视图的查询配置；不改写保留的分页偏好。
   * @returns true表示容器可呈现分页，false表示呈现完整集合。
   */
  static isPaginated(config: NonNullable<ViewMetadata['queryConfig']>): boolean {
    return config.tree === undefined && config.outputType !== 'SelfRefData' && config.allPages !== true
  }

  /** 查询配置编辑的常用输出类型候选；不是协议白名单，parse仍保留未列出的扩展类型。 */
  static readonly outputTypes = Object.freeze([
    {label: '关联表查询', value: 'Join'}, {label: '自引用树查询', value: 'SelfRefData'},
    {label: '多表层级查询', value: 'HierarchyData'}, {label: '多表导航查询', value: 'Navigation'},
    {label: '单表查询', value: 'Table'},
  ].map(item => Object.freeze(item)))

  /** 自引用查询方向候选；缺省方向仍由请求适配器按既定合同处理。 */
  static readonly treeModes = Object.freeze([
    {label: '直接子节点', value: 'child'}, {label: '祖先及各级同级节点', value: 'parent'},
  ].map(item => Object.freeze(item)))

  /** 校验配置并复制冻结；拒绝未知属性，空对象恢复默认查询。 */
  static parse(input: unknown, path = 'queryConfig'): NonNullable<ViewMetadata['queryConfig']> {
    const value = this.object(input, ['outputType', 'tree', 'allPages', 'maxRows', 'fields', 'autoQuery', 'filterLookups', 'sourceInputMode', 'cacheType'], path)
    const result: { -readonly [K in keyof NonNullable<ViewMetadata['queryConfig']>]: NonNullable<ViewMetadata['queryConfig']>[K] } = {}
    if (value['cacheType'] !== undefined) {
      const type = value['cacheType']
      if (type !== 'none' && type !== 'page' && type !== 'browser') throw new TypeError(`${path}.cacheType 只支持 none、page 或 browser`)
      result.cacheType = type
    }
    if (value['sourceInputMode'] !== undefined) {
      if (value['sourceInputMode'] !== 'mapped' && value['sourceInputMode'] !== 'direct') throw new TypeError(`${path}.sourceInputMode 只支持 mapped 或 direct`)
      result.sourceInputMode = value['sourceInputMode']
    }
    if (value['filterLookups'] !== undefined) result.filterLookups = DataViewFilterLookup.parse(value['filterLookups'], `${path}.filterLookups`)
    if (value['autoQuery'] !== undefined) {
      if (typeof value['autoQuery'] !== 'boolean') throw new TypeError(`${path}.autoQuery 必须是布尔值`)
      result.autoQuery = value['autoQuery']
    }
    if (value['fields'] !== undefined) {
      const fields = value['fields']
      if (!Array.isArray(fields) || !fields.length || new Set(fields).size !== fields.length) throw new TypeError(`${path}.fields 必须是非空且不重复的字段列表`)
      result.fields = Object.freeze(fields.map(field => this.text(field, `${path}.fields`)))
    }
    if (value['outputType'] !== undefined) result.outputType = this.text(value['outputType'], `${path}.outputType`)
    if (value['allPages'] !== undefined) {
      if (typeof value['allPages'] !== 'boolean') throw new TypeError(`${path}.allPages 必须是布尔值`)
      result.allPages = value['allPages']
    }
    if (value['maxRows'] !== undefined) {
      const maxRows = value['maxRows']
      if (typeof maxRows !== 'number' || !Number.isSafeInteger(maxRows) || maxRows <= 0) throw new TypeError(`${path}.maxRows 必须是正整数`)
      result.maxRows = maxRows
    }
    if (value['tree'] !== undefined) {
      const tree = this.object(value['tree'], ['keyField', 'parentField', 'nodeId', 'hasChildrenField', 'mode'], `${path}.tree`)
      const mode = tree['mode']
      if (mode !== undefined && mode !== 'child' && mode !== 'parent') throw new TypeError(`${path}.tree.mode 只支持 child 或 parent`)
      result.tree = Object.freeze({
        keyField: this.text(tree['keyField'], `${path}.tree.keyField`),
        parentField: this.text(tree['parentField'], `${path}.tree.parentField`),
        nodeId: this.text(tree['nodeId'], `${path}.tree.nodeId`),
        ...(tree['hasChildrenField'] === undefined ? {} : {hasChildrenField: this.text(tree['hasChildrenField'], `${path}.tree.hasChildrenField`)}),
        ...(mode === undefined ? {} : {mode}),
      })
      if (result.outputType !== undefined && result.outputType !== 'SelfRefData') throw new TypeError(`${path}.tree 与指定的 outputType 冲突`)
    }
    return Object.freeze(result)
  }

  /** 从完整请求中只捕获查询配置；分页、过滤、身份等继续使用原请求合同。 */
  static capture(params: QueryParams): NonNullable<ViewMetadata['queryConfig']> {
    return this.parse({outputType: params.outputType, tree: params.tree, allPages: params.allPages, maxRows: params.maxRows, fields: params.fields, sourceInputMode: params.sourceInputMode})
  }

  /** 查询字段必须属于正式输出，不能把本地计算字段提交给服务器。 */
  static validateFields(config: NonNullable<ViewMetadata['queryConfig']>, fields: ReadonlySet<string>): void {
    const parsed = this.parse(config)
    for (const lookup of parsed.filterLookups ?? []) {
      if (!fields.has(lookup.field)) throw new Error(`queryConfig.filterLookups 不是当前正式输出字段: ${lookup.field}`)
    }
    for (const field of parsed.fields ?? []) {
      if (!fields.has(field)) throw new Error(`queryConfig.fields 不是当前正式输出字段: ${field}`)
    }
    const tree = parsed.tree
    if (!tree) return
    for (const key of ['keyField', 'parentField', 'hasChildrenField'] as const) {
      const field = tree[key]
      if (field !== undefined && !fields.has(field)) throw new Error(`queryConfig.tree.${key} 不是当前正式输出字段: ${field}`)
    }
  }

  private static object(value: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
    if (!isRecord(value)) throw new TypeError(`${path} 必须是对象`)
    if (Object.keys(value).some(key => !allowed.includes(key))) throw new TypeError(`${path} 包含未知参数`)
    return value
  }

  private static text(value: unknown, path: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${path} 必须是非空字符串`)
    return value
  }
}
