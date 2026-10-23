import {withDefinitionResources} from './definition-resource.fixture'
import {describe, expect, it, vi} from 'vitest'
import {DataSet, type DataViewFieldCascade} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace} from '@spark-appworks/spark-project-model'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewDesign} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
const query = {parentTable: 'Orders', parentViewId: 'selected', childTable: 'Options', childViewId: 'grid',
  filterBindings: [{targetField: 'parentId'}], autoLoad: false}
const field: DataViewFieldCascade = {kind: 'field', cascadeId: 'city', tableName: 'Orders', viewId: 'edit',
  targetField: 'city', valueFormat: 'native', parents: [
    {tableName: 'Orders', viewId: 'edit', field: 'country', parameter: 'countryId'},
    {tableName: 'Orders', viewId: 'edit', field: 'province', parameter: 'provinceId'},
  ], optionsView: {tableName: 'Options', viewId: 'choices'}, valuePolicy: {mode: 'retain'}}
const base = {scenarioId: 'SPACE', tables: {
  Orders: {modelBinding: {modelId: 'P', modelName: 'P'}, views: {default: {}, edit: {}, selected: {autoSelectFirst: false}}},
  Options: {modelBinding: {modelId: 'O', modelName: 'O'}, views: {default: {}, grid: {}, choices: {
    valueField: 'code', labelField: 'title', selectionDelimiter: '|', filterExpression: {logic: 'and', filters: [
      {field: 'parentId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'countryId'}},
      {field: 'provinceId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'provinceId'}},
    ]}}}},
}, viewCascades: [query, field], resourceRelations: [], layout: {tablePositions: {Orders: {x: 1, y: 2}}}}
const initial = JSON.stringify(base, null, 2)

class QueryHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  result: unknown = {primaryKeyField: 'id', allowAdd: false, data: {Items: [], Count: 0}}
  respond?: (config: RequestConfig) => Promise<unknown>
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {data: {Code: 200, Result: this.respond ? await this.respond(config) : this.result}, status: 200, statusText: 'OK', headers: {}}
  }
}

function fixture(text: string | null = initial) {
  let stored = text
  let writes = 0
  let scope = 'SCOPE'
  let gate: Promise<void> | undefined
  let entered: (() => void) | undefined
  let loseResponse = false
  const models: FormalModel[] = ['P', 'O'].map(id => ({id, name: id, metaName: id, sourceName: `${id}Source`,
    sourceId: 'DB', sourceType: 'table', primaryKey: 'id', businessMain: false, raw: {},
    fields: (id === 'P' ? ['id', 'country', 'province', 'city'] : ['id', 'code', 'parentId', 'provinceId', 'title'])
      .map((name, order) => ({id: `${id}-${name}`, modelId: id, name, canonicalName: name,
        type: name.startsWith('province') ? 'number' : 'string', primaryKey: name === 'id',
        description: '', output: true, computed: false, order, orderType: '', raw: {}}))}))
  const openOwner = () => {
    const workspace = new ProjectWorkspace({projectId: 'APP', pageFiles: {readPageFile: async () => ''},
      blueprint: {loadRoot: async () => ({children: []})}, scenarioViews: {
        readScope: () => scope, readText: async () => stored, writeText: async (id, text) => {
          expect(id).toBe('SPACE'); stored = text; writes++
          if (loseResponse) {loseResponse = false; throw new Error('response lost')}
        },
      }})
    const http = new QueryHttp()
    const assembler = new LowcodeDataSpaceAssembler(new DataSpaceRuntimeApi({http,
      readScope: () => ({token: scope, headers: {}})}), http)
    const metadata = DataSet.fromJson({scenarioId: 'META', dataSetName: 'metadata', tables: {}})
    const service = new LowcodeDataSpaceViewDesign({workspace, loadMetadata: withDefinitionResources(async () => metadata),
      assertScope: () => {if (scope !== 'SCOPE') throw new Error('STALE_SCOPE')}, readModel: async input => {
        const model = models.find(item => item.id === input.modelId)
        if (!model) throw new Error('missing model')
        return model
      }, assemble: async ({scenarioId: id, config}) => {
        entered?.(); await gate
        return assembler.assemble({config, space: {dataSpaceId: id, name: id}, models, relations: []})
      }})
    return {workspace, http, service, metadata}
  }
  return {openOwner, get stored() {return stored}, get writes() {return writes},
    changeScope: () => {scope = 'OTHER'}, loseNextResponse: () => {loseResponse = true},
    hold: (value: Promise<void>) => {gate = value; return new Promise<void>(resolve => {entered = resolve})}}
}

describe('cascade definition metadata', () => {
  it('saves an existing cascade from a deferred session without assembling unrelated models', async () => {
    const original = {...base, tables: {...base.tables, Unavailable: {modelBinding: {modelId: 'MISSING', modelName: 'Missing'}, views: {default: {}}}}}
    const storage = fixture(JSON.stringify(original)), owner = storage.openOwner()
    const session = await owner.service.openDesignSession('SPACE', {deferDefinition: true})
    try {
      const view = session.metadataDataSet.getView('DataViewCascadeDefinition')!, row = view.rows.find(item => item['cascadeId'] === 'city')!
      view.updateEditingValue(view.getPkKey(row)!, 'valuePolicy', {mode: 'clear', clearValue: null})
      const result = await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})
      expect(result.success).toBe(true)
      expect(storage.writes).toBe(1)
      expect(owner.http.requests).toEqual([])
      expect(session.definitionStatus).toBe('unloaded')
      expect(JSON.parse(storage.stored!).tables).toEqual(original.tables)
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession('SPACE', {deferDefinition: true})
    try {expect(reopened.metadataDataSet.getView('DataViewCascadeDefinition')!.rows.find(row => row['cascadeId'] === 'city')?.['valuePolicy']).toEqual({mode: 'clear', clearValue: null})}
    finally {reopened.dispose()}
  })
  it.each(['edit', 'delete'] as const)('preserves an unloaded cascade when the loaded subset performs %s', async operation => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!
      const row = view.rows.find(item => item['cascadeId'] === 'city')!
      view.replaceRows([row])
      if (operation === 'edit') view.updateEditingValue(view.getPkKey(row)!, 'valuePolicy', {mode: 'clear', clearValue: null})
      else await view.removeRow(view.getPkKey(row)!)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const definitions = reopened.viewState?.config['viewCascades']
      expect(definitions).toEqual(operation === 'edit' ? [query, {...field, valuePolicy: {mode: 'clear', clearValue: null}}] : [query])
      expect(storage.writes).toBe(1)
    } finally {reopened.dispose()}
  })

  it('edits both definitions, saves and reopens without inventing identities for legacy query entries', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession('SPACE')
    try {
      const table = session.metadataDataSet.getTable('DataViewCascadeDefinition')
      expect(table).toBeDefined()
      expect(table!.modelBinding).toBeUndefined()
      const view = table!.getView('default')!
      expect(view.rows).toHaveLength(2)
      const queryRow = view.rows.find(row => row['parentTable'] === 'Orders')!
      const fieldRow = view.rows.find(row => row['cascadeId'] === 'city')!
      view.updateEditingValue(view.getPkKey(queryRow)!, 'autoLoad', true)
      view.updateEditingValue(view.getPkKey(fieldRow)!, 'valuePolicy', {mode: 'clear', clearValue: null})
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})
      expect(storage.writes).toBe(1)
      expect(owner.http.requests).toEqual([])
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(reopened.definitionDataSet?.viewCascades).toEqual([
        {...query, autoLoad: true}, {...field, valuePolicy: {mode: 'clear', clearValue: null}},
      ])
      expect(JSON.parse(storage.stored!).viewCascades[0]).not.toHaveProperty('kind')
      expect(JSON.parse(storage.stored!).viewCascades[0]).not.toHaveProperty('cascadeId')
      expect(JSON.parse(storage.stored!).layout).toEqual(base.layout)
      expect(storage.stored).not.toMatch(/definitionKey|dataSetId|DataViewCascadeDefinition|"rows"/)
    } finally {reopened.dispose()}
  })

  it('adds and removes definitions while preserving unchanged bytes and avoiding metadata data writes', async () => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})
      expect(storage.stored).toBe(initial)
      expect(storage.writes).toBe(0)
      const view = session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!
      const added = {...query, kind: 'query', cascadeId: 'second', childViewId: 'default'}
      await view.addRow({dataSetId: 'SPACE', ...added})
      expect((await session.metadataDataSet.saveChanges()).success).toBe(true)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})
      expect(JSON.parse(storage.stored!).viewCascades).toEqual([query, field, added])
      for (const row of [...view.rows]) await view.removeRow(view.getPkKey(row)!)
      await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})
    } finally {session.dispose()}
    const reopened = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(reopened.metadataDataSet.getView('DataViewCascadeDefinition', 'default')?.rows).toEqual([])
      expect(reopened.definitionDataSet?.viewCascades ?? []).toEqual([])
    } finally {reopened.dispose()}
  })

  it.each(['native', 'selection-string'] as const)('persists %s definition edits before two-input runtime query, child adjustment and formal submission', async format => {
    const storage = fixture()
    const first = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = first.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!
      const key = view.getPkKey(view.rows.find(row => row['cascadeId'] === 'city')!)!
      view.updateEditingValue(key, 'valueFormat', format)
      view.updateEditingValue(key, 'valuePolicy', {mode: 'retain-valid', clearValue: format === 'native' ? null : ''})
      await first.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})
    } finally {first.dispose()}
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession('SPACE')
    const expectedCity = format === 'native' ? null : '01|0'
    let savedRow: Record<string, unknown> = {id: 'P1', country: 'A', province: 0, city: format === 'native' ? 'OLD' : '01|0|gone'}
    try {
      const dataSet = session.definitionDataSet!
      const target = dataSet.getView('Orders', 'edit')!
      owner.http.result = {primaryKeyField: 'id', allowAdd: false, data: {Items: [{...savedRow,
        lingma_sys_key: 'SIGNED', lingma_sys_params: {r: ['id', 'country', 'province', 'city'], e: ['country', 'city']}}], Count: 1}}
      await target.loadFromServer()
      owner.http.result = {primaryKeyField: 'id', allowAdd: false, data: {Items: [
        {id: 'OPT1', code: '01', title: 'One'}, {id: 'OPT0', code: '0', title: 'Zero'},
      ], Count: 2}}
      target.updateEditingValue('P1', 'country', 'B')
      await vi.waitFor(() => expect(dataSet.getFieldCascadeState({tableName: 'Orders', viewId: 'edit', field: 'city'}).status).toBe('ready'))
      expect(target.getEditingPatch('P1')).toEqual({country: 'B', city: expectedCity})
      expect(owner.http.requests[1]?.data).toMatchObject({Table: [{Name: 'O',
        inputParams: [{Name: 'countryId', Value: 'B'}, {Name: 'provinceId', Value: 0}]}]})
      expect(dataSet.getView('Options', 'choices')?.rows).toEqual([])
      owner.http.respond = async request => {
        expect(request.url).toBe('/api/DataOperation/BatchTableOperateRequestByCRUD')
        const payload = request.data
        if (!Array.isArray(payload) || !isRecord(payload[0]) || !isRecord(payload[0]['CrudModel'])) throw new Error('invalid save')
        expect(payload[0]['TableName']).toBe('P')
        expect(payload[0]['CrudModel']['Changed']).toEqual([{id: 'P1', country: 'B', city: expectedCity, lingma_sys_key: 'SIGNED'}])
        savedRow = {...savedRow, country: 'B', city: expectedCity}
        return {maplistedit: [{PSource: [savedRow]}]}
      }
      await expect(dataSet.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
      expect(storage.stored).not.toMatch(/SIGNED|"rows"|definitionKey/)
    } finally {session.dispose()}
    const fresh = storage.openOwner()
    const reopened = await fresh.service.openDesignSession('SPACE')
    try {
      fresh.http.result = {primaryKeyField: 'id', allowAdd: false, data: {Items: [savedRow], Count: 1}}
      const view = reopened.definitionDataSet!.getView('Orders', 'edit')!
      await view.loadFromServer()
      expect(view.rows[0]?.['city']).toEqual(expectedCity)
      expect(view.getEditingPatch('P1')).toBeUndefined()
    } finally {reopened.dispose()}
  })

  it.each([
    {name: 'dataSetId', value: 'OTHER'}, {name: 'kind', value: 'currentRow'},
    {name: 'parents', value: []}, {name: 'parents', value: [{tableName: 'Orders', viewId: 'edit', field: 'missing', parameter: 'x'}]},
    {name: 'optionsView', value: {tableName: 'Options', viewId: 'missing'}},
    {name: 'targetField', value: 'id'}, {name: 'targetField', value: 'missing'},
    {name: 'rowMode', value: 'current-row'}, {name: 'valuePolicy', value: {mode: 'first'}},
    {name: 'valuePolicy', value: {mode: 'clear', clearValue: Number.NaN}},
  ])('preserves invalid $name edits and the original file', async ({name, value}) => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!
      const key = view.getPkKey(view.rows.find(row => row['cascadeId'] === 'city')!)!
      view.updateEditingValue(key, name, value)
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})).rejects.toThrow()
      expect(view.getEditingRow(key)?.[name]).toEqual(value)
      expect(session.viewState?.text).toBe(initial)
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it.each(['id', 'target', 'cycle'])('rejects duplicate or cyclic %s definitions without removing draft records', async mode => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!
      const added = mode === 'id' ? {...query, cascadeId: 'city', childViewId: 'default'}
        : mode === 'target' ? {...field, cascadeId: 'second-city'}
          : {...field, cascadeId: 'country', targetField: 'country', parents: [{tableName: 'Orders', viewId: 'edit', field: 'city', parameter: 'cityId'}]}
      await view.addRow({dataSetId: 'SPACE', ...added})
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})).rejects.toThrow(/DUPLICATE|CYCLE/)
      expect(view.rows).toHaveLength(3)
      expect(session.viewState?.text).toBe(initial)
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it.each(['view', 'relation'] as const)('saves cascades independently of %s drafts and discards only one category', async other => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!
      const key = view.getPkKey(view.rows.find(row => row['cascadeId'] === 'city')!)!
      view.updateEditingValue(key, 'valuePolicy', {mode: 'clear', clearValue: null})
      await expect(session.refresh()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
      await expect(other === 'view' ? session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]}) : session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
      expect(storage.writes).toBe(0)
      const otherView = session.metadataDataSet.getView(other === 'view' ? 'DataViewDefinition' : 'DataResourceRelationDefinition', 'default')!
      if (other === 'view') otherView.updateEditingValue(otherView.getPkKey(otherView.rows[0]!)!, 'pageSize', 27)
      else await otherView.addRow({dataSetId: 'SPACE', relationId: 'R', parentTable: 'Orders', childTable: 'Options',
        filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}})
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
      expect(otherView.hasEditingChanges() || otherView.dirtyTracking.hasPendingChanges()).toBe(true)
      expect(JSON.parse(storage.stored!)).toMatchObject({tables: base.tables, resourceRelations: []})
      view.updateEditingValue(key, 'valuePolicy', {mode: 'retain-valid', clearValue: null})
      session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!.discardPendingChanges()
      if (other === 'view') session.metadataDataSet.getView('DataViewDefinition', 'default')!.discardPendingChanges()
      else session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.discardPendingChanges()
      await session.refresh()
      expect(view.rows.find(row => row['cascadeId'] === 'city')?.['valuePolicy']).toEqual({mode: 'clear', clearValue: null})
      expect(storage.writes).toBe(1)
    } finally {session.dispose()}
  })

  it.each(['self', 'view', 'relation', 'refresh', 'scope', 'dispose'])('preserves captured saves and rejects invalid lifecycle results for %s', async mode => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    const view = session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!
    const key = view.getPkKey(view.rows.find(row => row['cascadeId'] === 'city')!)!
    if (mode !== 'refresh') view.updateEditingValue(key, 'valuePolicy', {mode: 'clear', clearValue: null})
    let release!: () => void
    const entered = storage.hold(new Promise(resolve => {release = resolve}))
    const pending = mode === 'refresh' ? session.refresh() : session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})
    await entered
    if (mode === 'scope') storage.changeScope()
    else if (mode === 'dispose') session.dispose()
    else if (mode === 'view') {
      const other = session.metadataDataSet.getView('DataViewDefinition', 'default')!
      other.updateEditingValue(other.getPkKey(other.rows[0]!)!, 'pageSize', 42)
    } else if (mode === 'relation') {
      await session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.addRow({dataSetId: 'SPACE'})
    } else view.updateEditingValue(key, 'valuePolicy', {mode: 'retain-valid', clearValue: null})
    release()
    if (mode === 'self' || mode === 'view' || mode === 'relation') {
      await expect(pending).resolves.toMatchObject({success: true})
      expect(JSON.parse(storage.stored!).viewCascades).toEqual([query, {...field, valuePolicy: {mode: 'clear', clearValue: null}}])
      expect(storage.writes).toBe(1)
      if (mode === 'self') expect(view.getEditingRow(key)?.['valuePolicy']).toEqual({mode: 'retain-valid', clearValue: null})
      else {
        const other = session.metadataDataSet.getView(mode === 'view' ? 'DataViewDefinition' : 'DataResourceRelationDefinition', 'default')!
        expect(other.hasEditingChanges() || other.dirtyTracking.hasPendingChanges()).toBe(true)
        expect(JSON.parse(storage.stored!)).toMatchObject({tables: base.tables, resourceRelations: []})
      }
    } else {
      await expect(pending).rejects.toThrow(/STALE|DIRTY|DATA_VIEW_UNSAVED_CHANGES|SCENARIO_DEFINITION_IDENTITY/)
      if (mode === 'refresh') expect(view.getEditingRow(key)?.['valuePolicy']).toEqual({mode: 'retain-valid', clearValue: null})
      expect(storage.stored).toBe(initial)
      expect(storage.writes).toBe(0)
    }
    session.dispose()
  })

  it('repairs invalid runtime references through the metadata table and preserves unknown-save verification', async () => {
    const storage = fixture(JSON.stringify({...base, viewCascades: [{...field, targetField: 'missing'}]}))
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(session.definitionError).not.toBeNull()
      const view = session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!
      view.updateEditingValue(view.getPkKey(view.rows[0]!)!, 'targetField', 'city')
      storage.loseNextResponse()
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})).rejects.toThrow('response lost')
      expect((await session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})).success).toBe(true)
      expect(storage.writes).toBe(1)
      await session.loadDefinition()
      expect(session.definitionError).toBeNull()
      expect(session.definitionDataSet?.viewCascades).toEqual([field])
    } finally {session.dispose()}
  })

  it.each(['view', 'relation'] as const)('keeps new cascade edits while another %s candidate is being validated', async other => {
    const storage = fixture()
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    if (other === 'view') {
      const definitions = session.metadataDataSet.getView('DataViewDefinition', 'default')!
      definitions.updateEditingValue(definitions.getPkKey(definitions.rows[0]!)!, 'pageSize', 42)
    } else {
      await session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')!.addRow({dataSetId: 'SPACE', relationId: 'R', parentTable: 'Orders', childTable: 'Options',
        filterExpression: {field: 'parentId', operator: 'eq', value: {Type: 'GetTableField', Field: 'id'}}})
    }
    let release!: () => void
    const entered = storage.hold(new Promise(resolve => {release = resolve}))
    const pending = other === 'view' ? session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewDefinition', viewId: 'default'}]}) : session.metadataDataSet.saveChanges({views: [{tableName: 'DataResourceRelationDefinition', viewId: 'default'}]})
    await entered
    const view = session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!
    const key = view.getPkKey(view.rows.find(row => row['cascadeId'] === 'city')!)!
    view.updateEditingValue(key, 'valuePolicy', {mode: 'clear', clearValue: null})
    release()
    await expect(pending).resolves.toMatchObject({success: true})
    expect(view.getEditingRow(key)?.['valuePolicy']).toEqual({mode: 'clear', clearValue: null})
    expect(JSON.parse(storage.stored!).viewCascades).toEqual(base.viewCascades)
    expect(storage.writes).toBe(1)
    session.dispose()
  })

  it.each(['denied', 'cancel', 'late'])('respects formal response permissions and pending-option boundaries for %s', async mode => {
    const storage = fixture(JSON.stringify({...base, viewCascades: [query, {...field, valuePolicy: {mode: 'clear', clearValue: null}}]}))
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession('SPACE')
    const pending: Array<(value: unknown) => void> = []
    try {
      const dataSet = session.definitionDataSet!
      const target = dataSet.getView('Orders', 'edit')!
      const address = {tableName: 'Orders', viewId: 'edit', field: 'city'}
      owner.http.result = {primaryKeyField: 'id', allowAdd: false, data: {Items: [{id: 'P1', country: 'A', province: 0, city: 'OLD',
        lingma_sys_key: 'SIGNED', lingma_sys_params: {r: ['id', 'country', 'province', 'city'], e: mode === 'denied' ? ['country'] : ['country', 'city']}}], Count: 1}}
      await target.loadFromServer()
      owner.http.respond = async () => new Promise(resolve => {pending.push(resolve)})
      target.updateEditingValue('P1', 'country', 'B')
      await vi.waitFor(() => expect(pending).toHaveLength(1))
      if (mode === 'cancel') target.discardEditingRows(['P1'])
      else if (mode === 'late') {
        target.updateEditingValue('P1', 'country', 'C')
        await vi.waitFor(() => expect(pending).toHaveLength(2))
        target.updateEditingValue('P1', 'city', 'USER')
      }
      const response = {primaryKeyField: 'id', allowAdd: false, data: {Items: [{id: 'OPT', code: 'NEW', title: 'New'}], Count: 1}}
      pending[0]!(response)
      pending[1]?.(response)
      await new Promise(resolve => setTimeout(resolve, 0))
      if (mode === 'cancel') {
        await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address).status).toBe('idle'))
        expect(target.getEditingPatch('P1')).toBeUndefined()
      } else {
        await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address).status).toBe(mode === 'denied' ? 'error' : 'ready'))
        expect(target.getEditingPatch('P1')).toEqual(mode === 'denied' ? {country: 'B'} : {country: 'C', city: 'USER'})
      }
      expect(target.rows[0]?.['city']).toBe('OLD')
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it('uses selected primary-key arrays from a reopened query definition without parsing the serialized value', async () => {
    const owner = fixture().openOwner()
    const session = await owner.service.openDesignSession('SPACE')
    try {
      const dataSet = session.definitionDataSet!
      const source = dataSet.getView('Orders', 'selected')!
      owner.http.result = {primaryKeyField: 'id', allowAdd: false, data: {Items: [{id: 'A,B', country: 'x'}, {id: '0', country: 'y'}], Count: 2}}
      await source.loadFromServer()
      source.setSelectedRows(source.rows)
      expect(source.value).toBe('A,B,0')
      expect(dataSet.resolveCascadeFilter(query)).toMatchObject({field: 'parentId', operator: 'in', value: ['A,B', '0']})
      owner.http.result = {primaryKeyField: 'id', allowAdd: false, data: {Items: [], Count: 0}}
      await dataSet.getView('Options', 'grid')!.refresh()
      expect(owner.http.requests[1]?.data).toMatchObject({Table: [{Name: 'O', Filter: {ValueFun: {Value: ['A,B', '0']}}}]})
      source.clearSelectedRows()
      expect(dataSet.resolveCascadeFilter(query)).toMatchObject({field: 'parentId', operator: 'in', value: []})
    } finally {session.dispose()}
  })

  it('keeps external file changes and stale local cascade edits separate', async () => {
    const storage = fixture()
    const owner = storage.openOwner()
    const session = await owner.service.openDesignSession('SPACE')
    try {
      const view = session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!
      const key = view.getPkKey(view.rows.find(row => row['cascadeId'] === 'city')!)!
      view.updateEditingValue(key, 'valuePolicy', {mode: 'clear', clearValue: null})
      owner.workspace.getScenarioViews('SPACE')!.setText(JSON.stringify({...base, viewCascades: [query]}))
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})).rejects.toThrow('SCENARIO_DEFINITION_FILE_STATE')
      expect(view.getEditingRow(key)?.['valuePolicy']).toEqual({mode: 'clear', clearValue: null})
      session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')!.discardPendingChanges()
      await session.refresh()
      expect(view.rows).toHaveLength(1)
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
  })

  it('keeps missing files explicit and releases metadata on model-name conflicts', async () => {
    const storage = fixture(null)
    const session = await storage.openOwner().service.openDesignSession('SPACE')
    try {
      expect(session.metadataDataSet.getView('DataViewCascadeDefinition', 'default')?.rows).toEqual([])
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'DataViewCascadeDefinition', viewId: 'default'}]})).resolves.toMatchObject({success: true})
      expect(storage.stored).toBeNull()
      expect(storage.writes).toBe(0)
    } finally {session.dispose()}
    const owner = fixture().openOwner()
    owner.metadata.addTable('DataViewCascadeDefinition', [{name: 'id', type: 'string'}])
    await expect(owner.service.openDesignSession('SPACE')).rejects.toThrow('already exists')
    expect(owner.metadata.destroyed).toBe(true)
  })
})
