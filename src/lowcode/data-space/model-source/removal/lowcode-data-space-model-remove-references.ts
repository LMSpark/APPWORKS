/**
 * @module app:lowcode/data-space/model-source/removal/lowcode-data-space-model-remove-references
 * 职责：阻止删除仍被本空间结构化配置引用的模型。
 * 边界：不改写引用，不把常量文本解释为引用；不透明表达式明确要求先处理。
 * AI用途：删除前检查正式模型、字段和存活关系的调用依赖。
 */
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {DataRow, DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceFilterMigration} from '../migration/lowcode-data-space-filter-migration'

/** 只消费当前元数据视图的可读定义，不建立引用或权限缓存。 */
export class LowcodeDataSpaceModelRemoveReferences {
  /** 检查注册模型引用；dataModel输出GetRefData引用物理资源，不随元模型删除。字段种类须可读，其他未知语义阻止自动删除，原定义不改动。 */
  static validate(views: readonly DataView[], modelId: string, modelName: string): void {
    const [models, fields, relations] = views
    if (!models || !fields || !relations) throw new Error('缺少删除引用检查视图')
    const read = (view: DataView, row: DataRow, key: string): unknown => {
      if (!view.columns.some(column => column.name === key)) return undefined
      if (view.fieldAccess(row, key).read !== 'visible') throw new Error(`${view.tableName}.${key}不可读，无法检查删除依赖`)
      return row[key]
    }
    const used = (path: string): never => {throw new Error(`模型仍有配置依赖，请先处理：${path}`)}
    const reference = (value: unknown, owner: unknown, path: string): string => {
      if (typeof value !== 'string' || !value) throw new Error(`${path}字段引用无法核验`)
      const direct = fields.rows.some(row => row['dataModelId'] === owner && read(fields, row, 'Name') === value)
      if (!direct && value.startsWith(`${modelName}.`)) used(path)
      return value
    }
    const fn = (value: Record<string, unknown>, owner: unknown, path: string): Record<string, unknown> => {
      const type = value['Type']
      if (['GetConstValue', 'GetInputParam', 'SystemData'].includes(String(type))) return value
      if (type === 'GetTableField') {reference(value['Field'], owner, path); return value}
      const tableKey = type === 'GetRefData' ? 'RefTableName' : type === 'GetGroupData' ? 'GroupTableName' : type === 'GetExpData' ? 'refTableName' : undefined
      if (!tableKey) throw new Error(`${path}值函数${String(type)}的引用范围尚不能核验`)
      if (value[tableKey] === modelName) used(path)
      if (type === 'GetExpData') throw new Error(`${path}包含不透明表达式，请先核查并处理`)
      return value
    }
    const filter = (value: unknown, owner: unknown, path: string): void => {
      if (value === undefined || value === null || value === '') return
      if (typeof value !== 'string') throw new Error(`${path}过滤原文无法核验`)
      LowcodeDataSpaceFilterMigration.rewrite(value, field => reference(field, owner, path), valueFunction => fn(valueFunction, owner, path))
    }
    for (const row of models.rows) {
      if (row['rowid'] === modelId) continue
      const path = `Base_DataModel(${String(row['rowid'])})`
      if (read(models, row, 'Name') === modelName) throw new Error('模型注册名不唯一，不能删除')
      for (const key of ['addApi', 'updateApi', 'deleteApi']) if (read(models, row, key) === modelName) used(`${path}.${key}`)
      if (read(models, row, 'PId') === modelId) used(`${path}.PId`)
      filter(read(models, row, 'Filter'), row['rowid'], `${path}.Filter`)
      filter(read(models, row, 'JoinFilter'), row['rowid'], `${path}.JoinFilter`)
      const complete = read(models, row, 'RequestComplete')
      if (complete !== undefined && complete !== null && complete !== '') throw new Error(`${path}.RequestComplete包含不透明配置，请先核查并处理`)
    }
    for (const row of fields.rows) {
      if (row['dataModelId'] === modelId) continue
      const path = `Base_DataModel_Field(${String(row['rowid'])})`
      const raw = read(fields, row, 'ValueFun')
      if (raw !== undefined && raw !== null && raw !== '') {
        if (typeof raw !== 'string') throw new Error(`${path}.ValueFun无法核验`)
        const parsed = DataSpaceDesignApi.parseValueFunction(raw)
        // 删除模型定义不删除物理表；资源名与注册名碰撞不构成元模型依赖。
        if (parsed?.Type === 'GetRefData' && read(fields, row, 'type') === 'dataModel') continue
        if (parsed) fn(parsed, row['dataModelId'], `${path}.ValueFun`)
      }
      // Expression 是脱敏规则 ID，不参与模型/字段引用检查。
    }
    for (const row of relations.rows) {
      if (row['parentModId'] === modelId || row['childModId'] === modelId) continue
      filter(read(relations, row, 'filter'), row['childModId'], `Base_DataModel_Relation(${String(row['rowid'])}).filter`)
    }
  }
}
