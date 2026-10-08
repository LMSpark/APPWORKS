import {describe, expect, it, vi} from 'vitest'
import {DataSetCrudTool, DataViewFilter, RequestState, extractColumnRules, type DataViewFieldCascade} from '@spark-appworks/spark-data'
import {DataSpaceRuntimeApi, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ProjectWorkspace, type ScenarioViewFile} from '@spark-appworks/spark-project-model'
import {HttpClientBase, isRecord, type HttpResponse, type RequestConfig} from '@spark-appworks/spark-utils'
import {LowcodeDataSpaceAssembler} from '../../../../../src/lowcode/data-space/lowcode-data-space-assembler'
import {LowcodeDataSpaceViewDesign} from '../../../../../src/lowcode/data-space/view-design/lowcode-data-space-view-design'

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
  dependencyType: 'currentRow', autoLoad: false}
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

function fixture(text: string | null = initial) {
  const stored = new Map<string, string>()
  if (text !== null) stored.set('SPACE', text)
  let models = [model('ParentModel', 'ParentSource', ['id', 'title']),
    model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])]
  let formalSpaceName = '正式空间名称'
  const openOwner = () => {
    const workspace = new ProjectWorkspace({projectId: 'APP',
      pageFiles: {readPageFile: async () => {throw new Error('unexpected page read')}},
      blueprint: {loadRoot: async () => ({children: []})},
      scenarioViews: {readScope: () => 'SCOPE',
        readText: async scenarioId => stored.get(scenarioId) ?? null,
        writeText: async (scenarioId, content) => {stored.set(scenarioId, content)}},
    })
    const http = new QueryHttp()
    const runtime = new DataSpaceRuntimeApi({http, readScope: () => ({token: 'SCOPE', headers: {}})})
    const assembler = new LowcodeDataSpaceAssembler(runtime, http)
    const assemble = async (scenarioId: string, file: ScenarioViewFile) => {
      if (file.scenarioId !== scenarioId) throw new Error('scenario identity mismatch')
      return assembler.assemble({config: file.value, space: {dataSpaceId: scenarioId, name: formalSpaceName}, models, relations})
    }
    const service = new LowcodeDataSpaceViewDesign({workspace, assemble, assertScope: () => undefined,
      readModel: async input => {
        const found = models.find(candidate => candidate.id === input.modelId)
        if (!found) throw new Error('formal model missing')
        return found
      }})
    return {workspace, service, assemble, assembler, http}
  }
  return {stored, openOwner, setModels: (next: FormalModel[]) => {models = next},
    setSpaceName: (name: string) => {formalSpaceName = name}}
}

const parentShared = {scenarioId: 'SPACE', tableName: 'Parents', modelId: 'ParentModel',
  modelName: 'ParentModel', viewId: 'shared'}
const childShared = {scenarioId: 'SPACE', tableName: 'Children', modelId: 'ChildModel',
  modelName: 'ChildModel', viewId: 'shared'}
const projection = {fieldId: 'ParentModel-title', source: 'resource' as const,
  resourceFieldId: 'ParentModel-title', resourceField: 'title', viewField: 'title', type: 'string',
  label: 'Title', output: true, sortOrder: 0, sortDirection: null, group: 0,
  distinct: false, primaryKey: false, value: '', valueFunction: '', expression: ''}

describe('scenario view persistence and formal model assembly', () => {
  it.each(['parent-first', 'child-first'])('reopens named autoLoad views and queries their dependencies with %s table order', async order => {
    const storage = fixture()
    const first = storage.openOwner()
    const opened = await first.service.open('SPACE')
    const parents = {modelBinding: {modelId: 'ParentModel', modelName: 'ParentModel'}, views: {
      default: {autoLoad: false}, shared: {autoLoad: true, queryContext: {purpose: 'parent'}},
      detail: {autoLoad: true, queryContext: {purpose: 'independent'}},
    }}
    const children = {modelBinding: {modelId: 'ChildModel', modelName: 'ChildModel'}, views: {
      default: {autoLoad: false}, shared: {autoLoad: true}, detail: {autoLoad: false},
    }}
    opened.dirtySource.setText(JSON.stringify({scenarioId: 'SPACE', tables: order === 'parent-first'
      ? {Parents: parents, Children: children} : {Children: children, Parents: parents},
    viewCascades: [{...cascade, autoLoad: true}]}))
    const saved = await first.service.save('SPACE')
    const reopened = storage.openOwner()
    const read = await reopened.service.open('SPACE')
    const {dataSet} = await reopened.assemble('SPACE', read.dirtySource)
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
      expect(read.dirtySource.getText()).toBe(saved.text)
      expect(read.dirtySource.isDirty).toBe(false)
      expect(storage.stored.get('SPACE')).toBe(saved.text)
    } finally {
      finishParent?.()
      dataSet.destroy()
    }
  })

  it.each(['failure', 'destruction'])('keeps named child queries gated after parent %s', async outcome => {
    const storage = fixture()
    const first = storage.openOwner()
    const opened = await first.service.open('SPACE')
    const parentStage = await first.service.stage({...parentShared, expectedText: opened.state.text,
      configuration: {autoLoad: true}})
    await first.service.stage({...childShared, expectedText: parentStage.text, configuration: {autoLoad: true}})
    const saved = await first.service.save('SPACE')
    const reopened = storage.openOwner()
    const read = await reopened.service.open('SPACE')
    const {dataSet} = await reopened.assemble('SPACE', read.dirtySource)
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

  it('configures field-value cascades through CRUD, persists them and queries with actual row inputs after reopening', async () => {
    const storage = fixture()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'country', 'province', 'city'], ['province']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'provinceId', 'title'], ['provinceId'])])
    const first = storage.openOwner()
    const opened = await first.service.open('SPACE')
    const config = { ...structuredClone(opened.state.config) }
    const tables = config['tables']
    if (!isRecord(tables) || !isRecord(tables['Children']) || !isRecord(tables['Children']['views'])) {
      throw new Error('missing named options view')
    }
    config['tables'] = {...tables, Children: {...tables['Children'], views: {...tables['Children']['views'], detail: {filterExpression: {logic: 'and', filters: [
      {field: 'parentId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'countryId'}},
      {field: 'provinceId', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'provinceId'}},
    ]}}}}}
    const field: DataViewFieldCascade = {kind: 'field', cascadeId: 'city-by-region', tableName: 'Parents', viewId: 'shared',
      rowMode: 'editing-row', targetField: 'city',
      parents: [{field: 'country', parameter: 'countryId'}, {field: 'province', parameter: 'provinceId'}],
      optionsView: {tableName: 'Children', viewId: 'detail', valueField: 'id', labelField: 'title'},
      valuePolicy: {mode: 'retain-valid', clearValue: null}}
    const design = await first.assemble('SPACE', opened.dirtySource)
    const tool = DataSetCrudTool.fromDataSet(design.dataSet)
    const selector = {kind: 'field', cascadeId: field.cascadeId} as const
    tool.createCascade({cascade: {...field, parents: [{field: 'country', parameter: 'countryId'}]}})
    tool.updateCascade({...selector, updates: {parents: field.parents}})
    config['viewCascades'] = structuredClone(tool.listCascades())
    tool.dataSet.destroy()
    opened.dirtySource.setText(JSON.stringify(config))
    const saved = await first.service.save('SPACE')
    expect(saved.dirty).toBe(false)
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    expect(saved.text).toContain('"kind":"field"')
    expect(saved.text).not.toMatch(/"rows"|"lingma_sys_"|"options":/)

    const reopened = storage.openOwner()
    const read = await reopened.service.open('SPACE')
    const assembly = await reopened.assemble('SPACE', read.dirtySource)
    const dataSet = assembly.dataSet
    expect(dataSet.viewCascades).toMatchObject([cascade, field])
    expect(dataSet.resourceRelations).toMatchObject([{sourceRelationId: 'REL'}])
    expect(dataSet.getView('Parents', 'shared')).not.toBe(dataSet.getView('Children', 'detail'))
    const target = dataSet.getView('Parents', 'shared')!
    const options = dataSet.getView('Children', 'detail')!
    reopened.http.result = {primaryKeyField: 'id', allowAdd: false,
      data: {Items: [{id: 'P1', title: 'Parent', country: 'A', province: 0, city: 'OLD',
        lingma_sys_key: 'SIGNED', lingma_sys_params: {r: ['id', 'title', 'country', 'province', 'city'],
          e: ['country', 'province', 'city']}},
      {id: 'P2', title: 'Other row', country: 'OTHER', province: 9, city: 'KEEP',
        lingma_sys_key: 'SIGNED-2', lingma_sys_params: {r: ['id', 'title', 'country', 'province', 'city'],
          e: ['country', 'province', 'city']}}], Count: 2}}
    await target.loadFromServer()
    target.setCurrentRow(target.rows[1] ?? null)
    reopened.http.result = {primaryKeyField: 'id', allowAdd: false,
      data: {Items: [{id: 'NEW', parentId: 'B', provinceId: 0, title: 'New City',
        lingma_sys_key: 'OPTION', lingma_sys_params: {r: ['id', 'title']}}], Count: 1}}
    target.updateEditingValue('P1', 'country', 'B')
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState({tableName: 'Parents', viewId: 'shared',
      rowId: 'P1', field: 'city'})).toMatchObject({status: 'ready', valueStatus: 'empty'}))
    expect(target.getEditingPatch('P1')).toEqual({country: 'B', city: null})
    expect(target.getEditingPatch('P2')).toBeUndefined()
    expect(target.currentRow?.['country']).toBe('OTHER')
    expect(target.rows[0]?.['city']).toBe('OLD')
    expect(options.rows).toEqual([])
    const optionRequest = reopened.http.requests.filter(request => request.url === '/api/DataOperation/GetData')[1]
    expect(optionRequest?.data).toMatchObject({Table: [{Name: 'ChildModel',
      inputParams: [{Name: 'countryId', Value: 'B'}, {Name: 'provinceId', Value: 0}],
      Filter: {Type: 'and', Filters: [{ValueFun: {Type: 'GetConstValue', Value: 'B'}},
        {ValueFun: {Type: 'GetConstValue', Value: 0}}]}}]})
    expect(JSON.stringify(optionRequest?.data)).not.toContain('city-by-region')
    expect(dataSet.getView('Parents', 'detail')?.requestState).toBe(RequestState.Idle)
    const address = {tableName: 'Parents', viewId: 'shared', rowId: 'P1', field: 'city'}
    target.updateEditingValue('P1', 'province', 3)
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address).status).toBe('ready'))
    expect(reopened.http.requests.at(-1)?.data).toMatchObject({Table: [{inputParams: [
      {Name: 'countryId', Value: 'B'}, {Name: 'provinceId', Value: 3}]}]})
    expect(options.rows).toEqual([])
    expect(options.queryContext).toEqual({})
    expect(storage.stored.get('SPACE')).toBe(saved.text)

    const runtimeTool = DataSetCrudTool.fromDataSet(dataSet)
    runtimeTool.updateCascade({...selector, updates: {valuePolicy: {mode: 'retain'}}})
    target.updateEditingValue('P1', 'city', 'NEW')
    reopened.http.result = {primaryKeyField: 'id', allowAdd: false, data: {Items: [], Count: 0}}
    target.updateEditingValue('P1', 'country', 'C')
    await vi.waitFor(() => expect(dataSet.getFieldCascadeState(address)).toMatchObject({status: 'ready', valueStatus: 'invalid'}))
    expect(target.getEditingPatch('P1')).toEqual({country: 'C', province: 3, city: 'NEW'})
    read.dirtySource.setText(JSON.stringify({...read.state.config, viewCascades: runtimeTool.listCascades()}))
    await reopened.service.save('SPACE')
    const updatedOwner = storage.openOwner()
    const updatedFile = await updatedOwner.service.open('SPACE')
    const updatedAssembly = await updatedOwner.assemble('SPACE', updatedFile.dirtySource)
    expect(updatedAssembly.dataSet.viewCascades).toContainEqual({...field, valuePolicy: {mode: 'retain'}})
    updatedAssembly.dataSet.destroy()

    runtimeTool.deleteCascade(selector)
    const requestCount = reopened.http.requests.length
    target.updateEditingValue('P1', 'country', 'D')
    await Promise.resolve()
    expect(reopened.http.requests).toHaveLength(requestCount)
    expect(() => dataSet.getFieldCascadeState(address)).toThrow('FIELD_CASCADE_ADDRESS')
    read.dirtySource.setText(JSON.stringify({...read.state.config, viewCascades: runtimeTool.listCascades()}))
    const deleted = await reopened.service.save('SPACE')
    const last = storage.openOwner()
    const lastFile = await last.service.open('SPACE')
    const lastAssembly = await last.assemble('SPACE', lastFile.dirtySource)
    expect(lastAssembly.dataSet.viewCascades).toMatchObject([cascade])
    expect(lastAssembly.dataSet.resourceRelations).toMatchObject([{sourceRelationId: 'REL'}])
    expect(deleted.text).not.toMatch(/"country":"D"|SIGNED|"rows"/)
    lastAssembly.dataSet.destroy()
    runtimeTool.dataSet.destroy()
  })

  it('saves native DataSet settings through the file owner and reopens independent runtime instances', async () => {
    const storage = fixture()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'price', 'qty'], ['price', 'qty']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const first = storage.openOwner()
    const opened = await first.service.open('SPACE')
    const draft = {...structuredClone(opened.state.config)}
    draft['schemaVersion'] = 3
    draft['version'] = 0
    draft['layout'] = {tablePositions: {Parents: {x: -2.5, y: 0}, Children: {x: 1, y: 3}}}
    draft['saveChanges'] = {mode: 'perView'}
    const tables = draft['tables']
    if (!isRecord(tables) || !isRecord(tables['Parents'])) throw new Error('missing Parents')
    tables['Parents']['columns'] = [{name: 'total', type: 'number', computeExpression: 'price * qty'}]
    opened.dirtySource.setText(JSON.stringify(draft))
    const staged = await first.service.stage({...parentShared, expectedText: opened.dirtySource.getText(),
      configuration: {pageSize: 13, commitMode: 'staged'}})
    expect(staged.config).toMatchObject({schemaVersion: 3, version: 0,
      layout: {tablePositions: {Parents: {x: -2.5, y: 0}}}, saveChanges: {mode: 'perView'}})
    const saved = await first.service.save('SPACE')
    expect(saved.dirty).toBe(false)
    expect(saved.revision).toBeGreaterThan(0)
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    expect(saved.text).not.toContain('正式空间名称')

    const reopened = storage.openOwner()
    const read = await reopened.service.open('SPACE')
    const firstAssembly = await reopened.assemble('SPACE', read.dirtySource)
    expect(firstAssembly.dataSet.dataSetName).toBe('正式空间名称')
    expect(firstAssembly.dataSet.getTable('Parents')).toMatchObject({resourceType: 'database-table', resourceId: 'ParentSource'})
    storage.setSpaceName('正式空间新名称')
    storage.setModels([model('ParentModel', 'ParentSourceNext', ['id', 'title', 'price', 'qty'], ['price', 'qty']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const secondAssembly = await reopened.assemble('SPACE', read.dirtySource)
    expect(secondAssembly.dataSet.dataSetName).toBe('正式空间新名称')
    expect(secondAssembly.dataSet.getTable('Parents')?.resourceId).toBe('ParentSourceNext')
    expect(read.dirtySource.getText()).toBe(saved.text)
    expect(saved.text).not.toContain('ParentSourceNext')
    const dataSet = firstAssembly.dataSet
    expect(dataSet.toJson()).toMatchObject({schemaVersion: 3, version: 0,
      layout: {tablePositions: {Parents: {x: -2.5, y: 0}}}, saveChanges: {mode: 'perView'}})
    expect(dataSet.version).toBe(0)
    expect(secondAssembly.dataSet.layout).toEqual(dataSet.layout)
    dataSet.layout!.tablePositions!['Parents']!.x = 99
    expect(secondAssembly.dataSet.layout?.tablePositions?.['Parents']?.x).toBe(-2.5)
    expect(read.dirtySource.value.toJSON()).toMatchObject({layout: {tablePositions: {Parents: {x: -2.5, y: 0}}}})

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
    expect(read.dirtySource.value.toJSON()).toMatchObject({saveChanges: {mode: 'perView'}})
    firstAssembly.dataSet.destroy()
    secondAssembly.dataSet.destroy()

    const cleared = {...structuredClone(read.state.config)}
    delete cleared['schemaVersion']
    delete cleared['version']
    delete cleared['layout']
    delete cleared['saveChanges']
    read.dirtySource.setText(JSON.stringify(cleared))
    await reopened.service.save('SPACE')
    const last = storage.openOwner()
    const lastFile = await last.service.open('SPACE')
    const lastAssembly = await last.assemble('SPACE', lastFile.dirtySource)
    expect(lastAssembly.dataSet.toJson()).toMatchObject({schemaVersion: 2})
    expect(lastAssembly.dataSet.version).toBeUndefined()
    expect(lastAssembly.dataSet.layout).toBeUndefined()
    expect(lastAssembly.dataSet.saveChangesConfig).toBeUndefined()
    lastAssembly.dataSet.destroy()
  })
  it('saves local computed definitions through the file owner and reopens formal query and save', async () => {
    const storage = fixture()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'price', 'qty'], ['price', 'qty']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const first = storage.openOwner()
    const opened = await first.service.open('SPACE')
    const draft = structuredClone(opened.state.config)
    const tables = draft['tables']
    if (!isRecord(tables) || !isRecord(tables['Parents']) || !isRecord(tables['Children'])) throw new Error('missing fixture tables')
    tables['Parents']['columns'] = [{name: 'total', type: 'number', label: 'Total',
      computeExpression: 'price * qty', min: 0}]
    tables['Children']['columns'] = [{name: 'total', type: 'string', computeExpression: 'title + "!"'}]
    opened.dirtySource.setText(JSON.stringify(draft))
    await first.service.save('SPACE')
    expect(storage.stored.get('SPACE')).toContain('"computeExpression":"price * qty"')
    const second = storage.openOwner()
    const read = await second.service.open('SPACE')
    const assembled = await second.assemble('SPACE', read.dirtySource)
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
    const conflictFile = await conflict.service.open('SPACE')
    await expect(conflict.assemble('SPACE', conflictFile.dirtySource)).rejects.toThrow('本地计算列与正式输出字段重名')
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'price', 'qty'], ['price', 'qty']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const cleared = structuredClone(read.state.config)
    const clearedTables = cleared['tables']
    if (!isRecord(clearedTables) || !isRecord(clearedTables['Parents'])) throw new Error('missing clear table')
    clearedTables['Parents']['columns'] = []
    read.dirtySource.setText(JSON.stringify(cleared))
    await second.service.save('SPACE')
    const last = storage.openOwner()
    const lastFile = await last.service.open('SPACE')
    const lastAssembly = await last.assemble('SPACE', lastFile.dirtySource)
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
    const opened = await first.service.open('SPACE')
    const config = structuredClone(opened.state.config)
    const tables = config['tables']
    if (!isRecord(tables) || !isRecord(tables['Parents']) || !isRecord(tables['Children'])) {
      throw new Error('missing fixture tables')
    }
    tables['Parents']['columns'] = [{name: 'title', required: true, minLength: 2,
      maxLength: 6, pattern: '^A', patternMessage: 'must start A'},
    {name: 'amount', min: 0, max: 10}]
    tables['Children']['columns'] = [{name: 'title', required: false, minLength: 0}]
    opened.dirtySource.setText(JSON.stringify(config))
    const saved = await first.service.save('SPACE')
    expect(saved.dirty).toBe(false)
    expect(saved.text).not.toMatch(/"type"|"label"|"isPrimaryKey"|"rows"|"token"/)
    const reopened = storage.openOwner()
    const read = await reopened.service.open('SPACE')
    const assembled = await reopened.assemble('SPACE', read.dirtySource)
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
    const clearedConfig = structuredClone(read.state.config)
    const clearedTables = clearedConfig['tables']
    if (!isRecord(clearedTables) || !isRecord(clearedTables['Parents'])) throw new Error('missing fixture table')
    clearedTables['Parents']['columns'] = []
    read.dirtySource.setText(JSON.stringify(clearedConfig))
    const cleared = await reopened.service.save('SPACE')
    const clearOwner = storage.openOwner()
    const clearRead = await clearOwner.service.open('SPACE')
    const clearAssembly = await clearOwner.assemble('SPACE', clearRead.dirtySource)
    expect(extractColumnRules(clearAssembly.dataSet.getTable('Parents')!.columns.find(column => column.name === 'title')!))
      .toEqual([])
    clearAssembly.dataSet.destroy()
    expect(cleared.text).not.toContain('"required":true')
    read.dirtySource.setText(saved.text)
    await reopened.service.save('SPACE')
    storage.setModels([model('ParentModel', 'ParentSource', ['id']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const changed = storage.openOwner()
    const stale = await changed.service.open('SPACE')
    await expect(changed.assemble('SPACE', stale.dirtySource)).rejects.toThrow('未解析到唯一正式输出字段')
    expect(storage.stored.get('SPACE')).toBe(saved.text)
  })
  it('validates persisted column rules before formal DataSet save and accepts the corrected receipt', async () => {
    const storage = fixture()
    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'amount'], ['amount']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const first = storage.openOwner()
    const opened = await first.service.open('SPACE')
    const draft = structuredClone(opened.state.config)
    const tables = draft['tables']
    if (!isRecord(tables) || !isRecord(tables['Parents'])) throw new Error('missing Parents')
    tables['Parents']['columns'] = [{name: 'title', required: true, minLength: 2, maxLength: 6,
      pattern: '^A', patternMessage: 'must start A'}, {name: 'amount', min: 0, max: 10}]
    opened.dirtySource.setText(JSON.stringify(draft))
    const saved = await first.service.save('SPACE')
    const reopened = storage.openOwner()
    const read = await reopened.service.open('SPACE')
    const assembly = await reopened.assemble('SPACE', read.dirtySource)
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
    const opened = await first.service.open('SPACE')
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
    const stagedParent = await first.service.stage({...parentShared,
      expectedText: opened.state.text, configuration: parentConfig})
    const childConfig = {queryContext: {formid: 'CHILD'}, page: 3, pageSize: 7,
      filterExpression: {field: 'parentId', operator: 'eq' as const, value: 'P'},
      valueField: 'parentId', labelField: 'title', autoLoad: false}
    const stagedChild = await first.service.stage({...childShared,
      expectedText: stagedParent.text, configuration: childConfig})
    expect(stagedChild.dirty).toBe(true)
    const saved = await first.service.save('SPACE')
    expect(saved).toMatchObject({dirty: false, persisted: true})
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    expect(saved.text).not.toMatch(/"columns"|"rows"|"lingma_sys_/)
    expect(saved.config).toMatchObject({tables: {
      Parents: {views: {default: {}, shared: parentConfig, detail: {}}},
      Children: {views: {default: {}, shared: childConfig, detail: {}}},
    }, viewCascades: [cascade]})

    const reopened = storage.openOwner()
    const reread = await reopened.service.open('SPACE')
    expect(reread.state.text).toBe(saved.text)
    const assembly = await reopened.assemble('SPACE', reread.dirtySource)
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
    dataSet.destroy()

    storage.setModels([model('ParentModel', 'ParentSource', ['id', 'title', 'newColumn']),
      model('ChildModel', 'ChildSource', ['id', 'parentId', 'title'])])
    const third = storage.openOwner()
    const latest = await third.service.open('SPACE')
    const updated = await third.assemble('SPACE', latest.dirtySource)
    expect(updated.dataSet.getTable('Parents')?.columns.map(column => column.name).filter(name => name !== '_pk'))
      .toEqual(['id', 'title', 'newColumn'])
    expect(storage.stored.get('SPACE')).toBe(saved.text)
    updated.dataSet.destroy()
  })

  it('keeps missing, damaged and wrong-bound files as distinct failures', async () => {
    const missing = fixture(null).openOwner()
    await expect(missing.service.open('SPACE')).rejects.toThrow('SCENARIO_VIEW_FILE_MISSING')
    const damaged = fixture('{broken').openOwner()
    await expect(damaged.service.open('SPACE')).rejects.toThrow()
    const wrong = initial.replace('"modelId":"ParentModel"', '"modelId":"OTHER"')
    const wrongOwner = fixture(wrong).openOwner()
    const opened = await wrongOwner.service.open('SPACE')
    await expect(wrongOwner.assemble('SPACE', opened.dirtySource)).rejects.toThrow('唯一正式模型')
  })
})
