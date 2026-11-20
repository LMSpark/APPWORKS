import {describe, expect, it} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace} from '@spark-appworks/spark-project-model'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewDesign} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'
import {assembleDefinitionFixtures, createConfirmedMetadataFixture} from './definition-resource.fixture'
import {DataSpaceQueryContext} from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import {DataSpaceQueryTable} from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
const targetId = 'SPACE'
const initial = JSON.stringify({scenarioId: targetId, tables: {
  Parents: {modelBinding: {modelId: 'P', modelName: 'P'}, views: {default: {}, shared: {pageSize: 10}}},
  Children: {modelBinding: {modelId: 'C', modelName: 'C'}, views: {default: {}, shared: {pageSize: 15}}},
}, viewCascades: []})

class NoQueries extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  response?: HttpResponse<unknown>
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    if (this.response) return this.response
    throw new Error('view definition editing must not query or write business records')
  }
}

function fixture(text: string | null = initial, withModelCatalog = false) {
  let stored = text
  let writes = 0
  let scope = 'SCOPE'
  let failAfterWrite = false
  let gate: Promise<void> | undefined
  let ready: (() => void) | undefined
  const assembled: DataSet[] = []
  const validationScopes: string[][] = []
  let unavailableModel = ''
  let assemblyCalls = 0
  let assemblyLimit = Number.POSITIVE_INFINITY
  const models: FormalModel[] = ['P', 'C'].map(id => ({id, name: id, metaName: id,
    sourceName: id, sourceId: 'DB', sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {},
    fields: [{id: `${id}-id`, modelId: id, name: 'id', canonicalName: 'id', type: 'string',
      primaryKey: true, description: '', output: true, computed: false, order: 0, orderType: '', raw: {}}],
  }))
  const openOwner = () => {
    const workspace = new ProjectWorkspace({projectId: 'APP',
      blueprint: {},
      scenarioViews: {readScope: () => scope,
        readText: async id => {expect(id).toBe(targetId); return stored},
        writeText: async (id, value) => {
          expect(id).toBe(targetId)
          stored = value
          writes++
          if (failAfterWrite) {failAfterWrite = false; throw new Error('response lost')}
        }},
    })
    const http = new NoQueries()
    const assembler = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({http,
      readScope: () => ({token: scope, headers: {}})}), http)
    const metadata = createConfirmedMetadataFixture(targetId, withModelCatalog ? {
      Base_DataModel: {modelBinding: {modelId: 'FIXTURE-MODEL', modelName: 'Base_DataModel'},
        columns: ['rowid', 'dataSetId', 'Name'].map(name => ({name, type: 'string', isPrimaryKey: name === 'rowid'})), views: {default: {}}},
    } : {})
    const service = new LowcodeDataSpaceViewDesign({workspace,
      loadMetadata: async (id, executors) => {expect(id).toBe(targetId); return assembleDefinitionFixtures(metadata, id, executors)},
      assertScope: () => {if (scope !== 'SCOPE') throw new Error('STALE_SCOPE')},
      readModel: async input => {
        const model = models.find(item => item.id === input.modelId)
        if (!model) throw new Error('model missing')
        return model
      },
      assemble: async ({scenarioId: id, config, modelScope}) => {
        const selected = modelScope === undefined ? config : config.selectModelScope(modelScope)
        const names = Object.keys(selected.toJSON()['tables'] as object)
        validationScopes.push(names)
        if (names.includes(unavailableModel)) throw new Error('unrelated resource unavailable')
        if (++assemblyCalls > assemblyLimit) throw new Error('model source became unavailable after validation')
        ready?.()
        await gate
        const result = assembler.assemble({config: selected, space: {dataSpaceId: id, name: id}, models, relations: []})
        assembled.push(result.dataSet)
        return result
      },
    })
    return {workspace, service, metadata, http}
  }
  return {openOwner, assembled, validationScopes, setUnavailable: (name: string) => {unavailableModel = name}, get stored() {return stored}, get writes() {return writes},
    allowAssemblies: (count: number) => {assemblyLimit = assemblyCalls + count},
    setScope: () => {scope = 'OTHER'}, failNextWrite: () => {failAfterWrite = true},
    holdAssembly: (promise: Promise<void>) => {gate = promise; return new Promise<void>(resolve => {ready = resolve})}}
}

describe('data-space DataView definition metadata', () => {

  it.each(['view', 'binding', 'relation', 'cascade'] as const)('keeps the active projection when %s has reverted but still pending native changes', async kind => {
    const original = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: [{relationId: 'R', parentTable: 'Parents', childTable: 'Children',
      relationName: 'original', filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}}],
      viewCascades: [{parentTable: 'Parents', parentViewId: 'default', childTable: 'Children', childViewId: 'default',
        filterBindings: [{sourceField: 'id', targetField: 'id'}], autoLoad: false}]}
    const storage = fixture(JSON.stringify(original)), session = await storage.openOwner().service.openDesignSession(targetId)
    try {
      const configuration = {
        view: {table: 'DataViewDefinition', field: 'pageSize', value: 31},
        binding: {table: 'DataTableBindingDefinition', field: 'configuration', value: {modelBinding: {modelId: 'P', modelName: 'P'}, businessCategory: 'temporary'}},
        relation: {table: 'DataResourceRelationDefinition', field: 'relationName', value: 'temporary'},
        cascade: {table: 'DataViewCascadeDefinition', field: 'autoLoad', value: true},
      }[kind]
      const view = session.metadataDataSet.getView(configuration.table)!
      const row = kind === 'view' ? view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')! : view.rows[0]!
      const key = view.getPkKey(row)!, originalValue = structuredClone(row[configuration.field]), projection = session.definitionDataSet!
      view.updateEditingValue(key, configuration.field, configuration.value)
      expect((await view.applyEditingRows([key])).success).toBe(true)
      view.updateEditingValue(key, configuration.field, originalValue)
      expect((await view.applyEditingRows([key])).success).toBe(true)
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      await expect(session.refresh()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
      expect(projection.destroyed).toBe(false)
      expect(session.definitionDataSet).toBe(projection)
      expect(storage.writes).toBe(0)
      view.discardPendingChanges()
      await session.refresh()
      expect(session.definitionDataSet).not.toBe(projection)
    } finally {session.dispose()}
  })

  it('saves a named view replacement with its cascade through the same DataSet and reopens it', async () => {
    const original = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: [], viewCascades: [
      {parentTable: 'Parents', parentViewId: 'shared', childTable: 'Children', childViewId: 'shared',
        filterBindings: [{sourceField: 'id', targetField: 'id'}], autoLoad: false},
    ]}
    const storage = fixture(JSON.stringify(original)), owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    try {
      const views = session.metadataDataSet.getView('DataViewDefinition')!, cascades = session.metadataDataSet.getView('DataViewCascadeDefinition')!
      await cascades.refresh()
      const old = views.rows.find(row => row['tableName'] === 'Parents' && row['viewId'] === 'shared')!
      expect(await views.removeRow(views.getPkKey(old)!)).toBe(true)
      await views.addRow({tableName: 'Parents', dataModelId: 'P', dataModelName: 'P', viewId: 'renamed', pageSize: 23})
      cascades.updateEditingValue(cascades.getPkKey(cascades.rows[0]!)!, 'parentViewId', 'renamed')
      expect((await session.metadataDataSet.saveChanges({views: [views, cascades].map(view => ({tableName: view.tableName, viewId: view.viewId}))})).success).toBe(true)
      expect(storage.writes).toBe(1)
      expect(views.rows.some(row => row['tableName'] === 'Parents' && row['viewId'] === 'shared')).toBe(false)
      expect(JSON.parse(storage.stored!).viewCascades).toMatchObject([{parentViewId: 'renamed'}])
    } finally {session.dispose()}
    const independent = storage.openOwner(), reopened = await independent.service.openDesignSession(targetId, {deferDefinition: true})
    try {
      const preview = await independent.service.openPreview({scenarioId: targetId, tableName: 'Parents', modelId: 'P', modelName: 'P', viewId: 'renamed'})
      try {expect(preview.view.pageSize).toBe(23)} finally {preview.dispose()}
    } finally {reopened.dispose()}
  })

  it.each(['edit', 'add', 'remove'].flatMap(operation => ['confirmed', 'unknown'].map(receipt => ({operation, receipt}))))(
    'jointly saves five native definition resources ($operation binding, $receipt receipt) and independently reopens', async ({operation, receipt}) => {
    const original = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: []}
    original.tables.Unrelated = {modelBinding: {modelId: 'X', modelName: 'Unavailable'}, views: {default: {}}}
    if (operation === 'add') delete original.tables.Parents
    if (operation === 'remove') original.tables.Removed = {resourceType: 'file', resourceId: 'unused-source',
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}}}
    const storage = fixture(JSON.stringify(original), true); storage.setUnavailable('Unrelated')
    const owner = storage.openOwner()
    const models = owner.metadata.getView('Base_DataModel')!
    models.queryContext = {dataSpaceId: targetId}
    models.bindQueryExecutor({executeQuery: async () => {
      const table = new DataSpaceQueryTable({scenarioId: 'META', metaName: 'Base_DataModel'})
      return new DataSpaceQueryContext({identity: table.identity, scope: 'SCOPE', readScope: () => 'SCOPE',
        snapshot: table.applyResult({Result: {primaryKeyField: 'rowid', allowAdd: false, data: {Count: 2,
          Items: ['P', 'C'].map(id => ({rowid: id, dataSetId: targetId, Name: id,
            lingma_sys_params: {e: [], r: [], h: [], m: [], d: false}}))}}})})
    }})
    await models.refresh()
    const session = await owner.service.openDesignSession(targetId, {deferDefinition: true})
    const selectors = ['DataTableBindingDefinition', 'DataViewDefinition', 'DataResourceRelationDefinition',
      'DataViewCascadeDefinition', 'DataSpaceLayoutDefinition'].map(tableName => ({tableName, viewId: 'default'}))
    try {
      const [bindings, views, relations, cascades, layout] = selectors.map(item => session.metadataDataSet.getView(item.tableName)!)
      for (const view of [relations!, cascades!, layout!]) await view.refresh()
      const columns = [{name: 'display', type: 'string', computeExpression: 'id + "!"'}]
      if (operation === 'add') {
        await bindings!.addRow({tableName: 'Parents', configuration: {modelBinding: {modelId: 'P', modelName: 'P'}, columns}})
        await views!.addRow({tableName: 'Parents', dataModelId: 'P', dataModelName: 'P', viewId: 'shared', labelField: 'display'})
      } else {
        const parent = bindings!.rows.find(row => row['tableName'] === 'Parents')!, parentKey = bindings!.getPkKey(parent)!
        bindings!.updateEditingValue(parentKey, 'configuration', {...parent['configuration'] as object, columns})
        const row = views!.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
        views!.updateEditingValue(views!.getPkKey(row)!, 'labelField', 'display')
        if (operation === 'remove') {
          const removed = bindings!.rows.find(item => item['tableName'] === 'Removed')!
          expect(await bindings!.removeRow(bindings!.getPkKey(removed)!)).toBe(true)
        }
      }
      await relations!.addRow({dataSetId: targetId, definitionKey: JSON.stringify(['native', 'R']), relationId: 'R',
        parentTable: 'Parents', childTable: 'Children', cascadeDelete: false,
        filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}})
      await cascades!.addRow({dataSetId: targetId, definitionKey: '0', parentTable: 'Parents', parentViewId: 'shared',
        childTable: 'Children', childViewId: 'shared', filterBindings: [{sourceField: 'id', targetField: 'id'}], autoLoad: false})
      layout!.updateEditingValue(layout!.getPkKey(layout!.rows[0]!)!, 'tablePositions', {Parents: {x: 31, y: 42}})
      layout!.updateEditingValue(layout!.getPkKey(layout!.rows[0]!)!, 'unboundEdges', {R: {source: 'P', target: 'C'}})
      if (receipt === 'unknown') {
        storage.failNextWrite()
        await expect(session.metadataDataSet.saveChanges({views: selectors})).rejects.toThrow('response lost')
        expect(session.viewState?.saveStatus).toBe('unknown')
      }
      expect((await session.metadataDataSet.saveChanges({views: selectors})).success).toBe(true)
      expect(storage.writes).toBe(1)
      expect(storage.validationScopes.length).toBeGreaterThan(0)
      expect(storage.validationScopes.every(scope => [...scope].sort().join(',') === 'Children,Parents')).toBe(true)
      expect(owner.http.requests).toEqual([])
      expect(JSON.parse(storage.stored!).tables.Unrelated).toEqual(original.tables.Unrelated)
      expect(JSON.parse(storage.stored!).tables).not.toHaveProperty('Removed')
      expect(layout!.rows[0]?.['unboundEdges']).toEqual({})
      for (const view of [bindings!, views!, relations!, cascades!, layout!]) {
        expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(false)
      }
      if (operation === 'remove') {
        // 保存回执只接纳本视图捕获的记录；所属视图的结构变化沿同一DataView重查，不能伪造未提交删除回执。
        const stale = views!.rows.find(item => item['tableName'] === 'Removed')!
        views!.updateEditingValue(views!.getPkKey(stale)!, 'pageSize', 19)
        await expect(session.metadataDataSet.saveChanges({views: [{tableName: views!.tableName, viewId: views!.viewId}]}))
          .rejects.toThrow('SCENARIO_DEFINITION_BASELINE')
        views!.discardPendingChanges()
        await views!.refresh()
        expect(views!.rows.some(item => item['tableName'] === 'Removed')).toBe(false)
        expect(storage.writes).toBe(1)
      }
    } finally {session.dispose()}
    const independent = storage.openOwner()
    const reopened = await independent.service.openDesignSession(targetId, {deferDefinition: true})
    try {
      const data = JSON.parse(storage.stored!)
      expect(data).toMatchObject({tables: {Parents: {columns: [{name: 'display'}], views: {shared: {labelField: 'display'}}}},
        resourceRelations: [{relationId: 'R'}], viewCascades: [{autoLoad: false}], layout: {tablePositions: {Parents: {x: 31, y: 42}}}})
      const view = reopened.metadataDataSet.getView('DataViewDefinition')!
      expect(view.rows.find(row => row['tableName'] === 'Parents' && row['viewId'] === 'shared')?.['labelField']).toBe('display')
      const preview = await independent.service.openPreview({scenarioId: targetId, tableName: 'Parents', modelId: 'P', modelName: 'P', viewId: 'shared'})
      try {expect(preview.view.labelField).toBe('display')} finally {preview.dispose()}
    } finally {reopened.dispose()}
  })

  it.each(['field', 'dependency', 'scope'])('rejects a joint definition %s failure without writing and keeps cancellation available', async failure => {
    const original = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: []}
    const storage = fixture(JSON.stringify(original)), session = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
    try {
      const views = session.metadataDataSet.getView('DataViewDefinition')!, relations = session.metadataDataSet.getView('DataResourceRelationDefinition')!
      await relations.refresh()
      const row = views.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
      views.updateEditingValue(views.getPkKey(row)!, failure === 'field' ? 'labelField' : 'pageSize', failure === 'field' ? 'missing' : 31)
      await relations.addRow({dataSetId: targetId, definitionKey: JSON.stringify(['native', 'R']), relationId: 'R',
        parentTable: 'Parents', childTable: 'Children', filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}})
      if (failure === 'dependency') storage.setUnavailable('Children')
      if (failure === 'scope') storage.setScope()
      await expect(session.metadataDataSet.saveChanges({views: [views, relations].map(view => ({tableName: view.tableName, viewId: view.viewId}))}))
        .rejects.toThrow(failure === 'field' ? 'SCENARIO_VIEW_FIELD' : failure === 'dependency' ? 'unrelated resource unavailable' : 'STALE_SCOPE')
      expect(storage.writes).toBe(0); expect(JSON.parse(storage.stored!)).toEqual(original)
      if (failure !== 'scope') {
        expect(views.hasEditingChanges() || views.dirtyTracking.hasPendingChanges()).toBe(true)
        views.discardPendingChanges(); relations.discardPendingChanges()
        expect(views.hasEditingChanges() || views.dirtyTracking.hasPendingChanges()).toBe(false)
        expect(relations.rows).toHaveLength(0)
        expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
        expect(storage.writes).toBe(0)
      }
    } finally {session.dispose()}
  })

  it('preserves a later view edit while a joint view and relationship save is validating', async () => {
    const original = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: []}
    const storage = fixture(JSON.stringify(original)), session = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
    let release!: () => void
    try {
      const views = session.metadataDataSet.getView('DataViewDefinition')!, relations = session.metadataDataSet.getView('DataResourceRelationDefinition')!
      await relations.refresh()
      const row = views.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!, key = views.getPkKey(row)!
      views.updateEditingValue(key, 'pageSize', 31)
      await relations.addRow({dataSetId: targetId, definitionKey: JSON.stringify(['native', 'R']), relationId: 'R',
        parentTable: 'Parents', childTable: 'Children', filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}})
      const ready = storage.holdAssembly(new Promise(resolve => {release = resolve}))
      const saving = session.metadataDataSet.saveChanges({views: [views, relations].map(view => ({tableName: view.tableName, viewId: view.viewId}))})
      await ready
      views.updateEditingValue(key, 'pageSize', 42)
      release()
      expect((await saving).success).toBe(true)
      expect(JSON.parse(storage.stored!).tables.Parents.views.shared.pageSize).toBe(31)
      expect(views.getEditingRow(key)?.['pageSize']).toBe(42)
      expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
      expect(JSON.parse(storage.stored!).tables.Parents.views.shared.pageSize).toBe(42)
      expect(JSON.parse(storage.stored!).resourceRelations).toHaveLength(1)
      expect(storage.writes).toBe(2)
    } finally {release?.(); session.dispose()}
  })

  it.each(['confirmed', 'unknown'] as const)('creates a native binding and named view without unrelated models, then reopens a %s save', async receipt => {
    const original = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: []}
    delete original.tables.Parents
    const storage = fixture(JSON.stringify(original))
    storage.setUnavailable('Children')
    const session = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
    const selectors = [{tableName: 'DataTableBindingDefinition', viewId: 'default'}, {tableName: 'DataViewDefinition', viewId: 'default'}]
    try {
      const bindings = session.metadataDataSet.getView('DataTableBindingDefinition')!, views = session.metadataDataSet.getView('DataViewDefinition')!
      const row = {dataSetId: targetId, tableName: 'Parents', resourceType: 'database', configuration: {modelBinding: {modelId: 'P', modelName: 'P'}}}
      await bindings.addRow(row)
      bindings.discardPendingChanges()
      expect(bindings.rows.map(item => item['tableName'])).toEqual(['Children'])
      await bindings.addRow(row)
      await views.addRow({dataSetId: targetId, tableName: 'Parents', dataModelId: 'P', dataModelName: 'P', viewId: 'detail', pageSize: 31})
      if (receipt === 'unknown') {
        storage.failNextWrite()
        await expect(session.metadataDataSet.saveChanges({views: selectors})).rejects.toThrow('response lost')
        expect(session.viewState?.saveStatus).toBe('unknown')
      }
      expect((await session.metadataDataSet.saveChanges({views: selectors})).success).toBe(true)
      expect(storage.writes).toBe(1)
      expect(storage.validationScopes.every(scope => scope.length === 1 && scope[0] === 'Parents')).toBe(true)
      expect(session.definitionStatus).toBe('unloaded')
      expect(JSON.parse(storage.stored!).tables.Parents).toEqual({modelBinding: {modelId: 'P', modelName: 'P'}, views: {default: {}, detail: {pageSize: 31}}})
      expect(JSON.parse(storage.stored!).tables.Children).toEqual(original.tables.Children)
    } finally {session.dispose()}
    storage.setUnavailable('')
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    try {
      expect(reopened.definitionDataSet!.getTable('Parents')!.modelBinding).toEqual({modelId: 'P', modelName: 'P'})
      expect(reopened.definitionDataSet!.getView('Parents', 'default')).toBeDefined()
      expect(reopened.definitionDataSet!.getView('Parents', 'detail')!.pageSize).toBe(31)
    } finally {reopened.dispose()}
  })

  it.each(['confirmed', 'unknown'] as const)('cancels and removes an exact native binding without assembling other models for a %s save', async receipt => {
    const original = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: [], layout: {tablePositions: {Parents: {x: 10, y: 20}}}}
    const storage = fixture(JSON.stringify(original))
    storage.setUnavailable('Children')
    const session = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
    const selection = {tableName: 'Parents', modelId: 'P', modelName: 'P', expectedText: storage.stored!}
    const selectors = [{tableName: 'DataTableBindingDefinition', viewId: 'default'}]
    try {
      const bindings = session.metadataDataSet.getView('DataTableBindingDefinition')!
      await expect(session.removeModelBinding({...selection, modelId: 'wrong'})).rejects.toThrow('SCENARIO_VIEW_MODEL_IDENTITY')
      await session.removeModelBinding(selection)
      bindings.discardPendingChanges()
      expect(bindings.rows.some(row => row['tableName'] === 'Parents')).toBe(true)
      expect(storage.writes).toBe(0)
      await session.removeModelBinding(selection)
      if (receipt === 'unknown') {
        storage.failNextWrite()
        await expect(session.metadataDataSet.saveChanges({views: selectors})).rejects.toThrow('response lost')
        expect(session.viewState?.saveStatus).toBe('unknown')
      }
      expect((await session.metadataDataSet.saveChanges({views: selectors})).success).toBe(true)
      expect(storage.validationScopes).toEqual([])
      expect(storage.writes).toBe(1)
      expect(JSON.parse(storage.stored!)).toEqual({...original, tables: {Children: original.tables.Children}, layout: {tablePositions: {}}})
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
    try {
      expect(reopened.metadataDataSet.getView('DataTableBindingDefinition')!.rows.map(row => row['tableName'])).toEqual(['Children'])
      expect(reopened.metadataDataSet.getView('DataViewDefinition')!.rows.every(row => row['tableName'] === 'Children')).toBe(true)
    } finally {reopened.dispose()}
  })

  it.each(['confirmed', 'unknown'] as const)('saves native computed columns and their view through the same DataSet with a %s receipt', async receipt => {
    const original = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: []}
    const storage = fixture(JSON.stringify(original))
    storage.setUnavailable('Children')
    const session = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
    const selectors = [{tableName: 'DataTableBindingDefinition', viewId: 'default'}, {tableName: 'DataViewDefinition', viewId: 'default'}]
    try {
      const bindings = session.metadataDataSet.getView('DataTableBindingDefinition')!, views = session.metadataDataSet.getView('DataViewDefinition')!
      const row = bindings.rows.find(item => item['tableName'] === 'Parents')!, key = bindings.getPkKey(row)!
      const definition = {...row['configuration'] as Record<string, unknown>, columns: [{name: 'display', type: 'string', computeExpression: 'id + "!"'}]}
      bindings.updateEditingValue(key, 'configuration', definition)
      bindings.discardPendingChanges()
      expect(bindings.getEditingRow(key)?.['configuration']).toEqual(row['configuration'])
      expect(storage.writes).toBe(0)
      bindings.updateEditingValue(key, 'configuration', definition)
      const shared = views.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!, sharedKey = views.getPkKey(shared)!
      views.updateEditingValue(sharedKey, 'labelField', 'display')
      if (receipt === 'unknown') {
        storage.failNextWrite()
        await expect(session.metadataDataSet.saveChanges({views: selectors})).rejects.toThrow('response lost')
        expect(session.viewState?.saveStatus).toBe('unknown')
        expect(bindings.hasEditingChanges() || bindings.dirtyTracking.hasPendingChanges()).toBe(true)
      }
      expect((await session.metadataDataSet.saveChanges({views: selectors})).success).toBe(true)
      expect(storage.writes).toBe(1)
      expect(storage.validationScopes.every(scope => scope.length === 1 && scope[0] === 'Parents')).toBe(true)
      expect(session.definitionStatus).toBe('unloaded')
      expect(bindings.hasEditingChanges() || views.hasEditingChanges()).toBe(false)
      expect(JSON.parse(storage.stored!).tables.Children).toEqual(original.tables.Children)
      expect(JSON.parse(storage.stored!).tables.Parents.views.shared.labelField).toBe('display')
    } finally {session.dispose()}
    storage.setUnavailable('')
    const runtime = storage.openOwner()
    const reopened = await runtime.service.openDesignSession(targetId)
    try {
      const consumer = reopened.definitionDataSet!.getView('Parents', 'shared')!
      expect(consumer.labelField).toBe('display')
      expect(runtime.http.requests).toEqual([])
      runtime.http.response = {status: 200, statusText: 'OK', headers: {}, data: {Code: 200, Result: {primaryKeyField: 'id', allowAdd: false,
        data: {Items: [{id: 'P1', lingma_sys_params: {e: [], r: [], h: [], m: [], d: false}}], Count: 1}}}}
      expect((await consumer.loadFromServer()).success).toBe(true)
      expect(runtime.http.requests).toHaveLength(1)
      expect(consumer.rows[0]?.['display']).toBe('P1!')
      expect(reopened.definitionDataSet!.getView('Children', 'shared')!.pageSize).toBe(15)
    } finally {reopened.dispose()}
  })

  it('rejects removal of a native computed column still used by another view and keeps the edit cancellable', async () => {
    const original = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: []}
    original.tables.Parents.columns = [{name: 'display', type: 'string', computeExpression: 'id'}]
    original.tables.Parents.views.shared.labelField = 'display'
    const storage = fixture(JSON.stringify(original))
    storage.setUnavailable('Children')
    const session = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
    try {
      const bindings = session.metadataDataSet.getView('DataTableBindingDefinition')!
      const row = bindings.rows.find(item => item['tableName'] === 'Parents')!, key = bindings.getPkKey(row)!
      bindings.updateEditingValue(key, 'configuration', {...row['configuration'] as Record<string, unknown>, columns: []})
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: bindings.tableName, viewId: bindings.viewId}]})).rejects.toThrow('SCENARIO_VIEW_FIELD: labelField')
      expect(storage.validationScopes).toEqual([['Parents']])
      expect(storage.writes).toBe(0)
      expect(bindings.hasEditingChanges() || bindings.dirtyTracking.hasPendingChanges()).toBe(true)
      bindings.discardPendingChanges()
      expect(bindings.hasEditingChanges()).toBe(false)
      expect(JSON.parse(storage.stored!)).toEqual(original)
    } finally {session.dispose()}
  })

  it.each(['edit', 'clear', 'add', 'delete'])('saves a definition %s through the bound DataSet and reopens the file', async operation => {
    const storage = fixture(), session = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
    const view = session.metadataDataSet.getView('DataViewDefinition')!
    const row = view.rows[1]!, key = view.getPkKey(row)!
    try {
      if (operation === 'add') await view.addRow({dataSetId: targetId, dataModelId: 'P', tableName: 'Parents', viewId: 'new', pageSize: 31})
      else if (operation === 'delete') await view.removeRow(key)
      else view.updateEditingValue(key, 'pageSize', operation === 'clear' ? undefined : 31)
      const saved = await session.metadataDataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId}]})
      expect(saved.success).toBe(true)
      expect(storage.writes).toBe(1)
      expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(session.viewState?.dirty).toBe(false)
      const reopened = await storage.openOwner().service.openDesignSession(targetId)
      try {
        const views = (JSON.parse(storage.stored!).tables.Parents.views)
        if (operation === 'delete') expect(views.shared).toBeUndefined()
        else if (operation === 'clear') expect(views.shared).not.toHaveProperty('pageSize')
        else expect(views[operation === 'add' ? 'new' : 'shared'].pageSize).toBe(31)
        expect(reopened.definitionDataSet?.getView('Children', 'shared')?.pageSize).toBe(15)
      } finally {reopened.dispose()}
    } finally {session.dispose()}
  })


  it('preserves relation rows after a view edit and lets the unchanged relation owner stage its next edit', async () => {
    const config = {...JSON.parse(initial), schemaVersion: 2, resourceRelations: [{relationId: 'R', parentTable: 'Parents', childTable: 'Children',
      filterExpression: {field: 'id', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}, cascadeDelete: false}]}
    const storage = fixture(JSON.stringify(config)), session = await storage.openOwner().service.openDesignSession(targetId)
    try {
      const view = session.metadataDataSet.getView('DataViewDefinition')!, key = view.getPkKey(view.rows[1]!)!
      const relations = session.metadataDataSet.getView('DataResourceRelationDefinition')!, row = relations.rows[0]!
      relations.setCurrentRowById(relations.getPkKey(row)!)
      view.updateEditingValue(key, 'pageSize', 31)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
      expect(relations.rows).toHaveLength(1)
      expect(relations.currentRow).toBe(row)
      relations.updateEditingValue(relations.getPkKey(row)!, 'cascadeDelete', true)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
      expect(JSON.parse(storage.stored!)).toMatchObject({tables: {Parents: {views: {shared: {pageSize: 31}}}}, resourceRelations: [{cascadeDelete: true}]})
      expect(storage.writes).toBe(2)
    } finally {session.dispose()}
  })
  it('does not reread models or replace a clean full projection when no view definition changed', async () => {
    const storage = fixture(), session = await storage.openOwner().service.openDesignSession(targetId)
    try {
      const projection = session.definitionDataSet
      storage.allowAssemblies(0)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
      expect(session.definitionDataSet).toBe(projection)
      expect(storage.validationScopes).toHaveLength(1)
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })
  it('keeps required cascade models in validation and retains the edit when their resource is unavailable', async () => {
    const config = JSON.parse(initial)
    config.viewCascades = [{parentTable: 'Parents', parentViewId: 'shared', childTable: 'Children', childViewId: 'shared',
      filterBindings: [{sourceField: 'id', targetField: 'id'}]}]
    const text = JSON.stringify(config), storage = fixture(text)
    storage.setUnavailable('Children')
    const session = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
    try {
      const view = session.metadataDataSet.getView('DataViewDefinition')!, row = view.rows[1]!, key = view.getPkKey(row)!
      view.updateEditingValue(key, 'pageSize', 31)
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).rejects.toThrow('unrelated resource unavailable')
      expect(storage.validationScopes).toEqual([['Parents', 'Children']])
      expect(view.getEditingRow(key)?.['pageSize']).toBe(31)
      expect(session.viewState?.text).toBe(text)
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })
  it.each(['edit', 'add', 'delete'])('stages a view %s from a lazy session while an unrelated model is unavailable, saves the complete file and reopens', async operation => {
    const storage = fixture()
    storage.setUnavailable('Children')
    const session = await storage.openOwner().service.openDesignSession(targetId, {deferDefinition: true})
    try {
      const view = session.metadataDataSet.getView('DataViewDefinition')!
      const row = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!, key = view.getPkKey(row)!
      if (operation === 'edit') view.updateEditingValue(key, 'pageSize', 31)
      else if (operation === 'add') await view.addRow({dataSetId: targetId, dataModelId: 'P', tableName: 'Parents', viewId: 'extra', pageSize: 31})
      else await view.removeRow(key)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
      expect(storage.validationScopes).toEqual([['Parents']])
      expect(session.definitionStatus).toBe('unloaded')
      expect(storage.assembled.every(candidate => candidate.destroyed)).toBe(true)
      expect(storage.writes).toBe(1)
      expect(storage.validationScopes).toEqual([['Parents']])
      expect(JSON.parse(storage.stored!).tables.Children).toEqual(JSON.parse(initial).tables.Children)
      expect(JSON.parse(storage.stored!)).not.toHaveProperty('schemaVersion')
    } finally {session.dispose()}
    storage.setUnavailable('')
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    try {
      expect(reopened.definitionDataSet!.getView('Children', 'shared')!.pageSize).toBe(15)
      if (operation === 'delete') expect(reopened.definitionDataSet!.getView('Parents', 'shared')).toBeUndefined()
      else expect(reopened.definitionDataSet!.getView('Parents', operation === 'add' ? 'extra' : 'shared')!.pageSize).toBe(31)
    } finally {reopened.dispose()}
  })
  it.each(['view edit', 'unchanged definition'] as const)('preserves scoped/full validation ownership for %s without requiring a second source read during save', async mode => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const previous = session.definitionDataSet!
    try {
      storage.allowAssemblies(1)
      if (mode === 'view edit') {
        const view = session.metadataDataSet.getView('DataViewDefinition')!
        const row = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
        view.updateEditingValue(view.getPkKey(row)!, 'pageSize', 31)
        await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
      } else expect((await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).success).toBe(true)
      expect(previous.destroyed).toBe(mode === 'view edit')
      if (mode === 'view edit') {
        expect(session.definitionStatus).toBe('unloaded')
        expect(() => session.definitionDataSet).toThrow('DATA_SPACE_DESIGN_SESSION_STALE')
        expect(storage.assembled.at(-1)?.destroyed).toBe(true)
        expect(storage.validationScopes.at(-1)).toEqual(['Parents'])
      } else {
        const current = session.definitionDataSet!
        expect(current).toBe(previous)
        expect(current).toBe(storage.assembled.at(-1))
        expect(current.destroyed).toBe(false)
        expect(current.getView('Parents', 'shared')!.pageSize).toBe(10)
        await session.loadDefinition()
        expect(session.definitionDataSet).toBe(current)
        const options = session.metadataDataSet.getTable('DataViewFieldOption')!
        expect(options.rows).toContainEqual(expect.objectContaining({tableName: 'Parents', viewId: 'shared', name: 'id'}))
      }
      expect(storage.writes).toBe(mode === 'view edit' ? 1 : 0)
      expect(session.definitionStatus).toBe(mode === 'view edit' ? 'unloaded' : 'ready')
      expect(session.viewState?.dirty).toBe(false)
    } finally {session.dispose()}
    expect(storage.assembled.every(dataSet => dataSet.destroyed)).toBe(true)
    storage.allowAssemblies(1)
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    try {
      expect(reopened.definitionDataSet!.getView('Parents', 'shared')!.pageSize).toBe(mode === 'view edit' ? 31 : 10)
      expect(reopened.definitionDataSet!.getView('Children', 'shared')!.pageSize).toBe(15)
    } finally {reopened.dispose()}
  })

  it('rejects replacing a query with pending edits and preserves the original edit for saving', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    try {
      const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
      const edited = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
      view.updateEditingValue(view.getPkKey(edited)!, 'pageSize', 37)
      expect(() => view.replaceRows(view.rows.filter(item => item['tableName'] === 'Children'))).toThrow('DATA_VIEW_UNSAVED_CHANGES')
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
      expect(JSON.parse(storage.stored!)).toMatchObject({tables: {
        Parents: {views: {shared: {pageSize: 37}}}, Children: {views: {shared: {pageSize: 15}}},
      }})
    } finally {session.dispose()}
  })

  it('cancels file definition edits through the original DataView baseline without a second query', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    try {
      const view = session.metadataDataSet.getView('DataViewDefinition')!
      const before = structuredClone(view.rows)
      const edit = before.find(row => row['tableName'] === 'Parents' && row['viewId'] === 'shared')!
      view.updateEditingValue(view.getPkKey(edit)!, 'pageSize', 99)
      await view.addRow({tableName: 'Parents', dataModelId: 'P', dataModelName: 'Parents', viewId: 'temporary'})
      const other = before.find(row => row['tableName'] === 'Children' && row['viewId'] === 'shared')!
      await view.removeRow(view.getPkKey(other)!)
      const query = vi.spyOn(view, 'refresh')
      session.metadataDataSet.getView('DataViewDefinition', 'default')!.discardPendingChanges()
      expect(query).not.toHaveBeenCalled()
      expect(view.rows).toEqual(before)
      expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(false)
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it('rejects a file change during staging without publishing its obsolete candidate or clearing the edit', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    try {
      const view = session.metadataDataSet.getView('DataViewDefinition')!
      const row = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
      const key = view.getPkKey(row)!
      view.updateEditingValue(key, 'pageSize', 31)
      const file = owner.workspace.getScenarioViews(targetId)!
      const changed = initial.replace('"pageSize":10', '"pageSize":45')
      const unsubscribe = file.subscribe(() => {unsubscribe(); file.setText(changed)})
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).rejects.toThrow('SCENARIO_DEFINITION_STALE')
      expect(file.getText()).toBe(changed)
      expect(view.getEditingRow(key)?.['pageSize']).toBe(31)
      expect(storage.assembled.every(dataSet => dataSet.destroyed)).toBe(true)
      expect(storage.writes).toBe(0)
      session.metadataDataSet.getView('DataViewDefinition', 'default')!.discardPendingChanges()
      await session.loadDefinition()
      expect(session.definitionDataSet!.getView('Parents', 'shared')!.pageSize).toBe(45)
    } finally {session.dispose()}
  })

  it('does not mark a filtered query result as a definition change or write an unchanged file', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    try {
      const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
      view.replaceRows(view.rows.slice(0, 1))
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
      expect(storage.writes).toBe(0)
      expect(session.viewState?.dirty).toBe(false)
      expect(storage.stored).toBe(initial)
    } finally {session.dispose()}
  })

  it.each(['edit', 'delete'] as const)('preserves unloaded view definitions when the loaded subset performs %s', async operation => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    try {
      const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
      const row = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
      view.replaceRows([row])
      if (operation === 'edit') view.updateEditingValue(view.getPkKey(row)!, 'pageSize', 31)
      else await view.removeRow(view.getPkKey(row)!)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    try {
      expect(reopened.definitionDataSet?.getView('Children', 'shared')?.pageSize).toBe(15)
      expect(reopened.definitionDataSet?.getView('Parents', 'default')).toBeDefined()
      if (operation === 'edit') expect(reopened.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(31)
      else expect(reopened.definitionDataSet?.getView('Parents', 'shared')).toBeUndefined()
      expect(storage.writes).toBe(1)
    } finally {reopened.dispose()}
  })

  it('edits a named view through the metadata DataSet and reopens the persisted native configuration', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const table = session.metadataDataSet.getTable('DataViewDefinition')
    expect(table, 'metadata must contain view definitions, not only query views').toBeDefined()
    const view = table!.getView('default')!
    expect(table!.modelBinding).toBeUndefined()
    expect(view.rows).toHaveLength(4)
    const row = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
    expect(row).toMatchObject({dataSetId: targetId, dataModelId: 'P', pageSize: 10})
    view.updateEditingValue(view.getPkKey(row)!, 'pageSize', 31)
    expect(storage.stored).toBe(initial)
    await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    expect(session.viewState?.dirty).toBe(false)
    expect(storage.writes).toBe(1)
    expect(session.definitionStatus).toBe('unloaded')
    expect(session.viewState?.config).toMatchObject({tables: {Parents: {views: {shared: {pageSize: 31}}}}})
    session.dispose()
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    expect(reopened.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(31)
    expect(reopened.definitionDataSet?.getView('Children', 'shared')?.pageSize).toBe(15)
    expect(reopened.metadataDataSet.getView('DataViewDefinition', 'default')?.rows)
      .toContainEqual(expect.objectContaining({dataModelId: 'P', viewId: 'shared', pageSize: 31}))
    expect(storage.writes).toBe(1)
    expect(storage.stored).not.toMatch(/DataViewDefinition|dataModelId|_pk|"rows"/)
    reopened.dispose()
  })

  it('round-trips all native configuration properties without serializing definition-query state', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const row = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
    const config = {fieldProjection: [{fieldId: 'P-id', source: 'resource', resourceFieldId: 'P-id',
      resourceField: 'id', viewField: 'id', type: 'string', label: 'ID', output: true, sortOrder: 0,
      sortDirection: null, group: 0, distinct: false, primaryKey: true, value: '', valueFunction: '', expression: ''}],
    queryContext: {term: 'a,b', ids: [0, false]}, filterExpression: {field: 'id', operator: 'eq', value: 'a'},
    sortExpression: [{field: 'id', direction: 'desc'}], autoCurrentFirst: false, autoSelectFirst: false,
    page: 2, pageSize: 7, treeConfig: {idField: 'id', parentIdField: 'id', treeMode: 'flat', lazy: false},
    valueField: ['id'], labelField: 'id', selectionDelimiter: '|', autoLoad: false, commitMode: 'staged',
    aggregates: {count: {type: 'count', field: 'id'}}}
    for (const [key, value] of Object.entries(config)) view.updateEditingValue(view.getPkKey(row)!, key, value)
    view.pageSize = 1
    await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    session.dispose()
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    expect(reopened.viewState?.config).toMatchObject({tables: {Parents: {views: {shared: config}}}})
    expect(reopened.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(7)
    expect(reopened.metadataDataSet.getView('DataViewDefinition', 'default')?.rows).toHaveLength(4)
    reopened.dispose()
  })

  it('adds and deletes named view definitions while retaining unrelated file configuration', async () => {
    const storage = fixture(initial.replace('"viewCascades":[]', '"viewCascades":[],"layout":{"tablePositions":{"Parents":{"x":1,"y":2}}}'))
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const shared = view.rows.find(row => row['tableName'] === 'Parents' && row['viewId'] === 'shared')!
    await view.removeRow(view.getPkKey(shared)!)
    await view.addRow({dataSetId: targetId, dataModelId: 'P', tableName: 'Parents', viewId: 'detail', selectionDelimiter: ''})
    await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    session.dispose()
    const reopened = await storage.openOwner().service.openDesignSession(targetId)
    expect(reopened.definitionDataSet?.getView('Parents', 'shared')).toBeUndefined()
    expect(reopened.definitionDataSet?.getView('Parents', 'detail')?.selectionDelimiter).toBe('')
    expect(reopened.definitionDataSet?.layout?.tablePositions?.['Parents']).toEqual({x: 1, y: 2})
    expect(reopened.definitionDataSet?.getView('Children', 'shared')?.pageSize).toBe(15)
    reopened.dispose()
  })

  it.each([
    ['pageSize', 0], ['dataModelId', 'C'], ['rows', []], ['queryContext', {bad: Number.NaN}],
    ['queryContext', {bad: new Date('2026-10-09T00:00:00Z')}],
  ])('preserves an invalid %s edit and never changes the file', async (field, value) => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const row = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
    const key = view.getPkKey(row)!
    view.updateEditingValue(key, String(field), value)
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).rejects.toThrow()
    expect(view.getEditingRow(key)?.[String(field)]).toEqual(value)
    expect(session.viewState?.text).toBe(initial)
    expect(storage.writes).toBe(0)
    session.dispose()
  })

  it('clears an optional configuration property instead of materializing runtime defaults', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const row = view.rows.find(item => item['tableName'] === 'Parents' && item['viewId'] === 'shared')!
    view.updateEditingValue(view.getPkKey(row)!, 'pageSize', undefined)
    await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    expect(session.viewState?.config).toMatchObject({tables: {Parents: {views: {shared: {}}}}})
    expect(session.viewState?.text).not.toContain('"pageSize":10')
    await session.loadDefinition()
    expect(session.definitionDataSet?.getView('Parents', 'shared')?.pageSize).toBe(20)
    session.dispose()
  })

  it('requires explicit discard before refresh or other editors can overwrite metadata edits', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const row = view.rows[1]!
    const key = view.getPkKey(row)!
    view.updateEditingValue(key, 'pageSize', 99)
    await expect(session.refresh()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    for (const method of ['stageDefinition', 'createView', 'stageView', 'saveViews', 'verifyViews']) expect(method in session).toBe(false)
    expect(view.getEditingRow(key)?.['pageSize']).toBe(99)
    session.metadataDataSet.getView('DataViewDefinition', 'default')!.discardPendingChanges()
    await session.refresh()
    expect(view.rows[1]?.['pageSize']).toBe(10)
    expect(session.viewState?.dirty).toBe(false)
    session.dispose()
  })

  it('retains edits made during asynchronous candidate validation', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const key = view.getPkKey(view.rows[1]!)!
    view.updateEditingValue(key, 'pageSize', 31)
    let release!: () => void
    const ready = storage.holdAssembly(new Promise(resolve => {release = resolve}))
    const pending = session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    await ready
    view.updateEditingValue(key, 'pageSize', 32)
    release()
    await expect(pending).resolves.toMatchObject({success: true})
    expect(storage.assembled.at(-1)?.destroyed).toBe(true)
    expect(session.definitionStatus).toBe('unloaded')
    expect(view.getEditingRow(key)?.['pageSize']).toBe(32)
    expect(JSON.parse(storage.stored!).tables.Parents.views.shared.pageSize).toBe(31)
    expect(storage.writes).toBe(1)
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
    expect(JSON.parse(storage.stored!).tables.Parents.views.shared.pageSize).toBe(32)
    expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(false)
    expect(storage.writes).toBe(2)
    session.dispose()
  })

  it('keeps a changed file and local definitions separate until explicit discard and refresh', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const key = view.getPkKey(view.rows[1]!)!
    view.updateEditingValue(key, 'pageSize', 31)
    const external = initial.replace('"pageSize":10', '"pageSize":45')
    owner.workspace.getScenarioViews(targetId)!.setText(external)
    expect(() => session.inspectInputParameters()).toThrow('DATA_SPACE_DESIGN_SESSION_STALE')
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).rejects.toThrow('SCENARIO_DEFINITION_FILE_STATE')
    expect(view.getEditingRow(key)?.['pageSize']).toBe(31)
    expect(session.viewState?.text).toBe(external)
    session.metadataDataSet.getView('DataViewDefinition', 'default')!.discardPendingChanges()
    await session.refresh()
    expect(view.rows[1]?.['pageSize']).toBe(45)
    session.dispose()
  })

  it('keeps a missing file explicit and supports creating its first view', async () => {
    const storage = fixture(null)
    const session = await storage.openOwner().service.openDesignSession(targetId)
    expect(session.metadataDataSet.getView('DataViewDefinition', 'default')?.rows).toEqual([])
    expect(session.viewState).toBeNull()
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
    expect(storage.stored).toBeNull()
    const view = session.metadataDataSet.getView('DataViewDefinition')!
    await view.addRow({dataSetId: targetId, tableName: 'Parents', dataModelId: 'P', dataModelName: 'P', viewId: 'detail'})
    expect(view.rows).toHaveLength(1); expect(storage.writes).toBe(0)
    expect((await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).success).toBe(true)
    await view.refresh()
    expect(view.rows.map(row => row['viewId']).sort()).toEqual(['default', 'detail'])
    expect(storage.writes).toBe(1)
    session.dispose()
  })

  it('verifies an unknown file save without replaying it or losing definitions', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    view.updateEditingValue(view.getPkKey(view.rows[1]!)!, 'pageSize', 28)
    storage.failNextWrite()
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).rejects.toThrow('response lost')
    expect(session.viewState?.saveStatus).toBe('unknown')
    expect(view.getEditingRow(view.getPkKey(view.rows[1]!)!)?.['pageSize']).toBe(28)
    expect((await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).success).toBe(true)
    expect(view.rows[1]?.['pageSize']).toBe(28)
    expect(storage.writes).toBe(1)
    expect(session.viewState?.dirty).toBe(false)
    session.dispose()
  })

  it.each(['binding', 'view'])('retains later view edits while the captured %s changes are validating', async mode => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const key = view.getPkKey(view.rows[1]!)!
    if (mode === 'binding') {
      const bindings = session.metadataDataSet.getView('DataTableBindingDefinition')!
      const row = bindings.rows.find(item => item['tableName'] === 'Parents')!
      bindings.updateEditingValue(bindings.getPkKey(row)!, 'configuration', {...row['configuration'] as Record<string, unknown>, businessCategory: 'reference'})
    } else view.updateEditingValue(key, 'pageSize', 50)
    let release!: () => void
    const ready = storage.holdAssembly(new Promise(resolve => {release = resolve}))
    const pending = session.metadataDataSet.saveChanges({views: [{tableName: mode === 'binding' ? 'DataTableBindingDefinition' : 'DataViewDefinition', viewId: 'default'}]})
    await ready
    view.updateEditingValue(key, 'pageSize', 42)
    release()
    await expect(pending).resolves.toMatchObject({success: true})
    expect(view.getEditingRow(key)?.['pageSize']).toBe(42)
    expect(session.viewState?.config).toMatchObject({tables: {Parents: {views: {shared: {pageSize: mode === 'binding' ? 10 : 50}}}}})
    expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(true)
    await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    expect(session.viewState?.config).toMatchObject({tables: {Parents: {views: {shared: {pageSize: 42}}}}})
    session.dispose()
  })

  it('preserves concurrent edits while retaining the failed-query write guard until discard and refresh', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const key = view.getPkKey(view.rows[1]!)!
    const pending = session.refresh()
    view.updateEditingValue(key, 'pageSize', 42)
    await expect(pending).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    expect(view.getEditingRow(key)?.['pageSize']).toBe(42)
    expect(session.viewState?.text).toBe(initial)
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).rejects.toThrow('DATA_VIEW_RESULT_STALE')
    expect(storage.writes).toBe(0)
    expect(view.getEditingRow(key)?.['pageSize']).toBe(42)
    view.discardPendingChanges()
    await session.refresh()
    view.updateEditingValue(key, 'pageSize', 42)
    await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    expect(session.viewState?.config).toMatchObject({tables: {Parents: {views: {shared: {pageSize: 42}}}}})
    session.dispose()
  })

  it('keeps a new definition as a DataView change while a concurrent refresh refuses to discard it', async () => {
    const session = await fixture(null).openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const pending = expect(session.refresh()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
    await view.addRow({dataSetId: targetId, dataModelId: 'P', dataModelName: 'Parents', tableName: 'Parents', viewId: 'detail'})
    await pending
    expect(view.rows).toHaveLength(1)
    session.metadataDataSet.getView('DataViewDefinition', 'default')!.discardPendingChanges()
    expect(view.rows).toHaveLength(0)
    expect(session.viewState).toBeNull()
    session.dispose()
  })

  it('allows local configuration editing without sending file definitions through database saveChanges', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const records = owner.metadata.addTable('Base_DataModel', [{name: 'rowid', type: 'string', isPrimaryKey: true}])
    records.getView('default')!.replaceRows([{rowid: 'P'}])
    const session = await owner.service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    const row = view.rows[1]!
    expect(view.fieldAccess(row, 'pageSize').write).toBe('allowed')
    expect(view.fieldAccess(row, view.primaryKey).write).toBe('denied')
    expect(records.getView('default')!.fieldAccess(records.getView('default')!.rows[0]!, 'rowid').write).toBe('denied')
    view.updateEditingValue(view.getPkKey(row)!, 'pageSize', 29)
    expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
    expect(storage.writes).toBe(1)
    await session.loadDefinition()
    expect(records.getView('default')!.rows).toEqual([expect.objectContaining({rowid: 'P'})])
    expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
    expect(storage.writes).toBe(1)
    session.dispose()
  })

  it('releases the newly loaded metadata if its table conflicts with the file-definition model', async () => {
    const owner = fixture().openOwner()
    owner.metadata.addTable('DataViewDefinition', [{name: 'id', type: 'string'}])
    await expect(owner.service.openDesignSession(targetId)).rejects.toThrow(/already exists/)
    expect(owner.metadata.destroyed).toBe(true)
  })

  it.each(['default', 'duplicate'])('rejects %s identity damage without losing local rows', async mode => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    if (mode === 'default') await view.removeRow(view.getPkKey(view.rows[0]!)!)
    else await view.addRow({dataSetId: targetId, dataModelId: 'P', tableName: 'Parents', viewId: 'shared'})
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})).rejects.toThrow()
    expect(view.rows).toHaveLength(mode === 'default' ? 3 : 5)
    expect(session.viewState?.text).toBe(initial)
    session.dispose()
  })

  it.each(['scope', 'dispose'])('rejects late metadata staging after %s changes', async mode => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession(targetId)
    const view = session.metadataDataSet.getView('DataViewDefinition', 'default')!
    view.updateEditingValue(view.getPkKey(view.rows[1]!)!, 'pageSize', 23)
    let release!: () => void
    const ready = storage.holdAssembly(new Promise(resolve => {release = resolve}))
    const pending = session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]})
    await ready
    if (mode === 'scope') storage.setScope()
    else session.dispose()
    release()
    await expect(pending).rejects.toThrow(/STALE_SCOPE|SCENARIO_DEFINITION_IDENTITY/)
    expect(storage.assembled.at(-1)?.destroyed).toBe(true)
    expect(storage.stored).toBe(initial)
    expect(storage.writes).toBe(0)
    session.dispose()
    expect(storage.assembled.every(dataSet => dataSet.destroyed)).toBe(true)
  })
})
