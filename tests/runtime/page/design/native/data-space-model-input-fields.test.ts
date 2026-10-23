import {afterEach, describe, expect, it, vi} from 'vitest'
import {RequestState, getDataViewFilterFunctionDefinitions, type DataViewFilterValueFunction} from '@spark-appworks/spark-data'
import {dataSpacePageFixture} from './data-space-page.fixture'
import {LowcodeDataSpaceFieldValue} from '@/lowcode/data-space/model-source/field-value/lowcode-data-space-field-value'

const fixtures: ReturnType<typeof dataSpacePageFixture>[] = []
afterEach(() => {vi.restoreAllMocks(); fixtures.splice(0).forEach(f => f.dispose())})
function setup(extra: Parameters<typeof dataSpacePageFixture>[0] = {}) {
  const f = dataSpacePageFixture({sourceFields: [
    {rowid: 'OWN', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: 1},
    {rowid: 'TARGET', dataModelId: 'M1', Name: 'parentId', type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: 0, ValueFun: ''},
    {rowid: 'PARENT', dataModelId: 'M2', Name: 'customer', description: '客户', type: 'dataModel'},
    {rowid: 'ARG', dataModelId: 'M2', Name: 'upstreamArgument', type: 'inputParams'},
  ], ...extra}); fixtures.push(f)
  f.stored.set('A', JSON.stringify({scenarioId: 'A', tables: {
    OrderKey: {modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}}},
    CustomerKey: {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}},
  }, resourceRelations: [{relationId: 'native', parentTable: 'CustomerKey', childTable: 'OrderKey',
    filterExpression: {logic: 'or', filters: [{field: 'rowid', operator: 'ne', value: 'not-an-equi-join'}, {field: 'rowid', operator: 'eq', value: ''}]}}]}))
  return f
}

describe('request panel model input fields', () => {
  it.each(['designer', 'model-preview', 'named-preview'].flatMap(mode => [false, true].map(upstream => ({mode, upstream}))))(
    'keeps non-output model columns out of $mode function candidates (upstream=$upstream)', async ({mode, upstream}) => {
      const f = setup({overviewOnly: mode === 'designer', deferDefinition: true, formalProjection: true, sourceFields: [
        {rowid: 'OWN', dataModelId: 'M1', Name: 'rowid', type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: 1},
        {rowid: 'VISIBLE', dataModelId: 'M1', Name: 'caption', type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: 0},
        {rowid: 'INTERNAL', dataModelId: 'M1', Name: 'internal', AsName: 'internalAlias', type: 'dataModel', FieldType: 'string', IsOutput: 0, IsPKey: 0},
      ]})
      f.setModelValues({Type: '数据库表'})
      const config = JSON.parse(f.stored.get('A')!)
      config.schemaVersion = 2
      if (upstream) Object.assign(config.resourceRelations[0], {parentTable: 'OrderKey', childTable: 'CustomerKey'})
      f.stored.set('A', JSON.stringify(config))
      const session = await f.open('A'), selected = upstream
        ? {tableName: 'CustomerKey', modelId: 'M2', modelName: 'Customers', viewId: 'default'}
        : {tableName: 'OrderKey', modelId: 'M1', modelName: 'Orders', viewId: 'default'}
      const preview = mode === 'designer' ? undefined : mode === 'named-preview' ? await session.openPreview(selected)
        : await session.openModelPreview({modelId: selected.modelId, modelName: selected.modelName})
      try {
        const reads = f.modelReads.length
        const context = preview ? await session.loadPreviewFilterContext(preview) : await session.loadViewFilterContext(selected)
        expect(context.tables?.find(table => table.name === 'Orders')?.fields?.map(field => field.name)).toEqual(['rowid', 'caption'])
        expect(context.relatedFields?.some(field => String(field.value).includes('internalAlias'))).toBe(false)
        if (preview && !upstream) {
          expect(preview.view.dataTable!.columns.map(column => column.name)).toContain('internalAlias')
          expect(f.modelReads.slice(reads).some(input => input.modelId === 'M1')).toBe(false)
        }
        expect(f.fileWrites).toEqual([])
      } finally {preview?.dispose()}
    })

  it.each([false, true])('reads the exact view model from a partial formal catalog (new=%s)', async fresh => {
    const f = setup({overviewOnly: true, deferDefinition: true})
    if (fresh) f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, resourceRelations: [], tables: {}}))
    const session = await f.open('A'), models = session.metadataDataSet.getView('Base_DataModel')!
    const selected = {tableName: fresh ? 'FreshOrders' : 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'}
    if (fresh) await session.metadataDataSet.getView('DataViewDefinition')!.addRow({dataSetId: 'A', dataModelId: 'M1',
      dataModelName: 'Orders', tableName: selected.tableName, viewId: selected.viewId})
    expect((await models.loadFromServer({page: 1, pageSize: 1})).success).toBe(true)
    expect(models.rows).toHaveLength(1); expect(models.total).toBeGreaterThan(1)
    expect(models.rows[0]?.['rowid']).toBe('M1')
    const before = f.requests.length
    await session.loadViewFields(selected)
    expect(session.getViewFields(selected)?.filter(column => column.name !== '_pk').map(column => column.name)).toEqual(['rowid', 'parentId'])
    expect(f.modelReads.map(read => read.modelId)).toEqual(['M1'])
    expect(f.requests).toHaveLength(before)
    expect(f.fileWrites).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    await models.loadFromServer({page: 2, pageSize: 1})
    expect(models.rows.some(row => row['rowid'] === 'M1')).toBe(false)
    expect(() => session.getViewFields(selected)).toThrow('字段目录模型身份不可确认')
  })

  it('reads fields and function context for a first pending view without first saving its binding', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, tables: {}}))
    const session = await f.open('A'), view = session.metadataDataSet.getView('DataViewDefinition')!
    const selected = {tableName: 'FreshOrders', viewId: 'review', modelId: 'M1', modelName: 'Orders'}
    await view.addRow({dataSetId: 'A', dataModelId: 'M1', dataModelName: 'Orders', tableName: selected.tableName, viewId: selected.viewId})
    await session.loadViewFields(selected)
    expect(session.getViewFields(selected)?.filter(column => column.name !== '_pk').map(column => column.name)).toEqual(['rowid', 'parentId'])
    const context = await session.loadViewFilterContext(selected)
    expect(context.tables).toEqual([{name: 'Orders', fields: [{name: 'rowid', label: 'rowid'}, {name: 'parentId', label: 'parentId'}]}])
    expect(f.modelReads.map(read => read.modelId)).toEqual(['M1'])
    expect(f.fileWrites).toEqual([])
    expect(session.definitionStatus).toBe('unloaded')
    view.discardPendingChanges()
    expect(() => session.getViewFields(selected)).toThrow(/绑定|身份/)
  })

  it('rejects a late field directory after its new view draft is cancelled', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, tables: {}}))
    const session = await f.open('A'), view = session.metadataDataSet.getView('DataViewDefinition')!
    const selected = {tableName: 'FreshOrders', viewId: 'review', modelId: 'M1', modelName: 'Orders'}
    await view.addRow({dataSetId: 'A', dataModelId: 'M1', dataModelName: 'Orders', tableName: selected.tableName, viewId: selected.viewId})
    const release = f.holdDefinitionRead(), pending = session.loadViewFields(selected)
    const rejected = expect(pending).rejects.toThrow(/绑定|身份|过期/)
    expect(f.modelReads.map(read => read.modelId)).toEqual(['M1'])
    view.discardPendingChanges(); release(); await rejected
    expect(session.metadataDataSet.getTable('DataViewFieldOption')!.rows).toEqual([])
    expect(f.fileWrites).toEqual([])
  })

  it('saves the first pending view through DataSet and reopens its referenced model without copying fields', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, tables: {}}))
    const session = await f.open('A'), view = session.metadataDataSet.getView('DataViewDefinition')!
    const selected = {tableName: 'FreshOrders', viewId: 'review', modelId: 'M1', modelName: 'Orders'}
    await view.addRow({dataSetId: 'A', dataModelId: 'M1', dataModelName: 'Orders', tableName: selected.tableName, viewId: selected.viewId})
    await session.loadViewFields(selected)
    const saved = await session.metadataDataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
    expect(saved.success).toBe(true)
    expect(f.fileWrites).toHaveLength(1)
    const stored = JSON.parse(f.stored.get('A')!)
    expect(stored.tables.FreshOrders).toMatchObject({modelBinding: {modelId: 'M1', modelName: 'Orders'}, views: {default: {}, review: {}}})
    expect(stored.tables.FreshOrders).not.toHaveProperty('columns')
    const reopened = await f.open('A')
    await reopened.loadViewFields(selected)
    expect(reopened.getViewFields(selected)?.some(column => column.name === 'parentId')).toBe(true)
  })

  it.each(['model', 'space', 'conflict'])('rejects an invalid first pending view identity (%s)', async invalid => {
    const f = setup({overviewOnly: true, deferDefinition: true})
    f.stored.set('A', JSON.stringify({scenarioId: 'A', schemaVersion: 2, tables: {}}))
    const session = await f.open('A'), view = session.metadataDataSet.getView('DataViewDefinition')!
    const selected = {tableName: 'FreshOrders', viewId: 'review', modelId: 'M1', modelName: 'Orders'}
    const adding = view.addRow({dataSetId: invalid === 'space' ? 'OTHER' : 'A', dataModelId: 'M1',
      dataModelName: invalid === 'model' ? 'WrongModel' : 'Orders', tableName: selected.tableName, viewId: selected.viewId})
    if (invalid === 'space') await expect(adding).rejects.toThrow('SCENARIO_DEFINITION_TARGET')
    else {
      await adding
      if (invalid === 'conflict') await view.addRow({dataSetId: 'A', dataModelId: 'M2', dataModelName: 'Customers', tableName: selected.tableName, viewId: 'other'})
      await expect(session.loadViewFields(selected)).rejects.toThrow(/身份|绑定/)
    }
    expect(f.modelReads).toEqual([])
    expect(f.fileWrites).toEqual([])
  })

  it('uses loaded model IDs for field choices while requiring a complete directory for name lookup', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true})
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2; f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), models = session.metadataDataSet.getView('Base_DataModel')!
    await models.loadFromServer({page: 1, pageSize: 1})
    await session.loadModelFields('M1')
    const values = new LowcodeDataSpaceFieldValue({dataSet: session.metadataDataSet, targetId: 'A', modelId: 'M1', viewId: 'modelFields'})
    const before = f.requests.length
    expect(values.read().context.tables?.[0]).toEqual({name: 'Orders', fields: [{name: 'rowid'}, {name: 'parentId'}]})
    expect(() => values.validate('{"Type":"GetTableField","Field":"rowid"}')).not.toThrow()
    expect(() => values.validate('{"Type":"GetExpData","refTableName":"Orders"}')).toThrow('Base_DataModel未完整读取')
    await expect(session.loadModelInputFields('M1')).rejects.toThrow('上游模型身份不可确认')
    expect(f.requests).toHaveLength(before)
    await models.loadFromServer({page: 2, pageSize: 1})
    const reads = f.requests.length, rootInputs = await session.loadModelInputFields('M2')
    expect(rootInputs.rows).toEqual([]); expect(f.requests).toHaveLength(reads)
    expect(models.rows).toHaveLength(1); expect(models.total).toBe(2)
    expect(f.fileWrites).toEqual([])
  })

  it.each(['loadModelFields', 'loadSourceInputFields', 'loadModelInputFields'] as const)(
    '%s rejects hidden ownership before publishing any field rows', async load => {
      const f = setup({overviewOnly: true, deferDefinition: true, sourceInput: true, hiddenFieldProperties: ['dataModelId']})
      const session = await f.open('A'), viewId = {loadModelFields: 'modelFields', loadSourceInputFields: 'sourceInputFields', loadModelInputFields: 'modelInputFields'}[load]
      const view = session.metadataDataSet.getView('Base_DataModel_Field', viewId)!
      const published: unknown[][] = []
      view.events.on('rowsChanged', () => {if (view.rows.length) published.push([...view.rows])})
      await expect(session[load]('M1')).rejects.toThrow('返回范围不符')
      expect(published).toEqual([]); expect(view.rows).toEqual([])
      expect(view.requestState).toBe(RequestState.Failed)
      expect(view.loadingError?.message).toContain('返回范围不符')
      expect(f.fileWrites).toEqual([])
    })

  it.each(['loadModelFields', 'loadSourceInputFields', 'loadModelInputFields'] as const)(
    '%s keeps native readback guarded and preserves the last confirmed rows on failure', async load => {
      const hidden: string[] = []
      const f = setup({overviewOnly: true, deferDefinition: true, sourceInput: true, hiddenFieldProperties: hidden})
      const session = await f.open('A'), view = await session[load]('M1'), original = view.rows, published = vi.fn()
      expect(original.length).toBeGreaterThan(0)
      view.events.on('rowsChanged', published)
      hidden.push('dataModelId')
      await expect(view.loadFromServer()).rejects.toThrow('返回范围不符')
      expect(published).not.toHaveBeenCalled(); expect(view.rows).toBe(original)
      expect(view.requestState).toBe(RequestState.Failed)
      hidden.length = 0
      expect((await view.loadFromServer()).success).toBe(true)
      expect(view.requestState).toBe(RequestState.Loaded); expect(published).toHaveBeenCalledTimes(1)
      expect(f.fileWrites).toEqual([])
    })

  it.each([false, true])('uses the preview model fields and only reads formal upstream function fields (named=%s)', async named => {
    const f = setup({deferDefinition: true}), config = JSON.parse(f.stored.get('A')!)
    config.schemaVersion = 2; f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A')
    const preview = named ? await session.openPreview({tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'})
      : await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    const reads = f.modelReads.length, assemblies = f.assemblyScopes.length
    const context = await session.loadPreviewFilterContext(preview)
    expect(context.tables?.map(table => table.name)).toEqual(['Orders', 'Customers'])
    expect(context.tables?.[0]?.fields?.map(field => field.name)).toEqual(['rowid', 'parentId'])
    expect(context.relatedFields).toEqual([{label: 'Customers.rowid', value: 'Customers.rowid'}, {label: 'Customers.parentId', value: 'Customers.parentId'}])
    expect(f.modelReads.slice(reads).map(input => input.modelId)).toEqual(['M2'])
    expect(f.assemblyScopes).toHaveLength(assemblies)
    expect(f.fileWrites).toEqual([]); preview.dispose()
  })

  it('offers an unbound formal model in its preview without inventing a named view binding', async () => {
    const f = setup({deferDefinition: true}), config = JSON.parse(f.stored.get('A')!)
    delete config.tables.OrderKey; config.schemaVersion = 2; config.resourceRelations = []
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), preview = await session.openModelPreview({modelId: 'M1', modelName: 'Orders'})
    const context = await session.loadPreviewFilterContext(preview)
    expect(context.tables?.map(table => table.name)).toEqual(['Orders'])
    expect(context.relatedFields).toEqual([]); expect(f.modelReads).toEqual([])
    expect(f.fileWrites).toEqual([]); preview.dispose()
  })

  it.each(['scope', 'dispose', 'file'] as const)('rejects obsolete preview function context after %s changes', async change => {
    const f = setup({deferDefinition: true}), config = JSON.parse(f.stored.get('A')!)
    config.schemaVersion = 2; f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), preview = await session.openPreview({tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'})
    const release = f.holdDefinitionRead(), pending = session.loadPreviewFilterContext(preview)
    const rejected = expect(pending).rejects.toThrow()
    if (change === 'scope') f.invalidate()
    if (change === 'dispose') preview.dispose()
    if (change === 'file') f.workspaces[0]!.getScenarioViews('A')!.setText(JSON.stringify({...config, viewCascades: []}))
    release(); await rejected; preview.dispose()
    expect(f.fileWrites).toEqual([])
  })

  it('reads the selected view function models and upstream fields without assembling the target', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true, broken: true})
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2; f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A')
    const context = await session.loadViewFilterContext({tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'})
    expect(context.tables?.map(table => table.name)).toEqual(['Orders', 'Customers'])
    expect(context.tables?.[0]?.fields?.map(field => field.name)).toEqual(['rowid', 'parentId'])
    expect(context.tables?.[1]?.fields?.map(field => field.name)).toEqual(['rowid', 'parentId'])
    expect(context.relatedFields).toEqual([{label: 'Customers.rowid', value: 'Customers.rowid'}, {label: 'Customers.parentId', value: 'Customers.parentId'}])
    expect(f.modelReads.map(input => input.modelId).sort()).toEqual(['M1', 'M2'])
    expect(session.definitionStatus).toBe('unloaded')
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.requestState).toBe(RequestState.Idle)
    expect(f.fileWrites).toEqual([])
  })

  it('does not offer downstream models as the root view function context', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true})
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2; f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A')
    const context = await session.loadViewFilterContext({tableName: 'CustomerKey', viewId: 'default', modelId: 'M2', modelName: 'Customers'})
    expect(context.tables?.map(table => table.name)).toEqual(['Customers'])
    expect(context.relatedFields).toEqual([])
    expect(f.modelReads.map(input => input.modelId)).toEqual(['M2'])
  })

  it.each(['scope', 'dispose', 'file'] as const)('rejects obsolete view function context after %s changes', async change => {
    const f = setup({overviewOnly: true, deferDefinition: true}), session = await f.open('A')
    const release = f.holdDefinitionRead()
    const pending = session.loadViewFilterContext({tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'})
    const rejected = expect(pending).rejects.toThrow()
    if (change === 'scope') f.invalidate()
    if (change === 'dispose') session.dispose()
    if (change === 'file') f.workspaces[0]!.getScenarioViews('A')!.setText(JSON.stringify({...JSON.parse(f.stored.get('A')!), viewCascades: []}))
    release(); await rejected
    expect(f.fileWrites).toEqual([])
  })

  it('reads relation endpoints without the target projection, then loads another binding on demand', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true, broken: true})
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2
    config.tables.LaterKey = {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}}
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), view = session.metadataDataSet.getView('DataResourceRelationDefinition')!, key = view.getPkKey(view.rows[0]!)!
    await session.loadRelationDefinitions()
    const [catalog, concurrent] = await Promise.all([session.loadRelationFields(key), session.loadRelationFields(key)])
    expect(catalog.columns.map(column => column.name)).toEqual(['rowid', 'OrderKey.rowid', 'parentId', 'OrderKey.parentId'])
    expect(concurrent.columns).toEqual(catalog.columns)
    expect(f.modelReads.map(input => input.modelId).sort()).toEqual(['M1', 'M2'])
    const later = catalog.context.tables!.find(table => table.name === 'LaterKey')!
    expect(later.fields).toBeUndefined()
    expect(await later.loadFields!()).toEqual(expect.arrayContaining([{name: 'rowid', label: 'rowid'}]))
    expect(f.modelReads).toHaveLength(3)
    expect(f.assemblyScopes).toEqual([])
    expect(session.definitionStatus).toBe('unloaded')
    expect(f.fileWrites).toEqual([])
  })

  it('does not publish cached function fields after their formal model snapshot changes', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), config = JSON.parse(f.stored.get('A')!)
    config.schemaVersion = 2
    config.tables.LaterKey = {modelBinding: {modelId: 'M2', modelName: 'Customers'}, views: {default: {}}}
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), view = session.metadataDataSet.getView('DataResourceRelationDefinition')!, key = view.getPkKey(view.rows[0]!)!
    const initial = await session.loadRelationFields(key), old = initial.context.tables!.find(table => table.name === 'LaterKey')!
    await old.loadFields!()
    const models = session.metadataDataSet.getView('Base_DataModel')!
    models.replaceRows(models.rows.map(row => row['rowid'] === 'M2' ? {...row, description: 'changed formal model'} : row))
    await expect(old.loadFields!()).rejects.toThrow('模型身份已变化')
    const fresh = await session.loadRelationFields(key), later = fresh.context.tables!.find(table => table.name === 'LaterKey')!
    expect(later.fields).toBeUndefined()
    await later.loadFields!()
    expect(f.modelReads).toHaveLength(5)
    expect(f.assemblyScopes).toEqual([])
  })

  it.each(['file', 'model', 'scope', 'dispose'] as const)('rejects relation field loading after %s identity changes', async change => {
    const f = setup({overviewOnly: true, deferDefinition: true}), config = JSON.parse(f.stored.get('A')!)
    config.schemaVersion = 2; f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), view = session.metadataDataSet.getView('DataResourceRelationDefinition')!, key = view.getPkKey(view.rows[0]!)!
    const release = f.holdDefinitionRead(), pending = session.loadRelationFields(key)
    const rejected = expect(pending).rejects.toThrow(/过期|身份|失效|DISPOSED|STALE/)
    if (change === 'file') f.workspaces.at(-1)!.getScenarioViews('A')!.setText(JSON.stringify({...config, version: 22}))
    if (change === 'model') session.metadataDataSet.getView('Base_DataModel')!.configure({queryContext: {dataSpaceId: 'B'}})
    if (change === 'scope') f.invalidate()
    if (change === 'dispose') session.dispose()
    release(); await rejected
    expect(f.fileWrites).toEqual([])
  })

  it('does not read relation fields when a formal model identity is hidden', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true, hiddenModelProperties: ['Name']})
    const session = await f.open('A'), view = session.metadataDataSet.getView('DataResourceRelationDefinition')!, key = view.getPkKey(view.rows[0]!)!
    await expect(session.loadRelationFields(key)).rejects.toThrow('字段目录模型身份不可确认')
    expect(f.modelReads).toEqual([])
    expect(f.fileWrites).toEqual([])
  })

  it('refreshes the selected definition cascade from scoped candidates and preserves the configured value', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), session = await f.open('A')
    const selected = {tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'}
    const definitions = session.metadataDataSet.getView('DataViewDefinition')!, row = definitions.rows.find(row => row['tableName'] === 'OrderKey')!
    const key = definitions.getPkKey(row)!
    definitions.setCurrentRowById(key); definitions.updateEditingValue(key, 'labelField', 'parentId')
    await session.loadViewFields(selected)
    await vi.waitFor(() => expect(session.metadataDataSet.getFieldCascadeState({tableName: 'DataViewDefinition', viewId: 'default', field: 'labelField'}))
      .toMatchObject({valueStatus: 'valid', options: expect.arrayContaining([expect.objectContaining({name: 'parentId'})])}))
    expect(definitions.getEditingRow(key)?.['labelField']).toBe('parentId')
    session.metadataDataSet.getView('DataViewDefinition', 'default')!.discardPendingChanges()
    expect(definitions.rows.find(row => row['tableName'] === 'OrderKey')?.['labelField']).toBeUndefined()
    expect(f.fileWrites).toEqual([])
  })
  it('keeps formal aliases and view projection identical to full native assembly', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true, sourceFields: [
      {rowid: 'ID', dataModelId: 'M1', Name: 'rowid', AsName: 'orderId', type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: 1},
      {rowid: 'LABEL', dataModelId: 'M1', Name: 'description', AsName: 'caption', description: '显示名称', type: 'dataModel', FieldType: 'string', IsOutput: 1, IsPKey: 0},
    ]})
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2; config.resourceRelations = []
    config.tables.OrderKey.views.compact = {fieldProjection: [{fieldId: 'LABEL', source: 'resource', resourceFieldId: 'LABEL', resourceField: 'caption',
      viewField: 'caption', type: 'string', label: '名称', output: true, sortOrder: 0, sortDirection: null, group: 0,
      distinct: false, primaryKey: false, value: '', valueFunction: '', expression: ''}]}
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), selected = {tableName: 'OrderKey', viewId: 'compact', modelId: 'M1', modelName: 'Orders'}
    await session.loadViewFields(selected)
    const columns = session.getViewFields(selected)!
    expect(columns.map(column => column.name)).toContain('caption'); expect(columns.map(column => column.name)).not.toContain('description')
    expect(session.metadataDataSet.getTable('DataViewFieldOption')!.rows.map(row => row['name'])).toEqual(['caption', 'orderId'])
    await session.loadDefinition()
    expect(columns).toEqual(session.definitionDataSet!.getView('OrderKey', 'compact')!.columns)
  })
  it('keeps the latest selected view when concurrent formal field reads complete', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), session = await f.open('A'), release = f.holdDefinitionRead()
    const first = {tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'}
    const second = {tableName: 'CustomerKey', viewId: 'default', modelId: 'M2', modelName: 'Customers'}
    const old = session.loadViewFields(first), rejected = expect(old).rejects.toThrow('字段目录读取已过期')
    const current = session.loadViewFields(second); release(); await rejected; await current
    expect(session.getViewFields(first)).toBeNull(); expect(session.getViewFields(second)).not.toBeNull()
    expect(session.metadataDataSet.getTable('DataViewFieldOption')!.rows.every(row => row['tableName'] === 'CustomerKey')).toBe(true)
  })
  it('rejects a changed metadata query scope during a field read without publishing candidates', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), session = await f.open('A'), release = f.holdDefinitionRead()
    const selected = {tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'}
    const reading = session.loadViewFields(selected), rejected = expect(reading).rejects.toThrow('字段目录模型身份不可确认')
    session.metadataDataSet.getView('Base_DataModel')!.configure({queryContext: {dataSpaceId: 'OTHER'}})
    release(); await rejected
    expect(session.metadataDataSet.getTable('DataViewFieldOption')!.rows).toEqual([])
    expect(f.fileWrites).toEqual([])
  })
  it('saves a scoped view edit through the original file owner and restores it on independent reopen', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), session = await f.open('A')
    const selected = {tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'}
    await session.loadViewFields(selected)
    const definitions = session.metadataDataSet.getView('DataViewDefinition')!, row = definitions.rows.find(row => row['tableName'] === 'OrderKey')!
    definitions.updateEditingValue(definitions.getPkKey(row)!, 'labelField', 'parentId')
    expect(session.definitionStatus).toBe('unloaded')
    await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    expect(f.fileWrites).toHaveLength(1)
    const reopened = await f.open('A'); await reopened.loadViewFields(selected)
    expect(reopened.metadataDataSet.getView('DataViewDefinition')!.rows).toContainEqual(expect.objectContaining({tableName: 'OrderKey', labelField: 'parentId'}))
    expect(reopened.getViewFields(selected)?.map(column => column.name)).toContain('parentId')
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
  })
  it('reads one named-view field catalog without assembling unrelated models or querying business rows', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true, broken: true})
    const session = await f.open('A'), before = f.requests.length
    const selected = {tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'}
    await session.loadViewFields(selected)
    expect(session.getViewFields(selected)?.map(column => column.name)).toContain('parentId')
    expect(session.definitionStatus).toBe('unloaded')
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.requestState).toBe(RequestState.Idle)
    expect(session.metadataDataSet.getTable('DataViewFieldOption')!.rows).toContainEqual(expect.objectContaining({tableName: 'OrderKey', viewId: 'default', name: 'parentId'}))
    expect(f.requests).toHaveLength(before); expect(f.fileWrites).toEqual([])
  })
  it('rejects hidden model identity before publishing a named-view field catalog', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true, hiddenModelProperties: ['Name']})
    const session = await f.open('A')
    await expect(session.loadViewFields({tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'})).rejects.toThrow('字段目录模型身份不可确认')
    expect(session.metadataDataSet.getTable('DataViewFieldOption')!.rows).toEqual([])
  })
  it('does not publish an old field catalog after its file owner changes during the formal read', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), session = await f.open('A')
    const release = f.holdDefinitionRead(), selected = {tableName: 'OrderKey', viewId: 'default', modelId: 'M1', modelName: 'Orders'}
    const reading = session.loadViewFields(selected), rejected = expect(reading).rejects.toThrow('字段目录读取已过期')
    const config = JSON.parse(f.stored.get('A')!); config.tables.OrderKey.views.default.pageSize = 33
    f.workspaces[0]!.getScenarioViews('A')!.setText(JSON.stringify(config)); release()
    await rejected
    expect(session.getViewFields(selected)).toBeNull()
    expect(session.metadataDataSet.getTable('DataViewFieldOption')!.rows).toEqual([])
  })
  it('loads legacy graph endpoints without assembling the target or populating editable relations', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true, broken: true, relationRows: [{rowid: 'OLD', parentModId: 'M2', childModId: 'M1',
      filter: JSON.stringify({Type: 'cond', Field: 'parentId', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'x'}})}]})
    const config = JSON.parse(f.stored.get('A')!); delete config.resourceRelations; f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), before = f.requests.length
    const assemble = vi.spyOn(session, 'loadDefinition')
    await session.loadGraphRelations()
    const graph = session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')!
    expect(graph.rows).toHaveLength(1)
    expect(graph.rows[0]).toMatchObject({parentTable: 'CustomerKey', childTable: 'OrderKey', sourceRelationId: 'OLD'})
    expect(graph.rows[0]).not.toHaveProperty('filterExpression')
    expect(graph.fieldAccess(graph.rows[0]!, 'parentTable').write).toBe('denied')
    expect(session.metadataDataSet.getView('DataResourceRelationDefinition')!.rows).toEqual([])
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    expect(f.requests.slice(before)).toHaveLength(1); expect(assemble).not.toHaveBeenCalled()
    expect(session.definitionStatus).toBe('unloaded'); expect(f.fileWrites).toEqual([])
  })
  it('projects native graph endpoints without loading legacy metadata or fields', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), config = JSON.parse(f.stored.get('A')!)
    config.schemaVersion = 2; f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), before = f.requests.length
    await session.loadGraphRelations()
    expect(session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')!.rows[0]).toMatchObject({relationId: 'native', parentTable: 'CustomerKey', childTable: 'OrderKey'})
    expect(f.requests).toHaveLength(before)
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')!.requestState).toBe(RequestState.Idle)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
  })
  it('keeps database graph endpoints when the same space declares file models without backend model IDs', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), config = JSON.parse(f.stored.get('A')!)
    config.schemaVersion = 2
    config.tables.FileDefinitions = {resourceType: 'file', resourceId: 'definitions', columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {autoLoad: false}}}
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), before = f.requests.length
    await session.loadGraphRelations()
    expect(session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')!.rows[0]).toMatchObject({relationId: 'native', parentTable: 'CustomerKey', childTable: 'OrderKey'})
    expect(f.requests).toHaveLength(before)
    expect(session.metadataDataSet.getView('Base_DataModel')!.rows.some(row => row['Name'] === 'FileDefinitions')).toBe(false)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')!.requestState).toBe(RequestState.Idle)
  })
  it('reads file model fields from their native columns without blocking database relation editing or inventing model IDs', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), config = JSON.parse(f.stored.get('A')!)
    config.schemaVersion = 2
    config.tables.FileDefinitions = {resourceType: 'file', resourceId: 'definitions', columns: [{name: 'definitionId', label: '定义编号', type: 'string', isPrimaryKey: true}], views: {default: {autoLoad: false}}}
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), view = session.metadataDataSet.getView('DataResourceRelationDefinition')!, key = view.getPkKey(view.rows[0]!)!
    const catalog = await session.loadRelationFields(key)
    const reads = f.modelReads.length, file = catalog.context.tables!.find(table => table.name === 'FileDefinitions')!
    expect(await file.loadFields!()).toEqual([{name: 'definitionId', label: '定义编号'}])
    expect(f.modelReads).toHaveLength(reads)
    expect(session.metadataDataSet.getView('Base_DataModel')!.rows.some(row => row['Name'] === 'FileDefinitions')).toBe(false)
    view.updateEditingValue(key, 'parentTable', 'FileDefinitions')
    const fileParent = await session.loadRelationFields(key)
    expect(fileParent.context.relatedFields).toEqual([{label: 'definitionId', value: 'definitionId'}, {label: 'FileDefinitions.definitionId', value: 'FileDefinitions.definitionId'}])
    expect(f.assemblyScopes).toEqual([]); expect(f.fileWrites).toEqual([])
  })
  it('rejects hidden formal model identity rather than displaying guessed graph endpoints', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true, hiddenModelProperties: ['Name']})
    const session = await f.open('A')
    await expect(session.loadGraphRelations()).rejects.toThrow('画布模型身份不可确认')
    expect(session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')!.rows).toEqual([])
  })
  it('does not overwrite the new graph when its old legacy query finishes after file refresh', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), session = await f.open('A')
    const relations = session.metadataDataSet.getView('Base_DataModel_Relation')!, load = relations.loadFromServer.bind(relations)
    vi.spyOn(relations, 'loadFromServer').mockImplementation(async (...args) => {
      const result = await load(...args), config = JSON.parse(f.stored.get('A')!)
      config.schemaVersion = 2; config.resourceRelations[0].relationId = 'new-graph'
      f.workspaces[0]!.getScenarioViews('A')!.setText(JSON.stringify(config))
      await session.refresh({deferDefinition: true})
      return result
    })
    await expect(session.loadGraphRelations()).rejects.toThrow('画布关系读取已过期')
    expect(session.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')!.rows[0]?.['relationId']).toBe('new-graph')
  })
  it.each(['deferred', 'failed', 'saved'] as const)('reads only native upstream fields with a %s target projection', async phase => {
    const f = setup({overviewOnly: true, deferDefinition: phase === 'deferred', broken: phase === 'failed',
      allowFieldEdit: true, editableFieldProperties: ['description']})
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2
    f.stored.set('A', JSON.stringify(config))
    f.setModelValues({Type: '数据库表'}, 'A', 'M1'); f.setModelValues({Type: '数据库表'}, 'A', 'M2')
    const session = await f.open('A'), fields = await session.loadModelFields('M1'), owner = session.getFieldEdit('TARGET', 'modelFields')
    const loadDefinition = vi.spyOn(session, 'loadDefinition')
    if (phase === 'saved') {
      await session.loadModelInputFields('M1')
      fields.updateEditingValue('TARGET', 'description', '已保存')
      await owner.save()
      expect(owner.readValueFunction().context.tables).toContainEqual({name: 'Customers', fields: []})
      expect(owner.readValueFunction().warning).toContain('上游字段')
    }
    const count = f.requests.length, view = await session.loadModelInputFields('M1')
    expect(view.queryContext).toEqual({dataSpaceId: 'A', modelId: 'M1', modelIds: ['M2']})
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['ARG', 'PARENT'])
    expect(f.requests.slice(count)).toHaveLength(1)
    expect(loadDefinition).not.toHaveBeenCalled()
    expect(session.definitionStatus).toBe(phase === 'failed' ? 'failed' : 'unloaded')
    expect(owner.readValueFunction().context.tables).toContainEqual({name: 'Customers', fields: [{name: 'customer'}]})
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')?.requestState).toBe(RequestState.Idle)
  })

  it('honors native empty relations without assembling or querying legacy relations', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true})
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2; config.resourceRelations = []
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), count = f.requests.length, assemble = vi.spyOn(session, 'loadDefinition')
    const view = await session.loadModelInputFields('M1')
    expect(view.rows).toEqual([]); expect(view.queryContext['modelIds']).toEqual([])
    expect(f.requests).toHaveLength(count); expect(assemble).not.toHaveBeenCalled()
  })

  it.each(['duplicate', 'mismatch', 'hidden'] as const)('rejects %s native binding identity before querying upstream fields', async problem => {
    const f = setup({overviewOnly: true, deferDefinition: true})
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2
    if (problem === 'duplicate') config.tables.Duplicate = config.tables.CustomerKey
    if (problem === 'mismatch') config.tables.CustomerKey.modelBinding.modelName = 'Wrong'
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), models = session.metadataDataSet.getView('Base_DataModel')!
    if (problem === 'hidden') {
      const access = models.fieldAccess.bind(models)
      vi.spyOn(models, 'fieldAccess').mockImplementation((row, key) => row?.['rowid'] === 'M2' && key === 'Name'
        ? {...access(row, key), read: 'invisible'} : access(row, key))
    }
    const count = f.requests.length
    await expect(session.loadModelInputFields('M1')).rejects.toThrow(/唯一|身份/)
    expect(f.requests).toHaveLength(count)
  })

  it('reads deferred legacy endpoints without assembling the target or treating inherited relations as empty', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), session = await f.open('A')
    const load = vi.spyOn(session, 'loadDefinition'), before = f.requests.length
    expect((await session.loadModelInputFields('M1')).rows.map(row => row['rowid']).sort()).toEqual(['ARG', 'PARENT'])
    expect(load).not.toHaveBeenCalled(); expect(session.definitionStatus).toBe('unloaded')
    expect(f.requests.slice(before)).toHaveLength(2)
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
  })

  it.each(['deferred', 'failed', 'saved'] as const)('reads real legacy relation endpoints with a %s target projection', async phase => {
    const f = setup({overviewOnly: true, deferDefinition: phase === 'deferred', broken: phase === 'failed',
      relationRows: [{rowid: 'OLD', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders',
        filter: JSON.stringify({Type: 'cond', Field: 'parentId', Operator: 'equal', ValueFun: {Type: 'GetTableField', Field: 'customer'}}), depType: 'currentRow', cascadeDel: 0}]})
    const config = JSON.parse(f.stored.get('A')!)
    config.resourceRelations = [{sourceRelationId: 'OLD', parentTable: 'CustomerKey', childTable: 'OrderKey', relationName: '保留来源扩展'}]
    const text = JSON.stringify(config); f.stored.set('A', text)
    const session = await f.open('A')
    if (phase === 'saved') {
      session.metadataDataSet.getView('Base_DataModel')!.updateEditingValue('M1', 'description', '已保存')
      await session.getModelEdit('M1').save()
    }
    const load = vi.spyOn(session, 'loadDefinition'), before = f.requests.length
    const view = await session.loadModelInputFields('M1')
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['ARG', 'PARENT'])
    expect(view.queryContext['modelIds']).toEqual(['M2'])
    expect(f.requests.slice(before)).toHaveLength(2); expect(load).not.toHaveBeenCalled()
    expect(session.definitionStatus).toBe(phase === 'failed' ? 'failed' : 'unloaded')
    expect(session.metadataDataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
    expect(f.stored.get('A')).toBe(text); expect(f.fileWrites).toEqual([])
  })

  it.each(['hidden', 'duplicate', 'invalid-filter'] as const)('rejects %s legacy endpoints before querying input fields', async problem => {
    const relation = {rowid: 'OLD', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders',
      filter: problem === 'invalid-filter' ? '{broken' : JSON.stringify({Type: 'cond', Field: 'parentId', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'x'}}), depType: '', cascadeDel: 0}
    const f = setup({overviewOnly: true, deferDefinition: true, relationRows: problem === 'duplicate' ? [relation, relation] : [relation]})
    const config = JSON.parse(f.stored.get('A')!); delete config.resourceRelations; f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), relations = session.metadataDataSet.getView('Base_DataModel_Relation')!
    if (problem === 'hidden') {
      const access = relations.fieldAccess.bind(relations)
      vi.spyOn(relations, 'fieldAccess').mockImplementation((row, key) => key === 'parentModId' ? {...access(row, key), read: 'invisible'} : access(row, key))
    }
    const inputs = vi.spyOn(session.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields')!, 'loadFromServer')
    await expect(session.loadModelInputFields('M1')).rejects.toThrow(problem === 'hidden' ? '不可读' : problem === 'duplicate' ? 'DATA_SPACE_METADATA_SCOPE' : /JSON|json/)
    expect(inputs).not.toHaveBeenCalled(); expect(f.fileWrites).toEqual([])
  })

  it('rejects a native input-field response after its file configuration changes', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true})
    const config = JSON.parse(f.stored.get('A')!); config.schemaVersion = 2
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), view = session.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields')!
    const load = view.loadFromServer.bind(view)
    vi.spyOn(view, 'loadFromServer').mockImplementation(async (...args) => {
      const result = await load(...args)
      f.stored.set('A', JSON.stringify({...config, resourceRelations: []}))
      await session.refresh({deferDefinition: true})
      return result
    })
    await expect(session.loadModelInputFields('M1')).rejects.toThrow('查询已过期')
    expect(view.queryContext['modelId']).not.toBe('M1')
    expect(view.rows).toEqual([])
  })

  it('provides native upstream function choices from scoped input fields and saves through the original field workspace', async () => {
    const f = setup({overviewOnly: true, allowFieldEdit: true, editableFieldProperties: ['ValueFun']})
    f.setModelValues({Type: '数据库表'}, 'A', 'M1'); f.setModelValues({Type: '数据库表'}, 'A', 'M2')
    const session = await f.open('A'), fields = await session.loadModelFields('M1')
    const owner = session.getFieldEdit('TARGET', 'modelFields')
    const before = owner.readValueFunction()
    expect(before.context.tables).toContainEqual({name: 'Customers', fields: []})
    expect(before.warning).toContain('上游')
    const value: DataViewFilterValueFunction = {Type: 'GetRefData', RefTableName: 'CustomerSource', RefFieldName: 'customer', FkFieldName: 'customer'}
    const refOptions = (context: typeof before.context, key: string) => {
      const field = getDataViewFilterFunctionDefinitions(context).find(item => item.type === 'GetRefData')!.fields.find(item => item.key === key)!
      return typeof field.options === 'function' ? field.options(value, context) : field.options
    }
    expect(refOptions(before.context, 'RefTableName')).toContainEqual({label: 'Customers（CustomerSource）', value: 'CustomerSource'})
    expect(refOptions(before.context, 'RefFieldName')).toEqual([])
    expect(() => owner.stageValueFunction(JSON.stringify(value))).toThrow('上游')
    expect(fields.hasEditingChanges()).toBe(false)
    await session.loadModelInputFields('M1')
    const {context, warning} = owner.readValueFunction()
    expect(warning).toBe('')
    expect(context.tables).toContainEqual({name: 'Customers', fields: [{name: 'customer'}]})
    expect(session.getFieldCreate('M1', 'modelFields').readValueFunction().context.tables).toEqual(context.tables)
    const definition = getDataViewFilterFunctionDefinitions(context).find(item => item.type === 'GetRefData')!
    const parameter = definition.fields.find(field => field.key === 'RefFieldName')!
    expect(typeof parameter.options === 'function' ? parameter.options(value, context) : parameter.options).toEqual([{label: 'customer', value: 'customer'}])
    const raw = ` ${JSON.stringify({...value, Extra: false})} `
    owner.stageValueFunction(raw); owner.discard()
    expect(fields.getEditingRow('TARGET')?.['ValueFun']).toBe('')
    expect(f.requests.filter(request => request.url?.includes('BatchTableOperate'))).toHaveLength(0)
    owner.stageValueFunction(raw)
    await session.getModelEdit('M1').save(fields.rows.map(row => session.getFieldEdit(String(row['rowid']), 'modelFields')))
    expect(f.requests.filter(request => request.url?.includes('BatchTableOperate'))).toHaveLength(1)
    const reopened = await f.open('A'), saved = await reopened.loadModelFields('M1')
    await reopened.loadModelInputFields('M1')
    expect(saved.rows.find(row => row['rowid'] === 'TARGET')?.['ValueFun']).toBe(raw)
    expect(reopened.getFieldEdit('TARGET', 'modelFields').readValueFunction().context.tables?.map(table => table.name)).toEqual(['Orders', 'Customers'])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Field')?.rows).toEqual([])
    expect(reopened.metadataDataSet.getView('Base_DataModel_Relation')?.rows).toEqual([])
    expect(f.fileWrites).toEqual([])
  })

  it('does not revive legacy ancestors when native relations are explicitly empty', async () => {
    const f = setup({relationRows: [{rowid: 'OLD', parentModId: 'M2', childModId: 'M1', parentTable: 'Customers', childTable: 'Orders',
      filter: JSON.stringify({Type: 'cond', Field: 'rowid', Operator: 'equal', ValueFun: {Type: 'GetTableField', Field: 'rowid'}}), depType: '', cascadeDel: 0}]}), config = JSON.parse(f.stored.get('A')!)
    config.schemaVersion = 2; config.resourceRelations = []; f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), old = session.metadataDataSet.getView('Base_DataModel_Relation')!
    const owner = session.getFieldEdit('TARGET')
    expect(owner.readValueFunction().context.tables?.map(table => table.name)).toEqual(['Orders'])
    expect(old.rows).toHaveLength(1)
  })

  it('rejects a scoped input list loaded for a different model while preserving local fields', async () => {
    const f = setup({overviewOnly: true}), session = await f.open('A')
    await session.loadModelFields('M1'); await session.loadModelInputFields('M1')
    const owner = session.getFieldEdit('TARGET', 'modelFields')
    expect(owner.readValueFunction().context.tables?.map(table => table.name)).toEqual(['Orders', 'Customers'])
    await session.loadModelInputFields('M2')
    const after = owner.readValueFunction()
    expect(after.context.tables).toContainEqual({name: 'Customers', fields: []})
    expect(after.context.relatedFields).toContainEqual({value: 'parentId', label: 'parentId'})
    expect(after.warning).toContain('上游')
  })

  it('consumes upstream field read permissions and never substitutes the unrestricted default directory', async () => {
    const f = setup(), session = await f.open('A')
    await session.loadModelFields('M1'); const upstream = await session.loadModelInputFields('M1')
    const access = upstream.fieldAccess.bind(upstream)
    vi.spyOn(upstream, 'fieldAccess').mockImplementation((row, key) => key === 'Name'
      ? {...access(row, key), read: 'invisible'} : access(row, key))
    const state = session.getFieldEdit('TARGET', 'modelFields').readValueFunction()
    expect(state.context.tables).toContainEqual({name: 'Customers', fields: []})
    expect(state.warning).toContain('不可读')
  })

  it.each(['Name', 'MetaName', 'DbName'])('never exposes an unreadable %s in a resource header while fields are pending', async key => {
    const f = setup({overviewOnly: true})
    f.setModelValues({Type: '数据库表'}, 'A', 'M1'); f.setModelValues({Type: '数据库表'}, 'A', 'M2')
    const session = await f.open('A')
    await session.loadModelFields('M1')
    const owner = session.getFieldEdit('TARGET', 'modelFields')
    const resourceOptions = (context: ReturnType<typeof owner.readValueFunction>['context']) => {
      const parameter = getDataViewFilterFunctionDefinitions(context).find(item => item.type === 'GetRefData')?.fields.find(field => field.key === 'RefTableName')
      return typeof parameter?.options === 'function' ? parameter.options({Type: 'GetRefData'}, context) : parameter?.options ?? []
    }
    expect(resourceOptions(owner.readValueFunction().context)).toContainEqual(expect.objectContaining({value: 'CustomerSource'}))
    const models = session.metadataDataSet.getView('Base_DataModel')!, access = models.fieldAccess.bind(models)
    vi.spyOn(models, 'fieldAccess').mockImplementation((row, field) => row?.['rowid'] === 'M2' && field === key
      ? {...access(row, field), read: 'invisible'} : access(row, field))
    const {context, warning} = owner.readValueFunction()
    expect(resourceOptions(context)).not.toContainEqual(expect.objectContaining({value: 'CustomerSource'}))
    if (key === 'Name') expect(context.tables?.map(table => table.name)).not.toContain('Customers')
    expect(warning).toMatch(/身份|不可读/)
    expect(f.requests.filter(request => request.url?.includes('BatchTableOperate'))).toHaveLength(0)
  })

  it('queries upstream fields through native relations and formal bindings, retaining input fields', async () => {
    const f = setup(), session = await f.open('A')
    const original = JSON.stringify(session.definitionDataSet?.resourceRelations)
    const view = await session.loadModelInputFields('M1')
    expect(view).toBe(session.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields'))
    expect(view.queryContext).toEqual({dataSpaceId: 'A', modelId: 'M1', modelIds: ['M2']})
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['ARG', 'PARENT'])
    expect(JSON.stringify(session.definitionDataSet?.resourceRelations)).toBe(original)
    await view.setSort([{field: 'Name', direction: 'desc'}])
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['ARG', 'PARENT'])
    expect(f.requests.some(request => request.url?.includes('BatchTableOperate'))).toBe(false)
  })
  it('clears the prior upstream list when switching to a root model without an unscoped query', async () => {
    const f = setup(), session = await f.open('A')
    await session.loadModelInputFields('M1')
    const count = f.requests.length, view = await session.loadModelInputFields('M2')
    expect(view.rows).toEqual([]); expect(view.queryContext['modelIds']).toEqual([])
    expect(f.requests).toHaveLength(count)
  })
  it('deduplicates cycles and excludes the current model', async () => {
    const f = setup(), config = JSON.parse(f.stored.get('A')!)
    config.resourceRelations.push({relationId: 'back', parentTable: 'OrderKey', childTable: 'CustomerKey', filterExpression: {field: 'rowid', operator: 'eq', value: 'x'}})
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), view = await session.loadModelInputFields('M1')
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['ARG', 'PARENT'])
  })
  it('includes multiple native parents without copying the backend relation table', async () => {
    const f = setup(), config = JSON.parse(f.stored.get('A')!)
    f.created.set('Base_DataModel', [{rowid: 'M3', dataSetId: 'A', Name: 'Third', MetaName: 'ThirdSource', Type: '数据库表'}])
    f.created.set('Base_DataModel_Field', [{rowid: 'THIRD', dataSetId: 'A', dataModelId: 'M3', Name: 'third', type: 'dataModel', IsOutput: 1}])
    config.tables.ThirdKey = {modelBinding: {modelId: 'M3', modelName: 'Third'}, views: {default: {}}}
    config.resourceRelations.push({relationId: 'second-parent', parentTable: 'ThirdKey', childTable: 'OrderKey', filterExpression: {field: 'rowid', operator: 'ne', value: ''}})
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), view = await session.loadModelInputFields('M1')
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')?.rows).toEqual([])
    expect(view.queryContext['modelIds']).toEqual(['M2', 'M3'])
    expect(view.rows.map(row => row['rowid']).sort()).toEqual(['ARG', 'PARENT', 'THIRD'])
  })
  it('refuses unreadable model identity while allowing a readable directory despite runtime assembly failure', async () => {
    const f = setup({hiddenModelProperties: ['Name']}), session = await f.open('A')
    await expect(session.loadModelInputFields('M1')).rejects.toThrow('模型身份')
    const broken = setup({broken: true}), other = await broken.open('A')
    expect((await other.loadModelInputFields('M1')).queryContext['modelIds']).toEqual(['M2'])
    expect(other.definitionStatus).toBe('failed')
    expect(() => other.definitionDataSet).toThrow('装配')
  })

  it('rejects legacy metadata scope changes while loading relations and sends no field query', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), session = await f.open('A')
    const relations = session.metadataDataSet.getView('Base_DataModel_Relation')!, load = relations.loadFromServer.bind(relations)
    vi.spyOn(relations, 'loadFromServer').mockImplementation(async (...args) => {
      const result = await load(...args); f.invalidate(); return result
    })
    const inputs = vi.spyOn(session.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields')!, 'loadFromServer')
    await expect(session.loadModelInputFields('M1')).rejects.toThrow(/STALE|SCOPE/)
    expect(inputs).not.toHaveBeenCalled()
  })

  it('does not turn a missing legacy source reference into an empty input directory', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true}), config = JSON.parse(f.stored.get('A')!)
    config.resourceRelations = [{sourceRelationId: 'MISSING', parentTable: 'CustomerKey', childTable: 'OrderKey'}]
    f.stored.set('A', JSON.stringify(config))
    const session = await f.open('A'), input = vi.spyOn(session.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields')!, 'loadFromServer')
    await expect(session.loadModelInputFields('M1')).rejects.toThrow('来源引用未唯一解析')
    expect(input).not.toHaveBeenCalled(); expect(f.fileWrites).toEqual([])
  })

  it('withdraws old input rows when the legacy relationship changes during their query', async () => {
    const f = setup({overviewOnly: true, deferDefinition: true, relationRows: [{rowid:'OLD',parentModId:'M2',childModId:'M1',
      filter:JSON.stringify({Type:'cond',Field:'parentId',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:'x'}})}]})
    const config = JSON.parse(f.stored.get('A')!); delete config.resourceRelations; f.stored.set('A',JSON.stringify(config))
    const session = await f.open('A'), view = session.metadataDataSet.getView('Base_DataModel_Field','modelInputFields')!
    const relations = session.metadataDataSet.getView('Base_DataModel_Relation')!, load = view.loadFromServer.bind(view)
    vi.spyOn(view,'loadFromServer').mockImplementation(async (...args) => {
      const result = await load(...args)
      relations.replaceRows(relations.rows.map(row => ({...row,parentModId:'M1'})))
      return result
    })
    await expect(session.loadModelInputFields('M1')).rejects.toThrow('上游范围已变化')
    expect(view.rows).toEqual([])
  })
  it('does not expose returned fields after the native definition expires during the query', async () => {
    const f = setup(), session = await f.open('A'), view = session.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields')!
    const load = view.loadFromServer.bind(view)
    vi.spyOn(view, 'loadFromServer').mockImplementation(async (...args) => {
      const result = await load(...args); f.invalidate(); return result
    })
    await expect(session.loadModelInputFields('M1')).rejects.toThrow('STALE')
    expect(view.rows).toEqual([])
  })
  it('does not clear a newer input workspace when an older query is rejected', async () => {
    const f = setup(), session = await f.open('A'), view = session.metadataDataSet.getView('Base_DataModel_Field', 'modelInputFields')!
    const load = view.loadFromServer.bind(view)
    vi.spyOn(view, 'loadFromServer').mockImplementation(async (...args) => {
      const result = await load(...args)
      view.configure({queryContext: {dataSpaceId: 'A', modelId: 'M2', modelIds: ['M1']}})
      view.replaceRows([{rowid: 'NEW', dataSetId: 'A', dataModelId: 'M1', Name: 'newField'}])
      return result
    })
    await expect(session.loadModelInputFields('M1')).rejects.toThrow('查询已过期')
    expect(view.rows.map(row => row['rowid'])).toEqual(['NEW'])
    expect(view.queryContext['modelId']).toBe('M2')
  })
})
