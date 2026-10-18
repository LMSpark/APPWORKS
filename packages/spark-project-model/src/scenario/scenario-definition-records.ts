/**
 * @module @spark-appworks/spark-project-model:scenario/scenario-definition-records
 * 职责：在场景配置与定义资源记录之间转换语义，合并一次捕获后校验最终配置，不维护UI编辑态或执行存储。
 * 边界：数据库模型及字段仍只保存引用；旧关系须先显式转换。
 * AI用途：文件资源通过DataView查询与提交时复用同一映射。
 */
import type {DataRow, DataResourceRelation} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {ScenarioViewConfig} from './scenario-view-config'

/** 文件定义资源的稳定身份；不是后端注册模型，也不是运行DataView的身份。 */
export class ScenarioDefinitionRecords {
  readonly #previous: ScenarioViewConfig
  readonly #value: Record<string, unknown>
  readonly #removed = new Set<string>()
  #native: boolean
  #relationsWritten = false

  /**
   * 为一次保存捕获建立临时候选；不持有DataView草稿或文件owner。
   * @param config 已校验的同空间提交基线，原配置保持不变。
   */
  constructor(config: ScenarioViewConfig) {
    this.#previous = config
    this.#value = structuredClone(config.toJSON())
    this.#native = config.usesNativeResourceRelations
  }

  /** 正式C使用的资源标识；装配器按此表注入同一文件适配，不从URL推导文件路径。 */
  static readonly resources = Object.freeze({
    DataSpaceLayoutDefinition: 'pagedata:layout',
    DataTableBindingDefinition: 'pagedata:tables',
    DataViewDefinition: 'pagedata:views',
    DataResourceRelationDefinition: 'pagedata:resourceRelations',
    DataViewCascadeDefinition: 'pagedata:viewCascades',
  })

  /** 按已修改的定义域选取正式模型校验范围；不同存储接线复用同一规则。 */
  static validationScope(next: ScenarioViewConfig, previous: ScenarioViewConfig, resources: readonly string[]): ScenarioViewConfig | null {
    if (resources.length && resources.every(value => value === this.resources.DataSpaceLayoutDefinition)) {
      const withoutLayout = (value: ScenarioViewConfig) => Object.fromEntries(Object.entries(value.toJSON()).filter(([key]) => key !== 'layout'))
      if (this.json(withoutLayout(next)) !== this.json(withoutLayout(previous))) throw new Error('SCENARIO_DEFINITION_LAYOUT: 布局提交不能改变模型、视图或关系')
      return null
    }
    return resources.every(value => value === this.resources.DataViewDefinition) ? next.selectViewValidationScope(previous)
      : resources.every(value => value === this.resources.DataViewCascadeDefinition) ? next.selectCascadeValidationScope(previous)
      : resources.every(value => value === this.resources.DataResourceRelationDefinition) ? next.selectRelationValidationScope(previous)
        : resources.every(value => value === this.resources.DataTableBindingDefinition || value === this.resources.DataViewDefinition) ? next.selectTableValidationScope(previous)
          : resources.every(value => Object.values(this.resources).some(resource => resource === value)) ? next.selectDefinitionValidationScope(previous) : next
  }

  /** 由已校验配置投影定义记录；记录不包含目标空间的运行数据。 */
  static read(config: ScenarioViewConfig, resource: string, resolved?: readonly DataResourceRelation[]): DataRow[] {
    return this.project(config.toJSON(), resource, config.usesNativeResourceRelations, resolved)
  }

  /**
   * 投影本次捕获已经合并的定义，供资源适配继续核对查询基线与冲突；尚未完成最终配置校验。
   * @param resource 正式定义资源标识。
   * @param resolved 已经完整读取并显式转换的旧关系。
   * @returns 与候选隔离的定义记录，不包含运行数据或编辑状态。
   */
  readRows(resource: string, resolved?: readonly DataResourceRelation[]): DataRow[] {
    return ScenarioDefinitionRecords.project(this.#value, resource, this.#native, resolved)
  }

  private static project(value: Readonly<Record<string, unknown>>, resource: string, native: boolean, resolved?: readonly DataResourceRelation[]): DataRow[] {
    if (resource === this.resources.DataSpaceLayoutDefinition) {
      return [{dataSetId: value['scenarioId'], ...structuredClone(isRecord(value['layout']) ? value['layout'] : {})}]
    }
    if (resource === this.resources.DataTableBindingDefinition) {
      const tables = value['tables']
      if (!isRecord(tables)) throw new Error('SCENARIO_DEFINITION_SOURCE: 缺少tables')
      return Object.entries(tables).map(([tableName, table]) => {
        if (!isRecord(table)) throw new Error('SCENARIO_DEFINITION_SOURCE: 模型绑定无效')
        const binding = table['modelBinding']
        return {dataSetId: value['scenarioId'], tableName, resourceType: table['resourceType'] ?? 'database',
          ...(isRecord(binding) ? {dataModelId: binding['modelId'], dataModelName: binding['modelName']} : {}),
          configuration: structuredClone(Object.fromEntries(Object.entries(table).filter(([name]) => name !== 'views')))}
      })
    }
    if (resource === this.resources.DataViewDefinition) {
      const tables = value['tables']
      if (!isRecord(tables)) throw new Error('SCENARIO_DEFINITION_SOURCE: 缺少tables')
      return Object.entries(tables).flatMap(([tableName, table]) => {
        if (!isRecord(table) || !isRecord(table['views'])) throw new Error('SCENARIO_DEFINITION_SOURCE: 缺少views')
        const binding = table['modelBinding']
        return Object.entries(table['views']).map(([viewId, definition]) => {
          if (!isRecord(definition)) throw new Error('SCENARIO_DEFINITION_SOURCE: 视图定义无效')
          return {...structuredClone(definition), dataSetId: value['scenarioId'], tableName, viewId,
            ...(isRecord(binding) ? {dataModelId: binding['modelId'], dataModelName: binding['modelName']} : {})}
        })
      })
    }
    const property = this.property(resource)
    const raw: unknown = value[property] ?? []
    if (!Array.isArray(raw) || !raw.every(isRecord)) throw new Error('SCENARIO_DEFINITION_SOURCE: 定义集合无效')
    let entries: Array<Record<string, unknown>> = raw
    if (resource === this.resources.DataResourceRelationDefinition && !native && resolved) {
      const sources = resolved.filter(relation => relation.sourceRelationId !== undefined)
      const sourceKey = (row: Readonly<Record<string, unknown>>) => JSON.stringify([row['sourceRelationId'], row['parentTable'], row['childTable']])
      const keys = new Set(sources.map(sourceKey))
      entries = [...sources, ...entries.filter(entry => !('sourceRelationId' in entry) || !keys.has(sourceKey(entry)))]
    }
    return entries.map((entry, index) => ({...structuredClone(entry), dataSetId: value['scenarioId'],
      definitionKey: resource === this.resources.DataViewCascadeDefinition ? String(index)
        : JSON.stringify(!native && 'sourceRelationId' in entry
          ? ['source', entry['sourceRelationId'], entry['parentTable'], entry['childTable']] : ['native', entry['relationId']])}))
  }

  /** 映射完整的已合并定义集合；合并、变更捕获和回执由DataView及资源适配负责。 */
  static write(config: ScenarioViewConfig, resource: string, rows: readonly DataRow[], legacyResolved = false): ScenarioViewConfig {
    const candidate = new ScenarioDefinitionRecords(config)
    candidate.applyRows(resource, rows, legacyResolved)
    return candidate.toConfig()
  }

  /**
   * 合并一个定义域的完整记录；仅供保存适配处理已捕获变更，最终必须调用toConfig校验。
   * @param resource 正式定义资源标识；绑定先于其视图合并。
   * @param rows 已按原查询基线完成冲突与字段写入检查的集合。
   * @param legacyResolved 旧关系来源是否已经完整读取并显式转换，默认false。
   */
  applyRows(resource: string, rows: readonly DataRow[], legacyResolved = false): void {
    // 最终规范化不能改写保存捕获本身，否则DataView会将当前值误判为保存期间的后续编辑。
    rows = structuredClone(rows)
    const value = this.#value, resources = ScenarioDefinitionRecords.resources
    if (rows.some(row => row['dataSetId'] !== this.#previous.scenarioId)) throw new Error('SCENARIO_DEFINITION_IDENTITY: 目标空间不一致')
    if (resource === resources.DataSpaceLayoutDefinition) {
      const row = rows[0]
      if (rows.length !== 1 || !row) throw new Error('SCENARIO_DEFINITION_LAYOUT: 空间布局必须保留唯一配置记录')
      const layout: Record<string, unknown> = {}
      for (const [key, item] of Object.entries(row)) {
        if (['_pk', 'dataSetId'].includes(key)) continue
        if (!['modelPositions', 'tablePositions', 'unboundNodes', 'unboundEdges'].includes(key)) throw new Error(`SCENARIO_DEFINITION_LAYOUT: 非布局属性 ${key}`)
        if (item !== undefined) layout[key] = item
      }
      value['layout'] = layout
    } else if (resource === resources.DataTableBindingDefinition) {
      const tables = value['tables']
      if (!isRecord(tables)) throw new Error('SCENARIO_DEFINITION_SOURCE: 缺少tables')
      const retained = new Set<string>()
      for (const row of rows) {
        const name = row['tableName'], configuration = row['configuration']
        if (typeof name !== 'string' || !isRecord(configuration) || Object.hasOwn(configuration, 'views')) throw new Error('SCENARIO_DEFINITION_IDENTITY: 绑定配置无效')
        const previous = tables[name]
        Object.defineProperty(tables, name, {value: {...configuration, views: isRecord(previous) ? previous['views'] : {default: {}}}, enumerable: true, configurable: true, writable: true})
        retained.add(name)
      }
      for (const name of Object.keys(tables)) if (!retained.has(name)) {
        const references = this.#previous.getTableRemovalReferences(name)
        if (references.length) throw new Error(`SCENARIO_DEFINITION_REFERENCES: ${references.join('；')}`)
        this.#removed.add(name)
        Reflect.deleteProperty(tables, name)
        const layout = value['layout']
        if (isRecord(layout) && isRecord(layout['tablePositions'])) Reflect.deleteProperty(layout['tablePositions'], name)
      }
    } else if (resource === resources.DataViewDefinition) {
      const tables = value['tables']
      if (!isRecord(tables)) throw new Error('SCENARIO_DEFINITION_SOURCE: 缺少tables')
      for (const table of Object.values(tables)) {
        if (!isRecord(table)) throw new Error('SCENARIO_DEFINITION_SOURCE: 模型定义无效')
        table['views'] = {}
      }
      const created = new Set<string>()
      for (const row of rows) {
        const tableName = row['tableName'], viewId = row['viewId']
        if (typeof tableName === 'string' && !Object.hasOwn(tables, tableName)) {
          if (this.#removed.has(tableName)) throw new Error('SCENARIO_DEFINITION_IDENTITY: 不能为本次解除的绑定重新添加视图')
          const modelId = row['dataModelId'], modelName = row['dataModelName']
          if (typeof modelId !== 'string' || !modelId.trim() || typeof modelName !== 'string' || !modelName.trim()) {
            throw new Error('SCENARIO_DEFINITION_IDENTITY: 新绑定须提供正式模型ID与名称')
          }
          Object.defineProperty(tables, tableName, {value: {modelBinding: {modelId, modelName}, views: {}}, enumerable: true})
          created.add(tableName)
        }
        const table = typeof tableName === 'string' ? tables[tableName] : undefined
        if (!isRecord(table) || !isRecord(table['views']) || typeof viewId !== 'string'
          || !viewId.trim() || viewId.trim() !== viewId || viewId.includes('@') || viewId.startsWith('#')) {
          throw new Error('SCENARIO_DEFINITION_IDENTITY: 模型或视图身份无效')
        }
        const binding = table['modelBinding']
        if (row['dataModelId'] !== (isRecord(binding) ? binding['modelId'] : undefined)
          || row['dataModelName'] !== (isRecord(binding) ? binding['modelName'] : undefined)) {
          throw new Error('SCENARIO_DEFINITION_IDENTITY: 正式模型身份不一致')
        }
        if (Object.hasOwn(table['views'], viewId)) throw new Error('SCENARIO_DEFINITION_DUPLICATE: 视图身份重复')
        const definition: DataRow = {}
        for (const [key, item] of Object.entries(row)) {
          if (['_pk', 'dataSetId', 'dataModelId', 'dataModelName', 'tableName', 'viewId'].includes(key)) continue
          if (!ScenarioViewConfig.isViewProperty(key)) throw new Error(`SCENARIO_DEFINITION_PROPERTY: 非视图属性 ${key}`)
          if (item !== undefined) definition[key] = item
        }
        Object.defineProperty(table['views'], viewId, {value: definition, enumerable: true, configurable: true, writable: true})
      }
      for (const name of created) {
        const table = tables[name]
        if (isRecord(table) && isRecord(table['views']) && !Object.hasOwn(table['views'], 'default')) table['views']['default'] = {}
      }
    } else {
      if (resource === resources.DataResourceRelationDefinition && !this.#native) {
        if (legacyResolved) {value['schemaVersion'] = 2; this.#native = true}
        else {
          // 未完成转换时，仅能删除文件自身的旧来源引用来修复定义；不能把运行子集升级成完整v2关系。
          // 保留旧格式意味着数据库关系继续由正式装配链读取，不因删除文件引用而删除来源关系。
          const previous = this.readRows(resource)
          const retained = rows.map(row => ScenarioDefinitionRecords.json(Object.fromEntries(Object.entries(row).filter(([key]) => key !== '_pk'))))
          const before = previous.map(row => ScenarioDefinitionRecords.json(row))
          if (rows.length >= previous.length || retained.some(row => !before.includes(row))
            || previous.some(row => !retained.includes(ScenarioDefinitionRecords.json(row))
              && (typeof row['sourceRelationId'] !== 'string' || Object.hasOwn(row, 'filterExpression')))) {
            throw new Error('SCENARIO_DEFINITION_LEGACY: 请先显式转换旧模型关系，不能将未读取的关系当作空集合')
          }
        }
      }
      value[ScenarioDefinitionRecords.property(resource)] = rows.map(row => Object.fromEntries(Object.entries(row)
        .filter(([key, item]) => !['_pk', 'definitionKey', 'dataSetId'].includes(key) && item !== undefined)))
      if (resource === resources.DataResourceRelationDefinition) this.#relationsWritten = true
    }
  }

  /**
   * 全部捕获合并后校验最终配置，并消耗与正式关系端点一致的待配置连线。
   * @returns 同空间不可变配置；失败不修改原配置或持久存储。
   */
  toConfig(): ScenarioViewConfig {
    const value = this.#value
    if (this.#relationsWritten) {
      const config = new ScenarioViewConfig(this.#previous.scenarioId, ScenarioDefinitionRecords.json(
        Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'layout'))))
      const rows = this.readRows(ScenarioDefinitionRecords.resources.DataResourceRelationDefinition)
      const layout = value['layout'], tables = value['tables']
      if (isRecord(layout) && isRecord(layout['unboundEdges']) && isRecord(tables)) for (const row of rows) {
        const id = row['relationId']
        if (typeof id !== 'string' || !Object.hasOwn(layout['unboundEdges'], id)) continue
        const edge = layout['unboundEdges'][id], parent = tables[String(row['parentTable'])], child = tables[String(row['childTable'])]
        if (row['sourceRelationId'] !== undefined || !isRecord(edge) || !isRecord(parent) || !isRecord(child)
          || config.getLayoutNodeKey(String(row['parentTable'])) !== edge['source'] || config.getLayoutNodeKey(String(row['childTable'])) !== edge['target']) {
          throw new Error('SCENARIO_DEFINITION_LAYOUT: 待配置连线与关系端点不一致')
        }
        Reflect.deleteProperty(layout['unboundEdges'], id)
      }
    }
    const config = new ScenarioViewConfig(this.#previous.scenarioId, ScenarioDefinitionRecords.json(value))
    this.validateModelBindings(config)
    return config
  }

  /** 新增/改绑不能产生完整键歧义；原有重复配置仍可读取、修改其他属性或显式解除，不自动迁移。 */
  private validateModelBindings(config: ScenarioViewConfig): void {
    const resource = ScenarioDefinitionRecords.resources.DataTableBindingDefinition
    const previous = ScenarioDefinitionRecords.read(this.#previous, resource)
    const next = ScenarioDefinitionRecords.read(config, resource)
    const identity = (row: DataRow) => [row['dataModelId'], row['dataModelName'] ?? row['tableName']]
    for (const row of next) {
      const [id, name] = identity(row)
      const before = previous.find(item => item['tableName'] === row['tableName'])
      if (before && identity(before)[0] === id && identity(before)[1] === name) continue
      const conflict = next.find(item => item !== row && (identity(item)[1] === name || id !== undefined && identity(item)[0] === id))
      if (conflict) throw new Error(`SCENARIO_DEFINITION_DUPLICATE: ${String(row['tableName'])} 与 ${String(conflict['tableName'])} 的模型身份或名称重复，请在已有模型下新增视图`)
    }
  }

  /** 拒绝不可持久化值，不能由JSON.stringify静默丢失函数或改写非有限数字。 */
  static json(value: unknown): string {
    const ancestors = new Set<object>()
    const visit = (item: unknown): void => {
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol' || typeof item === 'bigint'
        || typeof item === 'number' && !Number.isFinite(item)) throw new Error('SCENARIO_DEFINITION_VALUE: 定义必须是JSON数据')
      if (item === null || typeof item !== 'object') return
      if (ancestors.has(item) || !Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype
        && Object.getPrototypeOf(item) !== null) throw new Error('SCENARIO_DEFINITION_VALUE: 定义必须是无环JSON数据')
      ancestors.add(item)
      Object.values(item).forEach(visit)
      ancestors.delete(item)
    }
    visit(value)
    return JSON.stringify(value)
  }

  private static property(resource: string): 'resourceRelations' | 'viewCascades' {
    if (resource === this.resources.DataResourceRelationDefinition) return 'resourceRelations'
    if (resource === this.resources.DataViewCascadeDefinition) return 'viewCascades'
    throw new Error('SCENARIO_DEFINITION_RESOURCE: 未知定义资源')
  }
}
