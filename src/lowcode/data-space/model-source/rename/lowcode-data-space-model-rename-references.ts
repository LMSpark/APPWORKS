/**
 * @module app:lowcode/data-space/model-source/rename/lowcode-data-space-model-rename-references
 * 职责：按正式注册名生成本空间定义的精确改名清单。
 * 边界：模型ID、来源、内部表键、常量和参数名不改；不透明引用不做文本替换。
 * AI用途：改名前预览、权限核对及逐项回读共用同一变更集合。
 */
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {DataRow, DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceFilterMigration} from '../lowcode-data-space-filter-migration'

/** 一项原记录字段的准确变更，不携带权限凭据。 */
export type ModelNameChange = Readonly<{
  /** 原元数据表。 */
  table: string
  /** 正式记录主键。 */
  id: string
  /** 待更新属性。 */
  property: string
  /** 可读原值。 */
  before: string
  /** 待提交值。 */
  after: string
}>

/** 结构化引用解析只在当前正式元数据范围内运行。 */
export class LowcodeDataSpaceModelRenameReferences {
  /** 返回Name及实际引用变更；previousName仅供回读，projected为同批已明确的字段改名候选，不持有运行草稿。 */
  static prepare(views: readonly DataView[], modelId: string, nextName: string, previousName?: string,projected:readonly ModelNameChange[]=[]): ModelNameChange[] {
    const [models, fields, relations] = views
    if (!models || !fields || !relations) throw new Error('改名所需正式视图不完整')
    const read = (view: DataView, row: DataRow, property: string): unknown => {
      if (!view.columns.some(column => column.name === property)) return undefined
      if (view.fieldAccess(row, property).read !== 'visible') throw new Error(`${view.tableName}.${property}不可读，不能核验引用`)
      return projected.find(change=>change.table===view.tableName&&change.id===row['rowid']&&change.property===property)?.after??row[property]
    }
    const target = models.rows.find(row => row['rowid'] === modelId)
    const currentName = target && read(models, target, 'Name'), oldName = previousName ?? currentName
    if (!target || typeof currentName !== 'string' || typeof oldName !== 'string' || !oldName) throw new Error('模型注册名不可读取')
    if (!nextName.trim() || nextName !== nextName.trim() || nextName.includes('@') || nextName.startsWith('#')) throw new Error('模型注册名不能为空、带首尾空白、包含 @ 或以 # 开头')
    const names = models.rows.map(row => read(models, row, 'Name'))
    if (names.some(name => typeof name !== 'string' || !name) || new Set(names).size !== names.length) throw new Error('模型注册名不唯一或不能完整核验')
    if (!previousName && oldName === nextName) throw new Error('模型注册名未改变')
    if (models.rows.some(row => row !== target && read(models, row, 'Name') === nextName)) throw new Error(`模型注册名“${nextName}”已存在`)
    const referenceModels = models.rows.map(row => previousName && row === target ? {...row, Name: previousName} : row)
    const changes: ModelNameChange[] = []
    const add = (view: DataView, row: DataRow, property: string, before: string, after: string): void => {
      if (before === after) return
      if (!previousName && (view.editActionState(row) !== 'enabled' || view.fieldAccess(row, property).write !== 'allowed')) throw new Error(`${view.tableName}(${String(row['rowid'])}).${property}当前不可写`)
      changes.push({table: view.tableName, id: String(row['rowid']), property, before, after})
    }
    add(models, target, 'Name', currentName, nextName)
    const opaque = (value: unknown, path: string): void => {
      if (value !== undefined && value !== null && value !== '' && (typeof value !== 'string' || value.includes(oldName))) {
        throw new Error(`${path}包含尚不能可靠改写的引用，请先核查；原文保留`)
      }
    }
    const reference = (value: unknown, owner: unknown, preserved: readonly unknown[]): string => {
      if (typeof value !== 'string' || !value) throw new Error('字段引用无法核验')
      // 含点的正式字段先按完整Name解析；数据库关系的来源限定名独立于注册名。
      const direct = fields.rows.some(row => read(fields, row, 'dataModelId') === owner && read(fields, row, 'Name') === value)
      const prefix = `${oldName}.`
      if (direct || preserved.includes(oldName) || !value.startsWith(prefix)) return value
      const candidates = referenceModels.filter(model => typeof model['Name'] === 'string' && value.startsWith(`${model['Name']}.`))
      const exact = candidates.filter(model => fields.rows.some(row => read(fields, row, 'dataModelId') === model['rowid']
        && [read(fields, row, 'Name'), read(fields, row, 'AsName')].includes(value.slice(String(model['Name']).length + 1))))
      if (exact.length > 1) throw new Error(`模型字段引用不唯一：${value}`)
      const qualifier = value.slice(0, value.lastIndexOf('.'))
      const resolved = exact[0]?.['Name'] ?? candidates.find(model => model['Name'] === qualifier)?.['Name']
      if (resolved === undefined) throw new Error(`模型字段引用无法核验：${value}`)
      return resolved === oldName ? `${nextName}.${value.slice(prefix.length)}` : value
    }
    const fn = (value: Record<string, unknown>, owner: unknown, preserved: readonly unknown[]): Record<string, unknown> => {
      const type = value['Type']
      if (['GetConstValue', 'GetInputParam', 'SystemData', 'GetUserMasterId'].includes(String(type))) return value
      if (type === 'GetTableField') return {...value, Field: reference(value['Field'], owner, preserved)}
      const key = type === 'GetRefData' ? 'RefTableName' : type === 'GetGroupData' ? 'GroupTableName' : undefined
      if (key) {
        const result = {...value}, referenced = referenceModels.find(model => model['Name'] === value[key])?.['rowid']
        if (value[key] === oldName && !preserved.includes(oldName)) result[key] = nextName
        for (const property of type === 'GetRefData' ? ['RefFieldName', 'FkFieldName'] : ['GroupField', 'Field']) {
          if (value[property] !== undefined && value[property] !== '') result[property] = reference(value[property], property === 'FkFieldName' ? owner : referenced, preserved)
        }
        return result
      }
      opaque(JSON.stringify(value), `值函数${String(type)}`)
      return value
    }
    const filter = (view: DataView, row: DataRow, property: string, owner: unknown, preserved: readonly unknown[] = []): void => {
      const before = read(view, row, property)
      if (before === undefined || before === null || before === '') return
      if (typeof before !== 'string') throw new Error(`${view.tableName}.${property}过滤原文无效`)
      const after = LowcodeDataSpaceFilterMigration.rewrite(before, value => reference(value, owner, preserved), value => fn(value, owner, preserved))
      add(view, row, property, before, after)
    }
    for (const row of models.rows) {
      for (const property of ['addApi', 'updateApi', 'deleteApi']) {
        const before = read(models, row, property)
        if (before === oldName) add(models, row, property, before, nextName)
      }
      filter(models, row, 'Filter', row['rowid'])
      filter(models, row, 'JoinFilter', row['rowid'], [read(models, row, 'MetaName')])
      opaque(read(models, row, 'RequestComplete'), `模型${String(row['rowid'])}.RequestComplete`)
    }
    for (const row of fields.rows) {
      const before = read(fields, row, 'ValueFun')
      if (before !== undefined && before !== null && before !== '') {
        if (typeof before !== 'string') throw new Error('字段ValueFun原文无效')
        DataSpaceDesignApi.parseValueFunction(before)
        const raw: unknown = JSON.parse(before)
        if (isRecord(raw)) {
          // 后端模型输出的GetRefData使用物理资源名；改注册名不能改写资源及其字段限定名。
          if (raw['Type'] === 'GetRefData' && read(fields, row, 'type') === 'dataModel') continue
          const after = fn(raw, read(fields, row, 'dataModelId'), [])
          if (JSON.stringify(after) !== JSON.stringify(raw)) {
            const text = JSON.stringify(after); DataSpaceDesignApi.parseValueFunction(text)
            add(fields, row, 'ValueFun', before, text)
          }
        }
      }
      // Expression 保存脱敏规则 ID，模型改名不能重写或据此阻断。
    }
    for (const row of relations.rows) filter(relations, row, 'filter', read(relations, row, 'childModId'),
      [read(relations, row, 'parentTable'), read(relations, row, 'childTable')])
    return changes
  }
}
