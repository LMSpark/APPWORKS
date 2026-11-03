/**
 * @module app:lowcode/data-space/model-source/rename/lowcode-data-space-model-rename-references
 * 职责：按正式注册名生成本空间定义的精确改名清单。
 * 边界：模型ID、来源、内部表键、常量和参数名不改；不透明引用不做文本替换。
 * AI用途：改名前预览、权限核对及逐项回读共用同一变更集合。
 */
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {DataRow, DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceFilterMigration} from '../migration/lowcode-data-space-filter-migration'
import {LowcodeDataSpaceModelNameProjection} from './lowcode-data-space-model-name-projection'

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

export type ModelRenameReferencesPrepareInput = Readonly<{
  views: readonly DataView[]
  modelId: string
  nextName: string
  previousName?: string
  projected?: readonly ModelNameChange[]
}>

/** 结构化引用解析只在当前正式元数据范围内运行。 */
export class LowcodeDataSpaceModelRenameReferences {
  /** 返回Name及实际引用变更；previousName仅供回读，projected为同批已明确的字段改名候选，不持有运行草稿。 */
  static prepare(input: ModelRenameReferencesPrepareInput): ModelNameChange[] {
    const {views, modelId, nextName, previousName, projected = []} = input
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
    const add = (entry: Readonly<{view: DataView; row: DataRow; property: string; before: string; after: string}>): void => {
      if (entry.before === entry.after) return
      if (!previousName && (entry.view.editActionState(entry.row) !== 'enabled' || entry.view.fieldAccess(entry.row, entry.property).write !== 'allowed')) {
        throw new Error(`${entry.view.tableName}(${String(entry.row['rowid'])}).${entry.property}当前不可写`)
      }
      changes.push({table: entry.view.tableName, id: String(entry.row['rowid']), property: entry.property, before: entry.before, after: entry.after})
    }
    add({view: models, row: target, property: 'Name', before: currentName, after: nextName})
    const projection = new LowcodeDataSpaceModelNameProjection({previousName: oldName, nextName,
      models: referenceModels.map(model => ({rowid: model['rowid'], Name: model['Name']})),
      fields: fields.rows.map(row => ({get dataModelId(){return read(fields,row,'dataModelId')}, get Name(){return read(fields,row,'Name')}, get AsName(){return read(fields,row,'AsName')}}))})
    const opaque = (value: unknown, path: string): void => projection.assertOpaque(value, path)
    const reference = (value: unknown, owner: unknown, preserved: readonly unknown[]): string => projection.field(value, owner, preserved)
    const fn = (value: Record<string, unknown>, owner: unknown, preserved: readonly unknown[]): Record<string, unknown> => projection.value(value, owner, preserved)
    const filter = (entry: Readonly<{view: DataView; row: DataRow; property: string; owner: unknown; preserved?: readonly unknown[]}>): void => {
      const {view, row, property, owner, preserved = []} = entry
      const before = read(view, row, property)
      if (before === undefined || before === null || before === '') return
      if (typeof before !== 'string') throw new Error(`${view.tableName}.${property}过滤原文无效`)
      const after = LowcodeDataSpaceFilterMigration.rewrite(before, value => reference(value, owner, preserved), value => fn(value, owner, preserved))
      add({view, row, property, before, after})
    }
    for (const row of models.rows) {
      for (const property of ['addApi', 'updateApi', 'deleteApi']) {
        const before = read(models, row, property)
        if (before === oldName) add({view: models, row, property, before, after: nextName})
      }
      filter({view: models, row, property: 'Filter', owner: row['rowid']})
      filter({view: models, row, property: 'JoinFilter', owner: row['rowid'], preserved: [read(models, row, 'MetaName')]})
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
            add({view: fields, row, property: 'ValueFun', before, after: text})
          }
        }
      }
      // Expression 保存脱敏规则 ID，模型改名不能重写或据此阻断。
    }
    for (const row of relations.rows) filter({
      view: relations, row, property: 'filter', owner: read(relations, row, 'childModId'),
      preserved: [read(relations, row, 'parentTable'), read(relations, row, 'childTable')],
    })
    return changes
  }
}
