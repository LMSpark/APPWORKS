import {expect, it} from 'vitest'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {dataSpacePageFixture} from '../data-space-page.fixture'

it.each([false, true])('reads child-plan fields from the formal model independently of a narrow default projection (%s)', async narrowDefault => {
  const f = dataSpacePageFixture({formalProjection: true, formalPrimaryKey: 'rowid', sourceFields: [
    {rowid: 'KEY', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
    {rowid: 'OUTPUT', dataModelId: 'M1', Name: 'name', type: 'dataModel', FieldType: 'string', IsOutput: 1},
    {rowid: 'FILTER', dataModelId: 'M1', Name: 'internal', type: 'dataModel', FieldType: 'string', IsOutput: 0},
  ]})
  f.setModelValues({Type: '数据库表', DbId: 'DB', PrimaryKeyFields: 'rowid'})
  const projection = DataSpaceDesignApi.createFieldProjection(DataSpaceDesignApi.projectModel(f.modelRow(), [
    {rowid: 'KEY', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsPKey: 1, IsOutput: 1},
    {rowid: 'OUTPUT', dataModelId: 'M1', Name: 'name', type: 'dataModel', FieldType: 'string', IsOutput: 1},
  ], 'rowid')).filter(field => field.resourceField === 'rowid')
  f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {
    OrdersAlias: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {
      named: {}, default: narrowDefault ? {fieldProjection: projection} : {},
    }},
  }}))
  const session = await f.open('A')
  try {
    await session.loadDefinition()
    await session.metadataDataSet.getView('DataViewDefinition')!.requestData()
    const [catalog] = await Promise.all([
      session.loadQueryPlanFields({tableName: 'OrdersAlias', modelId: 'M1', modelName: 'Orders'}),
      session.loadViewFields({tableName: 'OrdersAlias', modelId: 'M1', modelName: 'Orders', viewId: 'default'}),
    ])
    expect(session.getViewFields({tableName: 'OrdersAlias', modelId: 'M1', modelName: 'Orders', viewId: 'default'})?.filter(field => field.name !== '_pk').map(field => field.name)).toEqual(narrowDefault ? ['rowid'] : ['rowid', 'name'])
    expect(catalog.outputColumns.map(field => field.name)).toEqual(['rowid', 'name'])
    expect(catalog.filterColumns.map(field => field.name)).toEqual(['rowid', 'name', 'internal'])
    expect(catalog.context.tables?.[0]?.fields?.map(field => field.name)).toContain('internal')
    expect(f.fileWrites).toEqual([])
    f.invalidate()
    await expect(session.loadQueryPlanFields({tableName: 'OrdersAlias', modelId: 'M1', modelName: 'Orders'})).rejects.toThrow()
  } finally {f.dispose()}
})
