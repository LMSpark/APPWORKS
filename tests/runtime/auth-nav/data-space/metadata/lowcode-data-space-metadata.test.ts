import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {flushPromises, mount, type VueWrapper} from '@vue/test-utils'
import {defineComponent, h} from 'vue'
import ElementPlus from 'element-plus'
import {FieldNumber, PAGE_RUNTIME, RendererForm, RendererSection, registerAllRenderers, useSparkComponent} from '@spark-appworks/spark-component'
import { DATA_SPACE_DESIGN_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import { DataMember, DataSet, RequestState, resolveDataViewMember } from '@spark-appworks/spark-data'
import { PageRuntime, ProjectWorkspace, ScenarioViewConfig } from '@spark-appworks/spark-project-model'
import type { RequestConfig } from '@spark-appworks/spark-utils'

const mocks = vi.hoisted(() => ({
  scope: vi.fn(), readSpaceDefinition: vi.fn(), readModelBatch: vi.fn(), readRelations: vi.fn(), request: vi.fn(),
  readConfiguration: vi.fn(), gateways: vi.fn(), fileUpload: {uploadWorkingText: vi.fn()},
}))

vi.mock('@/lowcode/lowcode-runtime', async () => {
  const { DataSpaceRuntimeApi } = await import('@spark-appworks/spark-lowcode-api')
  const { HttpClientBase } = await import('@spark-appworks/spark-utils')
  class FixtureHttp extends HttpClientBase {
    protected override async executeRequest(config: RequestConfig) {
      return { data: await mocks.request(config), status: 200, statusText: 'OK', headers: {} }
    }
  }
  const http = new FixtureHttp()
  return { createPageToolFilesIo: () => ({list: async () => [], read: async () => null,
    upload: async () => {throw new Error('unexpected ProjectToolFile upload')},
    remove: async () => {throw new Error('unexpected ProjectToolFile remove')},
    restoreWorkingFile: async () => {throw new Error('unexpected ProjectToolFile restore')},
    listVersions: async () => [], uploadVersion: async () => {throw new Error('unexpected ProjectToolFile version upload')},
    readVersion: async () => null}), lowcodeHttp: http, lowcodeApi: {
    readRequestScope: mocks.scope,
    dataSpace: {design: {readSpaceDefinition: mocks.readSpaceDefinition, readModelBatch: mocks.readModelBatch, readRelations: mocks.readRelations},
      runtime: new DataSpaceRuntimeApi({http, readScope: mocks.scope})},
  }, createLowcodeProjectGateways: mocks.gateways, lowcodeDesignFileUpload: mocks.fileUpload }
})

import { loadLowcodeDataSpaceMetadata, loadScenarioDataSet } from '@/lowcode/data-space/lowcode-data-space-runtime'
import {LowcodeDataSpaceMetadata} from '@/lowcode/data-space/lowcode-data-space-metadata'
import { LowcodeDataSpaceModelSourceReader } from '@/lowcode/data-space/model-source/lowcode-data-space-model-source-reader'
import { LowcodeDataSpaceViewDesign, type LowcodeDataSpaceDesignSession } from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'
import {LowcodeDataSpaceInputParameterReferences} from '@/lowcode/data-space/input-parameters/lowcode-data-space-input-parameter-references'
import DataSpaceViewEditor from '@/views/features/data-platform/data-set-management/design/views/DataSpaceViewEditor.vue'

const tables = ['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field', 'Base_DataModel_Relation'] as const
// Existing full-definition cases explicitly open both deferred directories.
async function loadCompleteMetadata(targetId: string, executors?: Parameters<typeof loadLowcodeDataSpaceMetadata>[1]) {
  const scope = record(mocks.scope())['token']
  const dataSet = await loadLowcodeDataSpaceMetadata(targetId, executors)
  try {
    await new LowcodeDataSpaceMetadata(dataSet, targetId, () => {
      if (record(mocks.scope())['token'] !== scope) throw new Error('STALE_SCOPE')
    }).load(['Base_DataModel_Field', 'Base_DataModel_Relation'])
    return dataSet
  } catch (cause) {dataSet.destroy(); throw cause}
}
const configuration: unknown = JSON.parse(readFileSync(resolve('config/pages/data-platform/data-space-design/pagedata.json'), 'utf8'))

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('expected record')
  return Object.fromEntries(Object.entries(value))
}

function configTables(): Record<string, unknown> { return record(record(configuration)['tables']) }

function formalModel(metaName: string) {
  const modelId = record(record(configTables()[metaName])['modelBinding'])['modelId']
  if (typeof modelId !== 'string') throw new Error('missing formal model ID')
  const sourceFields: Record<string, string[]> = {
    Base_Desensitization_Rule: ['rowid', 'name'],
    View_TblList: ['rowid', 'tblname', 'tbldesc', 'dbid', 'DbName'],
    _Base_DictType: ['rowid', 'TypeName', 'functiondesc'],
    Base_DataServiceInterface: ['rowid', 'Name', 'Desc', 'ProviderID', 'secret'],
    Base_JsonData: ['rowid', 'name'], Base_DataViewList: ['rowid', 'name'],
    View_ViewList: ['rowid', 'vewname', 'vewdesc', 'dbid', 'DbName'],
    Base_TblField: ['rowid', 'tblid', 'enname', 'cnname', 'description', 'DataType', 'IsPKey'],
    _Base_ParamList: ['parid', 'pid', 'parname', 'pardesc', 'parzdtype'],
  }
  const fields = sourceFields[metaName] ?? ['rowid', ...(metaName === 'Base_DataSet' ? ['inputParams'] : ['dataSetId']),
    ...(metaName === 'Base_DataModel' ? ['Name'] : []),
    ...(metaName === 'Base_DataModel_Field' ? ['Name', 'dataModelId', 'type', 'ValueFun'] : [])]
  const primaryKey = metaName === '_Base_ParamList' ? 'parid' : 'rowid'
  return {id: modelId, name: metaName, metaName, sourceName: metaName,
    sourceId: '', sourceType: 'table', primaryKey, businessMain: false, raw: {},
    fields: fields.map((name, order) => ({id: `${metaName}-${name}`, modelId, name,
      canonicalName: name, type: 'string', primaryKey: name === primaryKey, description: '', output: true,
      computed: false, order, orderType: '', raw: {}}))}
}

function rowsFor(target = 'SPACE') {
  const row = (rowid: string, extra: Record<string, unknown>) => ({rowid, ...extra,
    lingma_sys_key: `key-${rowid}`, lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}})
  return new Map<string, Array<Record<string, unknown>>>([
    ['Base_DataSet', [row(target, {inputParams: '[]'})]],
    ['Base_DataModel', Array.from({length: 25}, (_, index) => row(`MODEL-${index}`, {dataSetId: target, Name: `Model ${index}`}))],
    ['Base_DataModel_Field', [row('FIELD-1', {dataSetId: target, dataModelId: 'MODEL-0', Name: 'name'})]],
    ['Base_DataModel_Relation', [row('REL-1', {dataSetId: target})]],
  ])
}

function wireConditions(input: unknown): Array<Record<string, unknown>> {
  if (input === undefined) return []
  const filter = record(input)
  return Array.isArray(filter['Filters']) ? filter['Filters'].flatMap(wireConditions) : [filter]
}

function installRows(rows: Map<string, Array<Record<string, unknown>>>, options: { loseSaveResponse?: boolean; rejectSave?: boolean } = {}) {
  mocks.request.mockImplementation(async (config: RequestConfig) => {
    if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
      const groups = config.data
      if (!Array.isArray(groups) || groups.length !== 1) throw new Error('expected one save group')
      const group = record(groups[0])
      expect(group['TableName']).toBe('Base_DataSet')
      const changed = record(group['CrudModel'])['Changed']
      if (!Array.isArray(changed) || changed.length !== 1) throw new Error('expected one changed row')
      const change = record(changed[0])
      const stored = rows.get('Base_DataSet')?.find(row => row['rowid'] === change['rowid'])
      if (!stored || typeof change['inputParams'] !== 'string') throw new Error('invalid declaration target')
      expect(change).toEqual({rowid: stored['rowid'], inputParams: change['inputParams'],
        ...(stored['lingma_sys_key'] ? {lingma_sys_key: stored['lingma_sys_key']} : {})})
      expect(config.headers?.['x-FormKey']).toBe(DATA_SPACE_DESIGN_FORM_KEY)
      if (options.rejectSave) return {Code: 403, Message: 'fixture server rejected declaration write'}
      stored['inputParams'] = change['inputParams']
      if (options.loseSaveResponse) throw new Error('response lost after database write')
      return {Code: 200, Result: {maplistedit: [{Base_DataSet: [{rowid: stored['rowid'], inputParams: stored['inputParams']}]}]}}
    }
    if (config.url !== '/api/DataOperation/GetData') throw new Error('unexpected endpoint')
    const request = record(config.data)
    const entries = request['Table']
    if (!Array.isArray(entries)) throw new Error('missing formal model')
    const table = record(entries[0])
    const name = table['Name']
    if (typeof name !== 'string') throw new Error('missing formal model name')
    const page = request['PageParam'] === undefined ? {} : record(request['PageParam'])
    const modelFilter = wireConditions(table['Filter']).find(condition => condition['Field'] === 'dataModelId')
    const ids = modelFilter === undefined ? undefined : record(modelFilter['ValueFun'])['Value']
    const all = (rows.get(name) ?? []).filter(row => ids === undefined || (Array.isArray(ids) && ids.includes(row['dataModelId'])))
    const index = typeof page['index'] === 'number' ? page['index'] : 1
    const size = typeof page['size'] === 'number' ? page['size'] : all.length
    return {Code: 200, Result: {primaryKeyField: 'rowid', allowAdd: false,
      data: {Items: all.slice((index - 1) * size, index * size).map(row => ({...row})), Count: all.length}}}
  })
}

const metadataSessions: LowcodeDataSpaceDesignSession[] = []
async function openMetadataSession(targetId = 'SPACE') {
  const scope: unknown = mocks.scope()
  const token = record(scope)['token']
  const workspace = new ProjectWorkspace({projectId: 'APP-1',
    blueprint: {},
    scenarioViews: {readScope: () => String(record(mocks.scope())['token']), readText: async () => null,
      writeText: async () => {throw new Error('declarations must not write pagedata')}},
  })
  const service = new LowcodeDataSpaceViewDesign({workspace, loadMetadata: loadCompleteMetadata,
    readModel: async () => {throw new Error('missing target pagedata must not read target models')},
    assemble: async () => {throw new Error('missing target pagedata must not assemble target')},
    assertScope: () => {if (record(mocks.scope())['token'] !== token) throw new Error('STALE_SCOPE')},
  })
  const session = await service.openDesignSession(targetId)
  metadataSessions.push(session)
  const view = session.metadataDataSet.getView('Base_DataSet', 'default')
  if (!view || view.rows.length !== 1) throw new Error('missing unique space row')
  return {session, view}
}

function declarationRows(raw = ' [{ "rowid": "P1", "Name": "customer", "IsBusParam": true, "extra": 7 }] ') {
  const rows = rowsFor()
  const space = rows.get('Base_DataSet')?.[0]
  if (!space) throw new Error('missing space fixture')
  space['inputParams'] = raw
  space['lingma_sys_params'] = {r: [], e: ['inputParams'], h: [], m: [], d: false}
  return {rows, space, raw}
}

function saveRequests() {
  return mocks.request.mock.calls.map(([config]) => record(config))
    .filter(config => config['url'] === '/api/DataOperation/BatchTableOperateRequestByCRUD')
}

describe('data-space metadata DataSet', () => {
  beforeAll(() => registerAllRenderers())
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.scope.mockReturnValue({token: 'SCOPE-1', headers: {'X-AppId': 'APP-1'}})
    mocks.readConfiguration.mockReset().mockImplementation(async (id: string) => {
      expect(id).toBe(DATA_SPACE_DESIGN_FORM_KEY)
      return JSON.stringify(configuration)
    })
    mocks.gateways.mockReturnValue({scenarioViews: {readText: mocks.readConfiguration},
      blueprint: {}})
    mocks.readModelBatch.mockImplementation(async ({metaNames}: {metaNames: string[]}) => metaNames.map(formalModel))
    mocks.readSpaceDefinition.mockImplementation(async ({dataSpaceId}: {dataSpaceId: string}) =>
      ({dataSpaceId, name: '元数据正式空间'}))
    mocks.readRelations.mockResolvedValue([])
    installRows(rowsFor())
  })
  afterEach(() => {
    for (const session of metadataSessions.splice(0)) session.dispose()
    vi.restoreAllMocks()
  })

  it('consumes the saved designer configuration on each open and keeps existing runtimes independent', async () => {
    const saved = structuredClone(record(configuration))
    const models = record(record(saved['tables'])['Base_DataModel'])
    const views = record(models['views'])
    views['custom'] = {...record(views['default']), pageSize: 3}
    models['views'] = views
    saved['tables'] = {...record(saved['tables']), Base_DataModel: models}
    mocks.readConfiguration.mockImplementation(async () => JSON.stringify(saved))
    const first = await loadLowcodeDataSpaceMetadata('SPACE')
    try {
      expect(mocks.gateways).toHaveBeenCalledWith('APP-1')
      expect(first.scenarioId).toBe(DATA_SPACE_DESIGN_FORM_KEY)
      expect(first.getView('Base_DataModel', 'custom')?.pageSize).toBe(3)
      expect(first.getView('Base_DataModel', 'custom')?.queryContext).toMatchObject({dataSpaceId: 'SPACE'})
      views['custom'] = {...record(views['custom']), pageSize: 7}
      const reopened = await loadLowcodeDataSpaceMetadata('SPACE')
      try {
        expect(reopened.getView('Base_DataModel', 'custom')?.pageSize).toBe(7)
        expect(first.getView('Base_DataModel', 'custom')?.pageSize).toBe(3)
        expect(saveRequests()).toEqual([])
      } finally {reopened.destroy()}
    } finally {first.destroy()}
  })

  it.each([false, true])('edits its own saved metadata space through the native view editor and consumes it on reopen (unknown=%s)', async unknown => {
    const id = DATA_SPACE_DESIGN_FORM_KEY, stored = new Map([[id, JSON.stringify(configuration)]]), fileWrites: string[] = []
    let loseNext = unknown
    const rows = rowsFor(id)
    rows.set('Base_DataModel', Object.values(configTables()).flatMap(table => {
      const binding = record(table)['modelBinding']
      return binding ? [{rowid: record(binding)['modelId'], Name: record(binding)['modelName'], dataSetId: id,
        lingma_sys_key: 'metadata-model', lingma_sys_params: {r: [], e: [], h: [], m: [], d: false}}] : []
    }))
    rows.set('Base_DataModel_Relation', [])
    installRows(rows)
    mocks.readConfiguration.mockImplementation(async (target: string) => stored.get(target) ?? null)
    const gateways = {scenarioViews: {readScope: () => 'SCOPE-1', readText: mocks.readConfiguration,
      writeText: async (target: string, text: string) => {
        stored.set(target, text); fileWrites.push(target)
        if (loseNext) {loseNext = false; throw new Error('response lost after metadata configuration write')}
      }}, blueprint: {}}
    mocks.gateways.mockReturnValue(gateways)
    const open = async (target: string) => {
      const assertScope = () => {expect(record(mocks.scope())['token']).toBe('SCOPE-1')}
      const workspace = new ProjectWorkspace({projectId: 'APP-1', ...gateways})
      const service = new LowcodeDataSpaceViewDesign({workspace, assertScope, loadMetadata: loadLowcodeDataSpaceMetadata,
        readModel: async input => formalModel(input.modelName),
        assemble: ({scenarioId, config, fileExecutors, modelScope}) => loadScenarioDataSet({scenarioId, config, assertCurrent: assertScope,
          ...(fileExecutors ? {fileExecutors} : {}), ...(modelScope === undefined ? {} : {modelScope})})})
      const session = await service.openDesignSession(target, {deferDefinition: true})
      metadataSessions.push(session)
      return session
    }
    const wrappers: VueWrapper[] = [], runtimes: PageRuntime[] = []
    const attach = async (session: LowcodeDataSpaceDesignSession) => {
      const runtime = new PageRuntime({pageId: '/data-space-design', scenarioIds: [id], loadScenario: async () => session.metadataDataSet})
      await runtime.load(); runtimes.push(runtime)
      return runtime
    }
    const editorFor = async (session: LowcodeDataSpaceDesignSession, runtime: PageRuntime, tableName: string) => {
      const view = session.metadataDataSet.getView('DataViewDefinition')!
      const row = view.rows.find(row => row['tableName'] === tableName && row['viewId'] === 'default')!
      const model = record(configTables()[tableName]), binding = model['modelBinding']
      const wrapper = mount(defineComponent({setup() {
        useSparkComponent({type: 'self-describing-designer-test'}).sparkProvide(PAGE_RUNTIME, runtime)
        return () => h(DataSpaceViewEditor, {session, rowKey: view.getPkKey(row), revision: 0,
          ...(binding ? {modelId: String(record(binding)['modelId']), modelName: tableName}
            : {fileResource: {tableName, resourceId: String(model['resourceId'])}})})
      }}), {global: {plugins: [ElementPlus]}})
      wrappers.push(wrapper); await flushPromises()
      const section = wrapper.findAllComponents(RendererSection).find(item => item.props('title') === '其他请求配置与完整编辑')!
      await section.get('.renderer-section-toggle').trigger('click'); await flushPromises()
      const field = wrapper.findAllComponents(FieldNumber).find(item => item.props('field') === 'pageSize')!
      expect(field.props('modelValue')).toBeUndefined()
      const form = wrapper.findAllComponents(RendererForm).find(form => form.find('[data-property="pageSize"]').exists())!
      expect(form.props('dataViewKey')).toBe(`${id}@DataViewDefinition@default`)
      return {wrapper, input: field.get('input')}
    }
    try {
      const session = await open(id), runtime = await attach(session)
      expect(session.targetId).toBe(id); expect(session.metadataDataSet.scenarioId).toBe(id)
      const original = session.metadataDataSet.getView('Base_DataModel')!
      expect(original.pageSize).toBe(500)
      for (const [tableName, size] of [['Base_DataModel', 7], ['DataViewDefinition', 11]] as const) {
        const {wrapper, input} = await editorFor(session, runtime, tableName)
        if (tableName === 'Base_DataModel') {
          await input.setValue('9'); await flushPromises()
          await wrapper.get('[data-action="discard-view-edits"]').trigger('click'); await flushPromises()
          expect(fileWrites).toEqual([]); expect(input.element.value).toBe('500')
        }
        await input.setValue(String(size)); await flushPromises()
        await wrapper.get('[data-action="save-views"]').trigger('click'); await flushPromises()
        if (unknown && tableName === 'Base_DataModel') {
          expect(session.viewState?.saveStatus).toBe('unknown')
          expect(fileWrites).toEqual([id])
          await wrapper.get('[data-action="verify-views"]').trigger('click'); await flushPromises()
        }
        expect(session.metadataDataSet.getView('DataViewDefinition')!.hasEditingChanges(), wrapper.text()).toBe(false)
        expect(JSON.parse(stored.get(id)!).tables[tableName].views.default.pageSize).toBe(size)
        wrapper.unmount()
      }
      expect(original.pageSize).toBe(500)
      expect(session.metadataDataSet.getView('DataViewDefinition')!.pageSize).not.toBe(11)
      runtime.dispose(); session.dispose()
      const reopened = await open(id), nextRuntime = await attach(reopened)
      expect(reopened.metadataDataSet).not.toBe(session.metadataDataSet)
      expect(reopened.metadataDataSet.getView('Base_DataModel')!.pageSize).toBe(7)
      expect(reopened.metadataDataSet.getView('DataViewDefinition')!.pageSize).toBe(11)
      const second = await editorFor(reopened, nextRuntime, 'Base_DataModel')
      expect(second.input.element.value).toBe('7')
      expect(fileWrites).toEqual([id, id]); expect(saveRequests()).toEqual([])
      second.wrapper.unmount(); nextRuntime.dispose(); reopened.dispose()
      installRows(rowsFor('ANOTHER-TARGET'))
      const another = await open('ANOTHER-TARGET')
      expect(another.metadataDataSet.scenarioId).toBe(id)
      const modelView = another.metadataDataSet.getView('Base_DataModel')!
      expect(modelView.pageSize).toBe(7); expect(modelView.queryContext['dataSpaceId']).toBe('ANOTHER-TARGET')
      expect(modelView.rows).toHaveLength(25)
      expect(modelView.rows.every(row => row['dataSetId'] === 'ANOTHER-TARGET')).toBe(true)
      const calls = mocks.request.mock.calls.map(([request]) => request as RequestConfig)
      const request = calls.filter(request => {
        const tables = record(request.data)['Table']
        return Array.isArray(tables) && record(tables[0])['Name'] === 'Base_DataModel'
      }).at(-1)!
      expect(request.headers?.['x-FormKey']).toBe(id)
      expect(record(record(request.data)['PageParam'])['size']).toBe(7)
      const queriedTable = record((record(request.data)['Table'] as unknown[])[0])
      expect(wireConditions(queriedTable['Filter'])).toContainEqual(expect.objectContaining({Field: 'dataSetId',
        ValueFun: expect.objectContaining({Type: 'GetConstValue', Value: 'ANOTHER-TARGET'})}))
      expect([...stored.keys()]).toEqual([id])
      expect(fileWrites).toEqual([id, id])
    } finally {wrappers.forEach(wrapper => wrapper.unmount()); runtimes.forEach(runtime => runtime.dispose())}
  }, 30000)

  it.each(['missing', 'invalid', 'wrong-space', 'read-failed', 'scope-changed'])('rejects %s saved designer configuration without falling back or querying metadata rows', async kind => {
    mocks.readConfiguration.mockImplementation(async () => {
      if (kind === 'missing') return null
      if (kind === 'invalid') return '{'
      if (kind === 'read-failed') throw new Error('CONFIG_READ_FAILED')
      if (kind === 'scope-changed') mocks.scope.mockReturnValue({token: 'OTHER', headers: {'X-AppId': 'APP-2'}})
      return JSON.stringify({...record(configuration), ...(kind === 'wrong-space' ? {scenarioId: 'OTHER'} : {})})
    })
    await expect(loadLowcodeDataSpaceMetadata('SPACE')).rejects.toThrow()
    expect(mocks.readSpaceDefinition).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it.each(['missing', 'or-bypass', 'wrong-parameter'])('rejects %s target scope before issuing any overview query', async kind => {
    const saved = structuredClone(record(configuration)), tables = record(saved['tables'])
    const table = record(tables['Base_DataModel']), views = record(table['views']), view = record(views['default'])
    const filter = record(view['filterExpression'])
    if (kind === 'missing') delete view['filterExpression']
    else view['filterExpression'] = kind === 'or-bypass'
      ? {logic: 'or', filters: [filter, {field: 'Name', operator: 'eq', value: 'other'}]}
      : {...filter, value: {Type: 'GetInputParam', ParamName: 'anotherSpace'}}
    saved['tables'] = {...tables, Base_DataModel: {...table, views: {...views, default: view}}}
    mocks.readConfiguration.mockResolvedValue(JSON.stringify(saved))
    await expect(loadLowcodeDataSpaceMetadata('SPACE')).rejects.toThrow('DATA_SPACE_METADATA_FILTER')
    expect(mocks.request).not.toHaveBeenCalled()
  })

  it('loads the overview without querying field and source-relation directories', async () => {
    const execute = mocks.request.getMockImplementation()
    if (!execute) throw new Error('missing transport fixture')
    let release = () => {}
    const gate = new Promise<void>(resolve => {release = resolve})
    const started: string[] = []
    mocks.request.mockImplementation(async (config: RequestConfig) => {
      const entries = record(config.data)['Table']
      if (!Array.isArray(entries)) throw new Error('missing query table')
      const name = String(record(entries[0])['Name'])
      started.push(name)
      if (name === 'Base_DataSet') await gate
      return execute(config)
    })
    let delivered = false
    const pending = loadLowcodeDataSpaceMetadata('SPACE').then(dataSet => {delivered = true; return dataSet})
    try {
      await vi.waitFor(() => expect(started).toEqual(['Base_DataSet', 'Base_DataModel']))
      expect(delivered).toBe(false)
    } finally {
      release()
      const dataSet = await pending
      try {
        expect(tables.map(name => dataSet.getView(name, 'default')?.rows.length)).toEqual([1, 25, 0, 0])
        expect(dataSet.getView('Base_DataModel_Field')?.requestState).toBe(RequestState.Idle)
        expect(dataSet.getView('Base_DataModel_Relation')?.requestState).toBe(RequestState.Idle)
        const metadata = new LowcodeDataSpaceMetadata(dataSet, 'SPACE', () => {})
        await metadata.load(['Base_DataModel_Field'])
        expect(started).toEqual(['Base_DataSet', 'Base_DataModel', 'Base_DataModel_Field'])
        expect(dataSet.getView('Base_DataModel_Field')?.rows).toHaveLength(1)
        await metadata.load(['Base_DataModel_Field'])
        expect(started).toHaveLength(3)
      } finally {dataSet.destroy()}
    }
  })

  it.each(tables.flatMap(table => ['foreign', 'hidden'].map(fault => ({table, fault}))))(
    'rejects $fault $table results before metadata consumers observe them and retains the last confirmed query', async ({table, fault}) => {
      const dataSet = await loadLowcodeDataSpaceMetadata('SPACE')
      try {
        const metadata = new LowcodeDataSpaceMetadata(dataSet, 'SPACE', () => {})
        await metadata.load([table])
        const view = dataSet.getView(table)!, original = view.rows, rows = rowsFor()
        const field = table === 'Base_DataSet' ? 'rowid' : 'dataSetId'
        const invalid = rows.get(table)![0]!
        if (fault === 'foreign') invalid[field] = 'FOREIGN'
        else invalid['lingma_sys_params'] = {r: [], e: [], h: [field], m: [], d: false}
        installRows(rows)
        const observed = vi.fn()
        view.events.on('rowsChanged', observed)
        await expect(view.loadFromServer({allPages: true})).rejects.toThrow()
        expect(observed).not.toHaveBeenCalled()
        expect(view.rows).toBe(original)
        expect(view.requestState).toBe(RequestState.Failed)
        expect(view.loadingError).toBeInstanceOf(Error)
        installRows(rowsFor())
        await metadata.load([table])
        expect(view.requestState).toBe(RequestState.Loaded)
        expect(view.loadingError).toBeNull()
        expect(view.rows).not.toBe(original)
        expect(observed).toHaveBeenCalledTimes(1)
        expect(saveRequests()).toEqual([])
      } finally {dataSet.destroy()}
    })

  it.each(['Base_DataModel_Field', 'Base_DataModel_Relation'] as const)(
    'rejects the first foreign %s response before publishing rows instead of publishing and clearing them', async table => {
      const dataSet = await loadLowcodeDataSpaceMetadata('SPACE')
      try {
        const metadata = new LowcodeDataSpaceMetadata(dataSet, 'SPACE', () => {}), view = dataSet.getView(table)!
        const rows = rowsFor(); rows.get(table)![0]!['dataSetId'] = 'FOREIGN'; installRows(rows)
        const observed = vi.fn(); view.events.on('rowsChanged', observed)
        await expect(metadata.load([table])).rejects.toThrow('DATA_SPACE_METADATA_SCOPE')
        expect(observed).not.toHaveBeenCalled()
        expect(view.rows).toEqual([])
        expect(view.requestState).toBe(RequestState.Failed)
        expect(view.loadingError?.message).toContain('DATA_SPACE_METADATA_SCOPE')
        expect(dataSet.getView('Base_DataModel')?.rows).toHaveLength(25)
        expect(saveRequests()).toEqual([])
      } finally {dataSet.destroy()}
    })

  it('does not let a rejected foreign metadata owner replace the active query validator', async () => {
    const dataSet = await loadLowcodeDataSpaceMetadata('SPACE')
    try {
      const view = dataSet.getView('Base_DataModel')!, guard = view.validateQueryResult
      await expect(new LowcodeDataSpaceMetadata(dataSet, 'FOREIGN', () => {}).load(['Base_DataModel'])).rejects.toThrow('DATA_SPACE_METADATA_SCOPE')
      expect(view.validateQueryResult).toBe(guard)
      expect((await view.loadFromServer({allPages: true})).success).toBe(true)
      expect(view.rows).toHaveLength(25)
    } finally {dataSet.destroy()}
  })

  it('allows a paged default model query and loads the full directory only when requested', async () => {
    const dataSet = await loadLowcodeDataSpaceMetadata('SPACE')
    try {
      const view = dataSet.getView('Base_DataModel')!
      expect((await view.loadFromServer({allPages: false, page: 1, pageSize: 5})).success).toBe(true)
      expect(view.rows).toHaveLength(5); expect(view.total).toBe(25)
      expect(view.requestState).toBe(RequestState.Loaded)
      await new LowcodeDataSpaceMetadata(dataSet, 'SPACE', () => {}).load(['Base_DataModel'])
      expect(view.rows).toHaveLength(25); expect(view.requestState).toBe(RequestState.Loaded)
    } finally {dataSet.destroy()}
  })

  it('does not impose complete-directory semantics on a separately configured named view', async () => {
    const saved = structuredClone(record(configuration)), tables = record(saved['tables'])
    const model = record(tables['Base_DataModel']), views = record(model['views'])
    views['pagedModels'] = {...record(views['default']), pageSize: 3}
    model['views'] = views; tables['Base_DataModel'] = model; saved['tables'] = tables
    mocks.readConfiguration.mockResolvedValue(JSON.stringify(saved))
    const dataSet = await loadLowcodeDataSpaceMetadata('SPACE')
    try {
      const view = dataSet.getView('Base_DataModel', 'pagedModels')!
      expect(view.validateQueryResult).toBeUndefined()
      expect((await view.loadFromServer({allPages: false})).success).toBe(true)
      expect(view.rows).toHaveLength(3); expect(view.total).toBe(25)
      expect(dataSet.getView('Base_DataModel')?.rows).toHaveLength(25)
    } finally {dataSet.destroy()}
  })

  it.each(['and', 'or'])('keeps explicit nested %s target filters in the saved view and query', async logic => {
    const saved = structuredClone(record(configuration)), tables = record(saved['tables'])
    const table = record(tables['Base_DataModel']), views = record(table['views']), view = record(views['default'])
    const scope = record(view['filterExpression'])
    const narrowed = {logic: 'and', filters: [scope, {field: 'Name', operator: 'ne', value: 'excluded'}]}
    const filter = {logic, filters: [narrowed, scope]}
    saved['tables'] = {...tables, Base_DataModel: {...table, views: {...views, default: {...view, filterExpression: filter}}}}
    mocks.readConfiguration.mockResolvedValue(JSON.stringify(saved))
    const dataSet = await loadLowcodeDataSpaceMetadata('SPACE')
    try {
      expect(dataSet.getView('Base_DataModel')?.filterExpression).toEqual(filter)
      const requests = mocks.request.mock.calls.map(([config]) => record(config))
      expect(requests).toHaveLength(2)
      expect(JSON.stringify(requests[1]?.['data'])).toContain('excluded')
      expect(saveRequests()).toEqual([])
    } finally {dataSet.destroy()}
  })

  it('validates deferred target filters only when that directory is requested and retains the overview', async () => {
    const dataSet = await loadLowcodeDataSpaceMetadata('SPACE')
    try {
      const view = dataSet.getView('Base_DataModel_Field')
      if (!view) throw new Error('missing fields view')
      view.filterExpression = undefined
      const count = mocks.request.mock.calls.length
      await expect(new LowcodeDataSpaceMetadata(dataSet, 'SPACE', () => {}).load(['Base_DataModel_Field']))
        .rejects.toThrow('DATA_SPACE_METADATA_FILTER')
      expect(mocks.request).toHaveBeenCalledTimes(count)
      expect(dataSet.getView('Base_DataModel')?.rows).toHaveLength(25)
      expect(dataSet.destroyed).toBe(false)
    } finally {dataSet.destroy()}
  })

  it.each(['query-failure', 'stale-scope'])('drains outstanding metadata reads before disposal on %s', async failure => {
    const execute = mocks.request.getMockImplementation()
    if (!execute) throw new Error('missing transport fixture')
    let release = () => {}
    const gate = new Promise<void>(resolve => {release = resolve})
    const started: string[] = []
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    mocks.request.mockImplementation(async (config: RequestConfig) => {
      const entries = record(config.data)['Table']
      if (!Array.isArray(entries)) throw new Error('missing query table')
      const name = String(record(entries[0])['Name'])
      started.push(name)
      if (name === 'Base_DataSet' && failure === 'query-failure') throw new Error('space query failed')
      if (name === 'Base_DataModel') await gate
      return execute(config)
    })
    let settled = false
    const pending = loadLowcodeDataSpaceMetadata('SPACE').then(
      dataSet => {settled = true; dataSet.destroy(); return null},
      (error: unknown) => {settled = true; return error})
    try {
      await vi.waitFor(() => expect(started).toEqual(['Base_DataSet', 'Base_DataModel']))
      if (failure === 'stale-scope') mocks.scope.mockReturnValue({token: 'SCOPE-2', headers: {'X-AppId': 'APP-2'}})
      expect(settled).toBe(false)
      expect(destroy).not.toHaveBeenCalled()
    } finally {release(); await pending}
    expect(await pending).toBeInstanceOf(Error)
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(saveRequests()).toEqual([])
  })

  it('keeps the overview after a deferred failure and shares a field retry without loading source relations', async () => {
    const dataSet = await loadLowcodeDataSpaceMetadata('SPACE')
    const metadata = new LowcodeDataSpaceMetadata(dataSet, 'SPACE', () => {})
    const execute = mocks.request.getMockImplementation()!
    let failed = true, calls = 0, release = () => {}
    const gate = new Promise<void>(resolve => {release = resolve})
    mocks.request.mockImplementation(async config => {
      calls++
      if (failed) throw new Error('field source unavailable')
      await gate
      return execute(config)
    })
    try {
      await expect(metadata.load(['Base_DataModel_Field'])).rejects.toThrow('field source unavailable')
      expect(dataSet.destroyed).toBe(false)
      expect(dataSet.getView('Base_DataModel')?.rows).toHaveLength(25)
      failed = false
      const first = metadata.load(['Base_DataModel_Field'])
      const second = metadata.load(['Base_DataModel_Field'])
      await vi.waitFor(() => expect(calls).toBe(2))
      release(); await Promise.all([first, second])
      expect(calls).toBe(2)
      expect(dataSet.getView('Base_DataModel_Field')?.rows).toHaveLength(1)
      expect(dataSet.getView('Base_DataModel_Relation')?.requestState).toBe(RequestState.Idle)
    } finally {release(); dataSet.destroy()}
  })

  it.each(['target', 'dispose'])('rejects a deferred response after %s changes', async change => {
    const dataSet = await loadLowcodeDataSpaceMetadata('SPACE')
    const metadata = new LowcodeDataSpaceMetadata(dataSet, 'SPACE', () => {})
    const fields = dataSet.getView('Base_DataModel_Field')!
    const execute = mocks.request.getMockImplementation()!
    let release = () => {}, started = false
    const gate = new Promise<void>(resolve => {release = resolve})
    mocks.request.mockImplementation(async config => {started = true; await gate; return execute(config)})
    const pending = expect(metadata.load(['Base_DataModel_Field'])).rejects.toThrow()
    try {
      await vi.waitFor(() => expect(started).toBe(true))
      if (change === 'target') fields.queryContext = {dataSpaceId: 'OTHER'}
      else dataSet.destroy()
      release(); await pending
      expect(fields.rows).toEqual([])
      expect(saveRequests()).toEqual([])
    } finally {release(); dataSet.destroy()}
  })

  it('persists declarations through the native metadata session and reopens without target pagedata', async () => {
    const {rows, space, raw} = declarationRows()
    const sourceReference = JSON.stringify({Type: 'GetInputParam', ParamName: 'customer'})
    const field = rows.get('Base_DataModel_Field')?.[0]
    if (!field) throw new Error('missing source input fixture')
    field['type'] = 'inputParams'
    field['ValueFun'] = sourceReference
    installRows(rows)
    const {session, view} = await openMetadataSession()
    const independent = await openMetadataSession()
    expect(session.viewState).toBeNull()
    expect(session.definitionDataSet).toBeNull()
    expect(session.metadataDataSet.scenarioId).toBe(DATA_SPACE_DESIGN_FORM_KEY)
    expect(view.queryContext).toEqual({dataSpaceId: 'SPACE'})
    expect(view.rows[0]?.['inputParams']).toBe(raw)
    expect(view.rows[0]).not.toHaveProperty('lingma_sys_key')
    expect(view.fieldAccess(view.rows[0]!, 'inputParams').write).toBe('allowed')
    view.updateEditingValue('SPACE', 'inputParams', '[]')
    expect(view.rows[0]?.['inputParams']).toBe(raw)
    view.discardPendingChanges(['SPACE'])
    expect(view.getEditingPatch('SPACE')).toBeUndefined()
    expect(saveRequests()).toEqual([])

    const next = JSON.stringify([{rowid: 'P1', Name: 'client', Description: '客户', IsBusParam: true, extra: 7},
      {rowid: 'P2', Name: 'enabled', Description: '', IsBusParam: false}])
    session.stageInputParameters({expectedValue: raw, value: next})
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'Base_DataSet', viewId: 'default', ids: ['SPACE']}]}))
      .resolves.toMatchObject({success: true, data: {savedCount: 1, failedCount: 0, failedEditingRows: 0}})
    expect(space['inputParams']).toBe(next)
    expect(saveRequests()).toHaveLength(1)
    expect(view.getEditingPatch('SPACE')).toBeUndefined()
    expect((await view.loadFromServer({allPages: true})).success).toBe(true)
    expect(view.rows).toEqual([{rowid: 'SPACE', _pk: 'SPACE', inputParams: next}])
    expect(independent.view.rows[0]?.['inputParams']).toBe(raw)
    expect(independent.view.queryContext).toEqual({dataSpaceId: 'SPACE'})
    session.dispose()
    const fresh = await openMetadataSession()
    expect(fresh.view).not.toBe(view)
    expect(fresh.view.rows).toEqual([{rowid: 'SPACE', _pk: 'SPACE', inputParams: next}])
    expect(fresh.session.metadataDataSet.scenarioId).toBe(DATA_SPACE_DESIGN_FORM_KEY)
    expect(fresh.view.queryContext).toEqual({dataSpaceId: 'SPACE'})
    expect(field['ValueFun']).toBe(sourceReference)
    expect(fresh.session.metadataDataSet.getView('Base_DataModel_Field', 'default')?.rows[0]?.['ValueFun']).toBe(sourceReference)
    expect(saveRequests()).toHaveLength(1)
  })

  it('inspects edited declaration references using formal model IDs and independent named-view contexts without writing', async () => {
    const {rows, raw} = declarationRows()
    const field = rows.get('Base_DataModel_Field')?.[0]
    if (!field) throw new Error('missing source field')
    field['type'] = 'inputParams'
    field['ValueFun'] = JSON.stringify({Type: 'GetInputParam', ParamName: 'customer'})
    rows.set('Base_DataModel_Relation', [])
    installRows(rows)
    const {session} = await openMetadataSession()
    const views = session.metadataDataSet.getView('DataViewDefinition', 'default')
    if (!views) throw new Error('missing view definitions')
    views.replaceRows([
      {dataSetId: 'SPACE', dataModelId: 'MODEL-0', tableName: 'alias', viewId: 'first', queryContext: {customer: 0}},
      {dataSetId: 'SPACE', dataModelId: 'MODEL-0', tableName: 'alias', viewId: 'second', queryContext: {},
        filterExpression: {logic: 'and', filters: [
          {field: 'id', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'external'}},
          {field: 'id', operator: 'eq', value: {Type: 'GetConstValue', Value: {Type: 'GetInputParam', ParamName: 'literal'}}},
        ]}},
    ])
    session.stageInputParameters({expectedValue: raw, value: [{rowid: 'P1', Name: 'client'}]})
    const count = mocks.request.mock.calls.length
    const inspected = session.inspectInputParameters()
    expect(inspected.issues).toEqual([])
    expect(inspected.complete).toBe(true)
    expect(inspected.references).toHaveLength(2)
    expect(inspected.references).toEqual(expect.arrayContaining([
      expect.objectContaining({kind: 'source-input', recordId: 'FIELD-1', modelId: 'MODEL-0', parameterName: 'customer',
        declared: false, removedByEdit: true, contexts: [
          {tableName: 'alias', viewId: 'first', configured: true}, {tableName: 'alias', viewId: 'second', configured: false},
        ]}),
      expect.objectContaining({kind: 'view-filter', parameterName: 'external', declared: false, removedByEdit: false,
        contexts: [{tableName: 'alias', viewId: 'second', configured: false}]}),
    ]))
    expect(JSON.stringify(inspected)).not.toContain('literal')
    expect(mocks.request.mock.calls).toHaveLength(count)
    expect(field['ValueFun']).toBe(JSON.stringify({Type: 'GetInputParam', ParamName: 'customer'}))
    expect(saveRequests()).toEqual([])
    await session.saveInputParameters({expectedValue: raw})
    const fresh = await openMetadataSession()
    expect(fresh.session.inspectInputParameters().references).toEqual([
      expect.objectContaining({kind: 'source-input', parameterName: 'customer', declared: false, removedByEdit: false}),
    ])
    expect(field['ValueFun']).toBe(JSON.stringify({Type: 'GetInputParam', ParamName: 'customer'}))
    expect(saveRequests()).toHaveLength(1)
  })

  it('checks native parameter references independently of retained legacy records', async () => {
    const {rows} = declarationRows()
    rows.set('Base_DataModel_Field', [])
    installRows(rows)
    const {session} = await openMetadataSession()
    const inspector = new LowcodeDataSpaceInputParameterReferences(session.metadataDataSet, 'SPACE')
    expect(inspector.inspect(null).complete).toBe(false)
    const config = new ScenarioViewConfig('SPACE', JSON.stringify({scenarioId: 'SPACE', schemaVersion: 2,
      tables: {}, resourceRelations: []}))
    expect(inspector.inspect(config)).toEqual({complete: true, references: [], issues: []})
    expect(session.metadataDataSet.getView('Base_DataModel_Relation')?.rows).toHaveLength(1)
    expect(saveRequests()).toEqual([])
  })

  it('inspects projected relation expressions and current view drafts while distinguishing unresolved database relations', async () => {
    const {rows} = declarationRows()
    rows.set('Base_DataModel_Field', [])
    installRows(rows)
    const {session} = await openMetadataSession()
    expect(session.inspectInputParameters()).toMatchObject({complete: false,
      issues: [expect.stringContaining('REL-1')]})
    const views = session.metadataDataSet.getView('DataViewDefinition', 'default')
    const relations = session.metadataDataSet.getView('DataResourceRelationDefinition', 'default')
    if (!views || !relations) throw new Error('missing definition views')
    await views.addRow({dataSetId: 'SPACE', dataModelId: 'MODEL-0', tableName: 'alias', viewId: 'detail', queryContext: {customer: null}})
    await views.addRow({dataSetId: 'SPACE', dataModelId: 'MODEL-1', tableName: 'other', viewId: 'detail', queryContext: {customer: true}})
    await relations.addRow({definitionKey: 'relation', dataSetId: 'SPACE', sourceRelationId: 'REL-1',
      parentTable: 'other', childTable: 'alias', filterExpression: {logic: 'or', filters: [
        {field: 'name', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'customer'}},
        {field: 'name', operator: 'eq', value: {Type: 'GetConstValue', Value: 'unchanged'}},
      ]}})
    expect(session.inspectInputParameters()).toMatchObject({complete: true, issues: [], references: [
      {kind: 'model-relation', modelId: 'MODEL-0', recordId: 'relation', path: 'filterExpression.filters[0].value',
        parameterName: 'customer', declared: true, removedByEdit: false,
        contexts: [{tableName: 'alias', viewId: 'detail', configured: true}]},
    ]})
    const key = views.getPkKey(views.rows[0]!)
    if (key === undefined) throw new Error('missing local definition key')
    views.updateEditingValue(key, 'queryContext', {})
    expect(session.inspectInputParameters().references[0]?.contexts).toEqual([
      {tableName: 'alias', viewId: 'detail', configured: false},
    ])
    expect(views.rows[0]?.['queryContext']).toEqual({customer: null})
    expect(views.getEditingPatch(key)).toEqual({queryContext: {}})
    expect(saveRequests()).toEqual([])
  })

  it('does not interpret SystemData or constant payloads as parameter references and preserves exact parameter spelling', async () => {
    const {rows} = declarationRows()
    const field = rows.get('Base_DataModel_Field')?.[0]
    if (!field) throw new Error('missing source field')
    field['type'] = 'inputParams'
    field['ValueFun'] = JSON.stringify({Type: 'SystemData', Name: 'customer'})
    rows.set('Base_DataModel_Relation', [])
    installRows(rows)
    const {session} = await openMetadataSession()
    const view = session.metadataDataSet.getView('Base_DataModel_Field', 'default')
    if (!view) throw new Error('missing source view')
    expect(session.inspectInputParameters().references).toEqual([])
    view.updateEditingValue('FIELD-1', 'ValueFun', JSON.stringify({Type: 'GetConstValue',
      Value: {Type: 'GetInputParam', ParamName: 'customer'}}))
    expect(session.inspectInputParameters()).toMatchObject({complete: true, references: []})
    view.updateEditingValue('FIELD-1', 'ValueFun', JSON.stringify({Type: 'GetInputParam', ParamName: ' customer '}))
    expect(session.inspectInputParameters().references).toEqual([
      expect.objectContaining({parameterName: ' customer ', declared: false, removedByEdit: false}),
    ])
    expect(JSON.parse(String(field['ValueFun']))).toEqual({Type: 'SystemData', Name: 'customer'})
    expect(saveRequests()).toEqual([])
  })

  it('does not inspect a stale target query or a disposed session as current', async () => {
    const {rows} = declarationRows()
    installRows(rows)
    const {session, view} = await openMetadataSession()
    view.queryContext = {dataSpaceId: 'OTHER'}
    expect(session.inspectInputParameters()).toMatchObject({complete: false, references: []})
    session.dispose()
    expect(() => session.inspectInputParameters()).toThrow('DISPOSED')
    expect(saveRequests()).toEqual([])
  })

  it.each(['hidden', 'broken', 'foreign-model'])('reports incomplete %s source inspection without leaking or rewriting the source', async failure => {
    const {rows} = declarationRows()
    const field = rows.get('Base_DataModel_Field')?.[0]
    if (!field) throw new Error('missing source field')
    field['type'] = 'inputParams'
    field['ValueFun'] = failure === 'broken' ? '{broken SECRET' : JSON.stringify({Type: 'GetInputParam', ParamName: 'SECRET'})
    if (failure === 'hidden') field['lingma_sys_params'] = {r: [], e: [], h: ['ValueFun']}
    if (failure === 'foreign-model') field['dataModelId'] = 'MODEL-OUTSIDE'
    rows.set('Base_DataModel_Relation', [])
    const before = JSON.stringify(field)
    installRows(rows)
    const {session} = await openMetadataSession()
    const result = session.inspectInputParameters()
    expect(result.complete).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.references).toEqual([])
    expect(JSON.stringify(result)).not.toContain('SECRET')
    expect(JSON.stringify(field)).toBe(before)
    expect(saveRequests()).toEqual([])
  })

  it('keeps declaration draft and database refresh separate from the file session refresh', async () => {
    const {rows, raw, space} = declarationRows()
    installRows(rows)
    const {session, view} = await openMetadataSession()
    view.updateEditingValue('SPACE', 'inputParams', '[]')
    const requestCount = mocks.request.mock.calls.length
    space['inputParams'] = '[{"rowid":"REMOTE","Name":"remote"}]'
    await session.refresh()
    expect(mocks.request.mock.calls).toHaveLength(requestCount)
    expect(view.rows[0]?.['inputParams']).toBe(raw)
    expect(view.getEditingPatch('SPACE')).toEqual({inputParams: '[]'})
    view.discardPendingChanges(['SPACE'])
    await view.loadFromServer({allPages: true})
    expect(view.rows[0]?.['inputParams']).toBe(space['inputParams'])
    expect(saveRequests()).toEqual([])
  })

  it('submits staged declarations with the shared edit owner, verifies the target and preserves a fresh-session result', async () => {
    const {rows, raw, space} = declarationRows()
    installRows(rows)
    const {session, view} = await openMetadataSession()
    session.stageInputParameters({expectedValue: raw, value: []})
    await expect(session.saveInputParameters({expectedValue: raw})).resolves.toEqual([])
    expect(session.getInputParameterState()).toMatchObject({status: 'idle', pending: false})
    expect(view.rows[0]?.['inputParams']).toBe('[]')
    expect(space['inputParams']).toBe('[]')
    expect(saveRequests()).toHaveLength(1)
    const fresh = await openMetadataSession()
    expect(fresh.view.rows[0]?.['inputParams']).toBe('[]')
  })

  it.each(['during-write', 'after-receipt'])('verifies a declaration save without replacing later edits created %s', async timing => {
    const {rows, raw, space} = declarationRows()
    installRows(rows)
    const {session, view} = await openMetadataSession()
    const table = view.dataTable!
    const initialViews = [...table.viewList]
    const later = '[{"Name":"later","Description":"keep this draft"}]'
    const editLater = () => view.updateEditingValue('SPACE', 'inputParams', later)
    const execute = mocks.request.getMockImplementation()!
    mocks.request.mockImplementation(async (config: RequestConfig) => {
      const result = await execute(config)
      if (timing === 'during-write' && config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') editLater()
      return result
    })
    session.stageInputParameters({expectedValue: raw, value: []})
    const readsBefore = mocks.request.mock.calls.filter(([request]) => request.url === '/api/DataOperation/GetData').length
    await expect(session.saveInputParameters({expectedValue: raw, ...(timing === 'after-receipt' ? {onReceipt: editLater} : {})})).resolves.toEqual([])
    expect(session.getInputParameterState()).toEqual({status: 'idle', pending: true})
    expect(view.rows[0]?.['inputParams']).toBe('[]')
    expect(view.getEditingPatch('SPACE')).toEqual({inputParams: later})
    expect(space['inputParams']).toBe('[]')
    expect(saveRequests()).toHaveLength(1)
    expect(mocks.request.mock.calls.filter(([request]) => request.url === '/api/DataOperation/GetData')).toHaveLength(readsBefore + 1)
    expect(table.viewList).toEqual(initialViews)
    view.discardPendingChanges(['SPACE'])
    expect(view.getEditingRow('SPACE')?.['inputParams']).toBe('[]')
    expect(session.getInputParameterState()).toEqual({status: 'idle', pending: false})
    expect((await openMetadataSession()).view.rows[0]?.['inputParams']).toBe('[]')
  })

  it.each(['lost-response', 'server-rejection'])('holds a %s result for native verification before any replay', async failure => {
    const {rows, raw, space} = declarationRows()
    installRows(rows, {loseSaveResponse: failure === 'lost-response', rejectSave: failure === 'server-rejection'})
    const {session, view} = await openMetadataSession()
    session.stageInputParameters({expectedValue: raw, value: []})
    await expect(session.saveInputParameters({expectedValue: raw})).rejects.toThrow(/response lost|server rejected/)
    expect(session.getInputParameterState()).toMatchObject({status: failure === 'lost-response' ? 'unknown' : 'unsubmitted', pending: true})
    await expect(session.saveInputParameters({expectedValue: raw})).rejects.toThrow(/核验|PENDING/)
    if (failure === 'lost-response') await expect(session.reloadInputParameters({discardPending: false})).resolves.toEqual([])
    else await expect(session.reloadInputParameters({discardPending: false})).rejects.toThrow('DATA_SPACE_INPUT_PARAMETERS_PENDING')
    expect(saveRequests()).toHaveLength(1)
    expect(view.getEditingRow('SPACE')?.['inputParams']).toBe('[]')
    await session.reloadInputParameters({discardPending: true})
    expect(session.getInputParameterState()).toMatchObject({status: 'idle', pending: false})
    expect(view.rows[0]?.['inputParams']).toBe(failure === 'lost-response' ? '[]' : raw)
    expect(space['inputParams']).toBe(view.rows[0]?.['inputParams'])
    expect(saveRequests()).toHaveLength(1)
  })

  it.each(['wrong-input', 'stale-original', 'other-field'])('refuses %s at submit time and retains the edit without issuing a save', async failure => {
    const {rows, raw} = declarationRows()
    installRows(rows)
    const {session, view} = await openMetadataSession()
    session.stageInputParameters({expectedValue: raw, value: []})
    if (failure === 'wrong-input') view.queryContext = {dataSpaceId: 'OTHER'}
    if (failure === 'other-field') view.updateEditingValue('SPACE', 'description', 'other edit')
    const patch = view.getEditingPatch('SPACE')
    await expect(session.saveInputParameters({expectedValue: failure === 'stale-original' ? '[]' : raw}))
      .rejects.toThrow(/DATA_SPACE_INPUT_PARAMETERS/)
    expect(view.getEditingPatch('SPACE')).toEqual(patch)
    expect(saveRequests()).toEqual([])
  })

  it('rechecks the scope after applying editing rows and before sending a write', async () => {
    const {rows, raw} = declarationRows()
    installRows(rows)
    const {session, view} = await openMetadataSession()
    session.stageInputParameters({expectedValue: raw, value: []})
    const apply = view.applyEditingRows.bind(view)
    vi.spyOn(view, 'applyEditingRows').mockImplementation(async ids => {
      const result = await apply(ids)
      mocks.scope.mockReturnValue({token: 'CHANGED', headers: {'X-AppId': 'APP-2'}})
      return result
    })
    await expect(session.saveInputParameters({expectedValue: raw})).rejects.toThrow(/STALE_SCOPE/)
    expect(session.getInputParameterState().status).toBe('unsubmitted')
    expect(saveRequests()).toEqual([])
  })

  it('reloads the original declaration view directly through SPARK data', async () => {
    const {rows} = declarationRows()
    installRows(rows)
    const {session, view} = await openMetadataSession()
    const before = mocks.request.mock.calls.length
    await session.reloadInputParameters({discardPending: false})
    expect(mocks.request.mock.calls).toHaveLength(before + 1)
    expect(session.getInputParameterState().status).toBe('idle')
    expect(view.rows).toHaveLength(1)
    expect(saveRequests()).toEqual([])
  })

  it.each(['read-only', 'hidden'])('checks %s permissions at submit time even if another caller wrote the edit overlay', async failure => {
    const {rows, space, raw} = declarationRows()
    space['lingma_sys_params'] = failure === 'read-only' ? {r: [], e: [], h: []} : {r: [], e: ['inputParams'], h: ['inputParams']}
    installRows(rows)
    const {session, view} = await openMetadataSession()
    view.updateEditingValue('SPACE', 'inputParams', '[]')
    await expect(session.saveInputParameters({expectedValue: raw})).rejects.toThrow(/读写权限/)
    expect(view.getEditingPatch('SPACE')).toEqual({inputParams: '[]'})
    expect(session.getInputParameterState().status).toBe('idle')
    expect(saveRequests()).toEqual([])
  })

  it.each(['failed-read', 'mismatched-value', 'unreadable-value'])('retains confirmed-write recovery for %s without replaying', async failure => {
    const {rows, raw, space} = declarationRows()
    installRows(rows)
    const execute = mocks.request.getMockImplementation()
    if (!execute) throw new Error('missing transport fixture')
    let failNextRead = false
    mocks.request.mockImplementation(async (config: RequestConfig) => {
      if (failNextRead && config.url === '/api/DataOperation/GetData') {
        failNextRead = false
        throw new Error('readback unavailable')
      }
      const result = await execute(config)
      if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') {
        failNextRead = failure === 'failed-read'
        if (failure === 'mismatched-value') space['inputParams'] = raw
        if (failure === 'unreadable-value') space['lingma_sys_params'] = {r: [], e: [], h: ['inputParams']}
      }
      return result
    })
    const {session, view} = await openMetadataSession()
    session.stageInputParameters({expectedValue: raw, value: []})
    const initialViews = [...view.dataTable!.viewList]
    await expect(session.saveInputParameters({expectedValue: raw})).rejects.toThrow(/readback unavailable|回读值|读写权限/)
    expect(view.dataTable!.viewList).toEqual(initialViews)
    expect(session.getInputParameterState()).toMatchObject({status: 'readback', pending: false})
    await expect(session.saveInputParameters({expectedValue: raw})).rejects.toThrow(/核验/)
    space['lingma_sys_params'] = {r: [], e: [], h: []}
    await session.reloadInputParameters({discardPending: false})
    expect(view.rows[0]?.['inputParams']).toBe(failure === 'mismatched-value' ? raw : '[]')
    expect(session.getInputParameterState()).toMatchObject({status: 'idle', pending: false})
    expect(saveRequests()).toHaveLength(1)
  })

  it('rejects a scope change during declaration verification and releases the temporary query without replacing later edits', async () => {
    const {rows, raw} = declarationRows()
    installRows(rows)
    const {session, view} = await openMetadataSession()
    const initialViews = [...view.dataTable!.viewList]
    const execute = mocks.request.getMockImplementation()!
    let verifying = false
    mocks.request.mockImplementation(async (config: RequestConfig) => {
      const result = await execute(config)
      if (verifying && config.url === '/api/DataOperation/GetData') view.queryContext = {dataSpaceId: 'OTHER'}
      return result
    })
    session.stageInputParameters({expectedValue: raw, value: []})
    await expect(session.saveInputParameters({expectedValue: raw, onReceipt: () => {
      view.updateEditingValue('SPACE', 'inputParams', '[{"Name":"later"}]'); verifying = true
    }})).rejects.toThrow(/CONTEXT/)
    expect(session.getInputParameterState()).toEqual({status: 'readback', pending: true})
    expect(view.getEditingPatch('SPACE')).toEqual({inputParams: '[{"Name":"later"}]'})
    expect(view.dataTable!.viewList).toEqual(initialViews)
    expect(saveRequests()).toHaveLength(1)
  })

  it('locks one declaration submission while allowing an independent session to retain its own values', async () => {
    const {rows, raw} = declarationRows()
    installRows(rows)
    const {session} = await openMetadataSession()
    const other = await openMetadataSession()
    const execute = mocks.request.getMockImplementation()
    if (!execute) throw new Error('missing transport fixture')
    let release = () => {}
    const gate = new Promise<void>(resolve => {release = resolve})
    mocks.request.mockImplementation(async (config: RequestConfig) => {
      if (config.url === '/api/DataOperation/BatchTableOperateRequestByCRUD') await gate
      return execute(config)
    })
    session.stageInputParameters({expectedValue: raw, value: []})
    const save = session.saveInputParameters({expectedValue: raw})
    await vi.waitFor(() => expect(saveRequests()).toHaveLength(1))
    expect(session.getInputParameterState().status).toBe('pending')
    await expect(session.saveInputParameters({expectedValue: raw})).rejects.toThrow(/核验/)
    await expect(session.reloadInputParameters({discardPending: true})).rejects.toThrow(/进行/)
    expect(() => session.stageInputParameters({expectedValue: raw, value: []})).toThrow(/核验/)
    expect(other.view.rows[0]?.['inputParams']).toBe(raw)
    release()
    await save
    expect(saveRequests()).toHaveLength(1)
  })

  it('stages normalized declarations through the shared contract and preserves the draft on invalid input', async () => {
    const {rows, raw} = declarationRows()
    installRows(rows)
    const {session, view} = await openMetadataSession()
    session.stageInputParameters({expectedValue: raw, value: [{rowid: 'P1', Name: ' client ', IsBusParam: true, extra: 7}]})
    const expected = JSON.stringify([{rowid: 'P1', Name: 'client', IsBusParam: true, extra: 7, Description: ''}])
    expect(view.getEditingPatch('SPACE')).toEqual({inputParams: expected})
    expect(view.rows[0]?.['inputParams']).toBe(raw)
    expect(() => session.stageInputParameters({expectedValue: raw,
      value: [{rowid: 'P1', Name: 'same'}, {rowid: 'P2', Name: ' same '}]})).toThrow(/名称重复/)
    expect(view.getEditingPatch('SPACE')).toEqual({inputParams: expected})
    expect(() => session.stageInputParameters({expectedValue: '[]', value: []})).toThrow(/原文|变化/)
    session.stageInputParameters({expectedValue: raw, value: raw})
    expect(view.getEditingPatch('SPACE')).toBeUndefined()
    expect(saveRequests()).toEqual([])
  })

  it.each(['read-only', 'hidden', 'wrong-input', 'pending-save', 'stale-scope'])(
    'rejects declaration staging before any edit or request for %s', async failure => {
      const {rows, space, raw} = declarationRows()
      if (failure === 'read-only') space['lingma_sys_params'] = {e: [], r: []}
      if (failure === 'hidden') space['lingma_sys_params'] = {e: ['inputParams'], h: ['inputParams'], r: []}
      installRows(rows)
      const {session, view} = await openMetadataSession()
      if (failure === 'wrong-input') view.queryContext = {dataSpaceId: 'OTHER'}
      if (failure === 'pending-save') {view.updateEditingValue('SPACE', 'inputParams', '[]'); await view.applyEditingRows(['SPACE'])}
      const pending = view.getEditingPatch('SPACE')
      const count = mocks.request.mock.calls.length
      if (failure === 'stale-scope') mocks.scope.mockReturnValue({token: 'CHANGED', headers: {'X-AppId': 'APP-2'}})
      expect(() => session.stageInputParameters({expectedValue: raw, value: [{rowid: 'P2', Name: 'new'}]}))
        .toThrow(failure === 'stale-scope' ? /STALE_SCOPE/ : /DATA_SPACE_INPUT_PARAMETERS/)
      expect(mocks.request.mock.calls).toHaveLength(count)
      expect(space['inputParams']).toBe(raw)
      if (failure !== 'stale-scope') expect(view.getEditingPatch('SPACE')).toEqual(pending)
    })

  it.each(['read-only', 'missing-signature', 'stale-scope'])(
    'retains declaration changes after %s rejection and distinguishes server from scope rejection', async failure => {
      const {rows, space, raw} = declarationRows()
      if (failure === 'read-only') space['lingma_sys_params'] = {r: [], e: [], h: [], m: [], d: false}
      if (failure === 'missing-signature') delete space['lingma_sys_key']
      installRows(rows, {rejectSave: failure !== 'stale-scope'})
      const {session, view} = await openMetadataSession()
      expect(view.fieldAccess(view.rows[0]!, 'inputParams').write).toBe(failure === 'read-only' ? 'denied' : 'allowed')
      view.updateEditingValue('SPACE', 'inputParams', '[]')
      if (failure === 'stale-scope') mocks.scope.mockReturnValue({token: 'SCOPE-2', headers: {'X-AppId': 'APP-2'}})
      await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'Base_DataSet', viewId: 'default', ids: ['SPACE']}]}))
        .rejects.toThrow(failure === 'stale-scope' ? /SPARK_/ : /fixture server rejected/)
      expect(saveRequests()).toHaveLength(failure === 'stale-scope' ? 0 : 1)
      expect(space['inputParams']).toBe(raw)
      expect(view.getEditingRow('SPACE')?.['inputParams']).toBe('[]')
      expect(view.dirtyTracking.hasPendingChanges() || view.hasEditingChanges()).toBe(true)
    })

  it('keeps unreadable declarations separate from field write permission', async () => {
    const {rows, space} = declarationRows()
    space['lingma_sys_params'] = {r: [], e: ['inputParams'], h: ['inputParams'], m: [], d: false}
    installRows(rows)
    const {view} = await openMetadataSession()
    expect(view.fieldAccess(view.rows[0]!, 'inputParams')).toMatchObject({read: 'invisible', write: 'allowed'})
    expect(saveRequests()).toEqual([])
  })

  it('recovers a lost declaration save response by explicit read without replaying the write', async () => {
    const {rows, space} = declarationRows()
    installRows(rows, {loseSaveResponse: true})
    const {session, view} = await openMetadataSession()
    view.updateEditingValue('SPACE', 'inputParams', '[]')
    await expect(session.metadataDataSet.saveChanges({views: [{tableName: 'Base_DataSet', viewId: 'default', ids: ['SPACE']}]}))
      .rejects.toThrow('response lost after database write')
    expect(space['inputParams']).toBe('[]')
    expect(saveRequests()).toHaveLength(1)
    expect(view.getEditingRow('SPACE')?.['inputParams']).toBe('[]')
    expect(view.dirtyTracking.hasPendingChanges() || view.hasEditingChanges()).toBe(true)
    expect(view.hasUnconfirmedSave).toBe(true)
    await expect(session.metadataDataSet.resolveUnconfirmedSaves()).resolves.toBe('confirmed')
    expect(view.hasUnconfirmedSave).toBe(false)
    expect(view.dirtyTracking.hasPendingChanges() || view.hasEditingChanges()).toBe(false)
    await view.loadFromServer({allPages: true})
    expect(view.rows).toEqual([{rowid: 'SPACE', _pk: 'SPACE', inputParams: '[]'}])
    const fresh = await openMetadataSession()
    expect(fresh.view.rows).toEqual(view.rows)
    expect(saveRequests()).toHaveLength(1)
  })

  it('preserves damaged declaration text for repair instead of interpreting it as empty input', async () => {
    const {rows, raw} = declarationRows('[broken legacy declaration')
    installRows(rows)
    const {session, view} = await openMetadataSession()
    expect(view.rows[0]?.['inputParams']).toBe(raw)
    expect(session.viewState).toBeNull()
    expect(saveRequests()).toEqual([])
  })

  it('cascades selected model values into scoped field options without narrowing complete metadata', async () => {
    const rows = rowsFor()
    const original = rows.get('Base_DataModel_Field')?.[0]
    if (!original) throw new Error('Missing field fixture')
    const allFields = [original, {...original, rowid: 'FIELD-2', dataModelId: 'MODEL-1', lingma_sys_key: 'key-FIELD-2'},
      {...original, rowid: 'FIELD-3', dataModelId: 'MODEL-1', lingma_sys_key: 'key-FIELD-3'}]
    rows.set('Base_DataModel_Field', allFields)
    installRows(rows)
    const dataSet = await loadCompleteMetadata('SPACE')
    const other = await loadCompleteMetadata('SPACE')
    try {
      const models = dataSet.getView('Base_DataModel', 'modelOptions')
      const fields = dataSet.getView('Base_DataModel_Field', 'modelFieldOptions')
      expect(models).toBeDefined()
      expect(fields).toBeDefined()
      if (!models || !fields) throw new Error('Missing metadata option views')
      expect(models.requestState).toBe(RequestState.Idle)
      expect(fields.requestState).toBe(RequestState.Idle)
      expect(models.autoLoad).toBe(false)
      expect(fields.autoLoad).toBe(false)
      const wholeFields = dataSet.getView('Base_DataModel_Field', 'default')?.rows
      const wholeModels = dataSet.getView('Base_DataModel', 'default')?.rows
      const calls = mocks.request.mock.calls.length
      dataSet.triggerAutoLoad()
      expect(mocks.request.mock.calls.length).toBe(calls)
      models.valueField = 'Name'
      models.selectionDelimiter = '|'
      expect((await models.loadFromServer({allPages: true})).success).toBe(true)
      await vi.waitFor(() => expect(fields.requestState).toBe(RequestState.Loaded))
      expect(models.selectedRows).toEqual([])
      const first = models.rows[0]
      const second = models.rows[1]
      if (!first || !second) throw new Error('Missing model records')
      for (const selection of [[first], [first, second], [second], []]) {
        models.setSelectedRows(selection)
        const ids = selection.map(row => models.getPkKey(row))
        expect(resolveDataViewMember({dataViewKey: 'Base_DataModel@modelOptions', dataMember: DataMember.Value}, dataSet)).toEqual(ids)
        expect(models.value).toBe(selection.map(row => row['Name']).join('|'))
        await vi.waitFor(() => {
          expect(fields.requestState).toBe(RequestState.Loaded)
          expect(fields.rows.map(row => row['rowid'])).toEqual(allFields.filter(row => ids.some(id => id === row['dataModelId'])).map(row => row['rowid']))
          if (!ids.length) return
          const last = mocks.request.mock.calls.at(-1)?.[0]
          const entries = record(record(last)['data'])['Table']
          if (!Array.isArray(entries)) throw new Error('Missing child wire request')
          expect(wireConditions(record(entries[0])['Filter'])).toEqual(expect.arrayContaining([
            expect.objectContaining({Field: 'dataSetId', Operator: 'equal', ValueFun: {Type: 'GetConstValue', Value: 'SPACE'}}),
            expect.objectContaining({Field: 'dataModelId', Operator: 'in', ValueFun: {Type: 'GetConstValue', Value: ids}}),
          ]))
        })
        expect(dataSet.getView('Base_DataModel_Field', 'default')?.rows).toBe(wholeFields)
        expect(dataSet.getView('Base_DataModel', 'default')?.rows).toBe(wholeModels)
        expect(other.getView('Base_DataModel_Field', 'modelFieldOptions')?.requestState).toBe(RequestState.Idle)
        const afterQuery = mocks.request.mock.calls.length
        models.setCurrentRowById(models.getPkKey(first)!)
        models.setCurrentRowById(models.getPkKey(second)!)
        await Promise.resolve()
        expect(mocks.request.mock.calls.length).toBe(afterQuery)
      }
    } finally {dataSet.destroy(); other.destroy()}
  })

  it('scopes definition views by dataSpaceId while resource catalogs stay application scoped', () => {
    expect(record(configuration)['scenarioId']).toBe(DATA_SPACE_DESIGN_FORM_KEY)
    for (const [tableName, input] of Object.entries(configTables())) {
      const table = record(input)
      if (table['resourceType'] === 'file') {
        expect(table).not.toHaveProperty('modelBinding')
        expect(Array.isArray(table['columns'])).toBe(true)
        for (const view of Object.values(record(table['views']))) {
          if (tableName === 'ProjectToolFile') expect(record(view)['queryContext']).toEqual({pageId: '', fileName: 'rule.json', versionId: ''})
          else if (tableName === 'ProjectToolCatalog') expect(record(view)['queryContext']).toBeUndefined()
          else expect(record(view)['queryContext']).toMatchObject({dataSpaceId: ''})
          expect(view).not.toHaveProperty('rows')
        }
        continue
      }
      const ownerField = tableName === 'Base_DataSet' ? 'rowid' : 'dataSetId'
      if (tableName === 'View_TblList' || tableName === 'View_ViewList') {
        expect(table['columns']).toEqual([{name: 'databaseDisplay', type: 'string', label: '数据库名称 / 稳定 ID', computeExpression: "DbName || dbid || '-'"}])
        expect(formalModel(tableName).fields.map(field => field.name)).not.toContain('databaseDisplay')
      } else expect(table).not.toHaveProperty('columns')
      for (const view of Object.values(record(table['views']))) {
        if (tables.some(name => name === tableName)) {
          const filter = record(record(view)['filterExpression'])
          if (Array.isArray(filter['filters'])) expect(filter['logic']).toBe('and')
          expect(Array.isArray(filter['filters']) ? filter['filters'] : [filter]).toContainEqual({field: ownerField, operator: 'eq',
            value: {Type: 'GetInputParam', ParamName: 'dataSpaceId'}})
        } else {
          expect(view).not.toHaveProperty('filterExpression')
          expect(record(record(view)['queryConfig'])['fields']).toContain(tableName === '_Base_ParamList' ? 'parid' : 'rowid')
        }
        expect(view).not.toHaveProperty('rows')
      }
    }
  })

  it('binds lazy source views to the same formal runtime and keeps narrow fields on native refresh', async () => {
    const rows = rowsFor()
    rows.set('Base_DataServiceInterface', [{rowid: 'API', Name: 'Search', Desc: 'Find', ProviderID: 'PROVIDER'}])
    installRows(rows)
    const dataSet = await loadCompleteMetadata('SPACE')
    try {
      const catalogs = ['View_TblList', '_Base_DictType', 'Base_DataServiceInterface', 'Base_JsonData', 'Base_DataViewList', 'View_ViewList', 'Base_TblField', '_Base_ParamList']
      for (const name of catalogs) {
        expect(dataSet.getView(name, 'default')?.requestState).toBe(RequestState.Idle)
        expect(dataSet.getView(name, 'sourceDetails')?.queryConfig.allPages).toBe(true)
      }
      expect(mocks.request).toHaveBeenCalledTimes(4)
      const reader = new LowcodeDataSpaceModelSourceReader()
      const result = await reader.query({type: 'interface', keyword: 'Search'}, dataSet)
      expect(result.rows[0]).toMatchObject({id: 'API', name: 'Search', providerId: 'PROVIDER'})
      const view = dataSet.getView('Base_DataServiceInterface', 'sourceCandidates')!
      expect(view.dataTable?.columns.some(column => column.name === 'secret')).toBe(true)
      await view.refresh()
      const request = record(mocks.request.mock.calls.at(-1)?.[0])
      const body = record(request['data'])
      expect(body).toMatchObject({OutputFieldMode: 'REQUEST', PageParam: {index: 1, size: 10}})
      const wire = record((body['Table'] as unknown[])[0])
      expect((wire['Fields'] as unknown[]).map(field => record(field)['Name'])).toEqual(['rowid', 'Name', 'Desc', 'ProviderID'])
      expect(wireConditions(wire['Filter'])).toEqual(expect.arrayContaining([expect.objectContaining({Field: 'Name'})]))
      expect(view.rows[0]?.['rowid']).toBe('API')
    } finally {dataSet.destroy()}
  })

  it('returns a native isolated DataSet with formal columns, scoped wire input and complete pages', async () => {
    const originalConfig = JSON.stringify(configuration)
    const rows = rowsFor()
    const model = rows.get('Base_DataModel')?.[0]
    if (!model) throw new Error('missing model fixture')
    rows.set('Base_DataModel', Array.from({length: 501}, (_, index) => ({...model,
      rowid: `MODEL-${index}`, Name: `Model ${index}`, lingma_sys_key: `key-MODEL-${index}`})))
    installRows(rows)
    const first = await loadCompleteMetadata('SPACE')
    const second = await loadCompleteMetadata('SPACE')
    expect(first).toBeInstanceOf(DataSet)
    expect(second).not.toBe(first)
    expect(first.scenarioId).toBe(DATA_SPACE_DESIGN_FORM_KEY)
    expect(first.dataSetName).toBe('元数据正式空间')
    expect(mocks.readSpaceDefinition).toHaveBeenCalledWith(expect.objectContaining({
      designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: DATA_SPACE_DESIGN_FORM_KEY}), undefined)
    for (const tableName of tables) {
      const table = first.getTable(tableName)
      expect(table?.columns.some(column => column.name === 'rowid')).toBe(true)
      expect(first.getView(tableName, 'default')?.queryContext).toMatchObject({dataSpaceId: 'SPACE'})
      expect(first.getView(tableName, 'default')?.rows.length).toBe(tableName === 'Base_DataModel' ? 501 : 1)
    }
    expect(first.getView('Base_DataModel', 'designModels')?.queryContext).toMatchObject({dataSpaceId: 'SPACE'})
    const sent = mocks.request.mock.calls.map(([config]) => {
      const entries = record(record(config)['data'])['Table']
      if (!Array.isArray(entries)) throw new Error('missing wire tables')
      return record(entries[0])
    })
    expect(sent.every(table => table['inputParams'] && JSON.stringify(table['inputParams'])
      === JSON.stringify([{Name: 'dataSpaceId', Value: 'SPACE'}]))).toBe(true)
    for (const table of sent) {
      expect(table['Filter']).toMatchObject({Type: 'cond', Field: table['Name'] === 'Base_DataSet' ? 'rowid' : 'dataSetId',
        ValueFun: {Type: 'GetConstValue', Value: 'SPACE'}})
    }
    expect(sent.filter(table => table['Name'] === 'Base_DataModel').length).toBeGreaterThan(2)
    expect(JSON.stringify(configuration)).toBe(originalConfig)
    first.destroy()
    second.destroy()
  })

  it.each([498, 501])('loads all %i fields in metadata batches while retaining row permissions', async count => {
    const rows = rowsFor()
    const field = rows.get('Base_DataModel_Field')?.[0]
    if (!field) throw new Error('missing field fixture')
    rows.set('Base_DataModel_Field', Array.from({length: count}, (_, index) => ({...field,
      rowid: `FIELD-${index}`, lingma_sys_key: `key-FIELD-${index}`,
      lingma_sys_params: {r: [], e: index === count - 1 ? ['Name'] : [], h: [], m: [], d: false}})))
    installRows(rows)
    const dataSet = await loadCompleteMetadata('SPACE')
    try {
      const view = dataSet.getView('Base_DataModel_Field', 'default')
      if (!view) throw new Error('missing field view')
      expect(view.total).toBe(count)
      expect(view.rows.map(row => row['rowid'])).toEqual(rows.get('Base_DataModel_Field')?.map(row => row['rowid']))
      expect(view.fieldAccess(view.rows[0]!, 'Name').write).toBe('denied')
      expect(view.fieldAccess(view.rows.at(-1)!, 'Name').write).toBe('allowed')
      const requests = mocks.request.mock.calls.map(([config]) => record(record(config)['data']))
        .filter(request => Array.isArray(request['Table']) && record(request['Table'][0])['Name'] === 'Base_DataModel_Field')
      expect(requests.map(request => request['PageParam'])).toEqual(
        count > 500 ? [{index: 1, size: 500}, {index: 2, size: 500}] : [{index: 1, size: 500}])
      expect(view.sortExpression).toEqual([{field: 'rowid', direction: 'asc'}])
      expect(saveRequests()).toEqual([])
    } finally {dataSet.destroy()}
  })

  it.each(['foreign', 'hidden-owner'])('rejects %s field ownership on the second metadata batch', async failure => {
    const rows = rowsFor()
    const field = rows.get('Base_DataModel_Field')?.[0]
    if (!field) throw new Error('missing field fixture')
    const fields: Array<Record<string, unknown>> = Array.from({length: 501}, (_, index) => ({...field, rowid: `FIELD-${index}`}))
    const last = fields.at(-1)
    if (!last) throw new Error('missing final field fixture')
    if (failure === 'foreign') last['dataSetId'] = 'OTHER'
    else last['lingma_sys_params'] = {r: [], e: [], h: ['dataSetId'], m: [], d: false}
    rows.set('Base_DataModel_Field', fields)
    installRows(rows)
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    await expect(loadCompleteMetadata('SPACE')).rejects.toThrow('DATA_SPACE_METADATA_SCOPE')
    expect(destroy).toHaveBeenCalled()
    expect(saveRequests()).toEqual([])
  })

  it('rejects invalid input before I/O and destroys candidates after an out-of-scope row', async () => {
    await expect(loadCompleteMetadata('')).rejects.toThrow()
    await expect(loadCompleteMetadata('../OTHER')).rejects.toThrow()
    expect(mocks.readModelBatch).not.toHaveBeenCalled()
    installRows(rowsFor('OTHER'))
    const destroy = vi.spyOn(DataSet.prototype, 'destroy')
    await expect(loadCompleteMetadata('SPACE')).rejects.toThrow()
    expect(destroy).toHaveBeenCalled()
  })
})
