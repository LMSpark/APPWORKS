import {afterEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {DataSet, DataViewFilter, RequestState, extractColumnRules} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace, ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewDesign} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'
import {LowcodeDataSpaceViewMetadata} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-metadata'

import {withDefinitionResources} from '../view-design/definition-resource.fixture'

type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
type FormalRelations = Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>

function model(id: string, sourceName: string, fields: readonly string[], numericFields: readonly string[] = []): FormalModel {
  return {id, name: id, metaName: id, sourceName, sourceId: 'DB', sourceType: 'table',
    primaryKey: 'id', businessMain: false, raw: {}, fields: fields.map((name, order) => ({
      id: `${id}-${name}`, modelId: id, name, canonicalName: name,
      type: numericFields.includes(name) ? 'number' : 'string',
      primaryKey: name === 'id', description: '', output: true, computed: false,
      order, orderType: '', raw: {},
    }))}
}

const relationFilter = DataViewFilter.condition({field: 'ChildSource.parentId', operator: 'eq',
  value: {Type: 'GetTableField', Field: 'ParentSource.id'}})
const relations: FormalRelations = [{sourceRelationId: 'REL', dataSpaceId: 'SPACE',
  parentModelId: 'ParentModel', childModelId: 'ChildModel',
  parentResourceName: 'ParentSource', childResourceName: 'ChildSource',
  filterExpression: relationFilter, dependencyType: 'currentRow', cascadeDelete: false}]
const cascade = {cascadeId: 'EXPLICIT', parentTable: 'Parents', parentViewId: 'shared',
  childTable: 'Children', childViewId: 'shared', filterBindings: [{sourceField: 'id', targetField: 'parentId'}],
  autoLoad: false}
const initial = JSON.stringify({scenarioId: 'SPACE', tables: {
  Parents: {modelBinding: {modelId: 'ParentModel', modelName: 'ParentModel'},
    views: {default: {}, shared: {}, detail: {}}},
  Children: {modelBinding: {modelId: 'ChildModel', modelName: 'ChildModel'},
    views: {default: {}, shared: {}, detail: {}}},
}, viewCascades: [cascade]})

class QueryHttp extends HttpClientBase {
  readonly requests: RequestConfig[] = []
  respond?: (config: RequestConfig) => Promise<unknown>
  result: unknown = {primaryKeyField: 'id', allowAdd: false, data: {Items: [], Count: 0}}
  saveResult: unknown = {maplistedit: [{ParentSource: [{id: 'P1', title: 'Changed', price: 3, qty: 4}]}]}
  protected override async executeRequest(config: RequestConfig): Promise<HttpResponse<unknown>> {
    this.requests.push(config)
    return {data: {Code: 200, Result: this.respond ? await this.respond(config)
      : config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD' ? this.saveResult : this.result},
    status: 200, statusText: 'OK', headers: {}}
  }
}

const sessions: Awaited<ReturnType<LowcodeDataSpaceViewDesign['openDesignSession']>>[] = []
afterEach(() => {for (const session of sessions.splice(0)) session.dispose()})

function editView(dataSet: DataSet, tableName: string, viewId: string, changes: Record<string, unknown>) {
  const view = dataSet.getView('DataViewDefinition')!
  const row = view.rows.find(item => item['tableName'] === tableName && item['viewId'] === viewId)!
  for (const [field, value] of Object.entries(changes)) view.updateEditingValue(view.getPkKey(row)!, field, value)
}
function editColumns(dataSet: DataSet, tableName: string, columns: readonly Record<string, unknown>[]) {
  const view = dataSet.getView('DataTableBindingDefinition')!
  const row = view.rows.find(item => item['tableName'] === tableName)!
  const key = view.getPkKey(row)!
  const configuration = view.getEditingRow(key)?.['configuration']
  if (!isRecord(configuration)) throw new Error('missing native table definition')
  view.updateEditingValue(key, 'configuration', {...configuration, columns})
}

function fixture(text: string | null = initial) {
  const stored = new Map<string, string>()
  if (text !== null) stored.set('SPACE', text)
  let models = [model('ParentModel', 'ParentSource', ['id', 'title']),
    model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])]
  let formalSpaceName = '正式空间名称'
  const openOwner = () => {
    const workspace = new ProjectWorkspace({projectId: 'APP',
      pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}},
      blueprint: {},
      scenarioViews: {readScope: () => 'SCOPE',
        readText: async scenarioId => stored.get(scenarioId) ?? null,
        writeText: async (scenarioId, content) => {stored.set(scenarioId, content)}},
    })
    const http = new QueryHttp()
    const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    const assembler = new LowcodeDataSpaceAssembler(runtime, http)
    const assemble = async ({scenarioId, config}: {scenarioId: string; config: ScenarioViewConfig}) => {
      if (config.scenarioId !== scenarioId) throw new Error('scenario identity mismatch')
      return assembler.assemble({config, space: {dataSpaceId: scenarioId, name: formalSpaceName}, models, relations})
    }
    const service = new LowcodeDataSpaceViewDesign({workspace, assemble, assertScope: () => undefined,
      loadMetadata: withDefinitionResources(async () => DataSet.fromJson({scenarioId: 'META', dataSetName: 'META', tables: {}})),
      readModel: async input => {
        const found = models.find(candidate => candidate.id === input.modelId)
        if (!found) throw new Error('formal model missing')
        return found
      }})
    const open = async () => {
      const session = await service.openDesignSession('SPACE', {deferDefinition: true})
      sessions.push(session)
      return session
    }
    return {workspace, service, open, assemble, assembler, http}
  }
  return {stored, openOwner, setModels: (next: FormalModel[]) => {models = next},
    setSpaceName: (name: string) => {formalSpaceName = name}}
}

const projection = {fieldId: 'ParentModel-title', source: 'resource' as const,
  resourceFieldId: 'ParentModel-title', resourceField: 'title', viewField: 'title', type: 'string',
  label: 'Title', output: true, sortOrder: 0, sortDirection: null, group: 0,
  distinct: false, primaryKey: false, value: '', valueFunction: '', expression: ''}

describe('scenario view persistence and formal model assembly', () => {
  it.each(['parent-first', 'child-first'])('reopens named autoLoad views and queries their dependencies with %s table order', async order => {
    const seed = JSON.parse(initial)
    if (order === 'child-first') seed.tables = {Children: seed.tables.Children, Parents: seed.tables.Parents}
    const storage = fixture(JSON.stringify(seed))
    const first = storage.openOwner()
    const opened = await first.open()
    const parents = {modelBinding: {modelId: 'ParentModel', modelName: 'ParentModel'}, views: {
      default: {autoLoad: false}, shared: {autoLoad: true, queryContext: {purpose: 'parent'}},
      detail: {autoLoad: true, queryContext: {purpose: 'independent'}},
    }}
    const children = {modelBinding: {modelId: 'ChildModel', modelName: 'ChildModel'}, views: {
      default: {autoLoad: false}, shared: {autoLoad: true}, detail: {autoLoad: false},
    }}
    for (const [tableName, table] of Object.entries({Parents: parents, Children: children})) {
      for (const [viewId, configuration] of Object.entries(table.views)) editView(opened.metadataDataSet, tableName, viewId, configuration)
    }
    const cascades = opened.metadataDataSet.getView('DataViewCascadeDefinition')!
    cascades.updateEditingValue(cascades.getPkKey(cascades.rows[0]!)!, 'autoLoad', true)
    await opened.metadataDataSet.saveChanges()
    const saved = opened.viewState!
    const reopened = storage.openOwner()
    const read = await reopened.open()
    const {dataSet} = await reopened.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', read.viewState!.text)})
    const parent = dataSet.getView('Parents', 'shared')!
    const child = dataSet.getView('Children', 'shared')!
    const independent = dataSet.getView('Parents', 'detail')!
    const queries: Record<string, unknown>[] = []
    let finishParent: (() => void) | undefined
    const parentGate = new Promise<void>(resolve => { finishParent = resolve })
    reopened.http.respond = async request => {
      if (request.url !== '/api/DataOperation/GetData' || !isRecord(request.data)
        || !Array.isArray(request.data['Table']) || !isRecord(request.data['Table'][0])) {
        throw new Error('unexpected query request')
      }
      const query = request.data['Table'][0]
      queries.push(query)
      let rows: Record<string, unknown>[]
      if (query['Name'] === 'ParentModel') {
        const independentQuery = Array.isArray(query['inputParams']) && query['inputParams']
          .some(input => isRecord(input) && input['Name'] === 'purpose' && input['Value'] === 'independent')
        if (independentQuery) rows = [{id: 'INDEPENDENT', title: 'Separate result'}]
        else {
          await parentGate
          rows = [{id: 'P1', title: 'First'}, {id: 'P2', title: 'Second'}]
        }
      } else {
        if (query['Name'] !== 'ChildModel' || !isRecord(query['Filter'])
          || !isRecord(query['Filter']['ValueFun'])) throw new Error('missing child dependency filter')
        const parentId = query['Filter']['ValueFun']['Value']
        rows = [{id: `C-${String(parentId)}`, parentId, title: 'Child'}]
      }
      return {primaryKeyField: 'id', allowAdd: false, data: {Items: rows, Count: rows.length}}
    }
    try {
      dataSet.triggerAutoLoad()
      dataSet.triggerAutoLoad()
      await vi.waitFor(() => expect(independent.requestState).toBe(RequestState.Loaded))
      expect(parent.requestState).toBe(RequestState.Loading)
      expect(child.requestState).toBe(RequestState.Preparing)
      expect(queries).toHaveLength(2)
      expect(queries.every(query => query['Name'] === 'ParentModel')).toBe(true)
      finishParent?.()
      await vi.waitFor(() => expect(child.requestState).toBe(RequestState.Loaded))
      expect(queries).toHaveLength(3)
      expect(queries[2]).toMatchObject({Name: 'ChildModel', Filter: {ValueFun: {Type: 'GetConstValue', Value: 'P1'}}})
      expect(child.rows).toMatchObject([{id: 'C-P1', parentId: 'P1'}])
      expect(parent.rows).toMatchObject([{id: 'P1'}, {id: 'P2'}])
      expect(independent.rows).toMatchObject([{id: 'INDEPENDENT'}])
      expect(dataSet.getView('Parents', 'default')?.requestState).toBe(RequestState.Idle)
      expect(dataSet.getView('Children', 'default')?.requestState).toBe(RequestState.Idle)
      expect(dataSet.getView('Children', 'detail')?.requestState).toBe(RequestState.Idle)
      dataSet.triggerAutoLoad()
      await Promise.resolve()
      expect(queries).toHaveLength(3)

      parent.setCurrentRow(parent.rows[1] ?? null)
      await vi.waitFor(() => expect(child.rows).toMatchObject([{id: 'C-P2', parentId: 'P2'}]))
      expect(queries).toHaveLength(4)
      expect(queries[3]).toMatchObject({Name: 'ChildModel', Filter: {ValueFun: {Type: 'GetConstValue', Value: 'P2'}}})
      expect(independent.rows).toMatchObject([{id: 'INDEPENDENT'}])
      expect(read.viewState!.text).toBe(saved.text)
      expect(read.viewState!.dirty).toBe(false)
      expect(storage.stored.get('SPACE')).toBe(saved.text)
    } finally {
      finishParent?.()
      dataSet.destroy()
    }
  })

  it.each(['failure', 'destruction'])('keeps named child queries gated after parent %s', async outcome => {
    const storage = fixture()
    const first = storage.openOwner()
    const opened = await first.open()
    editView(opened.metadataDataSet, 'Parents', 'shared', {autoLoad: true})
    editView(opened.metadataDataSet, 'Children', 'shared', {autoLoad: true})
    await opened.metadataDataSet.saveChanges()
    const saved = opened.viewState!
    const reopened = storage.openOwner()
    const read = await reopened.open()
    const {dataSet} = await reopened.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', read.viewState!.text)})
    const parent = dataSet.getView('Parents', 'shared')!
    const child = dataSet.getView('Children', 'shared')!
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => { release = resolve })
    let fail = outcome === 'failure'
    reopened.http.respond = async request => {
      await gate
      if (fail) throw new Error('parent offline')
      if (!isRecord(request.data) || !Array.isArray(request.data['Table'])
        || !isRecord(request.data['Table'][0])) throw new Error('missing query model')
      const rows = request.data['Table'][0]['Name'] === 'ParentModel'
        ? [{id: 'P1', title: 'Parent'}] : [{id: 'C1', parentId: 'P1', title: 'Child'}]
      return {primaryKeyField: 'id', allowAdd: false, data: {Items: rows, Count: 1}}
    }
    try {
      dataSet.triggerAutoLoad()
      await vi.waitFor(() => expect(reopened.http.requests).toHaveLength(1))
      expect(child.requestState).toBe(RequestState.Preparing)
      const waiting = child.requestData()
      if (outcome === 'destruction') dataSet.destroy()
      release?.()
      await waiting
      expect(child.rows).toEqual([])
      expect(reopened.http.requests).toHaveLength(1)
      if (outcome === 'failure') {
        expect(parent.requestState).toBe(RequestState.Failed)
        expect(parent.loadingError?.message).toContain('parent offline')
        expect(child.requestState).toBe(RequestState.Failed)
        dataSet.triggerAutoLoad()
        await Promise.resolve()
        expect(reopened.http.requests).toHaveLength(1)
        fail = false
        await parent.refresh()
        await child.refresh()
        expect(child.rows).toMatchObject([{id: 'C1', parentId: 'P1'}])
        expect(reopened.http.requests).toHaveLength(3)
      } else {
        expect(parent.destroyed).toBe(true)
        expect(child.destroyed).toBe(true)
        expect(parent.rows).toEqual([])
        expect(child.requestState).toBe(RequestState.Idle)
      }
      expect(storage.stored.get('SPACE')).toBe(saved.text)
    } finally {
      release?.()
      dataSet.destroy()
    }
  })

  it.each(['native', 'selection-string'] as const)('saves a %s field cascade and preserves the child format through submission and fresh reads', async format => {
    const storage = fixture()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'country', 'province', 'city'], ['province']),
      model('ChildModel', 'ChildSource', ['id', 'code', 'parentId', 'provinceId', 'title'], ['provinceId'])])
    const first = storage.openOwner()
    const opened = await first.open()
    editView(opened.metadataDataSet, 'Children', 'detail', {
      valueField: format === 'native' ? 'id' : 'code', labelField: 'title', selectionDelimiter: '|', filterExpression: {logic: 'and', filters: [
      {field: 'parentId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'countryId'}},
      {field: 'provinceId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'provinceId'}},
    ]}})
    const field = {kind: 'field' as const, cascadeId: 'city-by-region', tableName: 'Parents', viewId: 'shared',
      valueFormat: format, targetField: 'city',
      parents: [{tableName: 'Parents', viewId: 'shared', field: 'country', parameter: 'countryId'}, {tableName: 'Parents', viewId: 'shared', field: 'province', parameter: 'provinceId'}],
      optionsView: {tableName: 'Children', viewId: 'detail'},
      valuePolicy: {mode: 'retain-valid' as const, clearValue: format === 'native' ? null : ''}}
    const definitions = opened.metadataDataSet.getView('DataViewCascadeDefinition')!
    await definitions.addRow({dataSetId: 'SPACE', ...field, valuePolicy: {mode: 'retain'}})
    const added = definitions.rows.find(row => row['cascadeId'] === field.cascadeId)!
    definitions.updateEditingValue(definitions.getPkKey(added)!, 'valuePolicy', field.valuePolicy)
    await opened.metadataDataSet.saveChanges()
    const saved = opened.viewState!
    expect(saved.dirty).toBe(false)
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    expect(saved.text).toContain('"kind":"field"')
    expect(saved.text).not.toMatch(/"rows"|"lingma_sys_"|"options":/)

    const reopened = storage.openOwner()
    const read = await reopened.open()
    const assembly = await reopened.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', read.viewState!.text)})
    const dataSet = assembly.dataSet
    expect(dataSet.viewCascades).toMatchObject([cascade, field])
    expect(dataSet.resourceRelations).toMatchObject([{sourceRelationId: 'REL'}])
    expect(dataSet.getView('Parents', 'shared')).not.toBe(dataSet.getView('Children', 'detail'))
    const target = dataSet.getView('Parents', 'shared')!
    const options = dataSet.getView('Children', 'detail')!
    reopened.http.result = {primaryKeyField: 'id', allowAdd: false,
      data: {Items: [{id: 'P1', title: 'Parent', country: 'A', province: 0, city: format === 'native' ? 'OLD' : '01|0|gone',
        lingma_sys_key: 'SIGNED', lingma_sys_params: {r: ['id', 'title', 'country', 'province', 'city'],
          e: ['country', 'city']}}], Count: 1}}
    await target.loadFromServer()
    reopened.http.result = {primaryKeyField: 'id', allowAdd: false,
      data: {Items: [{id: 'NEW', code: '01', parentId: 'B', provinceId: 0, title: 'New City',
        lingma_sys_key: 'OPTION', lingma_sys_params: {r: ['id', 'code', 'title']}},
      {id: 'ZERO', code: '0', parentId: 'B', provinceId: 0, title: 'Zero',
        lingma_sys_key: 'OPTION-ZERO', lingma_sys_params: {r: ['id', 'code', 'title']}}], Count: 2}}
    target.updateEditingValue('P1', 'country', 'B')
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState({tableName: 'Parents', viewId: 'shared',
      field: 'city'})).toMatchObject({status: 'ready', valueStatus: format === 'native' ? 'empty' : 'valid'}))
    const expectedCity = format === 'native' ? null : '01|0'
    expect(target.getEditingPatch('P1')).toEqual({country: 'B', city: expectedCity})
    expect(target.rows[0]?.['city']).toBe(format === 'native' ? 'OLD' : '01|0|gone')
    expect(options.rows).toEqual([])
    const optionRequest = reopened.http.requests.filter(request => request.url === '/api/DataOperation/GetData')[1]
    expect(optionRequest?.data).toMatchObject({Table: [{Name: 'ChildModel',
      inputParams: [{Name: 'countryId', Value: 'B'}, {Name: 'provinceId', Value: 0}]}]})
    expect(JSON.stringify(optionRequest?.data)).not.toContain('city-by-region')
    let savedRow: Record<string, unknown> = {id: 'P1', title: 'Parent', country: 'A', province: 0,
      city: format === 'native' ? 'OLD' : '01|0|gone'}
    reopened.http.respond = async request => {
      if (request.url !== '/api/DataOperation/BatchTableOperateRequestByCRUD') throw new Error('unexpected persistence request')
      const payload = request.data
      if (!Array.isArray(payload) || payload.length !== 1 || !isRecord(payload[0])
        || payload[0]['TableName'] !== 'ParentModel' || !isRecord(payload[0]['CrudModel'])) throw new Error('invalid save target')
      const changes = payload[0]['CrudModel']['Changed']
      if (!Array.isArray(changes) || changes.length !== 1 || !isRecord(changes[0])) throw new Error('missing update')
      expect(changes[0]).toEqual({id: 'P1', country: 'B', city: expectedCity, lingma_sys_key: 'SIGNED'})
      const {lingma_sys_key: _signature, ...changedFields} = changes[0]
      savedRow = {...savedRow, ...changedFields}
      return {maplistedit: [{ParentSource: [savedRow]}]}
    }
    await expect(dataSet.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
    const saveRequest = reopened.http.requests.find(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    expect(saveRequest).toBeDefined()
    expect(JSON.stringify(saveRequest?.data)).toContain(`"city":${JSON.stringify(expectedCity)}`)
    expect(target.getEditingPatch('P1')).toBeUndefined()
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    dataSet.destroy()

    const fresh = storage.openOwner()
    const freshFile = await fresh.open()
    const freshAssembly = await fresh.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', freshFile.viewState!.text)})
    try {
      fresh.http.result = {primaryKeyField: 'id', allowAdd: false, data: {Items: [{...savedRow,
        lingma_sys_key: 'READBACK', lingma_sys_params: {r: ['id', 'title', 'country', 'province', 'city'], e: ['country', 'city']}}], Count: 1}}
      const freshTarget = freshAssembly.dataSet.getView('Parents', 'shared')!
      await freshTarget.loadFromServer()
      expect(freshTarget.rows[0]?.['city']).toBe(expectedCity)
      expect(freshTarget.getEditingPatch('P1')).toBeUndefined()
      expect(freshAssembly.dataSet.viewCascades).toMatchObject([cascade, field])
      const definitions = freshFile.metadataDataSet.getView('DataViewCascadeDefinition')!
      const row = definitions.rows.find(item => item['cascadeId'] === field.cascadeId)!
      await definitions.removeRow(definitions.getPkKey(row)!)
      await freshFile.metadataDataSet.saveChanges()
      const finalOwner = storage.openOwner()
      const finalFile = await finalOwner.open()
      const finalAssembly = await finalOwner.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', finalFile.viewState!.text)})
      try {
        expect(finalAssembly.dataSet.viewCascades).toMatchObject([cascade])
        expect(finalAssembly.dataSet.resourceRelations).toMatchObject([{sourceRelationId: 'REL'}])
        expect(finalAssembly.dataSet.getView('Children', 'detail'))
          .toMatchObject({valueField: format === 'native' ? 'id' : 'code', selectionDelimiter: '|'})
      } finally { finalAssembly.dataSet.destroy() }
    } finally { freshAssembly.dataSet.destroy() }
  })

  it('preserves native DataSet settings while saving definitions and reopens independent runtime instances', async () => {
    // Root metadata has no editable definition resource yet; it is persisted input, preserved by granular saves.
    const storage = fixture(JSON.stringify({...JSON.parse(initial), schemaVersion: 3, version: 0,
      layout: {tablePositions: {Parents: {x: -2.5, y: 0}, Children: {x: 1, y: 3}}}, saveChanges: {mode: 'perView'}}))
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'price', 'qty'], ['price', 'qty']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const first = storage.openOwner()
    const opened = await first.open()
    editColumns(opened.metadataDataSet, 'Parents', [{name: 'total', type: 'number', computeExpression: 'price * qty'}])
    editView(opened.metadataDataSet, 'Parents', 'shared', {pageSize: 13, commitMode: 'staged'})
    await opened.metadataDataSet.saveChanges()
    const saved = opened.viewState!
    expect(saved.config).toMatchObject({schemaVersion: 3, version: 0,
      layout: {tablePositions: {Parents: {x: -2.5, y: 0}}}, saveChanges: {mode: 'perView'}})
    expect(saved.dirty).toBe(false)
    expect(saved.revision).toBeGreaterThan(0)
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    expect(saved.text).not.toContain('正式空间名称')

    const reopened = storage.openOwner()
    const read = await reopened.open()
    const firstAssembly = await reopened.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', read.viewState!.text)})
    expect(firstAssembly.dataSet.dataSetName).toBe('正式空间名称')
    expect(firstAssembly.dataSet.getTable('Parents')).toMatchObject({resourceType: 'database-table', resourceId: 'ParentSource'})
    storage.setSpaceName('正式空间新名称')
    storage.setModels([model('ParentModel', 'ParentSourceNext', ['id', 'title', 'price', 'qty'], ['price', 'qty']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const secondAssembly = await reopened.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', read.viewState!.text)})
    expect(secondAssembly.dataSet.dataSetName).toBe('正式空间新名称')
    expect(secondAssembly.dataSet.getTable('Parents')?.resourceId).toBe('ParentSourceNext')
    expect(read.viewState!.text).toBe(saved.text)
    expect(saved.text).not.toContain('ParentSourceNext')
    const dataSet = firstAssembly.dataSet
    expect(dataSet.toJson()).toMatchObject({schemaVersion: 3, version: 0,
      layout: {tablePositions: {Parents: {x: -2.5, y: 0}}}, saveChanges: {mode: 'perView'}})
    expect(dataSet.version).toBe(0)
    expect(secondAssembly.dataSet.layout).toEqual(dataSet.layout)
    dataSet.layout!.tablePositions!['Parents']!.x = 99
    expect(secondAssembly.dataSet.layout?.tablePositions?.['Parents']?.x).toBe(-2.5)
    expect(new ScenarioViewConfig('SPACE', read.viewState!.text).toJSON()).toMatchObject({layout: {tablePositions: {Parents: {x: -2.5, y: 0}}}})

    const view = dataSet.getView('Parents', 'shared')!
    reopened.http.result = {primaryKeyField: 'id', allowAdd: false,
      data: {Items: [{id: 'P1', title: 'Before', price: 3, qty: 4,
        lingma_sys_key: 'SIGNED', lingma_sys_params: {r: ['id', 'title', 'price', 'qty'], e: ['title']}}], Count: 1}}
    await view.loadFromServer()
    const query = reopened.http.requests.find(request => request.url === '/api/DataOperation/GetData')
    expect(query?.data).toMatchObject({Table: [{Name: 'ParentModel'}]})
    expect(JSON.stringify(query?.data)).not.toContain('ParentSource')
    expect(view.rows[0]?.['total']).toBe(12)
    expect(JSON.stringify(dataSet.toJson())).not.toContain('Before')
    expect(await view.editRowById('P1', {title: 'Changed'})).toBe(true)
    await expect(dataSet.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
    const save = reopened.http.requests.find(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    expect(save).toBeDefined()
    expect(JSON.stringify(save?.data)).not.toContain('total')
    Reflect.deleteProperty(dataSet.saveChangesConfig!, 'mode')
    expect(secondAssembly.dataSet.saveChangesConfig).toEqual({mode: 'perView'})
    expect(new ScenarioViewConfig('SPACE', read.viewState!.text).toJSON()).toMatchObject({saveChanges: {mode: 'perView'}})
    firstAssembly.dataSet.destroy()
    secondAssembly.dataSet.destroy()

    await read.metadataDataSet.saveChanges()
    expect(read.viewState!.config).toMatchObject({schemaVersion: 3, version: 0, saveChanges: {mode: 'perView'}})
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    // An independently persisted configuration without root overrides uses native defaults.
    const last = fixture().openOwner()
    const lastFile = await last.open()
    const lastAssembly = await last.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', lastFile.viewState!.text)})
    expect(lastAssembly.dataSet.toJson()).toMatchObject({schemaVersion: 2})
    expect(lastAssembly.dataSet.version).toBeUndefined()
    expect(lastAssembly.dataSet.layout).toBeUndefined()
    expect(lastAssembly.dataSet.saveChangesConfig).toBeUndefined()
    lastAssembly.dataSet.destroy()
  })
  it('saves local computed definitions through DataSet and reopens formal query and save', async () => {
    const storage = fixture()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'price', 'qty'], ['price', 'qty']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const first = storage.openOwner()
    const opened = await first.open()
    editColumns(opened.metadataDataSet, 'Parents', [{name: 'total', type: 'number', label: 'Total',
      computeExpression: 'price * qty', min: 0}])
    editColumns(opened.metadataDataSet, 'Children', [{name: 'total', type: 'string', computeExpression: 'title + "!"'}])
    await opened.metadataDataSet.saveChanges()
    expect(storage.stored.get('SPACE')).toContain('"computeExpression":"price * qty"')
    const second = storage.openOwner()
    const read = await second.open()
    const assembled = await second.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', read.viewState!.text)})
    const view = assembled.dataSet.getView('Parents', 'shared')!
    expect(view.columns.find(column => column.name === 'total')).toMatchObject({
      type: 'number', label: 'Total', computeExpression: 'price * qty', min: 0})
    expect(assembled.dataSet.getTable('Children')?.columns.find(column => column.name === 'total'))
      .toMatchObject({type: 'string', computeExpression: 'title + "!"'})
    second.http.result = {primaryKeyField: 'id', allowAdd: false,
      data: {Items: [{id: 'P1', title: 'Before', price: 3, qty: 4,
        lingma_sys_key: 'SIGNED', lingma_sys_params: {r: ['id', 'title', 'price', 'qty'], e: ['title']}}], Count: 1}}
    await view.loadFromServer()
    expect(view.rows[0]?.['total']).toBe(12)
    expect(view.fieldAccess(view.rows[0] ?? null, 'total').write).toBe('denied')
    const query = second.http.requests.find(request => request.url === '/api/DataOperation/GetData')
    expect(JSON.stringify(query?.data)).not.toContain('total')
    view.commitMode = 'staged'
    expect(await view.editRowById('P1', {title: 'Changed'})).toBe(true)
    await view.saveChanges()
    const save = second.http.requests.find(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    expect(save).toBeDefined()
    expect(JSON.stringify(save?.data)).not.toContain('total')
    assembled.dataSet.destroy()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'price', 'qty', 'total'],
      ['price', 'qty', 'total']), model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const conflict = storage.openOwner()
    const conflictFile = await conflict.open()
    await expect(conflict.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', conflictFile.viewState!.text)})).rejects.toThrow('本地计算列与正式字段重名')
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'price', 'qty'], ['price', 'qty']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    editColumns(read.metadataDataSet, 'Parents', [])
    await read.metadataDataSet.saveChanges()
    const last = storage.openOwner()
    const lastFile = await last.open()
    const lastAssembly = await last.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', lastFile.viewState!.text)})
    expect(lastAssembly.dataSet.getTable('Parents')?.columns.map(column => column.name)).not.toContain('total')
    lastAssembly.dataSet.destroy()
  })
  it('rejects a structural impostor before it can serialize away undefined validation values', () => {
    const owner = fixture().openOwner()
    let serialized = false
    const fake = {scenarioId: 'SPACE', toJSON: () => {
      serialized = true
      return {scenarioId: 'SPACE', tables: {Parents: {columns: [{name: 'title', required: undefined}]}}}
    }}
    expect(() => Reflect.apply(owner.assembler.assemble, owner.assembler,
      [{config: fake, models: [], relations: []}])).toThrow('SCENARIO_VIEW_CONFIG_INSTANCE')
    expect(serialized).toBe(false)
  })
  it('restores native validation rules from the file with formal column identity intact', async () => {
    const storage = fixture()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'amount'], ['amount']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const first = storage.openOwner()
    const opened = await first.open()
    const parentRules = [{name: 'title', required: true, minLength: 2,
      maxLength: 6, pattern: '^A', patternMessage: 'must start A'}, {name: 'amount', min: 0, max: 10}]
    editColumns(opened.metadataDataSet, 'Parents', parentRules)
    editColumns(opened.metadataDataSet, 'Children', [{name: 'title', required: false, minLength: 0}])
    await opened.metadataDataSet.saveChanges()
    const saved = opened.viewState!
    expect(saved.dirty).toBe(false)
    expect(saved.text).not.toMatch(/"type"|"label"|"isPrimaryKey"|"rows"|"token"/)
    const reopened = storage.openOwner()
    const read = await reopened.open()
    const assembled = await reopened.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', read.viewState!.text)})
    const dataSet = assembled.dataSet
    const parent = dataSet.getTable('Parents')!.columns.find(column => column.name === 'title')!
    const child = dataSet.getTable('Children')!.columns.find(column => column.name === 'title')!
    const amount = dataSet.getTable('Parents')!.columns.find(column => column.name === 'amount')!
    expect(parent).toMatchObject({name: 'title', type: 'string', label: 'title', isPrimaryKey: false,
      required: true, minLength: 2, maxLength: 6, pattern: '^A'})
    expect(child.required).toBe(false)
    expect(child.maxLength).toBeUndefined()
    expect(amount).toMatchObject({name: 'amount', type: 'number', min: 0, max: 10})
    expect(extractColumnRules(parent).map(rule => rule.type)).toEqual(['required', 'minLength', 'maxLength', 'pattern'])
    expect(extractColumnRules(amount).map(rule => rule.type)).toEqual(['min', 'max'])
    expect(dataSet.getView('Parents', 'default')?.validator?.validate({title: 'B'}).errors.map(error => error.code))
      .toEqual(['MIN_LENGTH', 'PATTERN'])
    expect(dataSet.getView('Children', 'default')?.validator?.validate({title: 'B'}).valid).toBe(true)
    const validator = dataSet.getView('Parents', 'default')?.validator
    expect(validator?.validate({title: 'Alex', amount: -1}).errors.map(error => error.code)).toContain('MIN_VALUE')
    expect(validator?.validate({title: 'Alex', amount: 11}).errors.map(error => error.code)).toContain('MAX_VALUE')
    expect(validator?.validate({title: 'Alex', amount: 0}).valid).toBe(true)
    expect(validator?.validate({title: 'Alex', amount: 5}).valid).toBe(true)
    dataSet.destroy()
    editColumns(read.metadataDataSet, 'Parents', [])
    await read.metadataDataSet.saveChanges()
    const cleared = read.viewState!
    const clearOwner = storage.openOwner()
    const clearRead = await clearOwner.open()
    const clearAssembly = await clearOwner.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', clearRead.viewState!.text)})
    expect(extractColumnRules(clearAssembly.dataSet.getTable('Parents')!.columns.find(column => column.name === 'title')!))
      .toEqual([])
    clearAssembly.dataSet.destroy()
    expect(cleared.text).not.toContain('"required":true')
    editColumns(read.metadataDataSet, 'Parents', parentRules)
    await read.metadataDataSet.saveChanges()
    storage.setModels([model('ParentModel', 'ParentSource', ['id']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const changed = storage.openOwner()
    const stale = await changed.open()
    await expect(changed.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', stale.viewState!.text)})).rejects.toThrow('未解析到唯一正式输出字段')
    expect(storage.stored.get('SPACE')).toBe(saved.text)
  })
  it('validates persisted column rules before formal DataSet save and accepts the corrected receipt', async () => {
    const storage = fixture()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'amount'], ['amount']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const first = storage.openOwner()
    const opened = await first.open()
    editColumns(opened.metadataDataSet, 'Parents', [{name: 'title', required: true, minLength: 2, maxLength: 6,
      pattern: '^A', patternMessage: 'must start A'}, {name: 'amount', min: 0, max: 10}])
    await opened.metadataDataSet.saveChanges()
    const saved = opened.viewState!
    const reopened = storage.openOwner()
    const read = await reopened.open()
    const assembly = await reopened.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', read.viewState!.text)})
    const dataSet = assembly.dataSet
    const view = dataSet.getView('Parents', 'shared')!
    reopened.http.result = {primaryKeyField: 'id', allowAdd: false,
      data: {Items: [{id: 'P1', title: 'Before', amount: 5, lingma_sys_key: 'SIGNED',
        lingma_sys_params: {r: ['id', 'title', 'amount'], e: ['title', 'amount']}}], Count: 1}}
    await view.loadFromServer()
    view.updateEditingValue('P1', 'title', 'X')
    await expect(dataSet.saveChanges()).rejects.toThrow('Parents@shared.title')
    expect(reopened.http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD'))
      .toHaveLength(0)
    expect(view.getEditingPatch('P1')).toEqual({title: 'X'})
    expect(view.rows[0]?.['title']).toBe('Before')
    view.updateEditingValue('P1', 'title', 'Alex')
    reopened.http.saveResult = {maplistedit: [{ParentSource: [{id: 'P1', title: 'Alex', amount: 5}]}]}
    await expect(dataSet.saveChanges()).resolves.toMatchObject({success: true, data: {savedCount: 1}})
    const saves = reopened.http.requests.filter(request => request.url === '/api/DataOperation/BatchTableOperateRequestByCRUD')
    expect(saves).toHaveLength(1)
    expect(JSON.stringify(saves[0]?.data)).toContain('Alex')
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    expect(dataSet.resourceRelations).toMatchObject([{sourceRelationId: 'REL'}])
    dataSet.destroy()
  })
  it('stages two model-owned views, saves and reopens native configuration with database columns', async () => {
    const storage = fixture()
    const first = storage.openOwner()
    const opened = await first.open()
    const parentConfig = {fieldProjection: [projection], queryContext: {formid: 'PARENT'},
      filterExpression: {logic: 'or' as const, filters: [
        {field: 'title', operator: 'eq' as const, value: 'one'},
        {field: 'title', operator: 'eq' as const, value: 'two'}]},
      sortExpression: [{field: 'title', direction: 'asc' as const}],
      autoCurrentFirst: false, autoSelectFirst: false, page: 2, pageSize: 15,
      treeConfig: {idField: 'id', textField: 'title', treeMode: 'flat' as const},
      valueField: 'id', labelField: 'title', selectionDelimiter: '|',
      autoLoad: false, commitMode: 'staged' as const,
      aggregates: {title: {type: 'count' as const}}}
    editView(opened.metadataDataSet, 'Parents', 'shared', parentConfig)
    const childConfig = {queryContext: {formid: 'CHILD'}, page: 3, pageSize: 7,
      filterExpression: {field: 'parentId', operator: 'eq' as const, value: 'P'},
      valueField: 'parentId', labelField: 'title', autoLoad: false}
    editView(opened.metadataDataSet, 'Children', 'shared', childConfig)
    expect(opened.metadataDataSet.getView('DataViewDefinition')!.hasEditingChanges()).toBe(true)
    await opened.metadataDataSet.saveChanges()
    const saved = opened.viewState!
    expect(saved).toMatchObject({dirty: false, persisted: true})
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    expect(saved.text).not.toMatch(/"columns"|"rows"|"lingma_sys_/)
    expect(saved.config).toMatchObject({tables: {
      Parents: {views: {default: {}, shared: parentConfig, detail: {}}},
      Children: {views: {default: {}, shared: childConfig, detail: {}}},
    }, viewCascades: [cascade]})

    const reopened = storage.openOwner()
    const reread = await reopened.open()
    expect(reread.viewState!.text).toBe(saved.text)
    const assembly = await reopened.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', reread.viewState!.text)})
    const dataSet = assembly.dataSet
    expect(assembly.diagnostics).toEqual([])
    expect(dataSet.scenarioId).toBe('SPACE')
    expect(dataSet.getTable('Parents')?.columns.map(column => column.name).filter(name => name !== '_pk'))
      .toEqual(['id', 'title'])
    expect(dataSet.getTable('Children')?.columns.map(column => column.name).filter(name => name !== '_pk'))
      .toEqual(['id', 'parentId', 'title'])
    expect(dataSet.getView('Parents', 'shared')).not.toBe(dataSet.getView('Children', 'shared'))
    expect(dataSet.getView('Parents', 'default')).toBeDefined()
    expect(dataSet.getView('Children', 'default')).toBeDefined()
    expect(dataSet.getView('Parents', 'detail')).toBeDefined()
    expect(dataSet.getView('Children', 'detail')).toBeDefined()
    expect(dataSet.getView('Parents', 'shared')?.queryContext).toEqual({formid: 'PARENT'})
    expect(dataSet.getView('Children', 'shared')?.queryContext).toEqual({formid: 'CHILD'})
    expect(dataSet.getView('Parents', 'shared')?.pageSize).toBe(15)
    expect(dataSet.getView('Children', 'shared')?.pageSize).toBe(7)
    expect(dataSet.getView('Parents', 'shared')?.fieldProjection).toEqual([projection])
    const {autoLoad: parentAutoLoad, ...parentSerialized} = parentConfig
    const {autoLoad: childAutoLoad, ...childSerialized} = childConfig
    expect(dataSet.getView('Parents', 'shared')?.autoLoad).toBe(parentAutoLoad)
    expect(dataSet.getView('Children', 'shared')?.autoLoad).toBe(childAutoLoad)
    expect(dataSet.getView('Parents', 'shared')?.toJson()).toMatchObject(parentSerialized)
    expect(dataSet.getView('Children', 'shared')?.toJson()).toMatchObject(childSerialized)
    expect(dataSet.resourceRelations).toMatchObject([{sourceRelationId: 'REL',
      parentTable: 'Parents', childTable: 'Children'}])
    expect(dataSet.viewCascades).toMatchObject([cascade])
    await expect(dataSet.getView('Children', 'detail')?.loadFromServer()).resolves.toMatchObject({success: true})
    expect(reopened.http.requests[0]?.data).toMatchObject({Table: [{Name: 'ChildModel'}]})
    const parent = dataSet.getView('Parents', 'shared')!
    reopened.http.result = {primaryKeyField: 'id', allowAdd: false,
      data: {Items: [{id: 'P1', title: 'one'}], Count: 1}}
    await expect(parent.loadFromServer()).resolves.toMatchObject({success: true})
    expect(reopened.http.requests.at(-1)?.data).toMatchObject({Table: [{Name: 'ParentModel',
      Fields: [expect.objectContaining({Name: 'title'}), expect.objectContaining({Name: 'id'})]}]})
    expect(parent.rows[0]?.['id']).toBe('P1')
    expect(parent.fieldAccess(parent.rows[0]!, 'id').read).toBe('visible')
    parent.setSelectedRows([parent.rows[0]!])
    expect(parent.value).toBe('P1')
    expect(parent.labels).toEqual(['one'])
    dataSet.destroy()

    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'newColumn']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const third = storage.openOwner()
    const latest = await third.open()
    const updated = await third.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', latest.viewState!.text)})
    expect(updated.dataSet.getTable('Parents')?.columns.map(column => column.name).filter(name => name !== '_pk'))
      .toEqual(['id', 'title', 'newColumn'])
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    updated.dataSet.destroy()
  })

  it.each([false, true])('offers only projected fields and formal query dependencies with tree=%s', async tree => {
    const storage = fixture()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'parentId', 'name', 'unused']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const owner = storage.openOwner()
    const opened = await owner.open()
    editView(opened.metadataDataSet, 'Parents', 'shared', {fieldProjection: [projection], valueField: 'id', ...(tree ? {treeConfig: {}} : {})})
    await opened.metadataDataSet.saveChanges()
    const saved = opened.viewState!
    const {dataSet} = await owner.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', opened.viewState!.text)})
    const configured = JSON.parse(readFileSync('config/pages/data-platform/data-space-design/pagedata.json', 'utf8'))
    const metadata = DataSet.fromJson({scenarioId: 'META', dataSetName: 'metadata', tables: {DataViewDefinition: configured.tables.DataViewDefinition, DataTableBindingDefinition: configured.tables.DataTableBindingDefinition}})
    try {
      new LowcodeDataSpaceViewMetadata(metadata).setFieldOptions(dataSet)
      const options = metadata.getTable('DataViewFieldOption')!.rows
        .filter(row => row['tableName'] === 'Parents' && row['viewId'] === 'shared').map(row => row['name'])
      expect(options).toEqual(tree ? ['title', 'id', 'parentId', 'name'] : ['title', 'id'])
      editView(opened.metadataDataSet, 'Parents', 'shared', {valueField: 'unused'})
      await expect(opened.metadataDataSet.saveChanges()).rejects.toThrow('SCENARIO_VIEW_FIELD')
      expect(storage.stored.get('SPACE')).toBe(saved.text)
      expect(opened.metadataDataSet.getView('DataViewDefinition')!.dirtyTracking.hasPendingChanges()).toBe(true)
      opened.metadataDataSet.getView('DataViewDefinition')!.discardPendingChanges()
      owner.http.result = {primaryKeyField: 'id', allowAdd: false,
        data: {Items: [{id: 'P1', title: 'one', ...(tree ? {parentId: '', name: 'Node'} : {})}], Count: 1}}
      await expect(dataSet.getView('Parents', 'shared')!.loadFromServer()).resolves.toMatchObject({success: true})
      expect(owner.http.requests.at(-1)?.data).toMatchObject({Table: [{Fields:
        options.map(name => expect.objectContaining({Name: name}))}]})
    } finally {metadata.destroy(); dataSet.destroy()}
  })

  it('allows missing configuration for design and rejects damaged or wrong-bound definitions', async () => {
    const missing = fixture(null).openOwner()
    const absent = await missing.open()
    expect(absent.viewState).toBeNull()
    expect(absent.metadataDataSet.getView('DataViewDefinition')!.rows).toEqual([])
    const damaged = fixture('{broken').openOwner()
    await expect(damaged.open()).rejects.toThrow()
    const wrong = initial.replace('"modelId":"ParentModel"', '"modelId":"OTHER"')
    const wrongOwner = fixture(wrong).openOwner()
    const opened = await wrongOwner.open()
    await expect(wrongOwner.assemble({scenarioId: 'SPACE', config: new ScenarioViewConfig('SPACE', opened.viewState!.text)})).rejects.toThrow('唯一正式模型')
  })
})
