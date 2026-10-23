/**
 * @module app:lowcode/data-space/model-source/removal/lowcode-data-space-field-remove-references
 * 职责：按正式字段身份检查删除依赖或生成明确改名的结构化引用变更。
 * 边界：只返回定义差异，不执行函数或保存，不把常量文本当依赖。
 * AI用途：字段删除保护和数组表头同时改名复用同一引用解析。
 */
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import type {DataRow, DataView} from '@spark-appworks/spark-data'
import {LowcodeDataSpaceFilterMigration} from '../lowcode-data-space-filter-migration'

/** 字段结构变更的明确上下文；不会自动修改任何引用。 */
type FieldReferenceChange = {
  /** 删除或改名；省略时检查删除。 */
  operation?:'remove'|'rename'
  /** 结构命令已校验最终模型并在同一批次提交的主键声明；普通字段删除不得提供。 */
  primaryKeyReplacement?:string
  /** 当前字段工作区；校验最终编辑值及待新增记录，不复制或提交。 */
  fieldView?:DataView
}

/** 原数据库定义的一项结构化引用变更，由原DataView核权和提交。 */
export type FieldReferenceUpdate = {
  /** 元数据表名称。 */
  table:string
  /** 原记录主键。 */
  id:string
  /** 修改的定义属性。 */
  property:string
  /** 原文本。 */
  before:string
  /** 仅改写明确引用后的文本。 */
  after:string
}

/** 同一模型内按稳定字段身份指定的新名称。 */
export type FieldRename = {
  /** 原正式字段rowid。 */
  id:string
  /** 最终正式字段名称。 */
  name:string
}

export type FieldRemoveReferencesPrepareRenamesInput = Readonly<{
  views: ReadonlyArray<DataView | undefined>
  modelId: string
  mappings: readonly FieldRename[]
  primaryReplacement: string
}>

type FieldRemoveReferencesInspectInput = Readonly<{
  views: ReadonlyArray<DataView | undefined>
  field: DataRow
  change?: FieldReferenceChange
  renames?: ReadonlyMap<string, string>
}>

/** 只检查当前空间可读定义；不透明或歧义引用必须先处理。 */
export class LowcodeDataSpaceFieldRemoveReferences {
  /** 核对模型过滤、树字段、值函数及关系；rename同时检查自身取值。dataModel输出GetRefData引用物理表列，元字段删除/改名保留其原文；种类不可读拒绝推断。 */
  static validate(views: ReadonlyArray<DataView | undefined>, field: DataRow, change: FieldReferenceChange = {}): void {
    this.inspect({views, field, change})
  }

  /** 同时解析所有字段改名；名称交换不会串行替换，未变属性及常量原样保留。 */
  static prepareRenames(input: FieldRemoveReferencesPrepareRenamesInput): FieldReferenceUpdate[] {
    const {views, modelId, mappings, primaryReplacement} = input
    if (!mappings.length) return []
    const view = views[1], fields = view?.rows.filter(row => row['dataModelId'] === modelId && row['type'] === 'dataModel') ?? []
    const first = fields.find(row => row['rowid'] === mappings[0]?.id)
    if (!first || new Set(mappings.map(item => item.id)).size !== mappings.length || mappings.some(item => !item.name || fields.filter(row => row['rowid'] === item.id).length !== 1)) throw new Error('字段改名身份或名称无效')
    const names = fields.map(row => mappings.find(item => item.id === row['rowid'])?.name ?? row['Name'])
    if (new Set(names).size !== names.length) throw new Error('改名后的正式字段名称不唯一')
    return this.inspect({views, field: first, change: {operation: 'rename', primaryKeyReplacement: primaryReplacement}, renames: new Map(mappings.map(item => [item.id, item.name]))})
  }

  private static inspect(input: FieldRemoveReferencesInspectInput): FieldReferenceUpdate[] {
    const {views, field, change = {}, renames = new Map<string, string>()} = input
    const {operation = 'remove', primaryKeyReplacement} = change
    const [models, fields, relations] = views
    if (!models || !fields || !relations) throw new Error('缺少字段依赖视图')
    const local = change.fieldView
    const fieldRows = [...fields.rows, ...local?.rows.filter(candidate => !fields.rows.some(item => item['rowid'] === candidate['rowid'])) ?? []]
    const read = (view: DataView, row: DataRow, key: string): unknown => {
      if (!view.columns.some(column => column.name === key)) return undefined
      const source = view === fields ? change.fieldView : undefined, original = source?.rows.find(item => item['rowid'] === row['rowid'])
      if (source && original) {
        if (source.fieldAccess(original, key).read !== 'visible') throw new Error(`${view.tableName}.${key}不可读，无法核验字段依赖`)
        return (source.getEditingRow(String(row['rowid'])) ?? original)[key]
      }
      if (view.fieldAccess(row, key).read !== 'visible') throw new Error(`${view.tableName}.${key}不可读，无法核验字段依赖`)
      return row[key]
    }
    const modelId = field['dataModelId'], model = models.rows.find(row => row['rowid'] === modelId)
    const modelName = model && read(models, model, 'Name')
    if (typeof modelId !== 'string' || typeof modelName !== 'string' || !modelName
      || models.rows.filter(row => read(models, row, 'Name') === modelName).length !== 1) throw new Error('字段所属模型注册名不唯一')
    const updates: FieldReferenceUpdate[] = []
    const add = (entry: Readonly<{view: DataView; row: DataRow; property: string; before: string; after: string}>): void => {
      if (entry.before !== entry.after) updates.push({table: entry.view.tableName, id: String(entry.row['rowid']), property: entry.property, before: entry.before, after: entry.after})
    }
    const used = (path: string): never => {throw new Error(`字段仍有配置依赖，请先处理：${path}`)}
    type Qualifier = {name: unknown; id: unknown}
    const reference = (entry: Readonly<{value: unknown; owner: unknown; path: string; qualifiers?: readonly Qualifier[]}>): string => {
      const {value, owner, path, qualifiers = []} = entry
      if (typeof value !== 'string' || !value) throw new Error(`${path}字段引用无法核验`)
      const candidates = fieldRows.filter(row => read(fields, row, 'type') === 'dataModel'
        && read(fields, row, 'dataModelId') === owner && read(fields, row, 'Name') === value)
      const direct=candidates.length>0
      if (!direct) for (const source of [...models.rows.map(row=>({name:read(models,row,'Name'),id:row['rowid']})),...qualifiers]) {
        const name = source.name
        if (typeof name !== 'string' || !value.startsWith(`${name}.`)) continue
        candidates.push(...fieldRows.filter(row => read(fields, row, 'type') === 'dataModel' && read(fields, row, 'dataModelId') === source.id
          && read(fields, row, 'Name') === value.slice(name.length + 1)))
      }
      const unique=[...new Map(candidates.map(row=>[row['rowid'],row])).values()],resolved=unique[0]
      if (unique.length !== 1||!resolved) throw new Error(`${path}字段引用无法核验：未找到唯一的正式字段`)
      if(renames.size) {
        const next=renames.get(String(resolved['rowid']))
        return next===undefined?value:direct?next:`${value.slice(0,value.length-String(resolved['Name']).length)}${next}`
      }
      if (resolved['rowid'] === field['rowid']) used(path)
      return value
    }
    const fn = (entry: Readonly<{value: Record<string, unknown>; owner: unknown; path: string; qualifiers?: readonly Qualifier[]}>): Record<string, unknown> => {
      const {value, owner, path, qualifiers = []} = entry
      const type = value['Type']
      if (type === 'GetConstValue' || type === 'GetInputParam' || type === 'SystemData' || type === 'GetUserMasterId') return value
      if (type === 'GetTableField') return {...value, Field: reference({value: value['Field'], owner, path: `${path}.Field`, qualifiers})}
      if (type === 'GetRefData' || type === 'GetGroupData') {
        const table = value[type === 'GetRefData' ? 'RefTableName' : 'GroupTableName']
        const owners = models.rows.filter(row => read(models, row, 'Name') === table)
        if (typeof table !== 'string' || !table || owners.length !== 1) throw new Error(`${path}引用模型无法唯一确认`)
        const next = {...value}
        for (const key of type === 'GetRefData' ? ['RefFieldName', 'FkFieldName'] : ['GroupField', 'Field']) {
          next[key] = reference({value: value[key], owner: owners[0]?.['rowid'], path: `${path}.${key}`, qualifiers})
        }
        return next
      }
      throw new Error(`${path}值函数${String(type)}的字段引用不能完整核验，请先处理`)
    }
    const filter = (entry: Readonly<{view: DataView; row: DataRow; property: string; context: Readonly<{child: unknown; parent: unknown; path: string; qualifiers?: readonly Qualifier[]}>}>): void => {
      const {view, row, property, context} = entry
      const {child, parent, path} = context
      const value = read(view, row, property)
      if (value === undefined || value === null || value === '') return
      if (typeof value !== 'string') throw new Error(`${path}过滤原文无法核验`)
      add({view, row, property, before: value, after: LowcodeDataSpaceFilterMigration.rewrite(value,
        name => reference({value: name, owner: child, path: `${path}.Field`, ...(context.qualifiers ? {qualifiers: context.qualifiers} : {})}),
        valueFunction => fn({value: valueFunction, owner: parent, path: `${path}.ValueFun`, ...(context.qualifiers ? {qualifiers: context.qualifiers} : {})}))})
    }
    for (const row of models.rows) {
      const path = `Base_DataModel(${String(row['rowid'])})`
      for (const key of ['parentField', 'hasChildField', 'PrimaryKeyFields']) {
        const value = read(models, row, key)
        if (key === 'PrimaryKeyFields' && row['rowid'] === modelId && primaryKeyReplacement !== undefined) continue
        const names = typeof value === 'string' ? key === 'PrimaryKeyFields' ? value.split(',').map(name => name.trim()) : [value] : []
        if(renames.size&&row['rowid']===modelId&&typeof value==='string') {
          const mapped=names.map(name=>{const matches=fields.rows.filter(item=>item['dataModelId']===modelId&&item['type']==='dataModel'&&read(fields,item,'Name')===name)
            return matches.length===1?renames.get(String(matches[0]?.['rowid']))??name:name})
          add({view: models, row, property: key, before: value, after: mapped.join(key === 'PrimaryKeyFields' ? ',' : '')}); continue
        }
        if (row['rowid'] === modelId && names.some(name => name !== ''
          && (operation === 'rename' ? [field['Name']] : [field['Name'], field['AsName']]).includes(name))) used(`${path}.${key}`)
      }
      filter({view: models, row, property: 'Filter', context: {child: row['rowid'], parent: row['rowid'], path: `${path}.Filter`}})
      filter({view: models, row, property: 'JoinFilter', context: {child: row['rowid'], parent: read(models, row, 'PId'), path: `${path}.JoinFilter`}})
      const foreignKeys = read(models, row, 'ForeignKeyFields')
      if (foreignKeys !== undefined && foreignKeys !== null && foreignKeys !== '') throw new Error(`${path}.ForeignKeyFields的引用语义无法核验，请先处理`)
      const complete = read(models, row, 'RequestComplete')
      if (complete !== undefined && complete !== null && complete !== '') throw new Error(`${path}.RequestComplete包含不透明配置，请先核查`)
    }
    for (const row of fieldRows) {
      if (local?.dirtyTracking.pendingDeleteIds.has(String(row['rowid']))) continue
      if (row['rowid'] === field['rowid'] && operation === 'remove') continue
      const path = `Base_DataModel_Field(${String(row['rowid'])})`, owner = read(fields, row, 'dataModelId')
      const raw = read(fields, row, 'ValueFun')
      if (raw !== undefined && raw !== null && raw !== '') {
        if (typeof raw !== 'string') throw new Error(`${path}.ValueFun无法核验`)
        const value = DataSpaceDesignApi.parseValueFunction(raw)
        if (!value) throw new Error(`${path}.ValueFun无法核验`)
        // 此处改变的是元字段定义，不改变GetRefData所指物理资源及其字段。
        if (value.Type === 'GetRefData' && read(fields, row, 'type') === 'dataModel') continue
        const next = fn({value: {...value}, owner, path: `${path}.ValueFun`})
        if (JSON.stringify(next) !== JSON.stringify(value)) add({view: fields, row, property: 'ValueFun', before: raw, after: JSON.stringify(next)})
      }
      // Expression 是脱敏规则 ID；同名规则不构成对被删/改名字段的引用。
    }
    for (const row of relations.rows) {
      filter({
        view: relations, row, property: 'filter', context: {
          child: read(relations, row, 'childModId'), parent: read(relations, row, 'parentModId'),
          path: `Base_DataModel_Relation(${String(row['rowid'])}).filter`, qualifiers: [
            {name: read(relations, row, 'parentTable'), id: read(relations, row, 'parentModId')},
            {name: read(relations, row, 'childTable'), id: read(relations, row, 'childModId')},
          ],
        },
      })
    }
    return updates
  }
}
