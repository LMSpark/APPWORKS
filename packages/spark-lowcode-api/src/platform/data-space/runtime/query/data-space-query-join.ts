/**
 * @module @spark-appworks/spark-lowcode-api:platform/data-space/runtime/query/data-space-query-join
 * 职责：解析当前DataSet的显式SQL子查询及正式结果列。
 * 边界：不读取业务行、不推导连接关系或权限，不修改来源模型及视图。
 * AI用途：沿正式模型绑定生成只读Join投影并拒绝失效模型图。
 */
import type {DataColumn, DataTable, DataView, DataViewQueryChild, DataViewFilterTree} from '@spark-appworks/spark-data'
import {DataSpaceDesignApi} from '../../design/data-space-design-api'
import type {DataSpaceQueryOptions, DataSpaceQueryProjection} from '../data-space-runtime-contract'

type Model = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
/** 当前视图的正式子计划解析输入；正式定义继续归原运行owner所有。 */
type JoinInput = Readonly<{
  /** 本次根视图，决定DataSet和结果释放范围。 */
  view: DataView
  /** 当前运行owner已绑定的根正式模型。 */
  model: Model
  /** 已捕获且根字段已映射的查询参数，子字段尚使用规范输出名。 */
  options: DataSpaceQueryOptions
  /** 从同一运行owner取得表的正式绑定，同时核对绑定scope。 */
  readModel: (table: DataTable) => Model | undefined
}>

/** 仅解析显式非空子Join；原单表、叶Join和聚合查询保持各自原责任方。 */
export class DataSpaceQueryJoin {
  /** 捕获完整正式模型图，派发、分页、缓存接纳与结果读取复用同一失效检查。 */
  static resolve(input: JoinInput): Readonly<{options: DataSpaceQueryOptions; projection: DataSpaceQueryProjection}> | undefined {
    const {view, model, options, readModel} = input
    if (!options.children?.length) return undefined
    const dataSet = view.dataSet, root = view.dataTable
    if (options.outputType !== 'Join' || !dataSet || !root) throw new Error('SPARK_JOIN_SOURCE: 子查询缺少正式根视图')
    const snapshots: Array<{table: DataTable; model: Model; signature: string}> = []
    const columns: DataColumn[] = [], outputs = new Set<string>(), qualifiers = new Set<string>()
    const signature = (table: DataTable, formal: Model) => JSON.stringify([table.modelBinding, table.columns, formal])
    const capture = (table: DataTable, formal: Model) => {
      if (table.modelBinding?.modelId !== formal.id || table.modelBinding.modelName !== formal.metaName) {
        throw new Error('SPARK_JOIN_MODEL: 模型绑定身份与正式定义不一致')
      }
      if (!['database-table', 'database-view'].includes(DataSpaceDesignApi.resolveTableResource(formal).resourceType)
        || !model.sourceId || formal.sourceId !== model.sourceId) throw new Error('SPARK_JOIN_SOURCE: 所有模型必须属于同一正式SQL数据库')
      const qualifier = String(formal.raw['ShortName'] ?? formal.raw['shortName'] ?? '').trim() || formal.sourceName
      if (qualifiers.has(qualifier.toLowerCase())) throw new Error('SPARK_JOIN_ALIAS: SQL限定名重复')
      qualifiers.add(qualifier.toLowerCase())
      if (formal.fields.some(field => Number(field.raw['Group'] ?? field.raw['group'] ?? 0) > 0)) {
        throw new Error('SPARK_JOIN_AGGREGATE: 显式子Join的全图分组尚未承接')
      }
      snapshots.push({table, model: formal, signature: signature(table, formal)})
    }
    const select = (table: DataTable, formal: Model, names: readonly string[]) => names.map(name => {
      const field = DataSpaceDesignApi.resolveOutputFields(formal).find(item => item.canonicalName === name)
      if (!field) throw new Error(`SPARK_JOIN_FIELD: 未知正式输出 ${formal.metaName}.${name}`)
      const value = field.raw['ValueFun'] ?? field.raw['valueFun']
      const fun: unknown = typeof value === 'string' ? DataSpaceDesignApi.parseValueFunction(value) : value
      if (fun !== null && typeof fun === 'object' && 'Type' in fun && fun.Type === 'GetGroupData') {
        throw new Error('SPARK_JOIN_AGGREGATE: 显式子Join的全图聚合尚未承接')
      }
      if (outputs.has(field.canonicalName.toLowerCase())) throw new Error(`SPARK_JOIN_OUTPUT: 输出名重复 ${field.canonicalName}`)
      outputs.add(field.canonicalName.toLowerCase())
      const column = table.columns.find(item => item.name === field.canonicalName)
      columns.push({name: field.canonicalName, type: field.type || 'string', label: column?.label ?? (field.description || field.canonicalName)})
      return field.name
    })
    capture(root, model)
    const rootNames = (options.fields ?? []).filter(field => typeof field === 'string' || field.isOutput !== false).map(field => {
      const name = typeof field === 'string' ? field : field.name
      return DataSpaceDesignApi.resolveOutputFields(model).find(item => item.name === name)?.canonicalName ?? name
    })
    select(root, model, rootNames)
    const resolve = (children: readonly DataViewQueryChild[], parent: Model, ancestors: readonly string[]): readonly DataViewQueryChild[] => children.map(child => {
      if (ancestors.includes(child.modelName)) throw new Error('SPARK_JOIN_CYCLE: 子查询重复根或祖先模型')
      const candidates = Object.values(dataSet.tables).filter(table => table.modelBinding?.modelName === child.modelName)
      const table = candidates[0], formal = table === undefined ? undefined : readModel(table)
      if (candidates.length !== 1 || !table || formal?.metaName !== child.modelName || table.modelBinding?.modelId !== formal.id) {
        throw new Error(`SPARK_JOIN_MODEL: 子查询正式模型未唯一绑定 ${child.modelName}`)
      }
      if (String(formal.raw['PId'] ?? formal.raw['pid'] ?? '') !== parent.metaName
        || !String(formal.raw['JoinType'] ?? formal.raw['joinType'] ?? '').trim()
        || !String(formal.raw['JoinFilter'] ?? formal.raw['joinFilter'] ?? '').trim()) {
        throw new Error('SPARK_JOIN_RELATION: 子模型必须正式声明直接父注册名、连接类型和SQL条件')
      }
      capture(table, formal)
      const fields = select(table, formal, child.fields)
      const mapFilter = (tree: DataViewFilterTree): DataViewFilterTree => 'logic' in tree ? {...tree, filters: tree.filters.map(mapFilter)} : (() => {
        const field = DataSpaceDesignApi.resolveFields(formal).find(item => item.canonicalName === tree.field)
        if (!field) throw new Error(`SPARK_JOIN_FIELD: 未知过滤字段 ${tree.field}`)
        return {...tree, field: field.name}
      })()
      return {...child, fields, ...(child.filter === undefined ? {} : {filter: mapFilter(child.filter)}),
        children: resolve(child.children ?? [], formal, [...ancestors, child.modelName])}
    })
    const children = resolve(options.children, model, [model.metaName])
    const assertCurrent = () => {
      if (view.destroyed || dataSet.destroyed || view.dataSet !== dataSet || view.dataTable !== root) throw new Error('SPARK_JOIN_STALE: 根运行实例已失效')
      for (const captured of snapshots) {
        if (dataSet.tables[captured.table.tableName] !== captured.table || readModel(captured.table) !== captured.model
          || signature(captured.table, captured.model) !== captured.signature) throw new Error('SPARK_JOIN_STALE: 正式子查询图已变化')
      }
    }
    assertCurrent()
    return {options: {...options, children}, projection: {columns, owner: view,
      signature: JSON.stringify(snapshots.map(item => item.signature)), assertCurrent}}
  }
}
