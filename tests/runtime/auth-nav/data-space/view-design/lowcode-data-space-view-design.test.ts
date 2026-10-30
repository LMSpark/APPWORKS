import { describe, expect, it, vi } from 'vitest'
import {createConfirmedMetadataFixture, withDefinitionResources} from './definition-resource.fixture'
import {DataSpaceRuntimeApi} from '@spark-appworks/spark-lowcode-api'
import {HttpClientBase, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import { DataSet, RequestState, type DataView, type QueryParams, type ViewMetadata } from '@spark-appworks/spark-data'
import { ProjectWorkspace, ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import { DataSpaceQueryTable } from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import { DataSpaceQueryContext } from '../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'
import { LowcodeDataSpaceViewDesign } from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'

const selection = { scenarioId: 'SPACE', tableName: 'Orders', modelId: 'MODEL', modelName: 'OrdersModel', viewId: 'summary' }
const definitionSave = {views: [{tableName: 'DataViewDefinition', viewId: 'default'}]}
const formalModel = { id: 'MODEL', metaName: 'OrdersModel', name: 'OrdersModel', sourceName: 'Orders', sourceId: 'DB',
  sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {}, fields: [
    { id: 'F-ID', modelId: 'MODEL', name: 'id', canonicalName: 'id', type: 'string', primaryKey: true,
      description: '', output: true, computed: false, order: 0, orderType: '', raw: {} },
    { id: 'F-LABEL', modelId: 'MODEL', name: 'label', canonicalName: 'label', type: 'string', primaryKey: false,
      description: '', output: true, computed: false, order: 1, orderType: '', raw: {} },
  ] }

const namedText = JSON.stringify({scenarioId: 'SPACE', tables: {Orders: {
  modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'}, views: {default: {}, summary: {}}
}}, viewCascades: []})
class DefinitionHttp extends HttpClientBase {
  protected override async executeRequest(_config: RequestConfig): Promise<HttpResponse<unknown>> {throw new Error('definition validation must not query rows')}
}
function fixture(initial: string | null = namedText, configureMetadata?: (dataSet: DataSet) => void) {
  let remote = initial
  let scope = 'current'
  const writeText = vi.fn(async (_id: string, text: string) => { remote = text })
  const readText = vi.fn(async () => remote)
  const workspace = new ProjectWorkspace({ projectId: 'APP',
    blueprint: {},
    scenarioViews: { readScope: () => scope, readText, writeText },
  })
  const readModel = vi.fn(async () => formalModel)
  const http = new DefinitionHttp()
  const assembler = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({http, readScope: () => ({token: scope, headers: {}})}), http)
  const assemble = vi.fn<ConstructorParameters<typeof LowcodeDataSpaceViewDesign>[0]['assemble']>(async ({scenarioId, config, fileExecutors, modelScope}) => assembler.assemble({
    config: modelScope === undefined ? config : config.selectModelScope(modelScope, []),
    space: {dataSpaceId: scenarioId, name: scenarioId}, models: [formalModel], relations: [], ...(fileExecutors ? {fileExecutors} : {})}))
  const loadMetadata = withDefinitionResources(async id => createConfirmedMetadataFixture(id))
  const service = new LowcodeDataSpaceViewDesign({ workspace, readModel, assemble,
    loadMetadata: async (...args) => {const dataSet = await loadMetadata(...args); configureMetadata?.(dataSet); return dataSet},
    assertScope: () => { if (scope !== 'current') throw new Error('STALE_SCOPE') } })
  return { service, workspace, readText, writeText, readModel, assemble, setScope: (value: string) => { scope = value },
    getRemote: () => remote }
}

async function openNative(f: ReturnType<typeof fixture>) {
  const session = await f.service.openDesignSession('SPACE', {deferDefinition: true})
  const view = session.metadataDataSet.getView('DataViewDefinition')!
  const row = view.rows.find(item => item['tableName'] === 'Orders' && item['viewId'] === 'summary')
  return {session, view, key: row && view.getPkKey(row)!}
}

describe('native view definitions through the designer DataSet', () => {
  it('rejects an invalid definition query before any initial file read or assembly', async () => {
    const f = fixture(namedText, dataSet => dataSet.getView('DataViewDefinition')!.configure({queryContext: {dataSpaceId: 'OTHER'}}))
    await expect(f.service.openDesignSession('SPACE')).rejects.toThrow('SCENARIO_DEFINITION_TARGET')
    expect(f.readText).not.toHaveBeenCalled()
    expect(f.assemble).not.toHaveBeenCalled()
    expect(f.writeText).not.toHaveBeenCalled()
  })

  it('rejects an invalid refreshed definition query before entering its file owner', async () => {
    const f = fixture(), {session, view} = await openNative(f)
    const load = vi.spyOn(f.workspace, 'loadScenarioViews')
    try {
      view.configure({queryContext: {dataSpaceId: 'OTHER'}})
      await expect(session.refresh({deferDefinition: true})).rejects.toThrow('SCENARIO_DEFINITION_TARGET')
      expect(load).not.toHaveBeenCalled()
      expect(view.requestState).toBe(RequestState.Failed)
      expect(f.writeText).not.toHaveBeenCalled()
    } finally {load.mockRestore(); session.dispose()}
  })

  it.each(['missing', 'failed'] as const)('owns the initial %s file read in the definition DataView request lifecycle', async outcome => {
    let source: DataView | undefined, readState: RequestState | undefined
    const f = fixture(outcome === 'missing' ? null : namedText, dataSet => {source = dataSet.getView('DataViewDefinition')!})
    f.readText.mockImplementationOnce(async () => {
      readState = source?.requestState
      if (outcome === 'failed') throw new Error('expected file read failure')
      return null
    })
    if (outcome === 'failed') await expect(f.service.openDesignSession('SPACE')).rejects.toThrow('expected file read failure')
    else {
      const session = await f.service.openDesignSession('SPACE')
      try {
        expect(session.viewState).toBeNull()
        expect(source?.requestState).toBe(RequestState.Loaded)
        expect(source?.rows).toEqual([])
      } finally {session.dispose()}
    }
    expect(readState).toBe(RequestState.Loading)
    expect(f.assemble).not.toHaveBeenCalled()
    expect(f.writeText).not.toHaveBeenCalled()
  })

  it.each([undefined, 2])('adds a model binding and named view with only their validation scope (schema %s)', async schemaVersion => {
    const initial = {scenarioId: 'SPACE', schemaVersion, tables: {
      Ignored: {modelBinding: {modelId: 'OTHER', modelName: 'OtherModel'}, views: {default: {pageSize: 31}}},
    }}
    const f = fixture(JSON.stringify(initial)), {session, view} = await openNative(f)
    try {
      expect(await view.addRow({dataSetId: 'SPACE', dataModelId: 'MODEL', dataModelName: 'OrdersModel', tableName: 'Orders', viewId: 'summary', pageSize: 11})).toBeDefined()
      expect(f.getRemote()).toBe(JSON.stringify(initial))
      expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
      const candidate = f.assemble.mock.results[0] && await f.assemble.mock.results[0].value
      expect(candidate?.dataSet.destroyed).toBe(true)
      expect(Object.keys(f.assemble.mock.calls[0]![0].config.toJSON()['tables'] as object)).toEqual(['Orders'])
      expect(JSON.parse(f.getRemote()!)).toEqual({...initial, tables: {...initial.tables, Orders: {
        modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'}, views: {summary: {pageSize: 11}, default: {}}
      }}})
      expect(f.writeText).toHaveBeenCalledOnce()
    } finally {session.dispose()}
  })

  it('creates a missing file only on save, retains a rejected new view for correction, then independently reopens it', async () => {
    const f = fixture(null), {session, view} = await openNative(f)
    try {
      await view.addRow({dataSetId: 'SPACE', dataModelId: 'MODEL', dataModelName: 'OrdersModel', tableName: 'Orders', viewId: 'summary', valueField: 'missing'})
      expect(f.workspace.getScenarioViews('SPACE')).toBeNull()
      await expect(session.metadataDataSet.saveChanges(definitionSave)).rejects.toThrow(/字段/)
      expect(f.writeText).not.toHaveBeenCalled(); expect(f.getRemote()).toBeNull()
      expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
      const key = view.getPkKey(view.rows.find(row => row['viewId'] === 'summary')!)!
      view.updateEditingValue(key, 'valueField', 'id')
      expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
      expect(f.writeText).toHaveBeenCalledOnce()
      expect(session.viewState).toMatchObject({persisted: true, dirty: false})
    } finally {session.dispose()}
    const reopened = await fixture(f.getRemote()).service.openDesignSession('SPACE')
    try {expect(reopened.definitionDataSet?.getView('Orders', 'summary')?.valueField).toBe('id')}
    finally {reopened.dispose()}
  })

  it('preserves unrelated views and configuration while cancelling and saving only the selected view', async () => {
    const initial = {scenarioId: 'SPACE', tables: {
      Orders: {modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'}, views: {
        default: {queryContext: {mode: 'keep'}}, summary: {sortExpression: [{field: 'id', direction: 'desc'}]}
      }}, Other: {modelBinding: {modelId: 'OTHER', modelName: 'OtherModel'}, views: {default: {}}}
    }, viewCascades: []}
    const f = fixture(JSON.stringify(initial)), {session, view, key} = await openNative(f)
    try {
      view.updateEditingValue(key!, 'pageSize', 25)
      view.discardPendingChanges()
      expect(view.hasEditingChanges()).toBe(false)
      expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
      expect(f.writeText).not.toHaveBeenCalled()
      view.updateEditingValue(key!, 'pageSize', 25)
      expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
      expect(JSON.parse(f.getRemote()!)).toEqual({...initial, tables: {...initial.tables, Orders: {...initial.tables.Orders,
        views: {...initial.tables.Orders.views, summary: {...initial.tables.Orders.views.summary, pageSize: 25}}}}})
      expect(f.assemble).toHaveBeenCalledOnce()
      expect(Object.keys(f.assemble.mock.calls[0]![0].config.toJSON()['tables'] as object)).toEqual(['Orders'])
      expect(f.writeText).toHaveBeenCalledOnce()
      expect(session.definitionStatus).toBe('unloaded')
    } finally {session.dispose()}
  })

  it('round-trips every native view property across two named views and an independent runtime', async () => {
    const f = fixture(null), {session, view} = await openNative(f)
    const configuration = {valueField: ['id', 'label'], labelField: 'label', onRequestComplete: 'onOrdersLoaded',
      fieldProjection: formalModel.fields.map(field => ({fieldId: field.id, source: 'resource' as const,
        resourceFieldId: field.id, resourceField: field.canonicalName, viewField: field.canonicalName,
        type: field.type, label: field.description, output: true, sortOrder: field.order, sortDirection: null,
        group: 0, distinct: false, primaryKey: field.primaryKey, value: '', valueFunction: '', expression: ''})),
      queryContext: {parentIds: [1, 2], active: false}, page: 2, pageSize: 25,
      queryConfig: {outputType: 'SelfRefData', tree: {keyField: 'id', parentField: 'label', nodeId: 'root', mode: 'child' as const}, allPages: false, maxRows: 100},
      autoCurrentFirst: false, autoSelectFirst: false, autoLoad: false,
      filterExpression: {field: 'id', operator: 'eq' as const, value: '1'}, sortExpression: [{field: 'label', direction: 'asc' as const}],
      treeConfig: {idField: 'id', textField: 'label', treeMode: 'flat' as const},
      aggregates: {recordCount: {type: 'count' as const, field: 'id'}}, selectionDelimiter: '|', commitMode: 'staged' as const,
      allowDelete: false, lockCurrentWhilePending: true,
    } satisfies Required<Omit<ViewMetadata, 'tableName' | 'viewId' | 'rows'>>
    try {
      const identity = {dataSetId: 'SPACE', dataModelId: 'MODEL', dataModelName: 'OrdersModel', tableName: 'Orders'}
      await view.addRow({...identity, viewId: 'summary', ...configuration})
      await view.addRow({...identity, viewId: 'detail', pageSize: 12, valueField: 'id'})
      expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
      expect(JSON.parse(f.getRemote()!).tables.Orders).toEqual({modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
        views: {default: {}, summary: configuration, detail: {pageSize: 12, valueField: 'id'}}})
      expect(f.getRemote()).not.toMatch(/"rows"|"columns"/)
    } finally {session.dispose()}
    const reopened = await fixture(f.getRemote()).service.openDesignSession('SPACE')
    try {
      const restored = reopened.definitionDataSet?.getView('Orders', 'summary')
      const {autoLoad, ...serializedProperties} = configuration
      expect(restored?.toJson()).toMatchObject(serializedProperties)
      expect(restored?.autoLoad).toBe(autoLoad)
      expect(restored?.autoLoadConfigured).toBe(true)
      expect(reopened.definitionDataSet?.getView('Orders', 'detail')?.pageSize).toBe(12)
    } finally {reopened.dispose()}
  })

  it.each([
    {valueField: ['id', 'missing']}, {labelField: 'missing'},
    {sortExpression: [{field: 'missing', direction: 'asc'}]},
    {treeConfig: {idField: 'missing'}}, {treeConfig: {parentIdField: 'missing'}}, {treeConfig: {textField: 'missing'}},
    {aggregates: {bad: {type: 'count', field: 'missing'}}}, {aggregates: {unknownTotal: {type: 'sum'}}},
    {queryConfig: {outputType: 'Table', fields: ['missing']}},
  ])('rejects invalid native field references on save and retains them for cancellation: %j', async configuration => {
    const f = fixture(), {session, view, key} = await openNative(f)
    try {
      for (const [field, value] of Object.entries(configuration)) view.updateEditingValue(key!, field, value)
      await expect(session.metadataDataSet.saveChanges(definitionSave)).rejects.toThrow()
      expect(f.getRemote()).toBe(namedText); expect(f.writeText).not.toHaveBeenCalled()
      expect(view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()).toBe(true)
      view.discardPendingChanges()
      expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
      expect(f.writeText).not.toHaveBeenCalled()
    } finally {session.dispose()}
  })

  it('clears explicit overrides through native edits and rejects a mismatched preview identity', async () => {
    const initial = JSON.stringify({scenarioId: 'SPACE', tables: {Orders: {modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      views: {default: {}, summary: {pageSize: 25, autoLoad: true, valueField: 'id'}}}}, viewCascades: []})
    const f = fixture(initial), {session, view, key} = await openNative(f)
    try {
      await expect(f.service.openPreview({...selection, modelId: 'OTHER'})).rejects.toThrow('MODEL_BINDING')
      expect(f.assemble).not.toHaveBeenCalled()
      for (const name of ['pageSize', 'autoLoad', 'valueField']) view.updateEditingValue(key!, name, undefined)
      expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
      expect(JSON.parse(f.getRemote()!).tables.Orders.views).toEqual({default: {}, summary: {}})
      expect(f.writeText).toHaveBeenCalledOnce()
    } finally {session.dispose()}
  })

  it('rejects a new-view preview until Base_DataSet and Base_DataModel are completely loaded', async () => {
    const f = fixture(JSON.stringify({scenarioId: 'SPACE', tables: {Orders: {
      modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'}, views: {default: {autoLoad: false}},
    }}, viewCascades: []}))
    const session = await f.service.openDesignSession('SPACE')
    await session.loadDefinition()
    const definitions = session.metadataDataSet.getView('DataViewDefinition')!
    try {
      await definitions.addRow({dataSetId: 'SPACE', dataModelId: 'MODEL', dataModelName: 'OrdersModel',
        tableName: 'Orders', viewId: 'catalogApps', autoLoad: false, pageSize: 17, queryConfig: {outputType: 'Table'}})
      const assemblies = f.assemble.mock.calls.length
      expect(session.canOpenPreview({...selection, viewId: 'catalogApps'})).toBe(false)
      await expect(session.openPreview({...selection, viewId: 'catalogApps'})).rejects.toThrow('所需元数据未完整读取或存在其他定义草稿')
      expect(f.assemble).toHaveBeenCalledTimes(assemblies)
      expect(f.getRemote()).toContain('"views":{"default":{"autoLoad":false}}')
      expect(f.writeText).not.toHaveBeenCalled()
    } finally {session.dispose()}
  })

  it('rejects a new-view preview when any other view-definition draft is pending', async () => {
    const f = fixture(JSON.stringify({scenarioId: 'SPACE', tables: {Orders: {
      modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'}, views: {default: {autoLoad: false}},
    }}, viewCascades: []}))
    const session = await f.service.openDesignSession('SPACE')
    await session.loadDefinition()
    const definitions = session.metadataDataSet.getView('DataViewDefinition')!
    try {
      await definitions.addRow({dataSetId: 'SPACE', dataModelId: 'MODEL', dataModelName: 'OrdersModel', tableName: 'Orders', viewId: 'catalogApps'})
      await definitions.addRow({dataSetId: 'SPACE', dataModelId: 'MODEL', dataModelName: 'OrdersModel', tableName: 'Orders', viewId: 'otherDraft'})
      const assemblyCount = f.assemble.mock.calls.length
      await expect(session.openPreview({...selection, viewId: 'catalogApps'})).rejects.toThrow('请先处理其他视图定义修改')
      expect(f.assemble).toHaveBeenCalledTimes(assemblyCount)
      expect(f.getRemote()).toContain('"views":{"default":{"autoLoad":false}}')
      expect(f.writeText).not.toHaveBeenCalled()
    } finally {session.dispose()}
  })

  it('keeps local display and aggregate fields while rejecting local fields used for remote ordering or tree identity', async () => {
    const config = JSON.parse(namedText)
    config.tables.Orders.columns = [{name: 'display', type: 'string', computeExpression: 'id + "!"'}]
    const f = fixture(JSON.stringify(config)), {session, view, key} = await openNative(f)
    try {
      view.updateEditingValue(key!, 'labelField', 'display')
      view.updateEditingValue(key!, 'treeConfig', {idField: 'id', textField: 'display'})
      view.updateEditingValue(key!, 'aggregates', {displayCount: {type: 'count', field: 'display'}, id: {type: 'count'}})
      expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
      const stored = f.getRemote()
      for (const [name, value] of Object.entries({sortExpression: [{field: 'display', direction: 'asc'}],
        treeConfig: {idField: 'display'}, filterExpression: {field: 'display', operator: 'eq', value: '1!'}})) {
        view.updateEditingValue(key!, name, value)
        await expect(session.metadataDataSet.saveChanges(definitionSave)).rejects.toThrow('本地计算列不能用于远端查询')
        expect(f.getRemote()).toBe(stored)
        view.discardPendingChanges()
      }
      expect(f.writeText).toHaveBeenCalledOnce()
      await session.loadDefinition()
      const consumer = session.definitionDataSet!.getView('Orders', 'summary')!
      expect(consumer.labelField).toBe('display')
      expect(consumer.treeConfig?.textField).toBe('display')
      expect(consumer.aggregates).toEqual({displayCount: {type: 'count', field: 'display'}, id: {type: 'count'}})
    } finally {session.dispose()}
  })

  it.each(['rows', 'currentRow', 'scenarioId', 'unknown', 'constructor'])(
    'rejects a new view carrying the non-configuration member %s without writing a file', async field => {
      const f = fixture(), {session, view} = await openNative(f)
      try {
        await view.addRow({dataSetId: 'SPACE', dataModelId: 'MODEL', dataModelName: 'OrdersModel',
          tableName: 'Orders', viewId: 'extra', [field]: []})
        await expect(session.metadataDataSet.saveChanges(definitionSave)).rejects.toThrow()
        expect(f.getRemote()).toBe(namedText); expect(f.writeText).not.toHaveBeenCalled()
        expect(view.dirtyTracking.hasPendingChanges()).toBe(true)
        view.discardPendingChanges()
        expect(view.rows.some(row => row['viewId'] === 'extra')).toBe(false)
      } finally {session.dispose()}
    })

  it('does not persist a prototype pseudo-member carried by a native new row', async () => {
    const f = fixture(), {session, view} = await openNative(f)
    try {
      await view.addRow({dataSetId: 'SPACE', dataModelId: 'MODEL', dataModelName: 'OrdersModel',
        tableName: 'Orders', viewId: 'extra', ['__proto__']: {pageSize: 900}})
      expect((await session.metadataDataSet.saveChanges(definitionSave)).success).toBe(true)
      const saved = JSON.parse(f.getRemote()!).tables.Orders.views.extra
      expect(saved).toEqual({})
      expect(Object.hasOwn(saved, '__proto__')).toBe(false)
      expect(saved.pageSize).toBeUndefined()
      expect(Object.getPrototypeOf(saved)).toBe(Object.prototype)
    } finally {session.dispose()}
  })

  it.each(['scope', 'dispose', 'external file'] as const)('releases a late validation result and does not write after %s changes', async reason => {
    const f = fixture(), {session, view, key} = await openNative(f)
    const assemble = f.assemble.getMockImplementation()!
    let finish!: () => void
    const gate = new Promise<void>(resolve => {finish = resolve})
    let candidate: DataSet | undefined
    f.assemble.mockImplementationOnce(async (...args) => {const result = await assemble(...args); candidate = result.dataSet; await gate; return result})
    view.updateEditingValue(key!, 'pageSize', 31)
    const saving = session.metadataDataSet.saveChanges(definitionSave).catch((error: unknown) => error)
    try {
      await vi.waitFor(() => expect(candidate).toBeDefined())
      if (reason === 'scope') f.setScope('changed')
      else if (reason === 'dispose') session.dispose()
      else f.workspace.getScenarioViews('SPACE')!.setText(namedText.replace('"summary":{}', '"summary":{"pageSize":99}'))
      finish()
      expect(await saving).toBeInstanceOf(Error)
      expect(candidate?.destroyed).toBe(true)
      expect(f.getRemote()).toBe(namedText); expect(f.writeText).not.toHaveBeenCalled()
    } finally {finish(); await saving; session.dispose()}
  })
})

describe('shared data-space view design owner', () => {

  it('assembles named preview from model-scoped configuration while retaining the original file owner', async () => {
    const initial = JSON.stringify({scenarioId: 'SPACE', schemaVersion: 2, resourceRelations: [], tables: {
      Orders: {modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'}, views: {default: {}, summary: {pageSize: 7}}},
      Ignored: {modelBinding: {modelId: 'UNAVAILABLE', modelName: 'UnavailableModel'}, views: {default: {}}},
    }})
    const f = fixture(initial)
    await f.workspace.loadScenarioViews({scenarioId: 'SPACE'})
    const preview = await f.service.openPreview(selection)
    const {dataSet} = await f.assemble.mock.results[0]!.value
    try {
      const config = f.assemble.mock.calls[0]![0].config
      expect(config).toBeInstanceOf(ScenarioViewConfig)
      expect(config.toJSON()).toEqual(JSON.parse(initial))
      expect(f.assemble.mock.calls[0]?.[0].modelScope).toBe('Orders')
      expect(dataSet.getTable('Ignored')).toBeUndefined()
      expect(preview.dataViewKey).toBe('SPACE@OrdersModel@summary')
      expect(f.workspace.getScenarioViews('SPACE')!.getText()).toBe(initial)
      expect(f.writeText).not.toHaveBeenCalled()
      f.workspace.getScenarioViews('SPACE')!.setText(initial.replace('"pageSize":7', '"pageSize":8'))
      expect(preview.disposed).toBe(true)
      expect(dataSet.destroyed).toBe(true)
    } finally {preview.dispose()}
  })

  it('assembles a model-only preview without loading or persisting a view file', async () => {
    const f = fixture()
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {PreviewModel: {
      tableName: 'PreviewModel', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {autoLoad: false}},
    }}})
    f.assemble.mockResolvedValueOnce({dataSet, diagnostics: []})
    const preview = await f.service.openModelPreview({scenarioId: 'SPACE', modelId: 'MODEL', modelName: 'OrdersModel'})
    try {
      expect(preview.dataViewKey).toBe('SPACE@OrdersModel@default')
      expect(preview.view).toBe(dataSet.getView('PreviewModel', 'default'))
      expect(f.workspace.getScenarioViews('SPACE')).toBeNull()
      expect(f.writeText).not.toHaveBeenCalled()
    } finally {preview.dispose()}
    expect(dataSet.destroyed).toBe(true)
  })

  it.each(['scope', 'file', 'identity'])('releases a delayed model-only preview when %s is invalid', async reason => {
    const f = fixture()
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {PreviewModel: {
      tableName: 'PreviewModel', modelBinding: {modelId: reason === 'identity' ? 'OTHER' : 'MODEL', modelName: 'OrdersModel'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {autoLoad: false}},
    }}})
    let finish: (() => void) | undefined
    const waiting = new Promise<void>(resolve => {finish = resolve})
    f.assemble.mockImplementationOnce(async () => {await waiting; return {dataSet, diagnostics: []}})
    const pending = f.service.openModelPreview({scenarioId: 'SPACE', modelId: 'MODEL', modelName: 'OrdersModel'})
    const rejected = expect(pending).rejects.toThrow(/STALE|IDENTITY/)
    if (reason === 'scope') f.setScope('expired')
    if (reason === 'file') await f.workspace.loadScenarioViews({scenarioId: 'SPACE'})
    finish?.(); await rejected
    expect(dataSet.destroyed).toBe(true)
    expect(f.writeText).not.toHaveBeenCalled()
  })

  it.each(['close', 'scope', 'file'])('rejects a late preview response after %s invalidates its instance', async reason => {
    const f = fixture()
    await f.workspace.loadScenarioViews({scenarioId: 'SPACE'})
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, summary: {}},
    }}})
    const view = dataSet.getView('Orders', 'summary')!
    let finish: (() => void) | undefined
    const waiting = new Promise<void>(resolve => {finish = resolve})
    const table = new DataSpaceQueryTable({scenarioId: 'SPACE', metaName: 'OrdersModel'})
    const query = vi.fn(async () => {
      await waiting
      return new DataSpaceQueryContext({identity: table.identity, scope: 'query', readScope: () => 'query',
        snapshot: table.applyResult({Result: {primaryKeyField: 'id', data: {Items: [{id: 'late'}], Count: 1}}})})
    })
    view.bindQueryExecutor({executeQuery: query})
    f.assemble.mockResolvedValueOnce({dataSet, diagnostics: []})
    const preview = await f.service.openPreview(selection)
    const pending = preview.query({context: {customer: 'A'}})
    const rejected = expect(pending).rejects.toThrow(/STALE|disposed|destroyed/i)
    await vi.waitFor(() => expect(query).toHaveBeenCalledOnce())
    await expect(preview.query({context: {customer: 'B'}})).rejects.toThrow('PENDING')
    if (reason === 'close') preview.dispose()
    else if (reason === 'scope') f.setScope('expired')
    else {
      const file = f.workspace.getScenarioViews('SPACE')!
      file.setText(file.getText().replace('"summary":{}', '"summary":{"pageSize":40}'))
    }
    finish?.(); await rejected
    expect(preview.disposed).toBe(true)
    expect(dataSet.destroyed).toBe(true)
    expect(() => preview.snapshot()).toThrow('STALE')
    expect(f.writeText).not.toHaveBeenCalled()
  })

  it('keeps two preview instances isolated and retries a failed query with only current call values', async () => {
    const f = fixture()
    await f.workspace.loadScenarioViews({scenarioId: 'SPACE'})
    const makeDataSet = () => DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, summary: {queryContext: {retained: 7}}},
    }}})
    const a = makeDataSet(), b = makeDataSet()
    const result = (id: string) => {
      const table = new DataSpaceQueryTable({scenarioId: 'SPACE', metaName: 'OrdersModel'})
      return new DataSpaceQueryContext({identity: table.identity, scope: 'query', readScope: () => 'query',
        snapshot: table.applyResult({Result: {primaryKeyField: 'id', data: {Items: [{id}], Count: 1}}})})
    }
    const aQuery = vi.fn(async () => result('A')).mockRejectedValueOnce(new Error('query temporarily failed'))
    a.getView('Orders', 'summary')!.bindQueryExecutor({executeQuery: aQuery})
    b.getView('Orders', 'summary')!.bindQueryExecutor({executeQuery: async () => result('B')})
    f.assemble.mockResolvedValueOnce({dataSet: a, diagnostics: []}).mockResolvedValueOnce({dataSet: b, diagnostics: []})
    const first = await f.service.openPreview(selection), second = await f.service.openPreview(selection)
    try {
      await second.query({context: {customer: ['B']}})
      await expect(first.query({context: {obsolete: 'drop', customer: 'old'}})).rejects.toThrow('query temporarily failed')
      expect(first.disposed).toBe(false)
      expect(() => first.snapshot()).toThrow('尚未取得有效查询结果')
      await first.query({context: {customer: ['A'], enabled: false}})
      expect(first.view.queryContext).toEqual({retained: 7, customer: ['A'], enabled: false})
      expect(second.view.queryContext).toEqual({retained: 7, customer: ['B']})
      expect(second.view.rows).toMatchObject([{id: 'B'}])
      first.dispose()
      expect(b.destroyed).toBe(false)
      expect(f.writeText).not.toHaveBeenCalled()
    } finally {first.dispose(); second.dispose()}
  })

  it('opens an isolated preview runtime and queries the bound view with typed inputs without writing definitions', async () => {
    const {service, assemble, writeText, workspace} = fixture()
    await workspace.loadScenarioViews({scenarioId: 'SPACE'})
    const before = workspace.getScenarioViews('SPACE')!.getText()
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, summary: {queryContext: {retained: 7}}},
    }}})
    const view = dataSet.getView('Orders', 'summary')!
    const table = new DataSpaceQueryTable({scenarioId: 'SPACE', metaName: 'OrdersModel'})
    const query = vi.fn(async () => new DataSpaceQueryContext({identity: table.identity, scope: 'query', readScope: () => 'query',
      snapshot: table.applyResult({Result: {primaryKeyField: 'id', allowAdd: false, data: {Items: [{id: '1',
        lingma_sys_params: {e: [], r: [], h: [], m: [], d: false}}], Count: 1}}})}))
    view.bindQueryExecutor({executeQuery: query})
    assemble.mockResolvedValueOnce({dataSet, diagnostics: []})
    const preview = await service.openPreview(selection)
    expect(query).not.toHaveBeenCalled()
    expect(preview.runtime.resolveView('SPACE@OrdersModel@summary')).toBe(view)
    await preview.query({context: {customer: ['A', 'B'], enabled: false}, pageSize: 10})
    expect(query).toHaveBeenCalledOnce()
    expect(view.queryContext).toEqual({retained: 7, customer: ['A', 'B'], enabled: false})
    expect(view.pageSize).toBe(10)
    expect(view.rows).toMatchObject([{id: '1'}])
    expect(workspace.getScenarioViews('SPACE')!.getText()).toBe(before)
    expect(writeText).not.toHaveBeenCalled()
    preview.dispose()
    expect(dataSet.destroyed).toBe(true)
  })

  it('rejects and releases a preview when its file changes before query', async () => {
    const {service, assemble, workspace} = fixture()
    await workspace.loadScenarioViews({scenarioId: 'SPACE'})
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, summary: {}},
    }}})
    const query = vi.fn(async () => {throw new Error('must not query stale configuration')})
    dataSet.getView('Orders', 'summary')!.bindQueryExecutor({executeQuery: query})
    assemble.mockResolvedValueOnce({dataSet, diagnostics: []})
    const preview = await service.openPreview(selection)
    const file = workspace.getScenarioViews('SPACE')!
    file.setText(file.getText().replace('"summary":{}', '"summary":{"pageSize":40}'))
    await expect(preview.query({context: {}})).rejects.toThrow('STALE')
    expect(query).not.toHaveBeenCalled()
    expect(dataSet.destroyed).toBe(true)
  })

  it.each([false, true])('queries dependency views again when preview input values change (autoLoad=%s)', async autoLoad => {
    const {service, assemble, workspace} = fixture()
    await workspace.loadScenarioViews({scenarioId: 'SPACE'})
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {
      Orders: {tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
        columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, summary: {}}},
      Parents: {tableName: 'Parents', modelBinding: {modelId: 'PARENT', modelName: 'ParentsModel'},
        columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {autoCurrentFirst: true}}},
    }, viewCascades: [{cascadeId: 'C', parentTable: 'Parents', parentViewId: 'default', childTable: 'Orders', childViewId: 'summary',
      filterBindings: [{sourceField: 'id', targetField: 'id'}], autoLoad}]})
    const parent = dataSet.getView('Parents', 'default')!, child = dataSet.getView('Orders', 'summary')!
    const result = (name: string) => {
      const queryTable = new DataSpaceQueryTable({scenarioId: 'SPACE', metaName: name})
      return new DataSpaceQueryContext({identity: queryTable.identity, scope: 'query', readScope: () => 'query',
      snapshot: queryTable.applyResult({Result: {primaryKeyField: 'id', allowAdd: false, data: {Items: [{id: parent.queryContext['customer'],
        lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}}], Count: 1}}})})
    }
    const parentQuery = vi.fn(async () => result('ParentsModel'))
    const childQuery = vi.fn(async (_view: DataView, _params?: QueryParams) => result('OrdersModel'))
    parent.bindQueryExecutor({executeQuery: parentQuery}); child.bindQueryExecutor({executeQuery: childQuery})
    assemble.mockResolvedValueOnce({dataSet, diagnostics: []})
    const preview = await service.openPreview(selection)
    try {
      await preview.query({context: {customer: 'A'}})
      await preview.query({context: {customer: 'B'}})
      expect(parentQuery).toHaveBeenCalledTimes(2)
      expect(childQuery.mock.calls[1]?.[1]).toMatchObject({filter: {field: 'id', operator: 'eq', value: 'B'}})
    } finally {preview.dispose()}
  })

  it('previews real DataView query rows with visible, masked and hidden fields and destroys the instance', async () => {
    const { service, assemble, workspace } = fixture()
    await workspace.loadScenarioViews({scenarioId: 'SPACE'})
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}, {name: 'label', type: 'string'},
        {name: 'secret', type: 'string'}, {name: 'masked', type: 'string'}],
      views: {default: {}, summary: {}},
    }}})
    const view = dataSet.getView('Orders', 'summary')
    if (!view) throw new Error('summary view missing')
    const table = new DataSpaceQueryTable({scenarioId: 'SPACE', metaName: 'OrdersModel'})
    const context = new DataSpaceQueryContext({identity: table.identity, scope: 'query', readScope: () => 'query',
      snapshot: table.applyResult({Result: {primaryKeyField: 'id', allowAdd: false, data: {Items: [
        {id: '1', label: 'visible', secret: 'hidden-value', masked: 'masked-value',
          lingma_sys_params: {e: [], r: [], h: ['secret'], m: ['masked'], d: false}},
      ], Count: 1}}})})
    view.bindQueryExecutor({executeQuery: async () => context})
    const destroy = vi.spyOn(dataSet, 'destroy')
    assemble.mockResolvedValueOnce({dataSet, diagnostics: []})
    const preview = await service.preview(selection)
    expect(preview).toMatchObject({total: 1, rows: [{id: '1', label: 'visible', masked: '••••'}]})
    expect(preview.rows[0]).not.toHaveProperty('secret')
    expect(destroy).toHaveBeenCalledOnce()
  })
  it('destroys a failed preview DataSet without returning unverified rows', async () => {
    const {service, assemble, workspace} = fixture()
    await workspace.loadScenarioViews({scenarioId: 'SPACE'})
    const dataSet = DataSet.fromJson({scenarioId: 'SPACE', dataSetName: 'SPACE', tables: {Orders: {
      tableName: 'Orders', modelBinding: {modelId: 'MODEL', modelName: 'OrdersModel'},
      columns: [{name: 'id', type: 'string', isPrimaryKey: true}], views: {default: {}, summary: {}},
    }}})
    const view = dataSet.getView('Orders', 'summary')
    if (!view) throw new Error('summary view missing')
    view.bindQueryExecutor({executeQuery: async () => { throw new Error('formal query denied') }})
    const destroy = vi.spyOn(dataSet, 'destroy')
    assemble.mockResolvedValueOnce({dataSet, diagnostics: []})
    await expect(service.preview(selection)).rejects.toThrow('formal query denied')
    expect(destroy).toHaveBeenCalledOnce()
  })
})
