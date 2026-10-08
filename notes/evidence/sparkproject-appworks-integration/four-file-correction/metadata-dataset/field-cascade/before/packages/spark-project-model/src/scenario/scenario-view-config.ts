/**
 * @module @spark-appworks/spark-project-model:scenario/scenario-view-config
 * 职责：单场景视图配置的校验和不可变值。
 * 边界：正式模型与运行数据不属于此文件。
 * AI用途：校验modelBinding、命名视图与显式级联。
 */
import { DataViewFilter } from '@spark-appworks/spark-data'
import { isRecord } from '@spark-appworks/spark-utils'

/** 只读JSON配置对象，构造时校验并递归冻结。 */
type ScenarioConfigObject = Readonly<Record<string, unknown>>

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} 必须是对象`)
  return value
}

function name(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} 必须是非空字符串`)
  return value.trim()
}

function keys(value: ScenarioConfigObject, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${path}.${key} 不属于场景视图配置`)
}

function optionalBoolean(value: ScenarioConfigObject, key: string, path: string): void {
  if (key in value && typeof value[key] !== 'boolean') throw new Error(`${path}.${key} 必须是布尔值`)
}

function freezeJson(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('场景配置不能包含非有限数值')
  if (value === null || typeof value !== 'object') return
  Object.values(value).forEach(freezeJson)
  Object.freeze(value)
}

/** 一个场景的配置文本合同；正式字段及运行数据不属于此文件，字段引用由正式模型装配时校验。 */
export class ScenarioViewConfig {
  readonly #scenarioId: string
  readonly #config: ScenarioConfigObject
  /** 校验明确场景的合法视图JSON，冻结配置且拒绝模型定义与运行数据。 */

  public constructor(scenarioId: string, text: string) {
    this.#scenarioId = name(scenarioId, 'scenarioId')
    const input: unknown = JSON.parse(text)
    const config = record(input, 'pagedata')
    keys(config, ['scenarioId', 'tables', 'viewCascades', 'schemaVersion', 'version', 'saveChanges', 'layout'], 'pagedata')
    if (name(config['scenarioId'], 'pagedata.scenarioId') !== this.#scenarioId) throw new Error('pagedata 不属于当前场景')
    const tables = record(config['tables'], 'tables')
    if ('schemaVersion' in config && (typeof config['schemaVersion'] !== 'number'
      || !Number.isSafeInteger(config['schemaVersion']) || config['schemaVersion'] <= 0)) {
      throw new Error('pagedata.schemaVersion 必须是正安全整数')
    }
    if ('version' in config && (typeof config['version'] !== 'number'
      || !Number.isSafeInteger(config['version']) || config['version'] < 0)) {
      throw new Error('pagedata.version 必须是非负安全整数')
    }
    if ('saveChanges' in config) {
      const save = record(config['saveChanges'], 'pagedata.saveChanges')
      keys(save, ['mode'], 'pagedata.saveChanges')
      if ('mode' in save && save['mode'] !== 'perView') throw new Error('pagedata.saveChanges.mode 仅支持 perView')
    }
    if ('layout' in config) {
      const layout = record(config['layout'], 'pagedata.layout')
      keys(layout, ['tablePositions'], 'pagedata.layout')
      if ('tablePositions' in layout) {
        const positions = record(layout['tablePositions'], 'pagedata.layout.tablePositions')
        for (const [tableName, value] of Object.entries(positions)) {
          if (!Object.hasOwn(tables, tableName)) throw new Error(`pagedata.layout 未知表: ${tableName}`)
          const position = record(value, `pagedata.layout.tablePositions.${tableName}`)
          keys(position, ['x', 'y'], `pagedata.layout.tablePositions.${tableName}`)
          for (const axis of ['x', 'y']) {
            if (typeof position[axis] !== 'number' || !Number.isFinite(position[axis])) {
              throw new Error(`pagedata.layout.tablePositions.${tableName}.${axis} 必须是有限数值`)
            }
          }
        }
      }
    }
    for (const [tableName, inputTable] of Object.entries(tables)) {
      name(tableName, 'tableName')
      const table = record(inputTable, `tables.${tableName}`)
      keys(table, ['modelBinding', 'columns', 'views'], `tables.${tableName}`)
      const binding = record(table['modelBinding'], `${tableName}.modelBinding`)
      keys(binding, ['modelId', 'modelName'], `${tableName}.modelBinding`)
      name(binding['modelId'], `${tableName}.modelId`)
      name(binding['modelName'], `${tableName}.modelName`)
      if ('columns' in table) this.validateColumns(table['columns'], `tables.${tableName}.columns`)
      const views = record(table['views'], `${tableName}.views`)
      if (!Object.hasOwn(views, 'default')) throw new Error(`${tableName} 缺少 views.default`)
      for (const [viewId, view] of Object.entries(views)) {
        name(viewId, 'viewId')
        this.validateView(record(view, `${tableName}@${viewId}`), `${tableName}@${viewId}`)
      }
    }
    if ('viewCascades' in config) {
      if (!Array.isArray(config['viewCascades'])) throw new Error('viewCascades 必须是数组')
      config['viewCascades'].forEach(item => this.validateCascade(record(item, 'viewCascades'), tables))
    }
    freezeJson(config)
    this.#config = config
    Object.freeze(this)
  }

  public get scenarioId(): string { return this.#scenarioId }
  public toJSON(): ScenarioConfigObject { return this.#config }

  private validateColumns(input: unknown, path: string): void {
    if (!Array.isArray(input)) throw new Error(`${path} 必须是数组`)
    const seen = new Set<string>()
    input.forEach((item, index) => {
      const columnPath = `${path}[${index}]`
      const column = record(item, columnPath)
      const local = Object.hasOwn(column, 'computeExpression')
      keys(column, ['name', 'required', 'minLength', 'maxLength', 'min', 'max', 'pattern', 'patternMessage',
        ...(local ? ['type', 'label', 'computeExpression'] : [])], columnPath)
      const columnName = name(column['name'], `${columnPath}.name`)
      if (columnName !== column['name'] || seen.has(columnName)) throw new Error(`${columnPath}.name 必须是唯一的原始输出名`)
      if (local) {
        if (columnName === '_pk' || columnName.startsWith('lingma_sys_')) throw new Error(`${columnPath}.name 是框架控制字段`)
        name(column['type'], `${columnPath}.type`)
        name(column['computeExpression'], `${columnPath}.computeExpression`)
        if ('label' in column && typeof column['label'] !== 'string') throw new Error(`${columnPath}.label 必须是字符串`)
      }
      seen.add(columnName)
      optionalBoolean(column, 'required', columnPath)
      for (const key of ['minLength', 'maxLength']) {
        const value = column[key]
        if (key in column && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) {
          throw new Error(`${columnPath}.${key} 必须是非负安全整数`)
        }
      }
      for (const key of ['min', 'max']) {
        const value = column[key]
        if (key in column && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`${columnPath}.${key} 必须是有限数值`)
      }
      if (typeof column['minLength'] === 'number' && typeof column['maxLength'] === 'number'
        && column['minLength'] > column['maxLength']) throw new Error(`${columnPath} 长度下界大于上界`)
      if (typeof column['min'] === 'number' && typeof column['max'] === 'number'
        && column['min'] > column['max']) throw new Error(`${columnPath} 数值下界大于上界`)
      for (const key of ['pattern', 'patternMessage']) {
        if (key in column && typeof column[key] !== 'string') throw new Error(`${columnPath}.${key} 必须是字符串`)
      }
      if (typeof column['pattern'] === 'string') {
        try { new RegExp(column['pattern']) } catch { throw new Error(`${columnPath}.pattern 正则表达式无效`) }
      }
    })
  }

  private validateView(view: ScenarioConfigObject, path: string): void {
    keys(view, ['fieldProjection', 'queryContext', 'filterExpression', 'sortExpression', 'autoCurrentFirst',
      'autoSelectFirst', 'page', 'pageSize', 'treeConfig', 'valueField', 'labelField', 'selectionDelimiter',
      'autoLoad', 'commitMode', 'aggregates'], path)
    for (const key of ['autoCurrentFirst', 'autoSelectFirst', 'autoLoad']) optionalBoolean(view, key, path)
    for (const key of ['labelField', 'selectionDelimiter']) {
      if (key in view && typeof view[key] !== 'string') throw new Error(`${path}.${key} 必须是字符串`)
    }
    for (const key of ['page', 'pageSize']) {
      const value = view[key]
      if (key in view && (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0)) throw new Error(`${path}.${key} 必须是正整数`)
    }
    if ('commitMode' in view && view['commitMode'] !== 'staged' && view['commitMode'] !== 'immediate') throw new Error(`${path}.commitMode 无效`)
    if ('valueField' in view && typeof view['valueField'] !== 'string'
      && !(Array.isArray(view['valueField']) && view['valueField'].every(item => typeof item === 'string'))) throw new Error(`${path}.valueField 无效`)
    if ('queryContext' in view) record(view['queryContext'], `${path}.queryContext`)
    if ('filterExpression' in view) {
      const parsed = DataViewFilter.parse(view['filterExpression'])
      if (!parsed.ok) throw new Error(`${path}.filterExpression: ${parsed.issues.map(issue => issue.message).join('; ')}`)
    }
    if ('sortExpression' in view) {
      if (!Array.isArray(view['sortExpression'])) throw new Error(`${path}.sortExpression 必须是数组`)
      for (const input of view['sortExpression']) {
        const sort = record(input, `${path}.sortExpression`)
        keys(sort, ['field', 'direction'], `${path}.sortExpression`)
        name(sort['field'], `${path}.sortExpression.field`)
        if ('direction' in sort && sort['direction'] !== 'asc' && sort['direction'] !== 'desc') throw new Error(`${path}.sortExpression.direction 无效`)
      }
    }
    if ('treeConfig' in view) {
      const tree = record(view['treeConfig'], `${path}.treeConfig`)
      keys(tree, ['idField', 'parentIdField', 'textField', 'depthLimit', 'lazy', 'treeMode', 'serverPaginationMode', 'filterMode'], `${path}.treeConfig`)
      for (const key of ['idField', 'parentIdField', 'textField']) if (key in tree) name(tree[key], `${path}.treeConfig.${key}`)
      optionalBoolean(tree, 'lazy', `${path}.treeConfig`)
      const depth = tree['depthLimit']
      if ('depthLimit' in tree && (typeof depth !== 'number' || !Number.isSafeInteger(depth) || depth < 0)) throw new Error(`${path}.treeConfig.depthLimit 无效`)
      for (const [key, allowed] of Object.entries({ treeMode: ['flat', 'nested'], serverPaginationMode: ['root', 'flat'], filterMode: ['include-ancestors', 'node-only'] })) {
        if (key in tree && !allowed.some(value => value === tree[key])) throw new Error(`${path}.treeConfig.${key} 无效`)
      }
    }
    if ('fieldProjection' in view) {
      if (!Array.isArray(view['fieldProjection'])) throw new Error(`${path}.fieldProjection 必须是数组`)
      for (const input of view['fieldProjection']) {
        const field = record(input, `${path}.fieldProjection`)
        keys(field, ['fieldId', 'source', 'resourceFieldId', 'resourceField', 'viewField', 'type', 'label',
          'output', 'sortOrder', 'sortDirection', 'group', 'distinct', 'primaryKey', 'value', 'valueFunction',
          'expression'], `${path}.fieldProjection`)
        const fieldPath = `${path}.fieldProjection`
        for (const key of ['fieldId', 'resourceField', 'viewField']) name(field[key], `${fieldPath}.${key}`)
        if (field['source'] !== 'resource' && field['source'] !== 'derived') throw new Error(`${fieldPath}.source 无效`)
        if (field['source'] === 'resource') name(field['resourceFieldId'], `${fieldPath}.resourceFieldId`)
        else if (field['resourceFieldId'] !== null) throw new Error(`${fieldPath}.resourceFieldId 必须为 null`)
        for (const key of ['type', 'label', 'value', 'valueFunction', 'expression']) {
          if (typeof field[key] !== 'string') throw new Error(`${fieldPath}.${key} 必须是字符串`)
        }
        for (const key of ['output', 'distinct', 'primaryKey']) {
          if (typeof field[key] !== 'boolean') throw new Error(`${fieldPath}.${key} 必须是布尔值`)
        }
        for (const key of ['sortOrder', 'group']) {
          const value = field[key]
          if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${fieldPath}.${key} 必须是非负整数`)
        }
        if (field['sortDirection'] !== null && field['sortDirection'] !== 'asc' && field['sortDirection'] !== 'desc') {
          throw new Error(`${fieldPath}.sortDirection 无效`)
        }
      }
    }
    if ('aggregates' in view) {
      const aggregates = record(view['aggregates'], `${path}.aggregates`)
      for (const [output, input] of Object.entries(aggregates)) {
        const aggregate = record(input, `${path}.aggregates.${output}`)
        keys(aggregate, ['type', 'field', 'separator'], `${path}.aggregates.${output}`)
        if (!['sum', 'count', 'avg', 'min', 'max', 'join'].some(type => type === aggregate['type'])) throw new Error(`${path}.aggregates.${output}.type 无效`)
        for (const key of ['field', 'separator']) if (key in aggregate && typeof aggregate[key] !== 'string') throw new Error(`${path}.aggregates.${output}.${key} 无效`)
      }
    }
  }

  private validateCascade(cascade: ScenarioConfigObject, tables: ScenarioConfigObject): void {
    keys(cascade, ['cascadeId', 'sourceRelationId', 'parentTable', 'parentViewId', 'childTable', 'childViewId',
      'filterBindings', 'dependencyType', 'autoLoad'], 'viewCascades')
    for (const prefix of ['parent', 'child']) {
      const tableName = name(cascade[`${prefix}Table`], `viewCascades.${prefix}Table`)
      const viewId = name(cascade[`${prefix}ViewId`], `viewCascades.${prefix}ViewId`)
      const table = record(tables[tableName], `viewCascades.${tableName}`)
      const views = record(table['views'], `${tableName}.views`)
      if (!Object.hasOwn(views, viewId)) throw new Error(`viewCascades 视图不存在: ${tableName}@${viewId}`)
    }
    for (const key of ['cascadeId', 'sourceRelationId']) if (key in cascade) name(cascade[key], `viewCascades.${key}`)
    optionalBoolean(cascade, 'autoLoad', 'viewCascades')
    if ('dependencyType' in cascade && !['currentRow', 'selectedRows', 'allRows', 'pagedRows'].some(type => type === cascade['dependencyType'])) throw new Error('viewCascades.dependencyType 无效')
    if (!Array.isArray(cascade['filterBindings'])) throw new Error('viewCascades.filterBindings 必须是数组')
    for (const input of cascade['filterBindings']) {
      const binding = record(input, 'viewCascades.filterBindings')
      keys(binding, ['sourceField', 'targetField'], 'viewCascades.filterBindings')
      name(binding['sourceField'], 'viewCascades.sourceField')
      name(binding['targetField'], 'viewCascades.targetField')
    }
  }
}
