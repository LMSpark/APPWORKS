import { describe, expect, it, vi } from 'vitest'
import {ScenarioViewFile, ScenarioViewWriteNotAppliedError} from '../../src/scenario/scenario-view-file'
import { ScenarioViewConfig } from '../../src/scenario/scenario-view-config'
import { ScenarioDefinitionRecords } from '../../src/scenario/scenario-definition-records'
import {ProjectWorkspace, ScenarioViewVersionNotAppliedError, type ScenarioViewVersionCreateCommand} from '../../src/project/project-workspace'
import {DataSet} from '@spark-appworks/spark-data'

function fixture(pageSize = 20): string {
  return JSON.stringify({ scenarioId: 'UNIT-SCENE', tables: {
    Orders: { modelBinding: { modelId: 'UNIT-ORDERS', modelName: 'OrdersModel' },
      views: { default: {}, list: { pageSize, autoCurrentFirst: false, selectionDelimiter: '',
        filterExpression: { field: 'active', operator: 'eq', value: false } } } },
    Items: { modelBinding: { modelId: 'UNIT-ITEMS', modelName: 'ItemsModel' }, views: { default: {}, detail: {} } },
  }, viewCascades: [{ parentTable: 'Orders', parentViewId: 'list', childTable: 'Items', childViewId: 'detail',
    filterBindings: [{ sourceField: 'id', targetField: 'orderId' }], autoLoad: false }] })
}

const validProjection = { fieldId: 'MODEL-FIELD-1', source: 'resource', resourceFieldId: 'MODEL-FIELD-1',
  resourceField: 'id', viewField: 'id', type: '', label: '', output: true, sortOrder: 0,
  sortDirection: null, group: 0, distinct: false, primaryKey: true, value: '', valueFunction: '', expression: '' }

describe('first native relationship conversion validation', () => {
  const source = {scenarioId:'S',tables:{
    Parent:{modelBinding:{modelId:'P',modelName:'Parent'},views:{default:{},bad:{sortExpression:[{field:'missing',direction:'asc'}]}}},
    Child:{modelBinding:{modelId:'C',modelName:'Child'},views:{default:{}}},
    Lookup:{modelBinding:{modelId:'L',modelName:'Lookup'},views:{default:{}}},
    Unrelated:{modelBinding:{modelId:'X',modelName:'Unavailable'},views:{default:{}}},
  },layout:{tablePositions:{Parent:{x:10,y:20}}}}
  const relations=[{relationId:'R',sourceRelationId:'DB-R',parentTable:'Parent',childTable:'Child',
    filterExpression:{field:'id',operator:'eq',value:{Type:'GetRefData',RefTableName:'Lookup',RefFieldName:'id',FkFieldName:'id'}}}]
  const previous=()=>new ScenarioViewConfig('S',JSON.stringify(source))
  it('validates every converted relationship and referenced model while preserving the full stored definition',()=>{
    const next=new ScenarioViewConfig('S',JSON.stringify({...source,schemaVersion:2,resourceRelations:relations}))
    const scope=next.selectRelationValidationScope(previous())!.toJSON()
    expect(Object.keys(scope['tables'] as object)).toEqual(['Parent','Child','Lookup'])
    expect(scope['resourceRelations']).toEqual(relations)
    expect(scope['tables']).toMatchObject({Parent:{views:{default:{}}}})
    expect(next.toJSON()['tables']).toEqual(source.tables);expect(next.toJSON()['layout']).toEqual(source.layout)
  })
  it('rejects unrelated changes during conversion and needs no model assembly for an empty complete source',()=>{
    const next=new ScenarioViewConfig('S',JSON.stringify({...source,layout:{},schemaVersion:2,resourceRelations:relations}))
    expect(()=>next.selectRelationValidationScope(previous())).toThrow('其他结构变更')
    const empty=new ScenarioViewConfig('S',JSON.stringify({...source,schemaVersion:2,resourceRelations:[]}))
    expect(empty.selectRelationValidationScope(previous())).toBeNull()
  })
})

describe('joint native definition validation scope', () => {
  const resources = ScenarioDefinitionRecords.resources
  const source = () => ({scenarioId: 'S', schemaVersion: 2, resourceRelations: [], viewCascades: [], tables: {
    Orders: {modelBinding: {modelId: 'O', modelName: 'Orders'}, views: {default: {}}},
    Items: {modelBinding: {modelId: 'I', modelName: 'Items'}, views: {default: {}}},
    Lookup: {modelBinding: {modelId: 'L', modelName: 'Lookup'}, views: {default: {}}},
    Consumer: {modelBinding: {modelId: 'C', modelName: 'Consumer'}, views: {default: {
      queryConfig: {filterLookups: [{field: 'id', sourceViewKey: 'S@Orders@default', valueField: 'id', matchField: 'id'}]},
    }}},
    Unrelated: {modelBinding: {modelId: 'X', modelName: 'Unavailable'}, views: {default: {}}},
  }})
  const parse = (value: unknown) => new ScenarioViewConfig('S', JSON.stringify(value))
  const relation = {relationId: 'R', parentTable: 'Orders', childTable: 'Items',
    filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'Lookup', RefFieldName: 'id', FkFieldName: 'id'}}}
  const cascade = {parentTable: 'Orders', parentViewId: 'default', childTable: 'Items', childViewId: 'default',
    filterBindings: [{sourceField: 'id', targetField: 'id'}], autoLoad: false}

  it.each(['views-layout', 'views-relations', 'views-cascades', 'all'])('preserves actual dependencies and excludes unrelated models for %s', kind => {
    const original = source(), next = JSON.parse(JSON.stringify(original))
    next.tables.Orders.views.default.pageSize = 31
    const selected: string[] = [resources.DataViewDefinition, resources.DataSpaceLayoutDefinition]
    next.layout = {tablePositions: {Orders: {x: 31, y: 42}}}
    if (kind === 'views-relations' || kind === 'all') {next.resourceRelations = [relation]; selected.push(resources.DataResourceRelationDefinition)}
    if (kind === 'views-cascades' || kind === 'all') {next.viewCascades = [cascade]; selected.push(resources.DataViewCascadeDefinition)}
    if (kind === 'all') {
      next.tables.Orders.columns = [{name: 'label', type: 'string', computeExpression: 'id'}]
      selected.push(resources.DataTableBindingDefinition)
    }
    const before = parse(original), after = parse(next)
    const scope = ScenarioDefinitionRecords.validationScope(after, before, selected)!.toJSON()
    const expected = kind === 'views-layout' ? ['Orders', 'Consumer']
      : kind === 'views-cascades' ? ['Orders', 'Items', 'Consumer'] : ['Orders', 'Items', 'Lookup', 'Consumer']
    expect(Object.keys(scope['tables'] as object)).toEqual(expected)
    expect(scope['tables']).toMatchObject({Orders: {views: {default: {pageSize: 31}}}})
    expect(scope['resourceRelations']).toEqual(next.resourceRelations)
    expect(scope['viewCascades']).toEqual(next.viewCascades)
    expect(scope).not.toHaveProperty('layout')
    expect(before.toJSON()).toEqual(original); expect(after.toJSON()).toEqual(next)
  })

  it('requires no model assembly for joint layout/request edits or pure relationship and cascade removal', () => {
    const original = source(), before = parse(original)
    const changed = parse({...original, layout: {tablePositions: {Orders: {x: 1, y: 2}}},
      tables: {...original.tables, Orders: {...original.tables.Orders, crudConfig: {timeout: 1234}}}})
    expect(ScenarioDefinitionRecords.validationScope(changed, before,
      [resources.DataTableBindingDefinition, resources.DataSpaceLayoutDefinition])).toBeNull()
    const linked = parse({...original, resourceRelations: [relation], viewCascades: [cascade]})
    expect(ScenarioDefinitionRecords.validationScope(before, linked,
      [resources.DataResourceRelationDefinition, resources.DataViewCascadeDefinition])).toBeNull()
  })

  it.each(['database', 'file'])('includes a new %s binding and its full dependency chain in a joint save', resourceType => {
    const original = source(), next = JSON.parse(JSON.stringify(original))
    next.tables.Added = resourceType === 'file'
      ? {resourceType: 'file', resourceId: 'new-source', columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, detail: {pageSize: 8}}}
      : {modelBinding: {modelId: 'NEW', modelName: 'Added'}, views: {default: {}, detail: {pageSize: 8}}}
    next.resourceRelations = [{...relation, parentTable: 'Added', childTable: 'Orders'}]
    next.viewCascades = [cascade]
    next.layout = {tablePositions: {Added: {x: 1, y: 2}}}
    const after = parse(next)
    const scope = ScenarioDefinitionRecords.validationScope(after, parse(original), Object.values(resources))!.toJSON()
    expect(Object.keys(scope['tables'] as object)).toEqual(['Orders', 'Items', 'Lookup', 'Consumer', 'Added'])
    expect(scope['tables']).toMatchObject({Added: {views: {detail: {pageSize: 8}}}})
    expect(after.toJSON()).toEqual(next)
  })

  it('does not assemble removed or unrelated bindings during joint changes', () => {
    const original = source(), next = JSON.parse(JSON.stringify(original))
    delete next.tables.Items
    next.layout = {tablePositions: {Orders: {x: 1, y: 2}}}
    const selected = [resources.DataTableBindingDefinition, resources.DataSpaceLayoutDefinition, resources.DataViewDefinition]
    expect(ScenarioDefinitionRecords.validationScope(parse(next), parse(original), selected)).toBeNull()
    next.tables.Orders.views.default.pageSize = 8
    expect(Object.keys(ScenarioDefinitionRecords.validationScope(parse(next), parse(original), selected)!.toJSON()['tables'] as object))
      .toEqual(['Orders', 'Consumer'])
  })

  it('retains removal reference checks for a joint save', () => {
    const original = source(), next = JSON.parse(JSON.stringify(original))
    delete next.tables.Orders
    expect(() => ScenarioDefinitionRecords.validationScope(parse(next), parse(original),
      [resources.DataTableBindingDefinition, resources.DataSpaceLayoutDefinition])).toThrow('模型仍有配置引用')
  })

  it.each(['legacy', 'rebind', 'version', 'unknown-resource'])('retains complete validation for %s', kind => {
    const original = source(), next = JSON.parse(JSON.stringify(original))
    if (kind === 'legacy') {delete next.schemaVersion; delete next.resourceRelations}
    if (kind === 'rebind') next.tables.Orders.modelBinding.modelId = 'REPLACED'
    if (kind === 'version') next.version = 2
    next.layout = {tablePositions: {Orders: {x: 1, y: 2}}}
    const after = parse(next)
    expect(ScenarioDefinitionRecords.validationScope(after, parse(original),
      [resources.DataTableBindingDefinition, kind === 'unknown-resource' ? 'unknown' : resources.DataSpaceLayoutDefinition])).toBe(after)
  })

  it('rejects a joint definition comparison across spaces', () => {
    const before = parse(source()), after = new ScenarioViewConfig('OTHER', JSON.stringify({...source(), scenarioId: 'OTHER'}))
    expect(() => ScenarioDefinitionRecords.validationScope(after, before,
      [resources.DataViewDefinition, resources.DataSpaceLayoutDefinition])).toThrow('跨空间')
  })

  it.each([false, true])('validates a view rename and its cascade against the complete capture (cascade first=%s)', cascadeFirst => {
    const original = JSON.parse(JSON.stringify(source()))
    original.tables.Orders.views.old = {pageSize: 17}
    original.viewCascades = [{...cascade, parentViewId: 'old'}]
    const before = parse(original), candidate = new ScenarioDefinitionRecords(before)
    const views = ScenarioDefinitionRecords.read(before, resources.DataViewDefinition)
      .map(row => row['tableName'] === 'Orders' && row['viewId'] === 'old' ? {...row, viewId: 'new'} : row)
    const cascades = ScenarioDefinitionRecords.read(before, resources.DataViewCascadeDefinition)
      .map(row => ({...row, parentViewId: 'new'}))
    const changes = [{resource: resources.DataViewDefinition, rows: views}, {resource: resources.DataViewCascadeDefinition, rows: cascades}]
    if (cascadeFirst) changes.reverse()
    expect(() => ScenarioDefinitionRecords.write({config: before, resource: changes[0]!.resource, rows: changes[0]!.rows})).toThrow()
    for (const change of changes) candidate.applyRows(change.resource, change.rows)
    const saved = candidate.toConfig().toJSON()
    expect(saved['tables']).toMatchObject({Orders: {views: {new: {pageSize: 17}}}})
    expect(saved['viewCascades']).toMatchObject([{parentViewId: 'new'}])
    expect(before.toJSON()).toEqual(original)
  })

  it('rejects an invalid final capture and keeps the original config intact', () => {
    const original = source(), before = parse(original), candidate = new ScenarioDefinitionRecords(before)
    candidate.applyRows(resources.DataViewCascadeDefinition, [{dataSetId: 'S', ...cascade, parentViewId: 'missing'}])
    expect(() => candidate.toConfig()).toThrow()
    expect(before.toJSON()).toEqual(original)
  })

  it.each([false, true])('consumes a matching captured layout edge only after validating the final relation (wrong endpoint=%s)', wrongEndpoint => {
    const before = parse(source()), candidate = new ScenarioDefinitionRecords(before)
    candidate.applyRows(resources.DataResourceRelationDefinition, [{dataSetId: 'S', ...relation}])
    candidate.applyRows(resources.DataSpaceLayoutDefinition, [{dataSetId: 'S', unboundEdges: {
      R: {source: wrongEndpoint ? 'WRONG' : 'O', target: 'I'},
    }}])
    if (wrongEndpoint) expect(() => candidate.toConfig()).toThrow('待配置连线与关系端点不一致')
    else expect(candidate.toConfig().toJSON()['layout']).toEqual({unboundEdges: {}})
  })
})

describe('table request configuration validation scope', () => {
  const read = (table: Record<string, unknown>) => new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', tables: {
    Orders: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}, ...table},
    Other: {modelBinding: {modelId: 'M2', modelName: 'Other'}, views: {default: {}}},
  }}))
  it('validates request-only changes without assembling model dependencies, including removal', () => {
    const original = read({}), configured = read({api: {list: {url: '/api/query'}}, crudConfig: {timeout: 4321}})
    expect(configured.selectTableValidationScope(original)).toBeNull()
    expect(original.selectTableValidationScope(configured)).toBeNull()
    expect(() => read({api: {list: {url: 'https://wrong.example'}}})).toThrow('SPARK_SAVE_CONFIG')
  })
  it('continues to validate views and model structure when request configuration changes with them', () => {
    const original = read({})
    const changedView = read({api: {list: {url: '/api/query'}}, views: {default: {sortExpression: [{field: 'missing', direction: 'asc'}]}}})
    expect(changedView.selectTableValidationScope(original)).not.toBeNull()
    expect(Object.keys(changedView.selectTableValidationScope(original)!.toJSON()['tables'] as Record<string, unknown>)).toEqual(['Orders'])
    const changedModel = read({api: {list: {url: '/api/query'}}, modelBinding: {modelId: 'M3', modelName: 'Changed'}})
    expect(changedModel.selectTableValidationScope(original)).not.toBeNull()
  })
})

describe('explicit file resource configuration', () => {
  const table = {resourceType: 'file', resourceId: 'pagedata.json', columns: [
    {name: 'id', type: 'string', isPrimaryKey: true, required: true},
    {name: 'text', type: 'string', label: '配置原文', allowDBNull: false},
  ], views: {default: {autoLoad: false, commitMode: 'staged'}, detail: {pageSize: 1}}}
  const parse = (value: unknown) => new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', schemaVersion: 2,
    resourceRelations: [], tables: {FileDefinitions: value}}))

  it('retains native file columns and multiple views without fabricating a backend binding or storing rows', () => {
    expect(parse(table).toJSON()['tables']).toEqual({FileDefinitions: table})
    const roundtrip = parse(table).selectModelScope('FileDefinitions')
    expect(roundtrip.toJSON()['tables']).toEqual({FileDefinitions: table})
  })

  it.each([
    {...table, modelBinding: {modelId: 'fake', modelName: 'FileDefinitions'}},
    {...table, resourceType: 'unknown'}, {...table, resourceId: ''}, {...table, resourceId: ' pagedata.json'},
    {...table, columns: [{name: 'id'}]}, {...table, columns: [{name: 'id', type: 'string', isPrimaryKey: 'yes'}]},
    {...table, columns: [{name: '_pk', type: 'string'}]}, {...table, columns: [{name: 'id', type: 'string', isComputed: true}]},
    {...table, rows: []}, {...table, api: {read: '/bypass'}}, {...table, crudConfig: {}},
  ])('rejects ambiguous identity, invalid columns, inline data and bypass requests %#', value => {
    expect(() => parse(value)).toThrow()
  })

  it('keeps backend columns authoritative when a formal model is used', () => {
    expect(() => parse({modelBinding: {modelId: 'REAL', modelName: 'RealModel'},
      columns: table.columns, views: table.views})).toThrow(/columns/)
  })

  it('resolves file lookup keys by their declared table name alongside formal model names', () => {
    const config = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', schemaVersion: 2, resourceRelations: [], tables: {
      FileDefinitions: table,
      Orders: {modelBinding: {modelId: 'REAL', modelName: 'RealModel'}, views: {default: {
        queryConfig: {filterLookups: [{field: 'id', sourceViewKey: 'S@FileDefinitions@detail', valueField: 'id', matchField: 'text'}]},
      }}},
    }}))
    expect(Object.keys(config.selectModelScope('Orders').toJSON()['tables'] as object)).toEqual(['FileDefinitions', 'Orders'])
  })

  it.each(['file', 'formal'])('validates a %s model column edit with relation, cascade and reverse lookup consumers without unrelated models', kind => {
    const input = {scenarioId: 'S', schemaVersion: 2, tables: {
      FileDefinitions: kind === 'file' ? table : {modelBinding: {modelId: 'SOURCE', modelName: 'FileDefinitions'},
        columns: [{name: 'display', type: 'string', label: '旧标题', computeExpression: 'id'}], views: table.views},
      RelationTarget: {...table, resourceId: 'relation-target'},
      CascadeTarget: {...table, resourceId: 'cascade-target'},
      LookupConsumer: {modelBinding: {modelId: 'REAL', modelName: 'RealModel'}, views: {default: {
        queryConfig: {filterLookups: [{field: 'id', sourceViewKey: 'S@FileDefinitions@detail', valueField: 'id', matchField: 'text'}]},
      }}},
      Unrelated: {modelBinding: {modelId: 'OTHER', modelName: 'OtherModel'}, views: {default: {}}},
    }, resourceRelations: [{relationId: 'R', parentTable: 'FileDefinitions', childTable: 'RelationTarget',
      filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}],
    viewCascades: [{parentTable: 'FileDefinitions', parentViewId: 'default', childTable: 'CascadeTarget', childViewId: 'default',
      filterBindings: [{sourceField: 'id', targetField: 'id'}]}]}
    const before = new ScenarioViewConfig('S', JSON.stringify(input)), changed = structuredClone(input)
    changed.tables.FileDefinitions.columns[0]!.label = '新标题'
    const after = new ScenarioViewConfig('S', JSON.stringify(changed)), scope = after.selectTableValidationScope(before)!
    expect(Object.keys(scope.toJSON()['tables'] as object)).toEqual(['FileDefinitions', 'RelationTarget', 'CascadeTarget', 'LookupConsumer'])
    expect(scope.toJSON()).toMatchObject({resourceRelations: input.resourceRelations, viewCascades: input.viewCascades})
    expect(after.toJSON()).toEqual(changed); expect(before.toJSON()).toEqual(input)
    expect(before.selectTableValidationScope(before)).toBeNull()
  })

  it('validates a native formal column and view edit together, retaining actual consumers and the original file', () => {
    const input = {scenarioId: 'S', schemaVersion: 2, resourceRelations: [], tables: {
      Orders: {modelBinding: {modelId: 'O', modelName: 'Orders'}, views: {default: {}, summary: {}}},
      Unrelated: {modelBinding: {modelId: 'X', modelName: 'Unavailable'}, views: {default: {}}},
    }}
    const before = new ScenarioViewConfig('S', JSON.stringify(input))
    const after = new ScenarioViewConfig('S', JSON.stringify({...input, tables: {...input.tables,
      Orders: {...input.tables.Orders, columns: [{name: 'label', type: 'string', computeExpression: 'id'}],
        views: {default: {}, summary: {labelField: 'label'}}},
    }}))
    const scope = ScenarioDefinitionRecords.validationScope(after, before,
      [ScenarioDefinitionRecords.resources.DataTableBindingDefinition, ScenarioDefinitionRecords.resources.DataViewDefinition])!
    expect(Object.keys(scope.toJSON()['tables'] as object)).toEqual(['Orders'])
    expect(scope.toJSON()['tables']).toMatchObject({Orders: {views: {summary: {labelField: 'label'}}}})
    expect(after.toJSON()['tables']).toHaveProperty('Unrelated')
    expect(before.toJSON()).toEqual(input)
  })

  it.each(['legacy', 'resource', 'new', 'deleted'])('selects validation for %s file configuration', kind => {
    const input = {scenarioId: 'S', schemaVersion: 2, resourceRelations: [], tables: {FileDefinitions: table}}
    const before = new ScenarioViewConfig('S', JSON.stringify(kind === 'legacy' ? {...input, resourceRelations: undefined} : input))
    const changed = kind === 'legacy' ? {...input, resourceRelations: undefined, tables: {FileDefinitions: {...table, businessCategory: 'changed'}}}
      : kind === 'resource' ? {...input, tables: {FileDefinitions: {...table, resourceId: 'new-file'}}}
        : kind === 'new' ? {...input, tables: {...input.tables, Added: table}}
          : {...input, tables: {}}
    const after = new ScenarioViewConfig('S', JSON.stringify(changed))
    if (kind === 'new') expect(Object.keys(after.selectTableValidationScope(before)!.toJSON()['tables'] as object)).toEqual(['Added'])
    else expect(after.selectTableValidationScope(before)).toBe(kind === 'deleted' ? null : after)
    expect(after.toJSON()).toEqual(changed)
  })

  it.each(['binding', 'name', 'category', 'removed'] as const)('does not treat native %s changes as stable column editing', kind => {
    const original = {scenarioId: 'S', schemaVersion: 2, resourceRelations: [], tables: {
      Orders: {modelBinding: {modelId: 'O', modelName: 'Orders'}, views: {default: {}}},
      Other: {modelBinding: {modelId: 'X', modelName: 'Other'}, views: {default: {}}},
    }}
    const before = new ScenarioViewConfig('S', JSON.stringify(original))
    const orders = {...original.tables.Orders, columns: [{name: 'label', type: 'string', computeExpression: 'id'}],
      ...(kind === 'binding' ? {modelBinding: {modelId: 'REPLACED', modelName: 'Orders'}} : {}),
      ...(kind === 'name' ? {modelBinding: {modelId: 'O', modelName: 'Renamed'}} : {}),
      ...(kind === 'category' ? {businessCategory: 'reference'} : {})}
    const tables = kind === 'removed' ? {Orders: orders} : {...original.tables, Orders: orders}
    const after = new ScenarioViewConfig('S', JSON.stringify({...original, tables}))
    expect(after.selectTableValidationScope(before)).toBe(after)
  })

  it('validates a new native binding together with edited columns and preserves unrelated definitions', () => {
    const original = {scenarioId: 'S', schemaVersion: 2, resourceRelations: [], tables: {
      Orders: {modelBinding: {modelId: 'O', modelName: 'Orders'}, views: {default: {}}},
      Unrelated: {modelBinding: {modelId: 'X', modelName: 'Unavailable'}, views: {default: {}}},
    }}
    const after = new ScenarioViewConfig('S', JSON.stringify({...original, tables: {...original.tables,
      Orders: {...original.tables.Orders, columns: [{name: 'label', type: 'string', computeExpression: 'id'}]},
      Added: {modelBinding: {modelId: 'A', modelName: 'Added'}, views: {default: {}, named: {pageSize: 25}}},
    }}))
    const scope = after.selectTableValidationScope(new ScenarioViewConfig('S', JSON.stringify(original)))!
    expect(Object.keys(scope.toJSON()['tables'] as object)).toEqual(['Orders', 'Added'])
    expect(after.toJSON()['tables']).toHaveProperty('Unrelated')
  })

  it('rejects ambiguity introduced by a new native binding in an existing lookup consumer', () => {
    const original = {scenarioId: 'S', schemaVersion: 2, resourceRelations: [], tables: {
      Source: {modelBinding: {modelId: 'P', modelName: 'Parent'}, views: {default: {}}},
      Consumer: {modelBinding: {modelId: 'C', modelName: 'Consumer'}, views: {default: {queryConfig: {filterLookups: [
        {field: 'id', sourceViewKey: 'S@Parent@default', valueField: 'id', matchField: 'id'},
      ]}}}},
    }}
    const before = new ScenarioViewConfig('S', JSON.stringify(original))
    const after = new ScenarioViewConfig('S', JSON.stringify({...original, tables: {...original.tables, Added: original.tables.Source}}))
    expect(() => after.selectTableValidationScope(before)).toThrow('辅助过滤查找视图无法唯一定位')
  })

  it.each([false, true])('uses config-only removal checks for native=%s formal bindings', native => {
    const original = {scenarioId: 'S', ...(native ? {schemaVersion: 2, resourceRelations: []} : {}), tables: {
      Removed: {modelBinding: {modelId: 'R', modelName: 'Removed'}, views: {default: {}, named: {}}},
      Unrelated: {modelBinding: {modelId: 'X', modelName: 'Unavailable'}, views: {default: {}}},
    }, layout: {tablePositions: {Removed: {x: 1, y: 2}}}}
    const before = new ScenarioViewConfig('S', JSON.stringify(original))
    const after = new ScenarioViewConfig('S', JSON.stringify({...original, tables: {Unrelated: original.tables.Unrelated}, layout: {tablePositions: {}}}))
    expect(after.selectTableValidationScope(before)).toBe(native ? null : after)
  })

  it.each(['relation', 'cascade', 'lookup', 'filter'] as const)('rejects native binding removal with a %s reference', kind => {
    const original = {scenarioId: 'S', schemaVersion: 2, resourceRelations: kind === 'relation' ? [
      {relationId: 'R', parentTable: 'Parent', childTable: 'Child', filterExpression: {field: 'id', operator: 'eq', value: 1}},
    ] : [], viewCascades: kind === 'cascade' ? [{parentTable: 'Parent', parentViewId: 'default', childTable: 'Child', childViewId: 'default',
      filterBindings: [{sourceField: 'id', targetField: 'id'}]}] : [], tables: {
      Parent: {modelBinding: {modelId: 'P', modelName: 'ParentModel'}, views: {default: {}}},
      Child: {modelBinding: {modelId: 'C', modelName: 'ChildModel'}, views: {default: {
        ...(kind === 'lookup' ? {queryConfig: {filterLookups: [{field: 'id', sourceViewKey: 'S@ParentModel@default', valueField: 'id', matchField: 'id'}]}} : {}),
        ...(kind === 'filter' ? {filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'ParentModel', RefFieldName: 'id', FkFieldName: 'id'}}} : {}),
      }}},
    }}
    const before = new ScenarioViewConfig('S', JSON.stringify(original))
    const resource = ScenarioDefinitionRecords.resources.DataTableBindingDefinition
    const retained = ScenarioDefinitionRecords.read(before, resource).filter(row => row['tableName'] !== 'Parent')
    expect(before.getTableRemovalReferences('Parent').length).toBeGreaterThan(0)
    expect(() => ScenarioDefinitionRecords.write({config: before, resource, rows: retained})).toThrow('SCENARIO_DEFINITION_REFERENCES')
  })

  it('does not waive validation when a file deletion also changes another model', () => {
    const original = {scenarioId: 'S', schemaVersion: 2, resourceRelations: [], tables: {FileDefinitions: table,
      Other: {modelBinding: {modelId: 'OTHER', modelName: 'Other'}, views: {default: {pageSize: 10}}}}}
    const before = new ScenarioViewConfig('S', JSON.stringify(original))
    const after = new ScenarioViewConfig('S', JSON.stringify({...original, tables: {Other: {...original.tables.Other, views: {default: {pageSize: 12}}}}}))
    expect(after.selectTableValidationScope(before)).toBe(after)
  })
})

describe('model-scoped runtime configuration', () => {
  it('validates a same-ID registration rename and its views without importing unchanged legacy relations', () => {
    const original = {scenarioId: 'S', tables: {
      Orders: {modelBinding: {modelId: 'M1', modelName: 'Old'}, views: {default: {valueField: 'oldCode'}}},
      Other: {modelBinding: {modelId: 'M2', modelName: 'Other'}, views: {default: {}}},
    }}
    const before = new ScenarioViewConfig('S', JSON.stringify(original))
    const after = new ScenarioViewConfig('S', JSON.stringify({...original, tables: {...original.tables,
      Orders: {modelBinding: {modelId: 'M1', modelName: 'New'}, views: {default: {valueField: 'newCode'}}},
    }}))
    const scope = after.selectTableValidationScope(before)!
    expect(Object.keys(scope.toJSON()['tables'] as object)).toEqual(['Orders'])
    expect(scope.usesNativeResourceRelations).toBe(true)
    expect(scope.toJSON()).toMatchObject({resourceRelations: [], tables: {Orders: {modelBinding: {modelId: 'M1', modelName: 'New'}}}})
    expect(after.usesNativeResourceRelations).toBe(false)
    expect(after.toJSON()['resourceRelations']).toBeUndefined()
    for (const change of [{modelBinding: {modelId: 'REPLACED', modelName: 'New'}},
      {modelBinding: {modelId: 'M1', modelName: 'New'}, businessCategory: 'changed'}]) {
      const changed = new ScenarioViewConfig('S', JSON.stringify({...original, tables: {...original.tables,
        Orders: {...original.tables.Orders, ...change},
      }}))
      expect(changed.selectTableValidationScope(before)).toBe(changed)
    }
  })

  const tables = Object.fromEntries(['Orders', 'Items', 'Tax', 'Inputs', 'Region', 'Countries', 'Ignored'].map(tableName => [tableName, {
    modelBinding: {modelId: tableName, modelName: `${tableName}Model`}, views: {default: {autoLoad: false}, list: {pageSize: 7}},
  }]))
  it('validates changed native relations with endpoints and explicit function models, preserving the complete file', () => {
    const relation = {relationId: 'items', parentTable: 'Orders', childTable: 'Items',
      filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}
    const input = {scenarioId: 'S', schemaVersion: 2, tables, layout: {tablePositions: {Ignored: {x: 1, y: 2}}},
      resourceRelations: [relation, {...relation, relationId: 'unmodified', parentTable: 'Ignored', childTable: 'Orders'}],
      viewCascades: [{parentTable: 'Inputs', parentViewId: 'list', childTable: 'Orders', childViewId: 'list',
        filterBindings: [{sourceField: 'id', targetField: 'id'}], autoLoad: false}]}
    const before = new ScenarioViewConfig('S', JSON.stringify(input)), changed = JSON.parse(JSON.stringify(input))
    changed.resourceRelations[0].filterExpression = {logic: 'and', filters: [
      {field: 'id', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'Tax', RefFieldName: 'id', FkFieldName: 'id'}},
      {field: 'id', operator: 'eq', value: {Type: 'GetGroupData', GroupTableName: 'Countries', GroupField: 'id', Field: 'id'}},
      {field: 'id', operator: 'eq', value: {Type: 'GetExpData', refTableName: 'Region', Expression: 'kept'}},
    ]}
    const after = new ScenarioViewConfig('S', JSON.stringify(changed)), scope = after.selectRelationValidationScope(before)!
    expect(Object.keys(scope.toJSON()['tables'] as object)).toEqual(['Orders', 'Items', 'Tax', 'Region', 'Countries'])
    expect(scope.toJSON()).toMatchObject({resourceRelations: [changed.resourceRelations[0]], viewCascades: [], tables: {Orders: {views: {default: {}}}}})
    expect(Object.keys((scope.toJSON()['tables'] as typeof tables)['Orders']!.views)).toEqual(['default'])
    expect(scope.toJSON()).not.toHaveProperty('layout')
    expect(after.toJSON()).toEqual(changed); expect(before.toJSON()).toEqual(input)
  })
  it('needs no resource read for native relation deletion or an unchanged relation', () => {
    const input = {scenarioId: 'S', schemaVersion: 2, tables, resourceRelations: [{relationId: 'deleted', parentTable: 'Ignored', childTable: 'Orders',
      filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}]}
    const before = new ScenarioViewConfig('S', JSON.stringify(input)), after = new ScenarioViewConfig('S', JSON.stringify({...input, resourceRelations: []}))
    expect(before.selectRelationValidationScope(before)).toBeNull()
    expect(after.selectRelationValidationScope(before)).toBeNull()
    expect(after.toJSON()['tables']).toEqual(tables)
  })
  it('does not assemble unrelated tables for a complete empty legacy conversion regardless of root key order', () => {
    const before = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', tables}))
    const after = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', schemaVersion: 2, tables, resourceRelations: []}))
    expect(after.selectRelationValidationScope(before)).toBeNull()
  })
  it.each(['view', 'binding', 'layout', 'version'])('rejects unrelated %s changes through native relation validation', change => {
    const input = {scenarioId: 'S', schemaVersion: 2, tables, resourceRelations: [], layout: {tablePositions: {Orders: {x: 1, y: 2}}}}
    const before = new ScenarioViewConfig('S', JSON.stringify(input)), changed = JSON.parse(JSON.stringify(input))
    if (change === 'view') changed.tables.Orders.views.list.pageSize = 33
    if (change === 'binding') changed.tables.Orders.modelBinding.modelId = 'OTHER'
    if (change === 'layout') changed.layout.tablePositions.Orders.x = 40
    if (change === 'version') changed.version = 99
    expect(() => new ScenarioViewConfig('S', JSON.stringify(changed)).selectRelationValidationScope(before)).toThrow(/关系.*结构/)
  })
  it('allows only the matching pending edge to be consumed by a new native relation', () => {
    const input = {scenarioId: 'S', schemaVersion: 2, tables, resourceRelations: [],
      layout: {unboundEdges: {edge: {source: 'Orders', target: 'Items'}, keep: {source: 'Tax', target: 'Region'}}}}
    const before = new ScenarioViewConfig('S', JSON.stringify(input)), changed = JSON.parse(JSON.stringify(input))
    delete changed.layout.unboundEdges.edge
    changed.resourceRelations.push({relationId: 'edge', parentTable: 'Orders', childTable: 'Items', filterExpression: {field: 'id', operator: 'eq', value: 1}})
    expect(new ScenarioViewConfig('S', JSON.stringify(changed)).selectRelationValidationScope(before)).not.toBeNull()
    delete changed.layout.unboundEdges.keep
    expect(() => new ScenarioViewConfig('S', JSON.stringify(changed)).selectRelationValidationScope(before)).toThrow(/关系.*结构/)
  })
  it('rejects a changed native relation whose explicit function model is not bound', () => {
    const input = {scenarioId: 'S', schemaVersion: 2, tables, resourceRelations: []}
    const before = new ScenarioViewConfig('S', JSON.stringify(input)), after = new ScenarioViewConfig('S', JSON.stringify({...input,
      resourceRelations: [{relationId: 'missing', parentTable: 'Orders', childTable: 'Items',
        filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'Missing', RefFieldName: 'id', FkFieldName: 'id'}}}]}))
    expect(() => after.selectRelationValidationScope(before)).toThrow(/Missing/)
  })
  it('validates an added binding and its lookup source without loading unrelated models or changing the complete file', () => {
    const before = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', tables}))
    const after = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', tables: {...tables,
      Added: {modelBinding: {modelId: 'New', modelName: 'NewModel'}, views: {default: {}, detail: {queryConfig: {filterLookups: [
        {field: 'taxId', sourceViewKey: 'S@TaxModel@list', matchField: 'label', valueField: 'id'},
      ]}}}},
    }}))
    expect(Object.keys(after.selectViewValidationScope(before)!.toJSON()['tables'] as object)).toEqual(['Tax', 'Added'])
    expect(Object.keys(after.toJSON()['tables'] as object)).toHaveLength(8)
    const removed = {...tables}; delete removed['Ignored']
    expect(() => new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', tables: removed})).selectViewValidationScope(before)).toThrow(/结构/)
  })
  it('rejects an added alias that makes an existing lookup binding ambiguous', () => {
    const input = {scenarioId: 'S', tables: {...tables, Orders: {...tables['Orders'], views: {default: {queryConfig: {filterLookups: [
      {field: 'taxId', sourceViewKey: 'S@TaxModel@list', matchField: 'label', valueField: 'id'},
    ]}}}}}}
    const before = new ScenarioViewConfig('S', JSON.stringify(input))
    const after = new ScenarioViewConfig('S', JSON.stringify({...input, tables: {...input.tables, OtherTax: tables['Tax']}}))
    expect(() => after.selectViewValidationScope(before)).toThrow(/查找视图/)
  })
  it.each([undefined, 2])('validates only changed views and their bidirectional cascade/lookup dependencies (schema %s)', schemaVersion => {
    const input = {scenarioId: 'S', schemaVersion, tables: {...tables,
      Orders: {...tables['Orders'], views: {default: {queryConfig: {filterLookups: [
        {field: 'taxId', sourceViewKey: 'S@TaxModel@list', matchField: 'label', valueField: 'id'},
      ]}}, list: {pageSize: 7}}},
      Items: {...tables['Items'], views: {default: {queryConfig: {filterLookups: [
        {field: 'orderId', sourceViewKey: 'S@OrdersModel@list', matchField: 'label', valueField: 'id'},
      ]}}}},
    }, layout: {tablePositions: {Ignored: {x: 1, y: 2}}},
      resourceRelations: [{relationId: 'stable', parentTable: 'Ignored', childTable: 'Orders',
        filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}],
      viewCascades: [{kind: 'field', cascadeId: 'country', tableName: 'Orders', viewId: 'list', targetField: 'country', valueFormat: 'native',
        parents: [{tableName: 'Inputs', viewId: 'default', field: 'id', parameter: 'input'},
          {tableName: 'Region', viewId: 'default', field: 'id', parameter: 'region'}],
        optionsView: {tableName: 'Countries', viewId: 'list'}, valuePolicy: {mode: 'retain'}}]}
    const before = new ScenarioViewConfig('S', JSON.stringify(input))
    const changed = structuredClone(input)
    changed.tables.Orders.views.list.pageSize = 31
    const after = new ScenarioViewConfig('S', JSON.stringify(changed))
    const scope = after.selectViewValidationScope(before)!
    expect(Object.keys(scope.toJSON()['tables'] as object).sort()).toEqual(['Countries', 'Inputs', 'Items', 'Orders', 'Region', 'Tax'])
    expect(scope.usesNativeResourceRelations).toBe(true)
    expect(scope.toJSON()).toMatchObject({resourceRelations: [], viewCascades: input.viewCascades})
    expect(scope.toJSON()).not.toHaveProperty('layout')
    expect(after.toJSON()).toEqual(JSON.parse(JSON.stringify(changed)))
    expect(before.toJSON()).toEqual(JSON.parse(JSON.stringify(input)))
  })
  it('skips unchanged view validation and rejects structural changes through the view-only contract', () => {
    const input = {scenarioId: 'S', tables}
    const before = new ScenarioViewConfig('S', JSON.stringify(input))
    expect(before.selectViewValidationScope(before)).toBeNull()
    for (const changed of [{...input, version: 2}, {...input, tables: {...tables,
      Orders: {...tables['Orders'], modelBinding: {modelId: 'OTHER', modelName: 'OrdersModel'}}}}]) {
      expect(() => new ScenarioViewConfig('S', JSON.stringify(changed)).selectViewValidationScope(before)).toThrow(/视图.*结构/)
    }
  })
  it('rejects deleting a view still referenced by another model lookup', () => {
    const input = {scenarioId: 'S', tables: {...tables,
      Orders: {...tables['Orders'], views: {default: {queryConfig: {filterLookups: [
        {field: 'taxId', sourceViewKey: 'S@TaxModel@list', matchField: 'label', valueField: 'id'},
      ]}}}},
    }}
    const before = new ScenarioViewConfig('S', JSON.stringify(input)), changed = JSON.parse(JSON.stringify(input))
    delete changed.tables.Tax.views.list
    expect(() => new ScenarioViewConfig('S', JSON.stringify(changed)).selectViewValidationScope(before)).toThrow(/查找视图/)
  })
  it.each(['add', 'delete'])('includes a model with an explicit view %s without treating its other views as removed', operation => {
    const before = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', tables}))
    const changed = JSON.parse(JSON.stringify(before.toJSON()))
    if (operation === 'add') changed.tables.Orders.views.extra = {pageSize: 11}
    else delete changed.tables.Orders.views.list
    const after = new ScenarioViewConfig('S', JSON.stringify(changed))
    const scope = after.selectViewValidationScope(before)!
    expect(Object.keys(scope.toJSON()['tables'] as object)).toEqual(['Orders'])
    expect(scope.toJSON()).toMatchObject({tables: {Orders: {views: {default: {autoLoad: false}}}}})
    expect(after.toJSON()['tables']).toEqual(changed.tables)
  })
  it('retains relation chains, explicit third-table values and all multi-parent cascade endpoints without unrelated models', () => {
    const input = {scenarioId: 'S', schemaVersion: 2, version: 8, tables,
      layout: {tablePositions: {Ignored: {x: 1, y: 2}}},
      resourceRelations: [{relationId: 'items', parentTable: 'Orders', childTable: 'Items',
        filterExpression: {field: 'taxId', operator: 'eq', value: {Type: 'GetRefData', RefTableName: 'Tax', RefFieldName: 'id', FkFieldName: 'id'}}}],
      viewCascades: [{parentTable: 'Inputs', parentViewId: 'list', childTable: 'Orders', childViewId: 'list',
        filterBindings: [{sourceField: 'id', targetField: 'id'}], autoLoad: false},
      {kind: 'field', cascadeId: 'country', tableName: 'Orders', viewId: 'list', targetField: 'country', valueFormat: 'native',
        parents: [{tableName: 'Inputs', viewId: 'default', field: 'id', parameter: 'input'},
          {tableName: 'Region', viewId: 'default', field: 'id', parameter: 'region'}],
        optionsView: {tableName: 'Countries', viewId: 'list'}, valuePolicy: {mode: 'retain'}}]}
    const source = new ScenarioViewConfig('S', JSON.stringify(input))
    const scoped = source.selectModelScope('Items').toJSON()
    expect(Object.keys(scoped['tables'] as object).sort()).toEqual(['Countries', 'Inputs', 'Items', 'Orders', 'Region', 'Tax'])
    expect(scoped).toMatchObject({scenarioId: 'S', schemaVersion: 2, version: 8,
      tables: {Orders: tables['Orders']}, resourceRelations: input.resourceRelations, viewCascades: input.viewCascades})
    expect(scoped).not.toHaveProperty('layout')
    expect(source.toJSON()).toEqual(input)
    expect(source.selectModelScope('Ignored').toJSON()).toMatchObject({tables: {Ignored: tables['Ignored']}, resourceRelations: [], viewCascades: []})
    expect(Object.keys(source.selectModelScope('Ignored').toJSON()['tables'] as object)).toEqual(['Ignored'])
  })
  it('retains auxiliary filter views by formal model name, including their relation dependencies', () => {
    const source = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', schemaVersion: 2,
      tables: {...tables, Orders: {...tables['Orders'], views: {default: {queryConfig: {filterLookups: [
        {field: 'taxId', sourceViewKey: 'S@TaxModel@list', matchField: 'label', valueField: 'id'},
      ]}}}}}, resourceRelations: [{relationId: 'tax-region', parentTable: 'Tax', childTable: 'Region',
        filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}]}))
    expect(Object.keys(source.selectModelScope('Orders').toJSON()['tables'] as object).sort()).toEqual(['Orders', 'Region', 'Tax'])
    expect(Object.keys(source.selectModelScope('Ignored').toJSON()['tables'] as object)).toEqual(['Ignored'])
  })
  it.each(['Other@TaxModel@list', 'S@Missing@list', 'S@TaxModel@missing'])('rejects unresolved filter lookup %s without binding fallback', sourceViewKey => {
    const source = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', schemaVersion: 2, resourceRelations: [],
      tables: {...tables, Orders: {...tables['Orders'], views: {default: {queryConfig: {filterLookups: [
        {field: 'taxId', sourceViewKey, matchField: 'label', valueField: 'id'},
      ]}}}}}}))
    expect(() => source.selectModelScope('Orders')).toThrow(/查找视图/)
  })
  it.each([undefined, 1, 2])('keeps complete configuration when native relation ownership is absent (version %s)', schemaVersion => {
    const source = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', tables, schemaVersion}))
    expect(source.selectModelScope('Orders')).toBe(source)
  })
  it.each([undefined, 1, 2])('uses confirmed legacy dependencies without inventing native ownership (version %s)', schemaVersion => {
    const input = {scenarioId: 'S', tables, schemaVersion}
    const source = new ScenarioViewConfig('S', JSON.stringify(input))
    const scoped = source.selectModelScope('Orders', [{relationId: 'R', sourceRelationId: 'DB-R',
      parentTable: 'Orders', childTable: 'Items', referencedTables: ['Tax']}])
    expect(Object.keys(scoped.toJSON()['tables'] as object).sort()).toEqual(['Items', 'Orders', 'Tax'])
    expect(scoped.usesNativeResourceRelations).toBe(false)
    expect(scoped.toJSON()).not.toHaveProperty('resourceRelations')
    expect(source.toJSON()).toEqual(JSON.parse(JSON.stringify(input)))
  })
  it('combines legacy source overrides, native expressions, multi-parent cascades and lookup dependencies', () => {
    const input = {scenarioId: 'S', tables: {...tables, Orders: {...tables['Orders'], views: {default: {queryConfig: {filterLookups: [
      {field: 'taxId', sourceViewKey: 'S@TaxModel@list', matchField: 'label', valueField: 'id'},
    ]}}}}}, resourceRelations: [
      {sourceRelationId: 'DB-R', parentTable: 'Orders', childTable: 'Items', relationName: 'lines', cascadeUpdate: true},
      {relationId: 'NATIVE-R', parentTable: 'Items', childTable: 'Region', filterExpression: {field: 'id', operator: 'eq', value: 1}},
    ], viewCascades: [{kind: 'field', cascadeId: 'choice', tableName: 'Orders', viewId: 'default', targetField: 'country', valueFormat: 'native',
      parents: [{tableName: 'Inputs', viewId: 'default', field: 'id', parameter: 'input'},
        {tableName: 'Region', viewId: 'default', field: 'id', parameter: 'region'}],
      optionsView: {tableName: 'Countries', viewId: 'list'}, valuePolicy: {mode: 'retain'}}]}
    const source = new ScenarioViewConfig('S', JSON.stringify(input))
    const legacy = [{relationId: 'DB-R:Orders:Items', sourceRelationId: 'DB-R', parentTable: 'Orders', childTable: 'Items', referencedTables: []}]
    const scoped = source.selectModelScope('Items', legacy)
    expect(Object.keys(scoped.toJSON()['tables'] as object).sort()).toEqual(['Countries', 'Inputs', 'Items', 'Orders', 'Region', 'Tax'])
    expect(scoped.usesNativeResourceRelations).toBe(false)
    expect(scoped.toJSON()).toMatchObject({resourceRelations: input.resourceRelations, viewCascades: input.viewCascades})
    expect(scoped.resolveResourceRelationEndpoints(legacy)[0]).toMatchObject({relationName: 'lines', cascadeUpdate: true})
    expect(source.toJSON()).toEqual(input)
    expect(() => source.selectModelScope('Items', [])).toThrow(/来源引用未唯一解析/)
    expect(() => source.selectModelScope('Items', [...legacy, ...legacy])).toThrow(/来源引用未唯一解析/)
  })
  it('rejects missing related dependencies but does not validate unrelated legacy branches', () => {
    const source = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', tables}))
    const dependencies = [{relationId: 'R', sourceRelationId: 'DB-R', parentTable: 'Orders', childTable: 'Items', referencedTables: ['Missing']}]
    expect(() => source.selectModelScope('Orders', dependencies)).toThrow(/Missing/)
    expect(Object.keys(source.selectModelScope('Ignored', dependencies).toJSON()['tables'] as object)).toEqual(['Ignored'])
  })
  it('validates only changed cascade dependencies without converting unchanged legacy relationships', () => {
    const original = {scenarioId: 'S', tables, resourceRelations: [{sourceRelationId: 'old', parentTable: 'Region', childTable: 'Ignored'}],
      viewCascades: [{parentTable: 'Orders', parentViewId: 'default', childTable: 'Items', childViewId: 'default',
        filterBindings: [{sourceField: 'id', targetField: 'id'}], autoLoad: false}]}
    const before = new ScenarioViewConfig('S', JSON.stringify(original))
    const after = new ScenarioViewConfig('S', JSON.stringify({...original, viewCascades: [{...original.viewCascades[0], autoLoad: true}]}))
    const selected = ScenarioDefinitionRecords.validationScope(after, before, [ScenarioDefinitionRecords.resources.DataViewCascadeDefinition])!
    expect(Object.keys(selected.toJSON()['tables'] as object)).toEqual(['Orders', 'Items'])
    expect(selected.toJSON()).toMatchObject({schemaVersion: 2, resourceRelations: []})
    expect(after.toJSON()).toMatchObject({resourceRelations: original.resourceRelations})
    expect(after.usesNativeResourceRelations).toBe(false)
    expect(ScenarioDefinitionRecords.validationScope(before, before, [ScenarioDefinitionRecords.resources.DataViewCascadeDefinition])).toBeNull()
    const removed = new ScenarioViewConfig('S', JSON.stringify({...original, viewCascades: []}))
    expect(ScenarioDefinitionRecords.validationScope(removed, before, [ScenarioDefinitionRecords.resources.DataViewCascadeDefinition])).toBeNull()
  })
  it('keeps every multi-parent and option endpoint with connected query cascades and lookup consumers', () => {
    const tableMap = {...tables, Tax: {...tables['Tax'], views: {default: {queryConfig: {filterLookups: [
      {field: 'id', sourceViewKey: 'S@OrdersModel@default', matchField: 'id', valueField: 'id'},
    ]}}}}}
    const original = {scenarioId: 'S', tables: tableMap, viewCascades: [
      {parentTable: 'Region', parentViewId: 'default', childTable: 'Items', childViewId: 'default', filterBindings: [{targetField: 'id'}]},
    ]}
    const next = {...original, viewCascades: [...original.viewCascades, {kind: 'field', cascadeId: 'choice', tableName: 'Orders', viewId: 'default',
      targetField: 'country', valueFormat: 'native', parents: [{tableName: 'Inputs', viewId: 'default', field: 'id', parameter: 'input'},
        {tableName: 'Region', viewId: 'default', field: 'id', parameter: 'region'}], optionsView: {tableName: 'Countries', viewId: 'default'}, valuePolicy: {mode: 'retain'}}]}
    const before = new ScenarioViewConfig('S', JSON.stringify(original)), after = new ScenarioViewConfig('S', JSON.stringify(next))
    expect(Object.keys(after.selectCascadeValidationScope(before)!.toJSON()['tables'] as object).sort()).toEqual(['Countries', 'Inputs', 'Items', 'Orders', 'Region', 'Tax'])
    const wrong = new ScenarioViewConfig('S', JSON.stringify({...next, layout: {tablePositions: {Orders: {x: 1, y: 2}}}}))
    expect(() => wrong.selectCascadeValidationScope(before)).toThrow(/其他结构变更/)
    expect(after.toJSON()).toEqual(next)
  })
  it('rejects a missing model and unresolved explicit third-table references instead of omitting them', () => {
    const source = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', schemaVersion: 2, tables,
      resourceRelations: [{relationId: 'bad', parentTable: 'Orders', childTable: 'Items',
        filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetExpData', Exp: '1', refTableName: 'missing'}}}]}))
    expect(() => source.selectModelScope('missing')).toThrow(/模型|表/)
    expect(() => source.selectModelScope('Orders')).toThrow(/missing/)
  })
})

function projectionFixture(field: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ scenarioId: 'UNIT-SCENE', tables: { Orders: {
    modelBinding: { modelId: 'UNIT-ORDERS', modelName: 'OrdersModel' },
    views: { default: { fieldProjection: [field] } },
  } } })
}

describe('ScenarioViewFile', () => {
  it('submits shared configuration through native DataSet changes and skips unchanged files', async () => {
    const save = vi.spyOn(DataSet.prototype, 'saveChanges')
    try {
      const {workspace, writeText} = workspaceFixture()
      const file = await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
      await workspace.saveScenarioViews({scenarioId: 'UNIT-SCENE'})
      expect(writeText).not.toHaveBeenCalled()
      file.setText(fixture(31))
      await workspace.saveScenarioViews({scenarioId: 'UNIT-SCENE'})
      expect(save).toHaveBeenCalledTimes(1)
      expect(writeText).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE', fixture(31), fixture())
      expect(file.isDirty).toBe(false)
      expect(file.getText()).toBe(fixture(31))
      expect(Object.values(save.mock.contexts[0]!.tables).every(table => table.modelBinding === undefined)).toBe(true)
    } finally {save.mockRestore()}
  })
  it('preserves unbound design nodes without allowing business data in layout', () => {
    const layout = {unboundNodes: {DRAFT: {label: '待配置模型', x: -1, y: 2}}, unboundEdges: {EDGE: {source: 'MODEL', target: 'DRAFT'}}}
    const file = new ScenarioViewFile('UNIT-SCENE', JSON.stringify({scenarioId: 'UNIT-SCENE', tables: {}, layout}))
    expect(new ScenarioViewFile('UNIT-SCENE', file.getText()).value.toJSON()['layout']).toEqual(layout)
    for (const node of [{label: '', x: 1, y: 2}, {label: 'test', x: null, y: 2}, {label: 'test', x: 1, y: 2, rows: []}]) {
      expect(() => file.setText(JSON.stringify({scenarioId: 'UNIT-SCENE', tables: {}, layout: {unboundNodes: {DRAFT: node}}}))).toThrow()
    }
    for (const edge of [{source: '', target: 'DRAFT'}, {source: ' MODEL', target: 'DRAFT'}, {source: 'MODEL', target: 1},
      {source: 'MODEL', target: 'DRAFT', filterExpression: {}}]) {
      expect(() => file.setText(JSON.stringify({scenarioId: 'UNIT-SCENE', tables: {}, layout: {unboundEdges: {EDGE: edge}}}))).toThrow()
    }
    expect(() => file.setText(JSON.stringify({scenarioId: 'UNIT-SCENE', tables: {}, layout,
      resourceRelations: [{relationId: 'EDGE'}]}))).toThrow('身份冲突')
    expect(file.value.toJSON()['layout']).toEqual(layout)
  })

  it('roundtrips conditional multi-value candidate filters and rejects malformed operators without changing the draft', () => {
    const input = {parentTable: 'Orders', parentViewId: 'list', childTable: 'Items', childViewId: 'detail',
      when: [{field: 'open', equals: true}, {field: 'type', equals: 'table'}],
      filterBindings: [{sourceField: 'name', targetField: 'name', operator: 'contains', omitEmpty: true},
        {sourceField: 'database', targetField: 'database', operator: 'contains', omitEmpty: true}]}
    const config = {...JSON.parse(fixture()), viewCascades: [input]}
    const file = new ScenarioViewFile('UNIT-SCENE', JSON.stringify(config))
    expect(new ScenarioViewFile('UNIT-SCENE', file.getText()).value.toJSON()['viewCascades']).toEqual([input])
    const text = file.getText()
    for (const operator of [['contains'], {}, 'like', 1]) {
      expect(() => file.setText(JSON.stringify({...config, viewCascades: [{...input,
        filterBindings: [{sourceField: 'name', targetField: 'name', operator}]}]}))).toThrow()
      expect(file.getText()).toBe(text)
    }
    expect(() => file.setText(JSON.stringify({...config, viewCascades: [{...input, when: []}]}))).toThrow()
    expect(file.getText()).toBe(text)
  })

  it('preserves query input mappings on save/reopen and rejects overlapping targets', () => {
    const input = {parentTable: 'Orders', parentViewId: 'list', childTable: 'Items', childViewId: 'detail',
      filterBindings: [], inputBindings: [{sourceField: 'context', target: 'queryContext', format: 'json'},
        {sourceField: 'limit', target: 'queryConfig.maxRows', when: {field: 'all', equals: true}}]}
    const config = JSON.parse(fixture()) as Record<string, unknown>
    config['viewCascades'] = [input]
    const file = new ScenarioViewFile('UNIT-SCENE', JSON.stringify(config))
    const reopened = new ScenarioViewFile('UNIT-SCENE', file.getText())
    expect(reopened.value.toJSON()['viewCascades']).toEqual([input])
    expect(() => file.setText(JSON.stringify({...config, viewCascades: [input, {...input, parentViewId: 'default'}]}))).toThrow('QUERY_CASCADE_INPUT')
    expect(file.getText()).toBe(reopened.getText())
  })
  it('reports the same formal request policy code with a file path and preserves the prior draft', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    const revision = file.revision
    const invalid = JSON.stringify({scenarioId: 'UNIT-SCENE', tables: {Orders: {
      modelBinding: {modelId: 'UNIT-ORDERS', modelName: 'OrdersModel'}, views: {default: {}},
      api: {list: {url: '/api/query', headers: {Authorization: 'untrusted'}}},
    }}})
    expect(() => file.setText(invalid)).toThrow('SPARK_SAVE_CONFIG_HEADERS')
    expect(() => file.setText(invalid)).toThrow('tables.Orders.api.list')
    expect(file.getText()).toBe(fixture())
    expect(file.revision).toBe(revision)
    expect(file.canUndo).toBe(false)
  })

  it('notifies subscribers after valid edits, saved baselines, undo and reload', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    const states: boolean[] = []
    const unsubscribe = file.subscribe(() => states.push(file.isDirty))
    file.setText(fixture(30))
    file.markSaved(file.getText())
    file.undo()
    file.loadText(fixture(50))
    expect(states).toEqual([true, false, true, false])
    unsubscribe()
    file.setText(fixture(60))
    expect(states).toHaveLength(4)
  })
  it('owns one scene with multiple named views and explicit cascades without runtime DataSet serialization', () => {
    const text = fixture()
    const file = new ScenarioViewFile('UNIT-SCENE', text)
    expect(file.getText()).toBe(text)
    expect(file.isDirty).toBe(false)
    expect(file.value.toJSON()).toEqual(JSON.parse(text))
    expect(file.value.toJSON()).toMatchObject({ tables: { Orders: { views: { list: {
      autoCurrentFirst: false, selectionDelimiter: '', filterExpression: { value: false },
    } } } }, viewCascades: [{ autoLoad: false }] })
  })

  it('retains recommended and extended table business categories without normalizing their text', () => {
    const input = JSON.parse(fixture())
    input.tables.Orders.businessCategory = 'master'
    input.tables.Items.businessCategory = '  partner-specific  '
    const text = JSON.stringify(input)
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    file.setText(text)
    expect(file.getText()).toBe(text)
    expect(file.value.toJSON()).toMatchObject({tables: {Orders: {businessCategory: 'master'},
      Items: {businessCategory: '  partner-specific  '}}})
  })

  it('rejects invalid category edits atomically and allows clearing by deleting the property', () => {
    const input = JSON.parse(fixture())
    input.tables.Orders.businessCategory = 'child'
    const valid = JSON.stringify(input)
    const file = new ScenarioViewFile('UNIT-SCENE', valid)
    const revision = file.revision
    for (const value of [null, '', '  ', 0, false, {}]) {
      input.tables.Orders.businessCategory = value
      expect(() => file.setText(JSON.stringify(input))).toThrow('businessCategory')
      expect(file.getText()).toBe(valid)
      expect(file.revision).toBe(revision)
      expect(file.canUndo).toBe(false)
      expect(file.isDirty).toBe(false)
    }
    delete input.tables.Orders.businessCategory
    file.setText(JSON.stringify(input))
    expect(file.value.toJSON()).toMatchObject({tables: {Orders: {views: {default: {}}}}})
    expect(JSON.stringify(file.value.toJSON())).not.toContain('businessCategory')
  })

  it('retains native DataSet top-level configuration in the immutable file value', () => {
    const configured = JSON.stringify({...JSON.parse(fixture()), schemaVersion: 3, version: 0,
      saveChanges: {mode: 'perView'}, layout: {tablePositions: {Orders: {x: -1.5, y: 0}}}})
    const file = new ScenarioViewFile('UNIT-SCENE', configured)
    expect(file.value.toJSON()).toMatchObject({schemaVersion: 3, version: 0,
      saveChanges: {mode: 'perView'}, layout: {tablePositions: {Orders: {x: -1.5, y: 0}}}})
    expect(Object.isFrozen(file.value.toJSON()['layout'])).toBe(true)
  })

  it('retains model layout independently of bindings and rejects invalid coordinates atomically', () => {
    const text = JSON.stringify({scenarioId: 'UNIT-SCENE', tables: {}, layout: {modelPositions: {MODEL: {x: -20, y: 0}}}})
    const file = new ScenarioViewFile('UNIT-SCENE', text)
    expect(file.value.toJSON()).toEqual(JSON.parse(text))
    for (const modelPositions of [{MODEL: {x: '1', y: 0}}, {MODEL: {x: 1, y: null}}, {' MODEL ': {x: 1, y: 0}}, {MODEL: {x: 1, y: 0, rows: []}}]) {
      expect(() => file.setText(JSON.stringify({scenarioId: 'UNIT-SCENE', tables: {}, layout: {modelPositions}}))).toThrow()
      expect(file.getText()).toBe(text)
      expect(file.isDirty).toBe(false)
    }
  })

  it('rejects invalid DataSet top-level edits before changing text or history', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    const base: Record<string, unknown> = JSON.parse(fixture())
    const invalid: Record<string, unknown>[] = [
      {schemaVersion: 0}, {schemaVersion: 1.5}, {schemaVersion: Number.MAX_SAFE_INTEGER + 1},
      {version: -1}, {version: 1.5}, {version: Number.MAX_SAFE_INTEGER + 1},
      {layout: {tablePositions: {Unknown: {x: 0, y: 1}}}},
      {layout: {tablePositions: {Orders: {x: null, y: 1}}}},
      {layout: {tablePositions: {Orders: {x: 0, y: 1, z: 2}}}},
      {layout: {graphVersion: 1, nodes: [], edges: []}},
      {saveChanges: {mode: 'transaction'}}, {saveChanges: {mode: 'perView', transaction: {endpoint: {url: '/other'}}}},
      {saveChanges: {mode: 'perView', unknown: true}},
      {dataSetName: 'shadow'}, {pageId: 'PAGE'}, {resourceRelations: [{}]},
    ]
    for (const change of invalid) {
      expect(() => file.setText(JSON.stringify({...base, ...change}))).toThrow()
      expect(file.getText()).toBe(fixture())
      expect(file.canUndo).toBe(false)
      expect(file.isDirty).toBe(false)
    }
  })

  it('marks the submitted text saved while keeping edits made during saving dirty', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    file.setText(fixture(30))
    const submitted = file.getText()
    file.setText(fixture(40))
    file.markSaved(submitted)
    expect(file.isDirty).toBe(true)
    expect(file.undo()).toBe(true)
    expect(file.getText()).toBe(submitted)
    expect(file.isDirty).toBe(false)
    expect(file.redo()).toBe(true)
    expect(file.isDirty).toBe(true)
  })

  it('validates before changing content, history or the saved baseline', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    expect(() => file.setText('{')).toThrow()
    expect(file.canUndo).toBe(false)
    file.setText(fixture(30))
    const current = file.getText()
    expect(() => file.loadText('{}')).toThrow()
    expect(() => file.markSaved('{}')).toThrow()
    expect(file.getText()).toBe(current)
    expect(file.isDirty).toBe(true)
    expect(file.canUndo).toBe(true)
  })

  it('loads a validated saved file and resets history', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    file.setText(fixture(30))
    file.loadText(fixture(50))
    expect(file.isDirty).toBe(false)
    expect(file.canUndo).toBe(false)
    expect(file.canRedo).toBe(false)
  })

  it('keeps configuration immutable through nested value exits', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    const config = file.value.toJSON()
    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config['tables'])).toBe(true)
    expect(Reflect.set(config, 'scenarioId', 'OTHER')).toBe(false)
    expect(file.value.scenarioId).toBe('UNIT-SCENE')
  })

  it.each(['', '{}', JSON.stringify({ scenarioId: 'OTHER', tables: {} }),
    JSON.stringify({ scenarioId: 'UNIT-SCENE', dataSetName: 'old', tables: {} }),
    JSON.stringify({ dataSets: { one: { scenarioId: 'UNIT-SCENE' } } })])('rejects missing identity, other scenes and old or multi-scene envelopes: %s', text => {
    expect(() => new ScenarioViewFile('UNIT-SCENE', text)).toThrow()
  })

  it.each(['rows', 'permissionSnapshot', 'resourceType', 'resourceId', 'addApi'])('rejects formal definitions and runtime state in a model: %s', key => {
    const input = { scenarioId: 'UNIT-SCENE', tables: { Orders: {
      modelBinding: { modelId: 'UNIT-MODEL', modelName: 'Orders' }, views: { default: {} }, [key]: [],
    } } }
    expect(() => new ScenarioViewFile('UNIT-SCENE', JSON.stringify(input))).toThrow(key)
  })

  it('keeps native column validation values and rejects invalid edits atomically', () => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    const withColumns = (columns: unknown) => JSON.stringify({scenarioId: 'UNIT-SCENE', tables: {
      Orders: {modelBinding: {modelId: 'UNIT-ORDERS', modelName: 'OrdersModel'}, columns, views: {default: {}}},
    }})
    const valid = withColumns([{name: 'title', required: false, minLength: 0, maxLength: 8,
      min: 0, max: 10, pattern: '', patternMessage: ''}])
    file.setText(valid)
    expect(file.value.toJSON()).toMatchObject({tables: {Orders: {columns: [{name: 'title',
      required: false, minLength: 0, min: 0, pattern: '', patternMessage: ''}]}}})
    const invalid = [
      [{name: 'title', type: 'string'}], [{name: 'title', computeExpression: '1'}],
      [{name: ' title'}], [{name: 'title'}, {name: 'title'}],
      [{name: 'title', required: 0}], [{name: 'title', minLength: -1}],
      [{name: 'title', minLength: 4, maxLength: 3}], [{name: 'title', min: 2, max: 1}],
      [{name: 'title', max: null}], [{name: 'title', pattern: '['}],
    ]
    for (const columns of invalid) {
      expect(() => file.setText(withColumns(columns))).toThrow()
      expect(file.getText()).toBe(valid)
    }
    expect(file.undo()).toBe(true)
    expect(file.getText()).toBe(fixture())
    expect(file.canRedo).toBe(true)
  })

  it('retains a local computed column and rejects formal identity or control fields', () => {
    const configured = (column: Record<string, unknown>) => JSON.stringify({scenarioId: 'UNIT-SCENE', tables: {
      Orders: {modelBinding: {modelId: 'UNIT-ORDERS', modelName: 'OrdersModel'},
        columns: [column], views: {default: {}}},
    }})
    const local = {name: 'total', type: 'number', label: 'Total', computeExpression: 'price * qty', min: 0}
    const file = new ScenarioViewFile('UNIT-SCENE', configured(local))
    expect(file.value.toJSON()).toMatchObject({tables: {Orders: {columns: [local]}}})
    for (const invalid of [
      {...local, name: '_pk'}, {...local, name: 'lingma_sys_key'},
      {...local, fieldId: 'DB-FIELD'}, {...local, isPrimaryKey: true},
      {...local, computeExpression: ''}, {...local, type: ''},
    ]) expect(() => file.setText(configured(invalid))).toThrow()
    expect(file.getText()).toBe(configured(local))
  })

  it.each(['rows', 'total', 'dirty', 'permissionSnapshot', 'currentRow', 'scenarioId',
    'tableName', 'viewId', 'unknown', 'constructor', '__proto__'])('rejects runtime or identity values inside a view: %s', key => {
    const input = { scenarioId: 'UNIT-SCENE', tables: { Orders: {
      modelBinding: { modelId: 'UNIT-MODEL', modelName: 'Orders' }, views: { default: { [key]: [] } },
    } } }
    expect(() => new ScenarioViewFile('UNIT-SCENE', JSON.stringify(input))).toThrow(key)
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    const revision = file.revision
    expect(() => file.setText(JSON.stringify(input))).toThrow(key)
    expect(file.getText()).toBe(fixture())
    expect(file.revision).toBe(revision)
    expect(file.canUndo).toBe(false)
    expect(file.canRedo).toBe(false)
    expect(file.isDirty).toBe(false)
  })

  it('rejects old filter dialect and unresolved cascade view references', () => {
    expect(() => new ScenarioViewFile('UNIT-SCENE', fixture().replace('"operator":"eq"', '"op":"eq"'))).toThrow('filterExpression')
    expect(() => new ScenarioViewFile('UNIT-SCENE', fixture().replace('"childViewId":"detail"', '"childViewId":"missing"'))).toThrow('missing')
  })

  it('retains a field cascade beside query cascades and rejects invalid edits atomically', () => {
    const base = JSON.parse(fixture())
    const field = {kind: 'field', cascadeId: 'city-by-region', tableName: 'Orders', viewId: 'list',
      valueFormat: 'native', targetField: 'city',
      parents: [{tableName: 'Orders', viewId: 'list', field: 'country', parameter: 'countryId'}, {tableName: 'Orders', viewId: 'list', field: 'province', parameter: 'provinceId'}],
      optionsView: {tableName: 'Items', viewId: 'detail'},
      valuePolicy: {mode: 'retain-valid', clearValue: null}}
    const valid = JSON.stringify({...base, viewCascades: [...base.viewCascades, field]})
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    file.setText(valid)
    expect(file.value.toJSON()).toMatchObject({viewCascades: [expect.objectContaining({childTable: 'Items'}), field]})
    expect(Object.isFrozen(file.value.toJSON()['viewCascades'])).toBe(true)
    for (const invalid of [
      {...field, unknown: 1}, {...field, rowMode: 'current-row'}, {...field, valuePolicy: undefined},
      {...field, parents: [{tableName: 'Orders', viewId: 'list', field: 'country', parameter: 'x'}, {tableName: 'Orders', viewId: 'list', field: 'province', parameter: 'x'}]},
      {...field, optionsView: {...field.optionsView, viewId: 'missing'}},
      {...field, valuePolicy: {mode: 'clear'}},
    ]) {
      expect(() => file.setText(JSON.stringify({...base, viewCascades: [...base.viewCascades, invalid]}))).toThrow()
      expect(file.getText()).toBe(valid)
    }
    const cycle = {...field, cascadeId: 'country-by-city', targetField: 'country',
      parents: [{tableName: 'Orders', viewId: 'list', field: 'city', parameter: 'cityId'}], valuePolicy: {mode: 'retain'}}
    expect(() => file.setText(JSON.stringify({...base, viewCascades: [field, cycle]}))).toThrow('FIELD_CASCADE_CYCLE')
    expect(file.getText()).toBe(valid)
  })

  it('preserves the complete projection contract including false, zero and empty strings', () => {
    const text = projectionFixture(validProjection)
    expect(new ScenarioViewFile('UNIT-SCENE', text).getText()).toBe(text)
    const derived = projectionFixture({ ...validProjection, source: 'derived', resourceFieldId: null,
      valueFunction: JSON.stringify({ Type: 'GetConstValue', Value: false }) })
    expect(new ScenarioViewFile('UNIT-SCENE', derived).getText()).toBe(derived)
  })

  it.each([{ fieldId: '' }, { resourceField: '' }, { viewField: '' }, { source: 'unknown' },
    { resourceFieldId: null }, { source: 'derived', resourceFieldId: 'FIELD' }, { type: 1 }, { label: null },
    { output: 'false' }, { primaryKey: 1 }, { distinct: null }, { sortOrder: 1.5 }, { group: '0' },
    { sortDirection: 'descending' }, { value: false }, { valueFunction: {} }, { expression: null },
  ])('rejects malformed projections before replacing editable content: %j', change => {
    const file = new ScenarioViewFile('UNIT-SCENE', fixture())
    expect(() => file.setText(projectionFixture({ ...validProjection, ...change }))).toThrow('fieldProjection')
    expect(file.getText()).toBe(fixture())
    expect(file.isDirty).toBe(false)
    expect(file.canUndo).toBe(false)
  })
})

function deferred<T>() {
  let complete: ((value: T) => void) | undefined
  const promise = new Promise<T>(resolve => { complete = resolve })
  return { promise, resolve: (value: T) => {
    if (complete === undefined) throw new Error('promise resolver is missing')
    complete(value)
  } }
}

function workspaceFixture() {
  let scope = 'request-a'
  let remoteText: string | null = fixture()
  const readText = vi.fn(async (_scenarioId: string) => remoteText)
  const writeText = vi.fn(async (_scenarioId: string, text: string) => { remoteText = text })
  const snapshots = new Map<number, string>([[0, fixture(10)]])
  const storeSnapshot = (version: number, text: string) => snapshots.set(version, text)
  const listVersions = vi.fn(async () => [...snapshots.keys()].map(version => ({ version, fileName: `${version}__pagedata.json`, lastModified: null })))
  const readVersion = vi.fn(async (_scenarioId: string, version: number) => { const text = snapshots.get(version); if (text === undefined) throw new Error('snapshot missing'); return text })
  const createVersion = vi.fn(async ({scenarioId, version, text, onAttempt, assertCurrent}: ScenarioViewVersionCreateCommand) => {
    assertCurrent?.()
    onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope, version, fileName: `${version}__pagedata.json`, text})
    storeSnapshot(version, text)
    return { version, fileName: `${version}__pagedata.json`, lastModified: null }
  })

  const workspace = new ProjectWorkspace({ projectId: 'UNIT-PROJECT',
    blueprint: {},
    scenarioViews: { readScope: () => scope, readText, writeText, listVersions, readVersion, createVersion },
  })
  return { workspace, readText, writeText, listVersions, readVersion, createVersion, storeSnapshot,
    setScope: (value: string) => { scope = value },
    setRemote: (value: string | null) => { remoteText = value },
  }
}

describe('ProjectWorkspace scenario files', () => {
  it('passes the exact captured preimage to the scenario write adapter', async () => {
    const {workspace, writeText} = workspaceFixture()
    const preimage = fixture()
    const file = await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    file.setText(fixture(30))

    await workspace.saveScenarioViews({scenarioId: 'UNIT-SCENE'})

    expect(writeText).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE', fixture(30), preimage)
  })

  it('settles an explicit write rejection after DataSet save exits and preserves edits made while pending', async () => {
    const {workspace, writeText} = workspaceFixture()
    const file = await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    const savedBaseline = file.savedText
    file.setText(fixture(30))
    const error = new ScenarioViewWriteNotAppliedError('repository:scenario-view:UNIT-SCENE', 'CONFLICT', 'preimage changed')
    writeText.mockImplementationOnce(async () => {
      expect(file.saveStatus).toBe('pending')
      expect(file.submission?.text).toBe(fixture(30))
      file.setText(fixture(40))
      throw error
    })

    await expect(workspace.saveScenarioViews({scenarioId: 'UNIT-SCENE'})).rejects.toBe(error)

    expect(file.saveStatus).toBe('idle')
    expect(file.submission).toBeNull()
    expect(file.savedText).toBe(savedBaseline)
    expect(file.getText()).toBe(fixture(40))
    expect(file.isDirty).toBe(true)
  })

  it('keeps a typed error from readback unknown because only write rejection can settle not-applied', async () => {
    const {workspace, readText, writeText} = workspaceFixture()
    const file = await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    file.setText(fixture(30))
    let readsAfterLoad = 0
    readText.mockImplementation(async () => {
      readsAfterLoad++
      if (readsAfterLoad === 2) throw new ScenarioViewWriteNotAppliedError('repository:scenario-view:UNIT-SCENE', 'CONFLICT', 'not a write receipt')
      return fixture()
    })

    await expect(workspace.saveScenarioViews({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('not a write receipt')

    expect(writeText).toHaveBeenCalledOnce()
    expect(file.saveStatus).toBe('unknown')
    expect(file.submission?.text).toBe(fixture(30))
  })

  it.each(['changed', 'invalid', 'missing', 'valid'] as const)('only cancels native edits after all remote checks succeed (%s)', async state => {
    const {workspace, setRemote, writeText} = workspaceFixture()
    const file = await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    file.setText(fixture(30))
    const revision = file.revision
    const remote = state === 'missing' ? null : state === 'invalid' ? '{' : fixture(40)
    setRemote(remote)
    const beforeApply = vi.fn(() => {
      expect(file.getText()).toBe(fixture(30))
      expect(file.revision).toBe(revision)
    })
    const result = workspace.adoptScenarioViews({scenarioId: 'UNIT-SCENE', expectedRevision: revision,
      previewText: state === 'changed' ? fixture(50) : remote, beforeApply})
    if (state === 'changed' || state === 'invalid') {
      await expect(result).rejects.toThrow()
      expect(beforeApply).not.toHaveBeenCalled()
      expect(file.getText()).toBe(fixture(30)); expect(file.revision).toBe(revision)
    } else {
      await result
      expect(beforeApply).toHaveBeenCalledOnce()
      expect(workspace.getScenarioViews('UNIT-SCENE')?.getText() ?? null).toBe(remote)
    }
    expect(writeText).not.toHaveBeenCalled()
  })

  it.each([false, true])('preserves the local file when the adoption caller expires during remote read (missing=%s)', async missing => {
    const {workspace, readText, writeText} = workspaceFixture()
    const file = await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    file.setText(fixture(30))
    const waiting = deferred<string | null>(), previewText = missing ? null : fixture(40)
    readText.mockImplementationOnce(async () => waiting.promise)
    let active = true
    const pending = workspace.adoptScenarioViews({scenarioId: 'UNIT-SCENE', expectedRevision: file.revision, previewText,
      assertCurrent: () => {if (!active) throw new Error('CALLER_STALE')}})
    const rejected = expect(pending).rejects.toThrow('CALLER_STALE')
    active = false; waiting.resolve(previewText); await rejected
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBe(file)
    expect(file.getText()).toBe(fixture(30)); expect(file.isDirty).toBe(true)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('retains an unknown first write across later edits and confirms its exact remote submission', async () => {
    const { workspace, setRemote, writeText } = workspaceFixture()
    setRemote(null)
    const file = await workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture(30) })
    writeText.mockImplementationOnce(async (_id, text) => { setRemote(text); throw new Error('network after dispatch') })
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('network after dispatch')
    expect(file.saveStatus).toBe('unknown')
    expect(file.submittedText).toBe(fixture(30))
    file.setText(fixture(40))
    expect(await workspace.verifyScenarioViews({ scenarioId: 'UNIT-SCENE' })).toBe('confirmed')
    expect(file.isPersisted).toBe(true)
    expect(file.isDirty).toBe(true)
    expect(file.getText()).toBe(fixture(40))
    expect(file.savedText).toBe(fixture(30))
  })

  it('keeps pre-dispatch failures out of unknown and can explicitly adopt remote content', async () => {
    const { workspace, setRemote, writeText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    setRemote(fixture(40))
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('SCENARIO_VIEW_CONFLICT')
    expect(file.saveStatus).toBe('idle')
    expect(writeText).not.toHaveBeenCalled()
    const revision = file.revision
    const remote = await workspace.previewScenarioViewsRemote({ scenarioId: 'UNIT-SCENE' })
    await workspace.adoptScenarioViews({ scenarioId: 'UNIT-SCENE', expectedRevision: revision, previewText: remote })
    expect(file.getText()).toBe(fixture(40))
    expect(file.isDirty).toBe(false)
  })

  it('invalidates a discarded missing-file draft so old consumers cannot edit it', async () => {
    const { workspace, setRemote } = workspaceFixture()
    setRemote(null)
    const file = await workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture(30) })
    await workspace.adoptScenarioViews({ scenarioId: 'UNIT-SCENE', expectedRevision: file.revision, previewText: null })
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
    expect(() => file.setText(fixture(40))).toThrow('SCENARIO_VIEW_FILE_INVALID')
  })
  it('rejects an old remote adoption when the same file receives a save receipt while reading', async () => {
    const { workspace, readText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    const revision = file.revision
    const waiting = deferred<string | null>()
    readText.mockImplementationOnce(async () => waiting.promise)
    const adopting = workspace.adoptScenarioViews({ scenarioId: 'UNIT-SCENE', expectedRevision: revision, previewText: fixture() })
    await vi.waitFor(() => expect(readText).toHaveBeenCalledTimes(2))
    file.beginSave(fixture(30), fixture())
    file.confirmSubmitted()
    waiting.resolve(fixture())
    await expect(adopting).rejects.toThrow('DRAFT_STALE')
    expect(file.savedText).toBe(fixture(30))
  })
  it('does not dispatch a shared file save when the calling page expires during pre-read', async () => {
    const {workspace, readText, writeText} = workspaceFixture()
    const file = await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    file.setText(fixture(30))
    const waiting = deferred<string | null>()
    readText.mockImplementationOnce(async () => waiting.promise)
    let active = true
    const saving = workspace.saveScenarioViews({scenarioId: 'UNIT-SCENE',
      assertCurrent: () => {if (!active) throw new Error('PAGE_RUNTIME_STALE')}})
    active = false
    waiting.resolve(fixture())
    await expect(saving).rejects.toThrow('PAGE_RUNTIME_STALE')
    expect(writeText).not.toHaveBeenCalled()
    expect(file.saveStatus).toBe('idle')
  })
  it('requires explicit creation after verified absence and confirms its real first write', async () => {
    const { workspace, setRemote, writeText } = workspaceFixture()
    setRemote(null)
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('FILE_MISSING')
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
    const file = await workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture() })
    expect(file.isDirty).toBe(true)
    expect(file.isPersisted).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
    await workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })
    expect(file.isPersisted).toBe(true)
    expect(file.isDirty).toBe(false)
  })

  it('cannot create over an existing file or save over an externally created file', async () => {
    const { workspace, setRemote, writeText } = workspaceFixture()
    await expect(workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture() })).rejects.toThrow('EXISTS')
    setRemote(null)
    const file = await workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture() })
    setRemote(fixture(90))
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('CONFLICT')
    expect(writeText).not.toHaveBeenCalled()
    expect(file.isDirty).toBe(true)
  })

  it('rechecks a cached load before returning it to an asynchronous caller', async () => {
    const { workspace, setScope } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    const cached = workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    setScope('request-b')
    await expect(cached).rejects.toThrow('STALE')
  })

  it('rejects missing IO and invalid scope without reading an old page file', async () => {
    const workspace = new ProjectWorkspace({ projectId: 'UNIT-PROJECT',
      blueprint: {},
    })
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('IO')
    const configured = workspaceFixture()
    configured.setScope('')
    await expect(configured.workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('STALE')
    expect(configured.readText).not.toHaveBeenCalled()
  })

  it('releases a failed load so a corrected scene can be read again', async () => {
    const { workspace, readText } = workspaceFixture()
    readText.mockResolvedValueOnce('{}')
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow()
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).resolves.toBeInstanceOf(ScenarioViewFile)
  })

  it('coalesces concurrent loads of the same scene into one shared file', async () => {
    const { workspace, readText } = workspaceFixture()
    const waiting = deferred<string>()
    readText.mockReturnValueOnce(waiting.promise)
    const first = workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    const second = workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    waiting.resolve(fixture())
    const files = await Promise.all([first, second])
    expect(files[0]).toBe(files[1])
    expect(readText).toHaveBeenCalledTimes(1)
  })

  it('shares one owner per explicit scene and never reads a page file', async () => {
    const { workspace, readText } = workspaceFixture()
    const first = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    expect(await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).toBe(first)
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBe(first)
    expect(readText).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE')
    await expect(workspace.loadScenarioViews({ scenarioId: '' })).rejects.toThrow('scenarioId')
  })

  it('rejects dirty reloads including edits made while a reload is waiting', async () => {
    const { workspace, readText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE', forceReload: true })).rejects.toThrow('UNSAVED')
    expect(readText).toHaveBeenCalledTimes(1)
    file.undo()
    const waiting = deferred<string>()
    readText.mockReturnValueOnce(waiting.promise)
    const reload = workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE', forceReload: true })
    file.setText(fixture(40))
    waiting.resolve(fixture(50))
    await expect(reload).rejects.toThrow('UNSAVED')
    expect(file.getText()).toBe(fixture(40))
  })

  it('rejects late loads and never publishes another request scope into the cache', async () => {
    const { workspace, readText, setScope } = workspaceFixture()
    const waiting = deferred<string>()
    readText.mockReturnValueOnce(waiting.promise)
    const loading = workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    setScope('request-b')
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
    waiting.resolve(fixture())
    await expect(loading).rejects.toThrow('STALE')
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
    expect(await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })).toBeInstanceOf(ScenarioViewFile)
  })

  it('checks the remote baseline and marks only submitted text saved after readback', async () => {
    const { workspace, writeText, setRemote } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    const writing = deferred<void>()
    writeText.mockImplementationOnce(async () => { await writing.promise })
    const saving = workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE', fixture(30), fixture()))
    file.setText(fixture(40))
    setRemote(fixture(30))
    writing.resolve()
    await saving
    expect(file.getText()).toBe(fixture(40))
    expect(file.isDirty).toBe(true)
    file.undo()
    expect(file.isDirty).toBe(false)
  })

  it('refuses a remote conflict before writing', async () => {
    const { workspace, writeText, setRemote } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    setRemote(fixture(50))
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('CONFLICT')
    expect(writeText).not.toHaveBeenCalled()
    expect(file.isDirty).toBe(true)
  })

  it('saves and validates exact text without normalizing it', async () => {
    const { workspace, readText, writeText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    const submitted = ` \n${fixture(30)}\n`
    file.setText(submitted)
    await workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })
    expect(writeText).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE', submitted, fixture())
    expect(readText).toHaveBeenCalledTimes(3)
    expect(file.isDirty).toBe(false)
  })

  it('retains the submitted baseline when remote readback cannot confirm a write', async () => {
    const { workspace, writeText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    writeText.mockImplementationOnce(async () => {})
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('UNCONFIRMED')
    expect(file.isDirty).toBe(true)
    file.undo()
    expect(file.isDirty).toBe(true)
    expect(await workspace.verifyScenarioViews({ scenarioId: 'UNIT-SCENE' })).toBe('not-applied')
    expect(file.isDirty).toBe(false)
  })

  it('rejects another save or forced reload while a save is pending', async () => {
    const { workspace, writeText, setRemote } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    const waiting = deferred<void>()
    writeText.mockImplementationOnce(async () => { await waiting.promise })
    const saving = workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    file.undo()
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('PENDING')
    await expect(workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE', forceReload: true })).rejects.toThrow('PENDING')
    setRemote(fixture(30))
    waiting.resolve()
    await saving
    expect(file.getText()).toBe(fixture())
    expect(file.isDirty).toBe(true)
  })

  it('does not mark a file saved after its request scope changes during writing', async () => {
    const { workspace, writeText, setScope } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(30))
    writeText.mockImplementationOnce(async () => { setScope('request-b') })
    await expect(workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('STALE')
    expect(file.isDirty).toBe(true)
    expect(workspace.getScenarioViews('UNIT-SCENE')).toBeNull()
  })
  it('rejects a legacy file-only draft when saving scenario definitions without silently saving or dropping it',async()=>{
    const {workspace,writeText}=workspaceFixture();const file=await workspace.loadScenarioViews({scenarioId:'UNIT-SCENE'});file.setText(fixture(55))
    expect(workspace.dirtyScenarioIds).toEqual(['UNIT-SCENE'])
    await expect(workspace.saveDirtyScenarioDefinitions()).rejects.toThrow('SCENARIO_DEFINITION_UNAVAILABLE')
    expect(writeText).not.toHaveBeenCalled();expect(file.getText()).toBe(fixture(55))
    expect(workspace.dirtyScenarioIds).toEqual(['UNIT-SCENE'])
  })

})


describe('ProjectWorkspace shared scenario versions', () => {
  it('lists and previews actual zero-numbered snapshots without modifying a dirty working file', async () => {
    const { workspace, writeText } = workspaceFixture()
    const file = await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    file.setText(fixture(50))
    expect(await workspace.listScenarioVersions({ scenarioId: 'UNIT-SCENE' })).toEqual([{ version: 0, fileName: '0__pagedata.json', lastModified: null }])
    expect(await workspace.previewScenarioVersion({ scenarioId: 'UNIT-SCENE', version: 0 })).toBe(fixture(10))
    expect(file.getText()).toBe(fixture(50)); expect(file.isDirty).toBe(true)
    expect(writeText).not.toHaveBeenCalled()
  })
  it('creates and verifies a snapshot only from the clean persisted working file', async () => {
    const { workspace, createVersion, readVersion } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    await workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })
    expect(createVersion).toHaveBeenCalledExactlyOnceWith({scenarioId: 'UNIT-SCENE', version: 1, text: fixture(),
      onAttempt: expect.any(Function), assertCurrent: expect.any(Function)})
    expect(readVersion).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE', 1)
  })
  it('requires verification after a snapshot write loses its receipt instead of creating another snapshot', async () => {
    const { workspace, createVersion, storeSnapshot } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text})
      storeSnapshot(version, text)
      throw new Error('snapshot response lost')
    })

    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('snapshot response lost')
    expect(createVersion).toHaveBeenCalledOnce()
    expect(workspace.hasPendingScenarioVersionAttempt).toBe(true)
    expect(() => workspace.dispose()).toThrow('原场景快照结果未核验')
    expect(workspace.hasPendingScenarioVersionAttempt).toBe(true)
    const file = workspace.getScenarioViews('UNIT-SCENE')!
    file.setText(fixture(40))
    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('UNKNOWN')
    expect(await workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).toMatchObject({
      state: 'confirmed', version: 1, fileName: '1__pagedata.json',
    })
    expect(workspace.hasPendingScenarioVersionAttempt).toBe(false)
    expect(workspace.hasPendingScenarioVersionAttempt).toBe(false)
    expect(file.getText()).toBe(fixture(40))
    expect(file.isDirty).toBe(true)
    expect(createVersion).toHaveBeenCalledOnce()
  })
  it('keeps an unknown attempt when its original number is absent or its exact file has different text', async () => {
    const {workspace, createVersion, listVersions, readVersion, storeSnapshot} = workspaceFixture()
    await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text})
      storeSnapshot(version, text)
      throw new Error('receipt lost')
    })
    await expect(workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('receipt lost')
    listVersions.mockResolvedValueOnce([{version: 8, fileName: '8__pagedata.json', lastModified: null}])
    expect(await workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'unknown', version: 1})
    expect(readVersion).not.toHaveBeenCalled()

    listVersions.mockResolvedValueOnce([{version: 1, fileName: '1__pagedata.json', lastModified: null}])
    readVersion.mockResolvedValueOnce(fixture(99))
    expect(await workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'unknown', version: 1})
    expect(readVersion).toHaveBeenCalledExactlyOnceWith('UNIT-SCENE', 1)
  })
  it('leaves an absent exact snapshot unknown, then confirms only after the same N and text appear', async () => {
    const {workspace, createVersion, listVersions, readVersion, storeSnapshot} = workspaceFixture()
    await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text})
      throw new Error('response lost')
    })
    await expect(workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('response lost')
    expect(await workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'unknown', version: 1})
    storeSnapshot(1, fixture())
    expect(await workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'confirmed', version: 1})
    expect(listVersions).toHaveBeenCalledTimes(3)
    expect(readVersion).toHaveBeenCalledOnce()
  })
  it('records a precise typed not-applied attempt without treating it as unknown', async () => {
    const {workspace, createVersion} = workspaceFixture()
    await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      const attempt = {scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text}
      onAttempt(attempt)
      throw new ScenarioViewVersionNotAppliedError(attempt.resourceId, attempt.scope, version, 'number occupied')
    })
    await expect(workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('number occupied')
    expect(workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'not-applied', version: 1})
    expect(workspace.hasPendingScenarioVersionAttempt).toBe(false)
    expect(workspace.hasPendingScenarioVersionAttempt).toBe(false)
  })
  it('does not classify a typed readback failure as not-applied after create returned', async () => {
    const {workspace, createVersion, readVersion} = workspaceFixture()
    await workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    readVersion.mockRejectedValueOnce(new ScenarioViewVersionNotAppliedError(
      'test:scenario:UNIT-SCENE', 'request-a', 1, 'readback unavailable'))
    await expect(workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('readback unavailable')
    expect(workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'unknown', version: 1})
    await expect(workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('UNKNOWN')
    expect(createVersion).toHaveBeenCalledOnce()
  })
  it('rejects a second snapshot creation while the original create attempt is pending', async () => {
    const { workspace, createVersion, storeSnapshot } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    const waiting = deferred<void>()
    createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text})
      await waiting.promise
      storeSnapshot(version, text)
      return { version, fileName: `${version}__pagedata.json`, lastModified: null }
    })

    const creating = workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })
    await vi.waitFor(() => expect(createVersion).toHaveBeenCalledOnce())
    expect(workspace.hasPendingScenarioVersionAttempt).toBe(true)
    expect(workspace.hasPendingScenarioVersionAttempt).toBe(true)
    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('PENDING')
    waiting.resolve()
    await creating
    expect(workspace.hasPendingScenarioVersionAttempt).toBe(false)
    expect(workspace.hasPendingScenarioVersionAttempt).toBe(false)
    expect(createVersion).toHaveBeenCalledOnce()
  })
  it('rejects snapshots for dirty or not-yet-persisted drafts', async () => {
    const { workspace, createVersion, setRemote } = workspaceFixture()
    setRemote(null)
    const file = await workspace.createScenarioViews({ scenarioId: 'UNIT-SCENE', text: fixture() })
    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('UNSAVED')
    await workspace.saveScenarioViews({ scenarioId: 'UNIT-SCENE' }); file.setText(fixture(30))
    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('UNSAVED')
    expect(createVersion).not.toHaveBeenCalled()
  })
  it('rejects an invalid snapshot receipt or stale request scope after a snapshot write', async () => {
    const { workspace, createVersion, setScope } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text})
      return { version, fileName: `${version}__rule.json`, lastModified: null }
    })
    await expect(workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('UNCONFIRMED')
    const staleFixture = workspaceFixture()
    await staleFixture.workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    staleFixture.createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text})
      staleFixture.setScope('request-b')
      return { version, fileName: `${version}__pagedata.json`, lastModified: null }
    })
    await expect(staleFixture.workspace.createScenarioVersion({ scenarioId: 'UNIT-SCENE' })).rejects.toThrow('STALE')
  })
  it('does not transfer an unknown attempt across scope changes or a replaced scenario owner', async () => {
    const scoped = workspaceFixture()
    await scoped.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    scoped.createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text})
      throw new Error('receipt lost')
    })
    await expect(scoped.workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('receipt lost')
    scoped.setScope('request-b')
    expect(scoped.workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'idle'})
    await expect(scoped.workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('ATTEMPT_NONE')
    expect(scoped.readVersion).not.toHaveBeenCalled()

    const replaced = workspaceFixture()
    await replaced.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    replaced.createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text})
      throw new Error('receipt lost')
    })
    await expect(replaced.workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('receipt lost')
    replaced.setScope('request-b')
    await replaced.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    replaced.setScope('request-a')
    await replaced.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    expect(replaced.workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'idle'})
    await expect(replaced.workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('OWNER_CHANGED')
    await expect(replaced.workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('UNKNOWN')
    expect(replaced.workspace.hasPendingScenarioVersionAttempt).toBe(false)
    expect(replaced.readVersion).not.toHaveBeenCalled()
  })
  it('does not guard or retain an old unknown attempt as the active owner after its scope is replaced', async () => {
    const fixture = workspaceFixture()
    await fixture.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    fixture.createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text})
      throw new Error('receipt lost')
    })
    await expect(fixture.workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('receipt lost')
    expect(fixture.workspace.hasPendingScenarioVersionAttempt).toBe(true)

    fixture.setScope('request-b')
    expect(fixture.workspace.hasPendingScenarioVersionAttempt).toBe(false)
    expect(fixture.workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'idle'})
    await expect(fixture.workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('ATTEMPT_NONE')
    await fixture.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    expect(fixture.workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'idle'})
    await expect(fixture.workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('ATTEMPT_NONE')
    expect(fixture.readVersion).not.toHaveBeenCalled()

    fixture.setScope('request-a')
    await fixture.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    expect(fixture.workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'idle'})
    await expect(fixture.workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('OWNER_CHANGED')
    await expect(fixture.workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('UNKNOWN')
    expect(fixture.workspace.hasPendingScenarioVersionAttempt).toBe(false)
    expect(() => fixture.workspace.dispose()).not.toThrow()
  })
  it('does not expose a confirmed attempt after its file owner is removed', async () => {
    const workspaceOwner = workspaceFixture()
    const file = await workspaceOwner.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    await workspaceOwner.workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})
    expect(workspaceOwner.workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'confirmed', version: 1})
    workspaceOwner.setRemote(null)
    await workspaceOwner.workspace.adoptScenarioViews({scenarioId: 'UNIT-SCENE', expectedRevision: file.revision, previewText: null})
    expect(workspaceOwner.workspace.getScenarioViews('UNIT-SCENE')).toBeNull()

    expect(workspaceOwner.workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'idle'})
    expect(workspaceOwner.workspace.hasPendingScenarioVersionAttempt).toBe(false)
    workspaceOwner.setRemote(fixture())
    await workspaceOwner.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    expect(workspaceOwner.workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'idle'})
    expect(workspaceOwner.workspace.hasPendingScenarioVersionAttempt).toBe(false)
    expect(() => workspaceOwner.workspace.dispose()).not.toThrow()
  })
  it('does not surface an old unknown attempt through a replacement file owner', async () => {
    const workspaceOwner = workspaceFixture()
    const file = await workspaceOwner.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})
    workspaceOwner.createVersion.mockImplementationOnce(async ({scenarioId, version, text, onAttempt}: ScenarioViewVersionCreateCommand) => {
      onAttempt({scenarioId, resourceId: `test:scenario:${scenarioId}`, scope: 'request-a', version,
        fileName: `${version}__pagedata.json`, text})
      throw new Error('receipt lost')
    })
    await expect(workspaceOwner.workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('receipt lost')
    workspaceOwner.setRemote(null)
    await workspaceOwner.workspace.adoptScenarioViews({scenarioId: 'UNIT-SCENE', expectedRevision: file.revision, previewText: null})
    workspaceOwner.setRemote(fixture())
    await workspaceOwner.workspace.loadScenarioViews({scenarioId: 'UNIT-SCENE'})

    expect(workspaceOwner.workspace.getScenarioVersionStatus({scenarioId: 'UNIT-SCENE'})).toMatchObject({state: 'idle'})
    expect(workspaceOwner.workspace.hasPendingScenarioVersionAttempt).toBe(false)
    await expect(workspaceOwner.workspace.verifyScenarioVersionAttempt({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('OWNER_CHANGED')
    await expect(workspaceOwner.workspace.createScenarioVersion({scenarioId: 'UNIT-SCENE'})).rejects.toThrow('UNKNOWN')
    expect(workspaceOwner.createVersion).toHaveBeenCalledOnce()
    expect(() => workspaceOwner.workspace.dispose()).not.toThrow()
  })
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid version %s before IO', async version => {
    const { workspace, readVersion, writeText } = workspaceFixture()
    await workspace.loadScenarioViews({ scenarioId: 'UNIT-SCENE' })
    await expect(workspace.previewScenarioVersion({ scenarioId: 'UNIT-SCENE', version })).rejects.toThrow('安全整数')
    expect(readVersion).not.toHaveBeenCalled(); expect(writeText).not.toHaveBeenCalled()
  })
})

describe('registered file resource binding persistence', () => {
  it('adds a file DataTableBindingDefinition and its views without inventing a database model identity', () => {
    const before = new ScenarioViewConfig('S', JSON.stringify({scenarioId: 'S', tables: {
      Parent: {modelBinding: {modelId: 'P', modelName: 'Parent'}, views: {default: {}}},
    }}))
    const bindingRows = ScenarioDefinitionRecords.read(before, ScenarioDefinitionRecords.resources.DataTableBindingDefinition)
    bindingRows.push({dataSetId: 'S', tableName: 'AgentWorkflowFiles', resourceType: 'file',
      configuration: {resourceType: 'file', resourceId: 'agent-workflow-files', columns: [
        {name: 'workflowId', type: 'string', isPrimaryKey: true}, {name: 'content', type: 'string'},
      ]}})
    const withBinding = ScenarioDefinitionRecords.write({config: before,
      resource: ScenarioDefinitionRecords.resources.DataTableBindingDefinition, rows: bindingRows})
    const viewRows = ScenarioDefinitionRecords.read(withBinding, ScenarioDefinitionRecords.resources.DataViewDefinition)
    viewRows.push({dataSetId: 'S', tableName: 'AgentWorkflowFiles', viewId: 'directory', pageSize: 100})
    viewRows.push({dataSetId: 'S', tableName: 'AgentWorkflowFiles', viewId: 'definition', queryContext: {workflowId: 'x'}})

    const result = ScenarioDefinitionRecords.write({config: withBinding,
      resource: ScenarioDefinitionRecords.resources.DataViewDefinition, rows: viewRows})

    expect(result.toJSON()['tables']).toMatchObject({AgentWorkflowFiles: {
      resourceType: 'file', resourceId: 'agent-workflow-files',
      columns: [{name: 'workflowId', type: 'string', isPrimaryKey: true}, {name: 'content', type: 'string'}],
      views: {default: {}, directory: {pageSize: 100}, definition: {queryContext: {workflowId: 'x'}}},
    }})
    expect((result.toJSON()['tables'] as Record<string, Record<string, unknown>>)['AgentWorkflowFiles']).not.toHaveProperty('modelBinding')
  })
})
