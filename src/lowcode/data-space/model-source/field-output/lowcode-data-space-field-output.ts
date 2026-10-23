/**
 * @module app:lowcode/data-space/model-source/field-output/lowcode-data-space-field-output
 * 职责：检查正式模型列与输出变更对当前空间配置的影响。
 * 边界：不保存、不迁移引用；数据库字段名与前端输出名分别检查。
 * AI用途：字段提交前定位阻断引用，避免将别名误当来源字段重命名。
 */
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {DataViewFilter, RequestState, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import type {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceFieldRemoveReferences,type FieldReferenceUpdate} from '../removal/lowcode-data-space-field-remove-references'
import {LowcodeDataSpaceFieldValue} from '../field-value/lowcode-data-space-field-value'

/** 正式读取的模型定义，包含来源主键及完整字段输出合同。 */
type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>

/** 同批模型声明；省略仍按原正式主键保护，不能单独改变字段标记。 */
export type FieldOutputValidateInput = Readonly<{
  model: FormalModel
  original: DataRow
  patch: Readonly<Record<string, unknown>>
  primaryKeyName?: string
  operation?: 'update' | 'remove'
  /** 实际读取的模型、字段、旧关系视图；不隐式要求全目录预载。 */
  definitionViews?: ReadonlyArray<DataView | undefined>
  /** 本次字段编辑的正式查询视图，用于对照原始定义及同批草稿。 */
  fieldView?: DataView
  changes?: ReadonlyArray<{original: DataRow; patch: Readonly<Record<string, unknown>>}>
  config: ScenarioViewConfig | null
  metadata: DataSet
  targetId: string
}>

/** 已完成范围与权限检查的命令视图，顺序为模型、字段、旧关系。 */
export type FieldOutputValidateReferencesInput = Readonly<{
  model: FormalModel
  original: DataRow
  patch: Readonly<Record<string, unknown>>
  operation?: 'update' | 'remove'
  config: ScenarioViewConfig | null
  metadata: DataSet
  targetId: string
  definitionViews?: ReadonlyArray<DataView | undefined>
  /** 同一正式批次已解析的引用变更，仅用于确认对应数据库依赖已一起处理。 */
  definitionChanges?: readonly FieldReferenceUpdate[]
}>

/** 单次检查，不持有另一份元数据或权限。 */
export class LowcodeDataSpaceFieldOutput {
  /** 新增与旧字段修改共用最终模型投影；新增没有正式行修改权限，不能伪装成已有字段。 */
  static validateAdditions(input: Readonly<{model: FormalModel; changes: ReadonlyArray<{original: DataRow; patch: Readonly<Record<string, unknown>>; creating?: boolean}>;
    config: ScenarioViewConfig | null; metadata: DataSet; targetId: string; fieldView?: DataView}>): void {
    const {model, changes, config, metadata, targetId} = input
    const directory = input.fieldView ?? metadata.getView('Base_DataModel_Field', 'default')
    if (!directory) throw new Error('缺少正式字段目录')
    const originals = [...directory.rows, ...[...directory.dirtyTracking.pendingDeleteIds].flatMap(id => {const row = directory.dirtyTracking.getPendingDeleteSnapshot(id); return row ? [row] : []})].filter(row => row['dataModelId'] === model.id && row['type'] === 'dataModel'
      && !changes.some(change => change.creating && change.original['rowid'] === row['rowid']))
    if (originals.length !== model.fields.length || originals.some(row => {
      const formal = model.fields.filter(field => field.id === row['rowid'])
      const before = changes.find(change => change.original['rowid'] === row['rowid'])?.original ?? row
      return formal.length !== 1 || ['Name', 'AsName', 'IsOutput', 'FieldType', 'IsPKey', 'ValueFun'].some(key =>
        directory.fieldAccess(row, key).read !== 'visible' || formal[0]?.raw[key] !== before[key])
    })) throw new Error('正式字段定义已变化，请重新核验')
    const additions = changes.filter(change => change.creating).map(({original, patch}) => ({...original, ...patch}))
    for (const row of additions) {
      if (row['dataSetId'] !== targetId || row['dataModelId'] !== model.id || row['type'] !== 'dataModel'
        || row['FieldType'] !== '计算字段' || row['IsPKey'] !== 0 || ![0, 1].includes(Number(row['IsOutput']))
        || typeof row['IsOutput'] !== 'number' || typeof row['rowid'] !== 'string' || model.fields.some(field => field.id === row['rowid'])) throw new Error('新增计算字段定义无效')
      for (const key of ['Name', 'AsName']) if (typeof row[key] !== 'string' || key === 'Name' && !row[key].trim() || row[key] !== row[key].trim()
        || row[key] === '_pk' || row[key].length > 100 || /[\u0000-\u001f\u007f]/.test(row[key])) throw new Error('新增字段名称和规范别名无效')
      if (typeof row['description'] !== 'string' || row['description'].length > 200) throw new Error('新增字段描述无效')
      new LowcodeDataSpaceFieldValue({dataSet: metadata, targetId, modelId: model.id, viewId: 'modelFields'}).validate(row['ValueFun'])
    }
    const rows = [...model.fields.filter(field => !directory.dirtyTracking.pendingDeleteIds.has(field.id)).map(field => ({...field.raw, ...changes.find(change => !change.creating && change.original['rowid'] === field.id)?.patch})), ...additions]
    if (new Set(rows.map(row => row['Name'])).size !== rows.length) throw new Error('字段名称已存在')
    const sourceKey = DataSpaceDesignApi.resolveTableResource(model).resourceType === 'database-table' ? model.fields.find(field => field.primaryKey)?.name ?? '' : ''
    const candidate = DataSpaceDesignApi.projectModel(model.raw, rows, sourceKey)
    DataSpaceDesignApi.resolveFields(candidate)
    const tables = config?.toJSON()['tables']
    if (isRecord(tables)) for (const table of Object.values(tables)) {
      if (!isRecord(table) || !isRecord(table['modelBinding']) || table['modelBinding']['modelId'] !== model.id || !Array.isArray(table['columns'])) continue
      if (table['columns'].some(column => isRecord(column) && Object.hasOwn(column, 'computeExpression')
        && candidate.fields.some(field => field.canonicalName === column['name']))) throw new Error('模型列名称与本地计算字段冲突')
    }
  }

  /** 按同批最终配置校验完整列唯一性，逐个原字段检查引用；operation省略时按修改检查，remove也覆盖未输出的来源字段。 */
  static validate(input: FieldOutputValidateInput): void {
    const {model, original, patch, config, metadata, targetId} = input
    const matches = model.fields.filter(field => field.id === original['rowid']), field = matches[0]
    const alias = (value: unknown, fallback: string): string => typeof value === 'string' && value.trim() ? value.trim() : fallback
    if (!field || matches.length !== 1 || field.modelId !== original['dataModelId'] || field.name !== original['Name']
      || field.canonicalName !== alias(original['AsName'], field.name) || field.output !== (Number(original['IsOutput']) === 1)) {
      throw new Error('字段正式输出已变化，请重新核验')
    }
    const removing = input.operation === 'remove'
    const renaming = Object.hasOwn(patch, 'Name')
    if (renaming && (field.raw['FieldType'] !== '计算字段' || field.raw['FieldType'] !== original['FieldType'] || field.primaryKey)) {
      throw new Error('只有非主键计算字段可以修改正式名称')
    }
    if (renaming) {
      const view = input.fieldView ?? metadata.getView('Base_DataModel_Field')
      if (!view) throw new Error('缺少计算字段改名依赖视图')
      const rows = [...view.rows, ...[...view.dirtyTracking.pendingDeleteIds].flatMap(id => {const row = view.dirtyTracking.getPendingDeleteSnapshot(id); return row ? [row] : []})].filter(row => row['dataModelId'] === model.id && row['type'] === 'dataModel'
        && !view.dirtyTracking.isPendingCreate(String(view.getPkKey(row))))
      const keys = ['Name', 'AsName', 'FieldType', 'ValueFun', 'Expression', 'IsOutput', 'IsPKey']
      if (rows.length !== model.fields.length || rows.some(row => {
        const before = (input.changes ?? [{original, patch}]).find(change => change.original['rowid'] === row['rowid'])?.original ?? row
        const formal = model.fields.filter(item => item.id === row['rowid'])
        return formal.length !== 1 || keys.some(key => view.fieldAccess(row, key).read !== 'visible'
          || formal[0]?.raw[key] !== before[key])
      })) throw new Error('计算字段改名的正式字段定义已变化或不可读，请重新核验')
    }
    const changingType = Object.hasOwn(patch, 'FieldType')
    const primary = input.primaryKeyName === undefined ? field.primaryKey : field.name === input.primaryKeyName
    if (changingType && field.raw['FieldType'] !== original['FieldType']) throw new Error('字段正式类型已变化，请重新核验')
    if (changingType && primary) throw new Error('正式主键类型需要独立维护，不能通过普通字段配置修改')
    const output = removing ? false : Object.hasOwn(patch, 'IsOutput') ? patch['IsOutput'] === 1 : field.output
    const nextFieldName = typeof patch['Name'] === 'string' ? patch['Name'] : field.name
    const name = Object.hasOwn(patch, 'AsName') ? alias(patch['AsName'], nextFieldName)
      : renaming ? alias(original['AsName'], nextFieldName) : field.canonicalName
    if (name === '_pk') throw new Error('模型列名称不能使用原生保留字段_pk')
    if (primary && !output) throw new Error('正式主键必须保留输出')
    const declaredKey = Object.entries(model.raw).find(([key]) => key.toLowerCase() === 'primarykeyfields')?.[1]
    if (primary && field.canonicalName !== name && typeof declaredKey === 'string' && declaredKey.trim() === field.canonicalName && field.name !== field.canonicalName) {
      throw new Error('主键声明使用当前输出名，请先维护正式主键声明')
    }
    const candidate = {...model, fields: model.fields.filter(item => !removing || item.id !== field.id).map(item => {
      const change = (input.changes ?? [{original, patch}]).find(entry => entry.original['rowid'] === item.id)?.patch
      const primaryKey = input.primaryKeyName === undefined ? item.primaryKey : item.name === input.primaryKeyName
      if (!change) return {...item, primaryKey}
      const nextName = typeof change['Name'] === 'string' ? change['Name'] : item.name
      return {...item, primaryKey, name: nextName, output: Object.hasOwn(change, 'IsOutput') ? change['IsOutput'] === 1 : item.output,
        canonicalName: Object.hasOwn(change, 'AsName') ? alias(change['AsName'], nextName)
          : Object.hasOwn(change, 'Name') ? alias(item.raw['AsName'], nextName) : item.canonicalName}
    })}
    if (renaming && candidate.fields.some(item => item.id !== field.id && item.name === nextFieldName)) throw new Error('字段名称已存在')
    DataSpaceDesignApi.resolveFields(candidate)
    if (candidate.fields.some(key => key.primaryKey && candidate.fields.some(item => item.id !== key.id && item.canonicalName === key.canonicalName))) {
      throw new Error('输出名称与正式主键字段冲突')
    }
    if (renaming) LowcodeDataSpaceFieldRemoveReferences.validate(input.definitionViews ?? ['Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation'].map(table => metadata.getView(table)), original, {operation: 'rename'})
    this.validateReferences({model, original, patch, operation: input.operation ?? 'update', config, metadata, targetId,
      ...(input.definitionViews ? {definitionViews: input.definitionViews} : {})})
  }

  /** 分别核对模型列与输出引用；结构批次须先自行校验最终字段集合、主键和名称，不能以此替代定义校验。 */
  static validateReferences(input: FieldOutputValidateReferencesInput): void {
    const {model, original, patch, config, metadata, targetId} = input
    const field = model.fields.find(item => item.id === original['rowid'])
    if (!field) throw new Error('字段正式身份无法确认')
    const removing = input.operation === 'remove', changingType = Object.hasOwn(patch, 'FieldType')
    const output = removing ? false : Object.hasOwn(patch, 'IsOutput') ? patch['IsOutput'] === 1 : field.output
    const alias = Object.hasOwn(patch, 'AsName') ? patch['AsName'] : original['AsName']
    const name = typeof alias === 'string' && alias.trim() ? alias.trim() : typeof patch['Name'] === 'string' ? patch['Name'] : field.name
    const columnRemoved = removing || name !== field.canonicalName
    const removed = columnRemoved || field.output && !output
    const issues: string[] = []
    if (removed && model.raw['hasChildField'] === field.canonicalName&&!input.definitionChanges?.some(change=>change.table==='Base_DataModel'&&change.id===model.id&&change.property==='hasChildField'&&change.before===field.canonicalName&&change.after===name)) issues.push('Base_DataModel.hasChildField')
    const configuration = config?.toJSON(), tables = configuration?.['tables']
    const bound = new Set<string>()
    if (isRecord(tables)) for (const [tableName, table] of Object.entries(tables)) {
      if (isRecord(table) && isRecord(table['modelBinding']) && table['modelBinding']['modelId'] === model.id) bound.add(tableName)
    }
    // 行表达式只读本模型；跨模型计算沿直接父子关系聚合，不依赖空间内所有模型。
    const computedOwners = new Set(bound)
    if (Array.isArray(configuration?.['resourceRelations'])) for (const relation of configuration['resourceRelations']) {
      if (isRecord(relation) && typeof relation['childTable'] === 'string' && bound.has(relation['childTable'])
        && typeof relation['parentTable'] === 'string') computedOwners.add(relation['parentTable'])
    }
    const reference = (value: unknown, table: unknown, context: Readonly<{path: string; names?: ReadonlySet<string>; old?: string}>): void => {
      const {path, names = bound, old = field.canonicalName} = context
      if (typeof value !== 'string') return
      if (typeof table === 'string' && names.has(table) && value === old) {issues.push(path); return}
      const separator = value.lastIndexOf('.')
      const owner = separator < 0 ? table : value.slice(0, separator)
      const column = separator < 0 ? value : value.slice(separator + 1)
      if (typeof owner === 'string' && names.has(owner) && column === old) issues.push(path)
    }
    const filter = (value: unknown, context: Readonly<{child: unknown; parent: unknown; path: string; names?: ReadonlySet<string>; old?: string}>): void => {
      const {child, parent, path, names = bound, old = field.canonicalName} = context
      if (value === undefined || value === null || value === '') return
      const parsed = DataViewFilter.parse(value)
      if (!parsed.ok) {issues.push(`${path} 无法解析`); return}
      const walk = (node: ReturnType<DataViewFilter['toJSON']>, location: string): void => {
        if ('logic' in node) {node.filters.forEach((item, index) => walk(item, `${location}.filters[${index}]`)); return}
        reference(node.field, child, {path: `${location}.field`, names, old})
        const source = node.value
        if (!isRecord(source)) return
        if (source['Type'] === 'GetTableField') reference(source['Field'], parent, {path: `${location}.value.Field`, names, old})
        if (source['Type'] === 'GetRefData') for (const key of ['RefFieldName', 'FkFieldName']) reference(source[key], source['RefTableName'], {path: `${location}.value.${key}`, names, old})
        if (source['Type'] === 'GetGroupData') for (const key of ['GroupField', 'Field']) reference(source[key], source['GroupTableName'], {path: `${location}.value.${key}`, names, old})
        if (source['Type'] === 'GetExpData' && typeof source['refTableName'] === 'string' && names.has(source['refTableName'])) {
          issues.push(`${location}.value 包含待人工检查的表达式`)
        }
      }
      walk(parsed.value.toJSON(), path)
    }
    if (isRecord(tables)) for (const [tableName, table] of Object.entries(tables)) {
      if (!isRecord(table)) continue
      if (changingType && bound.has(tableName) && isRecord(table['views'])) {
        for (const [viewId, view] of Object.entries(table['views'])) {
          if (!isRecord(view) || !Array.isArray(view['fieldProjection'])) continue
          view['fieldProjection'].forEach((column, index) => {
            if (isRecord(column) && column['fieldId'] === field.id && column['type'] !== patch['FieldType']) {
              issues.push(`tables.${tableName}.views.${viewId}.fieldProjection[${index}].type`)
            }
          })
        }
      }
      if (Array.isArray(table['columns'])) for (const [index, column] of table['columns'].entries()) {
        if (!isRecord(column)) continue
        const path = `tables.${tableName}.columns[${index}]`
        if (!removing && bound.has(tableName) && column['name'] === name && Object.hasOwn(column, 'computeExpression')) issues.push(`${path} 与本地计算列重名`)
        if (!removed) continue
        reference(column['name'], tableName, {path: `${path}.name`})
        const expression = column['computeExpression']
        // 旧格式还可继承未加载的数据库关系；含 $ 的表达式保守保留聚合依赖核查，不补查全目录。
        if (typeof expression === 'string' && expression && (computedOwners.has(tableName)
          || !config?.usesNativeResourceRelations && expression.includes('$'))) issues.push(`${path}.computeExpression 包含待人工检查的表达式`)
      }
      if (!removed) continue
      if (isRecord(table['views'])) for (const [viewId, view] of Object.entries(table['views'])) {
        if (!isRecord(view)) continue
        const path = `tables.${tableName}.views.${viewId}`
        for (const key of ['valueField', 'labelField']) {
          const value = view[key]
          if (Array.isArray(value)) value.forEach((item, index) => reference(item, tableName, {path: `${path}.${key}[${index}]`}))
          else reference(value, tableName, {path: `${path}.${key}`})
        }
        if (isRecord(view['treeConfig'])) for (const key of ['idField', 'parentIdField', 'textField']) reference(view['treeConfig'][key], tableName, {path: `${path}.treeConfig.${key}`})
        const query = view['queryConfig']
        if (isRecord(query) && isRecord(query['tree'])) for (const key of ['keyField', 'parentField', 'hasChildrenField']) {
          reference(query['tree'][key], tableName, {path: `${path}.queryConfig.tree.${key}`})
        }
        for (const key of ['sortExpression', 'fieldProjection']) if (Array.isArray(view[key])) {
          view[key].forEach((item, index) => {
            if (!isRecord(item)) return
            for (const property of key === 'sortExpression' ? ['field'] : ['resourceField', 'viewField']) reference(item[property], tableName, {path: `${path}.${key}[${index}].${property}`})
          })
        }
        if (isRecord(view['aggregates'])) for (const [key, item] of Object.entries(view['aggregates'])) {
          if (isRecord(item)) reference(item['field'] ?? key, tableName, {path: `${path}.aggregates.${key}.field`})
        }
        filter(view['filterExpression'], {child: tableName, parent: tableName, path: `${path}.filterExpression`})
      }
    }
    if (removed && config) {
      const data = config.toJSON()
      if (columnRemoved && Array.isArray(data['resourceRelations'])) data['resourceRelations'].forEach((relation, index) => {
        if (isRecord(relation) && Object.hasOwn(relation, 'filterExpression')) filter(relation['filterExpression'], {child: relation['childTable'], parent: relation['parentTable'], path: `resourceRelations[${index}].filterExpression`})
      })
      if (Array.isArray(data['viewCascades'])) data['viewCascades'].forEach((cascade, index) => {
        if (!isRecord(cascade)) return
        const path = `viewCascades[${index}]`
        if (cascade['kind'] === 'field') {
          reference(cascade['targetField'], cascade['tableName'], {path: `${path}.targetField`})
          if (Array.isArray(cascade['parents'])) cascade['parents'].forEach((parent, parentIndex) => {
            if (isRecord(parent)) reference(parent['field'], parent['tableName'], {path: `${path}.parents[${parentIndex}].field`})
          })
        } else if (Array.isArray(cascade['filterBindings'])) cascade['filterBindings'].forEach((binding, bindingIndex) => {
          if (isRecord(binding)) {
            reference(binding['sourceField'], cascade['parentTable'], {path: `${path}.filterBindings[${bindingIndex}].sourceField`})
            reference(binding['targetField'], cascade['childTable'], {path: `${path}.filterBindings[${bindingIndex}].targetField`})
          }
        })
        if (cascade['kind'] !== 'field' && Array.isArray(cascade['inputBindings'])) cascade['inputBindings'].forEach((binding, bindingIndex) => {
          if (isRecord(binding)) {
            reference(binding['sourceField'], cascade['parentTable'], {path: `${path}.inputBindings[${bindingIndex}].sourceField`})
            if (isRecord(binding['when'])) reference(binding['when']['field'], cascade['parentTable'], {path: `${path}.inputBindings[${bindingIndex}].when.field`})
          }
        })
      })
    }
    // Backend relations keep formal Name. Only removing the output can invalidate their runtime projection.
    if (removing || field.output && !output) {
      const relations = input.definitionViews ? input.definitionViews[2] : metadata.getView('Base_DataModel_Relation', 'default')
      if (relations?.requestState !== RequestState.Loaded || relations.total !== relations.rows.length
        || relations.queryContext['dataSpaceId'] !== targetId || relations.mutating) throw new Error('模型关系未完整读取，不能关闭输出')
      for (const row of relations.rows) {
        if (['rowid', 'dataSetId', 'parentModId', 'childModId', 'filter'].some(key => relations.fieldAccess(row, key).read !== 'visible')
          || ['rowid', 'parentModId', 'childModId'].some(key => typeof row[key] !== 'string' || !row[key].trim())
          || row['dataSetId'] !== targetId || row['filter'] === undefined || row['filter'] === null || row['filter'] === '') throw new Error('模型关系不可核验，不能关闭输出')
        const tree = typeof row['filter'] === 'string' ? DataSpaceDesignApi.parseFilter(row['filter'])?.toJSON() : row['filter']
        // Qualified references use registered model names; unqualified sides use the declared model IDs.
        filter(tree, {child: row['childModId'], parent: row['parentModId'], path: `Base_DataModel_Relation(${String(row['rowid'])}).filter`, names: new Set([model.id, model.name]), old: field.name})
      }
    }
    if (issues.length) throw new Error(`字段输出仍有配置依赖，请先处理：\n${[...new Set(issues)].join('\n')}`)
  }
}
